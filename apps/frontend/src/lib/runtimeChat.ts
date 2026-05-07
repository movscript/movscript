import type {
  AgentClientInput,
  RunMessageOptions,
  RunMessageResult,
} from '@/lib/localAgentClient'
import { localAgentClient } from '@/lib/localAgentClient'
import { useAgentSessionStore } from '@/store/agentSessionStore'

export async function syncRuntimeModelConfig(modelConfigId: number | null | undefined, modelName?: string): Promise<void> {
  if (typeof modelConfigId !== 'number' || !Number.isInteger(modelConfigId) || modelConfigId <= 0) return
  await localAgentClient.saveModelConfig({
    modelConfigId,
    model: modelName?.trim() || `model_config:${modelConfigId}`,
    useForChat: true,
    useForPlanner: true,
  })
}

export async function runRuntimeMessage(input: {
  message: string
  title: string
  clientInput?: AgentClientInput
  modelConfigId?: number | null
  modelName?: string
  threadId?: string
  timeoutMs?: number
  pollMs?: number
  onRunUpdate?: RunMessageOptions['onRunUpdate']
  onStreamEvent?: RunMessageOptions['onStreamEvent']
  onAssistantDelta?: RunMessageOptions['onAssistantDelta']
  sessionId?: string
  sessionTaskType?: string
}): Promise<RunMessageResult> {
  await localAgentClient.ensureRunning()
  await syncRuntimeModelConfig(input.modelConfigId, input.modelName)
  if (input.sessionId) {
    useAgentSessionStore.getState().startStandaloneSession({
      sessionId: input.sessionId,
      taskType: input.sessionTaskType ?? 'standalone_run',
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
      ...(input.onStreamEvent ? { onStreamEvent: input.onStreamEvent } : {}),
      ...(input.onAssistantDelta ? { onAssistantDelta: input.onAssistantDelta } : {}),
    })
    if (input.sessionId) {
      useAgentSessionStore.getState().settleStandaloneSession({
        sessionId: input.sessionId,
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
    if (input.sessionId) {
      useAgentSessionStore.getState().settleStandaloneSession({
        sessionId: input.sessionId,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
    throw error
  }
}
