const { DEFAULT_CONFIG } = require('../constants')

const HANDSHAKE_MIN_MS = DEFAULT_CONFIG.HANDSHAKE_TIMEOUT_MIN_MS
const HANDSHAKE_MAX_MS = DEFAULT_CONFIG.HANDSHAKE_TIMEOUT_MAX_MS
const HANDSHAKE_DEFAULT_MS = DEFAULT_CONFIG.HANDSHAKE_TIMEOUT_MS

function clampHandshakeTimeout(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return HANDSHAKE_DEFAULT_MS
  return Math.max(HANDSHAKE_MIN_MS, Math.min(HANDSHAKE_MAX_MS, Math.round(n)))
}

module.exports = {
  HANDSHAKE_MIN_MS,
  HANDSHAKE_MAX_MS,
  HANDSHAKE_DEFAULT_MS,
  clampHandshakeTimeout
}
