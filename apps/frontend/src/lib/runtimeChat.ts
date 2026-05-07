import type {
  AgentClientInput,
  RunMessageOptions,
  RunMessageResult,
} from '@/lib/localAgentClient'
import { localAgentClient } from '@/lib/localAgentClient'

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
}): Promise<RunMessageResult> {
  await localAgentClient.ensureRunning()
  await syncRuntimeModelConfig(input.modelConfigId, input.modelName)
  return localAgentClient.runMessageStream({
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
}
