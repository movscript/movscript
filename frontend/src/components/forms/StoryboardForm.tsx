import type { Storyboard } from '@/types'
import { Save } from 'lucide-react'
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

export function StoryboardForm({ draft, onChange, onSave, isSaving }: StoryboardFormProps) {
  const { t } = useTranslation()

  return (
    <div className="overflow-y-auto p-5 space-y-3">
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
      <Button onClick={() => onSave(draft)} disabled={isSaving} className="w-full gap-1.5" size="sm">
        <Save size={13} /> {isSaving ? t('common.saving') : t('common.save')}
      </Button>
    </div>
  )
}
