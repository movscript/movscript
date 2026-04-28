import type { Script } from '@/types'
import { Save, Sparkles, Loader2 } from 'lucide-react'
import { ResourceAttachments } from '@/components/shared/ResourceAttachments'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

const SCRIPT_TYPE_MAP: Record<string, { labelKey: string; color: string }> = {
  main:    { labelKey: 'domain.scriptTypes.main',    color: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400' },
  episode: { labelKey: 'domain.scriptTypes.episode', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400' },
  scene:   { labelKey: 'domain.scriptTypes.scene',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
}

interface ScriptFormProps {
  script: Script
  draft: Partial<Script>
  onChange: (d: Partial<Script>) => void
  onSave: (data: Partial<Script>) => void
  isSaving?: boolean
  analyzing?: boolean
  onAnalyze?: () => void
}

export function ScriptForm({ script, draft, onChange, onSave, isSaving, analyzing, onAnalyze }: ScriptFormProps) {
  const { t } = useTranslation()
  const isEpisode = script.script_type === 'episode'
  const isScene = script.script_type === 'scene'
  const typeCfg = SCRIPT_TYPE_MAP[script.script_type]

  function field<K extends keyof Script>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...draft, [key]: e.target.value })
  }

  return (
    <Tabs defaultValue="content" className="flex h-full flex-col overflow-hidden">
      <TabsList className="shrink-0 w-full justify-start rounded-none border-b bg-background px-0 h-auto py-0">
        {onAnalyze && (
          <div className="ml-auto pr-3 flex items-center">
            <button
              onClick={onAnalyze}
              disabled={analyzing}
              className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {t('details.aiAnalyze')}
            </button>
          </div>
        )}
        <TabsTrigger value="content" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-5 py-2.5 text-xs font-medium">
          {t('details.contentManagement')}
        </TabsTrigger>
        <TabsTrigger value="plot" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-5 py-2.5 text-xs font-medium">
          {t('details.scriptBody')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="content" className="flex-1 min-h-0 overflow-y-auto mt-0">
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
                    <Input type="number" value={draft.order ?? ''} onChange={(e) => onChange({ ...draft, order: Number(e.target.value) })} />
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
              onChange={(ids) => onChange({ ...draft, resource_ids: JSON.stringify(ids) })}
            />
          </div>
          <div className="pt-1 border-t border-border">
            <Button onClick={() => onSave(draft)} disabled={isSaving} className="gap-1.5">
              <Save size={13} /> {isSaving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="plot" className="flex-1 min-h-0 overflow-y-auto mt-0">
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
            <Button onClick={() => onSave(draft)} disabled={isSaving} className="gap-1.5">
              <Save size={13} /> {isSaving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  )
}
