import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Episode, FinalVideo, ResourceBinding, Scene, Shot, Storyboard } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Button, Input, Label, Textarea } from '@movscript/ui'
import { CreateDialog } from '@/components/shared/CreateDialog'
import { MediaViewer } from '@/components/shared/MediaViewer'
import { ResourceAttachments } from '@/components/shared/ResourceAttachments'
import { EntitySemanticForm, type EntitySemanticFieldRenderContext } from '@/components/detail/EntitySemanticForm'
import { cn } from '@/lib/utils'
import { defaultContentType } from '@/pages/pipeline/nodeSpec'
import { Clapperboard, Film, LayoutGrid, List, Plus, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type ViewMode = 'grid' | 'list'
type FilterMode = 'all' | 'episode' | 'scene' | 'storyboard' | 'shot'

function emptyToNull(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export default function FinalVideosPage() {
  const { t } = useTranslation()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [filterId, setFilterId] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  const { data: rawEpisodes } = useQuery<Episode[]>({
    queryKey: ['episodes-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/episodes`).then((r) => r.data),
    enabled: !!projectId,
  })
  const episodes = rawEpisodes ?? []

  const { data: rawScenes } = useQuery<Scene[]>({
    queryKey: ['scenes', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scenes`).then((r) => r.data),
    enabled: !!projectId,
  })
  const scenes = rawScenes ?? []

  const { data: rawStoryboards } = useQuery<Storyboard[]>({
    queryKey: ['storyboards-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/storyboards`).then((r) => r.data),
    enabled: !!projectId,
  })
  const storyboards = rawStoryboards ?? []

  const { data: rawShots } = useQuery<Shot[]>({
    queryKey: ['shots-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/shots`).then((r) => r.data),
    enabled: !!projectId,
  })
  const shots = rawShots ?? []

  const { data: rawVideos, isLoading } = useQuery<FinalVideo[]>({
    queryKey: ['final-videos', projectId],
    queryFn: () => api.get(`/projects/${projectId}/final-videos`).then((r) => r.data),
    enabled: !!projectId,
  })
  const allVideos = rawVideos ?? []

  const videos = useMemo(() => {
    if (filterMode === 'all' || !filterId) return allVideos
    const key = `${filterMode}_id` as keyof FinalVideo
    return allVideos.filter((item) => item[key] === filterId)
  }, [allVideos, filterId, filterMode])

  const selected = allVideos.find((item) => item.ID === selectedId) ?? null
  const detailOpen = selectedId !== null

  const filterOptions = useMemo(() => {
    if (filterMode === 'episode') {
      return episodes.map((item) => ({ id: item.ID, label: `EP${item.number} ${item.title}` }))
    }
    if (filterMode === 'scene') {
      return scenes.map((item) => ({ id: item.ID, label: `${t('details.sceneLabel', { number: item.number })} ${item.title}` }))
    }
    if (filterMode === 'storyboard') {
      return storyboards.map((item) => ({ id: item.ID, label: item.title || t('details.storyboardLabel', { order: item.order }) }))
    }
    if (filterMode === 'shot') {
      return shots.map((item) => ({ id: item.ID, label: `${t('details.shotTitle', { order: item.order })} ${item.description || ''}` }))
    }
    return []
  }, [episodes, filterMode, scenes, shots, storyboards, t])

  function bindingLabel(item: FinalVideo): string {
    if (item.shot_id) {
      const shot = shots.find((s) => s.ID === item.shot_id)
      return shot ? `${t('details.shotTitle', { order: shot.order })} ${shot.description || ''}` : t('pages.finalVideos.boundShot', { id: item.shot_id })
    }
    if (item.storyboard_id) {
      const storyboard = storyboards.find((s) => s.ID === item.storyboard_id)
      return storyboard?.title || t('details.storyboardLabel', { order: storyboard?.order ?? item.storyboard_id })
    }
    if (item.scene_id) {
      const scene = scenes.find((s) => s.ID === item.scene_id)
      return scene ? `${t('details.sceneLabel', { number: scene.number })} ${scene.title}` : t('pages.finalVideos.boundScene', { id: item.scene_id })
    }
    if (item.episode_id) {
      const episode = episodes.find((e) => e.ID === item.episode_id)
      return episode ? `EP${episode.number} ${episode.title}` : t('pages.finalVideos.boundEpisode', { id: item.episode_id })
    }
    return t('pages.finalVideos.projectLevel')
  }

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <div className={cn('flex flex-col border-r border-border bg-card overflow-hidden', detailOpen ? 'w-72 shrink-0' : 'flex-1')}>
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-background shrink-0 flex-wrap">
          <div className="flex rounded-md border border-border overflow-hidden shrink-0">
            {(['all', 'episode', 'scene', 'storyboard', 'shot'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => { setFilterMode(mode); setFilterId(null); setSelectedId(null) }}
                className={cn('px-2.5 py-1.5 text-xs border-l first:border-l-0 border-border transition-colors', filterMode === mode ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/50')}
              >
                {t(`pages.finalVideos.filters.${mode}`)}
              </button>
            ))}
          </div>
          {filterMode !== 'all' && (
            <select
              className="flex-1 border border-border rounded px-2 py-1.5 text-xs min-w-40 bg-background text-foreground"
              value={filterId ?? ''}
              onChange={(event) => { setFilterId(emptyToNull(event.target.value)); setSelectedId(null) }}
            >
              <option value="">{t('common.all')}</option>
              {filterOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1 ml-auto shrink-0">
            <Button onClick={() => setShowCreate(true)} size="icon" className="h-7 w-7"><Plus size={14} /></Button>
            {!detailOpen && (
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button onClick={() => setViewMode('grid')} className={cn('p-1.5 transition-colors', viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')} title={t('pages.finalVideos.gridTitle')}><LayoutGrid size={13} /></button>
                <button onClick={() => setViewMode('list')} className={cn('p-1.5 transition-colors', viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')} title={t('pages.finalVideos.listTitle')}><List size={13} /></button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-4 text-xs text-muted-foreground text-center">{t('common.loadingShort')}</p>
          ) : videos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Film size={32} className="opacity-30" />
              <p className="text-sm">{t('pages.finalVideos.empty')}</p>
              <button onClick={() => setShowCreate(true)} className="text-xs hover:text-foreground underline underline-offset-4">{t('pages.finalVideos.createOne')}</button>
            </div>
          ) : detailOpen || viewMode === 'list' ? (
            <div className="divide-y divide-border">
              {videos.map((item) => (
                <FinalVideoListRow key={item.ID} video={item} selected={selectedId === item.ID} binding={bindingLabel(item)} onClick={() => setSelectedId(item.ID)} />
              ))}
            </div>
          ) : (
            <div className="p-4 grid grid-cols-2 xl:grid-cols-3 gap-3">
              {videos.map((item) => (
                <FinalVideoGridCard key={item.ID} video={item} selected={selectedId === item.ID} binding={bindingLabel(item)} onClick={() => setSelectedId(item.ID)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {detailOpen && selected && (
        <div className="flex-1 overflow-hidden">
          <FinalVideoDetail
            video={selected}
            episodes={episodes}
            scenes={scenes}
            storyboards={storyboards}
            shots={shots}
            onClose={() => setSelectedId(null)}
            onDelete={() => setSelectedId(null)}
          />
        </div>
      )}

      <CreateDialog open={showCreate} onClose={() => setShowCreate(false)} title={t('pages.finalVideos.createTitle')}>
        <FinalVideoCreateForm projectId={projectId!} onSuccess={() => setShowCreate(false)} onCancel={() => setShowCreate(false)} />
      </CreateDialog>
    </div>
  )
}

function FinalVideoGridCard({ video, selected, binding, onClick }: { video: FinalVideo; selected: boolean; binding: string; onClick: () => void }) {
  const { t } = useTranslation()
  const preview = useFinalVideoResource(video.ID)
  return (
    <button
      onClick={onClick}
      className={cn('text-left bg-background border border-border rounded-lg overflow-hidden hover:border-ring hover:shadow-sm transition-all', selected && 'border-primary ring-1 ring-primary')}
    >
      <div className="aspect-video bg-muted overflow-hidden">
        {preview ? (
          <MediaViewer resource={preview} lightbox={false} className="w-full h-full rounded-none" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Video size={24} />
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium truncate flex-1">{video.title || t('common.emptyTitle')}</p>
        </div>
        <p className="text-xs text-muted-foreground truncate">{binding}</p>
      </div>
    </button>
  )
}

function FinalVideoListRow({ video, selected, binding, onClick }: { video: FinalVideo; selected: boolean; binding: string; onClick: () => void }) {
  const { t } = useTranslation()
  const preview = useFinalVideoResource(video.ID)
  return (
    <button
      onClick={onClick}
      className={cn('w-full text-left px-3 py-2.5 border-b border-border hover:bg-background transition-colors flex items-center gap-2.5', selected && 'bg-background border-l-2 border-l-primary')}
    >
      <div className="w-12 h-8 rounded bg-muted shrink-0 overflow-hidden">
        {preview ? <MediaViewer resource={preview} lightbox={false} className="w-full h-full rounded-none" /> : <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Video size={14} /></div>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{video.title || t('common.emptyTitle')}</p>
        <p className="text-xs text-muted-foreground truncate">{binding}</p>
      </div>
    </button>
  )
}

function useFinalVideoResource(videoId: number) {
  const projectId = useProjectStore((s) => s.current?.ID)
  const { data: bindings = [] } = useQuery<ResourceBinding[]>({
    queryKey: ['resource-bindings', projectId, 'final_video', videoId, 'final'],
    queryFn: () => api.get(`/projects/${projectId}/entities/final_video/${videoId}/resources`, { params: { role: 'final' } }).then((r) => r.data),
    enabled: !!projectId && !!videoId,
  })
  return bindings.find((binding) => binding.resource)?.resource
}

function FinalVideoCreateForm({ projectId, onSuccess, onCancel }: { projectId: number; onSuccess: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')

  const create = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/final-videos`, { title: title || t('pages.finalVideos.defaultTitle') }).then((r) => r.data),
    onSuccess: (created: FinalVideo) => {
      qc.invalidateQueries({ queryKey: ['final-videos', projectId] })
      qc.invalidateQueries({ queryKey: ['pipeline', projectId] })
      api.post(`/projects/${projectId}/pipeline/nodes`, {
        type: 'episode_edit',
        name: created.title,
        content_type: defaultContentType('episode_edit'),
        pos_x: 0,
        pos_y: 0,
      }).then((r) => api.post(`/projects/${projectId}/pipeline/nodes`, {
        type: 'final_video',
        name: created.title,
        content_type: defaultContentType('final_video'),
        entity_type: 'final_video',
        entity_id: created.ID,
        parent_id: r.data.ID,
        pos_x: 0,
        pos_y: 0,
      })).catch(() => {/* fire-and-forget */})
      onSuccess()
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.titleRequired')}</Label>
        <Input autoFocus placeholder={t('pages.finalVideos.titlePlaceholder')} value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && title.trim() && create.mutate()} />
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={() => create.mutate()} disabled={!title.trim() || create.isPending} className="flex-1">
          {create.isPending ? t('common.creating') : t('common.create')}
        </Button>
        <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </div>
  )
}

export function FinalVideoDetail({
  video,
  episodes,
  scenes,
  storyboards,
  shots,
  onClose,
  onDelete,
  showHeader = true,
}: {
  video: FinalVideo
  episodes: Episode[]
  scenes: Scene[]
  storyboards: Storyboard[]
  shots: Shot[]
  onClose?: () => void
  onDelete?: () => void
  showHeader?: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<FinalVideo>>(video)

  useEffect(() => setDraft(video), [video])

  const { data: finalBindings = [] } = useQuery<ResourceBinding[]>({
    queryKey: ['resource-bindings', projectId, 'final_video', video.ID, 'final'],
    queryFn: () => api.get(`/projects/${projectId}/entities/final_video/${video.ID}/resources`, { params: { role: 'final' } }).then((r) => r.data),
    enabled: !!projectId,
  })

  const update = useMutation({
    mutationFn: (payload?: Partial<FinalVideo>) => api.patch(`/final-videos/${video.ID}`, payload ?? {
      title: draft.title,
      description: draft.description,
      episode_id: draft.episode_id,
      scene_id: draft.scene_id,
      storyboard_id: draft.storyboard_id,
      shot_id: draft.shot_id,
    }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['final-videos', projectId] })
      qc.invalidateQueries({ queryKey: ['pipeline', projectId] })
    },
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/final-videos/${video.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['final-videos', projectId] })
      onDelete?.()
    },
  })

  function updateDraft(patch: Partial<FinalVideo>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  const selectedResource = finalBindings.find((binding) => binding.resource)?.resource

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {showHeader && (
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background shrink-0 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Film size={15} className="text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">{video.title || t('common.emptyTitle')}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onDelete && (
              <button onClick={() => remove.mutate()} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                {t('common.delete')}
              </button>
            )}
            {onClose && <Button variant="outline" size="sm" onClick={onClose}>{t('common.close')}</Button>}
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-96 shrink-0 border-r border-border overflow-hidden">
          <EntitySemanticForm
            kind="final_video"
            ownerType="final_video"
            ownerId={video.ID}
            draft={draft}
            onChange={(next) => setDraft(next as Partial<FinalVideo>)}
            onSave={(payload) => update.mutate(payload as Partial<FinalVideo>)}
            isSaving={update.isPending}
            excludeFields={['result', 'reference']}
            fieldRenderers={{
              video: () => (
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1">{t('pages.finalVideos.mediaResource')}</Label>
                  <ResourceAttachments
                    ownerType="final_video"
                    ownerId={video.ID}
                    role="final"
                    slot="video"
                    allowLibrarySelect
                    libraryType="video"
                    libraryTypeOptions={['video']}
                    maxCount={1}
                    accept="video/*"
                  />
                </div>
              ),
              episode_id: (ctx) => <FinalVideoBindingField ctx={ctx} items={episodes} emptyLabel={t('forms.unlinked')} labelFor={(episode) => `EP${episode.number} ${episode.title}`} />,
              scene_id: (ctx) => <FinalVideoBindingField ctx={ctx} items={scenes} emptyLabel={t('forms.unlinked')} labelFor={(scene) => `${t('details.sceneLabel', { number: scene.number })} ${scene.title}`} />,
              storyboard_id: (ctx) => <FinalVideoBindingField ctx={ctx} items={storyboards} emptyLabel={t('forms.unlinked')} labelFor={(storyboard) => storyboard.title || t('details.storyboardLabel', { order: storyboard.order })} />,
              shot_id: (ctx) => <FinalVideoBindingField ctx={ctx} items={shots} emptyLabel={t('forms.unlinked')} labelFor={(shot) => `${t('details.shotTitle', { order: shot.order })} ${shot.description}`} />,
            }}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">{t('pages.finalVideos.preview')}</h3>
            {selectedResource && <span className="text-xs text-muted-foreground">#{selectedResource.ID}</span>}
          </div>
          {selectedResource ? (
            <MediaViewer resource={selectedResource} fit="contain" className="aspect-video w-full rounded-lg" />
          ) : (
            <div className="bg-muted rounded-lg aspect-video flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Clapperboard size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">{t('pages.finalVideos.noMedia')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FinalVideoBindingField<T extends { ID: number }>({
  ctx,
  items,
  emptyLabel,
  labelFor,
}: {
  ctx: EntitySemanticFieldRenderContext
  items: T[]
  emptyLabel: string
  labelFor: (item: T) => string
}) {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground mb-1">{ctx.label}</Label>
      <select
        className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
        value={(ctx.value as number | null | undefined) ?? ''}
        onChange={(event) => ctx.setValue(emptyToNull(event.target.value))}
      >
        <option value="">{emptyLabel}</option>
        {items.map((item) => <option key={item.ID} value={item.ID}>{labelFor(item)}</option>)}
      </select>
    </div>
  )
}
