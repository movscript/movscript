import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import type { Script, ScriptSettingRef, Setting } from '@/types'
import { Button, Input, Label, Textarea } from '@movscript/ui'
import { Link2, Plus, X } from 'lucide-react'
import { ArtifactWorkspaceFrame } from '../ArtifactWorkspaceFrame'
import type { WorkspaceFrameProps } from './types'
import { SettingDetailEditor, settingTypeLabel } from '@/components/settings/SettingDetailEditor'
import { SettingAssetOverview } from '@/components/settings/SettingAssetOverview'

const SETTING_ROLE_OPTIONS = [
  'protagonist',
  'antagonist',
  'supporting',
  'location',
  'prop',
  'mentioned',
  'world_rule',
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
  return (
    <ArtifactWorkspaceFrame
      kind="setting"
      title={setting.name}
      subtitle={settingTypeLabel(setting.type)}
      node={node}
      pipeline={pipeline}
      members={members}
      onNodeUpdated={onNodeUpdated}
    >
      <div className="h-full overflow-y-auto p-5">
        <SettingDetailEditor setting={setting} className="mx-auto max-w-4xl" />
        <SettingAssetOverview setting={setting} className="mx-auto mt-6 max-w-4xl" />
        <SettingScriptBindingPanel setting={setting} />
      </div>
    </ArtifactWorkspaceFrame>
  )
}

function SettingScriptBindingPanel({ setting }: { setting: Setting }) {
  const qc = useQueryClient()
  const [scriptId, setScriptId] = useState<number | ''>('')

  const { data: scripts = [] } = useQuery<Script[]>({
    queryKey: ['scripts', setting.project_id],
    queryFn: () => api.get(`/projects/${setting.project_id}/scripts`).then((r) => r.data),
    enabled: !!setting.project_id,
  })

  const { data: refs = [] } = useQuery<ScriptSettingRef[]>({
    queryKey: ['setting-refs', setting.project_id, 'setting', setting.ID],
    queryFn: () => api.get(`/projects/${setting.project_id}/setting-refs`, { params: { setting_id: setting.ID } }).then((r) => r.data),
    enabled: !!setting.project_id && !!setting.ID,
  })

  const invalidateRefs = () => {
    qc.invalidateQueries({ queryKey: ['setting-refs', setting.project_id] })
    qc.invalidateQueries({ queryKey: ['setting-refs', setting.project_id, 'setting', setting.ID] })
  }

  const createRef = useMutation({
    mutationFn: (nextScriptId: number) => {
      const script = scripts.find((item) => item.ID === nextScriptId)
      return api.post(`/projects/${setting.project_id}/setting-refs`, {
        script_id: nextScriptId,
        setting_id: setting.ID,
        scope: script?.script_type ?? 'main',
        role: defaultRoleForSetting(setting),
        source: 'manual',
      }).then((r) => r.data)
    },
    onSuccess: () => {
      setScriptId('')
      invalidateRefs()
    },
  })

  const updateRef = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ScriptSettingRef> }) => api.put(`/setting-refs/${id}`, data).then((r) => r.data),
    onSuccess: invalidateRefs,
  })

  const removeRef = useMutation({
    mutationFn: (id: number) => api.delete(`/setting-refs/${id}`),
    onSuccess: invalidateRefs,
  })

  const usedScriptIds = new Set(refs.map((ref) => ref.script_id))
  const availableScripts = scripts.filter((script) => !usedScriptIds.has(script.ID))

  return (
    <section className="mx-auto mt-6 max-w-4xl space-y-3 border-t border-border pt-5">
      <div className="flex items-center justify-between gap-3">
        <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Link2 size={13} />
          绑定剧本
        </Label>
        <div className="flex min-w-0 items-center gap-2">
          <select
            className="h-8 min-w-56 rounded-md border border-border bg-background px-2 text-xs"
            value={scriptId}
            onChange={(event) => setScriptId(Number(event.target.value) || '')}
          >
            <option value="">选择剧本</option>
            {availableScripts.map((script) => (
              <option key={script.ID} value={script.ID}>
                {script.script_type} · {script.title}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            disabled={!scriptId || createRef.isPending}
            onClick={() => scriptId && createRef.mutate(scriptId)}
          >
            <Plus size={12} />
            绑定
          </Button>
        </div>
      </div>

      {refs.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
          暂未绑定剧本。这里维护该设定在哪些剧本中出现，以及每个剧本里的局部状态和作用。
        </div>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {refs.map((ref) => (
            <div key={ref.ID} className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{ref.script?.title ?? `#${ref.script_id}`}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{ref.script?.script_type ?? ref.scope ?? 'script'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeRef.mutate(ref.ID)}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <select
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                  value={ref.role ?? ''}
                  onChange={(event) => updateRef.mutate({ id: ref.ID, data: { ...ref, role: event.target.value } })}
                >
                  {SETTING_ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
                <Input
                  className="h-8 text-xs"
                  placeholder="情绪"
                  defaultValue={ref.emotion ?? ''}
                  onBlur={(event) => updateRef.mutate({ id: ref.ID, data: { ...ref, emotion: event.target.value } })}
                />
                <Input
                  className="h-8 text-xs"
                  placeholder="状态"
                  defaultValue={ref.state ?? ''}
                  onBlur={(event) => updateRef.mutate({ id: ref.ID, data: { ...ref, state: event.target.value } })}
                />
                <Input
                  className="h-8 text-xs"
                  placeholder="本剧本作用"
                  defaultValue={ref.purpose ?? ''}
                  onBlur={(event) => updateRef.mutate({ id: ref.ID, data: { ...ref, purpose: event.target.value } })}
                />
              </div>
              <Textarea
                className="resize-none text-xs"
                rows={2}
                placeholder="仅描述该设定在这个剧本中的局部上下文"
                defaultValue={ref.note ?? ''}
                onBlur={(event) => updateRef.mutate({ id: ref.ID, data: { ...ref, note: event.target.value } })}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function defaultRoleForSetting(setting: Setting) {
  if (setting.type === 'character') return 'supporting'
  if (setting.type === 'scene') return 'location'
  if (setting.type === 'prop') return 'prop'
  if (setting.type === 'world_rule') return 'world_rule'
  return 'mentioned'
}
