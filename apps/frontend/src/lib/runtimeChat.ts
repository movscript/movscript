import type {
  AgentClientInput,
  RunMessageOptions,
  RunMessageResult,
} from '@/lib/localAgentClient'
import { localAgentClient } from '@/lib/localAgentClient'
import { useAgentSessionStore } from '@/store/agentSessionStore'

export type RuntimeModelAPIKind =
  | 'backend_chat_completions'
  | 'openai_chat_completions'
  | 'openai_responses'
  | 'anthropic_messages'

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
  onStreamEvent?: RunMessageOptions['onStreamEvent']
  onAssistantDelta?: RunMessageOptions['onAssistantDelta']
  sessionId?: string
  sessionTaskType?: string
}): Promise<RunMessageResult> {
  await localAgentClient.ensureRunning()
  await syncRuntimeModelConfig(input.modelId, {
    ...(input.modelAPIKind ? { apiKind: input.modelAPIKind } : {}),
    ...(input.modelBaseURL ? { baseURL: input.modelBaseURL } : {}),
  })
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
