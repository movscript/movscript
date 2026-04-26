import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
  type NodeChange,
  ReactFlowProvider,
  useReactFlow,
  SelectionMode,
  ConnectionMode,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { api } from '@/lib/api'
import type { Canvas, CanvasNodeData, CanvasRun, CanvasTask, CanvasType, NodeType } from '@/types'
import {
  TextNode, ImageNode, VideoNode, AudioNode, ToolNode,
  InputNode, OutputNode, ApprovalNode, TextGenNode, AIGenNode, GroupNode,
} from './components/CanvasNodes'
import { ContextMenu } from './components/ContextMenu'
import { NodePanel } from './components/NodePanel'
import {
  CANVAS_NODE_CATALOG,
  CANVAS_NODE_CATEGORIES,
  CANVAS_NODE_META,
  NODE_LABELS,
} from './nodeCatalog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Layers3,
  Loader2,
  MousePointer2,
  PanelRightClose,
  Play,
  Save,
  Search,
  Sparkles,
  Workflow,
  Zap,
  Lightbulb,
} from 'lucide-react'

const nodeTypes = {
  text: TextNode,
  image: ImageNode,
  video: VideoNode,
  audio: AudioNode,
  canvas: ToolNode,
  ref_image_gen: ToolNode,
  ref_video_gen: ToolNode,
  multi_angle: ToolNode,
  style_transfer: ToolNode,
  motion_imitation: ToolNode,
  input: InputNode,
  output: OutputNode,
  approval: ApprovalNode,
  text_gen: TextGenNode,
  ai_gen: AIGenNode,
  group: GroupNode,
}

function genId() {
  return Math.random().toString(36).slice(2, 10)
}

function createNodeData(type: NodeType): Partial<CanvasNodeData> & { label: string } {
  return { ...(CANVAS_NODE_META[type]?.defaultData ?? { source: 'upload', label: NODE_LABELS[type] }) }
}

function CanvasEditorInner() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { screenToFlowPosition, fitView } = useReactFlow()

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [canvasName, setCanvasName] = useState('')
  const [canvasType, setCanvasType] = useState<CanvasType>('inspiration')
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [libraryCollapsed, setLibraryCollapsed] = useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [dropActive, setDropActive] = useState(false)

  // Workflow input dialog
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [activeRunId, setActiveRunId] = useState<number | null>(null)

  const fitViewCalledRef = useRef(false)
  const canvasPaneRef = useRef<HTMLDivElement>(null)

  // Load canvas
  const { data: canvas } = useQuery<Canvas>({
    queryKey: ['canvas', id],
    queryFn: () => api.get(`/canvases/${id}`).then((r) => r.data),
    enabled: !!id
  })

  const { data: workflowRuns = [] } = useQuery<CanvasRun[]>({
    queryKey: ['canvas-runs', id],
    queryFn: () => api.get(`/canvases/${id}/runs`).then((r) => r.data),
    enabled: !!id && canvasType === 'workflow',
    refetchInterval: canvasType === 'workflow' ? 2000 : false,
  })

  useEffect(() => {
    if (!canvas) return
    setCanvasName(canvas.name)
    setCanvasType(canvas.canvas_type ?? 'inspiration')
    const loadedNodes: Node[] = (canvas.nodes ?? []).map((n) => {
      const data: CanvasNodeData = n.data ? JSON.parse(n.data) : { source: 'upload' }
      const { _parentId, _style, ...cleanData } = data as any
      const node: Node = {
        id: n.node_id,
        type: n.type,
        position: { x: n.pos_x, y: n.pos_y },
        data: { ...cleanData, label: n.label },
        ...(n.type === 'group'
          ? { zIndex: -1, style: _style ?? { width: 320, height: 240 } }
          : { style: { width: (_style?.width ?? 200) } }),
        ...(_parentId && { parentId: _parentId }),
      }
      return node
    })
    // Groups must appear before their children in the array
    const groupNodes = loadedNodes.filter(n => n.type === 'group')
    const childNodes = loadedNodes.filter(n => n.type !== 'group')
    const loadedEdges: Edge[] = (canvas.edges ?? []).map((e) => ({
      id: e.edge_id,
      source: e.source,
      target: e.target,
    }))
    setNodes([...groupNodes, ...childNodes])
    setEdges(loadedEdges)

    if (!fitViewCalledRef.current && loadedNodes.length > 0) {
      fitViewCalledRef.current = true
      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80)
    }
  }, [canvas])

  // Poll running nodes
  useEffect(() => {
    const runningNodes = nodes.filter((n) => {
      const d = n.data as unknown as CanvasNodeData
      return d.status === 'running' || d.status === 'pending'
    })
    if (runningNodes.length === 0) return
    const timer = setInterval(async () => {
      for (const n of runningNodes) {
        try {
          const task: CanvasTask = await api.get(`/canvases/${id}/nodes/${n.id}/task`).then((r) => r.data)
          if (task.status === 'done' || task.status === 'failed') {
            let resource: any
            if (task.resource_id) {
              resource = await api.get('/resources').then((r) =>
                (r.data as any[]).find((res) => res.ID === task.resource_id)
              )
            }
            setNodes((prev) => prev.map((node) => {
              if (node.id !== n.id) return node
              const d = node.data as unknown as CanvasNodeData
              return { ...node, data: { ...d, status: task.status, resourceId: task.resource_id, resource, error: task.error } }
            }))
          }
        } catch (err: any) {
          if (err?.response?.status === 404) {
            setNodes((prev) => prev.map((node) => {
              if (node.id !== n.id) return node
              const d = node.data as unknown as CanvasNodeData
              return { ...node, data: { ...d, status: 'failed', error: 'node not found in DB' } }
            }))
          }
        }
      }
    }, 2000)
    return () => clearInterval(timer)
  }, [nodes, id])

  // Save
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: canvasName,
        canvas_type: canvasType,
        nodes: nodes.map((n) => {
          const { label, onRun, onUpdateContent, onUpdatePrompt, onUpdateOutputType, onUpdateModelId, onUpdateAttachments, onApprove, onReject, onPush, onCycleMode, canvasId: _canvasId, rfNodeId: _rfNodeId, ...rest } = n.data as any
          return {
            node_id: n.id,
            type: n.type,
            label: label ?? '',
            pos_x: n.position.x,
            pos_y: n.position.y,
            // embed parentId and style into data so they survive save/load
            data: JSON.stringify({
              ...rest,
              _parentId: n.parentId ?? undefined,
              _style: n.style,
            }),
          }
        }),
        edges: edges.map((e) => ({
          edge_id: e.id,
          source: e.source,
          target: e.target,
        })),
      }
      return api.put(`/canvases/${id}`, payload)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canvas', id] })
  })

  // Run all
  const runAll = useMutation({
    mutationFn: (values?: Record<string, string>) => api.post(`/canvases/${id}/run`, { input_values: values ?? {} }).then((r) => r.data),
    onSuccess: (data) => {
      const runId = data?.run?.ID
      if (runId) setActiveRunId(runId)
      qc.invalidateQueries({ queryKey: ['canvas-runs', id] })
      setNodes((prev) => prev.map((n) => {
        const d = n.data as unknown as CanvasNodeData
        if (d.source === 'ai') return { ...n, data: { ...d, status: 'pending' } }
        return n
      }))
    }
  })

  // Run single node
  const runNode = useCallback(async (nodeId: string) => {
    await save.mutateAsync()
    await api.post(`/canvases/${id}/nodes/${nodeId}/run`)
    setNodes((prev) => prev.map((n) => {
      if (n.id !== nodeId) return n
      return { ...n, data: { ...n.data, status: 'pending' } }
    }))
  }, [id, save])

  // Handle workflow run: save first to ensure all nodes are persisted, then show input dialog if needed
  async function handleRunWorkflow() {
    try {
      await save.mutateAsync()
    } catch {
      return
    }
    const inputNodes = nodes.filter((n) => n.type === 'input')
    if (inputNodes.length > 0) {
      const initial: Record<string, string> = {}
      inputNodes.forEach((n) => { initial[n.id] = (n.data as any).inputValue ?? '' })
      setInputValues(initial)
      setRunDialogOpen(true)
    } else {
      runAll.mutate({})
    }
  }

  function handleConfirmRun() {
    setNodes((prev) => prev.map((n) => {
      if (n.type === 'input' && inputValues[n.id] !== undefined) {
        return { ...n, data: { ...n.data, inputValue: inputValues[n.id] } }
      }
      return n
    }))
    setRunDialogOpen(false)
    runAll.mutate(inputValues)
  }

  // Approval
  function handleApprove(nodeId: string) {
    updateNodeData(nodeId, { approvalStatus: 'approved' })
  }
  function handleReject(nodeId: string) {
    updateNodeData(nodeId, { approvalStatus: 'rejected' })
  }

  const addNodeAt = useCallback((type: NodeType, clientPosition?: { x: number; y: number }) => {
    const fallbackRect = canvasPaneRef.current?.getBoundingClientRect()
    const screenPosition = clientPosition ?? (
      fallbackRect
        ? { x: fallbackRect.left + fallbackRect.width / 2, y: fallbackRect.top + fallbackRect.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    )
    const position = screenToFlowPosition(screenPosition)
    const baseData = createNodeData(type)
    const newNode: Node = {
      id: genId(),
      type,
      position,
      data: { ...baseData },
      ...(type === 'group'
        ? { style: { width: 320, height: 240 }, zIndex: -1 }
        : { style: { width: 200 } }),
    }
    setNodes((prev) => [...prev, newNode])
  }, [screenToFlowPosition])

  // Add node from context menu
  const addNode = useCallback((type: NodeType) => {
    if (!menu) return
    addNodeAt(type, { x: menu.x, y: menu.y })
  }, [addNodeAt, menu])

  // Delete selected nodes and their connected edges (also removes children of deleted groups)
  const deleteSelectedNodes = useCallback(() => {
    const directSelected = new Set(nodes.filter(n => n.selected).map(n => n.id))
    if (directSelected.size === 0) return
    // Also collect children of any selected group nodes
    const toDelete = new Set(directSelected)
    nodes.forEach(n => { if (n.parentId && toDelete.has(n.parentId)) toDelete.add(n.id) })
    setNodes(prev => prev.filter(n => !toDelete.has(n.id)))
    setEdges(prev => prev.filter(e => !toDelete.has(e.source) && !toDelete.has(e.target)))
    setSelectedNodeIds([])
  }, [nodes, setNodes, setEdges])

  // Group selected nodes into a new group node
  const createGroupFromSelection = useCallback(() => {
    const selected = nodes.filter((n) => n.selected && n.type !== 'group')
    if (selected.length < 2) return
    const PAD = 40
    const minX = Math.min(...selected.map((n) => n.position.x)) - PAD
    const minY = Math.min(...selected.map((n) => n.position.y)) - PAD
    const maxX = Math.max(...selected.map((n) => n.position.x + (n.measured?.width ?? 208))) + PAD
    const maxY = Math.max(...selected.map((n) => n.position.y + (n.measured?.height ?? 80))) + PAD
    const groupId = genId()
    const groupNode: Node = {
      id: groupId,
      type: 'group',
      position: { x: minX, y: minY },
      style: { width: maxX - minX, height: maxY - minY },
      zIndex: -1,
      data: { source: 'manual', label: '分组', isGroup: true },
    }
    setNodes((prev) => [
      groupNode, // parent must come before children
      ...prev.map((n) => {
        if (!n.selected || n.type === 'group') return n
        // Convert to relative position, no extent:'parent' so nodes can be dragged out
        return {
          ...n,
          parentId: groupId,
          position: { x: n.position.x - minX, y: n.position.y - minY },
        }
      }),
    ])
  }, [nodes])

  // Drag node out of group → detach it
  const onNodeDragStop = useCallback((_: React.MouseEvent, draggedNode: Node) => {
    if (!draggedNode.parentId) return
    const parent = nodes.find(n => n.id === draggedNode.parentId)
    if (!parent) return
    const gw = (parent.style as any)?.width ?? 320
    const gh = (parent.style as any)?.height ?? 240
    const { x: nx, y: ny } = draggedNode.position
    const nw = draggedNode.measured?.width ?? 208
    const nh = draggedNode.measured?.height ?? 80
    // If the node's center is outside the group bounds, detach it
    const cx = nx + nw / 2
    const cy = ny + nh / 2
    if (cx < 0 || cy < 0 || cx > gw || cy > gh) {
      setNodes(prev => prev.map(n => {
        if (n.id !== draggedNode.id) return n
        return {
          ...n,
          parentId: undefined,
          position: {
            x: parent.position.x + draggedNode.position.x,
            y: parent.position.y + draggedNode.position.y,
          },
        }
      }))
    }
  }, [nodes])

  // Cmd+S to save
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        save.mutate()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save])

  // Track multi-selection
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes)
    setSelectedNodeIds((prev) => {
      const next = new Set(prev)
      changes.forEach((c) => {
        if (c.type === 'select') {
          if (c.selected) next.add(c.id)
          else next.delete(c.id)
        }
      })
      return [...next]
    })
  }, [onNodesChange])

  // Update node data
  const updateNodeData = useCallback((nodeId: string, patch: Partial<CanvasNodeData & { label: string }>) => {
    setNodes((prev) => prev.map((n) => {
      if (n.id !== nodeId) return n
      return { ...n, data: { ...n.data, ...patch } }
    }))
  }, [])

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge(params, eds))
  }, [])

  // Single click — selection only, mode cycling is handled by the node's own button
  const onNodeClick = useCallback((_: React.MouseEvent, _node: Node) => {
    // intentionally empty — mode cycling moved to onCycleMode in each node
  }, [])

  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }, [])

  // Right-click on a selection (multi-select) → show context menu
  const onSelectionContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }, [])

  // Right-click on a single node → show context menu
  const onNodeContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDropActive(false)
    const type = e.dataTransfer.getData('application/canvas-node-type') as NodeType
    if (!type || !CANVAS_NODE_META[type]) return
    addNodeAt(type, { x: e.clientX, y: e.clientY })
  }, [addNodeAt])

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/canvas-node-type')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDropActive(true)
    }
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDropActive(false)
  }, [])

  const onNodeDragStart = useCallback((_: React.MouseEvent, node: Node) => {
    setDraggingNodeId(node.id)
  }, [])

  const handleNodeDragStop = useCallback((event: React.MouseEvent, node: Node) => {
    setDraggingNodeId(null)
    onNodeDragStop(event, node)
  }, [onNodeDragStop])

  const nodesWithHandlers = nodes.map((n) => ({
    ...n,
    data: {
      ...n.data,
      canvasId: id,
      rfNodeId: n.id,
      onRun: () => runNode(n.id),
      onUpdateContent: (content: string) => updateNodeData(n.id, { textContent: content }),
      onUpdatePrompt: (prompt: string) => updateNodeData(n.id, { prompt }),
      onUpdateOutputType: (outputType: string) => updateNodeData(n.id, { outputType } as any),
      onUpdateModelId: (modelDbId: number) => updateNodeData(n.id, { modelDbId }),
      onUpdateAttachments: (ids: number[]) => updateNodeData(n.id, { inputResourceIds: ids }),
      onApprove: () => handleApprove(n.id),
      onReject: () => handleReject(n.id),
      onCycleMode: () => {
        if (n.type === 'group') return
        const modes: Array<'compact' | 'detail' | 'full'> = ['compact', 'detail', 'full']
        const current = (n.data as any).cardMode ?? 'detail'
        const next = modes[(modes.indexOf(current) + 1) % modes.length]
        updateNodeData(n.id, { cardMode: next })
      },
    }
  }))

  const inputNodes = nodes.filter((n) => n.type === 'input')
  const selectedNode = selectedNodeIds.length > 0
    ? nodes.find((n) => n.id === selectedNodeIds[selectedNodeIds.length - 1])
    : undefined
  const selectedNodeData = selectedNode?.data as (CanvasNodeData & { label?: string }) | undefined
  const runningCount = nodes.filter((n) => {
    const d = n.data as unknown as CanvasNodeData
    return d.status === 'running' || d.status === 'pending'
  }).length
  const doneCount = nodes.filter((n) => (n.data as unknown as CanvasNodeData).status === 'done').length
  const workflowStats = {
    inputs: nodes.filter((n) => n.type === 'input').length,
    processors: nodes.filter((n) => (n.data as unknown as CanvasNodeData).source === 'ai').length,
    outputs: nodes.filter((n) => n.type === 'output').length,
  }
  const activeRun = workflowRuns.find((run) => run.ID === activeRunId) ?? workflowRuns[0]
  const activeRunStatusLabel = activeRun?.status === 'running' ? '运行中'
    : activeRun?.status === 'pending' ? '排队中'
    : activeRun?.status === 'done' ? '已完成'
    : activeRun?.status === 'failed' ? '失败'
    : undefined
  const workflowRunningCount = workflowRuns.filter((run) => run.status === 'running' || run.status === 'pending').length
  const selectedNodeMeta = selectedNode?.type ? CANVAS_NODE_META[selectedNode.type as NodeType] : undefined

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="h-14 shrink-0 border-b border-border bg-card/95 px-3">
        <div className="flex h-full items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/canvases')} className="h-8 w-8 shrink-0">
            <ArrowLeft size={16} />
          </Button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <input
                className="min-w-0 flex-1 border-none bg-transparent text-sm font-semibold text-foreground outline-none"
                value={canvasName}
                onChange={(e) => setCanvasName(e.target.value)}
                placeholder="未命名画布"
              />
              <Badge variant="outline" className="hidden shrink-0 gap-1 border-border font-medium text-muted-foreground sm:flex">
                <Workflow size={12} />
                {nodes.length} 节点
              </Badge>
              {runningCount > 0 && (
                <Badge variant="secondary" className="shrink-0 gap-1">
                  <Loader2 size={11} className="animate-spin" />
                  {runningCount} 运行中
                </Badge>
              )}
              {canvasType === 'workflow' && activeRun && activeRunStatusLabel && (
                <Badge variant={activeRun.status === 'failed' ? 'destructive' : 'outline'} className="hidden shrink-0 gap-1 sm:flex">
                  {(activeRun.status === 'running' || activeRun.status === 'pending') && <Loader2 size={11} className="animate-spin" />}
                  运行 #{activeRun.ID} · {activeRunStatusLabel}
                </Badge>
              )}
              {canvasType === 'workflow' && workflowRunningCount > 1 && (
                <Badge variant="secondary" className="hidden shrink-0 sm:flex">
                  并行 {workflowRunningCount}
                </Badge>
              )}
            </div>
            <div className="mt-0.5 hidden items-center gap-2 text-[11px] text-muted-foreground md:flex">
              <span>输入 {workflowStats.inputs}</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>处理 {workflowStats.processors}</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>输出 {workflowStats.outputs}</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>已完成 {doneCount}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-border bg-background text-xs">
            <button
              onClick={() => setCanvasType('inspiration')}
              className={cn(
                'flex h-8 items-center gap-1.5 px-3 transition-colors',
                canvasType === 'inspiration' ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:bg-muted/50'
              )}
            >
              <Lightbulb size={12} /> 灵感
            </button>
            <div className="h-5 w-px bg-border" />
            <button
              onClick={() => setCanvasType('workflow')}
              className={cn(
                'flex h-8 items-center gap-1.5 px-3 transition-colors',
                canvasType === 'workflow' ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:bg-muted/50'
              )}
            >
              <Zap size={12} /> 工作流
            </button>
          </div>

          {canvasType === 'workflow' && (
            <Button onClick={handleRunWorkflow} disabled={runAll.isPending} size="sm" className="shrink-0">
              <Play size={12} /> {runAll.isPending ? '启动中…' : '启动运行'}
            </Button>
          )}

          <Button onClick={() => save.mutate()} disabled={save.isPending} size="sm" variant="outline" className="shrink-0">
            {save.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {save.isPending ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className={cn(
          'shrink-0 border-r border-border bg-sidebar transition-all duration-200',
          libraryCollapsed ? 'w-12' : 'w-72'
        )}>
          <div className="flex h-full flex-col">
            <div className={cn(
              'flex h-12 items-center border-b border-sidebar-border',
              libraryCollapsed ? 'justify-center px-0' : 'gap-2 px-3'
            )}>
              {!libraryCollapsed && <Layers3 size={15} className="shrink-0 text-muted-foreground" />}
              {!libraryCollapsed && <span className="flex-1 text-xs font-semibold text-foreground">节点库</span>}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setLibraryCollapsed((v) => !v)}
              >
                {libraryCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              </Button>
            </div>

            {!libraryCollapsed && (
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground">
                  <Search size={12} />
                  <span>拖拽节点到画布，或点击添加到视口中心</span>
                </div>
                <div className="space-y-4">
                  {CANVAS_NODE_CATEGORIES.map((category) => {
                    const items = CANVAS_NODE_CATALOG.filter((item) => item.category === category.id)
                    return (
                      <section key={category.id}>
                        <div className="mb-2">
                          <p className="text-[11px] font-semibold text-foreground">{category.title}</p>
                          <p className="text-[10px] leading-relaxed text-muted-foreground">{category.description}</p>
                        </div>
                        <div className="grid gap-1.5">
                          {items.map((item) => {
                            const Icon = item.icon
                            return (
                              <button
                                key={item.type}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('application/canvas-node-type', item.type)
                                  e.dataTransfer.effectAllowed = 'copy'
                                }}
                                onClick={() => addNodeAt(item.type)}
                                className="group flex min-h-[54px] items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-foreground/25 hover:bg-background"
                              >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
                                  <Icon size={15} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-medium text-foreground">{item.label}</span>
                                  <span className="block truncate text-[10px] text-muted-foreground">{item.description}</span>
                                </span>
                                <GripVertical size={13} className="shrink-0 text-muted-foreground/45" />
                              </button>
                            )
                          })}
                        </div>
                      </section>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </aside>

        <div
          ref={canvasPaneRef}
          className={cn(
            'relative min-w-0 flex-1 bg-background',
            dropActive && 'ring-2 ring-inset ring-primary/35'
          )}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          <ReactFlow
            className="canvas-flow"
            nodes={nodesWithHandlers}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeContextMenu={onNodeContextMenu}
            onSelectionContextMenu={onSelectionContextMenu}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={handleNodeDragStop}
            onPaneClick={() => setMenu(null)}
            onPaneContextMenu={onPaneContextMenu}
            nodeTypes={nodeTypes}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            minZoom={0.1}
            maxZoom={4}
            deleteKeyCode={['Delete', 'Backspace']}
            selectionOnDrag={true}
            panOnDrag={[1, 2]}
            selectionMode={SelectionMode.Partial}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={40}
            defaultEdgeOptions={{
              type: 'smoothstep',
              markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
              style: { strokeWidth: 1.6 },
            }}
          >
            <Background gap={18} size={1} color="hsl(var(--border))" />
            <Controls position="bottom-left" />
            <MiniMap zoomable pannable position="bottom-right" nodeStrokeWidth={3} />
          </ReactFlow>

          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
              <div className="max-w-sm rounded-lg border border-dashed border-border bg-background/80 p-5 text-center shadow-sm backdrop-blur">
                <Sparkles size={20} className="mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">从左侧拖入输入、AI 处理和输出节点</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">右键画布也可以快速插入节点。选中节点后在右侧配置模型、提示词和素材来源。</p>
              </div>
            </div>
          )}

          {dropActive && (
            <div className="pointer-events-none absolute inset-4 flex items-center justify-center rounded-lg border border-dashed border-primary/50 bg-primary/5 text-sm font-medium text-primary">
              松开鼠标放置节点
            </div>
          )}

          <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-md border border-border bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur">
            <MousePointer2 size={13} />
            {draggingNodeId ? '正在移动节点，松开后会保留位置' : selectedNode ? `已选中 ${selectedNodeData?.label || selectedNodeMeta?.label || selectedNode.type}` : '拖动画布平移，框选可批量操作'}
          </div>
        </div>

        <aside className={cn(
          'shrink-0 border-l border-border bg-background transition-all duration-200',
          inspectorCollapsed ? 'w-12' : 'w-80'
        )}>
          <div className="flex h-full flex-col">
            <div className="flex h-12 items-center gap-2 border-b border-border px-3">
              <PanelRightClose size={15} className="shrink-0 text-muted-foreground" />
              {!inspectorCollapsed && <span className="flex-1 text-xs font-semibold text-foreground">节点检查器</span>}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setInspectorCollapsed((v) => !v)}
              >
                {inspectorCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
              </Button>
            </div>

            {!inspectorCollapsed && (
              selectedNode ? (
                <NodePanel
                  nodeId={selectedNode.id}
                  canvasId={Number(id)}
                  nodeType={selectedNode.type as NodeType}
                  data={selectedNode.data as unknown as CanvasNodeData}
                  label={(selectedNode.data as any).label || NODE_LABELS[selectedNode.type as NodeType]}
                  allNodes={nodes}
                  edges={edges}
                  onUpdate={updateNodeData}
                  onRun={runNode}
                />
              ) : (
                <div className="flex min-h-0 flex-1 flex-col p-4 text-sm">
                  <div className="rounded-lg border border-dashed border-border bg-muted/25 p-4">
                    <p className="text-sm font-medium text-foreground">未选择节点</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">选择一个节点后，可以在这里编辑标签、输入来源、模型、提示词和运行参数。</p>
                  </div>
                  <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <span>当前选择</span>
                      <span>{selectedNodeIds.length}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <span>连接数量</span>
                      <span>{edges.length}</span>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </aside>
      </div>

      {/* Context menu */}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onAdd={addNode}
          onClose={() => setMenu(null)}
          selectedCount={nodes.filter((n) => n.selected && n.type !== 'group').length}
          onGroupSelected={createGroupFromSelection}
          onDeleteSelected={deleteSelectedNodes}
          hasSelection={nodes.some(n => n.selected)}
        />
      )}

      {/* Workflow input dialog */}
      {runDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-xl p-6 w-[420px] shadow-2xl space-y-4 border border-border">
            <div>
              <h2 className="text-sm font-semibold text-foreground">填写工作流输入</h2>
              <p className="text-xs text-muted-foreground mt-0.5">填写以下输入节点的内容后，工作流将自动运行。</p>
            </div>
            {inputNodes.map((n) => (
              <div key={n.id}>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                  {(n.data as any).paramName || (n.data as any).label || '输入'}
                  {(n.data as any).paramType && (
                    <span className="ml-1 font-normal text-muted-foreground/70">({(n.data as any).paramType})</span>
                  )}
                </Label>
                <Textarea
                  rows={3}
                  placeholder="输入内容…"
                  value={inputValues[n.id] ?? ''}
                  onChange={(e) => setInputValues((prev) => ({ ...prev, [n.id]: e.target.value }))}
                  autoFocus={inputNodes[0]?.id === n.id}
                />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <Button onClick={handleConfirmRun} className="flex-1">
                开始运行
              </Button>
              <Button
                variant="outline"
                onClick={() => setRunDialogOpen(false)}
              >
                取消
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CanvasEditorPage() {
  return (
    <ReactFlowProvider>
      <CanvasEditorInner />
    </ReactFlowProvider>
  )
}
