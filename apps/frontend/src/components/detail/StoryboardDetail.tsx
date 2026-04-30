import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Storyboard } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Camera } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EntitySemanticForm } from './EntitySemanticForm'
import { DetailHero, HeroMetric, HeroPill } from './DetailHero'

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
      <DetailHero
        kind="storyboard"
        title={draft.title || storyboard.title || t('details.storyboardLabel', { order: storyboard.order })}
        description={draft.description || storyboard.description || storyboard.intent || storyboard.actions}
        tone="sky"
        eyebrow={(
          <>
            <HeroPill>{t('details.storyboardLabel', { order: storyboard.order })}</HeroPill>
            {storyboard.status && <HeroPill>{storyboard.status}</HeroPill>}
          </>
        )}
        meta={(
          <>
            {storyboard.duration ? <HeroMetric label={t('details.duration')} value={storyboard.duration} /> : null}
            {storyboard.camera_movement && <HeroMetric label={t('details.cameraReference')} value={storyboard.camera_movement} />}
            <HeroMetric label="ID" value={`#${storyboard.ID}`} />
          </>
        )}
        onDelete={onDelete ? () => remove.mutate() : undefined}
        onClose={onClose}
        deleteLabel={t('common.delete')}
        closeLabel={t('common.close')}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left: storyboard planning */}
        <div className="w-[28rem] shrink-0 border-r border-border overflow-hidden">
          <EntitySemanticForm
            kind="storyboard"
            ownerType="storyboard"
            ownerId={storyboard.ID}
            draft={draft}
            onChange={(next) => setDraft(next as Partial<Storyboard>)}
            onSave={(payload) => update.mutate(payload as Partial<Storyboard>)}
            isSaving={update.isPending}
            excludeFields={['result', 'image', 'reference', 'shots', 'prompt']}
          />
        </div>

        {/* Right: draft video */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <EntitySemanticForm
            kind="storyboard"
            ownerType="storyboard"
            ownerId={storyboard.ID}
            draft={draft}
            onChange={(next) => setDraft(next as Partial<Storyboard>)}
            onSave={(payload) => update.mutate(payload as Partial<Storyboard>)}
            isSaving={update.isPending}
            includeFields={['image', 'reference', 'shots']}
            className="h-auto overflow-visible p-0"
            showSave={false}
          />
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
