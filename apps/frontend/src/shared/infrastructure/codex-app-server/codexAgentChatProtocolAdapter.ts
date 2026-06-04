import type {
  AgentChatInput,
  AgentChatNotification,
  AgentChatNotificationEvent,
  AgentChatServerRequest,
  AgentChatServerRequestResponse,
  AgentChatThread,
  AgentChatThreadItem,
  AgentChatThreadStatus,
  AgentChatTurn,
  AgentChatTurnItemsView,
  AgentChatTurnStatus,
} from '@/features/agent/domain/agentChatProtocol'
import type {
  CodexJsonRpcNotification,
  CodexJsonRpcServerRequest,
  CodexThread,
  CodexThreadItem,
  CodexTurn,
  CodexUserInput,
} from '@/shared/infrastructure/codex-app-server/codexAppServerProtocol'

export function agentChatNotificationFromCodex(notification: CodexJsonRpcNotification): AgentChatNotification {
  const params = normalizeCodexNotificationParams(notification)
  return {
    method: notification.method,
    params,
    event: agentChatNotificationEventFromCodex(notification),
    raw: notification,
  }
}

export function agentChatServerRequestFromCodex(request: CodexJsonRpcServerRequest): AgentChatServerRequest {
  const params = isRecord(request.params) ? request.params : {}
  return {
    id: String(request.id),
    method: request.method,
    threadId: stringField(params.threadId),
    turnId: stringField(params.turnId),
    itemId: stringField(params.itemId),
    params: request.params,
    raw: request,
  }
}

export function codexServerRequestResponseFromAgentChat(
  request: AgentChatServerRequest,
  response: AgentChatServerRequestResponse,
): unknown {
  if (request.method === 'mcpServer/elicitation/request') {
    return {
      action: response.action === 'elicitation' && response.accepted ? 'accept' : response.action === 'elicitation' ? 'decline' : response.action === 'approve' ? 'accept' : 'decline',
      content: response.action === 'elicitation' ? response.content ?? null : null,
      _meta: response.action === 'elicitation' ? response.meta ?? null : null,
    }
  }
  if (request.method === 'item/permissions/requestApproval') {
    if (response.action !== 'approve') return { permissions: {}, scope: 'turn', strictAutoReview: true }
    return {
      permissions: response.permissions ?? {},
      scope: response.scope ?? 'turn',
      strictAutoReview: response.strictAutoReview ?? false,
    }
  }
  if (request.method === 'item/tool/requestUserInput') {
    return {
      answers: response.action === 'answer' ? response.answers ?? {} : {},
    }
  }
  if (request.method === 'item/tool/call') {
    return {
      contentItems: response.action === 'toolResult' ? response.contentItems ?? [] : [],
      success: response.action === 'toolResult' ? response.success : false,
    }
  }
  if (request.method === 'item/commandExecution/requestApproval' || request.method === 'item/fileChange/requestApproval') {
    return { decision: response.action === 'approve' ? 'accept' : 'decline' }
  }
  return response.action === 'approve' ? { decision: 'accept' } : { decision: 'decline' }
}

export function agentChatThreadFromCodex(thread: CodexThread): AgentChatThread {
  return {
    provider: 'codex',
    id: thread.id,
    sessionId: thread.sessionId || thread.id,
    preview: thread.preview || '',
    name: thread.name,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    status: agentChatThreadStatusFromCodex(thread.status),
    turns: thread.turns.map(agentChatTurnFromCodex),
    raw: thread,
  }
}

export function agentChatTurnFromCodex(turn: Partial<CodexTurn> & Pick<CodexTurn, 'id'>): AgentChatTurn {
  return {
    id: turn.id,
    items: (turn.items ?? []).map(agentChatThreadItemFromCodex),
    itemsView: agentChatTurnItemsViewFromCodex(turn.itemsView),
    status: agentChatTurnStatusFromCodex(turn.status),
    error: turn.error ?? null,
    startedAt: turn.startedAt ?? null,
    completedAt: turn.completedAt ?? null,
    durationMs: turn.durationMs ?? null,
    raw: turn,
  }
}

export function agentChatThreadItemFromCodex(item: CodexThreadItem): AgentChatThreadItem {
  switch (item.type) {
    case 'userMessage':
      return {
        type: 'userMessage',
        id: item.id,
        clientId: item.clientId,
        content: item.content.map(agentChatInputFromCodex),
        raw: item,
      }
    case 'agentMessage':
      return {
        type: 'agentMessage',
        id: item.id,
        text: item.text,
        phase: item.phase,
        memoryCitation: item.memoryCitation,
        raw: item,
      }
    case 'plan':
      return { type: 'plan', id: item.id, text: item.text, raw: item }
    case 'reasoning':
      return { type: 'reasoning', id: item.id, summary: item.summary, content: item.content, raw: item }
    case 'commandExecution':
      return {
        type: 'commandExecution',
        id: item.id,
        command: item.command,
        cwd: String(item.cwd),
        status: String(item.status),
        aggregatedOutput: item.aggregatedOutput,
        exitCode: item.exitCode,
        durationMs: item.durationMs,
        raw: item,
      }
    case 'fileChange':
      return { type: 'fileChange', id: item.id, status: String(item.status), changes: item.changes, raw: item }
    case 'mcpToolCall':
      return {
        type: 'mcpToolCall',
        id: item.id,
        server: item.server,
        tool: item.tool,
        status: String(item.status),
        result: item.result,
        error: item.error,
        raw: item,
      }
    case 'dynamicToolCall':
      return {
        type: 'dynamicToolCall',
        id: item.id,
        namespace: item.namespace,
        tool: item.tool,
        status: String(item.status),
        success: item.success,
        raw: item,
      }
    case 'webSearch':
      return { type: 'webSearch', id: item.id, query: item.query, action: item.action, raw: item }
    case 'imageView':
      return { type: 'imageView', id: item.id, path: String(item.path), raw: item }
    case 'imageGeneration':
      return {
        type: 'imageGeneration',
        id: item.id,
        status: item.status,
        result: item.result,
        savedPath: item.savedPath ? String(item.savedPath) : undefined,
        raw: item,
      }
    case 'enteredReviewMode':
      return { type: 'reviewMode', id: item.id, action: 'entered', review: item.review, raw: item }
    case 'exitedReviewMode':
      return { type: 'reviewMode', id: item.id, action: 'exited', review: item.review, raw: item }
    case 'contextCompaction':
      return { type: 'contextCompaction', id: item.id, raw: item }
    default:
      return {
        type: 'unknown',
        id: stringField((item as Record<string, unknown>).id) ?? `unknown_${String((item as Record<string, unknown>).type)}`,
        providerType: stringField((item as Record<string, unknown>).type) ?? 'unknown',
        raw: item,
      }
  }
}

export function codexUserInputFromAgentChat(input: AgentChatInput): CodexUserInput {
  if (input.type === 'text') return { type: 'text', text: input.text, text_elements: input.textElements as never[] }
  if (input.type === 'image') return { type: 'image', url: input.url, detail: input.detail } as CodexUserInput
  if (input.type === 'localImage') return { type: 'localImage', path: input.path, detail: input.detail } as CodexUserInput
  if (input.type === 'skill') return { type: 'skill', name: input.name, path: input.path }
  return { type: 'mention', name: input.name, path: input.path }
}

function agentChatInputFromCodex(input: CodexUserInput): AgentChatInput {
  if (input.type === 'text') return { type: 'text', text: input.text, textElements: input.text_elements }
  if (input.type === 'image') return { type: 'image', url: input.url, detail: input.detail }
  if (input.type === 'localImage') return { type: 'localImage', path: input.path, detail: input.detail }
  if (input.type === 'skill') return { type: 'skill', name: input.name, path: input.path }
  return { type: 'mention', name: input.name, path: input.path }
}

function agentChatThreadStatusFromCodex(status: CodexThread['status']): AgentChatThreadStatus {
  if (status.type === 'notLoaded') return 'notLoaded'
  if (status.type === 'idle') return 'idle'
  if (status.type === 'systemError') return 'failed'
  if (status.type === 'active') return 'running'
  return 'unknown'
}

function agentChatTurnStatusFromCodex(status: CodexTurn['status'] | undefined): AgentChatTurnStatus {
  return status ?? 'inProgress'
}

function agentChatTurnItemsViewFromCodex(itemsView: CodexTurn['itemsView'] | undefined): AgentChatTurnItemsView {
  if (itemsView === 'notLoaded' || itemsView === 'summary' || itemsView === 'full') return itemsView
  return 'full'
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeCodexNotificationParams(notification: CodexJsonRpcNotification): unknown {
  if (!isRecord(notification.params)) return notification.params
  if (notification.method === 'thread/started' && isRecord(notification.params.thread)) {
    return {
      ...notification.params,
      thread: agentChatThreadFromCodex(notification.params.thread as never),
    }
  }
  if (notification.method === 'thread/status/changed' && isRecord(notification.params.status)) {
    return {
      ...notification.params,
      status: agentChatThreadStatusFromCodex(notification.params.status as CodexThread['status']),
    }
  }
  if ((notification.method === 'turn/started' || notification.method === 'turn/completed') && isRecord(notification.params.turn)) {
    return {
      ...notification.params,
      turn: agentChatTurnFromCodex(notification.params.turn as never),
    }
  }
  if (notification.method === 'item/completed' && isRecord(notification.params.item)) {
    return {
      ...notification.params,
      item: agentChatThreadItemFromCodex(notification.params.item as never),
    }
  }
  return notification.params
}

function agentChatNotificationEventFromCodex(notification: CodexJsonRpcNotification): AgentChatNotificationEvent | undefined {
  const params = isRecord(notification.params) ? notification.params : {}
  if (notification.method === 'thread/archived' || notification.method === 'thread/unarchived' || notification.method === 'thread/closed') {
    const threadId = stringField(params.threadId)
    if (!threadId) return undefined
    return {
      type: 'threadLifecycle',
      action: notification.method === 'thread/archived' ? 'archived' : notification.method === 'thread/unarchived' ? 'unarchived' : 'closed',
      threadId,
      raw: notification,
    }
  }
  if (notification.method === 'serverRequest/resolved') {
    const requestId = requestIdField(params.requestId)
    if (!requestId) return undefined
    return {
      type: 'serverRequestResolved',
      threadId: stringField(params.threadId),
      requestId,
      raw: notification,
    }
  }
  if (notification.method === 'command/exec/outputDelta') {
    const processId = stringField(params.processId)
    const stream = stringField(params.stream)
    const deltaBase64 = stringField(params.deltaBase64)
    if (!processId || !stream || !deltaBase64) return undefined
    return {
      type: 'commandOutput',
      processId,
      stream,
      deltaBase64,
      text: decodeBase64Utf8(deltaBase64),
      capReached: params.capReached === true,
      raw: notification,
    }
  }
  if (notification.method === 'process/outputDelta') {
    const processHandle = stringField(params.processHandle)
    const stream = stringField(params.stream)
    const deltaBase64 = stringField(params.deltaBase64)
    if (!processHandle || !stream || !deltaBase64) return undefined
    return {
      type: 'processOutput',
      processHandle,
      stream,
      deltaBase64,
      text: decodeBase64Utf8(deltaBase64),
      capReached: params.capReached === true,
      raw: notification,
    }
  }
  if (notification.method === 'process/exited') {
    const processHandle = stringField(params.processHandle)
    const exitCode = numberField(params.exitCode)
    if (!processHandle || exitCode === undefined) return undefined
    return {
      type: 'processExited',
      processHandle,
      exitCode,
      stdout: stringField(params.stdout) ?? '',
      stderr: stringField(params.stderr) ?? '',
      stdoutCapReached: params.stdoutCapReached === true,
      stderrCapReached: params.stderrCapReached === true,
      raw: notification,
    }
  }
  if (notification.method === 'fs/changed') {
    const watchId = stringField(params.watchId)
    const changedPaths = Array.isArray(params.changedPaths) ? params.changedPaths.filter((path): path is string => typeof path === 'string') : []
    if (!watchId) return undefined
    return {
      type: 'fsChanged',
      watchId,
      changedPaths,
      raw: notification,
    }
  }
  if (notification.method.startsWith('thread/realtime/')) {
    return realtimeEventFromCodex(notification, params)
  }
  if (notification.method === 'account/updated' || notification.method === 'account/rateLimits/updated' || notification.method === 'account/login/completed') {
    return {
      type: 'account',
      event: notification.method === 'account/updated' ? 'updated' : notification.method === 'account/rateLimits/updated' ? 'rateLimitsUpdated' : 'loginCompleted',
      detail: notification.params,
      raw: notification,
    }
  }
  if (notification.method === 'mcpServer/startupStatus/updated') {
    const server = stringField(params.name)
    if (!server) return undefined
    return {
      type: 'mcpStatus',
      server,
      status: agentChatStringPreview(params.status),
      error: stringField(params.error) ?? null,
      raw: notification,
    }
  }
  if (notification.method === 'warning' || notification.method === 'guardianWarning') {
    const title = stringField(params.message)
    if (!title) return undefined
    return {
      type: 'systemNotice',
      level: 'warning',
      code: notification.method,
      threadId: stringField(params.threadId),
      title,
      detail: null,
      raw: notification,
    }
  }
  if (notification.method === 'configWarning' || notification.method === 'deprecationNotice') {
    const title = stringField(params.summary)
    if (!title) return undefined
    return {
      type: 'systemNotice',
      level: 'warning',
      code: notification.method,
      title,
      detail: stringField(params.details) ?? null,
      raw: notification,
    }
  }
  return undefined
}

function realtimeEventFromCodex(notification: CodexJsonRpcNotification, params: Record<string, unknown>): AgentChatNotificationEvent | undefined {
  const threadId = stringField(params.threadId)
  const event = notification.method.replace(/^thread\/realtime\//, '')
  if (!threadId && notification.method !== 'thread/realtime/error') return undefined
  if (event === 'started') {
    return {
      type: 'realtime',
      event,
      threadId,
      realtimeSessionId: stringField(params.realtimeSessionId) ?? null,
      raw: notification,
    }
  }
  if (event === 'transcript/delta' || event === 'transcript/done') {
    return {
      type: 'realtime',
      event: event === 'transcript/delta' ? 'transcriptDelta' : 'transcriptDone',
      threadId,
      role: stringField(params.role) ?? null,
      delta: event === 'transcript/delta' ? stringField(params.delta) ?? '' : null,
      text: event === 'transcript/done' ? stringField(params.text) ?? '' : null,
      raw: notification,
    }
  }
  if (event === 'outputAudio/delta') {
    return {
      type: 'realtime',
      event: 'outputAudioDelta',
      threadId,
      audio: isRecord(params.audio) ? params.audio : null,
      raw: notification,
    }
  }
  if (event === 'sdp') {
    return {
      type: 'realtime',
      event: 'sdp',
      threadId,
      sdp: stringField(params.sdp) ?? null,
      raw: notification,
    }
  }
  if (event === 'error') {
    return {
      type: 'realtime',
      event: 'error',
      threadId,
      message: stringField(params.message) ?? 'Realtime error',
      raw: notification,
    }
  }
  if (event === 'closed') {
    return {
      type: 'realtime',
      event: 'closed',
      threadId,
      reason: stringField(params.reason) ?? null,
      raw: notification,
    }
  }
  return {
    type: 'realtime',
    event,
    threadId,
    raw: notification,
  }
}

function decodeBase64Utf8(value: string): string {
  try {
    if (typeof atob === 'function') {
      const binary = atob(value)
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
      return new TextDecoder().decode(bytes)
    }
  } catch {
    return ''
  }
  try {
    return Buffer.from(value, 'base64').toString('utf8')
  } catch {
    return ''
  }
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function requestIdField(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function agentChatStringPreview(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
