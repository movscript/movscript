import type { MCPClient } from '../mcpClient.js'
import { AGENT_TRACE_EVENT_KINDS as PROTOCOL_AGENT_TRACE_EVENT_KINDS } from '@movscript/protocol'
import type {
  AgentCapabilitiesResponse as ProtocolAgentCapabilitiesResponse,
  AgentApprovalRequest as ProtocolAgentApprovalRequest,
  AgentApprovalStatus as ProtocolAgentApprovalStatus,
  CompiledPromptPreview as ProtocolCompiledPromptPreview,
  AgentDebugContextPanel as ProtocolAgentDebugContextPanel,
  AgentDebugTool as ProtocolAgentDebugTool,
  AgentClientInput as ProtocolAgentClientInput,
  AgentInputChoice as ProtocolAgentInputChoice,
  AgentInputRequest as ProtocolAgentInputRequest,
  AgentInputRequestStatus as ProtocolAgentInputRequestStatus,
  AgentMessage as ProtocolAgentMessage,
  AgentMessageRole as ProtocolAgentMessageRole,
  AgentPlan as ProtocolAgentPlan,
  AgentPlanRevision as ProtocolAgentPlanRevision,
  AgentPlanTask as ProtocolAgentPlanTask,
  AgentPlanTaskStatus as ProtocolAgentPlanTaskStatus,
  AgentRun as ProtocolAgentRun,
  AgentRunDebugTrace as ProtocolAgentRunDebugTrace,
  AgentRunInput as ProtocolAgentRunInput,
  AgentRunPolicy as ProtocolAgentRunPolicy,
  AgentRunPreview as ProtocolAgentRunPreview,
  AgentRunRole as ProtocolAgentRunRole,
  AgentRunStatus as ProtocolAgentRunStatus,
  AgentRunStep as ProtocolAgentRunStep,
  AgentSession as ProtocolAgentSession,
  AgentSessionSummary as ProtocolAgentSessionSummary,
  AgentStepStatus as ProtocolAgentStepStatus,
  AgentTask as ProtocolAgentTask,
  AgentTaskArtifact as ProtocolAgentTaskArtifact,
  AgentTaskGraph as ProtocolAgentTaskGraph,
  AgentTaskGraphSnapshot as ProtocolAgentTaskGraphSnapshot,
  AgentTaskGraphStatus as ProtocolAgentTaskGraphStatus,
  AgentTaskGraphSummary as ProtocolAgentTaskGraphSummary,
  AgentTaskStatus as ProtocolAgentTaskStatus,
  AgentThreadRole as ProtocolAgentThreadRole,
  AgentThreadStatus as ProtocolAgentThreadStatus,
  AgentThread as ProtocolAgentThread,
  AgentThreadSummary as ProtocolAgentThreadSummary,
  AgentTraceEvent as ProtocolAgentTraceEvent,
  AgentTraceEventKind as ProtocolAgentTraceEventKind,
  AgentWorkflowConfig as ProtocolAgentWorkflowConfig,
  AgentWorkflowProfile as ProtocolAgentWorkflowProfile,
  DispatchTaskGraphResult as ProtocolDispatchTaskGraphResult,
  ResolvedAgentSkill as ProtocolResolvedAgentSkill,
  ResolvedToolCatalog as ProtocolResolvedToolCatalog,
  RuntimeContinuation as ProtocolRuntimeContinuation,
  RuntimeContinuationStatus as ProtocolRuntimeContinuationStatus,
  RuntimeInteraction as ProtocolRuntimeInteraction,
  RuntimeInteractionKind as ProtocolRuntimeInteractionKind,
  RuntimeInteractionStatus as ProtocolRuntimeInteractionStatus,
  ToolUnavailableReason,
  ToolCall as ProtocolToolCall,
  UpdateTaskGraphResult as ProtocolUpdateTaskGraphResult,
} from '@movscript/protocol'
import type { JSONValue, MCPResource, MCPTool } from '../types.js'
import type { AgentManifest } from '../catalog/agentManifest.js'
import type { RegisteredTool } from '../tools/toolRegistry.js'
import type { AgentCatalogStateStore } from '../catalog/state.js'
import type { AgentDraftStore } from '../drafts/draftStore.js'
import type { BackendApplyClient } from '../drafts/backendApplyClient.js'
import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import type { AgentUpdateState } from '../updates/updatePolicy.js'

export type { JSONValue, MCPResource, MCPTool } from '../types.js'

export type AgentMessageRole = ProtocolAgentMessageRole
export type AgentRunStatus = ProtocolAgentRunStatus
export type AgentThreadStatus = ProtocolAgentThreadStatus
export type AgentStepStatus = ProtocolAgentStepStatus
export type AgentApprovalStatus = ProtocolAgentApprovalStatus
export type AgentInputRequestStatus = ProtocolAgentInputRequestStatus
export type AgentRunRole = ProtocolAgentRunRole
export type AgentThreadRole = ProtocolAgentThreadRole
export type AgentTaskGraphStatus = ProtocolAgentTaskGraphStatus
export type AgentTaskStatus = ProtocolAgentTaskStatus
export type AgentPlanTaskStatus = ProtocolAgentPlanTaskStatus

export type AgentSession = ProtocolAgentSession

export type AgentSessionSummary = ProtocolAgentSessionSummary

export type AgentMessage = ProtocolAgentMessage

export type AgentThread = ProtocolAgentThread

export type AgentThreadSummary = ProtocolAgentThreadSummary

export type AgentPlanTask = ProtocolAgentPlanTask

export type AgentPlan = ProtocolAgentPlan

export type AgentPlanRevision = ProtocolAgentPlanRevision

export type AgentRunStep = ProtocolAgentRunStep

export const AGENT_TRACE_EVENT_KINDS = PROTOCOL_AGENT_TRACE_EVENT_KINDS

export type AgentTraceEventKind = ProtocolAgentTraceEventKind

export type AgentTraceEvent = ProtocolAgentTraceEvent

export type AgentRun = ProtocolAgentRun

export type RuntimeInteractionKind = ProtocolRuntimeInteractionKind
export type RuntimeInteractionStatus = ProtocolRuntimeInteractionStatus
export type RuntimeInteraction = ProtocolRuntimeInteraction

export type RuntimeContinuationStatus = ProtocolRuntimeContinuationStatus
export type RuntimeContinuation = ProtocolRuntimeContinuation

export type AgentRunInput = ProtocolAgentRunInput

export type AgentTaskGraph = ProtocolAgentTaskGraph
export type AgentTaskArtifact = ProtocolAgentTaskArtifact
export type AgentTask = ProtocolAgentTask
export type AgentTaskGraphSnapshot = Omit<ProtocolAgentTaskGraphSnapshot, 'runs'> & {
  runs: AgentRun[]
}
export type AgentTaskGraphSummary = ProtocolAgentTaskGraphSummary

export type AgentInternalRunSignalRun = AgentRun & {
  streamPartial?: true
}

export type AgentTaskGraphStreamEvent =
  | {
    type: 'snapshot'
    snapshot: AgentTaskGraphSnapshot
  }
  | {
    type: 'task'
    taskGraphId: string
    task: AgentTask
    snapshot: AgentTaskGraphSnapshot
  }
  | {
    type: 'run'
    taskGraphId: string
    run: AgentInternalRunSignalRun
    snapshot: AgentTaskGraphSnapshot
  }
  | {
    type: 'trace'
    taskGraphId: string
    runId: string
    event: AgentTraceEvent
    snapshot: AgentTaskGraphSnapshot
  }
  | {
    type: 'done'
    snapshot: AgentTaskGraphSnapshot
  }

export type AgentInternalRunSignal =
  | {
    type: 'run'
    run: AgentInternalRunSignalRun
  }
  | {
    type: 'trace'
    runId: string
    event: AgentTraceEvent
    run?: AgentInternalRunSignalRun
  }
  | {
    type: 'assistant_delta'
    runId: string
    traceEventId: string
    delta: string
    accumulated: string
    roundIndex?: number
    roundLabel?: string
    createdAt: string
    run?: AgentInternalRunSignalRun
  }
  | {
    type: 'assistant_message'
    runId: string
    message: AgentMessage
    run: AgentInternalRunSignalRun
  }
  | {
    type: 'thread_title'
    runId: string
    threadId: string
    title: string
    updatedAt: string
  }
  | {
    type: 'done'
    run: AgentInternalRunSignalRun
  }

export type AgentInternalThreadSignal = AgentInternalRunSignal & {
  threadId: string
}

export type AgentRunPreview = ProtocolAgentRunPreview

export type AgentApprovalRequest = ProtocolAgentApprovalRequest

export type AgentInputChoice = ProtocolAgentInputChoice

export type AgentInputRequest = ProtocolAgentInputRequest

export type AgentDebugContextPanel = ProtocolAgentDebugContextPanel

export interface AgentClientAttachmentRef {
  id?: string
  name?: string
  type?: string
  mimeType?: string
  size?: number
  resourceId?: number
}

export interface AgentClientResourceRef {
  id?: number
  name?: string
  type?: string
  mimeType?: string
  size?: number
}

export interface AgentClientUISnapshot {
  route?: {
    pathname?: string
    search?: string
    hash?: string
  }
  pageContext?: {
    pageKey?: string
    pageType?: string
    pageRoute?: string
    pageEntityType?: string
    pageEntityId?: number | string
    draftId?: string
  }
  project?: {
    id?: number
    name?: string
    status?: string
    description?: string
    aspect_ratio?: string
    visual_style?: string
    project_style?: string
  }
  productionId?: number
  draftId?: string
  selection?: {
    entityType?: string
    entityId?: number | string
    label?: string
  } | null
  recentResources?: AgentClientResourceRef[]
  labels?: string[]
}

export type AgentClientInput = Partial<ProtocolAgentClientInput>

export type ResolvedAgentSkill = ProtocolResolvedAgentSkill
export type { ToolUnavailableReason }
export type AgentDebugTool = ProtocolAgentDebugTool
export type ResolvedToolCatalog = ProtocolResolvedToolCatalog

export type AgentRunPolicy = ProtocolAgentRunPolicy

export type AgentWorkflowProfile = ProtocolAgentWorkflowProfile

export type AgentWorkflowConfig = ProtocolAgentWorkflowConfig

export type CompiledPromptPreview = ProtocolCompiledPromptPreview

export type AgentRunDebugTrace = ProtocolAgentRunDebugTrace

export type AgentCapabilitiesResponse = Omit<ProtocolAgentCapabilitiesResponse, 'updates' | 'registry'> & {
  updates?: AgentUpdateState
  registry: RegisteredTool[]
}

export interface AgentRuntimeRouterOptions {
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool' | 'listTools' | 'listResources'>
  store?: import('./store.js').AgentStore
  draftStore?: AgentDraftStore
  backendApplyClient?: BackendApplyClient
  memoryStore?: import('../memory/memoryStore.js').AgentMemoryStore
  defaultAgentManifest?: AgentManifest
  toolRegistry?: import('../tools/toolRegistry.js').ToolRegistry
  pluginCatalog?: import('../catalog/loader.js').AgentPluginCatalog
  catalogStateStore?: AgentCatalogStateStore
  pluginCatalogLoader?: (options?: Record<string, never>) => import('../catalog/loader.js').AgentPluginCatalog
  contractResolver?: AgentRuntimeContractResolver
  pluginCatalogInfo?: AgentCapabilitiesResponse['pluginCatalog']
  pluginWarnings?: string[]
  updateState?: AgentUpdateState
}

export interface CreateThreadInput {
  sessionId?: unknown
  messages?: Array<{ role?: unknown; content?: unknown }>
  title?: unknown
  agentName?: unknown
  agentRole?: unknown
  parentThreadId?: unknown
  parentRunId?: unknown
  projectId?: unknown
  metadata?: unknown
  archived?: unknown
}

export interface CreateMessageInput {
  id?: unknown
  role?: unknown
  content?: unknown
  clientInput?: unknown
  runId?: unknown
  metadata?: unknown
}

export interface CreateRunInput {
  sessionId?: unknown
  threadId?: unknown
  userMessage?: unknown
  sourceMessageId?: unknown
  task?: unknown
  agentManifest?: unknown
  approvedToolNames?: unknown
  clientInput?: unknown
  policy?: unknown
  backendAuthToken?: unknown
  backendAPIBaseURL?: unknown
  sandboxMode?: unknown
  role?: unknown
  parentRunId?: unknown
  taskGraphId?: unknown
  taskId?: unknown
  progress?: unknown
  blockedReason?: unknown
  metadata?: unknown
}

export interface CreateToolRunInput {
  sessionId?: unknown
  threadId?: unknown
  title?: unknown
  message?: unknown
  toolCall?: unknown
  agentManifest?: unknown
  approvedToolNames?: unknown
  clientInput?: unknown
  policy?: unknown
  backendAuthToken?: unknown
  backendAPIBaseURL?: unknown
  sandboxMode?: unknown
  role?: unknown
  parentRunId?: unknown
  taskGraphId?: unknown
  taskId?: unknown
  progress?: unknown
  blockedReason?: unknown
}

export interface PreviewRunInput {
  sessionId?: unknown
  threadId?: unknown
  message?: unknown
  agentManifest?: unknown
  approvedToolNames?: unknown
  clientInput?: unknown
  policy?: unknown
  backendAuthToken?: unknown
  backendAPIBaseURL?: unknown
  sandboxMode?: unknown
}

export interface ApproveRunInput {
  approvedToolNames?: unknown
  approvalIds?: unknown
  backendAuthToken?: unknown
  backendAPIBaseURL?: unknown
}

export interface RejectRunInput {
  approvalIds?: unknown
}

export interface CancelRunInput {
  reason?: unknown
}

export interface CreateTaskGraphInput {
  sessionId?: unknown
  threadId?: unknown
  title?: unknown
  goal?: unknown
  message?: unknown
  tasks?: unknown
  maxTasks?: unknown
  metadata?: unknown
  createPlannerRun?: unknown
  agentManifest?: unknown
  clientInput?: unknown
  policy?: unknown
  approvedToolNames?: unknown
  backendAuthToken?: unknown
  backendAPIBaseURL?: unknown
  sandboxMode?: unknown
}

export interface DispatchTaskGraphInput {
  taskGraphId?: unknown
  plannerRunId?: unknown
  taskIds?: unknown
  maxWorkers?: unknown
  maxTaskAttempts?: unknown
  retryFailed?: unknown
  workerTimeoutMs?: unknown
  agentManifest?: unknown
  approvedToolNames?: unknown
  policy?: unknown
  backendAuthToken?: unknown
  backendAPIBaseURL?: unknown
  sandboxMode?: unknown
}

export type DispatchTaskGraphResult = Omit<ProtocolDispatchTaskGraphResult, 'spawnedRuns'> & {
  spawnedRuns: AgentRun[]
}

export interface UpdateTaskGraphInput extends DispatchTaskGraphInput {
  tasks?: unknown
  addTasks?: unknown
  updates?: unknown
  updateTasks?: unknown
  resetTaskIds?: unknown
  resetBlocked?: unknown
  resetNeedsReview?: unknown
  resetFailed?: unknown
  resetCancelled?: unknown
  dispatch?: unknown
}

export type UpdateTaskGraphResult = Omit<ProtocolUpdateTaskGraphResult, 'dispatch'> & {
  dispatch?: DispatchTaskGraphResult
}

export interface CreateTaskGraphTaskInput {
  id?: unknown
  parentId?: unknown
  deps?: unknown
  title?: unknown
  description?: unknown
  subagentName?: unknown
  subagentNames?: unknown
  maxTaskAttempts?: unknown
  workerTimeoutMs?: unknown
  metadata?: unknown
}

export interface UpdateTaskGraphTaskInput {
  id?: unknown
  parentId?: unknown
  deps?: unknown
  title?: unknown
  description?: unknown
  status?: unknown
  progress?: unknown
  ownerRunId?: unknown
  blockedReason?: unknown
  artifacts?: unknown
  metadata?: unknown
}

export interface AnswerRunInputRequestInput {
  requestId?: unknown
  choiceIds?: unknown
  text?: unknown
  sourceMessageId?: unknown
  backendAuthToken?: unknown
  backendAPIBaseURL?: unknown
}

export interface UpdateThreadInput {
  title?: unknown
  archived?: unknown
  metadata?: unknown
}

export type ToolCall = ProtocolToolCall

export interface ToolCallOutcome {
  call: ToolCall
  result?: JSONValue
  error?: string
  rollback?: ToolCallRollbackRecord
}

export interface ToolCallRollbackRecord {
  policy: 'not_applicable' | 'manual_compensation' | 'reversible'
  reason: string
  artifactType?: string
  artifactUri?: string
  metadata?: Record<string, JSONValue>
}
