import type { Shot } from '@/types'
import { Save } from 'lucide-react'
import { ResourceAttachments } from '@/components/shared/ResourceAttachments'
import { cn } from '@/lib/utils'
import {
  SHOT_STATUS_LABEL_KEYS, SHOT_STATUS_NEXT, SHOT_STATUS_STEPS,
  SHOT_SIZE_OPTIONS, SHOT_ANGLE_OPTIONS, SHOT_MOVEMENT_OPTIONS,
  SHOT_FOCAL_LENGTH_OPTIONS, SHOT_PACING_OPTIONS,
} from '@/constants/shot'
import { Button } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { useTranslation } from 'react-i18next'

function PillSelector({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string | undefined
  onChange: (v: string) => void
}) {
  return (
    <div>
      <p className="text-[10px] font-medium text-muted-foreground mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(value === opt.value ? '' : opt.value)}
            className={cn(
              'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
              value === opt.value
                ? 'bg-foreground text-background border-foreground'
                : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
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
  const currentIdx = SHOT_STATUS_STEPS.indexOf(shot.status)

  return (
    <div className="overflow-y-auto p-5 space-y-3">
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
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.description')}</Label>
        <Textarea rows={2} value={draft.description ?? ''} onChange={(e) => onChange({ ...draft, description: e.target.value })} />
      </div>

      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">镜头意图</Label>
        <Textarea
          rows={2}
          placeholder="这个镜头想传达什么情绪或信息？"
          value={draft.intent ?? ''}
          onChange={(e) => onChange({ ...draft, intent: e.target.value })}
        />
      </div>

      <div className="space-y-2.5 pt-1 border-t border-border">
        <p className="text-xs font-medium text-muted-foreground">镜头参数</p>
        <PillSelector label="景别" options={SHOT_SIZE_OPTIONS} value={draft.shot_size} onChange={(v) => onChange({ ...draft, shot_size: v })} />
        <PillSelector label="角度" options={SHOT_ANGLE_OPTIONS} value={draft.angle} onChange={(v) => onChange({ ...draft, angle: v })} />
        <PillSelector label="运动" options={SHOT_MOVEMENT_OPTIONS} value={draft.movement} onChange={(v) => onChange({ ...draft, movement: v })} />
        <PillSelector label="焦距" options={SHOT_FOCAL_LENGTH_OPTIONS} value={draft.focal_length} onChange={(v) => onChange({ ...draft, focal_length: v })} />
        <PillSelector label="节奏" options={SHOT_PACING_OPTIONS} value={draft.pacing} onChange={(v) => onChange({ ...draft, pacing: v })} />
      </div>

      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.prompt')}</Label>
        <Textarea
          className="font-mono"
          rows={6}
          placeholder={t('details.promptPlaceholder')}
          value={draft.prompt ?? ''}
          onChange={(e) => onChange({ ...draft, prompt: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.referenceAssets')}</Label>
        <ResourceAttachments
          resourceIds={draft.ref_resource_ids ? JSON.parse(draft.ref_resource_ids) : []}
          onChange={(ids) => onChange({ ...draft, ref_resource_ids: JSON.stringify(ids) })}
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
