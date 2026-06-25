import { useCallback, useMemo, useRef, useState, type Dispatch, type MouseEvent, type SetStateAction } from 'react'
import type { Edge, Node } from '@xyflow/react'
import type { TFunction } from 'i18next'

import { isFinalOutputNode } from '../domain/graph'
import {
  canvasGroupAncestorIds,
  canvasGroupDescendantIds,
  canvasGroupSelectionBounds,
  canvasNodeGroupId,
  canvasNodeWithGroupId,
  commonCanvasGroupId,
  findCanvasGroupDropTarget,
  isCanvasNodeOutsideGroupBounds,
  resizeCanvasGroupsToFitMembers,
  resolveCanvasGroupPromotionId,
  topLevelSelectedCanvasNodes,
} from '../domain/layout'
import { createCanvasNodeId } from '../editor/nodeFactory'

type CanvasGroupDragSnapshot = {
  nodeId: string
  position: { x: number; y: number }
  memberPositions: Map<string, { x: number; y: number }>
}

export function useCanvasGroupEditing({
  nodes,
  setEdges,
  setNodes,
  setSelectedNodeIds,
  t,
}: {
  nodes: Node[]
  setEdges: Dispatch<SetStateAction<Edge[]>>
  setNodes: Dispatch<SetStateAction<Node[]>>
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>
  t: TFunction
}) {
  const groupDragSnapshotRef = useRef<CanvasGroupDragSnapshot | null>(null)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)

  const topLevelSelectedNodes = useMemo(
    () => topLevelSelectedCanvasNodes(nodes, nodes.filter((node) => node.selected && !isFinalOutputNode(node))),
    [nodes],
  )

  const topLevelSelectedGroups = useMemo(
    () => topLevelSelectedCanvasNodes(nodes, nodes.filter((node) => node.selected && node.type === 'group')),
    [nodes],
  )

  const selectedGroupBounds = useMemo(() => canvasGroupSelectionBounds(nodes, topLevelSelectedNodes), [nodes, topLevelSelectedNodes])

  const selectedUngroupBounds = useMemo(() => canvasGroupSelectionBounds(nodes, topLevelSelectedGroups, 0, 1), [nodes, topLevelSelectedGroups])

  const deleteSelectedNodes = useCallback(() => {
    const selectedGroups = nodes.filter((node) => node.selected && node.type === 'group')
    const directSelected = new Set(nodes.filter((node) => node.selected && !isFinalOutputNode(node)).map((node) => node.id))
    if (directSelected.size === 0) return
    const selectedGroupParentById = new Map<string, string | undefined>(
      selectedGroups.map((node): [string, string | undefined] => [node.id, canvasNodeGroupId(node)]),
    )
    setNodes((prev) => prev.flatMap((node) => {
      if (directSelected.has(node.id)) return []
      const groupId = canvasNodeGroupId(node)
      if (!groupId || !selectedGroupParentById.has(groupId)) return node
      return canvasNodeWithGroupId(node, resolveCanvasGroupPromotionId(groupId, selectedGroupParentById))
    }))
    setEdges((prev) => prev.filter((edge) => !directSelected.has(edge.source) && !directSelected.has(edge.target)))
    setSelectedNodeIds([])
  }, [nodes, setEdges, setNodes, setSelectedNodeIds])

  const createGroupFromSelection = useCallback(() => {
    const selected = topLevelSelectedCanvasNodes(nodes, nodes.filter((node) => node.selected && !isFinalOutputNode(node)))
    const bounds = canvasGroupSelectionBounds(nodes, selected)
    if (!bounds) return
    const groupId = createCanvasNodeId()
    const parentGroupId = commonCanvasGroupId(selected)
    const groupNode: Node = {
      id: groupId,
      type: 'group',
      position: { x: bounds.x, y: bounds.y },
      style: { width: bounds.width, height: bounds.height },
      zIndex: -1,
      data: {
        source: 'manual',
        label: t('canvas.nodeLabels.group'),
        isGroup: true,
        ...(parentGroupId ? { groupId: parentGroupId } : {}),
      },
      selected: true,
    }
    const selectedIds = new Set(selected.map((node) => node.id))
    setNodes((prev) => {
      const nextNodes = prev.map((node) => {
        if (!selectedIds.has(node.id)) return node
        const absolutePosition = bounds.absolutePositionByNodeId.get(node.id) ?? node.position
        return canvasNodeWithGroupId({
          ...node,
          position: absolutePosition,
          selected: false,
        }, groupId)
      })
      return [
        groupNode,
        ...nextNodes,
      ]
    })
    setSelectedNodeIds([groupId])
  }, [nodes, setNodes, setSelectedNodeIds, t])

  const ungroupSelectedGroups = useCallback(() => {
    const selectedGroups = topLevelSelectedCanvasNodes(nodes, nodes.filter((node) => node.selected && node.type === 'group'))
    if (selectedGroups.length === 0) return
    const selectedGroupIds = new Set(selectedGroups.map((node) => node.id))
    const groupParentById = new Map<string, string | undefined>(
      selectedGroups.map((node): [string, string | undefined] => [node.id, canvasNodeGroupId(node)]),
    )
    const promotedNodeIds = nodes
      .filter((node) => selectedGroupIds.has(canvasNodeGroupId(node) ?? ''))
      .map((node) => node.id)
    setNodes((prev) => {
      const nextNodes = prev.flatMap((node) => {
        if (selectedGroupIds.has(node.id)) return []
        const groupId = canvasNodeGroupId(node)
        if (!groupId || !selectedGroupIds.has(groupId)) return node
        return [{ ...canvasNodeWithGroupId(node, resolveCanvasGroupPromotionId(groupId, groupParentById)), selected: true }]
      })
      return resizeCanvasGroupsToFitMembers(nextNodes, nextNodes.filter((node) => node.type === 'group').map((node) => node.id))
    })
    setSelectedNodeIds(promotedNodeIds)
  }, [nodes, setNodes, setSelectedNodeIds])

  const onNodeDragStop = useCallback((_: MouseEvent, draggedNode: Node) => {
    const dragSnapshot = groupDragSnapshotRef.current
    groupDragSnapshotRef.current = null
    let nextNodes = nodes.map((node) => node.id === draggedNode.id ? draggedNode : node)
    if (draggedNode.type === 'group' && dragSnapshot?.nodeId === draggedNode.id) {
      const dx = draggedNode.position.x - dragSnapshot.position.x
      const dy = draggedNode.position.y - dragSnapshot.position.y
      if (dx !== 0 || dy !== 0) {
        nextNodes = nextNodes.map((node) => {
          const startPosition = dragSnapshot.memberPositions.get(node.id)
          if (!startPosition) return node
          return {
            ...node,
            position: {
              x: startPosition.x + dx,
              y: startPosition.y + dy,
            },
          }
        })
      }
    }

    const currentDraggedNode = nextNodes.find((node) => node.id === draggedNode.id) ?? draggedNode
    const currentGroupId = canvasNodeGroupId(currentDraggedNode)
    const currentGroup = currentGroupId ? nextNodes.find((node) => node.id === currentGroupId) : undefined
    const outsideCurrentGroup = currentGroup ? isCanvasNodeOutsideGroupBounds(currentDraggedNode, currentGroup) : false
    const excludedGroupIds = currentGroupId && currentGroup && !outsideCurrentGroup
      ? canvasGroupAncestorIds(nextNodes, currentGroupId)
      : []
    const targetGroup = findCanvasGroupDropTarget(currentDraggedNode, nextNodes, { excludedGroupIds })

    if (targetGroup) {
      const ok = window.confirm(t('canvas.editor.confirmAddToGroup', {
        defaultValue: '节点已移动到分组内，是否加入该分组？',
      }))
      if (ok) {
        setNodes(resizeCanvasGroupsToFitMembers(
          nextNodes.map((node) => node.id === currentDraggedNode.id ? canvasNodeWithGroupId(node, targetGroup.id) : node),
          [targetGroup.id, currentGroupId],
        ))
        return
      }
    }

    if (currentGroup && outsideCurrentGroup) {
      const ok = window.confirm(t('canvas.editor.confirmRemoveFromGroup', {
        defaultValue: '节点已移出当前分组，是否从分组中移除？',
      }))
      setNodes(ok
        ? resizeCanvasGroupsToFitMembers(
          nextNodes.map((node) => node.id === currentDraggedNode.id ? canvasNodeWithGroupId(node, undefined) : node),
          [currentGroupId],
        )
        : resizeCanvasGroupsToFitMembers(nextNodes, [currentGroupId]))
      return
    }

    if (nextNodes !== nodes) setNodes(nextNodes)
  }, [nodes, setNodes, t])

  const onNodeDragStart = useCallback((_: MouseEvent, node: Node) => {
    setDraggingNodeId(node.id)
    if (node.type !== 'group') {
      groupDragSnapshotRef.current = null
      return
    }
    const memberIds = canvasGroupDescendantIds(nodes, node.id)
    groupDragSnapshotRef.current = {
      nodeId: node.id,
      position: { ...node.position },
      memberPositions: new Map(nodes
        .filter((candidate) => memberIds.has(candidate.id))
        .map((candidate) => [candidate.id, { ...candidate.position }])),
    }
  }, [nodes])

  const handleNodeDragStop = useCallback((event: MouseEvent, node: Node) => {
    setDraggingNodeId(null)
    onNodeDragStop(event, node)
  }, [onNodeDragStop])

  return {
    createGroupFromSelection,
    deleteSelectedNodes,
    draggingNodeId,
    handleNodeDragStop,
    onNodeDragStart,
    selectedGroupBounds,
    selectedUngroupBounds,
    topLevelSelectedGroups,
    topLevelSelectedNodes,
    ungroupSelectedGroups,
  }
}
