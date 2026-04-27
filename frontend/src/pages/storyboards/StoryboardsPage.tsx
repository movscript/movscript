import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Storyboard, Scene, Episode } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Plus, Layers } from 'lucide-react'
import { CreateDialog } from '@/components/shared/CreateDialog'
import { StoryboardCreateForm } from '@/components/shared/EntityCreateForms'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { StoryboardDetail, ReviewStatusBadge } from '@/components/detail'
import { useTranslation } from 'react-i18next'

const ANGLE_LABEL_KEYS: Record<string, string> = {
  'close-up': 'domain.cameraAngles.close-up',
  medium: 'domain.cameraAngles.medium',
  wide: 'domain.cameraAngles.wide',
  'extreme-wide': 'domain.cameraAngles.extreme-wide',
  overhead: 'domain.cameraAngles.overhead',
  pov: 'domain.cameraAngles.pov',
}
const MOVE_LABEL_KEYS: Record<string, string> = {
  static: 'domain.cameraMoves.static',
  pan: 'domain.cameraMoves.pan',
  tilt: 'domain.cameraMoves.tilt',
  dolly: 'domain.cameraMoves.dolly',
  zoom: 'domain.cameraMoves.zoom',
  handheld: 'domain.cameraMoves.handheld',
}

export default function StoryboardsPage() {
  const { t } = useTranslation()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [filterMode, setFilterMode] = useState<'all' | 'scene' | 'episode'>('all')
  const [filterSceneId, setFilterSceneId] = useState<number | null>(null)
  const [filterEpisodeId, setFilterEpisodeId] = useState<number | null>(null)
  const [filterStatus, setFilterStatus] = useState<'' | 'draft' | 'approved'>('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data: rawScenes } = useQuery<Scene[]>({
    queryKey: ['scenes', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scenes`).then((r) => r.data),
    enabled: !!projectId,
  })
  const scenes = rawScenes ?? []

  const { data: rawEpisodes } = useQuery<Episode[]>({
    queryKey: ['episodes-all', projectId],
    queryFn: () => api.get(`/projects/${projectId}/episodes`).then((r) => r.data),
    enabled: !!projectId,
  })
  const episodes = rawEpisodes ?? []

  const { data: rawBoards, isLoading } = useQuery<Storyboard[]>({
    queryKey: ['storyboards-project', projectId, filterSceneId, filterEpisodeId],
    queryFn: () => {
      const params: Record<string, string> = {}
      if (filterSceneId) params.scene_id = String(filterSceneId)
      if (filterEpisodeId) params.episode_id = String(filterEpisodeId)
      return api.get(`/projects/${projectId}/storyboards`, { params }).then((r) => r.data)
    },
    enabled: !!projectId,
  })
  const allBoards = rawBoards ?? []
  const storyboards = allBoards.filter((b) => !filterStatus || b.status === filterStatus)

  const selected = allBoards.find((b) => b.ID === selectedId) ?? null
  const detailOpen = selectedId !== null

  const statusTabs = [
    { value: '' as const, label: t('common.all') },
    { value: 'draft' as const, label: t('domain.shotStatus.draft') },
    { value: 'approved' as const, label: t('pages.storyboards.approved') },
  ]

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Left list panel */}
      <div className={cn('flex flex-col border-r border-border bg-card overflow-hidden', detailOpen ? 'w-72 shrink-0' : 'flex-1')}>
        <div className="px-3 py-2.5 border-b border-border bg-background shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border overflow-hidden shrink-0">
              <button onClick={() => { setFilterMode('all'); setFilterSceneId(null); setFilterEpisodeId(null); setSelectedId(null) }}
                className={cn('px-2.5 py-1.5 text-xs transition-colors', filterMode === 'all' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/50')}>{t('common.all')}</button>
              <button onClick={() => { setFilterMode('scene'); setFilterEpisodeId(null); setSelectedId(null) }}
                className={cn('px-2.5 py-1.5 text-xs border-l border-border transition-colors', filterMode === 'scene' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/50')}>{t('pages.storyboards.byScene')}</button>
              <button onClick={() => { setFilterMode('episode'); setFilterSceneId(null); setSelectedId(null) }}
                className={cn('px-2.5 py-1.5 text-xs border-l border-border transition-colors', filterMode === 'episode' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/50')}>{t('pages.storyboards.byEpisode')}</button>
            </div>
            {filterMode === 'scene' && (
              <select className="flex-1 border border-border rounded px-2 py-1.5 text-xs min-w-0 bg-background text-foreground"
                value={filterSceneId ?? ''} onChange={(e) => { setFilterSceneId(Number(e.target.value) || null); setSelectedId(null) }}>
                <option value="">{t('pages.storyboards.allScenes')}</option>
                {scenes.map((s) => <option key={s.ID} value={s.ID}>{t('details.sceneLabel', { number: s.number })} {s.title}</option>)}
              </select>
            )}
            {filterMode === 'episode' && (
              <select className="flex-1 border border-border rounded px-2 py-1.5 text-xs min-w-0 bg-background text-foreground"
                value={filterEpisodeId ?? ''} onChange={(e) => { setFilterEpisodeId(Number(e.target.value) || null); setSelectedId(null) }}>
                <option value="">{t('pages.storyboards.allEpisodes')}</option>
                {episodes.map((ep) => <option key={ep.ID} value={ep.ID}>EP{ep.number} {ep.title}</option>)}
              </select>
            )}
            <Button onClick={() => setShowCreate(true)} size="icon" className="shrink-0 h-7 w-7"><Plus size={14} /></Button>
          </div>
          <div className="flex gap-0.5">
            {statusTabs.map((t) => (
              <button key={t.value} onClick={() => setFilterStatus(t.value)}
                className={cn('flex-1 py-1 text-xs rounded-md transition-colors', filterStatus === t.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-4 text-xs text-muted-foreground text-center">{t('common.loadingShort')}</p>
          ) : storyboards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Layers size={32} className="opacity-30" />
              <p className="text-sm">{t('pages.storyboards.empty')}</p>
              <button onClick={() => setShowCreate(true)} className="text-xs hover:text-foreground underline-offset-4">{t('pages.storyboards.createOne')}</button>
            </div>
          ) : detailOpen ? (
            storyboards.map((b) => (
              <button key={b.ID} onClick={() => setSelectedId(b.ID)}
                className={cn('w-full text-left px-3 py-2.5 border-b border-border hover:bg-background transition-colors', selectedId === b.ID ? 'bg-background border-l-2 border-l-primary' : '')}>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono shrink-0">#{b.order}</span>
                  <span className="text-sm font-medium truncate flex-1">{b.title || b.description || t('common.emptyTitle')}</span>
                  <ReviewStatusBadge status={b.review_status} />
                </div>
              </button>
            ))
          ) : (
            <div className="p-4 grid grid-cols-2 xl:grid-cols-3 gap-3">
              {storyboards.map((b) => {
                const scene = b.scene_id ? scenes.find((s) => s.ID === b.scene_id) : null
                const episode = b.episode_id ? episodes.find((e) => e.ID === b.episode_id) : null
                return (
                  <button key={b.ID} onClick={() => setSelectedId(b.ID)}
                    className="text-left bg-background border border-border rounded-lg p-4 hover:border-ring hover:shadow-sm transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-mono text-muted-foreground">#{b.order}</span>
                      <ReviewStatusBadge status={b.review_status} />
                    </div>
                    <p className="text-sm font-medium text-foreground line-clamp-2 mb-1">{b.title || b.description || t('common.emptyTitle')}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {scene && <span className="text-xs text-muted-foreground truncate">{t('details.sceneLabel', { number: scene.number })} {scene.title}</span>}
                      {episode && <span className="text-xs text-muted-foreground truncate">EP{episode.number} {episode.title}</span>}
                    </div>
                    <div className="flex gap-1 flex-wrap mt-1">
                      {b.camera_angle && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{ANGLE_LABEL_KEYS[b.camera_angle] ? t(ANGLE_LABEL_KEYS[b.camera_angle]) : b.camera_angle}</span>}
                      {b.camera_movement && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{MOVE_LABEL_KEYS[b.camera_movement] ? t(MOVE_LABEL_KEYS[b.camera_movement]) : b.camera_movement}</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel — shared StoryboardDetail */}
      {detailOpen && selected && (
        <div className="flex-1 overflow-hidden">
          <StoryboardDetail storyboard={selected} onClose={() => setSelectedId(null)} onDelete={() => setSelectedId(null)} />
        </div>
      )}

      <CreateDialog open={showCreate} onClose={() => setShowCreate(false)} title={t('pages.storyboards.createTitle')}>
        <StoryboardCreateForm projectId={projectId!} onSuccess={() => setShowCreate(false)} onCancel={() => setShowCreate(false)} />
      </CreateDialog>
    </div>
  )
}
