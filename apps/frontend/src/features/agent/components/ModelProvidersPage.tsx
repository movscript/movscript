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
  createAgentModelCatalogEntry,
  createAgentModelRouteBinding,
  deleteAgentModelRouteBinding,
  fetchAgentBackendModels,
  fetchAgentModelCatalogEntries,
  stringifyAgentModelSupportedParams,
  updateAgentModelCatalogEntry,
  updateAgentModelRouteBinding,
  type AgentModelCatalogEntry,
  type AgentModelCatalogEntryInput,
  type AgentModelRouteBinding,
  type AgentModelRouteBindingInput,
  type AgentModelRouteSourceType,
} from '@/features/agent/application/agentModelCatalogApi'
import { agentProviderKeys } from '@/features/agent/application/agentQueryKeys'
import { publicModelId, publicModelLabel } from '@/shared/domain/modelDisplay'
import { providerSessionClient, type MovScriptWorkspaceConfig } from '@/shared/infrastructure/providerSessionClient'
import type { ParamDef, PublicModel } from '@/types'

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
type CatalogDraft = {
  id?: number
  publicModelID: string
  providerModelID: string
  displayName: string
  shortName: string
  isEnabled: boolean
  capabilities: string[]
  pricingMode: string
  acceptsImage: boolean
  maxInputImages: string
  maxInputVideos: string
  imageEditField: string
  supportedParams: ParamDef[]
}
type RouteDraft = {
  id?: number
  catalogEntryId: string
  sourceType: AgentModelRouteSourceType
  routeGroup: string
  credentialID: string
  isEnabled: boolean
  priority: string
  capacityWeight: string
  maxConcurrency: string
}

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

type CatalogEntryTemplate = {
  id: string
  label: string
  draft: Omit<CatalogDraft, 'id'>
}

const CATALOG_CAPABILITY_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'reasoning', label: 'Reasoning' },
  { value: 'image', label: 'Image' },
  { value: 'image_edit', label: 'Image Edit' },
  { value: 'video', label: 'Video' },
  { value: 'video_i2v', label: 'I2V' },
  { value: 'video_v2v', label: 'V2V' },
  { value: 'audio_tts', label: 'TTS' },
  { value: 'audio_stt', label: 'STT' },
] as const

const CATALOG_PRICING_OPTIONS = [
  { value: '', label: '未设置' },
  { value: 'per_token', label: '按 Token' },
  { value: 'per_image', label: '按图片' },
  { value: 'per_second', label: '按秒' },
  { value: 'per_call', label: '按调用' },
]

const TEXT_PARAMS: ParamDef[] = [
  { key: 'temperature', label: 'Temperature', type: 'number', min: 0, max: 2, step: 0.1 },
  { key: 'top_p', label: 'Top P', type: 'number', min: 0, max: 1, step: 0.05 },
  { key: 'max_tokens', label: 'Max Tokens', type: 'number', min: 1, step: 1 },
  { key: 'response_format', label: 'Response Format', type: 'select', options: ['text', 'json_object'], default: 'text' },
]

const IMAGE_PARAMS: ParamDef[] = [
  { key: 'image_size', label: '画面尺寸', type: 'select', options: ['1024x1024', '1024x1536', '1536x1024'], default: '1024x1024' },
  { key: 'quality', label: '质量', type: 'select', options: ['low', 'medium', 'high'], default: 'medium' },
  { key: 'image_count', label: '生成张数', type: 'number', min: 1, max: 4, step: 1, default: 1 },
]

const VIDEO_PARAMS: ParamDef[] = [
  { key: 'duration', label: '时长(秒)', type: 'number', min: 1, max: 10, step: 1, default: 5 },
  { key: 'resolution', label: '分辨率', type: 'select', options: ['720p', '1080p'], default: '720p' },
  { key: 'aspect_ratio', label: '画面比例', type: 'select', options: ['16:9', '9:16', '1:1'], default: '16:9' },
]

const CATALOG_ENTRY_TEMPLATES: CatalogEntryTemplate[] = [
  {
    id: 'text-reasoning',
    label: '文本/推理',
    draft: {
      publicModelID: '',
      providerModelID: '',
      displayName: '',
      shortName: '',
      isEnabled: true,
      capabilities: ['text', 'reasoning'],
      pricingMode: 'per_token',
      acceptsImage: false,
      maxInputImages: '0',
      maxInputVideos: '0',
      imageEditField: '',
      supportedParams: TEXT_PARAMS,
    },
  },
  {
    id: 'openai-compatible-image',
    label: '图像生成',
    draft: {
      publicModelID: '',
      providerModelID: '',
      displayName: '',
      shortName: '',
      isEnabled: true,
      capabilities: ['image'],
      pricingMode: 'per_image',
      acceptsImage: false,
      maxInputImages: '0',
      maxInputVideos: '0',
      imageEditField: '',
      supportedParams: IMAGE_PARAMS,
    },
  },
  {
    id: 'image-edit',
    label: '图像编辑',
    draft: {
      publicModelID: '',
      providerModelID: '',
      displayName: '',
      shortName: '',
      isEnabled: true,
      capabilities: ['image_edit'],
      pricingMode: 'per_image',
      acceptsImage: true,
      maxInputImages: '1',
      maxInputVideos: '0',
      imageEditField: 'image[]',
      supportedParams: IMAGE_PARAMS,
    },
  },
  {
    id: 'video',
    label: '视频',
    draft: {
      publicModelID: '',
      providerModelID: '',
      displayName: '',
      shortName: '',
      isEnabled: true,
      capabilities: ['video'],
      pricingMode: 'per_second',
      acceptsImage: false,
      maxInputImages: '0',
      maxInputVideos: '0',
      imageEditField: '',
      supportedParams: VIDEO_PARAMS,
    },
  },
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
  const [catalogDraft, setCatalogDraft] = useState<CatalogDraft>(() => catalogDraftFromTemplate(CATALOG_ENTRY_TEMPLATES[0]))
  const [catalogSaveStatus, setCatalogSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [catalogSaveError, setCatalogSaveError] = useState<string | null>(null)
  const [routeDraft, setRouteDraft] = useState<RouteDraft>(() => routeDraftFromEntry())
  const [routeSaveStatus, setRouteSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'deleting'>('idle')
  const [routeSaveError, setRouteSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (workspaceConfigQuery.data) setProviders(normalizeWorkspaceModelProviders(workspaceConfigQuery.data))
  }, [workspaceConfigQuery.data])

  const backendProviders = useMemo(() => groupBackendModelProviders(backendModelsQuery.data ?? []), [backendModelsQuery.data])
  const catalogEntries = modelCatalogQuery.data ?? []
  const routeBindings = useMemo(() => flattenCatalogRouteBindings(catalogEntries), [catalogEntries])
  const localCredentialProviders = useMemo(() => backendProviders.filter((provider) => provider.credentialId), [backendProviders])
  const localOverrideCount = providers.filter((provider) => provider.enabled).length
  const enabledCount = backendProviders.length + localOverrideCount
  const invalidCount = providers.filter((provider) => provider.enabled && !modelProviderIsValid(provider)).length
  const canSave = invalidCount === 0

  useEffect(() => {
    if (!routeDraft.catalogEntryId && catalogEntries[0]) setRouteDraft(routeDraftFromEntry(catalogEntries[0], localCredentialProviders[0]))
  }, [catalogEntries, localCredentialProviders, routeDraft.catalogEntryId])

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

  function editCatalogEntry(entry: AgentModelCatalogEntry) {
    setCatalogDraft(catalogDraftFromEntry(entry))
    setCatalogSaveError(null)
    setCatalogSaveStatus('idle')
  }

  function newCatalogEntry(template: CatalogEntryTemplate = CATALOG_ENTRY_TEMPLATES[0]) {
    setCatalogDraft(catalogDraftFromTemplate(template))
    setCatalogSaveError(null)
    setCatalogSaveStatus('idle')
  }

  function patchCatalogDraft(patch: Partial<CatalogDraft>) {
    setCatalogDraft((current) => ({ ...current, ...patch }))
    setCatalogSaveError(null)
    setCatalogSaveStatus('idle')
  }

  function patchCatalogParam(index: number, patch: Partial<ParamDef>) {
    setCatalogDraft((current) => ({
      ...current,
      supportedParams: current.supportedParams.map((param, paramIndex) => paramIndex === index ? { ...param, ...patch } : param),
    }))
    setCatalogSaveError(null)
    setCatalogSaveStatus('idle')
  }

  function addCatalogParam() {
    setCatalogDraft((current) => ({
      ...current,
      supportedParams: [
        ...current.supportedParams,
        { key: 'custom_param', label: 'Custom Param', type: 'string' },
      ],
    }))
    setCatalogSaveError(null)
    setCatalogSaveStatus('idle')
  }

  function removeCatalogParam(index: number) {
    setCatalogDraft((current) => ({
      ...current,
      supportedParams: current.supportedParams.filter((_, paramIndex) => paramIndex !== index),
    }))
    setCatalogSaveError(null)
    setCatalogSaveStatus('idle')
  }

  async function saveCatalogEntry() {
    const input = catalogDraftToInput(catalogDraft)
    if (!input.public_model_id || !input.provider_model_id || catalogSaveStatus === 'saving') return
    setCatalogSaveStatus('saving')
    setCatalogSaveError(null)
    try {
      if (catalogDraft.id) {
        await updateAgentModelCatalogEntry(catalogDraft.id, input)
      } else {
        await createAgentModelCatalogEntry(input)
      }
      await modelCatalogQuery.refetch()
      setCatalogSaveStatus('saved')
      window.setTimeout(() => setCatalogSaveStatus('idle'), 1800)
    } catch (error) {
      setCatalogSaveStatus('idle')
      setCatalogSaveError(errorMessage(error))
    }
  }

  function editRouteBinding(entry: AgentModelCatalogEntry, binding: AgentModelRouteBinding) {
    setRouteDraft(routeDraftFromBinding(entry, binding))
    setRouteSaveError(null)
    setRouteSaveStatus('idle')
  }

  function newRouteBinding(entry: AgentModelCatalogEntry | undefined = catalogEntries[0]) {
    setRouteDraft(routeDraftFromEntry(entry, localCredentialProviders[0]))
    setRouteSaveError(null)
    setRouteSaveStatus('idle')
  }

  function patchRouteDraft(patch: Partial<RouteDraft>) {
    setRouteDraft((current) => ({ ...current, ...patch }))
    setRouteSaveError(null)
    setRouteSaveStatus('idle')
  }

  async function saveRouteBinding() {
    const catalogEntryId = Number(routeDraft.catalogEntryId)
    const input = routeDraftToInput(routeDraft)
    if (!catalogEntryId || !routeDraftIsComplete(routeDraft) || routeSaveStatus === 'saving') return
    setRouteSaveStatus('saving')
    setRouteSaveError(null)
    try {
      if (routeDraft.id) {
        await updateAgentModelRouteBinding(catalogEntryId, routeDraft.id, input)
      } else {
        await createAgentModelRouteBinding(catalogEntryId, input)
      }
      await modelCatalogQuery.refetch()
      setRouteSaveStatus('saved')
      window.setTimeout(() => setRouteSaveStatus('idle'), 1800)
    } catch (error) {
      setRouteSaveStatus('idle')
      setRouteSaveError(errorMessage(error))
    }
  }

  async function removeRouteBinding(entry: AgentModelCatalogEntry, binding: AgentModelRouteBinding) {
    if (routeSaveStatus === 'deleting') return
    setRouteSaveStatus('deleting')
    setRouteSaveError(null)
    try {
      await deleteAgentModelRouteBinding(entry.id, binding.id)
      await modelCatalogQuery.refetch()
      if (routeDraft.id === binding.id) newRouteBinding(catalogEntries.find((item) => item.id !== entry.id) ?? entry)
      setRouteSaveStatus('idle')
    } catch (error) {
      setRouteSaveStatus('idle')
      setRouteSaveError(errorMessage(error))
    }
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
              按 Provider/new-api、Catalog 和 Route 三层管理模型调用。Provider 保存认证和上游来源，Catalog 保存系统识别的模型身份，Route 决定请求实际落到本地 credential 还是 new-api group。
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
                社区版和商业版共用这三层：Provider/new-api 保存认证和上游来源，Catalog Entry 保存模型身份、能力和参数，Route 保存 Catalog 到 provider 或 new-api 分组的映射。
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
          title="Provider / new-api"
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
                Provider/new-api 是运行时来源层。社区版通常是固定 API Key 的 local provider；商业版在 new-api endpoint 下继续细分 group 和动态 key 策略。
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
                后端当前没有返回可用模型。请先配置 Provider/new-api，再创建 Catalog Entry 和 Route。
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
                  Catalog Entry 是系统识别模型的列表，两版保持一致。这里承载能力、supported params、输入要求和定价；它不表达使用哪个 key 或 new-api 分组。
                </AgentConsoleDescription>
                <AgentConsoleToolbar>
                  <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => newCatalogEntry()}>
                    <Plus size={14} />
                    新建目录项
                  </AgentConsoleActionButton>
                  <AgentConsoleStatusBadge intent="neutral" emphasis="soft">
                    semantic model identity
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
                    <AgentConsoleLocalToolActions>
                      <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => editCatalogEntry(entry)}>
                        编辑档案
                      </AgentConsoleActionButton>
                    </AgentConsoleLocalToolActions>
                  </AgentConsoleLocalToolCard>
                ))}
              </AgentConsoleGrid>
              <AgentConsoleLocalToolCard>
                <AgentConsoleLocalToolHeader>
                  <AgentConsoleLocalToolCopy>
                    <AgentConsoleLocalToolTitle>{catalogDraft.id ? '编辑 Catalog Entry' : '新建 Catalog Entry'}</AgentConsoleLocalToolTitle>
                    <AgentConsoleLocalToolDetail>
                      模板负责快速生成能力和参数，保存后 Catalog Entry 才成为系统识别模型的标准档案。
                    </AgentConsoleLocalToolDetail>
                  </AgentConsoleLocalToolCopy>
                  <AgentConsoleLocalToolControls>
                    {catalogSaveStatus === 'saved' ? <AgentConsoleSavedText>已保存</AgentConsoleSavedText> : null}
                    <AgentConsoleStatusBadge intent={catalogDraft.id ? 'success' : 'neutral'} emphasis="soft">
                      {catalogDraft.id ? `#${catalogDraft.id}` : 'draft'}
                    </AgentConsoleStatusBadge>
                  </AgentConsoleLocalToolControls>
                </AgentConsoleLocalToolHeader>
                <AgentConsoleLocalToolFields>
                  <AgentConsoleCallout compact>
                    模板：{CATALOG_ENTRY_TEMPLATES.map((template) => (
                      <AgentConsoleActionButton key={template.id} type="button" size="xs" variant="outline" onClick={() => newCatalogEntry(template)}>
                        {template.label}
                      </AgentConsoleActionButton>
                    ))}
                  </AgentConsoleCallout>
                  <AgentConsoleGrid columns="server">
                    <AgentConsoleFormField label="Public Model ID" value={catalogDraft.publicModelID} onChange={(event) => patchCatalogDraft({ publicModelID: event.target.value })} placeholder="gpt-4.1" />
                    <AgentConsoleFormField label="Provider Model ID" value={catalogDraft.providerModelID} onChange={(event) => patchCatalogDraft({ providerModelID: event.target.value })} placeholder="gpt-4.1" />
                    <AgentConsoleFormField label="显示名称" value={catalogDraft.displayName} onChange={(event) => patchCatalogDraft({ displayName: event.target.value })} placeholder="GPT-4.1" />
                    <AgentConsoleFormField label="短名称" value={catalogDraft.shortName} onChange={(event) => patchCatalogDraft({ shortName: event.target.value })} placeholder="4.1" />
                    <AgentConsoleSelectField label="计费模式" value={catalogDraft.pricingMode} onChange={(event) => patchCatalogDraft({ pricingMode: event.target.value })}>
                      {CATALOG_PRICING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </AgentConsoleSelectField>
                    <AgentConsoleFormField label="图片输入上限" type="number" value={catalogDraft.maxInputImages} onChange={(event) => patchCatalogDraft({ maxInputImages: event.target.value })} />
                    <AgentConsoleFormField label="视频输入上限" type="number" value={catalogDraft.maxInputVideos} onChange={(event) => patchCatalogDraft({ maxInputVideos: event.target.value })} />
                    <AgentConsoleFormField label="Image Edit Field" value={catalogDraft.imageEditField} onChange={(event) => patchCatalogDraft({ imageEditField: event.target.value })} placeholder="image[]" />
                  </AgentConsoleGrid>
                  <AgentConsoleCallout compact>
                    能力：{CATALOG_CAPABILITY_OPTIONS.map((option) => (
                      <label key={option.value} className="agent-console-inline-option">
                        <input
                          type="checkbox"
                          checked={catalogDraft.capabilities.includes(option.value)}
                          onChange={(event) => patchCatalogDraft({ capabilities: toggleString(catalogDraft.capabilities, option.value, event.target.checked) })}
                        />
                        {option.label}
                      </label>
                    ))}
                  </AgentConsoleCallout>
                  <AgentConsoleCallout compact>
                    <label className="agent-console-inline-option">
                      <input type="checkbox" checked={catalogDraft.isEnabled} onChange={(event) => patchCatalogDraft({ isEnabled: event.target.checked })} />
                      启用目录项
                    </label>
                    <label className="agent-console-inline-option">
                      <input type="checkbox" checked={catalogDraft.acceptsImage} onChange={(event) => patchCatalogDraft({ acceptsImage: event.target.checked })} />
                      接受图片输入
                    </label>
                  </AgentConsoleCallout>
                  <AgentConsoleStack>
                    <AgentConsoleIntroRow>
                      <AgentConsoleDescription>Supported Params</AgentConsoleDescription>
                      <AgentConsoleToolbar>
                        <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={addCatalogParam}>
                          <Plus size={14} />
                          添加参数
                        </AgentConsoleActionButton>
                      </AgentConsoleToolbar>
                    </AgentConsoleIntroRow>
                    {catalogDraft.supportedParams.length === 0 ? (
                      <AgentConsoleCallout compact>当前模板没有参数；文本模型可以保持为空，图像、视频、音频模型建议声明可交互参数。</AgentConsoleCallout>
                    ) : null}
                    {catalogDraft.supportedParams.map((param, index) => (
                      <AgentConsoleLocalToolCard key={`${index}:${param.key || 'param'}`}>
                        <AgentConsoleLocalToolFields>
                          <AgentConsoleGrid columns="server">
                            <AgentConsoleFormField label="Key" value={param.key} onChange={(event) => patchCatalogParam(index, { key: event.target.value })} />
                            <AgentConsoleFormField label="Label" value={param.label} onChange={(event) => patchCatalogParam(index, { label: event.target.value })} />
                            <AgentConsoleSelectField label="Type" value={param.type} onChange={(event) => patchCatalogParam(index, { type: event.target.value as ParamDef['type'] })}>
                              <option value="string">string</option>
                              <option value="number">number</option>
                              <option value="boolean">boolean</option>
                              <option value="select">select</option>
                            </AgentConsoleSelectField>
                            <AgentConsoleFormField label="Default" value={paramDefaultValue(param.default)} onChange={(event) => patchCatalogParam(index, { default: paramValueFromInput(event.target.value, param.type) })} />
                            <AgentConsoleFormField label="Options" value={param.options?.join(', ') ?? ''} onChange={(event) => patchCatalogParam(index, { options: stringList(event.target.value) })} placeholder="low, medium, high" />
                            <AgentConsoleFormField label="Min" type="number" value={param.min ?? ''} onChange={(event) => patchCatalogParam(index, { min: optionalNumber(event.target.value) })} />
                            <AgentConsoleFormField label="Max" type="number" value={param.max ?? ''} onChange={(event) => patchCatalogParam(index, { max: optionalNumber(event.target.value) })} />
                            <AgentConsoleFormField label="Step" type="number" value={param.step ?? ''} onChange={(event) => patchCatalogParam(index, { step: optionalNumber(event.target.value) })} />
                          </AgentConsoleGrid>
                        </AgentConsoleLocalToolFields>
                        <AgentConsoleLocalToolActions>
                          <AgentConsoleActionButton type="button" size="sm" variant="outline" intent="danger" onClick={() => removeCatalogParam(index)}>
                            <Trash2 size={14} />
                            删除参数
                          </AgentConsoleActionButton>
                        </AgentConsoleLocalToolActions>
                      </AgentConsoleLocalToolCard>
                    ))}
                  </AgentConsoleStack>
                  {catalogSaveError ? <AgentConsoleCallout tone="danger" compact>保存失败：{catalogSaveError}</AgentConsoleCallout> : null}
                </AgentConsoleLocalToolFields>
                <AgentConsoleLocalToolActions>
                  <AgentConsoleActionButton type="button" size="sm" onClick={() => void saveCatalogEntry()} disabled={catalogSaveStatus === 'saving' || !catalogDraft.publicModelID.trim() || !catalogDraft.providerModelID.trim()}>
                    <Save size={14} />
                    {catalogSaveStatus === 'saving' ? '保存中...' : catalogDraft.id ? '保存目录项' : '创建目录项'}
                  </AgentConsoleActionButton>
                </AgentConsoleLocalToolActions>
              </AgentConsoleLocalToolCard>
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
                  模型路由决定用户选择 Catalog Entry 后实际落到哪里。社区版路由到 local provider；商业版可以路由到 new-api 分组，并按用户、项目或 key 策略动态解析认证。
                </AgentConsoleDescription>
                <AgentConsoleToolbar>
                  <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => newRouteBinding()} disabled={catalogEntries.length === 0}>
                    <Plus size={14} />
                    新建路由
                  </AgentConsoleActionButton>
                  <AgentConsoleStatusBadge intent="neutral" emphasis="soft">
                    catalog 到 provider/group
                  </AgentConsoleStatusBadge>
                </AgentConsoleToolbar>
              </AgentConsoleIntroRow>
              {modelCatalogQuery.error ? <AgentConsoleInlineError>{errorMessage(modelCatalogQuery.error)}</AgentConsoleInlineError> : null}
              {!modelCatalogQuery.error && routeBindings.length === 0 ? (
                <AgentConsoleCallout tone="warning" compact>
                  当前没有模型路由。Catalog Entry 需要至少一条 local provider 或 new-api group 绑定后才能被调用。
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
                        <AgentConsoleStatusBadge intent={isNewAPIRoute(binding) ? 'success' : 'neutral'} emphasis="soft">
                          {isNewAPIRoute(binding) ? '商业版分组' : '社区版 provider'}
                        </AgentConsoleStatusBadge>
                      </AgentConsoleLocalToolControls>
                    </AgentConsoleLocalToolHeader>
                    <AgentConsoleLocalToolFields>
                      <AgentConsoleCallout compact>
                        Catalog：{entry.public_model_id} 到 {entry.provider_model_id}
                      </AgentConsoleCallout>
                      <AgentConsoleCallout compact>
                        Target：{isNewAPIRoute(binding) ? `new-api group ${binding.route_group}` : `credential ${binding.credential_id ?? '-'}`}
                      </AgentConsoleCallout>
                      <AgentConsoleCallout compact>
                        Priority：{binding.priority ?? 0} / Capacity：{binding.capacity_weight ?? 1} / Concurrency：{(binding.max_concurrency ?? 0) || '不限'}
                      </AgentConsoleCallout>
                    </AgentConsoleLocalToolFields>
                    <AgentConsoleLocalToolActions>
                      <AgentConsoleActionButton type="button" size="sm" variant="outline" onClick={() => editRouteBinding(entry, binding)}>
                        编辑路由
                      </AgentConsoleActionButton>
                      <AgentConsoleActionButton type="button" size="sm" variant="outline" intent="danger" onClick={() => void removeRouteBinding(entry, binding)} disabled={routeSaveStatus === 'deleting'}>
                        <Trash2 size={14} />
                        删除路由
                      </AgentConsoleActionButton>
                    </AgentConsoleLocalToolActions>
                  </AgentConsoleLocalToolCard>
                ))}
              </AgentConsoleGrid>
              <AgentConsoleLocalToolCard invalid={!routeDraftIsComplete(routeDraft)}>
                <AgentConsoleLocalToolHeader>
                  <AgentConsoleLocalToolCopy>
                    <AgentConsoleLocalToolTitle>{routeDraft.id ? '编辑模型路由' : '新建模型路由'}</AgentConsoleLocalToolTitle>
                    <AgentConsoleLocalToolDetail>
                      社区版路由到 local provider credential；商业版 new-api group 在商业控制台中维护。
                    </AgentConsoleLocalToolDetail>
                  </AgentConsoleLocalToolCopy>
                  <AgentConsoleLocalToolControls>
                    {routeSaveStatus === 'saved' ? <AgentConsoleSavedText>已保存</AgentConsoleSavedText> : null}
                    <AgentConsoleStatusBadge intent={routeDraft.id ? 'success' : 'neutral'} emphasis="soft">
                      {routeDraft.id ? `#${routeDraft.id}` : 'draft'}
                    </AgentConsoleStatusBadge>
                  </AgentConsoleLocalToolControls>
                </AgentConsoleLocalToolHeader>
                <AgentConsoleLocalToolFields>
                  <AgentConsoleGrid columns="server">
                    <AgentConsoleSelectField label="Catalog Entry" value={routeDraft.catalogEntryId} onChange={(event) => patchRouteDraft({ catalogEntryId: event.target.value })} disabled={Boolean(routeDraft.id)}>
                      <option value="">选择目录项</option>
                      {catalogEntries.map((entry) => (
                        <option key={entry.id} value={entry.id}>{entry.display_name || entry.public_model_id}</option>
                      ))}
                    </AgentConsoleSelectField>
                    <AgentConsoleSelectField label="Source Type" value={routeDraft.sourceType} onChange={(event) => patchRouteDraft({ sourceType: event.target.value as AgentModelRouteSourceType })}>
                      <option value="local_provider">Local Provider</option>
                    </AgentConsoleSelectField>
                    <AgentConsoleSelectField label="Local Credential" value={routeDraft.credentialID} onChange={(event) => patchRouteDraft({ credentialID: event.target.value })} disabled={isNewAPIRouteSource(routeDraft.sourceType)}>
                      <option value="">选择本地 Provider</option>
                      {localCredentialProviders.map((provider) => (
                        <option key={provider.id} value={provider.credentialId}>{provider.label} #{provider.credentialId}</option>
                      ))}
                    </AgentConsoleSelectField>
                    <AgentConsoleFormField label="New API Group" value={routeDraft.routeGroup} onChange={(event) => patchRouteDraft({ routeGroup: event.target.value })} placeholder="default / vip / image" disabled={!isNewAPIRouteSource(routeDraft.sourceType)} />
                    <AgentConsoleFormField label="Priority" type="number" value={routeDraft.priority} onChange={(event) => patchRouteDraft({ priority: event.target.value })} />
                    <AgentConsoleFormField label="Capacity Weight" type="number" value={routeDraft.capacityWeight} onChange={(event) => patchRouteDraft({ capacityWeight: event.target.value })} />
                    <AgentConsoleFormField label="Max Concurrency" type="number" value={routeDraft.maxConcurrency} onChange={(event) => patchRouteDraft({ maxConcurrency: event.target.value })} placeholder="0 表示不限" />
                  </AgentConsoleGrid>
                  <AgentConsoleCallout compact>
                    <label className="agent-console-inline-option">
                      <input type="checkbox" checked={routeDraft.isEnabled} onChange={(event) => patchRouteDraft({ isEnabled: event.target.checked })} />
                      启用路由
                    </label>
                  </AgentConsoleCallout>
                  <AgentConsoleCallout compact>
                    {routePreview(routeDraft, catalogEntries, localCredentialProviders)}
                  </AgentConsoleCallout>
                  {routeSaveError ? <AgentConsoleCallout tone="danger" compact>保存失败：{routeSaveError}</AgentConsoleCallout> : null}
                  {!routeDraftIsComplete(routeDraft) ? (
                    <AgentConsoleCallout tone="warning" compact>
                      请选择 Catalog Entry，并为 local provider 选择 credential，或为 new-api 填写 group。
                    </AgentConsoleCallout>
                  ) : null}
                </AgentConsoleLocalToolFields>
                <AgentConsoleLocalToolActions>
                  <AgentConsoleActionButton type="button" size="sm" onClick={() => void saveRouteBinding()} disabled={routeSaveStatus === 'saving' || routeSaveStatus === 'deleting' || !routeDraftIsComplete(routeDraft)}>
                    <Save size={14} />
                    {routeSaveStatus === 'saving' ? '保存中...' : routeDraft.id ? '保存路由' : '创建路由'}
                  </AgentConsoleActionButton>
                  {routeDraft.id ? (
                    <AgentConsoleActionButton
                      type="button"
                      size="sm"
                      variant="outline"
                      intent="danger"
                      onClick={() => {
                        const entry = catalogEntries.find((item) => item.id === Number(routeDraft.catalogEntryId))
                        const binding = entry?.route_bindings?.find((item) => item.id === routeDraft.id)
                        if (entry && binding) void removeRouteBinding(entry, binding)
                      }}
                      disabled={routeSaveStatus === 'deleting'}
                    >
                      <Trash2 size={14} />
                      删除当前路由
                    </AgentConsoleActionButton>
                  ) : null}
                </AgentConsoleLocalToolActions>
              </AgentConsoleLocalToolCard>
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
                  高级本地覆盖只保存在当前 runtime profile config 中，用于临时接入后端 AI Gateway 之外的模型服务。团队和正式环境应优先使用 Provider/new-api 配置和 Route。
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
    label: 'Provider / new-api',
    detail: '本地 provider credential、new-api endpoint/group 和上游认证来源。',
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
    detail: '把 Catalog Entry 映射到 provider 或 new-api group。',
    edition: '商业版更细',
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

function routeDraftFromEntry(entry?: AgentModelCatalogEntry, provider?: BackendModelProvider): RouteDraft {
  return {
    catalogEntryId: entry ? String(entry.id) : '',
    sourceType: 'local_provider',
    routeGroup: '',
    credentialID: provider?.credentialId ? String(provider.credentialId) : '',
    isEnabled: true,
    priority: '0',
    capacityWeight: '1',
    maxConcurrency: '0',
  }
}

function routeDraftFromBinding(entry: AgentModelCatalogEntry, binding: AgentModelRouteBinding): RouteDraft {
  return {
    id: binding.id,
    catalogEntryId: String(entry.id),
    sourceType: binding.source_type,
    routeGroup: binding.route_group ?? '',
    credentialID: binding.credential_id ? String(binding.credential_id) : '',
    isEnabled: binding.is_enabled,
    priority: String(binding.priority ?? 0),
    capacityWeight: String(binding.capacity_weight ?? 1),
    maxConcurrency: String(binding.max_concurrency ?? 0),
  }
}

function routeDraftToInput(draft: RouteDraft): AgentModelRouteBindingInput {
  const isNewAPI = isNewAPIRouteSource(draft.sourceType)
  return {
    source_type: isNewAPI ? 'new_api' : 'local_provider',
    ...(isNewAPI ? { route_group: draft.routeGroup.trim() } : {}),
    ...(!isNewAPI && optionalNumber(draft.credentialID) ? { credential_id: optionalNumber(draft.credentialID) } : {}),
    is_enabled: draft.isEnabled,
    priority: integerNumber(draft.priority, 0),
    capacity_weight: integerNumber(draft.capacityWeight, 1),
    max_concurrency: integerNumber(draft.maxConcurrency, 0),
  }
}

function routeDraftIsComplete(draft: RouteDraft): boolean {
  if (!Number(draft.catalogEntryId)) return false
  if (isNewAPIRouteSource(draft.sourceType)) return Boolean(draft.routeGroup.trim())
  return Boolean(Number(draft.credentialID))
}

function routePreview(draft: RouteDraft, entries: AgentModelCatalogEntry[], providers: BackendModelProvider[]): string {
  const entry = entries.find((item) => item.id === Number(draft.catalogEntryId))
  const entryLabel = entry?.display_name || entry?.public_model_id || 'Catalog Entry'
  if (isNewAPIRouteSource(draft.sourceType)) {
    return `${entryLabel} -> new-api group ${draft.routeGroup.trim() || '-'}`
  }
  const provider = providers.find((item) => item.credentialId === Number(draft.credentialID))
  return `${entryLabel} -> local provider ${provider?.label ?? 'credential'} #${draft.credentialID || '-'}`
}

function catalogDraftFromTemplate(template: CatalogEntryTemplate | undefined): CatalogDraft {
  const draft = template?.draft ?? CATALOG_ENTRY_TEMPLATES[0].draft
  return {
    ...draft,
    capabilities: [...draft.capabilities],
    supportedParams: cloneParams(draft.supportedParams),
  }
}

function catalogDraftFromEntry(entry: AgentModelCatalogEntry): CatalogDraft {
  return {
    id: entry.id,
    publicModelID: entry.public_model_id,
    providerModelID: entry.provider_model_id,
    displayName: entry.display_name,
    shortName: entry.short_name ?? '',
    isEnabled: entry.is_enabled,
    capabilities: catalogEntryCapabilities(entry),
    pricingMode: entry.pricing_mode ?? '',
    acceptsImage: Boolean(entry.accepts_image),
    maxInputImages: String(entry.max_input_images ?? 0),
    maxInputVideos: String(entry.max_input_videos ?? 0),
    imageEditField: entry.image_edit_field ?? '',
    supportedParams: parseSupportedParams(entry.supported_params),
  }
}

function catalogDraftToInput(draft: CatalogDraft): AgentModelCatalogEntryInput {
  return {
    public_model_id: draft.publicModelID.trim(),
    provider_model_id: draft.providerModelID.trim(),
    display_name: draft.displayName.trim() || draft.publicModelID.trim(),
    ...(draft.shortName.trim() ? { short_name: draft.shortName.trim() } : {}),
    is_enabled: draft.isEnabled,
    capabilities: draft.capabilities.join(','),
    ...(draft.pricingMode ? { pricing_mode: draft.pricingMode } : {}),
    accepts_image: draft.acceptsImage,
    max_input_images: positiveInteger(draft.maxInputImages),
    max_input_videos: positiveInteger(draft.maxInputVideos),
    ...(draft.imageEditField.trim() ? { image_edit_field: draft.imageEditField.trim() } : {}),
    supported_params: stringifyAgentModelSupportedParams(draft.supportedParams),
  }
}

function parseSupportedParams(value: string | undefined): ParamDef[] {
  if (!value?.trim()) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(paramDefFromUnknown).filter((param): param is ParamDef => Boolean(param))
  } catch {
    return []
  }
}

function paramDefFromUnknown(value: unknown): ParamDef | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const key = stringField(record.key)
  if (!key) return undefined
  const type = paramDefType(record.type)
  return {
    key,
    label: stringField(record.label) ?? key,
    type,
    ...(stringArray(record.options).length > 0 ? { options: stringArray(record.options) } : {}),
    ...(record.default !== undefined ? { default: paramValueFromInput(String(record.default), type) } : {}),
    ...(optionalNumber(record.min) !== undefined ? { min: optionalNumber(record.min) } : {}),
    ...(optionalNumber(record.max) !== undefined ? { max: optionalNumber(record.max) } : {}),
    ...(optionalNumber(record.step) !== undefined ? { step: optionalNumber(record.step) } : {}),
  }
}

function cloneParams(params: ParamDef[]): ParamDef[] {
  return params.map((param) => ({
    ...param,
    ...(param.options ? { options: [...param.options] } : {}),
  }))
}

function toggleString(values: string[], value: string, checked: boolean): string[] {
  if (checked) return values.includes(value) ? values : [...values, value]
  return values.filter((item) => item !== value)
}

function paramDefaultValue(value: ParamDef['default']): string {
  if (value === undefined) return ''
  return String(value)
}

function paramValueFromInput(value: string, type: ParamDef['type']): string | number | boolean | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (type === 'boolean') return trimmed === 'true'
  if (type === 'number') return Number(trimmed)
  return trimmed
}

function paramDefType(value: unknown): ParamDef['type'] {
  return value === 'number' || value === 'boolean' || value === 'select' ? value : 'string'
}

function optionalNumber(value: unknown): number | undefined {
  if (value === '' || value === undefined || value === null) return undefined
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function integerNumber(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function positiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean)
  if (typeof value === 'string') return stringList(value)
  return []
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
  if (isNewAPIRouteSource(source)) return 'New API Group'
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
