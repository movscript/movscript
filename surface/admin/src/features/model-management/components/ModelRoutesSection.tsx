import { PaginationControls } from '@admin/components/admin/PaginationControls'
import { api } from '@admin/lib/api'
import { translateAPIRequestError } from '@admin/lib/apiError'
import { readListPayload } from '@admin/lib/listPayload'
import type { AICredential, AIModelCatalogEntry, AIModelCatalogTemplate, AIModelRouteBinding, AIModelRouteDiagnosis, AIProvider, AdapterDef } from '@admin/types'
import { AppInlineError } from '@movscript/ui/business/app'
import { Button } from '@movscript/ui/primitives'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MODEL_ADMIN_PAGE_SIZE,
  CAPABILITY_TRANSLATION_KEYS,
  adapterTypeForRouteProviderID,
  buildModelRouteGroups,
  catalogRouteFormFromBinding,
  catalogRoutePayload,
  emptyCatalogRouteFormForEntry,
  emptyCatalogRouteForm,
  enabledRouteProviderOptions,
  firstEnabledRouteProviderID,
  matchingCatalogTemplateForRoute,
  modelAdminPaginationSlice,
  modelAdminTextMatches,
  modelCatalogCapabilities,
  routeGroupDisplayName,
  routeGroupFilterOptions,
  routeProviderOptionsFromProviders,
  suggestedProviderModelIDForEntry,
  type CatalogRouteForm,
  type ModelRouteCoverageFilter,
  type ModelRouteGroup,
  type ModelRouteGroupFilter,
  type RuntimeProviderHealthResponse
} from '../model/modelManagementModel'
import { ModelAdminPageSizeSelect, ModelAdminSearchInput } from './ModelManagementControls'
import {
  RouteBindingFormDialog,
  RouteDiagnosisDialog,
  RoutePoolDetailDialog,
  defaultRouteDiagnoseOperation,
  routeDiagnosePayload,
  routeDiagnosticCapabilityOptions,
  routeDiagnosticOperationOptions,
} from './ModelRouteDialogs'
import { ModelRouteMatrix } from './ModelRouteMatrix'

export function ModelRoutesSection({ credentials, providers, adapters }: { credentials: AICredential[]; providers: AIProvider[]; adapters: AdapterDef[] }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [routeFormFor, setRouteFormFor] = useState<number | null>(null)
  const [routeForm, setRouteForm] = useState<CatalogRouteForm>(() => emptyCatalogRouteForm())
  const [routeDialogOpen, setRouteDialogOpen] = useState(false)
  const [editingRouteBinding, setEditingRouteBinding] = useState<AIModelRouteBinding | null>(null)
  const [selectedRouteGroupKey, setSelectedRouteGroupKey] = useState<string | null>(null)
  const [routeDiagnoseDialogOpen, setRouteDiagnoseDialogOpen] = useState(false)
  const [routeError, setRouteError] = useState('')
  const [routeSearch, setRouteSearch] = useState('')
  const [routeCapability, setRouteCapability] = useState('all')
  const [routeGroupFilter, setRouteGroupFilter] = useState<ModelRouteGroupFilter>('all')
  const [routeCoverageFilter, setRouteCoverageFilter] = useState<ModelRouteCoverageFilter>('all')
  const [routePage, setRoutePage] = useState(1)
  const [routePageSize, setRoutePageSize] = useState(MODEL_ADMIN_PAGE_SIZE)
  const [routeDiagnoseCapability, setRouteDiagnoseCapability] = useState('video_generation')
  const [routeDiagnoseOperation, setRouteDiagnoseOperation] = useState('first_last_frame_to_video')
  const [routeDiagnoseGroup, setRouteDiagnoseGroup] = useState('')
  const [routeDiagnoseAssets, setRouteDiagnoseAssets] = useState('first_frame:image\nlast_frame:image')

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
  const routeAdapterOptions = useMemo(() => adapters.filter((adapter) => adapter.adapter_type), [adapters])
  const enabledRouteProviders = useMemo(() => enabledRouteProviderOptions(routeProviders), [routeProviders])
  const selectedEntry = entries.find((entry) => entry.ID === routeFormFor) ?? entries[0]
  const routeGroups = useMemo(() => buildModelRouteGroups(entries), [entries])
  const selectedRouteGroup = useMemo(
    () => routeGroups.find((group) => group.key === selectedRouteGroupKey) ?? null,
    [routeGroups, selectedRouteGroupKey],
  )
  const routeCapabilityOptions = useMemo(
    () => Array.from(new Set(entries.flatMap((entry) => modelCatalogCapabilities(entry)))).sort(),
    [entries],
  )
  const routeGroupOptions = useMemo(() => routeGroupFilterOptions(routeGroups), [routeGroups])
  const filteredRouteEntries = useMemo(() => routeGroups.filter((group) => {
    const bindings = group.bindings
    if (routeGroupFilter !== 'all' && group.routeGroup !== routeGroupFilter) return false
    if (routeCapability !== 'all' && !modelCatalogCapabilities(group.entry).includes(routeCapability)) return false
    if (routeCoverageFilter === 'missing-routes' && bindings.length > 0) return false
    if (routeCoverageFilter === 'disabled-routes' && !bindings.some((binding) => !binding.is_enabled)) return false
    return modelAdminTextMatches(routeSearch, [
      group.entry.public_model_id,
      group.entry.display_name,
      group.entry.short_name,
      group.entry.capabilities,
      group.routeGroup,
      ...bindings.flatMap((binding) => [binding.route_group, binding.provider_id, binding.provider_model_id, binding.adapter_type]),
    ])
  }), [routeGroups, routeGroupFilter, routeCapability, routeCoverageFilter, routeSearch])
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
  }, [routeSearch, routeCapability, routeGroupFilter, routeCoverageFilter, routePageSize])

  useEffect(() => {
    if (routeGroupFilter !== 'all' && !routeGroupOptions.includes(routeGroupFilter)) {
      setRouteGroupFilter('all')
    }
  }, [routeGroupFilter, routeGroupOptions])

  useEffect(() => {
    if (selectedRouteGroupKey && !selectedRouteGroup) {
      setSelectedRouteGroupKey(null)
    }
  }, [selectedRouteGroup, selectedRouteGroupKey])

  function closeRouteForm() {
    setRouteDialogOpen(false)
    setEditingRouteBinding(null)
    setRouteError('')
  }

  const createRouteBinding = useMutation({
    mutationFn: ({ entryId, form }: { entryId: number; form: CatalogRouteForm }) =>
      api.post(`/admin/model-catalog/${entryId}/route-bindings`, catalogRoutePayload(form)).then((r) => r.data),
    onMutate: () => setRouteError(''),
    onSuccess: () => {
      setRouteError('')
      setRouteForm(emptyCatalogRouteFormForEntry(activeEntry, firstEnabledRouteProviderID(routeProviders), activeEntry?.public_model_id ?? ''))
      closeRouteForm()
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
      closeRouteForm()
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

  function openRoutePool(group: ModelRouteGroup) {
    setSelectedRouteGroupKey(group.key)
    setRouteFormFor(group.entry.ID)
  }

  function selectRouteFormEntry(entryId: number) {
    const entry = entries.find((item) => item.ID === entryId)
    const providerID = routeForm.provider_id || firstEnabledRouteProviderID(routeProviders)
    const providerModelID = suggestedProviderModelIDForEntry(entry, catalogTemplates)
    setRouteFormFor(entryId)
    setRouteForm((form) => ({
      ...emptyCatalogRouteFormForEntry(entry, providerID, providerModelID || entry?.public_model_id || '', form.route_group),
      provider_id: providerID,
      adapter_type: adapterTypeForRouteProviderID(providerID, credentials, routeProviders),
    }))
  }

  function openRouteForm(entryId: number, routeGroup = '') {
    const entry = entries.find((item) => item.ID === entryId)
    const providerID = firstEnabledRouteProviderID(routeProviders)
    const providerModelID = suggestedProviderModelIDForEntry(entry, catalogTemplates)
    setRouteError('')
    setEditingRouteBinding(null)
    setRouteFormFor(entryId)
    setRouteForm({
      ...emptyCatalogRouteFormForEntry(entry, providerID, providerModelID || entry?.public_model_id || '', routeGroup),
      provider_id: providerID,
      adapter_type: adapterTypeForRouteProviderID(providerID, credentials, routeProviders),
    })
    setRouteDialogOpen(true)
  }

  function openRouteBindingForm(entryId: number, binding: AIModelRouteBinding) {
    setRouteError('')
    setRouteFormFor(entryId)
    setEditingRouteBinding(binding)
    setRouteForm(catalogRouteFormFromBinding(binding))
    setRouteDialogOpen(true)
  }

  function openRouteDiagnose(group: ModelRouteGroup) {
    const capability = routeDiagnosticCapabilityOptions(group.entry)[0] ?? 'video_generation'
    const operations = routeDiagnosticOperationOptions(group.entry, capability)
    setRouteFormFor(group.entry.ID)
    setRouteDiagnoseGroup(group.routeGroup)
    setRouteDiagnoseCapability(capability)
    setRouteDiagnoseOperation(defaultRouteDiagnoseOperation(capability, operations))
    diagnoseRoute.reset()
    setRouteDiagnoseDialogOpen(true)
  }

  function saveRouteForm() {
    if (!activeEntry) return
    if (editingRouteBinding) {
      updateRouteBinding.mutate({ entryId: activeEntry.ID, bindingId: editingRouteBinding.ID, form: routeForm })
    } else {
      createRouteBinding.mutate({ entryId: activeEntry.ID, form: routeForm })
    }
  }

  const activeEntry = selectedEntry ? selectedEntry : null
  const routeTemplateSuggestion = activeEntry ? matchingCatalogTemplateForRoute(activeEntry, catalogTemplates) : null
  const selectedRouteProvider = routeProviders.find((provider) => provider.provider_id === routeForm.provider_id)
  const canSaveRoute = Boolean(activeEntry && routeForm.provider_id.trim() && routeForm.provider_model_id.trim())
  const routeDiagnoseCapabilityOptions = useMemo(() => routeDiagnosticCapabilityOptions(activeEntry), [activeEntry])
  const routeDiagnoseOperationOptions = useMemo(
    () => routeDiagnosticOperationOptions(activeEntry, routeDiagnoseCapability),
    [activeEntry, routeDiagnoseCapability],
  )
  const canDiagnoseRoute = Boolean(activeEntry && routeDiagnoseCapability.trim() && routeDiagnoseOperation.trim())

  const diagnoseRoute = useMutation<AIModelRouteDiagnosis>({
    mutationFn: () => api.post('/admin/model-routes/diagnose', routeDiagnosePayload({
      entry: activeEntry,
      capability: routeDiagnoseCapability,
      operation: routeDiagnoseOperation,
      routeGroup: routeDiagnoseGroup,
      referenceAssets: routeDiagnoseAssets,
    })).then((r) => r.data),
  })

  return (
    <div className="space-y-4">
      {routeError && <AppInlineError>{routeError}</AppInlineError>}
      {catalogQuery.error && <AppInlineError>{translateAPIRequestError(catalogQuery.error)}</AppInlineError>}

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">{t('admin.models.routePoolTitle', { defaultValue: '路由池' })}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {filteredRouteEntries.length} / {routeGroups.length} model+group · {t('admin.models.routeSummary', { defaultValue: '路由绑定' })} {entries.flatMap((entry) => entry.route_bindings ?? []).length}
            </p>
          </div>
          <Button type="button" size="sm" onClick={() => openRouteForm(entries[0]?.ID ?? 0)} disabled={entries.length === 0}>
            <Plus size={14} className="mr-1.5" />
            {t('admin.modelCatalog.addRoute')}
          </Button>
        </div>
        <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
          <ModelAdminSearchInput value={routeSearch} onChange={setRouteSearch} placeholder="搜索模型、group、provider model..." />
          <select value={routeCapability} onChange={(event) => setRouteCapability(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
            <option value="all">全部能力</option>
            {routeCapabilityOptions.map((capability) => (
              <option key={capability} value={capability}>
                {t(CAPABILITY_TRANSLATION_KEYS[capability] ?? capability, { defaultValue: capability })}
              </option>
            ))}
          </select>
          <select value={routeGroupFilter} onChange={(event) => setRouteGroupFilter(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
            <option value="all">全部路由组</option>
            {routeGroupOptions.map((routeGroup) => (
              <option key={routeGroup || '__default__'} value={routeGroup}>{routeGroupDisplayName(routeGroup, t)}</option>
            ))}
          </select>
          <select value={routeCoverageFilter} onChange={(event) => setRouteCoverageFilter(event.target.value as ModelRouteCoverageFilter)} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
            <option value="all">全部覆盖</option>
            <option value="missing-routes">缺少路由</option>
            <option value="disabled-routes">包含禁用绑定</option>
          </select>
          <ModelAdminPageSizeSelect value={routePageSize} onChange={setRoutePageSize} />
        </div>
      </div>

      <ModelRouteMatrix
        entries={entries}
        routeGroups={routePagination.items}
        routeProviders={routeProviders}
        onOpenRoutePool={openRoutePool}
        onOpenRouteForm={openRouteForm}
      />
      <PaginationControls page={routePagination.page} pageCount={routePagination.pageCount} pageSize={routePageSize} total={filteredRouteEntries.length} onPageChange={setRoutePage} disabled={catalogQuery.isFetching} />

      {catalogTemplatesQuery.error && <AppInlineError>{translateAPIRequestError(catalogTemplatesQuery.error)}</AppInlineError>}

      <RoutePoolDetailDialog
        group={selectedRouteGroup}
        routeProviders={routeProviders}
        adapters={routeAdapterOptions}
        runtimeHealthItems={runtimeHealthQuery.data?.items ?? []}
        runtimeHealthLoading={runtimeHealthQuery.isLoading}
        runtimeHealthFetching={runtimeHealthQuery.isFetching}
        runtimeHealthError={runtimeHealthQuery.error}
        busy={updateRouteBinding.isPending || deleteRouteBinding.isPending}
        onClose={() => setSelectedRouteGroupKey(null)}
        onRefreshHealth={() => runtimeHealthQuery.refetch()}
        onAddCandidate={(entryId, routeGroup) => openRouteForm(entryId, routeGroup)}
        onEditBinding={openRouteBindingForm}
        onDeleteBinding={(entryId, bindingId) => deleteRouteBinding.mutate({ entryId, bindingId })}
        onDiagnose={openRouteDiagnose}
      />

      <RouteBindingFormDialog
        open={routeDialogOpen}
        mode={editingRouteBinding ? 'edit' : 'create'}
        activeEntry={activeEntry}
        entries={entries}
        routeForm={routeForm}
        setRouteForm={setRouteForm}
        routeProviders={routeProviders}
        enabledRouteProviders={enabledRouteProviders}
        routeAdapterOptions={routeAdapterOptions}
        selectedRouteProvider={selectedRouteProvider}
        routeTemplateSuggestion={routeTemplateSuggestion}
        routeError={routeError}
        canSaveRoute={canSaveRoute}
        isSaving={createRouteBinding.isPending || updateRouteBinding.isPending}
        onClose={closeRouteForm}
        onEntryChange={selectRouteFormEntry}
        onSave={saveRouteForm}
      />

      <RouteDiagnosisDialog
        open={routeDiagnoseDialogOpen}
        activeEntry={activeEntry}
        routeDiagnoseCapability={routeDiagnoseCapability}
        setRouteDiagnoseCapability={setRouteDiagnoseCapability}
        routeDiagnoseOperation={routeDiagnoseOperation}
        setRouteDiagnoseOperation={setRouteDiagnoseOperation}
        routeDiagnoseGroup={routeDiagnoseGroup}
        setRouteDiagnoseGroup={setRouteDiagnoseGroup}
        routeDiagnoseAssets={routeDiagnoseAssets}
        setRouteDiagnoseAssets={setRouteDiagnoseAssets}
        routeDiagnoseCapabilityOptions={routeDiagnoseCapabilityOptions}
        routeDiagnoseOperationOptions={routeDiagnoseOperationOptions}
        canDiagnoseRoute={canDiagnoseRoute}
        diagnoseRoute={diagnoseRoute}
        onClose={() => setRouteDiagnoseDialogOpen(false)}
        onRun={() => diagnoseRoute.mutate()}
      />
    </div>
  )
}
