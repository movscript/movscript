import { PaginationControls } from '@admin/components/admin/PaginationControls'
import { credentialToggleConfirmKey, nextCredentialEnabledState } from '@admin/lib/adminActionGuards'
import { modelProviderAccountStartupInstances } from '@admin/lib/adminModelProviderInstances'
import { hasRelayGatewayProviderInstance } from '@admin/lib/adminRelayGatewayMode'
import { adminHref } from '@admin/lib/adminRoutes'
import { api } from '@admin/lib/api'
import { translateAPIRequestError, translateApiError } from '@admin/lib/apiError'
import { readListPayload } from '@admin/lib/listPayload'
import type { AICredential, AIModelCatalogEntry, AIProvider, AIProviderTemplate, AIProviderTemplatesResponse, AIProvidersResponse, AdapterDef, ProviderInstance, ProviderInstancesResponse } from '@admin/types'
import { AppFeedbackText, AppInlineError, AppStatusToggleButton } from '@movscript/ui/business/app'
import { Button, Input, Label, StatusBadge } from '@movscript/ui/primitives'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronRight, CloudUpload, Eye, EyeOff, Pencil, Plus, Settings2, ShieldAlert, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ModelCatalogSection } from '../components/ModelCatalogSection'
import { ModelAdminPageSizeSelect, ModelAdminSearchInput, ModelManagementLayerNav } from '../components/ModelManagementControls'
import { ModelRoutesSection } from '../components/ModelRoutesSection'
import { CredentialForm, ProviderModelImportWizard, ProviderTemplatePicker } from '../components/ProviderOnboarding'
import { ProviderAssetLibrarySettingsPanel, ProviderInstanceConfigDraftPanel, ProviderRuntimeStateSummary } from '../components/ProviderRuntimePanels'
import {
  MODEL_ADMIN_PAGE_SIZE,
  credentialFieldLabel,
  defaultModelManagementViewMode,
  emptyProviderAssetSettings,
  legacyCredentialIDFromProvider,
  modelAdminPaginationSlice,
  modelAdminTextMatches,
  modelManagementRoute,
  providerAssetSettingsFromProviderState,
  providerInstanceReady,
  providerInstanceRef,
  providerSupportsAssetLibrary,
  providerTemplateDefaultAdapter,
  selectableAdminProviderAdapters,
  type ModelManagementViewMode,
  type ModelProviderStatusFilter,
  type ProviderAssetSettings,
  type TestResult
} from '../model/modelManagementModel'

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
  const [providerAssetForms, setProviderAssetForms] = useState<Record<string, ProviderAssetSettings>>({})
  const [providerAssetSavedID, setProviderAssetSavedID] = useState<string | null>(null)
  const [providerAssetSavingID, setProviderAssetSavingID] = useState<string | null>(null)
  const [providerAssetError, setProviderAssetError] = useState<{ providerID: string; error: unknown } | null>(null)
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
  const aiProviders = providersData?.items ?? []
  const providerByLegacyCredentialID = useMemo(() => {
    const mappedProviders = new Map<number, AIProvider>()
    aiProviders.forEach((provider) => {
      const legacyCredentialID = legacyCredentialIDFromProvider(provider)
      if (legacyCredentialID) mappedProviders.set(legacyCredentialID, provider)
    })
    return mappedProviders
  }, [aiProviders])
  const providerTemplates = providerTemplatesData?.items ?? []
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
  const credentialPagination = modelAdminPaginationSlice(filteredCredentials, providerPage, providerPageSize)

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

  const updateProviderAssetLibrarySettings = useMutation({
    mutationFn: ({ providerID, payload }: { providerID: string; payload: ProviderAssetSettings }) =>
      api.put(`/admin/providers/${encodeURIComponent(providerID)}/asset-library`, payload).then((r) => r.data as ProviderAssetSettings),
    onMutate: ({ providerID }) => {
      setModelAdminError('')
      setProviderAssetSavingID(providerID)
      setProviderAssetError(null)
    },
    onSuccess: (updated, { providerID }) => {
      setModelAdminError('')
      setProviderAssetForms((current) => ({
        ...current,
        [providerID]: {
          ...emptyProviderAssetSettings,
          ...updated,
          ark_secret_access_key: '',
          gateway_token: '',
        },
      }))
      setProviderAssetSavedID(providerID)
      qc.invalidateQueries({ queryKey: ['admin', 'providers'] })
      qc.invalidateQueries({ queryKey: ['admin', 'credentials'] })
      qc.invalidateQueries({ queryKey: ['admin', 'provider-instances'] })
      window.setTimeout(() => {
        setProviderAssetSavedID((current) => (current === providerID ? null : current))
      }, 2000)
    },
    onError: (err: any, { providerID }) => {
      setModelAdminError(translateAPIRequestError(err))
      setProviderAssetError({ providerID, error: err })
    },
    onSettled: () => setProviderAssetSavingID(null),
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

  function providerAssetFormFor(provider: AIProvider): ProviderAssetSettings {
    return providerAssetForms[provider.provider_id] ?? providerAssetSettingsFromProviderState(provider)
  }

  function patchProviderAssetLibrarySettings(provider: AIProvider, patch: Partial<ProviderAssetSettings>) {
    setProviderAssetForms((current) => ({
      ...current,
      [provider.provider_id]: {
        ...providerAssetFormFor(provider),
        ...patch,
      },
    }))
  }

  function submitProviderAssetLibrarySettings(provider: AIProvider) {
    const form = providerAssetFormFor(provider)
    const payload: ProviderAssetSettings = {
      ...form,
      ark_openapi_base_url: form.ark_openapi_base_url?.trim() || emptyProviderAssetSettings.ark_openapi_base_url,
      ark_region: form.ark_region?.trim() || emptyProviderAssetSettings.ark_region,
      ark_access_key_id: form.ark_access_key_id?.trim() ?? '',
      gateway_base_url: form.gateway_base_url?.trim() ?? '',
      gateway_poll_interval_ms: form.gateway_poll_interval_ms ?? emptyProviderAssetSettings.gateway_poll_interval_ms,
      gateway_poll_max_ms: form.gateway_poll_max_ms ?? emptyProviderAssetSettings.gateway_poll_max_ms,
    }
    if (!form.ark_secret_access_key?.trim()) delete payload.ark_secret_access_key
    if (!form.gateway_token?.trim()) delete payload.gateway_token
    updateProviderAssetLibrarySettings.mutate({ providerID: provider.provider_id, payload })
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

          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">API账号</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  账号详情保留 Base URL、API Key、连接测试、Files API 和 Provider 能力；模型身份与线路绑定分别在模型/路由页维护。
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{filteredCredentials.length} / {credentials.length}</span>
            </div>
          </div>

          <details className="rounded-lg border border-border bg-card">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">快速接入</summary>
            <div className="space-y-3 border-t border-border p-3">
              <ProviderModelImportWizard />
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
          {credentialPagination.items.map((cred) => {
          const providerInstance = providerInstanceByCredentialId.get(cred.ID)
          const provider = providerByLegacyCredentialID.get(cred.ID)
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

                    {provider && (
                      <div className="border border-border rounded-lg bg-background p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium text-muted-foreground">Provider 能力</p>
                          <span className="truncate font-mono text-[11px] text-muted-foreground">{provider.provider_id}</span>
                        </div>
                        <ProviderRuntimeStateSummary provider={provider} />
                        {providerSupportsAssetLibrary(provider) && (
                          <ProviderAssetLibrarySettingsPanel
                            providerKind={provider.provider_kind}
                            form={providerAssetFormFor(provider)}
                            isSaving={providerAssetSavingID === provider.provider_id}
                            isSaved={providerAssetSavedID === provider.provider_id}
                            error={providerAssetError?.providerID === provider.provider_id ? providerAssetError.error : null}
                            onPatch={(patch) => patchProviderAssetLibrarySettings(provider, patch)}
                            onSubmit={() => submitProviderAssetLibrarySettings(provider)}
                          />
                        )}
                      </div>
                    )}

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

          {filteredCredentials.length > 0 && (
            <PaginationControls
              page={credentialPagination.page}
              pageCount={credentialPagination.pageCount}
              pageSize={providerPageSize}
              total={filteredCredentials.length}
              onPageChange={setProviderPage}
              disabled={Boolean(credentialsQueryError)}
            />
          )}

          {filteredCredentials.length === 0 && addStep === 'idle' && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {credentials.length === 0
                ? (isRelayGatewayMode ? t('admin.models.noRelayGatewayRoutesHint') : t('admin.models.noCredentialsHint'))
                : '没有匹配的 API 账号。'}
            </p>
          )}
        </div>
      )}

      {viewMode === 'catalog' && <ModelCatalogSection credentials={credentials} adapters={adapters} />}

      {viewMode === 'routes' && <ModelRoutesSection credentials={credentials} providers={aiProviders} adapters={adapters} />}
    </div>
  )
}
