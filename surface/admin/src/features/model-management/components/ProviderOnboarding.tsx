import { api } from '@admin/lib/api'
import { translateAPIRequestError, translateApiError } from '@admin/lib/apiError'
import { cn } from '@admin/lib/utils'
import type { AIModelImportApplyResult, AIModelImportModelPlan, AIModelImportPreviewResult, AIProviderTemplate, AdapterDef } from '@admin/types'
import { AppFeedbackText, AppInlineError, AppRequiredMark } from '@movscript/ui/business/app'
import { Button, Input, Label, StatusBadge } from '@movscript/ui/primitives'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronDown, RefreshCw, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  adapterDisplayName,
  credentialFieldLabel,
  providerAccountKey,
  providerAccountLabel,
  providerTemplateDefaultAdapter,
  type TestResult
} from '../model/modelManagementModel'

export function ProviderTemplatePicker({
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

export function ProviderModelImportWizard() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [importProviderKind, setImportProviderKind] = useState('openai_compat_gateway')
  const [displayName, setDisplayName] = useState('中转站')
  const [baseURL, setBaseURL] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [routeGroup, setRouteGroup] = useState('default')
  const [preview, setPreview] = useState<AIModelImportPreviewResult | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [result, setResult] = useState<AIModelImportApplyResult | null>(null)
  const [error, setError] = useState('')

  const providerPayload = () => {
    const providerKind = importProviderKind === 'yunwu_gateway'
      ? 'yunwu_gateway'
      : providerKindForImportBaseURL(baseURL)
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
      setSelected(Object.fromEntries(data.models.map((model) => [
        model.provider_model_id,
        data.provider_kind === 'yunwu_gateway'
          ? model.status !== 'route_exists'
          : model.recommended && model.status !== 'route_exists',
      ])))
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
  const canPreview = Boolean(apiKey.trim() && (baseURL.trim() || importProviderKind === 'yunwu_gateway'))
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
          <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5 text-xs">
            {[
              { key: 'openai_compat_gateway', label: 'OpenAI-compatible' },
              { key: 'yunwu_gateway', label: '云雾中转站' },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  setImportProviderKind(option.key)
                  if (option.key === 'yunwu_gateway') {
                    if (!displayName.trim() || displayName.trim() === '中转站') setDisplayName('云雾中转站')
                  } else if (displayName.trim() === '云雾中转站') {
                    setDisplayName('中转站')
                  }
                }}
                className={cn(
                  'rounded px-2.5 py-1 transition-colors',
                  importProviderKind === option.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
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
              <Input
                value={baseURL}
                onChange={(event) => setBaseURL(event.target.value)}
                placeholder={importProviderKind === 'yunwu_gateway' ? '留空使用 https://yunwu.ai/v1' : 'https://gateway.example.com/v1'}
                className="h-8 text-xs font-mono"
              />
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
            {preview && (
              <p className="text-xs text-muted-foreground">
                共 {preview.summary.total} 个，建议导入 {preview.summary.recommended} 个
                {preview.provider_kind === 'yunwu_gateway' ? '；云雾同步会保留缺映射模型并禁用其 route' : ''}
              </p>
            )}
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

export function providerKindForImportBaseURL(baseURL: string): string {
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

export function displayNameForImportProvider(displayName: string, providerKind: string): string {
  const value = displayName.trim()
  if (value && !(value === '中转站' && providerKind === 'apiyi_gateway')) {
    return value
  }
  if (providerKind === 'apiyi_gateway') return 'APIyi 聚合网关'
  return '中转站'
}

export function ModelImportPreviewRow({
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

export function modelImportStatusLabel(status: string): string {
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

export function CredentialForm({
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

