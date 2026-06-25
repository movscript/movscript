import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Save, Trash2, X } from 'lucide-react'

import {
  createSemanticEntity,
  deleteSemanticEntity,
  updateSemanticEntity,
  type SemanticEntityPayload,
} from '@/shared/infrastructure/api/semanticEntities'
import { invalidateSemanticEntityMutationResult, semanticEntityChangedResult } from '@/shared/application/semanticEntityMutationInvalidation'
import { toast } from '@movscript/ui/toast'
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
  isAdvancedField,
  isDeleteProtectedKind,
  isFieldFilled,
  isImmutableKind,
  type SemanticEntityInlineFormState,
} from '@/shared/ui/SemanticEntityInlineEditorModel'
import { useSemanticEntityInlineEditorLookups } from '@/shared/ui/SemanticEntityInlineEditorLookups'
import type { SemanticEntityInlineEditorProps } from '@/shared/ui/SemanticEntityInlineEditorTypes'

export type { SemanticEntityInlineEditorControlState } from '@/shared/ui/SemanticEntityInlineEditorTypes'

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
  const canDeleteRecord = !hideDeleteAction && !isDeleteProtectedKind(config.kind)
  const isImmutableRecord = Boolean(record && isImmutableKind(config.kind))
  const editorDomScope = idScope ?? `${config.kind}-${record?.ID ?? 'new'}`
  const formId = `inline-${editorDomScope}`
  const shellClassName = className ?? (surface === 'embedded' ? 'rounded-none border-0 bg-transparent' : undefined)

  function setEditorEditing(nextEditing: boolean) {
    if (editing === undefined) setUncontrolledIsEditing(nextEditing)
    onEditingChange?.(nextEditing)
  }

  const {
    lockedFields,
    lookupOptions,
    sourceLock,
    sourceLockReason,
  } = useSemanticEntityInlineEditorLookups({
    projectId,
    config,
    record,
    form,
    externalLookupOptions,
    customSaveRecord: Boolean(saveRecord),
  })

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
