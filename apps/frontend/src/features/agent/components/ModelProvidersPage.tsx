import {
  useMemo,
  useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Database,
  GitBranch,
  Library,
  RefreshCw,
  Route } from 'lucide-react'
import {
  AgentPageShell,
  AgentPageShellHeader,
} from '@/features/agent/components/AgentPageUi'
import {
  AgentConsoleActionButton,
  AgentConsoleCallout,
  AgentConsoleDescription,
  AgentConsoleDocumentBody,
  AgentConsoleGrid,
  AgentConsoleHeader,
  AgentConsoleHeaderActions,
  AgentConsoleHeaderCopy,
  AgentConsoleHeaderDescription,
  AgentConsoleHeaderTitle,
  AgentConsoleHeaderTitleRow,
  AgentConsoleInlineError,
  AgentConsoleIntroRow,
  AgentConsoleLocalToolCard,
  AgentConsoleLocalToolControls,
  AgentConsoleLocalToolCopy,
  AgentConsoleLocalToolDetail,
  AgentConsoleLocalToolFields,
  AgentConsoleLocalToolHeader,
  AgentConsoleLocalToolTitle,
  AgentConsolePanel,
  AgentConsolePanelActions,
  AgentConsoleStack,
  AgentConsoleStatusBadge,
  AgentConsoleSyncBadge,
  AgentConsoleToolbar,
} from '@/features/agent/components/AgentConsoleUi'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import { IdentityBadge, IdentityMark } from '@/features/agent/components/AgentIdentityUi'
import {
  fetchAgentBackendModels,
  fetchAgentModelCatalogEntries,
  type AgentModelCatalogEntry,
  type AgentModelRouteBinding,
} from '@/features/agent/application/agentModelCatalogApi'
import { agentProviderKeys } from '@/features/agent/application/agentQueryKeys'
import { publicModelId, publicModelLabel } from '@/shared/domain/modelDisplay'
import type { PublicModel } from '@/types'

type BackendModelProvider = {
  id: string
  label: string
  providerId?: string
  modelCount: number
  models: string[]
  capabilities: string[]
  defaultModel?: string
}

type ModelProviderLayer = 'providers' | 'catalog' | 'routes'

export default function ModelProvidersPage() {
  const backendModelsQuery = useQuery({
    queryKey: agentProviderKeys.modelProvidersBackendModels,
    queryFn: () => fetchAgentBackendModels(),
    retry: false,
  })
  const modelCatalogQuery = useQuery({
    queryKey: agentProviderKeys.modelCatalogEntries,
    queryFn: () => fetchAgentModelCatalogEntries(),
    retry: false,
  })
  const [activeLayer, setActiveLayer] = useState<ModelProviderLayer>('providers')

  const backendProviders = useMemo(() => groupBackendModelProviders(backendModelsQuery.data ?? []), [backendModelsQuery.data])
  const catalogEntries = modelCatalogQuery.data ?? []
  const routeBindings = useMemo(() => flattenCatalogRouteBindings(catalogEntries), [catalogEntries])
  const enabledCount = backendProviders.length

  return (
    <AgentPageShell data-testid="model-providers-page">
      <AgentPageShellHeader>
        <AgentConsoleHeader>
          <AgentConsoleHeaderCopy>
            <AgentConsoleHeaderTitleRow>
              <IdentityMark kind="model" id="gpt" />
              <AgentConsoleHeaderTitle>Provider / Catalog / Route</AgentConsoleHeaderTitle>
              <AgentConsoleStatusBadge intent={enabledCount > 0 ? 'success' : 'warning'} emphasis="soft">
                {enabledCount} 个可用
              </AgentConsoleStatusBadge>
              {(backendModelsQuery.isLoading || modelCatalogQuery.isLoading) && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
            </AgentConsoleHeaderTitleRow>
            <AgentConsoleHeaderDescription>
              按 Provider、Catalog 和 Route 三层查看模型调用状态。配置权威在 Admin：Provider 保存认证和上游来源，Catalog 保存系统识别的模型身份，Route 决定请求实际落到哪条 provider lane。
            </AgentConsoleHeaderDescription>
          </AgentConsoleHeaderCopy>
          <AgentConsoleHeaderActions>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void Promise.all([backendModelsQuery.refetch(), modelCatalogQuery.refetch()])}>
              <RefreshCw size={14} />
              刷新
            </AgentConsoleActionButton>
          </AgentConsoleHeaderActions>
        </AgentConsoleHeader>
      </AgentPageShellHeader>

      <AgentConsoleNav compact />

      <AgentConsoleDocumentBody>
        <AgentConsolePanel
          title="Management Layers"
          icon={<GitBranch size={14} />}
          action={(
            <AgentConsolePanelActions>
              <AgentConsoleStatusBadge intent="neutral" emphasis="soft">
                provider / catalog / route
              </AgentConsoleStatusBadge>
            </AgentConsolePanelActions>
          )}
        >
          <AgentConsoleStack spacing="loose">
            <AgentConsoleIntroRow>
              <AgentConsoleDescription>
                社区版通过 Provider 和 route group 组织调用来源；Catalog Entry 保存模型身份、能力和参数，Route 保存 Catalog 到 provider lane 的映射。
              </AgentConsoleDescription>
              <AgentConsoleToolbar>
                {MODEL_PROVIDER_LAYERS.map((layer) => (
                  <ModelProviderLayerButton key={layer.id} layer={layer} active={activeLayer === layer.id} onClick={() => setActiveLayer(layer.id)} />
                ))}
              </AgentConsoleToolbar>
            </AgentConsoleIntroRow>
            <AgentConsoleGrid columns="server">
              {MODEL_PROVIDER_LAYERS.map((layer) => (
                <AgentConsoleLocalToolCard key={layer.id} invalid={activeLayer === layer.id ? undefined : false}>
                  <AgentConsoleLocalToolHeader>
                    <AgentConsoleLocalToolCopy>
                      <AgentConsoleLocalToolTitle>{layer.label}</AgentConsoleLocalToolTitle>
                      <AgentConsoleLocalToolDetail>{layer.detail}</AgentConsoleLocalToolDetail>
                    </AgentConsoleLocalToolCopy>
                    <AgentConsoleLocalToolControls>
                      <AgentConsoleStatusBadge intent={activeLayer === layer.id ? 'success' : 'neutral'} emphasis="soft">
                        {activeLayer === layer.id ? '当前' : layer.edition}
                      </AgentConsoleStatusBadge>
                    </AgentConsoleLocalToolControls>
                  </AgentConsoleLocalToolHeader>
                </AgentConsoleLocalToolCard>
              ))}
            </AgentConsoleGrid>
          </AgentConsoleStack>
        </AgentConsolePanel>

        {activeLayer === 'providers' ? (
        <AgentConsolePanel
          title="Provider"
          icon={<Database size={14} />}
          action={(
            <AgentConsolePanelActions>
              <AgentConsoleStatusBadge intent={backendProviders.length > 0 ? 'success' : 'warning'} emphasis="soft">
                {backendProviders.length > 0 ? `${backendProviders.length} 个供应商` : '未发现'}
              </AgentConsoleStatusBadge>
            </AgentConsolePanelActions>
          )}
        >
          <AgentConsoleStack spacing="loose">
            <AgentConsoleIntroRow>
              <AgentConsoleDescription>
                Provider 是运行时来源层。社区版使用本地后端保存 API Key、base URL 和 adapter，并通过 route group 组织不同供应商组。
              </AgentConsoleDescription>
              <AgentConsoleToolbar>
                <AgentConsoleStatusBadge intent="neutral" emphasis="soft">
                  backend / models
                </AgentConsoleStatusBadge>
              </AgentConsoleToolbar>
            </AgentConsoleIntroRow>

            {backendModelsQuery.error ? <AgentConsoleInlineError>{errorMessage(backendModelsQuery.error)}</AgentConsoleInlineError> : null}
            {!backendModelsQuery.error && backendProviders.length === 0 ? (
              <AgentConsoleCallout tone="warning" compact>
                后端当前没有返回可用模型。请先配置 Provider，并在 Admin 中维护 Catalog Entry 和 Route。
              </AgentConsoleCallout>
            ) : null}

            <AgentConsoleGrid columns="server">
              {backendProviders.map((provider) => (
                <AgentConsoleLocalToolCard key={provider.id}>
                  <AgentConsoleLocalToolHeader>
                    <AgentConsoleLocalToolCopy>
                      <AgentConsoleLocalToolTitle>
                        <IdentityBadge kind="model" id={provider.defaultModel ?? provider.models[0]} label={provider.label} detail={provider.defaultModel} size="sm" variant="stack" />
                      </AgentConsoleLocalToolTitle>
                      <AgentConsoleLocalToolDetail>
                        {provider.modelCount} 个模型
                      </AgentConsoleLocalToolDetail>
                    </AgentConsoleLocalToolCopy>
                    <AgentConsoleLocalToolControls>
                      <AgentConsoleStatusBadge intent="success" emphasis="soft">Backend</AgentConsoleStatusBadge>
                      <AgentConsoleStatusBadge intent="neutral" emphasis="soft">只读</AgentConsoleStatusBadge>
                    </AgentConsoleLocalToolControls>
                  </AgentConsoleLocalToolHeader>
                  <AgentConsoleLocalToolFields>
                    <AgentConsoleCallout compact>
                      默认模型：{provider.defaultModel ?? provider.models[0] ?? '-'}
                    </AgentConsoleCallout>
                    <AgentConsoleCallout compact>
                      Provider lane：{provider.providerId ?? '-'}
                    </AgentConsoleCallout>
                    <AgentConsoleCallout compact>
                      能力：{provider.capabilities.length > 0 ? provider.capabilities.join(', ') : '未声明'}
                    </AgentConsoleCallout>
                    <AgentConsoleCallout compact>
                      模型：{provider.models.slice(0, 5).join(', ')}{provider.models.length > 5 ? ` 等 ${provider.models.length} 个` : ''}
                    </AgentConsoleCallout>
                  </AgentConsoleLocalToolFields>
                </AgentConsoleLocalToolCard>
              ))}
            </AgentConsoleGrid>
          </AgentConsoleStack>
        </AgentConsolePanel>
        ) : null}

        {activeLayer === 'catalog' ? (
          <AgentConsolePanel
            title="Catalog Entries"
            icon={<Library size={14} />}
            action={(
              <AgentConsolePanelActions>
                <AgentConsoleStatusBadge intent={catalogEntries.length > 0 ? 'success' : 'warning'} emphasis="soft">
                  {catalogEntries.length > 0 ? `${catalogEntries.length} 个目录项` : '未配置'}
                </AgentConsoleStatusBadge>
              </AgentConsolePanelActions>
            )}
          >
            <AgentConsoleStack spacing="loose">
              <AgentConsoleIntroRow>
                <AgentConsoleDescription>
                  Catalog Entry 是系统识别模型的列表。这里仅展示当前档案；新增和调整请在 Admin 模型目录中完成。
                </AgentConsoleDescription>
                <AgentConsoleToolbar>
                  <AgentConsoleStatusBadge intent="neutral" emphasis="soft">
                    Admin 管理
                  </AgentConsoleStatusBadge>
                </AgentConsoleToolbar>
              </AgentConsoleIntroRow>
              {modelCatalogQuery.error ? <AgentConsoleInlineError>{errorMessage(modelCatalogQuery.error)}</AgentConsoleInlineError> : null}
              {!modelCatalogQuery.error && catalogEntries.length === 0 ? (
                <AgentConsoleCallout tone="warning" compact>
                  当前没有 Catalog Entry。请先在 Admin 模型目录中创建标准模型档案，再配置路由。
                </AgentConsoleCallout>
              ) : null}
              <AgentConsoleGrid columns="server">
                {catalogEntries.map((entry) => (
                  <AgentConsoleLocalToolCard key={entry.id} invalid={!entry.is_enabled}>
	                    <AgentConsoleLocalToolHeader>
	                      <AgentConsoleLocalToolCopy>
	                        <AgentConsoleLocalToolTitle>
	                          <IdentityBadge kind="model" id={entry.public_model_id} label={entry.display_name || entry.public_model_id} detail={entry.public_model_id} size="sm" variant="stack" />
	                        </AgentConsoleLocalToolTitle>
                        <AgentConsoleLocalToolDetail>
                          {catalogEntryCapabilities(entry).join(', ') || '未声明能力'}
                        </AgentConsoleLocalToolDetail>
                      </AgentConsoleLocalToolCopy>
                      <AgentConsoleLocalToolControls>
                        <AgentConsoleStatusBadge intent={entry.is_enabled ? 'success' : 'neutral'} emphasis="soft">
                          {entry.is_enabled ? '启用' : '停用'}
                        </AgentConsoleStatusBadge>
                        <AgentConsoleStatusBadge intent="neutral" emphasis="soft">
                          {entry.route_bindings?.length ?? 0} routes
                        </AgentConsoleStatusBadge>
                      </AgentConsoleLocalToolControls>
                    </AgentConsoleLocalToolHeader>
                    <AgentConsoleLocalToolFields>
	                      <AgentConsoleCallout compact>
	                        Public ID：{entry.public_model_id}
	                      </AgentConsoleCallout>
	                      <AgentConsoleCallout compact>
	                        Params：{supportedParamsSummary(entry.supported_params)}
                      </AgentConsoleCallout>
                    </AgentConsoleLocalToolFields>
                  </AgentConsoleLocalToolCard>
                ))}
              </AgentConsoleGrid>
            </AgentConsoleStack>
          </AgentConsolePanel>
        ) : null}

        {activeLayer === 'routes' ? (
          <AgentConsolePanel
            title="Model Routes"
            icon={<Route size={14} />}
            action={(
              <AgentConsolePanelActions>
                <AgentConsoleStatusBadge intent={routeBindings.length > 0 ? 'success' : 'warning'} emphasis="soft">
                  {routeBindings.length > 0 ? `${routeBindings.length} 条路由` : '未配置'}
                </AgentConsoleStatusBadge>
              </AgentConsolePanelActions>
            )}
          >
            <AgentConsoleStack spacing="loose">
              <AgentConsoleIntroRow>
                <AgentConsoleDescription>
                  模型路由决定用户选择 Catalog Entry 后实际落到哪里。这里仅展示当前路由，新增和调整请在 Admin 中完成。
                </AgentConsoleDescription>
                <AgentConsoleToolbar>
                  <AgentConsoleStatusBadge intent="neutral" emphasis="soft">
                    Admin 管理
                  </AgentConsoleStatusBadge>
                </AgentConsoleToolbar>
              </AgentConsoleIntroRow>
              {modelCatalogQuery.error ? <AgentConsoleInlineError>{errorMessage(modelCatalogQuery.error)}</AgentConsoleInlineError> : null}
              {!modelCatalogQuery.error && routeBindings.length === 0 ? (
                <AgentConsoleCallout tone="warning" compact>
                  当前没有模型路由。Catalog Entry 需要至少一条 provider lane 绑定后才能被调用，请在 Admin 中配置。
                </AgentConsoleCallout>
              ) : null}
              <AgentConsoleGrid columns="server">
                {routeBindings.map(({ entry, binding }) => (
                  <AgentConsoleLocalToolCard key={`${entry.id}:${binding.id}`} invalid={!binding.is_enabled || !entry.is_enabled}>
                    <AgentConsoleLocalToolHeader>
                      <AgentConsoleLocalToolCopy>
                        <AgentConsoleLocalToolTitle>{entry.display_name || entry.public_model_id}</AgentConsoleLocalToolTitle>
                        <AgentConsoleLocalToolDetail>
                          {routeSourceLabel(binding.source_type)} / {binding.route_group?.trim() || 'provider'}
                        </AgentConsoleLocalToolDetail>
                      </AgentConsoleLocalToolCopy>
                      <AgentConsoleLocalToolControls>
                        <AgentConsoleStatusBadge intent={binding.is_enabled && entry.is_enabled ? 'success' : 'neutral'} emphasis="soft">
                          {binding.is_enabled && entry.is_enabled ? '可用' : '停用'}
                        </AgentConsoleStatusBadge>
	                        <AgentConsoleStatusBadge intent="neutral" emphasis="soft">
	                          {isNewAPIRoute(binding) ? 'new-api adapter' : 'Provider lane'}
	                        </AgentConsoleStatusBadge>
                      </AgentConsoleLocalToolControls>
                    </AgentConsoleLocalToolHeader>
	                    <AgentConsoleLocalToolFields>
	                      <AgentConsoleCallout compact>
	                        Catalog：{entry.public_model_id} 到 {binding.provider_model_id || entry.public_model_id}
	                      </AgentConsoleCallout>
	                      <AgentConsoleCallout compact>
	                        Target：{isNewAPIRoute(binding) ? `group ${binding.route_group}` : `${binding.provider_id || 'provider lane'}${binding.route_group ? ` / group ${binding.route_group}` : ''}`}
	                      </AgentConsoleCallout>
                      <AgentConsoleCallout compact>
                        Priority：{binding.priority ?? 0} / Capacity：{binding.capacity_weight ?? 1} / Concurrency：{(binding.max_concurrency ?? 0) || '不限'}
                      </AgentConsoleCallout>
                    </AgentConsoleLocalToolFields>
                  </AgentConsoleLocalToolCard>
                ))}
              </AgentConsoleGrid>
            </AgentConsoleStack>
          </AgentConsolePanel>
        ) : null}

        {activeLayer === 'providers' ? (
          <AgentConsolePanel
            title="Provider Ownership"
            icon={<Database size={14} />}
            action={(
              <AgentConsolePanelActions>
                <AgentConsoleStatusBadge intent="neutral" emphasis="soft">
                  Admin 管理
                </AgentConsoleStatusBadge>
              </AgentConsolePanelActions>
            )}
          >
            <AgentConsoleCallout compact>
              Base URL、API Key、adapter 和 route group 由 Admin 的 Provider 接入页维护；Frontend Agent Console 只读取后端已经发布的模型与路由状态。
            </AgentConsoleCallout>
          </AgentConsolePanel>
        ) : null}
      </AgentConsoleDocumentBody>
    </AgentPageShell>
  )
}

const MODEL_PROVIDER_LAYERS: Array<{
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
    detail: '把 Catalog Entry 映射到 provider lane 或 new-api group。',
    edition: 'Admin 管理',
    icon: Route,
  },
]

function ModelProviderLayerButton({
  layer,
  active,
  onClick,
}: {
  layer: (typeof MODEL_PROVIDER_LAYERS)[number]
  active: boolean
  onClick: () => void
}) {
  const Icon = layer.icon
  return (
    <AgentConsoleActionButton
      type="button"
      size="sm"
      variant={active ? 'solid' : 'outline'}
      onClick={onClick}
    >
      <Icon size={14} />
      {layer.label}
    </AgentConsoleActionButton>
  )
}

function groupBackendModelProviders(models: PublicModel[]): BackendModelProvider[] {
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

function backendModelProviderId(model: PublicModel): string {
  const providerID = model.provider_id?.trim()
  if (providerID) return providerID
  return `catalog:${model.catalog_entry_id || model.id}`
}

function flattenCatalogRouteBindings(entries: AgentModelCatalogEntry[]): Array<{
  entry: AgentModelCatalogEntry
  binding: AgentModelRouteBinding
}> {
  return entries.flatMap((entry) => (entry.route_bindings ?? []).map((binding) => ({ entry, binding })))
}

function catalogEntryCapabilities(entry: AgentModelCatalogEntry): string[] {
  return stringList(entry.capabilities)
}

function stringList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function supportedParamsSummary(value: string | undefined): string {
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

function routeSourceLabel(source: string): string {
  if (isNewAPIRouteSource(source)) return 'Provider Group'
  if (source === 'local_provider') return 'Local Provider'
  return source || 'Provider'
}

function isNewAPIRoute(binding: AgentModelRouteBinding): boolean {
  return isNewAPIRouteSource(binding.source_type)
}

function isNewAPIRouteSource(source: string): boolean {
  return source === 'new_api'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
