import type { AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import type { AgentStandaloneTaskState, AgentConversationThreadBinding, AgentConversationRuntimeState } from '@/features/agent/state/agentSessionRuntimeModel'
import {
  isTerminalAgentPageTaskRun, normalizeTaskPayload, pageTaskStatusFromProviderSession, AgentPageTaskPayload, AgentPageTaskRunningPatch, AgentPageTaskRun, AgentPageTaskState, AgentPageTaskThread, } from '@/features/agent/state/agentSessionTaskModel'
import type { AgentRun, AgentThread } from '@movscript/core/agent/protocol'

export interface AgentSessionVolatileState {
  pageTasks: Record<string, AgentPageTaskState>
  conversationThreadBindings: Record<string, AgentConversationThreadBinding>
  conversationRuntimeStates: Record<string, AgentConversationRuntimeState>
  standaloneTasks: Record<string, AgentStandaloneTaskState>
}

export function initialAgentSessionVolatileState(): AgentSessionVolatileState {
  return {
    pageTasks: {},
    conversationThreadBindings: {},
    conversationRuntimeStates: {},
    standaloneTasks: {},
  }
}

export function enqueueAgentPageTask(input: {
  now: number
  pageTasks: Record<string, AgentPageTaskState>
  payload: AgentPageTaskPayload
}): {
  normalized: AgentPageTaskPayload & { requestId: string; taskType: string }
  pageTasks: Record<string, AgentPageTaskState>
} {
  const normalized = normalizeTaskPayload(input.payload)
  const existing = input.pageTasks[normalized.requestId]
  return {
    normalized,
    pageTasks: {
      ...input.pageTasks,
      [normalized.requestId]: {
        requestId: normalized.requestId,
        taskType: normalized.taskType,
        status: existing?.status ?? 'queued',
        payload: normalized,
        conversationId: existing?.conversationId,
        providerSessionTreeId: existing?.providerSessionTreeId,
        threadId: existing?.threadId,
        runId: existing?.runId,
        run: existing?.run,
        thread: existing?.thread,
        error: existing?.error,
        createdAt: existing?.createdAt ?? input.now,
        updatedAt: input.now,
        settledAt: existing?.settledAt,
      },
    },
  }
}

export function claimNextQueuedAgentPageTask(input: {
  now: number
  pageTasks: Record<string, AgentPageTaskState>
}): {
  payload: AgentPageTaskPayload & { requestId: string; taskType: string }
  pageTasks: Record<string, AgentPageTaskState>
} | null {
  const task = Object.values(input.pageTasks)
    .filter((item) => item.status === 'queued')
    .sort((a, b) => a.createdAt - b.createdAt)[0]
  if (!task) return null
  return {
    payload: task.payload,
    pageTasks: {
      ...input.pageTasks,
      [task.requestId]: { ...task, status: 'claimed', updatedAt: input.now },
    },
  }
}

export function attachAgentPageTaskConversation(input: {
  conversationId: string
  now: number
  pageTasks: Record<string, AgentPageTaskState>
  requestId: string
}): Record<string, AgentPageTaskState> | null {
  const task = input.pageTasks[input.requestId]
  if (!task) return null
  return {
    ...input.pageTasks,
    [input.requestId]: {
      ...task,
      conversationId: input.conversationId,
      status: task.status === 'queued' ? 'claimed' : task.status,
      updatedAt: input.now,
    },
  }
}

export function setAgentPageTaskRunning(input: {
  now: number
  pageTasks: Record<string, AgentPageTaskState>
  patch: AgentPageTaskRunningPatch
  requestId: string
}): Record<string, AgentPageTaskState> | null {
  const task = input.pageTasks[input.requestId]
  if (!task) return null
  const run = input.patch.run ?? task.run
  const thread = input.patch.thread ?? task.thread
  const providerSessionTreeId = providerSessionTreeIdForPageTask(
    input.patch,
    thread,
    run,
    task,
  )
  return {
    ...input.pageTasks,
    [input.requestId]: {
      ...task,
      conversationId: input.patch.conversationId ?? task.conversationId,
      providerSessionTreeId,
      threadId: input.patch.threadId ?? thread?.id ?? run?.threadId ?? task.threadId,
      runId: run?.id ?? task.runId,
      run,
      thread,
      artifacts: input.patch.artifacts ?? task.artifacts,
      status: 'running',
      updatedAt: input.now,
    },
  }
}

export function updateAgentPageTaskFromProviderSession(input: {
  now: number
  pageTasks: Record<string, AgentPageTaskState>
  payload: {
    requestId?: string
    run?: AgentPageTaskRun
    thread?: AgentPageTaskThread
    error?: string
    artifacts?: AgentTaskArtifactRef[]
    status?: 'completed' | 'error' | 'cancelled'
  }
}): Record<string, AgentPageTaskState> | null {
  const requestId = input.payload.requestId
  if (!requestId) return null
  const task = input.pageTasks[requestId]
  if (!task) return null
  return {
    ...input.pageTasks,
    [requestId]: {
      ...task,
      status: pageTaskStatusFromProviderSession(input.payload, task.status),
      run: input.payload.run ?? task.run,
      thread: input.payload.thread ?? task.thread,
      providerSessionTreeId: providerSessionTreeIdForPageTask(input.payload.thread, input.payload.run, task),
      runId: input.payload.run?.id ?? task.runId,
      threadId: input.payload.thread?.id ?? input.payload.run?.threadId ?? task.threadId,
      artifacts: input.payload.artifacts ?? task.artifacts,
      error: input.payload.error,
      updatedAt: input.now,
      settledAt: input.payload.status !== undefined || (input.payload.run && isTerminalAgentPageTaskRun(input.payload.run))
        ? input.now
        : task.settledAt,
    },
  }
}

function providerSessionTreeIdForPageTask(
  ...refs: Array<{ providerSessionTreeId?: string; sessionId?: string } | undefined>
): string | undefined {
  for (const ref of refs) {
    const providerSessionTreeId = ref?.providerSessionTreeId?.trim()
    if (providerSessionTreeId) return providerSessionTreeId
    const legacySessionId = ref?.sessionId?.trim()
    if (legacySessionId) return legacySessionId
  }
  return undefined
}

export function startAgentStandaloneTask(input: {
  now: number
  standaloneTasks: Record<string, AgentStandaloneTaskState>
  taskId: string
  taskType: string
  title?: string
  prompt: string
}): Record<string, AgentStandaloneTaskState> {
  return {
    ...input.standaloneTasks,
    [input.taskId]: {
      taskId: input.taskId,
      taskType: input.taskType,
      title: input.title,
      prompt: input.prompt,
      status: 'running',
      startedAt: input.now,
      updatedAt: input.now,
    },
  }
}

export function updateAgentStandaloneTask(input: {
  now: number
  patch: Partial<Omit<AgentStandaloneTaskState, 'taskId' | 'taskType' | 'prompt' | 'startedAt'>>
  standaloneTasks: Record<string, AgentStandaloneTaskState>
  taskId: string
}): Record<string, AgentStandaloneTaskState> | null {
  const current = input.standaloneTasks[input.taskId]
  if (!current) return null
  return {
    ...input.standaloneTasks,
    [input.taskId]: {
      ...current,
      ...input.patch,
      updatedAt: input.now,
    },
  }
}

export function settleAgentStandaloneTask(input: {
  now: number
  payload: {
    taskId: string
    status: 'completed' | 'cancelled' | 'error' | 'requires_action'
    run?: AgentRun
    thread?: AgentThread
    result?: string
    error?: string
  }
  standaloneTasks: Record<string, AgentStandaloneTaskState>
}): Record<string, AgentStandaloneTaskState> | null {
  const current = input.standaloneTasks[input.payload.taskId]
  if (!current) return null
  return {
    ...input.standaloneTasks,
    [input.payload.taskId]: {
      ...current,
      status: input.payload.status,
      run: input.payload.run ?? current.run,
      thread: input.payload.thread ?? current.thread,
      runId: input.payload.run?.id ?? current.runId,
      threadId: input.payload.thread?.id ?? input.payload.run?.threadId ?? current.threadId,
      result: input.payload.result,
      error: input.payload.error,
      updatedAt: input.now,
      settledAt: input.now,
    },
  }
}
