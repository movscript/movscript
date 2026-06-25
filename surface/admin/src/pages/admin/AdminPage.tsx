import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@admin/lib/api'
import type { AICredential, AIComboTemplate, AIComboTemplatesResponse, AIModelCatalogEntry, AIModelCatalogTemplate, AIModelImportApplyResult, AIModelImportModelPlan, AIModelImportPreviewResult, AIModelRouteBinding, AIProvider, AIProviderCredential, AIProviderTemplate, AIProviderTemplatesResponse, AIProvidersResponse, AdapterDef, PublicModel, ParamDef, ModelParamProfile, Project, User, RawResource, ResourceBinding, PaginatedResponse, ProviderInstance, ProviderInstanceConfigActivationResult, ProviderInstanceConfigApplyResult, ProviderInstanceConfigDraft, ProviderInstancesResponse } from '@admin/types'
import type { AgentCompactParamContract, ParamRuleTypeSummary } from '@admin/lib/modelParamContract'
import { useUserStore } from '@admin/store/userStore'
import { Plus, Trash2, ChevronDown, ChevronRight, Eye, EyeOff, ShieldAlert, ArrowLeft, Pencil, Check, X, RefreshCw, Sparkles, Copy, ArrowUpRight, Settings2, FolderKanban, HardDrive, CloudUpload, ScrollText, BarChart3, UsersRound, Building2, Bug, Download, Database, Route as RouteIcon, Search } from 'lucide-react'
import { cn } from '@admin/lib/utils'
import { Button } from '@movscript/ui/primitives'
import { Input } from '@movscript/ui/primitives'
import { Label } from '@movscript/ui/primitives'
import { Badge } from '@movscript/ui/primitives'
import { AppDataTableRow } from '@movscript/ui/business/app'
import { AppFeedbackText } from '@movscript/ui/business/app'
import { AppIconFrame } from '@movscript/ui/business/app'
import { AppInlineError } from '@movscript/ui/business/app'
import { AppMarkerDot } from '@movscript/ui/business/app'
import { AppRequiredMark } from '@movscript/ui/business/app'
import { AppStateMessage } from '@movscript/ui/business/app'
import { AppStatusSurface } from '@movscript/ui/business/app'
import { AppStatusToggleButton } from '@movscript/ui/business/app'
import { StatusBadge, type StatusBadgeProps } from '@movscript/ui/primitives'
import { ActiveOrgSelect } from '@admin/components/admin/ActiveOrgSelect'
import { ActiveUserSelect } from '@admin/components/admin/ActiveUserSelect'
import { CatalogParamBuilder } from '@admin/components/admin/CatalogParamBuilder'
import { PaginationControls } from '@admin/components/admin/PaginationControls'
import { runtimeCapabilities, runtimeOverviewCards, runtimeSectionCards } from '@admin-runtime'
import { useTranslation } from 'react-i18next'
import { translateAPIRequestError, translateApiError } from '@admin/lib/apiError'
import { publicModelLabel } from '@admin/lib/modelDisplay'
import {
  cloudFileConfigToggleConfirmKey,
  credentialToggleConfirmKey,
  nextCredentialEnabledState,
} from '@admin/lib/adminActionGuards'
import { emptyJobMonitorFilters, jobUrlSearchParams } from '@admin/lib/adminJobQueryParams'
import { auditLogsHref, relativePastDateInput, usageLogsHref } from '@admin/lib/adminLogQueryParams'
import { adminHref } from '@admin/lib/adminRoutes'
import { hasRelayGatewayProviderInstance } from '@admin/lib/adminRelayGatewayMode'
import { modelProviderAccountStartupInstances } from '@admin/lib/adminModelProviderInstances'
import { readListPayload, readNumberPayload, readRecordPayload } from '@admin/lib/listPayload'
import {
  emptyProjectListFilters,
  projectFiltersFromSearchParams,
  projectListHref,
  projectPageFromSearchParams,
  projectSearchParams,
  type ProjectListFilters,
} from '@admin/lib/adminProjectQueryParams'
import {
  emptyResourceListFilters,
  resourceFiltersFromSearchParams,
  resourceListHref,
  resourcePageFromSearchParams,
  resourceSearchParams,
  type ResourceListFilters,
} from '@admin/lib/adminResourceQueryParams'
import { userListHref } from '@admin/lib/adminUserQueryParams'
import {
  PARAM_TEMPLATES,
  adapterParamsForCapabilities,
  buildAgentCompactParamContract,
  buildParamContractAudit,
  emptyParamProfile,
  isProfileParamConfig,
  paramTemplateFor,
  parseModelParamProfile,
  parseParamDefs,
  serializeModelParamProfile,
  serializeParamDefs,
  splitOptions,
  summarizeParamRuleTypes,
} from '@admin/lib/modelParamContract'

// ── helpers ───────────────────────────────────────────────────────────────────

interface TestResult { success: boolean; message: string; latency_ms: number }

const HIDDEN_ADMIN_PROVIDER_ADAPTERS = new Set(['local'])

function adapterDisplayName(adapter: Pick<AdapterDef, 'adapter_type' | 'display_name'>, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`admin.adapters.${adapter.adapter_type}.name`, { defaultValue: adapter.display_name })
}

function adapterDescription(adapter: Pick<AdapterDef, 'adapter_type' | 'description'>, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`admin.adapters.${adapter.adapter_type}.description`, { defaultValue: adapter.description })
}

function selectableAdminProviderAdapters(adapters: AdapterDef[]): AdapterDef[] {
  return adapters.filter((adapter) => !HIDDEN_ADMIN_PROVIDER_ADAPTERS.has(adapter.adapter_type))
}

function credentialFieldLabel(key: string, fallback: string, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`admin.credentialFields.${key}`, { defaultValue: fallback })
}

type CatalogEntryForm = {
  public_model_id: string
  display_name: string
  short_name: string
  is_enabled: boolean
  capabilities: string[]
  accepts_image: boolean
  max_input_images: number
  max_input_videos: number
  image_edit_field: string
  supported_params: string
}

type CatalogRouteForm = {
  route_group: string
  provider_id: string
  adapter_type: string
  provider_model_id: string
  is_enabled: boolean
  priority: string
  capacity_weight: string
  max_concurrency: string
}

type RouteProviderOption = {
  provider_id: string
  display_name: string
  provider_type?: string
  profile?: string
  adapter_key: string
  default_adapter_type?: string
  provider_kind: string
  provider_category: string
  base_url_prefix?: string
  is_enabled: boolean
  legacy_credential_id?: number
}

type ProviderAssetSettings = {
  public_base_url?: string
  signing_secret?: string
  signing_secret_set: boolean
  ark_openapi_base_url?: string
  ark_region?: string
  ark_access_key_id?: string
  ark_secret_access_key?: string
  ark_secret_key_set: boolean
}

const emptyProviderAssetSettings: ProviderAssetSettings = {
  public_base_url: '',
  signing_secret: '',
  signing_secret_set: false,
  ark_openapi_base_url: 'https://ark.cn-beijing.volcengineapi.com',
  ark_region: 'cn-beijing',
  ark_access_key_id: '',
  ark_secret_access_key: '',
  ark_secret_key_set: false,
}

type ModelRouteGroup = {
  key: string
  entry: AIModelCatalogEntry
  routeGroup: string
  bindings: AIModelRouteBinding[]
}

function isValidInputLimit(value: number): boolean {
  return Number.isInteger(value) && value >= -1
}

function inputLimitErrors(maxInputImages: number, maxInputVideos: number, t: (key: string) => string): string[] {
  const errors: string[] = []
  if (!isValidInputLimit(maxInputImages)) errors.push(t('admin.models.maxImagesInvalid'))
  if (!isValidInputLimit(maxInputVideos)) errors.push(t('admin.models.maxVideosInvalid'))
  return errors
}

const disabledBaseRoutePaths = new Set(runtimeCapabilities.disabledBaseRoutes ?? [])

function adminBaseRouteDisabled(path: string): boolean {
  return disabledBaseRoutePaths.has(path)
}

function catalogEntryTemplateForm(patch: Partial<CatalogEntryForm>): CatalogEntryForm {
  return { ...emptyCatalogEntryForm(), ...patch }
}

function catalogEntryLabel(entry: AIModelCatalogEntry): string {
  return entry.display_name || entry.short_name || entry.public_model_id || `#${entry.ID}`
}

function catalogEntryDetail(entry: AIModelCatalogEntry): string {
  const capabilities = entry.capabilities.split(',').map((item) => item.trim()).filter(Boolean)
  const routeCount = entry.route_bindings?.length ?? 0
  return [
    entry.public_model_id,
    capabilities.length > 0 ? capabilities.join(', ') : '',
    `${routeCount} route${routeCount === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ')
}

function providerTemplateDefaultAdapter(template: AIProviderTemplate): string {
  return template.default_adapter_type || template.default_adapter_key || ''
}

function providerDefaultAdapter(provider: AIProvider | RouteProviderOption): string {
  return provider.default_adapter_type || provider.adapter_key || ''
}

function providerAccountKey(value: Pick<AIProvider | AIProviderTemplate | AIComboTemplate | RouteProviderOption, 'provider_kind'> & {
  provider_type?: string
  profile?: string
}): string {
  if (value.provider_type) return value.profile ? `${value.provider_type}/${value.profile}` : value.provider_type
  return value.provider_kind
}

function providerAccountLabel(value: Pick<AIProvider | AIProviderTemplate | AIComboTemplate | RouteProviderOption, 'provider_kind'> & {
  provider_type?: string
  profile?: string
}): string {
  if (value.provider_type) return value.profile ? `${value.provider_type} · ${value.profile}` : value.provider_type
  return value.provider_kind
}

// ── Step 1: Pick provider template ────────────────────────────────────────────

function ProviderTemplatePicker({
  templates,
  adapters,
  onPick,
  onCancel,
}: {
  templates: AIProviderTemplate[]
  adapters: AdapterDef[]
  onPick: (template: AIProviderTemplate) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const adapterByType = new Map(adapters.map((adapter) => [adapter.adapter_type, adapter]))
  const enabledTemplates = templates.filter((template) => template.is_enabled)

  return (
    <div className="border border-border rounded-lg p-4 bg-card space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{t('admin.credentials.selectProviderTemplate')}</p>
        <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">{t('common.cancel')}</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {enabledTemplates.map((template) => {
          const defaultAdapterType = providerTemplateDefaultAdapter(template)
          const adapter = adapterByType.get(defaultAdapterType)
          return (
            <button
              key={providerAccountKey(template)}
              onClick={() => onPick(template)}
              className="text-left border border-border rounded-lg bg-background px-3 py-2.5 hover:border-ring hover:shadow-sm transition-all space-y-0.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-foreground">{template.display_name || template.provider_kind}</p>
                <StatusBadge intent={template.provider_category === 'official_platform' ? 'success' : 'neutral'} className="text-[11px]">
                  {template.provider_category}
                </StatusBadge>
              </div>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{providerAccountLabel(template)}</p>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                {(adapter ? adapterDisplayName(adapter, t) : defaultAdapterType)} · {template.default_base_url_prefix || t('admin.credentials.customBaseURLRequired')}
              </p>
            </button>
          )
        })}
        {enabledTemplates.length === 0 && (
          <p className="col-span-2 rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
            {t('admin.credentials.noProviderTemplates')}
          </p>
        )}
      </div>
    </div>
  )
}

function ProviderModelImportWizard() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [displayName, setDisplayName] = useState('中转站')
  const [baseURL, setBaseURL] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [routeGroup, setRouteGroup] = useState('default')
  const [preview, setPreview] = useState<AIModelImportPreviewResult | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [result, setResult] = useState<AIModelImportApplyResult | null>(null)
  const [error, setError] = useState('')

  const providerPayload = () => {
    const providerKind = providerKindForImportBaseURL(baseURL)
    return {
      provider_kind: providerKind,
      display_name: displayNameForImportProvider(displayName, providerKind),
      base_url_prefix: baseURL.trim(),
      api_key: apiKey,
    }
  }

  const previewImport = useMutation({
    mutationFn: () => api.post('/admin/model-imports/preview', {
      provider: providerPayload(),
      route_group: routeGroup.trim() || 'default',
    }).then((r) => r.data as AIModelImportPreviewResult),
    onMutate: () => {
      setError('')
      setResult(null)
    },
    onSuccess: (data) => {
      setPreview(data)
      setSelected(Object.fromEntries(data.models.map((model) => [model.provider_model_id, model.recommended && model.status !== 'route_exists'])))
    },
    onError: (err: any) => setError(translateAPIRequestError(err)),
  })

  const applyImport = useMutation({
    mutationFn: () => {
      const models = (preview?.models ?? [])
        .filter((model) => selected[model.provider_model_id])
        .map((model) => ({
          provider_model_id: model.provider_model_id,
          public_model_id: model.public_model_id,
          display_name: model.display_name,
          capabilities: model.capabilities,
          template_id: model.template_id,
        }))
      return api.post('/admin/model-imports/apply', {
        provider: providerPayload(),
        route_group: routeGroup.trim() || preview?.route_group || 'default',
        models,
      }).then((r) => r.data as AIModelImportApplyResult)
    },
    onMutate: () => setError(''),
    onSuccess: (data) => {
      setResult(data)
      setApiKey('')
      qc.invalidateQueries({ queryKey: ['admin', 'providers'] })
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      qc.invalidateQueries({ queryKey: ['admin', 'model-catalog'] })
    },
    onError: (err: any) => setError(translateAPIRequestError(err)),
  })

  const models = preview?.models ?? []
  const selectedCount = models.filter((model) => selected[model.provider_model_id]).length
  const canPreview = Boolean(baseURL.trim() && apiKey.trim())
  const canApply = Boolean(preview && selectedCount > 0 && !applyImport.isPending)

  return (
    <div className="rounded-lg border border-border bg-card">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">从 /v1/models 一键导入</p>
          <p className="mt-1 text-xs text-muted-foreground">添加 OpenAI-compatible 中转站，预览上游模型，并批量创建 Catalog 与 Route。</p>
        </div>
        <ChevronDown size={16} className={cn('shrink-0 text-muted-foreground transition-transform', open ? 'rotate-180' : '')} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-border p-4">
          {error && <AppInlineError>{error}</AppInlineError>}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Provider 名称</Label>
              <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Route Group</Label>
              <Input value={routeGroup} onChange={(event) => setRouteGroup(event.target.value)} placeholder="default" className="h-8 text-xs" />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Base URL</Label>
              <Input value={baseURL} onChange={(event) => setBaseURL(event.target.value)} placeholder="https://gateway.example.com/v1" className="h-8 text-xs font-mono" />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">API Key</Label>
              <Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-..." className="h-8 text-xs font-mono" />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => previewImport.mutate()} disabled={!canPreview || previewImport.isPending}>
                <RefreshCw size={14} className={cn('mr-1.5', previewImport.isPending ? 'animate-spin' : '')} />
                {previewImport.isPending ? '获取中' : '测试并获取模型'}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => applyImport.mutate()} disabled={!canApply}>
                <Sparkles size={14} className="mr-1.5" />
                {applyImport.isPending ? '导入中' : `导入选中 ${selectedCount} 个`}
              </Button>
            </div>
            {preview && <p className="text-xs text-muted-foreground">共 {preview.summary.total} 个，建议导入 {preview.summary.recommended} 个</p>}
          </div>
          {models.length > 0 && (
            <div className="max-h-80 overflow-auto rounded-md border border-border">
              <div className="grid grid-cols-[32px_minmax(160px,1fr)_minmax(140px,1fr)_110px_100px] gap-2 border-b border-border bg-muted/30 px-3 py-2 text-[11px] font-medium uppercase text-muted-foreground">
                <span />
                <span>Provider Model</span>
                <span>Public Model</span>
                <span>Capabilities</span>
                <span>Status</span>
              </div>
              <div className="divide-y divide-border">
                {models.map((model) => (
                  <ModelImportPreviewRow
                    key={model.provider_model_id}
                    model={model}
                    checked={Boolean(selected[model.provider_model_id])}
                    onCheckedChange={(checked) => setSelected((current) => ({ ...current, [model.provider_model_id]: checked }))}
                  />
                ))}
              </div>
            </div>
          )}
          {result && (
            <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">导入完成：</span>
              创建 Catalog {result.summary.created_catalog_entries} 个，复用 {result.summary.reused_catalog_entries} 个；创建 Route {result.summary.created_route_bindings} 条，跳过 {result.summary.skipped_route_bindings} 条。
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function providerKindForImportBaseURL(baseURL: string): string {
  try {
    const parsed = new URL(baseURL.trim())
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'api.apiyi.com' || host === 'apiyi.com' || host.endsWith('.apiyi.com')) {
      return 'apiyi_gateway'
    }
  } catch {
    // Keep partial input editable; the backend still performs final normalization.
  }
  return 'openai_compat_gateway'
}

function displayNameForImportProvider(displayName: string, providerKind: string): string {
  const value = displayName.trim()
  if (value && !(value === '中转站' && providerKind === 'apiyi_gateway')) {
    return value
  }
  if (providerKind === 'apiyi_gateway') return 'APIyi 聚合网关'
  return '中转站'
}

function ModelImportPreviewRow({
  model,
  checked,
  onCheckedChange,
}: {
  model: AIModelImportModelPlan
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const disabled = model.status === 'route_exists'
  const templateOnly = model.template_source_status === 'template_only'
  return (
    <label className={cn('grid grid-cols-[32px_minmax(160px,1fr)_minmax(140px,1fr)_110px_100px] gap-2 px-3 py-2 text-xs', disabled ? 'text-muted-foreground' : 'text-foreground')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onCheckedChange(event.target.checked)} className="mt-0.5" />
      <span className="min-w-0 truncate font-mono">{model.provider_model_id}</span>
      <span className="min-w-0 truncate font-mono">{model.public_model_id}</span>
      <span className="min-w-0 truncate">{model.capabilities.join(', ') || 'text'}</span>
      <span className="min-w-0 truncate">
        {templateOnly ? '待适配' : modelImportStatusLabel(model.status)}
        {model.diagnostics?.length ? <span className="mt-1 block truncate text-[11px] text-muted-foreground">{model.diagnostics[0]}</span> : null}
      </span>
    </label>
  )
}

function modelImportStatusLabel(status: string): string {
  switch (status) {
    case 'route_exists':
      return 'Route 已存在'
    case 'catalog_exists':
      return '复用 Catalog'
    default:
      return '新建'
  }
}

// ── Step 2: Fill credential fields ───────────────────────────────────────────

function CredentialForm({
  adapter,
  providerTemplate,
  relayGatewayMode = false,
  onBack,
  onSuccess,
}: {
  adapter: AdapterDef
  providerTemplate?: AIProviderTemplate | null
  relayGatewayMode?: boolean
  onBack: () => void
  onSuccess: (adapterType: string) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [displayName, setDisplayName] = useState(() => providerTemplate?.display_name || adapterDisplayName(adapter, t))
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const initialFields: Record<string, string> = {}
    if (providerTemplate?.default_base_url_prefix) initialFields.base_url = providerTemplate.default_base_url_prefix
    return initialFields
  })
  const [testState, setTestState] = useState<{ loading: boolean; result: TestResult | null }>({ loading: false, result: null })
  const [filesAPIEnabled, setFilesAPIEnabled] = useState(false)
  const [filesAPIBaseURL, setFilesAPIBaseURL] = useState('')
  const [filesAPIKey, setFilesAPIKey] = useState('')

  const create = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post(providerTemplate ? '/admin/providers' : '/admin/credentials', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      qc.invalidateQueries({ queryKey: ['admin', 'provider-instances'] })
      qc.invalidateQueries({ queryKey: ['admin', 'providers'] })
      onSuccess(providerTemplate ? providerTemplateDefaultAdapter(providerTemplate) : adapter.adapter_type)
    },
  })

  function buildPayload() {
    const credentials = relayGatewayMode ? {} : { ...fields }
    const baseURLPrefix = providerTemplate
      ? String((credentials as Record<string, string>).base_url ?? providerTemplate.default_base_url_prefix ?? '').trim()
      : ''
    if (providerTemplate) {
      if (baseURLPrefix) (credentials as Record<string, string>).base_url = baseURLPrefix
      const base: Record<string, unknown> = {
        provider_type: providerTemplate.provider_type,
        profile: providerTemplate.profile,
        provider_kind: providerTemplate.provider_kind,
        display_name: displayName,
        base_url_prefix: baseURLPrefix,
        credentials,
      }
      if (!relayGatewayMode && adapter.supports_files_api) {
        base.files_api_enabled = filesAPIEnabled
        if (filesAPIBaseURL) base.files_api_base_url = filesAPIBaseURL
        if (filesAPIKey) base.files_api_key = filesAPIKey
      }
      return base
    }
    const base: Record<string, unknown> = {
      adapter_type: adapter.adapter_type,
      display_name: displayName,
      credentials,
    }
    if (!relayGatewayMode && adapter.supports_files_api) {
      base.files_api_enabled = filesAPIEnabled
      if (filesAPIBaseURL) base.files_api_base_url = filesAPIBaseURL
      if (filesAPIKey) base.files_api_key = filesAPIKey
    }
    return base
  }

  async function handleCreateAndTest() {
    setTestState({ loading: true, result: null })
    try {
      await api.post(providerTemplate ? '/admin/providers' : '/admin/credentials', { ...buildPayload(), require_test_success: true }).then((r) => r.data)
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      qc.invalidateQueries({ queryKey: ['admin', 'provider-instances'] })
      qc.invalidateQueries({ queryKey: ['admin', 'providers'] })
      setTestState({ loading: false, result: { success: true, message: '连接正常', latency_ms: 0 } })
      onSuccess(providerTemplate ? providerTemplateDefaultAdapter(providerTemplate) : adapter.adapter_type)
    } catch (e: any) {
      setTestState({
        loading: false,
        result: e?.response?.data?.test_result ?? { success: false, message: translateAPIRequestError(e), latency_ms: 0 },
      })
    }
  }

  const keyFields = adapter.cred_fields.filter((f) => f.key !== 'base_url')
  const baseURLField = adapter.cred_fields.find((f) => f.key === 'base_url')

  return (
    <div className="border border-border rounded-lg p-4 bg-card space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft size={15} />
        </button>
        <p className="text-sm font-medium">
          {providerTemplate
            ? t('admin.credentials.configureProvider', { name: providerTemplate.display_name || providerTemplate.provider_kind })
            : t('admin.credentials.configureAdapter', { name: adapterDisplayName(adapter, t) })}
        </p>
      </div>

      <Input
        placeholder={t('agents.displayNameOptional')}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />

      {relayGatewayMode && (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {t('admin.credentials.relayGatewayCredentialHint')}
        </div>
      )}

      {!relayGatewayMode && baseURLField && (
        <div>
          <Label className="text-xs text-muted-foreground block mb-1">
            {credentialFieldLabel(baseURLField.key, baseURLField.label, t)}{baseURLField.required && <AppRequiredMark />}
          </Label>
          <Input
            placeholder={providerTemplate?.default_base_url_prefix || adapter.default_base_url || baseURLField.hint || ''}
            value={fields['base_url'] ?? ''}
            onChange={(e) => setFields((f) => ({ ...f, base_url: e.target.value }))}
          />
        </div>
      )}

      {!relayGatewayMode && keyFields.map((field) => (
        <div key={field.key}>
          <Label className="text-xs text-muted-foreground block mb-1">
            {credentialFieldLabel(field.key, field.label, t)}{field.required && <AppRequiredMark />}
          </Label>
          <Input
            type="password"
            placeholder={field.hint ?? ''}
            value={fields[field.key] ?? ''}
            onChange={(e) => setFields((f) => ({ ...f, [field.key]: e.target.value }))}
          />
        </div>
      ))}

      {create.isError && (
        <AppFeedbackText>{translateApiError((create.error as any)?.response?.data)}</AppFeedbackText>
      )}
      {testState.result && (
        <AppFeedbackText tone={testState.result.success ? 'neutral' : 'danger'}>
          {testState.result.success
            ? t('admin.credentials.connectionOk', { latency: testState.result.latency_ms })
            : `✗ ${testState.result.message}`}
        </AppFeedbackText>
      )}

      {/* Files API — shown only for adapters that support it */}
      {!relayGatewayMode && adapter.supports_files_api && (
        <div className="border border-border rounded-lg p-3 space-y-2 bg-background">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filesAPIEnabled}
                onChange={(e) => setFilesAPIEnabled(e.target.checked)}
                className="rounded"
              />
              <span className="font-medium">{t('admin.credentials.enableFilesAPI')}</span>
            </label>
            <span className="text-xs text-muted-foreground">{t('admin.credentials.filesAPIHint')}</span>
          </div>
          {filesAPIEnabled && (
            <div className="space-y-2 pt-1">
              <div>
                <Label className="text-xs text-muted-foreground block mb-1">{t('admin.credentials.filesAPIBaseURL')}</Label>
                <Input
                  placeholder={fields['base_url'] || adapter.default_base_url || 'https://api.x.ai/v1'}
                  value={filesAPIBaseURL}
                  onChange={(e) => setFilesAPIBaseURL(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground block mb-1">{t('admin.credentials.filesAPIKey')}</Label>
                <Input
                  type="password"
                  placeholder={t('admin.credentials.filesAPIKeyPlaceholder')}
                  value={filesAPIKey}
                  onChange={(e) => setFilesAPIKey(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {!relayGatewayMode && (
          <button
            onClick={handleCreateAndTest}
            disabled={create.isPending || testState.loading}
            className="flex-1 bg-primary text-primary-foreground rounded px-4 py-2 text-sm hover:bg-primary/90 disabled:opacity-50"
        >
          {testState.loading ? t('admin.credentials.testing') : (providerTemplate ? t('admin.credentials.createProviderAndTest') : t('admin.credentials.createAndTest'))}
        </button>
      )}
      <Button
        onClick={() => create.mutate(buildPayload())}
        disabled={create.isPending || testState.loading}
        className={relayGatewayMode ? 'flex-1' : undefined}
      >
        {create.isPending ? '…' : (providerTemplate ? t('admin.credentials.createProvider') : (relayGatewayMode ? t('admin.credentials.createRouteShell') : t('admin.credentials.createDirectly')))}
      </Button>
        <Button variant="outline" onClick={onBack}>
          {t('common.back')}
        </Button>
      </div>
    </div>
  )
}

function ModelCatalogSection({ credentials }: { credentials: AICredential[] }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [catalogForm, setCatalogForm] = useState<CatalogEntryForm>(() => emptyCatalogEntryForm())
  const [editingCatalogId, setEditingCatalogId] = useState<number | null>(null)
  const [remoteCredentialId, setRemoteCredentialId] = useState(() => credentials.find((credential) => credential.is_enabled)?.ID ? String(credentials.find((credential) => credential.is_enabled)?.ID) : '')
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateLab, setTemplateLab] = useState('')
  const [appliedCatalogTemplate, setAppliedCatalogTemplate] = useState<AIModelCatalogTemplate | null>(null)
  const [catalogError, setCatalogError] = useState('')
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogCapability, setCatalogCapability] = useState('all')
  const [catalogStatus, setCatalogStatus] = useState<ModelCatalogStatusFilter>('all')
  const [catalogRouteFilter, setCatalogRouteFilter] = useState<ModelCatalogRouteFilter>('all')
  const [catalogPage, setCatalogPage] = useState(1)
  const [catalogPageSize, setCatalogPageSize] = useState(MODEL_ADMIN_PAGE_SIZE)

  const catalogQuery = useQuery<AIModelCatalogEntry[]>({
    queryKey: ['admin', 'model-catalog'],
    queryFn: () => api.get('/admin/model-catalog').then((r) => readListPayload<AIModelCatalogEntry>(r.data)),
  })
  const catalogTemplatesQuery = useQuery<AIModelCatalogTemplate[]>({
    queryKey: ['admin', 'model-catalog-templates'],
    queryFn: () => api.get('/admin/model-catalog/templates').then((r) => readListPayload<AIModelCatalogTemplate>(r.data)),
  })
  const entries = catalogQuery.data ?? []
  const catalogTemplates = catalogTemplatesQuery.data ?? []
  const templateLabOptions = useMemo(
    () => Array.from(new Set(catalogTemplates.map((template) => template.lab).filter(Boolean))).sort(),
    [catalogTemplates],
  )
  const filteredCatalogTemplates = useMemo(
    () => filterCatalogTemplates(catalogTemplates, templateSearch, templateLab).slice(0, 24),
    [catalogTemplates, templateSearch, templateLab],
  )
  const localProviders = useMemo(
    () => credentials.filter((credential) => credential.is_enabled),
    [credentials],
  )
  const catalogCapabilityOptions = useMemo(
    () => Array.from(new Set(entries.flatMap((entry) => modelCatalogCapabilities(entry)))).sort(),
    [entries],
  )
  const filteredEntries = useMemo(() => entries.filter((entry) => {
    if (catalogStatus === 'enabled' && !entry.is_enabled) return false
    if (catalogStatus === 'disabled' && entry.is_enabled) return false
    if (catalogCapability !== 'all' && !modelCatalogCapabilities(entry).includes(catalogCapability)) return false
    if (catalogRouteFilter === 'with-routes' && (entry.route_bindings ?? []).length === 0) return false
    if (catalogRouteFilter === 'missing-routes' && (entry.route_bindings ?? []).length > 0) return false
    return modelAdminTextMatches(catalogSearch, [
      entry.public_model_id,
      entry.display_name,
      entry.short_name,
      entry.capabilities,
      ...(entry.route_bindings ?? []).map((binding) => binding.provider_model_id),
    ])
  }), [catalogCapability, catalogRouteFilter, catalogSearch, catalogStatus, entries])
  const catalogPagination = modelAdminPaginationSlice(filteredEntries, catalogPage, catalogPageSize)

  useEffect(() => {
    if (!remoteCredentialId && localProviders[0]?.ID) {
      setRemoteCredentialId(String(localProviders[0].ID))
    }
  }, [localProviders, remoteCredentialId])

  useEffect(() => {
    setCatalogPage(1)
  }, [catalogSearch, catalogCapability, catalogStatus, catalogRouteFilter, catalogPageSize])

  const remoteModelsQuery = useQuery<string[]>({
    queryKey: ['admin', 'credentials', remoteCredentialId, 'remote-models'],
    queryFn: () => remoteCredentialId
      ? api.get(`/admin/credentials/${remoteCredentialId}/remote-models`).then((r) => readListPayload<string>(r.data))
      : Promise.resolve([]),
    enabled: false,
  })

  const saveCatalogEntry = useMutation({
    mutationFn: ({ id, form }: { id?: number; form: CatalogEntryForm }) => {
      const payload = catalogEntryPayload(form)
      return id
        ? api.put(`/admin/model-catalog/${id}`, payload).then((r) => r.data)
        : api.post('/admin/model-catalog', payload).then((r) => r.data)
    },
    onMutate: () => setCatalogError(''),
    onSuccess: () => {
      setCatalogError('')
      setEditingCatalogId(null)
      setCatalogForm(emptyCatalogEntryForm())
      setAppliedCatalogTemplate(null)
      qc.invalidateQueries({ queryKey: ['admin', 'model-catalog'] })
    },
    onError: (err: any) => setCatalogError(translateAPIRequestError(err)),
  })

  const deleteCatalogEntry = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/model-catalog/${id}`),
    onMutate: () => setCatalogError(''),
    onSuccess: () => {
      setCatalogError('')
      setEditingCatalogId(null)
      setAppliedCatalogTemplate(null)
      qc.invalidateQueries({ queryKey: ['admin', 'model-catalog'] })
    },
    onError: (err: any) => setCatalogError(translateAPIRequestError(err)),
  })

  function startEdit(entry: AIModelCatalogEntry) {
    setEditingCatalogId(entry.ID)
    setCatalogForm(catalogEntryFormFromEntry(entry))
    setAppliedCatalogTemplate(null)
  }

  function cancelEdit() {
    setEditingCatalogId(null)
    setCatalogForm(emptyCatalogEntryForm())
    setAppliedCatalogTemplate(null)
  }

  function toggleCatalogCapability(capability: string) {
    const next = catalogForm.capabilities.includes(capability)
      ? catalogForm.capabilities.filter((item) => item !== capability)
      : [...catalogForm.capabilities, capability]
    setCatalogForm({ ...catalogForm, capabilities: next })
  }

  function importRemoteModel(modelID: string) {
    const imported = catalogEntryTemplateForm({
      public_model_id: modelID,
      display_name: modelID,
      short_name: modelID,
      capabilities: ['text'],
    })
    setEditingCatalogId(null)
    setCatalogForm(imported)
    setAppliedCatalogTemplate(null)
  }

  function applyCatalogTemplate(template: AIModelCatalogTemplate) {
    setEditingCatalogId(null)
    setCatalogForm(catalogEntryFormFromTemplate(template))
    setAppliedCatalogTemplate(template)
  }

  const catalogInputErrors = inputLimitErrors(catalogForm.max_input_images, catalogForm.max_input_videos, t)
  const canSaveCatalog = catalogForm.public_model_id.trim() && catalogInputErrors.length === 0

  return (
    <div className="space-y-4">
      <details className="rounded-lg border border-border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">导入模型</summary>
        <div className="border-t border-border p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">从 Provider 获取模型 ID</p>
              <p className="mt-1 text-xs text-muted-foreground">Catalog 负责把 provider 返回的 model id 纳入 MovScript 模型列表；线路绑定在 Route 页维护。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={remoteCredentialId} onChange={(event) => setRemoteCredentialId(event.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                <option value="">选择 Provider</option>
                {localProviders.map((credential) => (
                  <option key={credential.ID} value={credential.ID}>{credential.display_name}</option>
                ))}
              </select>
              <Button type="button" variant="outline" size="sm" disabled={!remoteCredentialId || remoteModelsQuery.isFetching} onClick={() => remoteModelsQuery.refetch()}>
                {remoteModelsQuery.isFetching ? '获取中' : '获取模型'}
              </Button>
            </div>
          </div>
          {remoteModelsQuery.error && <AppInlineError className="mt-3">{translateAPIRequestError(remoteModelsQuery.error)}</AppInlineError>}
          {(remoteModelsQuery.data ?? []).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(remoteModelsQuery.data ?? []).map((modelID) => (
                <button
                  key={modelID}
                  type="button"
                  onClick={() => importRemoteModel(modelID)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs font-mono text-muted-foreground hover:border-ring hover:text-foreground"
                >
                  {modelID}
                </button>
              ))}
            </div>
          )}
        </div>
      </details>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <ModelAdminSearchInput value={catalogSearch} onChange={setCatalogSearch} placeholder="搜索 model id、显示名、provider model..." />
              <select value={catalogCapability} onChange={(event) => setCatalogCapability(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
                <option value="all">全部能力</option>
                {catalogCapabilityOptions.map((capability) => <option key={capability} value={capability}>{capability}</option>)}
              </select>
              <select value={catalogStatus} onChange={(event) => setCatalogStatus(event.target.value as ModelCatalogStatusFilter)} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
                <option value="all">全部状态</option>
                <option value="enabled">已启用</option>
                <option value="disabled">已禁用</option>
              </select>
              <select value={catalogRouteFilter} onChange={(event) => setCatalogRouteFilter(event.target.value as ModelCatalogRouteFilter)} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
                <option value="all">全部路由</option>
                <option value="with-routes">已有路由</option>
                <option value="missing-routes">缺少路由</option>
              </select>
              <ModelAdminPageSizeSelect value={catalogPageSize} onChange={setCatalogPageSize} />
            </div>
          </div>

          <div className="grid gap-3">
            {catalogQuery.error && <AppInlineError>{translateAPIRequestError(catalogQuery.error)}</AppInlineError>}
            {filteredEntries.length === 0 && !catalogQuery.isLoading && (
              <p className="rounded-lg border border-border bg-background p-6 text-center text-sm text-muted-foreground">{t('admin.modelCatalog.empty')}</p>
            )}
            {catalogPagination.items.map((entry) => (
              <div key={entry.ID} className="rounded-lg border border-border bg-background p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{catalogEntryLabel(entry)}</p>
                      <StatusBadge intent={entry.is_enabled ? 'success' : 'neutral'}>{entry.is_enabled ? t('admin.modelCatalog.enabled') : t('admin.modelCatalog.disabled')}</StatusBadge>
                      <span className="text-xs text-muted-foreground font-mono">{entry.public_model_id}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{catalogEntryDetail(entry)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => startEdit(entry)}>{t('common.edit')}</Button>
                    <Button type="button" variant="ghost" size="sm" intent="danger" onClick={() => {
                      if (window.confirm(t('admin.modelCatalog.confirmDelete', { name: catalogEntryLabel(entry) }))) deleteCatalogEntry.mutate(entry.ID)
                    }}>
                      {t('common.delete')}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {modelCatalogCapabilities(entry).map((capability) => (
                    <StatusBadge key={capability} intent={CAPABILITY_STATUS_INTENT[capability] ?? 'neutral'} className="text-xs">
                      {t(CAPABILITY_TRANSLATION_KEYS[capability] ?? capability)}
                    </StatusBadge>
                  ))}
                </div>
                <div className="rounded-md border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">{t('admin.modelCatalog.routes')}</p>
                    <span className="text-xs text-muted-foreground">在 Route 页维护</span>
                  </div>
                  <div className="divide-y divide-border">
                    {(entry.route_bindings ?? []).length === 0 ? (
                      <p className="px-3 py-3 text-xs text-muted-foreground">{t('admin.modelCatalog.noRoutes')}</p>
                    ) : (entry.route_bindings ?? []).map((binding) => (
                      <div key={binding.ID} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{binding.source_type === 'relay_gateway' ? t('admin.modelCatalog.relayGatewayRoute') : t('admin.modelCatalog.localProviderRoute')}</p>
                            <p className="truncate text-muted-foreground">
                              {binding.source_type === 'relay_gateway'
                                ? binding.route_group
                                : `${binding.provider_id || '-'}${binding.route_group ? ` · group ${binding.route_group}` : ''}`} · priority {binding.priority ?? 0} · capacity {binding.capacity_weight ?? 1}
                            </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {filteredEntries.length > 0 && (
              <PaginationControls page={catalogPagination.page} pageCount={catalogPagination.pageCount} pageSize={catalogPageSize} total={filteredEntries.length} onPageChange={setCatalogPage} disabled={catalogQuery.isFetching} />
            )}
          </div>
        </div>

        <aside className="space-y-3 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{editingCatalogId ? t('admin.modelCatalog.editTitle') : t('admin.modelCatalog.createTitle')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('admin.modelCatalog.formHint')}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {editingCatalogId && (
                  <Button type="button" variant="outline" size="sm" onClick={cancelEdit}>{t('common.cancel')}</Button>
                )}
              </div>
            </div>
            {catalogError && <AppInlineError>{catalogError}</AppInlineError>}
            <details className="rounded-md border border-border bg-background p-3" open>
              <summary className="cursor-pointer text-xs font-medium text-foreground">从模型模板填入</summary>
              <div className="mt-3 space-y-2">
                <Input
                  value={templateSearch}
                  onChange={(event) => setTemplateSearch(event.target.value)}
                  placeholder="搜索模型或上游 id"
                  className="h-8 text-xs"
                />
                <select value={templateLab} onChange={(event) => setTemplateLab(event.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                  <option value="">全部 Lab</option>
                  {templateLabOptions.map((lab) => (
                    <option key={lab} value={lab}>{lab}</option>
                  ))}
                </select>
                {catalogTemplatesQuery.error && <AppInlineError>{translateAPIRequestError(catalogTemplatesQuery.error)}</AppInlineError>}
                {catalogTemplatesQuery.isLoading ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">正在加载模型模板...</p>
                ) : filteredCatalogTemplates.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">没有匹配的模型模板。</p>
                ) : (
                  <div className="grid max-h-56 gap-2 overflow-y-auto pr-1">
                    {filteredCatalogTemplates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => applyCatalogTemplate(template)}
                        className={cn(
                          'min-w-0 rounded-lg border bg-card p-3 text-left transition-colors hover:border-ring',
                          appliedCatalogTemplate?.id === template.id ? 'border-ring ring-1 ring-ring/30' : 'border-border',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{template.display_name || template.default_public_model_id}</p>
                            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{template.default_public_model_id}</p>
                          </div>
                          <div className="flex shrink-0 flex-wrap justify-end gap-1">
                            <StatusBadge intent="neutral">{template.lab}</StatusBadge>
                            <StatusBadge intent={catalogTemplateSourceStatusIntent(template)}>{catalogTemplateSourceStatusLabel(template)}</StatusBadge>
                          </div>
                        </div>
                        <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">upstream: {template.model_id}</p>
                        <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">adapter: {template.adapter_type}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {template.capabilities.slice(0, 4).map((capability) => (
                            <StatusBadge key={capability} intent={CAPABILITY_STATUS_INTENT[capability] ?? 'neutral'} className="text-xs">
                              {t(CAPABILITY_TRANSLATION_KEYS[capability] ?? capability)}
                            </StatusBadge>
                          ))}
                          {template.capabilities.length > 4 && <StatusBadge intent="neutral">+{template.capabilities.length - 4}</StatusBadge>}
                          {(template.supported_params?.length ?? 0) > 0 && <StatusBadge intent="neutral">{template.supported_params?.length} params</StatusBadge>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </details>
            <div className="grid gap-3">
              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.modelCatalog.publicModelId')}</Label>
                <Input value={catalogForm.public_model_id} onChange={(event) => setCatalogForm({ ...catalogForm, public_model_id: event.target.value })} className="h-8 text-xs font-mono" placeholder="gpt-4.1" />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.modelCatalog.displayName')}</Label>
                <Input value={catalogForm.display_name} onChange={(event) => setCatalogForm({ ...catalogForm, display_name: event.target.value })} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.modelCatalog.shortName')}</Label>
                <Input value={catalogForm.short_name} onChange={(event) => setCatalogForm({ ...catalogForm, short_name: event.target.value })} className="h-8 text-xs" />
              </div>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.modelCatalog.capabilities')}</Label>
              <div className="flex flex-wrap gap-2">
                {MODEL_CAPABILITIES.map((capability) => (
                  <label key={capability} className="flex h-8 items-center gap-2 rounded-md border border-border px-2 text-xs">
                    <input type="checkbox" checked={catalogForm.capabilities.includes(capability)} onChange={() => toggleCatalogCapability(capability)} className="rounded" />
                    <span>{t(CAPABILITY_TRANSLATION_KEYS[capability] ?? capability)}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="flex h-8 items-center gap-2 text-xs">
                <input type="checkbox" checked={catalogForm.is_enabled} onChange={(event) => setCatalogForm({ ...catalogForm, is_enabled: event.target.checked })} />
                {t('admin.modelCatalog.enabled')}
              </label>
              <label className="flex h-8 items-center gap-2 text-xs">
                <input type="checkbox" checked={catalogForm.accepts_image} onChange={(event) => setCatalogForm({ ...catalogForm, accepts_image: event.target.checked })} />
                {t('admin.modelCatalog.acceptsImage')}
              </label>
              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.models.maxInputImages')}</Label>
                <Input type="number" value={catalogForm.max_input_images} onChange={(event) => setCatalogForm({ ...catalogForm, max_input_images: Number(event.target.value) })} invalid={!isValidInputLimit(catalogForm.max_input_images)} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.models.maxInputVideos')}</Label>
                <Input type="number" value={catalogForm.max_input_videos} onChange={(event) => setCatalogForm({ ...catalogForm, max_input_videos: Number(event.target.value) })} invalid={!isValidInputLimit(catalogForm.max_input_videos)} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.modelCatalog.imageEditField')}</Label>
                <Input value={catalogForm.image_edit_field} onChange={(event) => setCatalogForm({ ...catalogForm, image_edit_field: event.target.value })} className="h-8 text-xs font-mono" placeholder="image[]" />
              </div>
            </div>
            {catalogInputErrors.map((message) => <AppFeedbackText key={message}>{message}</AppFeedbackText>)}
            {appliedCatalogTemplate && (
              <AppFeedbackText tone="neutral">
                {catalogTemplateIsRuntimeReady(appliedCatalogTemplate)
                  ? `模板已填入：Public Model ID 为 ${appliedCatalogTemplate.default_public_model_id}，Route 建议使用 provider model id ${appliedCatalogTemplate.model_id}。`
                  : `模板已填入：Public Model ID 为 ${appliedCatalogTemplate.default_public_model_id}。该模板当前为待适配状态，先不要为它创建可用 Route。`}
              </AppFeedbackText>
            )}
            <CatalogParamBuilder value={catalogForm.supported_params} onChange={(supported_params) => setCatalogForm({ ...catalogForm, supported_params })} />
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => saveCatalogEntry.mutate({ id: editingCatalogId ?? undefined, form: catalogForm })} disabled={saveCatalogEntry.isPending || !canSaveCatalog}>
                {saveCatalogEntry.isPending ? t('common.saving') : editingCatalogId ? t('admin.modelCatalog.save') : t('admin.modelCatalog.create')}
              </Button>
            </div>
          </div>

        </aside>
      </div>
    </div>
  )
}

function ModelRoutesSection({ credentials, providers }: { credentials: AICredential[]; providers: AIProvider[] }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [routeFormFor, setRouteFormFor] = useState<number | null>(null)
  const [routeForm, setRouteForm] = useState<CatalogRouteForm>(() => emptyCatalogRouteForm())
  const [routeDialogOpen, setRouteDialogOpen] = useState(false)
  const [routeError, setRouteError] = useState('')
  const [routeSearch, setRouteSearch] = useState('')
  const [routeCapability, setRouteCapability] = useState('all')
  const [routeCoverageFilter, setRouteCoverageFilter] = useState<ModelRouteCoverageFilter>('all')
  const [routePage, setRoutePage] = useState(1)
  const [routePageSize, setRoutePageSize] = useState(MODEL_ADMIN_PAGE_SIZE)

  const catalogQuery = useQuery<AIModelCatalogEntry[]>({
    queryKey: ['admin', 'model-catalog'],
    queryFn: () => api.get('/admin/model-catalog').then((r) => readListPayload<AIModelCatalogEntry>(r.data)),
  })
  const catalogTemplatesQuery = useQuery<AIModelCatalogTemplate[]>({
    queryKey: ['admin', 'model-catalog-templates'],
    queryFn: () => api.get('/admin/model-catalog/templates').then((r) => readListPayload<AIModelCatalogTemplate>(r.data)),
  })
  const runtimeHealthQuery = useQuery<RuntimeProviderHealthResponse>({
    queryKey: ['admin', 'model-runtime-health'],
    queryFn: () => api.get('/admin/debug/model-runtime-health').then((r) => r.data),
    refetchInterval: 5000,
  })
  const entries = catalogQuery.data ?? []
  const catalogTemplates = catalogTemplatesQuery.data ?? []
  const routeProviders = useMemo(
    () => routeProviderOptionsFromProviders(providers, credentials),
    [providers, credentials],
  )
  const enabledRouteProviders = useMemo(() => enabledRouteProviderOptions(routeProviders), [routeProviders])
  const selectedEntry = entries.find((entry) => entry.ID === routeFormFor) ?? entries[0]
  const routeCapabilityOptions = useMemo(
    () => Array.from(new Set(entries.flatMap((entry) => modelCatalogCapabilities(entry)))).sort(),
    [entries],
  )
  const filteredRouteEntries = useMemo(() => entries.filter((entry) => {
    const bindings = entry.route_bindings ?? []
    if (routeCapability !== 'all' && !modelCatalogCapabilities(entry).includes(routeCapability)) return false
    if (routeCoverageFilter === 'missing-routes' && bindings.length > 0) return false
    if (routeCoverageFilter === 'disabled-routes' && !bindings.some((binding) => !binding.is_enabled)) return false
    return modelAdminTextMatches(routeSearch, [
      entry.public_model_id,
      entry.display_name,
      entry.short_name,
      entry.capabilities,
      ...bindings.flatMap((binding) => [binding.route_group, binding.provider_id, binding.provider_model_id, binding.adapter_type]),
    ])
  }), [entries, routeCapability, routeCoverageFilter, routeSearch])
  const routePagination = modelAdminPaginationSlice(filteredRouteEntries, routePage, routePageSize)

  useEffect(() => {
    if (!routeForm.provider_id && firstEnabledRouteProviderID(routeProviders)) {
      const providerID = firstEnabledRouteProviderID(routeProviders)
      setRouteForm((form) => ({ ...form, provider_id: providerID, adapter_type: adapterTypeForRouteProviderID(providerID, credentials, routeProviders) }))
    } else if (routeForm.provider_id && !routeForm.adapter_type) {
      setRouteForm((form) => ({ ...form, adapter_type: adapterTypeForRouteProviderID(form.provider_id, credentials, routeProviders) }))
    }
  }, [credentials, routeProviders, routeForm.adapter_type, routeForm.provider_id])

  useEffect(() => {
    setRoutePage(1)
  }, [routeSearch, routeCapability, routeCoverageFilter, routePageSize])

  const createRouteBinding = useMutation({
    mutationFn: ({ entryId, form }: { entryId: number; form: CatalogRouteForm }) =>
      api.post(`/admin/model-catalog/${entryId}/route-bindings`, catalogRoutePayload(form)).then((r) => r.data),
    onMutate: () => setRouteError(''),
    onSuccess: () => {
      setRouteError('')
      setRouteForm(emptyCatalogRouteForm(firstEnabledRouteProviderID(routeProviders), activeEntry?.public_model_id ?? ''))
      setRouteDialogOpen(false)
      qc.invalidateQueries({ queryKey: ['admin', 'model-catalog'] })
    },
    onError: (err: any) => setRouteError(translateAPIRequestError(err)),
  })

  const updateRouteBinding = useMutation({
    mutationFn: ({ entryId, bindingId, form }: { entryId: number; bindingId: number; form: CatalogRouteForm }) =>
      api.put(`/admin/model-catalog/${entryId}/route-bindings/${bindingId}`, catalogRoutePayload(form)).then((r) => r.data),
    onMutate: () => setRouteError(''),
    onSuccess: () => {
      setRouteError('')
      qc.invalidateQueries({ queryKey: ['admin', 'model-catalog'] })
    },
    onError: (err: any) => setRouteError(translateAPIRequestError(err)),
  })

  const deleteRouteBinding = useMutation({
    mutationFn: ({ entryId, bindingId }: { entryId: number; bindingId: number }) =>
      api.delete(`/admin/model-catalog/${entryId}/route-bindings/${bindingId}`),
    onMutate: () => setRouteError(''),
    onSuccess: () => {
      setRouteError('')
      qc.invalidateQueries({ queryKey: ['admin', 'model-catalog'] })
    },
    onError: (err: any) => setRouteError(translateAPIRequestError(err)),
  })

  function openRouteForm(entryId: number, routeGroup = '') {
    const entry = entries.find((item) => item.ID === entryId)
    const providerID = firstEnabledRouteProviderID(routeProviders)
    const providerModelID = suggestedProviderModelIDForEntry(entry, providerID, catalogTemplates, credentials, routeProviders)
    setRouteFormFor(entryId)
    setRouteForm({
      ...emptyCatalogRouteForm(providerID, providerModelID || entry?.public_model_id || '', routeGroup),
      provider_id: providerID,
      adapter_type: adapterTypeForRouteProviderID(providerID, credentials, routeProviders),
    })
    setRouteDialogOpen(true)
  }

  const activeEntry = selectedEntry ? selectedEntry : null
  const routeTemplateSuggestion = activeEntry ? matchingCatalogTemplateForRoute(activeEntry, routeForm.provider_id, catalogTemplates, credentials, routeProviders) : null
  const selectedRouteProvider = routeProviders.find((provider) => provider.provider_id === routeForm.provider_id)
  const canSaveRoute = Boolean(activeEntry && routeForm.provider_id.trim() && routeForm.provider_model_id.trim())

  return (
    <div className="space-y-4">
      {routeError && <AppInlineError>{routeError}</AppInlineError>}
      {catalogQuery.error && <AppInlineError>{translateAPIRequestError(catalogQuery.error)}</AppInlineError>}

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <ModelAdminSearchInput value={routeSearch} onChange={setRouteSearch} placeholder="搜索模型、group、provider model..." />
          <select value={routeCapability} onChange={(event) => setRouteCapability(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
            <option value="all">全部能力</option>
            {routeCapabilityOptions.map((capability) => <option key={capability} value={capability}>{capability}</option>)}
          </select>
          <select value={routeCoverageFilter} onChange={(event) => setRouteCoverageFilter(event.target.value as ModelRouteCoverageFilter)} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
            <option value="all">全部覆盖</option>
            <option value="missing-routes">缺少路由</option>
            <option value="disabled-routes">包含禁用绑定</option>
          </select>
          <ModelAdminPageSizeSelect value={routePageSize} onChange={setRoutePageSize} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <ModelRouteMatrix entries={routePagination.items} routeProviders={routeProviders} onOpenRouteForm={openRouteForm} />
          <PaginationControls page={routePagination.page} pageCount={routePagination.pageCount} pageSize={routePageSize} total={filteredRouteEntries.length} onPageChange={setRoutePage} disabled={catalogQuery.isFetching} />
          <RuntimeModelHealthSection
            items={runtimeHealthQuery.data?.items ?? []}
            isLoading={runtimeHealthQuery.isLoading}
            isFetching={runtimeHealthQuery.isFetching}
            error={runtimeHealthQuery.error}
            onRefresh={() => runtimeHealthQuery.refetch()}
          />
        </div>

        <aside className="space-y-3 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
          <div className="rounded-lg border border-border bg-card">
            <div className="space-y-3 border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{t('admin.models.routeEditorTitle', { defaultValue: 'Route Binding 编辑器' })}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('admin.models.routeEditorHint', { defaultValue: '选择一个 Catalog Entry，维护它的 Provider 通道、provider model id、route group、priority、capacity 和 concurrency。' })}
                </p>
              </div>
              <div className="grid gap-2">
                <select
                  value={activeEntry?.ID ?? ''}
                  onChange={(event) => setRouteFormFor(Number(event.target.value))}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  disabled={entries.length === 0}
                >
                  {entries.map((entry) => (
                    <option key={entry.ID} value={entry.ID}>{entry.public_model_id}</option>
                  ))}
                </select>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {activeEntry ? (
                    <StatusBadge intent={activeEntry.is_enabled ? 'success' : 'neutral'}>
                      {activeEntry.is_enabled ? t('admin.modelCatalog.enabled') : t('admin.modelCatalog.disabled')}
                    </StatusBadge>
                  ) : <span />}
                  <Button type="button" size="sm" onClick={() => openRouteForm(activeEntry?.ID ?? entries[0]?.ID ?? 0)} disabled={entries.length === 0}>
                    <Plus size={14} className="mr-1.5" />
                    {t('admin.models.addRouteCandidate', { defaultValue: '新增候选' })}
                  </Button>
                </div>
              </div>
            </div>
            {activeEntry ? (
              <div className="divide-y divide-border">
                {(activeEntry.route_bindings ?? []).length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">{t('admin.modelCatalog.noRoutes')}</p>
                ) : sortRouteBindings(activeEntry.route_bindings ?? []).map((binding) => (
                  <CommunityRouteBindingEditor
                    key={binding.ID}
                    binding={binding}
                    routeProviders={routeProviders}
                    busy={updateRouteBinding.isPending || deleteRouteBinding.isPending}
                    compact
                    onSave={(form) => updateRouteBinding.mutate({ entryId: activeEntry.ID, bindingId: binding.ID, form })}
                    onDelete={() => deleteRouteBinding.mutate({ entryId: activeEntry.ID, bindingId: binding.ID })}
                  />
                ))}
              </div>
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground">{t('admin.modelCatalog.empty')}</p>
            )}
          </div>
        </aside>
      </div>

      {catalogTemplatesQuery.error && <AppInlineError>{translateAPIRequestError(catalogTemplatesQuery.error)}</AppInlineError>}

      {routeDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-xl"
            onSubmit={(event) => {
              event.preventDefault()
              if (activeEntry) createRouteBinding.mutate({ entryId: activeEntry.ID, form: routeForm })
            }}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{t('admin.models.createRouteBindingTitle', { defaultValue: '新增 Route Binding' })}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('admin.models.createRouteBindingHint', { defaultValue: '把 Public Model ID 映射到一个 Provider 通道和实际 provider model id。' })}
                </p>
              </div>
              <button type="button" onClick={() => setRouteDialogOpen(false)} className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={t('common.close')}>
                <X size={16} />
              </button>
            </div>
            <label className="mb-2 block text-xs text-muted-foreground">
              {t('admin.modelCatalog.publicModelId')}
              <select
                value={activeEntry?.ID ?? ''}
                onChange={(event) => {
                  const entryID = Number(event.target.value)
                  const entry = entries.find((item) => item.ID === entryID)
                  const providerID = routeForm.provider_id || firstEnabledRouteProviderID(routeProviders)
                  const providerModelID = suggestedProviderModelIDForEntry(entry, providerID, catalogTemplates, credentials, routeProviders)
                  setRouteFormFor(entryID)
                  setRouteForm((form) => ({
                    ...emptyCatalogRouteForm(providerID, providerModelID || entry?.public_model_id || '', form.route_group),
                    provider_id: providerID,
                    adapter_type: adapterTypeForRouteProviderID(providerID, credentials, routeProviders),
                  }))
                }}
                className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                {entries.map((entry) => (
                  <option key={entry.ID} value={entry.ID}>{entry.public_model_id} · {catalogEntryLabel(entry)}</option>
                ))}
              </select>
            </label>
            <label className="mb-2 block text-xs text-muted-foreground">
              {t('admin.models.providerLane', { defaultValue: 'Provider Lane' })}
              <select
                value={routeForm.provider_id}
                onChange={(event) => {
                  const providerID = event.target.value
                  const providerModelID = suggestedProviderModelIDForEntry(activeEntry, providerID, catalogTemplates, credentials, routeProviders)
                  setRouteForm({
                    ...routeForm,
                    provider_id: providerID,
                    adapter_type: adapterTypeForRouteProviderID(providerID, credentials, routeProviders),
                    provider_model_id: shouldReplaceRouteProviderModelID(routeForm.provider_model_id, activeEntry, catalogTemplates)
                      ? providerModelID || activeEntry?.public_model_id || ''
                      : routeForm.provider_model_id,
                  })
                }}
                className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">{t('admin.modelCatalog.pickProvider', { defaultValue: '选择 Provider' })}</option>
                {enabledRouteProviders.map((provider) => <option key={provider.provider_id} value={provider.provider_id}>{providerOptionLabel(provider)}</option>)}
              </select>
            </label>
            <div className="mb-2 rounded-md border border-border bg-background px-3 py-2 text-xs">
              <p className="text-muted-foreground">{t('admin.models.adapter', { defaultValue: 'Adapter' })}</p>
              <p className="mt-1 font-mono text-foreground">{routeForm.adapter_type || (selectedRouteProvider ? routeProviderAdapterLabel(selectedRouteProvider) : '-')}</p>
            </div>
            <label className="mb-2 block text-xs text-muted-foreground">
              {t('admin.modelCatalog.providerModelId')}
              <Input
                value={routeForm.provider_model_id}
                onChange={(event) => setRouteForm({ ...routeForm, provider_model_id: event.target.value })}
                placeholder={activeEntry?.public_model_id || 'gpt-4.1'}
                className="mt-1 h-8 text-xs font-mono"
              />
              <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                {t('admin.models.providerModelIdHint', { defaultValue: '这是实际发给 Provider API 的 model 字段，可以和 Public Model ID 不同。' })}
              </span>
              {routeTemplateSuggestion && (
                <button
                  type="button"
                  onClick={() => setRouteForm({ ...routeForm, provider_model_id: routeTemplateSuggestion.model_id })}
                  className="mt-1 block text-left font-mono text-[11px] text-primary hover:underline"
                >
                  使用模板上游 ID：{routeTemplateSuggestion.model_id}
                </button>
              )}
            </label>
            <label className="mb-2 block text-xs text-muted-foreground">
              {t('admin.modelCatalog.routeGroup')}
              <Input
                value={routeForm.route_group}
                onChange={(event) => setRouteForm({ ...routeForm, route_group: event.target.value })}
                placeholder={t('admin.models.defaultRouteGroupPlaceholder', { defaultValue: '留空为默认分组' })}
                className="mt-1 h-8 text-xs"
              />
              <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                {t('admin.models.routeGroupHint', { defaultValue: '请求指定同名 route group 时，只会在这个分组的候选 provider 里选择。' })}
              </span>
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="block text-xs text-muted-foreground">
                {t('admin.models.priority')}
                <Input value={routeForm.priority} onChange={(event) => setRouteForm({ ...routeForm, priority: event.target.value })} placeholder="0" className="mt-1 h-8 text-xs" />
              </label>
              <label className="block text-xs text-muted-foreground">
                {t('admin.models.capacityWeight')}
                <Input value={routeForm.capacity_weight} onChange={(event) => setRouteForm({ ...routeForm, capacity_weight: event.target.value })} placeholder="1" className="mt-1 h-8 text-xs" />
              </label>
              <label className="block text-xs text-muted-foreground">
                {t('admin.models.maxConcurrency')}
                <Input value={routeForm.max_concurrency} onChange={(event) => setRouteForm({ ...routeForm, max_concurrency: event.target.value })} placeholder="0" className="mt-1 h-8 text-xs" />
              </label>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={routeForm.is_enabled} onChange={(event) => setRouteForm({ ...routeForm, is_enabled: event.target.checked })} />
              {t('admin.models.enableRouteBinding', { defaultValue: '启用 route binding' })}
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRouteDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={!canSaveRoute || createRouteBinding.isPending || entries.length === 0}>
                {createRouteBinding.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </form>
        </div>
      )}

    </div>
  )
}

function CommunityRouteBindingEditor({
  binding,
  routeProviders,
  busy,
  compact = false,
  onSave,
  onDelete,
}: {
  binding: AIModelRouteBinding
  routeProviders: RouteProviderOption[]
  busy: boolean
  compact?: boolean
  onSave: (form: CatalogRouteForm) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState<CatalogRouteForm>(() => catalogRouteFormFromBinding(binding))

  useEffect(() => {
    setForm(catalogRouteFormFromBinding(binding))
  }, [binding.ID, binding.UpdatedAt])

  return (
    <form
      className={cn(
        'grid gap-2 px-4 py-3 text-xs',
        compact ? 'grid-cols-1' : 'md:grid-cols-[minmax(160px,1fr)_100px_minmax(150px,1fr)_minmax(120px,0.8fr)_90px_90px_110px_auto]',
      )}
      onSubmit={(event) => {
        event.preventDefault()
        onSave(form)
      }}
    >
      <select
        value={form.provider_id}
        onChange={(event) => setForm({ ...form, provider_id: event.target.value, adapter_type: routeProviderAdapterValue(routeProviders.find((provider) => provider.provider_id === event.target.value)) })}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="">{t('admin.modelCatalog.pickProvider', { defaultValue: '选择 Provider' })}</option>
        {routeProviders.map((provider) => (
          <option key={provider.provider_id} value={provider.provider_id}>{providerOptionLabel(provider)}</option>
        ))}
      </select>
      <div className="flex h-8 items-center rounded-md border border-border bg-muted/30 px-2 font-mono text-[11px] text-muted-foreground">
        {form.adapter_type || routeProviderAdapterLabel(routeProviders.find((provider) => provider.provider_id === form.provider_id))}
      </div>
      <Input value={form.provider_model_id} onChange={(event) => setForm({ ...form, provider_model_id: event.target.value })} placeholder="provider model id" className="h-8 text-xs font-mono" />
      <Input value={form.route_group} onChange={(event) => setForm({ ...form, route_group: event.target.value })} placeholder={t('admin.modelCatalog.routeGroup')} className="h-8 text-xs" />
      <Input value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} placeholder="priority" className="h-8 text-xs" />
      <Input value={form.capacity_weight} onChange={(event) => setForm({ ...form, capacity_weight: event.target.value })} placeholder="capacity" className="h-8 text-xs" />
      <Input value={form.max_concurrency} onChange={(event) => setForm({ ...form, max_concurrency: event.target.value })} placeholder="concurrency" className="h-8 text-xs" />
      <div className={cn('flex items-center gap-1', compact ? 'justify-between' : 'justify-end')}>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={form.is_enabled} onChange={(event) => setForm({ ...form, is_enabled: event.target.checked })} />
          启用
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={busy || !form.provider_id.trim() || !form.provider_model_id.trim()}>{t('common.save')}</Button>
        <Button type="button" size="sm" variant="ghost" intent="danger" disabled={busy} onClick={onDelete}>{t('common.delete')}</Button>
      </div>
    </form>
  )
}

interface RuntimeProviderHealth {
  catalog_entry_id?: number
  route_binding_id?: number
  model_id: string
  model_def_id: string
  provider_name: string
  adapter_type: string
  priority: number
  capacity_weight: number
  max_concurrency: number
  is_enabled: boolean
  in_flight: number
  saturated: boolean
  successes: number
  failures: number
  consecutive_failures: number
  failure_rate: number
  circuit_open: boolean
  open_until?: string
  cooldown_remaining_ms: number
}

interface RuntimeProviderHealthResponse {
  items: RuntimeProviderHealth[]
  total: number
}

function emptyCatalogEntryForm(): CatalogEntryForm {
  return {
    public_model_id: '',
    display_name: '',
    short_name: '',
    is_enabled: true,
    capabilities: ['text'],
    accepts_image: false,
    max_input_images: 0,
    max_input_videos: 0,
    image_edit_field: '',
    supported_params: '',
  }
}

function catalogEntryFormFromEntry(entry: AIModelCatalogEntry): CatalogEntryForm {
  return {
    public_model_id: entry.public_model_id,
    display_name: entry.display_name,
    short_name: entry.short_name ?? '',
    is_enabled: entry.is_enabled,
    capabilities: modelCatalogCapabilities(entry),
    accepts_image: Boolean(entry.accepts_image),
    max_input_images: entry.max_input_images ?? 0,
    max_input_videos: entry.max_input_videos ?? 0,
    image_edit_field: entry.image_edit_field ?? '',
    supported_params: entry.supported_params ?? '',
  }
}

function catalogEntryFormFromTemplate(template: AIModelCatalogTemplate): CatalogEntryForm {
  const publicModelID = firstNonEmptyString(template.default_public_model_id, template.model_id, template.id)
  return catalogEntryTemplateForm({
    public_model_id: publicModelID,
    display_name: template.display_name || publicModelID,
    short_name: publicModelID,
    capabilities: [...template.capabilities],
    accepts_image: Boolean(template.accepts_image_input),
    max_input_images: template.max_input_images ?? 0,
    max_input_videos: template.max_input_videos ?? 0,
    image_edit_field: template.image_edit_field ?? '',
    supported_params: catalogTemplateSupportedParamsValue(template),
  })
}

function catalogTemplateSupportedParamsValue(template: AIModelCatalogTemplate): string {
  const params = template.supported_params ?? []
  return params.length > 0 ? serializeParamDefs(params) : ''
}

function catalogTemplateIsRuntimeReady(template: AIModelCatalogTemplate): boolean {
  return (template.source_status ?? '').trim() !== 'template_only'
}

function catalogTemplateSourceStatusIntent(template: AIModelCatalogTemplate): StatusBadgeProps['intent'] {
  switch ((template.source_status ?? '').trim()) {
    case 'template_only':
      return 'warning'
    case 'deprecated':
      return 'neutral'
    case 'verified':
      return 'success'
    case 'needs_review':
    case 'observed':
    case 'unofficial':
      return 'warning'
    default:
      return 'neutral'
  }
}

function catalogTemplateSourceStatusLabel(template: AIModelCatalogTemplate): string {
  switch ((template.source_status ?? '').trim()) {
    case 'template_only':
      return '待适配'
    case 'deprecated':
      return '已废弃'
    case 'verified':
      return '可路由'
    case 'needs_review':
      return '待核对'
    case 'observed':
      return '已观测'
    case 'unofficial':
      return '非官方'
    default:
      return '模板'
  }
}

function filterCatalogTemplates(templates: AIModelCatalogTemplate[], search: string, lab: string): AIModelCatalogTemplate[] {
  const needle = search.trim().toLowerCase()
  return templates.filter((template) => {
    if (lab && template.lab !== lab) return false
    if (!needle) return true
    return [
      template.id,
      template.lab,
      template.default_public_model_id,
      template.model_id,
      template.display_name,
      template.adapter_type,
      template.source_status,
      ...template.capabilities,
    ].some((value) => (value ?? '').toLowerCase().includes(needle))
  })
}

function firstNonEmptyString(...values: Array<string | undefined>): string {
  for (const value of values) {
    const next = value?.trim()
    if (next) return next
  }
  return ''
}

function catalogEntryPayload(form: CatalogEntryForm): Record<string, unknown> {
  return {
    public_model_id: form.public_model_id.trim(),
    display_name: form.display_name.trim() || form.public_model_id.trim(),
    short_name: form.short_name.trim(),
    is_enabled: form.is_enabled,
    capabilities: form.capabilities.join(','),
    accepts_image: form.accepts_image,
    max_input_images: form.max_input_images,
    max_input_videos: form.max_input_videos,
    image_edit_field: form.image_edit_field.trim(),
    supported_params: form.supported_params.trim(),
  }
}

function emptyCatalogRouteForm(providerID = '', providerModelID = '', routeGroup = '', adapterType = ''): CatalogRouteForm {
  return {
    route_group: routeGroup,
    provider_id: providerID,
    adapter_type: adapterType,
    provider_model_id: providerModelID,
    is_enabled: true,
    priority: '0',
    capacity_weight: '1',
    max_concurrency: '0',
  }
}

function catalogRouteFormFromBinding(binding: AIModelRouteBinding): CatalogRouteForm {
  return {
    route_group: binding.route_group || '',
    provider_id: binding.provider_id || '',
    adapter_type: binding.adapter_type || '',
    provider_model_id: binding.provider_model_id || '',
    is_enabled: binding.is_enabled,
    priority: String(binding.priority ?? 0),
    capacity_weight: String(binding.capacity_weight ?? 1),
    max_concurrency: String(binding.max_concurrency ?? 0),
  }
}

function catalogRoutePayload(form: CatalogRouteForm): Record<string, unknown> {
  return {
    route_group: form.route_group.trim(),
    provider_id: form.provider_id.trim(),
    adapter_type: form.adapter_type.trim(),
    provider_model_id: form.provider_model_id.trim(),
    is_enabled: form.is_enabled,
    priority: parseInt(form.priority, 10) || 0,
    capacity_weight: Math.max(1, parseInt(form.capacity_weight, 10) || 1),
    max_concurrency: Math.max(0, parseInt(form.max_concurrency, 10) || 0),
  }
}

function routeProviderOptionsFromProviders(providers: AIProvider[], credentials: AICredential[]): RouteProviderOption[] {
  if (providers.length > 0) {
    return providers.map((provider) => ({
      provider_id: provider.provider_id,
      display_name: provider.display_name || provider.provider_id,
      provider_type: provider.provider_type,
      profile: provider.profile,
      adapter_key: provider.adapter_key,
      default_adapter_type: provider.default_adapter_type,
      provider_kind: provider.provider_kind,
      provider_category: provider.provider_category,
      base_url_prefix: provider.base_url_prefix,
      is_enabled: provider.is_enabled,
      legacy_credential_id: legacyCredentialIDFromProvider(provider),
    }))
  }
  return credentials.map((credential) => ({
    provider_id: localProviderRouteProviderID(credential.ID),
    display_name: credential.display_name,
    adapter_key: credential.adapter_type,
    provider_kind: credential.adapter_type,
    provider_category: 'legacy_credential',
    base_url_prefix: credential.base_url,
    is_enabled: credential.is_enabled,
    legacy_credential_id: credential.ID,
  }))
}

function enabledRouteProviderOptions(options: RouteProviderOption[]): RouteProviderOption[] {
  return options.filter((option) => option.is_enabled)
}

function firstEnabledRouteProviderID(options: RouteProviderOption[]): string {
  return enabledRouteProviderOptions(options)[0]?.provider_id ?? options[0]?.provider_id ?? ''
}

function providerOptionLabel(option: RouteProviderOption): string {
  const adapter = routeProviderAdapterValue(option)
  const parts = [
    option.display_name || option.provider_id,
    providerAccountLabel(option),
    adapter !== option.provider_kind ? adapter : '',
    option.is_enabled ? '' : 'disabled',
  ].filter(Boolean)
  return parts.join(' · ')
}

function routeProviderAdapterLabel(option?: RouteProviderOption): string {
  return routeProviderAdapterValue(option) || '-'
}

function routeProviderAdapterValue(option?: RouteProviderOption): string {
  if (!option) return ''
  return providerDefaultAdapter(option) || option.provider_kind || ''
}

function legacyCredentialIDFromProvider(provider: AIProvider): number | undefined {
  for (const credential of provider.credentials ?? []) {
    const config = parseJSONRecord(credential.plain_config_json)
    const id = Number(config.legacy_credential_id)
    if (Number.isFinite(id) && id > 0) return id
  }
  const parsed = credentialIDFromProviderID(provider.provider_id)
  return parsed ?? undefined
}

function providerCredentialMaskedKey(credential: AIProviderCredential): string {
  const masked = parseJSONRecord(credential.masked_secrets_json)
  const values = [
    masked.legacy_masked_key,
    masked.api_key,
    masked.access_key,
    masked.secret_key,
  ].map((value) => typeof value === 'string' ? value.trim() : '').filter(Boolean)
  return values[0] || '••••••••'
}

function parseJSONRecord(value: string | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringListFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean)
}

function diagnosticCodesFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const record = recordFromUnknown(item)
    const code = typeof record.code === 'string' ? record.code.trim() : ''
    const severity = typeof record.severity === 'string' ? record.severity.trim() : ''
    return [severity, code].filter(Boolean).join(':')
  }).filter(Boolean)
}

function localProviderRouteProviderID(credentialID?: number): string {
  return credentialID ? `local_provider:${credentialID}` : ''
}

function localProviderCredentialIDFromProviderID(providerID: string): number | null {
  const prefix = 'local_provider:'
  if (!providerID.startsWith(prefix)) return null
  const parsed = Number(providerID.slice(prefix.length))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function matchingCatalogTemplateForRoute(
  entry: AIModelCatalogEntry | null | undefined,
  providerID: string,
  templates: AIModelCatalogTemplate[],
  credentials: AICredential[],
  routeProviders: RouteProviderOption[],
): AIModelCatalogTemplate | null {
  if (!entry) return null
  const publicModelID = entry.public_model_id.trim()
  if (!publicModelID) return null
  const candidates = templates.filter((template) => {
    if (!catalogTemplateIsRuntimeReady(template)) return false
    return template.default_public_model_id === publicModelID || template.model_id === publicModelID
  })
  if (candidates.length === 0) return null
  const adapterType = adapterTypeForRouteProviderID(providerID, credentials, routeProviders)
  if (adapterType) {
    const adapterMatch = candidates.find((template) => template.adapter_type === adapterType)
    if (adapterMatch) return adapterMatch
  }
  return candidates[0]
}

function suggestedProviderModelIDForEntry(
  entry: AIModelCatalogEntry | null | undefined,
  providerID: string,
  templates: AIModelCatalogTemplate[],
  credentials: AICredential[],
  routeProviders: RouteProviderOption[],
): string {
  return matchingCatalogTemplateForRoute(entry, providerID, templates, credentials, routeProviders)?.model_id ?? ''
}

function adapterTypeForRouteProviderID(providerID: string, credentials: AICredential[], routeProviders: RouteProviderOption[]): string {
  const option = routeProviders.find((candidate) => candidate.provider_id === providerID)
  if (option) return routeProviderAdapterValue(option)
  const credentialID = localProviderCredentialIDFromProviderID(providerID)
  if (!credentialID) return providerID === 'relay_gateway' ? 'openai_compat' : ''
  return credentials.find((credential) => credential.ID === credentialID)?.adapter_type ?? ''
}

function shouldReplaceRouteProviderModelID(current: string, entry: AIModelCatalogEntry | null, templates: AIModelCatalogTemplate[]): boolean {
  const value = current.trim()
  if (!value) return true
  if (entry && value === entry.public_model_id) return true
  return templates.some((template) => template.model_id === value)
}

function modelCatalogCapabilities(entry: Pick<AIModelCatalogEntry, 'capabilities'>): string[] {
  return entry.capabilities.split(',').map((capability) => capability.trim()).filter(Boolean)
}

function paramTemplateLabel(key: string, fallback: string, t: (key: string, values?: Record<string, unknown>) => string) {
  return t(`admin.params.templates.${key}`, { defaultValue: fallback })
}

function ParamBuilder({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const { t } = useTranslation()
  const params = parseParamDefs(value)
  const update = (index: number, patch: Partial<ParamDef>) => {
    const next = params.map((p, i) => i === index ? { ...p, ...patch } : p)
    onChange(serializeParamDefs(next))
  }
  const remove = (index: number) => onChange(serializeParamDefs(params.filter((_, i) => i !== index)))
  const add = () => onChange(serializeParamDefs([
    ...params,
    { ...PARAM_TEMPLATES.aspect_ratio, label: paramTemplateLabel('aspect_ratio', PARAM_TEMPLATES.aspect_ratio.label, t) },
  ]))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{t('admin.params.title')}</p>
        <button onClick={add} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <Plus size={11} /> {t('admin.params.add')}
        </button>
      </div>
      {params.length === 0 && (
        <p className="text-xs text-muted-foreground/70 rounded border border-dashed border-border px-3 py-2">
          {t('admin.params.empty')}
        </p>
      )}
      {params.map((param, index) => (
        <div key={`${param.key}-${index}`} className="rounded border border-border bg-background p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.params.abstractParam')}</Label>
              <select
                value={paramTemplateFor(param.key) ? param.key : '__custom'}
                onChange={(e) => {
                  const tmpl = PARAM_TEMPLATES[e.target.value]
                  if (tmpl) update(index, { ...tmpl, label: paramTemplateLabel(tmpl.key, tmpl.label, t) })
                }}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                {Object.values(PARAM_TEMPLATES).map((tmpl) => (
                  <option key={tmpl.key} value={tmpl.key}>{paramTemplateLabel(tmpl.key, tmpl.label, t)}</option>
                ))}
                {!paramTemplateFor(param.key) && <option value="__custom">{param.label || param.key}</option>}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.params.displayName')}</Label>
              <Input className="text-xs" value={param.label} onChange={(e) => update(index, { label: e.target.value })} placeholder={t('admin.params.displayNamePlaceholder')} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.params.controlType')}</Label>
              <select
                value={param.type}
                onChange={(e) => update(index, { type: e.target.value as ParamDef['type'], options: e.target.value === 'select' ? (param.options?.length ? param.options : ['16:9', '9:16']) : undefined })}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="select">{t('admin.params.controlTypes.select')}</option>
                <option value="number">{t('admin.params.controlTypes.number')}</option>
                <option value="boolean">{t('admin.params.controlTypes.boolean')}</option>
                <option value="string">{t('admin.params.controlTypes.string')}</option>
              </select>
            </div>
            {param.type === 'select' && (
              <>
                <div className="flex-1 min-w-48">
                  <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.params.options')}</Label>
                  <Input
                    className="text-xs font-mono"
                    value={(param.options ?? []).join(', ')}
                    onChange={(e) => update(index, { options: splitOptions(e.target.value) })}
                    placeholder="16:9, 9:16, 1:1"
                  />
                </div>
                <div className="w-32">
                  <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.params.defaultValue')}</Label>
                  <Input className="text-xs font-mono" value={String(param.default ?? '')} onChange={(e) => update(index, { default: e.target.value })} />
                </div>
              </>
            )}
            {param.type === 'number' && (
              <>
                {(['default', 'min', 'max', 'step'] as const).map((key) => (
                  <div key={key} className="w-20">
                    <Label className="text-xs text-muted-foreground block mb-0.5">{key}</Label>
                    <Input
                      type="number"
                      className="text-xs"
                      value={String(param[key] ?? '')}
                      onChange={(e) => update(index, { [key]: e.target.value === '' ? undefined : Number(e.target.value) } as Partial<ParamDef>)}
                    />
                  </div>
                ))}
              </>
            )}
            {param.type === 'boolean' && (
              <label className="flex items-center gap-2 text-xs cursor-pointer h-8">
                <input type="checkbox" checked={Boolean(param.default)} onChange={(e) => update(index, { default: e.target.checked })} className="rounded" />
                {t('admin.params.defaultOn')}
              </label>
            )}
            {param.type === 'string' && (
              <div className="w-48">
                <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.params.defaultValue')}</Label>
                <Input className="text-xs font-mono" value={String(param.default ?? '')} onChange={(e) => update(index, { default: e.target.value })} />
              </div>
            )}
            <Button type="button" variant="ghost" size="sm" intent="danger" onClick={() => remove(index)} className="h-8 px-2 text-xs">
              {t('common.delete')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

function ParamConfigBuilder({
  value,
  onChange,
  adapterParams,
  adapterType,
  capabilities,
  acceptsImageInput,
  maxInputImages,
  maxInputVideos,
}: {
  value: string
  onChange: (next: string) => void
  adapterParams: ParamDef[]
  adapterType?: string
  capabilities: string[]
  acceptsImageInput?: boolean
  maxInputImages?: number
  maxInputVideos?: number
}) {
  const { t } = useTranslation()
  const mode: 'inherit' | 'profile' | 'override' | 'none' = !value.trim()
    ? 'inherit'
    : value.trim() === '[]'
      ? 'none'
      : isProfileParamConfig(value)
        ? 'profile'
        : 'override'
  const profile = parseModelParamProfile(value)
  const adapterKeys = adapterParams.map((p) => p.key)
  const denied = new Set(profile.deny ?? [])
  const overrideParams = Object.entries(profile.override ?? {}).map(([key, param]) => ({ ...param, key: param.key || key }))
  const audit = buildParamContractAudit(value, adapterParams)
  const auditRuleTypes = summarizeParamRuleTypes(audit.params)
  const visibleAuditErrors = audit.errors.slice(0, 8)
  const hiddenAuditErrorCount = Math.max(0, audit.errors.length - visibleAuditErrors.length)
  const visibleAuditWarnings = audit.warnings.slice(0, 4)
  const hiddenAuditWarningCount = Math.max(0, audit.warnings.length - visibleAuditWarnings.length)
  const fallbackInputRequirements = agentInputRequirementsForAdmin(capabilities, acceptsImageInput === true, maxInputImages ?? 0, maxInputVideos ?? 0)
  const contractPreviewParams = audit.errors.length === 0 ? audit.params : []
  const contractPreviewRuleTypes = summarizeParamRuleTypes(contractPreviewParams)
  const contractPreviewAgentContract = buildAgentCompactParamContract(contractPreviewParams, fallbackInputRequirements)

  const setMode = (next: 'inherit' | 'profile' | 'override' | 'none') => {
    if (next === 'inherit') onChange('')
    if (next === 'none') onChange('[]')
    if (next === 'override') onChange(serializeParamDefs(adapterParams))
    if (next === 'profile') onChange(serializeModelParamProfile(emptyParamProfile()))
  }

  const updateProfile = (next: ModelParamProfile) => onChange(serializeModelParamProfile(next))

  const toggleDeny = (key: string) => {
    const next = new Set(profile.deny ?? [])
    if (next.has(key)) next.delete(key)
    else next.add(key)
    updateProfile({ ...profile, deny: Array.from(next) })
  }

  const updateOverride = (params: ParamDef[]) => {
    const override: Record<string, ParamDef> = {}
    params.forEach((p) => { if (p.key) override[p.key] = p })
    updateProfile({ ...profile, override })
  }

  const modeButton = (key: typeof mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(key)}
      className={cn(
        'text-xs px-2 py-1 rounded border transition-colors',
        mode === key ? 'border-ring bg-accent text-foreground' : 'border-border text-muted-foreground hover:border-ring/50'
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {modeButton('inherit', t('admin.params.modes.inherit'))}
        {modeButton('profile', t('admin.params.modes.profile'))}
        {modeButton('override', t('admin.params.modes.override'))}
        {modeButton('none', t('admin.params.modes.none'))}
      </div>
      {mode === 'inherit' && (
        <div className="rounded border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          {t('admin.params.inheritSummary', { params: adapterKeys.length ? adapterKeys.join(', ') : t('admin.params.noneValue') })}
        </div>
      )}
      {mode === 'none' && (
        <div className="rounded border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          {t('admin.params.noneSummary')}
        </div>
      )}
      {mode === 'override' && <ParamBuilder value={value} onChange={onChange} />}
      {mode === 'profile' && (
        <div className="space-y-3 rounded border border-border bg-background p-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t('admin.params.profileDeny')}</p>
            <div className="flex flex-wrap gap-1.5">
              {adapterParams.length === 0 && <span className="text-xs text-muted-foreground/70">{t('admin.params.noAdapterDefaults')}</span>}
              {adapterParams.map((param) => (
                <AppStatusToggleButton
                  type="button"
                  key={param.key}
                  onClick={() => toggleDeny(param.key)}
                  tone="danger"
                  selected={denied.has(param.key)}
                >
                  {paramTemplateLabel(param.key, param.label || param.key, t)}
                </AppStatusToggleButton>
              ))}
            </div>
          </div>
          <div>
            <ParamBuilder value={serializeParamDefs(overrideParams)} onChange={(next) => updateOverride(parseParamDefs(next))} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t('admin.params.profileAdd')}</p>
            <ParamBuilder
              value={serializeParamDefs(profile.add ?? [])}
              onChange={(next) => updateProfile({ ...profile, add: parseParamDefs(next) })}
            />
          </div>
        </div>
      )}
      <AppStatusSurface tone={audit.errors.length > 0 ? 'danger' : 'neutral'} className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{t('admin.params.audit.params', { count: audit.params.length })}</span>
          <span>{t('admin.params.audit.rules', { count: audit.schemaRuleCount })}</span>
          <span>{audit.errors.length > 0 ? t('admin.params.audit.invalid') : t('admin.params.audit.valid')}</span>
        </div>
        {audit.params.length > 0 && (
          <div className="font-mono text-[11px] text-muted-foreground break-all">
            {audit.params.map((param) => param.key).join(', ')}
          </div>
        )}
        {auditRuleTypes.total > 0 && (
          <div className="text-[11px] text-muted-foreground">
            {formatParamRuleTypeSummary(auditRuleTypes, t)}
          </div>
        )}
        {visibleAuditErrors.map((error) => (
          <div key={error}>{error}</div>
        ))}
        {hiddenAuditErrorCount > 0 && (
          <div>{t('admin.params.audit.moreErrors', { count: hiddenAuditErrorCount })}</div>
        )}
        {visibleAuditWarnings.map((warning) => (
          <div key={warning} className="text-muted-foreground">{warning}</div>
        ))}
        {hiddenAuditWarningCount > 0 && (
          <div className="text-muted-foreground">{t('admin.params.audit.moreWarnings', { count: hiddenAuditWarningCount })}</div>
        )}
      </AppStatusSurface>
      {adapterType && capabilities.length > 0 && (
        <AppStatusSurface tone={audit.errors.length > 0 ? 'danger' : 'neutral'} className="space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{t('admin.params.backendPreview.title')}</span>
            {audit.errors.length > 0 && <span>{t('admin.params.backendPreview.skipped')}</span>}
            {audit.errors.length === 0 && <span>{t('admin.params.backendPreview.valid')}</span>}
            {audit.errors.length === 0 && (
              <>
                <span>{t('admin.params.audit.params', { count: contractPreviewParams.length })}</span>
                <span>{t('admin.params.audit.rules', { count: audit.schemaRuleCount })}</span>
              </>
            )}
          </div>
          {contractPreviewParams.length > 0 && (
            <>
              <div className="font-mono text-[11px] text-muted-foreground break-all">
                {contractPreviewParams.map((param) => param.key).join(', ')}
              </div>
              {contractPreviewRuleTypes.total > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  {formatParamRuleTypeSummary(contractPreviewRuleTypes, t)}
                </div>
              )}
              <div className="text-[11px] text-muted-foreground">
                {t('admin.params.backendPreview.agentContract', {
                  version: contractPreviewAgentContract.contract_version,
                  keys: contractPreviewAgentContract.supported_param_keys.join(', ') || t('admin.params.noneValue'),
                })}
              </div>
              <CopyCompactContractButton contract={contractPreviewAgentContract} />
            </>
          )}
          {audit.errors.length > 0 && (
            <div>{t('admin.params.backendPreview.skippedHint')}</div>
          )}
        </AppStatusSurface>
      )}
    </div>
  )
}

function agentInputRequirementsForAdmin(
  capabilities: string[],
  acceptsImageInput: boolean,
  maxInputImages: number,
  maxInputVideos: number,
): AgentCompactParamContract['input_requirements'] {
  const image = { min: 0, max: 0 }
  const video = { min: 0, max: 0 }
  if (acceptsImageInput) image.max = 1
  if (isValidInputLimit(maxInputImages) && maxInputImages !== 0) image.max = maxInputImages
  if (isValidInputLimit(maxInputVideos) && maxInputVideos !== 0) video.max = maxInputVideos
  if (capabilities.includes('image_edit') || capabilities.includes('video_i2v')) {
    image.min = 1
    if (image.max === 0) image.max = 1
  }
  if (capabilities.includes('video_v2v')) {
    video.min = 1
    if (video.max === 0) video.max = 1
  }
  return { image, video }
}

function CopyCompactContractButton({ contract }: { contract: unknown }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const text = JSON.stringify(contract, null, 2)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1200)
        })
      }}
      className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground"
    >
      {copied ? (
        <AppFeedbackText as="span" tone="success" className="inline-flex">
          <Check size={11} />
        </AppFeedbackText>
      ) : <Copy size={11} />}
      {copied ? t('admin.params.backendPreview.copiedAgentContract') : t('admin.params.backendPreview.copyAgentContract')}
    </button>
  )
}

function formatParamRuleTypeSummary(summary: ParamRuleTypeSummary, t: (key: string, options?: Record<string, unknown>) => string): string {
  const parts: string[] = []
  if (summary.conflicts > 0) parts.push(t('admin.params.audit.ruleTypes.conflicts', { count: summary.conflicts }))
  if (summary.conditionalEnums > 0) parts.push(t('admin.params.audit.ruleTypes.conditionalEnums', { count: summary.conditionalEnums }))
  if (summary.conditionalConsts > 0) parts.push(t('admin.params.audit.ruleTypes.conditionalConsts', { count: summary.conditionalConsts }))
  if (summary.requiresValues > 0) parts.push(t('admin.params.audit.ruleTypes.requiresValues', { count: summary.requiresValues }))
  return parts.join(' · ')
}

function ProviderInstanceConfigDraftPanel({ instance }: { instance: ProviderInstance }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [config, setConfig] = useState<Record<string, string>>({})
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [applyResult, setApplyResult] = useState<ProviderInstanceConfigApplyResult | null>(null)
  const [activationResult, setActivationResult] = useState<ProviderInstanceConfigActivationResult | null>(null)

  const draftQuery = useQuery<ProviderInstanceConfigDraft>({
    queryKey: ['admin', 'provider-instance-config', instance.id],
    queryFn: () => api.get(`/admin/provider-instances/${instance.id}/config`).then((r) => r.data),
  })

  useEffect(() => {
    if (!draftQuery.data) return
    const nextConfig: Record<string, string> = {}
    draftQuery.data.config_fields.forEach((field) => {
      nextConfig[field.key] = draftQuery.data?.config[field.key] ?? ''
    })
    setConfig(nextConfig)
    setSecrets({})
  }, [draftQuery.data, instance.id])

  const saveDraft = useMutation({
    mutationFn: () => api.put(`/admin/provider-instances/${instance.id}/config`, { config, secrets }),
    onSuccess: () => {
      setSecrets({})
      setApplyResult(null)
      setActivationResult(null)
      qc.invalidateQueries({ queryKey: ['admin', 'provider-instance-config', instance.id] })
      qc.invalidateQueries({ queryKey: ['admin', 'provider-instances'] })
    },
  })

  const applyDraft = useMutation({
    mutationFn: () => api.post(`/admin/provider-instances/${instance.id}/config/apply`, {}).then((r) => r.data as ProviderInstanceConfigApplyResult),
    onSuccess: (result) => {
      setApplyResult(result)
      setActivationResult(null)
      qc.invalidateQueries({ queryKey: ['admin', 'provider-instance-config', instance.id] })
      qc.invalidateQueries({ queryKey: ['admin', 'provider-instances'] })
    },
  })

  const activateDraft = useMutation({
    mutationFn: (endpoint: string) => api.post(endpoint).then((r) => r.data as ProviderInstanceConfigActivationResult),
    onSuccess: (result) => {
      setActivationResult(result)
      qc.invalidateQueries({ queryKey: ['admin', 'provider-instances'] })
    },
  })

  if (draftQuery.isLoading) {
    return <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
  }
  if (draftQuery.isError) {
    return <AppInlineError>{translateAPIRequestError(draftQuery.error)}</AppInlineError>
  }

  const draft = draftQuery.data
  const configFields = draft?.config_fields ?? instance.config_fields
  const secretFields = draft?.secret_fields ?? instance.secret_fields
  const activationPlan = applyResult?.activation_plan
  const canOpenActivationURL = Boolean(activationPlan?.can_auto_apply && activationPlan.auto_apply_url)
  const canTriggerActivationEndpoint = Boolean(activationPlan?.can_auto_apply && activationPlan.auto_apply_endpoint)

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {configFields.map((field) => (
          <div key={field.key} className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {field.key}
              {field.required && <AppRequiredMark />}
            </Label>
            <Input
              className="h-8 text-xs font-mono"
              value={config[field.key] ?? ''}
              onChange={(e) => setConfig((current) => ({ ...current, [field.key]: e.target.value }))}
            />
          </div>
        ))}
        {secretFields.map((field) => (
          <div key={field.key} className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {field.key}
              {field.required && <AppRequiredMark />}
              {field.configured && (
                <StatusBadge intent="success" className="ml-1 text-[11px]">
                  {t('admin.models.secretConfigured')}
                </StatusBadge>
              )}
            </Label>
            <Input
              type="password"
              className="h-8 text-xs font-mono"
              value={secrets[field.key] ?? ''}
              placeholder={field.configured ? t('admin.models.secretKeepPlaceholder') : ''}
              onChange={(e) => setSecrets((current) => ({ ...current, [field.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      {saveDraft.isError && <AppInlineError>{translateAPIRequestError(saveDraft.error)}</AppInlineError>}
      {applyDraft.isError && <AppInlineError>{translateAPIRequestError(applyDraft.error)}</AppInlineError>}
      {activateDraft.isError && <AppInlineError>{translateAPIRequestError(activateDraft.error)}</AppInlineError>}
      {applyResult && (
        <AppStatusSurface tone="neutral" className="space-y-1">
          <div>{t('admin.models.providerConfigApplied')}</div>
          <div>{t(`admin.models.providerActivationModes.${applyResult.activation_mode}`, { defaultValue: t('admin.models.providerActivationModes.manual_restart') })}</div>
          {activationPlan && (
            <>
              <div>{t(`admin.models.providerActivationActions.${activationPlan.action}`, { defaultValue: activationPlan.action })}</div>
              <div>{t('admin.models.providerActivationHost', { host: activationPlan.host })}</div>
              <div>
                {canOpenActivationURL || canTriggerActivationEndpoint
                  ? t('admin.models.providerActivationAutoApplyAvailable')
                  : t('admin.models.providerActivationAutoApplyUnavailable')}
              </div>
              {activationResult && (
                <AppFeedbackText as="div" tone={activationResult.success ? 'success' : 'danger'} className="text-xs">
                  {activationResult.message || t('admin.models.providerActivationAutoApplyDone')}
                </AppFeedbackText>
              )}
              {canOpenActivationURL && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 w-fit"
                  onClick={() => {
                    window.location.href = activationPlan.auto_apply_url ?? ''
                  }}
                >
                  <RefreshCw size={14} />
                  {t('admin.models.providerActivationAutoApplyOpen')}
                </Button>
              )}
              {canTriggerActivationEndpoint && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 w-fit"
                  onClick={() => {
                    if (activationPlan.auto_apply_endpoint) activateDraft.mutate(activationPlan.auto_apply_endpoint)
                  }}
                  disabled={activateDraft.isPending}
                >
                  <RefreshCw size={14} />
                  {activateDraft.isPending
                    ? t('admin.models.providerActivationAutoApplying')
                    : t('admin.models.providerActivationAutoApplyRun')}
                </Button>
              )}
            </>
          )}
          <div className="font-mono break-all">{applyResult.env_path}</div>
          <div className="font-mono break-all">{applyResult.env_keys.join(', ')}</div>
        </AppStatusSurface>
      )}
      <div className="flex items-center justify-between gap-3">
        {draft?.requires_restart ? (
          <StatusBadge intent="warning" className="text-xs">
            {t('admin.models.requiresRestart')}
          </StatusBadge>
        ) : <span />}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => saveDraft.mutate()} disabled={saveDraft.isPending || applyDraft.isPending || activateDraft.isPending}>
            {saveDraft.isPending ? t('common.saving') : t('common.save')}
          </Button>
          <Button size="sm" onClick={() => applyDraft.mutate()} disabled={saveDraft.isPending || applyDraft.isPending || activateDraft.isPending}>
            {applyDraft.isPending ? t('admin.models.applyingConfig') : t('admin.models.applyConfig')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Model Management ──────────────────────────────────────────────────────────

type ModelManagementViewMode = 'providers' | 'catalog' | 'routes'
type ModelProviderStatusFilter = 'all' | 'ready' | 'missing' | 'disabled'
type ModelCatalogStatusFilter = 'all' | 'enabled' | 'disabled'
type ModelCatalogRouteFilter = 'all' | 'with-routes' | 'missing-routes'
type ModelRouteCoverageFilter = 'all' | 'missing-routes' | 'disabled-routes'

const MODEL_ADMIN_PAGE_SIZE = 25
const MODEL_ADMIN_PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

function defaultModelManagementViewMode(): ModelManagementViewMode {
  return runtimeCapabilities.relayGatewayGroup ? 'routes' : 'providers'
}

function modelManagementRoute(view: ModelManagementViewMode): string {
  switch (view) {
    case 'catalog':
      return '/models/catalog'
    case 'routes':
      return '/models/routes'
    default:
      return '/models/providers'
  }
}

const modelManagementSectionMeta: Array<{
  id: ModelManagementViewMode
  icon: typeof Settings2
  label: string
  description: string
}> = [
  {
    id: 'providers',
    icon: Settings2,
    label: 'API账号管理',
    description: '供应商账号、密钥完整性、连接测试',
  },
  {
    id: 'catalog',
    icon: Database,
    label: '模型管理',
    description: '对外 model id、能力、参数和输入约束',
  },
  {
      id: 'routes',
      icon: RouteIcon,
      label: '路由管理',
      description: '模型到 Provider 通道的覆盖关系',
  },
]

function normalizeModelAdminSearch(value: string): string {
  return value.trim().toLowerCase()
}

function modelAdminTextMatches(search: string, values: Array<string | number | undefined | null>): boolean {
  const needle = normalizeModelAdminSearch(search)
  if (!needle) return true
  return values.some((value) => String(value ?? '').toLowerCase().includes(needle))
}

function modelAdminPaginationSlice<T>(items: T[], page: number, pageSize: number): { items: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const normalizedPage = Math.max(1, Math.min(page, pageCount))
  return {
    page: normalizedPage,
    pageCount,
    items: items.slice((normalizedPage - 1) * pageSize, normalizedPage * pageSize),
  }
}

function ModelAdminSearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="relative min-w-0 flex-1 sm:min-w-[220px]">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-9 pl-8 text-sm" />
    </label>
  )
}

function ModelAdminPageSizeSelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      每页
      <select value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground">
        {MODEL_ADMIN_PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

function providerInstanceReady(instance: ProviderInstance): boolean {
  const missingConfig = instance.config_fields.some((field) => field.required && !field.configured)
  const missingSecret = instance.secret_fields.some((field) => field.required && !field.configured)
  return instance.enabled && instance.configured && !missingConfig && !missingSecret
}

function providerInstanceRef(instance: ProviderInstance): ProviderInstance['ref'] {
  return instance.ref
}

function ModelRouteMatrix({
  entries,
  routeProviders,
  onOpenRouteForm,
}: {
  entries: AIModelCatalogEntry[]
  routeProviders: RouteProviderOption[]
  onOpenRouteForm: (entryId: number, routeGroup?: string) => void
}) {
  const { t } = useTranslation()
  const routeProviderByID = new Map(routeProviders.map((provider) => [provider.provider_id, provider]))
  const enabledEntries = entries.filter((entry) => entry.is_enabled).length
  const routeGroups = buildModelRouteGroups(entries)
  const routeBindings = routeGroups.flatMap((group) => group.bindings)
  const enabledCandidates = routeBindings.filter((binding) => binding.is_enabled).length
  const unmappedEntries = entries.filter((entry) => (entry.route_bindings ?? []).length === 0).length

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">{t('admin.models.routeMatrixTitle', { defaultValue: 'Route Resolution Table' })}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('admin.models.routeMatrixHint', { defaultValue: '按 Public Model ID + Route Group 聚合，展示运行时会进入的 provider 候选列表。' })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-md border border-border bg-background px-2 py-1">
            {t('admin.models.routeMatrixEnabledEntries', { defaultValue: '{{count}} 个启用 entry', count: enabledEntries })}
          </span>
          <span className="rounded-md border border-border bg-background px-2 py-1">
            {t('admin.models.routeMatrixGroups', { defaultValue: '{{count}} 个 model+group', count: routeGroups.length })}
          </span>
          <span className="rounded-md border border-border bg-background px-2 py-1">
            {t('admin.models.routeMatrixCandidates', { defaultValue: '{{count}} 个启用候选', count: enabledCandidates })}
          </span>
          {unmappedEntries > 0 && (
            <StatusBadge intent="warning" className="text-xs">
              {t('admin.models.routeMatrixUnmapped', { defaultValue: '{{count}} 个未映射', count: unmappedEntries })}
            </StatusBadge>
          )}
        </div>
      </div>
      <div className="space-y-2 p-3">
        {entries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('admin.modelCatalog.empty')}</p>
        ) : routeGroups.map((group) => {
          const sortedBindings = sortRouteBindings(group.bindings)
          const activePool = routeGroupActivePool(sortedBindings)
          const fallbackPriorities = routeGroupFallbackPriorities(sortedBindings)
          return (
            <div key={group.key} className="grid gap-3 rounded-lg border border-border bg-background p-3 md:grid-cols-[minmax(210px,0.95fr)_minmax(0,1.75fr)_minmax(150px,0.6fr)_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">{catalogEntryLabel(group.entry)}</p>
                  <StatusBadge intent={group.entry.is_enabled ? 'success' : 'neutral'}>
                    {group.entry.is_enabled ? t('admin.modelCatalog.enabled') : t('admin.modelCatalog.disabled')}
                  </StatusBadge>
                </div>
                <p className="mt-1 truncate font-mono text-xs text-foreground">{group.entry.public_model_id}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
                    {t('admin.modelCatalog.routeGroup')}: {routeGroupDisplayName(group.routeGroup, t)}
                  </span>
                  {modelCatalogCapabilities(group.entry).slice(0, 3).map((capability) => (
                    <StatusBadge key={capability} intent={CAPABILITY_STATUS_INTENT[capability] ?? 'neutral'} className="text-xs">
                      {t(CAPABILITY_TRANSLATION_KEYS[capability] ?? capability)}
                    </StatusBadge>
                  ))}
                </div>
              </div>
              <div className="min-w-0">
                {sortedBindings.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-card px-3 py-3 text-xs text-muted-foreground">
                    {t('admin.models.routeMatrixNoCandidates', { defaultValue: '这个 model+group 还没有候选 provider。' })}
                  </p>
                ) : (
                  <div className="grid gap-2 lg:grid-cols-2">
                    {sortedBindings.map((binding) => {
                      const provider = routeProviderForBinding(binding, routeProviderByID)
                      return (
                        <div key={binding.ID} className={cn('rounded-md border px-3 py-2 text-xs', binding.is_enabled ? 'border-border bg-card' : 'border-border bg-muted/30 opacity-75')}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">
                                {routeBindingProviderLabel(binding, provider, t)}
                              </p>
                              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                                {binding.provider_id || binding.source_type || '-'}
                              </p>
                              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                                adapter: {binding.adapter_type || routeProviderAdapterLabel(provider)}
                              </p>
                            </div>
                            <StatusBadge intent={binding.is_enabled ? 'success' : 'neutral'} className="shrink-0 text-[11px]">
                              {binding.is_enabled ? t('admin.modelCatalog.enabled') : t('admin.modelCatalog.disabled')}
                            </StatusBadge>
                          </div>
                          <div className="mt-2 rounded border border-border bg-background px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                            <span className="text-foreground">{group.entry.public_model_id}</span>
                            <span className="px-1.5">=&gt;</span>
                            <span className="text-foreground">{binding.provider_model_id || group.entry.public_model_id}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span>{t('admin.models.priority')}: {binding.priority ?? 0}</span>
                            <span>{t('admin.models.capacityWeight')}: {binding.capacity_weight ?? 1}</span>
                            <span>{t('admin.models.maxConcurrency')}: {binding.max_concurrency > 0 ? binding.max_concurrency : t('admin.models.runtimeHealthUnlimited')}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="min-w-0 rounded-md border border-border bg-card px-3 py-2 text-xs">
                {activePool ? (
                  <>
                    <p className="font-medium text-foreground">
                      {t('admin.models.routeMatrixActivePool', { defaultValue: '当前运行池' })}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {t('admin.models.routeMatrixPriorityPool', { defaultValue: '优先级 {{priority}} · {{count}} 个候选', priority: activePool.priority, count: activePool.count })}
                    </p>
                    {fallbackPriorities.length > 0 && (
                      <p className="mt-1 truncate text-muted-foreground">
                        {t('admin.models.routeMatrixFallbackPool', { defaultValue: 'fallback: {{priorities}}', priorities: fallbackPriorities.join(', ') })}
                      </p>
                    )}
                  </>
                ) : sortedBindings.length > 0 ? (
                  <>
                    <p className="font-medium text-muted-foreground">{t('admin.models.routeMatrixAllDisabled', { defaultValue: '全部停用' })}</p>
                    <p className="mt-1 text-muted-foreground">{t('admin.models.routeMatrixDisabledHint', { defaultValue: '这个 model+group 当前不会接流量。' })}</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-muted-foreground">{t('admin.models.routeMatrixUnconfigured', { defaultValue: '未配置' })}</p>
                    <p className="mt-1 text-muted-foreground">{t('admin.modelCatalog.noRoutes')}</p>
                  </>
                )}
              </div>
              <div className="flex items-start justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenRouteForm(group.entry.ID, group.routeGroup)}>
                  <Plus size={13} className="mr-1.5" />
                  {sortedBindings.length === 0
                    ? t('admin.modelCatalog.addRoute')
                    : t('admin.models.addRouteCandidate', { defaultValue: '新增候选' })}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function buildModelRouteGroups(entries: AIModelCatalogEntry[]): ModelRouteGroup[] {
  return entries.flatMap((entry) => {
    const bindings = entry.route_bindings ?? []
    if (bindings.length === 0) {
      return [{
        key: modelRouteGroupKey(entry.ID, ''),
        entry,
        routeGroup: '',
        bindings: [],
      }]
    }
    const groups = new Map<string, ModelRouteGroup>()
    bindings.forEach((binding) => {
      const routeGroup = (binding.route_group ?? '').trim()
      const key = modelRouteGroupKey(entry.ID, routeGroup)
      const group = groups.get(key) ?? {
        key,
        entry,
        routeGroup,
        bindings: [],
      }
      group.bindings.push(binding)
      groups.set(key, group)
    })
    return [...groups.values()].sort((a, b) => {
      if (a.routeGroup === b.routeGroup) return 0
      if (!a.routeGroup) return -1
      if (!b.routeGroup) return 1
      return a.routeGroup.localeCompare(b.routeGroup)
    })
  })
}

function modelRouteGroupKey(entryID: number, routeGroup: string): string {
  return `${entryID}:${routeGroup || '__default__'}`
}

function sortRouteBindings(bindings: AIModelRouteBinding[]): AIModelRouteBinding[] {
  return [...bindings].sort((a, b) => (
    Number(b.is_enabled) - Number(a.is_enabled) ||
    (b.priority ?? 0) - (a.priority ?? 0) ||
    (b.capacity_weight ?? 1) - (a.capacity_weight ?? 1) ||
    routeBindingStableKey(a).localeCompare(routeBindingStableKey(b))
  ))
}

function routeBindingStableKey(binding: AIModelRouteBinding): string {
  return [
    binding.provider_id || '',
    binding.provider_model_id || '',
    String(binding.ID),
  ].join(':')
}

function routeGroupDisplayName(routeGroup: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  return routeGroup.trim() || t('admin.modelCatalog.defaultRouteGroup', { defaultValue: '默认分组' })
}

function credentialIDFromProviderID(providerID?: string): number | null {
  const value = providerID?.trim() ?? ''
  if (!value.startsWith('local_provider:')) return null
  const id = Number(value.slice('local_provider:'.length))
  return Number.isFinite(id) && id > 0 ? id : null
}

function routeProviderForBinding(binding: AIModelRouteBinding, providerByID: Map<string, RouteProviderOption>): RouteProviderOption | undefined {
  const providerID = binding.provider_id || ''
  return providerID ? providerByID.get(providerID) : undefined
}

function routeBindingProviderLabel(binding: AIModelRouteBinding, provider: RouteProviderOption | undefined, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (binding.source_type === 'relay_gateway') {
    return t('admin.modelCatalog.relayGatewayRoute')
  }
  return provider?.display_name || binding.provider_id || t('admin.modelCatalog.localProviderRoute')
}

function routeGroupActivePool(bindings: AIModelRouteBinding[]): { priority: number; count: number } | null {
  const enabled = bindings.filter((binding) => binding.is_enabled)
  if (enabled.length === 0) return null
  const priority = Math.max(...enabled.map((binding) => binding.priority ?? 0))
  return {
    priority,
    count: enabled.filter((binding) => (binding.priority ?? 0) === priority).length,
  }
}

function routeGroupFallbackPriorities(bindings: AIModelRouteBinding[]): number[] {
  const active = routeGroupActivePool(bindings)
  if (!active) return []
  return [...new Set(
    bindings
      .filter((binding) => binding.is_enabled && (binding.priority ?? 0) < active.priority)
      .map((binding) => binding.priority ?? 0),
  )].sort((a, b) => b - a)
}

function ModelManagementLayerNav({
  activeView,
  onChange,
}: {
  activeView: ModelManagementViewMode
  onChange: (view: ModelManagementViewMode) => void
}) {
  return (
    <nav className="inline-flex w-full flex-col gap-1 rounded-lg border border-border bg-muted/30 p-1 md:w-auto md:flex-row" aria-label="AI provider configuration layers" role="tablist">
      {modelManagementSectionMeta.map((section) => {
        const Icon = section.icon
        const active = section.id === activeView
        return (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(section.id)}
            className={`min-w-0 rounded-md px-3 py-2 text-left transition-colors md:w-64 ${active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'}`}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Icon size={15} />
              {section.label}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{section.description}</span>
          </button>
        )
      })}
    </nav>
  )
}

function ProviderRegistrySummary({
  providers,
  adapters,
  providerTemplates,
  comboTemplates,
  enablingComboKey,
  onEnableCombo,
}: {
  providers: AIProvider[]
  adapters: AdapterDef[]
  providerTemplates: NonNullable<AIProviderTemplatesResponse['items']>
  comboTemplates: NonNullable<AIComboTemplatesResponse['items']>
  enablingComboKey?: string | null
  onEnableCombo: (comboTemplateKey: string, providerID: string) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [credentialDraft, setCredentialDraft] = useState<{ providerID: string; credentialKey: string; fields: Record<string, string> } | null>(null)
  const [deploymentAssetForm, setDeploymentAssetForm] = useState<ProviderAssetSettings>(emptyProviderAssetSettings)
  const [deploymentAssetSaved, setDeploymentAssetSaved] = useState(false)
  const [providerAssetForms, setProviderAssetForms] = useState<Record<string, ProviderAssetSettings>>({})
  const [providerAssetSavedID, setProviderAssetSavedID] = useState<string | null>(null)
  const [providerAssetSavingID, setProviderAssetSavingID] = useState<string | null>(null)
  const [providerAssetError, setProviderAssetError] = useState<{ providerID: string; error: unknown } | null>(null)
  const adapterByType = new Map(adapters.map((adapter) => [adapter.adapter_type, adapter]))
  const enabledProviders = providers.filter((provider) => provider.is_enabled)
  const enabledProviderByKind = new Map(enabledProviders.map((provider) => [providerAccountKey(provider), provider]))
  const enabledCombos = comboTemplates.filter((template) => template.is_enabled)
  const officialTemplates = providerTemplates.filter((template) => template.provider_category === 'official_platform')
  const aggregatorTemplates = providerTemplates.filter((template) => template.provider_category === 'aggregator_gateway')
  const assetLibraryTemplateCount = providerTemplates.filter((template) => recordFromUnknown(template.capabilities_json).asset_library === true).length
  const assetLibraryProviderCount = providers.filter((provider) => parseJSONRecord(provider.asset_library_state_json).supports_asset_library === true).length
  const refreshProviders = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'providers'] })
    qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
    qc.invalidateQueries({ queryKey: ['admin', 'provider-instances'] })
  }
  const deploymentAssetSettingsQuery = useQuery<ProviderAssetSettings>({
    queryKey: ['admin', 'settings', 'provider-assets'],
    queryFn: () => api.get('/admin/settings/provider-assets').then((r) => r.data),
    enabled: assetLibraryTemplateCount > 0 || assetLibraryProviderCount > 0,
  })
  useEffect(() => {
    if (!deploymentAssetSettingsQuery.data) return
    setDeploymentAssetForm({
      ...emptyProviderAssetSettings,
      ...deploymentAssetSettingsQuery.data,
      ark_openapi_base_url: deploymentAssetSettingsQuery.data.ark_openapi_base_url || emptyProviderAssetSettings.ark_openapi_base_url,
      ark_region: deploymentAssetSettingsQuery.data.ark_region || emptyProviderAssetSettings.ark_region,
      signing_secret: '',
      ark_secret_access_key: '',
    })
  }, [deploymentAssetSettingsQuery.data])
  const createProviderCredential = useMutation({
    mutationFn: (draft: NonNullable<typeof credentialDraft>) =>
      api.post(`/admin/providers/${encodeURIComponent(draft.providerID)}/credentials`, {
        credential_key: draft.credentialKey,
        credentials: draft.fields,
      }).then((r) => r.data),
    onSuccess: () => {
      setCredentialDraft(null)
      refreshProviders()
    },
  })
  const updateDeploymentAssetSettings = useMutation({
    mutationFn: (payload: ProviderAssetSettings) => api.put('/admin/settings/provider-assets', payload).then((r) => r.data as ProviderAssetSettings),
    onSuccess: (updated) => {
      setDeploymentAssetSaved(true)
      setDeploymentAssetForm({ ...emptyProviderAssetSettings, ...updated, signing_secret: '', ark_secret_access_key: '' })
      qc.setQueryData(['admin', 'settings', 'provider-assets'], updated)
      refreshProviders()
      setTimeout(() => setDeploymentAssetSaved(false), 2000)
    },
  })
  const updateProviderAssetLibrarySettings = useMutation({
    mutationFn: ({ providerID, payload }: { providerID: string; payload: ProviderAssetSettings }) =>
      api.put(`/admin/providers/${encodeURIComponent(providerID)}/asset-library`, payload).then((r) => r.data as ProviderAssetSettings),
    onMutate: ({ providerID }) => {
      setProviderAssetSavingID(providerID)
      setProviderAssetError(null)
    },
    onSuccess: (updated, { providerID }) => {
      setProviderAssetForms((current) => ({
        ...current,
        [providerID]: { ...emptyProviderAssetSettings, ...updated, ark_secret_access_key: '' },
      }))
      setProviderAssetSavedID(providerID)
      refreshProviders()
      setTimeout(() => setProviderAssetSavedID((current) => (current === providerID ? null : current)), 2000)
    },
    onError: (error, { providerID }) => {
      setProviderAssetError({ providerID, error })
    },
    onSettled: () => {
      setProviderAssetSavingID(null)
    },
  })
  function patchDeploymentAssetSettings(patch: Partial<ProviderAssetSettings>) {
    setDeploymentAssetForm((current) => ({ ...current, ...patch }))
  }
  function submitDeploymentAssetSettings() {
    updateDeploymentAssetSettings.mutate({
      ...deploymentAssetForm,
      public_base_url: deploymentAssetForm.public_base_url?.trim() ?? '',
      signing_secret: deploymentAssetForm.signing_secret?.trim() ?? '',
      ark_openapi_base_url: deploymentAssetForm.ark_openapi_base_url?.trim() || emptyProviderAssetSettings.ark_openapi_base_url,
      ark_region: deploymentAssetForm.ark_region?.trim() || emptyProviderAssetSettings.ark_region,
      ark_access_key_id: deploymentAssetForm.ark_access_key_id?.trim() ?? '',
      ark_secret_access_key: deploymentAssetForm.ark_secret_access_key?.trim() ?? '',
    })
  }
  function providerAssetFormFor(provider: AIProvider): ProviderAssetSettings {
    return providerAssetForms[provider.provider_id] ?? providerAssetSettingsFromProviderState(provider)
  }
  function patchProviderAssetLibrarySettings(providerID: string, patch: Partial<ProviderAssetSettings>) {
    const provider = providers.find((item) => item.provider_id === providerID)
    const base = provider ? providerAssetFormFor(provider) : emptyProviderAssetSettings
    setProviderAssetForms((current) => ({
      ...current,
      [providerID]: { ...base, ...(current[providerID] ?? {}), ...patch },
    }))
  }
  function submitProviderAssetLibrarySettings(provider: AIProvider) {
    const form = providerAssetFormFor(provider)
    updateProviderAssetLibrarySettings.mutate({
      providerID: provider.provider_id,
      payload: {
        ark_openapi_base_url: form.ark_openapi_base_url?.trim() || emptyProviderAssetSettings.ark_openapi_base_url,
        ark_region: form.ark_region?.trim() || emptyProviderAssetSettings.ark_region,
        ark_access_key_id: form.ark_access_key_id?.trim() ?? '',
        ark_secret_access_key: form.ark_secret_access_key?.trim() ?? '',
        signing_secret_set: false,
        ark_secret_key_set: form.ark_secret_key_set,
      },
    })
  }
  const setProviderCredentialPrimary = useMutation({
    mutationFn: ({ providerID, credentialKey }: { providerID: string; credentialKey: string }) =>
      api.post(`/admin/providers/${encodeURIComponent(providerID)}/credentials/${encodeURIComponent(credentialKey)}/primary`, {}).then((r) => r.data),
    onSuccess: refreshProviders,
  })
  const updateProviderCredential = useMutation({
    mutationFn: ({ providerID, credentialKey, status }: { providerID: string; credentialKey: string; status: string }) =>
      api.patch(`/admin/providers/${encodeURIComponent(providerID)}/credentials/${encodeURIComponent(credentialKey)}`, { status }).then((r) => r.data),
    onSuccess: refreshProviders,
  })
  return (
    <section className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Provider Registry</p>
            <p className="mt-1 text-xs text-muted-foreground">Provider 类型由后端模板枚举；用户实例只挂到这些类型上。</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge intent="neutral">{providerTemplates.length} templates</StatusBadge>
            <StatusBadge intent="success">{enabledProviders.length} enabled</StatusBadge>
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {providerTemplates.slice(0, 6).map((template) => (
            <div key={providerAccountKey(template)} className="rounded-md border border-border bg-background px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">{template.display_name || template.provider_kind}</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{providerAccountLabel(template)}</p>
                </div>
                <StatusBadge intent={template.provider_category === 'official_platform' ? 'success' : 'neutral'} className="text-[11px]">
                  {template.provider_category}
                </StatusBadge>
              </div>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">{providerTemplateDefaultAdapter(template)} · {template.default_base_url_prefix || 'custom base url'}</p>
            </div>
          ))}
          {providerTemplates.length === 0 && (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">暂无 Provider 模板。</p>
          )}
        </div>
        {(assetLibraryTemplateCount > 0 || assetLibraryProviderCount > 0) && (
          <ProviderAssetSettingsPanel
            form={deploymentAssetForm}
            isLoading={deploymentAssetSettingsQuery.isLoading}
            isSaving={updateDeploymentAssetSettings.isPending}
            isSaved={deploymentAssetSaved}
            error={deploymentAssetSettingsQuery.error || updateDeploymentAssetSettings.error}
            onPatch={patchDeploymentAssetSettings}
            onSubmit={submitDeploymentAssetSettings}
          />
        )}
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{t('admin.providers.keysTitle', { defaultValue: 'Provider Keys' })}</p>
            <StatusBadge intent="neutral">{providers.length} providers</StatusBadge>
          </div>
          <div className="mt-2 space-y-2">
            {providers.map((provider) => {
              const adapter = adapterByType.get(providerDefaultAdapter(provider))
              const keyFields = adapter?.cred_fields.filter((field) => field.key !== 'base_url') ?? [{ key: 'api_key', label: 'API Key', required: true }]
              const draftOpen = credentialDraft?.providerID === provider.provider_id
              const modelCredentials = (provider.credentials ?? []).filter((credential) => credential.credential_kind !== 'ark_openapi')
              return (
                <div key={provider.provider_id} className="rounded-md border border-border bg-background px-3 py-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{provider.display_name || provider.provider_id}</p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{provider.provider_id}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setCredentialDraft(draftOpen ? null : { providerID: provider.provider_id, credentialKey: '', fields: {} })}
                    >
                      {draftOpen ? t('common.cancel') : t('admin.providers.addKey', { defaultValue: 'Add key' })}
                    </Button>
                  </div>
                  <div className="mt-2 space-y-1">
                    <ProviderRuntimeStateSummary provider={provider} />
                    {providerSupportsAssetLibrary(provider) && (
                      <ProviderAssetLibrarySettingsPanel
                        form={providerAssetFormFor(provider)}
                        isSaving={providerAssetSavingID === provider.provider_id}
                        isSaved={providerAssetSavedID === provider.provider_id}
                        error={providerAssetError?.providerID === provider.provider_id ? providerAssetError.error : null}
                        onPatch={(patch) => patchProviderAssetLibrarySettings(provider.provider_id, patch)}
                        onSubmit={() => submitProviderAssetLibrarySettings(provider)}
                      />
                    )}
                    {modelCredentials.map((credential) => (
                      <div key={credential.credential_key} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/70 px-2 py-1.5 text-xs">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-foreground">{credential.credential_key}</span>
                            {credential.is_primary && <StatusBadge intent="success" className="text-[11px]">{t('admin.providers.primaryKey', { defaultValue: 'primary' })}</StatusBadge>}
                            <StatusBadge intent={credential.status === 'active' ? 'success' : credential.status === 'disabled' ? 'neutral' : 'warning'} className="text-[11px]">
                              {credential.status}
                            </StatusBadge>
                          </div>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{providerCredentialMaskedKey(credential)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {credential.status === 'active' && !credential.is_primary && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={setProviderCredentialPrimary.isPending}
                              onClick={() => setProviderCredentialPrimary.mutate({ providerID: provider.provider_id, credentialKey: credential.credential_key })}
                            >
                              {t('admin.providers.setPrimary', { defaultValue: 'Set primary' })}
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={updateProviderCredential.isPending}
                            onClick={() => updateProviderCredential.mutate({
                              providerID: provider.provider_id,
                              credentialKey: credential.credential_key,
                              status: credential.status === 'active' ? 'disabled' : 'active',
                            })}
                          >
                            {credential.status === 'active'
                              ? t('admin.providers.disableKey', { defaultValue: 'Disable' })
                              : t('admin.providers.enableKey', { defaultValue: 'Enable' })}
                          </Button>
                        </div>
                      </div>
                    ))}
                    {modelCredentials.length === 0 && (
                      <p className="rounded border border-dashed border-border px-2 py-2 text-xs text-muted-foreground">
                        {t('admin.providers.noKeys', { defaultValue: 'No key configured.' })}
                      </p>
                    )}
                  </div>
                  {draftOpen && (
                    <div className="mt-2 rounded border border-border bg-card p-2">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block text-xs text-muted-foreground">
                          {t('admin.providers.keyName', { defaultValue: 'Key name' })}
                          <Input
                            value={credentialDraft.credentialKey}
                            onChange={(event) => setCredentialDraft({ ...credentialDraft, credentialKey: event.target.value })}
                            placeholder="backup-2026-06"
                            className="mt-1 h-8 text-xs"
                          />
                        </label>
                        {keyFields.map((field) => (
                          <label key={field.key} className="block text-xs text-muted-foreground">
                            {credentialFieldLabel(field.key, field.label, t)}{field.required && <AppRequiredMark />}
                            <Input
                              type="password"
                              value={credentialDraft.fields[field.key] ?? ''}
                              onChange={(event) => setCredentialDraft({
                                ...credentialDraft,
                                fields: { ...credentialDraft.fields, [field.key]: event.target.value },
                              })}
                              placeholder={field.hint ?? ''}
                              className="mt-1 h-8 text-xs"
                            />
                          </label>
                        ))}
                      </div>
                      {createProviderCredential.isError && (
                        <AppFeedbackText tone="danger">{translateAPIRequestError(createProviderCredential.error)}</AppFeedbackText>
                      )}
                      <div className="mt-2 flex justify-end gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setCredentialDraft(null)}>{t('common.cancel')}</Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={createProviderCredential.isPending}
                          onClick={() => credentialDraft && createProviderCredential.mutate(credentialDraft)}
                        >
                          {createProviderCredential.isPending ? t('common.saving') : t('common.save')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {providers.length === 0 && (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                {t('admin.providers.noProviders', { defaultValue: 'No Provider instance yet.' })}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Combo Templates</p>
            <p className="mt-1 text-xs text-muted-foreground">组合模板描述 Model + Provider + Route 的自动化入口。</p>
          </div>
          <StatusBadge intent="neutral">{enabledCombos.length} enabled</StatusBadge>
        </div>
        <div className="mt-3 grid gap-2">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Official</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{officialTemplates.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Gateway</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{aggregatorTemplates.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Combos</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{comboTemplates.length}</p>
            </div>
          </div>
          <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
            {comboTemplates.slice(0, 8).map((template) => (
              <div key={template.combo_template_key} className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-mono text-foreground">{template.default_public_model_id}</p>
                  <p className="mt-0.5 truncate text-muted-foreground">{providerAccountLabel(template)} · {template.adapter_type || 'auto'} · {template.provider_model_id}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <StatusBadge intent={template.provider_category === 'official_platform' ? 'success' : 'neutral'} className="text-[11px]">
                    {template.api_kinds?.[0] ?? 'model'}
                  </StatusBadge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!enabledProviderByKind.has(providerAccountKey(template)) || enablingComboKey === template.combo_template_key}
                    onClick={() => {
                      const provider = enabledProviderByKind.get(providerAccountKey(template))
                      if (provider) onEnableCombo(template.combo_template_key, provider.provider_id)
                    }}
                  >
                    {enablingComboKey === template.combo_template_key ? '…' : t('admin.models.enableComboTemplate', { defaultValue: '启用' })}
                  </Button>
                </div>
              </div>
            ))}
            {comboTemplates.length === 0 && (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">暂无组合模板。</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function ProviderAssetSettingsPanel({
  form,
  isLoading,
  isSaving,
  isSaved,
  error,
  onPatch,
  onSubmit,
}: {
  form: ProviderAssetSettings
  isLoading: boolean
  isSaving: boolean
  isSaved: boolean
  error: unknown
  onPatch: (patch: Partial<ProviderAssetSettings>) => void
  onSubmit: () => void
}) {
  const { t } = useTranslation()
  const deploymentReady = Boolean(form.public_base_url && form.signing_secret_set)
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">部署资源访问</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">本地 RawResource 需要临时公网 URL 才能被火山素材库拉取；Ark AK/SK 在对应 Provider 下配置。</p>
        </div>
        <StatusBadge intent={deploymentReady ? 'success' : 'warning'} className="text-[11px]">
          {deploymentReady ? 'public URL ready' : 'public URL missing'}
        </StatusBadge>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <ProviderAssetSettingsField
          label={t('admin.settings.providerAssetPublicBaseUrl')}
          value={form.public_base_url ?? ''}
          onChange={(value) => onPatch({ public_base_url: value })}
          placeholder="https://your-tunnel.example.com"
        />
        <ProviderAssetSettingsField
          label={t('admin.settings.providerAssetSigningSecret')}
          value={form.signing_secret ?? ''}
          onChange={(value) => onPatch({ signing_secret: value })}
          type="password"
          placeholder={form.signing_secret_set ? t('admin.settings.providerAssetSecretSet') : undefined}
        />
      </div>
      {Boolean(error) && <AppFeedbackText tone="danger">{translateAPIRequestError(error)}</AppFeedbackText>}
      <div className="mt-3 flex justify-end gap-2">
        {isSaved && <span className="self-center text-xs text-primary">{t('admin.settings.saved')}</span>}
        <Button type="button" size="sm" onClick={onSubmit} disabled={isLoading || isSaving}>
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  )
}

function ProviderAssetLibrarySettingsPanel({
  form,
  isSaving,
  isSaved,
  error,
  onPatch,
  onSubmit,
}: {
  form: ProviderAssetSettings
  isSaving: boolean
  isSaved: boolean
  error: unknown
  onPatch: (patch: Partial<ProviderAssetSettings>) => void
  onSubmit: () => void
}) {
  const { t } = useTranslation()
  const arkReady = Boolean(form.ark_access_key_id && form.ark_secret_key_set)
  return (
    <div className="rounded border border-border/70 bg-card px-2 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-foreground">火山素材库 API</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">仅保存该 Provider 的 Ark OpenAPI 凭证和自动创建的素材组。</p>
        </div>
        <StatusBadge intent={arkReady ? 'success' : 'warning'} className="text-[11px]">
          {arkReady ? 'Ark ready' : 'AK/SK missing'}
        </StatusBadge>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <ProviderAssetSettingsField
          label={t('admin.settings.arkOpenAPIBaseUrl')}
          value={form.ark_openapi_base_url ?? ''}
          onChange={(value) => onPatch({ ark_openapi_base_url: value })}
        />
        <ProviderAssetSettingsField
          label={t('admin.settings.arkRegion')}
          value={form.ark_region ?? ''}
          onChange={(value) => onPatch({ ark_region: value })}
        />
        <ProviderAssetSettingsField
          label={t('admin.settings.arkAccessKeyId')}
          value={form.ark_access_key_id ?? ''}
          onChange={(value) => onPatch({ ark_access_key_id: value })}
        />
        <ProviderAssetSettingsField
          label={t('admin.settings.arkSecretAccessKey')}
          value={form.ark_secret_access_key ?? ''}
          onChange={(value) => onPatch({ ark_secret_access_key: value })}
          type="password"
          placeholder={form.ark_secret_key_set ? t('admin.settings.providerAssetSecretKeySet') : undefined}
        />
      </div>
      {Boolean(error) && <AppFeedbackText tone="danger">{translateAPIRequestError(error)}</AppFeedbackText>}
      <div className="mt-2 flex justify-end gap-2">
        {isSaved && <span className="self-center text-xs text-primary">{t('admin.settings.saved')}</span>}
        <Button type="button" size="sm" onClick={onSubmit} disabled={isSaving}>
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  )
}

function ProviderAssetSettingsField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 h-8 text-xs"
      />
    </label>
  )
}

function providerSupportsAssetLibrary(provider: AIProvider): boolean {
  return parseJSONRecord(provider.asset_library_state_json).supports_asset_library === true
}

function providerAssetSettingsFromProviderState(provider: AIProvider): ProviderAssetSettings {
  const settings = recordFromUnknown(parseJSONRecord(provider.asset_library_state_json).settings)
  const source = settings.ark_credentials_source === 'provider' ? 'provider' : 'missing'
  return {
    ...emptyProviderAssetSettings,
    ark_openapi_base_url: source === 'provider' && typeof settings.ark_openapi_base_url === 'string' && settings.ark_openapi_base_url
      ? settings.ark_openapi_base_url
      : emptyProviderAssetSettings.ark_openapi_base_url,
    ark_region: source === 'provider' && typeof settings.ark_region === 'string' && settings.ark_region
      ? settings.ark_region
      : emptyProviderAssetSettings.ark_region,
    ark_access_key_id: source === 'provider' && typeof settings.ark_access_key_id === 'string' ? settings.ark_access_key_id : '',
    ark_secret_key_set: source === 'provider' && settings.ark_secret_key_set === true,
  }
}

function ProviderRuntimeStateSummary({ provider }: { provider: AIProvider }) {
  const assetState = parseJSONRecord(provider.asset_library_state_json)
  const trustState = parseJSONRecord(provider.trusted_resource_state_json)
  const assetSupported = assetState.supports_asset_library === true
  const trustSupported = trustState.supports_generated_artifact_trust === true
  const assetTypes = stringListFromUnknown(assetState.asset_types)
  const trustFamilies = stringListFromUnknown(trustState.trusted_model_families)
  const assetSettings = recordFromUnknown(assetState.settings)
  const globalGroup = recordFromUnknown(assetState.global_group)
  const assetDiagnostics = diagnosticCodesFromUnknown(assetState.diagnostics)
  const trustDiagnostics = diagnosticCodesFromUnknown(trustState.diagnostics)
  const arkKeyReady = assetSettings.ark_access_key_id_set === true && assetSettings.ark_secret_key_set === true
  const configItems = [
    { label: '公网 URL', ok: assetSettings.public_base_url_set === true },
    { label: '签名密钥', ok: assetSettings.signing_secret_set === true },
    { label: 'Ark AK/SK', ok: arkKeyReady },
    { label: 'global group', ok: globalGroup.configured === true },
  ]
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <ProviderRuntimeStatePane
        icon={<CloudUpload size={14} />}
        title="素材库"
        badge={assetSupported ? 'asset:// ready' : 'unsupported'}
        badgeIntent={assetSupported ? 'success' : 'neutral'}
      >
        {assetSupported ? (
          <>
            <div className="flex flex-wrap gap-1">
              {(assetTypes.length > 0 ? assetTypes : ['image']).map((type) => (
                <StatusBadge key={type} intent="neutral" className="text-[11px]">{type}</StatusBadge>
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {configItems.map((item) => (
                <StatusBadge key={item.label} intent={item.ok ? 'success' : 'warning'} className="text-[11px]">
                  {item.label}
                </StatusBadge>
              ))}
            </div>
            {assetDiagnostics.length > 0 && (
              <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{assetDiagnostics.slice(0, 2).join(' · ')}</p>
            )}
          </>
        ) : (
          <p className="text-[11px] leading-relaxed text-muted-foreground">该 Provider 未声明素材库能力。RawResource 不会被映射为 asset://。</p>
        )}
      </ProviderRuntimeStatePane>
      <ProviderRuntimeStatePane
        icon={<Sparkles size={14} />}
        title="原始产物信任"
        badge={trustSupported ? 'same provider' : 'unsupported'}
        badgeIntent={trustSupported ? 'success' : 'neutral'}
      >
        {trustSupported ? (
          <>
            <p className="truncate text-[11px] text-muted-foreground">
              {trustState.requires_original_artifact === true ? '仅模型原始产物' : '允许派生产物'} · {String(trustState.scope || 'provider scope')}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(trustFamilies.length > 0 ? trustFamilies : ['model declared']).map((family) => (
                <StatusBadge key={family} intent="neutral" className="text-[11px]">{family}</StatusBadge>
              ))}
            </div>
            {trustDiagnostics.length > 0 && (
              <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{trustDiagnostics.slice(0, 2).join(' · ')}</p>
            )}
          </>
        ) : (
          <p className="text-[11px] leading-relaxed text-muted-foreground">该 Provider 不提供跨 RawResource 的原始产物信任。</p>
        )}
      </ProviderRuntimeStatePane>
    </div>
  )
}

function ProviderRuntimeStatePane({
  icon,
  title,
  badge,
  badgeIntent,
  children,
}: {
  icon: React.ReactNode
  title: string
  badge: string
  badgeIntent: StatusBadgeProps['intent']
  children: React.ReactNode
}) {
  return (
    <div className="border-l border-border pl-2 text-xs">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
          {icon}
          <span className="truncate">{title}</span>
        </span>
        <StatusBadge intent={badgeIntent} className="shrink-0 text-[11px]">{badge}</StatusBadge>
      </div>
      {children}
    </div>
  )
}

export function ModelManagementPage({ view = defaultModelManagementViewMode() }: { view?: ModelManagementViewMode } = {}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const viewMode = view
  const [addStep, setAddStep] = useState<'idle' | 'pick' | 'fill'>('idle')
  const [selectedProviderTemplate, setSelectedProviderTemplate] = useState<AIProviderTemplate | null>(null)
  const [relayHint, setRelayHint] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [expandedProviderInstanceId, setExpandedProviderInstanceId] = useState<string | null>(null)
  const [showKey, setShowKey] = useState<Record<number, boolean>>({})
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})
  const [testingId, setTestingId] = useState<string | null>(null)
  // Files API editing state
  const [filesAPIEditFor, setFilesAPIEditFor] = useState<number | null>(null)
  const [filesAPIEditEnabled, setFilesAPIEditEnabled] = useState(false)
  const [filesAPIEditBaseURL, setFilesAPIEditBaseURL] = useState('')
  const [filesAPIEditKey, setFilesAPIEditKey] = useState('')
  const [filesAPIEditSaving, setFilesAPIEditSaving] = useState(false)
  // Credential auth/base URL editing state
  const [credentialEditFor, setCredentialEditFor] = useState<number | null>(null)
  const [credentialEditFields, setCredentialEditFields] = useState<Record<string, string>>({})
  // Inline credential name editing
  const [editingNameId, setEditingNameId] = useState<number | null>(null)
  const [editingNameValue, setEditingNameValue] = useState('')
  const [modelAdminError, setModelAdminError] = useState('')
  const [enablingComboKey, setEnablingComboKey] = useState<string | null>(null)
  const [providerSearch, setProviderSearch] = useState('')
  const [providerStatus, setProviderStatus] = useState<ModelProviderStatusFilter>('all')
  const [providerType, setProviderType] = useState('all')
  const [providerPage, setProviderPage] = useState(1)
  const [providerPageSize, setProviderPageSize] = useState(MODEL_ADMIN_PAGE_SIZE)

  const { data: adapters = [], error: adaptersQueryError } = useQuery<AdapterDef[]>({
    queryKey: ['admin', 'adapters'],
    queryFn: () => api.get('/admin/adapters').then((r) => readListPayload<AdapterDef>(r.data)),
  })
  const adapterByType = useMemo(() => new Map(adapters.map((adapter) => [adapter.adapter_type, adapter])), [adapters])

  const { data: credentials = [], error: credentialsQueryError } = useQuery<AICredential[]>({
    queryKey: ['admin', 'credentials'],
    queryFn: () => api.get('/admin/credentials').then((r) => readListPayload<AICredential>(r.data)),
  })

  const { data: topologyCatalogEntries = [] } = useQuery<AIModelCatalogEntry[]>({
    queryKey: ['admin', 'model-catalog'],
    queryFn: () => api.get('/admin/model-catalog').then((r) => readListPayload<AIModelCatalogEntry>(r.data)),
  })

  const { data: providerInstancesData, error: providerInstancesQueryError } = useQuery<ProviderInstancesResponse>({
    queryKey: ['admin', 'provider-instances'],
    queryFn: () => api.get('/admin/provider-instances').then((r) => r.data),
    enabled: viewMode === 'providers',
  })
  const { data: providersData, error: providersQueryError } = useQuery<AIProvidersResponse>({
    queryKey: ['admin', 'providers'],
    queryFn: () => api.get('/admin/providers').then((r) => r.data),
  })
  const { data: providerTemplatesData } = useQuery<AIProviderTemplatesResponse>({
    queryKey: ['admin', 'provider-templates'],
    queryFn: () => api.get('/admin/provider-templates').then((r) => r.data),
    enabled: viewMode === 'providers',
  })
  const { data: comboTemplatesData } = useQuery<AIComboTemplatesResponse>({
    queryKey: ['admin', 'combo-templates'],
    queryFn: () => api.get('/admin/combo-templates').then((r) => r.data),
    enabled: viewMode === 'providers',
  })
  const aiProviders = providersData?.items ?? []
  const providerTemplates = providerTemplatesData?.items ?? []
  const comboTemplates = comboTemplatesData?.items ?? []
  const selectedProviderAdapter = selectedProviderTemplate ? adapterByType.get(providerTemplateDefaultAdapter(selectedProviderTemplate)) ?? null : null
  const providerInstances = providerInstancesData?.items ?? []
  const startupProviderInstances = providerInstances.filter((item) => !providerInstanceRef(item))
  const apiAccountStartupProviderInstances = modelProviderAccountStartupInstances(startupProviderInstances)
  const providerInstanceById = new Map(providerInstances.map((item) => [item.id, item]))
  const isRelayGatewayMode = hasRelayGatewayProviderInstance(startupProviderInstances)
  const providerInstanceByCredentialId = new Map<number, ProviderInstance>()
  providerInstances.forEach((item) => {
    const ref = providerInstanceRef(item)
    if (ref?.kind === 'ai_credential') {
      providerInstanceByCredentialId.set(ref.id, item)
    }
  })
  const providerTypes = useMemo(() => Array.from(new Set([
    ...credentials.map((credential) => credential.adapter_type).filter(Boolean),
    ...apiAccountStartupProviderInstances.map((instance) => instance.type).filter(Boolean),
  ])).sort(), [apiAccountStartupProviderInstances, credentials])
  const apiAccountReadyCount = useMemo(() => (
    credentials.filter((cred) => {
      const instance = providerInstanceByCredentialId.get(cred.ID)
      return cred.is_enabled && (!instance || providerInstanceReady(instance))
    }).length + apiAccountStartupProviderInstances.filter(providerInstanceReady).length
  ), [apiAccountStartupProviderInstances, credentials, providerInstanceByCredentialId])
  const apiAccountPendingCount = useMemo(() => (
    credentials.filter((cred) => {
      const instance = providerInstanceByCredentialId.get(cred.ID)
      return cred.is_enabled && (instance ? !providerInstanceReady(instance) : !Boolean(cred.masked_key))
    }).length + apiAccountStartupProviderInstances.filter((instance) => instance.enabled && !providerInstanceReady(instance)).length
  ), [apiAccountStartupProviderInstances, credentials, providerInstanceByCredentialId])
  const filteredCredentials = useMemo(() => credentials.filter((cred) => {
    const instance = providerInstanceByCredentialId.get(cred.ID)
    if (providerType !== 'all' && cred.adapter_type !== providerType && instance?.type !== providerType) return false
    if (providerStatus === 'ready' && !(cred.is_enabled && (!instance || providerInstanceReady(instance)))) return false
    if (providerStatus === 'missing' && (!cred.is_enabled || (instance ? providerInstanceReady(instance) : Boolean(cred.masked_key)))) return false
    if (providerStatus === 'disabled' && cred.is_enabled) return false
    return modelAdminTextMatches(providerSearch, [cred.display_name, cred.adapter_type, cred.base_url, instance?.id, instance?.label, instance?.display_name, ...(instance?.capabilities ?? [])])
  }), [credentials, providerInstanceByCredentialId, providerSearch, providerStatus, providerType])
  const filteredStartupProviderInstances = useMemo(() => apiAccountStartupProviderInstances.filter((instance) => {
    if (providerType !== 'all' && instance.type !== providerType) return false
    if (providerStatus === 'ready' && !providerInstanceReady(instance)) return false
    if (providerStatus === 'missing' && (providerInstanceReady(instance) || !instance.enabled)) return false
    if (providerStatus === 'disabled' && instance.enabled) return false
    return modelAdminTextMatches(providerSearch, [instance.id, instance.label, instance.display_name, instance.type, instance.adapter, instance.managed_by, ...(instance.capabilities ?? [])])
  }), [apiAccountStartupProviderInstances, providerSearch, providerStatus, providerType])
  const providerAccountRows = useMemo(() => {
    const credentialRows = filteredCredentials.map((credential) => ({ kind: 'credential' as const, id: `credential:${credential.ID}`, credential }))
    const instanceRows = filteredStartupProviderInstances.map((instance) => ({ kind: 'instance' as const, id: `instance:${instance.id}`, instance }))
    return [...credentialRows, ...instanceRows]
  }, [filteredCredentials, filteredStartupProviderInstances])
  const providerPagination = modelAdminPaginationSlice(providerAccountRows, providerPage, providerPageSize)

  useEffect(() => {
    setProviderPage(1)
  }, [providerSearch, providerStatus, providerType, providerPageSize])

  const deleteCredential = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/credentials/${id}`),
    onMutate: () => setModelAdminError(''),
    onSuccess: () => {
      setModelAdminError('')
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      qc.invalidateQueries({ queryKey: ['admin', 'provider-instances'] })
      qc.invalidateQueries({ queryKey: ['admin', 'providers'] })
    },
    onError: (err: any) => setModelAdminError(translateAPIRequestError(err)),
  })

  const toggleCredential = useMutation({
    mutationFn: ({ id, is_enabled }: { id: number; is_enabled: boolean }) =>
      api.put(`/admin/credentials/${id}`, { is_enabled }),
    onMutate: () => setModelAdminError(''),
    onSuccess: () => {
      setModelAdminError('')
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      qc.invalidateQueries({ queryKey: ['admin', 'provider-instances'] })
      qc.invalidateQueries({ queryKey: ['admin', 'providers'] })
    },
    onError: (err: any) => setModelAdminError(translateAPIRequestError(err)),
  })

  const renameCredential = useMutation({
    mutationFn: ({ id, display_name }: { id: number; display_name: string }) =>
      api.put(`/admin/credentials/${id}`, { display_name }),
    onMutate: () => setModelAdminError(''),
    onSuccess: () => {
      setModelAdminError('')
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      qc.invalidateQueries({ queryKey: ['admin', 'provider-instances'] })
      qc.invalidateQueries({ queryKey: ['admin', 'providers'] })
      setEditingNameId(null)
    },
    onError: (err: any) => setModelAdminError(translateAPIRequestError(err)),
  })

  const updateCredentialAuth = useMutation({
    mutationFn: ({ id, fields }: { id: number; fields: Record<string, string> }) => {
      const credentials: Record<string, string> = { base_url: fields.base_url ?? '' }
      Object.entries(fields).forEach(([key, value]) => {
        if (key !== 'base_url' && value.trim()) credentials[key] = value
      })
      return api.put(`/admin/credentials/${id}`, { credentials })
    },
    onMutate: () => setModelAdminError(''),
    onSuccess: () => {
      setModelAdminError('')
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      qc.invalidateQueries({ queryKey: ['admin', 'provider-instances'] })
      qc.invalidateQueries({ queryKey: ['admin', 'providers'] })
      setCredentialEditFor(null)
      setCredentialEditFields({})
    },
    onError: (err: any) => setModelAdminError(translateAPIRequestError(err)),
  })

  const enableComboTemplate = useMutation({
    mutationFn: ({ comboTemplateKey, providerID }: { comboTemplateKey: string; providerID: string }) =>
      api.post(`/admin/combo-templates/${encodeURIComponent(comboTemplateKey)}/enable`, { provider_id: providerID }).then((r) => r.data),
    onMutate: ({ comboTemplateKey }) => {
      setModelAdminError('')
      setEnablingComboKey(comboTemplateKey)
    },
    onSuccess: () => {
      setModelAdminError('')
      qc.invalidateQueries({ queryKey: ['admin', 'model-catalog'] })
      qc.invalidateQueries({ queryKey: ['admin', 'providers'] })
    },
    onError: (err: any) => setModelAdminError(translateAPIRequestError(err)),
    onSettled: () => setEnablingComboKey(null),
  })

  const modelQueryError = adaptersQueryError || credentialsQueryError || providerInstancesQueryError || providersQueryError

  function setViewMode(nextViewMode: ModelManagementViewMode) {
    navigate(modelManagementRoute(nextViewMode))
  }

  async function runTest(key: string, fn: () => Promise<TestResult>) {
    setTestingId(key)
    try {
      const result = await fn()
      setTestResults((r) => ({ ...r, [key]: result }))
    } catch (e: any) {
      setTestResults((r) => ({ ...r, [key]: { success: false, message: translateAPIRequestError(e), latency_ms: 0 } }))
    } finally {
      setTestingId(null)
    }
  }
  function getAdapterLabel(adapterType: string): string {
    return adapters.find((a) => a.adapter_type === adapterType)?.display_name ?? adapterType
  }

  function openCredentialAuthEdit(cred: AICredential) {
    const adapter = adapters.find((a) => a.adapter_type === cred.adapter_type)
    const next: Record<string, string> = { base_url: cred.base_url ?? '' }
    adapter?.cred_fields.forEach((field) => {
      if (field.key !== 'base_url') next[field.key] = ''
    })
    setCredentialEditFor(cred.ID)
    setCredentialEditFields(next)
  }

  function confirmToggleCredential(cred: AICredential) {
    const nextEnabled = nextCredentialEnabledState(cred)
    const key = credentialToggleConfirmKey(cred)
    if (window.confirm(t(key, { name: cred.display_name }))) {
      toggleCredential.mutate({ id: cred.ID, is_enabled: nextEnabled })
    }
  }

  function confirmDeleteCredential(cred: AICredential) {
    if (window.confirm(t('admin.models.confirmDeleteCredential', { name: cred.display_name }))) {
      deleteCredential.mutate(cred.ID)
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">AI Admin</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">AI 配置工作台</h2>
          <p className="mt-1 text-sm text-muted-foreground">账号、模型和路由分开维护；列表优先，详情按需展开。</p>
        </div>
      </div>

      <ModelManagementLayerNav activeView={viewMode} onChange={setViewMode} />

      <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        {viewMode === 'providers'
          ? `${t('admin.models.apiAccountsSummary', { defaultValue: 'API账号' })} ${credentials.length + apiAccountStartupProviderInstances.length} · Ready ${apiAccountReadyCount} · ${t('admin.models.pendingSetup', { defaultValue: '待配置' })} ${apiAccountPendingCount}`
          : viewMode === 'catalog'
            ? `${t('admin.models.modelCatalogSummary', { defaultValue: '模型' })} ${topologyCatalogEntries.length} · ${t('admin.modelCatalog.enabled')} ${topologyCatalogEntries.filter((entry) => entry.is_enabled).length} · ${t('admin.models.missingRoutes', { defaultValue: '缺少路由' })} ${topologyCatalogEntries.filter((entry) => (entry.route_bindings ?? []).length === 0).length}`
            : `${t('admin.models.routeSummary', { defaultValue: '路由绑定' })} ${topologyCatalogEntries.flatMap((entry) => entry.route_bindings ?? []).length} · ${t('admin.models.missingRoutes', { defaultValue: '缺少路由' })} ${topologyCatalogEntries.filter((entry) => (entry.route_bindings ?? []).length === 0).length}`}
      </div>

      {modelAdminError && (
        <AppInlineError className="flex items-start gap-2">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          <span>{modelAdminError}</span>
        </AppInlineError>
      )}

      {modelQueryError && (
        <AppInlineError className="flex items-start gap-2">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          <span>{translateAPIRequestError(modelQueryError)}</span>
        </AppInlineError>
      )}

      {viewMode === 'providers' && addStep === 'idle' && (
        <div className="flex justify-end">
            <Button
              onClick={() => {
                setSelectedProviderTemplate(null)
                setAddStep('pick')
              }}
            >
              <Plus size={14} className="mr-1.5" />
              {isRelayGatewayMode ? t('admin.models.addRelayGatewayRoute') : t('admin.models.addProvider')}
            </Button>
        </div>
      )}

      {viewMode === 'providers' && addStep === 'pick' && (
        <ProviderTemplatePicker
          templates={providerTemplates}
          adapters={selectableAdminProviderAdapters(adapters)}
          onPick={(template) => { setSelectedProviderTemplate(template); setAddStep('fill') }}
          onCancel={() => {
            setSelectedProviderTemplate(null)
            setAddStep('idle')
          }}
        />
      )}
      {viewMode === 'providers' && addStep === 'fill' && selectedProviderTemplate && selectedProviderAdapter && (
        <CredentialForm
          adapter={selectedProviderAdapter}
          providerTemplate={selectedProviderTemplate}
          relayGatewayMode={isRelayGatewayMode}
          onBack={() => setAddStep('pick')}
          onSuccess={(providerKind) => {
            setAddStep('idle')
            setSelectedProviderTemplate(null)
            setRelayHint(!isRelayGatewayMode && providerKind === 'volcengine_ark_official' ? 'volcen' : null)
          }}
        />
      )}

      {viewMode === 'providers' && relayHint === 'volcen' && addStep === 'idle' && (
        <div className="rounded-lg border border-border bg-accent/30 p-4 flex items-start gap-3">
          <CloudUpload size={16} className="shrink-0 mt-0.5 text-muted-foreground" />
          <div className="flex-1 space-y-1 min-w-0">
            <p className="text-sm font-medium">{t('admin.credentials.volcenRelayHintTitle')}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{t('admin.credentials.volcenRelayHintBody')}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" onClick={() => window.location.assign(adminHref('/cloud-files?type=tos'))}>
              {t('admin.credentials.volcenRelayHintCta')}
            </Button>
            <button
              onClick={() => setRelayHint(null)}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
            >
              {t('common.dismiss')}
            </button>
          </div>
        </div>
      )}

      {viewMode === 'providers' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <ModelAdminSearchInput value={providerSearch} onChange={setProviderSearch} placeholder="搜索账号、供应商、能力..." />
              <select value={providerType} onChange={(event) => setProviderType(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
                <option value="all">全部供应商</option>
                {providerTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <select value={providerStatus} onChange={(event) => setProviderStatus(event.target.value as ModelProviderStatusFilter)} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
                <option value="all">全部状态</option>
                <option value="ready">Ready</option>
                <option value="missing">待配置</option>
                <option value="disabled">Disabled</option>
              </select>
              <ModelAdminPageSizeSelect value={providerPageSize} onChange={setProviderPageSize} />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <p className="text-sm font-medium text-foreground">API账号与实例</p>
              <span className="text-xs text-muted-foreground">{providerAccountRows.length} / {credentials.length + apiAccountStartupProviderInstances.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">账号/实例</th>
                    <th className="px-4 py-2 text-left font-medium">供应商</th>
                    <th className="px-4 py-2 text-left font-medium">密钥</th>
                    <th className="px-4 py-2 text-left font-medium">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {providerPagination.items.map((row) => {
                    if (row.kind === 'instance') {
                      const instance = row.instance
                      return (
                        <tr key={row.id} className="border-t border-border">
                          <td className="px-4 py-2">
                            <div className="font-medium text-foreground">{instance.display_name || instance.label}</div>
                            <div className="font-mono text-xs text-muted-foreground">{instance.id}</div>
                          </td>
                          <td className="px-4 py-2">
                            <div className="font-mono text-xs text-foreground">{instance.type}</div>
                            <div className="text-xs text-muted-foreground">{instance.adapter}</div>
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">{instance.secret_fields.filter((field) => field.configured).length}/{instance.secret_fields.length}</td>
                          <td className="px-4 py-2">
                            <StatusBadge intent={providerInstanceReady(instance) ? 'success' : instance.enabled ? 'warning' : 'neutral'}>
                              {providerInstanceReady(instance) ? 'Ready' : instance.enabled ? '待配置' : 'Disabled'}
                            </StatusBadge>
                          </td>
                        </tr>
                      )
                    }
                    const cred = row.credential
                    const instance = providerInstanceByCredentialId.get(cred.ID)
                    return (
                      <tr key={row.id} className="border-t border-border">
                        <td className="px-4 py-2">
                          <div className="font-medium text-foreground">{cred.display_name}</div>
                          <div className="truncate text-xs text-muted-foreground">{cred.base_url || instance?.id || '-'}</div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="font-mono text-xs text-foreground">{cred.adapter_type}</div>
                          <div className="text-xs text-muted-foreground">{instance?.managed_by || 'credential'}</div>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{instance ? `${instance.secret_fields.filter((field) => field.configured).length}/${instance.secret_fields.length}` : (cred.masked_key ? '1/1' : '0/1')}</td>
                        <td className="px-4 py-2">
                          <StatusBadge intent={cred.is_enabled ? 'success' : 'neutral'}>{cred.is_enabled ? t('admin.modelCatalog.enabled') : t('admin.modelCatalog.disabled')}</StatusBadge>
                        </td>
                      </tr>
                    )
                  })}
                  {providerPagination.items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">没有匹配的 API 账号。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <PaginationControls page={providerPagination.page} pageCount={providerPagination.pageCount} pageSize={providerPageSize} total={providerAccountRows.length} onPageChange={setProviderPage} disabled={Boolean(providerInstancesData === undefined && providerInstancesQueryError)} />

          <details className="rounded-lg border border-border bg-card">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">导入与模板</summary>
            <div className="space-y-3 border-t border-border p-3">
              <ProviderModelImportWizard />
              <ProviderRegistrySummary
                providers={aiProviders}
                adapters={adapters}
                providerTemplates={providerTemplates}
                comboTemplates={comboTemplates}
                enablingComboKey={enablingComboKey}
                onEnableCombo={(comboTemplateKey, providerID) => enableComboTemplate.mutate({ comboTemplateKey, providerID })}
              />
            </div>
          </details>

          {apiAccountStartupProviderInstances.length > 0 && (
            <details className="border border-border rounded-lg bg-background overflow-hidden">
              <summary className="cursor-pointer px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Settings2 size={15} className="text-muted-foreground" />
                  <p className="text-sm font-medium">{t('admin.models.providerRuntimeInstancesTitle', { defaultValue: '运行实例（高级）' })}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t('admin.models.providerRuntimeInstancesHint', { defaultValue: '仅在需要编辑运行实例配置、应用配置或触发部署时展开。' })}</p>
              </summary>
              <div className="divide-y divide-border">
                {filteredStartupProviderInstances.map((instance) => {
                  const testKey = `provider-instance-${instance.id}`
                  const testRes = testResults[testKey]
                  const configuredConfig = instance.config_fields.filter((field) => field.configured).length
                  const totalConfig = instance.config_fields.length
                  const configuredSecrets = instance.secret_fields.filter((field) => field.configured).length
                  const totalSecrets = instance.secret_fields.length
                  return (
                    <div key={instance.id}>
                      <div className="px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">{instance.display_name || instance.label}</p>
                            <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{instance.type}</span>
                            <span className="text-xs text-muted-foreground">{instance.adapter}</span>
                            {instance.requires_restart && (
                              <StatusBadge intent="warning" className="text-xs">
                                {t('admin.models.requiresRestart')}
                              </StatusBadge>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>{t('admin.models.providerInstanceConfig', { configured: configuredConfig, total: totalConfig })}</span>
                            <span>{t('admin.models.providerInstanceSecrets', { configured: configuredSecrets, total: totalSecrets })}</span>
                            <span>{t('admin.models.managedBy', { managedBy: instance.managed_by })}</span>
                          </div>
                        </div>
                        {instance.config_editable && (
                          <button
                            onClick={() => setExpandedProviderInstanceId(expandedProviderInstanceId === instance.id ? null : instance.id)}
                            className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5"
                          >
                            {expandedProviderInstanceId === instance.id ? t('admin.models.collapseConfig') : t('admin.models.configure')}
                          </button>
                        )}
                        <button
                          onClick={() => runTest(testKey, () => api.post(`/admin/provider-instances/${instance.id}/test`, {}).then((r) => r.data))}
                          disabled={testingId === testKey}
                          className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5"
                        >
                          {testingId === testKey ? t('admin.credentials.testing') : t('admin.models.connectionTest')}
                        </button>
                        {testRes && (
                          <AppFeedbackText as="span" tone={testRes.success ? 'neutral' : 'danger'}>
                            {testRes.success ? `✓ ${testRes.latency_ms}ms` : t('admin.models.testFailedMark')}
                          </AppFeedbackText>
                        )}
                      </div>
                      {expandedProviderInstanceId === instance.id && (
                        <div className="border-t border-border bg-card px-4 py-3">
                          <ProviderInstanceConfigDraftPanel instance={instance} />
                        </div>
                      )}
                    </div>
                  )
                })}
                {filteredStartupProviderInstances.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">没有匹配的运行实例。</p>
                )}
              </div>
            </details>
          )}
          {filteredCredentials.map((cred) => {
          const providerInstance = providerInstanceByCredentialId.get(cred.ID)
          const testKey = providerInstance ? `provider-instance-${providerInstance.id}` : `cred-${cred.ID}`
          const testRes = testResults[testKey]
          const adapter = adapters.find((a) => a.adapter_type === cred.adapter_type)
          const configuredSecrets = providerInstance?.secret_fields.filter((field) => field.configured).length ?? 0
          const totalSecrets = providerInstance?.secret_fields.length ?? 0

          return (
            <div key={cred.ID} className="border border-border rounded-lg bg-background overflow-hidden">
              {/* Credential header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => setExpandedId(expandedId === cred.ID ? null : cred.ID)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {expandedId === cred.ID ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {editingNameId === cred.ID ? (
                      <div className="flex items-center gap-1">
                        <Input
                          className="h-6 text-sm py-0 px-1.5 w-40"
                          value={editingNameValue}
                          onChange={(e) => setEditingNameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') renameCredential.mutate({ id: cred.ID, display_name: editingNameValue })
                            if (e.key === 'Escape') setEditingNameId(null)
                          }}
                          autoFocus
                        />
                        <button
                          onClick={() => renameCredential.mutate({ id: cred.ID, display_name: editingNameValue })}
                          disabled={renameCredential.isPending}
                          className="text-foreground hover:text-primary"
                        >
                          <Check size={14} />
                        </button>
                        <button onClick={() => setEditingNameId(null)} className="text-muted-foreground hover:text-foreground">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium">{cred.display_name}</p>
                        <button
                          onClick={() => { setEditingNameId(cred.ID); setEditingNameValue(cred.display_name) }}
                          className="text-muted-foreground/40 hover:text-muted-foreground"
                          title={t('admin.models.renameCredential')}
                        >
                          <Pencil size={12} />
                        </button>
                      </>
                    )}
                    <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                      {getAdapterLabel(cred.adapter_type)}
                    </span>
                    {providerInstance && (
                      <span className="text-xs text-muted-foreground">
                        {t('admin.models.providerInstanceSecrets', { configured: configuredSecrets, total: totalSecrets })}
                      </span>
                    )}
                  </div>
                    {!isRelayGatewayMode && cred.base_url && <p className="text-xs text-muted-foreground truncate">{cred.base_url}</p>}
                </div>

                  {!isRelayGatewayMode && cred.masked_key && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <button onClick={() => setShowKey((s) => ({ ...s, [cred.ID]: !s[cred.ID] }))}>
                      {showKey[cred.ID] ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <span className="font-mono">{showKey[cred.ID] ? cred.masked_key : '••••••••'}</span>
                  </div>
                )}

                {!isRelayGatewayMode && (
                  <>
                    <button
                      onClick={() => runTest(testKey, () => (
                        providerInstance
                          ? api.post(`/admin/provider-instances/${providerInstance.id}/test`, {}).then((r) => r.data)
                          : api.post(`/admin/credentials/${cred.ID}/test`, {}).then((r) => r.data)
                      ))}
                      disabled={testingId === testKey}
                      className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5"
                    >
                      {testingId === testKey ? t('admin.credentials.testing') : t('admin.models.connectionTest')}
                    </button>
                    {testRes && (
                      <AppFeedbackText as="span" tone={testRes.success ? 'neutral' : 'danger'}>
                        {testRes.success ? `✓ ${testRes.latency_ms}ms` : t('admin.models.testFailedMark')}
                      </AppFeedbackText>
                    )}
                  </>
                )}

                <AppStatusToggleButton
                  onClick={() => confirmToggleCredential(cred)}
                  title={cred.is_enabled ? t('admin.models.disableCredentialTitle') : t('admin.models.enableCredentialTitle')}
                  tone="neutral"
                  selected={cred.is_enabled}
                >
                  {cred.is_enabled ? t('admin.models.enabledMark') : t('admin.models.disabledMark')}
                </AppStatusToggleButton>
                <Button type="button" variant="ghost" size="icon-xs" intent="danger" onClick={() => confirmDeleteCredential(cred)}>
                  <Trash2 size={14} />
                </Button>
              </div>

              {/* Expanded: provider auth and catalog handoff */}
              {expandedId === cred.ID && (
                <div className="border-t border-border px-4 py-3 space-y-3 bg-card">
                    <div className="border border-border rounded-lg bg-background p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">
                        {isRelayGatewayMode ? t('admin.models.relayGatewayRouteAuth') : t('admin.models.credentialAuth')}
                      </p>
                      {!isRelayGatewayMode && (
                        <button
                          onClick={() => credentialEditFor === cred.ID ? setCredentialEditFor(null) : openCredentialAuthEdit(cred)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          {credentialEditFor === cred.ID ? t('admin.models.collapse') : t('admin.models.edit')}
                        </button>
                      )}
                    </div>

                    {isRelayGatewayMode ? (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {t('admin.models.relayGatewayRouteAuthHint')}
                      </p>
                    ) : credentialEditFor !== cred.ID ? (
                      <div className="grid gap-1 text-xs text-muted-foreground">
                        <p className="truncate">
                          {t('common.baseUrl')}: <span className="font-mono">{cred.base_url || adapter?.default_base_url || t('canvas.unset')}</span>
                        </p>
                        <p>
                          {t('common.apiKey')}: <span className="font-mono">{cred.masked_key || t('canvas.unset')}</span>
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs text-muted-foreground block mb-1">{t('common.baseUrl')}</Label>
                          <Input
                            value={credentialEditFields.base_url ?? ''}
                            onChange={(e) => setCredentialEditFields((f) => ({ ...f, base_url: e.target.value }))}
                            placeholder={adapter?.default_base_url || t('admin.models.useAdapterDefaultUrl')}
                            className="text-xs"
                          />
                        </div>
                        {(adapter?.cred_fields.filter((field) => field.key !== 'base_url') ?? []).map((field) => (
                          <div key={field.key}>
                            <Label className="text-xs text-muted-foreground block mb-1">{credentialFieldLabel(field.key, field.label, t)}</Label>
                            <Input
                              type="password"
                              value={credentialEditFields[field.key] ?? ''}
                              onChange={(e) => setCredentialEditFields((f) => ({ ...f, [field.key]: e.target.value }))}
                              placeholder={field.key === 'api_key' && cred.masked_key ? t('admin.models.leaveBlankKeepCurrent', { value: cred.masked_key }) : t('admin.models.leaveBlankKeep')}
                              className="text-xs"
                            />
                          </div>
                        ))}
                        {updateCredentialAuth.isError && (
                            <AppFeedbackText>
                              {translateApiError((updateCredentialAuth.error as any)?.response?.data)}
                            </AppFeedbackText>
                          )}
                          <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={updateCredentialAuth.isPending}
                            onClick={() => updateCredentialAuth.mutate({ id: cred.ID, fields: credentialEditFields })}
                          >
                            {updateCredentialAuth.isPending ? t('common.saving') : t('common.save')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setCredentialEditFor(null); setCredentialEditFields({}) }}
                          >
                            {t('common.cancel')}
                          </Button>
                        </div>
                      </div>
                      )}
                    </div>

                    <div className="rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">{t('admin.models.catalogOwnsModelsTitle', { defaultValue: '模型身份由 Catalog Entry 管理' })}</p>
                    <p className="mt-1 leading-relaxed">
                      {t('admin.models.catalogOwnsModelsHint', { defaultValue: 'Provider 保存账号、Base URL、API Key 和平台能力。模型身份、能力、参数和输入约束在 Catalog 维护，线路绑定在 Route 维护。' })}
                    </p>
                    <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => setViewMode('catalog')}>
                      {t('admin.models.viewCatalog')}
                    </Button>
                  </div>

                  {/* Files API config — shown only for adapters that support it */}
                    {!isRelayGatewayMode && adapter?.supports_files_api && (() => {
                    const isEditing = filesAPIEditFor === cred.ID
                    return (
                      <div className="border-t border-border pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-medium text-muted-foreground">{t('admin.credentials.filesAPIPreupload')}</p>
                          <button
                            onClick={() => {
                              if (isEditing) {
                                setFilesAPIEditFor(null)
                              } else {
                                setFilesAPIEditFor(cred.ID)
                                setFilesAPIEditEnabled(cred.files_api_enabled ?? false)
                                setFilesAPIEditBaseURL(cred.files_api_base_url ?? '')
                                setFilesAPIEditKey('')
                              }
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            {isEditing ? t('admin.models.collapse') : t('admin.credentials.configure')}
                          </button>
                        </div>
                        {!isEditing && (
                          <p className="text-xs text-muted-foreground">
                            {cred.files_api_enabled
                              ? <AppFeedbackText as="span" tone="success">{t('admin.models.enabledMark')}</AppFeedbackText>
                              : <span>{t('admin.credentials.notEnabledMark')}</span>
                            }
                          </p>
                        )}
                        {isEditing && (
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={filesAPIEditEnabled}
                                onChange={e => setFilesAPIEditEnabled(e.target.checked)}
                                className="rounded"
                              />
                              {t('admin.credentials.enableFilesAPIDetail')}
                            </label>
                            {filesAPIEditEnabled && (
                              <>
                                <div>
                                  <Label className="text-xs text-muted-foreground block mb-1">{t('admin.credentials.filesAPIBaseURLCredential')}</Label>
                                  <Input
                                    value={filesAPIEditBaseURL}
                                    onChange={e => setFilesAPIEditBaseURL(e.target.value)}
                                    placeholder={cred.base_url || t('admin.credentials.leaveBlankUseCredentialBaseURL')}
                                    className="text-xs"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground block mb-1">{t('admin.credentials.filesAPIKeyCredential')}</Label>
                                  <Input
                                    type="password"
                                    value={filesAPIEditKey}
                                    onChange={e => setFilesAPIEditKey(e.target.value)}
                                    placeholder={t('admin.credentials.leaveBlankUseMainKey')}
                                    className="text-xs"
                                  />
                                </div>
                              </>
                            )}
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                disabled={filesAPIEditSaving}
                                onClick={async () => {
                                  setFilesAPIEditSaving(true)
                                  try {
                                    const body: Record<string, unknown> = {
                                      files_api_enabled: filesAPIEditEnabled,
                                      files_api_base_url: filesAPIEditBaseURL,
                                    }
                                    if (filesAPIEditKey) body.files_api_key = filesAPIEditKey
                                    await api.put(`/admin/credentials/${cred.ID}`, body)
                                    qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
                                    qc.invalidateQueries({ queryKey: ['admin', 'provider-instances'] })
                                    qc.invalidateQueries({ queryKey: ['admin', 'providers'] })
                                    setFilesAPIEditFor(null)
                                  } finally {
                                    setFilesAPIEditSaving(false)
                                  }
                                }}
                              >
                                {filesAPIEditSaving ? '…' : t('common.save')}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setFilesAPIEditFor(null)}>{t('common.cancel')}</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )
        })}

          {credentials.length === 0 && addStep === 'idle' && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {isRelayGatewayMode ? t('admin.models.noRelayGatewayRoutesHint') : t('admin.models.noCredentialsHint')}
            </p>
          )}
        </div>
      )}

      {viewMode === 'catalog' && <ModelCatalogSection credentials={credentials} />}

      {viewMode === 'routes' && <ModelRoutesSection credentials={credentials} providers={aiProviders} />}
    </div>
  )
}

function RuntimeModelHealthSection({
  items,
  isLoading,
  isFetching,
  error,
  onRefresh,
}: {
  items: RuntimeProviderHealth[]
  isLoading: boolean
  isFetching: boolean
  error: unknown
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  const sorted = [...items].sort((a, b) => (
    runtimeHealthRank(b) - runtimeHealthRank(a) ||
    b.priority - a.priority ||
    runtimeHealthKey(a).localeCompare(runtimeHealthKey(b))
  ))

  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">{t('admin.models.runtimeHealthTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('admin.models.runtimeHealthSubtitle', { count: items.length })}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isFetching}>
          <RefreshCw size={13} className={cn('mr-1.5', isFetching && 'animate-spin')} />
          {t('admin.models.runtimeHealthRefresh')}
        </Button>
      </div>

      {error ? (
        <AppFeedbackText as="div" className="px-4 py-3">{translateAPIRequestError(error)}</AppFeedbackText>
      ) : isLoading ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">{t('admin.models.runtimeHealthLoading')}</div>
      ) : sorted.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">{t('admin.models.runtimeHealthEmpty')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">{t('admin.models.runtimeHealthProvider')}</th>
                <th className="px-3 py-2 font-medium">{t('admin.models.runtimeHealthModel')}</th>
                <th className="px-3 py-2 font-medium">{t('admin.models.runtimeHealthCapacity')}</th>
                <th className="px-3 py-2 font-medium">{t('admin.models.runtimeHealthTraffic')}</th>
                <th className="px-3 py-2 font-medium">{t('admin.models.runtimeHealthOutcome')}</th>
                <th className="px-4 py-2 font-medium">{t('admin.models.runtimeHealthState')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((item) => {
                const state = runtimeHealthState(item, t)
                return (
                  <tr key={runtimeHealthKey(item)} className="align-top">
                    <td className="px-4 py-2">
                      <p className="font-medium text-foreground">{item.provider_name || '-'}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{item.adapter_type}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-mono text-foreground">{item.model_id || item.model_def_id || '-'}</p>
                      {(item.route_binding_id || item.catalog_entry_id) && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {item.route_binding_id
                            ? t('admin.models.runtimeHealthRouteBindingValue', { value: item.route_binding_id, defaultValue: 'route #{{value}}' })
                            : t('admin.models.runtimeHealthCatalogEntryValue', { value: item.catalog_entry_id, defaultValue: 'catalog #{{value}}' })}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <p>{t('admin.models.runtimeHealthPriorityValue', { value: item.priority })}</p>
                      <p>{t('admin.models.runtimeHealthWeightValue', { value: item.capacity_weight || 1 })}</p>
                      <p>{t('admin.models.runtimeHealthMaxConcurrencyValue', { value: item.max_concurrency > 0 ? item.max_concurrency : t('admin.models.runtimeHealthUnlimited') })}</p>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <p>{t('admin.models.runtimeHealthInFlightValue', { value: item.in_flight })}</p>
                      {item.cooldown_remaining_ms > 0 && (
                        <p>{t('admin.models.runtimeHealthCooldownValue', { value: formatRuntimeCooldown(item.cooldown_remaining_ms) })}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <p>{t('admin.models.runtimeHealthSuccessFailureValue', { success: item.successes, failure: item.failures })}</p>
                      <p>{formatFailureRate(item.failure_rate)}</p>
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge {...state.statusProps} className="text-[11px]">
                        {state.label}
                      </StatusBadge>
                      {item.consecutive_failures > 0 && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t('admin.models.runtimeHealthConsecutiveFailures', { count: item.consecutive_failures })}
                        </p>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function runtimeHealthRank(item: RuntimeProviderHealth) {
  if (!item.is_enabled) return 4
  if (item.circuit_open) return 3
  if (item.saturated) return 2
  if (item.failures > 0) return 1
  return 0
}

function runtimeHealthKey(item: RuntimeProviderHealth) {
  if (item.route_binding_id) return `route:${item.route_binding_id}`
  if (item.catalog_entry_id) return `catalog:${item.catalog_entry_id}:${item.provider_name}:${item.adapter_type}`
  return [item.provider_name, item.adapter_type, item.model_id || item.model_def_id].join(':')
}

function runtimeHealthState(item: RuntimeProviderHealth, t: (key: string, options?: Record<string, unknown>) => string): {
  label: string
  statusProps: Pick<StatusBadgeProps, 'intent' | 'emphasis'>
} {
  if (!item.is_enabled) {
    return { label: t('admin.models.runtimeHealthDisabled'), statusProps: { intent: 'neutral', emphasis: 'soft' } }
  }
  if (item.circuit_open) {
    return { label: t('admin.models.runtimeHealthCircuitOpen'), statusProps: { intent: 'danger', emphasis: 'soft' } }
  }
  if (item.saturated) {
    return { label: t('admin.models.runtimeHealthSaturated'), statusProps: { intent: 'warning', emphasis: 'soft' } }
  }
  if (item.failures > 0) {
    return { label: t('admin.models.runtimeHealthDegraded'), statusProps: { intent: 'warning', emphasis: 'soft' } }
  }
  return { label: t('admin.models.runtimeHealthHealthy'), statusProps: { intent: 'success', emphasis: 'soft' } }
}

function formatFailureRate(value: number) {
  return `${Math.round((Number.isFinite(value) ? value : 0) * 1000) / 10}%`
}

function formatRuntimeCooldown(ms: number) {
  if (ms <= 0) return '0s'
  return `${Math.ceil(ms / 1000)}s`
}

// ── Tab 3: 项目 Owner 管理 ────────────────────────────────────────────────────

interface AdminProjectMember {
  ID: number
  user_id: number
  role: string
  CreatedAt?: string
  user?: User
}

interface AdminProject extends Project {
  members?: AdminProjectMember[]
}

interface AdminProjectDetail {
  project: AdminProject
  member_count: number
  script_count: number
  content_unit_count: number
  asset_slot_count: number
  resource_count: number
  usage: {
    calls: number
    cost: number
    input_tokens: number
    output_tokens: number
    images: number
    duration_sec: number
  }
  audit: {
    records: number
    last_action?: string
    last_at?: string
  }
}

export function ProjectOwnerManagementPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [ownerDialog, setOwnerDialog] = useState<AdminProject | null>(null)
  const [editDialog, setEditDialog] = useState<AdminProject | null>(null)
  const [createProjectName, setCreateProjectName] = useState('')
  const [createProjectDescription, setCreateProjectDescription] = useState('')
  const [createProjectOwnerId, setCreateProjectOwnerId] = useState('')
  const [createProjectOrgId, setCreateProjectOrgId] = useState('')
  const [selectedOwnerId, setSelectedOwnerId] = useState('')
  const [editProjectName, setEditProjectName] = useState('')
  const [projectFilters, setProjectFilters] = useState<ProjectListFilters>(() => projectFiltersFromSearchParams(searchParams))
  const [page, setPage] = useState(() => projectPageFromSearchParams(searchParams))
  const [memberDialog, setMemberDialog] = useState<AdminProject | null>(null)
  const [newMemberUserId, setNewMemberUserId] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('viewer')
  const [projectError, setProjectError] = useState('')
  const { query, projectId: projectIdFilter, ownerId: ownerFilter, orgId: orgFilter } = projectFilters

  const { data, isFetching, refetch, error: projectsQueryError } = useQuery<{ projects: AdminProject[]; total: number }>({
    queryKey: ['admin', 'projects', query, projectIdFilter, ownerFilter, orgFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: '25',
      })
      if (query.trim()) params.set('q', query.trim())
      if (projectIdFilter) params.set('project_id', projectIdFilter)
      if (ownerFilter) params.set('owner_id', ownerFilter)
      if (orgFilter) params.set('org_id', orgFilter)
      const res = await api.get(`/admin/projects?${params.toString()}`)
      const payload = readRecordPayload(res.data)
      const projects = readListPayload<AdminProject>(res.data, ['projects', 'items', 'records'])
      return {
        projects,
        total: readNumberPayload(res.headers['x-total-count'] ?? payload.total, projects.length),
      }
    },
  })
  const projects = data?.projects ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / 25))
  const projectMembersQuery = useQuery<AdminProjectMember[]>({
    queryKey: ['admin', 'projects', memberDialog?.ID, 'members'],
    queryFn: () => api.get(`/admin/projects/${memberDialog?.ID}/members`).then((r) => readListPayload<AdminProjectMember>(r.data, ['members', 'items', 'records'])),
    enabled: !!memberDialog,
  })
  const projectDetailQuery = useQuery<AdminProjectDetail>({
    queryKey: ['admin', 'projects', memberDialog?.ID, 'detail'],
    queryFn: () => api.get(`/admin/projects/${memberDialog?.ID}/detail`).then((r) => r.data),
    enabled: !!memberDialog,
  })

  const forceSetOwner = useMutation({
    mutationFn: ({ projectId, ownerId }: { projectId: number; ownerId: number }) =>
      api.put(`/admin/projects/${projectId}/owner`, { owner_id: ownerId }),
    onSuccess: (_result, variables) => {
      setProjectError('')
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
      qc.invalidateQueries({ queryKey: ['admin', 'projects', variables.projectId, 'detail'] })
      qc.invalidateQueries({ queryKey: ['admin', 'projects', variables.projectId, 'members'] })
      setOwnerDialog(null)
      setSelectedOwnerId('')
    },
    onError: (err: any) => setProjectError(translateAPIRequestError(err)),
  })
  const deleteProject = useMutation({
    mutationFn: (project: AdminProject) => api.delete(`/admin/projects/${project.ID}`),
    onSuccess: () => {
      setProjectError('')
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
    },
    onError: (err: any) => setProjectError(translateAPIRequestError(err)),
  })
  const createProject = useMutation({
    mutationFn: ({ name, description, ownerId, orgId }: { name: string; description: string; ownerId: number; orgId?: number }) =>
      api.post('/admin/projects', { name, description, owner_id: ownerId, org_id: orgId }).then((r) => r.data),
    onSuccess: () => {
      setProjectError('')
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
      setCreateDialogOpen(false)
      setCreateProjectName('')
      setCreateProjectDescription('')
      setCreateProjectOwnerId('')
      setCreateProjectOrgId('')
    },
    onError: (err: any) => setProjectError(translateAPIRequestError(err)),
  })
  const updateProject = useMutation({
    mutationFn: ({ projectId, name }: { projectId: number; name: string }) =>
      api.patch(`/admin/projects/${projectId}`, { name }).then((r) => r.data),
    onSuccess: (_result, variables) => {
      setProjectError('')
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
      qc.invalidateQueries({ queryKey: ['admin', 'projects', variables.projectId, 'detail'] })
      setEditDialog(null)
      setEditProjectName('')
    },
    onError: (err: any) => setProjectError(translateAPIRequestError(err)),
  })
  const addProjectMember = useMutation({
    mutationFn: ({ projectId, userId, role }: { projectId: number; userId: number; role: string }) =>
      api.post(`/admin/projects/${projectId}/members`, { user_id: userId, role }).then((r) => r.data),
    onSuccess: (_result, variables) => {
      setProjectError('')
      setNewMemberUserId('')
      setNewMemberRole('viewer')
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
      qc.invalidateQueries({ queryKey: ['admin', 'projects', variables.projectId, 'members'] })
      qc.invalidateQueries({ queryKey: ['admin', 'projects', variables.projectId, 'detail'] })
    },
    onError: (err: any) => setProjectError(translateAPIRequestError(err)),
  })
  const updateProjectMember = useMutation({
    mutationFn: ({ projectId, memberId, role }: { projectId: number; memberId: number; role: string }) =>
      api.patch(`/admin/projects/${projectId}/members/${memberId}`, { role }).then((r) => r.data),
    onSuccess: (_result, variables) => {
      setProjectError('')
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
      qc.invalidateQueries({ queryKey: ['admin', 'projects', variables.projectId, 'members'] })
      qc.invalidateQueries({ queryKey: ['admin', 'projects', variables.projectId, 'detail'] })
    },
    onError: (err: any) => setProjectError(translateAPIRequestError(err)),
  })
  const removeProjectMember = useMutation({
    mutationFn: ({ projectId, memberId }: { projectId: number; memberId: number }) =>
      api.delete(`/admin/projects/${projectId}/members/${memberId}`),
    onSuccess: (_result, variables) => {
      setProjectError('')
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
      qc.invalidateQueries({ queryKey: ['admin', 'projects', variables.projectId, 'members'] })
      qc.invalidateQueries({ queryKey: ['admin', 'projects', variables.projectId, 'detail'] })
    },
    onError: (err: any) => setProjectError(translateAPIRequestError(err)),
  })

  const openOwnerDialog = (project: AdminProject) => {
    setOwnerDialog(project)
    setSelectedOwnerId('')
  }

  const openEditDialog = (project: AdminProject) => {
    setEditDialog(project)
    setEditProjectName(project.name || '')
  }

  function updateProjectFilter(key: keyof ProjectListFilters, value: string) {
    const next = { ...projectFilters, [key]: value }
    setProjectFilters(next)
    setPage(1)
    setSearchParams(projectSearchParams(next, 1), { replace: true })
  }

  const clearFilters = () => {
    setProjectFilters(emptyProjectListFilters)
    setPage(1)
    setSearchParams({}, { replace: true })
  }

  function updateProjectPage(nextPage: number) {
    const normalized = Math.max(1, Math.min(pageCount, nextPage))
    setPage(normalized)
    setSearchParams(projectSearchParams(projectFilters, normalized), { replace: true })
  }

  const removeProject = (project: AdminProject) => {
    if (window.confirm(t('admin.projects.confirmDelete', { name: project.name || `#${project.ID}` }))) {
      deleteProject.mutate(project)
    }
  }

  const submitProjectCreate = () => {
    const ownerId = Number(createProjectOwnerId)
    const orgId = createProjectOrgId ? Number(createProjectOrgId) : undefined
    if (!createProjectName.trim() || !Number.isFinite(ownerId) || ownerId <= 0) return
    if (orgId !== undefined && (!Number.isFinite(orgId) || orgId <= 0)) return
    createProject.mutate({
      name: createProjectName,
      description: createProjectDescription,
      ownerId,
      orgId,
    })
  }

  const submitProjectUpdate = () => {
    if (!editDialog || !editProjectName.trim()) return
    updateProject.mutate({ projectId: editDialog.ID, name: editProjectName })
  }

  useEffect(() => {
    setProjectFilters(projectFiltersFromSearchParams(searchParams))
    setPage(projectPageFromSearchParams(searchParams))
  }, [searchParams])

  useEffect(() => {
    if (page > pageCount) updateProjectPage(pageCount)
  }, [page, pageCount])

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('admin.projects.title')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('admin.projects.description', { total })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus size={13} className="mr-1.5" />
            {t('admin.projects.create')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={13} className={cn('mr-1.5', isFetching && 'animate-spin')} />
            {t('admin.projects.refresh')}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[minmax(180px,1fr)_110px_130px_130px_auto]">
        <Input
          value={query}
          onChange={(event) => updateProjectFilter('query', event.target.value)}
          placeholder={t('admin.projects.searchPlaceholder')}
          className="h-9"
        />
        <Input
          value={projectIdFilter}
          onChange={(event) => updateProjectFilter('projectId', event.target.value.replace(/[^\d]/g, ''))}
          placeholder={t('admin.projects.projectId')}
          className="h-9"
        />
        <Input
          value={ownerFilter}
          onChange={(event) => updateProjectFilter('ownerId', event.target.value.replace(/[^\d]/g, ''))}
          placeholder={t('admin.projects.ownerId')}
          className="h-9"
        />
        <Input
          value={orgFilter}
          onChange={(event) => updateProjectFilter('orgId', event.target.value.replace(/[^\d]/g, ''))}
          placeholder={t('admin.projects.orgId')}
          className="h-9"
        />
        <Button variant="outline" size="sm" onClick={clearFilters}>
          {t('admin.projects.clear')}
        </Button>
      </div>

      {projectError && (
        <AppInlineError>
          {projectError}
        </AppInlineError>
      )}

      {projectsQueryError && (
        <AppInlineError>
          {translateAPIRequestError(projectsQueryError)}
        </AppInlineError>
      )}

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-card border-b border-border">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.id')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.name')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.owner')}</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.orgId')}</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.members')}</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.updatedAt')}</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {projects.map((project) => {
              const ownerName = project.owner?.username || (project.owner_id ? `#${project.owner_id}` : t('admin.projects.noOwner'))
              return (
                <AppDataTableRow key={project.ID} interactive tone={project.owner_id === 0 ? 'danger' : undefined}>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{project.ID}</td>
                  <td className="px-4 py-3 font-medium">{project.name || t('common.emptyTitle')}</td>
                  <td className="px-4 py-3">
                    <AppFeedbackText as="span" tone={project.owner_id === 0 ? 'danger' : 'neutral'} className={project.owner_id === 0 ? 'font-medium' : undefined}>
                      {ownerName}
                    </AppFeedbackText>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">{project.org_id ? `#${project.org_id}` : '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setMemberDialog(project)}
                      className="font-mono text-sm tabular-nums text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                    >
                      {(project.members?.length ?? 0).toLocaleString()}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                    {project.UpdatedAt ? new Date(project.UpdatedAt).toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openEditDialog(project)}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title={t('admin.projects.edit')}
                      aria-label={t('admin.projects.edit')}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => openOwnerDialog(project)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {t('admin.projects.changeOwner')}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      intent="danger"
                      onClick={() => removeProject(project)}
                      disabled={deleteProject.isPending}
                      title={t('admin.projects.delete')}
                      aria-label={t('admin.projects.delete')}
                    >
                      <Trash2 size={13} />
                    </Button>
                    </div>
                  </td>
                </AppDataTableRow>
              )
            })}
            {!projectsQueryError && projects.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">{t('admin.projects.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 25 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('admin.projects.pageStatus', { page, pageCount })}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => updateProjectPage(page - 1)} disabled={page === 1}>
              {t('admin.projects.previousPage')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => updateProjectPage(page + 1)} disabled={page === pageCount}>
              {t('admin.projects.nextPage')}
            </Button>
          </div>
        </div>
      )}

      {memberDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-5xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('admin.projects.membersTitle', { name: memberDialog.name || `#${memberDialog.ID}` })}</h3>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">#{memberDialog.ID}</p>
              </div>
              <button
                type="button"
                onClick={() => setMemberDialog(null)}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t('common.close')}
              >
                <X size={16} />
              </button>
            </div>
            <div className="border-b border-border px-5 py-4">
              {projectDetailQuery.error && (
                <AppInlineError className="mb-3">
                  {translateAPIRequestError(projectDetailQuery.error)}
                </AppInlineError>
              )}
              {projectDetailQuery.isLoading && (
                <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{t('common.loading')}</div>
              )}
              {projectDetailQuery.data && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <ProjectDetailMetric label={t('admin.projects.detailMembers')} value={formatAdminNumber(projectDetailQuery.data.member_count)} />
                  <ProjectDetailMetric
                    label={t('admin.projects.detailProduction')}
                    value={formatAdminNumber(projectDetailQuery.data.content_unit_count)}
                    detail={t('admin.projects.detailProductionBreakdown', {
                      scripts: formatAdminNumber(projectDetailQuery.data.script_count),
                      slots: formatAdminNumber(projectDetailQuery.data.asset_slot_count),
                      resources: formatAdminNumber(projectDetailQuery.data.resource_count),
                    })}
                  />
                  <ProjectDetailMetric
                    label={t('admin.projects.detailUsageCost')}
                    value={formatAdminCredits(projectDetailQuery.data.usage.cost)}
                    detail={t('admin.projects.detailUsageCalls', { count: formatAdminNumber(projectDetailQuery.data.usage.calls) })}
                  />
                  <ProjectDetailMetric
                    label={t('admin.projects.detailAuditRecords')}
                    value={formatAdminNumber(projectDetailQuery.data.audit.records)}
                    detail={projectDetailQuery.data.audit.last_action ? `${projectDetailQuery.data.audit.last_action} · ${projectDetailQuery.data.audit.last_at ? new Date(projectDetailQuery.data.audit.last_at).toLocaleString() : '-'}` : undefined}
                  />
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild type="button" variant="outline" size="sm">
                  <Link to={usageLogsHref({ projectId: memberDialog.ID })}>
                    <BarChart3 size={14} className="mr-2" />
                    {t('admin.projects.viewUsageLogs')}
                  </Link>
                </Button>
                <Button asChild type="button" variant="outline" size="sm">
                  <Link to={auditLogsHref({ projectId: memberDialog.ID })}>
                    <ScrollText size={14} className="mr-2" />
                    {t('admin.projects.viewAuditLogs')}
                  </Link>
                </Button>
              </div>
            </div>
            <div className="grid gap-2 border-b border-border bg-card/60 px-5 py-3 md:grid-cols-[minmax(0,1fr)_150px_auto]">
              <ActiveUserSelect
                value={newMemberUserId}
                onChange={setNewMemberUserId}
                placeholder={t('admin.projects.selectMemberUser')}
                emptyLabel={t('admin.projects.noOwnerCandidates')}
              />
              <select
                value={newMemberRole}
                onChange={(event) => setNewMemberRole(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {['director', 'writer', 'generator', 'viewer'].map((role) => (
                  <option key={role} value={role}>{t(`admin.projects.memberRoles.${role}`, { defaultValue: role })}</option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                onClick={() => addProjectMember.mutate({ projectId: memberDialog.ID, userId: Number(newMemberUserId), role: newMemberRole })}
                disabled={addProjectMember.isPending || !newMemberUserId}
              >
                {addProjectMember.isPending ? t('common.saving') : t('admin.projects.addMember')}
              </Button>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-card">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.projects.member')}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.projects.role')}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.projects.joinedAt')}</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {projectMembersQuery.error && (
                    <tr>
                      <td colSpan={4} className="px-4 py-3">
                        <AppFeedbackText>{translateAPIRequestError(projectMembersQuery.error)}</AppFeedbackText>
                      </td>
                    </tr>
                  )}
                  {projectMembersQuery.isLoading && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</td>
                    </tr>
                  )}
                  {!projectMembersQuery.isLoading && !projectMembersQuery.error && (projectMembersQuery.data ?? []).length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">{t('admin.projects.noMembers')}</td>
                    </tr>
                  )}
                  {(projectMembersQuery.data ?? []).map((member) => (
                    <tr key={member.ID}>
                      <td className="px-4 py-3">
                        <Link to={userListHref({ userId: member.user_id })} className="block font-medium text-foreground underline-offset-2 hover:underline">
                          {member.user?.display_name || member.user?.username || `#${member.user_id}`}
                        </Link>
                        <Link to={userListHref({ userId: member.user_id })} className="block font-mono text-xs text-muted-foreground underline-offset-2 hover:underline">
                          #{member.user_id}{member.user?.primary_email ? ` · ${member.user.primary_email}` : ''}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {member.role === 'owner' ? (
                          <span className="text-xs text-muted-foreground">{t('admin.projects.memberRoles.owner')}</span>
                        ) : (
                          <select
                            value={member.role}
                            onChange={(event) => updateProjectMember.mutate({ projectId: memberDialog.ID, memberId: member.ID, role: event.target.value })}
                            disabled={updateProjectMember.isPending}
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            {['director', 'writer', 'generator', 'viewer'].map((role) => (
                              <option key={role} value={role}>{t(`admin.projects.memberRoles.${role}`, { defaultValue: role })}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {member.CreatedAt ? new Date(member.CreatedAt).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {member.role !== 'owner' && (
                          <Button
                            type="button"
                            onClick={() => {
                              if (window.confirm(t('admin.projects.confirmRemoveMember'))) {
                                removeProjectMember.mutate({ projectId: memberDialog.ID, memberId: member.ID })
                              }
                            }}
                            disabled={removeProjectMember.isPending}
                            variant="ghost"
                            size="icon-xs"
                            intent="danger"
                            title={t('admin.projects.removeMember')}
                            aria-label={t('admin.projects.removeMember')}
                          >
                            <Trash2 size={13} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {createDialogOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('admin.projects.createTitle')}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('admin.projects.createHint')}</p>
              </div>
              <button
                type="button"
                onClick={() => setCreateDialogOpen(false)}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t('common.close')}
              >
                <X size={16} />
              </button>
            </div>
            <div className="grid gap-3 p-5">
              <div>
                <Label className="text-xs text-muted-foreground block mb-1">{t('admin.projects.name')}</Label>
                <Input value={createProjectName} onChange={(event) => setCreateProjectName(event.target.value)} className="h-9" autoFocus />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground block mb-1">{t('admin.projects.projectDescription')}</Label>
                <Input value={createProjectDescription} onChange={(event) => setCreateProjectDescription(event.target.value)} className="h-9" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <ActiveUserSelect
                    label={t('admin.projects.ownerId')}
                    value={createProjectOwnerId}
                    onChange={setCreateProjectOwnerId}
                    placeholder={t('admin.projects.selectOwnerUser')}
                    emptyLabel={t('admin.projects.noOwnerCandidates')}
                  />
                </div>
                <div>
                  <ActiveOrgSelect
                    label={t('admin.projects.orgId')}
                    value={createProjectOrgId}
                    onChange={setCreateProjectOrgId}
                    placeholder={t('admin.projects.selectOrg')}
                    emptyLabel={t('admin.projects.noOrgCandidates')}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button size="sm" onClick={submitProjectCreate} disabled={createProject.isPending || !createProjectName.trim() || !createProjectOwnerId}>
                {createProject.isPending ? t('common.saving') : t('admin.projects.create')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('admin.projects.editTitle')}</h3>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">#{editDialog.ID}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditDialog(null)}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t('common.close')}
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <div>
                <Label className="text-xs text-muted-foreground block mb-1">{t('admin.projects.name')}</Label>
                <Input
                  value={editProjectName}
                  onChange={(event) => setEditProjectName(event.target.value)}
                  className="h-9"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <Button variant="outline" size="sm" onClick={() => setEditDialog(null)}>
                {t('common.cancel')}
              </Button>
              <Button size="sm" onClick={submitProjectUpdate} disabled={updateProject.isPending || !editProjectName.trim()}>
                {updateProject.isPending ? t('common.saving') : t('admin.projects.save')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {ownerDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-background rounded-xl shadow-2xl w-96 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">{t('admin.projects.changeOwnerTitle', { name: ownerDialog.name })}</h3>
              <p className="text-xs text-muted-foreground mt-1">{t('admin.projects.changeOwnerHint')}</p>
            </div>
            <div>
              <ActiveUserSelect
                label={t('admin.projects.newOwner')}
                value={selectedOwnerId}
                onChange={setSelectedOwnerId}
                placeholder={t('admin.projects.selectOwnerUser')}
                emptyLabel={t('admin.projects.noOwnerCandidates')}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => forceSetOwner.mutate({ projectId: ownerDialog.ID, ownerId: Number(selectedOwnerId) })}
                disabled={forceSetOwner.isPending || !selectedOwnerId}
                className="flex-1"
              >
                {forceSetOwner.isPending ? t('common.saving') : t('admin.projects.forceChange')}
              </Button>
              <Button variant="outline" onClick={() => setOwnerDialog(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectDetailMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-semibold text-foreground">{value}</div>
      {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
    </div>
  )
}

// ── Model capability labels ───────────────────────────────────────────────────

const CAPABILITY_TRANSLATION_KEYS: Record<string, string> = {
  text: 'admin.capabilities.text',
  reasoning: 'admin.capabilities.reasoning',
  image: 'admin.capabilities.image',
  image_edit: 'admin.capabilities.imageEdit',
  video: 'admin.capabilities.video',
  video_i2v: 'admin.capabilities.videoI2V',
  video_v2v: 'admin.capabilities.videoV2V',
  audio: 'admin.capabilities.audio',
  audio_tts: 'admin.capabilities.audioTTS',
  audio_transcribe: 'admin.capabilities.audioTranscribe',
  audio_translate: 'admin.capabilities.audioTranslate',
  audio_music: 'admin.capabilities.audioMusic',
  audio_sfx: 'admin.capabilities.audioSfx',
  audio_chat: 'admin.capabilities.audioChat',
  voice_clone: 'admin.capabilities.voiceClone',
  voice_design: 'admin.capabilities.voiceDesign',
  subtitle_align: 'admin.capabilities.subtitleAlign',
  subtitle_translate: 'admin.capabilities.subtitleTranslate',
}

const MODEL_CAPABILITIES = [
  'text',
  'reasoning',
  'image',
  'image_edit',
  'video',
  'video_i2v',
  'video_v2v',
  'audio_tts',
  'audio_transcribe',
  'audio_translate',
  'audio_music',
  'audio_sfx',
  'audio_chat',
  'voice_clone',
  'voice_design',
  'subtitle_align',
  'subtitle_translate',
] as const

const CAPABILITY_STATUS_INTENT: Record<string, StatusBadgeProps['intent']> = {
  text: 'info',
  reasoning: 'warning',
  image: 'neutral',
  image_edit: 'neutral',
  video: 'neutral',
  video_i2v: 'neutral',
  video_v2v: 'neutral',
  audio: 'info',
  audio_tts: 'info',
  audio_transcribe: 'info',
  audio_translate: 'info',
  audio_music: 'info',
  audio_sfx: 'info',
  audio_chat: 'info',
  voice_clone: 'info',
  voice_design: 'info',
  subtitle_align: 'info',
  subtitle_translate: 'info',
}

// ── Tab: 存储配置 ──────────────────────────────────────────────────────────────
type ResourceAdminDetail = {
  resource: RawResource
  binding_count: number
  bindings: ResourceBinding[]
}

export function StoragePage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [resourcePage, setResourcePage] = useState(() => resourcePageFromSearchParams(searchParams))
  const [detailResource, setDetailResource] = useState<RawResource | null>(null)
  const [resourceFilters, setResourceFilters] = useState<ResourceListFilters>(() => resourceFiltersFromSearchParams(searchParams))
  const [resourceError, setResourceError] = useState('')
  const { data: backends, error: backendsQueryError } = useQuery<{ default: string; backends: { name: string; available: boolean }[] }>({
    queryKey: ['admin-storage-backends'],
    queryFn: () => api.get('/admin/resource-storage/backends').then(r => r.data),
  })

  const { data: stats = [], error: statsQueryError } = useQuery<{
    user_id: number
    username: string
    storage_backend: string
    count: number
    total_size: number
  }[]>({
    queryKey: ['admin-storage-stats'],
    queryFn: () => api.get('/admin/resource-storage/stats').then(r => r.data),
  })
  const resourceParams = {
    page: resourcePage,
    page_size: 50,
    q: resourceFilters.q.trim() || undefined,
    type: resourceFilters.type || undefined,
    storage_backend: resourceFilters.storageBackend || undefined,
    user_id: resourceFilters.userId.trim() || undefined,
    org_id: resourceFilters.orgId.trim() || undefined,
  }
  const { data: resources, isLoading: resourcesLoading, error: resourcesQueryError } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['admin-storage-resources', resourceParams],
    queryFn: () => api.get('/admin/resource-storage/resources', { params: resourceParams }).then(r => r.data),
  })
  const resourcePageCount = Math.max(1, Math.ceil((resources?.total ?? 0) / 50))
  const resourceDetailQuery = useQuery<ResourceAdminDetail>({
    queryKey: ['admin-storage-resources', detailResource?.ID, 'detail'],
    queryFn: () => api.get(`/admin/resource-storage/resources/${detailResource?.ID}/detail`).then(r => r.data),
    enabled: !!detailResource,
  })
  const deleteResource = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/resource-storage/resources/${id}`),
    onSuccess: (_data, id) => {
      setResourceError('')
      if (detailResource?.ID === id) setDetailResource(null)
      qc.invalidateQueries({ queryKey: ['admin-storage-resources'] })
      qc.invalidateQueries({ queryKey: ['admin-storage-stats'] })
    },
    onError: (err: any) => setResourceError(translateAPIRequestError(err)),
  })

  function formatBytes(b: number) {
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / 1024 / 1024).toFixed(1)} MB`
  }
  function updateResourceFilter(key: keyof ResourceListFilters, value: string) {
    const next = { ...resourceFilters, [key]: value }
    setResourceFilters(next)
    setResourcePage(1)
    setSearchParams(resourceSearchParams(next, 1), { replace: true })
  }
  function clearResourceFilters() {
    setResourceFilters(emptyResourceListFilters)
    setResourcePage(1)
    setSearchParams({}, { replace: true })
  }
  function updateResourcePage(nextPage: number) {
    const normalized = Math.max(1, Math.min(resourcePageCount, nextPage))
    setResourcePage(normalized)
    setSearchParams(resourceSearchParams(resourceFilters, normalized), { replace: true })
  }
  function formatDate(value?: string) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  useEffect(() => {
    setResourceFilters(resourceFiltersFromSearchParams(searchParams))
    setResourcePage(resourcePageFromSearchParams(searchParams))
  }, [searchParams])

  useEffect(() => {
    if (resourcePage > resourcePageCount) updateResourcePage(resourcePageCount)
  }, [resourcePage, resourcePageCount])

  // Group by user
  const byUser: Record<number, { username: string; backends: Record<string, { count: number; size: number }> }> = {}
  for (const row of stats) {
    if (!byUser[row.user_id]) byUser[row.user_id] = { username: row.username, backends: {} }
    byUser[row.user_id].backends[row.storage_backend] = { count: row.count, size: row.total_size }
  }
  const storageQueryError = backendsQueryError || statsQueryError || resourcesQueryError

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border border-border rounded-lg bg-card p-4">
          <p className="text-sm font-semibold">{t('admin.storage.internalStorage')}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {t('admin.storage.internalStorageDescription')}
          </p>
        </div>
        <div className="border border-border rounded-lg bg-card p-4">
          <p className="text-sm font-semibold">{t('admin.storage.modelInputRelay')}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {t('admin.storage.modelInputRelayDescription')}
          </p>
        </div>
      </div>

      {storageQueryError && (
        <AppInlineError>
          {translateAPIRequestError(storageQueryError)}
        </AppInlineError>
      )}

      {/* Backend status */}
      <div>
        <h3 className="text-sm font-semibold mb-3">{t('admin.storage.internalBackends')}</h3>
        <div className="flex gap-3 flex-wrap">
          {(backends?.backends ?? []).map(b => (
            <div key={b.name} className="flex items-center gap-2 border border-border rounded-lg px-4 py-2.5 text-sm">
              <AppMarkerDot tone={b.available ? 'success' : 'danger'} size="xs" />
              {b.name === 'local'
                ? <span className="i-lucide-hard-drive text-muted-foreground" />
                : <span className="i-lucide-cloud text-info" />
              }
              <span className="font-medium capitalize">{b.name}</span>
              {b.name === backends?.default && (
                <StatusBadge intent="info">{t('admin.storage.default')}</StatusBadge>
              )}
              <StatusBadge intent="success" emphasis="plain">{t('admin.storage.available')}</StatusBadge>
            </div>
          ))}
        </div>
      </div>

      {/* Per-user stats */}
      <div>
        <h3 className="text-sm font-semibold mb-3">{t('admin.storage.userResourceUsage')}</h3>
        {Object.keys(byUser).length === 0 && !statsQueryError ? (
          <p className="text-sm text-muted-foreground">{t('admin.storage.noResourceData')}</p>
        ) : Object.keys(byUser).length > 0 ? (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">{t('admin.logs.user')}</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">{t('admin.storage.internalBackend')}</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">{t('admin.storage.fileCount')}</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">{t('admin.storage.usedSpace')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byUser).flatMap(([uid, u]) =>
                  Object.entries(u.backends).map(([backend, info], idx) => (
                    <tr key={`${uid}-${backend}`} className="border-t border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-foreground">{idx === 0 ? u.username : ''}</td>
                      <td className="px-4 py-2.5 text-muted-foreground capitalize">{backend}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <Link
                          to={resourceListHref({ userId: uid, storageBackend: backend })}
                          className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
                        >
                          {info.count}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{formatBytes(info.size)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{t('admin.storage.resourceDetails')}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('admin.storage.resourceDetailsDescription')}</p>
          </div>
        </div>
        <div className="mb-3 rounded-lg border border-border bg-card p-3">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.storage.search')}</Label>
              <Input className="h-8 text-xs" value={resourceFilters.q} onChange={(event) => updateResourceFilter('q', event.target.value)} placeholder={t('admin.storage.searchPlaceholder')} />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.storage.type')}</Label>
              <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" value={resourceFilters.type} onChange={(event) => updateResourceFilter('type', event.target.value)}>
                <option value="">{t('common.all')}</option>
                {['image', 'video', 'audio', 'text', 'file'].map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.storage.internalBackend')}</Label>
              <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" value={resourceFilters.storageBackend} onChange={(event) => updateResourceFilter('storageBackend', event.target.value)}>
                <option value="">{t('common.all')}</option>
                {(backends?.backends ?? []).map((backend) => <option key={backend.name} value={backend.name}>{backend.name}</option>)}
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.logs.userId')}</Label>
              <Input className="h-8 text-xs" value={resourceFilters.userId} onChange={(event) => updateResourceFilter('userId', event.target.value.replace(/\D/g, ''))} placeholder="42" />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.logs.orgId')}</Label>
              <Input className="h-8 text-xs" value={resourceFilters.orgId} onChange={(event) => updateResourceFilter('orgId', event.target.value)} placeholder="1 / null" />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-end"
              onClick={clearResourceFilters}
            >
              {t('admin.storage.clear')}
            </Button>
          </div>
        </div>
        {resourceError && <AppInlineError className="mb-3">{resourceError}</AppInlineError>}
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.storage.resource')}</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.logs.user')}</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.storage.internalBackend')}</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{t('admin.storage.usedSpace')}</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.storage.createdAt')}</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{t('admin.gatewayKeys.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {(resources?.items ?? []).map((resource) => (
                <tr key={resource.ID} className="border-t border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-foreground">{resource.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">#{resource.ID} · {resource.type} · {resource.mime_type || '-'}</div>
                    {resource.storage_key && <div className="max-w-md truncate font-mono text-xs text-muted-foreground/70">{resource.storage_key}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    <div>{resource.owner?.username ?? `#${resource.owner_id}`}</div>
                    <div className="font-mono">#{resource.owner_id}{resource.org_id ? ` · org #${resource.org_id}` : ''}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{resource.storage_backend || '-'}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{formatBytes(resource.size || 0)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">{formatDate(resource.CreatedAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDetailResource(resource)}
                    >
                      <Eye size={13} className="mr-1" />
                      {t('admin.storage.details')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => { if (window.confirm(t('admin.storage.confirmDeleteResource', { name: resource.name }))) deleteResource.mutate(resource.ID) }}
                      disabled={deleteResource.isPending}
                      intent="danger"
                    >
                      <Trash2 size={13} className="mr-1" />
                      {t('common.delete')}
                    </Button>
                  </td>
                </tr>
              ))}
              {!resourcesLoading && !resourcesQueryError && (resources?.items ?? []).length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">{t('admin.storage.noResources')}</td></tr>
              )}
              {resourcesLoading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-end gap-3">
          <span className="text-xs text-muted-foreground">{t('admin.logs.pageStatus', { page: resourcePage, pageCount: resourcePageCount })}</span>
          <Button type="button" variant="outline" size="sm" disabled={resourcePage <= 1} onClick={() => updateResourcePage(resourcePage - 1)}>{t('admin.logs.previousPage')}</Button>
          <Button type="button" variant="outline" size="sm" disabled={resourcePage >= resourcePageCount} onClick={() => updateResourcePage(resourcePage + 1)}>{t('admin.logs.nextPage')}</Button>
        </div>
      </div>
      {detailResource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-5xl rounded-xl bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('admin.storage.detailsTitle', { name: detailResource.name })}</h3>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">#{detailResource.ID} · {detailResource.type} · {detailResource.mime_type || '-'}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild type="button" variant="outline" size="sm">
                  <Link to={auditLogsHref({ targetType: 'resource', targetId: detailResource.ID, orgId: detailResource.org_id })}>
                    <ScrollText size={14} className="mr-2" />
                    {t('admin.storage.viewAuditLogs')}
                  </Link>
                </Button>
                <button
                  type="button"
                  onClick={() => setDetailResource(null)}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={t('common.close')}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="max-h-[75vh] overflow-auto px-5 py-4">
              {resourceDetailQuery.error && (
                <AppInlineError className="mb-3">
                  {translateAPIRequestError(resourceDetailQuery.error)}
                </AppInlineError>
              )}
              {resourceDetailQuery.isLoading && (
                <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{t('common.loading')}</div>
              )}
              {(() => {
                const detail = resourceDetailQuery.data
                const resource = detail?.resource ?? detailResource
                return (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <ResourceDetailField label={t('admin.storage.owner')} value={`${resource.owner?.username ?? `#${resource.owner_id}`} (#${resource.owner_id})`} />
                      <ResourceDetailField label={t('admin.logs.orgId')} value={resource.org_id ? `#${resource.org_id}` : '-'} />
                      <ResourceDetailField label={t('admin.storage.internalBackend')} value={resource.storage_backend || '-'} />
                      <ResourceDetailField label={t('admin.storage.usedSpace')} value={formatBytes(resource.size || 0)} />
                      <ResourceDetailField label={t('admin.storage.createdAt')} value={formatDate(resource.CreatedAt)} />
                      <ResourceDetailField label={t('admin.storage.updatedAt')} value={formatDate(resource.UpdatedAt)} />
                      <ResourceDetailField label={t('admin.storage.shared')} value={resource.is_shared ? t('admin.storage.sharedYes') : t('admin.storage.sharedNo')} />
                      <ResourceDetailField label={t('admin.storage.verification')} value={resource.verification_status || '-'} />
                    </div>
                    {resource.storage_key && (
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">{t('admin.storage.storageKey')}</p>
                        <div className="break-all rounded-md border border-border bg-card px-3 py-2 font-mono text-xs text-muted-foreground">{resource.storage_key}</div>
                      </div>
                    )}
                    <ResourceDetailPreview resource={resource} />
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">{t('admin.storage.bindings')}</h4>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t('admin.storage.bindingCount', { count: detail?.binding_count ?? 0 })}
                            {detail && detail.binding_count > detail.bindings.length ? ` · ${t('admin.storage.showingBindings', { count: detail.bindings.length })}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-border">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/30">
                            <tr>
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.storage.project')}</th>
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.storage.bindingOwner')}</th>
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.storage.bindingRole')}</th>
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.storage.bindingSource')}</th>
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.storage.createdAt')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {(detail?.bindings ?? []).map((binding) => (
                              <tr key={binding.ID}>
                                <td className="px-4 py-3 font-mono text-xs">
                                  <Link
                                    to={projectListHref({ projectId: binding.project_id })}
                                    className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
                                  >
                                    #{binding.project_id}
                                  </Link>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="font-mono text-xs text-foreground">{binding.owner_type} #{binding.owner_id}</div>
                                  <div className="text-xs text-muted-foreground">{binding.slot || '-'}</div>
                                </td>
                                <td className="px-4 py-3 text-xs text-muted-foreground">
                                  <div>{binding.role}{binding.is_primary ? ` · ${t('admin.storage.primary')}` : ''}</div>
                                  <div>{binding.status || '-'}</div>
                                </td>
                                <td className="px-4 py-3 text-xs text-muted-foreground">
                                  <div>{binding.source_type || '-'}</div>
                                  <div className="font-mono">{binding.source_id ? `#${binding.source_id}` : '-'}</div>
                                </td>
                                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(binding.CreatedAt)}</td>
                              </tr>
                            ))}
                            {!resourceDetailQuery.isLoading && (detail?.bindings ?? []).length === 0 && (
                              <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">{t('admin.storage.noBindings')}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
        )}
      </div>
    )
  }

function ResourceDetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-foreground">{value}</div>
    </div>
  )
}

function ResourceDetailPreview({ resource }: { resource: RawResource }) {
  const { t } = useTranslation()
  const [objectUrl, setObjectUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isImage = isImageResource(resource)
  const isVideo = isVideoResource(resource)
  const canPreview = isImage || isVideo

  useEffect(() => {
    if (!canPreview || resource.direct_url) {
      setObjectUrl('')
      setLoading(false)
      setError('')
      return
    }

    const controller = new AbortController()
    let createdUrl = ''
    setLoading(true)
    setError('')
    setObjectUrl('')

    api.get(`/admin/resource-storage/resources/${resource.ID}/file`, {
      responseType: 'blob',
      signal: controller.signal,
    }).then((response) => {
      createdUrl = URL.createObjectURL(response.data as Blob)
      setObjectUrl(createdUrl)
    }).catch((err) => {
      if (controller.signal.aborted) return
      setError(translateAPIRequestError(err))
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })

    return () => {
      controller.abort()
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [canPreview, resource.ID, resource.direct_url])

  const previewUrl = resource.direct_url || objectUrl
  const fileUrl = previewUrl || resource.direct_url || ''

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-foreground">{t('admin.storage.filePreview')}</h4>
        <div className="flex items-center gap-2">
          {fileUrl && (
            <>
              <Button asChild type="button" variant="outline" size="sm">
                <a href={fileUrl} target="_blank" rel="noreferrer">
                  <ArrowUpRight size={14} className="mr-2" />
                  {t('admin.storage.openFile')}
                </a>
              </Button>
              <Button asChild type="button" variant="outline" size="sm">
                <a href={fileUrl} download={resource.name}>
                  <Download size={14} className="mr-2" />
                  {t('admin.storage.downloadFile')}
                </a>
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
        {canPreview && previewUrl ? (
          isImage ? (
            <div className="flex max-h-[56vh] min-h-64 items-center justify-center bg-black/5 p-3">
              <img src={previewUrl} alt={resource.name} className="max-h-[52vh] max-w-full object-contain" />
            </div>
          ) : (
            <video
              src={previewUrl}
              controls
              preload="metadata"
              className="max-h-[56vh] w-full bg-black"
            />
          )
        ) : (
          <div className="flex min-h-32 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
            {loading ? t('admin.storage.loadingPreview') : error || t('admin.storage.previewUnavailable')}
          </div>
        )}
      </div>
    </div>
  )
}

function isImageResource(resource: RawResource): boolean {
  return resource.type === 'image' || resource.mime_type?.startsWith('image/')
}

function isVideoResource(resource: RawResource): boolean {
  return resource.type === 'video' || resource.mime_type?.startsWith('video/')
}

// ── Tab: 云端文件存储 ──────────────────────────────────────────────────────────

const CONFIG_TYPE_LABELS: Record<string, string> = {
  s3: 'AWS S3',
  oss: 'Alibaba Cloud OSS',
  tos: 'Volcengine TOS',
}

type CloudConfigField = { key: string; label: string; placeholder: string; secret?: boolean; required?: boolean }

const CONFIG_TYPE_FIELDS: Record<string, CloudConfigField[]> = {
  s3: [
    { key: 'region', label: 'Region', placeholder: 'us-east-1', required: true },
    { key: 'bucket', label: 'Bucket', placeholder: 'my-bucket', required: true },
    { key: 'access_key', label: 'Access Key', placeholder: 'AKIA...', secret: true, required: true },
    { key: 'secret_key', label: 'Secret Key', placeholder: '...', secret: true, required: true },
    { key: 'public_base_url', label: 'Public Base URL', placeholder: 'https://my-bucket.s3.amazonaws.com' },
  ],
  oss: [
    { key: 'endpoint', label: 'Endpoint', placeholder: 'oss-cn-hangzhou.aliyuncs.com', required: true },
    { key: 'bucket', label: 'Bucket', placeholder: 'my-bucket', required: true },
    { key: 'access_key_id', label: 'Access Key ID', placeholder: '...', secret: true, required: true },
    { key: 'access_key_secret', label: 'Access Key Secret', placeholder: '...', secret: true, required: true },
    { key: 'public_base_url', label: 'Public Base URL', placeholder: 'https://my-bucket.oss-cn-hangzhou.aliyuncs.com' },
  ],
  tos: [
    { key: 'endpoint', label: 'Endpoint', placeholder: 'tos-cn-beijing.volces.com', required: true },
    { key: 'region', label: 'Region', placeholder: 'cn-beijing', required: true },
    { key: 'bucket', label: 'Bucket', placeholder: 'my-bucket', required: true },
    { key: 'access_key', label: 'Access Key', placeholder: '...', secret: true, required: true },
    { key: 'secret_key', label: 'Secret Key', placeholder: '...', secret: true, required: true },
    { key: 'public_base_url', label: 'Public Base URL', placeholder: 'https://my-bucket.tos-cn-beijing.volces.com' },
  ],
}

interface CloudFileConfig {
  ID: number
  name: string
  config_type: string
  priority: number
  is_enabled: boolean
  masked_config: string
}

interface CloudFileConfigTestResult {
  success: boolean
  message: string
  latency_ms: number
  url?: string
  config_id?: number
}

function parseMaskedCloudConfig(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function missingCloudConfigFields(fields: CloudConfigField[], values: Record<string, string>, editingId: number | null): CloudConfigField[] {
  return fields.filter((field) => {
    if (!field.required) return false
    if (editingId && field.secret) return false
    return !values[field.key]?.trim()
  })
}

export function CloudFileConfigPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formType, setFormType] = useState('s3')
  const [formName, setFormName] = useState('')
  const [formPriority, setFormPriority] = useState(0)
  const [formEnabled, setFormEnabled] = useState(true)
  const [formFields, setFormFields] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [cloudFileError, setCloudFileError] = useState('')
  const [testingId, setTestingId] = useState<number | null>(null)
  const [testResults, setTestResults] = useState<Record<number, CloudFileConfigTestResult>>({})

  const { data: configs = [], refetch, error: cloudConfigsQueryError } = useQuery<CloudFileConfig[]>({
    queryKey: ['admin-cloud-file-configs'],
    queryFn: () => api.get('/admin/cloud-file-configs').then(r => readListPayload<CloudFileConfig>(r.data, ['configs', 'items', 'records'])),
  })

  function openCreate(initialType: string = 's3') {
    setEditingId(null)
    setFormType(initialType)
    setFormName('')
    setFormPriority(configs.length)
    setFormEnabled(true)
    setFormFields({})
    setShowForm(true)
  }

  // Deep-link support: `/cloud-files?type=tos` pre-opens the create form with that type.
  // Used by the Volcen credential flow to guide admins directly to TOS setup.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const type = params.get('type')
    if (!type || !CONFIG_TYPE_LABELS[type]) return
    openCreate(type)
    params.delete('type')
    const nextSearch = params.toString()
    const nextUrl = window.location.pathname + (nextSearch ? `?${nextSearch}` : '') + window.location.hash
    window.history.replaceState({}, '', nextUrl)
    // Intentionally omit deps: we only want this to fire once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openEdit(cfg: CloudFileConfig) {
    setEditingId(cfg.ID)
    setFormType(cfg.config_type)
    setFormName(cfg.name)
    setFormPriority(cfg.priority)
    setFormEnabled(cfg.is_enabled)
    const masked = parseMaskedCloudConfig(cfg.masked_config)
    const secretKeys = new Set((CONFIG_TYPE_FIELDS[cfg.config_type] ?? []).filter((f) => f.secret).map((f) => f.key))
    const next: Record<string, string> = {}
    Object.entries(masked).forEach(([key, value]) => {
      next[key] = secretKeys.has(key) ? '' : String(value ?? '')
    })
    setFormFields(next)
    setShowForm(true)
  }

  async function save() {
    const missing = missingCloudConfigFields(fields, formFields, editingId)
    if (!formName.trim() || missing.length > 0) {
      setCloudFileError(t('admin.cloudFiles.missingRequired', {
        fields: missing.map((field) => t(`admin.cloudFiles.fields.${field.key}`, { defaultValue: field.label })).join(', '),
      }))
      return
    }
    setSaving(true)
    setCloudFileError('')
    try {
      const payload = { name: formName, config_type: formType, config: formFields, priority: formPriority, is_enabled: formEnabled }
      if (editingId) {
        await api.put(`/admin/cloud-file-configs/${editingId}`, payload)
      } else {
        await api.post('/admin/cloud-file-configs', payload)
      }
      queryClient.invalidateQueries({ queryKey: ['admin-cloud-file-configs'] })
      setShowForm(false)
    } catch (err: unknown) {
      setCloudFileError(translateAPIRequestError(err))
    } finally {
      setSaving(false)
    }
  }

  async function toggleEnabled(cfg: CloudFileConfig) {
    if (!window.confirm(t(cloudFileConfigToggleConfirmKey(cfg), { name: cfg.name }))) return
    setCloudFileError('')
    try {
      await api.put(`/admin/cloud-file-configs/${cfg.ID}`, { is_enabled: !cfg.is_enabled })
      refetch()
    } catch (err: unknown) {
      setCloudFileError(translateAPIRequestError(err))
    }
  }

  async function deleteCfg(id: number) {
    const cfg = configs.find((item) => item.ID === id)
    if (!window.confirm(t('admin.cloudFiles.confirmDelete', { name: cfg?.name ?? `#${id}` }))) return
    setCloudFileError('')
    try {
      await api.delete(`/admin/cloud-file-configs/${id}`)
      queryClient.invalidateQueries({ queryKey: ['admin-cloud-file-configs'] })
    } catch (err: unknown) {
      setCloudFileError(translateAPIRequestError(err))
    }
  }

  async function movePriority(cfg: CloudFileConfig, dir: -1 | 1) {
    setCloudFileError('')
    try {
      await api.put(`/admin/cloud-file-configs/${cfg.ID}`, { priority: cfg.priority + dir })
      refetch()
    } catch (err: unknown) {
      setCloudFileError(translateAPIRequestError(err))
    }
  }

  async function testConfig(cfg: CloudFileConfig) {
    setCloudFileError('')
    setTestingId(cfg.ID)
    try {
      const result = await api.post(`/admin/cloud-file-configs/${cfg.ID}/test`).then((r) => r.data as CloudFileConfigTestResult)
      setTestResults((prev) => ({ ...prev, [cfg.ID]: result }))
    } catch (err: unknown) {
      setCloudFileError(translateAPIRequestError(err))
    } finally {
      setTestingId(null)
    }
  }

  const fields = CONFIG_TYPE_FIELDS[formType] ?? []
  const missingRequiredFields = missingCloudConfigFields(fields, formFields, editingId)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="border border-border rounded-lg bg-card p-4">
          <p className="text-sm font-semibold">{t('admin.cloudFiles.publicObjectRelay')}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {t('admin.cloudFiles.publicObjectRelayDescription')}
          </p>
        </div>
        <div className="border border-border rounded-lg bg-card p-4">
          <p className="text-sm font-semibold">{t('admin.cloudFiles.providerFilesAPI')}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {t('admin.cloudFiles.providerFilesAPIDescription')}
          </p>
        </div>
        <div className="border border-border rounded-lg bg-card p-4">
          <p className="text-sm font-semibold">{t('admin.cloudFiles.internalMinio')}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {t('admin.cloudFiles.internalMinioDescription')}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{t('admin.cloudFiles.title')}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t('admin.cloudFiles.description')}</p>
        </div>
        <Button size="sm" onClick={() => openCreate()}>{t('admin.cloudFiles.addConfig')}</Button>
      </div>

      {(cloudFileError || cloudConfigsQueryError) && (
        <AppInlineError>
          {cloudFileError || translateAPIRequestError(cloudConfigsQueryError)}
        </AppInlineError>
      )}

      {configs.length === 0 && !showForm && !cloudConfigsQueryError && (
        <p className="text-sm text-muted-foreground text-center py-8">{t('admin.cloudFiles.empty')}</p>
      )}

      <div className="space-y-2">
        {configs.map((cfg) => {
          const masked = parseMaskedCloudConfig(cfg.masked_config)
          const testResult = testResults[cfg.ID]
          return (
            <div key={cfg.ID} className={cn('border border-border rounded-lg bg-background overflow-hidden', !cfg.is_enabled && 'opacity-60')}>
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button onClick={() => movePriority(cfg, -1)} className="text-muted-foreground hover:text-foreground text-xs leading-none">▲</button>
                  <span className="text-xs text-muted-foreground text-center tabular-nums">{cfg.priority}</span>
                  <button onClick={() => movePriority(cfg, 1)} className="text-muted-foreground hover:text-foreground text-xs leading-none">▼</button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{cfg.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{CONFIG_TYPE_LABELS[cfg.config_type] ?? cfg.config_type}</span>
                    {cfg.is_enabled
                      ? <AppFeedbackText as="span" tone="success">{t('admin.cloudFiles.enabledMark')}</AppFeedbackText>
                      : <span className="text-xs text-muted-foreground">{t('admin.cloudFiles.disabledMark')}</span>
                    }
                  </div>
                  <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
                    {Object.entries(masked).filter(([k]) => !['access_key','secret_key','api_key','access_key_id','access_key_secret'].includes(k)).map(([k,v]) => `${k}=${v}`).join('  ')}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => testConfig(cfg)}
                    disabled={testingId === cfg.ID}
                    className="text-xs border border-border rounded px-2 py-1 text-muted-foreground hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {testingId === cfg.ID ? t('admin.cloudFiles.testing') : t('admin.cloudFiles.test')}
                  </button>
                  <button onClick={() => toggleEnabled(cfg)} className="text-xs border border-border rounded px-2 py-1 text-muted-foreground hover:text-foreground transition-colors">
                    {cfg.is_enabled ? t('admin.cloudFiles.disable') : t('admin.cloudFiles.enable')}
                  </button>
                  <button onClick={() => openEdit(cfg)} className="text-xs border border-border rounded px-2 py-1 text-muted-foreground hover:text-foreground transition-colors">{t('admin.models.edit')}</button>
                  <Button type="button" variant="outline" size="sm" intent="danger" onClick={() => deleteCfg(cfg.ID)} className="h-7 text-xs">{t('common.delete')}</Button>
                </div>
              </div>
              {testResult && (
                <AppStateMessage
                  tone={testResult.success ? 'success' : 'danger'}
                  className="rounded-none border-x-0 border-b-0 px-4 py-2 text-xs"
                >
                  <span className="font-medium">
                    {testResult.success ? t('admin.cloudFiles.testSuccess') : t('admin.cloudFiles.testFailed')}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {t('admin.cloudFiles.testLatency', { latency: testResult.latency_ms })}
                  </span>
                  {testResult.success && testResult.url && (
                    <a href={testResult.url} target="_blank" rel="noreferrer" className="ml-2 break-all underline underline-offset-2">
                      {testResult.url}
                    </a>
                  )}
                  {!testResult.success && <span className="ml-2 break-all">{testResult.message}</span>}
                </AppStateMessage>
              )}
            </div>
          )
        })}
      </div>

      {showForm && (
        <div className="border border-border rounded-lg p-4 bg-card space-y-4">
          <h4 className="text-sm font-medium">{editingId ? t('admin.cloudFiles.editConfig') : t('admin.cloudFiles.newConfig')}</h4>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t('forms.name')}</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder={t('admin.cloudFiles.namePlaceholder')} className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('forms.type')}</Label>
              <select
                value={formType}
                onChange={e => { setFormType(e.target.value); setFormFields({}) }}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                disabled={!!editingId}
              >
                {Object.entries(CONFIG_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {fields.map(f => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs">
                  {t(`admin.cloudFiles.fields.${f.key}`, { defaultValue: f.label })}
                  {f.required && <AppRequiredMark />}
                </Label>
                <Input
                  type={f.secret ? 'password' : 'text'}
                  value={formFields[f.key] ?? ''}
                  onChange={e => setFormFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={editingId && f.secret ? t('admin.models.leaveBlankKeep') : f.placeholder}
                  className="text-sm font-mono"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <Label className="text-xs">{t('admin.cloudFiles.priority')}</Label>
              <Input type="number" value={formPriority} onChange={e => setFormPriority(Number(e.target.value))} className="w-24 text-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer mt-4">
              <input type="checkbox" checked={formEnabled} onChange={e => setFormEnabled(e.target.checked)} className="rounded" />
              {t('admin.cloudFiles.enable')}
            </label>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving || !formName.trim() || missingRequiredFields.length > 0}>
              {saving ? t('common.saving') : t('common.save')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

type AdminSectionKey = 'models' | 'users' | 'orgs' | 'projects' | 'audit-logs' | 'usage-logs' | 'storage' | 'cloud-files' | 'debug'

const adminSectionHref: Record<AdminSectionKey, string> = {
  models: '/models',
  users: '/user-management',
  orgs: '/orgs',
  projects: '/projects',
  'audit-logs': '/audit-logs',
  'usage-logs': '/usage-logs',
  storage: '/storage',
  'cloud-files': '/cloud-files',
  debug: '/debug',
}

function navigateToAdminSection(section: AdminSectionKey) {
  window.location.assign(adminHref(adminSectionHref[section]))
}

interface AdminOverviewSummary {
  generated_at: string
  users: { total: number; active: number; disabled: number }
  orgs: { total: number; suspended: number }
  projects: { total: number }
  models: {
    credentials: number
    enabled_credentials: number
    catalog_entries: number
    enabled_catalog_entries: number
    route_bindings: number
    enabled_route_bindings: number
  }
  jobs: { total: number; pending: number; running: number; succeeded: number; failed: number; cancelled: number }
  usage: { records: number; cost_7d: number; cost_30d: number }
  resources: { total: number; bytes: number }
  audits: { total: number }
}

type AdminGenerationToolServer = {
  id: string
  scope: 'admin' | 'local'
  type: 'comfyui' | 'webui'
  name: string
  enabled: boolean
  base_url: string
  timeout_ms: number
  priority: number
  auth_kind: 'none' | 'basic' | 'bearer'
  username?: string
  password?: string
  password_set?: boolean
  token?: string
  token_set?: boolean
  tags?: string[]
}

type AdminGenerationToolsSettings = {
  servers: AdminGenerationToolServer[]
  default_server_id?: string
  default_server_ids?: Partial<Record<AdminGenerationToolServer['type'], string>>
  allow_local: boolean
}

type GenerationToolConnectionTestResult = {
  success: boolean
  latency_ms?: number
  status_code?: number
  message?: string
}

const emptyAdminGenerationToolsSettings: AdminGenerationToolsSettings = {
  servers: [],
  default_server_id: '',
  default_server_ids: {},
  allow_local: true,
}

function createAdminGenerationToolServer(type: AdminGenerationToolServer['type']): AdminGenerationToolServer {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  return {
    id: `admin-${type}-${suffix}`,
    scope: 'admin',
    type,
    name: type === 'comfyui' ? '平台 ComfyUI' : '平台 WebUI',
    enabled: true,
    base_url: type === 'comfyui' ? 'http://gpu.example.com:8188' : 'http://webui.example.com:7860',
    timeout_ms: 120000,
    priority: 50,
    auth_kind: 'none',
    username: '',
    password: '',
    token: '',
    tags: [],
  }
}

function formatAdminNumber(value: number | undefined): string {
  return typeof value === 'number' ? value.toLocaleString() : '0'
}

function formatAdminCredits(value: number | undefined): string {
  return `${(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function formatAdminBytes(value: number | undefined): string {
  const bytes = value ?? 0
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function AdminGenerationToolsPanel() {
  const qc = useQueryClient()
  const [form, setForm] = useState<AdminGenerationToolsSettings>(emptyAdminGenerationToolsSettings)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, GenerationToolConnectionTestResult>>({})

  const settingsQuery = useQuery<AdminGenerationToolsSettings>({
    queryKey: ['admin', 'settings', 'generation-tools'],
    queryFn: () => api.get('/admin/settings/generation-tools').then((r) => r.data),
  })

  useEffect(() => {
    if (!settingsQuery.data) return
    setForm({
      ...emptyAdminGenerationToolsSettings,
      ...settingsQuery.data,
      default_server_ids: settingsQuery.data.default_server_ids ?? {},
      servers: (settingsQuery.data.servers ?? []).map((server) => ({
        ...server,
        password: '',
        token: '',
        tags: server.tags ?? [],
      })),
    })
  }, [settingsQuery.data])

  const updateSettings = useMutation({
    mutationFn: (payload: AdminGenerationToolsSettings) =>
      api.put('/admin/settings/generation-tools', payload).then((r) => r.data as AdminGenerationToolsSettings),
    onSuccess: (updated) => {
      setError('')
      setSaved(true)
      qc.setQueryData(['admin', 'settings', 'generation-tools'], updated)
      setForm({
        ...emptyAdminGenerationToolsSettings,
        ...updated,
        default_server_ids: updated.default_server_ids ?? {},
        servers: (updated.servers ?? []).map((server) => ({ ...server, password: '', token: '', tags: server.tags ?? [] })),
      })
      setTestResults({})
      setTimeout(() => setSaved(false), 1800)
    },
    onError: (err: unknown) => setError(translateAPIRequestError(err)),
  })

  const invalidServers = form.servers.filter((server) => !adminGenerationToolServerValid(server))
  const canSave = invalidServers.length === 0
  const enabledCount = form.servers.filter((server) => server.enabled).length
  const savedServersById = new Map((settingsQuery.data?.servers ?? []).map((server) => [server.id, server]))

  function patchServer(id: string, patch: Partial<AdminGenerationToolServer>) {
    setForm((current) => ({
      ...current,
      servers: current.servers.map((server) => server.id === id ? { ...server, ...patch } : server),
      default_server_id: patch.enabled === false && current.default_server_id === id ? '' : current.default_server_id,
      default_server_ids: patch.enabled === false ? clearAdminGenerationToolDefaultServerID(current.default_server_ids, id) : current.default_server_ids,
    }))
    setTestResults((current) => omitRecordKey(current, id))
  }

  function removeServer(id: string) {
    setForm((current) => ({
      ...current,
      servers: current.servers.filter((server) => server.id !== id),
      default_server_id: current.default_server_id === id ? '' : current.default_server_id,
      default_server_ids: clearAdminGenerationToolDefaultServerID(current.default_server_ids, id),
    }))
    setTestResults((current) => omitRecordKey(current, id))
  }

  function addServer(type: AdminGenerationToolServer['type']) {
    setForm((current) => ({ ...current, servers: [...current.servers, createAdminGenerationToolServer(type)] }))
  }

  function save() {
    if (!canSave) return
    updateSettings.mutate({
      allow_local: form.allow_local,
      default_server_id: form.default_server_id || '',
      default_server_ids: form.default_server_ids ?? {},
      servers: form.servers.map((server) => ({
        ...server,
        scope: 'admin',
        base_url: server.base_url.trim(),
        name: server.name.trim(),
        username: server.username?.trim() ?? '',
        timeout_ms: Number(server.timeout_ms) || 120000,
        priority: Number(server.priority) || 0,
        tags: normalizeAdminGenerationToolTags(server.tags),
      })),
    })
  }

  async function testSavedServer(server: AdminGenerationToolServer) {
    const savedServer = savedServersById.get(server.id)
    if (!savedServer || !adminGenerationToolServerMatchesSaved(server, savedServer) || !adminGenerationToolServerValid(server) || !server.enabled) {
      setTestResults((current) => ({
        ...current,
        [server.id]: { success: false, message: '请先保存当前配置再测试连接' },
      }))
      return
    }
    setTestingId(server.id)
    try {
      const startedAt = Date.now()
      const response = await api.post('/generation-tools/call', {
        tool_type: server.type,
        server_id: server.id,
        server_scope: 'admin',
        operation: 'status',
      })
      setTestResults((current) => ({
        ...current,
        [server.id]: {
          success: true,
          latency_ms: Date.now() - startedAt,
          status_code: response.status,
          message: '连接正常',
        },
      }))
    } catch (err: unknown) {
      setTestResults((current) => ({
        ...current,
        [server.id]: { success: false, message: translateAPIRequestError(err) },
      }))
    } finally {
      setTestingId(null)
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">平台全局生成服务器</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            管理平台级 ComfyUI / WebUI 兜底服务。组织可以在工作区设置里配置自己的共享服务器；本机 127.0.0.1 请放在客户端控制台配置。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {saved && <span className="text-xs text-primary">已保存</span>}
          <Button type="button" size="sm" variant="outline" onClick={() => addServer('comfyui')}>添加 ComfyUI</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => addServer('webui')}>添加 WebUI</Button>
          <Button type="button" size="sm" onClick={save} disabled={updateSettings.isPending || !canSave}>
            {updateSettings.isPending ? '保存中…' : '保存共享配置'}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={enabledCount > 0 ? 'success' : 'neutral'}>{enabledCount > 0 ? `${enabledCount} 个全局服务器已启用` : '未启用全局服务器'}</Badge>
        <label className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={form.allow_local}
            onChange={(event) => setForm((current) => ({ ...current, allow_local: event.target.checked }))}
          />
          允许用户使用本地控制台配置覆盖
        </label>
      </div>

      {(settingsQuery.error || error || !canSave) && (
        <AppInlineError className="mt-3">
          {settingsQuery.error
            ? translateAPIRequestError(settingsQuery.error)
            : error || '启用服务器时 Base URL 必须以 http:// 或 https:// 开头，超时范围为 1000 到 600000 ms。'}
        </AppInlineError>
      )}

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {form.servers.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-background p-4 text-xs text-muted-foreground">
            尚未配置平台全局生成服务器。可以先添加一台远程 ComfyUI 或 WebUI。
          </div>
        ) : form.servers.map((server) => {
          const savedServer = savedServersById.get(server.id)
          const canTestSavedServer = server.enabled
            && adminGenerationToolServerValid(server)
            && Boolean(savedServer)
            && adminGenerationToolServerMatchesSaved(server, savedServer)
          return (
            <AdminGenerationToolServerCard
              key={server.id}
              server={server}
              isDefault={form.default_server_ids?.[server.type] === server.id || (!form.default_server_ids?.[server.type] && form.default_server_id === server.id)}
              onPatch={(patch) => patchServer(server.id, patch)}
              onRemove={() => removeServer(server.id)}
              onDefault={() => setForm((current) => ({
                ...current,
                default_server_id: current.default_server_id === server.id ? '' : current.default_server_id,
                default_server_ids: {
                  ...(current.default_server_ids ?? {}),
                  [server.type]: current.default_server_ids?.[server.type] === server.id ? undefined : server.id,
                },
              }))}
              testResult={testResults[server.id]}
              testing={testingId === server.id}
              canTest={canTestSavedServer}
              onTest={() => testSavedServer(server)}
            />
          )
        })}
      </div>
    </section>
  )
}

function AdminGenerationToolServerCard({ server, isDefault, onPatch, onRemove, onDefault, testResult, testing, canTest, onTest }: {
  server: AdminGenerationToolServer
  isDefault: boolean
  onPatch: (patch: Partial<AdminGenerationToolServer>) => void
  onRemove: () => void
  onDefault: () => void
  testResult?: GenerationToolConnectionTestResult
  testing?: boolean
  canTest: boolean
  onTest: () => void
}) {
  const invalid = !adminGenerationToolServerValid(server)
  return (
    <AppStatusSurface tone={invalid ? 'danger' : 'neutral'} emphasis="outline" className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{server.name || (server.type === 'comfyui' ? 'ComfyUI' : 'WebUI')}</p>
            <Badge variant="outline">{server.type === 'comfyui' ? 'ComfyUI' : 'WebUI'}</Badge>
            {isDefault && <Badge tone="success">默认</Badge>}
          </div>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{server.base_url}</p>
        </div>
        <input type="checkbox" checked={server.enabled} onChange={(event) => onPatch({ enabled: event.target.checked })} className="mt-1 h-4 w-4" />
      </div>

      <div className={cn('mt-3 space-y-2', !server.enabled && 'opacity-60')}>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px]">
          <AdminToolField label="名称" value={server.name} onChange={(value) => onPatch({ name: value })} />
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">类型</Label>
            <select
              value={server.type}
              onChange={(event) => onPatch({
                type: event.target.value as AdminGenerationToolServer['type'],
                base_url: event.target.value === 'comfyui' ? 'http://gpu.example.com:8188' : 'http://webui.example.com:7860',
              })}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              <option value="comfyui">ComfyUI</option>
              <option value="webui">WebUI</option>
            </select>
          </div>
        </div>
        <AdminToolField label="Base URL" value={server.base_url} onChange={(value) => onPatch({ base_url: value })} />
        <div className="grid gap-2 sm:grid-cols-[120px_120px_1fr]">
          <AdminToolField label="优先级" value={String(server.priority)} onChange={(value) => onPatch({ priority: Number(value) || 0 })} type="number" />
          <AdminToolField label="超时 ms" value={String(server.timeout_ms || '')} onChange={(value) => onPatch({ timeout_ms: Number(value) || 0 })} type="number" />
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">认证</Label>
            <select
              value={server.auth_kind}
              onChange={(event) => onPatch({ auth_kind: event.target.value as AdminGenerationToolServer['auth_kind'] })}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              <option value="none">无</option>
              <option value="basic">Basic Auth</option>
              <option value="bearer">Bearer/API Key</option>
            </select>
          </div>
        </div>
        {server.auth_kind === 'basic' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <AdminToolField label="用户名" value={server.username ?? ''} onChange={(value) => onPatch({ username: value })} />
            <AdminToolField label="密码" value={server.password ?? ''} onChange={(value) => onPatch({ password: value })} type="password" placeholder={server.password_set ? '已保存，留空不修改' : undefined} />
          </div>
        )}
        {server.auth_kind === 'bearer' && (
          <AdminToolField label="Token / API Key" value={server.token ?? ''} onChange={(value) => onPatch({ token: value })} type="password" placeholder={server.token_set ? '已保存，留空不修改' : undefined} />
        )}
        <AdminToolField
          label="标签（逗号分隔）"
          value={(server.tags ?? []).join(', ')}
          onChange={(value) => onPatch({ tags: value.split(',') })}
          placeholder="gpu, sdxl, team-a"
        />
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {testResult && (
            <AppFeedbackText as="span" tone={testResult.success ? 'success' : 'danger'} className="mr-auto self-center">
              {testResult.success ? `连接正常 ${testResult.latency_ms ?? 0}ms` : `连接失败 ${testResult.message ?? ''}`}
            </AppFeedbackText>
          )}
          <Button type="button" size="sm" variant="outline" onClick={onTest} disabled={testing || !canTest}>
            {testing ? '测试中…' : canTest ? '测试已保存连接' : '保存后测试'}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onDefault} disabled={!server.enabled}>
            {isDefault ? '取消默认' : '设为默认'}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onRemove}>删除</Button>
        </div>
      </div>
    </AppStatusSurface>
  )
}

function AdminToolField({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-8 text-xs" />
    </div>
  )
}

function adminGenerationToolServerValid(server: AdminGenerationToolServer): boolean {
  if (!Number.isFinite(Number(server.timeout_ms)) || Number(server.timeout_ms) < 1000 || Number(server.timeout_ms) > 600000) return false
  if (!server.enabled) return true
  const baseURL = server.base_url.trim()
  return baseURL.startsWith('http://') || baseURL.startsWith('https://')
}

function adminGenerationToolServerMatchesSaved(current: AdminGenerationToolServer, saved?: AdminGenerationToolServer): boolean {
  if (!saved) return false
  return current.id === saved.id
    && current.scope === saved.scope
    && current.type === saved.type
    && current.name.trim() === saved.name.trim()
    && current.enabled === saved.enabled
    && current.base_url.trim() === saved.base_url.trim()
    && Number(current.timeout_ms) === Number(saved.timeout_ms)
    && Number(current.priority) === Number(saved.priority)
    && current.auth_kind === saved.auth_kind
    && (current.username ?? '').trim() === (saved.username ?? '').trim()
    && !current.password
    && !current.token
    && Boolean(current.password_set) === Boolean(saved.password_set)
    && Boolean(current.token_set) === Boolean(saved.token_set)
    && adminNormalizedStringArrayEquals(normalizeAdminGenerationToolTags(current.tags), normalizeAdminGenerationToolTags(saved.tags))
}

function normalizeAdminGenerationToolTags(tags: string[] | undefined): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const tag of tags ?? []) {
    const next = tag.trim()
    if (!next || seen.has(next)) continue
    seen.add(next)
    normalized.push(next)
  }
  return normalized
}

function clearAdminGenerationToolDefaultServerID(
  defaults: AdminGenerationToolsSettings['default_server_ids'] | undefined,
  serverID: string,
): AdminGenerationToolsSettings['default_server_ids'] {
  if (!defaults) return {}
  const next = { ...defaults }
  for (const type of ['comfyui', 'webui'] as const) {
    if (next[type] === serverID) delete next[type]
  }
  return next
}

function adminNormalizedStringArrayEquals(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  return left.every((item, index) => item === right[index])
}

function omitRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

export default function AdminPage() {
  const { t } = useTranslation()
  const currentUser = useUserStore((s) => s.currentUser)
  const navigate = useNavigate()

  const { data: overview } = useQuery<AdminOverviewSummary>({
    queryKey: ['admin', 'overview'],
    queryFn: () => api.get('/admin/overview').then((r) => r.data),
    refetchInterval: 30000,
  })

  const queuedJobs = (overview?.jobs?.pending ?? 0) + (overview?.jobs?.running ?? 0)
  const jobMonitorHref = `/debug?${jobUrlSearchParams(emptyJobMonitorFilters, 1).toString()}`
  const usage7dHref = usageLogsHref({ since: relativePastDateInput(7) })

  const overviewCards = [
    ...(!runtimeCapabilities.hideModelManagement ? [{
      label: t('admin.home.metrics.enabledCatalogEntries'),
      value: formatAdminNumber(overview?.models?.enabled_catalog_entries),
      detail: t('admin.home.metrics.providerRoutes', {
        providers: formatAdminNumber(overview?.models?.credentials),
        routes: formatAdminNumber(overview?.models?.enabled_route_bindings),
      }),
      icon: Settings2,
      href: '/models/catalog',
    }] : []),
    {
      label: t('admin.home.metrics.projects'),
      value: formatAdminNumber(overview?.projects?.total),
      detail: t('admin.home.metrics.usersAndOrgs', { users: formatAdminNumber(overview?.users?.total), orgs: formatAdminNumber(overview?.orgs?.total) }),
      icon: FolderKanban,
      href: '/projects',
    },
    ...(!adminBaseRouteDisabled('/debug') ? [{
      label: t('admin.home.metrics.queuedJobs'),
      value: formatAdminNumber(queuedJobs),
      detail: t('admin.home.metrics.failedJobs', { count: formatAdminNumber(overview?.jobs?.failed) }),
      icon: Sparkles,
      href: jobMonitorHref,
    }] : []),
    ...(!adminBaseRouteDisabled('/usage-logs') ? [{
      label: t('admin.home.metrics.usage7d'),
      value: formatAdminCredits(overview?.usage?.cost_7d),
      detail: t('admin.home.metrics.usage30d', { cost: formatAdminCredits(overview?.usage?.cost_30d) }),
      icon: BarChart3,
      href: usage7dHref,
    }] : []),
    {
      label: t('admin.home.metrics.storage'),
      value: formatAdminBytes(overview?.resources?.bytes),
      detail: t('admin.home.metrics.resourceFiles', { count: formatAdminNumber(overview?.resources?.total) }),
      icon: HardDrive,
      href: '/storage',
    },
    ...runtimeOverviewCards,
  ]

  const sectionCards = [
    ...(!runtimeCapabilities.hideModelManagement ? [
      { label: t('admin.tabs.modelProviders'), detail: t('admin.home.sections.modelProviders'), icon: Settings2, href: '/models/providers' },
      { label: t('admin.tabs.modelCatalog'), detail: t('admin.home.sections.modelCatalog'), icon: Database, href: '/models/catalog' },
      { label: t('admin.tabs.modelRoutes'), detail: t('admin.home.sections.modelRoutes'), icon: RouteIcon, href: '/models/routes' },
    ] : []),
    { label: t('admin.tabs.users'), detail: t('admin.home.sections.users'), icon: UsersRound, href: '/user-management' },
    { label: t('admin.tabs.orgs'), detail: t('admin.home.sections.orgs'), icon: Building2, href: '/orgs' },
    { label: t('admin.tabs.projects'), detail: t('admin.home.sections.projects', { count: formatAdminNumber(overview?.projects?.total) }), icon: FolderKanban, href: '/projects' },
    { label: t('admin.tabs.auditLogs'), detail: t('admin.home.sections.auditLogs', { count: formatAdminNumber(overview?.audits?.total) }), icon: ScrollText, href: '/audit-logs' },
    ...(!adminBaseRouteDisabled('/usage-logs') ? [{ label: t('admin.tabs.logs'), detail: t('admin.home.sections.usageLogs', { count: formatAdminNumber(overview?.usage?.records) }), icon: BarChart3, href: '/usage-logs' }] : []),
    { label: t('admin.tabs.storage'), detail: t('admin.home.sections.storage', { count: formatAdminNumber(overview?.resources?.total) }), icon: HardDrive, href: '/storage' },
    { label: t('admin.tabs.cloudFiles'), detail: t('admin.home.sections.cloudFiles'), icon: CloudUpload, href: '/cloud-files' },
    ...(!adminBaseRouteDisabled('/debug') ? [{ label: t('admin.tabs.debug'), detail: t('admin.home.sections.debug'), icon: Bug, href: '/debug?tab=system' }] : []),
    ...runtimeSectionCards,
  ]

  if (currentUser?.system_role !== 'super_admin') {
    navigate('/projects', { replace: true })
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <AppIconFrame tone="info" className="mt-0.5">
          <ShieldAlert size={18} />
        </AppIconFrame>
        <div>
          <h1 className="text-base font-semibold text-foreground">{t('admin.title')}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t('admin.subtitle')}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((card) => (
          <Link key={card.label} to={card.href} className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-ring/70">
            <div className="mb-4 flex items-center justify-between">
              <AppIconFrame size="lg" tone="info">
                <card.icon size={18} />
              </AppIconFrame>
              <ArrowUpRight size={15} className="text-muted-foreground transition-colors group-hover:text-foreground" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{card.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
          </Link>
        ))}
      </div>

      <AdminGenerationToolsPanel />

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {sectionCards.map((card) => (
          <Link key={card.href} to={card.href} className="group flex items-start gap-3 rounded-lg border border-border bg-background p-4 transition-colors hover:border-ring/70 hover:bg-card">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
              <card.icon size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">{card.label}</h2>
                <ArrowUpRight size={14} className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{card.detail}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
