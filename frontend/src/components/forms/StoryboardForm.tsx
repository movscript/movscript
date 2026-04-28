import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Episode, Scene, Storyboard } from '@/types'
import { Save } from 'lucide-react'
import { ResourceAttachments } from '@/components/shared/ResourceAttachments'
import { useProjectStore } from '@/store/projectStore'
import { cn } from '@/lib/utils'
import {
  SHOT_ANGLE_OPTIONS,
  SHOT_FOCAL_LENGTH_OPTIONS,
  SHOT_MOVEMENT_OPTIONS,
  SHOT_PACING_OPTIONS,
  SHOT_SIZE_OPTIONS,
} from '@/constants/shot'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { useTranslation } from 'react-i18next'

interface StoryboardFormProps {
  draft: Partial<Storyboard>
  onChange: (d: Partial<Storyboard>) => void
  onSave: (data: Partial<Storyboard>) => void
  isSaving?: boolean
}

function safeJsonIds(value?: string): number[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((id) => Number.isFinite(Number(id))).map(Number) : []
  } catch {
    return []
  }
}

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

export function StoryboardForm({ draft, onChange, onSave, isSaving }: StoryboardFormProps) {
  const { t } = useTranslation()
  const projectId = useProjectStore((s) => s.current?.ID)

  const { data: scenes = [] } = useQuery<Scene[]>({
    queryKey: ['scenes', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scenes`).then((r) => r.data),
    enabled: !!projectId,
  })

  const { data: episodes = [] } = useQuery<Episode[]>({
    queryKey: ['episodes-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/episodes`).then((r) => r.data),
    enabled: !!projectId,
  })

  return (
    <div className="h-full overflow-y-auto p-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.parentSceneOptional')}</Label>
          <select
            className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
            value={draft.scene_id ?? ''}
            onChange={(e) => onChange({ ...draft, scene_id: Number(e.target.value) || null })}
          >
            <option value="">{t('forms.unlinked')}</option>
            {scenes.map((s) => <option key={s.ID} value={s.ID}>{t('details.sceneLabel', { number: s.number })} {s.title}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.parentEpisodeOptional')}</Label>
          <select
            className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
            value={draft.episode_id ?? ''}
            onChange={(e) => onChange({ ...draft, episode_id: Number(e.target.value) || null })}
          >
            <option value="">{t('forms.unlinked')}</option>
            {episodes.map((e) => <option key={e.ID} value={e.ID}>EP{e.number} {e.title}</option>)}
          </select>
        </div>
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.title')}</Label>
        <Input value={draft.title ?? ''} onChange={(e) => onChange({ ...draft, title: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('forms.description')}</Label>
        <Textarea rows={3} value={draft.description ?? ''} onChange={(e) => onChange({ ...draft, description: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.characters')}</Label>
          <Textarea rows={2} value={draft.characters ?? ''} onChange={(e) => onChange({ ...draft, characters: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.actions')}</Label>
          <Textarea rows={2} value={draft.actions ?? ''} onChange={(e) => onChange({ ...draft, actions: e.target.value })} />
        </div>
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.dialogue')}</Label>
        <Textarea rows={3} value={draft.dialogue ?? ''} onChange={(e) => onChange({ ...draft, dialogue: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.atmosphere')}</Label>
        <Textarea rows={2} value={draft.atmosphere ?? ''} onChange={(e) => onChange({ ...draft, atmosphere: e.target.value })} />
      </div>
      <div className="space-y-2.5 pt-2 border-t border-border">
        <p className="text-xs font-medium text-muted-foreground">镜头参数</p>
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-1">镜头意图</Label>
          <Textarea
            rows={2}
            placeholder="这个分镜要传达的情绪、信息或叙事功能"
            value={draft.intent ?? ''}
            onChange={(e) => onChange({ ...draft, intent: e.target.value })}
          />
        </div>
        <PillSelector label="景别" options={SHOT_SIZE_OPTIONS} value={draft.shot_size} onChange={(v) => onChange({ ...draft, shot_size: v })} />
        <PillSelector label="角度" options={SHOT_ANGLE_OPTIONS} value={draft.angle} onChange={(v) => onChange({ ...draft, angle: v })} />
        <PillSelector label="运动" options={SHOT_MOVEMENT_OPTIONS} value={draft.movement} onChange={(v) => onChange({ ...draft, movement: v })} />
        <PillSelector label="焦距" options={SHOT_FOCAL_LENGTH_OPTIONS} value={draft.focal_length} onChange={(v) => onChange({ ...draft, focal_length: v })} />
        <PillSelector label="节奏" options={SHOT_PACING_OPTIONS} value={draft.pacing} onChange={(v) => onChange({ ...draft, pacing: v })} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.lighting')}</Label>
            <Input value={draft.lighting ?? ''} onChange={(e) => onChange({ ...draft, lighting: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.duration')}</Label>
            <Input type="number" min={0} value={draft.duration ?? ''} onChange={(e) => onChange({ ...draft, duration: Number(e.target.value) || 0 })} />
          </div>
        </div>
      </div>
      <div className="space-y-2 pt-2 border-t border-border">
        <Label className="text-xs font-medium text-muted-foreground mb-1">{t('details.referenceAssets')}</Label>
        <ResourceAttachments
          resourceIds={safeJsonIds(draft.resource_ids)}
          onChange={(ids) => onChange({ ...draft, resource_ids: JSON.stringify(ids) })}
        />
      </div>
      <Button onClick={() => onSave(draft)} disabled={isSaving} className="w-full gap-1.5" size="sm">
        <Save size={13} /> {isSaving ? t('common.saving') : t('common.save')}
      </Button>
    </div>
  )
}
