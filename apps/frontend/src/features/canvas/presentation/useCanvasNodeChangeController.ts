import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { Node, NodeChange } from '@xyflow/react'

import { isFinalOutputNode } from '@/features/canvas/domain/graph'

export function useCanvasNodeChangeController({
  nodes,
  onNodesChange,
  setSelectedNodeIds,
}: {
  nodes: Node[]
  onNodesChange: (changes: NodeChange[]) => void
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>
}) {
  return useCallback((changes: NodeChange[]) => {
    const protectedIds = new Set(nodes.filter(isFinalOutputNode).map((node) => node.id))
    const filteredChanges = changes.filter((change) => change.type !== 'remove' || !protectedIds.has(change.id))
    onNodesChange(filteredChanges)
    setSelectedNodeIds((prev) => {
      const next = new Set(prev)
      filteredChanges.forEach((change) => {
        if (change.type === 'select') {
          if (change.selected) next.add(change.id)
          else next.delete(change.id)
        }
      })
      return [...next]
    })
  }, [nodes, onNodesChange, setSelectedNodeIds])
}
