import type { AgentTelemetryMetricUnit } from '@movscript/core/agent/protocol'

export type AgentPerformanceOperationKind =
  | 'send'
  | 'send_preview_confirm'
  | 'approval'
  | 'rejection'
  | 'input_answer'
  | 'active_run_input'
  | 'external_task'
  | 'conversation_create'
  | 'conversation_open'
  | 'timeline_load'
export type AgentPerformanceOperationStatus = 'running' | 'success' | 'error' | 'cancelled'
export type AgentPerformanceLogLevel = 'info' | 'warning' | 'error'

export interface AgentPerformancePhase {
  id: string
  name: string
  label: string
  at: number
  offsetMs: number
  durationFromPreviousMs: number
  details?: Record<string, unknown>
}

export interface AgentPerformanceOperation {
  id: string
  kind: AgentPerformanceOperationKind
  status: AgentPerformanceOperationStatus
  startedAt: string
  startedMs: number
  updatedAt: string
  endedAt?: string
  durationMs?: number
  conversationId?: string
  runId?: string
  requestId?: string
  meta?: Record<string, unknown>
  phases: AgentPerformancePhase[]
}

export interface AgentPerformanceMetricSample {
  id: string
  name: string
  value: number
  unit: AgentTelemetryMetricUnit
  createdAt: string
  labels?: Record<string, string | number | boolean>
}

export interface AgentPerformanceLogEntry {
  id: string
  level: AgentPerformanceLogLevel
  message: string
  createdAt: string
  operationId?: string
  details?: Record<string, unknown>
}

export interface AgentPerformanceLongTask {
  id: string
  startedAt: string
  startTime: number
  durationMs: number
  name?: string
}

export interface AgentTelemetrySink {
  beginOperation: (input: {
    kind: AgentPerformanceOperationKind
    conversationId?: string
    requestId?: string
    runId?: string
    meta?: Record<string, unknown>
  }) => string
  markPhase: (operationId: string | undefined, name: string, input?: { label?: string; details?: Record<string, unknown> }) => void
  finishOperation: (operationId: string | undefined, status: Exclude<AgentPerformanceOperationStatus, 'running'>, details?: Record<string, unknown>) => void
  recordMetric: (sample: Omit<AgentPerformanceMetricSample, 'id' | 'createdAt'>) => void
  recordLog: (entry: Omit<AgentPerformanceLogEntry, 'id' | 'createdAt'>) => void
  recordLongTask: (task: Omit<AgentPerformanceLongTask, 'id' | 'startedAt'>) => void
}

const SLOW_OPERATION_THRESHOLDS_MS: Record<AgentPerformanceOperationKind, number> = {
  send: 1_000,
  send_preview_confirm: 600,
  approval: 600,
  rejection: 600,
  input_answer: 600,
  active_run_input: 600,
  external_task: 1_000,
  conversation_create: 800,
  conversation_open: 800,
  timeline_load: 600,
}

let observerInstalled = false
let webVitalsInstalled = false
let frontendErrorObserversInstalled = false
let agentTelemetrySink: AgentTelemetrySink = createNoopAgentTelemetrySink()

export function setAgentTelemetrySink(sink: AgentTelemetrySink): void {
  agentTelemetrySink = sink
}

export function resetAgentTelemetrySink(): void {
  agentTelemetrySink = createNoopAgentTelemetrySink()
}

export function createTransientAgentTelemetrySink(onComplete: {
  operation?: (operation: AgentPerformanceOperation) => void
  metric?: (sample: AgentPerformanceMetricSample) => void
  log?: (entry: AgentPerformanceLogEntry) => void
  longTask?: (task: AgentPerformanceLongTask) => void
}): AgentTelemetrySink {
  const activeOperations = new Map<string, AgentPerformanceOperation>()
  return {
    beginOperation: (input) => {
      const id = createPerformanceId('agent_op')
      const startedMs = performanceNow()
      const operation: AgentPerformanceOperation = {
        id,
        kind: input.kind,
        status: 'running',
        startedAt: new Date().toISOString(),
        startedMs,
        updatedAt: new Date().toISOString(),
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        ...(input.requestId ? { requestId: input.requestId } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
        ...(input.meta ? { meta: input.meta } : {}),
        phases: [{
          id: createPerformanceId('agent_phase'),
          name: 'operation_start',
          label: phaseLabel('operation_start'),
          at: startedMs,
          offsetMs: 0,
          durationFromPreviousMs: 0,
        }],
      }
      activeOperations.set(id, operation)
      return id
    },

    markPhase: (operationId, name, input = {}) => {
      if (!operationId) return
      const operation = activeOperations.get(operationId)
      if (!operation || operation.status !== 'running') return
      const at = performanceNow()
      const previous = operation.phases[operation.phases.length - 1]
      const offsetMs = Math.max(0, at - operation.startedMs)
      const deltaMs = previous ? Math.max(0, at - previous.at) : offsetMs
      operation.updatedAt = new Date().toISOString()
      operation.phases.push({
        id: createPerformanceId('agent_phase'),
        name,
        label: input.label ?? phaseLabel(name),
        at,
        offsetMs,
        durationFromPreviousMs: deltaMs,
        ...(input.details ? { details: input.details } : {}),
      })
    },

    finishOperation: (operationId, status, details) => {
      if (!operationId) return
      const operation = activeOperations.get(operationId)
      if (!operation || operation.status !== 'running') return
      const endedMs = performanceNow()
      const durationMs = Math.max(0, endedMs - operation.startedMs)
      const previous = operation.phases[operation.phases.length - 1]
      operation.status = status
      operation.updatedAt = new Date().toISOString()
      operation.endedAt = new Date().toISOString()
      operation.durationMs = durationMs
      operation.phases.push({
        id: createPerformanceId('agent_phase'),
        name: `operation_${status}`,
        label: phaseLabel(`operation_${status}`),
        at: endedMs,
        offsetMs: durationMs,
        durationFromPreviousMs: previous ? Math.max(0, endedMs - previous.at) : durationMs,
        ...(details ? { details } : {}),
      })
      activeOperations.delete(operationId)
      if (durationMs >= SLOW_OPERATION_THRESHOLDS_MS[operation.kind] || status === 'error') {
        const slowest = slowestPhase(operation)
        onComplete.log?.({
          id: createPerformanceId('agent_log'),
          level: status === 'error' ? 'error' : 'warning',
          operationId: operation.id,
          message: status === 'error'
            ? `${operationKindLabel(operation.kind)}失败：${formatMs(durationMs)}`
            : `${operationKindLabel(operation.kind)}较慢：${formatMs(durationMs)}，主要耗时 ${slowest?.label ?? '未知阶段'} ${formatMs(slowest?.durationFromPreviousMs ?? 0)}`,
          createdAt: new Date().toISOString(),
          details: {
            telemetryArea: 'agent_frontend',
            telemetryKind: status === 'error' ? 'operation_error' : 'slow_operation',
            kind: operation.kind,
            durationMs,
            slowestPhase: slowest?.name,
            ...(details ?? {}),
          },
        })
      }
      onComplete.operation?.({ ...operation, phases: [...operation.phases] })
    },

    recordMetric: (sample) => onComplete.metric?.(createMetricSample(sample)),

    recordLog: (entry) => onComplete.log?.({
      ...entry,
      id: createPerformanceId('agent_log'),
      createdAt: new Date().toISOString(),
    }),

    recordLongTask: (task) => {
      const longTask: AgentPerformanceLongTask = {
        ...task,
        id: createPerformanceId('agent_longtask'),
        startedAt: new Date(Date.now() - Math.max(0, performanceNow() - task.startTime)).toISOString(),
      }
      onComplete.longTask?.(longTask)
    },
  }
}

export function beginAgentPerformanceOperation(input: Parameters<AgentTelemetrySink['beginOperation']>[0]): string {
  return agentTelemetrySink.beginOperation(input)
}

export function markAgentPerformancePhase(operationId: string | undefined, name: string, input?: { label?: string; details?: Record<string, unknown> }): void {
  agentTelemetrySink.markPhase(operationId, name, input)
}

export function finishAgentPerformanceOperation(operationId: string | undefined, status: Exclude<AgentPerformanceOperationStatus, 'running'>, details?: Record<string, unknown>): void {
  agentTelemetrySink.finishOperation(operationId, status, details)
}

export function recordAgentPerformanceMetric(sample: Omit<AgentPerformanceMetricSample, 'id' | 'createdAt'>): void {
  agentTelemetrySink.recordMetric(sample)
}

export function recordAgentPerformanceLog(entry: Omit<AgentPerformanceLogEntry, 'id' | 'createdAt'>): void {
  agentTelemetrySink.recordLog(entry)
}

export interface InstrumentedAgentStateStorage {
  getItem: (name: string) => string | null
  setItem: (name: string, value: string) => void
  removeItem: (name: string) => void
  flush?: () => void
}

interface InstrumentedAgentStateStorageOptions {
  writeDelayMs?: number
}

type PendingStorageWrite =
  | { kind: 'set'; value: string; payloadBytes: number }
  | { kind: 'remove' }

export function createInstrumentedAgentStateStorage(
  component: string,
  storage?: Storage | null,
  options: InstrumentedAgentStateStorageOptions = {},
): InstrumentedAgentStateStorage {
  const resolvedStorage = storage ?? (typeof window !== 'undefined' ? window.localStorage : null)
  const writeDelayMs = Math.max(0, options.writeDelayMs ?? 250)
  const pendingWrites = new Map<string, PendingStorageWrite>()
  const cachedValues = new Map<string, string | null>()
  let flushTimer: ReturnType<typeof setTimeout> | undefined

  const flush = (): void => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = undefined
    }
    if (pendingWrites.size === 0) return
    const writes = [...pendingWrites.entries()]
    pendingWrites.clear()
    for (const [name, write] of writes) {
      try {
        if (write.kind === 'set') {
          measureAgentStorageOperation({
            component,
            kind: storageKindFromKey(name),
            stage: 'set',
            payloadBytes: write.payloadBytes,
            run: () => {
              resolvedStorage?.setItem(name, write.value)
            },
          })
        } else {
          measureAgentStorageOperation({
            component,
            kind: storageKindFromKey(name),
            stage: 'remove',
            run: () => {
              resolvedStorage?.removeItem(name)
            },
          })
        }
      } catch {
        pendingWrites.set(name, write)
      }
    }
  }

  const scheduleFlush = (): void => {
    if (flushTimer) return
    flushTimer = setTimeout(flush, writeDelayMs)
  }

  installStorageFlushGuards(flush)

  return {
    getItem: (name) => {
      const pending = pendingWrites.get(name)
      if (pending?.kind === 'set') return pending.value
      if (pending?.kind === 'remove') return null
      const value = measureAgentStorageOperation({
        component,
        kind: storageKindFromKey(name),
        stage: 'get',
        run: () => resolvedStorage?.getItem(name) ?? null,
        bytes: (item) => typeof item === 'string' ? utf8ByteLength(item) : undefined,
      })
      cachedValues.set(name, value)
      return value
    },
    setItem: (name, value) => {
      const pending = pendingWrites.get(name)
      if ((pending?.kind === 'set' && pending.value === value) || (!pending && cachedValues.get(name) === value)) {
        recordFrontendStorageMetrics({
          component,
          kind: storageKindFromKey(name),
          stage: 'set_skip',
          status: 'success',
          durationMs: 0,
          bytes: utf8ByteLength(value),
        })
        return
      }
      pendingWrites.set(name, { kind: 'set', value, payloadBytes: utf8ByteLength(value) })
      cachedValues.set(name, value)
      scheduleFlush()
    },
    removeItem: (name) => {
      const pending = pendingWrites.get(name)
      if (pending?.kind === 'remove' || (!pending && cachedValues.get(name) === null)) {
        recordFrontendStorageMetrics({
          component,
          kind: storageKindFromKey(name),
          stage: 'remove_skip',
          status: 'success',
          durationMs: 0,
        })
        return
      }
      pendingWrites.set(name, { kind: 'remove' })
      cachedValues.set(name, null)
      scheduleFlush()
    },
    flush,
  }
}

function installStorageFlushGuards(flush: () => void): void {
  if (typeof window === 'undefined') return
  window.addEventListener('pagehide', flush)
  window.addEventListener('beforeunload', flush)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
  }
}

function measureAgentStorageOperation<T>(input: {
  component: string
  kind: string
  stage: 'get' | 'set' | 'remove'
  payloadBytes?: number
  bytes?: (value: T) => number | undefined
  run: () => T
}): T {
  const startedAt = performanceNow()
  try {
    const result = input.run()
    recordFrontendStorageMetrics({
      component: input.component,
      kind: input.kind,
      stage: input.stage,
      status: 'success',
      durationMs: Math.max(0, performanceNow() - startedAt),
      bytes: input.payloadBytes ?? input.bytes?.(result),
    })
    return result
  } catch (error) {
    recordFrontendStorageMetrics({
      component: input.component,
      kind: input.kind,
      stage: input.stage,
      status: 'error',
      durationMs: Math.max(0, performanceNow() - startedAt),
      bytes: input.payloadBytes,
    })
    throw error
  }
}

function recordFrontendStorageMetrics(input: {
  component: string
  kind: string
  stage: string
  status: string
  durationMs: number
  bytes?: number
}): void {
  const labels = {
    component: input.component,
    kind: input.kind,
    stage: input.stage,
    status: input.status,
  }
  recordAgentPerformanceMetric({
    name: 'frontend_storage_operation_duration_ms',
    value: input.durationMs,
    unit: 'ms',
    labels,
  })
  if (typeof input.bytes === 'number' && Number.isFinite(input.bytes) && input.bytes >= 0) {
    recordAgentPerformanceMetric({
      name: 'frontend_storage_payload_bytes',
      value: input.bytes,
      unit: 'bytes',
      labels,
    })
  }
}

function storageKindFromKey(name: string): string {
  if (name === 'agent-store-v4') return 'agent_store'
  if (name === 'agent-workspaces-v1') return 'agent_workspace_store'
  if (name === 'agent-session-store-v2') return 'agent_session_store'
  if (name.startsWith('agent-')) return 'agent'
  return 'unknown'
}

export function installAgentPerformanceObservers(): void {
  if (typeof window === 'undefined' || observerInstalled) return
  observerInstalled = true
  installWebVitalsObservers()
  installFrontendErrorObservers()
  const PerformanceObserverCtor = window.PerformanceObserver
  if (!PerformanceObserverCtor) return
  try {
    const observer = new PerformanceObserverCtor((list) => {
      for (const entry of list.getEntries()) {
        agentTelemetrySink.recordLongTask({
          startTime: entry.startTime,
          durationMs: entry.duration,
          name: entry.name,
        })
      }
    })
    observer.observe({ entryTypes: ['longtask'] })
  } catch {
    recordAgentPerformanceLog({
      level: 'info',
      message: '当前运行环境不支持 Long Task 观测。',
      details: { telemetryArea: 'agent_frontend', telemetryKind: 'longtask_unsupported' },
    })
  }
}

export function recordAgentNetworkRequestMetric(input: {
  method: string
  routeGroup: string
  statusClass: string
  durationMs: number
  transport?: string
}): void {
  recordAgentPerformanceMetric({
    name: 'frontend_agent_network_request_duration_ms',
    value: input.durationMs,
    unit: 'ms',
    labels: {
      method: normalizeMetricLabel(input.method, 'GET'),
      route_group: normalizeRouteGroup(input.routeGroup),
      status_class: normalizeMetricLabel(input.statusClass, 'unknown'),
      transport: normalizeMetricLabel(input.transport ?? 'http', 'http'),
    },
  })
}

export function summarizeAgentPerformanceMetrics(samples: AgentPerformanceMetricSample[]): Array<{
  name: string
  unit: AgentPerformanceMetricSample['unit']
  count: number
  avg: number
  p95: number
  max: number
}> {
  const byName = new Map<string, AgentPerformanceMetricSample[]>()
  for (const sample of samples) {
    const list = byName.get(sample.name) ?? []
    list.push(sample)
    byName.set(sample.name, list)
  }
  return [...byName.entries()]
    .map(([name, list]) => {
      const values = list.map((item) => item.value).sort((a, b) => a - b)
      const sum = values.reduce((current, value) => current + value, 0)
      return {
        name,
        unit: list[0]?.unit ?? 'count',
        count: values.length,
        avg: values.length ? sum / values.length : 0,
        p95: percentile(values, 0.95),
        max: values[values.length - 1] ?? 0,
      }
    })
    .sort((a, b) => b.max - a.max)
}

export function slowestPhase(operation: AgentPerformanceOperation): AgentPerformancePhase | undefined {
  return operation.phases
    .filter((phase) => phase.name !== 'operation_start')
    .sort((a, b) => b.durationFromPreviousMs - a.durationFromPreviousMs)[0]
}

export function operationKindLabel(kind: AgentPerformanceOperationKind): string {
  switch (kind) {
    case 'send': return '发送'
    case 'send_preview_confirm': return '预览确认发送'
    case 'approval': return '工具确认'
    case 'rejection': return '工具拒绝'
    case 'input_answer': return '输入回答'
    case 'active_run_input': return '活动 Run 输入'
    case 'external_task': return '外部任务'
    case 'conversation_create': return '新建会话'
    case 'conversation_open': return '打开会话'
    case 'timeline_load': return '读取 Timeline'
    default: return kind
  }
}

export function phaseLabel(name: string): string {
  const labels: Record<string, string> = {
    operation_start: '操作开始',
    operation_success: '操作完成',
    operation_error: '操作失败',
    operation_cancelled: '操作取消',
    click_send: '点击发送',
    pending_send_visible: '发送 Pending 已设置',
    pending_send_frame: '发送 Pending 已渲染',
    build_workspace_start: '构建发送工作区开始',
    build_workspace_done: '构建发送工作区完成',
    preview_ready: '预览就绪',
    commit_start: '提交开始',
    clear_workspace_done: '清空输入工作区',
    provider_session_loading_set: '运行状态已设置',
    source_message_prepared: '消息来源已准备',
    post_commit_frame: '下一帧已提交',
    prepare_provider_session_start: '准备 Provider Session 开始',
    prepare_provider_session_done: '准备 Provider Session 完成',
    ensure_provider_session_start: '启动 Provider Session 开始',
    ensure_provider_session_done: '启动 Provider Session 完成',
    provider_session_health_refetch_start: '刷新 Provider Session 健康开始',
    provider_session_health_refetch_done: '刷新 Provider Session 健康完成',
    mcp_ready_check_start: '检查 MCP 开始',
    mcp_ready_check_done: '检查 MCP 完成',
    model_config_sync_start: '同步模型配置开始',
    model_config_sync_done: '同步模型配置完成',
    request_start: '请求开始',
    resolve_thread_start: '解析 Thread 开始',
    resolve_thread_done: '解析 Thread 完成',
    create_message_run_start: '创建消息 Run 开始',
    create_message_run_done: '创建消息 Run 完成',
    source_message_accepted: '消息被 Provider Session 接收',
    provider_session_input_final_thread_start: 'Provider Session 输入最终 Thread 开始',
    provider_session_input_final_thread_done: 'Provider Session 输入最终 Thread 完成',
    run_stream_start: 'Run 流开始',
    run_stream_done_client: '客户端 Run 流完成',
    final_thread_fetch_start: '最终 Thread 读取开始',
    final_thread_fetch_done: '最终 Thread 读取完成',
    first_run_update: '首次 Run 更新',
    first_provider_session_event: '首次 Provider Session 事件',
    first_assistant_progress: '首次助手进度',
    first_stream_text_visible: '首次流式文字可见',
    stream_progress_sample: '流式进度采样',
    run_stream_done: 'Run 流结束',
    complete_result_start: '落地结果开始',
    complete_result_done: '落地结果完成',
    streaming_assistant_reset: '流式临时消息清理',
    final_state_cleared: '最终状态清理',
    optimistic_update: '乐观状态更新',
    approval_request_start: '确认请求开始',
    approval_request_done: '确认请求完成',
    rejection_request_start: '拒绝请求开始',
    rejection_request_done: '拒绝请求完成',
    followup_stream_start: 'Follow-up Run 开始',
    followup_stream_done: 'Follow-up Run 完成',
    final_thread_loaded: '最终 Thread 已读取',
    assistant_result_appended: '助手结果已写入',
    conversation_create_start: '新建会话开始',
    provisional_thread_start: '创建临时 Thread 开始',
    provisional_thread_done: '创建临时 Thread 完成',
    provider_session_conversation_create_start: '创建前端会话状态开始',
    provider_session_conversation_create_done: '创建前端会话状态完成',
    provider_session_thread_cache_upserted: 'Thread 缓存已更新',
    conversation_panel_opened: '会话面板已打开',
    provider_session_threads_refetch_queued: 'Thread 列表刷新已排队',
    conversation_restore_start: '恢复会话开始',
    conversation_restore_deduped_pending: '复用进行中的恢复',
    conversation_restore_session_state_ready: '会话映射状态已读取',
    conversation_thread_fetch_start: 'Thread 读取开始',
    conversation_thread_fetch_done: 'Thread 读取完成',
    conversation_restore_resolved: '恢复结果已解析',
    conversation_select_start: '选择会话开始',
    conversation_archive_patch_start: '归档状态更新开始',
    conversation_archive_patch_done: '归档状态更新完成',
    conversation_active_set: '活动会话已切换',
    timeline_request_start: 'Timeline 请求开始',
    timeline_request_done: 'Timeline 请求完成',
    timeline_state_replace_queued: 'Timeline 替换已排队',
    timeline_state_merge_queued: 'Timeline 合并已排队',
  }
  return labels[name] ?? name.replace(/_/g, ' ')
}

export function formatMs(value: number): string {
  if (!Number.isFinite(value)) return '-'
  if (value < 1_000) return `${Math.round(value)}ms`
  return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}s`
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value)) return '-'
  if (value < 1024) return `${Math.round(value)} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(2)} MB`
}

export function performanceNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
  return Date.now()
}

function installWebVitalsObservers(): void {
  if (webVitalsInstalled || typeof window === 'undefined') return
  webVitalsInstalled = true

  observePerformanceEntries('paint', (entry) => {
    if (entry.name === 'first-contentful-paint') recordWebVital('fcp', entry.startTime, 'ms')
  })
  observePerformanceEntries('largest-contentful-paint', (entry) => recordWebVital('lcp', entry.startTime, 'ms'))
  observePerformanceEntries('navigation', (entry) => {
    const nav = entry as PerformanceNavigationTiming
    if (Number.isFinite(nav.responseStart)) recordWebVital('ttfb', nav.responseStart, 'ms')
  })
  observePerformanceEntries('layout-shift', (entry) => {
    const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean }
    if (!shift.hadRecentInput && typeof shift.value === 'number') recordWebVital('cls', shift.value, 'score')
  })
  observePerformanceEntries('event', (entry) => {
    const eventEntry = entry as PerformanceEntry & { interactionId?: number; duration?: number }
    if ((eventEntry.interactionId ?? 0) > 0 && typeof eventEntry.duration === 'number') recordWebVital('inp', eventEntry.duration, 'ms')
  })
}

function observePerformanceEntries(type: string, handle: (entry: PerformanceEntry) => void): void {
  const PerformanceObserverCtor = window.PerformanceObserver
  if (!PerformanceObserverCtor) return
  try {
    const observer = new PerformanceObserverCtor((list) => {
      for (const entry of list.getEntries()) handle(entry)
    })
    observer.observe({ type, buffered: true })
  } catch {
    // Unsupported observer types are expected across browsers.
  }
}

function recordWebVital(name: 'fcp' | 'lcp' | 'ttfb' | 'cls' | 'inp', value: number, unit: AgentPerformanceMetricSample['unit']): void {
  if (!Number.isFinite(value) || value < 0) return
  recordAgentPerformanceMetric({
    name: `frontend_web_vital_${name}_${unit === 'score' ? 'score' : 'ms'}`,
    value,
    unit,
    labels: { vital: name },
  })
}

function installFrontendErrorObservers(): void {
  if (frontendErrorObserversInstalled || typeof window === 'undefined') return
  frontendErrorObserversInstalled = true
  window.addEventListener('error', () => {
    recordAgentPerformanceMetric({
      name: 'frontend_ui_errors_total',
      value: 1,
      unit: 'count',
      labels: { area: 'agent_frontend', kind: 'window_error', level: 'error' },
    })
    recordAgentPerformanceLog({
      level: 'error',
      message: '前端运行错误。',
      details: { telemetryArea: 'agent_frontend', telemetryKind: 'window_error' },
    })
  })
  window.addEventListener('unhandledrejection', () => {
    recordAgentPerformanceMetric({
      name: 'frontend_ui_errors_total',
      value: 1,
      unit: 'count',
      labels: { area: 'agent_frontend', kind: 'unhandled_rejection', level: 'error' },
    })
    recordAgentPerformanceLog({
      level: 'error',
      message: '前端 Promise 未处理异常。',
      details: { telemetryArea: 'agent_frontend', telemetryKind: 'unhandled_rejection' },
    })
  })
}

function createMetricSample(sample: Omit<AgentPerformanceMetricSample, 'id' | 'createdAt'>): AgentPerformanceMetricSample {
  return {
    ...sample,
    id: createPerformanceId('agent_metric'),
    createdAt: new Date().toISOString(),
  }
}

function createNoopAgentTelemetrySink(): AgentTelemetrySink {
  const transient = createTransientAgentTelemetrySink({})
  return transient
}

function createPerformanceId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}_${random}`
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * percentileValue) - 1))
  return values[index] ?? 0
}

function normalizeMetricLabel(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase()
  return normalized || fallback
}

function normalizeRouteGroup(path: string): string {
  return path
    .replace(/\/threads\/[^/?#]+/g, '/threads/:id')
    .replace(/\/runs\/[^/?#]+/g, '/runs/:id')
    .replace(/\/sessions\/[^/?#]+/g, '/sessions/:id')
    .replace(/\/interactions\/[^/?#]+/g, '/interactions/:id')
    .replace(/\/plans\/[^/?#]+/g, '/plans/:id')
}

function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).byteLength
  return value.length
}
