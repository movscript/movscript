import { Database, Library, Route } from 'lucide-react'
import type {
  AgentModelCatalogEntry,
  AgentModelRouteBinding,
} from '@/features/agent/application/agentModelCatalogApi'
import { publicModelId, publicModelLabel } from '@/shared/domain/modelDisplay'
import type { PublicModel } from '@/types'

export type BackendModelProvider = {
  id: string
  label: string
  providerId?: string
  modelCount: number
  models: string[]
  capabilities: string[]
  defaultModel?: string
}

export type ModelProviderLayer = 'providers' | 'catalog' | 'routes'

export const MODEL_PROVIDER_LAYERS: Array<{
  id: ModelProviderLayer
  label: string
  detail: string
  edition: string
  icon: typeof Database
}> = [
  {
    id: 'providers',
    label: 'Provider',
    detail: '本地 provider credential、base URL 和上游认证来源。',
    edition: '两版共享',
    icon: Database,
  },
  {
    id: 'catalog',
    label: 'Catalog Entry',
    detail: '系统识别模型的标准档案，能力配置两版一致。',
    edition: '两版一致',
    icon: Library,
  },
  {
    id: 'routes',
    label: '模型路由',
    detail: '把 Catalog Entry 映射到 Provider 通道或中转站分组。',
    edition: 'Admin 管理',
    icon: Route,
  },
]

export function groupBackendModelProviders(models: PublicModel[]): BackendModelProvider[] {
  const providers = new Map<string, {
    label: string
    providerId?: string
    models: PublicModel[]
    capabilities: Set<string>
  }>()
  for (const model of models) {
    const providerId = backendModelProviderId(model)
    const key = `backend:${providerId}`
    const current = providers.get(key) ?? {
      label: model.provider_name?.trim() || 'Backend Provider',
      providerId,
      models: [],
      capabilities: new Set<string>(),
    }
    current.models.push(model)
    for (const capability of model.capabilities ?? []) current.capabilities.add(capability)
    providers.set(key, current)
  }
  return Array.from(providers.entries()).map(([id, provider]) => {
    const defaultModel = provider.models.find((model) => model.is_default) ?? provider.models[0]
    return {
      id,
      label: provider.label,
      providerId: provider.providerId,
      modelCount: provider.models.length,
      models: provider.models.map((model) => `${publicModelLabel(model)} (${publicModelId(model)})`),
      capabilities: Array.from(provider.capabilities).sort(),
      ...(defaultModel ? { defaultModel: `${publicModelLabel(defaultModel)} (${publicModelId(defaultModel)})` } : {}),
    }
  })
}

export function flattenCatalogRouteBindings(entries: AgentModelCatalogEntry[]): Array<{
  entry: AgentModelCatalogEntry
  binding: AgentModelRouteBinding
}> {
  return entries.flatMap((entry) => (entry.route_bindings ?? []).map((binding) => ({ entry, binding })))
}

export function catalogEntryCapabilities(entry: AgentModelCatalogEntry): string[] {
  return stringList(entry.capabilities)
}

export function supportedParamsSummary(value: string | undefined): string {
  if (!value?.trim()) return '未配置'
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) return `${parsed.length} 个参数`
    if (parsed && typeof parsed === 'object') return `${Object.keys(parsed).length} 个字段`
  } catch {
    return '高级 JSON'
  }
  return '高级 JSON'
}

export function routeSourceLabel(source: string): string {
  if (isRelayGatewayRouteSource(source)) return '中转站分组'
  if (source === 'local_provider') return 'Local Provider'
  return source || 'Provider'
}

export function isRelayGatewayRoute(binding: AgentModelRouteBinding): boolean {
  return isRelayGatewayRouteSource(binding.source_type)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function backendModelProviderId(model: PublicModel): string {
  const providerID = model.provider_id?.trim()
  if (providerID) return providerID
  return `catalog:${model.catalog_entry_id || model.id}`
}

function stringList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function isRelayGatewayRouteSource(source: string): boolean {
  return source === 'relay_gateway'
}
