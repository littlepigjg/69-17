const {
  DATA_ENCODING,
  RESPONSE_VALIDATION_MODE,
  ERROR_MESSAGES
} = require('../constants')
const {
  isValidHex,
  isValidBase64,
  decodeData,
  encodeData,
  replaceVariables,
  maskDataForLog
} = require('../utils')
const {
  HANDSHAKE_MIN_MS,
  HANDSHAKE_MAX_MS
} = require('./constants')

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

module.exports = {
  validateAdvancedConfig,
  validateResponseBuffer
}
