import {
  useEffect,
  useMemo,
  useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Database,
  GitBranch,
  Library,
  Plus,
  RefreshCw,
  Route,
  Save,
  Trash2 } from 'lucide-react'
import {
  AgentPageShell,
  AgentPageShellHeader,
} from '@/features/agent/components/AgentPageUi'
import {
  AgentConsoleActionButton,
  AgentConsoleCallout,
  AgentConsoleDescription,
  AgentConsoleDocumentBody,
  AgentConsoleFormField,
  AgentConsoleGrid,
  AgentConsoleHeader,
  AgentConsoleHeaderActions,
  AgentConsoleHeaderCopy,
  AgentConsoleHeaderDescription,
  AgentConsoleHeaderTitle,
  AgentConsoleHeaderTitleRow,
  AgentConsoleInlineError,
  AgentConsoleIntroRow,
  AgentConsoleLocalToolActions,
  AgentConsoleLocalToolCard,
  AgentConsoleLocalToolControls,
  AgentConsoleLocalToolCopy,
  AgentConsoleLocalToolDetail,
  AgentConsoleLocalToolFields,
  AgentConsoleLocalToolHeader,
  AgentConsoleLocalToolTitle,
  AgentConsolePanel,
  AgentConsolePanelActions,
  AgentConsoleSavedText,
  AgentConsoleSelectField,
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
import { providerSessionClient, type MovScriptWorkspaceConfig } from '@/shared/infrastructure/providerSessionClient'
import type { PublicModel } from '@/types'

type ModelProviderAPIKind = 'openai_responses' | 'openai_chat_completions' | 'anthropic_messages'

type WorkspaceModelProvider = {
  id: string
  label: string
  baseURL: string
  apiKey?: string
  defaultModel?: string
  apiKind: ModelProviderAPIKind
  enabled: boolean
}

type BackendModelProvider = {
  id: string
  label: string
  credentialId?: number
  modelCount: number
  models: string[]
  capabilities: string[]
  defaultModel?: string
}

type ModelProviderLayer = 'providers' | 'catalog' | 'routes'

const DEFAULT_PROVIDER: WorkspaceModelProvider = {
  id: 'openai',
  label: 'OpenAI',
  baseURL: 'https://api.openai.com/v1',
  defaultModel: 'gpt-5',
  apiKind: 'openai_responses',
  enabled: true,
}

const API_KIND_OPTIONS: Array<{ value: ModelProviderAPIKind; label: string }> = [
  { value: 'openai_responses', label: 'OpenAI Responses' },
  { value: 'openai_chat_completions', label: 'OpenAI Chat Completions' },
  { value: 'anthropic_messages', label: 'Anthropic Messages' },
]

export default function ModelProvidersPage() {
  const workspaceConfigQuery = useQuery({
    queryKey: agentProviderKeys.modelProvidersConfig,
    queryFn: () => providerSessionClient.getWorkspaceConfig(),
    retry: false,
  })
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
  const [providers, setProviders] = useState<WorkspaceModelProvider[]>([])
  const [activeLayer, setActiveLayer] = useState<ModelProviderLayer>('providers')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, string>>({})
  const [showLocalOverrides, setShowLocalOverrides] = useState(false)

  useEffect(() => {
    if (workspaceConfigQuery.data) setProviders(normalizeWorkspaceModelProviders(workspaceConfigQuery.data))
  }, [workspaceConfigQuery.data])

  const backendProviders = useMemo(() => groupBackendModelProviders(backendModelsQuery.data ?? []), [backendModelsQuery.data])
  const catalogEntries = modelCatalogQuery.data ?? []
  const routeBindings = useMemo(() => flattenCatalogRouteBindings(catalogEntries), [catalogEntries])
  const localOverrideCount = providers.filter((provider) => provider.enabled).length
  const enabledCount = backendProviders.length + localOverrideCount
  const invalidCount = providers.filter((provider) => provider.enabled && !modelProviderIsValid(provider)).length
  const canSave = invalidCount === 0

  function patchProvider(id: string, patch: Partial<WorkspaceModelProvider>) {
    setProviders((current) => current.map((provider) => provider.id === id ? { ...provider, ...patch } : provider))
    setSaved(false)
  }

  function addProvider() {
    const id = uniqueProviderId(providers)
    setProviders((current) => [
      ...current,
      {
        id,
        label: 'Local Provider',
        baseURL: DEFAULT_PROVIDER.baseURL,
        defaultModel: DEFAULT_PROVIDER.defaultModel,
        apiKind: DEFAULT_PROVIDER.apiKind,
        enabled: true,
      },
    ])
    setSaved(false)
  }

  function removeProvider(id: string) {
    setProviders((current) => current.filter((provider) => provider.id !== id))
    setSaved(false)
  }

  async function save() {
    if (!canSave || saving) return
    setSaveError(null)
    setSaving(true)
    try {
      await providerSessionClient.saveWorkspaceConfig({ modelProviders: providers.map(modelProviderToConfigRecord) })
      await workspaceConfigQuery.refetch()
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1800)
    } catch (error) {
      setSaveError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  function testProvider(provider: WorkspaceModelProvider) {
    const result = modelProviderIsValid(provider)
      ? `配置可用：${provider.apiKind} / ${provider.baseURL}`
      : '需要填写有效 Base URL；启用的 provider 也需要 API Key。'
    setTestResults((current) => ({ ...current, [provider.id]: result }))
  }

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
              {(workspaceConfigQuery.isLoading || backendModelsQuery.isLoading || modelCatalogQuery.isLoading) && <AgentConsoleSyncBadge>同步中</AgentConsoleSyncBadge>}
            </AgentConsoleHeaderTitleRow>
            <AgentConsoleHeaderDescription>
              按 Provider、Catalog 和 Route 三层管理模型调用。Provider 保存认证和上游来源，Catalog 保存系统识别的模型身份，Route 决定请求实际落到哪组 credential。
            </AgentConsoleHeaderDescription>
          </AgentConsoleHeaderCopy>
          <AgentConsoleHeaderActions>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => void Promise.all([workspaceConfigQuery.refetch(), backendModelsQuery.refetch(), modelCatalogQuery.refetch()])}>
              <RefreshCw size={14} />
              刷新
            </AgentConsoleActionButton>
            <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => setShowLocalOverrides((value) => !value)}>
              {showLocalOverrides ? '隐藏高级覆盖' : '高级本地覆盖'}
            </AgentConsoleActionButton>
            <AgentConsoleActionButton type="button" size="sm" onClick={() => void save()} disabled={!showLocalOverrides || !canSave || saving}>
              <Save size={14} />
              {saving ? '保存中...' : '保存'}
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
                社区版通过 Provider credential 和 route group 组织调用来源；Catalog Entry 保存模型身份、能力和参数，Route 保存 Catalog 到供应商凭据组的映射。
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
                          <IdentityBadge kind="model" id={entry.public_model_id} label={entry.display_name || entry.public_model_id} detail={entry.provider_model_id} size="sm" variant="stack" />
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
                        Provider ID：{entry.provider_model_id}
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
                  当前没有模型路由。Catalog Entry 需要至少一条 provider credential 绑定后才能被调用，请在 Admin 中配置。
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
                          {isNewAPIRoute(binding) ? 'Provider group' : 'Provider credential'}
                        </AgentConsoleStatusBadge>
                      </AgentConsoleLocalToolControls>
                    </AgentConsoleLocalToolHeader>
                    <AgentConsoleLocalToolFields>
                      <AgentConsoleCallout compact>
                        Catalog：{entry.public_model_id} 到 {entry.provider_model_id}
                      </AgentConsoleCallout>
                      <AgentConsoleCallout compact>
                        Target：{isNewAPIRoute(binding) ? `group ${binding.route_group}` : `credential ${binding.credential_id ?? '-'}${binding.route_group ? ` / group ${binding.route_group}` : ''}`}
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

        {activeLayer === 'providers' && showLocalOverrides ? (
          <AgentConsolePanel
            title="Local Providers"
            icon={<Database size={14} />}
            action={(
              <AgentConsolePanelActions>
                {saved && <AgentConsoleSavedText>已保存</AgentConsoleSavedText>}
                <AgentConsoleStatusBadge intent={invalidCount > 0 ? 'warning' : 'success'} emphasis="soft">
                  {invalidCount > 0 ? `${invalidCount} 项需补全` : `${providers.filter((provider) => provider.enabled).length} 个启用`}
                </AgentConsoleStatusBadge>
              </AgentConsolePanelActions>
            )}
          >
            <AgentConsoleStack spacing="loose">
              <AgentConsoleIntroRow>
                <AgentConsoleDescription>
                  高级本地覆盖只保存在当前 runtime profile config 中，用于临时接入后端 AI Gateway 之外的模型服务。团队和正式环境应优先使用 Admin 中的 Provider 和 Route 配置。
                </AgentConsoleDescription>
                <AgentConsoleToolbar>
                  <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={addProvider}>
                    <Plus size={14} />
                    添加本地覆盖
                  </AgentConsoleActionButton>
                  <AgentConsoleStatusBadge intent="neutral" emphasis="soft">
                    advanced / local override
                  </AgentConsoleStatusBadge>
                </AgentConsoleToolbar>
              </AgentConsoleIntroRow>

              {workspaceConfigQuery.error ? <AgentConsoleInlineError>{errorMessage(workspaceConfigQuery.error)}</AgentConsoleInlineError> : null}
              {saveError ? <AgentConsoleCallout tone="danger" compact>保存失败：{saveError}</AgentConsoleCallout> : null}
              {invalidCount > 0 ? <AgentConsoleCallout tone="warning" compact>启用的本地覆盖需要有效 Base URL 和 API Key。</AgentConsoleCallout> : null}
              {providers.length === 0 ? (
                <AgentConsoleCallout compact>
                  当前 workspace 没有本地覆盖；Agent 会使用后端 AI Gateway 提供的模型路由。
                </AgentConsoleCallout>
              ) : null}

              <AgentConsoleGrid columns="server">
                {providers.map((provider) => (
                  <AgentConsoleLocalToolCard key={provider.id} invalid={provider.enabled && !modelProviderIsValid(provider)}>
                    <AgentConsoleLocalToolHeader>
                      <AgentConsoleLocalToolCopy>
                        <AgentConsoleLocalToolTitle>
                          <IdentityBadge kind="model" id={provider.defaultModel} label={provider.label || provider.id} detail={provider.defaultModel} size="sm" variant="stack" />
                        </AgentConsoleLocalToolTitle>
                        <AgentConsoleLocalToolDetail>{provider.apiKind} / {provider.baseURL || '未设置 Base URL'}</AgentConsoleLocalToolDetail>
                      </AgentConsoleLocalToolCopy>
                      <AgentConsoleLocalToolControls>
                        <AgentConsoleStatusBadge intent={provider.enabled ? 'success' : 'neutral'} emphasis="soft">
                          {provider.enabled ? '启用' : '停用'}
                        </AgentConsoleStatusBadge>
                        <input
                          type="checkbox"
                          checked={provider.enabled}
                          onChange={(event) => patchProvider(provider.id, { enabled: event.target.checked })}
                          aria-label={`${provider.label} enabled`}
                        />
                      </AgentConsoleLocalToolControls>
                    </AgentConsoleLocalToolHeader>
                    <AgentConsoleLocalToolFields disabled={!provider.enabled}>
                      <AgentConsoleFormField label="显示名称" value={provider.label} onChange={(event) => patchProvider(provider.id, { label: event.target.value })} />
                      <AgentConsoleFormField label="Base URL" value={provider.baseURL} onChange={(event) => patchProvider(provider.id, { baseURL: event.target.value })} placeholder="https://api.openai.com/v1" />
                      <AgentConsoleFormField label="API Key" type="password" value={provider.apiKey ?? ''} onChange={(event) => patchProvider(provider.id, { apiKey: event.target.value })} placeholder="sk-..." />
                      <AgentConsoleFormField label="默认模型" value={provider.defaultModel ?? ''} onChange={(event) => patchProvider(provider.id, { defaultModel: event.target.value })} placeholder="gpt-5" />
                      <AgentConsoleSelectField label="API Mode" value={provider.apiKind} onChange={(event) => patchProvider(provider.id, { apiKind: event.target.value as ModelProviderAPIKind })}>
                        {API_KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </AgentConsoleSelectField>
                      {testResults[provider.id] ? <AgentConsoleCallout compact>{testResults[provider.id]}</AgentConsoleCallout> : null}
                    </AgentConsoleLocalToolFields>
                    <AgentConsoleLocalToolActions>
                      <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => testProvider(provider)}>
                        验证配置
                      </AgentConsoleActionButton>
                      <AgentConsoleActionButton type="button" size="sm" variant="outline" intent="danger" onClick={() => removeProvider(provider.id)}>
                        <Trash2 size={14} />
                        删除
                      </AgentConsoleActionButton>
                    </AgentConsoleLocalToolActions>
                  </AgentConsoleLocalToolCard>
                ))}
              </AgentConsoleGrid>
            </AgentConsoleStack>
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
    detail: '把 Catalog Entry 映射到 provider credential 或 route group。',
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

function normalizeWorkspaceModelProviders(config: MovScriptWorkspaceConfig): WorkspaceModelProvider[] {
  const providers = Array.isArray(config.modelProviders)
    ? config.modelProviders.map(modelProviderFromRecord).filter((provider): provider is WorkspaceModelProvider => Boolean(provider))
    : []
  return providers
}

function groupBackendModelProviders(models: PublicModel[]): BackendModelProvider[] {
  const providers = new Map<string, {
    label: string
    credentialId?: number
    models: PublicModel[]
    capabilities: Set<string>
  }>()
  for (const model of models) {
    const credentialId = typeof model.credential_id === 'number' ? model.credential_id : undefined
    const key = credentialId ? `backend:${credentialId}` : `backend:${model.provider_name ?? 'default'}`
    const current = providers.get(key) ?? {
      label: model.provider_name?.trim() || 'Backend Provider',
      ...(credentialId ? { credentialId } : {}),
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
      ...(provider.credentialId ? { credentialId: provider.credentialId } : {}),
      modelCount: provider.models.length,
      models: provider.models.map((model) => `${publicModelLabel(model)} (${publicModelId(model)})`),
      capabilities: Array.from(provider.capabilities).sort(),
      ...(defaultModel ? { defaultModel: `${publicModelLabel(defaultModel)} (${publicModelId(defaultModel)})` } : {}),
    }
  })
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
  return source === 'new_api' || source === 'new_api_group'
}

function modelProviderFromRecord(record: Record<string, unknown>): WorkspaceModelProvider | undefined {
  const id = stringField(record.id)
  if (!id) return undefined
  const apiKind = modelProviderAPIKind(stringField(record.apiKind))
  return {
    id,
    label: stringField(record.label) ?? id,
    baseURL: stringField(record.baseURL) ?? '',
    ...(stringField(record.apiKey) ? { apiKey: stringField(record.apiKey) } : {}),
    ...(stringField(record.defaultModel) ? { defaultModel: stringField(record.defaultModel) } : {}),
    apiKind,
    enabled: record.enabled !== false,
  }
}

function modelProviderToConfigRecord(provider: WorkspaceModelProvider): Record<string, unknown> {
  return {
    id: provider.id,
    label: provider.label,
    baseURL: provider.baseURL,
    ...(provider.apiKey?.trim() ? { apiKey: provider.apiKey.trim() } : {}),
    ...(provider.defaultModel?.trim() ? { defaultModel: provider.defaultModel.trim() } : {}),
    apiKind: provider.apiKind,
    enabled: provider.enabled,
  }
}

function modelProviderAPIKind(value: string | undefined): ModelProviderAPIKind {
  return value === 'openai_chat_completions' || value === 'anthropic_messages' ? value : 'openai_responses'
}

function modelProviderIsValid(provider: WorkspaceModelProvider): boolean {
  if (!provider.enabled) return true
  return isHTTPURL(provider.baseURL) && Boolean(provider.apiKey?.trim())
}

function isHTTPURL(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function uniqueProviderId(providers: WorkspaceModelProvider[]): string {
  const ids = new Set(providers.map((provider) => provider.id))
  let index = providers.length + 1
  let id = `provider-${index}`
  while (ids.has(id)) {
    index += 1
    id = `provider-${index}`
  }
  return id
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
