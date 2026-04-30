import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ResourceBinding, Shot } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { Camera } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SHOT_STATUS_LABEL_KEYS, SHOT_STATUS_COLORS } from '@/constants/shot'
import { Button } from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { MediaViewer } from '@/components/shared/MediaViewer'
import { EntitySemanticForm } from './EntitySemanticForm'
import { DetailHero, HeroMetric, HeroPill } from './DetailHero'

interface Props {
  shot: Shot
  onClose?: () => void
  onDelete?: () => void
}

export function ShotDetail({ shot, onClose, onDelete }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Shot>>({ ...shot })

  const update = useMutation({
    mutationFn: (data: Partial<Shot>) =>
      api.put(`/shots/${shot.ID}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shots-project', projectId] })
      qc.invalidateQueries({ queryKey: ['storyboards-project', projectId] })
    },
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/shots/${shot.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shots-project', projectId] })
      onDelete?.()
    },
  })

  const { data: outputBindings = [] } = useQuery<ResourceBinding[]>({
    queryKey: ['resource-bindings', projectId, 'shot', shot.ID, 'final'],
    queryFn: () => api.get(`/projects/${projectId}/entities/shot/${shot.ID}/resources`, { params: { role: 'final' } }).then((r) => r.data),
    enabled: !!projectId,
  })
  const generatedResource = outputBindings.find((binding) => binding.resource)?.resource

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <DetailHero
        title={t('details.shotLabel', { order: shot.order })}
        description={draft.final_description || draft.description || shot.final_description || shot.description}
        tone="amber"
        eyebrow={(
          <>
            <HeroPill>{t('entities.shots')}</HeroPill>
            <HeroPill className={cn(SHOT_STATUS_COLORS[shot.status])}>{t(SHOT_STATUS_LABEL_KEYS[shot.status])}</HeroPill>
          </>
        )}
        meta={(
          <>
            {shot.storyboard_id ? <HeroMetric label={t('entities.storyboards')} value={`#${shot.storyboard_id}`} /> : null}
            {shot.is_approved ? <HeroMetric label={t('details.productionStatus')} value={t('domain.shotStatus.approved')} /> : null}
            <HeroMetric label="ID" value={`#${shot.ID}`} />
          </>
        )}
        onDelete={onDelete ? () => remove.mutate() : undefined}
        onClose={onClose}
        deleteLabel={t('common.delete')}
        closeLabel={t('common.close')}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left: shot settings */}
        <div className="w-96 shrink-0 border-r border-border overflow-hidden">
          <EntitySemanticForm
            kind="shot"
            ownerType="shot"
            ownerId={shot.ID}
            draft={draft}
            onChange={(next) => setDraft(next as Partial<Shot>)}
            onSave={(payload) => update.mutate(payload as Partial<Shot>)}
            isSaving={update.isPending}
            excludeFields={['result', 'video', 'reference']}
          />
        </div>

        {/* Right: final output */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">{t('details.finalShot')}</h3>
            <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', SHOT_STATUS_COLORS[shot.status])}>
              {t(SHOT_STATUS_LABEL_KEYS[shot.status])}
            </span>
          </div>
          {generatedResource ? (
            <MediaViewer resource={generatedResource} fit="contain" className="aspect-video w-full rounded-lg" />
          ) : (
            <div className="bg-muted rounded-lg aspect-video flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Camera size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">{t('details.noGeneratedVideo')}</p>
                <p className="text-xs mt-1 mb-3">{t('details.generateHint')}</p>
                <Button
                  onClick={() => update.mutate({ status: 'generating' })}
                  disabled={shot.status === 'generating'}
                  size="sm"
                >
                  {shot.status === 'generating' ? t('domain.shotStatus.generating') + '…' : t('details.startGenerate')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
