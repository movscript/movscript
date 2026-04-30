import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Shot, Storyboard } from '@/types'
import { Save } from 'lucide-react'
import { ResourceAttachments } from '@/components/shared/ResourceAttachments'
import { useProjectStore } from '@/store/projectStore'
import { Button } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { useTranslation } from 'react-i18next'

interface ShotFormProps {
  shot: Shot
  draft: Partial<Shot>
  onChange: (d: Partial<Shot>) => void
  onSave: (data: Partial<Shot>) => void
  isSaving?: boolean
}

export function ShotForm({ shot, draft, onChange, onSave, isSaving }: ShotFormProps) {
  const { t } = useTranslation()
  const projectId = useProjectStore((s) => s.current?.ID)

  const { data: storyboards = [] } = useQuery<Storyboard[]>({
    queryKey: ['storyboards-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/storyboards`).then((r) => r.data),
    enabled: !!projectId,
  })

  return (
    <div className="h-full overflow-y-auto p-5 space-y-3">
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.parentStoryboardOptional')}</Label>
        <select
          className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
          value={draft.storyboard_id ?? ''}
          onChange={(e) => onChange({ ...draft, storyboard_id: Number(e.target.value) || null })}
        >
          <option value="">{t('forms.independentShot')}</option>
          {storyboards.map((b) => <option key={b.ID} value={b.ID}>{b.title || b.description || t('details.storyboardLabel', { order: b.order })}</option>)}
        </select>
      </div>

      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.referenceAssets')}</Label>
        <ResourceAttachments
          ownerType="shot"
          ownerId={shot.ID}
          role="reference"
        />
      </div>

      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.rawSource')}</Label>
        <ResourceAttachments
          ownerType="shot"
          ownerId={shot.ID}
          role="source"
          slot="raw_source"
          maxCount={1}
          allowLibrarySelect
          libraryType="video"
        />
      </div>

      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('shared.shotDescription')}</Label>
        <Textarea
          rows={3}
          placeholder={t('forms.shotDescription')}
          value={draft.description ?? ''}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={() => onSave(draft)} disabled={isSaving} className="flex-1 gap-1.5" size="sm">
          <Save size={13} /> {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  )
}
