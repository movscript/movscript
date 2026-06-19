import type { AgentRun, AgentThread } from '@movscript/core/agent/protocol'
import {
  claimNextAgentQueuedPageTask,
  enqueueAgentQueuedPageTask,
  updateAgentQueuedPageTaskFromProviderSession,
} from '@/features/agent/state/agentTaskQueueStore'
import type { AgentPageTaskPayload } from '@/features/agent/state/agentSessionTaskModel'
import type { AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import type { AgentChatServerRequest, AgentChatServerRequestResponse } from '@movscript/core/agent/chat'
import { createEventBus } from '@/shared/application/eventBus'

export const AGENT_PANEL_WORKSPACE_EVENT = 'movscript:agent-panel-workspace'
export const AGENT_PANEL_RUN_SETTLED_EVENT = 'movscript:agent-panel-run-settled'
export const AGENT_PANEL_THREAD_EVENT = 'movscript:agent-panel-thread'
export const AGENT_PANEL_NEW_CONVERSATION_EVENT = 'movscript:agent-panel-new-conversation'
export const AGENT_PANEL_DECISION_REQUEST_EVENT = 'movscript:agent-panel-decision-request'

export type AgentPanelSettledRun = AgentRun | {
  id: string
  threadId?: string
  providerSessionTreeId?: string
  sessionId?: string // legacy providerSessionTreeId fallback
  status?: string
  error?: string | null
}

export type AgentPanelSettledThread = AgentThread | {
  id: string
  providerSessionTreeId?: string
  sessionId?: string // legacy providerSessionTreeId fallback
}

export interface AgentPanelRunSettledPayload {
  requestId?: string
  status: 'completed' | 'error' | 'cancelled'
  run?: AgentPanelSettledRun
  thread?: AgentPanelSettledThread
  error?: string
  artifacts?: AgentTaskArtifactRef[]
}

export type AgentPanelPageTool = (payload: AgentPanelRunSettledPayload) => void | Promise<void>

const pageToolsByRequestId = new Map<string, AgentPanelPageTool>()

export type AgentPanelWorkspacePayload = AgentPageTaskPayload

export interface AgentPanelThreadPayload {
  threadId: string
  providerSessionTreeId?: string
  sessionId?: string // legacy providerSessionTreeId fallback
}

export interface AgentPanelNewConversationPayload {
  projectId?: number
  workspaceContext?: MovScriptWorkspaceContext
  title?: string
}

export interface AgentPanelDecisionRequestPayload {
  request: AgentChatServerRequest
  onResolve?: (response: AgentChatServerRequestResponse | undefined) => void | Promise<void>
}

type AgentPanelEventMap = {
  [AGENT_PANEL_WORKSPACE_EVENT]: AgentPanelWorkspacePayload
  [AGENT_PANEL_RUN_SETTLED_EVENT]: AgentPanelRunSettledPayload
  [AGENT_PANEL_THREAD_EVENT]: AgentPanelThreadPayload
  [AGENT_PANEL_NEW_CONVERSATION_EVENT]: AgentPanelNewConversationPayload
  [AGENT_PANEL_DECISION_REQUEST_EVENT]: AgentPanelDecisionRequestPayload
}

const agentPanelEventBus = createEventBus<AgentPanelEventMap>()

export function openAgentPanelWorkspace(payload: AgentPanelWorkspacePayload) {
  const normalized = enqueueAgentQueuedPageTask(payload)
  agentPanelEventBus.publish(AGENT_PANEL_WORKSPACE_EVENT, normalized)
}

export function openAgentPanelNewConversation(payload: AgentPanelNewConversationPayload = {}) {
  agentPanelEventBus.publishReplay(AGENT_PANEL_NEW_CONVERSATION_EVENT, payload)
}

export function openAgentPanelThread(input: string | AgentPanelThreadPayload, providerSessionTreeId?: string) {
  const payload = typeof input === 'string'
    ? { threadId: input, ...(providerSessionTreeId?.trim() ? { providerSessionTreeId: providerSessionTreeId.trim() } : {}) }
    : input
  const normalizedThreadId = payload.threadId.trim()
  if (!normalizedThreadId) return
  const normalizedProviderSessionTreeId = agentPanelProviderSessionTreeId(payload)
  const normalizedPayload = {
    threadId: normalizedThreadId,
    ...(normalizedProviderSessionTreeId ? {
      providerSessionTreeId: normalizedProviderSessionTreeId,
      sessionId: normalizedProviderSessionTreeId, // legacy providerSessionTreeId compatibility mirror
    } : {}),
  }
  agentPanelEventBus.publishReplay(AGENT_PANEL_THREAD_EVENT, normalizedPayload)
}

export function openAgentPanelDecisionRequest(payload: AgentPanelDecisionRequestPayload) {
  agentPanelEventBus.publishReplay(AGENT_PANEL_DECISION_REQUEST_EVENT, payload)
}

export function consumeAgentPanelWorkspace() {
  return claimNextAgentQueuedPageTask()
}

export function consumeAgentPanelNewConversation() {
  return agentPanelEventBus.consume(AGENT_PANEL_NEW_CONVERSATION_EVENT)
}

export function consumeAgentPanelThread() {
  return agentPanelEventBus.consume(AGENT_PANEL_THREAD_EVENT)
}

export function consumeAgentPanelDecisionRequest() {
  return agentPanelEventBus.consume(AGENT_PANEL_DECISION_REQUEST_EVENT)
}

export function registerAgentPanelPageTool(requestId: string, tool: AgentPanelPageTool) {
  pageToolsByRequestId.set(requestId, tool)
  return () => {
    if (pageToolsByRequestId.get(requestId) === tool) {
      pageToolsByRequestId.delete(requestId)
    }
  }
}

export function notifyAgentPanelRunSettled(payload: AgentPanelRunSettledPayload) {
  const normalized = normalizeAgentPanelRunSettledPayload(payload)
  updateAgentQueuedPageTaskFromProviderSession(normalized)
  agentPanelEventBus.publish(AGENT_PANEL_RUN_SETTLED_EVENT, normalized)
  if (!normalized.requestId) return
  const tool = pageToolsByRequestId.get(normalized.requestId)
  if (!tool) return
  Promise.resolve(tool(normalized)).catch((error) => {
    console.error('[agent-panel] page tool failed', error)
  })
}

function normalizeAgentPanelRunSettledPayload(payload: AgentPanelRunSettledPayload): AgentPanelRunSettledPayload {
  return {
    ...payload,
    ...(payload.thread ? { thread: normalizeAgentPanelProviderSessionRef(payload.thread) } : {}),
    ...(payload.run ? { run: normalizeAgentPanelProviderSessionRef(payload.run) } : {}),
  }
}

function normalizeAgentPanelProviderSessionRef<T extends { providerSessionTreeId?: string; sessionId?: string }>(ref: T): T {
  const providerSessionTreeId = agentPanelProviderSessionTreeId(ref)
  if (!providerSessionTreeId) return ref
  return {
    ...ref,
    providerSessionTreeId,
    sessionId: providerSessionTreeId,
  }
}

function agentPanelProviderSessionTreeId(input: { providerSessionTreeId?: string; sessionId?: string }): string | undefined {
  return input.providerSessionTreeId?.trim() || input.sessionId?.trim() || undefined
}

export function subscribeAgentPanelWorkspace(handler: (payload: AgentPanelWorkspacePayload) => void) {
  return agentPanelEventBus.subscribe(AGENT_PANEL_WORKSPACE_EVENT, handler)
}

export function subscribeAgentPanelNewConversation(handler: (payload: AgentPanelNewConversationPayload) => void) {
  return agentPanelEventBus.subscribe(AGENT_PANEL_NEW_CONVERSATION_EVENT, handler)
}

export function subscribeAgentPanelThread(handler: (payload: AgentPanelThreadPayload) => void) {
  return agentPanelEventBus.subscribe(AGENT_PANEL_THREAD_EVENT, handler)
}

export function subscribeAgentPanelDecisionRequest(handler: (payload: AgentPanelDecisionRequestPayload) => void) {
  return agentPanelEventBus.subscribe(AGENT_PANEL_DECISION_REQUEST_EVENT, handler)
}

export function subscribeAgentPanelRunSettled(handler: (payload: AgentPanelRunSettledPayload) => void) {
  return agentPanelEventBus.subscribe(AGENT_PANEL_RUN_SETTLED_EVENT, handler)
}
