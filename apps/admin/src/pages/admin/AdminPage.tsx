import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AICredential, AIModelConfig, AdapterDef, ModelPreset, FeatureConfig, PublicModel, ParamDef, ModelParamProfile, Project, User, GatewayAPIKey, GatewayAPIKeyCreateResponse, RawResource, ResourceBinding, PaginatedResponse } from '@/types'
import type { AgentCompactParamContract, ParamRuleTypeSummary } from '@admin/lib/modelParamContract'
import { useUserStore } from '@/store/userStore'
import { Plus, Trash2, ChevronDown, ChevronRight, Eye, EyeOff, ShieldAlert, ArrowLeft, Pencil, Check, X, RefreshCw, Sparkles, Copy, ArrowUpRight, Settings2, Route, FolderKanban, HardDrive, CloudUpload, ScrollText, BarChart3, UsersRound, Building2, KeyRound, Bug } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { Tabs, TabsList, TabsTrigger } from '@movscript/ui'
import { ActiveOrgSelect } from '@/components/admin/ActiveOrgSelect'
import { ActiveUserSelect } from '@/components/admin/ActiveUserSelect'
import { runtimeCapabilities, runtimeOverviewCards, runtimeSectionCards } from '@admin-runtime'
import { useTranslation } from 'react-i18next'
import { translateAPIRequestError, translateApiError } from '@/lib/apiError'
import { publicModelLabel } from '@/lib/modelDisplay'
import {
  cloudFileConfigToggleConfirmKey,
  credentialToggleConfirmKey,
  featureToggleConfirmKey,
  modelConfigDisplayName,
  nextCredentialEnabledState,
  type AdminFeatureUpdatePayload,
} from '@/lib/adminActionGuards'
import { emptyJobMonitorFilters, jobUrlSearchParams } from '@/lib/adminJobQueryParams'
import { auditLogsHref, relativePastDateInput, usageLogsHref } from '@/lib/adminLogQueryParams'
import { gatewayKeyAuditHref, gatewayKeyUsageHref } from '@/lib/adminGatewayKeyLinks'
import { adminHref } from '@/lib/adminRoutes'
import { groupAdminFeatures } from '@/lib/adminFeatureGroups'
import {
  emptyProjectListFilters,
  projectFiltersFromSearchParams,
  projectListHref,
  projectPageFromSearchParams,
  projectSearchParams,
  type ProjectListFilters,
} from '@/lib/adminProjectQueryParams'
import {
  emptyResourceListFilters,
  resourceFiltersFromSearchParams,
  resourceListHref,
  resourcePageFromSearchParams,
  resourceSearchParams,
  type ResourceListFilters,
} from '@/lib/adminResourceQueryParams'
import { userListHref } from '@/lib/adminUserQueryParams'
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

function adapterDisplayName(adapter: Pick<AdapterDef, 'adapter_type' | 'display_name'>, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`admin.adapters.${adapter.adapter_type}.name`, { defaultValue: adapter.display_name })
}

function adapterDescription(adapter: Pick<AdapterDef, 'adapter_type' | 'description'>, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`admin.adapters.${adapter.adapter_type}.description`, { defaultValue: adapter.description })
}

function credentialFieldLabel(key: string, fallback: string, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`admin.credentialFields.${key}`, { defaultValue: fallback })
}

function featureDisplayName(feature: FeatureConfig, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`admin.features.catalog.${feature.feature_key}.name`, { defaultValue: feature.display_name })
}

function featureDescription(feature: FeatureConfig, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`admin.features.catalog.${feature.feature_key}.description`, { defaultValue: feature.description })
}

function runtimeModelConfigFromAdmin(cred: AICredential, cfg: AIModelConfig, defaultBaseURL?: string) {
  return {
    schema: 'movscript.runtimeModelConfig.v1',
    provider: 'openai-compatible',
    baseURL: cred.base_url || defaultBaseURL || '',
    model: cfg.model_id_override || cfg.model_def_id,
    useForChat: true,
    useForPlanner: true,
    source: {
      credentialId: cred.ID,
      credentialName: cred.display_name,
      adapterType: cred.adapter_type,
      modelConfigId: cfg.ID,
      modelName: cfg.custom_display_name || cfg.short_name || cfg.model_def_id,
    },
    note: 'API key is not included because admin credentials are masked in the browser. Paste this into admin Agent Debug and enter the key there if needed.',
  }
}

type ModelEditForm = {
  display_name: string
  short_name: string
  model_id_override: string
  priority: string
  capacity_weight: string
  max_concurrency: string
  capabilities: string[]
  pricing_mode: string
  accepts_image: boolean
  max_input_images: number
  max_input_videos: number
  supported_params: string
}

const PRICING_LABEL_KEYS: Record<string, string> = {
  per_token: 'admin.pricingMode.perToken',
  per_image: 'admin.pricingMode.perImage',
  per_second: 'admin.pricingMode.perSecond',
  per_call: 'admin.pricingMode.perCall',
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

const canUseCustomPricingMode = runtimeCapabilities.customPricingMode

type PriceDef = {
  pricing_mode: 'per_token' | 'per_image' | 'per_second' | 'per_call' | string
  ref_input_usd_per_1m?: number
  ref_output_usd_per_1m?: number
  ref_usd_per_image?: number
  ref_usd_per_second?: number
}

function refPriceHint(def: PriceDef, t: (key: string, values?: Record<string, unknown>) => string): string {
  switch (def.pricing_mode) {
    case 'per_token':
      return def.ref_input_usd_per_1m || def.ref_output_usd_per_1m
        ? t('admin.pricingMode.referenceToken', { input: def.ref_input_usd_per_1m ?? 0, output: def.ref_output_usd_per_1m ?? 0 })
        : ''
    case 'per_image':
      return def.ref_usd_per_image ? t('admin.pricingMode.referenceImage', { price: def.ref_usd_per_image }) : ''
    case 'per_second':
      return def.ref_usd_per_second ? t('admin.pricingMode.referenceSecond', { price: def.ref_usd_per_second }) : ''
    default:
      return ''
  }
}

type GatewayKeyForm = {
  name: string
  projectId: string
  allowedModelIds: number[]
  allowedScopes: string[]
}

const DEFAULT_GATEWAY_SCOPES = ['model:chat']

function emptyGatewayKeyForm(): GatewayKeyForm {
  return { name: '', projectId: '', allowedModelIds: [], allowedScopes: DEFAULT_GATEWAY_SCOPES }
}

function parseGatewayJSON<T>(raw: string, fallback: T): T {
  if (!raw?.trim()) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function gatewayModelLabel(model: AIModelConfig, credentials: AICredential[]): string {
  const credential = credentials.find((item) => item.ID === model.credential_id)
  const name = model.short_name || model.custom_display_name || model.model_id_override || model.model_def_id || `#${model.ID}`
  return credential ? `${name} · ${credential.display_name}` : name
}

function toGatewayPayload(form: GatewayKeyForm, includeProjectClear = false) {
  return {
    name: form.name.trim(),
    project_id: form.projectId.trim() ? Number(form.projectId) : includeProjectClear ? null : undefined,
    allowed_model_ids: form.allowedModelIds,
    allowed_scopes: form.allowedScopes.length ? form.allowedScopes : DEFAULT_GATEWAY_SCOPES,
  }
}

function GatewayAPIKeysSection({ credentials }: { credentials: AICredential[] }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<GatewayKeyForm>(emptyGatewayKeyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<GatewayKeyForm>(emptyGatewayKeyForm)
  const [newKey, setNewKey] = useState<{ name: string; value: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [gatewayKeyError, setGatewayKeyError] = useState('')

  const models = credentials.flatMap((credential) => credential.models ?? [])

  const { data, isLoading, isFetching, refetch, error: gatewayKeysQueryError } = useQuery<{ items: GatewayAPIKey[] }>({
    queryKey: ['model-gateway', 'api-keys'],
    queryFn: () => api.get('/model-gateway/api-keys').then((r) => r.data),
  })
  const keys = data?.items ?? []

  const createKey = useMutation({
    mutationFn: (form: GatewayKeyForm) => api.post('/model-gateway/api-keys', toGatewayPayload(form)).then((r) => r.data as GatewayAPIKeyCreateResponse),
    onSuccess: (result) => {
      setGatewayKeyError('')
      setNewKey({ name: result.name, value: result.key })
      setCreateForm(emptyGatewayKeyForm())
      setShowCreate(false)
      qc.invalidateQueries({ queryKey: ['model-gateway', 'api-keys'] })
    },
    onError: (err: any) => setGatewayKeyError(translateAPIRequestError(err)),
  })

  const updateKey = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Record<string, unknown> }) =>
      api.patch(`/model-gateway/api-keys/${id}`, patch).then((r) => r.data),
    onSuccess: () => {
      setGatewayKeyError('')
      setEditingId(null)
      qc.invalidateQueries({ queryKey: ['model-gateway', 'api-keys'] })
    },
    onError: (err: any) => setGatewayKeyError(translateAPIRequestError(err)),
  })

  const deleteKey = useMutation({
    mutationFn: (id: number) => api.delete(`/model-gateway/api-keys/${id}`),
    onSuccess: () => {
      setGatewayKeyError('')
      qc.invalidateQueries({ queryKey: ['model-gateway', 'api-keys'] })
    },
    onError: (err: any) => setGatewayKeyError(translateAPIRequestError(err)),
  })

  function startEdit(key: GatewayAPIKey) {
    setEditingId(key.ID)
    setEditForm({
      name: key.name,
      projectId: key.project_id ? String(key.project_id) : '',
      allowedModelIds: parseGatewayJSON<number[]>(key.allowed_model_ids, []),
      allowedScopes: parseGatewayJSON<string[]>(key.allowed_scopes, DEFAULT_GATEWAY_SCOPES),
    })
  }

  async function copyNewKey() {
    if (!newKey) return
    await navigator.clipboard.writeText(newKey.value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  function toggleModel(form: GatewayKeyForm, onChange: (next: GatewayKeyForm) => void, modelID: number) {
    const next = form.allowedModelIds.includes(modelID)
      ? form.allowedModelIds.filter((id) => id !== modelID)
      : [...form.allowedModelIds, modelID]
    onChange({ ...form, allowedModelIds: next })
  }

  function toggleScope(form: GatewayKeyForm, onChange: (next: GatewayKeyForm) => void, scope: string) {
    const next = form.allowedScopes.includes(scope)
      ? form.allowedScopes.filter((item) => item !== scope)
      : [...form.allowedScopes, scope]
    onChange({ ...form, allowedScopes: next.length ? next : DEFAULT_GATEWAY_SCOPES })
  }

  function submitGatewayKeyUpdate(key: GatewayAPIKey) {
    updateKey.mutate({ id: key.ID, patch: toGatewayPayload(editForm, true) })
  }

  function toggleGatewayKey(key: GatewayAPIKey) {
    const confirmKey = key.is_enabled ? 'admin.gatewayKeys.confirmDisable' : 'admin.gatewayKeys.confirmEnable'
    if (!window.confirm(t(confirmKey, { name: key.name }))) return
    updateKey.mutate({ id: key.ID, patch: { is_enabled: !key.is_enabled } })
  }

  function renderForm(form: GatewayKeyForm, onChange: (next: GatewayKeyForm) => void, submitLabel: string, onSubmit: () => void, saving: boolean) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.gatewayKeys.name')}</Label>
            <Input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} placeholder={t('admin.gatewayKeys.namePlaceholder')} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.gatewayKeys.projectId')}</Label>
            <Input value={form.projectId} onChange={(event) => onChange({ ...form, projectId: event.target.value.replace(/\D/g, '') })} placeholder={t('admin.gatewayKeys.allProjects')} className="h-8 text-xs" />
          </div>
        </div>
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.gatewayKeys.scopes')}</Label>
          <div className="flex flex-wrap gap-2">
            {['model:chat', '*'].map((scope) => (
              <label key={scope} className="flex h-8 items-center gap-2 rounded-md border border-border px-2 text-xs">
                <input type="checkbox" checked={form.allowedScopes.includes(scope)} onChange={() => toggleScope(form, onChange, scope)} className="rounded" />
                <span className="font-mono">{scope}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.gatewayKeys.models')}</Label>
          <div className="max-h-44 overflow-auto rounded-md border border-border bg-background p-2">
            {models.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">{t('admin.gatewayKeys.noModels')}</p>
            ) : (
              <div className="grid gap-1 md:grid-cols-2">
                {models.map((model) => (
                  <label key={model.ID} className="flex min-w-0 items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted/60">
                    <input type="checkbox" checked={form.allowedModelIds.includes(model.ID)} onChange={() => toggleModel(form, onChange, model.ID)} className="rounded" />
                    <span className="truncate">{gatewayModelLabel(model, credentials)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('admin.gatewayKeys.modelHint')}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => { setShowCreate(false); setEditingId(null) }}>{t('common.cancel')}</Button>
          <Button type="button" size="sm" onClick={onSubmit} disabled={saving || !form.name.trim()}>
            {saving ? t('common.saving') : submitLabel}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <KeyRound size={16} />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{t('admin.gatewayKeys.title')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('admin.gatewayKeys.description')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={cn('mr-2', isFetching && 'animate-spin')} />
            {t('admin.gatewayKeys.refresh')}
          </Button>
          <Button type="button" size="sm" onClick={() => setShowCreate((value) => !value)}>
            <Plus size={14} className="mr-2" />
            {t('admin.gatewayKeys.create')}
          </Button>
        </div>
      </div>

      {newKey && (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium text-foreground">{t('admin.gatewayKeys.createdOnce', { name: newKey.name })}</p>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{newKey.value}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={copyNewKey}>
              <Copy size={14} className="mr-2" />
              {copied ? t('admin.gatewayKeys.copied') : t('admin.gatewayKeys.copy')}
            </Button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="mt-4">
          {renderForm(createForm, setCreateForm, t('admin.gatewayKeys.create'), () => createKey.mutate(createForm), createKey.isPending)}
        </div>
      )}

      {gatewayKeyError && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {gatewayKeyError}
        </div>
      )}

      {gatewayKeysQueryError && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {translateAPIRequestError(gatewayKeysQueryError)}
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-card">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.gatewayKeys.name')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.gatewayKeys.prefix')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.gatewayKeys.scope')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('admin.gatewayKeys.lastUsed')}</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{t('admin.gatewayKeys.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {keys.map((key) => {
              const modelIDs = parseGatewayJSON<number[]>(key.allowed_model_ids, [])
              const scopes = parseGatewayJSON<string[]>(key.allowed_scopes, DEFAULT_GATEWAY_SCOPES)
              return (
                <tr key={key.ID} className="align-top hover:bg-card/70">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{key.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">#{key.ID} · {key.is_enabled ? t('admin.gatewayKeys.enabled') : t('admin.gatewayKeys.disabled')}</div>
                    {editingId === key.ID && (
                      <div className="mt-3">
                        {renderForm(editForm, setEditForm, t('common.save'), () => submitGatewayKeyUpdate(key), updateKey.isPending)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{key.key_prefix}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <div>{t('admin.gatewayKeys.projectId')}: {key.project_id ? `#${key.project_id}` : t('admin.gatewayKeys.allProjects')}</div>
                    <div>{t('admin.gatewayKeys.models')}: {modelIDs.length ? modelIDs.map((id) => `#${id}`).join(', ') : t('admin.gatewayKeys.allModels')}</div>
                    <div>{t('admin.gatewayKeys.scopes')}: {scopes.join(', ')}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {key.last_used_at ? new Date(key.last_used_at).toLocaleString(i18n.language) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button type="button" variant="ghost" size="sm" asChild>
                        <Link to={gatewayKeyUsageHref(key)}>{t('admin.gatewayKeys.viewUsageLogs')}</Link>
                      </Button>
                      <Button type="button" variant="ghost" size="sm" asChild>
                        <Link to={gatewayKeyAuditHref(key)}>{t('admin.gatewayKeys.viewAuditLogs')}</Link>
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(key)}>{t('common.details')}</Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleGatewayKey(key)}
                        disabled={updateKey.isPending}
                      >
                        {key.is_enabled ? t('admin.gatewayKeys.disable') : t('admin.gatewayKeys.enable')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => { if (window.confirm(t('admin.gatewayKeys.confirmDelete', { name: key.name }))) deleteKey.mutate(key.ID) }}
                        disabled={deleteKey.isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {!isLoading && !gatewayKeysQueryError && keys.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">{t('admin.gatewayKeys.empty')}</td>
              </tr>
            )}
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">{t('common.loading')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Step 1: Pick adapter ──────────────────────────────────────────────────────

function AdapterPicker({
  adapters,
  onPick,
  onCancel,
}: {
  adapters: AdapterDef[]
  onPick: (a: AdapterDef) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="border border-border rounded-lg p-4 bg-card space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{t('admin.credentials.selectAdapter')}</p>
        <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">{t('common.cancel')}</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {adapters.map((a) => (
          <button
            key={a.adapter_type}
            onClick={() => onPick(a)}
            className="text-left border border-border rounded-lg bg-background px-3 py-2.5 hover:border-ring hover:shadow-sm transition-all space-y-0.5"
          >
            <p className="text-sm font-medium text-foreground">{adapterDisplayName(a, t)}</p>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{adapterDescription(a, t)}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Step 2: Fill credential fields ───────────────────────────────────────────

function CredentialForm({
  adapter,
  onBack,
  onSuccess,
}: {
  adapter: AdapterDef
  onBack: () => void
  onSuccess: (adapterType: string) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [displayName, setDisplayName] = useState(() => adapterDisplayName(adapter, t))
  const [fields, setFields] = useState<Record<string, string>>({})
  const [testState, setTestState] = useState<{ loading: boolean; result: TestResult | null }>({ loading: false, result: null })
  const [filesAPIEnabled, setFilesAPIEnabled] = useState(false)
  const [filesAPIBaseURL, setFilesAPIBaseURL] = useState('')
  const [filesAPIKey, setFilesAPIKey] = useState('')

  const create = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post('/admin/credentials', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      onSuccess(adapter.adapter_type)
    },
  })

  function buildPayload() {
    const base: Record<string, unknown> = {
      adapter_type: adapter.adapter_type,
      display_name: displayName,
      credentials: fields,
    }
    if (adapter.supports_files_api) {
      base.files_api_enabled = filesAPIEnabled
      if (filesAPIBaseURL) base.files_api_base_url = filesAPIBaseURL
      if (filesAPIKey) base.files_api_key = filesAPIKey
    }
    return base
  }

  async function handleCreateAndTest() {
    setTestState({ loading: true, result: null })
    try {
      const cred: AICredential = await api.post('/admin/credentials', buildPayload()).then((r) => r.data)
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      const res = await api.post(`/admin/credentials/${cred.ID}/test`, {}).then((r) => r.data)
      setTestState({ loading: false, result: res })
      if (res.success) onSuccess(adapter.adapter_type)
    } catch (e: any) {
      setTestState({ loading: false, result: { success: false, message: translateAPIRequestError(e), latency_ms: 0 } })
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
        <p className="text-sm font-medium">{t('admin.credentials.configureAdapter', { name: adapterDisplayName(adapter, t) })}</p>
      </div>

      <Input
        placeholder={t('agents.displayNameOptional')}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />

      {baseURLField && (
        <div>
          <Label className="text-xs text-muted-foreground block mb-1">
            {credentialFieldLabel(baseURLField.key, baseURLField.label, t)}{baseURLField.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Input
            placeholder={adapter.default_base_url || baseURLField.hint || ''}
            value={fields['base_url'] ?? ''}
            onChange={(e) => setFields((f) => ({ ...f, base_url: e.target.value }))}
          />
        </div>
      )}

      {keyFields.map((field) => (
        <div key={field.key}>
          <Label className="text-xs text-muted-foreground block mb-1">
            {credentialFieldLabel(field.key, field.label, t)}{field.required && <span className="text-destructive ml-0.5">*</span>}
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
        <p className="text-xs text-destructive">{translateApiError((create.error as any)?.response?.data)}</p>
      )}
      {testState.result && (
        <p className={`text-xs ${testState.result.success ? 'text-foreground' : 'text-destructive'}`}>
          {testState.result.success
            ? t('admin.credentials.connectionOk', { latency: testState.result.latency_ms })
            : `✗ ${testState.result.message}`}
        </p>
      )}

      {/* Files API — shown only for adapters that support it */}
      {adapter.supports_files_api && (
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
        <button
          onClick={handleCreateAndTest}
          disabled={create.isPending || testState.loading}
          className="flex-1 bg-primary text-primary-foreground rounded px-4 py-2 text-sm hover:bg-primary/90 disabled:opacity-50"
        >
          {testState.loading ? t('admin.credentials.testing') : t('admin.credentials.createAndTest')}
        </button>
        <Button
          onClick={() => create.mutate(buildPayload())}
          disabled={create.isPending || testState.loading}
        >
          {create.isPending ? '…' : t('admin.credentials.createDirectly')}
        </Button>
        <Button variant="outline" onClick={onBack}>
          {t('common.back')}
        </Button>
      </div>
    </div>
  )
}

// ── Credit price form for activating a model ─────────────────────────────────

interface PriceForm {
  model_id_override: string
  credits_input_per_1m: number
  credits_output_per_1m: number
  credits_per_image: number
  credits_per_second: number
  credits_per_call: number
}

interface RuntimeProviderHealth {
  model_config_id: number
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

function defaultPriceForm(): PriceForm {
  return { model_id_override: '', credits_input_per_1m: 0, credits_output_per_1m: 0, credits_per_image: 0, credits_per_second: 0, credits_per_call: 0 }
}

function PriceFields({ def, form, onChange }: { def: PriceDef; form: PriceForm; onChange: (f: PriceForm) => void }) {
  const { t } = useTranslation()
  const mode = def.pricing_mode
  const hint = refPriceHint(def, t)
  return (
    <div className="space-y-2">
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {mode === 'per_token' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.pricing.inputCreditsPer1m')}</Label>
            <Input type="number" min="0" step="0.01" className="text-xs"
              value={form.credits_input_per_1m}
              onChange={(e) => onChange({ ...form, credits_input_per_1m: Number(e.target.value) })} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.pricing.outputCreditsPer1m')}</Label>
            <Input type="number" min="0" step="0.01" className="text-xs"
              value={form.credits_output_per_1m}
              onChange={(e) => onChange({ ...form, credits_output_per_1m: Number(e.target.value) })} />
          </div>
        </div>
      )}
      {mode === 'per_image' && (
        <div>
          <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.pricing.creditsPerImage')}</Label>
          <Input type="number" min="0" step="0.001" className="text-xs"
            value={form.credits_per_image}
            onChange={(e) => onChange({ ...form, credits_per_image: Number(e.target.value) })} />
        </div>
      )}
      {mode === 'per_second' && (
        <div>
          <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.pricing.creditsPerSecond')}</Label>
          <Input type="number" min="0" step="0.001" className="text-xs"
            value={form.credits_per_second}
            onChange={(e) => onChange({ ...form, credits_per_second: Number(e.target.value) })} />
        </div>
      )}
      {mode === 'per_call' && (
        <div>
          <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.pricing.creditsPerCall')}</Label>
          <Input type="number" min="0" step="0.01" className="text-xs"
            value={form.credits_per_call}
            onChange={(e) => onChange({ ...form, credits_per_call: Number(e.target.value) })} />
        </div>
      )}
    </div>
  )
}

function inferPricingMode(caps: string[]) {
  if (caps.some((c) => c === 'image' || c === 'image_edit')) return 'per_image'
  if (caps.some((c) => c.startsWith('video'))) return 'per_second'
  return 'per_token'
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
            <button onClick={() => remove(index)} className="text-xs text-muted-foreground hover:text-destructive h-8 px-2">
              {t('common.delete')}
            </button>
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
  const backendPreviewSkipped = !!adapterType && capabilities.length > 0 && audit.errors.length > 0
  const contractPreview = useQuery<{
    supported_params?: ParamDef[]
    params_schema_rule_count?: number
    agent_contract?: AgentCompactParamContract
  }>({
    queryKey: ['admin', 'model-contract-preview', adapterType ?? '', capabilities.join(','), acceptsImageInput === true, maxInputImages ?? 0, maxInputVideos ?? 0, value],
    queryFn: () => api.post('/admin/model-configs/preview-contract', {
      adapter_type: adapterType ?? '',
      custom_capabilities: capabilities.join(','),
      custom_accepts_image: acceptsImageInput === true,
      custom_max_input_images: maxInputImages ?? 0,
      custom_max_input_videos: maxInputVideos ?? 0,
      custom_supported_params: value,
    }).then((r) => r.data),
    enabled: !!adapterType && capabilities.length > 0 && audit.errors.length === 0,
    staleTime: 1000,
    retry: false,
  })
  const backendPreviewRuleTypes = summarizeParamRuleTypes(contractPreviewParams(contractPreview.data))
  const fallbackInputRequirements = agentInputRequirementsForAdmin(capabilities, acceptsImageInput === true, maxInputImages ?? 0, maxInputVideos ?? 0)
  const backendPreviewAgentContract = contractPreview.data?.agent_contract ?? buildAgentCompactParamContract(contractPreviewParams(contractPreview.data), fallbackInputRequirements)

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
                <button
                  type="button"
                  key={param.key}
                  onClick={() => toggleDeny(param.key)}
                  className={cn(
                    'text-xs px-2 py-0.5 rounded border transition-colors',
                    denied.has(param.key) ? 'border-destructive/60 bg-destructive/10 text-destructive' : 'border-border text-muted-foreground hover:border-ring/50'
                  )}
                >
                  {paramTemplateLabel(param.key, param.label || param.key, t)}
                </button>
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
      <div className={cn(
        'rounded border px-3 py-2 text-xs space-y-1',
        audit.errors.length > 0 ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-border bg-background text-muted-foreground'
      )}>
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
      </div>
      {adapterType && capabilities.length > 0 && (
        <div className={cn(
          'rounded border px-3 py-2 text-xs space-y-1',
          contractPreview.isError ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-border bg-background text-muted-foreground'
        )}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{t('admin.params.backendPreview.title')}</span>
            {backendPreviewSkipped && <span>{t('admin.params.backendPreview.skipped')}</span>}
            {contractPreview.isFetching && <span>{t('admin.params.backendPreview.loading')}</span>}
            {contractPreview.data && <span>{t('admin.params.backendPreview.valid')}</span>}
            {contractPreview.data && (
              <>
                <span>{t('admin.params.audit.params', { count: contractPreview.data.supported_params?.length ?? 0 })}</span>
                <span>{t('admin.params.audit.rules', { count: contractPreview.data.params_schema_rule_count ?? 0 })}</span>
              </>
            )}
          </div>
          {contractPreview.data?.supported_params && contractPreview.data.supported_params.length > 0 && (
            <>
              <div className="font-mono text-[11px] text-muted-foreground break-all">
                {contractPreview.data.supported_params.map((param) => param.key).join(', ')}
              </div>
              {backendPreviewRuleTypes.total > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  {formatParamRuleTypeSummary(backendPreviewRuleTypes, t)}
                </div>
              )}
              <div className="text-[11px] text-muted-foreground">
                {t('admin.params.backendPreview.agentContract', {
                  version: backendPreviewAgentContract.contract_version,
                  keys: backendPreviewAgentContract.supported_param_keys.join(', ') || t('admin.params.noneValue'),
                })}
              </div>
              <CopyCompactContractButton contract={backendPreviewAgentContract} />
            </>
          )}
          {contractPreview.isError && (
            <div>{t('admin.params.backendPreview.error', { error: translateApiError((contractPreview.error as any)?.response?.data) })}</div>
          )}
          {backendPreviewSkipped && (
            <div>{t('admin.params.backendPreview.skippedHint')}</div>
          )}
        </div>
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
      {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
      {copied ? t('admin.params.backendPreview.copiedAgentContract') : t('admin.params.backendPreview.copyAgentContract')}
    </button>
  )
}

function contractPreviewParams(data?: { supported_params?: ParamDef[] }): ParamDef[] {
  return Array.isArray(data?.supported_params) ? data.supported_params : []
}

function formatParamRuleTypeSummary(summary: ParamRuleTypeSummary, t: (key: string, options?: Record<string, unknown>) => string): string {
  const parts: string[] = []
  if (summary.conflicts > 0) parts.push(t('admin.params.audit.ruleTypes.conflicts', { count: summary.conflicts }))
  if (summary.conditionalEnums > 0) parts.push(t('admin.params.audit.ruleTypes.conditionalEnums', { count: summary.conditionalEnums }))
  if (summary.conditionalConsts > 0) parts.push(t('admin.params.audit.ruleTypes.conditionalConsts', { count: summary.conditionalConsts }))
  if (summary.requiresValues > 0) parts.push(t('admin.params.audit.ruleTypes.requiresValues', { count: summary.requiresValues }))
  return parts.join(' · ')
}

// ── Model Management Tab ──────────────────────────────────────────────────────

export function ModelManagementPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [viewMode, setViewMode] = useState<'providers' | 'gateway'>('providers')
  const [addStep, setAddStep] = useState<'idle' | 'pick' | 'fill'>('idle')
  const [selectedAdapter, setSelectedAdapter] = useState<AdapterDef | null>(null)
  const [relayHint, setRelayHint] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showKey, setShowKey] = useState<Record<number, boolean>>({})
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})
  const [testingId, setTestingId] = useState<string | null>(null)
  // Add-model panel state per credential
  const [addingFor, setAddingFor] = useState<number | null>(null)
  const [addModelId, setAddModelId] = useState('')
  const [addDisplayName, setAddDisplayName] = useState('')
  const [addShortName, setAddShortName] = useState('')
  const [addCapabilities, setAddCapabilities] = useState<string[]>(['text'])
  const [addPricingMode, setAddPricingMode] = useState('per_token')
  const [addAcceptsImage, setAddAcceptsImage] = useState(false)
  const [addMaxInputImages, setAddMaxInputImages] = useState(0)
  const [addMaxInputVideos, setAddMaxInputVideos] = useState(0)
  const [addImageEditField, setAddImageEditField] = useState('')
  const [addSupportedParams, setAddSupportedParams] = useState('')
  const [addPriority, setAddPriority] = useState('0')
  const [addCapacityWeight, setAddCapacityWeight] = useState('1')
  const [addMaxConcurrency, setAddMaxConcurrency] = useState('0')
  const [addPriceForm, setAddPriceForm] = useState<PriceForm>(defaultPriceForm())
  const [showPresets, setShowPresets] = useState(false)
  // Remote model fetch state (within add panel)
  const [remoteModels, setRemoteModels] = useState<string[]>([])
  const [remoteFetching, setRemoteFetching] = useState(false)
  const [remoteError, setRemoteError] = useState('')
  // Editing existing model config
  const [editingConfig, setEditingConfig] = useState<AIModelConfig | null>(null)
  const [editForm, setEditForm] = useState<ModelEditForm>({
    display_name: '', short_name: '', model_id_override: '', priority: '0', capacity_weight: '1', max_concurrency: '0', capabilities: [], pricing_mode: 'per_token', accepts_image: false, max_input_images: 0, max_input_videos: 0, supported_params: '',
  })
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

  const { data: adapters = [], error: adaptersQueryError } = useQuery<AdapterDef[]>({
    queryKey: ['admin', 'adapters'],
    queryFn: () => api.get('/admin/adapters').then((r) => r.data),
  })

  const { data: presets = [], error: presetsQueryError } = useQuery<ModelPreset[]>({
    queryKey: ['admin', 'model-presets'],
    queryFn: () => api.get('/admin/model-presets').then((r) => r.data),
  })

  const { data: credentials = [], error: credentialsQueryError } = useQuery<AICredential[]>({
    queryKey: ['admin', 'credentials'],
    queryFn: () => api.get('/admin/credentials').then((r) => r.data),
  })

  const runtimeHealthQuery = useQuery<RuntimeProviderHealthResponse>({
    queryKey: ['admin', 'model-runtime-health'],
    queryFn: () => api.get('/admin/debug/model-runtime-health').then((r) => r.data),
    enabled: viewMode === 'gateway',
    refetchInterval: viewMode === 'gateway' ? 5000 : false,
  })

  const deleteCredential = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/credentials/${id}`),
    onMutate: () => setModelAdminError(''),
    onSuccess: () => {
      setModelAdminError('')
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
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
      setCredentialEditFor(null)
      setCredentialEditFields({})
    },
    onError: (err: any) => setModelAdminError(translateAPIRequestError(err)),
  })

  const addModel = useMutation({
    mutationFn: ({ credId, modelId, displayName, shortName, capabilities, pricingMode, acceptsImage, maxInputImages, maxInputVideos, imageEditField, supportedParams, priority, capacityWeight, maxConcurrency, data }: {
      credId: number; modelId: string; displayName: string; shortName: string; capabilities: string[]
      pricingMode: string; acceptsImage: boolean; maxInputImages: number; maxInputVideos: number
      imageEditField: string; supportedParams: string; priority: string; capacityWeight: string; maxConcurrency: string; data: PriceForm
    }) =>
      api.post(`/admin/credentials/${credId}/models`, {
        model_def_id: modelId,
        priority: parseInt(priority, 10) || 0,
        capacity_weight: Math.max(1, parseInt(capacityWeight, 10) || 1),
        max_concurrency: Math.max(0, parseInt(maxConcurrency, 10) || 0),
        custom_display_name: displayName || modelId,
        short_name: shortName,
        custom_capabilities: capabilities.join(','),
        custom_pricing_mode: pricingMode,
        custom_accepts_image: acceptsImage,
        custom_max_input_images: maxInputImages,
        custom_max_input_videos: maxInputVideos,
        custom_image_edit_field: imageEditField,
        custom_supported_params: supportedParams,
        credits_input_per_1m: data.credits_input_per_1m,
        credits_output_per_1m: data.credits_output_per_1m,
        credits_per_image: data.credits_per_image,
        credits_per_second: data.credits_per_second,
        credits_per_call: data.credits_per_call,
      }),
    onMutate: () => setModelAdminError(''),
    onSuccess: () => {
      setModelAdminError('')
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      closeAddPanel()
    },
    onError: (err: any) => setModelAdminError(translateAPIRequestError(err)),
  })

  const updateModelConfig = useMutation({
    mutationFn: ({ modelId, data }: { modelId: number; data: typeof editForm }) =>
      api.patch(`/admin/model-configs/${modelId}`, {
        custom_display_name: data.display_name,
        short_name: data.short_name,
        model_id_override: data.model_id_override,
        priority: parseInt(data.priority, 10) || 0,
        capacity_weight: Math.max(1, parseInt(data.capacity_weight, 10) || 1),
        max_concurrency: Math.max(0, parseInt(data.max_concurrency, 10) || 0),
        custom_capabilities: data.capabilities.join(','),
        custom_pricing_mode: data.pricing_mode,
        custom_accepts_image: data.accepts_image,
        custom_max_input_images: data.max_input_images,
        custom_max_input_videos: data.max_input_videos,
        custom_supported_params: data.supported_params,
      }),
    onMutate: () => setModelAdminError(''),
    onSuccess: () => {
      setModelAdminError('')
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      setEditingConfig(null)
    },
    onError: (err: any) => setModelAdminError(translateAPIRequestError(err)),
  })

  const deleteModelConfig = useMutation({
    mutationFn: ({ credId, modelId }: { credId: number; modelId: number }) =>
      api.delete(`/admin/credentials/${credId}/models/${modelId}`),
    onMutate: () => setModelAdminError(''),
    onSuccess: () => {
      setModelAdminError('')
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
    },
    onError: (err: any) => setModelAdminError(translateAPIRequestError(err)),
  })

  function openAddPanel(credId: number) {
    const defaultCaps = ['text']
    setAddingFor(credId)
    setAddModelId('')
    setAddDisplayName('')
    setAddShortName('')
    setAddCapabilities(defaultCaps)
    setAddPricingMode('per_token')
    setAddAcceptsImage(false)
    setAddMaxInputImages(0)
    setAddMaxInputVideos(0)
    setAddImageEditField('')
    setAddSupportedParams('')
    setAddPriority('0')
    setAddCapacityWeight('1')
    setAddMaxConcurrency('0')
    setAddPriceForm(defaultPriceForm())
    setRemoteModels([])
    setRemoteError('')
    setShowPresets(false)
  }

  const addEffectivePricingMode = canUseCustomPricingMode ? addPricingMode : inferPricingMode(addCapabilities)
  const editEffectivePricingMode = canUseCustomPricingMode ? editForm.pricing_mode : inferPricingMode(editForm.capabilities)
  const modelQueryError = adaptersQueryError || presetsQueryError || credentialsQueryError

  function closeAddPanel() {
    setAddingFor(null)
    setRemoteModels([])
    setRemoteError('')
    setShowPresets(false)
  }

  async function fetchRemoteModels(credId: number) {
    setRemoteFetching(true)
    setRemoteError('')
    setRemoteModels([])
    try {
      const res = await api.get(`/admin/credentials/${credId}/remote-models`).then((r) => r.data)
      setRemoteModels(res.models ?? [])
    } catch (e: any) {
      setRemoteError(translateAPIRequestError(e))
    } finally {
      setRemoteFetching(false)
    }
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

  function confirmDeleteModelConfig(cred: AICredential, cfg: AIModelConfig) {
    const name = modelConfigDisplayName(cfg)
    if (window.confirm(t('admin.models.confirmDeleteModel', { name }))) {
      deleteModelConfig.mutate({ credId: cred.ID, modelId: cfg.ID })
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('admin.models.title')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('admin.models.description')}</p>
        </div>
        <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'providers' | 'gateway')}>
          <TabsList>
            <TabsTrigger value="providers">{t('admin.models.viewProviders')}</TabsTrigger>
            <TabsTrigger value="gateway">{t('admin.models.viewGateway')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        {viewMode === 'providers'
          ? t('admin.models.providersHint')
          : t('admin.models.gatewayHint')}
      </div>

      {modelAdminError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          <span>{modelAdminError}</span>
        </div>
      )}

      {modelQueryError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          <span>{translateAPIRequestError(modelQueryError)}</span>
        </div>
      )}

      {viewMode === 'providers' && addStep === 'idle' && (
        <div className="flex justify-end">
          <Button onClick={() => setAddStep('pick')}>
            <Plus size={14} className="mr-1.5" /> {t('admin.models.addCredential')}
          </Button>
        </div>
      )}

      {viewMode === 'providers' && addStep === 'pick' && (
        <AdapterPicker
          adapters={adapters}
          onPick={(a) => { setSelectedAdapter(a); setAddStep('fill') }}
          onCancel={() => setAddStep('idle')}
        />
      )}
      {viewMode === 'providers' && addStep === 'fill' && selectedAdapter && (
        <CredentialForm
          adapter={selectedAdapter}
          onBack={() => setAddStep('pick')}
          onSuccess={(adapterType) => {
            setAddStep('idle')
            setSelectedAdapter(null)
            setRelayHint(adapterType === 'volcen' ? adapterType : null)
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
          {credentials.map((cred) => {
          const testKey = `cred-${cred.ID}`
          const testRes = testResults[testKey]
          const adapter = adapters.find((a) => a.adapter_type === cred.adapter_type)

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
                    {cred.models && cred.models.length > 0 && (
                      <span className="text-xs text-muted-foreground">{t('admin.models.modelsCount', { count: cred.models.length })}</span>
                    )}
                  </div>
                  {cred.base_url && <p className="text-xs text-muted-foreground truncate">{cred.base_url}</p>}
                </div>

                {cred.masked_key && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <button onClick={() => setShowKey((s) => ({ ...s, [cred.ID]: !s[cred.ID] }))}>
                      {showKey[cred.ID] ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <span className="font-mono">{showKey[cred.ID] ? cred.masked_key : '••••••••'}</span>
                  </div>
                )}

                <button
                  onClick={() => runTest(testKey, () => api.post(`/admin/credentials/${cred.ID}/test`, {}).then((r) => r.data))}
                  disabled={testingId === testKey}
                  className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5"
                >
                  {testingId === testKey ? t('admin.credentials.testing') : t('admin.models.connectionTest')}
                </button>
                {testRes && (
                  <span className={cn('text-xs', testRes.success ? 'text-foreground' : 'text-destructive')}>
                    {testRes.success ? `✓ ${testRes.latency_ms}ms` : t('admin.models.testFailedMark')}
                  </span>
                )}

                <button
                  onClick={() => confirmToggleCredential(cred)}
                  title={cred.is_enabled ? t('admin.models.disableCredentialTitle') : t('admin.models.enableCredentialTitle')}
                  className={cn('text-xs px-2 py-0.5 rounded-full border transition-colors',
                    cred.is_enabled
                      ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400'
                      : 'border-border bg-muted text-muted-foreground hover:border-ring/50')}
                >
                  {cred.is_enabled ? t('admin.models.enabledMark') : t('admin.models.disabledMark')}
                </button>
                <button onClick={() => confirmDeleteCredential(cred)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Expanded: model configs + add panel */}
              {expandedId === cred.ID && (
                <div className="border-t border-border px-4 py-3 space-y-3 bg-card">
                  <div className="border border-border rounded-lg bg-background p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">{t('admin.models.credentialAuth')}</p>
                      <button
                        onClick={() => credentialEditFor === cred.ID ? setCredentialEditFor(null) : openCredentialAuthEdit(cred)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {credentialEditFor === cred.ID ? t('admin.models.collapse') : t('admin.models.edit')}
                      </button>
                    </div>

                    {credentialEditFor !== cred.ID ? (
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
                          <p className="text-xs text-destructive">
                            {translateApiError((updateCredentialAuth.error as any)?.response?.data)}
                          </p>
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

                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">{t('admin.models.enabledModels')}</p>
                    {addingFor !== cred.ID && (
                      <button
                        onClick={() => openAddPanel(cred.ID)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        <Plus size={12} /> {t('admin.models.addModel')}
                      </button>
                    )}
                  </div>

                  {/* Add model panel */}
                  {addingFor === cred.ID && (() => {
                    const capLabels: Record<string, string> = {
                      text: t('admin.capabilities.text'), reasoning: t('admin.capabilities.reasoning'), image: t('admin.capabilities.image'), image_edit: t('admin.capabilities.imageEdit'),
                      video: t('admin.capabilities.video'), video_i2v: t('admin.capabilities.videoI2V'), video_v2v: t('admin.capabilities.videoV2V'),
                    }
                    // Filter presets to this credential's adapter type.
                    const credAdapter = cred.adapter_type
                    const currentAdapter = adapters.find((a) => a.adapter_type === credAdapter)
                    const addParamAudit = buildParamContractAudit(addSupportedParams, adapterParamsForCapabilities(currentAdapter, addCapabilities))
                    const addInputLimitErrors = inputLimitErrors(addMaxInputImages, addMaxInputVideos, t)
                    const addInputLimitsValid = addInputLimitErrors.length === 0
                    const filteredPresets = presets.filter(p => p.adapter_type === credAdapter)

                    function applyPreset(preset: ModelPreset) {
                      setAddModelId(preset.model_id)
                      setAddDisplayName(preset.display_name)
                      setAddShortName('')
                      setAddCapabilities(preset.capabilities)
                      setAddPricingMode(preset.pricing_mode ?? inferPricingMode(preset.capabilities))
                      setAddAcceptsImage(preset.accepts_image_input ?? false)
                      setAddMaxInputImages(preset.max_input_images ?? 0)
                      setAddMaxInputVideos(preset.max_input_videos ?? 0)
                      setAddImageEditField(preset.image_edit_field ?? '')
                      setAddSupportedParams(Array.isArray(preset.supported_params) ? serializeParamDefs(preset.supported_params) : '')
                      setShowPresets(false)
                    }

                    return (
                      <div className="border border-border rounded bg-background p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-foreground">{t('admin.models.addModel')}</p>
                          <div className="flex items-center gap-2">
                            {filteredPresets.length > 0 && (
                              <button
                                onClick={() => setShowPresets(!showPresets)}
                                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                              >
                                <Sparkles size={11} />
                                {showPresets ? t('admin.models.collapsePresets') : t('admin.models.pickPreset')}
                              </button>
                            )}
                            <button
                              onClick={() => fetchRemoteModels(cred.ID)}
                              disabled={remoteFetching}
                              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50"
                            >
                              <RefreshCw size={11} className={remoteFetching ? 'animate-spin' : ''} />
                              {t('admin.models.fetchFromApi')}
                            </button>
                          </div>
                        </div>

                        {/* Preset list — filtered by adapter type */}
                        {showPresets && filteredPresets.length > 0 && (
                          <div className="border border-border rounded bg-muted/20 p-2 space-y-1 max-h-48 overflow-y-auto">
                            <p className="text-[10px] text-muted-foreground mb-1">{t('admin.models.presetHint')}</p>
                            {filteredPresets.map((preset) => (
                              <button
                                key={preset.id}
                                onClick={() => applyPreset(preset)}
                                className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-accent transition-colors flex items-center justify-between gap-2"
                              >
                                <span className="font-medium truncate">{preset.display_name}</span>
                                <span className="flex shrink-0 items-center gap-1.5">
                                  {Array.isArray(preset.supported_params) && preset.supported_params.length > 0 && (
                                    <span className="rounded border border-border bg-background px-1.5 py-0 text-[10px] leading-4 text-muted-foreground">
                                      {t('admin.models.presetParams', { count: preset.supported_params.length })}
                                    </span>
                                  )}
                                  <span className="text-muted-foreground font-mono">{preset.model_id}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Model ID input with remote list */}
                        <div>
                          <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.modelIdLabel')}</Label>
                          <input
                            className="w-full text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                            value={addModelId}
                            onChange={(e) => setAddModelId(e.target.value)}
                            placeholder={t('admin.models.modelIdPlaceholder')}
                          />
                        </div>

                        {remoteError && <p className="text-xs text-destructive">{remoteError}</p>}

                        {remoteModels.length > 0 && (
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {remoteModels.map((modelId) => (
                              <button
                                key={modelId}
                                onClick={() => setAddModelId(modelId)}
                                className={cn(
                                  'w-full text-left rounded px-2 py-1 text-xs font-mono transition-colors border',
                                  addModelId === modelId ? 'bg-accent border-border' : 'hover:bg-muted/50 border-transparent'
                                )}
                              >
                                {modelId}
                              </button>
                            ))}
                          </div>
                        )}

                        <div>
                          <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.params.displayName')}</Label>
                          <input
                            className="w-full text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            value={addDisplayName}
                            onChange={(e) => setAddDisplayName(e.target.value)}
                            placeholder={addModelId || t('admin.models.displayNamePlaceholder')}
                          />
                        </div>

                        <div>
                          <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.shortName')}</Label>
                          <input
                            className="w-full text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            value={addShortName}
                            onChange={(e) => setAddShortName(e.target.value)}
                            placeholder={t('admin.models.shortNamePlaceholder')}
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.priority')}</Label>
                            <Input
                              type="number"
                              step={1}
                              className="text-xs h-8"
                              value={addPriority}
                              onChange={(e) => setAddPriority(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.capacityWeight')}</Label>
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              className="text-xs h-8"
                              value={addCapacityWeight}
                              onChange={(e) => setAddCapacityWeight(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.maxConcurrency')}</Label>
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              className="text-xs h-8"
                              value={addMaxConcurrency}
                              onChange={(e) => setAddMaxConcurrency(e.target.value)}
                            />
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.capabilitiesLabel')}</Label>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(capLabels).map(([cap, label]) => (
                              <button
                                key={cap}
                                onClick={() => {
                                  const next = addCapabilities.includes(cap)
                                    ? addCapabilities.filter(c => c !== cap)
                                    : [...addCapabilities, cap]
                                  if (next.length > 0) {
                                    setAddCapabilities(next)
                                    setAddPricingMode(inferPricingMode(next))
                                    const needsImage = next.some(c => c === 'image_edit' || c === 'video_i2v' || c === 'video_v2v')
                                    setAddAcceptsImage(needsImage)
                                    setAddSupportedParams('')
                                  }
                                }}
                                className={cn(
                                  'text-xs px-2 py-0.5 rounded border transition-colors',
                                  addCapabilities.includes(cap)
                                    ? 'border-ring bg-accent text-foreground'
                                    : 'border-border text-muted-foreground hover:border-ring/50'
                                )}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {canUseCustomPricingMode && (
                          <div>
                            <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.pricingMode')}</Label>
                            <div className="flex gap-2 flex-wrap">
                              {([
                                { value: 'per_token', label: t('admin.pricingMode.perToken') },
                                { value: 'per_image', label: t('admin.pricingMode.perImage') },
                                { value: 'per_second', label: t('admin.pricingMode.perSecond') },
                                { value: 'per_call', label: t('admin.pricingMode.perCall') },
                              ]).map(opt => (
                                <button
                                  key={opt.value}
                                  onClick={() => setAddPricingMode(opt.value)}
                                  className={cn(
                                    'text-xs px-2 py-0.5 rounded border transition-colors',
                                    addPricingMode === opt.value
                                      ? 'border-ring bg-accent text-foreground'
                                      : 'border-border text-muted-foreground hover:border-ring/50'
                                  )}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Image/video input config */}
                        <div className="flex flex-wrap gap-3 items-center">
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={addAcceptsImage}
                              onChange={e => setAddAcceptsImage(e.target.checked)}
                              className="rounded"
                            />
                            {t('admin.models.acceptsImageInput')}
                          </label>
                          {addAcceptsImage && (
                            <div className="flex items-center gap-1.5">
                              <Label className="text-xs text-muted-foreground">{t('admin.models.maxImages')}</Label>
                              <input
                                type="number"
                                min={-1}
                                step={1}
                                className="w-16 text-xs border border-border rounded px-1.5 py-0.5 bg-background"
                                value={addMaxInputImages}
                                onChange={e => setAddMaxInputImages(Number(e.target.value))}
                                placeholder="1"
                              />
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs text-muted-foreground">{t('admin.models.maxVideos')}</Label>
                            <input
                              type="number"
                              min={-1}
                              step={1}
                              className="w-16 text-xs border border-border rounded px-1.5 py-0.5 bg-background"
                              value={addMaxInputVideos}
                              onChange={e => setAddMaxInputVideos(Number(e.target.value))}
                              placeholder="0"
                            />
                          </div>
                          <span className="text-[11px] text-muted-foreground">{t('admin.models.inputLimitHint')}</span>
                        </div>
                        {addInputLimitErrors.length > 0 && (
                          <div className="space-y-0.5 text-xs text-destructive">
                            {addInputLimitErrors.map((error) => <p key={error}>{error}</p>)}
                          </div>
                        )}

	                        <ParamConfigBuilder
	                          value={addSupportedParams}
	                          onChange={setAddSupportedParams}
	                          adapterParams={adapterParamsForCapabilities(currentAdapter, addCapabilities)}
	                          adapterType={currentAdapter?.adapter_type}
	                          capabilities={addCapabilities}
	                          acceptsImageInput={addAcceptsImage}
	                          maxInputImages={addMaxInputImages}
	                          maxInputVideos={addMaxInputVideos}
	                        />

                        <PriceFields def={{ pricing_mode: addEffectivePricingMode }} form={addPriceForm} onChange={setAddPriceForm} />

                        {addModel.isError && (
                          <p className="text-xs text-destructive">{translateApiError((addModel.error as any)?.response?.data)}</p>
                        )}

                        <div className="flex gap-2">
                          <Button
                            onClick={() => addModel.mutate({
                              credId: cred.ID,
                              modelId: addModelId.trim(),
                              displayName: addDisplayName.trim(),
                              shortName: addShortName.trim(),
                              capabilities: addCapabilities,
                              pricingMode: addEffectivePricingMode,
                              acceptsImage: addAcceptsImage,
                              maxInputImages: addMaxInputImages,
                              maxInputVideos: addMaxInputVideos,
                              imageEditField: addImageEditField,
                              supportedParams: addSupportedParams,
                              priority: addPriority,
                              capacityWeight: addCapacityWeight,
                              maxConcurrency: addMaxConcurrency,
                              data: addPriceForm,
                            })}
                            disabled={addModel.isPending || !addModelId.trim() || addCapabilities.length === 0 || !addInputLimitsValid || addParamAudit.errors.length > 0}
                            size="sm"
                            className="flex-1"
                          >
                            {addModel.isPending ? '…' : t('admin.models.add')}
                          </Button>
                          <Button variant="outline" size="sm" onClick={closeAddPanel}>{t('common.cancel')}</Button>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Active model config rows */}
                  {(cred.models ?? []).map((cfg) => {
                    const modelTestKey = `model-${cfg.ID}`
                    const modelTestRes = testResults[modelTestKey]
                    const isEditing = editingConfig?.ID === cfg.ID
                    const displayName = cfg.custom_display_name || cfg.model_def_id
                    const selectorName = cfg.short_name || displayName
                    const caps = cfg.custom_capabilities ? cfg.custom_capabilities.split(',').filter(Boolean) : []
                    const pricing = cfg.custom_pricing_mode || ''
                    const editParamAudit = isEditing ? buildParamContractAudit(editForm.supported_params, adapterParamsForCapabilities(adapter, editForm.capabilities)) : null
                    const editInputLimitErrors = inputLimitErrors(editForm.max_input_images, editForm.max_input_videos, t)
                    const editInputLimitsValid = editInputLimitErrors.length === 0

                    return (
                      <div key={cfg.ID} className="border border-border rounded bg-background">
                        <div className="flex items-center gap-2 px-3 py-2 text-xs">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-foreground">{selectorName}</span>
                            {cfg.short_name && cfg.short_name !== displayName && (
                              <span className="ml-2 text-muted-foreground">{displayName}</span>
                            )}
                            {cfg.model_id_override && (
                              <span className="ml-2 font-mono text-muted-foreground text-xs">{cfg.model_id_override}</span>
                            )}
                          </div>
                          {caps.length > 0 && (
                            <span className="text-muted-foreground">{caps.join(',')}</span>
                          )}
                          {pricing && (
                            <span className="text-muted-foreground/50">{PRICING_LABEL_KEYS[pricing] ? t(PRICING_LABEL_KEYS[pricing]) : pricing}</span>
                          )}
                          <button
                            onClick={() => runTest(modelTestKey, () =>
                              api.post(`/admin/credentials/${cred.ID}/models/${cfg.ID}/test`, {}).then((r) => r.data)
                            )}
                            disabled={testingId === modelTestKey}
                            className="text-muted-foreground/50 hover:text-foreground border border-border rounded px-1.5 py-0.5"
                          >
                            {testingId === modelTestKey ? '…' : t('admin.models.test')}
                          </button>
                          {modelTestRes && (
                            <span className={cn('text-xs', modelTestRes.success ? 'text-foreground' : 'text-destructive')}>
                              {modelTestRes.success ? '✓' : '✗'}
                            </span>
                          )}
                          <button
                            onClick={() => navigator.clipboard.writeText(JSON.stringify(runtimeModelConfigFromAdmin(cred, cfg, adapter?.default_base_url), null, 2))}
                            className="text-muted-foreground/50 hover:text-foreground"
                            title="Copy runtime model config"
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            onClick={() => {
                              const nextCaps = cfg.custom_capabilities ? cfg.custom_capabilities.split(',').filter(Boolean) : []
                              setEditingConfig(cfg)
                              setEditForm({
                                display_name: cfg.custom_display_name,
                                short_name: cfg.short_name,
                                model_id_override: cfg.model_id_override,
                                priority: String(cfg.priority ?? 0),
                                capacity_weight: String(cfg.capacity_weight ?? 1),
                                max_concurrency: String(cfg.max_concurrency ?? 0),
                                capabilities: nextCaps,
                                pricing_mode: cfg.custom_pricing_mode || 'per_token',
                                accepts_image: cfg.custom_accepts_image,
                                max_input_images: cfg.custom_max_input_images,
                                max_input_videos: cfg.custom_max_input_videos,
                                supported_params: cfg.custom_supported_params || '',
                              })
                            }}
                            className="text-muted-foreground/50 hover:text-foreground"
                          >
                            {t('admin.models.edit')}
                          </button>
                          <button
                            onClick={() => confirmDeleteModelConfig(cred, cfg)}
                            className="text-muted-foreground/50 hover:text-destructive"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>

                        {isEditing && (
                          <div className="border-t border-border px-3 py-2 space-y-2 bg-card">
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.params.displayName')}</Label>
                                <Input
                                  className="text-xs"
                                  value={editForm.display_name}
                                  onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
                                  placeholder={cfg.model_def_id}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.shortName')}</Label>
                                <Input
                                  className="text-xs"
                                  value={editForm.short_name}
                                  onChange={(e) => setEditForm((f) => ({ ...f, short_name: e.target.value }))}
                                  placeholder={t('admin.models.shortNamePlaceholder')}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground block mb-0.5">{t('common.modelIdOverride')}</Label>
                                <Input
                                  className="text-xs font-mono"
                                  value={editForm.model_id_override}
                                  onChange={(e) => setEditForm((f) => ({ ...f, model_id_override: e.target.value }))}
                                  placeholder={t('admin.features.modelIdOverrideShortPlaceholder')}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.priority')}</Label>
                                <Input
                                  type="number"
                                  step={1}
                                  className="text-xs"
                                  value={editForm.priority}
                                  onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.capacityWeight')}</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  step={1}
                                  className="text-xs"
                                  value={editForm.capacity_weight}
                                  onChange={(e) => setEditForm((f) => ({ ...f, capacity_weight: e.target.value }))}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.maxConcurrency')}</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  step={1}
                                  className="text-xs"
                                  value={editForm.max_concurrency}
                                  onChange={(e) => setEditForm((f) => ({ ...f, max_concurrency: e.target.value }))}
                                />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.capabilitiesLabel')}</Label>
                              <div className="flex flex-wrap gap-1.5">
                                {(['text', 'reasoning', 'image', 'image_edit', 'video', 'video_i2v', 'video_v2v'] as const).map((cap) => {
                                  const labelKey = { text: 'admin.capabilities.text', reasoning: 'admin.capabilities.reasoning', image: 'admin.capabilities.image', image_edit: 'admin.capabilities.imageEdit', video: 'admin.capabilities.video', video_i2v: 'admin.capabilities.videoI2V', video_v2v: 'admin.capabilities.videoV2V' }[cap]
                                  const active = editForm.capabilities.includes(cap)
                                  return (
                                    <button
                                      key={cap}
                                      onClick={() => {
                                        const next = active
                                          ? editForm.capabilities.filter((c) => c !== cap)
                                          : [...editForm.capabilities, cap]
                                        if (next.length > 0) {
                                          setEditForm((f) => ({
                                            ...f,
                                            capabilities: next,
                                            supported_params: '',
                                          }))
                                        }
                                      }}
                                      className={cn(
                                        'text-xs px-2 py-0.5 rounded border transition-colors',
                                        active ? 'border-ring bg-accent text-foreground' : 'border-border text-muted-foreground hover:border-ring/50'
                                      )}
                                    >
                                      {t(labelKey)}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          {canUseCustomPricingMode && (
                            <div>
                              <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.pricingMode')}</Label>
                              <div className="flex gap-1.5 flex-wrap">
                                {([
                                  { value: 'per_token', label: t('admin.pricingMode.perToken') },
                                  { value: 'per_image', label: t('admin.pricingMode.perImage') },
                                  { value: 'per_second', label: t('admin.pricingMode.perSecond') },
                                  { value: 'per_call', label: t('admin.pricingMode.perCall') },
                                ]).map((opt) => (
                                  <button
                                    key={opt.value}
                                    onClick={() => setEditForm((f) => ({ ...f, pricing_mode: opt.value }))}
                                    className={cn(
                                      'text-xs px-2 py-0.5 rounded border transition-colors',
                                      editForm.pricing_mode === opt.value ? 'border-ring bg-accent text-foreground' : 'border-border text-muted-foreground hover:border-ring/50'
                                    )}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                            <div className="flex flex-wrap gap-3 items-center">
                              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editForm.accepts_image}
                                  onChange={(e) => setEditForm((f) => ({ ...f, accepts_image: e.target.checked }))}
                                  className="rounded"
                                />
                                {t('admin.models.acceptsImageInput')}
                              </label>
                              {editForm.accepts_image && (
                                <div className="flex items-center gap-1.5">
                                  <Label className="text-xs text-muted-foreground">{t('admin.models.maxImages')}</Label>
                                  <input
                                    type="number"
                                    min={-1}
                                    step={1}
                                    className="w-16 text-xs border border-border rounded px-1.5 py-0.5 bg-background"
                                    value={editForm.max_input_images}
                                    onChange={(e) => setEditForm((f) => ({ ...f, max_input_images: Number(e.target.value) }))}
                                    placeholder="1"
                                  />
                                </div>
                              )}
                              <div className="flex items-center gap-1.5">
                                <Label className="text-xs text-muted-foreground">{t('admin.models.maxVideos')}</Label>
                                <input
                                  type="number"
                                  min={-1}
                                  step={1}
                                  className="w-16 text-xs border border-border rounded px-1.5 py-0.5 bg-background"
                                  value={editForm.max_input_videos}
                                  onChange={(e) => setEditForm((f) => ({ ...f, max_input_videos: Number(e.target.value) }))}
                                  placeholder="0"
                                />
                              </div>
                              <span className="text-[11px] text-muted-foreground">{t('admin.models.inputLimitHint')}</span>
                            </div>
                            {editInputLimitErrors.length > 0 && (
                              <div className="space-y-0.5 text-xs text-destructive">
                                {editInputLimitErrors.map((error) => <p key={error}>{error}</p>)}
                              </div>
                            )}
	                          <ParamConfigBuilder
	                            value={editForm.supported_params}
	                            onChange={(next) => setEditForm((f) => ({ ...f, supported_params: next }))}
	                            adapterParams={adapterParamsForCapabilities(adapter, editForm.capabilities)}
	                            adapterType={adapter?.adapter_type}
	                            capabilities={editForm.capabilities}
	                            acceptsImageInput={editForm.accepts_image}
	                            maxInputImages={editForm.max_input_images}
	                            maxInputVideos={editForm.max_input_videos}
	                          />
                            <div className="flex gap-2">
                              <Button
                                onClick={() => updateModelConfig.mutate({
                                  modelId: cfg.ID,
                                  data: {
                                    ...editForm,
                                    pricing_mode: canUseCustomPricingMode ? editForm.pricing_mode : editEffectivePricingMode,
                                  },
                                })}
                                disabled={updateModelConfig.isPending || !editInputLimitsValid || (editParamAudit?.errors.length ?? 0) > 0}
                                size="sm"
                                className="flex-1"
                              >
                                {t('common.save')}
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => setEditingConfig(null)}>
                                {t('common.cancel')}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {(!cred.models || cred.models.length === 0) && addingFor !== cred.ID && (
                    <p className="text-xs text-muted-foreground">
                      {t('admin.models.noModelsHint')}
                    </p>
                  )}

                  {/* Files API config — shown only for adapters that support it */}
                  {adapter?.supports_files_api && (() => {
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
                              ? <span className="text-green-600 dark:text-green-400">{t('admin.models.enabledMark')}</span>
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
              {t('admin.models.noCredentialsHint')}
            </p>
          )}
        </div>
      )}

      {viewMode === 'gateway' && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-medium text-foreground">{t('admin.models.gatewayRuleTitle')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('admin.models.gatewayRuleBody')}</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-medium text-foreground">{t('admin.models.gatewayPriorityTitle')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('admin.models.gatewayPriorityBody')}</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-medium text-foreground">{t('admin.models.gatewayScopeTitle')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('admin.models.gatewayScopeBody')}</p>
            </div>
          </div>

          <RuntimeModelHealthSection
            items={runtimeHealthQuery.data?.items ?? []}
            isLoading={runtimeHealthQuery.isLoading}
            isFetching={runtimeHealthQuery.isFetching}
            error={runtimeHealthQuery.error}
            onRefresh={() => runtimeHealthQuery.refetch()}
          />

          <GatewayAPIKeysSection credentials={credentials} />
        </div>
      )}
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
  const sorted = [...items].sort((a, b) => runtimeHealthRank(b) - runtimeHealthRank(a) || b.priority - a.priority || a.model_config_id - b.model_config_id)

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
        <div className="px-4 py-3 text-xs text-destructive">{translateAPIRequestError(error)}</div>
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
                  <tr key={item.model_config_id} className="align-top">
                    <td className="px-4 py-2">
                      <p className="font-medium text-foreground">{item.provider_name || '-'}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{item.adapter_type}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-mono text-foreground">{item.model_id || item.model_def_id || '-'}</p>
                      <p className="text-[11px] text-muted-foreground">#{item.model_config_id}</p>
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
                      <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', state.className)}>
                        {state.label}
                      </span>
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

function runtimeHealthState(item: RuntimeProviderHealth, t: (key: string, options?: Record<string, unknown>) => string) {
  if (!item.is_enabled) {
    return { label: t('admin.models.runtimeHealthDisabled'), className: 'border-border bg-muted text-muted-foreground' }
  }
  if (item.circuit_open) {
    return { label: t('admin.models.runtimeHealthCircuitOpen'), className: 'border-destructive/30 bg-destructive/10 text-destructive' }
  }
  if (item.saturated) {
    return { label: t('admin.models.runtimeHealthSaturated'), className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' }
  }
  if (item.failures > 0) {
    return { label: t('admin.models.runtimeHealthDegraded'), className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' }
  }
  return { label: t('admin.models.runtimeHealthHealthy'), className: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300' }
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
  const [createProjectStatus, setCreateProjectStatus] = useState('planning')
  const [selectedOwnerId, setSelectedOwnerId] = useState('')
  const [editProjectName, setEditProjectName] = useState('')
  const [editProjectStatus, setEditProjectStatus] = useState('planning')
  const [projectFilters, setProjectFilters] = useState<ProjectListFilters>(() => projectFiltersFromSearchParams(searchParams))
  const [page, setPage] = useState(() => projectPageFromSearchParams(searchParams))
  const [memberDialog, setMemberDialog] = useState<AdminProject | null>(null)
  const [newMemberUserId, setNewMemberUserId] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('viewer')
  const [projectError, setProjectError] = useState('')
  const { query, projectId: projectIdFilter, status: statusFilter, ownerId: ownerFilter, orgId: orgFilter } = projectFilters

  const { data, isFetching, refetch, error: projectsQueryError } = useQuery<{ projects: AdminProject[]; total: number }>({
    queryKey: ['admin', 'projects', query, projectIdFilter, statusFilter, ownerFilter, orgFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: '25',
      })
      if (query.trim()) params.set('q', query.trim())
      if (projectIdFilter) params.set('project_id', projectIdFilter)
      if (statusFilter) params.set('status', statusFilter)
      if (ownerFilter) params.set('owner_id', ownerFilter)
      if (orgFilter) params.set('org_id', orgFilter)
      const res = await api.get<AdminProject[]>(`/admin/projects?${params.toString()}`)
      return {
        projects: res.data,
        total: Number(res.headers['x-total-count'] ?? res.data.length),
      }
    },
  })
  const projects = data?.projects ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / 25))
  const projectStatuses = ['planning', 'script_analysis', 'asset_prep', 'production', 'editing', 'done']
  const projectMembersQuery = useQuery<AdminProjectMember[]>({
    queryKey: ['admin', 'projects', memberDialog?.ID, 'members'],
    queryFn: () => api.get(`/admin/projects/${memberDialog?.ID}/members`).then((r) => r.data),
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
    mutationFn: ({ name, description, ownerId, orgId, status }: { name: string; description: string; ownerId: number; orgId?: number; status: string }) =>
      api.post('/admin/projects', { name, description, owner_id: ownerId, org_id: orgId, status }).then((r) => r.data),
    onSuccess: () => {
      setProjectError('')
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
      setCreateDialogOpen(false)
      setCreateProjectName('')
      setCreateProjectDescription('')
      setCreateProjectOwnerId('')
      setCreateProjectOrgId('')
      setCreateProjectStatus('planning')
    },
    onError: (err: any) => setProjectError(translateAPIRequestError(err)),
  })
  const updateProject = useMutation({
    mutationFn: ({ projectId, name, status }: { projectId: number; name: string; status: string }) =>
      api.patch(`/admin/projects/${projectId}`, { name, status }).then((r) => r.data),
    onSuccess: (_result, variables) => {
      setProjectError('')
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] })
      qc.invalidateQueries({ queryKey: ['admin', 'projects', variables.projectId, 'detail'] })
      setEditDialog(null)
      setEditProjectName('')
      setEditProjectStatus('planning')
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
    setEditProjectStatus(project.status || 'planning')
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
      status: createProjectStatus,
    })
  }

  const submitProjectUpdate = () => {
    if (!editDialog || !editProjectName.trim()) return
    updateProject.mutate({ projectId: editDialog.ID, name: editProjectName, status: editProjectStatus })
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

      <div className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[minmax(180px,1fr)_110px_150px_130px_130px_auto]">
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
        <select
          value={statusFilter}
          onChange={(event) => updateProjectFilter('status', event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">{t('admin.projects.allStatuses')}</option>
          {projectStatuses.map((status) => (
            <option key={status} value={status}>{t(`admin.projects.statuses.${status}`, { defaultValue: status })}</option>
          ))}
        </select>
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
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {projectError}
        </div>
      )}

      {projectsQueryError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {translateAPIRequestError(projectsQueryError)}
        </div>
      )}

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-card border-b border-border">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.id')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.name')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.owner')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('admin.projects.status')}</th>
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
                <tr key={project.ID} className={cn('hover:bg-card', project.owner_id === 0 && 'bg-destructive/5')}>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{project.ID}</td>
                  <td className="px-4 py-3 font-medium">{project.name || t('common.emptyTitle')}</td>
                  <td className={cn('px-4 py-3 text-xs', project.owner_id === 0 ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                    {ownerName}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{project.status ? t(`admin.projects.statuses.${project.status}`, { defaultValue: project.status }) : '-'}</td>
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
                    <button
                      onClick={() => removeProject(project)}
                      disabled={deleteProject.isPending}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
                      title={t('admin.projects.delete')}
                      aria-label={t('admin.projects.delete')}
                    >
                      <Trash2 size={13} />
                    </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {!projectsQueryError && projects.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">{t('admin.projects.empty')}</td></tr>
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
                <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {translateAPIRequestError(projectDetailQuery.error)}
                </div>
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
                      <td colSpan={4} className="px-4 py-3 text-xs text-destructive">
                        {translateAPIRequestError(projectMembersQuery.error)}
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
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(t('admin.projects.confirmRemoveMember'))) {
                                removeProjectMember.mutate({ projectId: memberDialog.ID, memberId: member.ID })
                              }
                            }}
                            disabled={removeProjectMember.isPending}
                            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
                            title={t('admin.projects.removeMember')}
                            aria-label={t('admin.projects.removeMember')}
                          >
                            <Trash2 size={13} />
                          </button>
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
              <div>
                <Label className="text-xs text-muted-foreground block mb-1">{t('admin.projects.status')}</Label>
                <select
                  value={createProjectStatus}
                  onChange={(event) => setCreateProjectStatus(event.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {projectStatuses.map((status) => (
                    <option key={status} value={status}>{t(`admin.projects.statuses.${status}`, { defaultValue: status })}</option>
                  ))}
                </select>
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
              <div>
                <Label className="text-xs text-muted-foreground block mb-1">{t('admin.projects.status')}</Label>
                <select
                  value={editProjectStatus}
                  onChange={(event) => setEditProjectStatus(event.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {projectStatuses.map((status) => (
                    <option key={status} value={status}>{t(`admin.projects.statuses.${status}`, { defaultValue: status })}</option>
                  ))}
                </select>
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
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
      {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
    </div>
  )
}

// ── Tab 4: 功能模型配置 ────────────────────────────────────────────────────────

const CAPABILITY_TRANSLATION_KEYS: Record<string, string> = {
  text: 'admin.capabilities.text',
  reasoning: 'admin.capabilities.reasoning',
  image: 'admin.capabilities.image',
  image_edit: 'admin.capabilities.imageEdit',
  video: 'admin.capabilities.video',
  video_i2v: 'admin.capabilities.videoI2V',
  video_v2v: 'admin.capabilities.videoV2V',
}
const CAPABILITY_COLOR: Record<string, string> = {
  text: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  reasoning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  image: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  image_edit: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  video: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
}

function FeatureRow({
  feature,
  onUpdate,
  onUpdatePrompt,
  onGoToModels,
  isPending,
}: {
  feature: FeatureConfig
  onUpdate: (data: { is_enabled?: boolean; allowed_model_ids?: number[]; default_model_id?: number | null; allowed_roles?: string[] }) => void
  onUpdatePrompt: (data: { system_prompt_override?: string; max_tokens_override?: number }) => void
  onGoToModels: () => void
  isPending: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [showPrompt, setShowPrompt] = useState(false)
  const [promptOverride, setPromptOverride] = useState(feature.system_prompt_override)
  const [maxTokensOverride, setMaxTokensOverride] = useState(() => feature.max_tokens_override > 0 ? String(feature.max_tokens_override) : '')
  const [promptSaved, setPromptSaved] = useState(false)
  // Inline model editing state: modelId → edit form open
  const [editingModelId, setEditingModelId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<{ custom_display_name: string; short_name: string; model_id_override: string; priority: string; capacity_weight: string; max_concurrency: string }>({
    custom_display_name: '', short_name: '', model_id_override: '', priority: '0', capacity_weight: '1', max_concurrency: '0',
  })

  // Query models for this specific feature — backend decides which capabilities are compatible.
  const { data: availableModels = [] } = useQuery<PublicModel[]>({
    queryKey: ['models', 'feature', feature.feature_key, 'provider-variants'],
    queryFn: () => api.get(`/models?feature=${feature.feature_key}&provider_variants=true`).then((r) => r.data),
  })

  const allowed = new Set(feature.allowed_model_ids)
  const parsedMaxTokensOverride = maxTokensOverride.trim() === '' ? 0 : Number(maxTokensOverride)
  const maxTokensOverrideValid = Number.isInteger(parsedMaxTokensOverride) && parsedMaxTokensOverride >= 0

  const patchModel = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      api.patch(`/admin/model-configs/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['models'] })
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      setEditingModelId(null)
    },
  })

  function toggleModel(id: number) {
    const next = new Set(allowed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onUpdate({ allowed_model_ids: Array.from(next) })
  }

  function openEdit(m: PublicModel) {
    setEditingModelId(m.id)
    setEditForm({
      custom_display_name: m.display_name,
      short_name: m.short_name ?? '',
      model_id_override: m.model_id_override ?? '',
      priority: String(m.priority ?? 0),
      capacity_weight: String(m.capacity_weight ?? 1),
      max_concurrency: String(m.max_concurrency ?? 0),
    })
  }

  function saveEdit(id: number) {
    patchModel.mutate({
      id,
      data: {
        custom_display_name: editForm.custom_display_name,
        short_name: editForm.short_name,
        model_id_override: editForm.model_id_override,
        priority: Number(editForm.priority),
        capacity_weight: Math.max(1, parseInt(editForm.capacity_weight, 10) || 1),
        max_concurrency: Math.max(0, parseInt(editForm.max_concurrency, 10) || 0),
      },
    })
  }

  function savePrompt() {
    if (!maxTokensOverrideValid) return
    onUpdatePrompt({
      system_prompt_override: promptOverride,
      max_tokens_override: parsedMaxTokensOverride,
    })
    setPromptSaved(true)
    setTimeout(() => setPromptSaved(false), 2000)
  }

  useEffect(() => {
    setPromptOverride(feature.system_prompt_override)
    setMaxTokensOverride(feature.max_tokens_override > 0 ? String(feature.max_tokens_override) : '')
  }, [feature.feature_key, feature.system_prompt_override, feature.max_tokens_override])

  const effectivePrompt = promptOverride || feature.default_system_prompt
  const hasOverride = promptOverride !== '' && promptOverride !== feature.default_system_prompt
  const isTextCap = feature.capability === 'text' || feature.capability === 'reasoning'

  return (
    <div className="border border-border rounded-lg bg-background overflow-hidden">
      {/* Header row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground">{featureDisplayName(feature, t)}</p>
            <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', CAPABILITY_COLOR[feature.capability] ?? 'bg-muted text-muted-foreground')}>
              {CAPABILITY_TRANSLATION_KEYS[feature.capability] ? t(CAPABILITY_TRANSLATION_KEYS[feature.capability]) : feature.capability}
            </span>
            <span className="text-xs text-muted-foreground font-mono">{feature.feature_key}</span>
            {feature.max_tokens > 0 && (
              <span className="text-xs text-muted-foreground/60">max {feature.max_tokens}t</span>
            )}
          </div>
          {feature.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{featureDescription(feature, t)}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          {isTextCap && (
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              title={t('admin.features.systemPrompt')}
            >
              {showPrompt ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {t('admin.features.prompt')}{hasOverride && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
            </button>
          )}
          <button
            disabled={isPending}
            onClick={() => onUpdate({ is_enabled: !feature.is_enabled })}
            className={cn(
              'text-xs px-2 py-0.5 rounded-full transition-colors',
              feature.is_enabled ? 'bg-muted text-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            {feature.is_enabled ? t('admin.features.enabled') : t('admin.features.disabled')}
          </button>
        </div>
      </div>

      {/* System prompt section — text features only */}
      {isTextCap && showPrompt && (
        <div className="border-t border-border px-4 py-3 bg-card space-y-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              {t('admin.features.defaultSystemPrompt')}
              <span className="ml-1 text-muted-foreground/50 font-normal">{t('admin.features.defaultSystemPromptHint')}</span>
            </p>
            <pre className="text-xs font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap break-all leading-relaxed text-muted-foreground">
              {feature.default_system_prompt || t('admin.features.noSystemPrompt')}
            </pre>
          </div>
          {feature.output_schema && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">{t('admin.features.outputSchema')}</p>
              <pre className="text-xs font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap break-all leading-relaxed text-muted-foreground">
                {feature.output_schema}
              </pre>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              {t('admin.features.customOverride')}
              <span className="ml-1 text-muted-foreground/50 font-normal">{t('admin.features.customOverrideHint')}</span>
            </p>
            <textarea
              value={promptOverride}
              onChange={(e) => setPromptOverride(e.target.value)}
              placeholder={effectivePrompt}
              rows={3}
              className="w-full text-xs font-mono border border-border rounded p-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="mt-2 flex items-end justify-end gap-3">
              <div className="mr-auto max-w-[180px]">
                <Label className="mb-1 block text-xs text-muted-foreground">{t('admin.features.maxTokensOverride')}</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={maxTokensOverride}
                  onChange={(event) => setMaxTokensOverride(event.target.value)}
                  placeholder={feature.max_tokens > 0 ? String(feature.max_tokens) : '0'}
                  className={cn('h-7 text-xs', !maxTokensOverrideValid && 'border-destructive')}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">{t('admin.features.maxTokensOverrideHint')}</p>
              </div>
              <button
                onClick={savePrompt}
                disabled={isPending || !maxTokensOverrideValid}
                className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {promptSaved ? t('admin.features.saved') : t('admin.features.saveOverride')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Model selector */}
      <div className="border-t border-border px-4 py-3 bg-card space-y-2">
        <p className="text-xs text-muted-foreground">
          {t('admin.features.availableModels')}
          <span className="ml-1 text-muted-foreground/60">
            {allowed.size === 0 ? t('admin.features.unrestrictedModelsHint') : t('admin.features.selectedModelsHint', { count: allowed.size })}
          </span>
        </p>
        {availableModels.length === 0 ? (
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground/60">{t('admin.features.noConfiguredModels', { capability: CAPABILITY_TRANSLATION_KEYS[feature.capability] ? t(CAPABILITY_TRANSLATION_KEYS[feature.capability]) : feature.capability })}</p>
            <button
              onClick={onGoToModels}
              className="text-xs text-primary hover:underline"
            >
              {t('admin.features.goToModels')}
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {availableModels.map((m) => (
              <div key={m.id}>
                {/* Model chip row */}
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={isPending}
                    onClick={() => toggleModel(m.id)}
                    className={cn(
                      'flex-1 text-xs px-2.5 py-1 rounded border transition-colors text-left',
                      allowed.has(m.id)
                        ? 'border-ring bg-accent text-foreground font-medium'
                        : 'border-border bg-background text-muted-foreground hover:border-ring/50 hover:text-foreground'
                    )}
                  >
                    {publicModelLabel(m, true)}
                    {m.model_id_override && (
                      <span className="ml-1.5 font-mono text-muted-foreground/50">{m.model_id_override}</span>
                    )}
                    {m.accepts_image_input && (
                      <span className="ml-1.5 text-muted-foreground/50">{t('admin.features.imageInputMark')}</span>
                    )}
                  </button>
                  <button
                    onClick={() => editingModelId === m.id ? setEditingModelId(null) : openEdit(m)}
                    className="text-muted-foreground/40 hover:text-muted-foreground p-1"
                    title={t('admin.features.editModelConfig')}
                  >
                    {editingModelId === m.id ? <X size={12} /> : <Pencil size={12} />}
                  </button>
                </div>

                {/* Inline edit panel */}
                {editingModelId === m.id && (
                  <div className="ml-0 mt-1 border border-border rounded bg-muted/30 p-3 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.params.displayName')}</Label>
                        <Input
                          className="text-xs h-7"
                          value={editForm.custom_display_name}
                          onChange={(e) => setEditForm((f) => ({ ...f, custom_display_name: e.target.value }))}
                          placeholder={t('admin.features.leaveBlankUseModelId')}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.shortName')}</Label>
                        <Input
                          className="text-xs h-7"
                          value={editForm.short_name}
                          onChange={(e) => setEditForm((f) => ({ ...f, short_name: e.target.value }))}
                          placeholder={t('admin.models.shortNamePlaceholder')}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground block mb-0.5">{t('common.modelIdOverride')}</Label>
                        <Input
                          className="text-xs h-7 font-mono"
                          value={editForm.model_id_override}
                          onChange={(e) => setEditForm((f) => ({ ...f, model_id_override: e.target.value }))}
                          placeholder={t('admin.features.modelIdOverridePlaceholder')}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24">
                        <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.features.priority')}</Label>
                        <Input
                          type="number"
                          className="text-xs h-7"
                          value={editForm.priority}
                          onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))}
                        />
                      </div>
                      <div className="w-28">
                        <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.capacityWeight')}</Label>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          className="text-xs h-7"
                          value={editForm.capacity_weight}
                          onChange={(e) => setEditForm((f) => ({ ...f, capacity_weight: e.target.value }))}
                        />
                      </div>
                      <div className="w-32">
                        <Label className="text-xs text-muted-foreground block mb-0.5">{t('admin.models.maxConcurrency')}</Label>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          className="text-xs h-7"
                          value={editForm.max_concurrency}
                          onChange={(e) => setEditForm((f) => ({ ...f, max_concurrency: e.target.value }))}
                        />
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => saveEdit(m.id)}
                          disabled={patchModel.isPending}
                        >
                          {patchModel.isPending ? '…' : t('common.save')}
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingModelId(null)}>
                          {t('common.cancel')}
                        </Button>
                      </div>
                    </div>
                    {patchModel.isError && (
                      <p className="text-xs text-destructive">{translateApiError((patchModel.error as any)?.response?.data)}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Default model selector */}
        {availableModels.length > 0 && (
          <div className="pt-1 border-t border-border/50">
            <p className="text-xs text-muted-foreground mb-1">
              {t('admin.features.defaultModel')}
              <span className="ml-1 text-muted-foreground/50 font-normal">{t('admin.features.defaultModelHint')}</span>
            </p>
            <select
              disabled={isPending}
              value={feature.default_model_id ?? ''}
              onChange={(e) => {
                const val = e.target.value
                onUpdate({ default_model_id: val === '' ? null : Number(val) })
              }}
              className="text-xs border border-border rounded px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">{t('admin.features.autoHighestPriority')}</option>
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {publicModelLabel(m, true)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Allowed roles */}
        <div className="pt-1 border-t border-border/50">
          <p className="text-xs text-muted-foreground mb-1">
            {t('admin.features.accessRoles')}
            <span className="ml-1 text-muted-foreground/50 font-normal">{t('admin.features.accessRolesHint')}</span>
          </p>
          <div className="flex items-center gap-3">
            {(['owner', 'editor', 'viewer'] as const).map((role) => {
              const checked = feature.allowed_roles.includes(role)
              const roleLabel: Record<string, string> = { owner: t('admin.features.roles.owner'), editor: t('admin.features.roles.editor'), viewer: t('admin.features.roles.viewer') }
              return (
                <label key={role} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isPending}
                    onChange={() => {
                      const next = checked
                        ? feature.allowed_roles.filter((r) => r !== role)
                        : [...feature.allowed_roles, role]
                      onUpdate({ allowed_roles: next })
                    }}
                    className="rounded border-border"
                  />
                  <span className="text-xs text-foreground">{roleLabel[role]}</span>
                </label>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export function FeatureConfigPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [featureError, setFeatureError] = useState('')

  const { data: features = [], error: featuresQueryError } = useQuery<FeatureConfig[]>({
    queryKey: ['admin', 'features'],
    queryFn: () => api.get('/admin/features').then((r) => r.data),
  })

  const update = useMutation({
    mutationFn: ({ key, data }: { key: string; data: { is_enabled?: boolean; allowed_model_ids?: number[]; default_model_id?: number | null; allowed_roles?: string[] } }) =>
      api.put(`/admin/features/${key}`, data).then((r) => r.data),
    onMutate: () => setFeatureError(''),
    onSuccess: () => {
      setFeatureError('')
      qc.invalidateQueries({ queryKey: ['admin', 'features'] })
      qc.invalidateQueries({ queryKey: ['models'] })
    },
    onError: (err: any) => setFeatureError(translateAPIRequestError(err)),
  })

  const updatePrompt = useMutation({
    mutationFn: ({ key, data }: { key: string; data: { system_prompt_override?: string; max_tokens_override?: number } }) =>
      api.put(`/admin/features/${key}/prompt`, data).then((r) => r.data),
    onMutate: () => setFeatureError(''),
    onSuccess: () => {
      setFeatureError('')
      qc.invalidateQueries({ queryKey: ['admin', 'features'] })
    },
    onError: (err: any) => setFeatureError(translateAPIRequestError(err)),
  })

  function updateFeature(feature: FeatureConfig, data: AdminFeatureUpdatePayload) {
    const key = featureToggleConfirmKey(feature, data)
    if (key) {
      if (!window.confirm(t(key, { name: featureDisplayName(feature, t) }))) return
    }
    update.mutate({ key: feature.feature_key, data })
  }

  const { toolFeatures, systemFeatures } = groupAdminFeatures(features)
  const featureGroups = [
    { key: 'tool', title: t('admin.features.toolFeatures'), items: toolFeatures },
    { key: 'system', title: t('admin.features.systemFeatures'), items: systemFeatures },
  ].filter((group) => group.items.length > 0)

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t('admin.features.title')}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t('admin.features.description')}
        </p>
      </div>

      {features.length === 0 && !featuresQueryError && (
        <p className="text-sm text-muted-foreground text-center py-8">{t('common.loadingShort')}</p>
      )}

      {featureError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          <span>{featureError}</span>
        </div>
      )}

      {featuresQueryError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          <span>{translateAPIRequestError(featuresQueryError)}</span>
        </div>
      )}

      <div className="space-y-3">
        {featureGroups.map((group) => (
          <div key={group.key} className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{group.title}</p>
            {group.items.map((f) => (
              <FeatureRow
                key={f.feature_key}
                feature={f}
                isPending={update.isPending || updatePrompt.isPending}
                onUpdate={(data) => updateFeature(f, data)}
                onUpdatePrompt={(data) => updatePrompt.mutate({ key: f.feature_key, data })}
                onGoToModels={() => navigateToAdminSection('models')}
              />
            ))}
          </div>
        ))}
        {!featuresQueryError && featureGroups.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">{t('admin.features.empty')}</p>
        )}
      </div>
    </div>
  )
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
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {translateAPIRequestError(storageQueryError)}
        </div>
      )}

      {/* Backend status */}
      <div>
        <h3 className="text-sm font-semibold mb-3">{t('admin.storage.internalBackends')}</h3>
        <div className="flex gap-3 flex-wrap">
          {(backends?.backends ?? []).map(b => (
            <div key={b.name} className="flex items-center gap-2 border border-border rounded-lg px-4 py-2.5 text-sm">
              {b.name === 'local'
                ? <span className="i-lucide-hard-drive text-muted-foreground" />
                : <span className="i-lucide-cloud text-blue-400" />
              }
              <span className="font-medium capitalize">{b.name}</span>
              {b.name === backends?.default && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{t('admin.storage.default')}</span>
              )}
              <span className="text-xs text-green-500">{t('admin.storage.available')}</span>
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
        {resourceError && <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{resourceError}</p>}
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
                      className="text-destructive hover:text-destructive"
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
                <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {translateAPIRequestError(resourceDetailQuery.error)}
                </div>
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
    queryFn: () => api.get('/admin/cloud-file-configs').then(r => r.data),
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
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {cloudFileError || translateAPIRequestError(cloudConfigsQueryError)}
        </div>
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
                      ? <span className="text-xs text-green-500">{t('admin.cloudFiles.enabledMark')}</span>
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
                  <button onClick={() => deleteCfg(cfg.ID)} className="text-xs border border-destructive/30 rounded px-2 py-1 text-destructive/70 hover:text-destructive transition-colors">{t('common.delete')}</button>
                </div>
              </div>
              {testResult && (
                <div className={cn(
                  'border-t border-border px-4 py-2 text-xs',
                  testResult.success ? 'bg-green-500/5 text-green-700 dark:text-green-400' : 'bg-destructive/5 text-destructive',
                )}>
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
                </div>
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
                  {f.required && <span className="ml-0.5 text-destructive">*</span>}
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

type AdminSectionKey = 'models' | 'features' | 'users' | 'orgs' | 'projects' | 'audit-logs' | 'usage-logs' | 'storage' | 'cloud-files' | 'debug'

const adminSectionHref: Record<AdminSectionKey, string> = {
  models: '/models',
  features: '/features',
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
  models: { credentials: number; enabled_credentials: number; configs: number; enabled_configs: number }
  jobs: { total: number; pending: number; running: number; succeeded: number; failed: number; cancelled: number }
  usage: { records: number; cost_7d: number; cost_30d: number }
  resources: { total: number; bytes: number }
  audits: { total: number }
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

export default function AdminPage() {
  const { t } = useTranslation()
  const currentUser = useUserStore((s) => s.currentUser)
  const navigate = useNavigate()

  const { data: overview } = useQuery<AdminOverviewSummary>({
    queryKey: ['admin', 'overview'],
    queryFn: () => api.get('/admin/overview').then((r) => r.data),
    refetchInterval: 30000,
  })

  const queuedJobs = (overview?.jobs.pending ?? 0) + (overview?.jobs.running ?? 0)
  const jobMonitorHref = `/debug?${jobUrlSearchParams(emptyJobMonitorFilters, 1).toString()}`
  const usage7dHref = usageLogsHref({ since: relativePastDateInput(7) })

  const overviewCards = [
    {
      label: t('admin.home.metrics.enabledModels'),
      value: formatAdminNumber(overview?.models.enabled_configs),
      detail: t('admin.home.metrics.credentials', { count: formatAdminNumber(overview?.models.credentials) }),
      icon: Settings2,
      href: '/models',
    },
    {
      label: t('admin.home.metrics.projects'),
      value: formatAdminNumber(overview?.projects.total),
      detail: t('admin.home.metrics.usersAndOrgs', { users: formatAdminNumber(overview?.users.total), orgs: formatAdminNumber(overview?.orgs.total) }),
      icon: FolderKanban,
      href: '/projects',
    },
    {
      label: t('admin.home.metrics.queuedJobs'),
      value: formatAdminNumber(queuedJobs),
      detail: t('admin.home.metrics.failedJobs', { count: formatAdminNumber(overview?.jobs.failed) }),
      icon: Sparkles,
      href: jobMonitorHref,
    },
    {
      label: t('admin.home.metrics.usage7d'),
      value: formatAdminCredits(overview?.usage.cost_7d),
      detail: t('admin.home.metrics.usage30d', { cost: formatAdminCredits(overview?.usage.cost_30d) }),
      icon: BarChart3,
      href: usage7dHref,
    },
    {
      label: t('admin.home.metrics.storage'),
      value: formatAdminBytes(overview?.resources.bytes),
      detail: t('admin.home.metrics.resourceFiles', { count: formatAdminNumber(overview?.resources.total) }),
      icon: HardDrive,
      href: '/storage',
    },
    ...runtimeOverviewCards,
  ]

  const sectionCards = [
    { label: t('admin.tabs.models'), detail: t('admin.home.sections.models'), icon: Settings2, href: '/models' },
    { label: t('admin.tabs.features'), detail: t('admin.home.sections.features'), icon: Route, href: '/features' },
    { label: t('admin.tabs.users'), detail: t('admin.home.sections.users'), icon: UsersRound, href: '/user-management' },
    { label: t('admin.tabs.orgs'), detail: t('admin.home.sections.orgs'), icon: Building2, href: '/orgs' },
    { label: t('admin.tabs.projects'), detail: t('admin.home.sections.projects', { count: formatAdminNumber(overview?.projects.total) }), icon: FolderKanban, href: '/projects' },
    { label: t('admin.tabs.auditLogs'), detail: t('admin.home.sections.auditLogs', { count: formatAdminNumber(overview?.audits.total) }), icon: ScrollText, href: '/audit-logs' },
    { label: t('admin.tabs.logs'), detail: t('admin.home.sections.usageLogs', { count: formatAdminNumber(overview?.usage.records) }), icon: BarChart3, href: '/usage-logs' },
    { label: t('admin.tabs.storage'), detail: t('admin.home.sections.storage', { count: formatAdminNumber(overview?.resources.total) }), icon: HardDrive, href: '/storage' },
    { label: t('admin.tabs.cloudFiles'), detail: t('admin.home.sections.cloudFiles'), icon: CloudUpload, href: '/cloud-files' },
    { label: t('admin.tabs.debug'), detail: t('admin.home.sections.debug'), icon: Bug, href: '/debug?tab=system' },
    ...runtimeSectionCards,
  ]

  if (currentUser?.system_role !== 'super_admin') {
    navigate('/projects', { replace: true })
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldAlert size={18} className="text-muted-foreground" />
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t('admin.title')}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t('admin.subtitle')}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((card) => (
          <Link key={card.label} to={card.href} className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-ring/70">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <card.icon size={18} />
              </div>
              <ArrowUpRight size={15} className="text-muted-foreground transition-colors group-hover:text-foreground" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{card.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
          </Link>
        ))}
      </div>

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
