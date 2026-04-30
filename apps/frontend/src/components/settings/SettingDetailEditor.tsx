import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, GitBranch, Plus, Save, Tag, X } from 'lucide-react'
import { Button, Input, Label, Textarea } from '@movscript/ui'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Setting, SettingRelationship } from '@/types'

export const BUILT_IN_SETTING_TYPES = [
  { value: 'character', label: '人物' },
  { value: 'scene', label: '场景' },
  { value: 'prop', label: '道具' },
  { value: 'world_rule', label: '世界规则' },
  { value: 'organization', label: '组织' },
  { value: 'event', label: '事件' },
  { value: 'concept', label: '概念' },
]

const STATUS_OPTIONS = [
  { value: 'draft', label: '草稿' },
  { value: 'active', label: '当前' },
  { value: 'past', label: '过去' },
  { value: 'future', label: '未来' },
  { value: 'hidden', label: '隐藏' },
]

const RELATIONSHIP_TYPE_OPTIONS = [
  '关联',
  '属于',
  '包含',
  '依赖',
  '冲突',
  '同盟',
  '因果',
  '出现于',
]

interface SettingDetailEditorProps {
  setting: Setting
  projectId?: number
  className?: string
  onSaved?: () => void
}

export function SettingDetailEditor({
  setting,
  projectId = setting.project_id,
  className,
  onSaved,
}: SettingDetailEditorProps) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Partial<Setting>>({ ...setting })
  const [stableTagInput, setStableTagInput] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [stateInput, setStateInput] = useState('')

  useEffect(() => {
    setDraft({ ...setting })
    setStableTagInput('')
    setTagInput('')
    setStateInput('')
  }, [setting])

  const update = useMutation({
    mutationFn: (payload: Partial<Setting>) => api.put(`/settings/${setting.ID}`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', projectId] })
      onSaved?.()
    },
  })

  const stableTags = useMemo(() => parseTags(draft.tags), [draft.tags])
  const stateTags = useMemo(() => normalizeStateTags(draft.state_tags, draft.status), [draft.state_tags, draft.status])
  const typeValue = String(draft.type ?? '')
  const statusValue = normalizeStatus(draft.status)
  const stateOptions = useMemo(() => buildStateOptions(stateTags, statusValue), [stateTags, statusValue])
  const currentTags = stateTags[statusValue] ?? []

  function setField<K extends keyof Setting>(key: K, value: Setting[K] | string | undefined) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function setStatus(nextStatus: string) {
    const normalized = normalizeStatus(nextStatus)
    setDraft((current) => ({
      ...current,
      status: normalized,
      state_tags: JSON.stringify(ensureStateTags(normalizeStateTags(current.state_tags, current.status), normalized)),
    }))
  }

  function setCurrentStateTags(nextTags: string[]) {
    const normalizedTags = dedupeTags(nextTags)
    const nextStateTags = { ...stateTags, [statusValue]: normalizedTags }
    setDraft((current) => ({
      ...current,
      state_tags: JSON.stringify(nextStateTags),
    }))
  }

  function setStableTags(nextTags: string[]) {
    setDraft((current) => ({ ...current, tags: JSON.stringify(dedupeTags(nextTags)) }))
  }

  function addStableTag() {
    const next = stableTagInput.trim()
    if (!next || stableTags.includes(next)) return
    setStableTags([...stableTags, next])
    setStableTagInput('')
  }

  function addTag() {
    const next = tagInput.trim()
    if (!next || currentTags.includes(next)) return
    setCurrentStateTags([...currentTags, next])
    setTagInput('')
  }

  function addState() {
    const next = stateInput.trim()
    if (!next) return
    setDraft((current) => ({
      ...current,
      status: next,
      state_tags: JSON.stringify(ensureStateTags(normalizeStateTags(current.state_tags, current.status), next)),
    }))
    setStateInput('')
  }

  function save() {
    const nextStateTags = ensureStateTags(stateTags, statusValue)
    update.mutate({
      name: String(draft.name ?? '').trim(),
      type: typeValue.trim(),
      status: statusValue === 'draft' && !String(draft.status ?? '').trim() ? '' : statusValue,
      tags: JSON.stringify(stableTags),
      state_tags: JSON.stringify(nextStateTags),
      description: String(draft.description ?? ''),
      content: String(draft.content ?? ''),
      alias: String(draft.alias ?? ''),
      importance: String(draft.importance ?? ''),
      profile_json: String(draft.profile_json ?? ''),
    })
  }

  return (
    <div className={cn('space-y-5', className)}>
      <section className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div>
            <Label className="mb-1 text-xs font-medium text-muted-foreground">名称</Label>
            <Input
              value={String(draft.name ?? '')}
              onChange={(event) => setField('name', event.target.value)}
              placeholder="唯一物名称"
            />
          </div>
          <div>
            <Label className="mb-1 text-xs font-medium text-muted-foreground">当前状态</Label>
            <Input
              list="setting-status-options"
              value={statusValue}
              onChange={(event) => setStatus(event.target.value)}
              placeholder="自定义状态"
            />
            <datalist id="setting-status-options">
              {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </datalist>
          </div>
        </div>

        <div>
          <Label className="mb-1 text-xs font-medium text-muted-foreground">类型</Label>
          <div className="flex flex-wrap gap-2">
            {BUILT_IN_SETTING_TYPES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setField('type', item.value)}
                className={cn(
                  'rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                  typeValue === item.value
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:border-ring hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
            <Input
              className="h-8 w-44 text-xs"
              value={typeValue}
              onChange={(event) => setField('type', event.target.value)}
              placeholder="自定义类型"
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Tag size={12} />
              固定标签
            </Label>
          </div>
          <div className="flex flex-wrap gap-2 rounded-md border border-border p-2">
            {stableTags.map((tag) => (
              <span key={tag} className="inline-flex h-7 items-center gap-1 rounded-md bg-muted px-2 text-xs text-foreground">
                {tag}
                <button type="button" onClick={() => setStableTags(stableTags.filter((item) => item !== tag))} className="text-muted-foreground hover:text-foreground">
                  <X size={11} />
                </button>
              </span>
            ))}
            <Input
              className="h-7 min-w-32 flex-1 border-0 px-1 text-xs shadow-none focus-visible:ring-0"
              value={stableTagInput}
              onChange={(event) => setStableTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addStableTag()
                }
              }}
              placeholder="输入固定标签后回车"
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Tag size={12} />
              状态与状态标签
            </Label>
            <div className="flex min-w-0 items-center gap-2">
              <Input
                className="h-8 w-36 text-xs"
                value={stateInput}
                onChange={(event) => setStateInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addState()
                  }
                }}
                placeholder="新增状态"
              />
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={addState} disabled={!stateInput.trim()}>
                <Plus size={12} />
                状态
              </Button>
            </div>
          </div>
          <div className="mb-2 flex flex-wrap gap-2">
            {stateOptions.map((state) => (
              <button
                key={state}
                type="button"
                onClick={() => setStatus(state)}
                className={cn(
                  'rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                  state === statusValue
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:border-ring hover:text-foreground',
                )}
              >
                {settingStatusLabel(state)}
                <span className="ml-1 opacity-70">{stateTags[state]?.length ?? 0}</span>
              </button>
            ))}
          </div>
          <Label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Tag size={12} />
            {settingStatusLabel(statusValue)} 标签
          </Label>
          <div className="flex flex-wrap gap-2 rounded-md border border-border p-2">
            {currentTags.map((tag) => (
              <span key={tag} className="inline-flex h-7 items-center gap-1 rounded-md bg-muted px-2 text-xs text-foreground">
                {tag}
                <button type="button" onClick={() => setCurrentStateTags(currentTags.filter((item) => item !== tag))} className="text-muted-foreground hover:text-foreground">
                  <X size={11} />
                </button>
              </span>
            ))}
            <Input
              className="h-7 min-w-32 flex-1 border-0 px-1 text-xs shadow-none focus-visible:ring-0"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addTag()
                }
              }}
              placeholder="输入当前状态标签后回车"
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Label className="mb-1 text-xs font-medium text-muted-foreground">描述</Label>
            <Textarea
              className="resize-none"
              rows={4}
              value={String(draft.description ?? '')}
              onChange={(event) => setField('description', event.target.value)}
              placeholder="可选，用来说明这个唯一物是什么"
            />
          </div>
          <div>
            <Label className="mb-1 text-xs font-medium text-muted-foreground">备注</Label>
            <Textarea
              className="resize-none"
              rows={4}
              value={String(draft.content ?? '')}
              onChange={(event) => setField('content', event.target.value)}
              placeholder="可选，保存更长的设定说明、规则或上下文"
            />
          </div>
        </div>

        <Button onClick={save} disabled={!String(draft.name ?? '').trim() || update.isPending} className="w-full gap-1.5" size="sm">
          <Save size={13} />
          {update.isPending ? '保存中' : '保存设定'}
        </Button>
      </section>

      <SettingRelationshipEditor projectId={projectId} setting={setting} />
    </div>
  )
}

export function settingTypeLabel(type?: string) {
  return BUILT_IN_SETTING_TYPES.find((item) => item.value === type)?.label ?? type ?? '未分类'
}

export function SettingTypeLabel({ type }: { type?: string }) {
  return <>{settingTypeLabel(type)}</>
}

function SettingRelationshipEditor({ projectId, setting }: { projectId: number; setting: Setting }) {
  const qc = useQueryClient()
  const [targetId, setTargetId] = useState<number | ''>('')
  const [type, setType] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    setTargetId('')
    setType('')
    setDescription('')
  }, [setting.ID])

  const { data: settings = [] } = useQuery<Setting[]>({
    queryKey: ['settings', projectId],
    queryFn: () => api.get(`/projects/${projectId}/settings`).then((r) => r.data),
    enabled: !!projectId,
  })

  const { data: relationships = [] } = useQuery<SettingRelationship[]>({
    queryKey: ['setting-relationships', projectId, 'setting', setting.ID],
    queryFn: () => api.get(`/projects/${projectId}/setting-relationships`).then((r) => r.data),
    enabled: !!projectId && !!setting.ID,
  })

  function invalidateRelationships() {
    qc.invalidateQueries({ queryKey: ['setting-relationships', projectId] })
    qc.invalidateQueries({ queryKey: ['setting-relationships', projectId, 'setting', setting.ID] })
  }

  const createRelationship = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/setting-relationships`, {
      source_setting_id: setting.ID,
      target_setting_id: targetId,
      category: 'relationship',
      type: type.trim(),
      label: type.trim(),
      description: description.trim(),
      source: 'manual',
    }).then((r) => r.data),
    onSuccess: () => {
      setTargetId('')
      setType('')
      setDescription('')
      invalidateRelationships()
    },
  })

  const updateRelationship = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SettingRelationship> }) => api.put(`/setting-relationships/${id}`, data).then((r) => r.data),
    onSuccess: invalidateRelationships,
  })

  const removeRelationship = useMutation({
    mutationFn: (id: number) => api.delete(`/setting-relationships/${id}`),
    onSuccess: invalidateRelationships,
  })

  const related = relationships.filter((relationship) => relationship.source_setting_id === setting.ID || relationship.target_setting_id === setting.ID)
  const targetSettings = settings.filter((item) => item.ID !== setting.ID)
  const relationshipTypes = Array.from(new Set([
    ...RELATIONSHIP_TYPE_OPTIONS,
    ...relationships.map((relationship) => relationship.type || relationship.label).filter(Boolean) as string[],
  ]))

  return (
    <section className="space-y-3 border-t border-border pt-5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <GitBranch size={13} />
        唯一物关系
      </div>

      <div className="grid gap-2 rounded-md border border-border p-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]">
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          value={targetId}
          onChange={(event) => setTargetId(Number(event.target.value) || '')}
        >
          <option value="">选择目标</option>
          {targetSettings.map((item) => (
            <option key={item.ID} value={item.ID}>{item.type || '未分类'} · {item.name}</option>
          ))}
        </select>
        <Input className="h-8 text-xs" list="setting-relationship-type-options" placeholder="关系类型，可直接新增" value={type} onChange={(event) => setType(event.target.value)} />
        <Input className="h-8 text-xs" placeholder="说明（可选）" value={description} onChange={(event) => setDescription(event.target.value)} />
        <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={!targetId || !type.trim() || createRelationship.isPending} onClick={() => createRelationship.mutate()}>
          <Plus size={12} />
          添加
        </Button>
      </div>

      <datalist id="setting-relationship-type-options">
        {relationshipTypes.map((option) => <option key={option} value={option} />)}
      </datalist>

      {related.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
          暂无关系。选择目标后输入关系类型即可添加，关系类型会自动沉淀为可复用选项。
        </div>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {related.map((relationship) => {
            const isOutgoing = relationship.source_setting_id === setting.ID
            const peer = isOutgoing ? relationship.target_setting : relationship.source_setting
            return (
              <div key={relationship.ID} className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 text-sm">
                    <span className="font-medium text-foreground">{isOutgoing ? setting.name : peer?.name ?? relationship.source_setting_id}</span>
                    <span className="mx-2 text-muted-foreground">{isOutgoing ? '->' : '<-'}</span>
                    <span className="font-medium text-foreground">{isOutgoing ? peer?.name ?? relationship.target_setting_id : setting.name}</span>
                    {(relationship.type || relationship.label) && <span className="ml-2 text-xs text-muted-foreground">{relationship.type || relationship.label}</span>}
                  </div>
                  <button type="button" onClick={() => removeRelationship.mutate(relationship.ID)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <X size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <Input className="h-8 text-xs" list="setting-relationship-type-options" placeholder="关系类型" defaultValue={relationship.type ?? relationship.label ?? ''} onBlur={(event) => updateRelationship.mutate({ id: relationship.ID, data: { ...relationship, category: relationship.category || 'relationship', type: event.target.value, label: event.target.value } })} />
                  <Input className="h-8 text-xs" placeholder="关系说明" defaultValue={relationship.description ?? ''} onBlur={(event) => updateRelationship.mutate({ id: relationship.ID, data: { ...relationship, description: event.target.value } })} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function parseTags(value?: string) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean)
    }
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function normalizeStateTags(value?: string, status?: string): Record<string, string[]> {
  const fallbackStatus = normalizeStatus(status)
  if (!value) {
    return { [fallbackStatus]: [] }
  }
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record: Record<string, string[]> = {}
      Object.entries(parsed as Record<string, unknown>).forEach(([state, tags]) => {
        const key = normalizeStatus(state)
        record[key] = Array.isArray(tags) ? dedupeTags(tags.map((item) => String(item))) : []
      })
      return ensureStateTags(record, fallbackStatus)
    }
  } catch {
    return { [fallbackStatus]: [] }
  }
  return { [fallbackStatus]: [] }
}

function ensureStateTags(stateTags: Record<string, string[]>, status: string, fallbackTags: string[] = []) {
  const normalizedStatus = normalizeStatus(status)
  return {
    ...stateTags,
    [normalizedStatus]: stateTags[normalizedStatus] ?? fallbackTags,
  }
}

function buildStateOptions(stateTags: Record<string, string[]>, status: string) {
  const builtIns = STATUS_OPTIONS.map((option) => option.value)
  return Array.from(new Set([...builtIns, ...Object.keys(stateTags), normalizeStatus(status)]))
}

function dedupeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)))
}

function normalizeStatus(status?: string) {
  return String(status ?? '').trim() || 'draft'
}

export function settingStatusLabel(status?: string) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status ?? '未设置'
}

export function SettingStatusBadge({ status }: { status?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
      <Check size={10} />
      {settingStatusLabel(status)}
    </span>
  )
}
