import type {
  AgentAttachment,
  AgentChatMessage,
  AgentChatMessageMeta,
  AgentConversation,
  AgentConversationDraft,
  AgentMessage,
  AgentPlanRevision,
  AgentRun,
  AgentRunActivity,
  AgentRunActivityApproval,
  AgentRunActivityEvent,
  AgentRunActivityInputRequest,
  AgentRunActivityStep,
  AgentThread,
  RuntimeInteraction,
} from '@movscript/protocol'

export type {
  AgentAttachment,
  AgentChatMessage,
  AgentChatMessageMeta,
  AgentConversation,
  AgentConversationDraft,
  AgentGenerationJob,
  AgentMessage,
  AgentPlan,
  AgentPlanRevision,
  AgentRun,
  AgentRunActivity,
  AgentRunActivityEvent,
  AgentRunActivityStep,
  AgentRuntimeInputRef,
  AgentRuntimeMessageRef,
  AgentThread,
  RuntimeInteraction,
} from '@movscript/protocol'

export interface AgentConversationMessageMetaShape {
  modelId?: number | null
  agentName?: string
  permissionMode?: string
  contextLabels?: string[]
  runtimeMessage?: AgentChatMessageMeta['runtimeMessage']
  runtimeInput?: AgentChatMessageMeta['runtimeInput']
  contextDiagnostic?: unknown
  generationJobs?: unknown[]
  generationParamAudits?: unknown[]
  generationValidationErrors?: unknown[]
  draftArtifacts?: unknown[]
  localRunActivity?: unknown
  planRevision?: AgentPlanRevision
}

export interface AgentConversationMessageShape<Meta = AgentConversationMessageMetaShape> {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: AgentAttachment[]
  meta?: Meta
  timestamp: number
}

export interface AgentConversationShape<Message extends AgentConversationMessageShape = AgentConversationMessageShape> {
  id: string
  title: string
  messages: Message[]
  runtimeThreadId?: string
  createdAt: number
  updatedAt: number
}

export interface AgentConversationDraftShape<Attachment extends AgentAttachment = AgentAttachment> {
  input: string
  attachments: Attachment[]
}

type RuntimeConversationMessage = AgentConversationMessageShape<AgentConversationMessageMetaShape>

export interface AgentConversationMessageStore<Message extends AgentConversationMessageShape = AgentChatMessage, Meta = NonNullable<Message['meta']>> {
  addMessage(userId: string, conversationId: string, msg: Omit<Message, 'id' | 'timestamp'> & { timestamp?: number }): string
  upsertMessage(userId: string, conversationId: string, messageId: string, msg: Omit<Message, 'id' | 'timestamp'> & { timestamp?: number }): void
  removeMessage(userId: string, conversationId: string, messageId: string): void
  updateMessageMeta(userId: string, conversationId: string, messageId: string, meta: Meta): void
  setConversationMessages(userId: string, conversationId: string, messages: Message[]): void
  clearConversationDraft(userId: string, conversationId: string): void
}

export interface AgentMessageViewModelPayload {
  attachments?: AgentAttachment[]
  meta: AgentConversationMessageMetaShape
}

export interface AgentConversationProjectionDeps<PayloadDeps = unknown> {
  assistantResultPayloadForRun?: (
    run: AgentRun,
    liveEvents: AgentRunActivityEvent[],
    assistantContent: string,
    deps: PayloadDeps,
  ) => Promise<AgentMessageViewModelPayload>
  assistantResultPayloadDeps?: PayloadDeps
  formatAssistantContent?: (run: AgentRun, thread: Pick<AgentThread, 'messages'>) => string
  localUserEchoContentKey?: (text: string) => string
}

export interface RuntimeThreadProjectionInput<Message extends AgentConversationMessageShape = AgentChatMessage, PayloadDeps = unknown> {
  thread: AgentThread
  runs?: AgentRun[]
  existingMessages?: Message[]
  liveEventsByRunId?: Record<string, AgentRunActivityEvent[]>
  deps?: AgentConversationProjectionDeps<PayloadDeps>
}

export interface RuntimeConversationProjection<Message extends AgentConversationMessageShape = AgentChatMessage> {
  thread: {
    id: string
  }
  messages: Message[]
}

export interface RuntimeThreadRunState<Run extends AgentRun = AgentRun> {
  runs: Run[]
  actionableRuns: Run[]
  currentRun?: Run
}

export interface ResolveRuntimeThreadRunStateInput<Run extends AgentRun = AgentRun> {
  runs?: Run[]
  ensureRuns?: Run[]
  interactions?: RuntimeInteraction[]
  current?: {
    activeRunIds?: string[]
    waitingRunIds?: string[]
  }
  thread?: Pick<AgentThread, 'activeRunId' | 'lastRunId'>
}

export interface RuntimeThreadConversationProjection<
  Message extends AgentConversationMessageShape = AgentChatMessage,
  Run extends AgentRun = AgentRun,
  Thread extends Pick<AgentThread, 'id' | 'messages' | 'activeRunId' | 'lastRunId'> = Pick<AgentThread, 'id' | 'messages' | 'activeRunId' | 'lastRunId'>,
> extends RuntimeThreadRunState<Run>, RuntimeConversationProjection<Message> {
  thread: Thread
}

export interface BuildRuntimeThreadConversationProjectionInput<
  Message extends AgentConversationMessageShape = AgentChatMessage,
  Run extends AgentRun = AgentRun,
  Thread extends Pick<AgentThread, 'id' | 'messages' | 'activeRunId' | 'lastRunId'> = Pick<AgentThread, 'id' | 'messages' | 'activeRunId' | 'lastRunId'>,
  PayloadDeps = unknown,
> {
  thread: Thread
  runs?: Run[]
  ensureRuns?: Run[]
  interactions?: RuntimeInteraction[]
  current?: {
    activeRunIds?: string[]
    waitingRunIds?: string[]
  }
  existingMessages?: Message[]
  liveEventsByRunId?: Record<string, AgentRunActivityEvent[]>
  deps?: AgentConversationProjectionDeps<PayloadDeps>
}

export interface AgentRunTimeline {
  runId: string
  threadId: string
  status: string
  createdAt: string
  updatedAt: string
  rounds: AgentRunTimelineRound[]
  unassignedInputs: AgentRunActivityInputRequest[]
}

export interface AgentRunTimelineRound {
  id: string
  index?: number
  startedAt: string
  finishedAt?: string
  failed: boolean
  finished: boolean
  decisions: AgentRunTimelineDecision[]
  toolExecutions: AgentRunTimelineToolExecution[]
  inputs: AgentRunActivityInputRequest[]
}

export interface AgentRunTimelineDecision {
  id: string
  event: AgentRunActivityEvent
  toolCalls: AgentRunTimelineDecisionToolCall[]
}

export interface AgentRunTimelineDecisionToolCall {
  id?: string
  name: string
  args?: Record<string, unknown>
}

export interface AgentRunTimelineToolExecution {
  id: string
  toolName: string
  decisionOrder?: number
  createdAt: string
  completedAt?: string
  roundIndex?: number
  roundLabel?: string
  step?: AgentRunActivityStep
  events: AgentRunActivityEvent[]
  approvals: AgentRunActivityApproval[]
}

export interface AgentUserConversationState<
  Conversation extends AgentConversationShape = AgentConversation,
  Draft extends AgentConversationDraftShape = AgentConversationDraft,
> {
  conversations: Conversation[]
  activeConversationId: string | null
  draftsByConversation: Record<string, Draft>
}

export interface AgentConversationMutationOptions {
  createId?: () => string
  now?: () => number
}

export type AgentConversationMessageInput<Message extends AgentConversationMessageShape> =
  Omit<Message, 'id' | 'timestamp'> & { timestamp?: number }

export type AssistantConversationMessageAppender<Meta = AgentChatMessageMeta> =
  (content: string, meta?: Meta) => string | void

export interface AppendConversationMessageDeps<
  Message extends AgentConversationMessageShape = AgentChatMessage,
  Meta extends AgentConversationMessageMetaShape = NonNullable<Message['meta']> & AgentConversationMessageMetaShape,
> {
  userId: string
  conversationId: string
  messageStore: Pick<AgentConversationMessageStore<Message, Meta>, 'addMessage'>
}

export function appendAssistantConversationMessage<
  Message extends AgentConversationMessageShape = AgentChatMessage,
  Meta extends AgentConversationMessageMetaShape = NonNullable<Message['meta']> & AgentConversationMessageMetaShape,
>(input: {
  content: string
  meta?: Meta
  deps: AppendConversationMessageDeps<Message, Meta>
}): string {
  return input.deps.messageStore.addMessage(input.deps.userId, input.deps.conversationId, {
    role: 'assistant',
    content: input.content,
    ...(input.meta ? { meta: input.meta } : {}),
  } as Omit<Message, 'id' | 'timestamp'>)
}

export function appendUserConversationMessage<
  Message extends AgentConversationMessageShape = AgentChatMessage,
  Meta extends AgentConversationMessageMetaShape = NonNullable<Message['meta']> & AgentConversationMessageMetaShape,
>(input: {
  content: string
  attachments?: Message['attachments']
  meta?: Meta
  deps: AppendConversationMessageDeps<Message, Meta>
}): string {
  return input.deps.messageStore.addMessage(input.deps.userId, input.deps.conversationId, {
    role: 'user',
    content: input.content,
    ...(input.attachments && input.attachments.length > 0 ? { attachments: input.attachments } : {}),
    ...(input.meta ? { meta: input.meta } : {}),
  } as Omit<Message, 'id' | 'timestamp'>)
}

export interface AgentConversationNormalizeOptions {
  createId?: () => string
  defaultTitle?: string
  now?: () => number
}

export function normalizeConvsByUser<
  Conversation extends AgentConversationShape = AgentConversation,
  Draft extends AgentConversationDraftShape = AgentConversationDraft,
>(
  value: unknown,
  options: AgentConversationNormalizeOptions = {},
): Record<string, AgentUserConversationState<Conversation, Draft>> {
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
        draftsByConversation: normalizeDraftsByConversation<Draft>(record.draftsByConversation, options),
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
      const messages = normalizeMessages(conversation.messages, options)
      return {
        id,
        title: typeof conversation.title === 'string' && conversation.title.trim() ? conversation.title : options.defaultTitle ?? 'New conversation',
        messages,
        ...(typeof conversation.runtimeThreadId === 'string' && conversation.runtimeThreadId.trim() ? { runtimeThreadId: conversation.runtimeThreadId.trim() } : {}),
        createdAt: numberOrFallback(conversation.createdAt, messages[0]?.timestamp ?? now),
        updatedAt: numberOrFallback(conversation.updatedAt, messages[messages.length - 1]?.timestamp ?? now),
      } as Conversation
    })
}

export function normalizeMessages<Message extends AgentConversationMessageShape = AgentChatMessage>(
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

export function normalizeDraftsByConversation<Draft extends AgentConversationDraftShape = AgentConversationDraft>(
  value: unknown,
  options: AgentConversationNormalizeOptions = {},
): Record<string, Draft> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .flatMap(([conversationId, draft]) => {
        if (!isRecord(draft)) return []
        return [[conversationId, {
          input: typeof draft.input === 'string' ? draft.input : '',
          attachments: normalizeAttachments(draft.attachments, options),
        } as Draft]]
      }),
  )
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

export function appendConversationMessage<
  Message extends AgentConversationMessageShape,
  Conversation extends { messages: Message[]; updatedAt: number },
>(
  conversation: Conversation,
  message: AgentConversationMessageInput<Message>,
  options: AgentConversationMutationOptions = {},
): { conversation: Conversation; messageId: string } {
  const messageId = options.createId?.() ?? defaultId()
  const now = options.now?.() ?? Date.now()
  return {
    messageId,
    conversation: {
      ...conversation,
      messages: [...conversation.messages, { ...message, id: messageId, timestamp: message.timestamp ?? now } as Message],
      updatedAt: now,
    },
  }
}

export function upsertConversationMessage<
  Message extends AgentConversationMessageShape,
  Conversation extends { messages: Message[]; updatedAt: number },
>(
  conversation: Conversation,
  messageId: string,
  message: AgentConversationMessageInput<Message>,
  options: AgentConversationMutationOptions = {},
): Conversation {
  const now = options.now?.() ?? Date.now()
  const existingIndex = conversation.messages.findIndex((item) => item.id === messageId)
  const nextMessage = {
    ...message,
    id: messageId,
    timestamp: message.timestamp ?? (existingIndex >= 0 ? conversation.messages[existingIndex]?.timestamp ?? now : now),
  } as Message
  const messages = existingIndex >= 0
    ? conversation.messages.map((item, index) => index === existingIndex ? nextMessage : item)
    : [...conversation.messages, nextMessage]
  return { ...conversation, messages, updatedAt: now }
}

export function replaceConversationMessages<
  Message extends AgentConversationMessageShape,
  Conversation extends { messages: Message[]; updatedAt: number },
>(
  conversation: Conversation,
  messages: Message[],
  options: Pick<AgentConversationMutationOptions, 'now'> = {},
): Conversation {
  return {
    ...conversation,
    messages,
    updatedAt: options.now?.() ?? Date.now(),
  }
}

export function patchConversationMessageMeta<
  Message extends AgentConversationMessageShape,
  Meta extends NonNullable<Message['meta']>,
  Conversation extends { messages: Message[]; updatedAt: number },
>(
  conversation: Conversation,
  messageId: string,
  meta: Partial<Meta>,
  options: Pick<AgentConversationMutationOptions, 'now'> = {},
): Conversation {
  return {
    ...conversation,
    messages: conversation.messages.map((message) => message.id === messageId
      ? { ...message, meta: { ...message.meta, ...meta } as Message['meta'] }
      : message),
    updatedAt: options.now?.() ?? Date.now(),
  }
}

export function removeConversationMessage<
  Message extends AgentConversationMessageShape,
  Conversation extends { messages: Message[]; updatedAt: number },
>(
  conversation: Conversation,
  messageId: string,
  options: Pick<AgentConversationMutationOptions, 'now'> = {},
): Conversation {
  return {
    ...conversation,
    messages: conversation.messages.filter((message) => message.id !== messageId),
    updatedAt: options.now?.() ?? Date.now(),
  }
}

export async function projectRuntimeThreadMessages<Message extends AgentConversationMessageShape = AgentChatMessage, PayloadDeps = unknown>(input: RuntimeThreadProjectionInput<Message, PayloadDeps>): Promise<Message[]> {
  const runs = [...(input.runs ?? [])].filter(isTopLevelUserFacingRun)
  const localUserEchoContentKey = input.deps?.localUserEchoContentKey ?? defaultLocalUserEchoContentKey
  const existingByRuntimeMessageId = existingRuntimeMessageMap(input.existingMessages ?? [], input.thread.id)
  const existingLocalUserEchoesByKey = existingLocalUserEchoMap(input.existingMessages ?? [], localUserEchoContentKey)
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
  const messages: RuntimeConversationMessage[] = []
  for (const message of [...input.thread.messages].sort(compareRuntimeMessages)) {
    if (message.role !== 'user' && message.role !== 'assistant') continue
    const run = message.role === 'user'
      ? runsBySourceMessageId.get(message.id) ?? (message.runId ? runsById.get(message.runId) : undefined)
      : runsByAssistantMessageId.get(message.id) ?? (message.runId ? runsById.get(message.runId) : undefined)
    if (message.role === 'assistant' && run) projectedAssistantRunIds.add(run.id)
    messages.push(await projectRuntimeMessage({
      message,
      run,
      existing: existingByRuntimeMessageId.get(message.id) ?? (message.role === 'user' ? consumeExistingLocalUserEcho(existingLocalUserEchoesByKey, message, localUserEchoContentKey) : undefined),
      liveEvents: run ? input.liveEventsByRunId?.[run.id] : undefined,
      deps: input.deps,
    }))
  }

  for (const run of runs.sort(compareRuns)) {
    if (projectedAssistantRunIds.has(run.id)) continue
    const content = formatAssistantContent(run, input.thread, input.deps)
    const existing = existingAssistantByRuntimeRunId.get(run.id)
    const payload = await assistantResultPayloadForRun(run, input.liveEventsByRunId?.[run.id] ?? [], content, input.deps)
    const sourceMessage = run.input?.sourceMessageId
      ? input.thread.messages.find((message) => message.id === run.input?.sourceMessageId)
      : undefined
    messages.push({
      id: existing?.id ?? `runtime-run:${run.id}:assistant`,
      role: 'assistant',
      content,
      attachments: payload.attachments ?? existing?.attachments,
      meta: {
        ...existing?.meta,
        ...payload.meta,
      },
      timestamp: syntheticAssistantRunTimestamp(run, sourceMessage),
    })
  }

  return messages.sort(compareProjectedRuntimeMessagesByRunOrder(runs, input.thread)) as Message[]
}

export async function buildRuntimeThreadConversationProjection<
  Message extends AgentConversationMessageShape = AgentChatMessage,
  Run extends AgentRun = AgentRun,
  Thread extends Pick<AgentThread, 'id' | 'messages' | 'activeRunId' | 'lastRunId'> = Pick<AgentThread, 'id' | 'messages' | 'activeRunId' | 'lastRunId'>,
  PayloadDeps = unknown,
>(
  input: BuildRuntimeThreadConversationProjectionInput<Message, Run, Thread, PayloadDeps>,
): Promise<RuntimeThreadConversationProjection<Message, Run, Thread>> {
  const runState = resolveRuntimeThreadRunState<Run>({
    runs: input.runs,
    ensureRuns: input.ensureRuns,
    interactions: input.interactions,
    current: input.current,
    thread: input.thread,
  })
  const messages = await projectRuntimeThreadMessages<Message, PayloadDeps>({
    thread: input.thread as unknown as AgentThread,
    runs: runState.runs,
    existingMessages: input.existingMessages,
    liveEventsByRunId: input.liveEventsByRunId,
    deps: input.deps,
  })
  return {
    thread: input.thread,
    runs: runState.runs,
    actionableRuns: runState.actionableRuns,
    ...(runState.currentRun ? { currentRun: runState.currentRun } : {}),
    messages,
  }
}

export function buildAgentRunTimeline(activity: AgentRunActivity): AgentRunTimeline {
  const decisions = timelineDecisions(activity.events ?? [])
  const toolExecutions = timelineToolExecutions(activity, decisions)
  const inputs = [...(activity.inputs ?? [])].sort(compareTimelineInputs)
  const roundSeeds = timelineRoundSeeds(activity, decisions, toolExecutions, inputs)
  const rounds = roundSeeds.map((round) => {
    const roundDecisions = decisions
      .filter((decision) => timelineRoundKeyForItem(decision.event, roundSeeds) === round.id)
      .sort(compareTimelineDecisions)
    const roundTools = toolExecutions
      .filter((tool) => timelineRoundKeyForItem(tool, roundSeeds) === round.id)
      .sort(compareTimelineToolExecutions)
    const roundInputs = inputs
      .filter((input) => timelineRoundKeyForItem(input, roundSeeds) === round.id)
      .sort(compareTimelineInputs)
    return {
      ...round,
      decisions: roundDecisions,
      toolExecutions: roundTools,
      inputs: roundInputs,
    }
  })
  const assignedInputIds = new Set(rounds.flatMap((round) => round.inputs.map((input) => input.id)))
  return {
    runId: activity.runId,
    threadId: activity.threadId,
    status: activity.status,
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
    rounds,
    unassignedInputs: inputs.filter((input) => !assignedInputIds.has(input.id)),
  }
}

export function resolveRuntimeThreadRunState<Run extends AgentRun = AgentRun>(input: ResolveRuntimeThreadRunStateInput<Run>): RuntimeThreadRunState<Run> {
  const runs = attachRuntimeInteractionApprovals(mergeRuntimeRuns(input.runs ?? [], input.ensureRuns ?? []), input.interactions)
  const actionableRuns = resolveActionableRuntimeRuns(runs, input.interactions)
  const currentRun = resolveCurrentRuntimeRun({
    runs,
    actionableRuns,
    snapshotRunIds: [
      ...(input.current?.waitingRunIds ?? []),
      ...(input.current?.activeRunIds ?? []),
    ],
    activeRunId: input.thread?.activeRunId,
    lastRunId: input.thread?.lastRunId,
  })
  return {
    runs,
    actionableRuns,
    ...(currentRun ? { currentRun } : {}),
  }
}

export function mergeRuntimeRuns<Run extends AgentRun = AgentRun>(primary: Run[], ensured: Run[]): Run[] {
  const byId = new Map<string, Run>()
  for (const run of primary) byId.set(run.id, run)
  for (const run of ensured) {
    if (!byId.has(run.id)) byId.set(run.id, run)
  }
  return Array.from(byId.values())
}

export function attachRuntimeInteractionApprovals<Run extends AgentRun = AgentRun>(runs: Run[], interactions: RuntimeInteraction[] | undefined): Run[] {
  const interactionByApprovalId = new Map<string, string>()
  const continuationApprovalsByRunId = new Map<string, NonNullable<AgentRun['pendingApprovals']>>()
  for (const interaction of interactions ?? []) {
    const payload = isRecord(interaction.payload) ? interaction.payload : undefined
    if (interaction.kind === 'approval') {
      const approvalId = typeof payload?.approvalId === 'string' ? payload.approvalId : undefined
      if (approvalId) interactionByApprovalId.set(approvalId, interaction.id)
      continue
    }
    const continuationApproval = continuationResumeApprovalFromInteraction(interaction, payload)
    if (continuationApproval) {
      const approvals = continuationApprovalsByRunId.get(interaction.runId) ?? []
      approvals.push(continuationApproval)
      continuationApprovalsByRunId.set(interaction.runId, approvals)
    }
  }
  if (interactionByApprovalId.size === 0 && continuationApprovalsByRunId.size === 0) return runs
  return runs.map((run) => ({
    ...run,
    pendingApprovals: [
      ...(run.pendingApprovals ?? []).map((approval) => {
        const interactionId = interactionByApprovalId.get(approval.id)
        return interactionId ? { ...approval, interactionId } : approval
      }),
      ...(continuationApprovalsByRunId.get(run.id) ?? []),
    ],
  }) as Run)
}

export function resolveActionableRuntimeRuns<Run extends AgentRun = AgentRun>(runs: Run[], interactions: Array<{ runId: string; status: string }> | undefined): Run[] {
  const byId = new Map(runs.map((run) => [run.id, run]))
  const actionableRunIds = Array.from(new Set((interactions ?? [])
    .filter((interaction) => interaction.status === 'pending')
    .map((interaction) => interaction.runId)))
  if (actionableRunIds.length > 0) {
    const indexed = actionableRunIds
      .map((runId) => byId.get(runId))
      .filter((run): run is Run => !!run)
    if (indexed.length > 0) return indexed
  }
  return runs.filter(runNeedsRuntimeUserAction).sort(compareRunsByUpdatedAtDesc)
}

export function resolveCurrentRuntimeRun<Run extends AgentRun = AgentRun>(input: {
  runs: Run[]
  actionableRuns: Run[]
  snapshotRunIds?: string[]
  activeRunId?: string
  lastRunId?: string
}): Run | undefined {
  const byId = new Map(input.runs.map((run) => [run.id, run]))
  return input.actionableRuns[0]
    ?? (input.snapshotRunIds ?? []).map((runId) => byId.get(runId)).find((run): run is Run => !!run)
    ?? (input.activeRunId ? byId.get(input.activeRunId) : undefined)
    ?? (input.lastRunId ? byId.get(input.lastRunId) : undefined)
    ?? [...input.runs].sort(compareRunsByUpdatedAtDesc)[0]
}

export function mergeProjectedRuntimeMessages<Message extends AgentConversationMessageShape = AgentChatMessage>(input: {
  existingMessages: Message[]
  projectedMessages: Message[]
  threadId: string
}): Message[] {
  const projected = dedupeProjectedRuntimeMessages(input.projectedMessages)
  const projectedIds = new Set(projected.map((message) => message.id))
  const projectedRuntimeContentKeys = new Set(projected
    .filter(isRuntimeProjectedMessage)
    .map(runtimeContentKey))
  return [
    ...input.existingMessages.filter((message) => !isReplacedByRuntimeProjection(message, input.threadId, projectedIds, projectedRuntimeContentKeys)),
    ...projected,
  ].sort(compareMergedRuntimeMessages(projected)) as Message[]
}

export function mergeRuntimeThreadProjectionMessages<Message extends AgentConversationMessageShape = AgentChatMessage>(existingMessages: Message[], projection: RuntimeConversationProjection<Message>): Message[] {
  return mergeProjectedRuntimeMessages({
    existingMessages,
    projectedMessages: projection.messages,
    threadId: projection.thread.id,
  })
}

export function runtimeThreadHydrationKey(conversationId: string, threadId: string): string {
  return `${conversationId}:${threadId}`
}

export function markRuntimeMessagesRestored<Message extends AgentConversationMessageShape = AgentChatMessage>(messages: Message[], restoredLabel: string): Message[] {
  return messages.map((message) => ({
    ...message,
    meta: {
      ...message.meta,
      contextLabels: [
        restoredLabel,
        ...(message.meta?.contextLabels ?? []),
      ],
    },
  })) as Message[]
}

export interface RuntimeThreadConversationSessionState {
  localThreadIdsByConversation: Record<string, string>
  conversationRuntimes: Record<string, { threadId?: string; updatedAt?: number }>
}

export interface RestoreRuntimeThreadConversationResult {
  conversationId: string
  threadId: string
  reusedExistingConversation: boolean
  restoredMessageCount: number
}

export interface RestoreRuntimeThreadConversationDeps<
  Message extends AgentConversationMessageShape = AgentChatMessage,
  Meta = NonNullable<Message['meta']>,
  Conversation extends Pick<AgentConversationShape<Message>, 'id' | 'runtimeThreadId'> = Pick<AgentConversationShape<Message>, 'id' | 'runtimeThreadId'>,
  Thread extends Pick<AgentThread, 'id' | 'title'> = Pick<AgentThread, 'id' | 'title'>,
> {
  userId: string
  conversations: Conversation[]
  sessionState: RuntimeThreadConversationSessionState
  restoredLabel: string
  titleForThread: (thread: Thread) => string
  loadProjection: (threadId: string) => Promise<RuntimeConversationProjection<Message> & { thread: Thread }>
  createConversation: (userId: string) => string
  setActiveConversation: (userId: string, conversationId: string) => void
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  messageStore: Pick<AgentConversationMessageStore<Message, Meta>, 'upsertMessage'>
  setLocalThreadId: (conversationId: string, threadId: string) => void
  setConversationRuntimeThreadId: (userId: string, conversationId: string, threadId: string) => void
}

export function conversationIdForRuntimeThread(input: RuntimeThreadConversationSessionState & { threadId: string }): string | undefined {
  const directEntry = Object.entries(input.localThreadIdsByConversation)
    .find(([, mappedThreadId]) => mappedThreadId === input.threadId)
  if (directEntry) return directEntry[0]

  return Object.entries(input.conversationRuntimes)
    .filter(([, runtime]) => runtime.threadId === input.threadId)
    .sort(([, left], [, right]) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))[0]?.[0]
}

export function existingConversationIdForRuntimeThread<Conversation extends Pick<AgentConversationShape, 'id' | 'runtimeThreadId'>>(
  threadId: string,
  conversations: Conversation[],
  sessionState: RuntimeThreadConversationSessionState,
): string | undefined {
  const persistedConversationId = conversations.find((conversation) => conversation.runtimeThreadId === threadId)?.id
  const mappedConversationId = persistedConversationId ?? conversationIdForRuntimeThread({
    threadId,
    localThreadIdsByConversation: sessionState.localThreadIdsByConversation,
    conversationRuntimes: sessionState.conversationRuntimes,
  })
  if (!mappedConversationId) return undefined
  return conversations.some((conversation) => conversation.id === mappedConversationId) ? mappedConversationId : undefined
}

export async function restoreRuntimeThreadConversation<
  Message extends AgentConversationMessageShape = AgentChatMessage,
  Meta = NonNullable<Message['meta']>,
  Conversation extends Pick<AgentConversationShape<Message>, 'id' | 'runtimeThreadId'> = Pick<AgentConversationShape<Message>, 'id' | 'runtimeThreadId'>,
  Thread extends Pick<AgentThread, 'id' | 'title'> = Pick<AgentThread, 'id' | 'title'>,
>(
  threadId: string,
  deps: RestoreRuntimeThreadConversationDeps<Message, Meta, Conversation, Thread>,
): Promise<RestoreRuntimeThreadConversationResult> {
  const existingConversationId = existingConversationIdForRuntimeThread(threadId, deps.conversations, deps.sessionState)
  if (existingConversationId) {
    deps.setActiveConversation(deps.userId, existingConversationId)
    return {
      conversationId: existingConversationId,
      threadId,
      reusedExistingConversation: true,
      restoredMessageCount: 0,
    }
  }

  const projection = await deps.loadProjection(threadId)
  const conversationId = deps.createConversation(deps.userId)
  deps.updateConversationTitle(deps.userId, conversationId, deps.titleForThread(projection.thread))
  const restoredMessages = markRuntimeMessagesRestored(projection.messages, deps.restoredLabel)
  for (const message of restoredMessages) {
    deps.messageStore.upsertMessage(deps.userId, conversationId, message.id, message)
  }
  deps.setLocalThreadId(conversationId, projection.thread.id)
  deps.setConversationRuntimeThreadId(deps.userId, conversationId, projection.thread.id)
  deps.setActiveConversation(deps.userId, conversationId)
  return {
    conversationId,
    threadId: projection.thread.id,
    reusedExistingConversation: false,
    restoredMessageCount: restoredMessages.length,
  }
}

export interface SendRuntimeInputMessageResult<Run extends { id: string }> {
  run: Run
  message: AgentMessage
  runtimeInput?: {
    accepted?: boolean
    runId?: string
    messageId?: string
  }
}

export type RuntimeSendSettledStatus = 'completed' | 'error' | 'cancelled'

export interface CompleteRuntimeSendDraft {
  localRuntime?: {
    diagnosticCommand?: boolean
    requestId?: string
  }
}

export interface CompleteRuntimeSendRunResult<
  Run extends AgentRun = AgentRun,
  Thread extends AgentThread = AgentThread,
  ThreadResolution = unknown,
> {
  run: Run
  thread: Thread
  threadResolution?: ThreadResolution
  sourceMessage?: AgentMessage
}

export interface CompleteRuntimeSendResult<
  Run extends AgentRun,
  Thread extends AgentThread,
  Artifact,
  ActivityEvent extends AgentRunActivityEvent,
> {
  run: Run
  thread: Thread
  artifacts: Artifact[]
  liveEvents: ActivityEvent[]
}

export interface CompleteRuntimeSendDeps<
  Message extends AgentConversationMessageShape = AgentChatMessage,
  Meta extends AgentConversationMessageMetaShape = NonNullable<Message['meta']> & AgentConversationMessageMetaShape,
  Run extends AgentRun = AgentRun,
  Thread extends AgentThread = AgentThread,
  Artifact = unknown,
  ActivityEvent extends AgentRunActivityEvent = AgentRunActivityEvent,
  ThreadResolution = unknown,
  PendingAssistantState = unknown,
> {
  userId: string
  conversationId: string
  localUserMessageId: string
  liveEvents: () => ActivityEvent[]
  setLiveEventsRef: (events: ActivityEvent[]) => void
  getRun: (runId: string) => Promise<Run>
  extractArtifacts: (run: Run) => Artifact[]
  setLocalThreadId: (conversationId: string, threadId: string) => void
  setConversationRuntimeThreadId: (userId: string, conversationId: string, threadId: string) => void
  messageStore: Pick<AgentConversationMessageStore<Message, Meta>, 'updateMessageMeta' | 'setConversationMessages'>
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  setPageTaskRunning: (requestId: string, patch: { conversationId: string; sessionId?: string; run?: Run; thread?: Thread; threadId?: string; artifacts?: Artifact[] }) => void
  setConversationRun: (conversationId: string, run: Run, patch: { loading?: boolean; building?: boolean; approving?: boolean; stopping?: boolean; stopRequested?: boolean }) => void
  setPendingHttpEvents: (events: ActivityEvent[]) => void
  setPendingAssistantState: (state: PendingAssistantState | null) => void
  appendAssistantRunResult: (run: Run, thread: Thread, liveEvents: ActivityEvent[]) => Promise<unknown>
  getExistingMessages: () => Message[]
  setLiveTraceEvents: (events: ActivityEvent[]) => void
  threadResolutionActivityEvent?: (resolution: ThreadResolution | undefined) => ActivityEvent | null | undefined
  upsertActivityEvent?: (events: ActivityEvent[], event: ActivityEvent) => ActivityEvent[]
  loadRuntimeThreadProjection: (input: {
    threadId: string
    thread: Thread
    ensureRuns: Run[]
    existingMessages: Message[]
    liveEventsByRunId: Record<string, ActivityEvent[]>
  }) => Promise<RuntimeConversationProjection<Message>>
  runTouchesAgentCatalog: (run: Run) => boolean
  refreshAgentCatalogContext: () => void
  notifyRunSettled: (input: {
    requestId?: string
    status: RuntimeSendSettledStatus
    run: Run
    thread: Thread
    artifacts: Artifact[]
  }) => void
}

export interface AppendAssistantRunResultMessageDeps<
  Message extends AgentConversationMessageShape = AgentChatMessage,
  Meta extends AgentConversationMessageMetaShape = NonNullable<Message['meta']> & AgentConversationMessageMetaShape,
  Run extends AgentRun = AgentRun,
  Thread extends Pick<AgentThread, 'messages'> = Pick<AgentThread, 'messages'>,
  ActivityEvent extends AgentRunActivityEvent = AgentRunActivityEvent,
  PayloadDeps = unknown,
> {
  userId: string
  conversationId: string
  messageStore: Pick<AgentConversationMessageStore<Message, Meta>, 'upsertMessage'>
  getStreamingAssistantMessageId?: () => string | null | undefined
  resetStreamingAssistant?: () => void
  formatAssistantContent?: (run: Run, thread: Thread) => string
  assistantResultPayloadForRun?: (
    run: Run,
    liveEvents: ActivityEvent[],
    assistantContent: string,
    deps: PayloadDeps,
  ) => Promise<AgentMessageViewModelPayload>
  assistantResultPayloadDeps?: PayloadDeps
}

export interface AppendAssistantRunResultMessageResult<Artifact = unknown> {
  messageId: string
  content: string
  artifacts: Artifact[]
}

export async function appendAssistantRunResultMessage<
  Message extends AgentConversationMessageShape = AgentChatMessage,
  Meta extends AgentConversationMessageMetaShape = NonNullable<Message['meta']> & AgentConversationMessageMetaShape,
  Run extends AgentRun = AgentRun,
  Thread extends Pick<AgentThread, 'messages'> = Pick<AgentThread, 'messages'>,
  ActivityEvent extends AgentRunActivityEvent = AgentRunActivityEvent,
  Artifact = unknown,
  PayloadDeps = unknown,
>(input: {
  run: Run
  thread: Thread
  liveEvents?: ActivityEvent[]
  deps: AppendAssistantRunResultMessageDeps<Message, Meta, Run, Thread, ActivityEvent, PayloadDeps>
}): Promise<AppendAssistantRunResultMessageResult<Artifact>> {
  const { run, thread, deps } = input
  const liveEvents = input.liveEvents ?? []
  const content = deps.formatAssistantContent
    ? deps.formatAssistantContent(run, thread)
    : formatAssistantContent(run, thread, undefined)
  const payload: AgentMessageViewModelPayload = deps.assistantResultPayloadForRun
    ? await deps.assistantResultPayloadForRun(run, liveEvents, content, deps.assistantResultPayloadDeps as PayloadDeps)
    : {
      meta: {
        runtimeMessage: {
          threadId: run.threadId,
          runId: run.id,
          ...(run.assistantMessageId ? { messageId: run.assistantMessageId } : {}),
        },
      },
    }
  const messageId = deps.getStreamingAssistantMessageId?.() ?? `runtime-run:${run.id}:assistant`
  deps.resetStreamingAssistant?.()
  deps.messageStore.upsertMessage(deps.userId, deps.conversationId, messageId, {
    role: 'assistant',
    content,
    attachments: payload.attachments,
    meta: payload.meta,
  } as Omit<Message, 'id' | 'timestamp'>)
  return {
    messageId,
    content,
    artifacts: (payload.meta.draftArtifacts ?? []) as Artifact[],
  }
}

export async function completeRuntimeSendRunResult<
  Message extends AgentConversationMessageShape = AgentChatMessage,
  Meta extends AgentConversationMessageMetaShape = NonNullable<Message['meta']> & AgentConversationMessageMetaShape,
  Run extends AgentRun = AgentRun,
  Thread extends AgentThread = AgentThread,
  Artifact = unknown,
  ActivityEvent extends AgentRunActivityEvent = AgentRunActivityEvent,
  ThreadResolution = unknown,
  PendingAssistantState = unknown,
>(input: {
  draft: CompleteRuntimeSendDraft
  runResult: CompleteRuntimeSendRunResult<Run, Thread, ThreadResolution>
  deps: CompleteRuntimeSendDeps<Message, Meta, Run, Thread, Artifact, ActivityEvent, ThreadResolution, PendingAssistantState>
}): Promise<CompleteRuntimeSendResult<Run, Thread, Artifact, ActivityEvent>> {
  const { draft, runResult, deps } = input
  const { thread } = runResult
  const run = runResult.run.streamPartial
    ? await deps.getRun(runResult.run.id).catch(() => runResult.run)
    : runResult.run
  const artifacts = deps.extractArtifacts(run)
  if (!draft.localRuntime?.diagnosticCommand) {
    deps.setLocalThreadId(deps.conversationId, thread.id)
    deps.setConversationRuntimeThreadId(deps.userId, deps.conversationId, thread.id)
  }
  if (runResult.sourceMessage) {
    deps.messageStore.updateMessageMeta(deps.userId, deps.conversationId, deps.localUserMessageId, {
      runtimeMessage: runtimeMessageRef(runResult.sourceMessage, run),
      runtimeInput: {
        threadId: runResult.sourceMessage.threadId,
        runId: run.id,
        messageId: runResult.sourceMessage.id,
        status: 'accepted',
      },
    } as Meta)
  }
  if (!draft.localRuntime?.diagnosticCommand && thread.title?.trim()) {
    deps.updateConversationTitle(deps.userId, deps.conversationId, thread.title.trim())
  }
  if (draft.localRuntime?.requestId) {
    deps.setPageTaskRunning(draft.localRuntime.requestId, { conversationId: deps.conversationId, run, thread, threadId: thread.id, artifacts })
  }
  deps.setConversationRun(deps.conversationId, run, { loading: false, building: false, approving: false, stopping: false, stopRequested: false })
  deps.setPendingHttpEvents([])
  deps.setPendingAssistantState(null)
  const resolutionEvent = deps.threadResolutionActivityEvent?.(runResult.threadResolution)
  const liveEvents = resolutionEvent && deps.upsertActivityEvent
    ? deps.upsertActivityEvent(deps.liveEvents(), resolutionEvent)
    : deps.liveEvents()
  deps.setLiveEventsRef(liveEvents)
  if (run.status !== 'requires_action') {
    await deps.appendAssistantRunResult(run, thread, liveEvents)
  }
  if (!draft.localRuntime?.diagnosticCommand) {
    const existingMessages = deps.getExistingMessages()
    const projection = await deps.loadRuntimeThreadProjection({
      threadId: thread.id,
      thread,
      ensureRuns: [run],
      existingMessages,
      liveEventsByRunId: { [run.id]: liveEvents },
    })
    deps.messageStore.setConversationMessages(deps.userId, deps.conversationId, mergeRuntimeThreadProjectionMessages(existingMessages, projection))
  }
  deps.setLiveEventsRef([])
  deps.setLiveTraceEvents([])
  if (deps.runTouchesAgentCatalog(run)) deps.refreshAgentCatalogContext()
  deps.notifyRunSettled({
    ...(draft.localRuntime?.requestId ? { requestId: draft.localRuntime.requestId } : {}),
    status: runtimeSendSettledStatusFromRun(run),
    run,
    thread,
    artifacts,
  })
  return { run, thread, artifacts, liveEvents }
}

export function runtimeSendSettledStatusFromRun(run: Pick<AgentRun, 'status'>): RuntimeSendSettledStatus {
  if (run.status === 'failed') return 'error'
  if (run.status === 'cancelled') return 'cancelled'
  return 'completed'
}

export interface SendRuntimeInputMessageDeps<
  Message extends AgentConversationMessageShape = AgentChatMessage,
  Meta extends AgentConversationMessageMetaShape = NonNullable<Message['meta']> & AgentConversationMessageMetaShape,
  Run extends { id: string } = AgentRun,
> {
  userId: string
  conversationId: string
  threadId: string
  run: Run
  messageStore: Pick<AgentConversationMessageStore<Message, Meta>, 'addMessage' | 'updateMessageMeta'>
  createMessageRun: (threadId: string, input: {
    message: string
    sourceMessageId?: string
    activeRunPolicy: 'runtime_input'
    runtimeInputMode: 'soft'
  }) => Promise<SendRuntimeInputMessageResult<Run>>
  setConversationRun: (conversationId: string, run: Run, patch?: { loading?: boolean; building?: boolean; error?: string }) => void
  setConversationRuntime: (conversationId: string, patch: { loading?: boolean; building?: boolean; error?: string }) => void
}

export async function sendRuntimeInputMessage<
  Message extends AgentConversationMessageShape = AgentChatMessage,
  Meta extends AgentConversationMessageMetaShape = NonNullable<Message['meta']> & AgentConversationMessageMetaShape,
  Run extends { id: string } = AgentRun,
>(input: {
  content: string
  attachments?: Message['attachments']
  deps: SendRuntimeInputMessageDeps<Message, Meta, Run>
}): Promise<void> {
  const content = input.content.trim()
  if (!content && !(input.attachments && input.attachments.length > 0)) return
  const { deps } = input
  const localMessageId = deps.messageStore.addMessage(deps.userId, deps.conversationId, {
    role: 'user',
    content,
    ...(input.attachments && input.attachments.length > 0 ? { attachments: input.attachments } : {}),
    meta: {
      runtimeInput: {
        threadId: deps.threadId,
        runId: deps.run.id,
        status: 'pending',
      },
    },
  } as Omit<Message, 'id' | 'timestamp'>)
  try {
    const result = await deps.createMessageRun(deps.threadId, {
      message: content,
      sourceMessageId: localMessageId,
      activeRunPolicy: 'runtime_input',
      runtimeInputMode: 'soft',
    })
    const runtimeInput = result.runtimeInput
    deps.messageStore.updateMessageMeta(deps.userId, deps.conversationId, localMessageId, {
      runtimeInput: {
        threadId: deps.threadId,
        runId: runtimeInput?.runId ?? result.run.id,
        messageId: runtimeInput?.messageId ?? result.message.id,
        status: runtimeInput && !runtimeInput.accepted ? 'pending' : 'accepted',
      },
      runtimeMessage: {
        threadId: deps.threadId,
        messageId: result.message.id,
        runId: result.run.id,
      },
    } as Meta)
    deps.setConversationRun(deps.conversationId, result.run, { loading: true, building: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    deps.messageStore.updateMessageMeta(deps.userId, deps.conversationId, localMessageId, {
      runtimeInput: {
        threadId: deps.threadId,
        runId: deps.run.id,
        status: 'failed',
        error: message,
      },
    } as Meta)
    deps.setConversationRuntime(deps.conversationId, { loading: true, building: false, error: message })
    throw error
  }
}

function runtimeMessageRef(sourceMessage: AgentMessage, run: Pick<AgentRun, 'id'>): AgentChatMessageMeta['runtimeMessage'] {
  return {
    threadId: sourceMessage.threadId,
    messageId: sourceMessage.id,
    runId: run.id,
  }
}

function isReplacedByRuntimeProjection(
  message: RuntimeConversationMessage,
  threadId: string,
  projectedIds: Set<string>,
  projectedRuntimeContentKeys: Set<string>,
): boolean {
  if (message.meta?.runtimeMessage?.threadId === threadId) return true
  if (projectedIds.has(message.id)) return true
  if (!isRuntimeGeneratedLocalMessage(message)) return false
  return projectedRuntimeContentKeys.has(runtimeContentKey(message))
}

function isRuntimeProjectedMessage(message: RuntimeConversationMessage): boolean {
  return message.id.startsWith('runtime:')
    || message.id.startsWith('runtime-run:')
    || !!message.meta?.runtimeMessage
}

function isRuntimeGeneratedLocalMessage(message: RuntimeConversationMessage): boolean {
  if (isRuntimeProjectedMessage(message)) return true
  const meta = message.meta
  return !!meta?.localRunActivity
    || !!meta?.generationJobs?.length
    || !!meta?.draftArtifacts?.length
    || !!meta?.contextLabels?.some((label) => /^run\s+\S+/i.test(label))
}

function runtimeContentKey(message: RuntimeConversationMessage): string {
  return `${message.role}:${message.content.trim()}`
}

function dedupeProjectedRuntimeMessages<Message extends AgentConversationMessageShape>(messages: Message[]): Message[] {
  const byKey = new Map<string, Message>()
  const indexByKey = new Map<string, number>()
  const result: Message[] = []
  for (const message of messages) {
    const key = runtimeAssistantResultKey(message)
    if (!key) {
      result.push(message)
      continue
    }
    const existing = byKey.get(key)
    const next = existing ? richerRuntimeMessage(existing, message) : message
    byKey.set(key, next)
    const existingIndex = indexByKey.get(key)
    if (existingIndex !== undefined) {
      result[existingIndex] = next
      continue
    }
    indexByKey.set(key, result.length)
    result.push(next)
  }
  return result
}

function compareMergedRuntimeMessages<Message extends AgentConversationMessageShape>(
  projectedMessages: Message[],
): (a: Message, b: Message) => number {
  const projectedOrder = new Map<string, number>()
  projectedMessages.forEach((message, index) => {
    projectedOrder.set(message.id, index)
    const runtime = message.meta?.runtimeMessage
    if (runtime?.threadId && runtime.runId) projectedOrder.set(`runtime-run:${runtime.threadId}:${runtime.runId}`, index)
    if (runtime?.threadId && runtime.messageId) projectedOrder.set(`runtime-message:${runtime.threadId}:${runtime.messageId}`, index)
  })
  return (a, b) => {
    const leftOrder = mergedRuntimeMessageOrder(a, projectedOrder)
    const rightOrder = mergedRuntimeMessageOrder(b, projectedOrder)
    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder || a.timestamp - b.timestamp || a.id.localeCompare(b.id)
    }
    return a.timestamp - b.timestamp || a.id.localeCompare(b.id)
  }
}

function mergedRuntimeMessageOrder(
  message: AgentConversationMessageShape,
  projectedOrder: Map<string, number>,
): number | undefined {
  const direct = projectedOrder.get(message.id)
  if (direct !== undefined) return direct
  const runtime = message.meta?.runtimeMessage
  if (!runtime?.threadId) return undefined
  if (runtime.messageId) {
    const messageOrder = projectedOrder.get(`runtime-message:${runtime.threadId}:${runtime.messageId}`)
    if (messageOrder !== undefined) return messageOrder
  }
  return runtime.runId ? projectedOrder.get(`runtime-run:${runtime.threadId}:${runtime.runId}`) : undefined
}

function runtimeAssistantResultKey(message: RuntimeConversationMessage): string | undefined {
  const runtime = message.meta?.runtimeMessage
  if (message.meta?.planRevision) return undefined
  if (message.role !== 'assistant' || !runtime?.threadId || !runtime.runId) return undefined
  return `${runtime.threadId}:${runtime.runId}`
}

function richerRuntimeMessage<Message extends AgentConversationMessageShape>(left: Message, right: Message): Message {
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

function runtimeMessageScore(message: RuntimeConversationMessage): number {
  const meta = message.meta
  let score = 0
  if (meta?.runtimeMessage?.messageId) score += 3
  if (meta?.localRunActivity) score += 2
  if (meta?.generationJobs?.length) score += 1
  if (meta?.draftArtifacts?.length) score += 1
  if (message.attachments?.length) score += 1
  return score
}

async function projectRuntimeMessage<PayloadDeps>(input: {
  message: AgentMessage
  run?: AgentRun
  existing?: RuntimeConversationMessage
  liveEvents?: AgentRunActivityEvent[]
  deps?: AgentConversationProjectionDeps<PayloadDeps>
}): Promise<RuntimeConversationMessage> {
  const timestamp = runtimeTimestamp(input.message.createdAt)
  const baseMeta: AgentConversationMessageMetaShape = {
    ...input.existing?.meta,
    ...planRevisionMeta(input.message.metadata),
    ...runtimeInputMeta(input.message),
    runtimeMessage: {
      threadId: input.message.threadId,
      messageId: input.message.id,
      ...(input.run ? { runId: input.run.id } : input.existing?.meta?.runtimeMessage?.runId ? { runId: input.existing.meta.runtimeMessage.runId } : {}),
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

function planRevisionMeta(metadata: AgentMessage['metadata']): Partial<Pick<AgentChatMessageMeta, 'planRevision'>> {
  if (!isRecord(metadata) || metadata.kind !== 'plan_revision') return {}
  const revision = metadata.planRevision
  if (!isPlanRevision(revision)) return {}
  return { planRevision: revision }
}

function runtimeInputMeta(message: AgentMessage): Partial<Pick<AgentChatMessageMeta, 'runtimeInput'>> {
  const metadata = message.metadata
  if (message.role !== 'user' || !isRecord(metadata) || metadata.kind !== 'runtime_input') return {}
  const targetRunId = typeof metadata.targetRunId === 'string' && metadata.targetRunId.trim()
    ? metadata.targetRunId.trim()
    : typeof message.runId === 'string' && message.runId.trim()
      ? message.runId.trim()
      : undefined
  if (!targetRunId) return {}
  const status = metadata.status === 'pending'
    || metadata.status === 'consumed'
    || metadata.status === 'failed'
    || metadata.status === 'accepted'
    ? metadata.status
    : 'accepted'
  return {
    runtimeInput: {
      threadId: message.threadId,
      runId: targetRunId,
      messageId: message.id,
      status,
    },
  }
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

function attachmentKind(mimeType: string, fallbackName = ''): AgentAttachment['type'] {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (/\.(heic|heif)$/i.test(fallbackName)) return 'image'
  if (mimeType.startsWith('text/') || /\.(txt|md|json|csv|srt)$/i.test(fallbackName)) return 'text'
  return 'file'
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

function numberOrFallback(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function numberOrUndefined(value: unknown): number | undefined {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined
}

function existingRuntimeMessageMap<Message extends AgentConversationMessageShape>(messages: Message[], threadId: string): Map<string, Message> {
  const byRuntimeId = new Map<string, Message>()
  for (const message of messages) {
    const runtime = message.meta?.runtimeMessage
    if (runtime?.threadId !== threadId || !runtime.messageId) continue
    byRuntimeId.set(runtime.messageId, message)
  }
  return byRuntimeId
}

function existingLocalUserEchoMap<Message extends AgentConversationMessageShape>(messages: Message[], contentKey: (text: string) => string): Map<string, Message[]> {
  const byKey = new Map<string, Message[]>()
  for (const message of messages) {
    if (!isLocalRuntimeUserEcho(message)) continue
    const key = contentKey(message.content)
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

function consumeExistingLocalUserEcho<Message extends AgentConversationMessageShape>(byKey: Map<string, Message[]>, message: AgentMessage, contentKey: (text: string) => string): Message | undefined {
  const key = runtimeUserEchoKey(message, contentKey)
  if (!key) return undefined
  return byKey.get(key)?.shift()
}

function isLocalRuntimeUserEcho(message: RuntimeConversationMessage): boolean {
  const meta = message.meta
  return message.role === 'user'
    && !meta?.runtimeMessage
    && (!!meta?.agentName || meta?.modelId !== undefined || !!meta?.permissionMode)
}

function runtimeUserEchoKey(message: AgentMessage, contentKey: (text: string) => string): string {
  const clientInput = isRecord(message.clientInput) ? message.clientInput : undefined
  const visibleMessage = typeof clientInput?.visibleMessage === 'string' && clientInput.visibleMessage.trim()
    ? clientInput.visibleMessage
    : typeof clientInput?.message === 'string'
      ? clientInput.message
      : message.content
  return contentKey(visibleMessage)
}

function defaultLocalUserEchoContentKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function existingAssistantRuntimeRunMap<Message extends AgentConversationMessageShape>(messages: Message[], threadId: string): Map<string, Message> {
  const byRunId = new Map<string, Message>()
  for (const message of messages) {
    const runtime = message.meta?.runtimeMessage
    if (message.role !== 'assistant' || runtime?.threadId !== threadId || !runtime.runId) continue
    byRunId.set(runtime.runId, message)
  }
  return byRunId
}

function continuationResumeApprovalFromInteraction(
  interaction: RuntimeInteraction,
  payload: Record<string, unknown> | undefined,
): NonNullable<AgentRun['pendingApprovals']>[number] | undefined {
  if (interaction.kind !== 'selection' || payload?.type !== 'runtime_continuation_resume') return undefined
  const continuationId = typeof payload.continuationId === 'string' ? payload.continuationId : undefined
  if (!continuationId) return undefined
  const status = interaction.status === 'approved' ? 'approved' : interaction.status === 'rejected' ? 'rejected' : interaction.status === 'pending' ? 'pending' : undefined
  if (!status) return undefined
  return {
    id: `runtime-continuation-${continuationId}`,
    runId: interaction.runId,
    interactionId: interaction.id,
    toolName: 'runtime_continuation_resume',
    args: {
      continuationId,
      workIds: Array.isArray(payload.workIds) ? payload.workIds.filter((item): item is string => typeof item === 'string') : [],
    },
    reason: typeof payload.summary === 'string'
      ? payload.summary
      : '检测到异步任务已有结果，可以启动一个新的接续 run。',
    risk: 'resume',
    permission: 'runtime.continuation',
    status,
    createdAt: interaction.createdAt,
    updatedAt: interaction.updatedAt,
    ...(interaction.resolvedAt && status === 'approved' ? { approvedAt: interaction.resolvedAt } : {}),
    ...(interaction.resolvedAt && status === 'rejected' ? { rejectedAt: interaction.resolvedAt } : {}),
  }
}

function runNeedsRuntimeUserAction(run: AgentRun): boolean {
  return run.status === 'requires_action'
    && (
      (run.pendingApprovals ?? []).some((approval) => approval.status === 'pending')
      || (run.pendingInputRequests ?? []).some((request) => request.status === 'pending')
    )
}

function timelineDecisions(events: AgentRunActivityEvent[]): AgentRunTimelineDecision[] {
  return events.flatMap((event) => {
    if (event.kind !== 'model_call' || event.title !== 'Model tool calls requested') return []
    const data = isRecord(event.data) ? event.data : undefined
    const toolCalls = Array.isArray(data?.tool_calls)
      ? data.tool_calls
          .map((call) => timelineDecisionToolCall(isRecord(call) ? call : undefined))
          .filter((call): call is AgentRunTimelineDecisionToolCall => Boolean(call))
      : []
    if (toolCalls.length === 0) return []
    return [{
      id: `decision-${event.id}`,
      event,
      toolCalls,
    }]
  }).sort(compareTimelineDecisions)
}

function timelineDecisionToolCall(call: Record<string, unknown> | undefined): AgentRunTimelineDecisionToolCall | undefined {
  const name = typeof call?.name === 'string' && call.name.trim() ? call.name.trim() : undefined
  if (!name) return undefined
  const args = isRecord(call?.args) ? call.args : undefined
  const id = typeof call?.id === 'string' && call.id.trim() ? call.id.trim() : undefined
  return {
    ...(id ? { id } : {}),
    name,
    ...(args ? { args } : {}),
  }
}

function timelineToolExecutions(
  activity: AgentRunActivity,
  decisions: AgentRunTimelineDecision[],
): AgentRunTimelineToolExecution[] {
  const decisionOrderCandidates = timelineDecisionOrderCandidates(decisions)
  const eventsByStep = new Map<string, AgentRunActivityEvent[]>()
  for (const event of activity.events ?? []) {
    if (!event.stepId) continue
    const events = eventsByStep.get(event.stepId) ?? []
    events.push(event)
    eventsByStep.set(event.stepId, events)
  }

  const executions: AgentRunTimelineToolExecution[] = (activity.steps ?? [])
    .filter((step) => step.type === 'tool_call' && typeof step.toolName === 'string' && step.toolName.trim())
    .map((step) => ({
      id: `step-${step.id}`,
      toolName: step.toolName!,
      createdAt: step.createdAt,
      ...(step.completedAt ? { completedAt: step.completedAt } : {}),
      ...(step.roundIndex !== undefined ? { roundIndex: step.roundIndex } : {}),
      ...(step.roundLabel ? { roundLabel: step.roundLabel } : {}),
      step,
      events: (eventsByStep.get(step.id) ?? []).sort(compareTimelineEvents),
      approvals: [],
    }))

  const coveredStepIds = new Set((activity.steps ?? []).map((step) => step.id))
  for (const event of activity.events ?? []) {
    if (event.kind !== 'tool_call' || !event.toolName || event.title === 'Model tool call delta') continue
    if (event.stepId && coveredStepIds.has(event.stepId)) continue
    executions.push({
      id: `event-${event.id}`,
      toolName: event.toolName,
      createdAt: event.createdAt,
      ...(event.completedAt ? { completedAt: event.completedAt } : {}),
      ...(event.roundIndex !== undefined ? { roundIndex: event.roundIndex } : {}),
      ...(event.roundLabel ? { roundLabel: event.roundLabel } : {}),
      events: [event],
      approvals: [],
    })
  }

  for (const approval of [...(activity.approvals ?? [])].sort(compareTimelineApprovals)) {
    const match = findTimelineApprovalExecution(executions, approval)
    if (match) {
      match.approvals.push(approval)
      if (timelineTime(approval.createdAt) < timelineTime(match.createdAt)) match.createdAt = approval.createdAt
      continue
    }
    executions.push({
      id: `approval-${approval.id}`,
      toolName: approval.toolName,
      createdAt: approval.createdAt,
      approvals: [approval],
      events: [],
    })
  }

  for (const execution of executions) {
    const decisionOrder = timelineDecisionOrderForExecution(execution, decisionOrderCandidates)
    if (decisionOrder !== undefined) execution.decisionOrder = decisionOrder
    execution.approvals.sort(compareTimelineApprovals)
  }
  return executions.sort(compareTimelineToolExecutions)
}

interface TimelineDecisionOrderCandidate {
  order: number
  toolName: string
  argsSignature?: string
  roundIndex?: number
  used: boolean
}

function timelineDecisionOrderCandidates(decisions: AgentRunTimelineDecision[]): TimelineDecisionOrderCandidate[] {
  let order = 0
  return [...decisions].sort(compareTimelineDecisions).flatMap((decision) => (
    decision.toolCalls.map((call) => ({
      order: order++,
      toolName: call.name,
      ...(call.args !== undefined ? { argsSignature: timelineArgsSignature(call.args) } : {}),
      ...(decision.event.roundIndex !== undefined ? { roundIndex: decision.event.roundIndex } : {}),
      used: false,
    }))
  ))
}

function timelineDecisionOrderForExecution(
  execution: AgentRunTimelineToolExecution,
  candidates: TimelineDecisionOrderCandidate[],
): number | undefined {
  const sameTool = candidates.filter((candidate) => !candidate.used && candidate.toolName === execution.toolName)
  if (sameTool.length === 0) return undefined
  const argsSignature = timelineExecutionArgsSignature(execution)
  const exact = argsSignature
    ? sameTool.filter((candidate) => candidate.argsSignature === argsSignature)
    : []
  const pool = exact.length > 0 ? exact : sameTool
  const roundMatched = execution.roundIndex !== undefined
    ? pool.filter((candidate) => candidate.roundIndex === execution.roundIndex)
    : []
  const candidate = [...(roundMatched.length > 0 ? roundMatched : pool)]
    .sort((left, right) => left.order - right.order)[0]
  if (!candidate) return undefined
  candidate.used = true
  return candidate.order
}

function timelineExecutionArgsSignature(execution: AgentRunTimelineToolExecution): string | undefined {
  if (execution.step?.args !== undefined) return timelineArgsSignature(execution.step.args)
  for (const event of execution.events) {
    const data = isRecord(event.data) ? event.data : undefined
    if (data?.args !== undefined) return timelineArgsSignature(data.args)
  }
  const approval = execution.approvals.find((item) => item.args !== undefined)
  return approval?.args !== undefined ? timelineArgsSignature(approval.args) : undefined
}

function findTimelineApprovalExecution(
  executions: AgentRunTimelineToolExecution[],
  approval: AgentRunActivityApproval,
): AgentRunTimelineToolExecution | undefined {
  const sameTool = executions.filter((execution) => execution.toolName === approval.toolName)
  if (sameTool.length === 0) return undefined
  const signature = timelineArgsSignature(approval.args)
  const exact = sameTool.find((execution) => execution.step && timelineArgsSignature(execution.step.args) === signature)
    ?? sameTool.find((execution) => execution.events.some((event) => {
      const data = isRecord(event.data) ? event.data : undefined
      return timelineArgsSignature(data?.args) === signature
    }))
  if (exact) return exact
  const approvalTime = timelineTime(approval.createdAt)
  return [...sameTool].sort((left, right) => (
    Math.abs(timelineTime(left.createdAt) - approvalTime) - Math.abs(timelineTime(right.createdAt) - approvalTime)
      || compareTimelineToolExecutions(left, right)
  ))[0]
}

function timelineRoundSeeds(
  activity: AgentRunActivity,
  decisions: AgentRunTimelineDecision[],
  toolExecutions: AgentRunTimelineToolExecution[],
  inputs: AgentRunActivityInputRequest[],
): Array<Omit<AgentRunTimelineRound, 'decisions' | 'toolExecutions' | 'inputs'>> {
  const byId = new Map<string, Omit<AgentRunTimelineRound, 'decisions' | 'toolExecutions' | 'inputs'>>()
  const ensureRound = (input: {
    id: string
    index?: number
    startedAt: string
    finishedAt?: string
    failed?: boolean
    finished?: boolean
  }) => {
    const current = byId.get(input.id)
    byId.set(input.id, {
      id: input.id,
      ...(input.index !== undefined ? { index: input.index } : current?.index !== undefined ? { index: current.index } : {}),
      startedAt: current && timelineTime(current.startedAt) <= timelineTime(input.startedAt) ? current.startedAt : input.startedAt,
      ...(input.finishedAt ?? current?.finishedAt ? { finishedAt: maxTimelineTimestamp(input.finishedAt, current?.finishedAt) } : {}),
      failed: Boolean(current?.failed || input.failed),
      finished: Boolean(current?.finished || input.finished),
    })
  }

  for (const event of activity.events ?? []) {
    if (event.roundIndex === undefined) continue
    ensureRound({
      id: timelineRoundId(event.roundIndex),
      index: event.roundIndex,
      startedAt: event.createdAt,
      ...(event.completedAt ? { finishedAt: event.completedAt } : {}),
      failed: timelineEventIsFailure(event),
      finished: event.status === 'completed',
    })
  }
  for (const decision of decisions) {
    if (decision.event.roundIndex === undefined) continue
    ensureRound({ id: timelineRoundId(decision.event.roundIndex), index: decision.event.roundIndex, startedAt: decision.event.createdAt })
  }
  for (const tool of toolExecutions) {
    if (tool.roundIndex === undefined) continue
    ensureRound({
      id: timelineRoundId(tool.roundIndex),
      index: tool.roundIndex,
      startedAt: tool.createdAt,
      ...(tool.completedAt ? { finishedAt: tool.completedAt } : {}),
      failed: tool.step?.status === 'failed' || tool.events.some((event) => event.status === 'failed' || event.status === 'blocked'),
      finished: tool.step?.status === 'completed' || tool.events.some((event) => event.status === 'completed'),
    })
  }

  const items = [
    ...decisions.map((decision) => decision.event),
    ...toolExecutions,
    ...inputs,
  ]
  for (const item of items) {
    if (timelineRoundKeyForItem(item, [...byId.values()]) !== 'round-unknown') continue
    ensureRound({ id: `round-time-${timelineTime(item.createdAt)}`, startedAt: item.createdAt })
  }
  if (byId.size === 0) ensureRound({ id: 'round-unknown', startedAt: activity.startedAt ?? activity.createdAt })

  return [...byId.values()].sort(compareTimelineRounds)
}

function timelineRoundKeyForItem(
  item: { createdAt: string; roundIndex?: number },
  rounds: Array<Pick<AgentRunTimelineRound, 'id' | 'index' | 'startedAt'>>,
): string {
  if (item.roundIndex !== undefined) return timelineRoundId(item.roundIndex)
  const itemTime = timelineTime(item.createdAt)
  const explicitRounds = rounds
    .filter((round) => round.index !== undefined)
    .sort(compareTimelineRounds)
  const candidates = explicitRounds.length > 0 ? explicitRounds : [...rounds].sort(compareTimelineRounds)
  const round = [...candidates].reverse().find((candidate) => timelineTime(candidate.startedAt) <= itemTime)
  return round?.id ?? 'round-unknown'
}

function timelineRoundId(index: number): string {
  return `round-${index}`
}

function timelineEventIsFailure(event: AgentRunActivityEvent): boolean {
  if (event.status === 'failed') return true
  if (event.status !== 'blocked') return false
  return event.kind !== 'input' && event.kind !== 'approval'
}

function compareTimelineRounds(
  left: Pick<AgentRunTimelineRound, 'id' | 'index' | 'startedAt'>,
  right: Pick<AgentRunTimelineRound, 'id' | 'index' | 'startedAt'>,
): number {
  return (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER)
    || timelineTime(left.startedAt) - timelineTime(right.startedAt)
    || left.id.localeCompare(right.id)
}

function compareTimelineDecisions(left: AgentRunTimelineDecision, right: AgentRunTimelineDecision): number {
  return compareTimelineEvents(left.event, right.event)
}

function compareTimelineToolExecutions(left: AgentRunTimelineToolExecution, right: AgentRunTimelineToolExecution): number {
  return (left.roundIndex ?? Number.MAX_SAFE_INTEGER) - (right.roundIndex ?? Number.MAX_SAFE_INTEGER)
    || (left.decisionOrder ?? Number.MAX_SAFE_INTEGER) - (right.decisionOrder ?? Number.MAX_SAFE_INTEGER)
    || timelineTime(left.createdAt) - timelineTime(right.createdAt)
    || left.id.localeCompare(right.id)
}

function compareTimelineInputs(left: AgentRunActivityInputRequest, right: AgentRunActivityInputRequest): number {
  return timelineTime(left.createdAt) - timelineTime(right.createdAt) || left.id.localeCompare(right.id)
}

function compareTimelineApprovals(left: AgentRunActivityApproval, right: AgentRunActivityApproval): number {
  return timelineTime(left.createdAt) - timelineTime(right.createdAt) || left.id.localeCompare(right.id)
}

function compareTimelineEvents(left: AgentRunActivityEvent, right: AgentRunActivityEvent): number {
  return timelineTime(left.createdAt) - timelineTime(right.createdAt) || left.id.localeCompare(right.id)
}

function timelineArgsSignature(value: unknown): string {
  return JSON.stringify(sortTimelineValue(value ?? null))
}

function sortTimelineValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortTimelineValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortTimelineValue(value[key])]))
}

function maxTimelineTimestamp(left: string | undefined, right: string | undefined): string | undefined {
  if (!left) return right
  if (!right) return left
  return timelineTime(left) >= timelineTime(right) ? left : right
}

function timelineTime(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

function compareRunsByUpdatedAtDesc(a: AgentRun, b: AgentRun): number {
  return runtimeTimestamp(b.updatedAt ?? b.createdAt) - runtimeTimestamp(a.updatedAt ?? a.createdAt)
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

function compareProjectedRuntimeMessagesByRunOrder(
  runs: AgentRun[],
  thread: Pick<AgentThread, 'messages'>,
): (a: RuntimeConversationMessage, b: RuntimeConversationMessage) => number {
  const order = runtimeRunOrder(runs, thread)
  return (a, b) => {
    const leftRunId = a.meta?.runtimeMessage?.runId
    const rightRunId = b.meta?.runtimeMessage?.runId
    const leftOrder = leftRunId ? order.get(leftRunId) : undefined
    const rightOrder = rightRunId ? order.get(rightRunId) : undefined
    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder
        || a.timestamp - b.timestamp
        || runtimeMessageRoleOrder(a) - runtimeMessageRoleOrder(b)
        || a.id.localeCompare(b.id)
    }
    return a.timestamp - b.timestamp || a.id.localeCompare(b.id)
  }
}

function runtimeRunOrder(runs: AgentRun[], thread: Pick<AgentThread, 'messages'>): Map<string, number> {
  const messagesById = new Map(thread.messages.map((message) => [message.id, message]))
  const ordered = [...runs].sort((left, right) => (
    runtimeRunTriggerTimestamp(left, messagesById) - runtimeRunTriggerTimestamp(right, messagesById)
      || runtimeTimestamp(left.createdAt) - runtimeTimestamp(right.createdAt)
      || left.id.localeCompare(right.id)
  ))
  return new Map(ordered.map((run, index) => [run.id, index]))
}

function runtimeRunTriggerTimestamp(run: AgentRun, messagesById: Map<string, AgentMessage>): number {
  const sourceMessage = run.input?.sourceMessageId ? messagesById.get(run.input.sourceMessageId) : undefined
  return runtimeTimestamp(sourceMessage?.createdAt ?? run.createdAt)
}

function runtimeMessageRoleOrder(message: RuntimeConversationMessage): number {
  if (message.role === 'user') return 0
  return 1
}

function syntheticAssistantRunTimestamp(run: AgentRun, sourceMessage: AgentMessage | undefined): number {
  const runCreatedAt = runtimeTimestamp(run.createdAt)
  const sourceCreatedAt = runtimeTimestamp(sourceMessage?.createdAt)
  return sourceMessage ? Math.max(runCreatedAt, sourceCreatedAt + 1) : runCreatedAt
}

function runtimeTimestamp(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

async function assistantResultPayloadForRun<PayloadDeps>(
  run: AgentRun,
  liveEvents: AgentRunActivityEvent[],
  assistantContent: string,
  deps: AgentConversationProjectionDeps<PayloadDeps> | undefined,
): Promise<AgentMessageViewModelPayload> {
  if (deps?.assistantResultPayloadForRun) {
    return deps.assistantResultPayloadForRun(run, liveEvents, assistantContent, deps.assistantResultPayloadDeps as PayloadDeps)
  }
  return {
    meta: {
      runtimeMessage: {
        threadId: run.threadId,
        runId: run.id,
        ...(run.assistantMessageId ? { messageId: run.assistantMessageId } : {}),
      },
    },
  }
}

function formatAssistantContent<PayloadDeps>(
  run: AgentRun,
  thread: Pick<AgentThread, 'messages'>,
  deps: AgentConversationProjectionDeps<PayloadDeps> | undefined,
): string {
  if (deps?.formatAssistantContent) return deps.formatAssistantContent(run, thread)
  const assistant = thread.messages.find((item) => item.id === run.assistantMessageId)
    ?? [...thread.messages].reverse().find((item) => item.role === 'assistant' && item.runId === run.id)
  if (assistant?.content) return assistant.content
  if (run.status === 'failed') return run.error ?? 'Run failed.'
  if (run.status === 'cancelled') return 'Run cancelled.'
  if (run.status === 'requires_action') return 'Run requires action.'
  return ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function uniqueStrings(values: unknown[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

function defaultId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function createNormalizedId(options: AgentConversationNormalizeOptions): string {
  return options.createId?.() ?? defaultId()
}
