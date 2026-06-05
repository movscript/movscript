import {
  AGENT_RUNTIME_EVENT_V2_SCHEMA,
  type AgentApprovalRequest,
  type AgentInputRequest,
  type AgentMessage,
  type AgentRun,
  type AgentRuntimeEventV2,
  type AgentRuntimeStatusMessage,
  type AgentThread,
  type RuntimeInteraction,
} from '@movscript/protocol'
import {
  type AgentChatNotification,
  type AgentChatServerRequest,
  type AgentChatThread,
  type AgentChatThreadItem,
  type AgentChatThreadStatus,
  type AgentChatTurn,
  type AgentChatTurnStatus,
} from '@/features/agent/domain/agentChatProtocol'
import {
  agentRuntimeMcpToolFromStep,
  agentChatThreadItemFromAgentMessage,
  agentChatThreadItemFromAgentRunStep,
  agentChatThreadItemsFromAgentRun,
  unresolvableApprovalNoticeItemsFromAgentRun,
} from '@/shared/infrastructure/local-agent-client/agentRuntimeChatThreadItems'
import {
  AGENT_RUNTIME_CHAT_RUNTIME_STATUS_KIND_COVERAGE,
  AGENT_RUNTIME_CHAT_STATUS_LIGHT_STATE_COVERAGE,
  AGENT_RUNTIME_CHAT_TRACE_STATUS_COVERAGE,
  type AgentRuntimeChatNoticeLevel,
} from '@/shared/infrastructure/local-agent-client/agentRuntimeChatCapabilityCoverage'
import { AGENT_RUNTIME_CHAT_THREAD_STATUS_COVERAGE } from '@/shared/infrastructure/local-agent-client/agentRuntimeChatThreadCoverage'

export function agentChatThreadFromMovScriptAgent(input: {
  thread: AgentThread
  runs?: AgentRun[]
}): AgentChatThread {
  const turns = agentChatTurnsFromMovScriptAgent({
    threadId: input.thread.id,
    messages: input.thread.messages,
    runs: input.runs ?? [],
  })
  return {
    provider: 'movscript',
    id: input.thread.id,
    sessionId: input.thread.sessionId || input.thread.id,
    preview: input.thread.messages.find((message) => message.role === 'user')?.content || input.thread.title || '',
    name: input.thread.title ?? null,
    createdAt: unixSeconds(input.thread.createdAt),
    updatedAt: unixSeconds(input.thread.updatedAt),
    status: agentChatThreadStatusFromMovScript(input.thread.status),
    turns,
    raw: input.thread,
  }
}

export function agentChatTurnsFromMovScriptAgent(input: {
  threadId: string
  messages: AgentMessage[]
  runs?: AgentRun[]
}): AgentChatTurn[] {
  const runsById = new Map((input.runs ?? []).map((run) => [run.id, run]))
  const turnIds: string[] = []
  const messagesByTurn = new Map<string, AgentMessage[]>()
  for (const message of input.messages) {
    const turnId = message.runId?.trim() || `message:${message.id}`
    if (!messagesByTurn.has(turnId)) {
      turnIds.push(turnId)
      messagesByTurn.set(turnId, [])
    }
    messagesByTurn.get(turnId)?.push(message)
  }
  for (const run of input.runs ?? []) {
    if (!messagesByTurn.has(run.id)) {
      turnIds.push(run.id)
      messagesByTurn.set(run.id, [])
    }
  }
  return turnIds.map((turnId) => {
    const run = runsById.get(turnId)
    const messages = messagesByTurn.get(turnId) ?? []
    const items = [
      ...messages.map(agentChatThreadItemFromAgentMessage),
      ...(run ? agentChatThreadItemsFromAgentRun(run) : []),
    ]
    return agentChatTurnFromMovScriptRun({
      threadId: input.threadId,
      turnId,
      run,
      items,
      fallbackStartedAt: messages[0]?.createdAt,
      fallbackCompletedAt: messages.at(-1)?.createdAt,
    })
  })
}

export function agentChatTurnFromMovScriptRun(input: {
  threadId: string
  turnId: string
  run?: AgentRun
  items?: AgentChatThreadItem[]
  fallbackStartedAt?: string
  fallbackCompletedAt?: string
}): AgentChatTurn {
  return {
    id: input.turnId,
    items: input.items ?? [],
    itemsView: 'full',
    status: agentChatTurnStatusFromMovScript(input.run?.status),
    error: input.run?.error ? { message: input.run.error } : null,
    startedAt: input.run?.startedAt ? unixSeconds(input.run.startedAt) : input.fallbackStartedAt ? unixSeconds(input.fallbackStartedAt) : null,
    completedAt: input.run?.completedAt ? unixSeconds(input.run.completedAt) : input.fallbackCompletedAt ? unixSeconds(input.fallbackCompletedAt) : null,
    durationMs: durationMs(input.run?.startedAt, input.run?.completedAt),
    raw: input.run,
  }
}

export function agentChatNotificationFromMovScriptRuntimeEvent(event: AgentRuntimeEventV2): AgentChatNotification | null {
  if (event.schema !== AGENT_RUNTIME_EVENT_V2_SCHEMA) return null
  const threadId = event.causality?.threadId
  const runId = event.causality?.runId
  if (event.kind === 'thread.upserted' && event.entity?.type === 'thread') {
    const thread = event.entity.value
    return {
      method: 'thread/metadata/updated',
      params: {
        threadId: thread.id || threadId,
        threadName: thread.title ?? null,
        preview: thread.messages.find((message) => message.role === 'user')?.content || thread.title || '',
        status: agentChatThreadStatusFromMovScript(thread.status),
        updatedAt: unixSeconds(thread.updatedAt),
      },
      raw: event,
    }
  }
  if (event.kind === 'run.upserted' && event.entity?.type === 'run') {
    return {
      method: isTerminalRunStatus(event.entity.value.status) ? 'turn/completed' : 'turn/started',
      params: {
        threadId: event.entity.value.threadId || threadId,
        turn: agentChatTurnFromMovScriptRun({
          threadId: event.entity.value.threadId || threadId || '',
          turnId: event.entity.value.id,
          run: event.entity.value,
          items: agentChatThreadItemsFromAgentRun(event.entity.value),
        }),
      },
      raw: event,
    }
  }
  if (event.kind === 'message.upserted' && event.entity?.type === 'message') {
    return {
      method: 'item/completed',
      params: {
        threadId: event.entity.value.threadId || threadId,
        turnId: event.entity.value.runId || runId || `message:${event.entity.value.id}`,
        item: agentChatThreadItemFromAgentMessage(event.entity.value),
      },
      raw: event,
    }
  }
  if (event.kind === 'step.upserted' && event.entity?.type === 'step') {
    return {
      method: event.entity.value.status === 'in_progress' ? 'item/started' : 'item/completed',
      params: {
        threadId,
        turnId: event.entity.value.runId || runId,
        item: agentChatThreadItemFromAgentRunStep(event.entity.value.runId || runId || '', event.entity.value),
      },
      raw: event,
    }
  }
  if (event.kind === 'assistant.progress' && event.assistantProgress) {
    return {
      method: 'item/agentMessage/delta',
      params: {
        threadId,
        turnId: event.assistantProgress.runId,
        itemId: event.assistantProgress.traceId,
        delta: event.assistantProgress.delta,
      },
      raw: event,
    }
  }
  if (event.kind === 'plan.upserted' && event.entity?.type === 'plan') {
    const plan = event.entity.value
    return {
      method: 'turn/plan/updated',
      params: {
        threadId: plan.threadId || threadId,
        turnId: plan.runId || runId || `plan:${plan.id}`,
        explanation: plan.explanation ?? null,
        plan: plan.items,
      },
      raw: event,
    }
  }
  if (event.kind === 'plan_revision.upserted' && event.entity?.type === 'plan_revision') {
    const revision = event.entity.value
    const plan = revision.snapshot
    return {
      method: 'turn/plan/updated',
      params: {
        threadId: revision.threadId || plan.threadId || threadId,
        turnId: revision.runId || plan.runId || runId || `plan:${revision.planId}`,
        explanation: revision.explanation ?? plan.explanation ?? null,
        plan: plan.items,
      },
      raw: event,
    }
  }
  if (event.kind === 'runtime_status.upserted' && event.entity?.type === 'runtime_status') {
    const status = event.entity.value
    return {
      method: 'runtime/status/updated',
      event: {
        type: 'systemNotice',
        level: runtimeStatusNoticeLevel(status.status),
        id: `runtime-status:${status.id}`,
        code: 'runtime_status.upserted',
        threadId: status.threadId || threadId,
        title: runtimeStatusNoticeTitle(status.status),
        detail: status.content || runtimeStatusNoticeDetail(status.status),
        raw: event,
      },
      raw: event,
    }
  }
  if (event.kind === 'interaction.upserted' && event.entity?.type === 'interaction') {
    const interaction = event.entity.value
    if (interaction.status === 'pending') return null
    return {
      method: 'serverRequest/resolved',
      event: {
        type: 'serverRequestResolved',
        threadId: interaction.displayThreadId ?? interaction.threadId ?? threadId,
        requestId: agentChatServerRequestIdFromMovScriptInteraction(interaction),
        raw: event,
      },
      raw: event,
    }
  }
  if (event.kind === 'trace.upserted' && event.entity?.type === 'trace') {
    const trace = event.entity.value
    return {
      method: 'runtime/trace/updated',
      event: {
        type: 'systemNotice',
        level: AGENT_RUNTIME_CHAT_TRACE_STATUS_COVERAGE[trace.status].noticeLevel,
        id: `runtime-trace:${trace.id}`,
        code: 'trace.upserted',
        threadId,
        title: trace.title || `Trace ${trace.kind}`,
        detail: runtimeTraceNoticeDetail(trace),
        raw: event,
      },
      raw: event,
    }
  }
  return null
}

export function agentChatServerRequestsFromMovScriptRun(run: AgentRun): AgentChatServerRequest[] {
  return [
    ...(run.pendingApprovals ?? [])
      .filter(isResolvableMovScriptApprovalRequest)
      .map((approval) => agentChatServerRequestFromMovScriptApproval(run, approval)),
    ...(run.pendingInputRequests ?? [])
      .filter((input) => input.status === 'pending')
      .map((input) => agentChatServerRequestFromMovScriptInput(run, input)),
  ]
}

export function agentChatNotificationsFromMovScriptRunMissingInteractionApprovals(run: AgentRun): AgentChatNotification[] {
  return unresolvableApprovalNoticeItemsFromAgentRun(run).map((item) => ({
    method: 'item/completed',
    params: {
      threadId: run.threadId,
      turnId: run.id,
      item,
    },
    raw: item.raw,
  }))
}

function isResolvableMovScriptApprovalRequest(approval: AgentApprovalRequest): boolean {
  return approval.status === 'pending' && Boolean(approval.interactionId?.trim())
}

export function agentChatServerRequestsFromMovScriptInteraction(interaction: RuntimeInteraction): AgentChatServerRequest[] {
  if (interaction.status !== 'pending') return []
  if (interaction.kind === 'approval') return [agentChatServerRequestFromMovScriptApprovalInteraction(interaction)]
  if (interaction.kind === 'input' || interaction.kind === 'selection') return [agentChatServerRequestFromMovScriptInputInteraction(interaction)]
  return []
}

export function agentChatServerRequestsFromMovScriptMcpToolStepEvent(event: AgentRuntimeEventV2): AgentChatServerRequest[] {
  if (event.schema !== AGENT_RUNTIME_EVENT_V2_SCHEMA) return []
  if (event.kind !== 'step.upserted' || event.entity?.type !== 'step') return []
  const step = event.entity.value
  if (step.type !== 'tool_call' || step.status !== 'in_progress') return []
  const interactionId = event.causality?.interactionId?.trim()
  if (!interactionId) return []
  const mcpTool = agentRuntimeMcpToolFromStep(step)
  if (!mcpTool) return []
  return [{
    id: interactionId,
    method: 'item/permissions/requestApproval',
    threadId: event.causality?.threadId,
    turnId: step.runId || event.causality?.runId,
    itemId: step.id,
    params: {
      reason: `Allow MCP tool execution: ${mcpTool.tool}`,
      action: {
        type: 'mcpToolCall',
        server: mcpTool.server,
        toolName: mcpTool.tool,
        connectorId: mcpTool.pluginId,
      },
      toolName: mcpTool.tool,
      args: step.args,
      interactionId,
      status: 'pending',
    },
    raw: event,
  }]
}

function agentChatServerRequestFromMovScriptApproval(run: AgentRun, approval: AgentApprovalRequest): AgentChatServerRequest {
  return {
    id: approval.id,
    method: 'item/permissions/requestApproval',
    threadId: approval.displayThreadId ?? approval.displayAnchor?.threadId ?? run.threadId,
    turnId: approval.displayAnchor?.runId ?? run.id,
    itemId: approval.id,
    params: {
      reason: approval.reason,
      action: approval.toolName,
      toolName: approval.toolName,
      args: approval.args,
      preview: approval.preview,
      interactionId: approval.interactionId,
      risk: approval.risk,
      permission: approval.permission,
      status: approval.status,
    },
    raw: approval,
  }
}

function agentChatServerRequestFromMovScriptApprovalInteraction(interaction: RuntimeInteraction): AgentChatServerRequest {
  const payload = isRecord(interaction.payload) ? interaction.payload : {}
  const approvalId = agentChatServerRequestIdFromMovScriptInteraction(interaction)
  const toolName = readString(payload, 'toolName') ?? readString(payload, 'action')
  return {
    id: approvalId,
    method: 'item/permissions/requestApproval',
    threadId: interaction.displayThreadId ?? interaction.displayAnchor?.threadId ?? interaction.threadId,
    turnId: interaction.displayAnchor?.runId ?? interaction.originRunId ?? interaction.runId,
    itemId: approvalId,
    params: {
      reason: readString(payload, 'reason') ?? 'Approval required',
      action: toolName,
      toolName,
      args: payload.args,
      preview: payload.preview,
      interactionId: interaction.id,
      risk: readString(payload, 'risk'),
      permission: readString(payload, 'permission'),
      status: interaction.status,
    },
    raw: interaction,
  }
}

function agentChatServerRequestFromMovScriptInput(run: AgentRun, input: AgentInputRequest): AgentChatServerRequest {
  return {
    id: input.id,
    method: 'item/tool/requestUserInput',
    threadId: input.displayThreadId ?? input.displayAnchor?.threadId ?? run.threadId,
    turnId: input.displayAnchor?.runId ?? run.id,
    params: input,
    raw: input,
  }
}

function agentChatServerRequestFromMovScriptInputInteraction(interaction: RuntimeInteraction): AgentChatServerRequest {
  const payload = isRecord(interaction.payload) ? interaction.payload : {}
  const requestId = agentChatServerRequestIdFromMovScriptInteraction(interaction)
  const inputType = agentInputTypeFromUnknown(payload.inputType) ?? (interaction.kind === 'selection' ? 'choice' : 'text')
  const choices = agentInputChoicesFromUnknown(payload.choices)
  return {
    id: requestId,
    method: 'item/tool/requestUserInput',
    threadId: interaction.displayThreadId ?? interaction.displayAnchor?.threadId ?? interaction.threadId,
    turnId: interaction.displayAnchor?.runId ?? interaction.originRunId ?? interaction.runId,
    params: {
      id: requestId,
      runId: interaction.runId,
      title: readString(payload, 'title') ?? (interaction.kind === 'selection' ? 'Select an option' : 'Input required'),
      summary: readString(payload, 'summary'),
      question: readString(payload, 'question') ?? readString(payload, 'prompt') ?? 'Provide input to continue.',
      inputType,
      choices,
      allowCustomAnswer: typeof payload.allowCustomAnswer === 'boolean' ? payload.allowCustomAnswer : inputType !== 'choice',
      status: interaction.status,
      interactionId: interaction.id,
    },
    raw: interaction,
  }
}

function agentChatServerRequestIdFromMovScriptInteraction(interaction: RuntimeInteraction): string {
  const payload = isRecord(interaction.payload) ? interaction.payload : {}
  if (interaction.kind === 'approval') {
    return readString(payload, 'approvalId') ?? readString(payload, 'id') ?? interaction.id
  }
  return readString(payload, 'requestId') ?? readString(payload, 'inputId') ?? readString(payload, 'id') ?? interaction.id
}

function agentChatThreadStatusFromMovScript(status: AgentThread['status'] | undefined): AgentChatThreadStatus {
  return status ? AGENT_RUNTIME_CHAT_THREAD_STATUS_COVERAGE[status].neutralThreadStatus : 'idle'
}

function agentChatTurnStatusFromMovScript(status: AgentRun['status'] | undefined): AgentChatTurnStatus {
  if (status === 'completed' || status === 'completed_with_warnings') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'interrupted'
  return 'inProgress'
}

function isTerminalRunStatus(status: AgentRun['status']): boolean {
  return status === 'completed' || status === 'completed_with_warnings' || status === 'failed' || status === 'cancelled'
}

function runtimeStatusNoticeTitle(status: AgentRuntimeStatusMessage | undefined): string {
  if (!status) return 'Runtime status'
  if (status.kind === 'async_work_handoff') {
    const coverage = AGENT_RUNTIME_CHAT_RUNTIME_STATUS_KIND_COVERAGE[status.kind]
    return coverage.titleSource === 'title' ? status.title || 'Async work handoff' : 'Async work handoff'
  }
  const coverage = AGENT_RUNTIME_CHAT_RUNTIME_STATUS_KIND_COVERAGE[status.kind]
  if (coverage.titleSource === 'label') return status.label || 'Runtime status'
  return status.label || 'Runtime status'
}

function runtimeStatusNoticeDetail(status: AgentRuntimeStatusMessage | undefined): string | null {
  if (!status) return null
  if (status.kind === 'async_work_handoff') {
    const coverage = AGENT_RUNTIME_CHAT_RUNTIME_STATUS_KIND_COVERAGE[status.kind]
    if (coverage.detailSource === 'detail-work') return [status.detail, status.workKind, status.workStatus].filter(Boolean).join('\n') || null
    return status.detail || null
  }
  const coverage = AGENT_RUNTIME_CHAT_RUNTIME_STATUS_KIND_COVERAGE[status.kind]
  if (coverage.detailSource === 'detail-state') return status.detail || status.state || null
  return status.detail || status.state || null
}

function runtimeStatusNoticeLevel(status: AgentRuntimeStatusMessage | undefined): AgentRuntimeChatNoticeLevel {
  if (!status) return 'info'
  if (status.kind === 'status_light') return AGENT_RUNTIME_CHAT_STATUS_LIGHT_STATE_COVERAGE[status.state].noticeLevel
  return AGENT_RUNTIME_CHAT_RUNTIME_STATUS_KIND_COVERAGE[status.kind].defaultNoticeLevel
}

function runtimeTraceNoticeDetail(trace: { kind?: string; summary?: string; status?: string; roundId?: string; roundIndex?: number; roundLabel?: string; roundSource?: string; toolName?: string; stepId?: string; durationMs?: number; data?: unknown }): string | null {
  return [
    trace.summary,
    trace.kind ? `kind: ${trace.kind}` : '',
    trace.status ? `status: ${trace.status}` : '',
    trace.roundLabel ? `round: ${trace.roundLabel}` : '',
    trace.roundIndex !== undefined ? `round index: ${trace.roundIndex}` : '',
    trace.roundId ? `round id: ${trace.roundId}` : '',
    trace.roundSource ? `round source: ${trace.roundSource}` : '',
    trace.toolName ? `tool: ${trace.toolName}` : '',
    trace.stepId ? `step: ${trace.stepId}` : '',
    trace.durationMs !== undefined ? `duration: ${trace.durationMs}ms` : '',
    trace.data !== undefined ? `data: ${agentChatRuntimeValuePreview(trace.data)}` : '',
  ].filter(Boolean).join('\n') || null
}

function agentChatRuntimeValuePreview(value: unknown): string {
  try {
    const preview = JSON.stringify(value)
    if (!preview) return ''
    return preview.length > 300 ? `${preview.slice(0, 300)}...` : preview
  } catch {
    return String(value)
  }
}

function unixSeconds(value: string): number {
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0
}

function agentInputTypeFromUnknown(value: unknown): AgentInputRequest['inputType'] | undefined {
  return value === 'choice' || value === 'text' || value === 'confirmation' ? value : undefined
}

function agentInputChoicesFromUnknown(value: unknown): AgentInputRequest['choices'] {
  if (!Array.isArray(value)) return []
  return value
    .map((choice) => {
      if (!isRecord(choice)) return null
      const id = readString(choice, 'id')
      const label = readString(choice, 'label')
      if (!id || !label) return null
      return {
        id,
        label,
        ...(readString(choice, 'description') ? { description: readString(choice, 'description') } : {}),
      }
    })
    .filter((choice): choice is AgentInputRequest['choices'][number] => Boolean(choice))
}

function readString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function durationMs(startedAt: string | undefined, completedAt: string | undefined): number | null {
  if (!startedAt || !completedAt) return null
  const started = Date.parse(startedAt)
  const completed = Date.parse(completedAt)
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return null
  return Math.max(0, completed - started)
}
