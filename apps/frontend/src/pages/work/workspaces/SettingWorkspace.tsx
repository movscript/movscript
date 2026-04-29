import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import type { Setting } from '@/types'
import { Label } from '@movscript/ui'
import { ArtifactWorkspaceFrame } from '../ArtifactWorkspaceFrame'
import type { WorkspaceFrameProps } from './types'
import { EntitySemanticForm } from '@/components/detail/EntitySemanticForm'

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
        <EntitySemanticForm
          kind="setting"
          ownerType="setting"
          ownerId={setting.ID}
          draft={draft}
          onChange={(next) => setDraft(next as Partial<Setting>)}
          onSave={(payload) => update.mutate(payload as Partial<Setting>)}
          isSaving={update.isPending}
          excludeFields={['result', 'reference']}
          className="mx-auto h-auto max-w-4xl overflow-visible p-0"
          fieldRenderers={{
            type: (ctx) => (
              <div>
                <Label className="mb-1 text-xs font-medium text-muted-foreground">{ctx.label}</Label>
                <div className="flex flex-wrap gap-2">
                  {SETTING_TYPES.map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => ctx.setValue(item.type)}
                      className={draft.type === item.type
                        ? 'rounded-full border border-transparent bg-foreground px-3 py-1.5 text-xs text-background'
                        : 'rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground'}
                    >
                      {t(item.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            ),
          }}
        />
      </div>
    </ArtifactWorkspaceFrame>
  )
}
