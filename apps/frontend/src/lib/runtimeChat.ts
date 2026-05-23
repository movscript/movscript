import type {
  AgentClientInput,
  RunMessageOptions,
  RunMessageResult,
  RuntimeModelAPIKind,
} from '@/lib/localAgentClient'
import { localAgentClient } from '@/lib/localAgentClient'
import { useAgentSessionStore } from '@/store/agentSessionStore'

export async function syncRuntimeModelConfig(
  modelId?: string | null,
  options: { apiKind?: RuntimeModelAPIKind; baseURL?: string } = {},
): Promise<void> {
  const model = modelId?.trim()
  if (!model) return
  await localAgentClient.saveModelConfig({
    model,
    ...(options.apiKind ? { apiKind: options.apiKind } : {}),
    ...(options.baseURL?.trim() ? { baseURL: options.baseURL.trim() } : {}),
    useForChat: true,
    useForPlanner: true,
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
