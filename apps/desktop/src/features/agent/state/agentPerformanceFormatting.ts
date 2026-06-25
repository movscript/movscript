import type {
  AgentPerformanceMetricSample,
  AgentPerformanceOperation,
  AgentPerformanceOperationKind,
  AgentPerformancePhase,
} from '@/features/agent/state/agentPerformanceTypes'

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
    provider_session_thread_start_request_start: 'Provider Session Thread 创建请求开始',
    provider_session_thread_start_request_done: 'Provider Session Thread 创建请求完成',
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

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * percentileValue) - 1))
  return values[index] ?? 0
}
