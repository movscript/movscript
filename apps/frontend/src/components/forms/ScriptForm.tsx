import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Episode, Script, ScriptSettingRef, Setting, SettingRelationship } from '@/types'
import { ReactFlow, Background, Controls, MarkerType } from '@xyflow/react'
import type { Edge, Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Save, Sparkles, Loader2, ListTree, Plus, Tags, X, ZoomIn, ZoomOut, GitBranch, Link2, Users } from 'lucide-react'
import { ResourceAttachments } from '@/components/shared/ResourceAttachments'
import { api } from '@/lib/api'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { EntitySemanticForm } from '@/components/detail/EntitySemanticForm'

const SCRIPT_TYPE_MAP: Record<string, { labelKey: string; color: string }> = {
  main:    { labelKey: 'domain.scriptTypes.main',    color: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400' },
  episode: { labelKey: 'domain.scriptTypes.episode', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400' },
  scene:   { labelKey: 'domain.scriptTypes.scene',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
}

type ScriptPointType = 'hook' | 'reversal' | 'conflict' | 'release' | 'none'

interface ScriptPoint {
  id: string
  content: string
  beat_type: ScriptPointType
  tags: string[]
}

interface CharacterProfile {
  id: string
  name: string
  identity: string
  traits: string
  goal: string
  notes: string
}

type CharacterRelationshipType = 'alliance' | 'family' | 'love' | 'conflict' | 'secret' | 'other'

interface CharacterRelationship {
  id: string
  source: string
  target: string
  label: string
  type: CharacterRelationshipType
}

const BEAT_TYPES: { value: ScriptPointType; labelKey: string; color: string }[] = [
  { value: 'hook', labelKey: 'details.pointTypes.hook', color: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
  { value: 'reversal', labelKey: 'details.pointTypes.reversal', color: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300' },
  { value: 'conflict', labelKey: 'details.pointTypes.conflict', color: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
  { value: 'release', labelKey: 'details.pointTypes.release', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  { value: 'none', labelKey: 'details.pointTypes.none', color: 'bg-muted text-muted-foreground' },
]

const STRUCTURE_BEATS = BEAT_TYPES.filter((type) => type.value !== 'none')

const RELATIONSHIP_TYPES: { value: CharacterRelationshipType; labelKey: string; color: string }[] = [
  { value: 'alliance', labelKey: 'details.relationshipTypes.alliance', color: '#0284c7' },
  { value: 'family', labelKey: 'details.relationshipTypes.family', color: '#16a34a' },
  { value: 'love', labelKey: 'details.relationshipTypes.love', color: '#db2777' },
  { value: 'conflict', labelKey: 'details.relationshipTypes.conflict', color: '#dc2626' },
  { value: 'secret', labelKey: 'details.relationshipTypes.secret', color: '#7c3aed' },
  { value: 'other', labelKey: 'details.relationshipTypes.other', color: '#64748b' },
]

interface ScriptFormProps {
  script: Script
  projectId?: number
  draft: Partial<Script>
  onChange: (d: Partial<Script>) => void
  onSave: (data: Partial<Script>) => void
  isSaving?: boolean
  analyzing?: boolean
  onAnalyze?: () => void
}

const SETTING_TYPE_LABEL: Record<Setting['type'], string> = {
  character: '人物',
  scene: '场景',
  prop: '道具',
  world_rule: '规则',
}

const SETTING_ROLE_OPTIONS = [
  'protagonist',
  'antagonist',
  'supporting',
  'location',
  'prop',
  'mentioned',
  'world_rule',
]

function splitStructuredText(value?: string) {
  return (value ?? '')
    .split('\n')
    .map((line) => line.replace(/^\s*[-*]\s*/, '').trim())
    .filter(Boolean)
}

function joinStructuredText(items: string[]) {
  return items.map((item) => `- ${item.trim()}`).filter((item) => item !== '-').join('\n')
}

function splitTags(value: string) {
  return value.split(/[,，、\s]+/).map((tag) => tag.trim()).filter(Boolean)
}

function parseCharacterProfiles(raw?: string): CharacterProfile[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item, index) => ({
      id: typeof item?.id === 'string' && item.id ? item.id : `c${index + 1}`,
      name: typeof item?.name === 'string' ? item.name : '',
      identity: typeof item?.identity === 'string' ? item.identity : '',
      traits: typeof item?.traits === 'string' ? item.traits : '',
      goal: typeof item?.goal === 'string' ? item.goal : '',
      notes: typeof item?.notes === 'string' ? item.notes : '',
    }))
  } catch {
    return []
  }
}

function serializeCharacterProfiles(profiles: CharacterProfile[]) {
  return JSON.stringify(profiles.map((profile, index) => ({
    ...profile,
    id: profile.id || `c${index + 1}`,
  })))
}

function parseCharacterRelationships(raw?: string): CharacterRelationship[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item, index) => ({
      id: typeof item?.id === 'string' && item.id ? item.id : `r${index + 1}`,
      source: typeof item?.source === 'string' ? item.source : '',
      target: typeof item?.target === 'string' ? item.target : '',
      label: typeof item?.label === 'string' ? item.label : '',
      type: RELATIONSHIP_TYPES.some((type) => type.value === item?.type) ? item.type : 'other',
    }))
  } catch {
    return []
  }
}

function serializeCharacterRelationships(relationships: CharacterRelationship[]) {
  return JSON.stringify(relationships.map((relationship, index) => ({
    ...relationship,
    id: relationship.id || `r${index + 1}`,
  })))
}

function buildPointsFromContent(content?: string): ScriptPoint[] {
  const blocks = (content ?? '')
    .split(/\n{2,}|\n(?=\s*(第.{1,8}[场幕集]|[0-9]+[.、]))/)
    .map((block) => block.trim())
    .filter(Boolean)

  return blocks.map((block, index) => ({
    id: `p${index + 1}`,
    content: block.length > 120 ? `${block.slice(0, 120)}...` : block,
    beat_type: 'none' as ScriptPointType,
    tags: [],
  }))
}

function parseScriptPoints(raw?: string, content?: string): ScriptPoint[] {
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.map((item, index) => ({
          id: typeof item?.id === 'string' ? item.id : `p${index + 1}`,
          content: typeof item?.content === 'string' ? item.content : '',
          beat_type: BEAT_TYPES.some((type) => type.value === item?.beat_type) ? item.beat_type : 'none',
          tags: Array.isArray(item?.tags) ? item.tags.map(String).filter(Boolean) : splitTags(String(item?.tags ?? '')),
        }))
      }
    } catch {
      // Fall back to content-derived points.
    }
  }
  return buildPointsFromContent(content)
}

function serializeScriptPoints(points: ScriptPoint[]) {
  return JSON.stringify(points.map((point, index) => ({
    ...point,
    id: point.id || `p${index + 1}`,
    tags: point.tags.filter(Boolean),
  })))
}

function StructuredListEditor({
  label,
  value,
  placeholder,
  rows = 2,
  onChange,
}: {
  label: string
  value?: string
  placeholder?: string
  rows?: number
  onChange: (value: string) => void
}) {
  const [extraRows, setExtraRows] = useState(0)
  const items = splitStructuredText(value)
  const visibleItems = items.length > 0 || extraRows > 0 ? [...items, ...Array(extraRows).fill('')] : ['']

  function updateItem(index: number, next: string) {
    const copy = visibleItems.slice()
    copy[index] = next
    onChange(joinStructuredText(copy))
    if (index >= items.length && next.trim()) {
      setExtraRows((count) => Math.max(0, count - 1))
    }
  }

  function removeItem(index: number) {
    if (index >= items.length) {
      setExtraRows((count) => Math.max(0, count - 1))
      return
    }
    const copy = visibleItems.filter((_, itemIndex) => itemIndex !== index)
    onChange(joinStructuredText(copy))
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        <button
          type="button"
          onClick={() => setExtraRows((count) => count + 1)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Add item"
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="space-y-2">
        {visibleItems.map((item, index) => (
          <div key={index} className="flex gap-2">
            <span className="mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">
              {index + 1}
            </span>
            <Textarea
              className="resize-none"
              rows={rows}
              placeholder={index === 0 ? placeholder : undefined}
              value={item}
              onChange={(event) => updateItem(index, event.target.value)}
            />
            {visibleItems.length > 1 && (
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Remove item"
              >
                <X size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function CharacterStructureEditor({
  draft,
  onChange,
}: {
  draft: Partial<Script>
  onChange: (d: Partial<Script>) => void
}) {
  const { t } = useTranslation()
  const profiles = parseCharacterProfiles(draft.character_profiles)
  const relationships = parseCharacterRelationships(draft.character_relationships)

  function saveProfiles(next: CharacterProfile[]) {
    onChange({ ...draft, character_profiles: serializeCharacterProfiles(next) })
  }

  function saveRelationships(next: CharacterRelationship[]) {
    onChange({ ...draft, character_relationships: serializeCharacterRelationships(next) })
  }

  function addProfile() {
    saveProfiles([
      ...profiles,
      { id: `c${Date.now()}`, name: '', identity: '', traits: '', goal: '', notes: '' },
    ])
  }

  function updateProfile(index: number, patch: Partial<CharacterProfile>) {
    const next = profiles.slice()
    next[index] = { ...next[index], ...patch }
    saveProfiles(next)
  }

  function removeProfile(index: number) {
    const removed = profiles[index]
    const nextProfiles = profiles.filter((_, itemIndex) => itemIndex !== index)
    const nextRelationships = relationships.filter((relationship) => (
      relationship.source !== removed?.id && relationship.target !== removed?.id
    ))
    onChange({
      ...draft,
      character_profiles: serializeCharacterProfiles(nextProfiles),
      character_relationships: serializeCharacterRelationships(nextRelationships),
    })
  }

  function addRelationship() {
    const source = profiles[0]?.id ?? ''
    const target = profiles[1]?.id ?? profiles[0]?.id ?? ''
    saveRelationships([
      ...relationships,
      { id: `r${Date.now()}`, source, target, label: '', type: 'other' },
    ])
  }

  function updateRelationship(index: number, patch: Partial<CharacterRelationship>) {
    const next = relationships.slice()
    next[index] = { ...next[index], ...patch }
    saveRelationships(next)
  }

  function removeRelationship(index: number) {
    saveRelationships(relationships.filter((_, itemIndex) => itemIndex !== index))
  }

  const nodeRadius = 150
  const nodes: Node[] = profiles.map((profile, index) => {
    const angle = profiles.length <= 1 ? 0 : (Math.PI * 2 * index) / profiles.length
    return {
      id: profile.id,
      position: {
        x: 220 + Math.cos(angle) * nodeRadius,
        y: 150 + Math.sin(angle) * nodeRadius,
      },
      data: {
        label: (
          <div className="min-w-28 max-w-40 text-left">
            <div className="truncate text-xs font-semibold text-foreground">{profile.name || t('details.unnamedCharacter')}</div>
            {profile.identity && <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{profile.identity}</div>}
          </div>
        ),
      },
      style: {
        border: '1px solid hsl(var(--border))',
        background: 'hsl(var(--background))',
        borderRadius: 8,
        padding: 8,
      },
    }
  })

  const edges: Edge[] = relationships
    .filter((relationship) => relationship.source && relationship.target)
    .map((relationship) => {
      const type = RELATIONSHIP_TYPES.find((item) => item.value === relationship.type)
      return {
        id: relationship.id,
        source: relationship.source,
        target: relationship.target,
        label: relationship.label || t(type?.labelKey ?? 'details.relationshipTypes.other'),
        markerEnd: { type: MarkerType.ArrowClosed, color: type?.color },
        style: { stroke: type?.color, strokeWidth: 1.8 },
        labelStyle: { fill: type?.color, fontSize: 11, fontWeight: 600 },
        labelBgStyle: { fill: 'hsl(var(--background))', fillOpacity: 0.9 },
      }
    })

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-medium text-muted-foreground">{t('details.characterProfiles')}</Label>
          <button
            type="button"
            onClick={addProfile}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus size={12} />
            {t('details.addCharacter')}
          </button>
        </div>
        <div className="space-y-2">
          {profiles.length > 0 ? profiles.map((profile, index) => (
            <div key={profile.id} className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
                <button
                  type="button"
                  onClick={() => removeProfile(index)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input className="h-8 text-xs" placeholder={t('details.characterName')} value={profile.name} onChange={(event) => updateProfile(index, { name: event.target.value })} />
                <Input className="h-8 text-xs" placeholder={t('details.characterIdentity')} value={profile.identity} onChange={(event) => updateProfile(index, { identity: event.target.value })} />
                <Input className="h-8 text-xs" placeholder={t('details.characterTraits')} value={profile.traits} onChange={(event) => updateProfile(index, { traits: event.target.value })} />
                <Input className="h-8 text-xs" placeholder={t('details.characterGoal')} value={profile.goal} onChange={(event) => updateProfile(index, { goal: event.target.value })} />
              </div>
              <Textarea className="mt-2 resize-none text-xs" rows={2} placeholder={t('details.characterStructuredNotes')} value={profile.notes} onChange={(event) => updateProfile(index, { notes: event.target.value })} />
            </div>
          )) : (
            <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">{t('details.noCharacterProfiles')}</div>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">{t('details.characterFreeform')}</Label>
        <Textarea
          className="resize-none"
          rows={4}
          placeholder={t('details.characterFreeformPlaceholder')}
          value={draft.characters ?? ''}
          onChange={(event) => onChange({ ...draft, characters: event.target.value })}
        />
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <GitBranch size={13} />
            {t('details.characterRelationshipGraph')}
          </Label>
          <button
            type="button"
            onClick={addRelationship}
            disabled={profiles.length < 2}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <Plus size={12} />
            {t('details.addRelationship')}
          </button>
        </div>
        <div className="h-72 overflow-hidden rounded-md border border-border bg-background">
          {profiles.length > 0 ? (
            <ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}>
              <Background gap={18} size={1} color="hsl(var(--border))" />
              <Controls position="bottom-left" />
            </ReactFlow>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">{t('details.noCharacterGraph')}</div>
          )}
        </div>
        <div className="space-y-2">
          {relationships.map((relationship, index) => (
            <div key={relationship.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2">
              <select className="h-8 rounded-md border border-border bg-background px-2 text-xs" value={relationship.source} onChange={(event) => updateRelationship(index, { source: event.target.value })}>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name || t('details.unnamedCharacter')}</option>)}
              </select>
              <select className="h-8 rounded-md border border-border bg-background px-2 text-xs" value={relationship.target} onChange={(event) => updateRelationship(index, { target: event.target.value })}>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name || t('details.unnamedCharacter')}</option>)}
              </select>
              <select className="h-8 rounded-md border border-border bg-background px-2 text-xs" value={relationship.type} onChange={(event) => updateRelationship(index, { type: event.target.value as CharacterRelationshipType })}>
                {RELATIONSHIP_TYPES.map((type) => <option key={type.value} value={type.value}>{t(type.labelKey)}</option>)}
              </select>
              <Input className="h-8 text-xs" placeholder={t('details.relationshipLabel')} value={relationship.label} onChange={(event) => updateRelationship(index, { label: event.target.value })} />
              <button type="button" onClick={() => removeRelationship(index)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function SettingReferencePanel({
  projectId,
  script,
}: {
  projectId?: number
  script: Script
}) {
  const qc = useQueryClient()
  const [settingId, setSettingId] = useState<number | ''>('')

  const { data: settings = [] } = useQuery<Setting[]>({
    queryKey: ['settings', projectId],
    queryFn: () => api.get(`/projects/${projectId}/settings`).then((r) => r.data),
    enabled: !!projectId,
  })

  const { data: refs = [] } = useQuery<ScriptSettingRef[]>({
    queryKey: ['setting-refs', projectId, script.ID],
    queryFn: () => api.get(`/projects/${projectId}/setting-refs`, { params: { script_id: script.ID } }).then((r) => r.data),
    enabled: !!projectId && !!script.ID,
  })

  const { data: relationships = [] } = useQuery<SettingRelationship[]>({
    queryKey: ['setting-relationships', projectId, script.ID],
    queryFn: () => api.get(`/projects/${projectId}/setting-relationships`, { params: script.script_type === 'main' ? {} : { scope_script_id: script.ID } }).then((r) => r.data),
    enabled: !!projectId && !!script.ID,
  })

  const createRef = useMutation({
    mutationFn: (nextSettingId: number) => api.post(`/projects/${projectId}/setting-refs`, {
      script_id: script.ID,
      setting_id: nextSettingId,
      scope: script.script_type,
      role: defaultRoleForSetting(settings.find((setting) => setting.ID === nextSettingId)),
      source: 'manual',
    }).then((r) => r.data),
    onSuccess: () => {
      setSettingId('')
      qc.invalidateQueries({ queryKey: ['setting-refs', projectId, script.ID] })
    },
  })

  const updateRef = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ScriptSettingRef> }) => api.put(`/setting-refs/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setting-refs', projectId, script.ID] }),
  })

  const removeRef = useMutation({
    mutationFn: (id: number) => api.delete(`/setting-refs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setting-refs', projectId, script.ID] }),
  })

  const usedIds = new Set(refs.map((ref) => ref.setting_id))
  const availableSettings = settings.filter((setting) => !usedIds.has(setting.ID))
  const groupedRefs = refs.reduce<Record<string, ScriptSettingRef[]>>((groups, ref) => {
    const type = ref.setting?.type ?? 'character'
    groups[type] = groups[type] ?? []
    groups[type].push(ref)
    return groups
  }, {})

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Link2 size={13} />
          引用设定
        </Label>
        <div className="flex min-w-0 items-center gap-2">
          <select
            className="h-8 min-w-56 rounded-md border border-border bg-background px-2 text-xs"
            value={settingId}
            onChange={(event) => setSettingId(Number(event.target.value) || '')}
          >
            <option value="">选择已有设定</option>
            {availableSettings.map((setting) => (
              <option key={setting.ID} value={setting.ID}>
                {SETTING_TYPE_LABEL[setting.type] ?? setting.type} · {setting.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            disabled={!settingId || createRef.isPending}
            onClick={() => settingId && createRef.mutate(settingId)}
          >
            <Plus size={12} />
            添加
          </Button>
        </div>
      </div>

      {refs.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
          暂无引用设定。AI 分析后会自动补充，也可以从设定库手动添加。
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(groupedRefs).map(([type, items]) => (
            <div key={type} className="rounded-md border border-border">
              <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
                {SETTING_TYPE_LABEL[type as Setting['type']] ?? type}
              </div>
              <div className="divide-y divide-border">
                {items.map((ref) => (
                  <div key={ref.ID} className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{ref.setting?.name ?? `#${ref.setting_id}`}</p>
                        {ref.setting?.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{ref.setting.description}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRef.mutate(ref.ID)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                      <select
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                        value={ref.role ?? ''}
                        onChange={(event) => updateRef.mutate({ id: ref.ID, data: { ...ref, role: event.target.value } })}
                      >
                        {SETTING_ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
                      </select>
                      <Input
                        className="h-8 text-xs"
                        placeholder="情绪"
                        defaultValue={ref.emotion ?? ''}
                        onBlur={(event) => updateRef.mutate({ id: ref.ID, data: { ...ref, emotion: event.target.value } })}
                      />
                      <Input
                        className="h-8 text-xs"
                        placeholder="状态"
                        defaultValue={ref.state ?? ''}
                        onBlur={(event) => updateRef.mutate({ id: ref.ID, data: { ...ref, state: event.target.value } })}
                      />
                      <Input
                        className="h-8 text-xs"
                        placeholder="本级作用"
                        defaultValue={ref.purpose ?? ''}
                        onBlur={(event) => updateRef.mutate({ id: ref.ID, data: { ...ref, purpose: event.target.value } })}
                      />
                    </div>
                    <Textarea
                      className="resize-none text-xs"
                      rows={2}
                      placeholder="本集/本场补充，不写入全局设定档案"
                      defaultValue={ref.note ?? ''}
                      onBlur={(event) => updateRef.mutate({ id: ref.ID, data: { ...ref, note: event.target.value } })}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {relationships.length > 0 && (
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Users size={13} />
            设定关系
          </Label>
          <div className="flex flex-wrap gap-2">
            {relationships.map((relationship) => (
              <span key={relationship.ID} className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                {relationship.source_setting?.name ?? relationship.source_setting_id}
                {' -> '}
                {relationship.target_setting?.name ?? relationship.target_setting_id}
                {relationship.label ? ` · ${relationship.label}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function defaultRoleForSetting(setting?: Setting) {
  if (!setting) return 'mentioned'
  if (setting.type === 'character') return 'supporting'
  if (setting.type === 'scene') return 'location'
  if (setting.type === 'prop') return 'prop'
  if (setting.type === 'world_rule') return 'world_rule'
  return 'mentioned'
}

function EpisodeScriptEditor({
  draft,
  onChange,
  contentField,
}: {
  draft: Partial<Script>
  onChange: (d: Partial<Script>) => void
  contentField: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
}) {
  const { t } = useTranslation()
  const [zoom, setZoom] = useState(100)
  const [tagsOnly, setTagsOnly] = useState(false)
  const points = parseScriptPoints(draft.script_points, draft.content)

  function savePoints(next: ScriptPoint[]) {
    onChange({ ...draft, script_points: serializeScriptPoints(next) })
  }

  function updatePoint(index: number, patch: Partial<ScriptPoint>) {
    const next = points.slice()
    next[index] = { ...next[index], ...patch }
    savePoints(next)
  }

  function regeneratePoints() {
    savePoints(buildPointsFromContent(draft.content))
  }

  const orderedTags = points.flatMap((point, index) => {
    const beat = BEAT_TYPES.find((type) => type.value === point.beat_type)
    const tags = point.tags.length > 0 ? point.tags : point.beat_type !== 'none' ? [t(beat?.labelKey ?? 'details.pointTypes.none')] : []
    return tags.map((tag) => ({ tag, index, beat }))
  })

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-5 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ListTree size={14} />
            <span>{t('details.episodeBodyWorkspace')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTagsOnly((value) => !value)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors',
                tagsOnly ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Tags size={13} />
              {t('details.tagsOnly')}
            </button>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.max(80, value - 10))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              title={t('details.zoomOut')}
            >
              <ZoomOut size={13} />
            </button>
            <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">{zoom}%</span>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.min(160, value + 10))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              title={t('details.zoomIn')}
            >
              <ZoomIn size={13} />
            </button>
          </div>
        </div>

        {tagsOnly ? (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex flex-wrap items-center gap-2">
              {orderedTags.length > 0 ? orderedTags.map((item, index) => (
                <div key={`${item.index}-${item.tag}-${index}`} className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs">
                  <span className="font-mono text-muted-foreground">#{item.index + 1}</span>
                  <span className={cn('rounded px-1.5 py-0.5', item.beat?.color ?? 'bg-muted text-muted-foreground')}>
                    {item.tag}
                  </span>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">{t('details.noPointTags')}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col p-5">
            <Label className="mb-1 text-xs font-medium text-muted-foreground">{t('details.scriptBody')}</Label>
            <Textarea
              className="min-h-[520px] flex-1 resize-none font-mono leading-relaxed"
              style={{ fontSize: `${zoom}%` }}
              placeholder={t('details.scriptBodyPlaceholder')}
              value={draft.content ?? ''}
              onChange={contentField}
            />
          </div>
        )}
      </div>

      <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-card">
        <div className="shrink-0 border-b border-border px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">{t('details.structureSidebar')}</p>
            <button
              type="button"
              onClick={regeneratePoints}
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {t('details.generatePoints')}
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-border p-3">
            <p className="mb-2 text-[11px] font-medium uppercase text-muted-foreground">{t('details.beatPositions')}</p>
            <div className="space-y-2">
              {STRUCTURE_BEATS.map((beat) => {
                const matched = points
                  .map((point, index) => ({ point, index }))
                  .filter((item) => item.point.beat_type === beat.value)
                return (
                  <div key={beat.value} className="flex items-start gap-2 text-xs">
                    <span className={cn('mt-0.5 rounded px-1.5 py-0.5', beat.color)}>{t(beat.labelKey)}</span>
                    <span className="min-w-0 flex-1 text-muted-foreground">
                      {matched.length > 0 ? matched.map((item) => `#${item.index + 1}`).join(' / ') : t('details.notMarked')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="divide-y divide-border">
            {points.length > 0 ? points.map((point, index) => {
              const beat = BEAT_TYPES.find((type) => type.value === point.beat_type)
              return (
                <div key={point.id || index} className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">#{index + 1}</span>
                    <select
                      className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                      value={point.beat_type}
                      onChange={(event) => updatePoint(index, { beat_type: event.target.value as ScriptPointType })}
                    >
                      {BEAT_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>{t(type.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                  <Textarea
                    className="resize-none text-xs"
                    rows={3}
                    value={point.content}
                    onChange={(event) => updatePoint(index, { content: event.target.value })}
                  />
                  <Input
                    className="h-8 text-xs"
                    placeholder={t('details.pointTagsPlaceholder')}
                    value={point.tags.join('，')}
                    onChange={(event) => updatePoint(index, { tags: splitTags(event.target.value) })}
                  />
                  <div className="flex flex-wrap gap-1">
                    {point.beat_type !== 'none' && (
                      <span className={cn('rounded px-1.5 py-0.5 text-[11px]', beat?.color)}>{t(beat?.labelKey ?? 'details.pointTypes.none')}</span>
                    )}
                    {point.tags.map((tag) => (
                      <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{tag}</span>
                    ))}
                  </div>
                </div>
              )
            }) : (
              <div className="p-4 text-xs text-muted-foreground">{t('details.noScriptPoints')}</div>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

export function ScriptForm({ script, projectId, draft, onChange, onSave, isSaving, analyzing, onAnalyze }: ScriptFormProps) {
  const { t } = useTranslation()
  const isMain = script.script_type === 'main'
  const isEpisode = script.script_type === 'episode'
  const isScene = script.script_type === 'scene'
  function field<K extends keyof Script>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange({ ...draft, [key]: e.target.value })
  }

  const { data: episodes = [] } = useQuery<Episode[]>({
    queryKey: ['episodes-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/episodes`).then((r) => r.data),
    enabled: !!projectId && (isEpisode || isScene),
  })

  return (
    <Tabs defaultValue="content" className="flex h-full flex-col overflow-hidden">
      <TabsList className="shrink-0 w-full justify-start rounded-none border-b bg-background px-0 h-auto py-0">
        {onAnalyze && (
          <div className="ml-auto pr-3 flex items-center">
            <button
              onClick={onAnalyze}
              disabled={analyzing}
              className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {t('details.aiAnalyze')}
            </button>
          </div>
        )}
        <TabsTrigger value="content" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-5 py-2.5 text-xs font-medium">
          {t('details.contentManagement')}
        </TabsTrigger>
        <TabsTrigger value="plot" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-5 py-2.5 text-xs font-medium">
          {t('details.scriptBody')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="content" className="flex-1 min-h-0 overflow-y-auto mt-0">
        <EntitySemanticForm
          kind="script"
          ownerType="script"
          ownerId={script.ID}
          draft={draft}
          onChange={(next) => onChange(next as Partial<Script>)}
          onSave={(payload) => onSave(payload as Partial<Script>)}
          isSaving={isSaving}
          excludeFields={isMain
            ? ['result', 'attachment', 'content', 'characters', 'character_profiles', 'character_relationships', 'core_settings', 'background', 'scenes_desc', 'hook', 'plot_summary', 'script_points']
            : ['result', 'attachment', 'content', 'characters', 'character_profiles', 'character_relationships', 'core_settings', 'background', 'scenes_desc', 'hook', 'plot_summary', 'script_points']}
          renderAfter={(
            <>
              {isMain ? (
                <>
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] gap-4">
                <CharacterStructureEditor draft={draft} onChange={onChange} />
                <StructuredListEditor
                  label={t('details.coreSettings')}
                  placeholder={t('details.coreSettingsPlaceholder')}
                  value={draft.core_settings}
                  onChange={(value) => onChange({ ...draft, core_settings: value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.background')}</Label>
                  <Input placeholder={t('details.backgroundPlaceholder')} value={draft.background ?? ''} onChange={field('background')} />
                </div>
                <StructuredListEditor
                  label={t('details.scenes')}
                  placeholder={t('details.scenesPlaceholder')}
                  rows={3}
                  value={draft.scenes_desc}
                  onChange={(value) => onChange({ ...draft, scenes_desc: value })}
                />
              </div>
                </>
              ) : (
                <div className="space-y-4">
              <SettingReferencePanel projectId={projectId} script={script} />
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.background')}</Label>
                <Textarea
                  className="resize-none"
                  rows={3}
                  placeholder="只写本集/本场新增背景、情绪、冲突和连续性备注；基础设定从设定库引用。"
                  value={draft.background ?? ''}
                  onChange={field('background')}
                />
              </div>
                </div>
              )}
              {(isEpisode || isScene) && (
            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isEpisode ? t('details.episodeSpecific') : t('details.sceneSpecific')}</p>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1">
                  {isEpisode ? t('forms.parentEpisodeRequired') : t('forms.parentEpisodeOptional')}
                </Label>
                <select
                  className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
                  value={draft.episode_id ?? ''}
                  onChange={(e) => onChange({ ...draft, episode_id: Number(e.target.value) || undefined })}
                >
                  <option value="">{isEpisode ? t('forms.selectEpisodeFirst') : t('forms.unlinked')}</option>
                  {episodes.map((episode) => (
                    <option key={episode.ID} value={episode.ID}>EP{episode.number} {episode.title}</option>
                  ))}
                </select>
              </div>
              {isEpisode && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.episodeOrder')}</Label>
                    <Input type="number" value={draft.order ?? ''} onChange={(e) => onChange({ ...draft, order: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.hook')}</Label>
                    <Textarea className="resize-none" rows={2} placeholder={t('details.episodeHookPlaceholder')} value={draft.hook ?? ''} onChange={field('hook')} />
                  </div>
                </div>
              )}
              {isEpisode && (
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.plotSummary')}</Label>
                  <Textarea className="resize-none" rows={3} placeholder={t('details.plotSummaryPlaceholder')} value={draft.plot_summary ?? ''} onChange={field('plot_summary')} />
                </div>
              )}
              {isScene && (
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.hook')}</Label>
                  <Textarea className="resize-none" rows={2} placeholder={t('details.sceneHookPlaceholder')} value={draft.hook ?? ''} onChange={field('hook')} />
                </div>
              )}
            </div>
              )}
              <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.attachments')}</Label>
            <ResourceAttachments
              ownerType="script"
              ownerId={script.ID}
              role="attachment"
            />
              </div>
            </>
          )}
        />
      </TabsContent>

      <TabsContent value="plot" className="flex-1 min-h-0 overflow-y-auto mt-0">
        <div className="h-full min-h-0 flex flex-col">
          {isEpisode ? (
            <EpisodeScriptEditor draft={draft} onChange={onChange} contentField={field('content')} />
          ) : (
            <div className="p-5 space-y-4 flex-1 flex flex-col min-h-0">
              <div className="flex-1 flex flex-col min-h-0">
                <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.scriptBody')}</Label>
                <Textarea
                  className="flex-1 font-mono resize-none min-h-[400px]"
                  placeholder={t('details.scriptBodyPlaceholder')}
                  value={draft.content ?? ''}
                  onChange={field('content')}
                />
              </div>
            </div>
          )}
          <div className="pt-1 border-t border-border">
            <Button onClick={() => onSave(draft)} disabled={isSaving} className="m-3 gap-1.5">
              <Save size={13} /> {isSaving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  )
}
