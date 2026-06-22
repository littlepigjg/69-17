import React, { useState, useMemo } from 'react'
import { useApp } from '../App.jsx'
import moment from 'moment'
import Modal from '../components/Modal.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import {
  FormField, TextInput, SelectInput, CheckboxInput,
  Button, IconButton
} from '../components/Form.jsx'
import useApi from '../hooks/useApi'
import {
  DATA_ENCODING,
  DATA_ENCODING_LABELS,
  RESPONSE_VALIDATION_MODE,
  RESPONSE_VALIDATION_LABELS,
  PROTOCOL_PRESETS,
  PROTOCOL_PRESET_OPTIONS
} from '../lib/constants.js'

function ToastProvider() {
  return null
}

function TextAreaInput({ value, onChange, placeholder, disabled, rows = 3, style }) {
  return (
    <textarea
      value={value ?? ''}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows}
      style={{
        width: '100%', padding: '10px 12px', borderRadius: 8,
        border: '1px solid #d1d5db', fontSize: 13, outline: 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        background: disabled ? '#f9fafb' : '#fff',
        color: disabled ? '#9ca3af' : '#1f2937',
        fontFamily: 'monospace', resize: 'vertical',
        ...style
      }}
      onFocus={e => {
        if (!disabled) {
          e.target.style.borderColor = '#6366f1'
          e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)'
        }
      }}
      onBlur={e => {
        e.target.style.borderColor = '#d1d5db'
        e.target.style.boxShadow = 'none'
      }}
    />
  )
}

function CollapsibleSection({ title, subtitle, open, onToggle, children, accent }) {
  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: 10,
      background: '#fff',
      marginBottom: 16,
      overflow: 'hidden'
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '14px 16px',
          background: accent ? '#f5f3ff' : '#fafafa',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          textAlign: 'left'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 16,
            color: accent ? '#6d28d9' : '#374151',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            display: 'inline-block'
          }}>▶</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#1f2937' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{subtitle}</div>}
          </div>
        </div>
      </button>
      {open && (
        <div style={{ padding: 16, borderTop: '1px solid #e5e7eb' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function ServiceForm({ initial, services, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    type: initial?.type || 'http',
    target: initial?.target || '',
    port: initial?.port || '',
    method: initial?.method || 'GET',
    expectedStatus: initial?.expectedStatus || 200,
    interval_seconds: initial?.interval_seconds || 30,
    timeout_ms: initial?.timeout_ms || 5000,
    enabled: initial?.enabled !== undefined ? initial.enabled : 1,
    advanced_protocol_enabled: initial?.advanced_protocol_enabled ? 1 : 0,
    send_encoding: initial?.send_encoding || DATA_ENCODING.TEXT,
    send_data: initial?.send_data || '',
    validation_mode: initial?.validation_mode || RESPONSE_VALIDATION_MODE.LENGTH_RANGE,
    expected_encoding: initial?.expected_encoding || DATA_ENCODING.TEXT,
    expected_data: initial?.expected_data || '',
    expected_regex: initial?.expected_regex || '',
    min_length: initial?.min_length ?? 1,
    max_length: initial?.max_length ?? 65535,
    handshake_timeout_ms: initial?.handshake_timeout_ms ?? 50
  })
  const [errors, setErrors] = useState({})
  const [advancedOpen, setAdvancedOpen] = useState(!!initial?.advanced_protocol_enabled)
  const [presetValue, setPresetValue] = useState('')

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    if (errors[k]) setErrors(e => { const n = { ...e }; delete n[k]; return n })
  }

  const applyPreset = (presetKey) => {
    if (!presetKey) return
    const preset = PROTOCOL_PRESETS[presetKey]
    if (!preset) return
    setForm(f => ({
      ...f,
      advanced_protocol_enabled: 1,
      send_encoding: preset.send_encoding,
      send_data: preset.send_data,
      validation_mode: preset.validation_mode,
      expected_encoding: preset.expected_encoding || f.expected_encoding,
      expected_data: preset.expected_data !== undefined ? preset.expected_data : f.expected_data,
      expected_regex: preset.expected_regex !== undefined ? preset.expected_regex : f.expected_regex,
      min_length: preset.min_length !== undefined ? preset.min_length : f.min_length,
      max_length: preset.max_length !== undefined ? preset.max_length : f.max_length
    }))
    setAdvancedOpen(true)
    setTimeout(() => setPresetValue(''), 100)
  }

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = '请输入服务名称'
    if (!form.target.trim()) e.target = '请输入目标地址'
    if (form.type === 'tcp') {
      const hasPort = form.port || form.target.includes(':')
      if (!hasPort) e.port = 'TCP 需要提供端口号'
    }
    if (form.interval_seconds < 5) e.interval_seconds = '最小 5 秒'
    if (form.timeout_ms < 100) e.timeout_ms = '最小 100 毫秒'

    if (form.advanced_protocol_enabled && form.type === 'tcp') {
      const hs = Number(form.handshake_timeout_ms)
      if (!Number.isInteger(hs) || hs < 10 || hs > 500) {
        e.handshake_timeout_ms = '握手超时必须在 10-500 毫秒之间'
      }
      if (form.send_encoding === DATA_ENCODING.HEX && form.send_data) {
        if (!/^[0-9a-fA-F]*$/.test(form.send_data) || form.send_data.length % 2 !== 0) {
          e.send_data = '十六进制字符串格式错误'
        }
      }
      if (form.validation_mode === RESPONSE_VALIDATION_MODE.EXACT) {
        if (form.expected_encoding === DATA_ENCODING.HEX && form.expected_data) {
          if (!/^[0-9a-fA-F]*$/.test(form.expected_data) || form.expected_data.length % 2 !== 0) {
            e.expected_data = '十六进制字符串格式错误'
          }
        }
      }
      if (form.validation_mode === RESPONSE_VALIDATION_MODE.REGEX && form.expected_regex) {
        try {
          new RegExp(form.expected_regex)
        } catch (err) {
          e.expected_regex = '正则表达式语法错误: ' + err.message
        }
      }
      if (form.validation_mode === RESPONSE_VALIDATION_MODE.LENGTH_RANGE) {
        const mn = Number(form.min_length)
        const mx = Number(form.max_length)
        if (!Number.isInteger(mn) || mn < 0) e.min_length = '必须是非负整数'
        if (!Number.isInteger(mx) || mx < 0) e.max_length = '必须是非负整数'
        if (Number.isInteger(mn) && Number.isInteger(mx) && mn > mx) {
          e.max_length = '最大值不能小于最小值'
        }
      }
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    const data = { ...form }
    data.interval_seconds = parseInt(data.interval_seconds, 10) || 30
    data.timeout_ms = parseInt(data.timeout_ms, 10) || 5000
    if (data.expectedStatus) data.expectedStatus = parseInt(data.expectedStatus, 10) || 200
    if (data.port) data.port = parseInt(data.port, 10)
    data.enabled = data.enabled ? 1 : 0
    data.advanced_protocol_enabled = data.advanced_protocol_enabled ? 1 : 0
    if (form.type !== 'tcp') {
      data.advanced_protocol_enabled = 0
    }
    data.handshake_timeout_ms = parseInt(data.handshake_timeout_ms, 10) || 50
    data.min_length = parseInt(data.min_length, 10) || 0
    data.max_length = parseInt(data.max_length, 10) || 65535
    await onSubmit(data)
  }

  const isTcp = form.type === 'tcp'

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <FormField label="服务名称" error={errors.name}>
          <TextInput value={form.name} onChange={v => set('name', v)} placeholder="如: 内部API网关" />
        </FormField>
        <FormField label="检测类型">
          <SelectInput
            value={form.type}
            onChange={v => set('type', v)}
            options={[
              { value: 'http', label: 'HTTP' },
              { value: 'https', label: 'HTTPS' },
              { value: 'tcp', label: 'TCP 端口' }
            ]}
          />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isTcp ? '2fr 1fr' : '1fr', gap: 16 }}>
        <FormField
          label="目标地址"
          error={errors.target}
          help={isTcp ? 'IP 或域名，不带端口号' : '完整 URL，可包含路径'}
        >
          <TextInput
            value={form.target}
            onChange={v => set('target', v)}
            placeholder={isTcp ? '192.168.1.100' : 'https://api.example.com/health'}
          />
        </FormField>
        {isTcp && (
          <FormField label="TCP 端口" error={errors.port}>
            <TextInput
              type="number"
              value={form.port}
              onChange={v => set('port', v)}
              placeholder="如: 3306"
              min="1"
              max="65535"
            />
          </FormField>
        )}
      </div>

      {!isTcp && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <FormField label="HTTP 方法">
            <SelectInput
              value={form.method}
              onChange={v => set('method', v)}
              options={[
                { value: 'GET', label: 'GET' },
                { value: 'HEAD', label: 'HEAD' },
                { value: 'POST', label: 'POST' }
              ]}
            />
          </FormField>
          <FormField label="期望状态码">
            <TextInput
              type="number"
              value={form.expectedStatus}
              onChange={v => set('expectedStatus', v)}
              min="100"
              max="599"
            />
          </FormField>
        </div>
      )}

      {isTcp && (
        <CollapsibleSection
          title="高级协议验证"
          subtitle="自定义握手数据和响应验证（适用于 Redis、MySQL、SMTP 等特殊协议）"
          open={advancedOpen}
          onToggle={() => setAdvancedOpen(v => !v)}
          accent
        >
          <div style={{ marginBottom: 16 }}>
            <CheckboxInput
              checked={!!form.advanced_protocol_enabled}
              onChange={v => set('advanced_protocol_enabled', v ? 1 : 0)}
              label="启用高级协议验证"
            />
          </div>

          {form.advanced_protocol_enabled && (
            <>
              <div style={{
                padding: 12,
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 8,
                marginBottom: 16
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#166534', marginBottom: 8 }}>
                  📋 常用协议预设模板
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <SelectInput
                    value={presetValue}
                    onChange={applyPreset}
                    options={[
                      { value: '', label: '选择预设模板...' },
                      ...PROTOCOL_PRESET_OPTIONS
                    ]}
                    placeholder="选择预设模板..."
                  />
                </div>
                <div style={{ fontSize: 11, color: '#15803d', marginTop: 6 }}>
                  提示：变量替换支持 {{timestamp}}、{{random_hex_8}}、{{uuid}} 等
                </div>
              </div>

              <div style={{ fontSize: 12, fontWeight: 600, color: '#4b5563', margin: '16px 0 10px', paddingBottom: 6, borderBottom: '1px solid #e5e7eb' }}>
                ▸ 发送数据配置
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
                <FormField label="数据编码">
                  <SelectInput
                    value={form.send_encoding}
                    onChange={v => set('send_encoding', v)}
                    options={[
                      { value: DATA_ENCODING.TEXT, label: DATA_ENCODING_LABELS[DATA_ENCODING.TEXT] },
                      { value: DATA_ENCODING.HEX, label: DATA_ENCODING_LABELS[DATA_ENCODING.HEX] },
                      { value: DATA_ENCODING.BASE64, label: DATA_ENCODING_LABELS[DATA_ENCODING.BASE64] }
                    ]}
                  />
                </FormField>
                <FormField label="握手超时（毫秒）" error={errors.handshake_timeout_ms} help="10-500ms，默认 50ms">
                  <TextInput
                    type="number"
                    value={form.handshake_timeout_ms}
                    onChange={v => set('handshake_timeout_ms', v)}
                    min="10"
                    max="500"
                  />
                </FormField>
              </div>

              <FormField
                label="发送数据内容"
                error={errors.send_data}
                help="留空表示不发送数据，直接等待响应。支持变量替换"
              >
                <TextAreaInput
                  value={form.send_data}
                  onChange={v => set('send_data', v)}
                  rows={3}
                  placeholder={
                    form.send_encoding === DATA_ENCODING.HEX
                      ? '例: 2a310d0a24340d0a50494e470d0a'
                      : form.send_encoding === DATA_ENCODING.BASE64
                        ? '例: qDENCjQNCFBJTkcNCg=='
                        : "例: *1\\r\\n$4\\r\\nPING\\r\\n"
                  }
                />
              </FormField>

              <div style={{ fontSize: 12, fontWeight: 600, color: '#4b5563', margin: '16px 0 10px', paddingBottom: 6, borderBottom: '1px solid #e5e7eb' }}>
                ▸ 响应验证配置
              </div>

              <FormField label="验证模式">
                <SelectInput
                  value={form.validation_mode}
                  onChange={v => set('validation_mode', v)}
                  options={[
                    { value: RESPONSE_VALIDATION_MODE.LENGTH_RANGE, label: RESPONSE_VALIDATION_LABELS[RESPONSE_VALIDATION_MODE.LENGTH_RANGE] },
                    { value: RESPONSE_VALIDATION_MODE.EXACT, label: RESPONSE_VALIDATION_LABELS[RESPONSE_VALIDATION_MODE.EXACT] },
                    { value: RESPONSE_VALIDATION_MODE.REGEX, label: RESPONSE_VALIDATION_LABELS[RESPONSE_VALIDATION_MODE.REGEX] }
                  ]}
                />
              </FormField>

              {form.validation_mode === RESPONSE_VALIDATION_MODE.EXACT && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
                    <FormField label="期望响应编码">
                      <SelectInput
                        value={form.expected_encoding}
                        onChange={v => set('expected_encoding', v)}
                        options={[
                          { value: DATA_ENCODING.TEXT, label: DATA_ENCODING_LABELS[DATA_ENCODING.TEXT] },
                          { value: DATA_ENCODING.HEX, label: DATA_ENCODING_LABELS[DATA_ENCODING.HEX] },
                          { value: DATA_ENCODING.BASE64, label: DATA_ENCODING_LABELS[DATA_ENCODING.BASE64] }
                        ]}
                      />
                    </FormField>
                    <div></div>
                  </div>
                  <FormField label="期望响应内容" error={errors.expected_data}>
                    <TextAreaInput
                      value={form.expected_data}
                      onChange={v => set('expected_data', v)}
                      rows={3}
                      placeholder={
                        form.expected_encoding === DATA_ENCODING.HEX
                          ? '例: 2b504f4e470d0a'
                          : form.expected_encoding === DATA_ENCODING.BASE64
                            ? '例: K1BPTkcNCg=='
                            : "例: +PONG\r\n"
                      }
                    />
                  </FormField>
                </>
              )}

              {form.validation_mode === RESPONSE_VALIDATION_MODE.REGEX && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
                    <FormField label="响应文本编码">
                      <SelectInput
                        value={form.expected_encoding}
                        onChange={v => set('expected_encoding', v)}
                        options={[
                          { value: DATA_ENCODING.TEXT, label: DATA_ENCODING_LABELS[DATA_ENCODING.TEXT] },
                          { value: DATA_ENCODING.HEX, label: DATA_ENCODING_LABELS[DATA_ENCODING.HEX] },
                          { value: DATA_ENCODING.BASE64, label: DATA_ENCODING_LABELS[DATA_ENCODING.BASE64] }
                        ]}
                      />
                    </FormField>
                    <div></div>
                  </div>
                  <FormField label="正则表达式" error={errors.expected_regex} help="JS 正则语法，响应解码为文本后进行匹配">
                    <TextAreaInput
                      value={form.expected_regex}
                      onChange={v => set('expected_regex', v)}
                      rows={2}
                      placeholder="例: ^\\+PONG[\\s\\S]*$  或  ^250[\\s\\S]*$"
                    />
                  </FormField>
                </>
              )}

              {form.validation_mode === RESPONSE_VALIDATION_MODE.LENGTH_RANGE && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <FormField label="最小响应长度（字节）" error={errors.min_length}>
                    <TextInput
                      type="number"
                      value={form.min_length}
                      onChange={v => set('min_length', v)}
                      min="0"
                    />
                  </FormField>
                  <FormField label="最大响应长度（字节）" error={errors.max_length}>
                    <TextInput
                      type="number"
                      value={form.max_length}
                      onChange={v => set('max_length', v)}
                      min="0"
                    />
                  </FormField>
                </div>
              )}
            </>
          )}
        </CollapsibleSection>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <FormField label="检测间隔（秒）" error={errors.interval_seconds} help="最短 5 秒">
          <TextInput type="number" value={form.interval_seconds} onChange={v => set('interval_seconds', v)} min="5" />
        </FormField>
        <FormField label="超时时间（毫秒）" error={errors.timeout_ms}>
          <TextInput type="number" value={form.timeout_ms} onChange={v => set('timeout_ms', v)} min="100" />
        </FormField>
      </div>

      <div style={{ padding: '12px 0' }}>
        <CheckboxInput
          checked={!!form.enabled}
          onChange={v => set('enabled', v ? 1 : 0)}
          label="启用该监控"
        />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
        <Button onClick={onCancel}>取消</Button>
        <Button variant="primary" type="submit">
          {initial ? '保存修改' : '添加服务'}
        </Button>
      </div>
    </form>
  )
}

function MaintenanceForm({ initial, services, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    service_id: initial?.service_id ?? '',
    name: initial?.name || '',
    description: initial?.description || '',
    start_time: initial?.start_time
      ? moment(initial.start_time).format('YYYY-MM-DDTHH:mm')
      : moment().format('YYYY-MM-DDTHH:mm'),
    end_time: initial?.end_time
      ? moment(initial.end_time).format('YYYY-MM-DDTHH:mm')
      : moment().add(1, 'hour').format('YYYY-MM-DDTHH:mm'),
    active: initial?.active !== undefined ? initial.active : 1
  })
  const [errors, setErrors] = useState({})

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    if (errors[k]) setErrors(e => { const n = { ...e }; delete n[k]; return n })
  }

  const applyPreset = (minutes) => {
    set('start_time', moment().format('YYYY-MM-DDTHH:mm'))
    set('end_time', moment().add(minutes, 'minutes').format('YYYY-MM-DDTHH:mm'))
  }

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = '请输入维护窗口名称'
    if (!form.start_time) e.start_time = '请选择开始时间'
    if (!form.end_time) e.end_time = '请选择结束时间'
    if (form.start_time && form.end_time && moment(form.end_time) <= moment(form.start_time)) {
      e.end_time = '结束时间必须晚于开始时间'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    const data = { ...form }
    data.service_id = data.service_id === '' ? null : parseInt(data.service_id, 10)
    data.start_time = moment(data.start_time).toISOString()
    data.end_time = moment(data.end_time).toISOString()
    data.active = data.active ? 1 : 0
    await onSubmit(data)
  }

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>快捷设置：</span>
        {[30, 60, 120, 360, 1440].map(m => (
          <Button key={m} size="sm" onClick={() => applyPreset(m)}>
            {m < 60 ? `${m}分钟` : m < 1440 ? `${m / 60}小时` : '1天'}
          </Button>
        ))}
      </div>

      <FormField label="应用服务">
        <SelectInput
          value={form.service_id === null ? '' : form.service_id}
          onChange={v => set('service_id', v)}
          options={[
            { value: '', label: '全部服务（全局维护）' },
            ...services.map(s => ({ value: String(s.id), label: s.name }))
          ]}
        />
      </FormField>

      <FormField label="维护窗口名称" error={errors.name}>
        <TextInput value={form.name} onChange={v => set('name', v)} placeholder="如: 数据库升级维护" />
      </FormField>

      <FormField label="维护说明">
        <TextInput value={form.description} onChange={v => set('description', v)} placeholder="描述维护的原因和影响" />
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <FormField label="开始时间" error={errors.start_time}>
          <TextInput type="datetime-local" value={form.start_time} onChange={v => set('start_time', v)} />
        </FormField>
        <FormField label="结束时间" error={errors.end_time}>
          <TextInput type="datetime-local" value={form.end_time} onChange={v => set('end_time', v)} />
        </FormField>
      </div>

      <div style={{ padding: '12px 0' }}>
        <CheckboxInput
          checked={!!form.active}
          onChange={v => set('active', v ? 1 : 0)}
          label="立即生效"
        />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
        <Button onClick={onCancel}>取消</Button>
        <Button variant="primary" type="submit">
          {initial ? '保存修改' : '创建维护窗口'}
        </Button>
      </div>
    </form>
  )
}

function Toast({ message, type }) {
  if (!message) return null
  return (
    <div style={{
      position: 'fixed', top: 80, right: 24, zIndex: 2000,
      padding: '12px 20px', borderRadius: 10,
      background: type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#6366f1',
      color: '#fff', fontWeight: 600, fontSize: 14,
      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
      animation: 'fadeIn 0.2s ease-out'
    }}>{message}</div>
  )
}

function useToast() {
  const [toast, setToast] = useState(null)
  const show = (msg, type = 'success', duration = 3000) => {
    setToast({ msg, type })
    if (toast?.timer) clearTimeout(toast.timer)
    const timer = setTimeout(() => setToast(null), duration)
    setToast({ msg, type, timer })
  }
  return { toast, show }
}

export default function AdminPage() {
  const { services, fetchServices, maintenance, fetchMaintenance } = useApp()
  const [tab, setTab] = useState('services')
  const [showServiceForm, setShowServiceForm] = useState(null)
  const [showMaintForm, setShowMaintForm] = useState(null)
  const [openMaintenanceMenu, setOpenMaintenanceMenu] = useState(null)
  const { get, post, put, del } = useApi('/api')
  const { toast, show: showToast } = useToast()

  const handleCreateService = async (data) => {
    try {
      await post('/services', data)
      await fetchServices()
      setShowServiceForm(null)
      showToast('服务已添加')
    } catch (e) {
      showToast(e.message || '创建失败', 'error')
    }
  }

  const handleUpdateService = async (id, data) => {
    try {
      await put(`/services/${id}`, data)
      await fetchServices()
      setShowServiceForm(null)
      showToast('服务已更新')
    } catch (e) {
      showToast(e.message || '更新失败', 'error')
    }
  }

  const handleDeleteService = async (svc) => {
    if (!window.confirm(`确定删除服务「${svc.name}」？此操作不可恢复。`)) return
    try {
      await del(`/services/${svc.id}`)
      await fetchServices()
      showToast('服务已删除')
    } catch (e) {
      showToast(e.message || '删除失败', 'error')
    }
  }

  const handleTriggerCheck = async (svc) => {
    try {
      await post(`/services/${svc.id}/check`)
      showToast(`已触发「${svc.name}」检测`)
      setTimeout(fetchServices, 2000)
    } catch (e) {
      showToast(e.message || '触发失败', 'error')
    }
  }

  const handleToggleEnabled = async (svc) => {
    try {
      await put(`/services/${svc.id}`, { enabled: svc.enabled ? 0 : 1 })
      await fetchServices()
      showToast(svc.enabled ? '已停止监控' : '已开始监控')
    } catch (e) {
      showToast(e.message || '操作失败', 'error')
    }
  }

  const handleQuickMaintenance = async (svc, minutes) => {
    try {
      await post('/maintenance/quick', { service_id: svc.id, minutes })
      await fetchMaintenance()
      await fetchServices()
      showToast(`已设置 ${minutes} 分钟维护窗口`)
    } catch (e) {
      showToast(e.message || '创建失败', 'error')
    } finally {
      setOpenMaintenanceMenu(null)
    }
  }

  const handleCreateMaint = async (data) => {
    try {
      await post('/maintenance', data)
      await fetchMaintenance()
      await fetchServices()
      setShowMaintForm(null)
      showToast('维护窗口已创建')
    } catch (e) {
      showToast(e.message || '创建失败', 'error')
    }
  }

  const handleUpdateMaint = async (id, data) => {
    try {
      await put(`/maintenance/${id}`, data)
      await fetchMaintenance()
      await fetchServices()
      setShowMaintForm(null)
      showToast('维护窗口已更新')
    } catch (e) {
      showToast(e.message || '更新失败', 'error')
    }
  }

  const handleDeleteMaint = async (m) => {
    if (!window.confirm(`确定删除维护窗口「${m.name}」？`)) return
    try {
      await del(`/maintenance/${m.id}`)
      await fetchMaintenance()
      await fetchServices()
      showToast('维护窗口已删除')
    } catch (e) {
      showToast(e.message || '删除失败', 'error')
    }
  }

  const activeMaintenance = useMemo(() => maintenance.filter(m => {
    const now = moment()
    const start = moment(m.start_time)
    const end = moment(m.end_time)
    return m.active && now >= start && now <= end
  }), [maintenance])

  const typeIcon = { http: '🌐', https: '🔒', tcp: '🔌' }
  const statusColor = {
    up: '#10b981', down: '#ef4444', maintenance: '#f59e0b', unknown: '#9ca3af'
  }

  return (
    <div>
      <Toast message={toast?.msg} type={toast?.type} />

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 8
      }}>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 800 }}>管理配置</h2>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>
            管理监控服务端点和维护窗口配置
          </p>
        </div>
        <Button
          variant="primary"
          icon="+"
          onClick={() => tab === 'services'
            ? setShowServiceForm({ mode: 'create' })
            : setShowMaintForm({ mode: 'create' })
          }
        >
          {tab === 'services' ? '添加监控服务' : '创建维护窗口'}
        </Button>
      </div>

      {activeMaintenance.length > 0 && (
        <div style={{
          margin: '16px 0', padding: '12px 16px', borderRadius: 10,
          background: '#fef3c7', border: '1px solid #fcd34d',
          display: 'flex', alignItems: 'center', gap: 12
        }}>
          <span style={{ fontSize: 20 }}>⚙</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: '#92400e' }}>
              当前有 {activeMaintenance.length} 个进行中的维护窗口
            </div>
            <div style={{ fontSize: 12, color: '#b45309' }}>
              {activeMaintenance.map(m => m.name).join('、')}
            </div>
          </div>
          <button
            onClick={() => setTab('maintenance')}
            style={{
              padding: '6px 14px', borderRadius: 6,
              border: '1px solid #f59e0b', background: '#fffbeb',
              color: '#b45309', cursor: 'pointer', fontSize: 13
            }}
          >查看</button>
        </div>
      )}

      <div style={{ borderBottom: '1px solid #e5e7eb', marginTop: 16, marginBottom: 24 }}>
        <TabButton
          active={tab === 'services'}
          label="服务管理"
          badge={services.length}
          onClick={() => setTab('services')}
        />
        <TabButton
          active={tab === 'maintenance'}
          label="维护窗口"
          badge={maintenance.length}
          onClick={() => setTab('maintenance')}
        />
      </div>

      {tab === 'services' && (
        <div>
          {services.length === 0 && (
            <EmptyState
              icon="🔧"
              title="还没有配置任何服务"
              hint="点击右上角「添加监控服务」按钮开始配置"
            />
          )}
          <div style={{ display: 'grid', gap: 12 }}>
            {services.map(svc => {
              const dotColor = statusColor[svc.summary?.status] || '#9ca3af'
              return (
                <div
                  key={svc.id}
                  style={{
                    background: '#fff', borderRadius: 12, padding: 18,
                    border: '1px solid #e5e7eb', display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto', gap: 16,
                    alignItems: 'center'
                  }}
                >
                  <div style={{
                    width: 46, height: 46, borderRadius: 12,
                    background: `${dotColor}15`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, position: 'relative'
                  }}>
                    {typeIcon[svc.type] || '🌐'}
                    <span style={{
                      position: 'absolute', bottom: 2, right: 2,
                      width: 12, height: 12, borderRadius: '50%',
                      background: dotColor, border: '2px solid #fff'
                    }} />
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: 16, fontWeight: 600 }}>{svc.name}</h3>
                      {!svc.enabled && (
                        <span style={{
                          padding: '2px 8px', fontSize: 11, borderRadius: 4,
                          background: '#e5e7eb', color: '#4b5563', fontWeight: 500
                        }}>已停用</span>
                      )}
                      {svc.type === 'tcp' && svc.advanced_protocol_enabled && (
                        <span style={{
                          padding: '2px 8px', fontSize: 11, borderRadius: 4,
                          background: '#ede9fe', color: '#6d28d9', fontWeight: 500
                        }}>🔐 协议握手</span>
                      )}
                    </div>
                    <div style={{
                      fontSize: 12, color: '#6b7280', fontFamily: 'monospace',
                      display: 'flex', flexWrap: 'wrap', gap: 12
                    }}>
                      <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{svc.type}</span>
                      <span>→</span>
                      <span>{svc.target}{svc.type === 'tcp' && svc.port ? `:${svc.port}` : ''}</span>
                      {svc.type !== 'tcp' && <span>[{svc.method} / {svc.expectedStatus}]</span>}
                      {svc.type === 'tcp' && svc.advanced_protocol_enabled && (
                        <span style={{ color: '#6d28d9' }}>[握手:{svc.handshake_timeout_ms || 50}ms]</span>
                      )}
                      <span style={{ color: '#9ca3af' }}>· 每{svc.interval_seconds}s · 超时{svc.timeout_ms}ms</span>
                    </div>
                    {svc.summary?.status && (
                      <div style={{
                        marginTop: 6, display: 'flex', flexWrap: 'wrap',
                        gap: 16, fontSize: 12, color: '#6b7280'
                      }}>
                        <span>可用率: <b style={{ color: '#1f2937' }}>{(svc.summary.availability || 0).toFixed(2)}%</b></span>
                        <span>响应: <b style={{ color: '#4f46e5' }}>{svc.summary.avgResponseTime || 0}ms</b></span>
                        {svc.summary.error_message && (
                          <span style={{ color: '#dc2626' }}>错误: {svc.summary.error_message}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <IconButton
                      icon="⟳"
                      title="立即检测"
                      onClick={() => handleTriggerCheck(svc)}
                    />
                    <IconButton
                      icon={svc.enabled ? '⏸' : '▶'}
                      title={svc.enabled ? '停用监控' : '启用监控'}
                      onClick={() => handleToggleEnabled(svc)}
                    />
                    <div style={{ position: 'relative' }}>
                      <IconButton
                        icon="⚑"
                        color="warning"
                        title="维护"
                        onClick={() => setOpenMaintenanceMenu(openMaintenanceMenu === svc.id ? null : svc.id)}
                      />
                      {openMaintenanceMenu === svc.id && (
                        <div style={{
                          position: 'absolute', right: 0, top: '110%',
                          background: '#fff', borderRadius: 10, padding: 6,
                          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                          border: '1px solid #e5e7eb', zIndex: 10, minWidth: 140
                        }}
                        onBlur={() => setOpenMaintenanceMenu(null)}>
                          {[15, 30, 60, 240].map(m => (
                            <button
                              key={m}
                              onClick={() => handleQuickMaintenance(svc, m)}
                              style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                padding: '8px 12px', border: 'none', background: 'none',
                                cursor: 'pointer', borderRadius: 6, fontSize: 13,
                                color: '#374151'
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                              onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >
                              {m < 60 ? `${m}分钟` : `${m / 60}小时`}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <IconButton
                      icon="✎"
                      color="primary"
                      title="编辑"
                      onClick={() => setShowServiceForm({ mode: 'edit', data: svc })}
                    />
                    <IconButton
                      icon="✕"
                      color="danger"
                      title="删除"
                      onClick={() => handleDeleteService(svc)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'maintenance' && (
        <div>
          {maintenance.length === 0 && (
            <EmptyState
              icon="🕐"
              title="暂无维护窗口"
              hint="创建维护窗口以在指定时间段内忽略服务故障"
            />
          )}
          <div style={{ display: 'grid', gap: 12 }}>
            {maintenance.map(m => {
              const now = moment()
              const start = moment(m.start_time)
              const end = moment(m.end_time)
              const isActive = m.active && now >= start && now <= end
              const isPast = now > end
              const isFuture = now < start
              const svc = services.find(s => s.id === m.service_id)

              const meta = isActive
                ? { label: '进行中', color: '#10b981', bg: '#d1fae5' }
                : isFuture
                  ? { label: '即将开始', color: '#2563eb', bg: '#dbeafe' }
                  : isPast
                    ? { label: '已结束', color: '#6b7280', bg: '#f3f4f6' }
                    : { label: '已停用', color: '#9ca3af', bg: '#f3f4f6' }

              const totalMinutes = Math.round(end.diff(start, 'minutes'))

              return (
                <div
                  key={m.id}
                  style={{
                    background: '#fff', borderRadius: 12, padding: 18,
                    border: '1px solid #e5e7eb', display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto', gap: 16,
                    alignItems: 'center'
                  }}
                >
                  <div style={{
                    width: 46, height: 46, borderRadius: 12,
                    background: `${meta.color}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22
                  }}>⚙</div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: 15, fontWeight: 600 }}>{m.name}</h3>
                      <span style={{
                        padding: '3px 10px', fontSize: 11, borderRadius: 999,
                        background: meta.bg, color: meta.color, fontWeight: 600
                      }}>{meta.label}</span>
                      {svc && (
                        <span style={{
                          padding: '3px 10px', fontSize: 11, borderRadius: 6,
                          background: '#f3f4f6', color: '#4b5563'
                        }}>{svc.name}</span>
                      )}
                      {!svc && (
                        <span style={{
                          padding: '3px 10px', fontSize: 11, borderRadius: 6,
                          background: '#ede9fe', color: '#6d28d9'
                        }}>全部服务</span>
                      )}
                    </div>
                    {m.description && (
                      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>
                        {m.description}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: '#4b5563', fontFamily: 'monospace' }}>
                      🕐 {start.format('YYYY-MM-DD HH:mm')} → {end.format('YYYY-MM-DD HH:mm')}
                      <span style={{ color: '#9ca3af', marginLeft: 12 }}>
                        (共 {formatMinutes(totalMinutes)})
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <IconButton
                      icon="✎"
                      color="primary"
                      title="编辑"
                      onClick={() => setShowMaintForm({ mode: 'edit', data: m })}
                    />
                    <IconButton
                      icon={m.active ? '⏸' : '▶'}
                      title={m.active ? '停用' : '启用'}
                      onClick={() => handleUpdateMaint(m.id, { active: m.active ? 0 : 1 })}
                    />
                    <IconButton
                      icon="✕"
                      color="danger"
                      title="删除"
                      onClick={() => handleDeleteMaint(m)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showServiceForm && (
        <Modal
          title={showServiceForm.mode === 'create' ? '添加监控服务' : '编辑服务配置'}
          onClose={() => setShowServiceForm(null)}
          width={640}
        >
          <ServiceForm
            initial={showServiceForm.data}
            services={services}
            onSubmit={showServiceForm.mode === 'create'
              ? handleCreateService
              : (data) => handleUpdateService(showServiceForm.data.id, data)
            }
            onCancel={() => setShowServiceForm(null)}
          />
        </Modal>
      )}

      {showMaintForm && (
        <Modal
          title={showMaintForm.mode === 'create' ? '创建维护窗口' : '编辑维护窗口'}
          onClose={() => setShowMaintForm(null)}
          width={640}
        >
          <MaintenanceForm
            initial={showMaintForm.data}
            services={services}
            onSubmit={showMaintForm.mode === 'create'
              ? handleCreateMaint
              : (data) => handleUpdateMaint(showMaintForm.data.id, data)
            }
            onCancel={() => setShowMaintForm(null)}
          />
        </Modal>
      )}
    </div>
  )
}

function TabButton({ active, label, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '12px 20px', fontSize: 14, fontWeight: 600,
        border: 'none', background: 'none', cursor: 'pointer',
        borderBottom: active ? '3px solid #6366f1' : '3px solid transparent',
        color: active ? '#4f46e5' : '#6b7280',
        transition: 'all 0.15s'
      }}
    >
      {label}
      {badge !== undefined && (
        <span style={{
          marginLeft: 8, padding: '2px 8px',
          background: active ? '#e0e7ff' : '#f3f4f6',
          borderRadius: 999, fontSize: 12
        }}>{badge}</span>
      )}
    </button>
  )
}

function EmptyState({ icon, title, hint }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: 60, textAlign: 'center',
      color: '#6b7280', border: '2px dashed #e5e7eb'
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#1f2937' }}>
        {title}
      </div>
      <div>{hint}</div>
    </div>
  )
}

function formatMinutes(totalMinutes) {
  if (totalMinutes < 60) return `${totalMinutes} 分钟`
  if (totalMinutes < 1440) return `${Math.round(totalMinutes / 60)} 小时`
  return `${Math.round(totalMinutes / 1440)} 天`
}
