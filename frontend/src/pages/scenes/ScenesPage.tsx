import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Scene } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Plus, Clapperboard } from 'lucide-react'
import { CreateDialog } from '@/components/shared/CreateDialog'
import { SceneCreateForm } from '@/components/shared/EntityCreateForms'
import { cn } from '@/lib/utils'
import { Button } from '@movscript/ui'
import { SceneDetail, ReviewStatusBadge } from '@/components/detail'
import { useTranslation } from 'react-i18next'

export default function ScenesPage() {
  const { t } = useTranslation()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data: rawScenes, isLoading } = useQuery<Scene[]>({
    queryKey: ['scenes', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scenes`).then((r) => r.data),
    enabled: !!projectId,
  })
  const scenes = rawScenes ?? []
  const selected = scenes.find((s) => s.ID === selectedId) ?? null
  const detailOpen = selectedId !== null

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Left list panel */}
      <div className={cn('flex flex-col border-r border-border bg-card overflow-hidden', detailOpen ? 'w-72 shrink-0' : 'flex-1')}>
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-background shrink-0">
          <span className="text-sm font-medium text-foreground px-1">{t('pages.scenes.list')}</span>
          <Button onClick={() => setShowCreate(true)} size="icon" className="shrink-0 h-7 w-7"><Plus size={14} /></Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-4 text-xs text-muted-foreground text-center">{t('common.loadingShort')}</p>
          ) : scenes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Clapperboard size={32} className="opacity-30" />
              <p className="text-sm">{t('pages.scenes.empty')}</p>
              <button onClick={() => setShowCreate(true)} className="text-xs hover:text-foreground underline-offset-4">{t('pages.scenes.createOne')}</button>
            </div>
          ) : detailOpen ? (
            scenes.map((s) => (
              <button key={s.ID} onClick={() => setSelectedId(s.ID)}
                className={cn('w-full text-left px-3 py-2.5 border-b border-border hover:bg-background transition-colors', selectedId === s.ID ? 'bg-background border-l-2 border-l-primary' : '')}>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono shrink-0">{t('details.sceneLabel', { number: s.number })}</span>
                  <span className="text-sm font-medium truncate flex-1">{s.title}</span>
                  <ReviewStatusBadge status={s.review_status} />
                </div>
              </button>
            ))
          ) : (
            <div className="p-4 grid grid-cols-2 xl:grid-cols-3 gap-3">
              {scenes.map((s) => (
                <button key={s.ID} onClick={() => setSelectedId(s.ID)}
                  className="text-left bg-background border border-border rounded-lg p-4 hover:border-ring hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-mono text-muted-foreground">{t('details.sceneLabel', { number: String(s.number).padStart(2, '0') })}</span>
                    <ReviewStatusBadge status={s.review_status} />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1 line-clamp-2">{s.title}</h3>
                  {s.location && <p className="text-xs text-muted-foreground truncate">📍 {s.location}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel — shared SceneDetail */}
      {detailOpen && selected && (
        <div className="flex-1 overflow-hidden">
          <SceneDetail scene={selected} onClose={() => setSelectedId(null)} onDelete={() => setSelectedId(null)} />
        </div>
      )}

      <CreateDialog open={showCreate} onClose={() => setShowCreate(false)} title={t('pages.scenes.createTitle')}>
        <SceneCreateForm projectId={projectId!} onSuccess={() => setShowCreate(false)} onCancel={() => setShowCreate(false)} />
      </CreateDialog>
    </div>
  )
}
