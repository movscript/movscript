import { useCallback, useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GanttChartSquare,
  GripHorizontal,
  Loader2,
  MoreHorizontal,
  Network,
  Plus,
  Trash2,
  TreePine,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import type { Pipeline, PipelineEdge, PipelineNode } from '@/types'
import {
  NODE_TYPE_META,
  getPipelineNodeMeta,
  isPipelineArtifactNode,
  isPipelineWorkNode,
} from './components/PipelineNodeComponent'
import { NODE_TYPE_OPTIONS, WORK_NODE_TYPES, defaultContentType } from './nodeSpec'
import { NodeDetailPanel } from './components/NodeDetailPanel'
import { GanttChart } from './components/GanttChart'
import { DeleteNodeDialog } from './components/DeleteNodeDialog'
import { StageWorkspaceContent } from './StageWorkspacePage'
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui'

interface TreeItem {
  node: PipelineNode
  children: TreeItem[]
}

interface AddNodeState {
  parentId: number | null
}

interface WorkColumn {
  node: PipelineNode
  artifacts: TreeItem[]
}

interface PipelineLayout {
  workColumns: WorkColumn[]
  looseArtifacts: TreeItem[]
}

interface DependencyGraphItem {
  node: PipelineNode
  x: number
  y: number
}

interface DependencyGraphLayout {
  items: DependencyGraphItem[]
  itemById: Map<number, DependencyGraphItem>
  edges: PipelineEdge[]
  width: number
  height: number
}

const FIXED_WORK_OUTPUT_TYPES: Record<string, string> = {
  script_writing: 'main_script',
  episode_writing: 'episode_script',
  scene_writing: 'scene_script',
  asset_creation: 'asset',
}

const INLINE_WORKSPACE_DEFAULT_HEIGHT = 480

const NODE_STATUS_META: Record<string, { dot: string; badge: string; label: string }> = {
  draft:        { dot: 'bg-muted-foreground/40', badge: 'bg-muted text-muted-foreground', label: 'Draft' },
  under_review: { dot: 'bg-amber-500',           badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400', label: 'In Review' },
  rejected:     { dot: 'bg-destructive',         badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400', label: 'Rejected' },
  final:        { dot: 'bg-green-500',           badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400', label: 'Final' },
}

function defaultArtifactTypeForWork(type: string) {
  if (FIXED_WORK_OUTPUT_TYPES[type]) return FIXED_WORK_OUTPUT_TYPES[type]
  if (type === 'episode_writing') return 'episode_script'
  if (type === 'scene_writing') return 'scene_script'
  if (type === 'storyboard_creation') return 'storyboard'
  if (type === 'asset_creation') return 'asset'
  if (type === 'shot_production') return 'shot'
  if (type === 'episode_edit') return 'episode'
  return 'main_script'
}

function defaultTypeForParent(parent: PipelineNode | null) {
  if (!parent) return 'script_writing'
  if (isPipelineWorkNode(parent.type)) return defaultArtifactTypeForWork(parent.type)
  if (isPipelineArtifactNode(parent.type)) return parent.type
  return 'custom'
}

function sortWorkNodes(nodes: PipelineNode[], _edges: PipelineEdge[]) {
  return nodes.filter((node) => isPipelineWorkNode(node.type)).sort((a, b) => {
    const ax = Number.isFinite(a.pos_x) ? a.pos_x : 0
    const bx = Number.isFinite(b.pos_x) ? b.pos_x : 0
    if (ax !== bx) return ax - bx
    return a.ID - b.ID
  })
}

function buildArtifactTree(
  node: PipelineNode,
  childrenByParent: Map<number, PipelineNode[]>,
  path = new Set<number>(),
): TreeItem {
  if (path.has(node.ID)) return { node, children: [] }
  const nextPath = new Set(path)
  nextPath.add(node.ID)
  return {
    node,
    children: (childrenByParent.get(node.ID) ?? [])
      .sort((a, b) => a.ID - b.ID)
      .map((child) => buildArtifactTree(child, childrenByParent, nextPath)),
  }
}

function buildPipelineLayout(nodes: PipelineNode[], edges: PipelineEdge[]): PipelineLayout {
  const nodeMap = new Map(nodes.map((node) => [node.ID, node]))
  const workNodes = sortWorkNodes(nodes, edges)
  const workOrder = new Map(workNodes.map((node, index) => [node.ID, index]))
  const artifacts = nodes.filter((node) => !isPipelineWorkNode(node.type)).sort((a, b) => a.ID - b.ID)
  const artifactIds = new Set(artifacts.map((node) => node.ID))
  const artifactParentByChild = new Map<number, number>()
  const artifactChildrenByParent = new Map<number, PipelineNode[]>()
  const workParentsByArtifact = new Map<number, number[]>()

  for (const edge of [...edges].sort((a, b) => a.ID - b.ID)) {
    if (!nodeMap.has(edge.from_node_id) || !nodeMap.has(edge.to_node_id)) continue
    const from = nodeMap.get(edge.from_node_id)!
    const to = nodeMap.get(edge.to_node_id)!

    if (isPipelineWorkNode(from.type) && artifactIds.has(to.ID)) {
      workParentsByArtifact.set(to.ID, [...(workParentsByArtifact.get(to.ID) ?? []), from.ID])
    }

    if (artifactIds.has(from.ID) && artifactIds.has(to.ID) && !artifactParentByChild.has(to.ID)) {
      artifactParentByChild.set(to.ID, from.ID)
      artifactChildrenByParent.set(from.ID, [...(artifactChildrenByParent.get(from.ID) ?? []), to])
    }
  }

  const rootsByWork = new Map<number, PipelineNode[]>()
  const looseRoots: PipelineNode[] = []

  for (const artifact of artifacts) {
    if (artifactParentByChild.has(artifact.ID)) continue
    const workParents = [...(workParentsByArtifact.get(artifact.ID) ?? [])]
      .filter((id) => workOrder.has(id))
      .sort((a, b) => (workOrder.get(a) ?? 0) - (workOrder.get(b) ?? 0))

    const workParentId = workParents[0]
    if (workParentId) {
      rootsByWork.set(workParentId, [...(rootsByWork.get(workParentId) ?? []), artifact])
    } else {
      looseRoots.push(artifact)
    }
  }

  return {
    workColumns: workNodes.map((node) => ({
      node,
      artifacts: (rootsByWork.get(node.ID) ?? [])
        .sort((a, b) => a.ID - b.ID)
        .map((artifact) => buildArtifactTree(artifact, artifactChildrenByParent)),
    })),
    looseArtifacts: looseRoots.map((artifact) => buildArtifactTree(artifact, artifactChildrenByParent)),
  }
}

function blockedArtifactNames(node: PipelineNode, pipeline?: Pipeline) {
  if (!pipeline || !isPipelineWorkNode(node.type)) return []
  const adjacentIds = new Set<number>()
  for (const edge of pipeline.edges) {
    if (edge.from_node_id === node.ID) adjacentIds.add(edge.to_node_id)
    if (edge.to_node_id === node.ID) adjacentIds.add(edge.from_node_id)
  }
  return pipeline.nodes
    .filter((candidate) => adjacentIds.has(candidate.ID) && isPipelineArtifactNode(candidate.type) && candidate.status !== 'final')
    .map((candidate) => candidate.name)
}

function countTreeItems(item: TreeItem): number {
  return 1 + item.children.reduce((total, child) => total + countTreeItems(child), 0)
}

function treeHasNodeId(items: TreeItem[], nodeId?: number): boolean {
  if (!nodeId) return false
  return items.some((item) => item.node.ID === nodeId || treeHasNodeId(item.children, nodeId))
}

function buildDependencyGraphLayout(nodes: PipelineNode[], edges: PipelineEdge[]): DependencyGraphLayout {
  const nodeMap = new Map(nodes.map((node) => [node.ID, node]))
  const validEdges = edges.filter((edge) => nodeMap.has(edge.from_node_id) && nodeMap.has(edge.to_node_id))
  const incomingCount = new Map(nodes.map((node) => [node.ID, 0]))
  const outgoing = new Map<number, PipelineEdge[]>()

  for (const edge of validEdges) {
    incomingCount.set(edge.to_node_id, (incomingCount.get(edge.to_node_id) ?? 0) + 1)
    outgoing.set(edge.from_node_id, [...(outgoing.get(edge.from_node_id) ?? []), edge])
  }

  const sortNodes = (a: PipelineNode, b: PipelineNode) => {
    const aw = isPipelineWorkNode(a.type) ? 0 : 1
    const bw = isPipelineWorkNode(b.type) ? 0 : 1
    if (aw !== bw) return aw - bw
    const ax = Number.isFinite(a.pos_x) ? a.pos_x : 0
    const bx = Number.isFinite(b.pos_x) ? b.pos_x : 0
    if (ax !== bx) return ax - bx
    return a.ID - b.ID
  }

  const queue = nodes.filter((node) => (incomingCount.get(node.ID) ?? 0) === 0).sort(sortNodes)
  const levelById = new Map<number, number>()
  for (const root of queue) levelById.set(root.ID, 0)

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    const currentLevel = levelById.get(current.ID) ?? 0
    for (const edge of outgoing.get(current.ID) ?? []) {
      const next = nodeMap.get(edge.to_node_id)
      if (!next) continue
      levelById.set(next.ID, Math.max(levelById.get(next.ID) ?? 0, currentLevel + 1))
      incomingCount.set(next.ID, Math.max(0, (incomingCount.get(next.ID) ?? 0) - 1))
      if ((incomingCount.get(next.ID) ?? 0) === 0) queue.push(next)
    }
  }

  for (const node of nodes) {
    if (!levelById.has(node.ID)) levelById.set(node.ID, 0)
  }

  const levels = new Map<number, PipelineNode[]>()
  for (const node of nodes) {
    const level = levelById.get(node.ID) ?? 0
    levels.set(level, [...(levels.get(level) ?? []), node])
  }

  const cardWidth = 132
  const cardHeight = 36
  const gapX = 56
  const gapY = 12
  const padding = 28
  const expandedOverflowX = 52
  const expandedOverflowY = 20
  const items: DependencyGraphItem[] = []

  for (const [level, levelNodes] of [...levels.entries()].sort((a, b) => a[0] - b[0])) {
    levelNodes.sort(sortNodes).forEach((node, row) => {
      items.push({
        node,
        x: padding + level * (cardWidth + gapX),
        y: padding + row * (cardHeight + gapY),
      })
    })
  }

  const maxLevel = Math.max(0, ...items.map((item) => Math.floor((item.x - padding) / (cardWidth + gapX))))
  const maxRows = Math.max(1, ...[...levels.values()].map((levelNodes) => levelNodes.length))
  const width = padding * 2 + (maxLevel + 1) * cardWidth + maxLevel * gapX + expandedOverflowX
  const height = padding * 2 + maxRows * cardHeight + Math.max(0, maxRows - 1) * gapY + expandedOverflowY
  const itemById = new Map(items.map((item) => [item.node.ID, item]))

  return { items, itemById, edges: validEdges, width, height }
}

export default function PipelineEditorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const project = useProjectStore((s) => s.current)

  const [activeTab, setActiveTab] = useState<'tasks' | 'dependencies' | 'schedule'>('tasks')
  const [selectedNode, setSelectedNode] = useState<PipelineNode | null>(null)
  const [workspaceNode, setWorkspaceNode] = useState<PipelineNode | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [addNodeState, setAddNodeState] = useState<AddNodeState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PipelineNode | null>(null)
  const [workspaceHeight, setWorkspaceHeight] = useState(INLINE_WORKSPACE_DEFAULT_HEIGHT)
  const [isWorkspaceResizing, setIsWorkspaceResizing] = useState(false)
  const [draggedNodeId, setDraggedNodeId] = useState<number | null>(null)
  const [dropTargetNodeId, setDropTargetNodeId] = useState<number | null>(null)

  const { data: pipeline, isLoading } = useQuery<Pipeline>({
    queryKey: ['pipeline', project?.ID],
    queryFn: () => api.get(`/projects/${project!.ID}/pipeline`).then((r) => r.data),
    enabled: !!project,
  })

  const layout = useMemo(() => buildPipelineLayout(pipeline?.nodes ?? [], pipeline?.edges ?? []), [pipeline])

  useEffect(() => {
    if (!pipeline) return
    setExpandedIds((prev) => {
      const next = new Set(prev)
      for (const node of pipeline.nodes) next.add(node.ID)
      return next
    })
  }, [pipeline])

  useEffect(() => {
    if (!selectedNode || !pipeline) return
    const fresh = pipeline.nodes.find((node) => node.ID === selectedNode.ID)
    if (fresh) setSelectedNode(fresh)
  }, [pipeline, selectedNode?.ID])

  useEffect(() => {
    if (!workspaceNode || !pipeline) return
    const fresh = pipeline.nodes.find((node) => node.ID === workspaceNode.ID)
    if (fresh) setWorkspaceNode(fresh)
    else setWorkspaceNode(null)
  }, [pipeline, workspaceNode?.ID])

  const createNode = useMutation({
    mutationFn: async ({ parentId, body }: { parentId: number | null; body: Partial<PipelineNode> }) => {
      return api.post(`/projects/${project!.ID}/pipeline/nodes`, {
        ...body,
        parent_id: parentId ?? undefined,
      }).then((r) => r.data as PipelineNode)
    },
    onSuccess: (node, variables) => {
      qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
      if (variables.parentId) {
        setExpandedIds((prev) => new Set(prev).add(variables.parentId!))
      }
      setSelectedNode(node)
      if (!isPipelineWorkNode(node.type) && node.content_type !== 'custom') setWorkspaceNode(node)
      setAddNodeState(null)
    },
  })

  const reparentNode = useMutation({
    mutationFn: ({ parentId, childId }: { parentId: number; childId: number }) =>
      api.post(`/projects/${project!.ID}/pipeline/edges`, {
        from_node_id: parentId,
        to_node_id: childId,
      }).then((r) => r.data as PipelineEdge),
    onSuccess: (_edge, variables) => {
      qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
      setExpandedIds((prev) => new Set(prev).add(variables.parentId))
      setDraggedNodeId(null)
      setDropTargetNodeId(null)
    },
    onError: () => {
      setDraggedNodeId(null)
      setDropTargetNodeId(null)
    },
  })

  const deleteNode = useMutation({
    mutationFn: (nodeId: number) => api.delete(`/pipeline/nodes/${nodeId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
      if (pendingDelete?.ID === selectedNode?.ID) setSelectedNode(null)
      if (pendingDelete?.ID === workspaceNode?.ID) setWorkspaceNode(null)
      setPendingDelete(null)
    },
  })

  const reorderWorkNodes = useMutation({
    mutationFn: (orderedIds: number[]) =>
      Promise.all(
        orderedIds.map((id, index) =>
          api.put(`/pipeline/nodes/${id}`, { pos_x: (index + 1) * 1000 }),
        ),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
    },
  })

  if (!project) return null

  function moveWorkNode(index: number, direction: -1 | 1) {
    const ordered = layout.workColumns.map((column) => column.node.ID)
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= ordered.length) return
    const next = [...ordered]
    const currentId = next[index]
    next[index] = next[nextIndex]
    next[nextIndex] = currentId
    reorderWorkNodes.mutate(next)
  }

  function toggleNode(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openWorkspace(node: PipelineNode) {
    setSelectedNode(node)
    setWorkspaceNode(node)
  }

  function canDropOnNode(target: PipelineNode, draggedId: number | null) {
    if (!draggedId || target.ID === draggedId || !isPipelineWorkNode(target.type)) return false
    const dragged = pipeline?.nodes.find((node) => node.ID === draggedId)
    if (!dragged || isPipelineWorkNode(dragged.type)) return false
    return !pipeline?.edges.some((edge) => edge.from_node_id === target.ID && edge.to_node_id === draggedId)
  }

  function handleNodeDrop(target: PipelineNode) {
    if (!canDropOnNode(target, draggedNodeId) || !draggedNodeId) {
      setDraggedNodeId(null)
      setDropTargetNodeId(null)
      return
    }
    reparentNode.mutate({ parentId: target.ID, childId: draggedNodeId })
  }

  const onWorkspaceResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsWorkspaceResizing(true)
    const startY = e.clientY
    const startHeight = workspaceHeight

    function onMouseMove(ev: MouseEvent) {
      const maxHeight = Math.max(320, window.innerHeight - 180)
      setWorkspaceHeight(Math.max(280, Math.min(maxHeight, startHeight + startY - ev.clientY)))
    }

    function onMouseUp() {
      setIsWorkspaceResizing(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [workspaceHeight])

  function renderArtifactTree(items: TreeItem[], depth = 0): React.ReactNode {
    return items.map((item) => {
      const expanded = expandedIds.has(item.node.ID)
      return (
        <div key={item.node.ID} className="relative">
          {depth > 0 ? <div className="absolute left-3 top-0 h-full border-l border-border" /> : null}
          <PipelineFlowCard
            node={item.node}
            depth={depth}
            selected={selectedNode?.ID === item.node.ID}
            workspaceActive={workspaceNode?.ID === item.node.ID}
            expanded={expanded}
            childCount={item.children.length}
            blockedArtifactNames={blockedArtifactNames(item.node, pipeline)}
            onSelect={() => openWorkspace(item.node)}
            onToggle={() => toggleNode(item.node.ID)}
            onEnterWorkspace={() => openWorkspace(item.node)}
            onAddChild={() => {}}
            canAddChild={false}
            onDelete={() => setPendingDelete(item.node)}
            draggable={!isPipelineWorkNode(item.node.type)}
            onDragStart={() => setDraggedNodeId(item.node.ID)}
            onDragEnd={() => { setDraggedNodeId(null); setDropTargetNodeId(null) }}
          />
          {expanded && item.children.length > 0 ? renderArtifactTree(item.children, depth + 1) : null}
        </div>
      )
    })
  }

  function renderUnassignedShelf() {
    if (layout.looseArtifacts.length === 0) return null

    return (
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex min-w-max items-center gap-3">
          <div className="w-36 shrink-0">
            <p className="text-xs font-semibold text-foreground">
              {t('pipeline.tree.unassignedArtifacts', { defaultValue: '未挂载产物' })}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t('pipeline.tree.dragToRootHint', { defaultValue: '拖到根节点挂载' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {layout.looseArtifacts.map((item) => (
              <UnassignedArtifactCard
                key={item.node.ID}
                item={item}
                selected={selectedNode?.ID === item.node.ID}
                workspaceActive={workspaceNode?.ID === item.node.ID}
                onSelect={() => openWorkspace(item.node)}
                onDragStart={() => setDraggedNodeId(item.node.ID)}
                onDragEnd={() => { setDraggedNodeId(null); setDropTargetNodeId(null) }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <div className="flex items-center px-4 py-2.5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3 w-64 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(-1)}>
            <ArrowLeft size={15} />
          </Button>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{project.name}</p>
            <p className="text-xs text-muted-foreground">{t('pipeline.editor.subtitle')}</p>
          </div>
        </div>

        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
            <TabBtn active={activeTab === 'tasks'} icon={<TreePine size={13} />} label={t('pipeline.editor.taskLayer', { defaultValue: '任务层' })} onClick={() => setActiveTab('tasks')} />
            <TabBtn active={activeTab === 'dependencies'} icon={<Network size={13} />} label={t('pipeline.editor.dependencyLayer', { defaultValue: '依赖层' })} onClick={() => setActiveTab('dependencies')} />
            <TabBtn active={activeTab === 'schedule'} icon={<GanttChartSquare size={13} />} label={t('pipeline.editor.scheduleLayer', { defaultValue: '排期层' })} onClick={() => setActiveTab('schedule')} />
          </div>
        </div>

        <div className="flex items-center gap-2 w-64 shrink-0 justify-end">
          <Button size="sm" className="h-8 text-xs" onClick={() => setAddNodeState({ parentId: null })}>
            <Plus size={13} className="mr-1.5" />
            {t('pipeline.tree.addRoot')}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 overflow-hidden">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : activeTab === 'tasks' ? (
            <div className="h-full flex flex-col overflow-hidden bg-background">
              <div className="flex-[1_1_0] min-h-[320px] overflow-auto">
                {layout.workColumns.length > 0 || layout.looseArtifacts.length > 0 ? (
                  <div className="min-w-max">
                    {renderUnassignedShelf()}
                    <div className="flex min-w-max items-start gap-3 p-4">
                      {layout.workColumns.map((column, index) => {
                        const columnExpanded =
                          selectedNode?.ID === column.node.ID ||
                          workspaceNode?.ID === column.node.ID ||
                          treeHasNodeId(column.artifacts, selectedNode?.ID) ||
                          treeHasNodeId(column.artifacts, workspaceNode?.ID)

                        return (
                          <div key={column.node.ID} className={cn('shrink-0 transition-[width]', columnExpanded ? 'w-60' : 'w-44')}>
                          <div className="relative">
                            {index < layout.workColumns.length - 1 ? (
                              <div className="absolute left-[calc(100%+12px)] top-5 h-px w-3 bg-border" />
                            ) : null}
                            <PipelineFlowCard
                              node={column.node}
                              depth={0}
                              selected={selectedNode?.ID === column.node.ID}
                              workspaceActive={workspaceNode?.ID === column.node.ID}
                              expanded={expandedIds.has(column.node.ID)}
                              childCount={column.artifacts.length}
                              blockedArtifactNames={blockedArtifactNames(column.node, pipeline)}
                              onSelect={() => setSelectedNode(column.node)}
                              onToggle={() => toggleNode(column.node.ID)}
                              onEnterWorkspace={() => openWorkspace(column.node)}
                              onAddChild={() => setAddNodeState({ parentId: column.node.ID })}
                              canAddChild
                              onDelete={() => setPendingDelete(column.node)}
                              onMoveBefore={index > 0 ? () => moveWorkNode(index, -1) : undefined}
                              onMoveAfter={index < layout.workColumns.length - 1 ? () => moveWorkNode(index, 1) : undefined}
                              isDropTarget={dropTargetNodeId === column.node.ID}
                              onDragOver={(e) => {
                                if (!canDropOnNode(column.node, draggedNodeId)) return
                                e.preventDefault()
                                e.dataTransfer.dropEffect = 'move'
                                setDropTargetNodeId(column.node.ID)
                              }}
                              onDragLeave={() => setDropTargetNodeId((current) => current === column.node.ID ? null : current)}
                              onDrop={(e) => {
                                e.preventDefault()
                                handleNodeDrop(column.node)
                              }}
                              variant="work"
                            />
                          </div>

                          {expandedIds.has(column.node.ID) ? (
                            <div className="mt-2 space-y-1.5 border-l border-border pl-2.5">
                              {column.artifacts.length > 0 ? renderArtifactTree(column.artifacts) : (
                                <button
                                  type="button"
                                  className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
                                  onClick={() => setAddNodeState({ parentId: column.node.ID })}
                                >
                                  <Plus size={13} />
                                  {t('pipeline.tree.addChild')}
                                </button>
                              )}
                            </div>
                          ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-[320px] flex-col items-center justify-center gap-3 text-center">
                    <TreePine size={28} className="text-muted-foreground/60" />
                    <p className="text-sm text-muted-foreground">{t('pipeline.editor.empty')}</p>
                    <Button size="sm" onClick={() => setAddNodeState({ parentId: null })}>
                      <Plus size={13} className="mr-1.5" />
                      {t('pipeline.tree.addRoot')}
                    </Button>
                  </div>
                )}
              </div>

              <div
                className={cn(
                  'flex h-2 shrink-0 cursor-ns-resize items-center justify-center border-y border-border bg-background hover:bg-muted',
                  isWorkspaceResizing && 'bg-muted',
                )}
                onMouseDown={onWorkspaceResizeMouseDown}
                title={t('pipeline.workspace.resizeHandle', { defaultValue: '拖动调整工作区高度' })}
              >
                <GripHorizontal size={14} className="text-muted-foreground/70" />
              </div>

              <div
                className="shrink-0 border-t border-border bg-card/30"
                style={{ height: workspaceHeight }}
              >
                {workspaceNode ? (
                  <StageWorkspaceContent
                    key={workspaceNode.ID}
                    nodeId={workspaceNode.ID}
                    embedded
                    onBack={() => setWorkspaceNode(null)}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    {t('pipeline.workspace.inlineEmpty', { defaultValue: '选择一个节点后，工作区会在这里展示。' })}
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'dependencies' ? (
            <DependencyGraph
              nodes={pipeline?.nodes ?? []}
              edges={pipeline?.edges ?? []}
              selectedNodeId={selectedNode?.ID}
              onNodeClick={setSelectedNode}
            />
          ) : (
            <GanttChart
              nodes={pipeline?.nodes ?? []}
              edges={pipeline?.edges ?? []}
              onNodeClick={setSelectedNode}
            />
          )}
        </div>

        {selectedNode ? (
          <NodeDetailPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onNodeUpdated={(updated) => setSelectedNode(updated)}
            onOpenWorkspace={openWorkspace}
          />
        ) : null}
      </div>

      <AddNodeDialog
        open={!!addNodeState}
        parent={pipeline?.nodes.find((node) => node.ID === addNodeState?.parentId) ?? null}
        onCancel={() => setAddNodeState(null)}
        onCreate={(body) => createNode.mutate({ parentId: addNodeState?.parentId ?? null, body })}
        isPending={createNode.isPending}
      />

      <DeleteNodeDialog
        open={!!pendingDelete}
        nodeNames={pendingDelete ? [pendingDelete.name] : []}
        onConfirm={() => pendingDelete && deleteNode.mutate(pendingDelete.ID)}
        onCancel={() => setPendingDelete(null)}
        isPending={deleteNode.isPending}
      />
    </div>
  )
}

function AddNodeDialog({
  open,
  parent,
  onCancel,
  onCreate,
  isPending,
}: {
  open: boolean
  parent: PipelineNode | null
  onCancel: () => void
  onCreate: (body: Partial<PipelineNode>) => void
  isPending?: boolean
}) {
  const { t } = useTranslation()
  const [type, setType] = useState<string>('script_writing')
  const [name, setName] = useState('')
  const fixedChildType = parent ? FIXED_WORK_OUTPUT_TYPES[parent.type] : undefined
  const selectableTypes = parent ? NODE_TYPE_OPTIONS : WORK_NODE_TYPES

  useEffect(() => {
    if (!open) return
    const nextType = fixedChildType ?? defaultTypeForParent(parent)
    setType(nextType)
    setName('')
  }, [open, parent?.ID, parent?.type, fixedChildType])

  function handleTypeChange(nextType: string) {
    if (fixedChildType) return
    setType(nextType)
    if (!name.trim()) {
      const meta = getPipelineNodeMeta(nextType)
      setName(t(`pipeline.nodeTypes.${nextType}.label`, { defaultValue: meta.label }))
    }
  }

  function submit() {
    const finalName = name.trim() || t(`pipeline.nodeTypes.${type}.label`, { defaultValue: getPipelineNodeMeta(type).label })
    onCreate({ type, name: finalName, content_type: defaultContentType(type), pos_x: 0, pos_y: 0 })
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onCancel() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{parent ? t('pipeline.tree.addChildTo', { name: parent.name }) : t('pipeline.tree.addRoot')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('pipeline.detail.nodeName')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('pipeline.contextMenu.addNode')} />
          </div>

          {fixedChildType ? (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
              <Label className="text-xs text-muted-foreground">{t('pipeline.tree.nodeType')}</Label>
              <p className="mt-1 text-sm font-medium text-foreground">
                {t(`pipeline.nodeTypes.${type}.label`, { defaultValue: getPipelineNodeMeta(type).label })}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('pipeline.tree.nodeType')}</Label>
              <Select value={type} onValueChange={handleTypeChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectableTypes.map((option) => {
                    const meta = NODE_TYPE_META[option]
                    if (!meta) return null
                    return (
                      <SelectItem key={option} value={option}>
                        {t(`pipeline.nodeTypes.${option}.label`, { defaultValue: meta.label })}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={submit} disabled={isPending}>
            {isPending ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Plus size={13} className="mr-1.5" />}
            {t('pipeline.contextMenu.addNode')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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

function DependencyGraph({
  nodes,
  edges,
  selectedNodeId,
  onNodeClick,
}: {
  nodes: PipelineNode[]
  edges: PipelineEdge[]
  selectedNodeId?: number
  onNodeClick: (node: PipelineNode) => void
}) {
  const { t } = useTranslation()
  const layout = useMemo(() => buildDependencyGraphLayout(nodes, edges), [nodes, edges])
  const compactCardWidth = 132
  const compactCardHeight = 36
  const expandedCardWidth = 184
  const expandedCardHeight = 56

  if (nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background text-center">
        <Network size={28} className="text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">{t('pipeline.dependency.empty', { defaultValue: '暂无依赖关系' })}</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-background p-4">
      <div
        className="relative min-h-full min-w-full"
        style={{ width: layout.width, height: layout.height }}
      >
        <svg
          className="absolute inset-0 pointer-events-none"
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
        >
          <defs>
            <marker id="pipeline-dependency-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-border" />
            </marker>
          </defs>
          {layout.edges.map((edge) => {
            const from = layout.itemById.get(edge.from_node_id)
            const to = layout.itemById.get(edge.to_node_id)
            if (!from || !to) return null
            const startX = from.x + compactCardWidth
            const startY = from.y + compactCardHeight / 2
            const endX = to.x
            const endY = to.y + compactCardHeight / 2
            const bend = Math.max(40, (endX - startX) / 2)
            return (
              <path
                key={edge.ID}
                d={`M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`}
                className="fill-none stroke-border"
                strokeWidth="1.5"
                markerEnd="url(#pipeline-dependency-arrow)"
              />
            )
          })}
        </svg>

        {layout.items.map((item) => {
          const node = item.node
          const meta = getPipelineNodeMeta(node.type)
          const status = NODE_STATUS_META[node.status] ?? NODE_STATUS_META.draft
          const Icon = meta.icon
          const typeLabel = t(`pipeline.nodeTypes.${node.type}.label`, { defaultValue: meta.label })
          const categoryLabel = t(`pipeline.categories.${meta.category}`, { defaultValue: meta.category })
          const isWork = isPipelineWorkNode(node.type)
          const isExpanded = selectedNodeId === node.ID

          return (
            <button
              key={node.ID}
              type="button"
              className={cn(
                'absolute rounded-md border bg-card text-left shadow-sm transition-[border-color,background-color,box-shadow,width,height,padding] hover:border-primary/40',
                isExpanded ? 'z-10 border-primary/60 bg-primary/5 p-2' : 'border-border px-2 py-1.5',
              )}
              style={{
                left: item.x,
                top: item.y,
                width: isExpanded ? expandedCardWidth : compactCardWidth,
                height: isExpanded ? expandedCardHeight : compactCardHeight,
              }}
              onClick={() => onNodeClick(node)}
            >
              <div className="flex h-full min-w-0 items-center gap-1.5">
                <div className={cn(
                  `flex shrink-0 items-center justify-center rounded-md ${meta.accent}`,
                  isExpanded ? 'h-7 w-7' : 'h-6 w-6',
                )}>
                  <Icon size={isExpanded ? 14 : 12} className={meta.iconColor} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
                    <p className="truncate text-xs font-semibold text-foreground">{node.name}</p>
                    {isExpanded ? (
                      <span className={cn(
                        'shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase leading-none',
                        isWork ? 'bg-primary/10 text-primary' : 'border border-border bg-muted text-muted-foreground',
                      )}>
                        {categoryLabel}
                      </span>
                    ) : null}
                  </div>
                  {isExpanded ? <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{typeLabel}</p> : null}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function UnassignedArtifactCard({
  item,
  selected,
  workspaceActive,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  item: TreeItem
  selected?: boolean
  workspaceActive?: boolean
  onSelect: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const { t } = useTranslation()
  const meta = getPipelineNodeMeta(item.node.type)
  const status = NODE_STATUS_META[item.node.status] ?? NODE_STATUS_META.draft
  const Icon = meta.icon
  const typeLabel = t(`pipeline.nodeTypes.${item.node.type}.label`, { defaultValue: meta.label })
  const nestedCount = countTreeItems(item) - 1
  const expanded = selected || workspaceActive

  return (
    <button
      type="button"
      draggable
      className={cn(
        'flex cursor-grab items-center gap-2 rounded-md border bg-card text-left shadow-sm transition-[border-color,background-color,box-shadow,width,height,padding] active:cursor-grabbing',
        expanded ? 'h-12 w-48 px-2' : 'h-9 w-36 px-1.5',
        selected ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/40',
        workspaceActive && 'ring-1 ring-primary/40',
      )}
      onClick={onSelect}
      onDragStart={(e) => {
        e.stopPropagation()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('application/pipeline-node-id', String(item.node.ID))
        onDragStart()
      }}
      onDragEnd={(e) => {
        e.stopPropagation()
        onDragEnd()
      }}
      title={item.node.name}
    >
      <div className={cn(
        `flex shrink-0 items-center justify-center rounded-md ${meta.accent}`,
        expanded ? 'h-7 w-7' : 'h-6 w-6',
      )}>
        <Icon size={expanded ? 14 : 12} className={meta.iconColor} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
          <p className="truncate text-xs font-semibold text-foreground">{item.node.name}</p>
        </div>
        {expanded ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{typeLabel}</p> : null}
      </div>
      {nestedCount > 0 ? (
        <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] leading-none text-muted-foreground">
          +{nestedCount}
        </span>
      ) : null}
    </button>
  )
}

function PipelineFlowCard({
  node,
  depth,
  selected,
  workspaceActive,
  expanded,
  childCount,
  blockedArtifactNames = [],
  onSelect,
  onToggle,
  onEnterWorkspace,
  onAddChild,
  canAddChild = true,
  onDelete,
  onMoveBefore,
  onMoveAfter,
  variant = 'artifact',
  draggable,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  node: PipelineNode
  depth: number
  selected?: boolean
  workspaceActive?: boolean
  expanded?: boolean
  childCount: number
  blockedArtifactNames?: string[]
  onSelect: () => void
  onToggle: () => void
  onEnterWorkspace: () => void
  onAddChild: () => void
  canAddChild?: boolean
  onDelete: () => void
  onMoveBefore?: () => void
  onMoveAfter?: () => void
  variant?: 'work' | 'artifact'
  draggable?: boolean
  isDropTarget?: boolean
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void
  onDragLeave?: (e: React.DragEvent<HTMLDivElement>) => void
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void
}) {
  const { t, i18n } = useTranslation()
  const meta = getPipelineNodeMeta(node.type)
  const status = NODE_STATUS_META[node.status] ?? NODE_STATUS_META.draft
  const Icon = meta.icon
  const typeLabel = t(`pipeline.nodeTypes.${node.type}.label`, { defaultValue: meta.label })
  const categoryLabel = t(`pipeline.categories.${meta.category}`, { defaultValue: meta.category })
  const isCustomContent = node.content_type === 'custom' || !node.content_type
  const isWork = variant === 'work'
  const expandedCard = !!selected || !!workspaceActive

  return (
    <div
      className={cn(
        'group relative rounded-md border bg-card text-left shadow-sm transition-[border-color,background-color,box-shadow,min-height,padding]',
        draggable && 'cursor-grab active:cursor-grabbing',
        expandedCard
          ? isWork ? 'min-h-[64px] p-2' : 'min-h-[56px] p-2'
          : 'min-h-9 px-1.5 py-1',
        selected ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/40',
        workspaceActive && 'ring-1 ring-primary/40',
        isDropTarget && 'border-primary bg-primary/10 ring-2 ring-primary/30',
      )}
      style={!isWork ? { marginLeft: `${depth * 18}px` } : undefined}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={(e) => {
        e.stopPropagation()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('application/pipeline-node-id', String(node.ID))
        onDragStart?.(e)
      }}
      onDragEnd={(e) => {
        e.stopPropagation()
        onDragEnd?.(e)
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      {!isWork && depth > 0 ? <div className={cn('absolute -left-[18px] h-px w-[18px] bg-border', expandedCard ? 'top-7' : 'top-4')} /> : null}

      <div className="flex items-center gap-1.5">
        {childCount > 0 ? (
          <button
            type="button"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            title={expanded ? t('common.collapse', { defaultValue: 'Collapse' }) : t('common.expand', { defaultValue: 'Expand' })}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : null}

        <div className={cn(
          `flex shrink-0 items-center justify-center rounded-md ${meta.accent}`,
          expandedCard ? 'h-7 w-7' : 'h-6 w-6',
        )}>
          <Icon size={expandedCard ? 14 : 12} className={meta.iconColor} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
            <p className="truncate text-xs font-semibold text-foreground">
              {node.name}
            </p>
            {expandedCard ? (
              <span className={cn(
                'shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase leading-none',
                isWork ? 'bg-primary/10 text-primary' : 'border border-border bg-muted text-muted-foreground',
              )}>
                {categoryLabel}
              </span>
            ) : null}
          </div>

          {expandedCard ? <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{typeLabel}</p> : null}

          {expandedCard && node.entity_id ? (
            <p className="mt-0.5 truncate text-[10px] text-emerald-600">
              {t('pipeline.node.linkedEntity', { type: node.entity_type, id: node.entity_id })}
            </p>
          ) : null}

          {expandedCard && blockedArtifactNames.length > 0 ? (
            <p className="mt-0.5 truncate text-[10px] text-amber-600">
              {t('pipeline.node.blockedArtifacts', { names: blockedArtifactNames.join(', ') })}
            </p>
          ) : null}
        </div>
      </div>

      {expandedCard ? (
        <div className={cn('mt-1.5 flex items-center justify-between gap-2', childCount > 0 ? 'pl-[54px]' : 'pl-[34px]')}>
          {node.due_date ? (
            <span className="flex min-w-0 items-center gap-1 truncate text-[10px] text-muted-foreground">
              <CalendarDays size={10} />
              {new Date(node.due_date).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })}
            </span>
          ) : <span />}

          <div className="flex shrink-0 items-center gap-0.5">
            {isWork ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-30"
                onClick={(e) => { e.stopPropagation(); onMoveBefore?.() }}
                disabled={!onMoveBefore}
                title={t('pipeline.tree.moveBefore', { defaultValue: 'Move left' })}
              >
                <ChevronLeft size={13} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-30"
                onClick={(e) => { e.stopPropagation(); onMoveAfter?.() }}
                disabled={!onMoveAfter}
                title={t('pipeline.tree.moveAfter', { defaultValue: 'Move right' })}
              >
                <ChevronRight size={13} />
              </Button>
            </>
            ) : null}
            {!isCustomContent ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
              onClick={(e) => { e.stopPropagation(); onEnterWorkspace() }}
              title={t('pipeline.node.enterWorkspace')}
            >
              <ArrowRight size={13} />
            </Button>
            ) : null}
            {canAddChild ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
              onClick={(e) => { e.stopPropagation(); onAddChild() }}
              title={t('pipeline.tree.addChild')}
            >
              <Plus size={13} />
            </Button>
            ) : null}
            <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive opacity-0 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            title={t('common.delete')}
            >
              <Trash2 size={13} />
            </Button>
            <MoreHorizontal size={13} className="text-muted-foreground/50 group-hover:hidden" />
          </div>
        </div>
      ) : null}
    </div>
  )
}
