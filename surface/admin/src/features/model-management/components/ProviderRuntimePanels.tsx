import { api } from '@admin/lib/api'
import { translateAPIRequestError } from '@admin/lib/apiError'
import { cn } from '@admin/lib/utils'
import type { AIProvider, ProviderInstance, ProviderInstanceConfigActivationResult, ProviderInstanceConfigApplyResult, ProviderInstanceConfigDraft } from '@admin/types'
import { AppFeedbackText, AppInlineError, AppRequiredMark, AppStatusSurface } from '@movscript/ui/business/app'
import { Button, Input, Label, StatusBadge, type StatusBadgeProps } from '@movscript/ui/primitives'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CloudUpload, RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  diagnosticCodesFromUnknown,
  emptyProviderAssetSettings,
  parseJSONRecord,
  recordFromUnknown,
  stringListFromUnknown,
  type ProviderAssetSettings,
  type RuntimeProviderHealth
} from '../model/modelManagementModel'

export function ProviderInstanceConfigDraftPanel({ instance }: { instance: ProviderInstance }) {
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

export function ProviderAssetLibrarySettingsPanel({
  providerKind,
  form,
  isSaving,
  isSaved,
  error,
  onPatch,
  onSubmit,
}: {
  providerKind: string
  form: ProviderAssetSettings
  isSaving: boolean
  isSaved: boolean
  error: unknown
  onPatch: (patch: Partial<ProviderAssetSettings>) => void
  onSubmit: () => void
}) {
  const { t } = useTranslation()
  const isGateway = providerKind === 'yunwu_gateway'
  const gatewayReady = Boolean(form.gateway_base_url && form.gateway_token_set)
  const arkReady = Boolean(form.ark_access_key_id && form.ark_secret_key_set)
  return (
    <div className="rounded border border-border/70 bg-card px-2 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-foreground">{isGateway ? '云雾私域人像库' : '火山素材库 API'}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {isGateway ? '直接复用该 Provider 的 Base URL 和 API Key；无需额外配置素材库网关。' : '仅保存该 Provider 的 Ark OpenAPI 凭证和自动创建的素材组。'}
          </p>
        </div>
        <StatusBadge intent={(isGateway ? gatewayReady : arkReady) ? 'success' : 'warning'} className="text-[11px]">
          {isGateway ? (gatewayReady ? 'Gateway ready' : 'Token missing') : (arkReady ? 'Ark ready' : 'AK/SK missing')}
        </StatusBadge>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {isGateway ? (
          <div className="md:col-span-2 rounded border border-dashed border-border px-2 py-2 text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-mono text-foreground">{form.gateway_base_url || 'https://yunwu.ai'}</span>
            <span> · </span>
            <span>{form.gateway_token_set ? 'Provider API Key ready' : 'Provider API Key missing'}</span>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
      {Boolean(error) && <AppFeedbackText tone="danger">{translateAPIRequestError(error)}</AppFeedbackText>}
      {!isGateway && (
        <div className="mt-2 flex justify-end gap-2">
          {isSaved && <span className="self-center text-xs text-primary">{t('admin.settings.saved')}</span>}
          <Button type="button" size="sm" onClick={onSubmit} disabled={isSaving}>
            {isSaving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      )}
    </div>
  )
}

export function ProviderAssetSettingsField({
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

export function providerSupportsAssetLibrary(provider: AIProvider): boolean {
  return parseJSONRecord(provider.asset_library_state_json).supports_asset_library === true
}

export function providerAssetSettingsFromProviderState(provider: AIProvider): ProviderAssetSettings {
  const settings = recordFromUnknown(parseJSONRecord(provider.asset_library_state_json).settings)
  const source = settings.ark_credentials_source === 'provider' ? 'provider' : 'missing'
  const gatewaySource = settings.gateway_credentials_source === 'provider' || settings.gateway_credentials_source === 'provider_runtime' ? 'provider' : 'missing'
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
    gateway_base_url: gatewaySource === 'provider' && typeof settings.gateway_base_url === 'string' ? settings.gateway_base_url : '',
    gateway_token_set: gatewaySource === 'provider' && settings.gateway_token_set === true,
    gateway_poll_interval_ms: typeof settings.gateway_poll_interval_ms === 'number' ? settings.gateway_poll_interval_ms : emptyProviderAssetSettings.gateway_poll_interval_ms,
    gateway_poll_max_ms: typeof settings.gateway_poll_max_ms === 'number' ? settings.gateway_poll_max_ms : emptyProviderAssetSettings.gateway_poll_max_ms,
  }
}

export function ProviderRuntimeStateSummary({ provider }: { provider: AIProvider }) {
  const { t } = useTranslation()
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
  const gatewayReady = assetSettings.gateway_base_url_set === true && assetSettings.gateway_token_set === true
  const configItems = provider.provider_kind === 'yunwu_gateway'
    ? [
      { label: t('admin.settings.providerRuntime.publicResourceAccess'), ok: assetSettings.public_base_url_set === true },
      { label: t('admin.settings.providerRuntime.signedAccess'), ok: assetSettings.signing_secret_set === true },
      { label: t('admin.settings.providerRuntime.gatewayToken'), ok: gatewayReady },
    ]
    : [
      { label: t('admin.settings.providerRuntime.publicResourceAccess'), ok: assetSettings.public_base_url_set === true },
      { label: t('admin.settings.providerRuntime.signedAccess'), ok: assetSettings.signing_secret_set === true },
      { label: t('admin.settings.providerRuntime.arkCredentials'), ok: arkKeyReady },
      { label: t('admin.settings.providerRuntime.globalGroup'), ok: globalGroup.configured === true },
    ]
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <ProviderRuntimeStatePane
        icon={<CloudUpload size={14} />}
        title={t('admin.settings.providerRuntime.assetLibrary')}
        badge={assetSupported ? t('admin.settings.providerRuntime.assetReady') : t('admin.settings.providerRuntime.unsupported')}
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
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t('admin.settings.providerRuntime.assetUnsupportedHint')}</p>
        )}
      </ProviderRuntimeStatePane>
      <ProviderRuntimeStatePane
        icon={<Sparkles size={14} />}
        title={t('admin.settings.providerRuntime.originalArtifactTrust')}
        badge={trustSupported ? t('admin.settings.providerRuntime.sameProvider') : t('admin.settings.providerRuntime.unsupported')}
        badgeIntent={trustSupported ? 'success' : 'neutral'}
      >
        {trustSupported ? (
          <>
            <p className="truncate text-[11px] text-muted-foreground">
              {trustState.requires_original_artifact === true
                ? t('admin.settings.providerRuntime.originalOnly')
                : t('admin.settings.providerRuntime.derivedAllowed')} · {String(trustState.scope || t('admin.settings.providerRuntime.providerScope'))}
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
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t('admin.settings.providerRuntime.trustUnsupportedHint')}</p>
        )}
      </ProviderRuntimeStatePane>
    </div>
  )
}

export function ProviderRuntimeStatePane({
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

export function RuntimeModelHealthSection({
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

export function runtimeHealthRank(item: RuntimeProviderHealth) {
  if (!item.is_enabled) return 4
  if (item.circuit_open) return 3
  if (item.saturated) return 2
  if (item.failures > 0) return 1
  return 0
}

export function runtimeHealthKey(item: RuntimeProviderHealth) {
  if (item.route_binding_id) return `route:${item.route_binding_id}`
  if (item.catalog_entry_id) return `catalog:${item.catalog_entry_id}:${item.provider_name}:${item.adapter_type}`
  return [item.provider_name, item.adapter_type, item.model_id || item.model_def_id].join(':')
}

export function runtimeHealthState(item: RuntimeProviderHealth, t: (key: string, options?: Record<string, unknown>) => string): {
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

export function formatFailureRate(value: number) {
  return `${Math.round((Number.isFinite(value) ? value : 0) * 1000) / 10}%`
}

export function formatRuntimeCooldown(ms: number) {
  if (ms <= 0) return '0s'
  return `${Math.ceil(ms / 1000)}s`
}
