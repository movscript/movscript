import { create } from 'zustand'

export type AgentPerformanceOperationKind = 'send' | 'send_preview_confirm' | 'approval' | 'rejection' | 'input_answer' | 'runtime_input' | 'external_task'
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
  unit: 'ms' | 'bytes' | 'count'
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

export interface AgentPerformanceStorageSnapshot {
  id: string
  createdAt: string
  keys: Array<{ key: string; bytes: number }>
  totalBytes: number
}

export interface AgentTelemetrySink {
  beginOperation: AgentPerformanceStore['beginOperation']
  markPhase: AgentPerformanceStore['markPhase']
  finishOperation: AgentPerformanceStore['finishOperation']
  recordMetric: AgentPerformanceStore['recordMetric']
  recordLog: AgentPerformanceStore['recordLog']
  recordLongTask: AgentPerformanceStore['recordLongTask']
  recordStorageSnapshot: AgentPerformanceStore['recordStorageSnapshot']
}

interface AgentPerformanceStore {
  operations: AgentPerformanceOperation[]
  metrics: AgentPerformanceMetricSample[]
  logs: AgentPerformanceLogEntry[]
  longTasks: AgentPerformanceLongTask[]
  storageSnapshots: AgentPerformanceStorageSnapshot[]
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
  recordStorageSnapshot: (snapshot: Omit<AgentPerformanceStorageSnapshot, 'id' | 'createdAt'>) => void
  clear: () => void
}

const MAX_OPERATIONS = 100
const MAX_METRICS = 800
const MAX_LOGS = 250
const MAX_LONG_TASKS = 250
const MAX_STORAGE_SNAPSHOTS = 40
const SLOW_OPERATION_THRESHOLDS_MS: Record<AgentPerformanceOperationKind, number> = {
  send: 1_000,
  send_preview_confirm: 600,
  approval: 600,
  rejection: 600,
  input_answer: 600,
  runtime_input: 600,
  external_task: 1_000,
}

const STORAGE_KEYS_TO_TRACK = ['agent-store-v4', 'agent-session-store-v2'] as const

let observerInstalled = false
let storageProbeInstalled = false
let originalStorageSetItem: ((this: Storage, key: string, value: string) => void) | null = null

export const useAgentPerformanceStore = create<AgentPerformanceStore>()((set, get) => ({
  operations: [],
  metrics: [],
  logs: [],
  longTasks: [],
  storageSnapshots: [],

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
    set((state) => ({
      operations: [operation, ...state.operations].slice(0, MAX_OPERATIONS),
    }))
    return id
  },

  markPhase: (operationId, name, input = {}) => {
    if (!operationId) return
    const at = performanceNow()
    let phaseMetric: { kind: AgentPerformanceOperationKind; offsetMs: number; deltaMs: number } | undefined
    set((state) => ({
      operations: state.operations.map((operation) => {
        if (operation.id !== operationId) return operation
        if (operation.status !== 'running') return operation
        const previous = operation.phases[operation.phases.length - 1]
        const offsetMs = Math.max(0, at - operation.startedMs)
        const deltaMs = previous ? Math.max(0, at - previous.at) : offsetMs
        phaseMetric = { kind: operation.kind, offsetMs, deltaMs }
        return {
          ...operation,
          updatedAt: new Date().toISOString(),
          phases: [
            ...operation.phases,
            {
              id: createPerformanceId('agent_phase'),
              name,
              label: input.label ?? phaseLabel(name),
              at,
              offsetMs,
              durationFromPreviousMs: deltaMs,
              ...(input.details ? { details: input.details } : {}),
            },
          ],
        }
      }),
    }))
    if (phaseMetric) {
      get().recordMetric({
        name: 'agent_operation_phase_offset_ms',
        value: phaseMetric.offsetMs,
        unit: 'ms',
        labels: { kind: phaseMetric.kind, phase: name },
      })
      get().recordMetric({
        name: 'agent_operation_phase_delta_ms',
        value: phaseMetric.deltaMs,
        unit: 'ms',
        labels: { kind: phaseMetric.kind, phase: name },
      })
    }
  },

  finishOperation: (operationId, status, details) => {
    if (!operationId) return
    const endedMs = performanceNow()
    let finished: AgentPerformanceOperation | undefined
    let alreadyFinished = false
    set((state) => ({
      operations: state.operations.map((operation) => {
        if (operation.id !== operationId) return operation
        if (operation.status !== 'running') {
          finished = operation
          alreadyFinished = true
          return operation
        }
        const durationMs = Math.max(0, endedMs - operation.startedMs)
        const previous = operation.phases[operation.phases.length - 1]
        finished = {
          ...operation,
          status,
          updatedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          durationMs,
          phases: [
            ...operation.phases,
            {
              id: createPerformanceId('agent_phase'),
              name: `operation_${status}`,
              label: phaseLabel(`operation_${status}`),
              at: endedMs,
              offsetMs: durationMs,
              durationFromPreviousMs: previous ? Math.max(0, endedMs - previous.at) : durationMs,
              ...(details ? { details } : {}),
            },
          ],
        }
        return finished
      }),
    }))
    if (!finished || alreadyFinished) return
    get().recordMetric({
      name: 'agent_operation_duration_ms',
      value: finished.durationMs ?? 0,
      unit: 'ms',
      labels: { kind: finished.kind, status },
    })
    const threshold = SLOW_OPERATION_THRESHOLDS_MS[finished.kind]
    if ((finished.durationMs ?? 0) >= threshold || status === 'error') {
      const slowest = slowestPhase(finished)
      get().recordLog({
        level: status === 'error' ? 'error' : 'warning',
        operationId: finished.id,
        message: status === 'error'
          ? `${operationKindLabel(finished.kind)}失败：${formatMs(finished.durationMs ?? 0)}`
          : `${operationKindLabel(finished.kind)}较慢：${formatMs(finished.durationMs ?? 0)}，主要耗时 ${slowest?.label ?? '未知阶段'} ${formatMs(slowest?.durationFromPreviousMs ?? 0)}`,
        details: {
          kind: finished.kind,
          durationMs: finished.durationMs,
          slowestPhase: slowest?.name,
          ...(details ?? {}),
        },
      })
    }
  },

  recordMetric: (sample) => set((state) => ({
    metrics: [{
      ...sample,
      id: createPerformanceId('agent_metric'),
      createdAt: new Date().toISOString(),
    }, ...state.metrics].slice(0, MAX_METRICS),
  })),

  recordLog: (entry) => set((state) => ({
    logs: [{
      ...entry,
      id: createPerformanceId('agent_log'),
      createdAt: new Date().toISOString(),
    }, ...state.logs].slice(0, MAX_LOGS),
  })),

  recordLongTask: (task) => {
    set((state) => ({
      longTasks: [{
        ...task,
        id: createPerformanceId('agent_longtask'),
        startedAt: new Date(Date.now() - Math.max(0, performanceNow() - task.startTime)).toISOString(),
      }, ...state.longTasks].slice(0, MAX_LONG_TASKS),
    }))
    get().recordMetric({
      name: 'frontend_long_task_duration_ms',
      value: task.durationMs,
      unit: 'ms',
      labels: { name: task.name ?? 'longtask' },
    })
  },

  recordStorageSnapshot: (snapshot) => {
    set((state) => ({
      storageSnapshots: [{
        ...snapshot,
        id: createPerformanceId('agent_storage'),
        createdAt: new Date().toISOString(),
      }, ...state.storageSnapshots].slice(0, MAX_STORAGE_SNAPSHOTS),
    }))
    get().recordMetric({
      name: 'frontend_agent_storage_total_bytes',
      value: snapshot.totalBytes,
      unit: 'bytes',
    })
    for (const item of snapshot.keys) {
      get().recordMetric({
        name: 'frontend_agent_storage_key_bytes',
        value: item.bytes,
        unit: 'bytes',
        labels: { key: item.key },
      })
    }
  },

  clear: () => set({
    operations: [],
    metrics: [],
    logs: [],
    longTasks: [],
    storageSnapshots: [],
  }),
}))

let agentTelemetrySink: AgentTelemetrySink = createLocalAgentTelemetrySink()

export function setAgentTelemetrySink(sink: AgentTelemetrySink): void {
  agentTelemetrySink = sink
}

export function resetAgentTelemetrySink(): void {
  agentTelemetrySink = createLocalAgentTelemetrySink()
}

export function createLocalAgentTelemetrySink(): AgentTelemetrySink {
  return {
    beginOperation: (input) => useAgentPerformanceStore.getState().beginOperation(input),
    markPhase: (operationId, name, input) => useAgentPerformanceStore.getState().markPhase(operationId, name, input),
    finishOperation: (operationId, status, details) => useAgentPerformanceStore.getState().finishOperation(operationId, status, details),
    recordMetric: (sample) => useAgentPerformanceStore.getState().recordMetric(sample),
    recordLog: (entry) => useAgentPerformanceStore.getState().recordLog(entry),
    recordLongTask: (task) => useAgentPerformanceStore.getState().recordLongTask(task),
    recordStorageSnapshot: (snapshot) => useAgentPerformanceStore.getState().recordStorageSnapshot(snapshot),
  }
}

export function beginAgentPerformanceOperation(input: Parameters<AgentPerformanceStore['beginOperation']>[0]): string {
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

export function captureAgentStorageSnapshot(): AgentPerformanceStorageSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const keys = STORAGE_KEYS_TO_TRACK.map((key) => ({
      key,
      bytes: byteLength(window.localStorage.getItem(key) ?? ''),
    }))
    const snapshot = {
      keys,
      totalBytes: keys.reduce((sum, item) => sum + item.bytes, 0),
    }
    agentTelemetrySink.recordStorageSnapshot(snapshot)
    return {
      ...snapshot,
      id: createPerformanceId('agent_storage'),
      createdAt: new Date().toISOString(),
    }
  } catch (error) {
    recordAgentPerformanceLog({
      level: 'warning',
      message: `读取 Agent 本地存储体积失败：${error instanceof Error ? error.message : String(error)}`,
    })
    return null
  }
}

export function installAgentPerformanceObservers(): void {
  if (typeof window === 'undefined') return
  if (!observerInstalled) {
    observerInstalled = true
    captureAgentStorageSnapshot()
    const PerformanceObserverCtor = window.PerformanceObserver
    if (PerformanceObserverCtor) {
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
        })
      }
    }
  }
  installStorageProbe()
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
    case 'runtime_input': return '运行时输入'
    case 'external_task': return '外部任务'
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
    build_draft_start: '构建发送草稿开始',
    build_draft_done: '构建发送草稿完成',
    preview_ready: '预览就绪',
    commit_start: '提交开始',
    clear_draft_done: '清空输入草稿',
    runtime_loading_set: '运行状态已设置',
    user_message_appended: '用户消息已写入',
    post_commit_frame: '下一帧已提交',
    prepare_runtime_start: '准备 Runtime 开始',
    prepare_runtime_done: '准备 Runtime 完成',
    ensure_runtime_start: '启动 Runtime 开始',
    ensure_runtime_done: '启动 Runtime 完成',
    health_refetch_start: '刷新 Runtime 健康开始',
    health_refetch_done: '刷新 Runtime 健康完成',
    mcp_ready_check_start: '检查 MCP 开始',
    mcp_ready_check_done: '检查 MCP 完成',
    model_config_sync_start: '同步模型配置开始',
    model_config_sync_done: '同步模型配置完成',
    request_start: '请求开始',
    resolve_thread_start: '解析 Thread 开始',
    resolve_thread_done: '解析 Thread 完成',
    create_message_run_start: '创建消息 Run 开始',
    create_message_run_done: '创建消息 Run 完成',
    source_message_accepted: '消息被 Runtime 接收',
    runtime_input_final_thread_start: '运行时输入最终 Thread 开始',
    runtime_input_final_thread_done: '运行时输入最终 Thread 完成',
    run_stream_start: 'Run 流开始',
    run_stream_done_client: '客户端 Run 流完成',
    final_thread_fetch_start: '最终 Thread 读取开始',
    final_thread_fetch_done: '最终 Thread 读取完成',
    first_run_update: '首次 Run 更新',
    first_runtime_event: '首次 Runtime 事件',
    first_assistant_progress: '首次助手进度',
    run_stream_done: 'Run 流结束',
    complete_result_start: '落地结果开始',
    complete_result_done: '落地结果完成',
    optimistic_update: '乐观状态更新',
    approval_request_start: '确认请求开始',
    approval_request_done: '确认请求完成',
    rejection_request_start: '拒绝请求开始',
    rejection_request_done: '拒绝请求完成',
    followup_stream_start: 'Follow-up Run 开始',
    followup_stream_done: 'Follow-up Run 完成',
    final_thread_loaded: '最终 Thread 已读取',
    assistant_result_appended: '助手结果已写入',
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

function installStorageProbe(): void {
  if (storageProbeInstalled || typeof window === 'undefined') return
  try {
    const proto = Object.getPrototypeOf(window.localStorage) as Storage
    originalStorageSetItem = proto.setItem
    proto.setItem = function setItemWithAgentProbe(this: Storage, key: string, value: string) {
      const started = performanceNow()
      try {
        return originalStorageSetItem!.call(this, key, value)
      } finally {
        if (STORAGE_KEYS_TO_TRACK.includes(key as typeof STORAGE_KEYS_TO_TRACK[number])) {
          const durationMs = Math.max(0, performanceNow() - started)
          const bytes = byteLength(value)
          recordAgentPerformanceMetric({
            name: 'frontend_store_persist_duration_ms',
            value: durationMs,
            unit: 'ms',
            labels: { key },
          })
          recordAgentPerformanceMetric({
            name: 'frontend_store_persist_bytes',
            value: bytes,
            unit: 'bytes',
            labels: { key },
          })
          if (durationMs >= 100) {
            recordAgentPerformanceLog({
              level: 'warning',
              message: `${key} 写入较慢：${formatMs(durationMs)}，体积 ${formatBytes(bytes)}`,
              details: { key, durationMs, bytes },
            })
          }
        }
      }
    }
    storageProbeInstalled = true
  } catch (error) {
    recordAgentPerformanceLog({
      level: 'warning',
      message: `安装 localStorage 性能探针失败：${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

function createPerformanceId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function byteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).byteLength
  return value.length * 2
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1))
  return values[index] ?? 0
}
