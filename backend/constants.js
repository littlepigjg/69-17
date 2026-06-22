const SERVICE_STATUS = Object.freeze({
  UP: 'up',
  DOWN: 'down',
  MAINTENANCE: 'maintenance',
  UNKNOWN: 'unknown'
})

const SERVICE_TYPES = Object.freeze({
  HTTP: 'http',
  HTTPS: 'https',
  TCP: 'tcp'
})

const STATUS_STYLES = Object.freeze({
  [SERVICE_STATUS.UP]: { bg: '#d1fae5', text: '#065f46', dot: '#10b981', label: '正常运行' },
  [SERVICE_STATUS.DOWN]: { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444', label: '服务故障' },
  [SERVICE_STATUS.MAINTENANCE]: { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b', label: '维护中' },
  [SERVICE_STATUS.UNKNOWN]: { bg: '#f3f4f6', text: '#4b5563', dot: '#9ca3af', label: '未知' }
})

const WS_MESSAGE_TYPES = Object.freeze({
  HELLO: 'hello',
  STATUS_CHANGE: 'status_change',
  NEW_CHECK: 'new_check',
  MAINTENANCE_CHANGE: 'maintenance_change',
  SERVICE_UPDATE: 'service_update',
  SERVICE_DELETED: 'service_deleted'
})

const DEFAULT_CONFIG = Object.freeze({
  MIN_INTERVAL_SECONDS: 5,
  DEFAULT_INTERVAL_SECONDS: 30,
  DEFAULT_TIMEOUT_MS: 5000,
  DEFAULT_EXPECTED_STATUS: 200,
  DEFAULT_METHOD: 'GET',
  DEFAULT_DATA_RETENTION_DAYS: 30,
  DEFAULT_TREND_WINDOW_HOURS: 24,
  MAX_SLOTS: 96,
  MIN_SLOT_MINUTES: 5,
  HANDSHAKE_TIMEOUT_MS: 50,
  HANDSHAKE_TIMEOUT_MIN_MS: 10,
  HANDSHAKE_TIMEOUT_MAX_MS: 200
})

const DATA_ENCODING = Object.freeze({
  HEX: 'hex',
  BASE64: 'base64',
  TEXT: 'text'
})

const RESPONSE_VALIDATION_MODE = Object.freeze({
  EXACT: 'exact',
  REGEX: 'regex',
  LENGTH_RANGE: 'length_range'
})

const PROTOCOL_PRESETS = Object.freeze({
  REDIS_PING: {
    name: 'Redis PING/PONG',
    description: '向 Redis 发送 PING 命令，验证返回 +PONG',
    send_encoding: DATA_ENCODING.TEXT,
    send_data: '*1\r\n$4\r\nPING\r\n',
    validation_mode: RESPONSE_VALIDATION_MODE.EXACT,
    expected_encoding: DATA_ENCODING.TEXT,
    expected_data: '+PONG\r\n'
  },
  REDIS_PING_ANY: {
    name: 'Redis PING (任意响应)',
    description: '向 Redis 发送 PING，只要有响应即可',
    send_encoding: DATA_ENCODING.TEXT,
    send_data: '*1\r\n$4\r\nPING\r\n',
    validation_mode: RESPONSE_VALIDATION_MODE.LENGTH_RANGE,
    min_length: 1,
    max_length: 1024
  },
  MYSQL_HANDSHAKE: {
    name: 'MySQL 初始握手',
    description: '等待 MySQL 服务器发送初始握手包（长度 4+）',
    send_encoding: DATA_ENCODING.TEXT,
    send_data: '',
    validation_mode: RESPONSE_VALIDATION_MODE.LENGTH_RANGE,
    min_length: 4,
    max_length: 65535
  },
  SMTP_EHLO: {
    name: 'SMTP EHLO 握手',
    description: '等待 SMTP 220 横幅，发送 EHLO 并验证 250 响应',
    send_encoding: DATA_ENCODING.TEXT,
    send_data: 'EHLO monitor.local\r\n',
    validation_mode: RESPONSE_VALIDATION_MODE.REGEX,
    expected_encoding: DATA_ENCODING.TEXT,
    expected_regex: '^250[\\s\\S]*$'
  },
  FTP_USER: {
    name: 'FTP 欢迎消息',
    description: '等待 FTP 220 欢迎消息',
    send_encoding: DATA_ENCODING.TEXT,
    send_data: '',
    validation_mode: RESPONSE_VALIDATION_MODE.REGEX,
    expected_encoding: DATA_ENCODING.TEXT,
    expected_regex: '^220[\\s\\S]*$'
  },
  MEMCACHED_STATS: {
    name: 'Memcached stats',
    description: '向 Memcached 发送 stats 命令，验证 STAT 开头的响应',
    send_encoding: DATA_ENCODING.TEXT,
    send_data: 'stats\r\n',
    validation_mode: RESPONSE_VALIDATION_MODE.REGEX,
    expected_encoding: DATA_ENCODING.TEXT,
    expected_regex: '^(STAT|END)[\\s\\S]*$'
  }
})

const ERROR_MESSAGES = Object.freeze({
  TCP_NO_PORT: 'TCP target requires a valid port number',
  TCP_INVALID_PORT: 'TCP port must be an integer between 1 and 65535',
  INVALID_SERVICE_TYPE: 'type must be http, https, or tcp',
  MISSING_REQUIRED_FIELDS: 'name, type, target are required',
  INVALID_ENCODING: 'Invalid encoding format',
  INVALID_HEX: 'Invalid hex string',
  INVALID_BASE64: 'Invalid base64 string',
  INVALID_REGEX: 'Invalid regular expression',
  HANDSHAKE_TIMEOUT: 'Protocol handshake timeout',
  RESPONSE_MISMATCH: 'Response validation failed',
  RESPONSE_TOO_SHORT: 'Response too short',
  RESPONSE_TOO_LONG: 'Response too long'
})

module.exports = {
  SERVICE_STATUS,
  SERVICE_TYPES,
  STATUS_STYLES,
  WS_MESSAGE_TYPES,
  DEFAULT_CONFIG,
  DATA_ENCODING,
  RESPONSE_VALIDATION_MODE,
  PROTOCOL_PRESETS,
  ERROR_MESSAGES
}
