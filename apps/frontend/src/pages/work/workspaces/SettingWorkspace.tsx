import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import type { Setting } from '@/types'
import { Button, Input, Label, Textarea } from '@movscript/ui'
import { cn } from '@/lib/utils'
import { ArtifactWorkspaceFrame } from '../ArtifactWorkspaceFrame'
import type { WorkspaceFrameProps } from './types'

const SETTING_TYPES: { type: Setting['type']; labelKey: string }[] = [
  { type: 'character', labelKey: 'domain.settingTypes.character' },
  { type: 'scene', labelKey: 'domain.settingTypes.scene' },
  { type: 'prop', labelKey: 'domain.settingTypes.prop' },
  { type: 'world_rule', labelKey: 'domain.settingTypes.worldRule' },
]

interface SettingWorkspaceProps extends WorkspaceFrameProps {
  setting: Setting
}

export function SettingWorkspace({
  setting,
  node,
  pipeline,
  members,
  onNodeUpdated,
}: SettingWorkspaceProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Partial<Setting>>({ ...setting })

  useEffect(() => {
    setDraft({ ...setting })
  }, [setting])

  const update = useMutation({
    mutationFn: (data: Partial<Setting>) => api.put(`/settings/${setting.ID}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', setting.project_id] })
    },
  })

  function field<K extends keyof Setting>(key: K) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft((current) => ({ ...current, [key]: event.target.value }))
  }

  const typeLabel = SETTING_TYPES.find((item) => item.type === setting.type)?.labelKey

  return (
    <ArtifactWorkspaceFrame
      kind="setting"
      title={setting.name}
      subtitle={typeLabel ? t(typeLabel) : setting.type}
      node={node}
      pipeline={pipeline}
      members={members}
      isSaving={update.isPending}
      onSave={() => update.mutate(draft)}
      onNodeUpdated={onNodeUpdated}
    >
      <div className="h-full overflow-y-auto p-5">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="mb-1 text-xs font-medium text-muted-foreground">{t('forms.name')}</Label>
              <Input value={draft.name ?? ''} onChange={field('name')} />
            </div>
            <div>
              <Label className="mb-1 text-xs font-medium text-muted-foreground">{t('forms.alias', { defaultValue: '别名' })}</Label>
              <Input value={draft.alias ?? ''} onChange={field('alias')} />
            </div>
          </div>

          <div>
            <Label className="mb-1 text-xs font-medium text-muted-foreground">{t('forms.type')}</Label>
            <div className="flex flex-wrap gap-2">
              {SETTING_TYPES.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, type: item.type }))}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs transition-colors',
                    draft.type === item.type
                      ? 'border-transparent bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:border-ring hover:text-foreground',
                  )}
                >
                  {t(item.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-1 text-xs font-medium text-muted-foreground">{t('forms.summaryOptional')}</Label>
            <Input value={draft.description ?? ''} onChange={field('description')} />
          </div>

          <div>
            <Label className="mb-1 text-xs font-medium text-muted-foreground">{t('pages.scripts.settingContent')}</Label>
            <Textarea
              className="min-h-44 resize-none"
              value={draft.content ?? ''}
              onChange={field('content')}
              placeholder={t('pages.scripts.settingContentPlaceholder')}
            />
          </div>

          <div>
            <Label className="mb-1 text-xs font-medium text-muted-foreground">
              {t('pages.scripts.structuredSettingJson', { defaultValue: '结构化设定 JSON' })}
            </Label>
            <Textarea
              className="min-h-36 resize-none font-mono text-xs"
              value={draft.profile_json ?? ''}
              onChange={field('profile_json')}
            />
          </div>

          <div className="border-t border-border pt-4">
            <Button onClick={() => update.mutate(draft)} disabled={update.isPending}>
              {update.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      </div>
    </ArtifactWorkspaceFrame>
  )
}
