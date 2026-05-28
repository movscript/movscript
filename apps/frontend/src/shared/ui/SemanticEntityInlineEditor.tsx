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
import { toast } from '@/shared/ui/toastStore'
import {
  AppDisclosure,
  DetailEntityEditorActions,
  DetailEntityEditorEmptyState,
  DetailEntityEditorHeader,
  DetailEntityEditorHero,
  DetailEntityEditorShell,
  DetailEntityFieldControl,
  DetailEntityFieldGrid,
  DetailEntityForm,
  DetailEntityHorizontalRail,
  DetailEntitySourceLockNotice,
  type AccentTone,
} from '@movscript/ui'

type FormState = Record<string, string | boolean>

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
  const [form, setForm] = useState<FormState>(() => buildInitialForm(fields, record, defaults))
  const [uncontrolledIsEditing, setUncontrolledIsEditing] = useState(Boolean(!record))
  const isEditing = editing ?? uncontrolledIsEditing
  const enableCreativeReferenceLookups = config.kind === 'assetSlots' && Boolean(projectId)
  const enableScriptBlockLookups = (config.kind === 'contentUnits' || config.kind === 'segments' || config.kind === 'sceneMoments') && Boolean(projectId)
  const canDeleteRecord = !hideDeleteAction && !isDeleteProtectedKind(config.kind)
  const isImmutableRecord = Boolean(record && isImmutableKind(config.kind))
  const sourceLockEnabled = Boolean(projectId && record?.ID && sourceLockSupportedKind(config.kind))
  const editorDomScope = idScope ?? `${config.kind}-${record?.ID ?? 'new'}`
  const formId = `inline-${editorDomScope}`
  const shellClassName = className ?? (surface === 'embedded' ? 'rounded-none border-0 bg-transparent' : undefined)

  function setEditorEditing(nextEditing: boolean) {
    if (editing === undefined) setUncontrolledIsEditing(nextEditing)
    onEditingChange?.(nextEditing)
  }

  const { data: creativeReferences = [] } = useQuery({
    queryKey: ['semantic-inline-editor', projectId, 'creative-references'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('creativeReferences')),
    enabled: enableCreativeReferenceLookups,
  })

  const { data: creativeReferenceStates = [] } = useQuery({
    queryKey: ['semantic-inline-editor', projectId, 'creative-reference-states'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('creativeReferenceStates')),
    enabled: enableCreativeReferenceLookups,
  })

  const { data: scriptBlocks = [] } = useQuery({
    queryKey: ['semantic-inline-editor', projectId, 'script-blocks'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('scriptBlocks')),
    enabled: enableScriptBlockLookups,
  })

  const { data: sourceLock } = useQuery<SourceLockStatus>({
    queryKey: ['semantic-source-lock', projectId, config.kind, record?.ID],
    queryFn: () => getSourceLockStatus(projectId!, config, record!.ID),
    enabled: sourceLockEnabled,
  })

  const lockedFields = useMemo(() => new Set(sourceLock?.locked_fields ?? []), [sourceLock])
  const sourceLockReason = sourceLockReasonText(sourceLock)

  const referenceById = useMemo(() => new Map(creativeReferences.map((item) => [item.ID, item])), [creativeReferences])
  const lookupOptions = useMemo(() => {
    const options: Record<string, Array<{ value: string; label: string }>> = {}
    if (enableCreativeReferenceLookups) {
      const selectedReferenceId = Number(String(form.creative_reference_id ?? '').trim()) || 0
      const states = selectedReferenceId
        ? creativeReferenceStates.filter((item) => Number(item.creative_reference_id) === selectedReferenceId)
        : creativeReferenceStates
      options.creative_reference_id = creativeReferences.map((item) => ({
        value: String(item.ID),
        label: formatCreativeReferenceOption(item),
      }))
      options.creative_reference_state_id = states.map((item) => ({
        value: String(item.ID),
        label: formatCreativeReferenceStateOption(item, referenceById.get(Number(item.creative_reference_id))),
      }))
    }
    if (enableScriptBlockLookups) {
      options.script_block_id = scriptBlocks.map((item) => ({
        value: String(item.ID),
        label: formatScriptBlockOption(item),
      }))
    }
    return options
  }, [creativeReferenceStates, creativeReferences, enableCreativeReferenceLookups, enableScriptBlockLookups, form.creative_reference_id, referenceById, scriptBlocks])

  useEffect(() => {
    setForm(buildInitialForm(fields, record, defaults))
    setEditorEditing(Boolean(!record || editKey))
  }, [defaults, editKey, fields, record, resetToken])

  const missingRequiredFields = useMemo(() => fields.filter((field) => field.required && !isFieldFilled(form[field.key], field.type)), [fields, form])
  const canSave = Boolean(projectId) && !isImmutableRecord && missingRequiredFields.length === 0 && (isEditing || !record)

  const saveMutation = useMutation({
    mutationFn: (payload: SemanticEntityPayload) => {
      if (!projectId) throw new Error('missing project id')
      return record
        ? updateSemanticEntity(projectId, config, record.ID, payload)
        : createSemanticEntity(projectId, config, payload)
    },
    onSuccess: (saved) => {
      if (queryKey) queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: [config.kind, projectId] })
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
      if (queryKey) queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: [config.kind, projectId] })
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
      ...(config.kind === 'assetSlots' && key === 'creative_reference_id' && value !== prev.creative_reference_id
        ? { creative_reference_state_id: '' }
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
          {sourceLock?.locked ? <SourceLockNotice fields={fields} sourceLock={sourceLock} reason={sourceLockReason} /> : null}
          <DetailEntityFieldGrid columns="responsive">
            {basicFields.map((field) => (
              <FieldControl
                key={field.key}
                configKind={config.kind}
                idScope={idScope}
                field={field}
                value={form[field.key]}
                optionsOverride={lookupOptions[field.key]}
                disabled={!!record && (!isEditing || isImmutableRecord || lockedFields.has(field.key))}
                invalid={field.required && !isFieldFilled(form[field.key], field.type)}
                lockReason={lockedFields.has(field.key) ? sourceLockReason : undefined}
                onChange={(value) => updateField(field.key, value)}
              />
            ))}
          </DetailEntityFieldGrid>
          {advancedFields.length > 0 ? (
            <AppDisclosure title="全部字段" bodyClassName="detail-entity-field-grid" className="detail-entity-field-grid--advanced">
              {advancedFields.map((field) => (
                <FieldControl
                  key={field.key}
                  configKind={config.kind}
                  idScope={idScope}
                  field={field}
                  advanced
                  value={form[field.key]}
                  optionsOverride={lookupOptions[field.key]}
                  disabled={!!record && (!isEditing || isImmutableRecord || lockedFields.has(field.key))}
                  invalid={field.required && !isFieldFilled(form[field.key], field.type)}
                  lockReason={lockedFields.has(field.key) ? sourceLockReason : undefined}
                  onChange={(value) => updateField(field.key, value)}
                />
              ))}
            </AppDisclosure>
          ) : null}
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
        {sourceLock?.locked ? <SourceLockNotice fields={fields} sourceLock={sourceLock} reason={sourceLockReason} /> : null}
        <DetailEntityFieldGrid>
          {basicFields.map((field) => (
            <FieldControl
              key={field.key}
              configKind={config.kind}
              idScope={idScope}
              field={field}
              value={form[field.key]}
              optionsOverride={lookupOptions[field.key]}
              disabled={!!record && (!isEditing || isImmutableRecord || lockedFields.has(field.key))}
              invalid={field.required && !isFieldFilled(form[field.key], field.type)}
              lockReason={lockedFields.has(field.key) ? sourceLockReason : undefined}
              onChange={(value) => updateField(field.key, value)}
            />
          ))}
        </DetailEntityFieldGrid>
        {advancedFields.length > 0 ? (
          <AppDisclosure title="高级字段" bodyClassName="detail-entity-field-grid">
            {advancedFields.map((field) => (
              <FieldControl
                key={field.key}
                configKind={config.kind}
                idScope={idScope}
                field={field}
                advanced
                value={form[field.key]}
                optionsOverride={lookupOptions[field.key]}
                disabled={!!record && (!isEditing || isImmutableRecord || lockedFields.has(field.key))}
                invalid={field.required && !isFieldFilled(form[field.key], field.type)}
                lockReason={lockedFields.has(field.key) ? sourceLockReason : undefined}
                onChange={(value) => updateField(field.key, value)}
              />
            ))}
          </AppDisclosure>
        ) : null}
      </DetailEntityForm> : null}
    </DetailEntityEditorShell>
  )
}

function FieldControl({
  configKind,
  idScope,
  field,
  value,
  optionsOverride,
  advanced = false,
  disabled = false,
  invalid = false,
  lockReason,
  onChange,
}: {
  configKind: SemanticEntityConfig['kind']
  idScope?: string
  field: SemanticEntityConfig['fields'][number]
  value: string | boolean
  optionsOverride?: Array<{ value: string; label: string }>
  advanced?: boolean
  disabled?: boolean
  invalid?: boolean
  lockReason?: string
  onChange: (value: string | boolean) => void
}) {
  const id = `semantic-inline-${idScope ?? configKind}-${field.key}`
  return (
    <DetailEntityFieldControl
      id={id}
      field={field}
      value={value}
      optionsOverride={optionsOverride}
      advanced={advanced}
      disabled={disabled}
      invalid={invalid}
      lockReason={lockReason}
      onChange={onChange}
    />
  )
}

function SourceLockNotice({ fields, sourceLock, reason }: { fields: SemanticEntityConfig['fields']; sourceLock: SourceLockStatus; reason?: string }) {
  return (
    <DetailEntitySourceLockNotice
      reason={reason ?? '已有下游对象引用当前记录'}
      fieldsText={sourceLock.locked_fields.map((key) => fieldLabel(fields, key)).join('、')}
      suffix="其他内容仍可继续编辑。"
    />
  )
}

function fieldLabel(fields: SemanticEntityConfig['fields'], key: string) {
  return fields.find((field) => field.key === key)?.label ?? key
}

function sourceLockReasonText(status?: SourceLockStatus) {
  if (!status?.locked) return undefined
  const first = status.reasons[0]
  if (!first) return '来源已锁定，已有下游对象引用当前记录'
  const more = status.reasons.length > 1 ? ` 等 ${status.reasons.length} 类下游对象` : ''
  return `${first.message}${more}`
}

function sourceLockSupportedKind(kind: SemanticEntityConfig['kind']) {
  return kind === 'productions' ||
    kind === 'segments' ||
    kind === 'sceneMoments' ||
    kind === 'storyboardScripts' ||
    kind === 'contentUnits'
}

function formatCreativeReferenceOption(record: SemanticEntityRecord) {
  return [record.name || record.title || `设定资料 #${record.ID}`, kindLabel(record.kind), `#${record.ID}`].filter(Boolean).join(' · ')
}

function formatCreativeReferenceStateOption(record: SemanticEntityRecord, reference?: SemanticEntityRecord) {
  const scope = [record.scope_type, record.scope_id ? `#${record.scope_id}` : null].filter(Boolean).join(' ')
  const referenceName = reference?.name || reference?.title
  return [record.name || `状态 #${record.ID}`, referenceName, scope, `#${record.ID}`].filter(Boolean).join(' · ')
}

function formatScriptBlockOption(record: SemanticEntityRecord) {
  const startLine = record.start_line || '?'
  const endLine = record.end_line || '?'
  const content = String(record.content ?? '').trim().replace(/\s+/g, ' ')
  const excerpt = content.length > 40 ? `${content.slice(0, 40)}...` : content
  return [`剧本块 #${record.ID}`, `行 ${startLine}-${endLine}`, record.speaker || record.kind, excerpt].filter(Boolean).join(' · ')
}

function kindLabel(kind: unknown) {
  const labels: Record<string, string> = {
    person: '人物',
    place: '地点',
    prop: '道具',
    product: '产品',
    brand: '品牌',
    style: '风格',
    world_rule: '世界规则',
    time_period: '时间段',
    restriction: '限制',
  }
  const key = String(kind ?? '')
  return labels[key] ?? key
}

function isAdvancedField(kind: SemanticEntityConfig['kind'], key: string) {
  if (key.endsWith('_json') || key.endsWith('Json')) return true
  if (key === 'metadata_json' || key === 'profile_json' || key === 'tags_json' || key === 'snapshot_json' || key === 'value_json') return true
  if (key === 'order' || key === 'status' || key === 'source' || key === 'source_type' || key === 'source_id') return true
  if (key === 'slot_key' || key === 'locked_asset_slot_id') return true
  if (key === 'owner_type' || key === 'owner_id') return true
  if (key.endsWith('_id') && !basicIdFieldsByKind[kind]?.includes(key)) return true
  return advancedFieldsByKind[kind]?.includes(key) ?? false
}

const basicIdFieldsByKind: Partial<Record<SemanticEntityConfig['kind'], string[]>> = {
  productions: ['script_version_id', 'preview_timeline_id'],
  sceneMoments: ['segment_id', 'script_block_id'],
  contentUnits: ['production_id', 'segment_id', 'scene_moment_id', 'script_block_id'],
  keyframes: ['scene_moment_id', 'content_unit_id'],
}

const advancedFieldsByKind: Partial<Record<SemanticEntityConfig['kind'], string[]>> = {
  productions: ['script_version_id', 'preview_timeline_id', 'progress'],
  sceneMoments: ['segment_id', 'script_block_id'],
  contentUnits: ['production_id', 'segment_id', 'scene_moment_id', 'script_block_id'],
  assetSlots: ['production_id', 'owner_type', 'owner_id', 'creative_reference_id', 'creative_reference_state_id', 'slot_key', 'locked_asset_slot_id'],
}

function buildInitialForm(fields: SemanticEntityConfig['fields'], record?: SemanticEntityRecord | null, defaults?: Partial<SemanticEntityPayload>): FormState {
  const source = record ?? defaults ?? {}
  return Object.fromEntries(fields.map((field) => {
    const raw = source[field.key] ?? defaultValueForField(field.type)
    return [field.key, field.type === 'boolean' ? Boolean(raw) : String(raw ?? '')]
  }))
}

function buildPayload(fields: SemanticEntityConfig['fields'], form: FormState): SemanticEntityPayload {
  const payload: SemanticEntityPayload = {}
  for (const field of fields) {
    const value = form[field.key]
    if (field.type === 'boolean') {
      payload[field.key] = Boolean(value)
      continue
    }
    if (field.type === 'number') {
      const raw = String(value ?? '').trim()
      payload[field.key] = raw === '' ? null : Number(raw)
      continue
    }
    payload[field.key] = String(value ?? '').trim()
  }
  return payload
}

function defaultValueForField(type: SemanticEntityConfig['fields'][number]['type']) {
  if (type === 'boolean') return false
  return ''
}

function isFieldFilled(value: string | boolean, type: SemanticEntityConfig['fields'][number]['type']) {
  if (type === 'boolean') return Boolean(value)
  return String(value ?? '').trim().length > 0
}

function isImmutableKind(kind: SemanticEntityConfig['kind']) {
  return kind === 'scriptVersions' || kind === 'storyboardVersions'
}

function isDeleteProtectedKind(kind: SemanticEntityConfig['kind']) {
  return isImmutableKind(kind) || kind === 'scriptBlocks'
}
