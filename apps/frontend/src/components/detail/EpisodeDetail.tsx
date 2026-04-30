import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Script, Episode, Scene, EpisodeScene, Setting, Storyboard } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { ArrowDown, ArrowUp, BookOpen, Check, Clapperboard, Layers, Link, Link2, Plus, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { EntitySemanticForm } from './EntitySemanticForm'
import { DetailHero, HeroMetric, HeroPill } from './DetailHero'
import { StoryboardPreviewStrip } from '@/components/shared/StoryboardPreviewStrip'

interface Props {
  episode: Episode
  onClose?: () => void
  onDelete?: () => void
  showHeader?: boolean
}

export function EpisodeDetail({ episode, onClose, onDelete, showHeader = true }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Episode>>({ ...episode })
  const [linkSceneId, setLinkSceneId] = useState<number | null>(null)

  useEffect(() => setDraft({ ...episode }), [episode])

  const { data: scripts = [] } = useQuery<Script[]>({
    queryKey: ['scripts', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scripts`).then((r) => r.data),
    enabled: !!projectId,
  })
  const episodeScripts = scripts.filter((script) => script.script_type === 'episode')
  const { data: allScenes = [] } = useQuery<Scene[]>({
    queryKey: ['scenes', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scenes`).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: episodeScenes = [] } = useQuery<EpisodeScene[]>({
    queryKey: ['episode-scenes', episode.ID],
    queryFn: () => api.get(`/episodes/${episode.ID}/scenes`).then((r) => r.data),
    enabled: !!episode.ID,
  })
  const { data: allSettings = [] } = useQuery<Setting[]>({
    queryKey: ['settings', projectId],
    queryFn: () => api.get(`/projects/${projectId}/settings`).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: allStoryboards = [] } = useQuery<Storyboard[]>({
    queryKey: ['storyboards-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/storyboards`).then((r) => r.data),
    enabled: !!projectId,
  })

  const update = useMutation({
    mutationFn: (data: Partial<Episode>) => {
      const { script_id: _scriptId, ...episodeData } = data
      return api.put(`/episodes/${episode.ID}`, episodeData).then((r) => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['episodes-project', projectId] })
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
    },
  })

  const updateReferences = useMutation({
    mutationFn: (payload: { script_id?: number | null; setting_ids?: number[]; storyboard_ids?: number[] }) =>
      api.patch(`/episodes/${episode.ID}`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['episodes-project', projectId] })
      qc.invalidateQueries({ queryKey: ['entity-semantic-values', 'episode', episode.ID] })
    },
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/episodes/${episode.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['episodes-project', projectId] })
      onDelete?.()
    },
  })

  const linkScene = useMutation({
    mutationFn: (sceneId: number) => api.post(`/episodes/${episode.ID}/scenes`, { scene_id: sceneId, order: episodeScenes.length }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['episode-scenes', episode.ID] })
      qc.invalidateQueries({ queryKey: ['episodes-project', projectId] })
      qc.invalidateQueries({ queryKey: ['entity-semantic-values', 'episode', episode.ID] })
      setLinkSceneId(null)
    },
  })

  const unlinkScene = useMutation({
    mutationFn: (sceneId: number) => api.delete(`/episodes/${episode.ID}/scenes/${sceneId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['episode-scenes', episode.ID] })
      qc.invalidateQueries({ queryKey: ['episodes-project', projectId] })
      qc.invalidateQueries({ queryKey: ['entity-semantic-values', 'episode', episode.ID] })
    },
  })

  const linkedSceneIds = new Set(episodeScenes.map((es) => es.scene_id))
  const linkedScenes = episodeScenes
    .sort((a, b) => a.order - b.order)
    .map((es) => ({ ...es, scene: allScenes.find((s) => s.ID === es.scene_id) }))
  const availableScenes = allScenes.filter((s) => !linkedSceneIds.has(s.ID))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {showHeader && (
        <DetailHero
          kind="episode"
          title={draft.title ?? episode.title}
          description={draft.synopsis ?? episode.synopsis}
          tone="violet"
          eyebrow={(
            <HeroPill className="font-mono text-violet-700 dark:text-violet-300">EP{String(episode.number).padStart(2, '0')}</HeroPill>
          )}
          meta={(
            <>
              <HeroMetric label={t('entities.scenes')} value={episodeScenes.length} />
              <HeroMetric label={t('entities.storyboards')} value={episode.storyboards?.length ?? 0} />
              <HeroMetric label="ID" value={`#${episode.ID}`} />
            </>
          )}
          onDelete={onDelete ? () => remove.mutate() : undefined}
          onClose={onClose}
          deleteLabel={t('common.delete')}
          closeLabel={t('common.close')}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-80 shrink-0 border-r border-border overflow-hidden">
          <EntitySemanticForm
            kind="episode"
            ownerType="episode"
            ownerId={episode.ID}
            draft={draft}
            onChange={(next) => setDraft(next as Partial<Episode>)}
            onSave={(payload) => update.mutate(payload as Partial<Episode>)}
            isSaving={update.isPending}
            excludeFields={[
              'result',
              'attachment',
              'status',
              'target_storyboards',
              'target_scenes',
              'settings',
              'script',
              'scripts',
              'scenes',
              'storyboards',
            ]}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <EpisodeReferenceOverview
            episode={episode}
            episodeScripts={episodeScripts}
            allSettings={allSettings}
            linkedScenes={linkedScenes}
            availableScenes={availableScenes}
            storyboards={episode.storyboards ?? []}
            allStoryboards={allStoryboards}
            linkSceneId={linkSceneId}
            setLinkSceneId={setLinkSceneId}
            onLinkScene={(sceneId) => linkScene.mutate(sceneId)}
            onUnlinkScene={(sceneId) => unlinkScene.mutate(sceneId)}
            onPatch={(payload) => updateReferences.mutate(payload)}
            isSaving={updateReferences.isPending || linkScene.isPending || unlinkScene.isPending}
          />
          <StoryboardPreviewStrip
            projectId={projectId}
            storyboards={episode.storyboards ?? []}
            title={t('pages.episodes.storyboardPreview', { defaultValue: '本集分镜预览' })}
            className="overflow-hidden rounded-lg border border-border"
          />
        </div>
      </div>
    </div>
  )
}

function EpisodeReferenceOverview({
  episode,
  episodeScripts,
  allSettings,
  linkedScenes,
  availableScenes,
  storyboards,
  allStoryboards,
  linkSceneId,
  setLinkSceneId,
  onLinkScene,
  onUnlinkScene,
  onPatch,
  isSaving,
}: {
  episode: Episode
  episodeScripts: Script[]
  allSettings: Setting[]
  linkedScenes: Array<EpisodeScene & { scene?: Scene }>
  availableScenes: Scene[]
  storyboards: Storyboard[]
  allStoryboards: Storyboard[]
  linkSceneId: number | null
  setLinkSceneId: (id: number | null) => void
  onLinkScene: (id: number) => void
  onUnlinkScene: (id: number) => void
  onPatch: (payload: { script_id?: number | null; setting_ids?: number[]; storyboard_ids?: number[] }) => void
  isSaving?: boolean
}) {
  const { t } = useTranslation()
  const [addStoryboardId, setAddStoryboardId] = useState<number | null>(null)
  const selectedSettingIds = useMemo(() => new Set((episode.settings ?? []).map((setting) => setting.ID)), [episode.settings])
  const selectedScriptId = episode.script_id ?? episode.script?.ID ?? null
  const selectedScript = episode.script ?? episodeScripts.find((script) => script.ID === selectedScriptId)
  const orderedStoryboards = useMemo(() => [...storyboards].sort(compareStoryboardOrder), [storyboards])
  const storyboardIds = orderedStoryboards.map((storyboard) => storyboard.ID)
  const availableStoryboards = allStoryboards.filter((storyboard) => !storyboardIds.includes(storyboard.ID))
  const orderedShots = orderedStoryboards.flatMap((storyboard) => storyboard.shots ?? [])
  const storyboardShotCount = orderedShots.length

  function toggleSetting(settingId: number) {
    const next = new Set(selectedSettingIds)
    if (next.has(settingId)) next.delete(settingId)
    else next.add(settingId)
    onPatch({ setting_ids: Array.from(next) })
  }

  function patchStoryboards(nextIds: number[]) {
    onPatch({ storyboard_ids: nextIds })
  }

  function moveStoryboard(index: number, direction: -1 | 1) {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= storyboardIds.length) return
    const next = [...storyboardIds]
    ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    patchStoryboards(next)
  }

  function addStoryboard() {
    if (!addStoryboardId) return
    patchStoryboards([...storyboardIds, addStoryboardId])
    setAddStoryboardId(null)
  }

  function removeStoryboard(storyboardId: number) {
    patchStoryboards(storyboardIds.filter((id) => id !== storyboardId))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t('pages.scenes.references', { defaultValue: '引用实体' })}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('pages.episodes.referencesHint', { defaultValue: '分集引用分场、分镜、分集剧本和设定；镜头由分镜自动汇总。' })}
          </p>
        </div>
        {isSaving && <span className="text-xs text-muted-foreground">{t('common.saving')}</span>}
      </div>

      <ReferenceSection
        icon={BookOpen}
        title={t('pages.projects.templateSteps.episodeScript')}
        count={selectedScriptId ? 1 : 0}
        action={(
          <select
            className="h-8 min-w-44 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none"
            value={selectedScriptId ?? ''}
            disabled={isSaving}
            onChange={(event) => onPatch({ script_id: event.target.value ? Number(event.target.value) : null })}
          >
            <option value="">{t('forms.unlinked')}</option>
            {episodeScripts.map((script) => <option key={script.ID} value={script.ID}>{script.title}</option>)}
          </select>
        )}
      >
        {selectedScript ? (
          <ReferenceCard
            title={selectedScript.title}
            subtitle={selectedScript.description || selectedScript.summary}
            badge={`#${selectedScript.ID}`}
          />
        ) : (
          <EmptyReference label={t('forms.noLinkedEpisodeScript')} />
        )}
      </ReferenceSection>

      <ReferenceSection
        icon={Link2}
        title={t('canvas.entityTypes.setting', { defaultValue: '设定' })}
        count={selectedSettingIds.size}
        action={allSettings.length > 0 ? (
          <SettingSelector
            settings={allSettings}
            selectedSettingIds={selectedSettingIds}
            disabled={isSaving}
            onToggle={toggleSetting}
          />
        ) : null}
      >
        {(episode.settings ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {(episode.settings ?? []).map((setting) => <ReferenceChip key={setting.ID} label={setting.name} sub={setting.type} />)}
          </div>
        ) : (
          <EmptyReference label={t('pages.episodes.noSettings', { defaultValue: '尚未引用人物、场景或道具设定' })} />
        )}
      </ReferenceSection>

      <ReferenceSection icon={Clapperboard} title={t('entities.scenes')} count={linkedScenes.length}>
        {linkedScenes.length === 0 ? (
          <EmptyReference label={t('details.noLinkedScenes')} />
        ) : (
          <div className="space-y-2">
            {linkedScenes.map(({ scene, scene_id, order: sceneOrder }) => (
              <div key={scene_id} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
                <span className="text-xs text-muted-foreground font-mono shrink-0">{sceneOrder + 1}</span>
                {scene ? (
                  <>
                    <span className="text-xs font-mono text-muted-foreground shrink-0">{t('details.sceneLabel', { number: scene.number })}</span>
                    <span className="text-sm text-foreground truncate flex-1">{scene.title}</span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground flex-1">{t('details.sceneFallback', { id: scene_id })}</span>
                )}
                <button onClick={() => onUnlinkScene(scene_id)} className="shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        {availableScenes.length > 0 && (
          <div className="mt-3 flex gap-2">
            <select
              className="flex-1 border border-border rounded px-2 py-1.5 text-xs bg-background text-foreground"
              value={linkSceneId ?? ''}
              onChange={(e) => setLinkSceneId(Number(e.target.value) || null)}
            >
              <option value="">{t('details.selectSceneLink')}</option>
              {availableScenes.map((scene) => <option key={scene.ID} value={scene.ID}>{t('details.sceneLabel', { number: scene.number })} {scene.title}</option>)}
            </select>
            <Button
              onClick={() => linkSceneId && onLinkScene(linkSceneId)}
              disabled={!linkSceneId || isSaving}
              size="sm"
              className="h-8 gap-1.5 text-xs"
            >
              <Link size={12} /> {t('details.link')}
            </Button>
          </div>
        )}
      </ReferenceSection>

      <ReferenceSection
        icon={Layers}
        title={t('entities.storyboards')}
        count={orderedStoryboards.length}
        action={availableStoryboards.length > 0 ? (
          <div className="flex gap-2">
            <select
              className="h-8 max-w-56 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none"
              value={addStoryboardId ?? ''}
              disabled={isSaving}
              onChange={(event) => setAddStoryboardId(Number(event.target.value) || null)}
            >
              <option value="">{t('details.selectStoryboard', { defaultValue: '选择分镜' })}</option>
              {availableStoryboards.map((storyboard) => <option key={storyboard.ID} value={storyboard.ID}>{storyboard.title || t('details.storyboardLabel', { order: storyboard.order })}</option>)}
            </select>
            <Button onClick={addStoryboard} disabled={!addStoryboardId || isSaving} size="sm" className="h-8 gap-1.5 text-xs">
              <Plus size={12} /> {t('details.link')}
            </Button>
          </div>
        ) : null}
      >
        {orderedStoryboards.length > 0 ? (
          <div className="space-y-2">
            {orderedStoryboards.map((storyboard, index) => (
              <StoryboardReferenceCard
                key={storyboard.ID}
                storyboard={storyboard}
                index={index}
                disabled={isSaving}
                onMoveUp={() => moveStoryboard(index, -1)}
                onMoveDown={() => moveStoryboard(index, 1)}
                onRemove={() => removeStoryboard(storyboard.ID)}
                canMoveUp={index > 0}
                canMoveDown={index < orderedStoryboards.length - 1}
              />
            ))}
          </div>
        ) : (
          <EmptyReference label={t('pages.episodes.noStoryboards', { defaultValue: '尚未引用分镜' })} />
        )}
        {storyboardShotCount > 0 && (
          <div className="mt-3 rounded-md border border-border bg-background/70 px-3 py-2">
            <p className="mb-2 text-xs text-muted-foreground">
              {t('pages.episodes.autoShots', { count: storyboardShotCount, defaultValue: `自动引用 ${storyboardShotCount} 个镜头` })}
            </p>
            <div className="flex flex-wrap gap-2">
              {orderedShots.slice(0, 16).map((shot, index) => <ReferenceChip key={shot.ID} label={`${index + 1}. ${t('details.shotTitle', { order: shot.order })}`} />)}
              {orderedShots.length > 16 && <ReferenceChip label={`+${orderedShots.length - 16}`} sub={t('common.more', { defaultValue: '更多' })} />}
            </div>
          </div>
        )}
      </ReferenceSection>
    </div>
  )
}

function ReferenceSection({
  icon: Icon,
  title,
  count,
  action,
  children,
}: {
  icon: LucideIcon
  title: string
  count: number
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon size={14} />
          </span>
          <div className="min-w-0">
            <h4 className="truncate text-sm font-semibold text-foreground">{title}</h4>
            <p className="text-xs text-muted-foreground">{count}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function SettingSelector({
  settings,
  selectedSettingIds,
  disabled,
  onToggle,
}: {
  settings: Setting[]
  selectedSettingIds: Set<number>
  disabled?: boolean
  onToggle: (id: number) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={disabled} onClick={() => setOpen((value) => !value)}>
        <Link2 size={12} /> {t('common.link', { defaultValue: '关联' })}
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-border bg-popover p-2 shadow-lg">
          <div className="max-h-72 overflow-y-auto space-y-1">
            {settings.map((setting) => {
              const checked = selectedSettingIds.has(setting.ID)
              return (
                <button
                  key={setting.ID}
                  type="button"
                  onClick={() => onToggle(setting.ID)}
                  className={cn('flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted', checked && 'bg-muted')}
                >
                  <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border', checked && 'border-primary bg-primary text-primary-foreground')}>
                    {checked && <Check size={11} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-foreground">{setting.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{setting.type || t('canvas.entityTypes.setting')}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function StoryboardReferenceCard({
  storyboard,
  index,
  disabled,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  storyboard: Storyboard
  index: number
  disabled?: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const shots = storyboard.shots ?? []
  return (
    <div className="rounded-md border border-border/70 bg-background px-3 py-2.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-6 shrink-0 text-xs font-mono text-muted-foreground">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-medium text-foreground">{storyboard.title || t('details.storyboardLabel', { order: storyboard.order })}</p>
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {t('common.shotsCount', { count: shots.length, defaultValue: `${shots.length} 镜头` })}
            </span>
          </div>
          {(storyboard.description || storyboard.intent || storyboard.actions) && (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{storyboard.description || storyboard.intent || storyboard.actions}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton disabled={disabled || !canMoveUp} onClick={onMoveUp} label="up"><ArrowUp size={12} /></IconButton>
          <IconButton disabled={disabled || !canMoveDown} onClick={onMoveDown} label="down"><ArrowDown size={12} /></IconButton>
          <IconButton disabled={disabled} onClick={onRemove} label="remove"><X size={12} /></IconButton>
        </div>
      </div>
    </div>
  )
}

function IconButton({ children, disabled, onClick, label }: { children: ReactNode; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function ReferenceCard({ title, subtitle, badge }: { title: string; subtitle?: string; badge?: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-background px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">{title}</p>
        {badge && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{badge}</span>}
      </div>
      {subtitle && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{subtitle}</p>}
    </div>
  )
}

function compareStoryboardOrder(a: Storyboard, b: Storyboard) {
  return (a.order || 0) - (b.order || 0) || a.ID - b.ID
}

function ReferenceChip({ label, sub }: { label: string; sub?: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs">
      <span className="truncate font-medium text-foreground">{label}</span>
      {sub && <span className="shrink-0 text-muted-foreground">{sub}</span>}
    </span>
  )
}

function EmptyReference({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-background/60 px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
