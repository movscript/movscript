import { useState, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Shot, Storyboard, Scene, Episode, RawResource } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Plus, Camera, Play, SkipBack, SkipForward, X, ListVideo } from 'lucide-react'
import { CreateDialog } from '@/components/shared/CreateDialog'
import { ShotCreateForm } from '@/components/shared/EntityCreateForms'
import { cn } from '@/lib/utils'
import { SHOT_STATUS_COLORS as STATUS_COLORS, SHOT_STATUS_LABEL_KEYS as STATUS_LABEL_KEYS } from '@/constants/shot'
import { Button } from '@movscript/ui'
import { ShotDetail, ReviewStatusBadge } from '@/components/detail'
import { useTranslation } from 'react-i18next'

type SortMode = 'scene' | 'episode'

export default function ShotsPage() {
  const { t } = useTranslation()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [filterSceneId, setFilterSceneId] = useState<number | null>(null)
  const [filterEpisodeId, setFilterEpisodeId] = useState<number | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('scene')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const [playerOpen, setPlayerOpen] = useState(false)
  const [playerQueue, setPlayerQueue] = useState<Shot[]>([])
  const [playerIndex, setPlayerIndex] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)

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

  const { data: rawBoards } = useQuery<Storyboard[]>({
    queryKey: ['storyboards-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/storyboards`).then((r) => r.data),
    enabled: !!projectId,
  })
  const allBoards = rawBoards ?? []

  const { data: rawShots, isLoading } = useQuery<Shot[]>({
    queryKey: ['shots-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/shots`).then((r) => r.data),
    enabled: !!projectId,
  })
  const allShots = rawShots ?? []

  const currentPlayerShot = playerQueue[playerIndex] ?? null
  const { data: playerResource } = useQuery<RawResource>({
    queryKey: ['resource', currentPlayerShot?.generated_res_id],
    queryFn: () => api.get(`/resources/${currentPlayerShot!.generated_res_id}`).then((r) => r.data),
    enabled: !!currentPlayerShot?.generated_res_id && playerOpen,
    staleTime: 5 * 60 * 1000,
  })

  const boardById = useMemo(() => Object.fromEntries(allBoards.map((b) => [b.ID, b])), [allBoards])
  const sceneById = useMemo(() => Object.fromEntries(scenes.map((s) => [s.ID, s])), [scenes])

  function shotSceneId(shot: Shot): number {
    if (!shot.storyboard_id) return 0
    return boardById[shot.storyboard_id]?.scene_id ?? 0
  }

  function shotEpisodeId(shot: Shot): number {
    if (!shot.storyboard_id) return 0
    return boardById[shot.storyboard_id]?.episode_id ?? 0
  }

  const shots = useMemo(() => {
    let filtered = allShots.filter((s) => {
      if (filterSceneId && shotSceneId(s) !== filterSceneId) return false
      if (filterEpisodeId && shotEpisodeId(s) !== filterEpisodeId) return false
      return true
    })
    if (sortMode === 'scene') {
      filtered = filtered.slice().sort((a, b) => {
        const scA = shotSceneId(a), scB = shotSceneId(b)
        const scNumA = sceneById[scA]?.number ?? scA
        const scNumB = sceneById[scB]?.number ?? scB
        if (scNumA !== scNumB) return scNumA - scNumB
        if (a.storyboard_id && b.storyboard_id) {
          const bA = boardById[a.storyboard_id], bB = boardById[b.storyboard_id]
          if ((bA?.order ?? 0) !== (bB?.order ?? 0)) return (bA?.order ?? 0) - (bB?.order ?? 0)
        }
        return a.order - b.order
      })
    } else {
      filtered = filtered.slice().sort((a, b) => {
        const epA = shotEpisodeId(a), epB = shotEpisodeId(b)
        const epNumA = episodes.find((e) => e.ID === epA)?.number ?? epA
        const epNumB = episodes.find((e) => e.ID === epB)?.number ?? epB
        if (epNumA !== epNumB) return epNumA - epNumB
        if (a.storyboard_id && b.storyboard_id) {
          const bA = boardById[a.storyboard_id], bB = boardById[b.storyboard_id]
          if ((bA?.order ?? 0) !== (bB?.order ?? 0)) return (bA?.order ?? 0) - (bB?.order ?? 0)
        }
        return a.order - b.order
      })
    }
    return filtered
  }, [allShots, filterSceneId, filterEpisodeId, sortMode, boardById, sceneById, episodes])

  const playableShots = useMemo(() => shots.filter((s) => s.generated_res_id), [shots])

  const selected = allShots.find((s) => s.ID === selectedId) ?? null
  const detailOpen = selectedId !== null

  function getShotLabel(s: Shot): string {
    if (!s.storyboard_id) return t('details.shotShortLabel', { order: s.order })
    const board = boardById[s.storyboard_id]
    if (!board) return t('details.shotShortLabel', { order: s.order })
    if (sortMode === 'scene') {
      const scene = board.scene_id ? sceneById[board.scene_id] : null
      return scene ? t('details.sceneShotLabel', { scene: scene.number, shot: s.order }) : t('details.shotShortLabel', { order: s.order })
    } else {
      const ep = board.episode_id ? episodes.find((e) => e.ID === board.episode_id) : null
      return ep ? t('details.episodeShotLabel', { episode: ep.number, shot: s.order }) : t('details.shotShortLabel', { order: s.order })
    }
  }

  function playSingle(shot: Shot) {
    if (!shot.generated_res_id) return
    setPlayerQueue([shot])
    setPlayerIndex(0)
    setPlayerOpen(true)
  }

  function playAll() {
    if (playableShots.length === 0) return
    setPlayerQueue(playableShots)
    setPlayerIndex(0)
    setPlayerOpen(true)
  }

  function playerNext() {
    if (playerIndex < playerQueue.length - 1) {
      setPlayerIndex((i) => i + 1)
    } else {
      setPlayerOpen(false)
    }
  }

  function closePlayer() {
    setPlayerOpen(false)
    setPlayerQueue([])
    setPlayerIndex(0)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <div className="flex flex-1 overflow-hidden">
        {/* Left list panel */}
        <div className={cn('flex flex-col border-r border-border bg-card overflow-hidden', detailOpen ? 'w-72 shrink-0' : 'flex-1')}>
          <div className="px-3 py-2.5 border-b border-border bg-background shrink-0 space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex rounded-md border border-border overflow-hidden shrink-0">
                <button onClick={() => { setSortMode('scene'); setFilterEpisodeId(null) }}
                  className={cn('px-2.5 py-1.5 text-xs transition-colors', sortMode === 'scene' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/50')}>{t('pages.shots.byScene')}</button>
                <button onClick={() => { setSortMode('episode'); setFilterSceneId(null) }}
                  className={cn('px-2.5 py-1.5 text-xs border-l border-border transition-colors', sortMode === 'episode' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/50')}>{t('pages.shots.byEpisode')}</button>
              </div>
              {sortMode === 'scene' ? (
                <select className="flex-1 border border-border rounded px-2 py-1.5 text-xs min-w-0 bg-background text-foreground"
                  value={filterSceneId ?? ''} onChange={(e) => { setFilterSceneId(Number(e.target.value) || null); setSelectedId(null) }}>
                  <option value="">{t('pages.shots.allScenes')}</option>
                  {scenes.map((s) => <option key={s.ID} value={s.ID}>{t('details.sceneLabel', { number: s.number })} {s.title}</option>)}
                </select>
              ) : (
                <select className="flex-1 border border-border rounded px-2 py-1.5 text-xs min-w-0 bg-background text-foreground"
                  value={filterEpisodeId ?? ''} onChange={(e) => { setFilterEpisodeId(Number(e.target.value) || null); setSelectedId(null) }}>
                  <option value="">{t('pages.shots.allEpisodes')}</option>
                  {episodes.map((ep) => <option key={ep.ID} value={ep.ID}>EP{ep.number} {ep.title}</option>)}
                </select>
              )}
              <button onClick={playAll} disabled={playableShots.length === 0} title={t('pages.shots.playAll')}
                className={cn('shrink-0 p-1.5 rounded-md transition-colors', playableShots.length > 0 ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground/50 cursor-not-allowed')}>
                <ListVideo size={14} />
              </button>
              <Button onClick={() => setShowCreate(true)} size="icon" className="shrink-0 h-7 w-7"><Plus size={14} /></Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <p className="p-4 text-xs text-muted-foreground text-center">{t('common.loadingShort')}</p>
            ) : shots.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <Camera size={32} className="opacity-30" />
                <p className="text-sm">{t('pages.shots.empty')}</p>
                <button onClick={() => setShowCreate(true)} className="text-xs hover:text-foreground underline underline-offset-4">{t('pages.shots.createOne')}</button>
              </div>
            ) : detailOpen ? (
              shots.map((s) => (
                <button key={s.ID} onClick={() => setSelectedId(s.ID)}
                  className={cn('w-full text-left px-3 py-2.5 border-b border-border hover:bg-background transition-colors', selectedId === s.ID ? 'bg-background border-l-2 border-l-primary' : '')}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono shrink-0">{getShotLabel(s)}</span>
                    <span className="text-sm truncate flex-1">{s.description || t('common.emptyDescription')}</span>
                    <ReviewStatusBadge status={s.review_status} />
                    <span className={cn('text-xs px-1.5 py-0.5 rounded-full shrink-0', STATUS_COLORS[s.status])}>
                      {t(STATUS_LABEL_KEYS[s.status])}
                    </span>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-4 grid grid-cols-2 xl:grid-cols-3 gap-3">
                {shots.map((s) => (
                  <div key={s.ID} className="relative group">
                    <button onClick={() => setSelectedId(s.ID)}
                      className="w-full text-left bg-background border border-border rounded-lg p-4 hover:border-ring hover:shadow-sm transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-mono text-muted-foreground">{getShotLabel(s)}</span>
                        <div className="flex items-center gap-1">
                          <ReviewStatusBadge status={s.review_status} />
                          <span className={cn('text-xs px-1.5 py-0.5 rounded-full', STATUS_COLORS[s.status])}>
                            {t(STATUS_LABEL_KEYS[s.status])}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-foreground line-clamp-3">{s.description || t('common.emptyDescription')}</p>
                      {!s.storyboard_id && <span className="text-xs text-muted-foreground/50 mt-1 block">{t('pages.shots.independent')}</span>}
                    </button>
                    {s.generated_res_id && (
                      <button onClick={(e) => { e.stopPropagation(); playSingle(s) }}
                        className="absolute bottom-3 right-3 bg-primary text-primary-foreground rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm" title={t('pages.shots.play')}>
                        <Play size={11} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detail panel — shared ShotDetail */}
        {detailOpen && selected && (
          <div className="flex-1 overflow-hidden">
            <ShotDetail shot={selected} onClose={() => setSelectedId(null)} onDelete={() => setSelectedId(null)} />
          </div>
        )}
      </div>

      {/* Video Player Bar */}
      {playerOpen && (
        <div className="border-t border-border bg-foreground text-background shrink-0">
          <div className="flex items-center gap-3 px-4 py-2">
            <button onClick={() => playerIndex > 0 && setPlayerIndex((i) => i - 1)} disabled={playerIndex === 0}
              className="p-1.5 rounded hover:bg-muted/20 disabled:opacity-30 transition-colors">
              <SkipBack size={16} />
            </button>
            <div className="flex-1 min-w-0">
              <span className="text-xs text-background/60 font-mono mr-2">{getShotLabel(currentPlayerShot)}</span>
              <span className="text-sm truncate">{currentPlayerShot?.description || t('common.emptyDescription')}</span>
            </div>
            <span className="text-xs text-background/60 shrink-0">{playerIndex + 1} / {playerQueue.length}</span>
            <button onClick={playerNext} className="p-1.5 rounded hover:bg-muted/20 transition-colors"><SkipForward size={16} /></button>
            <button onClick={closePlayer} className="p-1.5 rounded hover:bg-muted/20 transition-colors"><X size={16} /></button>
          </div>
          {playerResource?.url ? (
            <video ref={videoRef} key={playerResource.url} src={playerResource.url} autoPlay controls
              className="w-full max-h-72 bg-black" onEnded={playerNext} />
          ) : (
            <div className="flex items-center justify-center h-20 text-xs text-background/60">
              {currentPlayerShot?.generated_res_id ? t('common.loadingShort') : t('pages.shots.noVideo')}
            </div>
          )}
        </div>
      )}

      <CreateDialog open={showCreate} onClose={() => setShowCreate(false)} title={t('pages.shots.createTitle')}>
        <ShotCreateForm projectId={projectId!} onSuccess={() => setShowCreate(false)} onCancel={() => setShowCreate(false)} />
      </CreateDialog>
    </div>
  )
}
