import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  ReactFlowProvider,
  useReactFlow,
  Panel,
  SelectionMode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { api } from '@/lib/api'
import { useProjectStore } from '@/store/projectStore'
import type { Pipeline, PipelineNode, PipelineEdge } from '@/types'
import { PipelineNodeComponent } from './components/PipelineNodeComponent'
import { NodeDetailPanel } from './components/NodeDetailPanel'
import { GanttChart } from './components/GanttChart'
import { CanvasContextMenu } from './components/CanvasContextMenu'
import { DeleteNodeDialog } from './components/DeleteNodeDialog'
import { PipelineEntityNavPanel, PIPELINE_ENTITY_DRAG_TYPE, type PipelineEntityDragItem } from './components/PipelineEntityNavPanel'
import { Button } from '@/components/ui/button'
import { ArrowLeft, LayoutDashboard, GanttChartSquare, Loader2, ScanLine } from 'lucide-react'

// ── ReactFlow node type registry ─────────────────────────────────────────────

const nodeTypes = { pipeline: PipelineNodeComponent }

// ── Helpers ───────────────────────────────────────────────────────────────────

function pipelineNodeToFlow(
  n: PipelineNode,
  selectedId: number | null,
  onClick: (n: PipelineNode) => void,
): Node {
  return {
    id: String(n.ID),
    type: 'pipeline',
    position: { x: n.pos_x, y: n.pos_y },
    data: { ...n, selected: n.ID === selectedId, onClick: () => onClick(n) },
  }
}

function pipelineEdgeToFlow(e: PipelineEdge): Edge {
  return {
    id: String(e.ID),
    source: String(e.from_node_id),
    target: String(e.to_node_id),
    animated: false,
    style: { stroke: 'hsl(var(--border))', strokeWidth: 2 },
    markerEnd: { type: 'arrowclosed' as const, color: 'hsl(var(--border))' },
  }
}

// ── Context menu state type ───────────────────────────────────────────────────

interface ContextMenuState {
  screenX: number
  screenY: number
  flowX: number
  flowY: number
}

// ── Inner editor ──────────────────────────────────────────────────────────────

function PipelineEditorInner() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const project = useProjectStore((s) => s.current)
  const { fitView, screenToFlowPosition, getNodes } = useReactFlow()

  const [activeTab, setActiveTab] = useState<'dag' | 'gantt'>('dag')
  const [selectedNode, setSelectedNode] = useState<PipelineNode | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Node[]>([])
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: pipeline, isLoading } = useQuery<Pipeline>({
    queryKey: ['pipeline', project?.ID],
    queryFn: () => api.get(`/projects/${project!.ID}/pipeline`).then((r) => r.data),
    enabled: !!project,
  })

  // Sync pipeline → ReactFlow nodes/edges
  useEffect(() => {
    if (!pipeline) return
    setNodes(pipeline.nodes.map((n) => pipelineNodeToFlow(n, selectedNode?.ID ?? null, setSelectedNode)))
    setEdges(pipeline.edges.map(pipelineEdgeToFlow))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline])

  // Keep selectedNode fresh after refetch
  useEffect(() => {
    if (!selectedNode || !pipeline) return
    const fresh = pipeline.nodes.find((n) => n.ID === selectedNode.ID)
    if (fresh) setSelectedNode(fresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline])

  // Update 'selected' highlight without full sync
  useEffect(() => {
    if (!pipeline) return
    setNodes(pipeline.nodes.map((n) => pipelineNodeToFlow(n, selectedNode?.ID ?? null, setSelectedNode)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode?.ID])

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createNode = useMutation({
    mutationFn: (body: Partial<PipelineNode>) =>
      api.post(`/projects/${project!.ID}/pipeline/nodes`, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] }),
  })

  const createEdge = useMutation({
    mutationFn: (body: { from_node_id: number; to_node_id: number }) =>
      api.post(`/projects/${project!.ID}/pipeline/edges`, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] }),
  })

  const deleteEdge = useMutation({
    mutationFn: (edgeId: string) => api.delete(`/pipeline/edges/${edgeId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] }),
  })

  const deleteNode = useMutation({
    mutationFn: (nodeId: number) => api.delete(`/pipeline/nodes/${nodeId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
      setPendingDelete([])
      setSelectedNode(null)
    },
  })

  const updateNodePos = useMutation({
    mutationFn: ({ id, pos_x, pos_y }: { id: number; pos_x: number; pos_y: number }) =>
      api.put(`/pipeline/nodes/${id}`, { pos_x, pos_y }),
  })

  const updateNode = useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<PipelineNode>) =>
      api.put(`/pipeline/nodes/${id}`, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] }),
  })

  // ── ReactFlow event handlers ───────────────────────────────────────────────

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      createEdge.mutate({
        from_node_id: parseInt(connection.source),
        to_node_id: parseInt(connection.target),
      })
      setEdges((eds) => addEdge(connection, eds))
    },
    [createEdge],
  )

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => { deleted.forEach((e) => deleteEdge.mutate(e.id)) },
    [deleteEdge],
  )

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      updateNodePos.mutate({
        id: parseInt(node.id),
        pos_x: node.position.x,
        pos_y: node.position.y,
      })
    },
    [updateNodePos],
  )

  // Right-click on canvas pane → context menu
  const onPaneContextMenu = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      e.preventDefault()
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      setContextMenu({ screenX: e.clientX, screenY: e.clientY, flowX: flowPos.x, flowY: flowPos.y })
    },
    [screenToFlowPosition],
  )

  // ── Keyboard: intercept Delete/Backspace for confirmation ──────────────────

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      // Don't intercept if focus is in an input/textarea
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      // Use tracked selectedNodeIds for reliability
      const selected = getNodes().filter((n) => selectedNodeIds.has(n.id) || n.selected)
      if (selected.length === 0) return
      e.preventDefault()
      setPendingDelete(selected)
    },
    [getNodes, selectedNodeIds],
  )

  // Track selection changes for reliable delete
  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[]; edges: Edge[] }) => {
      setSelectedNodeIds(new Set(selectedNodes.map((n) => n.id)))
    },
    [],
  )

  // Confirm multi-node delete
  async function handleConfirmDelete() {
    for (const node of pendingDelete) {
      await deleteNode.mutateAsync(parseInt(node.id))
    }
  }

  // Add node from context menu selection
  function handleContextMenuSelect(type: string, name: string) {
    if (!contextMenu) return
    createNode.mutate({
      type,
      name,
      pos_x: contextMenu.flowX,
      pos_y: contextMenu.flowY,
    })
  }

  // ── Entity drag-drop from left panel ──────────────────────────────────────

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(PIPELINE_ENTITY_DRAG_TYPE)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const raw = e.dataTransfer.getData(PIPELINE_ENTITY_DRAG_TYPE)
      if (!raw) return
      const item = JSON.parse(raw) as PipelineEntityDragItem
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      createNode.mutate({
        type: item.suggestedNodeType,
        name: item.label,
        entity_type: item.entityType,
        entity_id: item.entityId,
        pos_x: flowPos.x,
        pos_y: flowPos.y,
      })
    },
    [screenToFlowPosition, createNode],
  )

  if (!project) return null

  const pendingDeleteNames = pendingDelete.map(
    (n) => (n.data as unknown as PipelineNode).name ?? `节点 ${n.id}`
  )

  return (
    <div
      className="flex flex-col h-screen bg-background text-foreground"
      onClick={() => setContextMenu(null)}
    >

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center px-4 py-2.5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3 w-52 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(-1)}>
            <ArrowLeft size={15} />
          </Button>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{project.name}</p>
            <p className="text-xs text-muted-foreground">内容生产管线</p>
          </div>
        </div>

        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
            <TabBtn active={activeTab === 'dag'} icon={<LayoutDashboard size={13} />} label="DAG 视图" onClick={() => setActiveTab('dag')} />
            <TabBtn active={activeTab === 'gantt'} icon={<GanttChartSquare size={13} />} label="甘特图" onClick={() => setActiveTab('gantt')} />
          </div>
        </div>

        <div className="flex items-center gap-2 w-52 shrink-0 justify-end">
          {activeTab === 'dag' && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setTimeout(() => fitView({ padding: 0.2 }), 100)}>
              <ScanLine size={12} className="mr-1" />
              适应画面
            </Button>
          )}
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Left: entity nav panel (DAG view only) */}
        {activeTab === 'dag' && <PipelineEntityNavPanel />}

        {/* Canvas or Gantt */}
        <div
          className="flex-1 min-w-0 relative outline-none"
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          )}

          {activeTab === 'dag' ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onEdgesDelete={onEdgesDelete}
              onNodeDragStop={onNodeDragStop}
              onPaneContextMenu={onPaneContextMenu}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onSelectionChange={onSelectionChange}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              deleteKeyCode={null}
              selectionOnDrag
              selectionMode={SelectionMode.Partial}
              panOnDrag={[1, 2]}
              connectionRadius={40}
              className="bg-muted/10"
            >
              <Background color="hsl(var(--border))" gap={20} size={1} />
              <Controls />
              <MiniMap
                nodeColor={(n) => {
                  const status = (n.data as unknown as PipelineNode).status
                  if (status === 'final') return '#22c55e'
                  if (status === 'under_review') return '#f59e0b'
                  if (status === 'rejected') return '#ef4444'
                  return '#94a3b8'
                }}
                className="bg-card border border-border rounded"
              />
              {pipeline && pipeline.nodes.length === 0 && (
                <Panel position="top-center">
                  <div className="mt-12 text-center">
                    <p className="text-sm text-muted-foreground">
                      管线为空 · 右键画板添加节点，或从左侧拖入内容
                    </p>
                  </div>
                </Panel>
              )}
            </ReactFlow>
          ) : (
            <GanttChart
              nodes={pipeline?.nodes ?? []}
              edges={pipeline?.edges ?? []}
              onNodeClick={setSelectedNode}
            />
          )}
        </div>

        {/* Right panel */}
        {selectedNode ? (
          <NodeDetailPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onNodeUpdated={(updated) => setSelectedNode(updated)}
          />
        ) : null}
      </div>

      {/* ── Context menu ────────────────────────────────────────────────────── */}
      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.screenX}
          y={contextMenu.screenY}
          onSelect={handleContextMenuSelect}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* ── Delete confirmation ──────────────────────────────────────────────── */}
      <DeleteNodeDialog
        open={pendingDelete.length > 0}
        nodeNames={pendingDeleteNames}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete([])}
        isPending={deleteNode.isPending}
      />
    </div>
  )
}

// ── Tab button helper ─────────────────────────────────────────────────────────

function TabBtn({ active, icon, label, onClick }: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded transition-colors whitespace-nowrap ${
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function PipelineEditorPage() {
  return (
    <ReactFlowProvider>
      <PipelineEditorInner />
    </ReactFlowProvider>
  )
}
