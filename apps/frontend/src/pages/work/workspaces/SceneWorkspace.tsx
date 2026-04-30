import { SceneDetail } from '@/components/detail'
import type { Episode, Scene, Storyboard } from '@/types'
import { ArtifactWorkspaceFrame } from '../ArtifactWorkspaceFrame'
import type { WorkspaceFrameProps } from './types'

interface SceneWorkspaceProps extends WorkspaceFrameProps {
  scene: Scene
  episodes?: Episode[]
  storyboards?: Storyboard[]
}

export function SceneWorkspace({
  scene,
  node,
  pipeline,
  members,
  onNodeUpdated,
}: SceneWorkspaceProps) {
  return (
    <ArtifactWorkspaceFrame
      kind="scene"
      title={scene.title}
      subtitle={`场景 ${scene.number}`}
      node={node}
      pipeline={pipeline}
      members={members}
      onNodeUpdated={onNodeUpdated}
    >
      <SceneDetail scene={scene} showHeader={false} />
    </ArtifactWorkspaceFrame>
  )
}
