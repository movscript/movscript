import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Script } from '@/types'
import { createScriptVersion, listScriptVersions, type ScriptVersion } from '@/api/scriptVersions'
import { useProjectStore } from '@/store/projectStore'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { ScriptForm } from '@/components/forms/ScriptForm'
import { DetailHero, HeroMetric, HeroPill } from './DetailHero'
import { Clock, Database, GitBranch, Layers, MapPin, Plus, Sparkles, Users } from 'lucide-react'

const SCRIPT_TYPE_MAP: Record<string, { labelKey: string; color: string; tone: 'sky' | 'violet' | 'blue' }> = {
  main:    { labelKey: 'domain.scriptTypes.main',    color: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400', tone: 'sky' },
  episode: { labelKey: 'domain.scriptTypes.episode', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400', tone: 'violet' },
  scene:   { labelKey: 'domain.scriptTypes.scene',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400', tone: 'blue' },
}

interface Props {
  script: Script
  onClose?: () => void
  onDelete?: () => void
}

export function ScriptDetail({ script, onClose, onDelete }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Script>>({ ...script })
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)

  const { data: versions = [], isLoading: versionsLoading } = useQuery<ScriptVersion[]>({
    queryKey: ['semantic-script-versions', projectId, script.ID],
    queryFn: () => listScriptVersions(projectId!, { scriptId: script.ID }),
    enabled: !!projectId,
  })
  const selectedVersion = versions.find((version) => version.ID === selectedVersionId) ?? versions[0] ?? null

  const update = useMutation({
    mutationFn: (data: Partial<Script>) =>
      api.put(`/projects/${projectId}/scripts/${script.ID}`, data).then((r) => r.data),
    onSuccess: (updated: Script) => {
      setDraft((d) => ({ ...d, ...updated }))
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      qc.invalidateQueries({ queryKey: ['semantic-script-versions', projectId, script.ID] })
      qc.invalidateQueries({ queryKey: ['settings', projectId] })
      qc.invalidateQueries({ queryKey: ['setting-refs', projectId, script.ID] })
      qc.invalidateQueries({ queryKey: ['setting-relationships', projectId, script.ID] })
    },
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}/scripts/${script.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      onDelete?.()
    },
  })

  const createVersion = useMutation({
    mutationFn: () => createScriptVersion(projectId!, {
      script_id: script.ID,
      parent_version_id: selectedVersion?.ID ?? null,
      title: draft.title ?? script.title,
      source_type: script.source_type ?? 'raw',
      content: draft.content ?? script.content ?? draft.raw_source ?? script.raw_source ?? '',
      raw_source: draft.raw_source ?? script.raw_source ?? draft.content ?? script.content ?? '',
      summary: draft.summary ?? script.summary ?? '',
      status: 'draft',
    }),
    onSuccess: (version) => {
      setSelectedVersionId(version.ID)
      qc.invalidateQueries({ queryKey: ['semantic-script-versions', projectId] })
      qc.invalidateQueries({ queryKey: ['semantic-script-versions', projectId, script.ID] })
    },
  })

  const typeCfg = SCRIPT_TYPE_MAP[script.script_type]
  const bodyLength = (draft.raw_source ?? script.raw_source ?? draft.content ?? script.content ?? '').trim().length

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DetailHero
        kind="script"
        title={draft.title ?? script.title}
        description={draft.summary || draft.description || script.summary || script.description}
        tone={typeCfg?.tone ?? 'neutral'}
        eyebrow={(
          <>
            <HeroPill className={cn(typeCfg?.color)}>{typeCfg ? t(typeCfg.labelKey) : script.script_type}</HeroPill>
          </>
        )}
        meta={(
          <>
            <HeroMetric label="ID" value={`#${script.ID}`} />
            <HeroMetric label={t('details.scriptBody')} value={bodyLength} />
            {script.version ? <HeroMetric label="Version" value={script.version} /> : null}
          </>
        )}
        onDelete={onDelete ? () => remove.mutate() : undefined}
        onClose={onClose}
        deleteLabel={t('common.delete')}
        closeLabel={t('common.close')}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ScriptVersionViewer
          versions={versions}
          selectedVersion={selectedVersion}
          selectedVersionId={selectedVersionId}
          isLoading={versionsLoading}
          isCreating={createVersion.isPending}
          onSelect={setSelectedVersionId}
          onCreate={() => createVersion.mutate()}
        />

        <ScriptForm
          script={script}
          draft={draft}
          onChange={setDraft}
          onSave={(data) => update.mutate(data)}
          isSaving={update.isPending}
        />
      </div>
    </div>
  )
}

function ScriptVersionViewer({
  versions,
  selectedVersion,
  selectedVersionId,
  isLoading,
  isCreating,
  onSelect,
  onCreate,
}: {
  versions: ScriptVersion[]
  selectedVersion: ScriptVersion | null
  selectedVersionId: number | null
  isLoading: boolean
  isCreating: boolean
  onSelect: (id: number) => void
  onCreate: () => void
}) {
  const selectedText = selectedVersion ? scriptVersionText(selectedVersion) : ''

  return (
    <section className="border-b border-border bg-background">
      <div className="grid gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="text-xs font-semibold text-foreground">版本</p>
            <button
              type="button"
              onClick={onCreate}
              disabled={isCreating}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <Plus size={12} />
              {isCreating ? '新增中' : '新增版本'}
            </button>
          </div>
          <div className="space-y-2 p-3">
            {isLoading ? (
              <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">正在读取版本</p>
            ) : versions.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">暂无剧本版本</p>
            ) : versions.map((version) => (
              <button
                key={version.ID}
                type="button"
                onClick={() => onSelect(version.ID)}
                className={cn(
                  'w-full rounded-md border px-3 py-2 text-left transition-colors',
                  (selectedVersionId ?? versions[0]?.ID) === version.ID
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-background hover:border-primary/50',
                )}
              >
                <span className="block truncate text-sm font-medium text-foreground">{version.title || `剧本版本 ${version.version_number}`}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  v{version.version_number || version.ID} · {formatScriptVersionStatus(version.status)} · {formatDate(version.UpdatedAt)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
            <p className="min-w-0 truncate text-xs font-semibold text-foreground">
              {selectedVersion ? `${selectedVersion.title || '未命名版本'} · v${selectedVersion.version_number || selectedVersion.ID}` : '版本正文'}
            </p>
            {selectedVersion ? (
              <span className="shrink-0 text-xs text-muted-foreground">{formatScriptVersionStatus(selectedVersion.status)}</span>
            ) : null}
          </div>
          <div className="p-3">
            <textarea
              readOnly
              className="min-h-[260px] w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-sm leading-relaxed text-foreground outline-none"
              value={selectedText}
              placeholder="选择版本后查看正文"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function StructuredScriptOverview({
  scriptType,
  draft,
  onChange,
  onSave,
  isSaving,
}: {
  scriptType: Script['script_type']
  draft: Partial<Script>
  onChange: (d: Partial<Script>) => void
  onSave: (data: Partial<Script>) => void
  isSaving?: boolean
}) {
  const isMain = scriptType === 'main'
  const isEpisode = scriptType === 'episode'
  const isScene = scriptType === 'scene'
  const characters = parseJsonList(draft.structured_characters)
  const beats = parseJsonList(draft.plot_beats)

  function setCharacters(items: Array<Record<string, unknown>>) {
    onChange({ ...draft, structured_characters: JSON.stringify(items) })
  }

  function setBeats(items: Array<Record<string, unknown>>) {
    onChange({ ...draft, plot_beats: JSON.stringify(items) })
  }

  return (
    <section className="border-b border-border bg-background">
      <div className="space-y-3 p-4">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={isSaving}
            className="inline-flex h-8 w-full items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 sm:w-auto"
          >
            {isSaving ? '保存中...' : '保存结构化字段'}
          </button>
        </div>
        <div className="min-w-0 space-y-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)]">
            <StructurePanel title="基础信息">
              <TextInput
                label="标题"
                value={draft.title}
                placeholder="剧本标题"
                onChange={(value) => onChange({ ...draft, title: value })}
              />
              <StructureTextArea
                label="描述"
                value={draft.description}
                placeholder="用于团队识别和检索的简短说明"
                onChange={(value) => onChange({ ...draft, description: value })}
              />
            </StructurePanel>

            <StructurePanel title="提纲">
              <StructureTextArea
                label="剧本提纲"
                value={draft.summary}
                placeholder={isMain ? '概括整部剧的主线、核心冲突和结局方向' : isEpisode ? '概括本集的起承转合和结尾落点' : '概括本场发生了什么'}
                onChange={(value) => onChange({ ...draft, summary: value })}
              />
              {isEpisode && (
                <StructureTextArea
                  label="钩子"
                  value={draft.hook}
                  placeholder="本集最重要的悬念、爽点或追看理由"
                  onChange={(value) => onChange({ ...draft, hook: value })}
                />
              )}
            </StructurePanel>
          </div>

          {!isMain && (
            <div className="grid gap-2 md:grid-cols-5">
              {isEpisode ? (
                <>
                  <StructureMetric icon={Database} label="设定" value={draft.core_settings ? '已填写' : '待填写'} tone="violet" />
                  <StructureMetric icon={Layers} label="场次" value={draft.planned_scene_count || '待填写'} tone="sky" />
                  <StructureMetric icon={Sparkles} label="钩子" value={draft.hook ? '已填写' : '待填写'} tone="rose" />
                  <StructureMetric icon={GitBranch} label="提纲" value={draft.summary ? '已填写' : '待填写'} tone="teal" />
                  <StructureMetric icon={GitBranch} label="描述" value={draft.description ? '已填写' : '待填写'} tone="amber" />
                </>
              ) : (
                <>
                  <StructureMetric icon={Clock} label="时间" value={draft.time_text || '待填写'} tone="sky" />
                  <StructureMetric icon={MapPin} label="地点" value={draft.location_text || '待填写'} tone="teal" />
                  <StructureMetric icon={Users} label="人物" value={characters.length || '待填写'} tone="violet" />
                  <StructureMetric icon={Layers} label="情节点" value={beats.length || '待填写'} tone="amber" />
                  <StructureMetric icon={Sparkles} label="氛围" value={draft.atmosphere || '待填写'} tone="rose" />
                </>
              )}
            </div>
          )}

          {isEpisode && (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <StructurePanel title="设定与场次">
                <StructureTextArea
                  label="设定"
                  value={draft.core_settings}
                  placeholder="本集沿用或新增的世界观、人物关系、限制条件"
                  onChange={(value) => onChange({ ...draft, core_settings: value })}
                />
                <NumberInput
                  label="场次"
                  value={draft.planned_scene_count}
                  placeholder="例如：8"
                  onChange={(value) => onChange({ ...draft, planned_scene_count: value })}
                />
              </StructurePanel>
              <StructurePanel title="分集边界">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  分集剧本只维护设定、场次、钩子、提纲和描述。具体时间、地点、人物状态和情节细节进入分场剧本。
                </p>
              </StructurePanel>
            </div>
          )}

          {isScene && (
            <div className="grid gap-3 lg:grid-cols-2">
              <StructurePanel title="分场结构">
                <StructureField
                  icon={Clock}
                  label="时间"
                  value={draft.time_text}
                  placeholder="例如：深夜，暴雨刚起，预计 72 秒"
                  onChange={(value) => onChange({ ...draft, time_text: value })}
                />
                <StructureField
                  icon={MapPin}
                  label="地点"
                  value={draft.location_text}
                  placeholder="例如：老城区窄巷，路灯闪烁，地面积水"
                  onChange={(value) => onChange({ ...draft, location_text: value })}
                />
                <StructureTextArea
                  label="氛围"
                  value={draft.atmosphere}
                  placeholder="描述本场的情绪、光线、节奏和视觉压迫感"
                  onChange={(value) => onChange({ ...draft, atmosphere: value })}
                />
              </StructurePanel>
              <div className="grid gap-3">
                <StructureList
                  title="人物"
                  items={characters}
                  empty="暂无人物，点击添加人物"
                  primaryKey="name"
                  secondaryKey="state"
                  addLabel="添加人物"
                  onAdd={() => setCharacters([...characters, { id: `c${characters.length + 1}`, name: '新人物', state: '' }])}
                  onUpdate={(items) => setCharacters(items)}
                />
                <StructureList
                  title="情节"
                  items={beats}
                  empty="暂无情节，点击添加情节"
                  primaryKey="label"
                  secondaryKey="plot"
                  addLabel="添加情节"
                  onAdd={() => setBeats([...beats, { id: `b${beats.length + 1}`, label: '新情节', plot: '' }])}
                  onUpdate={(items) => setBeats(items)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function StructureMetric({ icon: Icon, label, value, tone }: { icon: typeof Clock; label: string; value: string | number; tone: 'sky' | 'teal' | 'violet' | 'amber' | 'rose' }) {
  return (
    <div className={cn(
      'min-w-0 rounded-md border px-2.5 py-2',
      tone === 'sky' && 'border-sky-500/25 bg-sky-500/10',
      tone === 'teal' && 'border-teal-500/25 bg-teal-500/10',
      tone === 'violet' && 'border-violet-500/25 bg-violet-500/10',
      tone === 'amber' && 'border-amber-500/25 bg-amber-500/10',
      tone === 'rose' && 'border-rose-500/25 bg-rose-500/10',
    )}>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Icon size={12} />
        <span>{label}</span>
      </div>
      <p className="mt-1 truncate text-xs font-semibold text-foreground">{value}</p>
    </div>
  )
}

function StructurePanel({ title, children, contentClassName }: { title: string; children: React.ReactNode; contentClassName?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-3 py-2">
        <p className="text-xs font-semibold text-foreground">{title}</p>
      </div>
      <div className={cn('space-y-2 p-3', contentClassName)}>{children}</div>
    </div>
  )
}

function StructureField({ icon: Icon, label, value, placeholder, onChange }: { icon: typeof Clock; label: string; value?: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon size={12} />
        {label}
      </span>
      <input
        className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-ring"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function TextInput({ label, value, placeholder, onChange }: { label: string; value?: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-ring"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function NumberInput({ label, value, placeholder, onChange }: { label: string; value?: number; placeholder: string; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="number"
        min={0}
        className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-ring"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
    </label>
  )
}

function StructureTextArea({ label, value, placeholder, onChange }: { label: string; value?: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        className="min-h-[58px] w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-xs leading-relaxed text-foreground outline-none focus:border-ring"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function StructureList({
  title,
  items,
  empty,
  primaryKey,
  secondaryKey,
  addLabel,
  readOnly,
  onAdd,
  onUpdate,
}: {
  title: string
  items: Array<Record<string, unknown>>
  empty: string
  primaryKey: string
  secondaryKey: string
  addLabel: string
  readOnly?: boolean
  onAdd: () => void
  onUpdate: (items: Array<Record<string, unknown>>) => void
}) {
  function updateItem(index: number, key: string, value: string) {
    if (readOnly) return
    const next = items.slice()
    next[index] = { ...next[index], [key]: value }
    onUpdate(next)
  }

  function secondaryValue(item: Record<string, unknown>) {
    return String(item[secondaryKey] ?? item.summary ?? item.plot ?? item.state ?? item.evidence ?? item.description ?? '')
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        {!readOnly && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus size={11} />
            {addLabel}
          </button>
        )}
      </div>
      <div className="space-y-2 p-3">
        {items.length > 0 ? items.map((item, index) => (
          <div key={String(item.id ?? index)} className="grid gap-1.5 rounded-md border border-border bg-background p-2">
            <input
              readOnly={readOnly}
              className={cn(
                'h-7 rounded border border-border bg-card px-2 text-xs text-foreground outline-none',
                readOnly ? 'cursor-default' : 'focus:border-ring',
              )}
              value={String(item[primaryKey] ?? '')}
              placeholder={title === '人物' ? '人物名称' : '情节标签'}
              onChange={(event) => updateItem(index, primaryKey, event.target.value)}
            />
            <textarea
              readOnly={readOnly}
              className={cn(
                'min-h-[46px] resize-none rounded border border-border bg-card px-2 py-1.5 text-xs leading-relaxed text-foreground outline-none',
                readOnly ? 'cursor-default' : 'focus:border-ring',
              )}
              value={secondaryValue(item)}
              placeholder={title === '人物' ? '人物在本场的状态、目的或动作' : '情节内容'}
              onChange={(event) => updateItem(index, secondaryKey, event.target.value)}
            />
          </div>
        )) : (
          <button
            type="button"
            onClick={readOnly ? undefined : onAdd}
            className={cn(
              'w-full rounded-md border border-dashed border-border px-3 py-3 text-left text-xs text-muted-foreground',
              !readOnly && 'hover:bg-muted/60 hover:text-foreground',
            )}
          >
            {empty}
          </button>
        )}
      </div>
    </div>
  )
}

function JsonSummary({ title, items, empty }: { title: string; items: Array<Record<string, unknown>>; empty: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="max-h-24 space-y-1 overflow-y-auto">
        {items.length > 0 ? items.slice(0, 4).map((item, index) => (
          <div key={`${title}-${index}`} className="rounded-md border border-border bg-background px-2 py-1.5">
            <p className="truncate text-xs font-medium text-foreground">{String(item.name ?? item.label ?? item.title ?? item.id ?? `#${index + 1}`)}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{String(item.summary ?? item.state ?? item.plot ?? item.description ?? item.evidence ?? '')}</p>
          </div>
        )) : (
          <p className="rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted-foreground">{empty}</p>
        )}
      </div>
    </div>
  )
}

function parseJsonList(raw?: string): Array<Record<string, unknown>> {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>
  } catch {
    return []
  }
  return []
}

function scriptVersionText(version: ScriptVersion) {
  return (version.content || version.raw_source || version.summary || '').trim()
}

function formatScriptVersionStatus(status: string) {
  if (status === 'active') return '当前正式版'
  if (status === 'archived') return '已归档'
  return '草稿'
}

function formatDate(value: string) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
