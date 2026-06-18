import {
  projectAppEventScope,
  publishAppEvent,
  recentAppEventSnapshots,
  subscribeAppEvents,
  type AppEvent,
  type AppEventTopic,
} from '@/shared/application/appEvents'

export type AgentActivityStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'requires_action'
export type AgentActivityOrigin = 'user' | 'agent' | 'agent-mcp' | 'system'
export type AgentActivityKind =
  | 'task'
  | 'run'
  | 'tool_call'
  | 'plan'
  | 'generation'
  | 'workspace_edit'
  | 'approval'
  | 'user_input'
  | 'message'
  | 'output'

export interface AgentActivityEventPayload {
  conversationId?: string
  threadId?: string
  runId?: string
  projectId?: number
  activityId: string
  kind: AgentActivityKind
  title: string
  summary?: string
  status: AgentActivityStatus
  origin?: AgentActivityOrigin
  toolName?: string
  targetIds?: string[]
  createdAt?: string
  updatedAt?: string
  rawRef?: {
    type: string
    id?: string
  }
}

export type AgentActivityAppEvent = AppEvent<AgentActivityEventPayload> & {
  topic: AgentActivityTopic
}

export type AgentActivityTopic = Extract<AppEventTopic,
  | 'agent.activity.started'
  | 'agent.activity.updated'
  | 'agent.activity.completed'
  | 'agent.activity.failed'
  | 'agent.tool.started'
  | 'agent.tool.completed'
  | 'agent.tool.failed'
  | 'agent.output.created'
  | 'agent.output.selected'
  | 'agent.plan.updated'
  | 'agent.user-input.requested'
  | 'agent.approval.requested'
>

export function publishAgentActivityEvent(
  topic: AgentActivityTopic,
  payload: AgentActivityEventPayload,
  options: { id?: string; source?: string } = {},
): boolean {
  return publishAppEvent({
    id: options.id,
    topic,
    scope: projectAppEventScope(payload.projectId),
    source: options.source ?? 'agent-activity',
    payload: {
      origin: payload.origin ?? 'system',
      ...payload,
      updatedAt: payload.updatedAt ?? new Date().toISOString(),
    },
  })
}

export function subscribeAgentActivityEvents(
  handler: (event: AgentActivityAppEvent) => void,
  filter?: (event: AgentActivityAppEvent) => boolean,
): () => void {
  return subscribeAppEvents((event) => {
    if (!isAgentActivityEvent(event)) return
    if (filter && !filter(event)) return
    handler(event)
  })
}

export function recentAgentActivityEvents(input: {
  conversationId?: string
  projectId?: number
  limit?: number
} = {}): AgentActivityAppEvent[] {
  return recentAppEventSnapshots()
    .filter(isAgentActivityEvent)
    .filter((event) => agentActivityEventMatches(event, input))
    .slice(-(input.limit ?? 20))
}

export function agentActivityEventMatches(
  event: AgentActivityAppEvent,
  input: { conversationId?: string; projectId?: number },
): boolean {
  if (input.conversationId && event.payload.conversationId !== input.conversationId) return false
  if (input.projectId !== undefined && event.payload.projectId !== input.projectId) return false
  return true
}

export function isAgentActivityEvent(event: AppEvent): event is AgentActivityAppEvent {
  return event.topic.startsWith('agent.')
    && (
      event.topic.startsWith('agent.activity.')
      || event.topic.startsWith('agent.tool.')
      || event.topic.startsWith('agent.output.')
      || event.topic === 'agent.plan.updated'
      || event.topic === 'agent.user-input.requested'
      || event.topic === 'agent.approval.requested'
    )
}
