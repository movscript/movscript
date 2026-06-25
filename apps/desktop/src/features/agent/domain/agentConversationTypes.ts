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
} from '@movscript/agent-protocol'

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
} from '@movscript/agent-protocol'

export interface AgentConversationTranscriptMessageMetaShape {
  modelId?: string | null
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
