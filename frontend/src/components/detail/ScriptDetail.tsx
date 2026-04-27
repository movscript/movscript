import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Script } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Save, Sparkles, Loader2 } from 'lucide-react'
import { ResourceAttachments } from '@/components/shared/ResourceAttachments'
import { cn } from '@/lib/utils'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@movscript/ui'
import { ReviewStatusBadge, ReviewActions } from './ReviewStatus'
import { useTranslation } from 'react-i18next'

const SCRIPT_TYPE_MAP: Record<string, { labelKey: string; color: string }> = {
  main:    { labelKey: 'domain.scriptTypes.main',    color: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400' },
  episode: { labelKey: 'domain.scriptTypes.episode', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400' },
  scene:   { labelKey: 'domain.scriptTypes.scene',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
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
  const [analyzing, setAnalyzing] = useState(false)

  const update = useMutation({
    mutationFn: (data: Partial<Script>) =>
      api.put(`/projects/${projectId}/scripts/${script.ID}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scripts', projectId] }),
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}/scripts/${script.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      onDelete?.()
    },
  })

  async function handleAnalyze() {
    setAnalyzing(true)
    try {
      const res = await api.post(`/projects/${projectId}/scripts/${script.ID}/analyze`, {
        content: draft.content ?? script.content,
      })
      const updated: Script = res.data
      setDraft((d) => ({
        ...d,
        summary: updated.summary,
        characters: updated.characters,
        core_settings: updated.core_settings,
        background: updated.background,
        scenes_desc: updated.scenes_desc,
        hook: updated.hook,
        plot_summary: updated.plot_summary,
      }))
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
    } catch {
      // ignore
    } finally {
      setAnalyzing(false)
    }
  }

  function field<K extends keyof Script>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft((d) => ({ ...d, [key]: e.target.value }))
  }

  const isEpisode = script.script_type === 'episode'
  const isScene = script.script_type === 'scene'
  const typeCfg = SCRIPT_TYPE_MAP[script.script_type]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('text-xs px-2 py-0.5 rounded-full shrink-0 font-medium', typeCfg?.color)}>
            {typeCfg ? t(typeCfg.labelKey) : script.script_type}
          </span>
          <h2 className="text-sm font-semibold text-foreground truncate">{script.title}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ReviewStatusBadge status={script.review_status} />
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 disabled:opacity-50"
          >
            {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {t('details.aiAnalyze')}
          </button>
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose}>{t('common.close')}</Button>
          )}
        </div>
      </div>

      {/* Review actions bar */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-border bg-muted/30 shrink-0">
        <ReviewActions
          status={script.review_status}
          apiUrl={`/projects/${projectId}/scripts/${script.ID}`}
          queryKey={['scripts', projectId]}
        />
        {onDelete && (
          <button
            onClick={() => remove.mutate()}
            className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            {t('common.delete')}
          </button>
        )}
      </div>

      <Tabs defaultValue="content" className="flex flex-col flex-1 overflow-hidden">
        <TabsList className="shrink-0 w-full justify-start rounded-none border-b bg-background px-0 h-auto py-0">
          <TabsTrigger value="content" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-5 py-2.5 text-xs font-medium">
            {t('details.contentManagement')}
          </TabsTrigger>
          <TabsTrigger value="plot" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-5 py-2.5 text-xs font-medium">
            {t('details.scriptBody')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="flex-1 overflow-y-auto mt-0">
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.title')}</Label>
                <Input value={draft.title ?? ''} onChange={field('title')} />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.summaryOptional')}</Label>
                <Input value={draft.description ?? ''} onChange={field('description')} />
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.scriptSummary')}</Label>
              <Textarea className="resize-none" rows={3} placeholder={t('details.scriptSummaryPlaceholder')} value={draft.summary ?? ''} onChange={field('summary')} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.characters')}</Label>
                <Textarea className="resize-none" rows={4} placeholder={t('details.charactersPlaceholder')} value={draft.characters ?? ''} onChange={field('characters')} />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.coreSettings')}</Label>
                <Textarea className="resize-none" rows={4} placeholder={t('details.coreSettingsPlaceholder')} value={draft.core_settings ?? ''} onChange={field('core_settings')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.background')}</Label>
                <Textarea className="resize-none" rows={3} placeholder={t('details.backgroundPlaceholder')} value={draft.background ?? ''} onChange={field('background')} />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.scenes')}</Label>
                <Textarea className="resize-none" rows={3} placeholder={t('details.scenesPlaceholder')} value={draft.scenes_desc ?? ''} onChange={field('scenes_desc')} />
              </div>
            </div>
            {(isEpisode || isScene) && (
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isEpisode ? t('details.episodeSpecific') : t('details.sceneSpecific')}</p>
                {isEpisode && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.episodeOrder')}</Label>
                      <Input type="number" value={draft.order ?? ''} onChange={(e) => setDraft((d) => ({ ...d, order: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.hook')}</Label>
                      <Textarea className="resize-none" rows={2} placeholder={t('details.episodeHookPlaceholder')} value={draft.hook ?? ''} onChange={field('hook')} />
                    </div>
                  </div>
                )}
                {isEpisode && (
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.plotSummary')}</Label>
                    <Textarea className="resize-none" rows={3} placeholder={t('details.plotSummaryPlaceholder')} value={draft.plot_summary ?? ''} onChange={field('plot_summary')} />
                  </div>
                )}
                {isScene && (
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.hook')}</Label>
                    <Textarea className="resize-none" rows={2} placeholder={t('details.sceneHookPlaceholder')} value={draft.hook ?? ''} onChange={field('hook')} />
                  </div>
                )}
              </div>
            )}
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.attachments')}</Label>
              <ResourceAttachments
                resourceIds={draft.resource_ids ? JSON.parse(draft.resource_ids) : []}
                onChange={(ids) => setDraft((d) => ({ ...d, resource_ids: JSON.stringify(ids) }))}
              />
            </div>
            <div className="pt-1 border-t border-border">
              <Button onClick={() => update.mutate(draft)} disabled={update.isPending} className="gap-1.5">
                <Save size={13} /> {update.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="plot" className="flex-1 overflow-y-auto mt-0">
          <div className="p-5 space-y-4 h-full flex flex-col">
            <div className="flex-1 flex flex-col min-h-0">
              <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.scriptBody')}</Label>
              <Textarea
                className="flex-1 font-mono resize-none min-h-[400px]"
                placeholder={t('details.scriptBodyPlaceholder')}
                value={draft.content ?? ''}
                onChange={field('content')}
              />
            </div>
            <div className="pt-1 border-t border-border">
              <Button onClick={() => update.mutate(draft)} disabled={update.isPending} className="gap-1.5">
                <Save size={13} /> {update.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
