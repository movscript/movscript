import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Setting, Storyboard } from '@/types'
import { useProjectStore } from '@/store/projectStore'
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

  const { data: settings = [] } = useQuery<Setting[]>({
    queryKey: ['settings', projectId],
    queryFn: () => api.get(`/projects/${projectId}/settings`).then((r) => r.data),
    enabled: !!projectId,
  })

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
            {storyboard.setting?.name && <HeroPill>{storyboard.setting.name}</HeroPill>}
          </>
        )}
        meta={(
          <>
            {storyboard.duration ? <HeroMetric label={t('details.duration')} value={storyboard.duration} /> : null}
            {storyboard.movement && <HeroMetric label={t('details.cameraMovement')} value={storyboard.movement} />}
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
            excludeFields={['result', 'image', 'reference', 'raw_source', 'shots', 'prompt']}
            fieldRenderers={{
              setting_id: ({ label, value, setValue }) => (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
                  <select
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={(value as number | null | undefined) ?? ''}
                    onChange={(event) => setValue(Number(event.target.value) || null)}
                  >
                    <option value="">{t('forms.unlinked')}</option>
                    {settings.map((setting) => (
                      <option key={setting.ID} value={setting.ID}>{setting.name} · {setting.type}</option>
                    ))}
                  </select>
                </div>
              ),
            }}
          />
        </div>

        {/* Right: media bindings */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <EntitySemanticForm
            kind="storyboard"
            ownerType="storyboard"
            ownerId={storyboard.ID}
            draft={draft}
            onChange={(next) => setDraft(next as Partial<Storyboard>)}
            onSave={(payload) => update.mutate(payload as Partial<Storyboard>)}
            isSaving={update.isPending}
            includeFields={['image', 'raw_source', 'reference', 'shots']}
            className="h-auto overflow-visible p-0"
            showSave={false}
          />
        </div>
      </div>
    </div>
  )
}
