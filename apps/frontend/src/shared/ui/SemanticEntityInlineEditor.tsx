import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Save, Trash2, X } from 'lucide-react'

import {
  createSemanticEntity,
  deleteSemanticEntity,
  getSourceLockStatus,
  listSemanticEntities,
  semanticEntityConfig,
  updateSemanticEntity,
  type SemanticEntityConfig,
  type SemanticEntityPayload,
  type SemanticEntityRecord,
  type SourceLockStatus,
} from '@/shared/infrastructure/api/semanticEntities'
import { semanticEntityKeys } from '@/shared/application/semanticEntityQueryKeys'
import { invalidateSemanticEntityMutationResult, semanticEntityChangedResult } from '@/shared/application/semanticEntityMutationInvalidation'
import { toast } from '@/shared/ui/toastStore'
import { type AccentTone } from '@movscript/ui/semantic'
import {
  DetailEntityEditorActions,
  DetailEntityEditorEmptyState,
  DetailEntityEditorHeader,
  DetailEntityEditorHero,
  DetailEntityEditorShell,
  DetailEntityForm,
  DetailEntityHorizontalRail,
} from '@/shared/ui/SemanticEntityInlineEditorUi'
import { SemanticEntityInlineEditorFieldSections } from '@/shared/ui/SemanticEntityInlineEditorFields'
import {
  buildInitialForm,
  buildPayload,
  formatScriptBlockOption,
  formatSettingOption,
  formatSettingStateOption,
  isAdvancedField,
  isDeleteProtectedKind,
  isFieldFilled,
  isImmutableKind,
  sourceLockReasonText,
  sourceLockSupportedKind,
  type SemanticEntityInlineFormState,
} from '@/shared/ui/SemanticEntityInlineEditorModel'

export interface SemanticEntityInlineEditorControlState {
  formId: string
  isEditing: boolean
  canSave: boolean
  isSaving: boolean
  isDeleting: boolean
  isImmutableRecord: boolean
}

interface SemanticEntityInlineEditorProps {
  projectId?: number
  config: SemanticEntityConfig
  record?: SemanticEntityRecord | null
  defaults?: Partial<SemanticEntityPayload>
  queryKey?: readonly unknown[]
  title?: string
  description?: string
  hideHeaderCopy?: boolean
  hideHeaderActions?: boolean
  hideDeleteAction?: boolean
  showAdvancedFields?: boolean
  hiddenFieldKeys?: string[]
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
  onControlStateChange?: (state: SemanticEntityInlineEditorControlState) => void
  emptyTitle?: string
  emptyDescription?: string
  className?: string
  surface?: 'default' | 'embedded'
  hero?: SemanticEntityInlineEditorHero
  primaryFieldKeys?: string[]
  collapsed?: boolean
  collapsedMode?: 'vertical' | 'horizontal'
  onCollapsedChange?: (collapsed: boolean) => void
  resetToken?: number
  idScope?: string
  editKey?: string | number | null
  deleteRecord?: (record: SemanticEntityRecord) => Promise<unknown>
  saveRecord?: (payload: SemanticEntityPayload, record: SemanticEntityRecord | null | undefined) => Promise<SemanticEntityRecord>
  lookupOptions?: Record<string, Array<{ value: string; label: string }>>
  onSaved?: (record: SemanticEntityRecord) => void
  onDeleted?: (record: SemanticEntityRecord) => void
}

interface SemanticEntityInlineEditorHero {
  icon?: ReactNode
  eyebrow?: ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  summary?: ReactNode
  accentTone?: AccentTone
  accentClassName?: string
  compact?: boolean
  status?: ReactNode
  stats?: Array<{ label: string; value: ReactNode }>
}

export function SemanticEntityInlineEditor({
  projectId,
  config,
  record,
  defaults,
  queryKey,
  title,
  description,
  hideHeaderCopy = false,
  hideHeaderActions = false,
  hideDeleteAction = false,
  showAdvancedFields = true,
  hiddenFieldKeys,
  editing,
  onEditingChange,
  onControlStateChange,
  emptyTitle = '未选择对象',
  emptyDescription = '从左侧列表选择一个对象后，可直接在卡片内编辑。',
  className,
  surface = 'default',
  hero,
  primaryFieldKeys,
  collapsed = false,
  collapsedMode = 'vertical',
  onCollapsedChange,
  resetToken,
  idScope,
  editKey,
  deleteRecord,
  saveRecord,
  lookupOptions: externalLookupOptions,
  onSaved,
  onDeleted,
}: SemanticEntityInlineEditorProps) {
  const queryClient = useQueryClient()
  const fields = useMemo(() => config.fields.filter((field) => !field.createOnly), [config.fields])
  const hiddenFieldKeySet = useMemo(() => new Set(hiddenFieldKeys ?? []), [hiddenFieldKeys])
  const visibleFields = useMemo(() => fields.filter((field) => !hiddenFieldKeySet.has(field.key)), [fields, hiddenFieldKeySet])
  const primaryFieldKeySet = useMemo(() => new Set(primaryFieldKeys ?? []), [primaryFieldKeys])
  const basicFields = useMemo(() => visibleFields.filter((field) => primaryFieldKeySet.has(field.key) || !isAdvancedField(config.kind, field.key)), [config.kind, primaryFieldKeySet, visibleFields])
  const advancedFields = useMemo(() => showAdvancedFields ? visibleFields.filter((field) => !primaryFieldKeySet.has(field.key) && isAdvancedField(config.kind, field.key)) : [], [config.kind, primaryFieldKeySet, showAdvancedFields, visibleFields])
  const [form, setForm] = useState<SemanticEntityInlineFormState>(() => buildInitialForm(fields, record, defaults))
  const [uncontrolledIsEditing, setUncontrolledIsEditing] = useState(Boolean(!record))
  const isEditing = editing ?? uncontrolledIsEditing
  const enableSettingLookups = config.kind === 'assetSlots' && Boolean(projectId)
  const enableScriptBlockLookups = (config.kind === 'contentUnits' || config.kind === 'segments' || config.kind === 'sceneMoments') && Boolean(projectId)
  const hasExternalSettingOptions = Object.hasOwn(externalLookupOptions ?? {}, 'setting_id')
  const hasExternalSettingStateOptions = Object.hasOwn(externalLookupOptions ?? {}, 'setting_state_id')
  const hasExternalScriptBlockOptions = Object.hasOwn(externalLookupOptions ?? {}, 'script_block_id')
  const canDeleteRecord = !hideDeleteAction && !isDeleteProtectedKind(config.kind)
  const isImmutableRecord = Boolean(record && isImmutableKind(config.kind))
  const sourceLockEnabled = Boolean(projectId && record?.ID && !saveRecord && sourceLockSupportedKind(config.kind))
  const editorDomScope = idScope ?? `${config.kind}-${record?.ID ?? 'new'}`
  const formId = `inline-${editorDomScope}`
  const shellClassName = className ?? (surface === 'embedded' ? 'rounded-none border-0 bg-transparent' : undefined)

  function setEditorEditing(nextEditing: boolean) {
    if (editing === undefined) setUncontrolledIsEditing(nextEditing)
    onEditingChange?.(nextEditing)
  }

  const { data: settings = [] } = useQuery({
    queryKey: semanticEntityKeys.inlineSettings(projectId),
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('settings')),
    enabled: enableSettingLookups && !hasExternalSettingOptions,
  })

  const { data: settingStates = [] } = useQuery({
    queryKey: semanticEntityKeys.inlineSettingStates(projectId),
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('settingStates')),
    enabled: enableSettingLookups && !hasExternalSettingStateOptions,
  })

  const { data: scriptBlocks = [] } = useQuery({
    queryKey: semanticEntityKeys.inlineScriptBlocks(projectId),
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('scriptBlocks')),
    enabled: enableScriptBlockLookups && !hasExternalScriptBlockOptions,
  })

  const { data: sourceLock } = useQuery<SourceLockStatus>({
    queryKey: semanticEntityKeys.sourceLock(projectId, config.kind, record?.ID),
    queryFn: () => getSourceLockStatus(projectId!, config, record!.ID),
    enabled: sourceLockEnabled,
  })

  const lockedFields = useMemo(() => new Set(sourceLock?.locked_fields ?? []), [sourceLock])
  const sourceLockReason = sourceLockReasonText(sourceLock)

  const referenceById = useMemo(() => new Map(settings.map((item) => [item.ID, item])), [settings])
  const lookupOptions = useMemo(() => {
    const options: Record<string, Array<{ value: string; label: string }>> = {}
    if (enableSettingLookups) {
      const selectedReferenceId = Number(String(form.setting_id ?? '').trim()) || 0
      const states = selectedReferenceId
        ? settingStates.filter((item) => Number(item.setting_id) === selectedReferenceId)
        : settingStates
      options.setting_id = settings.map((item) => ({
        value: String(item.ID),
        label: formatSettingOption(item),
      }))
      options.setting_state_id = states.map((item) => ({
        value: String(item.ID),
        label: formatSettingStateOption(item, referenceById.get(Number(item.setting_id))),
      }))
    }
    if (enableScriptBlockLookups) {
      options.script_block_id = scriptBlocks.map((item) => ({
        value: String(item.ID),
        label: formatScriptBlockOption(item),
      }))
    }
    for (const [key, value] of Object.entries(externalLookupOptions ?? {})) {
      options[key] = value
    }
    return options
  }, [settingStates, settings, enableSettingLookups, enableScriptBlockLookups, externalLookupOptions, form.setting_id, referenceById, scriptBlocks])

  useEffect(() => {
    setForm(buildInitialForm(fields, record, defaults))
    setEditorEditing(Boolean(!record || editKey))
  }, [defaults, editKey, fields, record, resetToken])

  const missingRequiredFields = useMemo(() => fields.filter((field) => field.required && !isFieldFilled(form[field.key], field.type)), [fields, form])
  const canSave = Boolean(projectId) && !isImmutableRecord && missingRequiredFields.length === 0 && (isEditing || !record)

  const saveMutation = useMutation({
    mutationFn: (payload: SemanticEntityPayload) => {
      if (!projectId) throw new Error('missing project id')
      if (saveRecord) return saveRecord(payload, record)
      return record
        ? updateSemanticEntity(projectId, config, record.ID, payload)
        : createSemanticEntity(projectId, config, payload)
    },
    onSuccess: (saved) => {
      invalidateSemanticEntityMutationResult(
        queryClient,
        semanticEntityChangedResult({
          projectId,
          kind: config.kind,
          recordId: saved.ID,
          ...(queryKey ? { consumerQueryKey: queryKey } : {}),
        }),
      )
      toast.success(`${config.label}已保存`)
      onSaved?.(saved)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!projectId || !record) throw new Error('missing record')
      if (deleteRecord) return deleteRecord(record)
      return deleteSemanticEntity(projectId, config, record.ID)
    },
    onSuccess: () => {
      invalidateSemanticEntityMutationResult(
        queryClient,
        semanticEntityChangedResult({
          projectId,
          kind: config.kind,
          ...(record?.ID !== undefined ? { recordId: record.ID } : {}),
          ...(queryKey ? { consumerQueryKey: queryKey } : {}),
        }),
      )
      toast.success(`${config.label}已删除`)
      if (record) onDeleted?.(record)
    },
  })

  function removeRecord() {
    if (!projectId || !record) return
    if (!window.confirm(`确定删除这个${config.label}吗？`)) return
    deleteMutation.mutate()
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!projectId || !canSave) return
    saveMutation.mutate(buildPayload(fields, form))
  }

  useEffect(() => {
    onControlStateChange?.({
      formId,
      isEditing,
      canSave,
      isSaving: saveMutation.isPending,
      isDeleting: deleteMutation.isPending,
      isImmutableRecord,
    })
  }, [canSave, deleteMutation.isPending, formId, isEditing, isImmutableRecord, onControlStateChange, saveMutation.isPending])

  function updateField(key: string, value: string | boolean) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
      ...(config.kind === 'assetSlots' && key === 'setting_id' && value !== prev.setting_id
        ? { setting_state_id: '' }
        : null),
    }))
  }

  function toggleCollapsed() {
    onCollapsedChange?.(!collapsed)
  }

  if (!record && !defaults) {
    return (
      <DetailEntityEditorEmptyState className={shellClassName} title={emptyTitle} detail={emptyDescription} />
    )
  }

  if (collapsed && collapsedMode === 'horizontal' && onCollapsedChange) {
    const railTitle = title ?? `${record ? '编辑' : '新建'}${config.label}`
    const railSubtitle = record ? record.name || record.title || record.label || `#${record.ID}` : config.label
    return (
      <DetailEntityHorizontalRail
        className={shellClassName}
        data-inline-editor-collapsed-mode="horizontal"
        title={railTitle}
        subtitle={String(railSubtitle)}
        icon={<ChevronLeft size={14} />}
        expandLabel={`展开${typeof railTitle === 'string' ? railTitle : config.label}`}
        onExpand={toggleCollapsed}
      />
    )
  }

  const actionMode = record && (!isEditing || isImmutableRecord) ? 'view' : 'edit'
  const resetEditing = () => {
    if (record) {
      setForm(buildInitialForm(fields, record, defaults))
    }
    setEditorEditing(false)
  }
  const renderEditorActions = (overlay = false) => (
    <DetailEntityEditorActions
      mode={actionMode}
      canCollapse={Boolean(onCollapsedChange)}
      collapsed={collapsed}
      collapsedMode={collapsedMode}
      canEdit={Boolean(record && !isImmutableRecord)}
      canDelete={Boolean(record && canDeleteRecord)}
      canSave={canSave}
      deleting={deleteMutation.isPending}
      saving={saveMutation.isPending}
      disabled={isImmutableRecord}
      overlay={overlay}
      formId={formId}
      icons={{
        collapse: <ChevronDown size={14} />,
        expand: <ChevronRight size={14} />,
        edit: <Pencil size={14} />,
        delete: <Trash2 size={14} />,
        cancel: <X size={14} />,
        save: <Save size={14} />,
      }}
      onToggleCollapsed={toggleCollapsed}
      onEdit={() => setEditorEditing(true)}
      onDelete={removeRecord}
      onCancel={record ? resetEditing : undefined}
    />
  )

  if (hero) {
    const compactHero = Boolean(hero.compact)
    return (
      <DetailEntityEditorHero
        className={shellClassName}
        compact={compactHero}
        collapsed={collapsed}
        icon={hero.icon}
        eyebrow={hero.eyebrow}
        title={hero.title ?? title ?? `${record ? '编辑' : '新建'}${config.label}`}
        subtitle={hero.subtitle}
        summary={hero.summary}
        description={description}
        status={hero.status}
        actions={renderEditorActions(true)}
        stats={hero.stats}
        accentTone={hero.accentTone}
        accentClassName={hero.accentClassName}
      >
        {!collapsed ? <DetailEntityForm id={formId} onSubmit={submit} divided>
          <SemanticEntityInlineEditorFieldSections
            configKind={config.kind}
            idScope={idScope}
            fields={fields}
            basicFields={basicFields}
            advancedFields={advancedFields}
            form={form}
            lookupOptions={lookupOptions}
            recordExists={Boolean(record)}
            isEditing={isEditing}
            isImmutableRecord={isImmutableRecord}
            lockedFields={lockedFields}
            sourceLock={sourceLock}
            sourceLockReason={sourceLockReason}
            advancedTitle="全部字段"
            advancedClassName="detail-entity-field-grid--advanced"
            columns="responsive"
            onChange={updateField}
          />
        </DetailEntityForm> : null}
      </DetailEntityEditorHero>
    )
  }

  return (
    <DetailEntityEditorShell className={shellClassName}>
      {(!hideHeaderCopy || !hideHeaderActions) ? (
        <DetailEntityEditorHeader
          hideCopy={hideHeaderCopy}
          title={title ?? `${record ? '编辑' : '新建'}${config.label}`}
          description={description}
          requiredHint={(!isEditing || isImmutableRecord) && record ? config.requiredHint : undefined}
          actions={hideHeaderActions ? undefined : renderEditorActions()}
        />
      ) : null}
      {!collapsed ? <DetailEntityForm id={formId} onSubmit={submit}>
        <SemanticEntityInlineEditorFieldSections
          configKind={config.kind}
          idScope={idScope}
          fields={fields}
          basicFields={basicFields}
          advancedFields={advancedFields}
          form={form}
          lookupOptions={lookupOptions}
          recordExists={Boolean(record)}
          isEditing={isEditing}
          isImmutableRecord={isImmutableRecord}
          lockedFields={lockedFields}
          sourceLock={sourceLock}
          sourceLockReason={sourceLockReason}
          advancedTitle="高级字段"
          onChange={updateField}
        />
      </DetailEntityForm> : null}
    </DetailEntityEditorShell>
  )
}
