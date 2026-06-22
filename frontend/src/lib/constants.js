export const SERVICE_STATUS = Object.freeze({
  UP: 'up',
  DOWN: 'down',
  MAINTENANCE: 'maintenance',
  UNKNOWN: 'unknown'
})

export const SERVICE_TYPES = Object.freeze({
  HTTP: 'http',
  HTTPS: 'https',
  TCP: 'tcp'
})

export const STATUS_STYLES = Object.freeze({
  [SERVICE_STATUS.UP]: { bg: '#d1fae5', text: '#065f46', dot: '#10b981', label: '正常运行' },
  [SERVICE_STATUS.DOWN]: { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444', label: '服务故障' },
  [SERVICE_STATUS.MAINTENANCE]: { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b', label: '维护中' },
  [SERVICE_STATUS.UNKNOWN]: { bg: '#f3f4f6', text: '#4b5563', dot: '#9ca3af', label: '未知' }
})

export const WS_MESSAGE_TYPES = Object.freeze({
  HELLO: 'hello',
  STATUS_CHANGE: 'status_change',
  NEW_CHECK: 'new_check',
  MAINTENANCE_CHANGE: 'maintenance_change',
  SERVICE_UPDATE: 'service_update',
  SERVICE_DELETED: 'service_deleted'
})

export const AVAILABILITY_COLORS = Object.freeze({
  GOOD: '#10b981',
  WARN: '#f59e0b',
  BAD: '#ef4444',
  NONE: '#e5e7eb'
})

export const DATA_ENCODING = Object.freeze({
  HEX: 'hex',
  BASE64: 'base64',
  TEXT: 'text'
})

export const DATA_ENCODING_LABELS = Object.freeze({
  [DATA_ENCODING.HEX]: '十六进制 (HEX)',
  [DATA_ENCODING.BASE64]: 'Base64',
  [DATA_ENCODING.TEXT]: '纯文本'
})

export const RESPONSE_VALIDATION_MODE = Object.freeze({
  EXACT: 'exact',
  REGEX: 'regex',
  LENGTH_RANGE: 'length_range'
})

export const RESPONSE_VALIDATION_LABELS = Object.freeze({
  [RESPONSE_VALIDATION_MODE.EXACT]: '精确匹配',
  [RESPONSE_VALIDATION_MODE.REGEX]: '正则表达式',
  [RESPONSE_VALIDATION_MODE.LENGTH_RANGE]: '长度范围'
})

export const PROTOCOL_PRESETS = Object.freeze({
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

export const PROTOCOL_PRESET_OPTIONS = Object.entries(PROTOCOL_PRESETS).map(([key, val]) => ({
  value: key,
  label: val.name,
  description: val.description
}))

export function getAvailabilityColor(availability, hasData = true) {
  if (!hasData) return AVAILABILITY_COLORS.NONE
  if (availability >= 99) return AVAILABILITY_COLORS.GOOD
  if (availability >= 80) return AVAILABILITY_COLORS.WARN
  return AVAILABILITY_COLORS.BAD
}
