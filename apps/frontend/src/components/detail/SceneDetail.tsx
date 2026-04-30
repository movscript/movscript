import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Scene, Script, Setting, Storyboard } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, BookOpen, Check, Clapperboard, Film, Layers, Link2, Plus, X, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@movscript/ui'
import { cn } from '@/lib/utils'
import { EntitySemanticForm } from './EntitySemanticForm'
import { DetailHero, HeroMetric, HeroPill } from './DetailHero'

interface Props {
  scene: Scene
  onClose?: () => void
  onDelete?: () => void
  showHeader?: boolean
}

export function SceneDetail({ scene, onClose, onDelete, showHeader = true }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Scene>>({ ...scene })

  useEffect(() => setDraft({ ...scene }), [scene])

  const update = useMutation({
    mutationFn: (data: Partial<Scene>) =>
      api.put(`/scenes/${scene.ID}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scenes', projectId] }),
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/scenes/${scene.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scenes', projectId] })
      onDelete?.()
    },
  })

  const updateReferences = useMutation({
    mutationFn: (payload: { script_id?: number | null; setting_ids?: number[]; storyboard_ids?: number[] }) =>
      api.patch(`/scenes/${scene.ID}`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scenes', projectId] })
      qc.invalidateQueries({ queryKey: ['entity-semantic-values', 'scene', scene.ID] })
    },
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {showHeader && (
        <DetailHero
          kind="scene"
          title={draft.title ?? scene.title}
          description={draft.notes ?? scene.notes}
          tone="blue"
          eyebrow={<HeroPill className="font-mono text-blue-700 dark:text-blue-300">{t('details.sceneLabel', { number: scene.number })}</HeroPill>}
          meta={(
            <>
              <HeroMetric label="ID" value={`#${scene.ID}`} />
            </>
          )}
          onDelete={onDelete ? () => remove.mutate() : undefined}
          onClose={onClose}
          deleteLabel={t('common.delete')}
          closeLabel={t('common.close')}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 shrink-0 border-r border-border overflow-hidden">
          <EntitySemanticForm
            kind="scene"
            ownerType="scene"
            ownerId={scene.ID}
            draft={draft}
            onChange={(next) => setDraft(next as Partial<Scene>)}
            onSave={(payload) => update.mutate(payload as Partial<Scene>)}
            isSaving={update.isPending}
            excludeFields={[
              'result',
              'reference',
              'location',
              'time_of_day',
              'settings',
              'scripts',
              'storyboards',
              'shots',
              'final_videos',
            ]}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <SceneReferenceOverview
            scene={scene}
            projectId={projectId}
            onPatch={(payload) => updateReferences.mutate(payload)}
            isSaving={updateReferences.isPending}
          />

          <EntitySemanticForm
            kind="scene"
            ownerType="scene"
            ownerId={scene.ID}
            draft={draft}
            onChange={(next) => setDraft(next as Partial<Scene>)}
            onSave={(payload) => update.mutate(payload as Partial<Scene>)}
            isSaving={update.isPending}
            includeFields={['reference']}
            className="h-auto overflow-visible p-0"
            showSave={false}
          />
        </div>
      </div>
    </div>
  )
}

function SceneReferenceOverview({
  scene,
  projectId,
  onPatch,
  isSaving,
}: {
  scene: Scene
  projectId?: number
  onPatch: (payload: { script_id?: number | null; setting_ids?: number[]; storyboard_ids?: number[] }) => void
  isSaving?: boolean
}) {
  const { t } = useTranslation()
  const [addStoryboardId, setAddStoryboardId] = useState<number | null>(null)
  const { data: allSettings = [] } = useQuery<Setting[]>({
    queryKey: ['settings', projectId],
    queryFn: () => api.get(`/projects/${projectId}/settings`).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: sceneScripts = [] } = useQuery<Script[]>({
    queryKey: ['scripts', projectId, 'scene'],
    queryFn: () => api.get(`/projects/${projectId}/scripts`, { params: { type: 'scene' } }).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: allStoryboards = [] } = useQuery<Storyboard[]>({
    queryKey: ['storyboards-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/storyboards`).then((r) => r.data),
    enabled: !!projectId,
  })

  const selectedSettingIds = useMemo(() => new Set((scene.settings ?? []).map((setting) => setting.ID)), [scene.settings])
  const storyboards = useMemo(() => [...(scene.storyboards ?? [])].sort(compareStoryboardOrder), [scene.storyboards])
  const storyboardIds = storyboards.map((storyboard) => storyboard.ID)
  const availableStoryboards = allStoryboards.filter((storyboard) => !storyboardIds.includes(storyboard.ID))
  const shots = storyboards.flatMap((storyboard) => storyboard.shots ?? [])
  const finalVideos = scene.final_videos ?? []
  const selectedScriptId = scene.script_id ?? scene.script?.ID ?? null

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
            {t('pages.scenes.referencesHint', { defaultValue: '分场只维护引用关系，分镜会自动带出镜头。' })}
          </p>
        </div>
        {isSaving && <span className="text-xs text-muted-foreground">{t('common.saving')}</span>}
      </div>

      <ReferenceSection
        icon={Users}
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
        {(scene.settings ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {(scene.settings ?? []).map((setting) => (
              <ReferenceChip key={setting.ID} label={setting.name} sub={setting.type} />
            ))}
          </div>
        ) : (
          <EmptyReference label={t('pages.scenes.noSettings', { defaultValue: '尚未引用人物或场景设定' })} />
        )}
      </ReferenceSection>

      <ReferenceSection
        icon={BookOpen}
        title={t('pages.projects.templateSteps.sceneScript', { defaultValue: '分场剧本' })}
        count={selectedScriptId ? 1 : 0}
        action={(
          <select
            className="h-8 min-w-40 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none"
            value={selectedScriptId ?? ''}
            disabled={isSaving}
            onChange={(event) => onPatch({ script_id: event.target.value ? Number(event.target.value) : null })}
          >
            <option value="">{t('forms.unlinked')}</option>
            {sceneScripts.map((script) => <option key={script.ID} value={script.ID}>{script.title}</option>)}
          </select>
        )}
      >
        {scene.script ? (
          <ReferenceCard
            title={scene.script.title}
            subtitle={scene.script.description || t('pages.projects.templateSteps.sceneScript', { defaultValue: '分场剧本' })}
            badge={`#${scene.script.ID}`}
          />
        ) : (
          <EmptyReference label={t('pages.scenes.noSceneScript', { defaultValue: '尚未引用分场剧本' })} />
        )}
      </ReferenceSection>

      <ReferenceSection
        icon={Layers}
        title={t('entities.storyboards')}
        count={storyboards.length}
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
        {storyboards.length > 0 ? (
          <div className="space-y-2">
            {storyboards.map((storyboard, index) => (
              <StoryboardReferenceCard
                key={storyboard.ID}
                storyboard={storyboard}
                index={index}
                disabled={isSaving}
                onMoveUp={() => moveStoryboard(index, -1)}
                onMoveDown={() => moveStoryboard(index, 1)}
                onRemove={() => removeStoryboard(storyboard.ID)}
                canMoveUp={index > 0}
                canMoveDown={index < storyboards.length - 1}
              />
            ))}
          </div>
        ) : (
          <EmptyReference label={t('pages.scenes.noStoryboards', { defaultValue: '尚未引用分镜' })} />
        )}
      </ReferenceSection>

      <ReferenceSection icon={Clapperboard} title={t('entities.shots')} count={shots.length}>
        {shots.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {shots.slice(0, 12).map((shot, index) => <ReferenceChip key={shot.ID} label={`${index + 1}. ${t('details.shotLabel', { order: shot.order })}`} sub={shot.status} />)}
            {shots.length > 12 && <ReferenceChip label={`+${shots.length - 12}`} sub={t('common.more', { defaultValue: '更多' })} />}
          </div>
        ) : (
          <EmptyReference label={t('pages.scenes.noShots', { defaultValue: '分镜下暂无镜头' })} />
        )}
      </ReferenceSection>

      <ReferenceSection icon={Film} title={t('entities.finalVideos')} count={finalVideos.length}>
        {finalVideos.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2">
            {finalVideos.map((video) => (
              <ReferenceCard
                key={video.ID}
                title={video.title || t('entities.finalVideos')}
                subtitle={video.description || video.status}
                badge={video.status}
              />
            ))}
          </div>
        ) : (
          <EmptyReference label={t('pages.scenes.noFinalVideos', { defaultValue: '尚未引用成片' })} />
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

function compareStoryboardOrder(a: Storyboard, b: Storyboard) {
  return (a.order || 0) - (b.order || 0) || a.ID - b.ID
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
