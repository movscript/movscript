import type {
  LocalAgentClient,
  RuntimeModelAPIKind,
  RuntimeModelConfigPublic,
} from '@/shared/infrastructure/localAgentClient'
import { localAgentClient } from '@/shared/infrastructure/localAgentClient'

let lastSyncedRuntimeModelConfigKey: string | undefined

export async function syncRuntimeModelConfig(
  modelId?: string | null,
  options: { apiKind?: RuntimeModelAPIKind; baseURL?: string; client?: Pick<LocalAgentClient, 'baseURL' | 'getModelConfig' | 'saveModelConfig'> } = {},
): Promise<void> {
  const model = modelId?.trim()
  if (!model) return
  const client = options.client ?? localAgentClient
  let current: RuntimeModelConfigPublic | undefined
  try {
    current = await client.getModelConfig()
  } catch {
    // Fall through to saving; the caller already surfaces model config save failures.
  }
  const input = runtimeModelConfigSyncInput(model, options, current)
  const key = stableRuntimeModelConfigKey(input, client.baseURL)
  if (key === lastSyncedRuntimeModelConfigKey) return
  if (current && runtimeModelConfigMatches(current, input)) {
    lastSyncedRuntimeModelConfigKey = key
    return
  }
  await client.saveModelConfig({
    ...input,
  })
  lastSyncedRuntimeModelConfigKey = key
}

function runtimeModelConfigSyncInput(
  model: string,
  options: { apiKind?: RuntimeModelAPIKind; baseURL?: string },
  current?: RuntimeModelConfigPublic,
) {
  const preservedApiKind = options.apiKind ?? (current?.configured ? current.apiKind : undefined)
  const preservedBaseURL = options.baseURL?.trim() || (current?.configured ? current.baseURL : undefined)
  return {
    model,
    ...(preservedApiKind ? { apiKind: preservedApiKind } : {}),
    ...(preservedBaseURL?.trim() ? { baseURL: preservedBaseURL.trim() } : {}),
    useForChat: true,
    useForPlanner: true,
  }
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
}, clientKey = ''): string {
  return JSON.stringify({
    clientKey,
    model: input.model,
    apiKind: input.apiKind ?? null,
    baseURL: input.baseURL ?? null,
    useForChat: input.useForChat,
    useForPlanner: input.useForPlanner,
  })
}
