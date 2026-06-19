import type { AGENT_PROTOCOL_VERSION } from './agentProtocolVersion.js'
import type { AgentPlan, AgentPlanRevision } from './agentPlanProtocol.js'
import type { AgentRun, AgentRunStep } from './agentRunProtocol.js'
import type { AgentTaskGraphSnapshot } from './agentTaskGraphProtocol.js'
import type {
  AgentMessage,
  AgentSession,
  AgentThread,
  ProviderSessionStatusRecord,
} from './agentThreadProtocol.js'
import type { AgentTraceEvent } from './agentTraceProtocol.js'
import type {
  ProviderContinuation,
  ProviderInteraction,
  ProviderWakeEvent,
  ProviderWork,
} from './providerInteractionProtocol.js'

export const PROVIDER_SESSION_SNAPSHOT_V2_SCHEMA = 'movscript.agent.provider-session-snapshot.v2'
export const PROVIDER_SESSION_EVENT_V2_SCHEMA = 'movscript.agent.provider-session-event.v2'

export type ProviderSessionSnapshotV2Schema = typeof PROVIDER_SESSION_SNAPSHOT_V2_SCHEMA
export type ProviderSessionEventV2Schema = typeof PROVIDER_SESSION_EVENT_V2_SCHEMA

export type ProviderSessionInputDeliveryStatus = 'pending' | 'accepted' | 'consumed' | 'failed'

export type ProviderSessionScopeType = 'thread' | 'session' | 'run' | 'plan'

export interface ProviderSessionScopeRef {
  type: ProviderSessionScopeType
  id: string
}

export interface ProviderSessionEntitiesV2 {
  sessions?: AgentSession[]
  threads?: AgentThread[]
  messages?: AgentMessage[]
  runs?: AgentRun[]
  steps?: AgentRunStep[]
  traces?: AgentTraceEvent[]
  interactions?: ProviderInteraction[]
  works?: ProviderWork[]
  continuations?: ProviderContinuation[]
  wakeEvents?: ProviderWakeEvent[]
  plans?: AgentPlan[]
  planRevisions?: AgentPlanRevision[]
  runtimeStatuses?: ProviderSessionStatusRecord[]
  taskGraphs?: AgentTaskGraphSnapshot[]
}

export interface ProviderSessionSnapshotV2 {
  schema: ProviderSessionSnapshotV2Schema
  protocolVersion: typeof AGENT_PROTOCOL_VERSION
  scope: ProviderSessionScopeRef
  cursor: string
  ordinal: number
  generatedAt: string
  entities: ProviderSessionEntitiesV2
}

export type ProviderSessionEntityType = keyof ProviderSessionEntitiesV2

export type ProviderSessionEventKind =
  | 'session.upserted'
  | 'thread.upserted'
  | 'message.upserted'
  | 'run.upserted'
  | 'step.upserted'
  | 'trace.upserted'
  | 'interaction.upserted'
  | 'work.upserted'
  | 'continuation.upserted'
  | 'wake_event.upserted'
  | 'plan.upserted'
  | 'plan_revision.upserted'
  | 'runtime_status.upserted'
  | 'task_graph.upserted'
  | 'assistant.progress'
  | 'scope.done'

export interface ProviderSessionEventCausalityV2 {
  sessionId?: string
  threadId?: string
  runId?: string
  messageId?: string
  stepId?: string
  traceId?: string
  interactionId?: string
  workId?: string
  continuationId?: string
  wakeEventId?: string
  planId?: string
  planRevisionId?: string
  runtimeStatusId?: string
  taskGraphId?: string
  taskId?: string
  sourceEventId?: string
}

export type ProviderSessionEventEntityV2 =
  | { type: 'session'; value: AgentSession }
  | { type: 'thread'; value: AgentThread }
  | { type: 'message'; value: AgentMessage }
  | { type: 'run'; value: AgentRun }
  | { type: 'step'; value: AgentRunStep }
  | { type: 'trace'; value: AgentTraceEvent }
  | { type: 'interaction'; value: ProviderInteraction }
  | { type: 'work'; value: ProviderWork }
  | { type: 'continuation'; value: ProviderContinuation }
  | { type: 'wake_event'; value: ProviderWakeEvent }
  | { type: 'plan'; value: AgentPlan }
  | { type: 'plan_revision'; value: AgentPlanRevision }
  | { type: 'runtime_status'; value: ProviderSessionStatusRecord }
  | { type: 'task_graph'; value: AgentTaskGraphSnapshot }

export interface ProviderSessionAssistantProgressV2 {
  runId: string
  traceId: string
  delta: string
  accumulated: string
  createdAt: string
  roundIndex?: number
  roundLabel?: string
}

export interface ProviderSessionEventV2 {
  schema: ProviderSessionEventV2Schema
  protocolVersion: typeof AGENT_PROTOCOL_VERSION
  id: string
  scope: ProviderSessionScopeRef
  ordinal: number
  cursor: string
  emittedAt: string
  kind: ProviderSessionEventKind
  causality?: ProviderSessionEventCausalityV2
  entity?: ProviderSessionEventEntityV2
  assistantProgress?: ProviderSessionAssistantProgressV2
}
