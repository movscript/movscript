import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Scene } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { useTranslation } from 'react-i18next'
import { EntitySemanticForm } from './EntitySemanticForm'
import { DetailHero, HeroMetric, HeroPill } from './DetailHero'

interface Props {
  scene: Scene
  onClose?: () => void
  onDelete?: () => void
  showHeader?: boolean
}

export function SceneDetail({ scene, onClose, onDelete, showHeader = true }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Scene>>({ ...scene })

  const update = useMutation({
    mutationFn: (data: Partial<Scene>) =>
      api.put(`/scenes/${scene.ID}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scenes', projectId] }),
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/scenes/${scene.ID}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scenes', projectId] })
      onDelete?.()
    },
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {showHeader && (
        <DetailHero
          title={draft.title ?? scene.title}
          description={draft.notes ?? scene.notes}
          tone="blue"
          eyebrow={<HeroPill className="font-mono text-blue-700 dark:text-blue-300">{t('details.sceneLabel', { number: scene.number })}</HeroPill>}
          meta={(
            <>
              {scene.location && <HeroMetric label={t('details.scenes')} value={scene.location} />}
              {scene.time_of_day && <HeroMetric label={t('details.timeOfDay')} value={scene.time_of_day} />}
              <HeroMetric label="ID" value={`#${scene.ID}`} />
            </>
          )}
          onDelete={onDelete ? () => remove.mutate() : undefined}
          onClose={onClose}
          deleteLabel={t('common.delete')}
          closeLabel={t('common.close')}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 shrink-0 border-r border-border overflow-hidden">
          <EntitySemanticForm
            kind="scene"
            ownerType="scene"
            ownerId={scene.ID}
            draft={draft}
            onChange={(next) => setDraft(next as Partial<Scene>)}
            onSave={(payload) => update.mutate(payload as Partial<Scene>)}
            isSaving={update.isPending}
            excludeFields={['result', 'reference', 'storyboards', 'shots']}
          />
        </div>

        {/* Right: media */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">{t('details.mediaLibrary')}</h3>
            <span className="text-xs text-muted-foreground">{t('details.imageVideo')}</span>
          </div>
          <EntitySemanticForm
            kind="scene"
            ownerType="scene"
            ownerId={scene.ID}
            draft={draft}
            onChange={(next) => setDraft(next as Partial<Scene>)}
            onSave={(payload) => update.mutate(payload as Partial<Scene>)}
            isSaving={update.isPending}
            includeFields={['reference', 'storyboards', 'shots']}
            className="h-auto overflow-visible p-0"
            showSave={false}
          />
        </div>
      </div>
    </div>
  )
}
