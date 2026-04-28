import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Script, Episode, Scene } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { ScriptForm } from '@/components/forms/ScriptForm'
import { ArtifactWorkspaceFrame } from '../ArtifactWorkspaceFrame'
import type { WorkspaceFrameProps } from './types'

interface ScriptWorkspaceProps extends WorkspaceFrameProps {
  script: Script
  episodes?: Episode[]
  scenes?: Scene[]
}

export function ScriptWorkspace({
  script,
  episodes = [],
  node,
  pipeline,
  members,
  onNodeUpdated,
}: ScriptWorkspaceProps) {
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Script>>({ ...script })

  const update = useMutation({
    mutationFn: (data: Partial<Script>) =>
      api.put(`/projects/${projectId}/scripts/${script.ID}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scripts', projectId] }),
  })

  function renderContext() {
    if (script.script_type === 'main') {
      return <span>主剧本 · 关联 {episodes.length} 集</span>
    }
    if (script.episode_id) {
      const ep = episodes.find((e) => e.ID === script.episode_id)
      if (ep) {
        const prefix = script.script_type === 'scene' ? '场景剧本 · ' : ''
        return <span>{prefix}EP{String(ep.number).padStart(2, '0')} {ep.title}</span>
      }
    }
    return null
  }

  const ctx = renderContext()

  return (
    <ArtifactWorkspaceFrame
      kind="script"
      title={script.title}
      subtitle={ctx ? undefined : script.script_type}
      node={node}
      pipeline={pipeline}
      members={members}
      isSaving={update.isPending}
      onNodeUpdated={onNodeUpdated}
    >
      <div className="flex flex-col h-full overflow-hidden">
        {ctx && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-border bg-muted/20 text-xs text-muted-foreground">
            {ctx}
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScriptForm
            script={script}
            draft={draft}
            onChange={setDraft}
            onSave={(data) => update.mutate(data)}
            isSaving={update.isPending}
            projectId={projectId}
          />
        </div>
      </div>
    </ArtifactWorkspaceFrame>
  )
}
