import type {
  AgentAttachment,
  AgentChatMessageMeta,
  AgentFeedMessage,
  AgentFeedMessagePage,
  AgentFeedMessageStatus,
  AgentRunActivity,
} from '@movscript/protocol'
import { isAgentVisibleAssistantMessage } from '@movscript/protocol'
import type {
  AgentInternalThreadSignal,
  AgentMessage,
  AgentRun,
  AgentSession,
  AgentTraceEvent,
  AgentThread,
} from '../../state/shared/types.js'

export interface RuntimeMessageFeedInput {
  threads: AgentThread[]
  runs: AgentRun[]
  before?: string
  limit?: unknown
  threadId?: string
}

export function buildRuntimeMessageFeedPage(input: RuntimeMessageFeedInput): AgentFeedMessagePage {
  const messages = buildRuntimeFeedMessages(input)
  const filtered = input.before
    ? messages.filter((message) => compareMessageCursor(message.cursor, input.before as string) < 0)
    : messages
  const limit = normalizeMessageFeedLimit(input.limit)
  const page = filtered.slice(Math.max(0, filtered.length - limit))
  const first = page[0]
  const hasMoreBefore = !!first && filtered.some((message) => compareMessageCursor(message.cursor, first.cursor) < 0)
  return {
    messages: page,
    ...(hasMoreBefore && first ? { nextBefore: first.cursor } : {}),
    hasMoreBefore,
    snapshotRevision: messages.reduce((max, message) => Math.max(max, message.revision), 0),
  }
}

export function buildRuntimeFeedMessages(input: RuntimeMessageFeedInput): AgentFeedMessage[] {
  const runsById = new Map(input.runs.map((run) => [run.id, run]))
  const runsBySourceMessageId = new Map<string, AgentRun>()
  const runsByAssistantMessageId = new Map<string, AgentRun>()
  for (const run of input.runs) {
    if (run.input?.sourceMessageId) runsBySourceMessageId.set(run.input.sourceMessageId, run)
    if (run.assistantMessageId) runsByAssistantMessageId.set(run.assistantMessageId, run)
  }
  const messages = input.threads
    .filter((thread) => !input.threadId || thread.id === input.threadId)
    .flatMap((thread) => thread.messages.map((message) => {
      const run = message.role === 'user'
        ? runsBySourceMessageId.get(message.id) ?? (message.runId ? runsById.get(message.runId) : undefined)
        : runsByAssistantMessageId.get(message.id) ?? (message.runId ? runsById.get(message.runId) : undefined)
      return feedMessageFromRuntimeMessage(message, thread, run)
    }))
  return dedupeFeedMessages(messages).sort(compareFeedMessages)
}

export function feedMessageFromRuntimeSignal(
  event: AgentInternalThreadSignal,
  input: {
    thread?: AgentThread
    session?: AgentSession
    run?: AgentRun
  } = {},
): AgentFeedMessage | undefined {
  const run = input.run ?? ('run' in event ? event.run : undefined)
  const thread = input.thread
  if (event.type === 'assistant_progress') {
    const threadId = event.threadId || run?.threadId
    if (!threadId || !event.accumulated.trim()) return undefined
    const createdAt = event.createdAt
    return withCursor({
      id: feedAssistantRunMessageId(event.runId),
      ...(input.session?.id || run?.sessionId ? { sessionId: input.session?.id ?? run?.sessionId } : {}),
      threadId,
      role: 'assistant',
      kind: 'text',
      content: event.accumulated,
      status: 'streaming',
      createdAt,
      updatedAt: createdAt,
      revision: revisionFromTimestamps(createdAt, run?.updatedAt),
      runtimeRefs: {
        ...(input.session?.id || run?.sessionId ? { sessionId: input.session?.id ?? run?.sessionId } : {}),
        threadId,
        runId: event.runId,
        traceId: event.traceEventId,
      },
    })
  }
  if (event.type === 'assistant_message') {
    return feedMessageFromRuntimeMessage(event.message, thread, event.run)
  }
  if (event.type === 'run' || event.type === 'done') {
    return undefined
  }
  return undefined
}

export function feedMessageFromRuntimeMessage(message: AgentMessage, thread?: Pick<AgentThread, 'sessionId'>, run?: AgentRun): AgentFeedMessage {
  const threadId = message.threadId
  const createdAt = message.createdAt
  const updatedAt = latestTimestamp(createdAt, run?.updatedAt)
  const attachments = attachmentsFromClientInput(message.clientInput)
  const meta = feedMetaFromRuntimeMessage(message)
  return withCursor({
    id: feedRuntimeMessageId(message, run),
    ...(thread?.sessionId || run?.sessionId ? { sessionId: thread?.sessionId ?? run?.sessionId } : {}),
    threadId,
    role: message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : 'system',
    kind: 'text',
    content: message.content,
    ...(attachments ? { attachments } : {}),
    ...(meta ? { meta } : {}),
    ...(shouldAttachRunActivityToFeedMessage(message, run) ? { activity: compactRunActivity(run) } : {}),
    ...(run ? { status: feedStatusFromRun(run) } : {}),
    createdAt,
    updatedAt,
    revision: revisionFromTimestamps(createdAt, run?.updatedAt),
    runtimeRefs: {
      ...(thread?.sessionId || run?.sessionId ? { sessionId: thread?.sessionId ?? run?.sessionId } : {}),
      threadId,
      messageId: message.id,
      ...(run?.id ?? message.runId ? { runId: run?.id ?? message.runId } : {}),
    },
  })
}

function shouldAttachRunActivityToFeedMessage(message: AgentMessage, run?: AgentRun): run is AgentRun {
  return isFinalAssistantFeedMessage(message, run)
}

function feedMetaFromRuntimeMessage(message: AgentMessage): AgentChatMessageMeta | undefined {
  const metadata = isRecord(message.metadata) ? message.metadata : undefined
  if (!metadata) return undefined
  const meta: AgentChatMessageMeta = {}
  if (isRecord(metadata.runtimeStatus)) {
    meta.runtimeStatus = metadata.runtimeStatus as unknown as AgentChatMessageMeta['runtimeStatus']
  }
  if (isRecord(metadata.contextDiagnostic)) {
    meta.contextDiagnostic = metadata.contextDiagnostic as unknown as AgentChatMessageMeta['contextDiagnostic']
  }
  if (isRecord(metadata.planRevision)) {
    meta.planRevision = metadata.planRevision as unknown as AgentChatMessageMeta['planRevision']
  }
  return Object.keys(meta).length > 0 ? meta : undefined
}

function compactRunActivity(run: AgentRun): AgentRunActivity {
  return {
    runId: run.id,
    threadId: run.threadId,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    ...(run.failedAt ? { failedAt: run.failedAt } : {}),
    ...(run.error ? { error: run.error } : {}),
    ...(run.warnings?.length ? { warnings: run.warnings } : {}),
    ...(run.pendingApprovals?.length
      ? {
          approvals: run.pendingApprovals.map((approval) => ({
            id: approval.id,
            runId: approval.runId,
            ...(approval.interactionId ? { interactionId: approval.interactionId } : {}),
            ...(approval.displayThreadId ? { displayThreadId: approval.displayThreadId } : {}),
            ...(approval.displayAnchor ? { displayAnchor: approval.displayAnchor } : {}),
            toolName: approval.toolName,
            reason: approval.reason,
            ...(approval.risk ? { risk: approval.risk } : {}),
            ...(approval.permission ? { permission: approval.permission } : {}),
            status: approval.status,
            createdAt: approval.createdAt,
            updatedAt: approval.updatedAt,
            ...(approval.approvedAt ? { approvedAt: approval.approvedAt } : {}),
            ...(approval.rejectedAt ? { rejectedAt: approval.rejectedAt } : {}),
          })),
        }
      : {}),
    ...(run.pendingInputRequests?.length
      ? {
          inputs: run.pendingInputRequests.map((request) => ({
            id: request.id,
            runId: request.runId,
            ...(request.displayThreadId ? { displayThreadId: request.displayThreadId } : {}),
            ...(request.displayAnchor ? { displayAnchor: request.displayAnchor } : {}),
            title: request.title,
            ...(request.summary ? { summary: request.summary } : {}),
            question: request.question,
            inputType: request.inputType,
            choices: request.choices,
            allowCustomAnswer: request.allowCustomAnswer,
            status: request.status,
            createdAt: request.createdAt,
            updatedAt: request.updatedAt,
            ...(request.answeredAt ? { answeredAt: request.answeredAt } : {}),
            ...(request.answer ? { answer: request.answer } : {}),
          })),
        }
      : {}),
    steps: (run.steps ?? [])
      .filter((step) => step.type === 'tool_call' || step.type === 'message')
      .map((step) => ({
        id: step.id,
        type: step.type,
        status: step.status,
        ...(step.roundId ? { roundId: step.roundId } : {}),
        ...(step.roundIndex !== undefined ? { roundIndex: step.roundIndex } : {}),
        ...(step.roundLabel ? { roundLabel: step.roundLabel } : {}),
        ...(step.roundSource ? { roundSource: step.roundSource } : {}),
        ...(step.title ? { title: step.title } : {}),
        ...(step.toolName ? { toolName: step.toolName } : {}),
        ...(step.error ? { error: step.error } : {}),
        ...(step.sandboxed ? { sandboxed: step.sandboxed } : {}),
        ...(typeof step.durationMs === 'number' ? { durationMs: step.durationMs } : {}),
        createdAt: step.createdAt,
        ...(step.completedAt ? { completedAt: step.completedAt } : {}),
      })),
    events: (run.traceEvents ?? [])
      .filter((trace) => trace.kind === 'tool_call'
        || trace.kind === 'model_call'
        || trace.kind === 'reasoning'
        || trace.kind === 'context'
        || trace.kind === 'memory'
        || trace.kind === 'permission'
        || trace.kind === 'tool_catalog'
        || trace.kind === 'message'
        || trace.kind === 'assistant'
        || trace.kind === 'run'
        || trace.kind === 'approval'
        || trace.kind === 'input')
      .map((trace) => compactRunActivityEvent(trace, run)),
  }
}

function compactRunActivityEvent(
  trace: AgentTraceEvent,
  run: AgentRun,
): AgentRunActivity['events'][number] {
  const data = compactFeedTraceData(trace.data)
  return {
    id: trace.id,
    runId: trace.runId,
    threadId: run.threadId,
    kind: trace.kind,
    title: trace.title,
    status: trace.status,
    ...(trace.roundId ? { roundId: trace.roundId } : {}),
    ...(trace.roundIndex !== undefined ? { roundIndex: trace.roundIndex } : {}),
    ...(trace.roundLabel ? { roundLabel: trace.roundLabel } : {}),
    ...(trace.roundSource ? { roundSource: trace.roundSource } : {}),
    ...(trace.summary ? { summary: trace.summary } : {}),
    ...(trace.toolName ? { toolName: trace.toolName } : {}),
    ...(trace.stepId ? { stepId: trace.stepId } : {}),
    ...(data !== undefined ? { data } : {}),
    ...(typeof trace.durationMs === 'number' ? { durationMs: trace.durationMs } : {}),
    createdAt: trace.createdAt,
    ...(trace.completedAt ? { completedAt: trace.completedAt } : {}),
  }
}

function compactFeedTraceData(data: unknown): Record<string, unknown> | undefined {
  if (!isRecord(data)) return undefined
  const generation = compactGenerationTraceData(data.generation)
  if (!generation) return undefined
  return { generation }
}

function compactGenerationTraceData(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  const generation: Record<string, unknown> = {}
  for (const key of [
    'jobId',
    'jobType',
    'providerName',
    'modelDisplay',
    'modelIdentifier',
    'modelConfigId',
    'status',
    'stage',
    'progress',
    'terminal',
    'outputResourceId',
    'output_resource_id',
    'message',
  ]) {
    const item = value[key]
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') generation[key] = item
  }
  const outputResourceIds = primitiveArray(value.outputResourceIds) ?? primitiveArray(value.output_resource_ids)
  if (outputResourceIds?.length) generation.outputResourceIds = outputResourceIds
  return Object.keys(generation).length > 0 ? generation : undefined
}

function primitiveArray(value: unknown): Array<string | number | boolean> | undefined {
  if (!Array.isArray(value)) return undefined
  const values = value.filter((item): item is string | number | boolean => (
    typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
  ))
  return values.length > 0 ? values : undefined
}

export function normalizeMessageFeedLimit(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return 10
  return Math.max(1, Math.min(100, Math.floor(parsed)))
}

export function compareFeedMessages(left: AgentFeedMessage, right: AgentFeedMessage): number {
  return compareMessageCursor(left.cursor, right.cursor)
}

export function compareMessageCursor(left: string, right: string): number {
  const leftParts = parseMessageCursor(left)
  const rightParts = parseMessageCursor(right)
  if (leftParts.time !== rightParts.time) return leftParts.time < rightParts.time ? -1 : 1
  if (leftParts.id === rightParts.id) return 0
  return leftParts.id < rightParts.id ? -1 : 1
}

function withCursor(message: Omit<AgentFeedMessage, 'cursor'>): AgentFeedMessage {
  return {
    ...message,
    cursor: messageCursor(message),
  }
}

function messageCursor(message: Omit<AgentFeedMessage, 'cursor'>): string {
  return `${Date.parse(message.createdAt) || 0}:${messageCursorRank(message)}:${encodeURIComponent(message.id)}`
}

function messageCursorRank(message: Omit<AgentFeedMessage, 'cursor'>): string {
  if (message.role === 'system') return '00'
  if (message.role === 'user') return '10'
  if (message.role === 'assistant' && message.id.startsWith('message:')) return '20'
  if (message.role === 'assistant') return '30'
  if (message.role === 'tool') return '40'
  return '50'
}

function parseMessageCursor(cursor: string): { time: number; id: string } {
  const [time, ...rest] = cursor.split(':')
  return {
    time: Number(time) || 0,
    id: decodeURIComponent(rest.join(':')),
  }
}

function feedRuntimeMessageId(message: AgentMessage, run?: AgentRun): string {
  if (isFinalAssistantFeedMessage(message, run)) return feedAssistantRunMessageId(run.id)
  return `message:${message.id}`
}

function feedAssistantRunMessageId(runId: string): string {
  return `assistant:${runId}`
}

function isFinalAssistantFeedMessage(message: AgentMessage, run?: AgentRun): run is AgentRun {
  return isAgentVisibleAssistantMessage(message)
    && !!run
    && run.assistantMessageId === message.id
}

function feedStatusFromRun(run: AgentRun): AgentFeedMessageStatus {
  if (run.status === 'queued') return 'pending'
  if (run.status === 'in_progress') return 'streaming'
  if (run.status === 'failed') return 'failed'
  if (run.status === 'cancelled') return 'cancelled'
  if (run.status === 'requires_action') return 'requires_action'
  return 'completed'
}

function revisionFromTimestamps(...values: Array<string | undefined>): number {
  return values.reduce((max, value) => Math.max(max, value ? Date.parse(value) || 0 : 0), 0)
}

function latestTimestamp(...values: Array<string | undefined>): string {
  const sorted = values.filter(Boolean).sort()
  return sorted.at(-1) ?? new Date(0).toISOString()
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

function attachmentKind(mimeType: string, fallbackName = ''): AgentAttachment['type'] {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (/\.(heic|heif)$/i.test(fallbackName)) return 'image'
  if (mimeType.startsWith('text/') || /\.(txt|md|json|csv|srt)$/i.test(fallbackName)) return 'text'
  return 'file'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function dedupeFeedMessages(messages: AgentFeedMessage[]): AgentFeedMessage[] {
  const byId = new Map<string, AgentFeedMessage>()
  for (const message of messages) {
    const previous = byId.get(message.id)
    if (!previous || message.revision >= previous.revision) byId.set(message.id, message)
  }
  return [...byId.values()]
}
