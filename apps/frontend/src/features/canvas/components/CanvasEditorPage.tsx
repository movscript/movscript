import { useParams } from 'react-router-dom'
import { ReactFlowProvider } from '@xyflow/react'
import { CanvasWorkspace } from '@/features/canvas/components/CanvasWorkspace'

export default function CanvasEditorPage({ embeddedInShell = false }: { embeddedInShell?: boolean }) {
  const { id } = useParams<{ id: string }>()
  if (!id) return null
  return (
    <ReactFlowProvider>
      <CanvasWorkspace canvasId={id} embedded={embeddedInShell} useAppHeader={embeddedInShell} />
    </ReactFlowProvider>
  )
}
