import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { api } from '@/lib/api'
import type { Canvas, CanvasNodeData, CanvasRun, CanvasTask, CanvasType, NodeType, RawResource } from '@/types'
import { type EntityKind, KIND_CONFIG } from './config'
import {
  TextNode, ImageNode, VideoNode, AudioNode, ToolNode,
  InputNode, OutputNode, ApprovalNode, TextGenNode, AIGenNode, GroupNode,
} from '@/pages/canvas/components/CanvasNodes'
import { ContextMenu } from '@/pages/canvas/components/ContextMenu'
import { Button } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { Save, Play, X, Zap, Lightbulb, ChevronDown, Loader2, Plus, Layers, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'

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

function getDefaultNodeData(type: NodeType, t: (key: string) => string): Partial<CanvasNodeData> & { label: string } {
  const label = t(`canvas.nodeLabels.${type}`)
  switch (type) {
    case 'input':
      return { source: 'manual', label, inputValue: '' }
    case 'output':
      return { source: 'upload', label }
    case 'approval':
      return { source: 'manual', label, approvalStatus: 'waiting' }
    case 'text_gen':
      return { source: 'ai', label }
    case 'ai_gen':
      return { source: 'ai', label, outputType: 'image' }
    case 'group':
      return { source: 'manual', label, isGroup: true, groupWidth: 320, groupHeight: 240 }
    default:
      return { source: 'upload', label }
  }
}

function resourceToNodeType(resource: RawResource): NodeType {
  if (resource.type === 'image' || resource.type === 'video' || resource.type === 'audio' || resource.type === 'text') {
    return resource.type
  }
  return 'text'
}

// Entity node dropped from the entity strip
export interface EntityDragItem {
  kind: EntityKind
  id: number
  label: string
}

export interface PushTarget {
  kind: 'asset' | 'storyboard' | 'scene'
  id: number
  label: string
}

interface Props {
  pushTargets: PushTarget[]
  onClose: () => void
}

// Running workflow task entry shown in the task list
interface WorkflowTask {
  canvasId: number
  name: string
  startedAt: number
  status: 'running' | 'done' | 'failed'
}

// Task tracker lives in module scope so it persists across renders
let _workflowTasks: WorkflowTask[] = []

interface InnerProps {
  canvasId: number
  canvasName: string
  canvasType: CanvasType
  onChangeName: (name: string) => void
  pushTargets: PushTarget[]
  onClose: () => void
}

function EmbeddedCanvasInner({
  canvasId,
  canvasName,
  canvasType,
  onChangeName,
  pushTargets,
  onClose,
}: InnerProps) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const { screenToFlowPosition } = useReactFlow()

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [taskList, setTaskList] = useState<WorkflowTask[]>([])
  const [activeRunId, setActiveRunId] = useState<number | null>(null)
  const [pushDialog, setPushDialog] = useState<{
    nodeId: string
    resourceId: number
    resourceType: 'image' | 'video'
  } | null>(null)
  const [pushTarget, setPushTarget] = useState<PushTarget | null>(null)
  const fitViewRef = useRef(false)

  // Load canvas
  const { data: canvas } = useQuery<Canvas>({
    queryKey: ['canvas', canvasId],
    queryFn: () => api.get(`/canvases/${canvasId}`).then((r) => r.data),
    enabled: !!canvasId,
  })

  const { data: activeRunTasks = [] } = useQuery<CanvasTask[]>({
    queryKey: ['canvas-run-tasks', canvasId, activeRunId],
    queryFn: () => api.get(`/canvases/${canvasId}/runs/${activeRunId}/tasks`).then((r) => r.data),
    enabled: !!canvasId && !!activeRunId,
    refetchInterval: activeRunId ? 2000 : false,
  })

  useEffect(() => {
    if (!canvas || activeRunTasks.length === 0) return
    const nodeIdByDbId = new Map((canvas.nodes ?? []).map((n) => [n.ID, n.node_id]))
    setNodes((prev) => prev.map((node) => {
      const task = activeRunTasks.find((t) => nodeIdByDbId.get(t.canvas_node_id) === node.id)
      if (!task) return node
      const d = node.data as unknown as CanvasNodeData
      return {
        ...node,
        data: {
          ...d,
          status: task.status,
          resourceId: task.resource_id ?? d.resourceId,
          resource: task.resource ?? d.resource,
          error: task.error,
        },
      }
    }))
    const finished = activeRunTasks.every((t) => t.status === 'done' || t.status === 'failed')
    if (finished) {
      const failed = activeRunTasks.some((t) => t.status === 'failed')
      setTaskList((prev) => prev.map((task, index) => (
        index === 0 ? { ...task, status: failed ? 'failed' : 'done' } : task
      )))
      setActiveRunId(null)
    }
  }, [activeRunTasks, canvas, setNodes])

  useEffect(() => {
    if (!canvas) return
    const loadedNodes: Node[] = (canvas.nodes ?? []).map((n) => {
      const raw: any = n.data ? JSON.parse(n.data) : { source: 'upload' }
      const { _parentId, _style, ...cleanData } = raw
      const node: Node = {
        id: n.node_id,
        type: n.type,
        position: { x: n.pos_x, y: n.pos_y },
        data: { ...cleanData, label: n.label },
        ...(n.type === 'group' && { zIndex: -1, style: _style ?? { width: 320, height: 240 } }),
        ...(_parentId && { parentId: _parentId }),
      }
      return node
    })
    const groupNodes = loadedNodes.filter((n) => n.type === 'group')
    const childNodes = loadedNodes.filter((n) => n.type !== 'group')
    const loadedEdges: Edge[] = (canvas.edges ?? []).map((e) => ({
      id: e.edge_id, source: e.source, target: e.target,
    }))
    setNodes([...groupNodes, ...childNodes])
    setEdges(loadedEdges)
  }, [canvas])

  // Poll running nodes
  useEffect(() => {
    const running = nodes.filter((n) => {
      const d = n.data as unknown as CanvasNodeData
      return d.status === 'running' || d.status === 'pending'
    })
    if (running.length === 0) return
    const timer = setInterval(async () => {
      for (const n of running) {
        try {
          const task: CanvasTask = await api.get(`/canvases/${canvasId}/nodes/${n.id}/task`).then((r) => r.data)
          if (task.status === 'done' || task.status === 'failed') {
            const resource: RawResource | undefined = task.resource
            setNodes((prev) => prev.map((node) => {
              if (node.id !== n.id) return node
              const d = node.data as unknown as CanvasNodeData
              return { ...node, data: { ...d, status: task.status, resourceId: task.resource_id, resource, error: task.error } }
            }))
          }
        } catch {
          // ignore polling errors
        }
      }
    }, 2000)
    return () => clearInterval(timer)
  }, [nodes, canvasId])

  // Save
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: canvasName,
        nodes: nodes.map((n) => {
          const { label, onRun, onUpdateContent, onUpdatePrompt, onUpdateOutputType, onUpdateModelId, onUpdateAttachments, onApprove, onReject, onPush, ...rest } = n.data as any
          return {
            node_id: n.id,
            type: n.type,
            label: label ?? '',
            pos_x: n.position.x,
            pos_y: n.position.y,
            data: JSON.stringify({
              ...rest,
              _parentId: n.parentId ?? undefined,
              _style: n.type === 'group' ? n.style : undefined,
            }),
          }
        }),
        edges: edges.map((e) => ({ edge_id: e.id, source: e.source, target: e.target })),
      }
      return api.put(`/canvases/${canvasId}`, payload)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canvas', canvasId] }),
  })

  // Run all
  const runAll = useMutation({
    mutationFn: (values?: Record<string, string>) => api.post(`/canvases/${canvasId}/run`, { input_values: values ?? {} }).then((r) => r.data),
    onSuccess: (data) => {
      const runId = data?.run?.ID
      if (runId) setActiveRunId(runId)
      setNodes((prev) => prev.map((n) => {
        const d = n.data as unknown as CanvasNodeData
        if (d.source === 'ai' || n.type === 'output') return { ...n, data: { ...d, status: 'pending', error: undefined } }
        return n
      }))
      const task: WorkflowTask = {
        canvasId,
        name: canvasName,
        startedAt: Date.now(),
        status: 'running',
      }
      setTaskList((prev) => [task, ...prev.slice(0, 9)])
    },
  })

  const runNode = useCallback(async (nodeId: string) => {
    await save.mutateAsync()
    await api.post(`/canvases/${canvasId}/nodes/${nodeId}/run`)
    setNodes((prev) => prev.map((n) => {
      if (n.id !== nodeId) return n
      return { ...n, data: { ...n.data, status: 'pending' } }
    }))
  }, [canvasId, save])

  async function handleRunWorkflow() {
    try { await save.mutateAsync() } catch { return }
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

  function handleApprove(nodeId: string) {
    updateNodeData(nodeId, { approvalStatus: 'approved' })
  }
  function handleReject(nodeId: string) {
    updateNodeData(nodeId, { approvalStatus: 'rejected' })
  }

  // Push resource from a canvas output node to a project entity
  async function handlePushConfirm() {
    if (!pushDialog || !pushTarget) return
    const { resourceId } = pushDialog
    const { kind, id } = pushTarget
    try {
      if (kind === 'storyboard') {
        const sb = await api.get(`/storyboards/${id}`).then((r) => r.data)
        const existing: number[] = sb.resource_ids ? JSON.parse(sb.resource_ids) : []
        if (!existing.includes(resourceId)) {
          await api.put(`/storyboards/${id}`, { resource_ids: JSON.stringify([...existing, resourceId]) })
          qc.invalidateQueries({ queryKey: ['storyboards-project', projectId] })
        }
      } else if (kind === 'scene') {
        const sc = await api.get(`/scenes/${id}`).then((r) => r.data)
        const existing: number[] = sc.resource_ids ? JSON.parse(sc.resource_ids) : []
        if (!existing.includes(resourceId)) {
          await api.put(`/scenes/${id}`, { resource_ids: JSON.stringify([...existing, resourceId]) })
          qc.invalidateQueries({ queryKey: ['scenes', projectId] })
        }
      } else if (kind === 'asset') {
        await api.post(`/projects/${projectId}/assets/${id}/views`, {
          view_type: 'custom',
          label: t('canvas.generatedByCanvas'),
          resource_id: resourceId,
        })
        qc.invalidateQueries({ queryKey: ['assets', projectId] })
      }
    } catch {
      // ignore, user can retry
    }
    setPushDialog(null)
    setPushTarget(null)
  }

  // Add node at context menu position
  const addNode = useCallback((type: NodeType) => {
    if (!menu) return
    const position = screenToFlowPosition({ x: menu.x, y: menu.y })
    const baseData = getDefaultNodeData(type, t)
    const newNode: Node = {
      id: genId(), type, position, data: { ...baseData },
      ...(type === 'group' && { style: { width: 320, height: 240 }, zIndex: -1 }),
    }
    setNodes((prev) => [...prev, newNode])
  }, [menu, screenToFlowPosition, t])

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
      id: groupId, type: 'group',
      position: { x: minX, y: minY },
      style: { width: maxX - minX, height: maxY - minY },
      zIndex: -1,
      data: { source: 'manual', label: t('canvas.nodeLabels.group'), isGroup: true },
    }
    setNodes((prev) => [
      groupNode,
      ...prev.map((n) => {
        if (!n.selected || n.type === 'group') return n
        return { ...n, parentId: groupId, position: { x: n.position.x - minX, y: n.position.y - minY } }
      }),
    ])
  }, [nodes, t])

  const deleteSelectedNodes = useCallback(() => {
    const directSelected = new Set(nodes.filter((n) => n.selected).map((n) => n.id))
    const toDelete = new Set(directSelected)
    nodes.forEach((n) => { if (n.parentId && toDelete.has(n.parentId)) toDelete.add(n.id) })
    setNodes((prev) => prev.filter((n) => !toDelete.has(n.id)))
    setEdges((prev) => prev.filter((e) => !toDelete.has(e.source) && !toDelete.has(e.target)))
  }, [nodes])

  const onNodeDragStop = useCallback((_: React.MouseEvent, draggedNode: Node) => {
    if (draggedNode.type === 'group' || !draggedNode.parentId) return
    const parent = nodes.find((n) => n.id === draggedNode.parentId)
    if (!parent) return
    const gw = (parent.style as any)?.width ?? 320
    const gh = (parent.style as any)?.height ?? 240
    const nw = draggedNode.measured?.width ?? 208
    const nh = draggedNode.measured?.height ?? 80
    const nx = draggedNode.position.x
    const ny = draggedNode.position.y
    const cx = nx + nw / 2
    const cy = ny + nh / 2
    if (cx < 0 || cy < 0 || cx > gw || cy > gh) {
      const absX = parent.position.x + nx
      const absY = parent.position.y + ny
      setNodes((prev) => prev.map((n) => {
        if (n.id !== draggedNode.id) return n
        const { parentId: _p, ...rest } = n as any
        return { ...rest, position: { x: absX, y: absY } }
      }))
    }
  }, [nodes])

  const handleNodesChange = useCallback((changes: import('@xyflow/react').NodeChange[]) => {
    onNodesChange(changes)
    setSelectedNodeIds((prev) => {
      const next = new Set(prev)
      changes.forEach((c) => {
        if (c.type === 'select') { if (c.selected) next.add(c.id); else next.delete(c.id) }
      })
      return [...next]
    })
  }, [onNodesChange])

  // Drop entity pill onto canvas
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const resourcePayload = e.dataTransfer.getData('application/canvas-resource')
    if (resourcePayload) {
      try {
        const resource = JSON.parse(resourcePayload) as RawResource
        const type = resourceToNodeType(resource)
        const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
        const baseData = getDefaultNodeData(type, t)
        setNodes((prev) => [...prev, {
          id: genId(),
          type,
          position,
          data: {
            ...baseData,
            label: resource.name,
            source: 'upload',
            resourceId: resource.ID,
            resource,
            status: 'done',
          },
        }])
      } catch {
        // Ignore malformed drag data from outside the app.
      }
      return
    }
    const raw = e.dataTransfer.getData('application/entity-node')
    if (!raw) return
    const item: EntityDragItem = JSON.parse(raw)
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const newNode: Node = {
      id: genId(),
      type: 'text',
      position,
      data: {
        source: 'manual',
        label: `${t(KIND_CONFIG[item.kind].labelKey)}: ${item.label}`,
        textContent: `[${t(KIND_CONFIG[item.kind].labelKey)} #${item.id}] ${item.label}`,
      },
    }
    setNodes((prev) => [...prev, newNode])
  }, [screenToFlowPosition, setNodes, t])

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/entity-node') || e.dataTransfer.types.includes('application/canvas-resource')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const updateNodeData = useCallback((nodeId: string, patch: Partial<CanvasNodeData & { label: string }>) => {
    setNodes((prev) => prev.map((n) => {
      if (n.id !== nodeId) return n
      return { ...n, data: { ...n.data, ...patch } }
    }))
  }, [])

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge(params, eds))
  }, [])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'group') return
    const modes = ['compact', 'detail', 'full'] as const
    const current = (node.data as any).cardMode ?? 'detail'
    const next = modes[(modes.indexOf(current as any) + 1) % modes.length]
    updateNodeData(node.id, { cardMode: next })
  }, [updateNodeData])

  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const inputNodes = nodes.filter((n) => n.type === 'input')

  const runningCount = nodes.filter((n) => {
    const d = n.data as unknown as CanvasNodeData
    return d.status === 'running' || d.status === 'pending'
  }).length

  const canRunSingleNode = canvasType === 'inspiration'
  const nodesWithHandlers = nodes.map((n) => {
    const d = n.data as unknown as CanvasNodeData
    const hasPushableOutput = (n.type === 'image' || n.type === 'video' || n.type === 'output') &&
      d.status === 'done' && d.resourceId
    return {
      ...n,
      data: {
        ...n.data,
        onRun: canRunSingleNode ? () => runNode(n.id) : undefined,
        onUpdateContent: (content: string) => updateNodeData(n.id, { textContent: content }),
        onUpdatePrompt: (prompt: string) => updateNodeData(n.id, { prompt }),
        onUpdateOutputType: (outputType: string) => updateNodeData(n.id, { outputType } as any),
        onUpdateModelId: (modelDbId: number) => updateNodeData(n.id, { modelDbId }),
        onUpdateAttachments: (ids: number[]) => updateNodeData(n.id, { inputResourceIds: ids }),
        onApprove: () => handleApprove(n.id),
        onReject: () => handleReject(n.id),
        ...(hasPushableOutput && {
          onPush: () => setPushDialog({
            nodeId: n.id,
            resourceId: d.resourceId!,
            resourceType: d.resource?.type === 'video' || n.type === 'video' ? 'video' : 'image',
          }),
        }),
      },
    }
  })

  return (
    <div className="flex flex-col h-full">
      {/* Canvas toolbar */}
      <div className="h-10 bg-card border-b border-border shrink-0 flex items-center gap-2 px-3">
        <div className="flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs text-muted-foreground shrink-0">
          {canvasType === 'workflow' ? <Zap size={11} /> : <Lightbulb size={11} />}
          {canvasType === 'workflow' ? t('canvas.types.workflow') : t('canvas.types.inspiration')}
        </div>

        <input
          className="flex-1 text-xs bg-transparent border-none outline-none text-muted-foreground placeholder-muted-foreground min-w-0"
          value={canvasName}
          onChange={(e) => onChangeName(e.target.value)}
          placeholder={t('canvas.namePlaceholder')}
        />

        {/* Running nodes badge */}
        {runningCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
            <Loader2 size={10} className="animate-spin" />
            {t('canvas.runningCount', { count: runningCount })}
          </span>
        )}

        {/* Task list dropdown */}
        {taskList.length > 0 && (
          <div className="relative shrink-0 group">
            <button className="flex items-center gap-1 text-xs text-muted-foreground border border-border px-2 py-1 rounded hover:bg-background transition-colors">
              {t('canvas.tasksCount', { count: taskList.length })} <ChevronDown size={10} />
            </button>
            <div className="absolute right-0 top-full mt-1 w-56 bg-popover border border-border rounded-lg shadow-md z-50 hidden group-hover:block">
              <div className="p-1.5 space-y-1">
                {taskList.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 text-xs">
                    {t.status === 'running'
                      ? <Loader2 size={10} className="animate-spin text-muted-foreground shrink-0" />
                      : t.status === 'done'
                      ? <span className="text-foreground shrink-0">✓</span>
                      : <span className="text-destructive shrink-0">✗</span>
                    }
                    <span className="truncate flex-1 text-foreground">{t.name}</span>
                    <span className="text-muted-foreground shrink-0">{new Date(t.startedAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {canvasType === 'workflow' && (
          <button
            onClick={handleRunWorkflow}
            disabled={runAll.isPending}
            className="flex items-center gap-1 bg-primary text-primary-foreground rounded px-2.5 py-1 text-xs hover:bg-primary/90 disabled:opacity-50 shrink-0"
          >
            <Play size={10} /> {runAll.isPending ? t('canvas.running') : t('canvas.run')}
          </button>
        )}

        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          size="sm"
          className="shrink-0"
        >
          <Save size={10} /> {save.isPending ? '…' : t('common.save')}
        </Button>

        <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0 ml-1">
          <X size={14} />
        </button>
      </div>

      {/* Canvas area */}
      <div className="flex flex-1 overflow-hidden">
        <div
          className="flex-1 relative"
          onDrop={onDrop}
          onDragOver={onDragOver}
        >
          <ReactFlow
            nodes={nodesWithHandlers}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeDragStop={onNodeDragStop}
            onPaneClick={() => setMenu(null)}
            onPaneContextMenu={onPaneContextMenu}
            onSelectionContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }}
            onNodeContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }}
            nodeTypes={nodeTypes}
            defaultViewport={{ x: 0, y: 0, zoom: 0.9 }}
            minZoom={0.1}
            maxZoom={4}
            deleteKeyCode={null}
          >
            <Background gap={16} size={1} />
            <Controls />
          </ReactFlow>
        </div>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onAdd={addNode}
          onClose={() => setMenu(null)}
          selectedCount={selectedNodeIds.filter((id) => nodes.find((n) => n.id === id)?.type !== 'group').length}
          onGroupSelected={createGroupFromSelection}
        />
      )}

      {/* Workflow input dialog */}
      {runDialogOpen && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-xl p-5 w-96 shadow-2xl space-y-3">
            <h2 className="text-sm font-semibold text-foreground">{t('canvas.workflowInputTitle')}</h2>
            {inputNodes.map((n) => (
              <div key={n.id}>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">{(n.data as any).label || t('canvas.nodeLabels.input')}</Label>
                <Textarea
                  rows={2}
                  placeholder={t('canvas.inputContentPlaceholder')}
                  value={inputValues[n.id] ?? ''}
                  onChange={(e) => setInputValues((p) => ({ ...p, [n.id]: e.target.value }))}
                />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <Button onClick={handleConfirmRun} className="flex-1">{t('canvas.startRun')}</Button>
              <Button variant="outline" onClick={() => setRunDialogOpen(false)}>{t('common.cancel')}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Push to entity dialog */}
      {pushDialog && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-xl p-5 w-80 shadow-2xl space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t('canvas.pushToEntity')}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t('canvas.pushHint', { type: pushDialog.resourceType === 'video' ? t('canvas.mediaTypes.video') : t('canvas.mediaTypes.image') })}</p>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {pushTargets.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">{t('canvas.noPushTargets')}</p>
              )}
              {pushTargets.map((target) => (
                <button
                  key={`${target.kind}-${target.id}`}
                  onClick={() => setPushTarget(target)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded text-xs border transition-colors',
                    pushTarget?.kind === target.kind && pushTarget?.id === target.id
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-foreground hover:border-border/80'
                  )}
                >
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                    {target.kind === 'asset' ? t('entities.assets') : target.kind === 'storyboard' ? t('entities.storyboards') : t('entities.scenes')}
                  </span>
                  <span className="truncate">{target.label}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={handlePushConfirm} disabled={!pushTarget} className="flex-1">{t('canvas.push')}</Button>
              <Button variant="outline" onClick={() => { setPushDialog(null); setPushTarget(null) }}>{t('common.cancel')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CanvasListItem({
  canvas,
  active,
  onSelect,
}: {
  canvas: Canvas
  active: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: runs = [] } = useQuery<CanvasRun[]>({
    queryKey: ['canvas-runs', canvas.ID],
    queryFn: () => api.get(`/canvases/${canvas.ID}/runs`).then((r) => r.data),
    enabled: canvas.canvas_type === 'workflow',
    refetchInterval: canvas.canvas_type === 'workflow' ? 2500 : false,
  })
  const latestRun = runs[0]
  const isRunning = latestRun?.status === 'running' || latestRun?.status === 'pending'
  const run = useMutation({
    mutationFn: () => api.post(`/canvases/${canvas.ID}/run`, { input_values: {} }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canvas-runs', canvas.ID] }),
  })

  const statusIcon = latestRun?.status === 'done'
    ? <CheckCircle2 size={10} className="text-emerald-500" />
    : latestRun?.status === 'failed'
    ? <XCircle size={10} className="text-destructive" />
    : isRunning
    ? <Loader2 size={10} className="animate-spin text-amber-500" />
    : null
  const statusText = latestRun?.status === 'done' ? t('canvas.status.done')
    : latestRun?.status === 'failed' ? t('canvas.status.failed')
    : isRunning ? t('canvas.status.running')
    : canvas.canvas_type === 'workflow' ? t('canvas.status.notRun') : t('canvas.types.inspiration')

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left px-2.5 py-2 border-b border-border/50 transition-colors',
        active
          ? 'bg-background border-l-2 border-l-primary'
          : 'hover:bg-background/60'
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground truncate">{canvas.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            {statusIcon}
            <span>{statusText}</span>
          </p>
        </div>
        {canvas.canvas_type === 'workflow' && (
          <span
            role="button"
            title={t('canvas.runCanvas')}
            onClick={(e) => {
              e.stopPropagation()
              if (!isRunning && !run.isPending) run.mutate()
            }}
            className={cn(
              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border text-muted-foreground transition-colors',
              isRunning || run.isPending ? 'opacity-50' : 'hover:bg-muted hover:text-foreground'
            )}
          >
            {run.isPending ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
          </span>
        )}
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {canvas.canvas_type === 'workflow' ? t('canvas.types.workflow') : t('canvas.types.inspiration')}
      </p>
    </button>
  )
}

export function EmbeddedCanvas({ pushTargets, onClose }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)

  const [activeCanvasId, setActiveCanvasId] = useState<number | null>(null)
  const [canvasName, setCanvasName] = useState(t('work.creationCanvas'))
  const [canvasType, setCanvasType] = useState<CanvasType>('inspiration')

  const { data: canvases = [], isLoading: loadingList } = useQuery<Canvas[]>({
    queryKey: ['canvases-project', projectId],
    queryFn: () => api.get(`/canvases?project_id=${projectId}`).then((r) => r.data),
    enabled: !!projectId,
  })

  // Auto-select first canvas when list loads
  useEffect(() => {
    if (activeCanvasId === null && canvases.length > 0) {
      const first = canvases[0]
      setActiveCanvasId(first.ID)
      setCanvasName(first.name)
      setCanvasType(first.canvas_type ?? 'inspiration')
    }
  }, [canvases, activeCanvasId])

  const createCanvas = useMutation({
    mutationFn: () =>
      api.post('/canvases', { name: t('canvas.newCanvasDefaultName'), canvas_type: 'workflow', project_id: projectId }).then((r) => r.data),
    onSuccess: (data: Canvas) => {
      qc.invalidateQueries({ queryKey: ['canvases-project', projectId] })
      setActiveCanvasId(data.ID)
      setCanvasName(data.name)
      setCanvasType(data.canvas_type ?? 'inspiration')
    },
  })

  function selectCanvas(c: Canvas) {
    setActiveCanvasId(c.ID)
    setCanvasName(c.name)
    setCanvasType(c.canvas_type ?? 'inspiration')
  }

  return (
    <div className="flex h-full">
      {/* Canvas list sidebar */}
      <div className="w-40 shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-border shrink-0">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Layers size={11} /> {t('canvas.canvasList')}
          </span>
          <button
            onClick={() => createCanvas.mutate()}
            disabled={createCanvas.isPending}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title={t('canvas.newCanvas')}
          >
            <Plus size={13} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <p className="text-xs text-muted-foreground p-2 text-center">{t('common.loadingShort')}</p>
          ) : canvases.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 p-3 text-center">
              <p className="text-xs text-muted-foreground">{t('canvas.empty')}</p>
              <button
                onClick={() => createCanvas.mutate()}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                {t('pages.canvases.createFirst')}
              </button>
            </div>
          ) : (
            canvases.map((c) => (
              <CanvasListItem
                key={c.ID}
                canvas={c}
                active={activeCanvasId === c.ID}
                onSelect={() => selectCanvas(c)}
              />
            ))
          )}
        </div>
      </div>

      {/* Canvas editor */}
      <div className="flex-1 overflow-hidden relative">
        {activeCanvasId !== null ? (
          <ReactFlowProvider>
            <EmbeddedCanvasInner
              canvasId={activeCanvasId}
              canvasName={canvasName}
              canvasType={canvasType}
              onChangeName={setCanvasName}
              pushTargets={pushTargets}
              onClose={onClose}
            />
          </ReactFlowProvider>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Layers size={28} className="opacity-30" />
            <p className="text-sm">{t('canvas.selectOrCreate')}</p>
            <button
              onClick={() => createCanvas.mutate()}
              disabled={createCanvas.isPending}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-40"
            >
              {t('canvas.newCanvas')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
