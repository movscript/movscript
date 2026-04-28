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

  const cardWidth = 224
  const cardHeight = 74
  const gapX = 108
  const gapY = 26
  const padding = 28
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
  const width = padding * 2 + (maxLevel + 1) * cardWidth + maxLevel * gapX
  const height = padding * 2 + maxRows * cardHeight + Math.max(0, maxRows - 1) * gapY
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
      if (variables.parentId) setExpandedIds((prev) => new Set(prev).add(variables.parentId!))
      setSelectedNode(node)
      if (!isPipelineWorkNode(node.type) && node.content_type !== 'custom') setWorkspaceNode(node)
      setAddNodeState(null)
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
          />
          {expanded && item.children.length > 0 ? renderArtifactTree(item.children, depth + 1) : null}
        </div>
      )
    })
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
                  <div className="flex min-w-max items-start gap-4 p-4">
                    {layout.workColumns.map((column, index) => (
                      <div key={column.node.ID} className="w-72 shrink-0">
                        <div className="relative">
                          {index < layout.workColumns.length - 1 ? (
                            <div className="absolute left-[calc(100%+16px)] top-10 h-px w-4 bg-border" />
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
                            variant="work"
                          />
                        </div>

                        {expandedIds.has(column.node.ID) ? (
                          <div className="mt-3 space-y-2 border-l border-border pl-3">
                            {column.artifacts.length > 0 ? renderArtifactTree(column.artifacts) : (
                              <button
                                type="button"
                                className="w-full rounded-md border border-dashed border-border px-3 py-6 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
                                onClick={() => setAddNodeState({ parentId: column.node.ID })}
                              >
                                <Plus size={13} className="mx-auto mb-1.5" />
                                {t('pipeline.tree.addChild')}
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ))}

                    {layout.looseArtifacts.length > 0 ? (
                      <div className="w-72 shrink-0">
                        <div className="mb-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
                          {t('pipeline.tree.unassignedArtifacts', { defaultValue: '未挂载产物' })}
                        </div>
                        <div className="space-y-2 border-l border-border pl-3">
                          {renderArtifactTree(layout.looseArtifacts)}
                        </div>
                      </div>
                    ) : null}
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
  const cardWidth = 224
  const cardHeight = 74

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
            const startX = from.x + cardWidth
            const startY = from.y + cardHeight / 2
            const endX = to.x
            const endY = to.y + cardHeight / 2
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
          const statusLabel = t(`pipeline.status.${node.status}`, { defaultValue: status.label })
          const isWork = isPipelineWorkNode(node.type)

          return (
            <button
              key={node.ID}
              type="button"
              className={cn(
                'absolute rounded-md border bg-card p-2.5 text-left shadow-sm transition-colors hover:border-primary/40',
                selectedNodeId === node.ID ? 'border-primary/60 bg-primary/5' : 'border-border',
              )}
              style={{ left: item.x, top: item.y, width: cardWidth, height: cardHeight }}
              onClick={() => onNodeClick(node)}
            >
              <div className="flex min-w-0 items-start gap-2">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${meta.accent}`}>
                  <Icon size={15} className={meta.iconColor} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="truncate text-[13px] font-semibold text-foreground">{node.name}</p>
                    <span className={cn(
                      'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                      isWork ? 'bg-primary/10 text-primary' : 'border border-border bg-muted text-muted-foreground',
                    )}>
                      {categoryLabel}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{typeLabel}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                    <span className="truncate text-[11px] text-muted-foreground">{statusLabel}</span>
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
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
}) {
  const { t, i18n } = useTranslation()
  const meta = getPipelineNodeMeta(node.type)
  const status = NODE_STATUS_META[node.status] ?? NODE_STATUS_META.draft
  const Icon = meta.icon
  const typeLabel = t(`pipeline.nodeTypes.${node.type}.label`, { defaultValue: meta.label })
  const categoryLabel = t(`pipeline.categories.${meta.category}`, { defaultValue: meta.category })
  const statusLabel = t(`pipeline.status.${node.status}`, { defaultValue: status.label })
  const isCustomContent = node.content_type === 'custom' || !node.content_type
  const isWork = variant === 'work'

  return (
    <div
      className={cn(
        'group relative rounded-md border bg-card text-left shadow-sm transition-colors',
        isWork ? 'min-h-[116px] p-3' : 'min-h-[96px] p-2.5',
        selected ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/40',
        workspaceActive && 'ring-1 ring-primary/40',
      )}
      style={!isWork ? { marginLeft: `${depth * 18}px` } : undefined}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      {!isWork && depth > 0 ? <div className="absolute -left-[18px] top-9 h-px w-[18px] bg-border" /> : null}

      <div className="flex items-start gap-2.5">
        <button
          type="button"
          className={cn(
            'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground',
            childCount === 0 && 'invisible',
          )}
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          title={expanded ? t('common.collapse', { defaultValue: 'Collapse' }) : t('common.expand', { defaultValue: 'Expand' })}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${meta.accent}`}>
          <Icon size={16} className={meta.iconColor} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className={cn('truncate font-semibold text-foreground', isWork ? 'text-sm' : 'text-[13px]')}>
              {node.name}
            </p>
            <span className={cn(
              'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
              isWork ? 'bg-primary/10 text-primary' : 'border border-border bg-muted text-muted-foreground',
            )}>
              {categoryLabel}
            </span>
          </div>

          <p className="mt-0.5 truncate text-xs text-muted-foreground">{typeLabel}</p>

          {node.entity_id ? (
            <p className="mt-1 truncate text-xs text-emerald-600">
              {t('pipeline.node.linkedEntity', { type: node.entity_type, id: node.entity_id })}
            </p>
          ) : null}

          {blockedArtifactNames.length > 0 ? (
            <p className="mt-1 truncate text-xs text-amber-600">
              {t('pipeline.node.blockedArtifacts', { names: blockedArtifactNames.join(', ') })}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${status.badge}`}>
              {statusLabel}
            </span>
          </div>

          {node.due_date ? (
            <span className="hidden items-center gap-1 truncate text-xs text-muted-foreground xl:flex">
              <CalendarDays size={11} />
              {new Date(node.due_date).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {isWork ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-30"
                onClick={(e) => { e.stopPropagation(); onMoveBefore?.() }}
                disabled={!onMoveBefore}
                title={t('pipeline.tree.moveBefore', { defaultValue: 'Move left' })}
              >
                <ChevronLeft size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-30"
                onClick={(e) => { e.stopPropagation(); onMoveAfter?.() }}
                disabled={!onMoveAfter}
                title={t('pipeline.tree.moveAfter', { defaultValue: 'Move right' })}
              >
                <ChevronRight size={14} />
              </Button>
            </>
          ) : null}
          {!isCustomContent ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100"
              onClick={(e) => { e.stopPropagation(); onEnterWorkspace() }}
              title={t('pipeline.node.enterWorkspace')}
            >
              <ArrowRight size={14} />
            </Button>
          ) : null}
          {canAddChild ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100"
              onClick={(e) => { e.stopPropagation(); onAddChild() }}
              title={t('pipeline.tree.addChild')}
            >
              <Plus size={14} />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive opacity-0 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            title={t('common.delete')}
          >
            <Trash2 size={14} />
          </Button>
          <MoreHorizontal size={14} className="text-muted-foreground/50 group-hover:hidden" />
        </div>
      </div>
    </div>
  )
}
