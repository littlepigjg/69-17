const {
  HANDSHAKE_MIN_MS,
  HANDSHAKE_MAX_MS,
  HANDSHAKE_DEFAULT_MS,
  clampHandshakeTimeout
} = require('./constants')
const {
  validateAdvancedConfig,
  validateResponseBuffer
} = require('./validation')
const {
  logHandshake,
  formatTimestamp
} = require('./logger')
const {
  performTcpHandshake
} = require('./handshake')

module.exports = {
  HANDSHAKE_MIN_MS,
  HANDSHAKE_MAX_MS,
  HANDSHAKE_DEFAULT_MS,
  clampHandshakeTimeout,
  validateAdvancedConfig,
  validateResponseBuffer,
  logHandshake,
  formatTimestamp,
  performTcpHandshake
}
