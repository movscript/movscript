import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, Ref } from 'react'
import type { TFunction } from 'i18next'
import {
  Background,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  PanOnScrollMode,
  ReactFlow,
  SelectionMode,
  ViewportPortal,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react'
import { Layers3, MousePointer2, Sparkles, Ungroup } from 'lucide-react'
import {
  CanvasDropOverlay,
  CanvasSelectionFrame,
  CanvasViewportActionButton,
} from '@movscript/ui/business/canvas'
import {
  CanvasViewportBoundsLayer,
  CanvasViewportEmptyOverlay,
  CanvasViewportEmptyState,
  CanvasViewportOverlayLayer,
  CanvasViewportPane,
  CanvasViewportSelectionActionButton,
  CanvasViewportStatusOverlay,
  canvasFlowBackgroundColor,
  canvasFlowClassName,
} from '@/features/canvas/ui/CanvasEditorUi'

import { ContextMenu } from '@/features/canvas/ui/ContextMenu'
import { cn } from '@/shared/ui/cn'
import type { CanvasNodeData, CanvasType, NodeType } from '@/types'

type CanvasSelectionBoundsView = {
  count: number
  height: number
  width: number
  x: number
  y: number
}

type CanvasContextMenuView = {
  boundary: { width: number; height: number }
  overlay: { x: number; y: number }
}

type CanvasViewportDebugOptions = {
  controls: boolean
  shadows: boolean
  visibleOnly: boolean
}

export function CanvasEditorViewport({
  canvasDebug,
  canvasOverviewMode,
  canvasPaneRef,
  canvasType,
  createGroupFromSelection,
  deleteSelectedNodes,
  draggingNodeId,
  dropActive,
  handleNodeDragStop,
  handleNodesChange,
  handleViewportMove,
  menu,
  nodeTypes,
  nodes,
  onAddNode,
  onConnect,
  onDragLeave,
  onDragOver,
  onDrop,
  onEdgesChange,
  onNodeClick,
  onNodeContextMenu,
  onNodeDragStart,
  onPaneContextMenu,
  onSelectionContextMenu,
  renderedNodes,
  selectedGroupBounds,
  selectedNode,
  selectedNodeData,
  selectedNodeMeta,
  selectedUngroupBounds,
  onCloseMenu,
  showCanvasGrid,
  showCanvasMinimap,
  t,
  topLevelSelectedGroups,
  topLevelSelectedNodes,
  ungroupSelectedGroups,
  visibleEdges,
}: {
  canvasDebug: CanvasViewportDebugOptions
  canvasOverviewMode: boolean
  canvasPaneRef: Ref<HTMLDivElement>
  canvasType: CanvasType
  createGroupFromSelection: () => void
  deleteSelectedNodes: () => void
  draggingNodeId: string | null
  dropActive: boolean
  handleNodeDragStop: (event: ReactMouseEvent, node: Node) => void
  handleNodesChange: (changes: NodeChange[]) => void
  handleViewportMove: (event: MouseEvent | TouchEvent | null, viewport: { x: number; y: number; zoom: number }) => void
  menu: CanvasContextMenuView | null
  nodeTypes: NodeTypes
  nodes: Node[]
  onAddNode: (type: NodeType) => void
  onConnect: (params: Connection) => void
  onDragLeave: (event: ReactDragEvent) => void
  onDragOver: (event: ReactDragEvent) => void
  onDrop: (event: ReactDragEvent) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onNodeClick: (event: ReactMouseEvent, node: Node) => void
  onNodeContextMenu: (event: ReactMouseEvent) => void
  onNodeDragStart: (event: ReactMouseEvent, node: Node) => void
  onPaneContextMenu: (event: ReactMouseEvent | MouseEvent) => void
  onSelectionContextMenu: (event: ReactMouseEvent) => void
  renderedNodes: Node[]
  selectedGroupBounds?: CanvasSelectionBoundsView
  selectedNode?: Node
  selectedNodeData?: CanvasNodeData & { label?: string }
  selectedNodeMeta?: { labelKey: string }
  selectedUngroupBounds?: CanvasSelectionBoundsView
  onCloseMenu: () => void
  showCanvasGrid: boolean
  showCanvasMinimap: boolean
  t: TFunction
  topLevelSelectedGroups: Node[]
  topLevelSelectedNodes: Node[]
  ungroupSelectedGroups: () => void
  visibleEdges: Edge[]
}) {
  return (
    <CanvasViewportPane
      ref={canvasPaneRef}
      dropActive={dropActive}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <ReactFlow
        className={cn(
          canvasFlowClassName,
          (!canvasDebug.shadows || canvasOverviewMode) && 'canvas-flow--debug-no-shadows',
          canvasOverviewMode && 'canvas-flow--overview',
        )}
        nodes={renderedNodes}
        edges={visibleEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onSelectionContextMenu={onSelectionContextMenu}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={onCloseMenu}
        onPaneContextMenu={onPaneContextMenu}
        onMove={handleViewportMove}
        nodeTypes={nodeTypes}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.1}
        maxZoom={4}
        deleteKeyCode={['Delete', 'Backspace']}
        selectionOnDrag={true}
        panOnDrag={[1, 2]}
        panOnScroll={true}
        panOnScrollMode={PanOnScrollMode.Free}
        selectionMode={SelectionMode.Full}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={40}
        onlyRenderVisibleElements={canvasDebug.visibleOnly}
        defaultEdgeOptions={{
          type: 'default',
          markerEnd: canvasOverviewMode ? undefined : { type: MarkerType.ArrowClosed, width: 14, height: 14 },
          style: { strokeWidth: canvasOverviewMode ? 1 : 1.6 },
        }}
      >
        {selectedGroupBounds && (
          <ViewportPortal>
            <CanvasSelectionFrame
              style={{
                transform: `translate(${selectedGroupBounds.x}px, ${selectedGroupBounds.y}px)`,
                width: selectedGroupBounds.width,
                height: selectedGroupBounds.height,
              }}
            >
              <CanvasViewportSelectionActionButton
                type="button"
                onClick={createGroupFromSelection}
              >
                <Layers3 size={13} />
                {t('canvas.contextMenu.groupSelected', { count: selectedGroupBounds.count })}
              </CanvasViewportSelectionActionButton>
            </CanvasSelectionFrame>
          </ViewportPortal>
        )}
        {selectedUngroupBounds && (
          <ViewportPortal>
            <CanvasViewportBoundsLayer
              x={selectedUngroupBounds.x}
              y={selectedUngroupBounds.y}
              width={selectedUngroupBounds.width}
              height={selectedUngroupBounds.height}
            >
              <CanvasViewportActionButton
                type="button"
                onClick={ungroupSelectedGroups}
              >
                <Ungroup size={13} />
                {t('canvas.contextMenu.ungroupSelected', { count: selectedUngroupBounds.count })}
              </CanvasViewportActionButton>
            </CanvasViewportBoundsLayer>
          </ViewportPortal>
        )}
        {showCanvasGrid && <Background gap={24} size={1} color={canvasFlowBackgroundColor} />}
        {canvasDebug.controls && <Controls position="bottom-left" />}
        {showCanvasMinimap && <MiniMap zoomable pannable position="bottom-right" nodeStrokeWidth={3} />}
      </ReactFlow>

      <CanvasViewportOverlayLayer>
        {nodes.length === 0 && (
          <CanvasViewportEmptyOverlay>
            <CanvasViewportEmptyState
              icon={Sparkles}
              title={t('canvas.editor.emptyTitle')}
              detail={t('canvas.editor.emptyDescription')}
            />
          </CanvasViewportEmptyOverlay>
        )}

        {dropActive && (
          <CanvasDropOverlay>
            {t('canvas.editor.dropToPlace')}
          </CanvasDropOverlay>
        )}

        <CanvasViewportStatusOverlay icon={<MousePointer2 size={14} />}>
          {draggingNodeId
            ? t('canvas.editor.status.dragging')
            : selectedNode
              ? t('canvas.editor.status.selected', { label: selectedNodeData?.label || (selectedNodeMeta ? t(selectedNodeMeta.labelKey) : selectedNode.type) })
              : t('canvas.editor.status.idle')}
        </CanvasViewportStatusOverlay>

        {menu && (
          <ContextMenu
            x={menu.overlay.x}
            y={menu.overlay.y}
            positioning="viewport"
            boundary={menu.boundary}
            canvasType={canvasType}
            onAdd={onAddNode}
            onClose={onCloseMenu}
            selectedCount={topLevelSelectedNodes.length}
            selectedGroupCount={topLevelSelectedGroups.length}
            onGroupSelected={createGroupFromSelection}
            onUngroupSelected={ungroupSelectedGroups}
            onDeleteSelected={deleteSelectedNodes}
            hasSelection={nodes.some((node) => node.selected)}
          />
        )}
      </CanvasViewportOverlayLayer>
    </CanvasViewportPane>
  )
}
