import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Script, Episode } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Plus, Film } from 'lucide-react'
import { CreateDialog } from '@/components/shared/CreateDialog'
import { EpisodeCreateForm } from '@/components/shared/EntityCreateForms'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EpisodeDetail, ReviewStatusBadge } from '@/components/detail'
import { useTranslation } from 'react-i18next'

const STATUS_LABEL_KEYS: Record<string, string> = {
  draft: 'domain.episodeStatus.draft',
  scripted: 'domain.episodeStatus.scripted',
  storyboarded: 'domain.episodeStatus.storyboarded',
  generating: 'domain.episodeStatus.generating',
  editing: 'domain.episodeStatus.editing',
  done: 'domain.episodeStatus.done',
}
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  scripted: 'bg-muted text-muted-foreground',
  storyboarded: 'bg-muted text-muted-foreground',
  generating: 'bg-amber-100 text-amber-700',
  editing: 'bg-blue-100 text-blue-700',
  done: 'bg-emerald-100 text-emerald-700',
}

export default function EpisodesPage() {
  const { t } = useTranslation()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [filterScriptId, setFilterScriptId] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data: rawScripts } = useQuery<Script[]>({
    queryKey: ['scripts-all', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scripts`).then((r) => r.data),
    enabled: !!projectId,
  })
  const scripts = rawScripts ?? []

  const { data: rawEpisodes, isLoading } = useQuery<Episode[]>({
    queryKey: ['episodes-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/episodes`).then((r) => r.data),
    enabled: !!projectId,
  })
  const allEpisodes = rawEpisodes ?? []
  const episodes = filterScriptId ? allEpisodes.filter((e) => e.script_id === filterScriptId) : allEpisodes

  const selected = allEpisodes.find((e) => e.ID === selectedId) ?? null
  const detailOpen = selectedId !== null

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Left list panel */}
      <div className={cn('flex flex-col border-r border-border bg-card overflow-hidden', detailOpen ? 'w-72 shrink-0' : 'flex-1')}>
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-background shrink-0">
          <select
            className="flex-1 border border-border rounded px-2 py-1.5 text-xs min-w-0 bg-background text-foreground"
            value={filterScriptId ?? ''}
            onChange={(e) => { setFilterScriptId(Number(e.target.value) || null); setSelectedId(null) }}
          >
            <option value="">{t('pages.episodes.all')}</option>
            {scripts.map((s) => <option key={s.ID} value={s.ID}>{s.title}</option>)}
          </select>
          <Button onClick={() => setShowCreate(true)} size="icon" className="shrink-0 h-7 w-7"><Plus size={14} /></Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-4 text-xs text-muted-foreground text-center">{t('common.loadingShort')}</p>
          ) : episodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Film size={32} className="opacity-30" />
              <p className="text-sm">{t('pages.episodes.empty')}</p>
              <button onClick={() => setShowCreate(true)} className="text-xs hover:text-foreground underline underline-offset-4">{t('pages.episodes.createOne')}</button>
            </div>
          ) : detailOpen ? (
            episodes.map((e) => (
              <button key={e.ID} onClick={() => setSelectedId(e.ID)}
                className={cn('w-full text-left px-3 py-2.5 border-b border-border hover:bg-background transition-colors', selectedId === e.ID ? 'bg-background border-l-2 border-l-primary' : '')}>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground shrink-0 font-mono">EP{e.number}</span>
                  <span className="text-sm font-medium truncate flex-1">{e.title}</span>
                  <ReviewStatusBadge status={e.review_status} />
                </div>
              </button>
            ))
          ) : (
            <div className="p-4 grid grid-cols-2 xl:grid-cols-3 gap-3">
              {episodes.map((e) => (
                <button key={e.ID} onClick={() => setSelectedId(e.ID)}
                  className="text-left bg-background border border-border rounded-lg p-4 hover:border-ring hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg font-bold text-muted-foreground/50 font-mono">EP{String(e.number).padStart(2, '0')}</span>
                    <span className={cn('text-xs px-1.5 py-0.5 rounded-full', STATUS_COLORS[e.status] ?? 'bg-muted text-muted-foreground')}>{STATUS_LABEL_KEYS[e.status] ? t(STATUS_LABEL_KEYS[e.status]) : e.status}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1 line-clamp-1">{e.title}</h3>
                  {e.synopsis && <p className="text-xs text-muted-foreground line-clamp-2">{e.synopsis}</p>}
                  <div className="mt-2">
                    <ReviewStatusBadge status={e.review_status} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel — shared EpisodeDetail */}
      {detailOpen && selected && (
        <div className="flex-1 overflow-hidden">
          <EpisodeDetail episode={selected} onClose={() => setSelectedId(null)} onDelete={() => setSelectedId(null)} />
        </div>
      )}

      <CreateDialog open={showCreate} onClose={() => setShowCreate(false)} title={t('pages.episodes.createTitle')}>
        <EpisodeCreateForm projectId={projectId!} onSuccess={() => setShowCreate(false)} onCancel={() => setShowCreate(false)} />
      </CreateDialog>
    </div>
  )
}
