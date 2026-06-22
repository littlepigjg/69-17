function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function pick(obj, keys) {
  const result = {}
  for (const k of keys) {
    if (k in obj) result[k] = obj[k]
  }
  return result
}

function toBool(v) {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())
  return Boolean(v)
}

function toInt(v, defaultValue = 0) {
  if (v === null || v === undefined || v === '') return defaultValue
  const n = parseInt(v, 10)
  return isNaN(n) ? defaultValue : n
}

function isValidTcpPort(port) {
  const n = Number(port)
  return Number.isInteger(n) && n >= 1 && n <= 65535
}

function parseTcpTarget(target, portField) {
  if (portField !== undefined && portField !== null && portField !== '') {
    const n = Number(portField)
    if (Number.isInteger(n)) {
      return { host: target, port: n }
    }
  }
  if (target && target.includes(':')) {
    const idx = target.lastIndexOf(':')
    const hostPart = target.substring(0, idx)
    const portPart = target.substring(idx + 1)
    const n = Number(portPart)
    if (Number.isInteger(n)) {
      return { host: hostPart, port: n }
    }
  }
  return { host: target, port: null }
}

function asyncDebounce(fn, waitMs) {
  let timer = null
  let pending = false
  let queued = false

  async function wrapper(...args) {
    if (pending) {
      queued = true
      return
    }
    if (timer) {
      clearTimeout(timer)
    }
    return new Promise((resolve) => {
      timer = setTimeout(async () => {
        timer = null
        pending = true
        try {
          const result = await fn(...args)
          resolve(result)
        } finally {
          pending = false
          if (queued) {
            queued = false
            wrapper(...args)
          }
        }
      }, waitMs)
    })
  }

  wrapper.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
    queued = false
  }

  return wrapper
}

function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str)
  } catch (e) {
    return fallback
  }
}

class ResumableTimeout {
  constructor() {
    this._timer = null
    this._fn = null
  }

  setTimeout(fn, delayMs) {
    this.clear()
    this._fn = fn
    this._timer = setTimeout(() => {
      this._timer = null
      this._fn = null
      fn()
    }, delayMs)
  }

  clear() {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
      this._fn = null
    }
  }

  get active() {
    return this._timer !== null
  }
}

class SafeEventEmitter {
  constructor() {
    this._listeners = new Map()
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set())
    this._listeners.get(event).add(fn)
    return () => this.off(event, fn)
  }

  off(event, fn) {
    this._listeners.get(event)?.delete(fn)
  }

  emit(event, ...args) {
    const listeners = this._listeners.get(event)
    if (!listeners) return
    for (const fn of [...listeners]) {
      try {
        fn(...args)
      } catch (e) {
        console.error(`[SafeEventEmitter] Listener error for "${event}":`, e)
      }
    }
  }

  removeAllListeners(event) {
    if (event) this._listeners.delete(event)
    else this._listeners.clear()
  }
}

function isValidHex(str) {
  if (!str) return true
  return /^[0-9a-fA-F]*$/.test(str) && str.length % 2 === 0
}

function isValidBase64(str) {
  if (!str) return true
  try {
    Buffer.from(str, 'base64').toString('utf8')
    return /^[A-Za-z0-9+/]*={0,2}$/.test(str)
  } catch (e) {
    return false
  }
}

function decodeData(str, encoding) {
  const { DATA_ENCODING } = require('./constants')
  if (!str) return Buffer.alloc(0)
  if (encoding === DATA_ENCODING.HEX) {
    if (!isValidHex(str)) throw new Error('Invalid hex string')
    return Buffer.from(str, 'hex')
  }
  if (encoding === DATA_ENCODING.BASE64) {
    if (!isValidBase64(str)) throw new Error('Invalid base64 string')
    return Buffer.from(str, 'base64')
  }
  if (encoding === DATA_ENCODING.TEXT) {
    return Buffer.from(str, 'utf8')
  }
  throw new Error('Invalid encoding')
}

function encodeData(buf, encoding) {
  const { DATA_ENCODING } = require('./constants')
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf)
  if (encoding === DATA_ENCODING.HEX) return buf.toString('hex')
  if (encoding === DATA_ENCODING.BASE64) return buf.toString('base64')
  if (encoding === DATA_ENCODING.TEXT) return buf.toString('utf8')
  throw new Error('Invalid encoding')
}

function replaceVariables(str) {
  if (typeof str !== 'string') return str
  const now = Date.now()
  return str
    .replace(/\{\{timestamp\}\}/gi, String(now))
    .replace(/\{\{timestamp_ms\}\}/gi, String(now))
    .replace(/\{\{timestamp_s\}\}/gi, String(Math.floor(now / 1000)))
    .replace(/\{\{random_hex(?:_(\d+))?\}\}/gi, (_, len) => {
      const n = parseInt(len || '8', 10)
      let s = ''
      for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16)
      return s
    })
    .replace(/\{\{random_int(?:_(\d+))?\}\}/gi, (_, digits) => {
      const d = parseInt(digits || '6', 10)
      const min = Math.pow(10, d - 1)
      const max = Math.pow(10, d) - 1
      return String(Math.floor(min + Math.random() * (max - min + 1)))
    })
    .replace(/\{\{uuid\}\}/gi, () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
      })
    })
    .replace(/\{\{datetime_iso\}\}/gi, new Date(now).toISOString())
}

function maskDataForLog(buf) {
  if (!buf) return ''
  if (typeof buf === 'string') buf = Buffer.from(buf)
  if (!Buffer.isBuffer(buf)) return ''
  if (buf.length === 0) return '(empty)'
  const previewLen = Math.min(buf.length, 16)
  let hex = buf.slice(0, previewLen).toString('hex')
  let ascii = ''
  for (let i = 0; i < previewLen; i++) {
    const b = buf[i]
    ascii += (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.'
  }
  const suffix = buf.length > previewLen ? `... (+${buf.length - previewLen} bytes)` : ''
  return `[${buf.length}B] hex=${hex}${suffix} ascii=${ascii}${suffix}`
}

function validateResponseMode(mode) {
  const { RESPONSE_VALIDATION_MODE } = require('./constants')
  return Object.values(RESPONSE_VALIDATION_MODE).includes(mode)
}

function validateEncoding(enc) {
  const { DATA_ENCODING } = require('./constants')
  return Object.values(DATA_ENCODING).includes(enc)
}

module.exports = {
  clamp,
  pick,
  toBool,
  toInt,
  isValidTcpPort,
  parseTcpTarget,
  asyncDebounce,
  safeJsonParse,
  ResumableTimeout,
  SafeEventEmitter,
  isValidHex,
  isValidBase64,
  decodeData,
  encodeData,
  replaceVariables,
  maskDataForLog,
  validateResponseMode,
  validateEncoding
}
