const axios = require('axios')
const net = require('net')
const {
  SERVICE_TYPES,
  ERROR_MESSAGES,
  DATA_ENCODING,
  RESPONSE_VALIDATION_MODE,
  DEFAULT_CONFIG
} = require('./constants')
const {
  isValidTcpPort,
  parseTcpTarget,
  decodeData,
  encodeData,
  replaceVariables,
  maskDataForLog,
  isValidHex,
  isValidBase64
} = require('./utils')

async function checkHttp(service) {
  let url = service.target
  const startTime = Date.now()
  const timeout = service.timeout_ms || 5000

  try {
    if (service.type === SERVICE_TYPES.HTTP && !/^https?:\/\//.test(url)) {
      url = `http://${url}`
    } else if (service.type === SERVICE_TYPES.HTTPS && !/^https?:\/\//.test(url)) {
      url = `https://${url}`
    }

    const method = (service.method || 'GET').toLowerCase()
    const expectedStatus = service.expectedStatus || 200

    let httpsAgent = undefined
    if (service.type === SERVICE_TYPES.HTTPS) {
      const https = require('https')
      httpsAgent = new https.Agent({ rejectUnauthorized: false })
    }

    const response = await axios({
      method,
      url,
      timeout,
      validateStatus: () => true,
      httpsAgent
    })

    const responseTime = Date.now() - startTime
    const success = response.status === expectedStatus

    return {
      success,
      response_time_ms: responseTime,
      status_code: response.status,
      error_message: success ? null : `Expected status ${expectedStatus}, got ${response.status}`
    }
  } catch (err) {
    return {
      success: false,
      response_time_ms: Math.max(0, Date.now() - startTime),
      status_code: null,
      error_message: err.code || err.message || 'Unknown error'
    }
  }
}

function validateAdvancedConfig(service) {
  const errors = []

  if (service.send_encoding) {
    if (!Object.values(DATA_ENCODING).includes(service.send_encoding)) {
      errors.push('Invalid send_encoding')
    } else if (service.send_encoding === DATA_ENCODING.HEX && !isValidHex(service.send_data || '')) {
      errors.push('Invalid hex in send_data')
    } else if (service.send_encoding === DATA_ENCODING.BASE64 && !isValidBase64(service.send_data || '')) {
      errors.push('Invalid base64 in send_data')
    }
  }

  if (service.validation_mode) {
    if (!Object.values(RESPONSE_VALIDATION_MODE).includes(service.validation_mode)) {
      errors.push('Invalid validation_mode')
    }
    if (service.validation_mode === RESPONSE_VALIDATION_MODE.EXACT) {
      if (service.expected_encoding && !Object.values(DATA_ENCODING).includes(service.expected_encoding)) {
        errors.push('Invalid expected_encoding')
      } else if (service.expected_encoding === DATA_ENCODING.HEX && !isValidHex(service.expected_data || '')) {
        errors.push('Invalid hex in expected_data')
      } else if (service.expected_encoding === DATA_ENCODING.BASE64 && !isValidBase64(service.expected_data || '')) {
        errors.push('Invalid base64 in expected_data')
      }
    }
    if (service.validation_mode === RESPONSE_VALIDATION_MODE.REGEX) {
      try {
        if (service.expected_regex) new RegExp(service.expected_regex)
      } catch (e) {
        errors.push('Invalid regex in expected_regex')
      }
    }
    if (service.validation_mode === RESPONSE_VALIDATION_MODE.LENGTH_RANGE) {
      const mn = Number(service.min_length)
      const mx = Number(service.max_length)
      if (!Number.isInteger(mn) || mn < 0) errors.push('Invalid min_length')
      if (!Number.isInteger(mx) || mx < 0) errors.push('Invalid max_length')
      if (mn > mx) errors.push('min_length > max_length')
    }
  }

  return errors.length ? errors : null
}

function checkTcpWithHandshake(service, connectStartTime) {
  return new Promise((resolve) => {
    const { host, port } = parseTcpTarget(service.target, service.port)
    const socket = new net.Socket()
    let finished = false
    let responseChunks = []
    let handshakeTimer = null
    let responseReceived = false
    let connectDone = false

    const handshakeTimeout = Math.max(
      10,
      Math.min(
        Number(service.handshake_timeout_ms) || DEFAULT_CONFIG.HANDSHAKE_TIMEOUT_MS,
        5000
      )
    )

    const finish = (success, error_message, status_code = null) => {
      if (finished) return
      finished = true
      if (handshakeTimer) {
        clearTimeout(handshakeTimer)
        handshakeTimer = null
      }
      try { socket.destroy() } catch (_) {}
      resolve({
        success,
        response_time_ms: Math.max(0, Date.now() - connectStartTime),
        status_code,
        error_message
      })
    }

    const validateResponse = (respBuf) => {
      const mode = service.validation_mode || RESPONSE_VALIDATION_MODE.LENGTH_RANGE

      try {
        if (mode === RESPONSE_VALIDATION_MODE.EXACT) {
          const expectedRaw = replaceVariables(service.expected_data || '')
          const expectedBuf = decodeData(expectedRaw, service.expected_encoding || DATA_ENCODING.TEXT)
          if (!respBuf.equals(expectedBuf)) {
            return {
              ok: false,
              msg: `${ERROR_MESSAGES.RESPONSE_MISMATCH}: expected ${maskDataForLog(expectedBuf)}, got ${maskDataForLog(respBuf)}`
            }
          }
          return { ok: true }
        }

        if (mode === RESPONSE_VALIDATION_MODE.REGEX) {
          const pattern = service.expected_regex || ''
          if (!pattern) return { ok: true }
          const enc = service.expected_encoding || DATA_ENCODING.TEXT
          const respText = encodeData(respBuf, enc)
          const re = new RegExp(pattern)
          if (!re.test(respText)) {
            return {
              ok: false,
              msg: `${ERROR_MESSAGES.RESPONSE_MISMATCH}: regex "${pattern}" did not match ${maskDataForLog(respBuf)}`
            }
          }
          return { ok: true }
        }

        if (mode === RESPONSE_VALIDATION_MODE.LENGTH_RANGE) {
          const mn = Number(service.min_length ?? 1)
          const mx = Number(service.max_length ?? 65535)
          if (respBuf.length < mn) {
            return {
              ok: false,
              msg: `${ERROR_MESSAGES.RESPONSE_TOO_SHORT}: got ${respBuf.length} bytes, min ${mn}`
            }
          }
          if (respBuf.length > mx) {
            return {
              ok: false,
              msg: `${ERROR_MESSAGES.RESPONSE_TOO_LONG}: got ${respBuf.length} bytes, max ${mx}`
            }
          }
          return { ok: true }
        }

        return { ok: true }
      } catch (e) {
        return { ok: false, msg: `Validation error: ${e.message}` }
      }
    }

    const onHandshakeTimeout = () => {
      if (finished) return
      if (!connectDone) {
        finish(false, 'Connection timeout')
        return
      }
      if (!responseReceived && !(service.send_data && service.send_data.length > 0) && responseChunks.length === 0) {
        finish(false, `${ERROR_MESSAGES.HANDSHAKE_TIMEOUT}: no data received within ${handshakeTimeout}ms`)
        return
      }
      const respBuf = Buffer.concat(responseChunks)
      if (respBuf.length === 0) {
        finish(false, `${ERROR_MESSAGES.HANDSHAKE_TIMEOUT}: no response data within ${handshakeTimeout}ms`)
        return
      }
      const result = validateResponse(respBuf)
      if (result.ok) {
        finish(true, null)
      } else {
        finish(false, result.msg)
      }
    }

    const startHandshakeTimer = () => {
      if (handshakeTimer) clearTimeout(handshakeTimer)
      handshakeTimer = setTimeout(onHandshakeTimeout, handshakeTimeout)
    }

    socket.on('connect', () => {
      connectDone = true
      try {
        const sendRaw = replaceVariables(service.send_data || '')
        if (sendRaw) {
          const sendBuf = decodeData(sendRaw, service.send_encoding || DATA_ENCODING.TEXT)
          try {
            socket.write(sendBuf)
          } catch (_) {}
        }
        startHandshakeTimer()
      } catch (e) {
        finish(false, `Failed to prepare send data: ${e.message}`)
      }
    })

    socket.on('data', (chunk) => {
      responseReceived = true
      responseChunks.push(chunk)
      const respBuf = Buffer.concat(responseChunks)
      const mode = service.validation_mode || RESPONSE_VALIDATION_MODE.LENGTH_RANGE
      if (mode === RESPONSE_VALIDATION_MODE.EXACT) {
        try {
          const expectedRaw = replaceVariables(service.expected_data || '')
          const expectedBuf = decodeData(expectedRaw, service.expected_encoding || DATA_ENCODING.TEXT)
          if (respBuf.length >= expectedBuf.length) {
            const result = validateResponse(respBuf.slice(0, expectedBuf.length))
            if (result.ok) finish(true, null)
            else finish(false, result.msg)
            return
          }
        } catch (_) {}
      }
      if (mode === RESPONSE_VALIDATION_MODE.LENGTH_RANGE) {
        const mx = Number(service.max_length ?? 65535)
        if (respBuf.length > mx) {
          const result = validateResponse(respBuf)
          finish(result.ok, result.msg)
          return
        }
        const mn = Number(service.min_length ?? 1)
        if (respBuf.length >= mn) {
          if (handshakeTimer) clearTimeout(handshakeTimer)
          handshakeTimer = setTimeout(() => {
            const finalBuf = Buffer.concat(responseChunks)
            const r = validateResponse(finalBuf)
            finish(r.ok, r.msg)
          }, 15)
        }
      }
    })

    socket.on('timeout', () => finish(false, 'Connection timeout'))
    socket.on('error', (err) => finish(false, err.code || err.message || 'Connection error'))
    socket.on('end', () => {
      if (finished) return
      const respBuf = Buffer.concat(responseChunks)
      if (respBuf.length === 0 && !(service.send_data && service.send_data.length > 0)) {
        finish(false, 'Connection closed without data')
        return
      }
      const result = validateResponse(respBuf)
      finish(result.ok, result.ok ? null : result.msg)
    })

    try {
      socket.setTimeout(service.timeout_ms || 5000)
      socket.connect(port, host)
    } catch (err) {
      finish(false, err.message || 'Invalid target')
    }
  })
}

function checkTcp(service) {
  return new Promise((resolve) => {
    const startTime = Date.now()

    const { host, port } = parseTcpTarget(service.target, service.port)

    if (!host) {
      resolve({
        success: false,
        response_time_ms: 0,
        status_code: null,
        error_message: 'TCP target host is empty'
      })
      return
    }

    if (!isValidTcpPort(port)) {
      resolve({
        success: false,
        response_time_ms: 0,
        status_code: null,
        error_message: `${ERROR_MESSAGES.TCP_NO_PORT} (got: ${port})`
      })
      return
    }

    const advancedEnabled = !!service.advanced_protocol_enabled

    if (!advancedEnabled) {
      const socket = new net.Socket()
      let finished = false

      const finish = (success, error_message, status_code = null) => {
        if (finished) return
        finished = true
        try { socket.destroy() } catch (_) {}
        resolve({
          success,
          response_time_ms: Math.max(0, Date.now() - startTime),
          status_code,
          error_message
        })
      }

      try {
        socket.setTimeout(service.timeout_ms || 5000)
      } catch (_) {}

      socket.on('connect', () => finish(true, null))
      socket.on('timeout', () => finish(false, 'Connection timeout'))
      socket.on('error', (err) => finish(false, err.code || err.message || 'Connection error'))

      try {
        socket.connect(port, host)
      } catch (err) {
        finish(false, err.message || 'Invalid target')
      }
      return
    }

    const configErrors = validateAdvancedConfig(service)
    if (configErrors) {
      resolve({
        success: false,
        response_time_ms: 0,
        status_code: null,
        error_message: `Invalid advanced config: ${configErrors.join('; ')}`
      })
      return
    }

    checkTcpWithHandshake(service, startTime).then(resolve)
  })
}

async function checkService(service) {
  if (!service || !service.type) {
    return {
      success: false,
      response_time_ms: 0,
      status_code: null,
      error_message: 'Invalid service config'
    }
  }

  if (service.type === SERVICE_TYPES.TCP) {
    return checkTcp(service)
  }

  if (service.type === SERVICE_TYPES.HTTP || service.type === SERVICE_TYPES.HTTPS) {
    return checkHttp(service)
  }

  return {
    success: false,
    response_time_ms: 0,
    status_code: null,
    error_message: `${ERROR_MESSAGES.INVALID_SERVICE_TYPE} (got: ${service.type})`
  }
}

module.exports = {
  checkService,
  checkHttp,
  checkTcp,
  checkTcpWithHandshake,
  validateAdvancedConfig
}
