import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Script, Episode, Scene, EpisodeScene } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Save, Link, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { ReviewStatusBadge, ReviewActions } from './ReviewStatus'
import { useTranslation } from 'react-i18next'

const STATUS_LABEL_KEYS: Record<string, string> = {
  draft: 'domain.episodeStatus.draft',
  scripted: 'domain.episodeStatus.scripted',
  storyboarded: 'domain.episodeStatus.storyboarded',
  generating: 'domain.episodeStatus.generating',
  editing: 'domain.episodeStatus.editing',
  done: 'domain.episodeStatus.done',
}

interface Props {
  episode: Episode
  onClose?: () => void
  onDelete?: () => void
}

export function EpisodeDetail({ episode, onClose, onDelete }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Episode>>({ ...episode })
  const [linkSceneId, setLinkSceneId] = useState<number | null>(null)

  const { data: scripts = [] } = useQuery<Script[]>({
    queryKey: ['scripts', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scripts`).then((r) => r.data),
    enabled: !!projectId,
  })
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

  const update = useMutation({
    mutationFn: (data: Partial<Episode>) =>
      api.put(`/episodes/${episode.ID}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['episodes-project', projectId] }),
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/episodes/${episode.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['episodes-project', projectId] })
      onDelete?.()
    },
  })

  const linkScene = useMutation({
    mutationFn: (sceneId: number) => api.post(`/episodes/${episode.ID}/scenes`, { scene_id: sceneId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['episode-scenes', episode.ID] }); setLinkSceneId(null) },
  })

  const unlinkScene = useMutation({
    mutationFn: (sceneId: number) => api.delete(`/episodes/${episode.ID}/scenes/${sceneId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['episode-scenes', episode.ID] }),
  })

  function field<K extends keyof Episode>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setDraft((d) => ({ ...d, [key]: e.target.value }))
  }

  const linkedSceneIds = new Set(episodeScenes.map((es) => es.scene_id))
  const linkedScenes = episodeScenes
    .sort((a, b) => a.order - b.order)
    .map((es) => ({ ...es, scene: allScenes.find((s) => s.ID === es.scene_id) }))
  const availableScenes = allScenes.filter((s) => !linkedSceneIds.has(s.ID))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base font-bold text-muted-foreground font-mono shrink-0">
            EP{String(episode.number).padStart(2, '0')}
          </span>
          <h2 className="text-sm font-semibold text-foreground truncate">{episode.title}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ReviewStatusBadge status={episode.review_status} />
          {onClose && <Button variant="outline" size="sm" onClick={onClose}>{t('common.close')}</Button>}
        </div>
      </div>

      {/* Review actions */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-border bg-muted/30 shrink-0">
        <ReviewActions
          status={episode.review_status}
          apiUrl={`/episodes/${episode.ID}`}
          queryKey={['episodes-project', projectId]}
        />
        {onDelete && (
          <button onClick={() => remove.mutate()} className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors">
            {t('common.delete')}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1 block">{t('forms.title')}</Label>
            <Input value={draft.title ?? ''} onChange={field('title')} />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1 block">{t('details.episodeNumber')}</Label>
            <Input type="number" value={draft.number ?? ''} onChange={(e) => setDraft((d) => ({ ...d, number: Number(e.target.value) }))} />
          </div>
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1 block">{t('forms.linkedScriptOptional')}</Label>
          <select
            className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
            value={draft.script_id ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, script_id: Number(e.target.value) || undefined }))}
          >
            <option value="">{t('forms.noScriptDirect')}</option>
            {scripts.map((s) => <option key={s.ID} value={s.ID}>{s.title}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1 block">{t('details.episodeSynopsis')}</Label>
          <Textarea className="resize-none" rows={4} value={draft.synopsis ?? ''} onChange={field('synopsis')} />
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1 block">{t('details.productionStatus')}</Label>
          <select
            className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
            value={draft.status ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
          >
            {Object.entries(STATUS_LABEL_KEYS).map(([v, labelKey]) => <option key={v} value={v}>{t(labelKey)}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1 block">{t('details.targetStoryboards')}</Label>
            <Input type="number" min={0} value={draft.target_storyboards ?? ''} onChange={(e) => setDraft((d) => ({ ...d, target_storyboards: Number(e.target.value) || 0 }))} />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1 block">{t('details.targetScenes')}</Label>
            <Input type="number" min={0} value={draft.target_scenes ?? ''} onChange={(e) => setDraft((d) => ({ ...d, target_scenes: Number(e.target.value) || 0 }))} />
          </div>
        </div>
        <div className="pt-1 border-t border-border">
          <Button onClick={() => update.mutate(draft)} disabled={update.isPending} className="gap-1.5" size="sm">
            <Save size={13} /> {update.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>

        {/* Linked scenes */}
        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">{t('details.linkedScenes')}</p>
          {linkedScenes.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('details.noLinkedScenes')}</p>
          ) : (
            <div className="space-y-1">
              {linkedScenes.map(({ scene, scene_id, order: sceneOrder }) => (
                <div key={scene_id} className="flex items-center gap-2 px-3 py-2 bg-card rounded border border-border">
                  <span className="text-xs text-muted-foreground font-mono shrink-0">{sceneOrder + 1}</span>
                  {scene ? (
                    <>
                      <span className="text-xs font-mono text-muted-foreground shrink-0">{t('details.sceneLabel', { number: scene.number })}</span>
                      <span className="text-sm text-foreground truncate flex-1">{scene.title}</span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground flex-1">{t('details.sceneFallback', { id: scene_id })}</span>
                  )}
                  <button onClick={() => unlinkScene.mutate(scene_id)} className="shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {availableScenes.length > 0 && (
            <div className="flex gap-2">
              <select
                className="flex-1 border border-border rounded px-2 py-1.5 text-xs bg-background text-foreground"
                value={linkSceneId ?? ''}
                onChange={(e) => setLinkSceneId(Number(e.target.value) || null)}
              >
                <option value="">{t('details.selectSceneLink')}</option>
                {availableScenes.map((s) => <option key={s.ID} value={s.ID}>{t('details.sceneLabel', { number: s.number })} {s.title}</option>)}
              </select>
              <button
                onClick={() => linkSceneId && linkScene.mutate(linkSceneId)}
                disabled={!linkSceneId || linkScene.isPending}
                className="flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs hover:bg-primary/90 disabled:opacity-40"
              >
                <Link size={12} /> {t('details.link')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
