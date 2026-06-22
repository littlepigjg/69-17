const net = require('net')
const {
  ERROR_MESSAGES,
  DATA_ENCODING,
  RESPONSE_VALIDATION_MODE
} = require('../constants')
const {
  parseTcpTarget,
  decodeData,
  replaceVariables
} = require('../utils')
const { clampHandshakeTimeout } = require('./constants')
const { validateResponseBuffer } = require('./validation')
const { logHandshake } = require('./logger')

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
      const masked = logHandshake(service, {
        host, port,
        sentBuf,
        recvBuf: finalResp,
        success,
        errorMessage: error_message,
        responseTimeMs: Math.max(0, Date.now() - connectStartTime),
        handshakeTimeoutMs: handshakeTimeout
      })
      resolve({
        success,
        response_time_ms: Math.max(0, Date.now() - connectStartTime),
        status_code,
        error_message,
        handshake_sent: masked.handshake_sent,
        handshake_recv: masked.handshake_recv
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
  performTcpHandshake
}
