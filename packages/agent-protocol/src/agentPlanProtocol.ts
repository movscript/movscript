export type AgentPlanTaskStatus = 'pending' | 'in_progress' | 'completed'

export interface AgentPlanTask {
  step: string
  status: AgentPlanTaskStatus
}

export interface AgentPlan {
  schema: 'movscript.agent.plan.v1'
  id: string
  threadId: string
  runId?: string
  explanation?: string
  items: AgentPlanTask[]
  completedCount: number
  totalCount: number
  createdAt: string
  updatedAt: string
}

export interface AgentPlanRevision {
  schema: 'movscript.agent.plan-revision.v1'
  id: string
  planId: string
  threadId: string
  runId?: string
  explanation?: string
  snapshot: AgentPlan
  createdAt: string
}
