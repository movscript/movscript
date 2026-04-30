import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Shot, Storyboard } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { ShotForm } from '@/components/forms/ShotForm'
import { ArtifactWorkspaceFrame } from '../ArtifactWorkspaceFrame'
import type { WorkspaceFrameProps } from './types'

interface ShotWorkspaceProps extends WorkspaceFrameProps {
  shot: Shot
  storyboards?: Storyboard[]
}

export function ShotWorkspace({
  shot,
  storyboards = [],
  node,
  pipeline,
  members,
  onNodeUpdated,
}: ShotWorkspaceProps) {
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Shot>>({ ...shot })

  const update = useMutation({
    mutationFn: (data: Partial<Shot>) =>
      api.put(`/shots/${shot.ID}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shots-project', projectId] }),
  })

  const storyboard = shot.storyboard_id ? storyboards.find((b) => b.ID === shot.storyboard_id) : null

  return (
    <ArtifactWorkspaceFrame
      kind="shot"
      title={`镜头 ${shot.order}`}
      subtitle={storyboard ? `来自 ${storyboard.title || `分镜 #${storyboard.order}`}` : '独立镜头'}
      node={node}
      pipeline={pipeline}
      members={members}
      isSaving={update.isPending}
      onNodeUpdated={onNodeUpdated}
    >
      <div className="flex-1 min-h-0 overflow-hidden">
        <ShotForm
          shot={shot}
          draft={draft}
          onChange={setDraft}
          onSave={(data) => update.mutate(data)}
          isSaving={update.isPending}
        />
      </div>
    </ArtifactWorkspaceFrame>
  )
}
