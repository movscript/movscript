import { ResourceLibraryView } from '@movscript/resource-surface/pages'
import UnifiedToolPage from './UnifiedToolPage'

export default function RefVideoGenPage() {
  return (
    <UnifiedToolPage
      initialOutputKind="video"
      initialOperation="reference_to_video"
      resourcePane={<ResourceLibraryView variant="pane" />}
    />
  )
}
