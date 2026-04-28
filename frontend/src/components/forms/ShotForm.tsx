import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Shot, Storyboard } from '@/types'
import { Save } from 'lucide-react'
import { ResourceAttachments } from '@/components/shared/ResourceAttachments'
import { cn } from '@/lib/utils'
import {
  SHOT_STATUS_LABEL_KEYS, SHOT_STATUS_NEXT, SHOT_STATUS_STEPS,
} from '@/constants/shot'
import { useProjectStore } from '@/store/projectStore'
import { Button } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { useTranslation } from 'react-i18next'

function safeJsonIds(value?: string): number[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((id) => Number.isFinite(Number(id))).map(Number) : []
  } catch {
    return []
  }
}

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
  const currentIdx = SHOT_STATUS_STEPS.indexOf(shot.status)

  const { data: storyboards = [] } = useQuery<Storyboard[]>({
    queryKey: ['storyboards-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/storyboards`).then((r) => r.data),
    enabled: !!projectId,
  })

  return (
    <div className="h-full overflow-y-auto p-5 space-y-3">
      {/* Status progress */}
      <div className="flex items-center gap-1 mb-2">
        {SHOT_STATUS_STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div className={cn('w-2 h-2 rounded-full', i <= currentIdx ? 'bg-foreground' : 'bg-muted')} />
            {i < SHOT_STATUS_STEPS.length - 1 && (
              <div className={cn('w-4 h-0.5', i < currentIdx ? 'bg-foreground' : 'bg-muted')} />
            )}
          </div>
        ))}
      </div>

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
          resourceIds={safeJsonIds(draft.ref_resource_ids)}
          onChange={(ids) => onChange({ ...draft, ref_resource_ids: JSON.stringify(ids) })}
        />
      </div>

      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.finalShotDescription')}</Label>
        <Textarea
          rows={3}
          placeholder={t('details.finalShotDescriptionPlaceholder')}
          value={draft.final_description ?? draft.description ?? ''}
          onChange={(e) => onChange({ ...draft, final_description: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.finalPromptNotes')}</Label>
        <Textarea
          className="font-mono"
          rows={6}
          placeholder={t('details.promptPlaceholder')}
          value={draft.final_prompt ?? draft.prompt ?? ''}
          onChange={(e) => onChange({ ...draft, final_prompt: e.target.value })}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={() => onSave(draft)} disabled={isSaving} className="flex-1 gap-1.5" size="sm">
          <Save size={13} /> {isSaving ? t('common.saving') : t('common.save')}
        </Button>
        {SHOT_STATUS_NEXT[shot.status] && (
          <button
            onClick={() => onSave({ status: SHOT_STATUS_NEXT[shot.status]! })}
            className="text-xs text-muted-foreground border border-border px-3 py-2 rounded hover:bg-muted whitespace-nowrap"
          >
            → {t(SHOT_STATUS_LABEL_KEYS[SHOT_STATUS_NEXT[shot.status]!])}
          </button>
        )}
      </div>
    </div>
  )
}
