import { ResourceLibraryView } from '@movscript/resource-surface/pages'
import UnifiedToolPage from './UnifiedToolPage'

export default function MotionImitationPage() {
  return (
    <UnifiedToolPage
      initialOutputKind="video"
      initialOperation="video_to_video"
      resourcePane={<ResourceLibraryView variant="pane" />}
    />
  )
}
