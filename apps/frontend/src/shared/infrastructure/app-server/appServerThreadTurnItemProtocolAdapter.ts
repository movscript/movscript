import type {
  AgentChatInput,
  AgentChatNotification,
  AgentChatProviderKind,
  AgentChatServerRequest,
  AgentChatServerRequestResponse,
  AgentChatThread,
  AgentChatThreadStatus,
  AgentChatTurn,
  AgentChatTurnItemsView,
  AgentChatTurnStatus,
} from '@movscript/core/agent/chat'
import { MOVSCRIPT_DECISION_REQUEST_METHOD, agentThreadGoalStateFromUnknown, isModelReachableRemoteUrl } from '@movscript/core/agent/chat'
import { agentChatNotificationEventFromAppServerThreadTurnItem } from '@/shared/infrastructure/app-server/appServerThreadTurnItemNotificationEvents'
import { agentChatThreadItemFromAppServerThreadTurnItem } from '@/shared/infrastructure/app-server/appServerThreadTurnItemItems'
import { MOVA_PROVIDER_ID } from '@/shared/infrastructure/providerConfigStore'
import type {
  AppServerJsonRpcNotification,
  AppServerJsonRpcServerRequest,
  AppServerThread,
  AppServerTurn,
  AppServerUserInput,
} from '@/shared/infrastructure/app-server/appServerProtocol'
import {
  agentChatShortPreview,
  isRecord,
  nonEmptyString,
  stringField,
} from '@/shared/infrastructure/app-server/appServerThreadTurnItemNotificationDetails'

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
  if (request.method === MOVSCRIPT_DECISION_REQUEST_METHOD) {
    return response.action === 'decision'
      ? {
          decision: response.decision,
          ...(response.reason ? { reason: response.reason } : {}),
          ...(response.metadata ? { metadata: response.metadata } : {}),
        }
      : { decision: 'defer' }
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
    cwd: thread.cwd,
    goal: agentThreadGoalStateFromUnknown((thread as { goal?: unknown }).goal) ?? null,
    executionSettings: {
      modelProvider: thread.modelProvider,
      cwd: thread.cwd,
    },
    turns: thread.turns.map(agentChatTurnFromAppServerThreadTurnItem),
    raw: thread,
  }
}

export function agentChatTurnFromAppServerThreadTurnItem(turn: Partial<AppServerTurn> & Pick<AppServerTurn, 'id'>): AgentChatTurn {
  const itemLifecycle = turn.status === 'completed' ? 'completed' : undefined
  return {
    id: turn.id,
    items: (turn.items ?? []).map((item) => agentChatThreadItemFromAppServerThreadTurnItem(item, { lifecycle: itemLifecycle })),
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
  if (input.type === 'image') {
    if (appServerThreadTurnItemImageUrlIsApiReady(input.url)) {
      return { type: 'image', url: input.url, detail: input.detail } as AppServerUserInput
    }
    return {
      type: 'mention',
      name: input.name ?? 'image attachment',
      path: input.resourceId !== undefined ? `resource:${input.resourceId}` : input.name ?? 'image attachment',
    }
  }
  if (input.type === 'localImage') return { type: 'localImage', path: input.path, detail: input.detail } as AppServerUserInput
  if (input.type === 'skill') return { type: 'skill', name: input.name, path: input.path }
  const path = appServerThreadTurnItemMentionPathFromAgentChat(input)
  return { type: 'mention', name: appServerThreadTurnItemMentionNameFromAgentChat(input, path), path }
}

function appServerThreadTurnItemImageUrlIsApiReady(value: string): boolean {
  return /^data:image\/[a-z0-9.+-]+[;,]/i.test(value) || isModelReachableRemoteUrl(value)
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
    if (imageUrl && appServerThreadTurnItemImageUrlIsApiReady(imageUrl)) return [{ type: 'inputImage', imageUrl }]
    if (imageUrl) return [{ type: 'inputText', text: appServerThreadTurnItemDynamicToolOutputImageReferenceText(imageUrl) }]
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

function appServerThreadTurnItemDynamicToolOutputImageReferenceText(imageUrl: string): string {
  return `Image result: ${imageUrl}`
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
      item: agentChatThreadItemFromAppServerThreadTurnItem(
        notification.params.item as never,
        { lifecycle: notification.method === 'item/completed' ? 'completed' : 'started' },
      ),
    }
  }
  return notification.params
}
