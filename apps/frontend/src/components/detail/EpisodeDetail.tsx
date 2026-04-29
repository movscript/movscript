import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Script, Episode, Scene, EpisodeScene } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Link, X } from 'lucide-react'
import { Button } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { EntitySemanticForm } from './EntitySemanticForm'

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
  showHeader?: boolean
}

export function EpisodeDetail({ episode, onClose, onDelete, showHeader = true }: Props) {
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
      setLinkSceneId(null)
    },
  })

  const unlinkScene = useMutation({
    mutationFn: (sceneId: number) => api.delete(`/episodes/${episode.ID}/scenes/${sceneId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['episode-scenes', episode.ID] })
      qc.invalidateQueries({ queryKey: ['episodes-project', projectId] })
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
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background shrink-0 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base font-bold text-muted-foreground font-mono shrink-0">
              EP{String(episode.number).padStart(2, '0')}
            </span>
            <h2 className="text-sm font-semibold text-foreground truncate">{episode.title}</h2>
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

      <EntitySemanticForm
        kind="episode"
        ownerType="episode"
        ownerId={episode.ID}
        draft={draft}
        onChange={(next) => setDraft(next as Partial<Episode>)}
        onSave={(payload) => update.mutate(payload as Partial<Episode>)}
        isSaving={update.isPending}
        excludeFields={['result', 'attachment', 'scenes', 'storyboards']}
        fieldRenderers={{
          status: (ctx) => (
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">{ctx.label}</Label>
              <select
                className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
                value={(ctx.value as string | undefined) ?? ''}
                onChange={(e) => ctx.setValue(e.target.value)}
              >
                {Object.entries(STATUS_LABEL_KEYS).map(([v, labelKey]) => <option key={v} value={v}>{t(labelKey)}</option>)}
              </select>
            </div>
          ),
        }}
        renderAfter={(
          <div className="border-t border-border pt-4 space-y-4">
            <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1 block">{t('forms.linkedEpisodeScript')}</Label>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-foreground">
            {episodeScripts.filter((script) => script.episode_id === episode.ID || script.ID === episode.script_id).length > 0 ? (
              <div className="space-y-1">
                {episodeScripts
                  .filter((script) => script.episode_id === episode.ID || script.ID === episode.script_id)
                  .map((script) => (
                    <div key={script.ID} className="truncate">{script.title}</div>
                  ))}
              </div>
            ) : (
              <span className="text-muted-foreground">{t('forms.noLinkedEpisodeScript')}</span>
            )}
          </div>
            </div>

        {/* Linked scenes */}
        <div className="space-y-3">
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
        )}
      />
    </div>
  )
}
