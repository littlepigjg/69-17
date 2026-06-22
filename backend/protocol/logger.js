const { maskDataForLog } = require('../utils')

function formatTimestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.` +
    String(d.getMilliseconds()).padStart(3, '0')
}

function logHandshake(service, params) {
  const {
    host, port, sentBuf, recvBuf,
    success, errorMessage, responseTimeMs, handshakeTimeoutMs
  } = params

  const label = success ? '\x1b[32mHANDSHAKE OK\x1b[0m' : '\x1b[31mHANDSHAKE FAIL\x1b[0m'
  const lines = [
    `[${formatTimestamp()}] ${label} ` +
    `${service.name || 'unnamed'} [${service.id || '-'}] ` +
    `${host}:${port} (${responseTimeMs}ms, timeout=${handshakeTimeoutMs}ms)`
  ]

  if (sentBuf && sentBuf.length) {
    lines.push(`  → SENT: ${maskDataForLog(sentBuf)}`)
  } else {
    lines.push(`  → SENT: (no data)`)
  }

  if (recvBuf && recvBuf.length) {
    lines.push(`  ← RECV: ${maskDataForLog(recvBuf)}`)
  } else {
    lines.push(`  ← RECV: (no data)`)
  }

  if (!success && errorMessage) {
    lines.push(`  ✗ ERR:  ${errorMessage}`)
  }

  const msg = lines.join('\n')
  if (success) {
    console.log(msg)
  } else {
    console.warn(msg)
  }

  return {
    handshake_sent: sentBuf && sentBuf.length ? maskDataForLog(sentBuf) : null,
    handshake_recv: recvBuf && recvBuf.length ? maskDataForLog(recvBuf) : null
  }
}

module.exports = {
  logHandshake,
  formatTimestamp
}
