import type {
  AgentAttachment,
  AgentTimelineItem,
  AgentTimelineMeta,
  AgentTimelinePage,
  AgentTimelineActivity,
  AgentTimelineOrigin,
  AgentTimelineContentPromptEligibility,
  AgentTimelinePurpose,
  AgentTimelineSurface,
} from '@movscript/protocol'
import { agentTimelineStatusFromRunStatus, isAgentTranscriptAssistantMessage } from '@movscript/protocol'
import type {
  AgentContextDiagnosticRecord,
  AgentInternalThreadSignal,
  AgentMessage,
  AgentPlanRevision,
  AgentRun,
  AgentRuntimeStatusRecord,
  AgentSession,
  AgentTraceEvent,
  AgentThread,
} from '../../state/shared/types.js'

export interface RuntimeTimelineInput {
  threads: AgentThread[]
  runs: AgentRun[]
  before?: string
  limit?: unknown
  threadId?: string
}

type AgentTimelineItemDraft = Omit<
  AgentTimelineItem,
  'cursor'
>

export function buildRuntimeTimelinePage(input: RuntimeTimelineInput): AgentTimelinePage {
  const items = buildRuntimeTimelineItems(input)
  const filtered = input.before
    ? items.filter((item) => compareTimelineCursor(item.cursor, input.before as string) < 0)
    : items
  const limit = normalizeTimelineLimit(input.limit)
  const page = filtered.slice(Math.max(0, filtered.length - limit))
  const first = page[0]
  const hasMoreBefore = !!first && filtered.some((item) => compareTimelineCursor(item.cursor, first.cursor) < 0)
  return {
    items: page,
    ...(hasMoreBefore && first ? { nextBefore: first.cursor } : {}),
    hasMoreBefore,
    snapshotRevision: items.reduce((max, item) => Math.max(max, item.revision), 0),
  }
}

export function buildRuntimeTimelineItems(input: RuntimeTimelineInput): AgentTimelineItem[] {
  const runsById = new Map(input.runs.map((run) => [run.id, run]))
  const runsBySourceMessageId = new Map<string, AgentRun>()
  const runsByAssistantMessageId = new Map<string, AgentRun>()
  for (const run of input.runs) {
    if (run.input?.sourceMessageId) runsBySourceMessageId.set(run.input.sourceMessageId, run)
    if (run.assistantMessageId) runsByAssistantMessageId.set(run.assistantMessageId, run)
  }
  const items = input.threads
    .filter((thread) => !input.threadId || thread.id === input.threadId)
    .flatMap((thread) => [
      ...thread.messages.map((message) => {
        const run = message.role === 'user'
          ? runsBySourceMessageId.get(message.id) ?? (message.runId ? runsById.get(message.runId) : undefined)
          : runsByAssistantMessageId.get(message.id) ?? (message.runId ? runsById.get(message.runId) : undefined)
        return timelineItemFromRuntimeMessage(message, thread, run)
      }),
      ...(thread.planRevisions ?? []).map((revision) => timelineItemFromPlanRevision(revision, thread, revision.runId ? runsById.get(revision.runId) : undefined)),
      ...(thread.runtimeStatuses ?? []).flatMap((status) => status.status.kind === 'status_light' ? [] : [timelineItemFromRuntimeStatus(status, thread, status.runId ? runsById.get(status.runId) : undefined)]),
      ...(thread.contextDiagnostics ?? []).map((diagnostic) => timelineItemFromContextDiagnostic(diagnostic, thread, diagnostic.runId ? runsById.get(diagnostic.runId) : undefined)),
    ])
  return dedupeTimelineItems(items).sort(compareTimelineItems)
}

export function timelineItemFromRuntimeSignal(
  event: AgentInternalThreadSignal,
  input: {
    thread?: AgentThread
    session?: AgentSession
    run?: AgentRun
    traceEvents?: AgentTraceEvent[]
  } = {},
): AgentTimelineItem | undefined {
  const run = input.run ?? ('run' in event ? event.run : undefined)
  const thread = input.thread
  if (event.type === 'assistant_progress') {
    const threadId = event.threadId || run?.threadId
    if (!threadId || !event.accumulated.trim()) return undefined
    const createdAt = event.createdAt
    return withCursor({
      id: assistantTimelineItemIdForRun(event.runId),
      ...(input.session?.id || run?.sessionId ? { sessionId: input.session?.id ?? run?.sessionId } : {}),
      threadId,
      origin: 'agent',
      purpose: 'transcript',
      surface: 'message_stream',
      contentPromptEligibility: 'exclude',
      sortRank: 50,
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
    return timelineItemFromRuntimeMessage(event.message, thread, event.run)
  }
  if (event.type === 'trace' && run && thread) {
    const planRevision = planRevisionFromTraceSignal(event.event, thread)
    if (planRevision) return timelineItemFromPlanRevision(planRevision, thread, run)
    return timelineItemFromRunActivity(run, thread, input.traceEvents ?? [event.event])
  }
  if (event.type === 'run' || event.type === 'done') {
    if (!run || !thread) return undefined
    return timelineItemFromRunActivity(run, thread, input.traceEvents ?? [])
  }
  return undefined
}

export function timelineItemFromRuntimeMessage(message: AgentMessage, thread?: Pick<AgentThread, 'sessionId'>, run?: AgentRun): AgentTimelineItem {
  const threadId = message.threadId
  const createdAt = message.createdAt
  const updatedAt = latestTimestamp(createdAt, run?.updatedAt)
  const attachments = attachmentsFromClientInput(message.clientInput)
  const semantics = timelineSemanticsFromRuntimeMessage(message)
  return withCursor({
    id: runtimeTimelineItemId(message, run),
    ...(thread?.sessionId || run?.sessionId ? { sessionId: thread?.sessionId ?? run?.sessionId } : {}),
    threadId,
    ...semantics,
    content: message.content,
    ...(attachments ? { attachments } : {}),
    ...(shouldAttachRunActivityToTimelineItem(message, run) ? { activity: compactRunActivity(run) } : {}),
    ...(run ? { status: agentTimelineStatusFromRunStatus(run.status) } : {}),
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

function timelineItemFromPlanRevision(
  revision: AgentPlanRevision,
  thread: Pick<AgentThread, 'id' | 'sessionId'>,
  run?: AgentRun,
): AgentTimelineItem {
  const createdAt = revision.createdAt
  return withCursor({
    id: `plan:${revision.id}`,
    ...(thread.sessionId || run?.sessionId ? { sessionId: thread.sessionId ?? run?.sessionId } : {}),
    threadId: thread.id,
    origin: 'system_runtime',
    purpose: 'status',
    surface: 'status_strip',
    contentPromptEligibility: 'exclude',
    sortRank: 20,
    content: revision.explanation ?? 'Plan updated',
    meta: { planRevision: revision },
    status: 'completed',
    createdAt,
    updatedAt: latestTimestamp(createdAt, run?.updatedAt),
    revision: revisionFromTimestamps(createdAt, run?.updatedAt),
    runtimeRefs: {
      ...(thread.sessionId || run?.sessionId ? { sessionId: thread.sessionId ?? run?.sessionId } : {}),
      threadId: thread.id,
      ...(revision.runId ? { runId: revision.runId } : {}),
    },
  })
}

function planRevisionFromTraceSignal(trace: AgentTraceEvent, thread: AgentThread): AgentPlanRevision | undefined {
  if (trace.kind !== 'tool_call' || trace.toolName !== 'core_update_plan') return undefined
  return [...(thread.planRevisions ?? [])]
    .reverse()
    .find((revision) => revision.runId === trace.runId)
}

function timelineItemFromRuntimeStatus(
  status: AgentRuntimeStatusRecord,
  thread: Pick<AgentThread, 'id' | 'sessionId'>,
  run?: AgentRun,
): AgentTimelineItem {
  const createdAt = status.createdAt
  return withCursor({
    id: `runtime-status:${status.id}`,
    ...(thread.sessionId || run?.sessionId ? { sessionId: thread.sessionId ?? run?.sessionId } : {}),
    threadId: thread.id,
    origin: 'system_runtime',
    purpose: 'status',
    surface: 'status_strip',
    contentPromptEligibility: 'exclude',
    sortRank: 20,
    content: status.content,
    meta: { runtimeStatus: status.status },
    status: 'completed',
    createdAt,
    updatedAt: latestTimestamp(createdAt, run?.updatedAt),
    revision: revisionFromTimestamps(createdAt, run?.updatedAt),
    runtimeRefs: {
      ...(thread.sessionId || run?.sessionId ? { sessionId: thread.sessionId ?? run?.sessionId } : {}),
      threadId: thread.id,
      ...(status.runId ? { runId: status.runId } : {}),
    },
  })
}

function timelineItemFromRunActivity(
  run: AgentRun,
  thread: Pick<AgentThread, 'id' | 'sessionId'>,
  traceEvents: AgentTraceEvent[],
): AgentTimelineItem {
  const createdAt = run.startedAt ?? run.createdAt
  const updatedAt = latestTimestamp(
    run.updatedAt,
    run.completedAt,
    run.failedAt,
    ...traceEvents.map((event) => event.completedAt ?? event.createdAt),
  )
  return withCursor({
    id: `run-activity:${run.id}`,
    ...(thread.sessionId || run.sessionId ? { sessionId: thread.sessionId ?? run.sessionId } : {}),
    threadId: thread.id,
    origin: 'system_runtime',
    purpose: 'status',
    surface: 'status_strip',
    contentPromptEligibility: 'exclude',
    sortRank: 30,
    content: runActivityStatusContent(run, traceEvents),
    activity: compactRunActivity(run, traceEvents),
    status: agentTimelineStatusFromRunStatus(run.status),
    createdAt,
    updatedAt,
    revision: revisionFromTimestamps(createdAt, updatedAt),
    runtimeRefs: {
      ...(thread.sessionId || run.sessionId ? { sessionId: thread.sessionId ?? run.sessionId } : {}),
      threadId: thread.id,
      runId: run.id,
    },
  })
}

function timelineItemFromContextDiagnostic(
  diagnostic: AgentContextDiagnosticRecord,
  thread: Pick<AgentThread, 'id' | 'sessionId'>,
  run?: AgentRun,
): AgentTimelineItem {
  const createdAt = diagnostic.createdAt
  return withCursor({
    id: `context:${diagnostic.id}`,
    ...(thread.sessionId || run?.sessionId ? { sessionId: thread.sessionId ?? run?.sessionId } : {}),
    threadId: thread.id,
    origin: 'system_runtime',
    purpose: 'diagnostic',
    surface: 'debug_panel',
    contentPromptEligibility: 'exclude',
    sortRank: 90,
    content: diagnostic.content,
    meta: { contextDiagnostic: diagnostic.diagnostic },
    status: 'completed',
    createdAt,
    updatedAt: latestTimestamp(createdAt, run?.updatedAt),
    revision: revisionFromTimestamps(createdAt, run?.updatedAt),
    runtimeRefs: {
      ...(thread.sessionId || run?.sessionId ? { sessionId: thread.sessionId ?? run?.sessionId } : {}),
      threadId: thread.id,
      ...(diagnostic.runId ? { runId: diagnostic.runId } : {}),
    },
  })
}

function shouldAttachRunActivityToTimelineItem(message: AgentMessage, run?: AgentRun): run is AgentRun {
  return isFinalAssistantTimelineItem(message, run)
}

function compactRunActivity(run: AgentRun, traceEvents: AgentTraceEvent[] = run.traceEvents ?? []): AgentTimelineActivity {
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
    events: traceEvents
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

function runActivityStatusContent(run: AgentRun, traceEvents: AgentTraceEvent[]): string {
  const latestGeneration = [...traceEvents].reverse().find((trace) => {
    const data = isRecord(trace.data) ? trace.data : undefined
    return isRecord(data?.generation)
  })
  if (latestGeneration?.summary) return latestGeneration.summary
  const latestTrace = traceEvents.at(-1)
  if (latestTrace?.summary) return latestTrace.summary
  if (latestTrace?.title) return latestTrace.title
  if (run.status === 'in_progress') return 'Runtime is working'
  if (run.status === 'requires_action') return 'Runtime requires action'
  return `Runtime ${run.status}`
}

function compactRunActivityEvent(
  trace: AgentTraceEvent,
  run: AgentRun,
): AgentTimelineActivity['events'][number] {
  const data = compactTimelineTraceData(trace.data)
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

function compactTimelineTraceData(data: unknown): Record<string, unknown> | undefined {
  if (!isRecord(data)) return undefined
  const generation = compactGenerationTraceData(data.generation)
  const model = compactModelTraceData(data)
  const runtime = compactRuntimeTraceData(data)
  const compact = {
    ...(generation ? { generation } : {}),
    ...model,
    ...runtime,
  }
  return Object.keys(compact).length > 0 ? compact : undefined
}

function compactModelTraceData(data: Record<string, unknown>): Record<string, unknown> {
  const compact: Record<string, unknown> = {}
  for (const key of ['eventType', 'finish_reason', 'content_chars', 'contentPreview']) {
    const value = data[key]
    if (typeof value === 'string' || typeof value === 'number') compact[key] = value
  }
  if (Array.isArray(data.tool_calls)) {
    compact.tool_calls = data.tool_calls.flatMap((item) => {
      if (!isRecord(item)) return []
      const id = typeof item.id === 'string' ? item.id : undefined
      const name = typeof item.name === 'string' ? item.name : undefined
      return name ? [{ ...(id ? { id } : {}), name, ...(isRecord(item.args) ? { args: item.args } : {}) }] : []
    })
  }
  if (isRecord(data.usage)) compact.usage = data.usage
  return compact
}

function compactRuntimeTraceData(data: Record<string, unknown>): Record<string, unknown> {
  const compact: Record<string, unknown> = {}
  if (Array.isArray(data.forcedCalls)) compact.forcedCalls = data.forcedCalls.filter((item) => typeof item === 'string')
  if (Array.isArray(data.origins)) compact.origins = data.origins.filter(isRecord)
  return compact
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

export function normalizeTimelineLimit(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return 10
  return Math.max(1, Math.min(100, Math.floor(parsed)))
}

export function compareTimelineItems(left: AgentTimelineItem, right: AgentTimelineItem): number {
  return compareTimelineCursor(left.cursor, right.cursor)
}

export function compareTimelineCursor(left: string, right: string): number {
  const leftParts = parseTimelineCursor(left)
  const rightParts = parseTimelineCursor(right)
  if (leftParts.time !== rightParts.time) return leftParts.time < rightParts.time ? -1 : 1
  if (leftParts.sortRank !== rightParts.sortRank) return leftParts.sortRank - rightParts.sortRank
  if (leftParts.itemId === rightParts.itemId) return 0
  return leftParts.itemId < rightParts.itemId ? -1 : 1
}

function withCursor(item: AgentTimelineItemDraft): AgentTimelineItem {
  return {
    ...item,
    cursor: timelineCursor(item),
  }
}

function timelineCursor(item: AgentTimelineItemDraft): string {
  return `${Date.parse(item.createdAt) || 0}:${timelineCursorRank(item)}:${encodeURIComponent(item.id)}`
}

function timelineCursorRank(item: AgentTimelineItemDraft): string {
  return String(item.sortRank).padStart(2, '0')
}

function timelineSemanticsFromRuntimeMessage(message: AgentMessage): {
  origin: AgentTimelineOrigin
  purpose: AgentTimelinePurpose
  surface: AgentTimelineSurface
  contentPromptEligibility: AgentTimelineContentPromptEligibility
  sortRank: number
} {
  if (message.role === 'user') {
    return {
      origin: 'user',
      purpose: 'transcript',
      surface: 'message_stream',
      contentPromptEligibility: 'include',
      sortRank: 10,
    }
  }
  if (message.role === 'assistant') {
    const transcript = isAgentTranscriptAssistantMessage(message)
    return {
      origin: transcript ? 'agent' : 'system_runtime',
      purpose: transcript ? 'transcript' : 'status',
      surface: transcript ? 'message_stream' : 'status_strip',
      contentPromptEligibility: transcript ? 'include' : 'exclude',
      sortRank: transcript ? 50 : 20,
    }
  }
  return {
    origin: 'system_runtime',
    purpose: 'status',
    surface: 'status_strip',
    contentPromptEligibility: 'exclude',
    sortRank: 99,
  }
}

function parseTimelineCursor(cursor: string): { time: number; sortRank: number; itemId: string } {
  const [time, sortRank, ...idParts] = cursor.split(':')
  return {
    time: Number(time) || 0,
    sortRank: Number(sortRank) || 0,
    itemId: decodeURIComponent(idParts.join(':')),
  }
}

function runtimeTimelineItemId(message: AgentMessage, run?: AgentRun): string {
  if (isFinalAssistantTimelineItem(message, run)) return assistantTimelineItemIdForRun(run.id)
  return `message:${message.id}`
}

function assistantTimelineItemIdForRun(runId: string): string {
  return `assistant:${runId}`
}

function isFinalAssistantTimelineItem(message: AgentMessage, run?: AgentRun): run is AgentRun {
  return isAgentTranscriptAssistantMessage(message)
    && !!run
    && run.assistantMessageId === message.id
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

function dedupeTimelineItems(items: AgentTimelineItem[]): AgentTimelineItem[] {
  const byId = new Map<string, AgentTimelineItem>()
  for (const item of items) {
    const previous = byId.get(item.id)
    if (!previous || item.revision >= previous.revision) byId.set(item.id, item)
  }
  return [...byId.values()]
}
