import type {
  AgentClientInput,
  RunMessageOptions,
  RunMessageResult,
  RuntimeModelAPIKind,
  RuntimeModelConfigPublic,
} from '@/shared/infrastructure/localAgentClient'
import { localAgentClient } from '@/shared/infrastructure/localAgentClient'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'

let lastSyncedRuntimeModelConfigKey: string | undefined

export async function syncRuntimeModelConfig(
  modelId?: string | null,
  options: { apiKind?: RuntimeModelAPIKind; baseURL?: string } = {},
): Promise<void> {
  const model = modelId?.trim()
  if (!model) return
  const input = {
    model,
    ...(options.apiKind ? { apiKind: options.apiKind } : {}),
    ...(options.baseURL?.trim() ? { baseURL: options.baseURL.trim() } : {}),
    useForChat: true,
    useForPlanner: true,
  }
  const key = stableRuntimeModelConfigKey(input)
  if (key === lastSyncedRuntimeModelConfigKey) return
  try {
    const current = await localAgentClient.getModelConfig()
    if (runtimeModelConfigMatches(current, input)) {
      lastSyncedRuntimeModelConfigKey = key
      return
    }
  } catch {
    // Fall through to saving; the caller already surfaces model config save failures.
  }
  await localAgentClient.saveModelConfig({
    ...input,
  })
  lastSyncedRuntimeModelConfigKey = key
}

function runtimeModelConfigMatches(current: RuntimeModelConfigPublic, input: {
  model: string
  apiKind?: RuntimeModelAPIKind
  baseURL?: string
  useForChat: boolean
  useForPlanner: boolean
}): boolean {
  return current.configured === true
    && current.model === input.model
    && current.useForChat === input.useForChat
    && current.useForPlanner === input.useForPlanner
    && (input.apiKind === undefined || current.apiKind === input.apiKind)
    && (input.baseURL === undefined || current.baseURL === input.baseURL)
}

function stableRuntimeModelConfigKey(input: {
  model: string
  apiKind?: RuntimeModelAPIKind
  baseURL?: string
  useForChat: boolean
  useForPlanner: boolean
}): string {
  return JSON.stringify({
    model: input.model,
    apiKind: input.apiKind ?? null,
    baseURL: input.baseURL ?? null,
    useForChat: input.useForChat,
    useForPlanner: input.useForPlanner,
  })
}

export async function runRuntimeMessage(input: {
  message: string
  title: string
  clientInput?: AgentClientInput
  modelId?: string | null
  modelAPIKind?: RuntimeModelAPIKind
  modelBaseURL?: string
  threadId?: string
  timeoutMs?: number
  pollMs?: number
  onRunUpdate?: RunMessageOptions['onRunUpdate']
  onRuntimeEvent?: RunMessageOptions['onRuntimeEvent']
  standaloneTaskId?: string
  standaloneTaskType?: string
}): Promise<RunMessageResult> {
  await localAgentClient.ensureRunning()
  await syncRuntimeModelConfig(input.modelId, {
    ...(input.modelAPIKind ? { apiKind: input.modelAPIKind } : {}),
    ...(input.modelBaseURL ? { baseURL: input.modelBaseURL } : {}),
  })
  if (input.standaloneTaskId) {
    useAgentSessionStore.getState().startStandaloneTask({
      taskId: input.standaloneTaskId,
      taskType: input.standaloneTaskType ?? 'standalone_run',
      title: input.title,
      prompt: input.message,
    })
  }
  try {
    const runResult = await localAgentClient.runMessageStream({
      ...(input.threadId ? { threadId: input.threadId } : {}),
      message: input.message,
      title: input.title,
      ...(input.clientInput ? { clientInput: input.clientInput } : {}),
    }, {
      ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
      ...(input.pollMs ? { pollMs: input.pollMs } : {}),
      ...(input.onRunUpdate ? { onRunUpdate: input.onRunUpdate } : {}),
      ...(input.onRuntimeEvent ? { onRuntimeEvent: input.onRuntimeEvent } : {}),
    })
    if (input.standaloneTaskId) {
      useAgentSessionStore.getState().settleStandaloneTask({
        taskId: input.standaloneTaskId,
        status: runResult.run.status === 'cancelled'
          ? 'cancelled'
          : runResult.run.status === 'failed'
            ? 'error'
            : runResult.run.status === 'requires_action'
              ? 'requires_action'
              : 'completed',
        run: runResult.run,
        thread: runResult.thread,
      })
    }
    return runResult
  } catch (error) {
    if (input.standaloneTaskId) {
      useAgentSessionStore.getState().settleStandaloneTask({
        taskId: input.standaloneTaskId,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
    throw error
  }
}
