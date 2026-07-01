import { translateAPIRequestError } from '@admin/lib/apiError'
import { cn } from '@admin/lib/utils'
import type { AIModelCatalogEntry, AIModelCatalogTemplate, AIModelRouteBinding, AIModelRouteDiagnoseRequest, AIModelRouteDiagnosis, AdapterDef } from '@admin/types'
import { AppFeedbackText, AppInlineError } from '@movscript/ui/business/app'
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, StatusBadge, type StatusBadgeProps } from '@movscript/ui/primitives'
import { useMutation } from '@tanstack/react-query'
import { Bug, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CAPABILITY_STATUS_INTENT,
  CAPABILITY_TRANSLATION_KEYS,
  adapterDisplayName,
  catalogEntryLabel,
  catalogRouteFormFromBinding,
  modelCatalogCapabilities,
  providerOptionLabel,
  routeBindingProviderLabel,
  routeGroupActivePool,
  routeGroupDisplayName,
  routeGroupFallbackPriorities,
  routeProviderAdapterLabel,
  routeProviderAdapterValue,
  routeProviderForBinding,
  runtimeHealthState,
  shouldReplaceRouteProviderModelID,
  sortRouteBindings,
  structuredCapabilityOperations,
  type CatalogRouteForm,
  type ModelRouteGroup,
  type RouteProviderOption,
  type RuntimeProviderHealth
} from '../model/modelManagementModel'

export function RoutePoolDetailDialog({
  group,
  routeProviders,
  adapters,
  runtimeHealthItems,
  runtimeHealthLoading,
  runtimeHealthFetching,
  runtimeHealthError,
  busy,
  onClose,
  onRefreshHealth,
  onAddCandidate,
  onEditBinding,
  onDeleteBinding,
  onDiagnose,
}: {
  group: ModelRouteGroup | null
  routeProviders: RouteProviderOption[]
  adapters: AdapterDef[]
  runtimeHealthItems: RuntimeProviderHealth[]
  runtimeHealthLoading: boolean
  runtimeHealthFetching: boolean
  runtimeHealthError: unknown
  busy: boolean
  onClose: () => void
  onRefreshHealth: () => void
  onAddCandidate: (entryId: number, routeGroup: string) => void
  onEditBinding: (entryId: number, binding: AIModelRouteBinding) => void
  onDeleteBinding: (entryId: number, bindingId: number) => void
  onDiagnose: (group: ModelRouteGroup) => void
}) {
  const { t } = useTranslation()
  if (!group) return null

  const routeProviderByID = new Map(routeProviders.map((provider) => [provider.provider_id, provider]))
  const routeHealthByID = new Map(runtimeHealthItems
    .filter((item) => item.route_binding_id)
    .map((item) => [item.route_binding_id!, item]))
  const sortedBindings = sortRouteBindings(group.bindings)
  const activePool = routeGroupActivePool(sortedBindings)
  const fallbackPriorities = routeGroupFallbackPriorities(sortedBindings)

  return (
    <Dialog open onOpenChange={(nextOpen) => {
      if (!nextOpen) onClose()
    }}>
      <DialogContent closeLabel={t('common.close')} className="max-h-[calc(100vh-32px)] w-[980px] max-w-[calc(100vw-32px)] overflow-y-auto p-0">
        <DialogHeader className="border-b border-border px-5 py-4 pr-14">
          <DialogTitle>{t('admin.models.routeTableTitle', { defaultValue: '路由表' })}</DialogTitle>
          <DialogDescription>
            {group.entry.public_model_id} · {routeGroupDisplayName(group.routeGroup, t)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{catalogEntryLabel(group.entry)}</p>
                    <StatusBadge intent={group.entry.is_enabled ? 'success' : 'neutral'}>
                      {group.entry.is_enabled ? t('admin.modelCatalog.enabled') : t('admin.modelCatalog.disabled')}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{group.entry.public_model_id}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => onDiagnose(group)}>
                    <Bug size={13} className="mr-1.5" />
                    {t('admin.models.routeDiagnoseTitle', { defaultValue: 'Route 诊断' })}
                  </Button>
                  <Button type="button" size="sm" onClick={() => onAddCandidate(group.entry.ID, group.routeGroup)}>
                    <Plus size={13} className="mr-1.5" />
                    {t('admin.models.addRouteCandidate', { defaultValue: '新增候选' })}
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {modelCatalogCapabilities(group.entry).map((capability) => (
                  <StatusBadge key={capability} intent={CAPABILITY_STATUS_INTENT[capability] ?? 'neutral'} className="text-xs">
                    {t(CAPABILITY_TRANSLATION_KEYS[capability] ?? capability)}
                  </StatusBadge>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4 text-xs">
              {activePool ? (
                <>
                  <p className="font-medium text-foreground">{t('admin.models.routeMatrixActivePool', { defaultValue: '当前运行池' })}</p>
                  <p className="mt-1 text-muted-foreground">
                    {t('admin.models.routeMatrixPriorityPool', { defaultValue: '优先级 {{priority}} · {{count}} 个候选', priority: activePool.priority, count: activePool.count })}
                  </p>
                  {fallbackPriorities.length > 0 && (
                    <p className="mt-1 text-muted-foreground">
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
          </div>

          <div className="rounded-lg border border-border bg-background">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{t('admin.models.routeCandidatesTitle', { defaultValue: '候选路由' })}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {sortedBindings.length} routes · {adapters.length} adapters
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={onRefreshHealth} disabled={runtimeHealthFetching}>
                <RefreshCw size={13} className={cn('mr-1.5', runtimeHealthFetching && 'animate-spin')} />
                {t('admin.models.runtimeHealthRefresh')}
              </Button>
            </div>
            {runtimeHealthError ? <AppFeedbackText as="div" className="px-4 py-3">{translateAPIRequestError(runtimeHealthError)}</AppFeedbackText> : null}
            {sortedBindings.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">{t('admin.models.routeMatrixNoCandidates', { defaultValue: '这个 model+group 还没有候选 provider。' })}</p>
                <Button type="button" size="sm" className="mt-3" onClick={() => onAddCandidate(group.entry.ID, group.routeGroup)}>
                  <Plus size={13} className="mr-1.5" />
                  {t('admin.modelCatalog.addRoute')}
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {sortedBindings.map((binding) => {
                  const provider = routeProviderForBinding(binding, routeProviderByID)
                  const health = routeHealthByID.get(binding.ID)
                  const healthState = health ? runtimeHealthState(health, t) : null
                  return (
                    <div key={binding.ID} className="grid gap-3 px-4 py-3 text-xs lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_180px_auto]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium text-foreground">{routeBindingProviderLabel(binding, provider, t)}</p>
                          <StatusBadge intent={binding.is_enabled ? 'success' : 'neutral'} className="text-[11px]">
                            {binding.is_enabled ? t('admin.modelCatalog.enabled') : t('admin.modelCatalog.disabled')}
                          </StatusBadge>
                          {healthState && (
                            <StatusBadge {...healthState.statusProps} className="text-[11px]">
                              {healthState.label}
                            </StatusBadge>
                          )}
                          {runtimeHealthLoading && <StatusBadge intent="neutral" className="text-[11px]">{t('common.loading')}</StatusBadge>}
                        </div>
                        <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{binding.provider_id || binding.source_type || '-'}</p>
                        <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                          adapter: {binding.adapter_type || routeProviderAdapterLabel(provider)}
                        </p>
                      </div>
                      <div className="min-w-0 rounded border border-border bg-card px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                        <span className="text-foreground">{group.entry.public_model_id}</span>
                        <span className="px-1.5">=&gt;</span>
                        <span className="text-foreground">{binding.provider_model_id || group.entry.public_model_id}</span>
                      </div>
                      <div className="grid gap-1 text-muted-foreground">
                        <span>{t('admin.models.priority')}: {binding.priority ?? 0}</span>
                        <span>{t('admin.models.capacityWeight')}: {binding.capacity_weight ?? 1}</span>
                        <span>{t('admin.models.maxConcurrency')}: {binding.max_concurrency > 0 ? binding.max_concurrency : t('admin.models.runtimeHealthUnlimited')}</span>
                      </div>
                      <div className="flex items-start justify-end gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => onEditBinding(group.entry.ID, binding)}>
                          {t('admin.models.routeParamsAction', { defaultValue: '参数' })}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          intent="danger"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(t('admin.models.confirmDeleteRouteBinding', { defaultValue: '确定删除这条路由？' }))) {
                              onDeleteBinding(group.entry.ID, binding.ID)
                            }
                          }}
                        >
                          {t('common.delete')}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function RouteBindingFormDialog({
  open,
  mode,
  activeEntry,
  entries,
  routeForm,
  setRouteForm,
  routeProviders,
  enabledRouteProviders,
  routeAdapterOptions,
  selectedRouteProvider,
  routeTemplateSuggestion,
  routeError,
  canSaveRoute,
  isSaving,
  onClose,
  onEntryChange,
  onSave,
}: {
  open: boolean
  mode: 'create' | 'edit'
  activeEntry: AIModelCatalogEntry | null
  entries: AIModelCatalogEntry[]
  routeForm: CatalogRouteForm
  setRouteForm: (form: CatalogRouteForm) => void
  routeProviders: RouteProviderOption[]
  enabledRouteProviders: RouteProviderOption[]
  routeAdapterOptions: AdapterDef[]
  selectedRouteProvider?: RouteProviderOption
  routeTemplateSuggestion: AIModelCatalogTemplate | null
  routeError: string
  canSaveRoute: boolean
  isSaving: boolean
  onClose: () => void
  onEntryChange: (entryId: number) => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const routeProviderChoices = routeForm.provider_id && !enabledRouteProviders.some((provider) => provider.provider_id === routeForm.provider_id)
    ? [...enabledRouteProviders, ...routeProviders.filter((provider) => provider.provider_id === routeForm.provider_id)]
    : enabledRouteProviders

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) onClose()
    }}>
      <DialogContent closeLabel={t('common.close')} className="max-h-[calc(100vh-32px)] w-[1120px] max-w-[calc(100vw-32px)] overflow-y-auto p-0">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSave()
          }}
        >
          <DialogHeader className="border-b border-border px-5 py-4 pr-14">
            <DialogTitle>
              {mode === 'edit'
                ? t('admin.models.editRouteBindingTitle', { defaultValue: '编辑 Route Binding' })
                : t('admin.models.createRouteBindingTitle', { defaultValue: '新增 Route Binding' })}
            </DialogTitle>
            <DialogDescription>
              {t('admin.models.createRouteBindingHint', { defaultValue: '把 Public Model ID 映射到一个 Provider 通道和实际 provider model id。' })}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_430px]">
            {routeError && <div className="xl:col-span-2"><AppInlineError>{routeError}</AppInlineError></div>}
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="mb-3 text-xs font-medium text-muted-foreground">{t('admin.models.routeBasicInfo', { defaultValue: '基础信息' })}</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block text-xs text-muted-foreground">
                    {t('admin.modelCatalog.publicModelId')}
                    <select
                      value={activeEntry?.ID ?? ''}
                      onChange={(event) => onEntryChange(Number(event.target.value))}
                      className="mt-1 h-8 w-full rounded-md border border-input bg-card px-2 text-xs"
                      disabled={mode === 'edit'}
                    >
                      {entries.map((entry) => (
                        <option key={entry.ID} value={entry.ID}>{entry.public_model_id} · {catalogEntryLabel(entry)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-muted-foreground">
                    {t('admin.modelCatalog.routeGroup', { defaultValue: '路由组' })}
                    <Input
                      value={routeForm.route_group}
                      onChange={(event) => setRouteForm({ ...routeForm, route_group: event.target.value })}
                      placeholder={t('admin.models.defaultRouteGroupPlaceholder', { defaultValue: '留空为默认分组' })}
                      className="mt-1 h-8 text-xs"
                    />
                  </label>
                  <label className="block text-xs text-muted-foreground">
                    {t('admin.models.providerLane', { defaultValue: 'Provider 通道' })}
                    <select
                      value={routeForm.provider_id}
                      onChange={(event) => {
                        const providerID = event.target.value
                        const providerModelID = routeTemplateSuggestion?.model_id ?? ''
                        const routeTemplateCandidates = routeTemplateSuggestion ? [routeTemplateSuggestion] : []
                        setRouteForm({
                          ...routeForm,
                          provider_id: providerID,
                          adapter_type: routeProviderAdapterValue(routeProviders.find((provider) => provider.provider_id === providerID)),
                          provider_model_id: shouldReplaceRouteProviderModelID(routeForm.provider_model_id, activeEntry, routeTemplateCandidates)
                            ? providerModelID || activeEntry?.public_model_id || ''
                            : routeForm.provider_model_id,
                        })
                      }}
                      className="mt-1 h-8 w-full rounded-md border border-input bg-card px-2 text-xs"
                    >
                      <option value="">{t('admin.modelCatalog.pickProvider', { defaultValue: '选择 Provider' })}</option>
                      {routeProviderChoices.map((provider) => <option key={provider.provider_id} value={provider.provider_id}>{providerOptionLabel(provider)}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs text-muted-foreground">
                    {t('admin.models.adapter', { defaultValue: 'Adapter' })}
                    <select
                      value={routeForm.adapter_type}
                      onChange={(event) => setRouteForm({ ...routeForm, adapter_type: event.target.value })}
                      className="mt-1 h-8 w-full rounded-md border border-input bg-card px-2 font-mono text-xs"
                    >
                      <option value="">{selectedRouteProvider ? routeProviderAdapterLabel(selectedRouteProvider) : t('admin.models.useProviderDefaultAdapter', { defaultValue: '使用 Provider 默认 Adapter' })}</option>
                      {routeAdapterOptions.map((adapter) => (
                        <option key={adapter.adapter_type} value={adapter.adapter_type}>
                          {adapterDisplayName(adapter, t)} · {adapter.adapter_type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-muted-foreground md:col-span-2">
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
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <div className="mb-3 text-xs font-medium text-muted-foreground">{t('admin.models.routeSchedulingTitle', { defaultValue: '调度参数' })}</div>
                <div className="grid gap-3 sm:grid-cols-3">
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
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="mb-3">
                  <div className="text-xs font-medium text-muted-foreground">
                    {t('admin.models.routeRuntimeDetails', { defaultValue: '运行时入口细节' })}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {t('admin.models.routeRuntimeDetailsHint', { defaultValue: '一般保持默认；只有上游 Provider 入口或 adapter 操作方式不同才需要覆盖。' })}
                  </p>
                </div>
                <div className="grid gap-3">
                  <label className="block text-xs text-muted-foreground">
                    {t('admin.models.endpointMode', { defaultValue: '入口 URL 合成方式' })}
                    <select
                      value={routeForm.endpoint_mode}
                      onChange={(event) => setRouteForm({ ...routeForm, endpoint_mode: event.target.value })}
                      className="mt-1 h-8 w-full rounded-md border border-input bg-card px-2 text-xs"
                    >
                      <option value="inherit">跟随 Provider 默认地址</option>
                      <option value="replace_path">替换 Provider 路径</option>
                      <option value="absolute">追加为 Route 专属入口</option>
                    </select>
                  </label>
                  <label className="block text-xs text-muted-foreground">
                    {t('admin.models.endpointBaseUrl', { defaultValue: 'Endpoint Base URL' })}
                    <Input value={routeForm.endpoint_base_url} onChange={(event) => setRouteForm({ ...routeForm, endpoint_base_url: event.target.value })} placeholder="留空使用 Provider Base URL" className="mt-1 h-8 text-xs font-mono" />
                  </label>
                  <label className="block text-xs text-muted-foreground">
                    {t('admin.models.endpointPathPrefix', { defaultValue: 'Path Prefix' })}
                    <Input value={routeForm.endpoint_path_prefix} onChange={(event) => setRouteForm({ ...routeForm, endpoint_path_prefix: event.target.value })} placeholder="/v1" className="mt-1 h-8 text-xs font-mono" />
                  </label>
                </div>
              </div>
            </aside>
          </div>

          <DialogFooter className="sticky bottom-0 border-t border-border bg-card/95 px-5 py-4 backdrop-blur">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!canSaveRoute || isSaving || entries.length === 0}>
              {isSaving ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function RouteDiagnosisDialog({
  open,
  activeEntry,
  routeDiagnoseCapability,
  setRouteDiagnoseCapability,
  routeDiagnoseOperation,
  setRouteDiagnoseOperation,
  routeDiagnoseGroup,
  setRouteDiagnoseGroup,
  routeDiagnoseAssets,
  setRouteDiagnoseAssets,
  routeDiagnoseCapabilityOptions,
  routeDiagnoseOperationOptions,
  canDiagnoseRoute,
  diagnoseRoute,
  onClose,
  onRun,
}: {
  open: boolean
  activeEntry: AIModelCatalogEntry | null
  routeDiagnoseCapability: string
  setRouteDiagnoseCapability: (value: string) => void
  routeDiagnoseOperation: string
  setRouteDiagnoseOperation: (value: string) => void
  routeDiagnoseGroup: string
  setRouteDiagnoseGroup: (value: string) => void
  routeDiagnoseAssets: string
  setRouteDiagnoseAssets: (value: string) => void
  routeDiagnoseCapabilityOptions: string[]
  routeDiagnoseOperationOptions: string[]
  canDiagnoseRoute: boolean
  diagnoseRoute: ReturnType<typeof useMutation<AIModelRouteDiagnosis>>
  onClose: () => void
  onRun: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) onClose()
    }}>
      <DialogContent closeLabel={t('common.close')} className="max-h-[calc(100vh-32px)] w-[720px] max-w-[calc(100vw-32px)] overflow-y-auto p-0">
        <DialogHeader className="border-b border-border px-5 py-4 pr-14">
          <DialogTitle>{t('admin.models.routeDiagnoseTitle', { defaultValue: 'Route 诊断' })}</DialogTitle>
          <DialogDescription>
            {activeEntry?.public_model_id ?? '-'} · {t('admin.models.routeDiagnoseHint', { defaultValue: '用模型 + 能力 + operation 模拟一次路由选择，查看 selected route、rejected reasons 和 effective endpoint。' })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 p-5">
          <label className="block text-xs text-muted-foreground">
            {t('admin.models.routeDiagnoseCapability', { defaultValue: 'Capability' })}
            <select
              value={routeDiagnoseCapability}
              onChange={(event) => {
                const capability = event.target.value
                const operations = routeDiagnosticOperationOptions(activeEntry, capability)
                setRouteDiagnoseCapability(capability)
                if (operations.length > 0 && !operations.includes(routeDiagnoseOperation)) {
                  setRouteDiagnoseOperation(defaultRouteDiagnoseOperation(capability, operations))
                }
              }}
              className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              disabled={!activeEntry}
            >
              {routeDiagnoseCapabilityOptions.map((capability) => (
                <option key={capability} value={capability}>
                  {t(CAPABILITY_TRANSLATION_KEYS[capability] ?? capability, { defaultValue: capability })}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            {t('admin.models.routeDiagnoseOperation', { defaultValue: 'Operation' })}
            <select
              value={routeDiagnoseOperation}
              onChange={(event) => setRouteDiagnoseOperation(event.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-xs"
              disabled={!activeEntry || routeDiagnoseCapabilityOptions.length === 0}
            >
              {routeDiagnoseOperationOptions.includes(routeDiagnoseOperation) ? null : (
                <option value={routeDiagnoseOperation}>{t(`admin.modelOperations.${routeDiagnoseOperation}`, { defaultValue: routeDiagnoseOperation })}</option>
              )}
              {routeDiagnoseOperationOptions.map((operation) => (
                <option key={operation} value={operation}>{t(`admin.modelOperations.${operation}`, { defaultValue: operation })}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            {t('admin.modelCatalog.routeGroup')}
            <Input
              value={routeDiagnoseGroup}
              onChange={(event) => setRouteDiagnoseGroup(event.target.value)}
              placeholder={t('admin.models.defaultRouteGroupPlaceholder', { defaultValue: '留空为默认分组' })}
              className="mt-1 h-8 text-xs"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            {t('admin.models.routeDiagnoseReferenceAssets', { defaultValue: 'Reference roles' })}
            <textarea
              value={routeDiagnoseAssets}
              onChange={(event) => setRouteDiagnoseAssets(event.target.value)}
              placeholder={'first_frame:image\nlast_frame:image'}
              className="mt-1 min-h-[82px] w-full rounded-md border border-input bg-background px-2 py-2 font-mono text-xs"
            />
          </label>
          {!routeDiagnoseOperation.trim() && (
            <AppFeedbackText>{t('admin.models.routeDiagnoseRequiresOperation', { defaultValue: 'Route 测试必须先选择 operation。' })}</AppFeedbackText>
          )}
          {diagnoseRoute.error && <AppInlineError>{translateAPIRequestError(diagnoseRoute.error)}</AppInlineError>}
          {diagnoseRoute.data && <RouteDiagnosisResult diagnosis={diagnoseRoute.data} />}
        </div>
        <DialogFooter className="sticky bottom-0 border-t border-border bg-card/95 px-5 py-4 backdrop-blur">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={onRun} disabled={!canDiagnoseRoute || diagnoseRoute.isPending}>
            {diagnoseRoute.isPending ? t('common.loading') : t('admin.models.runRouteDiagnose', { defaultValue: '运行诊断' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CommunityRouteBindingEditor({
  binding,
  routeProviders,
  adapters,
  busy,
  compact = false,
  onSave,
  onDelete,
}: {
  binding: AIModelRouteBinding
  routeProviders: RouteProviderOption[]
  adapters: AdapterDef[]
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
      <select
        value={form.adapter_type}
        onChange={(event) => setForm({ ...form, adapter_type: event.target.value })}
        className="h-8 rounded-md border border-input bg-background px-2 font-mono text-[11px]"
      >
        <option value="">{routeProviderAdapterLabel(routeProviders.find((provider) => provider.provider_id === form.provider_id))}</option>
        {adapters.map((adapter) => (
          <option key={adapter.adapter_type} value={adapter.adapter_type}>
            {adapterDisplayName(adapter, t)} · {adapter.adapter_type}
          </option>
        ))}
      </select>
      <Input value={form.provider_model_id} onChange={(event) => setForm({ ...form, provider_model_id: event.target.value })} placeholder="provider model id" className="h-8 text-xs font-mono" />
      <Input value={form.route_group} onChange={(event) => setForm({ ...form, route_group: event.target.value })} placeholder={t('admin.modelCatalog.routeGroup')} className="h-8 text-xs" />
      <div className={cn('grid gap-2 rounded-md border border-border bg-muted/20 p-2', compact ? '' : 'md:col-span-full md:grid-cols-[120px_minmax(180px,1fr)_120px_minmax(180px,1fr)]')}>
        <select
          value={form.endpoint_mode}
          onChange={(event) => setForm({ ...form, endpoint_mode: event.target.value })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          aria-label={t('admin.models.endpointMode', { defaultValue: 'Endpoint Mode' })}
        >
          <option value="inherit">inherit</option>
          <option value="replace_path">replace_path</option>
          <option value="absolute">absolute</option>
        </select>
        <Input value={form.endpoint_base_url} onChange={(event) => setForm({ ...form, endpoint_base_url: event.target.value })} placeholder="endpoint base URL" className="h-8 text-xs font-mono" />
        <Input value={form.endpoint_path_prefix} onChange={(event) => setForm({ ...form, endpoint_path_prefix: event.target.value })} placeholder="/v1" className="h-8 text-xs font-mono" />
      </div>
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

export const ROUTE_DIAGNOSTIC_CAPABILITY_PRESETS = [
  'video_generation',
  'image_generation',
  'audio_generation',
  'text_generation',
]

export const ROUTE_DIAGNOSTIC_OPERATION_PRESETS: Record<string, string[]> = {
  video_generation: [
    'prompt_to_video',
    'image_to_video',
    'first_frame_to_video',
    'first_last_frame_to_video',
    'reference_to_video',
    'edit_video',
    'extend_video',
    'upscale_video',
  ],
  image_generation: [
    'text_to_image',
    'reference_to_image',
    'edit_image',
    'inpaint',
    'outpaint',
    'variation',
    'upscale_image',
  ],
  audio_generation: [
    'text_to_speech',
    'speech_to_text',
    'speech_translate',
    'speech_to_speech',
    'voice_clone',
    'voice_design',
    'dubbing',
    'music_generation',
    'sound_effect_generation',
    'voice_isolation',
    'forced_alignment',
  ],
  text_generation: [
    'chat',
    'responses',
    'agent_task',
  ],
}

export function RouteDiagnosisResult({ diagnosis }: { diagnosis: AIModelRouteDiagnosis }) {
  const { t } = useTranslation()
  const selected = diagnosis.selected_route
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge intent={selected ? 'success' : 'warning'}>
          {selected
            ? t('admin.models.routeDiagnoseSelected', { defaultValue: 'selected route' })
            : t('admin.models.routeDiagnoseNoSelection', { defaultValue: 'no route selected' })}
        </StatusBadge>
        {diagnosis.selected_route_id ? (
          <span className="font-mono text-muted-foreground">#{diagnosis.selected_route_id}</span>
        ) : null}
        <span className="font-mono text-muted-foreground">{diagnosis.capability}:{diagnosis.operation || '-'}</span>
      </div>
      <div className="space-y-2">
        {diagnosis.candidates.map((candidate, index) => (
          <div key={`${candidate.route_binding_id || candidate.public_model_id}:${index}`} className="rounded-md border border-border bg-card p-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge intent={routeDiagnosticStatusIntent(candidate.status)}>{candidate.status}</StatusBadge>
              {candidate.route_binding_id ? <span className="font-mono">route #{candidate.route_binding_id}</span> : null}
              <span className="font-mono text-muted-foreground">{candidate.adapter_type || 'adapter:default'}</span>
            </div>
            <div className="mt-1 grid gap-1 text-[11px] text-muted-foreground">
              <span className="font-mono">provider_model_id: {candidate.provider_model_id || '-'}</span>
              <span className="font-mono">priority: {candidate.priority} · capacity: {candidate.capacity_weight}</span>
              {candidate.effective_endpoint ? (
                <span className="font-mono">
                  effective_endpoint: {candidate.effective_endpoint.effective_base_url || candidate.effective_endpoint.base_url || '-'}
                  {candidate.effective_endpoint.path_prefix || ''}
                </span>
              ) : null}
              {candidate.resource_access?.required ? (
                <span className="font-mono">
                  resource_access: {candidate.resource_access.transport || 'public_url'}
                  {candidate.resource_access.input_media?.length ? `(${candidate.resource_access.input_media.join(',')})` : ''}
                  {candidate.resource_access.depends_on ? ` · depends_on:${candidate.resource_access.depends_on}` : ''}
                </span>
              ) : null}
              {(candidate.reasons ?? []).length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {candidate.reasons!.map((reason) => (
                    <Badge key={reason} variant="outline" className="font-mono text-[10px]">{reason}</Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function routeDiagnosticStatusIntent(status: string): StatusBadgeProps['intent'] {
  switch (status) {
    case 'selected':
      return 'success'
    case 'accepted':
      return 'warning'
    case 'rejected':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function routeDiagnosticCapabilityOptions(entry: AIModelCatalogEntry | null): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (value: string) => {
    const next = value.trim()
    if (!next || seen.has(next)) return
    seen.add(next)
    out.push(next)
  }
  if (entry) modelCatalogCapabilities(entry).forEach(add)
  ROUTE_DIAGNOSTIC_CAPABILITY_PRESETS.forEach(add)
  return out
}

export function routeDiagnosticOperationOptions(entry: AIModelCatalogEntry | null, capability: string): string[] {
  const structured = structuredCapabilityOperations(entry?.model_capabilities_json, capability)
  if (structured.length > 0) return structured
  return ROUTE_DIAGNOSTIC_OPERATION_PRESETS[capability] ?? ['generate']
}

export function defaultRouteDiagnoseOperation(capability: string, operations: string[]): string {
  const preferred = capability === 'video_generation'
    ? ['first_last_frame_to_video', 'image_to_video', 'prompt_to_video']
    : []
  return preferred.find((operation) => operations.includes(operation)) ?? operations[0] ?? ''
}

export function routeDiagnosePayload(input: {
  entry: AIModelCatalogEntry | null
  capability: string
  operation: string
  routeGroup: string
  referenceAssets: string
}): AIModelRouteDiagnoseRequest {
  const referenceAssets = parseRouteDiagnoseReferenceAssets(input.referenceAssets)
  return {
    public_model_id: input.entry?.public_model_id,
    catalog_entry_id: input.entry?.ID,
    route_group: input.routeGroup.trim(),
    capability: input.capability.trim(),
    operation: input.operation.trim(),
    intent: {
      capability: input.capability.trim(),
      operation: input.operation.trim(),
      reference_assets: referenceAssets,
    },
    reference_assets: referenceAssets,
  }
}

export function parseRouteDiagnoseReferenceAssets(raw: string) {
  return raw.split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [role, mediaType] = line.split(/[:\s]+/, 2)
      return { role: role ?? '', media_type: mediaType ?? '' }
    })
    .filter((item) => item.role || item.media_type)
}
