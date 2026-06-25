import type { AgentAttachment, AgentChatMessage, AgentConversation, AgentConversationWorkspace, AgentConversationWorkspaceContext } from '@movscript/agent-protocol'
import type {
  AgentConversationNormalizeOptions,
  AgentConversationShape,
  AgentConversationTranscriptMessageShape,
  AgentConversationWorkspaceShape,
  AgentUserConversationState,
} from './agentConversationTypes'
import { createNormalizedId, isRecord, numberOrFallback, numberOrUndefined } from './agentConversationUtils'

export function normalizeConvsByUser<
  Conversation extends AgentConversationShape = AgentConversation,
  Workspace extends AgentConversationWorkspaceShape = AgentConversationWorkspace,
>(
  value: unknown,
  options: AgentConversationNormalizeOptions = {},
): Record<string, AgentUserConversationState<Conversation, Workspace>> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).map(([userId, state]) => {
      const record = isRecord(state) ? state : {}
      const conversations = normalizeConversations<Conversation>(record.conversations, options)
      const activeConversationId = typeof record.activeConversationId === 'string'
        && conversations.some((conversation) => conversation.id === record.activeConversationId)
        ? record.activeConversationId
        : conversations[0]?.id ?? null
      return [userId, {
        conversations,
        activeConversationId,
        workspacesByConversation: normalizeWorkspacesByConversation<Workspace>(record.workspacesByConversation, options),
      }]
    }),
  )
}

export function normalizeConversations<Conversation extends AgentConversationShape = AgentConversation>(
  value: unknown,
  options: AgentConversationNormalizeOptions = {},
): Conversation[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map((conversation) => {
      const now = options.now?.() ?? Date.now()
      const id = typeof conversation.id === 'string' && conversation.id ? conversation.id : createNormalizedId(options)
      const transcriptMessages = normalizeTranscriptMessages(conversation.transcriptMessages, options)
      const providerSessionId = typeof conversation.providerSessionId === 'string' && conversation.providerSessionId.trim()
        ? conversation.providerSessionId.trim()
        : undefined
      return {
        id,
        title: typeof conversation.title === 'string' && conversation.title.trim() ? conversation.title : options.defaultTitle ?? 'New conversation',
        transcriptMessages,
        ...(providerSessionId ? { providerSessionId } : {}),
        ...(typeof conversation.providerThreadId === 'string' && conversation.providerThreadId.trim() ? { providerThreadId: conversation.providerThreadId.trim() } : {}),
        ...(conversation.archived === true ? { archived: true } : {}),
        createdAt: numberOrFallback(conversation.createdAt, transcriptMessages[0]?.timestamp ?? now),
        updatedAt: numberOrFallback(conversation.updatedAt, transcriptMessages[transcriptMessages.length - 1]?.timestamp ?? now),
      } as Conversation
    })
}

export function normalizeTranscriptMessages<Message extends AgentConversationTranscriptMessageShape = AgentChatMessage>(
  value: unknown,
  options: AgentConversationNormalizeOptions = {},
): Message[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map((message) => {
      const role = message.role === 'assistant' ? 'assistant' : 'user'
      return {
        id: typeof message.id === 'string' && message.id ? message.id : createNormalizedId(options),
        role,
        content: typeof message.content === 'string' ? message.content : '',
        timestamp: numberOrFallback(message.timestamp, options.now?.() ?? Date.now()),
        ...(Array.isArray(message.attachments) ? { attachments: normalizeAttachments(message.attachments, options) } : {}),
        ...(isRecord(message.meta) ? { meta: message.meta } : {}),
      } as Message
    })
}

export function normalizeWorkspacesByConversation<Workspace extends AgentConversationWorkspaceShape = AgentConversationWorkspace>(
  value: unknown,
  options: AgentConversationNormalizeOptions = {},
): Record<string, Workspace> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .flatMap(([conversationId, workspace]) => {
        if (!isRecord(workspace)) return []
        const workspaceContext = normalizeConversationWorkspaceContext(workspace.workspaceContext)
        return [[conversationId, {
          input: typeof workspace.input === 'string' ? workspace.input : '',
          attachments: normalizeAttachments(workspace.attachments, options),
          ...(workspaceContext ? { workspaceContext } : {}),
        } as Workspace]]
      }),
  )
}

function stringOrNumber(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function normalizeConversationWorkspaceContext(value: unknown): AgentConversationWorkspaceContext | undefined {
  if (!isRecord(value)) return undefined
  const realm = normalizeConversationWorkspaceRealm(value.realm)
  const realmKind = value.realmKind === 'local' || value.realmKind === 'cloud' ? value.realmKind : undefined
  const realmId = stringOrNumber(value.realmId)
  const scope = value.scope === 'production' || value.scope === 'project' || value.scope === 'global'
    ? value.scope
    : undefined
  const userId = stringOrNumber(value.userId)
  const orgId = stringOrNumber(value.orgId)
  const projectId = stringOrNumber(value.projectId)
  const productionId = stringOrNumber(value.productionId)
  const realmFields: Pick<AgentConversationWorkspaceContext, 'realm' | 'realmKind' | 'realmId'> = {
    ...(realm ? { realm } : {}),
    ...(realmKind ? { realmKind } : {}),
    ...(realmId !== undefined ? { realmId } : {}),
  }
  const ownerFields = {
    ...(userId !== undefined ? { userId } : {}),
    ...(orgId !== undefined ? { orgId } : {}),
  }
  if (!scope && !realm && realmKind === undefined && realmId === undefined && userId === undefined && orgId === undefined && projectId === undefined && productionId === undefined) return undefined
  if (scope === 'production' && projectId !== undefined && productionId !== undefined) {
    return {
      ...realmFields,
      scope,
      ...ownerFields,
      projectId,
      productionId,
    }
  }
  if ((scope === 'project' || projectId !== undefined) && projectId !== undefined) {
    return {
      ...realmFields,
      scope: 'project',
      ...ownerFields,
      projectId,
    }
  }
  return {
    ...realmFields,
    scope: 'global',
    ...ownerFields,
  }
}

function normalizeConversationWorkspaceRealm(value: unknown): AgentConversationWorkspaceContext['realm'] | undefined {
  if (!isRecord(value)) return undefined
  const kind = value.kind === 'local' || value.kind === 'cloud' ? value.kind : undefined
  const id = stringOrNumber(value.id)
  return kind && id !== undefined ? { kind, id: String(id) } : undefined
}

export function normalizeAttachments<Attachment extends AgentAttachment = AgentAttachment>(
  value: unknown,
  options: AgentConversationNormalizeOptions = {},
): Attachment[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map((attachment) => normalizeAttachment<Attachment>(attachment, options))
}

export function normalizeAttachment<Attachment extends AgentAttachment = AgentAttachment>(
  attachment: Record<string, unknown>,
  options: AgentConversationNormalizeOptions = {},
): Attachment {
  const resourceId = numberOrUndefined(attachment.resourceId)
  const type = normalizeAttachmentType(attachment.type)
  const url = normalizeAttachmentUrl(typeof attachment.url === 'string' ? attachment.url : undefined, resourceId)
  return {
    id: typeof attachment.id === 'string' && attachment.id ? attachment.id : resourceId !== undefined ? `res-${resourceId}` : createNormalizedId(options),
    name: typeof attachment.name === 'string' && attachment.name.trim() ? attachment.name : resourceId !== undefined ? `resource-${resourceId}` : 'attachment',
    type,
    mimeType: typeof attachment.mimeType === 'string' && attachment.mimeType ? attachment.mimeType : defaultMimeType(type),
    size: numberOrFallback(attachment.size, 0),
    ...(url ? { url } : {}),
    ...(resourceId !== undefined ? { resourceId } : {}),
    ...(isRecord(attachment.generated) ? { generated: attachment.generated as AgentAttachment['generated'] } : {}),
  } as Attachment
}

function normalizeAttachmentUrl(url: string | undefined, resourceId: number | undefined): string | undefined {
  if (resourceId !== undefined && (!url || url.startsWith('blob:') || url.startsWith('data:'))) {
    return `/api/v1/resources/${resourceId}/file`
  }
  return url
}

function normalizeAttachmentType(value: unknown): AgentAttachment['type'] {
  return value === 'image' || value === 'video' || value === 'audio' || value === 'text' || value === 'file' ? value : 'file'
}

function defaultMimeType(type: AgentAttachment['type']): string {
  if (type === 'image') return 'image/png'
  if (type === 'video') return 'video/mp4'
  if (type === 'audio') return 'audio/mpeg'
  if (type === 'text') return 'text/plain'
  return 'application/octet-stream'
}
