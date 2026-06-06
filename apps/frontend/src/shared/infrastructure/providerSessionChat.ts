import type {
  ProviderSessionClient,
  ProviderModelAPIKind,
  ProviderModelConfigPublic,
} from '@/shared/infrastructure/providerSessionClient'
import { providerSessionClient } from '@/shared/infrastructure/providerSessionClient'

let lastSyncedProviderSessionModelConfigKey: string | undefined

export async function syncProviderSessionModelConfig(
  modelId?: string | null,
  options: { apiKind?: ProviderModelAPIKind; baseURL?: string; client?: Pick<ProviderSessionClient, 'baseURL' | 'getModelConfig' | 'saveModelConfig'> } = {},
): Promise<void> {
  const model = modelId?.trim()
  if (!model) return
  const client = options.client ?? providerSessionClient
  let current: ProviderModelConfigPublic | undefined
  try {
    current = await client.getModelConfig()
  } catch {
    // Fall through to saving; the caller already surfaces model config save failures.
  }
  const input = providerSessionModelConfigSyncInput(model, options, current)
  const key = stableProviderSessionModelConfigKey(input, client.baseURL)
  if (key === lastSyncedProviderSessionModelConfigKey) return
  if (current && providerSessionModelConfigMatches(current, input)) {
    lastSyncedProviderSessionModelConfigKey = key
    return
  }
  await client.saveModelConfig({
    ...input,
  })
  lastSyncedProviderSessionModelConfigKey = key
}

function providerSessionModelConfigSyncInput(
  model: string,
  options: { apiKind?: ProviderModelAPIKind; baseURL?: string },
  current?: ProviderModelConfigPublic,
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

function providerSessionModelConfigMatches(current: ProviderModelConfigPublic, input: {
  model: string
  apiKind?: ProviderModelAPIKind
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

function stableProviderSessionModelConfigKey(input: {
  model: string
  apiKind?: ProviderModelAPIKind
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
