import type {
  AgentChatInput,
  AgentChatNotification,
  AgentChatNotificationEvent,
  AgentChatProviderKind,
  AgentChatServerRequest,
  AgentChatServerRequestResponse,
  AgentChatThread,
  AgentChatThreadStatus,
  AgentChatTurn,
  AgentChatTurnItemsView,
  AgentChatTurnStatus,
} from '@/features/agent/domain/agentChatProtocol'
import { agentChatThreadItemFromAppServerThreadTurnItem } from '@/shared/infrastructure/app-server/appServerThreadTurnItemItems'
import { MOVA_PROVIDER_ID } from '@/shared/infrastructure/providerConfigStore'
import type {
  AppServerJsonRpcNotification,
  AppServerJsonRpcServerRequest,
  AppServerThread,
  AppServerTurn,
  AppServerUserInput,
} from '@/shared/infrastructure/app-server/appServerProtocol'

export function agentChatNotificationFromAppServerThreadTurnItem(notification: AppServerJsonRpcNotification, provider: AgentChatProviderKind = MOVA_PROVIDER_ID): AgentChatNotification {
  const params = normalizeAppServerThreadTurnItemNotificationParams(notification, provider)
  return {
    method: notification.method,
    params,
    event: agentChatNotificationEventFromAppServerThreadTurnItem(notification),
    raw: notification,
  }
}

export function agentChatServerRequestFromAppServerThreadTurnItem(request: AppServerJsonRpcServerRequest): AgentChatServerRequest {
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

export function appServerThreadTurnItemServerRequestResponseFromAgentChat(
  request: AgentChatServerRequest,
  response: AgentChatServerRequestResponse,
): unknown {
  if (request.method === 'mcpServer/elicitation/request') {
    return {
      action: response.action === 'elicitation' && response.accepted ? 'accept' : response.action === 'cancel' ? 'cancel' : response.action === 'elicitation' ? 'decline' : response.action === 'approve' ? 'accept' : 'decline',
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
      answers: response.action === 'answer' ? appServerThreadTurnItemToolRequestUserInputAnswers(request, response) : {},
    }
  }
  if (request.method === 'item/tool/call') {
    return {
      contentItems: response.action === 'toolResult' ? appServerThreadTurnItemDynamicToolOutputContentItems(response.contentItems) : [],
      success: response.action === 'toolResult' ? response.success : false,
    }
  }
  if (request.method === 'item/commandExecution/requestApproval' || request.method === 'item/fileChange/requestApproval') {
    if (response.action === 'cancel') return { decision: 'cancel' }
    if (request.method === 'item/commandExecution/requestApproval' && response.action === 'approve' && response.execPolicyAmendment !== undefined) {
      return { decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: response.execPolicyAmendment } } }
    }
    if (request.method === 'item/commandExecution/requestApproval' && response.action === 'approve' && response.networkPolicyAmendment !== undefined) {
      return { decision: { applyNetworkPolicyAmendment: { network_policy_amendment: response.networkPolicyAmendment } } }
    }
    return { decision: response.action === 'approve' ? response.scope === 'session' ? 'acceptForSession' : 'accept' : 'decline' }
  }
  if (request.method === 'applyPatchApproval' || request.method === 'execCommandApproval') {
    if (response.action === 'cancel') return { decision: 'abort' }
    if (response.action === 'approve' && response.execPolicyAmendment !== undefined) {
      return { decision: { approved_execpolicy_amendment: { proposed_execpolicy_amendment: response.execPolicyAmendment } } }
    }
    if (response.action === 'approve' && response.networkPolicyAmendment !== undefined) {
      return { decision: { network_policy_amendment: { network_policy_amendment: response.networkPolicyAmendment } } }
    }
    return { decision: response.action === 'approve' ? response.scope === 'session' ? 'approved_for_session' : 'approved' : 'denied' }
  }
  if (request.method === 'account/chatgptAuthTokens/refresh') {
    return { action: 'decline', reason: response.action === 'reject' ? response.reason ?? 'Rejected from Agent chat.' : 'Unsupported from Agent chat.' }
  }
  if (request.method === 'attestation/generate') {
    return { action: 'decline', reason: response.action === 'reject' ? response.reason ?? 'Rejected from Agent chat.' : 'Unsupported from Agent chat.' }
  }
  return { decision: 'decline' }
}

export function agentChatThreadFromAppServerThreadTurnItem(thread: AppServerThread, provider: AgentChatProviderKind = MOVA_PROVIDER_ID): AgentChatThread {
  return {
    provider,
    id: thread.id,
    providerThreadId: thread.id,
    providerSessionTreeId: thread.sessionId || undefined,
    sessionId: thread.sessionId || undefined,
    preview: thread.preview || '',
    name: thread.name,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    status: agentChatThreadStatusFromAppServerThreadTurnItem(thread.status),
    turns: thread.turns.map(agentChatTurnFromAppServerThreadTurnItem),
    raw: thread,
  }
}

export function agentChatTurnFromAppServerThreadTurnItem(turn: Partial<AppServerTurn> & Pick<AppServerTurn, 'id'>): AgentChatTurn {
  return {
    id: turn.id,
    items: (turn.items ?? []).map(agentChatThreadItemFromAppServerThreadTurnItem),
    itemsView: agentChatTurnItemsViewFromAppServerThreadTurnItem(turn.itemsView),
    status: agentChatTurnStatusFromAppServerThreadTurnItem(turn.status),
    error: turn.error ?? null,
    startedAt: turn.startedAt ?? null,
    completedAt: turn.completedAt ?? null,
    durationMs: turn.durationMs ?? null,
    raw: turn,
  }
}

export function appServerThreadTurnItemUserInputFromAgentChat(input: AgentChatInput): AppServerUserInput {
  if (input.type === 'text') return { type: 'text', text: input.text, text_elements: input.textElements as never[] }
  if (input.type === 'image') return { type: 'image', url: input.url, detail: input.detail } as AppServerUserInput
  if (input.type === 'localImage') return { type: 'localImage', path: input.path, detail: input.detail } as AppServerUserInput
  if (input.type === 'skill') return { type: 'skill', name: input.name, path: input.path }
  const path = appServerThreadTurnItemMentionPathFromAgentChat(input)
  return { type: 'mention', name: appServerThreadTurnItemMentionNameFromAgentChat(input, path), path }
}

function appServerThreadTurnItemMentionPathFromAgentChat(input: Extract<AgentChatInput, { type: 'mention' }>): string {
  if (appServerThreadTurnItemResourceMentionId(input.path) !== undefined) return input.path
  const url = nonEmptyString(input.url)
  if (agentChatMentionIsMedia(input) && url) return url
  return input.path
}

function appServerThreadTurnItemMentionNameFromAgentChat(input: Extract<AgentChatInput, { type: 'mention' }>, path: string): string {
  const hint = agentChatMentionMediaHint(input)
  if (!hint || agentChatMentionHasMediaSignal(`${input.name} ${path}`)) return input.name
  return `${input.name} [${hint}]`
}

function agentChatMentionMediaHint(input: Extract<AgentChatInput, { type: 'mention' }>): string | undefined {
  const mimeType = nonEmptyString(input.mimeType)
  if (mimeType?.includes('/')) return mimeType
  const kind = nonEmptyString(input.kind)?.toLowerCase()
  if (kind === 'image' || kind === 'video' || kind === 'audio') return kind
  return undefined
}

function agentChatMentionIsMedia(input: Extract<AgentChatInput, { type: 'mention' }>): boolean {
  return input.kind === 'image'
    || input.kind === 'video'
    || input.kind === 'audio'
    || input.mimeType?.startsWith('image/') === true
    || input.mimeType?.startsWith('video/') === true
    || input.mimeType?.startsWith('audio/') === true
}

function agentChatMentionHasMediaSignal(value: string): boolean {
  return /\[(?:image|video|audio)(?:\/[^\]\s]+)?\]/i.test(value)
    || /(?:^|[/?#&=._-])(?:image|video|audio)%2f/i.test(value)
    || /(?:^|[/?#&=._-])(?:image|video|audio)\//i.test(value)
    || /\.(?:png|apng|avif|gif|jpe?g|webp|bmp|svg|mp4|m4v|mov|webm|mkv|avi|mp3|m4a|aac|wav|ogg|oga|flac)(?:$|[?#\s])/i.test(value)
}

function appServerThreadTurnItemResourceMentionId(path: string): number | undefined {
  const match = /^resource:(\d+)$/.exec(path.trim())
  if (!match?.[1]) return undefined
  const id = Number(match[1])
  return Number.isInteger(id) && id > 0 ? id : undefined
}

function agentChatThreadStatusFromAppServerThreadTurnItem(status: AppServerThread['status']): AgentChatThreadStatus {
  if (status.type === 'notLoaded') return 'notLoaded'
  if (status.type === 'idle') return 'idle'
  if (status.type === 'systemError') return 'failed'
  if (status.type === 'active') return 'running'
  return 'unknown'
}

function agentChatTurnStatusFromAppServerThreadTurnItem(status: AppServerTurn['status'] | undefined): AgentChatTurnStatus {
  return status ?? 'inProgress'
}

function agentChatTurnItemsViewFromAppServerThreadTurnItem(itemsView: AppServerTurn['itemsView'] | undefined): AgentChatTurnItemsView {
  if (itemsView === 'notLoaded' || itemsView === 'summary' || itemsView === 'full') return itemsView
  return 'full'
}

type AppServerDynamicToolOutputContentItem = { type: 'inputText'; text: string } | { type: 'inputImage'; imageUrl: string }

function appServerThreadTurnItemDynamicToolOutputContentItems(contentItems: unknown[] | undefined): AppServerDynamicToolOutputContentItem[] {
  if (!Array.isArray(contentItems)) return []
  return contentItems.flatMap<AppServerDynamicToolOutputContentItem>((item) => {
    if (!isRecord(item)) return []
    const text = appServerThreadTurnItemDynamicToolOutputText(item)
    if (text) return [{ type: 'inputText', text }]
    const imageUrl = appServerThreadTurnItemDynamicToolOutputImageUrl(item)
    if (imageUrl) return [{ type: 'inputImage', imageUrl }]
    const mediaReference = appServerThreadTurnItemDynamicToolOutputMediaReference(item)
    if (mediaReference) return [{ type: 'inputText', text: mediaReference }]
    return []
  })
}

function appServerThreadTurnItemDynamicToolOutputText(item: Record<string, unknown>): string | undefined {
  const type = stringField(item.type)
  if (type !== 'inputText' && type !== 'input_text' && type !== 'output_text' && type !== 'text') return undefined
  return nonEmptyString(item.text)
}

function appServerThreadTurnItemDynamicToolOutputImageUrl(item: Record<string, unknown>): string | undefined {
  const type = stringField(item.type)
  if (type !== 'inputImage' && type !== 'input_image' && type !== 'image') return undefined
  const imageUrl = nonEmptyString(item.imageUrl) ?? nonEmptyString(item.image_url) ?? nonEmptyString(item.url)
  if (imageUrl) return imageUrl
  const data = nonEmptyString(item.data)
  if (!data) return undefined
  return `data:${stringField(item.mimeType) ?? stringField(item.mime_type) ?? 'image/png'};base64,${data}`
}

function appServerThreadTurnItemDynamicToolOutputMediaReference(item: Record<string, unknown>): string | undefined {
  const type = stringField(item.type)
  if (type === 'inputVideo' || type === 'input_video' || type === 'video') {
    return appServerThreadTurnItemDynamicToolOutputMediaReferenceText('Video result', item)
  }
  if (type === 'inputAudio' || type === 'input_audio' || type === 'audio') {
    return appServerThreadTurnItemDynamicToolOutputMediaReferenceText('Audio result', item)
  }
  if (type === 'resource' || type === 'inputResource' || type === 'input_resource') {
    return appServerThreadTurnItemDynamicToolOutputResourceReferenceText(item)
  }
  return undefined
}

function appServerThreadTurnItemDynamicToolOutputMediaReferenceText(label: string, item: Record<string, unknown>): string {
  const details = [
    nonEmptyString(item.videoUrl) ?? nonEmptyString(item.video_url) ?? nonEmptyString(item.audioUrl) ?? nonEmptyString(item.audio_url) ?? nonEmptyString(item.url),
    stringField(item.mimeType) ?? stringField(item.mime_type),
    nonEmptyString(item.data) || nonEmptyString(item.blob) ? 'inline data' : '',
  ].filter(Boolean).join(' ')
  return details ? `${label}: ${details}` : label
}

function appServerThreadTurnItemDynamicToolOutputResourceReferenceText(item: Record<string, unknown>): string {
  const resource = isRecord(item.resource) ? item.resource : item
  const text = nonEmptyString(resource.text)
  const details = [
    nonEmptyString(resource.name),
    nonEmptyString(resource.uri),
    nonEmptyString(resource.url),
    stringField(resource.mimeType) ?? stringField(resource.mime_type),
    text ? `text: ${agentChatShortPreview(text)}` : '',
    nonEmptyString(resource.blob) || nonEmptyString(resource.data) ? 'inline data' : '',
  ].filter(Boolean).join(' ')
  return details ? `Resource result: ${details}` : 'Resource result'
}

function appServerThreadTurnItemToolRequestUserInputAnswers(
  request: AgentChatServerRequest,
  response: Extract<AgentChatServerRequestResponse, { action: 'answer' }>,
): Record<string, { answers: string[] }> {
  const answers = appServerThreadTurnItemToolRequestUserInputAnswersFromRecord(response.answers)
  if (Object.keys(answers).length > 0) return answers
  const fallbackAnswers = uniqueNonEmptyStrings([...(Array.isArray(response.choiceIds) ? response.choiceIds : []), response.text])
  if (fallbackAnswers.length === 0) return answers
  const questionId = appServerThreadTurnItemToolRequestUserInputQuestionId(request)
  return questionId ? { [questionId]: { answers: fallbackAnswers } } : answers
}

function appServerThreadTurnItemToolRequestUserInputAnswersFromRecord(answers: unknown): Record<string, { answers: string[] }> {
  if (!isRecord(answers)) return {}
  return Object.fromEntries(Object.entries(answers).flatMap(([questionId, answer]) => {
    if (!questionId.trim() || !isRecord(answer)) return []
    const values = Array.isArray(answer.answers)
      ? answer.answers.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : nonEmptyString(answer.text)
        ? [nonEmptyString(answer.text) as string]
        : []
    return [[questionId, { answers: values }]]
  }))
}

function appServerThreadTurnItemToolRequestUserInputQuestionId(request: AgentChatServerRequest): string | undefined {
  const params = isRecord(request.params) ? request.params : {}
  const questions = Array.isArray(params.questions) ? params.questions : []
  for (const question of questions) {
    if (!isRecord(question)) continue
    const id = stringField(question.id)
    if (id) return id
  }
  return stringField(params.questionId) ?? stringField(params.id) ?? stringField(request.id)
}

function uniqueNonEmptyStrings(values: unknown[]): string[] {
  const seen = new Set<string>()
  return values.flatMap((value) => {
    const item = stringField(value)
    if (!item || seen.has(item)) return []
    seen.add(item)
    return [item]
  })
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeAppServerThreadTurnItemNotificationParams(notification: AppServerJsonRpcNotification, provider: AgentChatProviderKind): unknown {
  if (!isRecord(notification.params)) return notification.params
  if (notification.method === 'thread/started' && isRecord(notification.params.thread)) {
    return {
      ...notification.params,
      thread: agentChatThreadFromAppServerThreadTurnItem(notification.params.thread as never, provider),
    }
  }
  if (notification.method === 'thread/status/changed' && isRecord(notification.params.status)) {
    return {
      ...notification.params,
      status: agentChatThreadStatusFromAppServerThreadTurnItem(notification.params.status as AppServerThread['status']),
    }
  }
  if ((notification.method === 'turn/started' || notification.method === 'turn/completed') && isRecord(notification.params.turn)) {
    return {
      ...notification.params,
      turn: agentChatTurnFromAppServerThreadTurnItem(notification.params.turn as never),
    }
  }
  if ((notification.method === 'item/started' || notification.method === 'item/completed') && isRecord(notification.params.item)) {
    return {
      ...notification.params,
      item: agentChatThreadItemFromAppServerThreadTurnItem(notification.params.item as never),
    }
  }
  return notification.params
}

function agentChatNotificationEventFromAppServerThreadTurnItem(notification: AppServerJsonRpcNotification): AgentChatNotificationEvent | undefined {
  const params = isRecord(notification.params) ? notification.params : {}
  if (notification.method === 'error') {
    const threadId = stringField(params.threadId)
    const turnId = stringField(params.turnId)
    const error = isRecord(params.error) ? params.error : {}
    const title = stringField(error.message) ?? 'Turn error'
    return {
      type: 'systemNotice',
      level: 'error',
      id: turnId ? `turn-error:${turnId}` : undefined,
      code: notification.method,
      threadId,
      turnId,
      title: params.willRetry === true ? `${title} (retrying)` : title,
      detail: stringField(error.additionalDetails) ?? null,
      raw: notification,
    }
  }
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
  if (notification.method === 'rawResponseItem/completed') {
    const threadId = stringField(params.threadId)
    const turnId = stringField(params.turnId)
    const item = isRecord(params.item) ? params.item : null
    if (!threadId || !turnId || !item) return undefined
    const itemType = stringField(item.type) ?? 'responseItem'
    return {
      type: 'systemNotice',
      level: 'info',
      id: `raw-response-item:${turnId}:${agentChatRawResponseItemKey(item)}`,
      code: notification.method,
      threadId,
      turnId,
      title: 'Raw response item completed',
      detail: agentChatRawResponseItemDetail(itemType, item),
      raw: notification,
    }
  }
  if (notification.method === 'hook/started' || notification.method === 'hook/completed') {
    const threadId = stringField(params.threadId)
    const turnId = stringField(params.turnId)
    const run = isRecord(params.run) ? params.run : {}
    const hookId = stringField(run.id)
    const status = stringField(run.status)
    const eventName = stringField(run.eventName)
    if (!threadId || !hookId) return undefined
    return {
      type: 'systemNotice',
      level: status === 'failed' || status === 'blocked' ? 'warning' : 'info',
      id: `hook:${hookId}`,
      code: notification.method,
      threadId,
      turnId,
      title: notification.method === 'hook/started' ? 'Hook started' : 'Hook completed',
      detail: agentChatHookRunDetail(run),
      raw: notification,
    }
  }
  if (notification.method === 'thread/goal/updated') {
    const threadId = stringField(params.threadId)
    const turnId = stringField(params.turnId)
    const goal = isRecord(params.goal) ? params.goal : {}
    const objective = stringField(goal.objective)
    if (!threadId || !objective) return undefined
    return {
      type: 'systemNotice',
      level: 'info',
      id: `thread-goal:${threadId}`,
      code: notification.method,
      threadId,
      turnId,
      title: 'Goal updated',
      detail: agentChatGoalDetail(goal),
      raw: notification,
    }
  }
  if (notification.method === 'thread/goal/cleared') {
    const threadId = stringField(params.threadId)
    if (!threadId) return undefined
    return {
      type: 'systemNotice',
      level: 'info',
      id: `thread-goal-cleared:${threadId}`,
      code: notification.method,
      threadId,
      title: 'Goal cleared',
      detail: null,
      raw: notification,
    }
  }
  if (notification.method === 'thread/tokenUsage/updated') {
    const threadId = stringField(params.threadId)
    const turnId = stringField(params.turnId)
    if (!threadId || !turnId) return undefined
    return {
      type: 'systemNotice',
      level: 'info',
      id: `turn-token-usage:${turnId}`,
      code: notification.method,
      threadId,
      turnId,
      title: 'Token usage updated',
      detail: agentChatTokenUsageDetail(params.tokenUsage),
      raw: notification,
    }
  }
  if (notification.method === 'model/rerouted') {
    const threadId = stringField(params.threadId)
    const turnId = stringField(params.turnId)
    const fromModel = stringField(params.fromModel)
    const toModel = stringField(params.toModel)
    if (!threadId || !turnId || !fromModel || !toModel) return undefined
    return {
      type: 'systemNotice',
      level: 'warning',
      id: `model-rerouted:${turnId}`,
      code: notification.method,
      threadId,
      turnId,
      title: 'Model rerouted',
      detail: [`${fromModel} -> ${toModel}`, stringField(params.reason)].filter(Boolean).join('\n'),
      raw: notification,
    }
  }
  if (notification.method === 'model/verification') {
    const threadId = stringField(params.threadId)
    const turnId = stringField(params.turnId)
    const verifications = Array.isArray(params.verifications) ? params.verifications.filter((item): item is string => typeof item === 'string') : []
    if (!threadId || !turnId) return undefined
    return {
      type: 'systemNotice',
      level: 'info',
      id: `model-verification:${turnId}`,
      code: notification.method,
      threadId,
      turnId,
      title: 'Model verification',
      detail: verifications.join('\n') || null,
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
    return realtimeEventFromAppServerThreadTurnItem(notification, params)
  }
  if (notification.method === 'account/updated' || notification.method === 'account/rateLimits/updated' || notification.method === 'account/login/completed') {
    return {
      type: 'account',
      event: notification.method === 'account/updated' ? 'updated' : notification.method === 'account/rateLimits/updated' ? 'rateLimitsUpdated' : 'loginCompleted',
      detail: notification.params,
      raw: notification,
    }
  }
  if (notification.method === 'mcpServer/oauthLogin/completed') {
    const server = stringField(params.name)
    if (!server) return undefined
    return {
      type: 'mcpStatus',
      server,
      status: params.success === true ? 'oauthLoginCompleted' : 'oauthLoginFailed',
      error: stringField(params.error) ?? null,
      raw: notification,
    }
  }
  if (notification.method === 'mcpServer/startupStatus/updated') {
    const server = stringField(params.name)
    if (!server) return undefined
    return {
      type: 'mcpStatus',
      server,
      status: stringField(params.status) ?? agentChatStringPreview(params.status),
      error: stringField(params.error) ?? null,
      raw: notification,
    }
  }
  if (notification.method === 'remoteControl/status/changed') {
    return {
      type: 'systemNotice',
      level: 'info',
      code: notification.method,
      title: 'Remote control status changed',
      detail: agentChatRemoteControlStatusDetail(params),
      raw: notification,
    }
  }
  if (notification.method === 'externalAgentConfig/import/completed') {
    return {
      type: 'systemNotice',
      level: 'info',
      code: notification.method,
      title: 'External agent config imported',
      detail: null,
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
  if (notification.method === 'windows/worldWritableWarning') {
    const samplePaths = Array.isArray(params.samplePaths) ? params.samplePaths.filter((item): item is string => typeof item === 'string') : []
    const extraCount = numberField(params.extraCount)
    return {
      type: 'systemNotice',
      level: 'warning',
      code: notification.method,
      title: 'World-writable paths detected',
      detail: [
        ...samplePaths,
        extraCount ? `${extraCount} additional path(s)` : null,
        params.failedScan === true ? 'Scan failed before completing.' : null,
      ].filter(Boolean).join('\n') || null,
      raw: notification,
    }
  }
  if (notification.method === 'windowsSandbox/setupCompleted') {
    const success = params.success === true
    return {
      type: 'systemNotice',
      level: success ? 'info' : 'error',
      code: notification.method,
      title: success ? 'Windows sandbox setup completed' : 'Windows sandbox setup failed',
      detail: agentChatWindowsSandboxSetupDetail(params),
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
      detail: notification.method === 'configWarning'
        ? agentChatConfigWarningDetail(params)
        : stringField(params.details) ?? null,
      raw: notification,
    }
  }
  return undefined
}

function realtimeEventFromAppServerThreadTurnItem(notification: AppServerJsonRpcNotification, params: Record<string, unknown>): AgentChatNotificationEvent | undefined {
  const threadId = stringField(params.threadId)
  const event = notification.method.replace(/^thread\/realtime\//, '')
  if (!threadId && notification.method !== 'thread/realtime/error') return undefined
  if (event === 'started') {
    return {
      type: 'realtime',
      event,
      threadId,
      realtimeSessionId: stringField(params.realtimeSessionId) ?? null,
      version: stringField(params.version) ?? null,
      raw: notification,
    }
  }
  if (event === 'itemAdded') {
    return {
      type: 'realtime',
      event,
      threadId,
      item: params.item,
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

function agentChatTokenUsageDetail(value: unknown): string {
  if (!isRecord(value)) return agentChatStringPreview(value)
  const detail = [
    tokenUsageBreakdownDetail('total', value.total),
    tokenUsageBreakdownDetail('last', value.last),
    typeof value.modelContextWindow === 'number' ? `model context window: ${value.modelContextWindow}` : '',
  ].filter(Boolean).join('\n')
  return detail || agentChatStringPreview(value)
}

function tokenUsageBreakdownDetail(label: string, value: unknown): string {
  if (!isRecord(value)) return ''
  return [
    `${label}:`,
    typeof value.totalTokens === 'number' ? `total ${value.totalTokens}` : '',
    typeof value.inputTokens === 'number' ? `input ${value.inputTokens}` : '',
    typeof value.cachedInputTokens === 'number' ? `cached ${value.cachedInputTokens}` : '',
    typeof value.outputTokens === 'number' ? `output ${value.outputTokens}` : '',
    typeof value.reasoningOutputTokens === 'number' ? `reasoning ${value.reasoningOutputTokens}` : '',
  ].filter(Boolean).join(' ')
}

function agentChatGoalDetail(goal: Record<string, unknown>): string {
  const objective = stringField(goal.objective)
  return [
    objective ? `objective: ${objective}` : '',
    stringField(goal.status) ? `status: ${stringField(goal.status)}` : '',
    typeof goal.tokenBudget === 'number' ? `token budget: ${goal.tokenBudget}` : goal.tokenBudget === null ? 'token budget: none' : '',
    typeof goal.tokensUsed === 'number' ? `tokens used: ${goal.tokensUsed}` : '',
    typeof goal.timeUsedSeconds === 'number' ? `time used: ${goal.timeUsedSeconds}s` : '',
  ].filter(Boolean).join('\n') || (objective ?? agentChatStringPreview(goal))
}

function agentChatRawResponseItemKey(item: Record<string, unknown>): string {
  const type = stringField(item.type) ?? 'responseItem'
  const stableId = stringField(item.id) ?? stringField(item.call_id) ?? stringField(item.name)
  if (stableId) return `${type}:${stableId}`
  return `${type}:${agentChatStableHash(agentChatStringPreview(item))}`
}

function agentChatRawResponseItemDetail(itemType: string, item: Record<string, unknown>): string {
  const detail = [
    `type: ${itemType}`,
    stringField(item.role) ? `role: ${stringField(item.role)}` : '',
    stringField(item.phase) ? `phase: ${stringField(item.phase)}` : '',
    stringField(item.status) ? `status: ${stringField(item.status)}` : '',
    stringField(item.name) ? `name: ${stringField(item.name)}` : '',
    stringField(item.namespace) ? `namespace: ${stringField(item.namespace)}` : '',
    stringField(item.call_id) ? `call id: ${stringField(item.call_id)}` : '',
    rawResponseItemValueDetail('arguments', item.arguments),
    rawResponseItemValueDetail('input', item.input),
    rawResponseItemValueDetail('output', item.output),
    rawResponseItemValueDetail('execution', item.execution),
    rawResponseItemValueDetail('action', item.action),
    rawResponseItemValueDetail('result', item.result),
    rawResponseItemValueDetail('revised prompt', item.revised_prompt),
    Array.isArray(item.content) ? `content: ${item.content.length} item(s)` : '',
    Array.isArray(item.summary) ? `summary: ${item.summary.length} item(s)` : '',
    Array.isArray(item.tools) ? `tools: ${item.tools.length} item(s)` : '',
    item.encrypted_content ? 'encrypted content: present' : '',
  ].filter(Boolean).join('\n')
  return detail || agentChatStringPreview(item)
}

function rawResponseItemValueDetail(label: string, value: unknown): string {
  const preview = agentChatShortPreview(value)
  return preview ? `${label}: ${preview}` : ''
}

function agentChatShortPreview(value: unknown): string {
  const preview = agentChatStringPreview(value).replace(/\s+/g, ' ').trim()
  if (!preview) return ''
  return preview.length > 240 ? `${preview.slice(0, 237)}...` : preview
}

function agentChatStableHash(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36)
}

function agentChatHookRunDetail(run: Record<string, unknown>): string | null {
  const entries = Array.isArray(run.entries) ? run.entries : []
  const detail = [
    stringField(run.eventName) ? `event: ${stringField(run.eventName)}` : '',
    stringField(run.status) ? `status: ${stringField(run.status)}` : '',
    stringField(run.statusMessage) ? `message: ${stringField(run.statusMessage)}` : '',
    stringField(run.handlerType) ? `handler: ${stringField(run.handlerType)}` : '',
    stringField(run.executionMode) ? `execution: ${stringField(run.executionMode)}` : '',
    stringField(run.scope) ? `scope: ${stringField(run.scope)}` : '',
    stringField(run.sourcePath) ? `source path: ${stringField(run.sourcePath)}` : '',
    stringField(run.source) ? `source: ${stringField(run.source)}` : '',
    numberField(run.durationMs) !== undefined ? `duration: ${numberField(run.durationMs)}ms` : '',
    entries.length ? `entries: ${entries.length}` : '',
    ...entries.slice(0, 3).flatMap((entry, index) => hookEntryDetail(entry, index)),
  ].filter(Boolean).join('\n')
  return detail || null
}

function hookEntryDetail(value: unknown, index: number): string[] {
  if (!isRecord(value)) return []
  const text = stringField(value.text)
  return [
    stringField(value.kind) ? `entry ${index + 1}: ${stringField(value.kind)}` : '',
    text ? `entry ${index + 1} text: ${text}` : '',
  ]
}

function agentChatConfigWarningDetail(params: Record<string, unknown>): string | null {
  const detail = [
    stringField(params.details),
    stringField(params.path) ? `path: ${stringField(params.path)}` : '',
    textRangeDetail(params.range),
  ].filter(Boolean).join('\n')
  return detail || null
}

function agentChatRemoteControlStatusDetail(params: Record<string, unknown>): string | null {
  const detail = [
    stringField(params.status) ? `status: ${stringField(params.status)}` : '',
    stringField(params.serverName) ? `server: ${stringField(params.serverName)}` : '',
    stringField(params.installationId) ? `installation: ${stringField(params.installationId)}` : '',
    stringField(params.environmentId) ? `environment: ${stringField(params.environmentId)}` : '',
  ].filter(Boolean).join('\n')
  return detail || null
}

function agentChatWindowsSandboxSetupDetail(params: Record<string, unknown>): string | null {
  const detail = [
    stringField(params.mode) ? `mode: ${stringField(params.mode)}` : '',
    typeof params.success === 'boolean' ? `success: ${params.success}` : '',
    stringField(params.error) ? `error: ${stringField(params.error)}` : '',
  ].filter(Boolean).join('\n')
  return detail || null
}

function textRangeDetail(value: unknown): string {
  if (!isRecord(value)) return ''
  const start = textPositionDetail(value.start)
  const end = textPositionDetail(value.end)
  if (start && end) return `range: ${start} - ${end}`
  if (start) return `range: ${start}`
  return ''
}

function textPositionDetail(value: unknown): string {
  if (!isRecord(value)) return ''
  const line = numberField(value.line)
  const column = numberField(value.column)
  if (line === undefined || column === undefined) return ''
  return `line ${line}, column ${column}`
}
