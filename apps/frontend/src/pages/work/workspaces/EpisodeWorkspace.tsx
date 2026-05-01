import { EpisodeDetail } from '@/components/detail'
import type { Episode, Scene, Script, Storyboard } from '@/types'
import { ArtifactWorkspaceFrame } from '../ArtifactWorkspaceFrame'
import type { WorkspaceFrameProps } from './types'

interface EpisodeWorkspaceProps extends WorkspaceFrameProps {
  episode: Episode
  scripts?: Script[]
  scenes?: Scene[]
  storyboards?: Storyboard[]
}

export function EpisodeWorkspace({
  episode,
}: EpisodeWorkspaceProps) {
  return (
    <ArtifactWorkspaceFrame
      kind="episode"
      title={episode.title}
      subtitle={`EP${String(episode.number).padStart(2, '0')}`}
    >
      <EpisodeDetail episode={episode} showHeader={false} />
    </ArtifactWorkspaceFrame>
  )
}
