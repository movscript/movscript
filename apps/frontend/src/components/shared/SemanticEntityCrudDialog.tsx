import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Clapperboard, Route, SlidersHorizontal, Trash2 } from 'lucide-react'

import { createSemanticEntity, deleteSemanticEntity, getSourceLockStatus, listSemanticEntities, semanticEntityConfig, updateSemanticEntity, type SemanticEntityConfig, type SemanticEntityPayload, type SemanticEntityRecord, type SourceLockStatus } from '@/api/semanticEntities'
import { toast } from '@/store/toastStore'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Textarea } from '@movscript/ui'

type Mode = 'create' | 'edit'

interface SemanticEntityCrudDialogProps {
  open: boolean
  mode: Mode
  projectId?: number
  config: SemanticEntityConfig
  record?: SemanticEntityRecord | null
  defaults?: Partial<SemanticEntityPayload>
  queryKey?: readonly unknown[]
  title?: string
  onOpenChange: (open: boolean) => void
  onSaved?: (record: SemanticEntityRecord) => void
  onDeleted?: () => void
}

type FormState = Record<string, string | boolean>

export function SemanticEntityCrudDialog({
  open,
  mode,
  projectId,
  config,
  record,
  defaults,
  queryKey,
  title,
  onOpenChange,
  onSaved,
  onDeleted,
}: SemanticEntityCrudDialogProps) {
  const queryClient = useQueryClient()
  const fields = useMemo(() => config.fields.filter((field) => mode === 'create' || !field.createOnly), [config.fields, mode])
  const quickCreateFieldKeys = useMemo(() => mode === 'create' ? quickCreatePrimaryFields(config.kind) : null, [config.kind, mode])
  const basicFields = useMemo(() => fields.filter((field) => {
    if (!quickCreateFieldKeys) return !isAdvancedField(config.kind, field.key)
    return field.required || quickCreateFieldKeys.has(field.key)
  }), [config.kind, fields, quickCreateFieldKeys])
  const advancedFields = useMemo(() => fields.filter((field) => {
    if (!quickCreateFieldKeys) return isAdvancedField(config.kind, field.key)
    return !field.required && !quickCreateFieldKeys.has(field.key)
  }), [config.kind, fields, quickCreateFieldKeys])
  const [form, setForm] = useState<FormState>(() => buildInitialForm(fields, record, defaults))
  const [showAdvanced, setShowAdvanced] = useState(false)
  const quickCreate = Boolean(quickCreateFieldKeys)
  const enableScriptBlockLookups = (config.kind === 'contentUnits' || config.kind === 'segments' || config.kind === 'sceneMoments') && Boolean(projectId)
  const canDeleteRecord = !isDeleteProtectedKind(config.kind)
  const isImmutableRecord = mode === 'edit' && isImmutableKind(config.kind)
  const sourceLockEnabled = mode === 'edit' && Boolean(projectId && record?.ID && sourceLockSupportedKind(config.kind))

  const { data: scriptBlocks = [] } = useQuery({
    queryKey: ['semantic-crud-dialog', projectId, 'script-blocks'],
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

  const lookupOptions = useMemo(() => {
    if (!enableScriptBlockLookups) return {}
    return {
      script_block_id: scriptBlocks.map((item) => ({
        value: String(item.ID),
        label: formatScriptBlockOption(item),
      })),
    } as Record<string, Array<{ value: string; label: string }>>
  }, [enableScriptBlockLookups, scriptBlocks])

  useEffect(() => {
    if (open) {
      setForm(buildInitialForm(fields, record, defaults))
      setShowAdvanced(mode === 'edit' && advancedFields.some((field) => hasFieldValue(record?.[field.key] ?? defaults?.[field.key])))
    }
  }, [defaults, fields, open, record])

  const createMutation = useMutation({
    mutationFn: (payload: SemanticEntityPayload) => createSemanticEntity(projectId!, config, payload),
    onSuccess: (saved) => {
      invalidate()
      toast.success(`${config.label}已创建`)
      onSaved?.(saved)
      onOpenChange(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: SemanticEntityPayload) => updateSemanticEntity(projectId!, config, record!.ID, payload),
    onSuccess: (saved) => {
      invalidate()
      toast.success(`${config.label}已保存`)
      onSaved?.(saved)
      onOpenChange(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteSemanticEntity(projectId!, config, record!.ID),
    onSuccess: () => {
      invalidate()
      toast.success(`${config.label}已删除`)
      onDeleted?.()
      onOpenChange(false)
    },
  })

  const saving = createMutation.isPending || updateMutation.isPending

  function invalidate() {
    if (queryKey) queryClient.invalidateQueries({ queryKey })
    queryClient.invalidateQueries({ queryKey: [config.kind, projectId] })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!projectId) return
    const payload = buildPayload(fields, form)
    if (mode === 'create') createMutation.mutate(payload)
    else if (record) updateMutation.mutate(payload)
  }

  function remove() {
    if (!projectId || !record) return
    if (!window.confirm(`确定删除这个${config.label}吗？`)) return
    deleteMutation.mutate()
  }

  const dialogTitle = title ?? (mode === 'create' ? `新建${config.label}` : `编辑${config.label}`)
  const description = (quickCreate ? quickCreateDescription(config.kind) : null) ?? dialogDescription(config.kind, config.description)
  const icon = quickCreateIcon(config.kind)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${quickCreate ? 'w-[560px]' : 'w-[720px]'} max-h-[86vh] max-w-[calc(100vw-32px)] overflow-hidden`}>
        <form onSubmit={submit} className="flex max-h-[82vh] flex-col">
          <DialogHeader className={quickCreate ? 'rounded-lg border border-border bg-muted/30 p-4' : undefined}>
            <div className="flex items-start gap-3">
              {icon ? (
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground shadow-sm">
                  {icon}
                </span>
              ) : null}
              <div className="min-w-0">
                <DialogTitle>{dialogTitle}</DialogTitle>
                <DialogDescription className={quickCreate ? 'mt-1.5 leading-5' : undefined}>{description}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto py-4">
            {config.requiredHint && mode === 'create' && !quickCreate ? (
              <p className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">{config.requiredHint}</p>
            ) : null}
            {sourceLock?.locked ? (
              <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200">来源已锁定</p>
                <p className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300">
                  {sourceLockReason}。已锁定字段：{sourceLock.locked_fields.map((key) => fieldLabel(fields, key)).join('、')}；标题、描述、状态等非来源内容仍可继续编辑。
                </p>
              </div>
            ) : null}
            <div className={quickCreate ? 'grid gap-3' : 'grid gap-4 md:grid-cols-2'}>
              {basicFields.map((field) => (
                <FieldControl
                  key={field.key}
                  configKind={config.kind}
                  field={field}
                  value={form[field.key]}
                  optionsOverride={lookupOptions[field.key]}
                  locked={lockedFields.has(field.key)}
                  lockReason={sourceLockReason}
                  onChange={(value) => setForm((prev) => ({ ...prev, [field.key]: value }))}
                />
              ))}
            </div>
            {advancedFields.length > 0 ? (
              <div className={quickCreate ? 'mt-4 rounded-lg border border-border bg-muted/20' : 'mt-5 rounded-md border border-border bg-muted/20'}>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((value) => !value)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm text-foreground"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <SlidersHorizontal size={14} className="shrink-0 text-muted-foreground" />
                    <span className="font-medium">{quickCreate ? '更多字段' : '高级选项'}</span>
                    <span className="truncate text-xs text-muted-foreground">{advancedHint(config.kind, quickCreate)}</span>
                  </span>
                  <ChevronDown size={15} className={showAdvanced ? 'rotate-180 transition-transform' : 'transition-transform'} />
                </button>
                {showAdvanced ? (
                  <div className="grid gap-4 border-t border-border p-3 md:grid-cols-2">
                    {advancedFields.map((field) => (
                      <FieldControl
                        key={field.key}
                        configKind={config.kind}
                        field={field}
                        value={form[field.key]}
                        optionsOverride={lookupOptions[field.key]}
                        advanced
                        locked={lockedFields.has(field.key)}
                        lockReason={sourceLockReason}
                        onChange={(value) => setForm((prev) => ({ ...prev, [field.key]: value }))}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2">
            {mode === 'edit' && record && canDeleteRecord ? (
              <Button type="button" variant="destructive" onClick={remove} loading={deleteMutation.isPending} className="mr-auto gap-2">
                <Trash2 size={14} />
                删除
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            {isImmutableRecord ? null : <Button type="submit" loading={saving}>{mode === 'create' ? '创建' : '保存'}</Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FieldControl({
  configKind,
  field,
  value,
  optionsOverride,
  locked = false,
  lockReason,
  advanced = false,
  onChange,
}: {
  configKind: SemanticEntityConfig['kind']
  field: SemanticEntityConfig['fields'][number]
  value: string | boolean
  optionsOverride?: Array<{ value: string; label: string }>
  locked?: boolean
  lockReason?: string
  advanced?: boolean
  onChange: (value: string | boolean) => void
}) {
  const common = {
    id: `semantic-${configKind}-${field.key}`,
    required: field.required,
    disabled: locked,
  }

  return (
    <div className={field.type === 'textarea' ? 'md:col-span-2' : undefined}>
      <Label htmlFor={common.id} required={field.required}>{field.label}</Label>
      <div className="mt-1.5">
        {field.type === 'textarea' ? (
          <Textarea
            {...common}
            value={String(value ?? '')}
            rows={field.key.endsWith('_json') ? 5 : advanced ? 3 : 4}
            placeholder={field.placeholder}
            className={field.key.endsWith('_json') ? 'font-mono text-xs' : undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : field.type === 'select' || optionsOverride ? (
          <select
            {...common}
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
          <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={Boolean(value)}
              disabled={locked}
              onChange={(event) => onChange(event.target.checked)}
            />
            启用
          </label>
        ) : (
          <Input
            {...common}
            type={field.type === 'number' ? 'number' : 'text'}
            step={field.type === 'number' ? 'any' : undefined}
            value={String(value ?? '')}
            placeholder={field.placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </div>
      {locked && lockReason ? (
        <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">{lockReason}</p>
      ) : field.helper ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{field.helper}</p>
      ) : null}
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
    kind === 'contentUnits'
}

function formatScriptBlockOption(record: SemanticEntityRecord) {
  const startLine = record.start_line || '?'
  const endLine = record.end_line || '?'
  const content = String(record.content ?? '').trim().replace(/\s+/g, ' ')
  const excerpt = content.length > 40 ? `${content.slice(0, 40)}...` : content
  return [`剧本块 #${record.ID}`, `行 ${startLine}-${endLine}`, record.speaker || record.kind, excerpt].filter(Boolean).join(' · ')
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

function quickCreatePrimaryFields(kind: SemanticEntityConfig['kind']) {
  if (kind === 'segments' || kind === 'sceneMoments') return new Set(['title'])
  return null
}

function quickCreateIcon(kind: SemanticEntityConfig['kind']) {
  if (kind === 'segments') return <Route size={16} />
  if (kind === 'sceneMoments') return <Clapperboard size={16} />
  return null
}

function advancedHint(kind: SemanticEntityConfig['kind'], quickCreate: boolean) {
  if (!quickCreate) return '关联 ID、状态、排序和 JSON 元数据'
  if (kind === 'segments') return '类型、来源、顺序和功能说明可稍后补充'
  if (kind === 'sceneMoments') return '所属段落、时间地点、动作和情绪可稍后补充'
  return '关联、状态、排序和 JSON 元数据'
}

function quickCreateDescription(kind: SemanticEntityConfig['kind']) {
  if (kind === 'segments') return '先填写标题即可创建情绪段；类型、来源和功能说明可以稍后补充。'
  if (kind === 'sceneMoments') return '先填写标题即可创建情节；所属情绪段、时空、动作和情绪可以稍后补充。'
  return null
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

function dialogDescription(kind: SemanticEntityConfig['kind'], fallback: string) {
  if (kind === 'productions') return '创建一个制作主体。可以先不绑定剧本、brief 或预览，后续再把制作项、素材和成片挂载到这个制作下。'
  if (kind === 'contentUnits') return '描述这项内容要生成什么。情景、编排段、排序和 JSON 可在高级选项中维护。'
  if (kind === 'assetSlots') return '描述生产还缺什么素材。归属关系、锁定素材需求和 JSON 可在高级选项中维护。'
  return fallback
}

function hasFieldValue(value: unknown) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'boolean') return value
  return true
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

function isImmutableKind(kind: SemanticEntityConfig['kind']) {
  return kind === 'scriptVersions' || kind === 'storyboardVersions'
}

function isDeleteProtectedKind(kind: SemanticEntityConfig['kind']) {
  return isImmutableKind(kind) || kind === 'scriptBlocks'
}
