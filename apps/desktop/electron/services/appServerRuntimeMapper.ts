import type {
  AgentChatInput,
  AgentChatNotification,
  AgentChatThread,
  AgentChatThreadItem,
  AgentChatTurn,
  AgentThreadExecutionSettings,
} from '@movscript/agent-chat'

export type AppServerJsonRpcMessage = {
  id?: number | string
  method?: string
  params?: unknown
  result?: unknown
  error?: { code?: number; message?: string; data?: unknown } | unknown
}

export interface AppServerRuntimeMapperContext {
  api: string
  provider: {
    kind: string
  }
}

export function normalizeAppServerNotification(
  message: AppServerJsonRpcMessage,
  context: AppServerRuntimeMapperContext,
): AgentChatNotification {
  const params = isRecord(message.params) ? { ...message.params } : message.params
  if (isRecord(params)) {
    if (isRecord(params.thread)) params.thread = normalizeAppServerThread(params.thread, context, message.params)[0] ?? params.thread
    if (isRecord(params.turn)) params.turn = normalizeAppServerTurn(params.turn)[0] ?? params.turn
    if (isRecord(params.item)) params.item = normalizeAppServerThreadItem(params.item)[0] ?? params.item
  }
  return {
    method: message.method ?? 'unknown',
    ...(params !== undefined ? { params } : {}),
    raw: message,
  }
}

export function requireAppServerThread(response: unknown, context: AppServerRuntimeMapperContext): AgentChatThread {
  const thread = normalizeAppServerThread(isRecord(response) && response.thread ? response.thread : response, context, response)[0]
  if (!thread) throw new Error(`${context.api} app-server response did not include a thread.`)
  return thread
}

export function requireAppServerTurn(response: unknown): AgentChatTurn {
  const turn = normalizeAppServerTurn(isRecord(response) && response.turn ? response.turn : response)[0]
  if (!turn) throw new Error('app-server response did not include a turn.')
  return turn
}

export function normalizeAppServerThread(
  value: unknown,
  context: AppServerRuntimeMapperContext,
  raw?: unknown,
): AgentChatThread[] {
  if (!isRecord(value)) return []
  const id = stringField(value.id)
  if (!id) return []
  const executionSettings = appServerThreadExecutionSettings(value, raw)
  return [{
    provider: context.provider.kind,
    id,
    providerThreadId: id,
    providerSessionTreeId: stringField(value.sessionId) ?? id,
    sessionId: stringField(value.sessionId) ?? id,
    preview: stringField(value.preview) ?? '',
    name: value.name === null ? null : stringField(value.name) ?? null,
    createdAt: numberField(value.createdAt) ?? unixSecondsNow(),
    updatedAt: numberField(value.updatedAt) ?? unixSecondsNow(),
    status: appServerThreadStatus(value.status),
    cwd: stringField(value.cwd) ?? null,
    ...(Object.keys(executionSettings).length ? { executionSettings } : {}),
    turns: Array.isArray(value.turns) ? value.turns.flatMap(normalizeAppServerTurn) : [],
    raw: raw ?? value,
  }]
}

export function normalizeAppServerTurn(value: unknown): AgentChatTurn[] {
  if (!isRecord(value)) return []
  const id = stringField(value.id)
  if (!id) return []
  return [{
    id,
    items: Array.isArray(value.items) ? value.items.flatMap(normalizeAppServerThreadItem) : [],
    itemsView: value.itemsView === 'notLoaded' || value.itemsView === 'summary' || value.itemsView === 'full' ? value.itemsView : 'full',
    status: typeof value.status === 'string' ? value.status : 'inProgress',
    error: isRecord(value.error) ? value.error : null,
    startedAt: typeof value.startedAt === 'number' ? value.startedAt : null,
    completedAt: typeof value.completedAt === 'number' ? value.completedAt : null,
    durationMs: typeof value.durationMs === 'number' ? value.durationMs : null,
    raw: value,
  }]
}

export function normalizeAppServerThreadItem(value: unknown): AgentChatThreadItem[] {
  if (!isRecord(value)) return []
  if (value.type === 'enteredReviewMode') {
    return [{
      type: 'reviewMode',
      id: stringField(value.id) ?? 'enteredReviewMode',
      action: 'entered',
      review: stringField(value.review) ?? '',
      raw: value,
    }]
  }
  if (value.type === 'exitedReviewMode') {
    return [{
      type: 'reviewMode',
      id: stringField(value.id) ?? 'exitedReviewMode',
      action: 'exited',
      review: stringField(value.review) ?? '',
      raw: value,
    }]
  }
  if (value.type === 'userMessage') {
    return [{
      ...value,
      type: 'userMessage',
      id: stringField(value.id) ?? 'userMessage',
      clientId: value.clientId === null ? null : stringField(value.clientId) ?? null,
      content: Array.isArray(value.content) ? value.content.map(normalizeAppServerInput) : [],
      raw: value,
    } as AgentChatThreadItem]
  }
  return [{ ...value, id: stringField(value.id) ?? `item_${Date.now().toString(36)}` } as AgentChatThreadItem]
}

export function normalizeAppServerInput(value: unknown): AgentChatInput {
  if (!isRecord(value)) return { type: 'text', text: '', textElements: [] }
  if (value.type === 'text') {
    return {
      type: 'text',
      text: stringField(value.text) ?? '',
      textElements: Array.isArray(value.textElements)
        ? value.textElements
        : Array.isArray(value.text_elements)
          ? value.text_elements
          : [],
    }
  }
  if (value.type === 'image') {
    return compactParams({
      type: 'image',
      url: stringField(value.url) ?? '',
      detail: stringField(value.detail),
    }) as AgentChatInput
  }
  if (value.type === 'localImage') {
    return compactParams({
      type: 'localImage',
      path: stringField(value.path) ?? '',
      detail: stringField(value.detail),
    }) as AgentChatInput
  }
  if (value.type === 'skill') return { type: 'skill', name: stringField(value.name) ?? '', path: stringField(value.path) ?? '' }
  return { type: 'mention', name: stringField(value.name) ?? '', path: stringField(value.path) ?? '' }
}

export function threadIdFromAppServerNotification(notification: AgentChatNotification): string | undefined {
  const params = isRecord(notification.params) ? notification.params : {}
  return stringField(params.threadId)
    ?? (isRecord(params.thread) ? stringField(params.thread.id) : undefined)
}

function appServerThreadExecutionSettings(
  thread: Record<string, unknown>,
  raw?: unknown,
): AgentThreadExecutionSettings {
  const response = isRecord(raw) ? raw : {}
  const activePermissionProfile = isRecord(response.activePermissionProfile)
    ? response.activePermissionProfile
    : isRecord(response.threadSettings) && isRecord(response.threadSettings.activePermissionProfile)
      ? response.threadSettings.activePermissionProfile
      : undefined
  return compactParams({
    model: stringField(response.model) ?? stringField(thread.model),
    modelProvider: stringField(response.modelProvider) ?? stringField(thread.modelProvider),
    cwd: stringField(response.cwd) ?? stringField(thread.cwd),
    approvalPolicy: typeof response.approvalPolicy === 'string' ? response.approvalPolicy : undefined,
    approvalsReviewer: stringField(response.approvalsReviewer),
    sandbox: response.sandbox,
    sandboxPolicy: response.sandboxPolicy,
    permissions: activePermissionProfile ? stringField(activePermissionProfile.id) : undefined,
  }) as AgentThreadExecutionSettings
}

function appServerThreadStatus(value: unknown): AgentChatThread['status'] {
  if (value === 'notLoaded' || value === 'idle' || value === 'running' || value === 'failed' || value === 'completed' || value === 'cancelled') return value
  if (value === 'active') return 'running'
  return 'unknown'
}

function compactParams<T extends object>(input: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) output[key] = value
  }
  return output as T
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function unixSecondsNow(): number {
  return Math.floor(Date.now() / 1000)
}
