import type { JSONValue } from './protocolJson.js'
import type { AgentRun } from './agentRunProtocol.js'

export type AgentTaskGraphStatus = 'pending' | 'running' | 'blocked' | 'needs_review' | 'done' | 'failed' | 'cancelled'
export type AgentTaskStatus = 'pending' | 'running' | 'blocked' | 'needs_review' | 'done' | 'failed' | 'cancelled'

export interface AgentTaskArtifact {
  id: string
  type: string
  title?: string
  uri?: string
  metadata?: Record<string, JSONValue>
  createdAt: string
}

export interface AgentTask {
  id: string
  taskGraphId: string
  parentId?: string
  deps: string[]
  title: string
  description?: string
  status: AgentTaskStatus
  progress: number
  ownerRunId?: string
  blockedReason?: string
  artifacts: AgentTaskArtifact[]
  metadata?: Record<string, JSONValue>
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  cancelledAt?: string
}

export interface AgentTaskGraph {
  id: string
  providerSessionTreeId?: string
  /** @deprecated Prefer providerSessionTreeId for related-thread provider-session trees. */
  sessionId?: string // deprecated providerSessionTreeId compatibility mirror
  threadId: string
  rootRunId?: string
  title: string
  status: AgentTaskGraphStatus
  progress: number
  blockedReason?: string
  metadata?: Record<string, JSONValue>
  createdAt: string
  updatedAt: string
  completedAt?: string
  failedAt?: string
  cancelledAt?: string
}

export interface AgentTaskGraphSummary {
  taskCount: number
  taskStatusCounts: Record<AgentTaskStatus, number>
  workerCount: number
  activeWorkerCount: number
  artifactCount: number
  nameConflictCount: number
  blockedTaskIds: string[]
  needsReviewTaskIds: string[]
  failedTaskIds: string[]
}

export interface AgentTaskGraphSnapshot {
  taskGraph: AgentTaskGraph
  tasks: AgentTask[]
  runs: AgentRun[]
  nameConflicts?: Array<{
    subagentName: string
    taskIds: string[]
  }>
  summary?: AgentTaskGraphSummary
}

export interface DispatchTaskGraphResult {
  taskGraph: AgentTaskGraph
  spawnedRuns: AgentRun[]
  blockedTaskIds: string[]
  retriedTaskIds: string[]
  timedOutRunIds: string[]
}

export interface UpdateTaskGraphResult {
  taskGraph: AgentTaskGraph
  createdTaskIds: string[]
  updatedTaskIds: string[]
  resetTaskIds: string[]
  dispatch?: DispatchTaskGraphResult
}
