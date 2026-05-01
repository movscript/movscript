import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Storyboard, Scene, Episode, Shot } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { StoryboardForm } from '@/components/forms/StoryboardForm'
import { ArtifactWorkspaceFrame } from '../ArtifactWorkspaceFrame'
import type { WorkspaceFrameProps } from './types'

interface StoryboardWorkspaceProps extends WorkspaceFrameProps {
  storyboard: Storyboard
  scenes?: Scene[]
  episodes?: Episode[]
  shots?: Shot[]
}

export function StoryboardWorkspace({
  storyboard,
  scenes = [],
  episodes = [],
}: StoryboardWorkspaceProps) {
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [draft, setDraft] = useState<Partial<Storyboard>>({ ...storyboard })

  const update = useMutation({
    mutationFn: (data: Partial<Storyboard>) =>
      api.put(`/storyboards/${storyboard.ID}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['storyboards-project', projectId] }),
  })

  const scene = storyboard.scene_id ? scenes.find((s) => s.ID === storyboard.scene_id) : null
  const episode = storyboard.episode_id ? episodes.find((e) => e.ID === storyboard.episode_id) : null

  return (
    <ArtifactWorkspaceFrame
      kind="storyboard"
      title={storyboard.title || `分镜 #${storyboard.order}`}
      subtitle={[
        episode ? `EP${String(episode.number).padStart(2, '0')}` : null,
        scene ? `场景 ${scene.number}` : null,
      ].filter(Boolean).join(' · ') || '未关联剧集/场景'}
      isSaving={update.isPending}
    >
      <div className="h-full min-w-0 overflow-hidden">
        <StoryboardForm
          storyboard={storyboard}
          draft={draft}
          onChange={setDraft}
          onSave={(data) => update.mutate(data)}
          isSaving={update.isPending}
        />
      </div>
    </ArtifactWorkspaceFrame>
  )
}
