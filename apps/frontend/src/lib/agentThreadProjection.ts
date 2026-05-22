import { assistantResultPayloadForRun, type AgentMessageViewModelDeps } from '@/lib/agentMessageViewModel'
import { attachmentKind } from '@/lib/agentAttachments'
import { formatLocalAgentAssistantContent } from '@/lib/localAgentResult'
import { isRecord } from '@/lib/jsonValue'
import type { AgentMessage, AgentPlanRevision, AgentRun, AgentThread } from '@/lib/localAgentClient'
import type { AgentAttachment, ChatMessage, ChatMessageMeta, ChatRunActivityEvent } from '@/store/agentStore'

export interface RuntimeThreadProjectionInput {
  thread: AgentThread
  runs?: AgentRun[]
  existingMessages?: ChatMessage[]
  liveEventsByRunId?: Record<string, ChatRunActivityEvent[]>
  deps?: AgentMessageViewModelDeps
}

export async function projectRuntimeThreadMessages(input: RuntimeThreadProjectionInput): Promise<ChatMessage[]> {
  const runs = [...(input.runs ?? [])].filter(isTopLevelUserFacingRun)
  const existingByRuntimeMessageId = existingRuntimeMessageMap(input.existingMessages ?? [], input.thread.id)
  const existingLocalUserEchoesByKey = existingLocalUserEchoMap(input.existingMessages ?? [])
  const existingAssistantByRuntimeRunId = existingAssistantRuntimeRunMap(input.existingMessages ?? [], input.thread.id)
  const runsBySourceMessageId = new Map<string, AgentRun>()
  const runsByAssistantMessageId = new Map<string, AgentRun>()
  const runsById = new Map<string, AgentRun>()
  for (const run of runs) {
    runsById.set(run.id, run)
    if (run.input?.sourceMessageId) runsBySourceMessageId.set(run.input.sourceMessageId, run)
    if (run.assistantMessageId) runsByAssistantMessageId.set(run.assistantMessageId, run)
  }

  const projectedAssistantRunIds = new Set<string>()
  const messages: ChatMessage[] = []
  for (const message of [...input.thread.messages].sort(compareRuntimeMessages)) {
    if (message.role !== 'user' && message.role !== 'assistant') continue
    const run = message.role === 'user'
      ? runsBySourceMessageId.get(message.id)
      : runsByAssistantMessageId.get(message.id) ?? (message.runId ? runsById.get(message.runId) : undefined)
    if (message.role === 'assistant' && run) projectedAssistantRunIds.add(run.id)
    messages.push(await projectRuntimeMessage({
      message,
      run,
      existing: existingByRuntimeMessageId.get(message.id) ?? (message.role === 'user' ? consumeExistingLocalUserEcho(existingLocalUserEchoesByKey, message) : undefined),
      liveEvents: run ? input.liveEventsByRunId?.[run.id] : undefined,
      deps: input.deps,
    }))
  }

  for (const run of runs.sort(compareRuns)) {
    if (projectedAssistantRunIds.has(run.id)) continue
    const content = formatLocalAgentAssistantContent(run, input.thread)
    const existing = existingAssistantByRuntimeRunId.get(run.id)
    const payload = await assistantResultPayloadForRun(run, input.liveEventsByRunId?.[run.id] ?? [], content, input.deps)
    messages.push({
      id: existing?.id ?? `runtime-run:${run.id}:assistant`,
      role: 'assistant',
      content,
      attachments: payload.attachments ?? existing?.attachments,
      meta: {
        ...existing?.meta,
        ...payload.meta,
      },
      timestamp: runtimeTimestamp(run.completedAt ?? run.failedAt ?? run.cancelledAt ?? run.updatedAt ?? run.createdAt),
    })
  }

  return messages.sort((a, b) => a.timestamp - b.timestamp)
}

export function mergeProjectedRuntimeMessages(existingMessages: ChatMessage[], projectedMessages: ChatMessage[], threadId: string): ChatMessage[] {
  const projected = dedupeProjectedRuntimeMessages(projectedMessages)
  const projectedIds = new Set(projected.map((message) => message.id))
  const projectedRuntimeContentKeys = new Set(projected
    .filter(isRuntimeProjectedMessage)
    .map(runtimeContentKey))
  return [
    ...existingMessages.filter((message) => !isReplacedByRuntimeProjection(message, threadId, projectedIds, projectedRuntimeContentKeys)),
    ...projected,
  ].sort((a, b) => a.timestamp - b.timestamp)
}

function isReplacedByRuntimeProjection(
  message: ChatMessage,
  threadId: string,
  projectedIds: Set<string>,
  projectedRuntimeContentKeys: Set<string>,
): boolean {
  if (message.meta?.runtimeMessage?.threadId === threadId) return true
  if (projectedIds.has(message.id)) return true
  if (!isRuntimeGeneratedLocalMessage(message)) return false
  return projectedRuntimeContentKeys.has(runtimeContentKey(message))
}

function isRuntimeProjectedMessage(message: ChatMessage): boolean {
  return message.id.startsWith('runtime:')
    || message.id.startsWith('runtime-run:')
    || !!message.meta?.runtimeMessage
}

function isRuntimeGeneratedLocalMessage(message: ChatMessage): boolean {
  if (isRuntimeProjectedMessage(message)) return true
  const meta = message.meta
  return !!meta?.localRunActivity
    || !!meta?.generationJobs?.length
    || !!meta?.draftArtifacts?.length
    || !!meta?.contextLabels?.some((label) => /^run\s+\S+/i.test(label))
}

function runtimeContentKey(message: ChatMessage): string {
  return `${message.role}:${message.content.trim()}`
}

function dedupeProjectedRuntimeMessages(messages: ChatMessage[]): ChatMessage[] {
  const byKey = new Map<string, ChatMessage>()
  const passthrough: ChatMessage[] = []
  for (const message of messages) {
    const key = runtimeAssistantResultKey(message)
    if (!key) {
      passthrough.push(message)
      continue
    }
    const existing = byKey.get(key)
    byKey.set(key, existing ? richerRuntimeMessage(existing, message) : message)
  }
  return [...passthrough, ...byKey.values()].sort((a, b) => a.timestamp - b.timestamp)
}

function runtimeAssistantResultKey(message: ChatMessage): string | undefined {
  const runtime = message.meta?.runtimeMessage
  if (message.meta?.planRevision) return undefined
  if (message.role !== 'assistant' || !runtime?.threadId || !runtime.runId) return undefined
  return `${runtime.threadId}:${runtime.runId}`
}

function richerRuntimeMessage(left: ChatMessage, right: ChatMessage): ChatMessage {
  const leftHasMessageId = !!left.meta?.runtimeMessage?.messageId
  const rightHasMessageId = !!right.meta?.runtimeMessage?.messageId
  const preferred = leftHasMessageId !== rightHasMessageId
    ? leftHasMessageId ? left : right
    : runtimeMessageScore(right) >= runtimeMessageScore(left) ? right : left
  const fallback = preferred === right ? left : right
  const runtimeMessage = preferred.meta?.runtimeMessage ?? fallback.meta?.runtimeMessage
  return {
    ...preferred,
    content: preferred.content || fallback.content,
    attachments: preferred.attachments ?? fallback.attachments,
    meta: {
      ...fallback.meta,
      ...preferred.meta,
      ...(runtimeMessage ? { runtimeMessage } : {}),
    },
  }
}

function runtimeMessageScore(message: ChatMessage): number {
  const meta = message.meta
  let score = 0
  if (meta?.runtimeMessage?.messageId) score += 3
  if (meta?.localRunActivity) score += 2
  if (meta?.generationJobs?.length) score += 1
  if (meta?.draftArtifacts?.length) score += 1
  if (message.attachments?.length) score += 1
  return score
}

async function projectRuntimeMessage(input: {
  message: AgentMessage
  run?: AgentRun
  existing?: ChatMessage
  liveEvents?: ChatRunActivityEvent[]
  deps?: AgentMessageViewModelDeps
}): Promise<ChatMessage> {
  const timestamp = runtimeTimestamp(input.message.createdAt)
  const baseMeta: ChatMessageMeta = {
    ...input.existing?.meta,
    ...planRevisionMeta(input.message.metadata),
    runtimeMessage: {
      threadId: input.message.threadId,
      messageId: input.message.id,
      ...(input.run ? { runId: input.run.id } : {}),
    },
  }
  if (input.message.role === 'assistant' && input.run) {
    if (baseMeta.planRevision) {
      return {
        id: input.existing?.id ?? `runtime:${input.message.id}`,
        role: 'assistant',
        content: input.message.content,
        attachments: input.existing?.attachments,
        meta: baseMeta,
        timestamp,
      }
    }
    const payload = await assistantResultPayloadForRun(input.run, input.liveEvents ?? [], input.message.content, input.deps)
    return {
      id: input.existing?.id ?? `runtime:${input.message.id}`,
      role: 'assistant',
      content: input.message.content,
      attachments: payload.attachments ?? input.existing?.attachments,
      meta: {
        ...baseMeta,
        ...payload.meta,
        runtimeMessage: baseMeta.runtimeMessage,
      },
      timestamp,
    }
  }
  return {
    id: input.existing?.id ?? `runtime:${input.message.id}`,
    role: input.message.role === 'assistant' ? 'assistant' : 'user',
    content: input.message.content,
    attachments: input.existing?.attachments ?? attachmentsFromClientInput(input.message.clientInput),
    meta: baseMeta,
    timestamp,
  }
}

function planRevisionMeta(metadata: AgentMessage['metadata']): Pick<ChatMessageMeta, 'planRevision'> {
  if (!isRecord(metadata) || metadata.kind !== 'plan_revision') return {}
  const revision = metadata.planRevision
  if (!isPlanRevision(revision)) return {}
  return { planRevision: revision }
}

function isPlanRevision(value: unknown): value is AgentPlanRevision {
  if (!isRecord(value) || value.schema !== 'movscript.agent.plan-revision.v1') return false
  if (typeof value.id !== 'string' || typeof value.planId !== 'string' || typeof value.threadId !== 'string') return false
  if (typeof value.createdAt !== 'string' || !isRecord(value.snapshot)) return false
  const snapshot = value.snapshot
  if (snapshot.schema !== 'movscript.agent.plan.v1') return false
  if (typeof snapshot.id !== 'string' || typeof snapshot.threadId !== 'string') return false
  if (!Array.isArray(snapshot.items)) return false
  return snapshot.items.every((item) => (
    isRecord(item)
    && typeof item.step === 'string'
    && (item.status === 'pending' || item.status === 'in_progress' || item.status === 'completed')
  ))
}

function attachmentsFromClientInput(clientInput: unknown): AgentAttachment[] | undefined {
  if (!isRecord(clientInput) || !Array.isArray(clientInput.attachments)) return undefined
  const attachments = clientInput.attachments
    .filter(isRecord)
    .map((attachment, index): AgentAttachment => {
      const name = typeof attachment.name === 'string' && attachment.name.trim() ? attachment.name.trim() : `attachment-${index + 1}`
      const mimeType = typeof attachment.mimeType === 'string' && attachment.mimeType.trim() ? attachment.mimeType.trim() : 'application/octet-stream'
      const resourceId = typeof attachment.resourceId === 'number' && Number.isFinite(attachment.resourceId) ? attachment.resourceId : undefined
      return {
        id: typeof attachment.id === 'string' && attachment.id.trim()
          ? attachment.id.trim()
          : resourceId !== undefined ? `resource-${resourceId}` : `runtime-attachment-${index + 1}`,
        name,
        type: attachmentKind(mimeType, name),
        mimeType,
        size: typeof attachment.size === 'number' && Number.isFinite(attachment.size) ? attachment.size : 0,
        ...(resourceId !== undefined ? { resourceId } : {}),
      }
    })
  return attachments.length > 0 ? attachments : undefined
}

function existingRuntimeMessageMap(messages: ChatMessage[], threadId: string): Map<string, ChatMessage> {
  const byRuntimeId = new Map<string, ChatMessage>()
  for (const message of messages) {
    const runtime = message.meta?.runtimeMessage
    if (runtime?.threadId !== threadId || !runtime.messageId) continue
    byRuntimeId.set(runtime.messageId, message)
  }
  return byRuntimeId
}

function existingLocalUserEchoMap(messages: ChatMessage[]): Map<string, ChatMessage[]> {
  const byKey = new Map<string, ChatMessage[]>()
  for (const message of messages) {
    if (!isLocalRuntimeUserEcho(message)) continue
    const key = localUserEchoKeyFromText(message.content)
    if (!key) continue
    const list = byKey.get(key) ?? []
    list.push(message)
    byKey.set(key, list)
  }
  for (const list of byKey.values()) {
    list.sort((a, b) => a.timestamp - b.timestamp)
  }
  return byKey
}

function consumeExistingLocalUserEcho(byKey: Map<string, ChatMessage[]>, message: AgentMessage): ChatMessage | undefined {
  const key = runtimeUserEchoKey(message)
  if (!key) return undefined
  return byKey.get(key)?.shift()
}

function isLocalRuntimeUserEcho(message: ChatMessage): boolean {
  const meta = message.meta
  return message.role === 'user'
    && !meta?.runtimeMessage
    && (!!meta?.agentName || meta?.modelId !== undefined || !!meta?.permissionMode)
}

function runtimeUserEchoKey(message: AgentMessage): string {
  const clientInput = isRecord(message.clientInput) ? message.clientInput : undefined
  const visibleMessage = typeof clientInput?.visibleMessage === 'string' && clientInput.visibleMessage.trim()
    ? clientInput.visibleMessage
    : typeof clientInput?.message === 'string'
      ? clientInput.message
      : message.content
  return localUserEchoKeyFromText(visibleMessage)
}

function localUserEchoKeyFromText(text: string): string {
  return text
    .split(/\n\n\[(?:用户附件引用|用户随消息提供的附件)\]/)[0]
    .replace(/\s+/g, ' ')
    .trim()
}

function existingAssistantRuntimeRunMap(messages: ChatMessage[], threadId: string): Map<string, ChatMessage> {
  const byRunId = new Map<string, ChatMessage>()
  for (const message of messages) {
    const runtime = message.meta?.runtimeMessage
    if (message.role !== 'assistant' || runtime?.threadId !== threadId || !runtime.runId) continue
    byRunId.set(runtime.runId, message)
  }
  return byRunId
}

function isTopLevelUserFacingRun(run: AgentRun): boolean {
  return run.role !== 'worker' && !run.parentRunId
}

function compareRuntimeMessages(a: AgentMessage, b: AgentMessage): number {
  return runtimeTimestamp(a.createdAt) - runtimeTimestamp(b.createdAt)
}

function compareRuns(a: AgentRun, b: AgentRun): number {
  return runtimeTimestamp(a.createdAt) - runtimeTimestamp(b.createdAt)
}

function runtimeTimestamp(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}
