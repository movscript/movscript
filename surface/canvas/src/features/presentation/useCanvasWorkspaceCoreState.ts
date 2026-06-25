import { useCallback, useRef, useState } from 'react'
import { useEdgesState, useNodesState, type Edge, type Node } from '@xyflow/react'
import type { CanvasType } from '@movscript/shared'
import { useCanvasViewportPerformanceState } from './useCanvasViewportPerformanceState'

export function useCanvasWorkspaceCoreState() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [canvasName, setCanvasName] = useState('')
  const [canvasType, setCanvasType] = useState<CanvasType>('inspiration')
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [libraryCollapsed, setLibraryCollapsed] = useState(true)
  const toggleLibraryCollapsed = useCallback(() => setLibraryCollapsed((value) => !value), [])
  const viewportZoomRef = useRef(1)
  const viewportPositionRef = useRef({ x: 0, y: 0 })
  const canvasPaneRef = useRef<HTMLDivElement>(null)
  const viewportPerformance = useCanvasViewportPerformanceState({
    canvasPaneRef,
    nodes,
    viewportPositionRef,
    viewportZoomRef,
  })
  const [runtimeStarting, setRuntimeStarting] = useState(false)

  return {
    canvasName,
    canvasPaneRef,
    canvasType,
    edges,
    libraryCollapsed,
    nodes,
    onEdgesChange,
    onNodesChange,
    runtimeStarting,
    selectedNodeIds,
    setCanvasName,
    setCanvasType,
    setEdges,
    setNodes,
    setRuntimeStarting,
    setSelectedNodeIds,
    toggleLibraryCollapsed,
    viewportPositionRef,
    viewportZoomRef,
    ...viewportPerformance,
  }
}
