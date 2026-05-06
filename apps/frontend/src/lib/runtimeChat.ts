import type {
  AgentClientInput,
  AgentManifest,
  RunMessageOptions,
  RunMessageResult,
} from '@/lib/localAgentClient'
import { localAgentClient } from '@/lib/localAgentClient'

export interface RuntimeManifestInput {
  id: string
  name: string
  soul: string
  description?: string
  permissions?: string[]
  tools?: AgentManifest['tools']
  metadata?: Record<string, unknown>
  modelConfigId?: number | null
  modelName?: string
}

export function buildRuntimeManifest(input: RuntimeManifestInput): AgentManifest {
  return {
    schema: 'movscript.agent.current',
    id: input.id,
    version: '1.0.0',
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    soul: input.soul,
    skills: [],
    permissions: input.permissions ?? [],
    tools: input.tools ?? [],
    ...(input.modelConfigId ? {
      model: {
        provider: 'backend-model-config',
        modelId: input.modelName?.trim() || `model_config:${input.modelConfigId}`,
        platformModelId: input.modelConfigId,
      },
    } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  }
}

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
  agentManifest: AgentManifest
  threadId?: string
  timeoutMs?: number
  pollMs?: number
  onRunUpdate?: RunMessageOptions['onRunUpdate']
}): Promise<RunMessageResult> {
  await localAgentClient.ensureRunning()
  await syncRuntimeModelConfig(input.modelConfigId, input.modelName)
  return localAgentClient.runMessage({
    ...(input.threadId ? { threadId: input.threadId } : {}),
    message: input.message,
    title: input.title,
    ...(input.clientInput ? { clientInput: input.clientInput } : {}),
  }, {
    agentManifest: input.agentManifest,
    ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.pollMs ? { pollMs: input.pollMs } : {}),
    ...(input.onRunUpdate ? { onRunUpdate: input.onRunUpdate } : {}),
  })
}
