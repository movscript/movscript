import type {
  AgentAttachment,
  AgentChatMessage,
  AgentChatMessageMeta,
  AgentConversation,
  AgentConversationWorkspace,
  AgentConversationWorkspaceContext,
  AgentRun,
  AgentTimelineActivity,
  AgentTimelineActivityApproval,
  AgentTimelineActivityEvent,
  AgentTimelineActivityInputRequest,
  AgentTimelineActivityStep,
  AgentThread,
  ProviderInteraction,
} from '@movscript/core/agent/protocol'

export type {
  AgentAttachment,
  AgentChatMessage,
  AgentChatMessageMeta,
  AgentConversation,
  AgentConversationWorkspace,
  AgentGenerationJob,
  AgentPlan,
  AgentPlanRevision,
  AgentRun,
  AgentTimelineActivity,
  AgentTimelineActivityEvent,
  AgentTimelineActivityStep,
  ProviderSessionInputRef,
  ProviderSessionMessageRef,
  AgentThread,
  ProviderInteraction,
} from '@movscript/core/agent/protocol'

export interface AgentConversationTranscriptMessageMetaShape {
  modelId?: number | null
  agentName?: string
  permissionMode?: string
  contextLabels?: string[]
  promptEligibility?: AgentChatMessageMeta['promptEligibility']
  providerSessionMessage?: AgentChatMessageMeta['providerSessionMessage']
  providerSessionInput?: AgentChatMessageMeta['providerSessionInput']
  generationJobs?: unknown[]
  generationParamAudits?: unknown[]
  generationValidationErrors?: unknown[]
  workspaceArtifacts?: unknown[]
}

export interface AgentConversationTranscriptMessageShape<Meta = AgentConversationTranscriptMessageMetaShape> {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: AgentAttachment[]
  meta?: Meta
  timestamp: number
}

export interface AgentConversationShape<Message extends AgentConversationTranscriptMessageShape = AgentConversationTranscriptMessageShape> {
  id: string
  title: string
  transcriptMessages: Message[]
  providerSessionId?: string
  providerThreadId?: string
  archived?: boolean
  createdAt: number
  updatedAt: number
}

export interface AgentConversationWorkspaceShape<Attachment extends AgentAttachment = AgentAttachment> {
  input: string
  attachments: Attachment[]
  workspaceContext?: AgentConversationWorkspaceContext
}

export interface ProviderThreadRunState<Run extends AgentRun = AgentRun> {
  runs: Run[]
  actionableRuns: Run[]
  currentRun?: Run
}

export interface ResolveProviderThreadRunStateInput<Run extends AgentRun = AgentRun> {
  runs?: Run[]
  ensureRuns?: Run[]
  interactions?: ProviderInteraction[]
  current?: {
    activeRunIds?: string[]
    waitingRunIds?: string[]
  }
  thread?: Pick<AgentThread, 'activeRunId' | 'lastRunId'>
}

export interface AgentRunActivityRoundIndex {
  runId: string
  threadId: string
  status: string
  createdAt: string
  updatedAt: string
  rounds: AgentRunActivityRound[]
  unassignedInputs: AgentTimelineActivityInputRequest[]
}

export interface AgentRunActivityRound {
  id: string
  index?: number
  label?: string
  source?: AgentTimelineActivityStep['roundSource'] | AgentTimelineActivityEvent['roundSource']
  startedAt: string
  finishedAt?: string
  failed: boolean
  finished: boolean
  decisions: AgentRunActivityDecision[]
  toolExecutions: AgentRunActivityToolExecution[]
  inputs: AgentTimelineActivityInputRequest[]
}

export interface AgentRunActivityDecision {
  id: string
  event: AgentTimelineActivityEvent
  toolCalls: AgentRunActivityDecisionToolCall[]
}

export interface AgentRunActivityDecisionToolCall {
  id?: string
  name: string
}

export interface AgentRunActivityToolExecution {
  id: string
  toolName: string
  decisionOrder?: number
  activityOrder?: number
  createdAt: string
  completedAt?: string
  roundIndex?: number
  roundLabel?: string
  roundSource?: AgentTimelineActivityStep['roundSource'] | AgentTimelineActivityEvent['roundSource']
  step?: AgentTimelineActivityStep
  events: AgentTimelineActivityEvent[]
  approvals: AgentTimelineActivityApproval[]
}

export interface AgentUserConversationState<
  Conversation extends AgentConversationShape = AgentConversation,
  Workspace extends AgentConversationWorkspaceShape = AgentConversationWorkspace,
> {
  conversations: Conversation[]
  activeConversationId: string | null
  workspacesByConversation: Record<string, Workspace>
}

export interface AgentConversationMutationOptions {
  createId?: () => string
  now?: () => number
}

export type AgentConversationTranscriptMessageInput<Message extends AgentConversationTranscriptMessageShape> =
  Omit<Message, 'id' | 'timestamp'> & { timestamp?: number }

export interface AgentConversationNormalizeOptions {
  createId?: () => string
  defaultTitle?: string
  now?: () => number
}

const PROVIDER_SESSION_ID_COMPAT_KEY = ['runtime', 'Session', 'Id'].join('')

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
        : typeof conversation[PROVIDER_SESSION_ID_COMPAT_KEY] === 'string' && conversation[PROVIDER_SESSION_ID_COMPAT_KEY].trim()
          ? conversation[PROVIDER_SESSION_ID_COMPAT_KEY].trim()
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
  const scope = value.scope === 'production' || value.scope === 'project' || value.scope === 'global'
    ? value.scope
    : undefined
  const userId = stringOrNumber(value.userId)
  const projectId = stringOrNumber(value.projectId)
  const productionId = stringOrNumber(value.productionId)
  if (!scope && userId === undefined && projectId === undefined && productionId === undefined) return undefined
  if (scope === 'production' && projectId !== undefined && productionId !== undefined) {
    return {
      scope,
      ...(userId !== undefined ? { userId } : {}),
      projectId,
      productionId,
    }
  }
  if ((scope === 'project' || projectId !== undefined) && projectId !== undefined) {
    return {
      scope: 'project',
      ...(userId !== undefined ? { userId } : {}),
      projectId,
    }
  }
  return {
    scope: 'global',
    ...(userId !== undefined ? { userId } : {}),
  }
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

export function appendConversationTranscriptMessage<
  Message extends AgentConversationTranscriptMessageShape,
  Conversation extends { transcriptMessages: Message[]; updatedAt: number },
>(
  conversation: Conversation,
  message: AgentConversationTranscriptMessageInput<Message>,
  options: AgentConversationMutationOptions = {},
): { conversation: Conversation; messageId: string } {
  const messageId = options.createId?.() ?? defaultId()
  const now = options.now?.() ?? Date.now()
  return {
    messageId,
    conversation: {
      ...conversation,
      transcriptMessages: [...conversation.transcriptMessages, { ...message, id: messageId, timestamp: message.timestamp ?? now } as Message],
      updatedAt: now,
    },
  }
}

export function upsertConversationTranscriptMessage<
  Message extends AgentConversationTranscriptMessageShape,
  Conversation extends { transcriptMessages: Message[]; updatedAt: number },
>(
  conversation: Conversation,
  messageId: string,
  message: AgentConversationTranscriptMessageInput<Message>,
  options: AgentConversationMutationOptions = {},
): Conversation {
  const now = options.now?.() ?? Date.now()
  const existingIndex = conversation.transcriptMessages.findIndex((item) => item.id === messageId)
  const nextMessage = {
    ...message,
    id: messageId,
    timestamp: message.timestamp ?? (existingIndex >= 0 ? conversation.transcriptMessages[existingIndex]?.timestamp ?? now : now),
  } as Message
  const transcriptMessages = existingIndex >= 0
    ? conversation.transcriptMessages.map((item, index) => index === existingIndex ? nextMessage : item)
    : [...conversation.transcriptMessages, nextMessage]
  return { ...conversation, transcriptMessages, updatedAt: now }
}

export function replaceConversationTranscriptMessages<
  Message extends AgentConversationTranscriptMessageShape,
  Conversation extends { transcriptMessages: Message[]; updatedAt: number },
>(
  conversation: Conversation,
  transcriptMessages: Message[],
  options: Pick<AgentConversationMutationOptions, 'now'> = {},
): Conversation {
  return {
    ...conversation,
    transcriptMessages,
    updatedAt: options.now?.() ?? Date.now(),
  }
}

export function patchConversationTranscriptMessageMeta<
  Message extends AgentConversationTranscriptMessageShape,
  Meta extends NonNullable<Message['meta']>,
  Conversation extends { transcriptMessages: Message[]; updatedAt: number },
>(
  conversation: Conversation,
  messageId: string,
  meta: Partial<Meta>,
  options: Pick<AgentConversationMutationOptions, 'now'> = {},
): Conversation {
  return {
    ...conversation,
    transcriptMessages: conversation.transcriptMessages.map((message) => message.id === messageId
      ? { ...message, meta: { ...message.meta, ...meta } as Message['meta'] }
      : message),
    updatedAt: options.now?.() ?? Date.now(),
  }
}

export function removeConversationTranscriptMessage<
  Message extends AgentConversationTranscriptMessageShape,
  Conversation extends { transcriptMessages: Message[]; updatedAt: number },
>(
  conversation: Conversation,
  messageId: string,
  options: Pick<AgentConversationMutationOptions, 'now'> = {},
): Conversation {
  return {
    ...conversation,
    transcriptMessages: conversation.transcriptMessages.filter((message) => message.id !== messageId),
    updatedAt: options.now?.() ?? Date.now(),
  }
}

export function buildAgentRunActivityRoundIndex(activity: AgentTimelineActivity): AgentRunActivityRoundIndex {
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

export function resolveProviderThreadRunState<Run extends AgentRun = AgentRun>(input: ResolveProviderThreadRunStateInput<Run>): ProviderThreadRunState<Run> {
  const runs = attachProviderInteractionApprovals(mergeProviderSessionRuns(input.runs ?? [], input.ensureRuns ?? []), input.interactions)
  const actionableRuns = resolveActionableProviderSessionRuns(runs, input.interactions)
  const currentRun = resolveCurrentProviderSessionRun({
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

export function mergeProviderSessionRuns<Run extends AgentRun = AgentRun>(primary: Run[], ensured: Run[]): Run[] {
  const byId = new Map<string, Run>()
  for (const run of primary) byId.set(run.id, run)
  for (const run of ensured) {
    if (!byId.has(run.id)) byId.set(run.id, run)
  }
  return Array.from(byId.values())
}

export function attachProviderInteractionApprovals<Run extends AgentRun = AgentRun>(runs: Run[], interactions: ProviderInteraction[] | undefined): Run[] {
  const interactionByApprovalId = new Map<string, string>()
  const interactionDisplayByApprovalId = new Map<string, Pick<ProviderInteraction, 'displayThreadId' | 'displayAnchor'>>()
  for (const interaction of interactions ?? []) {
    const payload = isRecord(interaction.payload) ? interaction.payload : undefined
    if (interaction.kind === 'approval') {
      const approvalId = typeof payload?.approvalId === 'string' ? payload.approvalId : undefined
      if (approvalId) {
        interactionByApprovalId.set(approvalId, interaction.id)
        interactionDisplayByApprovalId.set(approvalId, {
          ...(interaction.displayThreadId ? { displayThreadId: interaction.displayThreadId } : {}),
          ...(interaction.displayAnchor ? { displayAnchor: interaction.displayAnchor } : {}),
        })
      }
      continue
    }
  }
  if (interactionByApprovalId.size === 0) return runs
  return runs.map((run) => ({
    ...run,
    pendingApprovals: (run.pendingApprovals ?? []).map((approval) => {
      const interactionId = interactionByApprovalId.get(approval.id)
      const display = interactionDisplayByApprovalId.get(approval.id)
      return interactionId ? { ...approval, interactionId, ...display } : approval
    }),
  }) as Run)
}

export function resolveActionableProviderSessionRuns<Run extends AgentRun = AgentRun>(runs: Run[], interactions: Array<{ runId: string; status: string; kind?: string }> | undefined): Run[] {
  const byId = new Map(runs.map((run) => [run.id, run]))
  const actionableRunIds = Array.from(new Set((interactions ?? [])
    .filter((interaction) => interaction.status === 'pending' && (interaction.kind === 'approval' || interaction.kind === 'input'))
    .map((interaction) => interaction.runId)))
  if (actionableRunIds.length > 0) {
    const indexed = actionableRunIds
      .map((runId) => byId.get(runId))
      .filter((run): run is Run => !!run)
    if (indexed.length > 0) return indexed
  }
  return runs.filter(runNeedsProviderSessionUserAction).sort(compareRunsByUpdatedAtDesc)
}

export function resolveCurrentProviderSessionRun<Run extends AgentRun = AgentRun>(input: {
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

export interface ProviderThreadConversationSessionState {
  conversationThreadBindings?: Record<string, { providerSessionTreeId?: string; providerThreadId?: string; updatedAt?: number }>
  conversationProviderSessionStates: Record<string, { sessionId?: string; threadId?: string; updatedAt?: number }>
}

export function conversationIdForProviderThread(input: ProviderThreadConversationSessionState & { threadId: string }): string | undefined {
  const bindingEntry = Object.entries(input.conversationThreadBindings ?? {})
    .filter(([, binding]) => binding.providerThreadId === input.threadId)
    .sort(([, left], [, right]) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))[0]
  if (bindingEntry) return bindingEntry[0]

  return Object.entries(input.conversationProviderSessionStates)
    .filter(([, providerSessionState]) => providerSessionState.threadId === input.threadId)
    .sort(([, left], [, right]) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))[0]?.[0]
}

export function conversationIdForProviderSession(input: ProviderThreadConversationSessionState & { sessionId: string }): string | undefined {
  const bindingEntry = Object.entries(input.conversationThreadBindings ?? {})
    .filter(([, binding]) => binding.providerSessionTreeId === input.sessionId)
    .sort(([, left], [, right]) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))[0]
  if (bindingEntry) return bindingEntry[0]

  return Object.entries(input.conversationProviderSessionStates)
    .filter(([, providerSessionState]) => providerSessionState.sessionId === input.sessionId)
    .sort(([, left], [, right]) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))[0]?.[0]
}

export function existingConversationIdForProviderThread<Conversation extends Pick<AgentConversationShape, 'id' | 'providerThreadId'>>(
  threadId: string,
  conversations: Conversation[],
  sessionState: ProviderThreadConversationSessionState,
): string | undefined {
  const persistedConversationId = conversations.find((conversation) => conversation.providerThreadId === threadId)?.id
  const mappedConversationId = persistedConversationId ?? conversationIdForProviderThread({
    threadId,
    conversationThreadBindings: sessionState.conversationThreadBindings,
    conversationProviderSessionStates: sessionState.conversationProviderSessionStates,
  })
  if (!mappedConversationId) return undefined
  return conversations.some((conversation) => conversation.id === mappedConversationId) ? mappedConversationId : undefined
}

export function existingConversationIdForProviderSession<Conversation extends Pick<AgentConversationShape, 'id' | 'providerSessionId'>>(
  sessionId: string,
  conversations: Conversation[],
  sessionState: ProviderThreadConversationSessionState,
): string | undefined {
  const persistedConversationId = conversations.find((conversation) => conversation.providerSessionId === sessionId)?.id
  const mappedConversationId = persistedConversationId ?? conversationIdForProviderSession({
    sessionId,
    conversationThreadBindings: sessionState.conversationThreadBindings,
    conversationProviderSessionStates: sessionState.conversationProviderSessionStates,
  })
  if (!mappedConversationId) return undefined
  return conversations.some((conversation) => conversation.id === mappedConversationId) ? mappedConversationId : undefined
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

function runNeedsProviderSessionUserAction(run: AgentRun): boolean {
  return run.status === 'requires_action'
    && (
      (run.pendingApprovals ?? []).some((approval) => approval.status === 'pending')
      || (run.pendingInputRequests ?? []).some((request) => request.status === 'pending')
    )
}

function timelineDecisions(events: AgentTimelineActivityEvent[]): AgentRunActivityDecision[] {
  return events.flatMap((event) => {
    if (event.kind !== 'model_call' || event.title !== 'Model tool calls requested') return []
    const data = isRecord(event.data) ? event.data : undefined
    const toolCalls = Array.isArray(data?.tool_calls)
      ? data.tool_calls
          .map((call) => timelineDecisionToolCall(isRecord(call) ? call : undefined))
          .filter((call): call is AgentRunActivityDecisionToolCall => Boolean(call))
      : []
    if (toolCalls.length === 0) return []
    return [{
      id: `decision-${event.id}`,
      event,
      toolCalls,
    }]
  }).sort(compareTimelineDecisions)
}

function timelineDecisionToolCall(call: Record<string, unknown> | undefined): AgentRunActivityDecisionToolCall | undefined {
  const name = typeof call?.name === 'string' && call.name.trim() ? call.name.trim() : undefined
  if (!name) return undefined
  const id = typeof call?.id === 'string' && call.id.trim() ? call.id.trim() : undefined
  return {
    ...(id ? { id } : {}),
    name,
  }
}

function timelineToolExecutions(
  activity: AgentTimelineActivity,
  decisions: AgentRunActivityDecision[],
): AgentRunActivityToolExecution[] {
  const decisionOrderCandidates = timelineDecisionOrderCandidates(decisions)
  const eventsByStep = new Map<string, AgentTimelineActivityEvent[]>()
  for (const event of activity.events ?? []) {
    if (!event.stepId) continue
    const events = eventsByStep.get(event.stepId) ?? []
    events.push(event)
    eventsByStep.set(event.stepId, events)
  }

  const steps = activity.steps ?? []
  const events = activity.events ?? []
  const executions: AgentRunActivityToolExecution[] = steps
    .filter((step) => step.type === 'tool_call' && typeof step.toolName === 'string' && step.toolName.trim())
    .map((step, stepIndex) => ({
      id: `step-${step.id}`,
      toolName: step.toolName!,
      activityOrder: stepIndex,
      createdAt: step.createdAt,
      ...(step.completedAt ? { completedAt: step.completedAt } : {}),
      ...(step.roundIndex !== undefined ? { roundIndex: step.roundIndex } : {}),
      ...(step.roundLabel ? { roundLabel: step.roundLabel } : {}),
      ...(step.roundSource ? { roundSource: step.roundSource } : {}),
      step,
      events: (eventsByStep.get(step.id) ?? []).sort(compareTimelineEvents),
      approvals: [],
    }))

  const coveredStepIds = new Set(steps.map((step) => step.id))
  for (const event of events) {
    if (event.kind !== 'tool_call' || !event.toolName || event.title === 'Model tool call delta') continue
    if (event.stepId && coveredStepIds.has(event.stepId)) continue
    executions.push({
      id: `event-${event.id}`,
      toolName: event.toolName,
      activityOrder: steps.length + events.findIndex((candidate) => candidate.id === event.id),
      createdAt: event.createdAt,
      ...(event.completedAt ? { completedAt: event.completedAt } : {}),
      ...(event.roundIndex !== undefined ? { roundIndex: event.roundIndex } : {}),
      ...(event.roundLabel ? { roundLabel: event.roundLabel } : {}),
      ...(event.roundSource ? { roundSource: event.roundSource } : {}),
      events: [event],
      approvals: [],
    })
  }

  const approvals = [...(activity.approvals ?? [])].sort(compareTimelineApprovals)
  for (const [approvalIndex, approval] of approvals.entries()) {
    const match = findTimelineApprovalExecution(executions, approval)
    if (match) {
      match.approvals.push(approval)
      if (timelineTime(approval.createdAt) < timelineTime(match.createdAt)) match.createdAt = approval.createdAt
      continue
    }
    executions.push({
      id: `approval-${approval.id}`,
      toolName: approval.toolName,
      activityOrder: steps.length + events.length + approvalIndex,
      createdAt: approval.createdAt,
      approvals: [approval],
      events: [],
    })
  }

  for (const execution of executions) {
    const decisionMatch = timelineDecisionMatchForExecution(execution, decisionOrderCandidates)
    if (decisionMatch) {
      execution.decisionOrder = decisionMatch.order
      if (execution.roundIndex === undefined && decisionMatch.roundIndex !== undefined) execution.roundIndex = decisionMatch.roundIndex
      if (!execution.roundLabel && decisionMatch.roundLabel) execution.roundLabel = decisionMatch.roundLabel
      if (!execution.roundSource && decisionMatch.roundSource) execution.roundSource = decisionMatch.roundSource
    }
    execution.approvals.sort(compareTimelineApprovals)
  }
  return executions.sort(compareTimelineToolExecutions)
}

interface TimelineDecisionOrderCandidate {
  order: number
  toolName: string
  roundIndex?: number
  roundLabel?: string
  roundSource?: AgentTimelineActivityEvent['roundSource']
  used: boolean
}

function timelineDecisionOrderCandidates(decisions: AgentRunActivityDecision[]): TimelineDecisionOrderCandidate[] {
  let order = 0
  return [...decisions].sort(compareTimelineDecisions).flatMap((decision) => (
    decision.toolCalls.map((call) => ({
      order: order++,
      toolName: call.name,
      ...(decision.event.roundIndex !== undefined ? { roundIndex: decision.event.roundIndex } : {}),
      ...(decision.event.roundLabel ? { roundLabel: decision.event.roundLabel } : {}),
      ...(decision.event.roundSource ? { roundSource: decision.event.roundSource } : {}),
      used: false,
    }))
  ))
}

function timelineDecisionMatchForExecution(
  execution: AgentRunActivityToolExecution,
  candidates: TimelineDecisionOrderCandidate[],
): TimelineDecisionOrderCandidate | undefined {
  const sameTool = candidates.filter((candidate) => !candidate.used && candidate.toolName === execution.toolName)
  if (sameTool.length === 0) return undefined
  const roundMatched = execution.roundIndex !== undefined
    ? sameTool.filter((candidate) => candidate.roundIndex === execution.roundIndex)
    : []
  const candidate = [...(roundMatched.length > 0 ? roundMatched : sameTool)]
    .sort((left, right) => left.order - right.order)[0]
  if (!candidate) return undefined
  candidate.used = true
  return candidate
}

function findTimelineApprovalExecution(
  executions: AgentRunActivityToolExecution[],
  approval: AgentTimelineActivityApproval,
): AgentRunActivityToolExecution | undefined {
  const sameTool = executions.filter((execution) => execution.toolName === approval.toolName)
  if (sameTool.length === 0) return undefined
  const approvalTime = timelineTime(approval.createdAt)
  return [...sameTool].sort((left, right) => (
    Math.abs(timelineTime(left.createdAt) - approvalTime) - Math.abs(timelineTime(right.createdAt) - approvalTime)
      || compareTimelineToolExecutions(left, right)
  ))[0]
}

function timelineRoundSeeds(
  activity: AgentTimelineActivity,
  decisions: AgentRunActivityDecision[],
  toolExecutions: AgentRunActivityToolExecution[],
  inputs: AgentTimelineActivityInputRequest[],
): Array<Omit<AgentRunActivityRound, 'decisions' | 'toolExecutions' | 'inputs'>> {
  const byId = new Map<string, Omit<AgentRunActivityRound, 'decisions' | 'toolExecutions' | 'inputs'>>()
  const ensureRound = (input: {
    id: string
    index?: number
    label?: string
    source?: AgentRunActivityRound['source']
    startedAt: string
    finishedAt?: string
    failed?: boolean
    finished?: boolean
  }) => {
    const current = byId.get(input.id)
    byId.set(input.id, {
      id: input.id,
      ...(input.index !== undefined ? { index: input.index } : current?.index !== undefined ? { index: current.index } : {}),
      ...(input.label ? { label: input.label } : current?.label ? { label: current.label } : {}),
      ...(input.source ? { source: input.source } : current?.source ? { source: current.source } : {}),
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
      ...(event.roundLabel ? { label: event.roundLabel } : {}),
      ...(event.roundSource ? { source: event.roundSource } : {}),
      startedAt: event.createdAt,
      ...(event.completedAt ? { finishedAt: event.completedAt } : {}),
      failed: timelineEventIsFailure(event),
      finished: event.status === 'completed',
    })
  }
  for (const decision of decisions) {
    if (decision.event.roundIndex === undefined) continue
    ensureRound({
      id: timelineRoundId(decision.event.roundIndex),
      index: decision.event.roundIndex,
      ...(decision.event.roundLabel ? { label: decision.event.roundLabel } : {}),
      ...(decision.event.roundSource ? { source: decision.event.roundSource } : {}),
      startedAt: decision.event.createdAt,
    })
  }
  for (const tool of toolExecutions) {
    if (tool.roundIndex === undefined) continue
    ensureRound({
      id: timelineRoundId(tool.roundIndex),
      index: tool.roundIndex,
      ...(tool.roundLabel ? { label: tool.roundLabel } : {}),
      ...(tool.roundSource ? { source: tool.roundSource } : {}),
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
  rounds: Array<Pick<AgentRunActivityRound, 'id' | 'index' | 'startedAt'>>,
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

function timelineEventIsFailure(event: AgentTimelineActivityEvent): boolean {
  if (event.status === 'failed') return true
  if (event.status !== 'blocked') return false
  return event.kind !== 'input' && event.kind !== 'approval'
}

function compareTimelineRounds(
  left: Pick<AgentRunActivityRound, 'id' | 'index' | 'startedAt'>,
  right: Pick<AgentRunActivityRound, 'id' | 'index' | 'startedAt'>,
): number {
  return (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER)
    || timelineTime(left.startedAt) - timelineTime(right.startedAt)
    || left.id.localeCompare(right.id)
}

function compareTimelineDecisions(left: AgentRunActivityDecision, right: AgentRunActivityDecision): number {
  return compareTimelineEvents(left.event, right.event)
}

function compareTimelineToolExecutions(left: AgentRunActivityToolExecution, right: AgentRunActivityToolExecution): number {
  return (left.roundIndex ?? Number.MAX_SAFE_INTEGER) - (right.roundIndex ?? Number.MAX_SAFE_INTEGER)
    || (left.decisionOrder ?? Number.MAX_SAFE_INTEGER) - (right.decisionOrder ?? Number.MAX_SAFE_INTEGER)
    || (left.activityOrder ?? Number.MAX_SAFE_INTEGER) - (right.activityOrder ?? Number.MAX_SAFE_INTEGER)
    || timelineTime(left.createdAt) - timelineTime(right.createdAt)
    || left.id.localeCompare(right.id)
}

function compareTimelineInputs(left: AgentTimelineActivityInputRequest, right: AgentTimelineActivityInputRequest): number {
  return timelineTime(left.createdAt) - timelineTime(right.createdAt) || left.id.localeCompare(right.id)
}

function compareTimelineApprovals(left: AgentTimelineActivityApproval, right: AgentTimelineActivityApproval): number {
  return timelineTime(left.createdAt) - timelineTime(right.createdAt) || left.id.localeCompare(right.id)
}

function compareTimelineEvents(left: AgentTimelineActivityEvent, right: AgentTimelineActivityEvent): number {
  return timelineTime(left.createdAt) - timelineTime(right.createdAt) || left.id.localeCompare(right.id)
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
  return providerSessionTimestamp(b.updatedAt ?? b.createdAt) - providerSessionTimestamp(a.updatedAt ?? a.createdAt)
}

function providerSessionTimestamp(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
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
