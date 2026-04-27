import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Storyboard } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Save, Camera, Upload } from 'lucide-react'
import { ResourceAttachments } from '@/components/shared/ResourceAttachments'
import { cn } from '@/lib/utils'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { ReviewStatusBadge, ReviewActions } from './ReviewStatus'
import { useTranslation } from 'react-i18next'

interface Props {
  storyboard: Storyboard
  onClose?: () => void
  onDelete?: () => void
}

export function StoryboardDetail({ storyboard, onClose, onDelete }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Storyboard>>({ ...storyboard })

  const update = useMutation({
    mutationFn: (data: Partial<Storyboard>) =>
      api.put(`/storyboards/${storyboard.ID}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['storyboards-project', projectId] }),
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/storyboards/${storyboard.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['storyboards-project', projectId] })
      onDelete?.()
    },
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-muted-foreground shrink-0">{t('details.storyboardLabel', { order: storyboard.order })}</span>
          <h2 className="text-sm font-semibold text-foreground truncate">{storyboard.title || t('details.storyboardLabel', { order: storyboard.order })}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ReviewStatusBadge status={storyboard.review_status} />
          {onClose && <Button variant="outline" size="sm" onClick={onClose}>{t('common.close')}</Button>}
        </div>
      </div>

      {/* Review actions */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-border bg-muted/30 shrink-0">
        <ReviewActions
          status={storyboard.review_status}
          apiUrl={`/storyboards/${storyboard.ID}`}
          queryKey={['storyboards-project', projectId]}
        />
        {onDelete && (
          <button onClick={() => remove.mutate()} className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors">
            {t('common.delete')}
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: description editor */}
        <div className="w-96 shrink-0 border-r border-border overflow-y-auto p-5 space-y-3">
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.title')}</Label>
            <Input value={draft.title ?? ''} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.description')}</Label>
            <Textarea rows={3} value={draft.description ?? ''} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.characters')}</Label>
              <Textarea rows={2} value={draft.characters ?? ''} onChange={(e) => setDraft((d) => ({ ...d, characters: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.actions')}</Label>
              <Textarea rows={2} value={draft.actions ?? ''} onChange={(e) => setDraft((d) => ({ ...d, actions: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.dialogue')}</Label>
            <Textarea rows={3} value={draft.dialogue ?? ''} onChange={(e) => setDraft((d) => ({ ...d, dialogue: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.atmosphere')}</Label>
            <Textarea rows={2} value={draft.atmosphere ?? ''} onChange={(e) => setDraft((d) => ({ ...d, atmosphere: e.target.value }))} />
          </div>
          <Button onClick={() => update.mutate(draft)} disabled={update.isPending} className="w-full gap-1.5" size="sm">
            <Save size={13} /> {update.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>

        {/* Right: key frames + draft video */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">{t('details.keyframes')}</h3>
              <span className="text-xs text-muted-foreground">{t('details.referenceImages')}</span>
            </div>
            <ResourceAttachments
              resourceIds={draft.resource_ids ? JSON.parse(draft.resource_ids) : []}
              onChange={(ids) => {
                const updated = { ...draft, resource_ids: JSON.stringify(ids) }
                setDraft(updated)
                update.mutate(updated)
              }}
            />
            <div className="mt-3 flex gap-2">
              <button className="flex items-center gap-1.5 text-xs border border-border px-3 py-1.5 rounded hover:bg-muted/50 text-foreground">
                <Upload size={12} /> {t('details.uploadKeyframe')}
              </button>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border px-3 py-1.5 rounded hover:bg-muted">
                {t('details.generateKeyframe')}
              </button>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">{t('details.draftVideo')}</h3>
              <span className="text-xs text-muted-foreground">{t('details.cameraReference')}</span>
            </div>
            <div className="bg-muted rounded-lg aspect-video flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Camera size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">{t('details.noDraftVideo')}</p>
                <button className="mt-2 text-xs text-muted-foreground border border-border px-3 py-1.5 rounded hover:bg-muted">
                  {t('details.generateDraft')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
