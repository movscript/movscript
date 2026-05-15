import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Save, Trash2, X } from 'lucide-react'

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
} from '@/api/semanticEntities'
import { cn } from '@/lib/utils'
import { toast } from '@/store/toastStore'
import { Button, Input, Label, Textarea } from '@movscript/ui'

type FormState = Record<string, string | boolean>

interface SemanticEntityInlineEditorProps {
  projectId?: number
  config: SemanticEntityConfig
  record?: SemanticEntityRecord | null
  defaults?: Partial<SemanticEntityPayload>
  queryKey?: readonly unknown[]
  title?: string
  description?: string
  emptyTitle?: string
  emptyDescription?: string
  className?: string
  hero?: SemanticEntityInlineEditorHero
  editKey?: string | number | null
  onSaved?: (record: SemanticEntityRecord) => void
  onDeleted?: (record: SemanticEntityRecord) => void
}

interface SemanticEntityInlineEditorHero {
  icon?: ReactNode
  eyebrow?: ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  summary?: ReactNode
  accentClassName?: string
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
  emptyTitle = '未选择对象',
  emptyDescription = '从左侧列表选择一个对象后，可直接在卡片内编辑。',
  className,
  hero,
  editKey,
  onSaved,
  onDeleted,
}: SemanticEntityInlineEditorProps) {
  const queryClient = useQueryClient()
  const fields = useMemo(() => config.fields.filter((field) => !field.createOnly), [config.fields])
  const basicFields = useMemo(() => fields.filter((field) => !isAdvancedField(config.kind, field.key)), [config.kind, fields])
  const advancedFields = useMemo(() => fields.filter((field) => isAdvancedField(config.kind, field.key)), [config.kind, fields])
  const [form, setForm] = useState<FormState>(() => buildInitialForm(fields, record, defaults))
  const [isEditing, setIsEditing] = useState(Boolean(!record))
  const enableCreativeReferenceLookups = config.kind === 'assetSlots' && Boolean(projectId)
  const enableScriptBlockLookups = (config.kind === 'contentUnits' || config.kind === 'segments' || config.kind === 'sceneMoments' || config.kind === 'storyboardLines') && Boolean(projectId)
  const canDeleteRecord = !isDeleteProtectedKind(config.kind)
  const isImmutableRecord = Boolean(record && isImmutableKind(config.kind))
  const sourceLockEnabled = Boolean(projectId && record?.ID && sourceLockSupportedKind(config.kind))

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
    setIsEditing(Boolean(!record || editKey))
  }, [defaults, editKey, fields, record])

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

  function updateField(key: string, value: string | boolean) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
      ...(config.kind === 'assetSlots' && key === 'creative_reference_id' && value !== prev.creative_reference_id
        ? { creative_reference_state_id: '' }
        : null),
    }))
  }

  if (!record && !defaults) {
    return (
      <section className={cn('rounded-lg border border-border bg-card p-4', className)}>
        <p className="text-sm font-semibold text-foreground">{emptyTitle}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{emptyDescription}</p>
      </section>
    )
  }

  if (hero) {
    return (
      <section className={cn('overflow-hidden rounded-lg border border-border bg-card', className)}>
        <div className={cn('border-b border-border bg-gradient-to-br p-5', hero.accentClassName ?? 'from-primary/15 via-primary/10 to-muted')}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-start gap-3">
                {hero.icon ? (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background/80 text-foreground shadow-sm">
                    {hero.icon}
                  </span>
                ) : null}
                <div className="min-w-0">
                  {hero.eyebrow ? <div className="text-xs text-muted-foreground">{hero.eyebrow}</div> : null}
                  <h2 className="mt-1 truncate text-xl font-semibold text-foreground">
                    {hero.title ?? title ?? `${record ? '编辑' : '新建'}${config.label}`}
                  </h2>
                  {hero.subtitle ? <div className="mt-1 text-xs text-muted-foreground">{hero.subtitle}</div> : null}
                </div>
              </div>
              {hero.summary ? <div className="mt-4 max-w-4xl text-sm leading-6 text-muted-foreground">{hero.summary}</div> : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2 text-right">
              {hero.status}
              {record && (!isEditing || isImmutableRecord) ? (
                <div className="flex items-center gap-2">
                  {isImmutableRecord ? null : <Button size="sm" variant="outline" className="shrink-0 gap-2 bg-background/80" onClick={() => setIsEditing(true)} disabled={deleteMutation.isPending}>
                    <Pencil size={14} />
                    编辑
                  </Button>}
                  {canDeleteRecord ? <Button type="button" size="sm" variant="destructive" className="shrink-0 gap-2" onClick={removeRecord} loading={deleteMutation.isPending}>
                    <Trash2 size={14} />
                    删除
                  </Button> : null}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {record && canDeleteRecord ? (
                    <Button type="button" size="sm" variant="destructive" className="shrink-0 gap-2" onClick={removeRecord} loading={deleteMutation.isPending}>
                      <Trash2 size={14} />
                      删除
                    </Button>
                  ) : null}
                  {record ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 gap-2 bg-background/80"
                      onClick={() => {
                        setForm(buildInitialForm(fields, record, defaults))
                        setIsEditing(false)
                      }}
                      disabled={saveMutation.isPending || deleteMutation.isPending}
                    >
                      <X size={14} />
                      取消
                    </Button>
                  ) : null}
                  <Button
                    form={`inline-${config.kind}-${record?.ID ?? 'new'}`}
                    size="sm"
                    className="shrink-0 gap-2"
                    loading={saveMutation.isPending}
                    disabled={!canSave || deleteMutation.isPending}
                  >
                    <Save size={14} />
                    保存
                  </Button>
                </div>
              )}
            </div>
          </div>
          {description ? <p className="mt-4 text-xs leading-5 text-muted-foreground">{description}</p> : null}
        </div>

        {hero.stats?.length ? (
          <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
            {hero.stats.map((stat) => (
              <div key={stat.label} className="rounded-md border border-border bg-background px-3 py-2.5">
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                <div className="mt-1 truncate text-sm font-semibold text-foreground">{stat.value}</div>
              </div>
            ))}
          </div>
        ) : null}

	        <form id={`inline-${config.kind}-${record?.ID ?? 'new'}`} onSubmit={submit} className="space-y-4 border-t border-border p-4">
	          {sourceLock?.locked ? <SourceLockNotice fields={fields} sourceLock={sourceLock} reason={sourceLockReason} /> : null}
	          <div className="grid gap-3 md:grid-cols-2">
	            {basicFields.map((field) => (
	              <FieldControl
                key={field.key}
                configKind={config.kind}
                field={field}
	                value={form[field.key]}
	                optionsOverride={lookupOptions[field.key]}
	                disabled={!!record && (!isEditing || isImmutableRecord || lockedFields.has(field.key))}
	                invalid={field.required && !isFieldFilled(form[field.key], field.type)}
	                lockReason={lockedFields.has(field.key) ? sourceLockReason : undefined}
	                onChange={(value) => updateField(field.key, value)}
	              />
            ))}
          </div>
          {advancedFields.length > 0 ? (
            <details className="overflow-hidden rounded-md border border-border bg-muted/20">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">全部字段</summary>
              <div className="grid gap-3 border-t border-border bg-card/50 p-3 md:grid-cols-2">
                {advancedFields.map((field) => (
                  <FieldControl
                    key={field.key}
                    configKind={config.kind}
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
              </div>
            </details>
          ) : null}
        </form>
      </section>
    )
  }

  return (
    <section className={cn('rounded-lg border border-border bg-card', className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title ?? `${record ? '编辑' : '新建'}${config.label}`}</p>
          {description ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p> : null}
          {(!isEditing || isImmutableRecord) && record && config.requiredHint ? <p className="mt-1 text-[11px] text-muted-foreground">{config.requiredHint}</p> : null}
        </div>
        {record && (!isEditing || isImmutableRecord) ? (
          <div className="flex shrink-0 items-center gap-2">
            {isImmutableRecord ? null : <Button size="sm" variant="outline" className="gap-2" onClick={() => setIsEditing(true)} disabled={deleteMutation.isPending}>
              <Pencil size={14} />
              编辑
            </Button>}
            {canDeleteRecord ? <Button type="button" size="sm" variant="destructive" className="gap-2" onClick={removeRecord} loading={deleteMutation.isPending}>
              <Trash2 size={14} />
              删除
            </Button> : null}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {record && canDeleteRecord ? (
              <Button type="button" size="sm" variant="destructive" className="shrink-0 gap-2" onClick={removeRecord} loading={deleteMutation.isPending}>
                <Trash2 size={14} />
                删除
              </Button>
            ) : null}
            {record ? (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-2"
                onClick={() => {
                  setForm(buildInitialForm(fields, record, defaults))
                  setIsEditing(false)
                }}
                disabled={saveMutation.isPending || deleteMutation.isPending}
              >
                <X size={14} />
                取消
              </Button>
            ) : null}
            <Button
              form={`inline-${config.kind}-${record?.ID ?? 'new'}`}
              size="sm"
              className="shrink-0 gap-2"
              loading={saveMutation.isPending}
              disabled={!canSave || deleteMutation.isPending}
            >
              <Save size={14} />
              保存
            </Button>
          </div>
        )}
      </div>
	      <form id={`inline-${config.kind}-${record?.ID ?? 'new'}`} onSubmit={submit} className="space-y-4 p-4">
	        {sourceLock?.locked ? <SourceLockNotice fields={fields} sourceLock={sourceLock} reason={sourceLockReason} /> : null}
	        <div className="grid gap-3">
	          {basicFields.map((field) => (
	            <FieldControl
              key={field.key}
              configKind={config.kind}
              field={field}
	              value={form[field.key]}
	              optionsOverride={lookupOptions[field.key]}
	              disabled={!!record && (!isEditing || isImmutableRecord || lockedFields.has(field.key))}
	              invalid={field.required && !isFieldFilled(form[field.key], field.type)}
	              lockReason={lockedFields.has(field.key) ? sourceLockReason : undefined}
	              onChange={(value) => updateField(field.key, value)}
	            />
          ))}
        </div>
        {advancedFields.length > 0 ? (
          <details className="rounded-md border border-border bg-muted/20">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">高级字段</summary>
            <div className="grid gap-3 border-t border-border p-3">
              {advancedFields.map((field) => (
                <FieldControl
                  key={field.key}
                  configKind={config.kind}
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
            </div>
          </details>
        ) : null}
      </form>
    </section>
  )
}

function FieldControl({
  configKind,
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
  field: SemanticEntityConfig['fields'][number]
  value: string | boolean
  optionsOverride?: Array<{ value: string; label: string }>
  advanced?: boolean
  disabled?: boolean
  invalid?: boolean
  lockReason?: string
  onChange: (value: string | boolean) => void
}) {
  const id = `semantic-inline-${configKind}-${field.key}`
  return (
    <div>
      <Label htmlFor={id} required={field.required}>{field.label}</Label>
      <div className="mt-1.5">
        {field.type === 'textarea' ? (
          <Textarea
            id={id}
            required={field.required}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            value={String(value ?? '')}
            rows={field.key.endsWith('_json') ? 5 : advanced ? 3 : 4}
            placeholder={field.placeholder}
            className={field.key.endsWith('_json') ? 'font-mono text-xs' : undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : field.type === 'select' || optionsOverride ? (
          <select
            id={id}
            required={field.required}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            value={String(value ?? '')}
            onChange={(event) => onChange(event.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">未设置</option>
            {(optionsOverride ?? field.options)?.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : field.type === 'boolean' ? (
          <label className={cn('flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm text-foreground', disabled ? 'border-border opacity-60' : 'border-border')}>
            <input type="checkbox" disabled={disabled} checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
            启用
          </label>
        ) : (
          <Input
            id={id}
            required={field.required}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            type={field.type === 'number' ? 'number' : 'text'}
            step={field.type === 'number' ? 'any' : undefined}
            value={String(value ?? '')}
            placeholder={field.placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </div>
      {lockReason ? (
        <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">{lockReason}</p>
      ) : field.helper ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{field.helper}</p>
      ) : null}
    </div>
  )
}

function SourceLockNotice({ fields, sourceLock, reason }: { fields: SemanticEntityConfig['fields']; sourceLock: SourceLockStatus; reason?: string }) {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
      <p className="text-xs font-medium text-amber-800 dark:text-amber-200">来源已锁定</p>
      <p className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300">
        {reason ?? '已有下游对象引用当前记录'}。已锁定字段：{sourceLock.locked_fields.map((key) => fieldLabel(fields, key)).join('、')}；其他内容仍可继续编辑。
      </p>
    </div>
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
    kind === 'storyboardLines' ||
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
  contentUnits: ['production_id', 'segment_id', 'scene_moment_id', 'storyboard_line_id', 'script_block_id'],
  storyboardLines: ['storyboard_script_id', 'storyboard_version_id', 'segment_id', 'scene_moment_id', 'script_block_id'],
  keyframes: ['scene_moment_id', 'content_unit_id'],
}

const advancedFieldsByKind: Partial<Record<SemanticEntityConfig['kind'], string[]>> = {
  productions: ['script_version_id', 'preview_timeline_id', 'progress'],
  sceneMoments: ['segment_id', 'script_block_id'],
  contentUnits: ['production_id', 'segment_id', 'scene_moment_id', 'storyboard_line_id', 'script_block_id'],
  storyboardLines: ['storyboard_script_id', 'storyboard_version_id', 'segment_id', 'scene_moment_id', 'script_block_id'],
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
