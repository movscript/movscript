import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Storyboard } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Camera } from 'lucide-react'
import { Button } from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { StoryboardForm } from '@/components/forms/StoryboardForm'

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
          {onDelete && (
            <button onClick={() => remove.mutate()} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
              {t('common.delete')}
            </button>
          )}
          {onClose && <Button variant="outline" size="sm" onClick={onClose}>{t('common.close')}</Button>}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: storyboard planning */}
        <div className="w-[28rem] shrink-0 border-r border-border overflow-hidden">
          <StoryboardForm
            storyboard={storyboard}
            draft={draft}
            onChange={setDraft}
            onSave={(data) => update.mutate(data)}
            isSaving={update.isPending}
          />
        </div>

        {/* Right: draft video */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
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
