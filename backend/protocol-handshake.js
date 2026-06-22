const net = require('net')
const {
  ERROR_MESSAGES,
  DATA_ENCODING,
  RESPONSE_VALIDATION_MODE,
  DEFAULT_CONFIG
} = require('./constants')
const {
  parseTcpTarget,
  decodeData,
  encodeData,
  replaceVariables,
  maskDataForLog,
  isValidHex,
  isValidBase64
} = require('./utils')

const HANDSHAKE_MIN_MS = DEFAULT_CONFIG.HANDSHAKE_TIMEOUT_MIN_MS
const HANDSHAKE_MAX_MS = DEFAULT_CONFIG.HANDSHAKE_TIMEOUT_MAX_MS
const HANDSHAKE_DEFAULT_MS = DEFAULT_CONFIG.HANDSHAKE_TIMEOUT_MS

function clampHandshakeTimeout(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return HANDSHAKE_DEFAULT_MS
  return Math.max(HANDSHAKE_MIN_MS, Math.min(HANDSHAKE_MAX_MS, Math.round(n)))
}

function validateAdvancedConfig(service) {
  const errors = []

  if (service.handshake_timeout_ms !== undefined && service.handshake_timeout_ms !== null) {
    const n = Number(service.handshake_timeout_ms)
    if (!Number.isInteger(n) || n < HANDSHAKE_MIN_MS || n > HANDSHAKE_MAX_MS) {
      errors.push(`handshake_timeout_ms must be integer between ${HANDSHAKE_MIN_MS} and ${HANDSHAKE_MAX_MS}`)
    }
  }

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
      if (Number.isInteger(mn) && Number.isInteger(mx) && mn > mx) errors.push('min_length > max_length')
    }
  }

  return errors.length ? errors : null
}

function validateResponseBuffer(service, respBuf) {
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

function performTcpHandshake(service, connectStartTime) {
  return new Promise((resolve) => {
    const { host, port } = parseTcpTarget(service.target, service.port)
    const socket = new net.Socket()
    let finished = false
    let responseChunks = []
    let handshakeTimer = null
    let responseReceived = false
    let connectDone = false
    let sentBuf = null
    let respBuf = null

    const handshakeTimeout = clampHandshakeTimeout(service.handshake_timeout_ms)

    const finish = (success, error_message, status_code = null) => {
      if (finished) return
      finished = true
      if (handshakeTimer) {
        clearTimeout(handshakeTimer)
        handshakeTimer = null
      }
      try { socket.destroy() } catch (_) {}
      const finalResp = respBuf || Buffer.concat(responseChunks)
      resolve({
        success,
        response_time_ms: Math.max(0, Date.now() - connectStartTime),
        status_code,
        error_message,
        handshake_sent: sentBuf ? maskDataForLog(sentBuf) : null,
        handshake_recv: finalResp && finalResp.length ? maskDataForLog(finalResp) : null
      })
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
      respBuf = Buffer.concat(responseChunks)
      if (respBuf.length === 0) {
        finish(false, `${ERROR_MESSAGES.HANDSHAKE_TIMEOUT}: no response data within ${handshakeTimeout}ms`)
        return
      }
      const result = validateResponseBuffer(service, respBuf)
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
          sentBuf = decodeData(sendRaw, service.send_encoding || DATA_ENCODING.TEXT)
          try {
            socket.write(sentBuf)
          } catch (_) {}
        }
        startHandshakeTimer()
      } catch (e) {
        finish(false, `Failed to prepare send data: ${e.message}`)
      }
    })

    socket.on('data', (chunk) => {
      if (finished) return
      responseReceived = true
      responseChunks.push(chunk)
      respBuf = Buffer.concat(responseChunks)
      const mode = service.validation_mode || RESPONSE_VALIDATION_MODE.LENGTH_RANGE
      if (mode === RESPONSE_VALIDATION_MODE.EXACT) {
        try {
          const expectedRaw = replaceVariables(service.expected_data || '')
          const expectedBuf = decodeData(expectedRaw, service.expected_encoding || DATA_ENCODING.TEXT)
          if (respBuf.length >= expectedBuf.length) {
            const result = validateResponseBuffer(service, respBuf.slice(0, expectedBuf.length))
            if (result.ok) finish(true, null)
            else finish(false, result.msg)
            return
          }
        } catch (_) {}
      }
      if (mode === RESPONSE_VALIDATION_MODE.LENGTH_RANGE) {
        const mx = Number(service.max_length ?? 65535)
        if (respBuf.length > mx) {
          const result = validateResponseBuffer(service, respBuf)
          finish(result.ok, result.msg)
          return
        }
        const mn = Number(service.min_length ?? 1)
        if (respBuf.length >= mn) {
          if (handshakeTimer) clearTimeout(handshakeTimer)
          handshakeTimer = setTimeout(() => {
            respBuf = Buffer.concat(responseChunks)
            const r = validateResponseBuffer(service, respBuf)
            finish(r.ok, r.msg)
          }, 15)
        }
      }
    })

    socket.on('timeout', () => finish(false, 'Connection timeout'))
    socket.on('error', (err) => finish(false, err.code || err.message || 'Connection error'))
    socket.on('end', () => {
      if (finished) return
      respBuf = Buffer.concat(responseChunks)
      if (respBuf.length === 0 && !(service.send_data && service.send_data.length > 0)) {
        finish(false, 'Connection closed without data')
        return
      }
      const result = validateResponseBuffer(service, respBuf)
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

module.exports = {
  HANDSHAKE_MIN_MS,
  HANDSHAKE_MAX_MS,
  HANDSHAKE_DEFAULT_MS,
  clampHandshakeTimeout,
  validateAdvancedConfig,
  validateResponseBuffer,
  performTcpHandshake
}
