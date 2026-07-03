import { CatalogParamBuilder } from '@admin/components/admin/CatalogParamBuilder'
import { PaginationControls } from '@admin/components/admin/PaginationControls'
import { api } from '@admin/lib/api'
import { translateAPIRequestError } from '@admin/lib/apiError'
import { readListPayload } from '@admin/lib/listPayload'
import { operationParamProfileFromTemplateParams } from '@admin/lib/modelParamContract'
import { cn } from '@admin/lib/utils'
import type { AICredential, AIModelCatalogEntry, AIModelCatalogTemplate, AdapterDef } from '@admin/types'
import { AppFeedbackText, AppInlineError } from '@movscript/ui/business/app'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, StatusBadge } from '@movscript/ui/primitives'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CAPABILITY_STATUS_INTENT,
  CAPABILITY_TRANSLATION_KEYS,
  MODEL_ADMIN_PAGE_SIZE,
  MODEL_CAPABILITIES,
  catalogEntryDetail,
  catalogEntryFormFromEntry,
  catalogEntryFormFromTemplate,
  catalogEntryLabel,
  catalogEntryPayload,
  catalogEntryTemplateForm,
  catalogTemplateIsRuntimeReady,
  emptyCatalogEntryForm,
  filterCatalogTemplates,
  adapterOperationContract,
  adapterOperationOptions,
  defaultModelCapabilitiesJSONForCapabilities,
  defaultModelCapabilityDraft,
  modelAdminPaginationSlice,
  modelAdminTextMatches,
  modelCapabilityDraftsToJSON,
  modelCapabilityFamiliesFromList,
  modelCatalogCapabilities,
  modelOperationInputSlots,
  parseModelCapabilityDrafts,
  routeCapabilityOperationOptions,
  type CatalogEntryForm,
  type ModelCapabilityDraft,
  type ModelOperationInputSlot,
  type ModelCatalogRouteFilter,
  type ModelCatalogStatusFilter
} from '../model/modelManagementModel'
import { ModelAdminPageSizeSelect, ModelAdminSearchInput } from './ModelManagementControls'

export function ModelCatalogSection({ credentials, adapters }: { credentials: AICredential[]; adapters: AdapterDef[] }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [catalogForm, setCatalogForm] = useState<CatalogEntryForm>(() => emptyCatalogEntryForm())
  const [editingCatalogId, setEditingCatalogId] = useState<number | null>(null)
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false)
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

  function openCreateDialog() {
    setCatalogError('')
    setEditingCatalogId(null)
    setCatalogForm(emptyCatalogEntryForm())
    setAppliedCatalogTemplate(null)
    setCatalogDialogOpen(true)
  }

  function closeCatalogDialog() {
    setCatalogDialogOpen(false)
    setEditingCatalogId(null)
    setCatalogForm(emptyCatalogEntryForm())
    setAppliedCatalogTemplate(null)
    setCatalogError('')
  }

  const saveCatalogEntry = useMutation({
    mutationFn: ({ id, form }: { id?: number; form: CatalogEntryForm }) => {
      const payload = catalogEntryPayload(form)
      return id
        ? api.put(`/admin/model-catalog/${id}`, payload).then((r) => r.data)
        : api.post('/admin/model-catalog', payload).then((r) => r.data)
    },
    onMutate: () => setCatalogError(''),
    onSuccess: () => {
      closeCatalogDialog()
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
    setCatalogError('')
    setEditingCatalogId(entry.ID)
    setCatalogForm(catalogEntryFormFromEntry(entry))
    setAppliedCatalogTemplate(null)
    setCatalogDialogOpen(true)
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
      capabilities: ['text_generation'],
      model_capabilities_json: defaultModelCapabilitiesJSONForCapabilities(['text_generation']),
    })
    setCatalogError('')
    setEditingCatalogId(null)
    setCatalogForm(imported)
    setAppliedCatalogTemplate(null)
    setCatalogDialogOpen(true)
  }

  function applyCatalogTemplate(template: AIModelCatalogTemplate) {
    const form = catalogEntryFormFromTemplate(template)
    const adapter = adapters.find((item) => item.adapter_type === template.route_adapter_hint)
    if (!template.model_capabilities_json?.trim()) {
      form.model_capabilities_json = defaultModelCapabilitiesJSONForCapabilities(template.capabilities, {
        acceptsImage: Boolean(template.accepts_image_input),
        maxInputImages: template.max_input_images ?? 0,
        maxInputVideos: template.max_input_videos ?? 0,
      }, adapter)
    }
    form.supported_params = operationParamProfileFromTemplateParams(
      template.supported_params ?? [],
      catalogParamOperationsForModelCapabilities(form.model_capabilities_json),
      adapter,
    )
    setCatalogError('')
    setEditingCatalogId(null)
    setCatalogForm(form)
    setAppliedCatalogTemplate(template)
    setCatalogDialogOpen(true)
  }

  const modelCapabilityDrafts = parseModelCapabilityDrafts(catalogForm.model_capabilities_json)
  const modelCapabilitiesReady = !catalogForm.model_capabilities_json.trim() || (
    modelCapabilityDrafts.error === '' && modelCapabilityDrafts.drafts.every((draft) => draft.operations.length > 0)
  )
  const catalogParamOperations = useMemo(
    () => catalogParamOperationsForModelCapabilities(catalogForm.model_capabilities_json),
    [catalogForm.model_capabilities_json],
  )
  const catalogParamAdapter = useMemo(() => {
    const templateAdapter = appliedCatalogTemplate?.route_adapter_hint
    if (templateAdapter) return adapters.find((adapter) => adapter.adapter_type === templateAdapter)
    const entry = editingCatalogId ? entries.find((item) => item.ID === editingCatalogId) : null
    const routeAdapters = Array.from(new Set((entry?.route_bindings ?? []).map((binding) => binding.adapter_type).filter(Boolean)))
    return routeAdapters.length === 1 ? adapters.find((adapter) => adapter.adapter_type === routeAdapters[0]) : undefined
  }, [adapters, appliedCatalogTemplate?.route_adapter_hint, editingCatalogId, entries])
  const canSaveCatalog = catalogForm.public_model_id.trim() && modelCapabilitiesReady

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

      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{t('admin.modelCatalog.listTitle', { defaultValue: '模型列表' })}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {filteredEntries.length} / {entries.length} · {t('admin.modelCatalog.routes')}: {entries.reduce((total, entry) => total + (entry.route_bindings?.length ?? 0), 0)}
              </p>
            </div>
            <Button type="button" size="sm" onClick={openCreateDialog}>
              <Plus size={14} className="mr-1.5" />
              {t('admin.modelCatalog.createTitle')}
            </Button>
          </div>
          <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
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
            <div key={entry.ID} className="space-y-3 rounded-lg border border-border bg-background p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{catalogEntryLabel(entry)}</p>
                    <StatusBadge intent={entry.is_enabled ? 'success' : 'neutral'}>{entry.is_enabled ? t('admin.modelCatalog.enabled') : t('admin.modelCatalog.disabled')}</StatusBadge>
                    <span className="font-mono text-xs text-muted-foreground">{entry.public_model_id}</span>
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

      <CatalogEntryDialog
        open={catalogDialogOpen}
        editingCatalogId={editingCatalogId}
        catalogForm={catalogForm}
        setCatalogForm={setCatalogForm}
        catalogError={catalogError}
        appliedCatalogTemplate={appliedCatalogTemplate}
        templateSearch={templateSearch}
        setTemplateSearch={setTemplateSearch}
        templateLab={templateLab}
        setTemplateLab={setTemplateLab}
        templateLabOptions={templateLabOptions}
        filteredCatalogTemplates={filteredCatalogTemplates}
        templatesLoading={catalogTemplatesQuery.isLoading}
	        templatesError={catalogTemplatesQuery.error}
	        catalogParamOperations={catalogParamOperations}
	        catalogParamAdapter={catalogParamAdapter}
	        canSaveCatalog={Boolean(canSaveCatalog)}
        isSaving={saveCatalogEntry.isPending}
        onClose={closeCatalogDialog}
        onApplyTemplate={applyCatalogTemplate}
        onToggleCapability={toggleCatalogCapability}
        onSave={() => saveCatalogEntry.mutate({ id: editingCatalogId ?? undefined, form: catalogForm })}
      />
    </div>
  )
}

export function CatalogEntryDialog({
  open,
  editingCatalogId,
  catalogForm,
  setCatalogForm,
  catalogError,
  appliedCatalogTemplate,
  templateSearch,
  setTemplateSearch,
  templateLab,
  setTemplateLab,
  templateLabOptions,
  filteredCatalogTemplates,
	  templatesLoading,
	  templatesError,
	  catalogParamOperations,
	  catalogParamAdapter,
	  canSaveCatalog,
  isSaving,
  onClose,
  onApplyTemplate,
  onToggleCapability,
  onSave,
}: {
  open: boolean
  editingCatalogId: number | null
  catalogForm: CatalogEntryForm
  setCatalogForm: (value: CatalogEntryForm) => void
  catalogError: string
  appliedCatalogTemplate: AIModelCatalogTemplate | null
  templateSearch: string
  setTemplateSearch: (value: string) => void
  templateLab: string
  setTemplateLab: (value: string) => void
  templateLabOptions: string[]
  filteredCatalogTemplates: AIModelCatalogTemplate[]
	  templatesLoading: boolean
	  templatesError: unknown
	  catalogParamOperations: ReturnType<typeof catalogParamOperationsForModelCapabilities>
	  catalogParamAdapter?: AdapterDef
	  canSaveCatalog: boolean
  isSaving: boolean
  onClose: () => void
  onApplyTemplate: (template: AIModelCatalogTemplate) => void
  onToggleCapability: (capability: string) => void
  onSave: () => void
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) onClose()
    }}>
      <DialogContent closeLabel={t('common.close')} className="flex max-h-[calc(100vh-32px)] w-[1120px] max-w-[calc(100vw-32px)] overflow-hidden p-0">
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            onSave()
          }}
        >
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-14">
            <DialogTitle>{editingCatalogId ? t('admin.modelCatalog.editTitle') : t('admin.modelCatalog.createTitle')}</DialogTitle>
            <DialogDescription>{t('admin.modelCatalog.formHint')}</DialogDescription>
          </DialogHeader>

          <div className={cn('grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 lg:overflow-hidden', editingCatalogId ? 'lg:grid-cols-1' : 'lg:grid-cols-[320px_minmax(0,1fr)]')}>
            {!editingCatalogId && (
              <aside className="flex max-h-[460px] min-h-[380px] flex-col overflow-hidden rounded-lg border border-border bg-background lg:max-h-none lg:min-h-0">
                <div className="shrink-0 border-b border-border p-3">
                  <p className="text-xs font-medium text-foreground">从模型模板填入</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Public Model ID 和 provider model id 会保持分离。
                  </p>
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
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
                  {templatesError ? <AppInlineError>{translateAPIRequestError(templatesError)}</AppInlineError> : null}
                  {templatesLoading ? (
                    <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">正在加载模型模板...</p>
                  ) : filteredCatalogTemplates.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">没有匹配的模型模板。</p>
                  ) : (
                    <div className="grid gap-2">
                      {filteredCatalogTemplates.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => onApplyTemplate(template)}
                          className={cn(
                            'min-w-0 rounded-lg border bg-card p-3 text-left transition-colors hover:border-ring',
                            appliedCatalogTemplate?.id === template.id ? 'border-ring ring-1 ring-ring/30' : 'border-border',
                          )}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{template.display_name || template.default_public_model_id}</p>
                            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{template.default_public_model_id}</p>
                          </div>
                          <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">upstream: {template.model_id}</p>
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
              </aside>
            )}

            <div className="space-y-4 pr-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
              {catalogError && <AppInlineError>{catalogError}</AppInlineError>}
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-muted-foreground">{t('admin.modelCatalog.publicModelId')}</p>
                  <label className="flex h-8 items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={catalogForm.is_enabled} onChange={(event) => setCatalogForm({ ...catalogForm, is_enabled: event.target.checked })} />
                    {t('admin.modelCatalog.enabled')}
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
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
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <Label className="mb-2 block text-xs text-muted-foreground">{t('admin.modelCatalog.capabilities')}</Label>
                <div className="flex flex-wrap gap-2">
                  {MODEL_CAPABILITIES.map((capability) => (
                    <label key={capability} className="flex h-8 items-center gap-2 rounded-md border border-border px-2 text-xs">
                      <input type="checkbox" checked={catalogForm.capabilities.includes(capability)} onChange={() => onToggleCapability(capability)} className="rounded" />
                      <span>{t(CAPABILITY_TRANSLATION_KEYS[capability] ?? capability)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <ModelCapabilitiesEditor
                capabilities={catalogForm.capabilities}
                value={catalogForm.model_capabilities_json}
                adapter={catalogParamAdapter}
                onChange={(model_capabilities_json) => setCatalogForm({ ...catalogForm, model_capabilities_json })}
              />

              {appliedCatalogTemplate && (
                <AppFeedbackText tone="neutral">
                  {catalogTemplateIsRuntimeReady(appliedCatalogTemplate)
                    ? `模板已填入：Public Model ID 为 ${appliedCatalogTemplate.default_public_model_id}，Route 建议使用 provider model id ${appliedCatalogTemplate.model_id}。`
                    : `模板已填入：Public Model ID 为 ${appliedCatalogTemplate.default_public_model_id}。该模板当前为待适配状态，先不要为它创建可用 Route。`}
                </AppFeedbackText>
              )}

              <div className="rounded-lg border border-border bg-background p-4">
                <CatalogParamBuilder
                  value={catalogForm.supported_params}
                  operations={catalogParamOperations}
                  adapter={catalogParamAdapter}
                  onChange={(supported_params) => setCatalogForm({ ...catalogForm, supported_params })}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-border bg-card/95 px-5 py-4 backdrop-blur">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSaving || !canSaveCatalog}>
              {isSaving ? t('common.saving') : editingCatalogId ? t('admin.modelCatalog.save') : t('admin.modelCatalog.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function catalogParamOperationsForModelCapabilities(value: string) {
  const parsed = parseModelCapabilityDrafts(value)
  if (parsed.error) return []
  return parsed.drafts.flatMap((draft) =>
    draft.operations.map((operation) => ({ capability: draft.capability, operation })),
  )
}

function modelOperationLabel(operation: string, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`admin.modelOperations.${operation}`, { defaultValue: operation })
}

function uniqueOperationOptions(values: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  values.forEach((value) => {
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    out.push(normalized)
  })
  return out
}

function localizedToken(namespace: string, value: string, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`${namespace}.${value}`, { defaultValue: value })
}

function modelInputSlotCountLabel(slot: ModelOperationInputSlot, t: (key: string, options?: Record<string, unknown>) => string) {
  if (slot.max < 0) {
    return slot.min > 0
      ? t('admin.models.inputCountMin', { min: slot.min, defaultValue: `至少 ${slot.min} 个` })
      : t('admin.models.countUnlimited', { defaultValue: '不限' })
  }
  if (slot.min === slot.max) {
    return t('admin.models.inputCountExact', { count: slot.min, defaultValue: `${slot.min} 个` })
  }
  return t('admin.models.inputCountRange', { min: slot.min, max: slot.max, defaultValue: `${slot.min}-${slot.max} 个` })
}

function ModelCapabilitiesEditor({
  capabilities,
  value,
  adapter,
  onChange,
}: {
  capabilities: string[]
  value: string
  adapter?: AdapterDef
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const parsed = useMemo(() => parseModelCapabilityDrafts(value), [value])
  const defaultDrafts = useMemo(
    () => modelCapabilityFamiliesFromList(capabilities).map((capability) => defaultModelCapabilityDraft(capability, undefined, adapter)),
    [adapter, capabilities],
  )
  const capabilityOptions = useMemo(() => {
    const options = modelCapabilityFamiliesFromList([...MODEL_CAPABILITIES, ...capabilities])
    parsed.drafts.forEach((draft) => {
      if (draft.capability && !options.includes(draft.capability)) options.push(draft.capability)
    })
    return options.length > 0 ? options : ['text_generation']
  }, [capabilities, parsed.drafts])

  function updateDraft(index: number, patch: Partial<ModelCapabilityDraft>) {
    const nextDrafts = parsed.drafts.map((draft, draftIndex) => draftIndex === index ? { ...draft, ...patch } : draft)
    onChange(modelCapabilityDraftsToJSON(nextDrafts))
  }

  function addDraft() {
    const used = new Set(parsed.drafts.map((draft) => draft.capability))
    const capability = capabilityOptions.find((option) => !used.has(option)) ?? capabilityOptions[0]
    if (!capability) return
    onChange(modelCapabilityDraftsToJSON([...parsed.drafts, defaultModelCapabilityDraft(capability, undefined, adapter)]))
  }

  if (parsed.error) {
    return (
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="mb-3">
          <Label className="block text-xs text-foreground">
            {t('admin.models.modelCapabilitiesTitle', { defaultValue: '模型能力配置' })}
          </Label>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {t('admin.models.modelCapabilitiesHint', { defaultValue: '这里按 operation 声明模型契约；输入素材来自 operation，上传和输出方式来自 adapter contract，生成参数在下方维护。' })}
          </p>
        </div>
        <AppInlineError>{parsed.error}</AppInlineError>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder='{"video_generation":{"operations":["image_to_video"]}}'
          className="mt-3 min-h-[180px] w-full rounded-md border border-input bg-card px-2 py-2 font-mono text-xs"
        />
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Label className="block text-xs text-foreground">
            {t('admin.models.modelCapabilitiesTitle', { defaultValue: '模型能力配置' })}
          </Label>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {t('admin.models.modelCapabilitiesHint', { defaultValue: '这里按 operation 声明模型契约；输入素材来自 operation，上传和输出方式来自 adapter contract，生成参数在下方维护。' })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {defaultDrafts.length > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={() => onChange(modelCapabilityDraftsToJSON(defaultDrafts))}>
              {t('admin.models.fillFromCapabilityTags', { defaultValue: '按能力标签生成' })}
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" onClick={addDraft}>
            <Plus size={13} className="mr-1.5" />
            {t('admin.models.addModelCapability', { defaultValue: '添加能力' })}
          </Button>
        </div>
      </div>

      {parsed.drafts.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-card px-3 py-4 text-xs text-muted-foreground">
          <p>{t('admin.models.modelCapabilityEmpty', { defaultValue: '还没有结构化能力配置。可以先从能力标签生成，再按模型实际支持情况微调。' })}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {parsed.drafts.map((draft, index) => (
            <ModelCapabilityDraftCard
              key={`${draft.capability}:${index}`}
              draft={draft}
              adapter={adapter}
              capabilityOptions={capabilityOptions}
              onChange={(patch) => updateDraft(index, patch)}
              onRemove={() => onChange(modelCapabilityDraftsToJSON(parsed.drafts.filter((_, draftIndex) => draftIndex !== index)))}
              t={t}
            />
          ))}
        </div>
      )}

      <details className="mt-3 rounded-md border border-border bg-card px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          {t('admin.models.advancedModelCapabilitiesJson', { defaultValue: '高级：查看或编辑原始 JSON' })}
        </summary>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder='{"video_generation":{"operations":["image_to_video"]}}'
          className="mt-2 min-h-[120px] w-full rounded-md border border-input bg-background px-2 py-2 font-mono text-xs"
        />
      </details>
    </div>
  )
}

function ModelCapabilityDraftCard({
  draft,
  adapter,
  capabilityOptions,
  onChange,
  onRemove,
  t,
}: {
  draft: ModelCapabilityDraft
  adapter?: AdapterDef
  capabilityOptions: string[]
  onChange: (patch: Partial<ModelCapabilityDraft>) => void
  onRemove: () => void
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  const operationOptions = useMemo(() => {
    const adapterOptions = adapterOperationOptions(adapter, draft.capability)
    const presets = adapterOptions.length > 0 ? adapterOptions : routeCapabilityOperationOptions(null, draft.capability)
    return uniqueOperationOptions([...presets, ...draft.operations])
  }, [adapter, draft.capability, draft.operations])
  const operationSet = new Set(draft.operations)

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <label className="block min-w-0 flex-1 text-xs text-muted-foreground">
          {t('admin.models.capabilityField', { defaultValue: '能力域' })}
          <select
            value={draft.capability}
            onChange={(event) => {
              const capability = event.target.value
              onChange({ ...defaultModelCapabilityDraft(capability, undefined, adapter), capability })
            }}
            className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          >
            {capabilityOptions.map((capability) => (
              <option key={capability} value={capability}>
                {t(CAPABILITY_TRANSLATION_KEYS[capability] ?? capability, { defaultValue: capability })} · {capability}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" size="sm" variant="ghost" intent="danger" onClick={onRemove}>
          {t('common.delete')}
        </Button>
      </div>

      <div className="mt-3">
        <p className="text-xs text-muted-foreground">{t('admin.models.operationsField', { defaultValue: 'Operations' })}</p>
        <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
          {operationOptions.map((operation) => (
            <label key={operation} className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
              <input
                type="checkbox"
                checked={operationSet.has(operation)}
                onChange={(event) => {
                  const operations = event.target.checked
                    ? [...draft.operations, operation]
                    : draft.operations.filter((item) => item !== operation)
                  onChange({ operations })
                }}
	              />
	              <span className="min-w-0">
	                <span className="block truncate text-foreground">{modelOperationLabel(operation, t)}</span>
	                <span className="block truncate font-mono text-[10px] text-muted-foreground">{operation}</span>
	              </span>
	            </label>
	          ))}
	        </div>
	        {draft.operations.length === 0 && (
	          <AppFeedbackText className="mt-2">{t('admin.models.modelCapabilityNeedsOperation', { defaultValue: '每个能力至少需要一个 operation。' })}</AppFeedbackText>
	        )}
      </div>

      <ModelOperationContractPreview draft={draft} adapter={adapter} t={t} />
    </div>
  )
}

function ModelOperationContractPreview({
  draft,
  adapter,
  t,
}: {
  draft: ModelCapabilityDraft
  adapter?: AdapterDef
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  if (draft.operations.length === 0) return null

  return (
    <div className="mt-3 rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-foreground">
            {t('admin.models.operationContractTitle', { defaultValue: 'Operation 契约预览' })}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {t('admin.models.operationContractHint', { defaultValue: '按 operation 展示输入素材、上传方式和输出方式；生成参数在下方单独维护。' })}
          </p>
        </div>
        <StatusBadge intent={adapter ? 'success' : 'neutral'} className="text-xs">
          {adapter
            ? t('admin.models.adapterDerived', { defaultValue: '由 adapter contract 推导' })
            : t('admin.models.noAdapterContract', { defaultValue: '暂无 adapter 契约摘要' })}
        </StatusBadge>
      </div>

      <div className="mt-3 grid gap-2">
        {draft.operations.map((operation) => {
          const slots = modelOperationInputSlots(operation)
          const contract = adapterOperationContract(adapter, draft.capability, operation)
          const transports = contract?.input_media_transport ?? []
          const outputMedia = contract?.output_media ?? []
          return (
            <div key={operation} className="rounded-md border border-border bg-card p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">{modelOperationLabel(operation, t)}</p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{operation}</p>
                </div>
                <StatusBadge intent={contract ? 'success' : 'neutral'} className="text-xs">
                  {contract
                    ? t('admin.models.adapterContractReady', { defaultValue: 'Adapter 已声明' })
                    : t('admin.models.systemOperationRule', { defaultValue: '系统 operation 规则' })}
                </StatusBadge>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <OperationContractBlock title={t('admin.models.inputSlotsTitle', { defaultValue: '输入素材' })}>
                  {slots.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">{t('admin.models.noReferenceInputs', { defaultValue: '无需参考素材' })}</p>
                  ) : (
                    <div className="space-y-2">
                      {slots.map((slot) => (
                        <div key={slot.id} className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-foreground">{t(slot.labelKey, { defaultValue: slot.id })}</span>
                            {slot.ordered && (
                              <StatusBadge intent="warning" className="text-[10px]">
                                {t('admin.models.orderedInput', { defaultValue: '按顺序' })}
                              </StatusBadge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {slot.mediaTypes.map((mediaType) => (
                              <StatusBadge key={mediaType} intent="neutral" className="text-[10px]">
                                {localizedToken('admin.models.mediaTypes', mediaType, t)}
                              </StatusBadge>
                            ))}
                            <StatusBadge intent="neutral" className="text-[10px]">
                              {modelInputSlotCountLabel(slot, t)}
                            </StatusBadge>
                          </div>
                          {slot.descriptionKey && (
                            <p className="text-[11px] leading-relaxed text-muted-foreground">
                              {t(slot.descriptionKey, { defaultValue: '按顺序上传参考素材。' })}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </OperationContractBlock>

                <OperationContractBlock title={t('admin.models.transportTitle', { defaultValue: '上传方式' })}>
                  <TokenList
                    values={transports}
                    empty={t('admin.models.noMediaTransport', { defaultValue: '无媒体上传要求' })}
                    label={(value) => localizedToken('admin.models.transports', value, t)}
                  />
                </OperationContractBlock>

                <OperationContractBlock title={t('admin.models.resultModeTitle', { defaultValue: '结果模式' })}>
                  <TokenList
                    values={contract?.result_mode ? [contract.result_mode] : []}
                    empty={t('admin.models.unspecifiedByAdapter', { defaultValue: 'Adapter 未声明' })}
                    label={(value) => localizedToken('admin.models.resultModes', value, t)}
                  />
                </OperationContractBlock>

                <OperationContractBlock title={t('admin.models.outputMediaTitle', { defaultValue: '输出' })}>
                  <TokenList
                    values={outputMedia}
                    empty={t('admin.models.unspecifiedByAdapter', { defaultValue: 'Adapter 未声明' })}
                    label={(value) => localizedToken('admin.models.outputMedia', value, t)}
                  />
                </OperationContractBlock>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function OperationContractBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  )
}

function TokenList({ values, empty, label }: { values: string[]; empty: string; label: (value: string) => string }) {
  const uniqueValues = uniqueOperationOptions(values)
  if (uniqueValues.length === 0) {
    return <p className="text-[11px] text-muted-foreground">{empty}</p>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {uniqueValues.map((value) => (
        <StatusBadge key={value} intent="neutral" className="text-[10px]">
          {label(value)}
        </StatusBadge>
      ))}
    </div>
  )
}
