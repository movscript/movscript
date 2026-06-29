import { ResourceLibraryView } from '@movscript/resource-surface/pages'
import UnifiedToolPage from './UnifiedToolPage'

export default function MultiAnglePage() {
  return (
    <UnifiedToolPage
      initialOutputKind="image"
      initialOperation="image_to_image"
      resourcePane={<ResourceLibraryView variant="pane" />}
    />
  )
}
