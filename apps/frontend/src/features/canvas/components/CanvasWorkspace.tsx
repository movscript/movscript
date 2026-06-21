import '@xyflow/react/dist/style.css'

import { CanvasEditorWorkspaceView } from '@/features/canvas/components/CanvasEditorWorkspaceView'
import { useCanvasWorkspaceController } from '@/features/canvas/components/useCanvasWorkspaceController'

export interface CanvasWorkspaceProps {
  canvasId: number | string
  embedded?: boolean
  onClose?: () => void
  useAppHeader?: boolean
}

export function CanvasWorkspace(props: CanvasWorkspaceProps) {
  const workspace = useCanvasWorkspaceController(props)
  return <CanvasEditorWorkspaceView {...workspace} />
}
