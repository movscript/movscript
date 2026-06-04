import {
  AGENT_RUNTIME_EVENT_V2_SCHEMA,
  type AgentApprovalRequest,
  type AgentInputRequest,
  type AgentMessage,
  type AgentRun,
  type AgentRunStep,
  type AgentRuntimeEventV2,
  type AgentThread,
} from '@movscript/protocol'
import {
  agentChatTextInput,
  type AgentChatNotification,
  type AgentChatServerRequest,
  type AgentChatThread,
  type AgentChatThreadItem,
  type AgentChatThreadStatus,
  type AgentChatTurn,
  type AgentChatTurnStatus,
} from '@/features/agent/domain/agentChatProtocol'

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
      ...messages.map(agentChatThreadItemFromMovScriptMessage),
      ...(run ? agentChatThreadItemsFromMovScriptRun(run) : []),
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

export function agentChatThreadItemFromMovScriptMessage(message: AgentMessage): AgentChatThreadItem {
  if (message.role === 'user') {
    return {
      type: 'userMessage',
      id: message.id,
      clientId: stringMetadata(message.metadata?.clientUserMessageId) ?? message.id,
      content: [agentChatTextInput(message.content)],
      raw: message,
    }
  }
  if (message.role === 'assistant') {
    return {
      type: 'agentMessage',
      id: message.id,
      text: message.content,
      phase: null,
      memoryCitation: null,
      raw: message,
    }
  }
  return {
    type: 'unknown',
    id: message.id,
    providerType: 'systemMessage',
    raw: message,
  }
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
  if (event.kind === 'run.upserted' && event.entity?.type === 'run') {
    return {
      method: isTerminalRunStatus(event.entity.value.status) ? 'turn/completed' : 'turn/started',
      params: {
        threadId: event.entity.value.threadId || threadId,
        turn: agentChatTurnFromMovScriptRun({
          threadId: event.entity.value.threadId || threadId || '',
          turnId: event.entity.value.id,
          run: event.entity.value,
          items: agentChatThreadItemsFromMovScriptRun(event.entity.value),
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
        item: agentChatThreadItemFromMovScriptMessage(event.entity.value),
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
  return null
}

export function agentChatServerRequestsFromMovScriptRun(run: AgentRun): AgentChatServerRequest[] {
  return [
    ...(run.pendingApprovals ?? []).map((approval) => agentChatServerRequestFromMovScriptApproval(run, approval)),
    ...(run.pendingInputRequests ?? []).map((input) => agentChatServerRequestFromMovScriptInput(run, input)),
  ]
}

function agentChatServerRequestFromMovScriptApproval(run: AgentRun, approval: AgentApprovalRequest): AgentChatServerRequest {
  return {
    id: approval.id,
    method: 'item/permissions/requestApproval',
    threadId: run.threadId,
    turnId: run.id,
    itemId: approval.id,
    params: {
      reason: approval.reason,
      action: approval.toolName,
      toolName: approval.toolName,
      interactionId: approval.interactionId,
      risk: approval.risk,
      permission: approval.permission,
      status: approval.status,
    },
    raw: approval,
  }
}

function agentChatServerRequestFromMovScriptInput(run: AgentRun, input: AgentInputRequest): AgentChatServerRequest {
  return {
    id: input.id,
    method: 'item/tool/requestUserInput',
    threadId: run.threadId,
    turnId: run.id,
    params: input,
    raw: input,
  }
}

function agentChatThreadItemsFromMovScriptRun(run: AgentRun): AgentChatThreadItem[] {
  return run.steps.map((step) => agentChatThreadItemFromMovScriptStep(run, step))
}

function agentChatThreadItemFromMovScriptStep(run: AgentRun, step: AgentRunStep): AgentChatThreadItem {
  if (step.type === 'message') {
    return {
      type: 'reasoning',
      id: step.id,
      summary: step.title ? [step.title] : [],
      content: typeof step.result === 'string' ? [step.result] : [],
      raw: step,
    }
  }
  return {
    type: 'dynamicToolCall',
    id: step.id,
    namespace: null,
    tool: step.toolName || step.title || 'tool',
    status: step.status,
    success: step.status === 'completed' ? true : step.status === 'failed' ? false : null,
    raw: { runId: run.id, step },
  }
}

function agentChatThreadStatusFromMovScript(status: AgentThread['status'] | undefined): AgentChatThreadStatus {
  if (status === 'running' || status === 'requires_action') return 'running'
  if (status === 'failed') return 'failed'
  if (status === 'completed') return 'completed'
  if (status === 'cancelled') return 'cancelled'
  return 'idle'
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

function unixSeconds(value: string): number {
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0
}

function durationMs(startedAt: string | undefined, completedAt: string | undefined): number | null {
  if (!startedAt || !completedAt) return null
  const started = Date.parse(startedAt)
  const completed = Date.parse(completedAt)
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return null
  return Math.max(0, completed - started)
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
