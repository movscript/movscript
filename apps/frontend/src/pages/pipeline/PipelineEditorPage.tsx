import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  FileText,
  GanttChartSquare,
  ImagePlus,
  Inbox,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Network,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
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
  isPipelineWorkNode,
} from './components/PipelineNodeComponent'
import { WORK_NODE_TYPES, defaultContentType } from './nodeSpec'
import { NodeDetailPanel } from './components/NodeDetailPanel'
import { GanttChart } from './components/GanttChart'
import { DeleteNodeDialog } from './components/DeleteNodeDialog'
import { StageWorkspaceContent } from './StageWorkspacePage'
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@movscript/ui'
import { workbenchPathForPipelineNode } from '@/pages/work/workbenchNavigation'

interface WorkColumn {
  node: PipelineNode
}

type WorkGroupId = 'script' | 'visual' | 'production' | 'post' | 'custom'

interface WorkGroup {
  id: WorkGroupId
  label: string
  description: string
  columns: WorkColumn[]
}

interface PipelineLayout {
  workColumns: WorkColumn[]
  workGroups: WorkGroup[]
}

interface DependencyGraphItem {
  node: PipelineNode
  x: number
  y: number
}

interface DependencyNodePosition {
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

const EDGE_RELATION_HIERARCHY = 'hierarchy'
const EDGE_RELATION_DEPENDENCY = 'dependency'

const NODE_STATUS_META: Record<string, { dot: string; badge: string; label: string }> = {
  draft:        { dot: 'bg-muted-foreground/40', badge: 'bg-muted text-muted-foreground', label: 'Draft' },
  under_review: { dot: 'bg-amber-500',           badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400', label: 'In Review' },
  rejected:     { dot: 'bg-destructive',         badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400', label: 'Rejected' },
  final:        { dot: 'bg-green-500',           badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400', label: 'Final' },
}

const WORK_GROUP_META: Record<WorkGroupId, { label: string; description: string }> = {
  script: { label: '文本结构', description: '剧本、设定、分集、场景' },
  visual: { label: '视觉设计', description: '分镜、素材' },
  production: { label: '镜头生产', description: '镜头执行与生成' },
  post: { label: '剪辑交付', description: '成片与交付' },
  custom: { label: '其他工作', description: '自定义工作项' },
}

type PipelineStageId = 'script' | 'setting' | 'asset' | 'storyboard' | 'shot' | 'delivery'

interface PipelineStageDef {
  id: PipelineStageId
  label: string
  description: string
  icon: React.ElementType
}

const PIPELINE_STAGES: PipelineStageDef[] = [
  { id: 'script', label: '剧本整理', description: '版本、增量分析、结构化候选', icon: FileText },
  { id: 'setting', label: '设定准备', description: '角色、场景、道具、关系确认', icon: Database },
  { id: 'asset', label: '素材准备', description: '素材需求、覆盖矩阵、锁定状态', icon: ImagePlus },
  { id: 'storyboard', label: '分镜脚本生产', description: '分场拆分、画面描述、机位', icon: ClipboardList },
  { id: 'shot', label: '镜头生产', description: '视频生成、版本、返工和选片', icon: Sparkles },
  { id: 'delivery', label: '成片交付', description: '镜头序列、缺失检查、版本交付', icon: ShieldCheck },
]

const STAGE_LABELS = Object.fromEntries(PIPELINE_STAGES.map((stage) => [stage.id, stage.label])) as Record<PipelineStageId, string>

function edgeRelationType(edge: PipelineEdge) {
  return edge.relation_type || EDGE_RELATION_HIERARCHY
}

function dependencyEdges(edges: PipelineEdge[]) {
  return edges.filter((edge) => edgeRelationType(edge) === EDGE_RELATION_DEPENDENCY)
}

function hasStoredDependencyPosition(node: PipelineNode) {
  return Number.isFinite(node.pos_x) && Number.isFinite(node.pos_y) && node.pos_y > 0
}

function sortWorkNodes(nodes: PipelineNode[], _edges: PipelineEdge[]) {
  return nodes.filter((node) => isPipelineWorkNode(node.type)).sort((a, b) => {
    const ax = Number.isFinite(a.pos_x) ? a.pos_x : 0
    const bx = Number.isFinite(b.pos_x) ? b.pos_x : 0
    if (ax !== bx) return ax - bx
    return a.ID - b.ID
  })
}

function buildPipelineLayout(nodes: PipelineNode[], edges: PipelineEdge[]): PipelineLayout {
  const workNodes = sortWorkNodes(nodes, edges)
  const columns = workNodes.map((node) => ({ node }))
  const groups = new Map<WorkGroupId, WorkColumn[]>()

  for (const column of columns) {
    const groupId = workGroupIdForNode(column.node)
    groups.set(groupId, [...(groups.get(groupId) ?? []), column])
  }

  const workGroups = (Object.keys(WORK_GROUP_META) as WorkGroupId[])
    .map((id) => ({
      id,
      ...WORK_GROUP_META[id],
      columns: groups.get(id) ?? [],
    }))
    .filter((group) => group.columns.length > 0)

  return {
    workColumns: columns,
    workGroups,
  }
}

function workGroupIdForNode(node: PipelineNode): WorkGroupId {
  if (['raw_script', 'script_writing', 'setting_creation', 'episode_writing', 'scene_writing'].includes(node.type)) return 'script'
  if (['storyboard_creation', 'asset_creation'].includes(node.type)) return 'visual'
  if (node.type === 'shot_production') return 'production'
  if (node.type === 'episode_edit') return 'post'

  switch (node.content_type) {
    case 'script':
    case 'setting':
    case 'episode':
    case 'scene':
      return 'script'
    case 'storyboard':
    case 'asset':
      return 'visual'
    case 'shot':
      return 'production'
    case 'final_video':
      return 'post'
    default:
      return 'custom'
  }
}

function stageIdForNode(node: PipelineNode): PipelineStageId {
  if (['raw_script', 'script_writing', 'episode_writing', 'scene_writing'].includes(node.type)) return 'script'
  if (node.type === 'setting_creation' || node.content_type === 'setting') return 'setting'
  if (node.type === 'asset_creation' || node.content_type === 'asset') return 'asset'
  if (node.type === 'storyboard_creation' || node.content_type === 'storyboard') return 'storyboard'
  if (node.type === 'shot_production' || node.content_type === 'shot') return 'shot'
  if (node.type === 'episode_edit' || node.content_type === 'final_video') return 'delivery'
  if (node.content_type === 'script' || node.content_type === 'episode' || node.content_type === 'scene') return 'script'
  return 'script'
}

function stageDef(stageId: PipelineStageId) {
  return PIPELINE_STAGES.find((stage) => stage.id === stageId) ?? PIPELINE_STAGES[0]
}

function buildDependencyGraphLayout(nodes: PipelineNode[], edges: PipelineEdge[], useStoredPositions = true): DependencyGraphLayout {
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
  const cardHeight = 56
  const gapX = 56
  const gapY = 14
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

  const positionedItems = items.map((item) => {
    if (!useStoredPositions) return item
    if (!hasStoredDependencyPosition(item.node)) return item
    return {
      ...item,
      x: Math.max(0, item.node.pos_x),
      y: Math.max(0, item.node.pos_y),
    }
  })

  const maxLevel = Math.max(0, ...items.map((item) => Math.floor((item.x - padding) / (cardWidth + gapX))))
  const maxRows = Math.max(1, ...[...levels.values()].map((levelNodes) => levelNodes.length))
  const autoWidth = padding * 2 + (maxLevel + 1) * cardWidth + maxLevel * gapX + expandedOverflowX
  const autoHeight = padding * 2 + maxRows * cardHeight + Math.max(0, maxRows - 1) * gapY + expandedOverflowY
  const width = Math.max(autoWidth, padding + expandedOverflowX + Math.max(0, ...positionedItems.map((item) => item.x + cardWidth)))
  const height = Math.max(autoHeight, padding + expandedOverflowY + Math.max(0, ...positionedItems.map((item) => item.y + cardHeight)))
  const itemById = new Map(positionedItems.map((item) => [item.node.ID, item]))

  return { items: positionedItems, itemById, edges: validEdges, width, height }
}

interface PipelineEditorPageProps {
  embedded?: boolean
}

export default function PipelineEditorPage({ embedded = false }: PipelineEditorPageProps = {}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const project = useProjectStore((s) => s.current)

  const [activeTab, setActiveTab] = useState<'tasks' | 'dependencies' | 'schedule'>('tasks')
  const [activeStage, setActiveStage] = useState<PipelineStageId>('script')
  const [selectedNode, setSelectedNode] = useState<PipelineNode | null>(null)
  const [workspaceNode, setWorkspaceNode] = useState<PipelineNode | null>(null)
  const [isAddNodeOpen, setIsAddNodeOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PipelineNode | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  const { data: pipeline, isLoading } = useQuery<Pipeline>({
    queryKey: ['pipeline', project?.ID],
    queryFn: () => api.get(`/projects/${project!.ID}/pipeline`).then((r) => r.data),
    enabled: !!project,
  })

  const layout = useMemo(() => buildPipelineLayout(pipeline?.nodes ?? [], pipeline?.edges ?? []), [pipeline])
  const stageNodes = useMemo(() => {
    const byStage = new Map<PipelineStageId, PipelineNode[]>()
    for (const stage of PIPELINE_STAGES) byStage.set(stage.id, [])
    for (const column of layout.workColumns) {
      const stageId = stageIdForNode(column.node)
      byStage.set(stageId, [...(byStage.get(stageId) ?? []), column.node])
    }
    return byStage
  }, [layout.workColumns])
  const activeWorkspaceNode = workspaceNode ?? (embedded ? selectedNode : null)

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
    mutationFn: async (body: Partial<PipelineNode>) => {
      return api.post(`/projects/${project!.ID}/pipeline/nodes`, body).then((r) => r.data as PipelineNode)
    },
    onSuccess: (node) => {
      qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
      setSelectedNode(node)
      if (!isPipelineWorkNode(node.type) && node.content_type !== 'custom') setWorkspaceNode(node)
      setIsAddNodeOpen(false)
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

  const createDependencyEdge = useMutation({
    mutationFn: ({ fromId, toId }: { fromId: number; toId: number }) =>
      api.post(`/projects/${project!.ID}/pipeline/edges`, {
        from_node_id: fromId,
        to_node_id: toId,
        relation_type: EDGE_RELATION_DEPENDENCY,
      }).then((r) => r.data as PipelineEdge),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
    },
  })

  const deleteDependencyEdge = useMutation({
    mutationFn: (edgeId: number) => api.delete(`/pipeline/edges/${edgeId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
    },
  })

  const moveDependencyNode = useMutation({
    mutationFn: ({ nodeId, x, y }: { nodeId: number; x: number; y: number }) =>
      api.put(`/pipeline/nodes/${nodeId}`, { pos_x: Math.round(x), pos_y: Math.round(y) }).then((r) => r.data as PipelineNode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
    },
  })

  const arrangeDependencyNodes = useMutation({
    mutationFn: (positions: Array<{ id: number; x: number; y: number }>) =>
      Promise.all(
        positions.map((position) =>
          api.put(`/pipeline/nodes/${position.id}`, { pos_x: position.x, pos_y: position.y }),
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

  function openWorkspace(node: PipelineNode) {
    setSelectedNode(node)
    setActiveStage(stageIdForNode(node))
    if (embedded) return
  }

  function enterNodeWorkspace(node: PipelineNode) {
    if (embedded) {
      navigate(workbenchPathForPipelineNode(node))
      return
    }
    navigate(workbenchPathForPipelineNode(node))
  }

  function toggleWorkGroup(groupId: string) {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  function handleArrangeDependencyGraph() {
    const nextLayout = buildDependencyGraphLayout(pipeline?.nodes ?? [], pipeline?.edges ?? [], false)
    arrangeDependencyNodes.mutate(nextLayout.items.map((item) => ({ id: item.node.ID, x: item.x, y: item.y })))
  }

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <div className={cn('flex items-center border-b border-border bg-card shrink-0', embedded ? 'px-3 py-2' : 'px-4 py-2.5')}>
        <div className={cn('flex items-center gap-3 shrink-0', embedded ? 'w-48' : 'w-64')}>
          {!embedded ? (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(-1)}>
              <ArrowLeft size={15} />
            </Button>
          ) : null}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{project.name}</p>
            {!embedded ? <p className="text-xs text-muted-foreground">{t('pipeline.editor.subtitle')}</p> : null}
          </div>
        </div>

        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
            <TabBtn active={activeTab === 'tasks'} icon={<TreePine size={13} />} label={t('pipeline.editor.taskLayer', { defaultValue: '任务层' })} onClick={() => setActiveTab('tasks')} />
            <TabBtn active={activeTab === 'dependencies'} icon={<Network size={13} />} label={t('pipeline.editor.dependencyLayer', { defaultValue: '依赖层' })} onClick={() => setActiveTab('dependencies')} />
            <TabBtn active={activeTab === 'schedule'} icon={<GanttChartSquare size={13} />} label={t('pipeline.editor.scheduleLayer', { defaultValue: '排期层' })} onClick={() => setActiveTab('schedule')} />
          </div>
        </div>

        <div className={cn('flex items-center gap-2 shrink-0 justify-end', embedded ? 'w-48' : 'w-64')}>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => setIsAddNodeOpen(true)}
          >
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
            <PipelineStageWorkbench
              activeStage={activeStage}
              selectedNode={selectedNode}
              stageNodes={stageNodes}
              allNodes={layout.workColumns.map((column) => column.node)}
              onStageChange={(stageId) => {
                setActiveStage(stageId)
                const firstNode = stageNodes.get(stageId)?.[0]
                if (firstNode) setSelectedNode(firstNode)
              }}
              onSelectNode={openWorkspace}
              onOpenWorkspace={enterNodeWorkspace}
              onDeleteNode={(node) => setPendingDelete(node)}
              onAddNode={() => setIsAddNodeOpen(true)}
            />
          ) : activeTab === 'dependencies' ? (
            <DependencyGraph
              nodes={pipeline?.nodes ?? []}
              edges={pipeline?.edges ?? []}
              selectedNodeId={selectedNode?.ID}
              onNodeClick={setSelectedNode}
              onCreateDependency={(fromId, toId) => createDependencyEdge.mutate({ fromId, toId })}
              onDeleteDependency={(edgeId) => deleteDependencyEdge.mutate(edgeId)}
              onMoveNode={(nodeId, x, y) => moveDependencyNode.mutate({ nodeId, x, y })}
              onAutoArrange={handleArrangeDependencyGraph}
              isMutating={createDependencyEdge.isPending || deleteDependencyEdge.isPending || arrangeDependencyNodes.isPending || moveDependencyNode.isPending}
            />
          ) : (
            <GanttChart
              nodes={pipeline?.nodes ?? []}
              edges={pipeline?.edges ?? []}
              onNodeClick={setSelectedNode}
            />
          )}
        </div>

        {selectedNode && activeTab !== 'tasks' ? (
          <NodeDetailPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onNodeUpdated={(updated) => setSelectedNode(updated)}
            onOpenWorkspace={enterNodeWorkspace}
          />
        ) : null}
      </div>

      <AddNodeDialog
        open={isAddNodeOpen}
        onCancel={() => setIsAddNodeOpen(false)}
        onCreate={(body) => createNode.mutate(body)}
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

type PipelineMetricTone = 'neutral' | 'emerald' | 'amber' | 'sky'

function PipelineStageWorkbench({
  activeStage,
  selectedNode,
  stageNodes,
  allNodes,
  onStageChange,
  onSelectNode,
  onOpenWorkspace,
  onDeleteNode,
  onAddNode,
}: {
  activeStage: PipelineStageId
  selectedNode: PipelineNode | null
  stageNodes: Map<PipelineStageId, PipelineNode[]>
  allNodes: PipelineNode[]
  onStageChange: (stageId: PipelineStageId) => void
  onSelectNode: (node: PipelineNode) => void
  onOpenWorkspace: (node: PipelineNode) => void
  onDeleteNode: (node: PipelineNode) => void
  onAddNode: () => void
}) {
  const stage = stageDef(activeStage)
  const nodes = stageNodes.get(activeStage) ?? []
  const selectedInStage = selectedNode && stageIdForNode(selectedNode) === activeStage ? selectedNode : nodes[0] ?? null
  const StageIcon = stage.icon

  return (
    <div className="grid h-full grid-cols-[230px_minmax(0,1fr)_280px] overflow-hidden bg-background">
      <aside className="flex min-h-0 flex-col border-r border-border bg-card">
        <div className="border-b border-border px-3 py-3">
          <div className="flex items-center gap-2">
            <TreePine size={15} className="text-primary" />
            <p className="text-sm font-semibold text-foreground">生产管线</p>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            阶段是入口，工作项从阶段中进入画布或实体工作区。
          </p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-2">
          <div className="space-y-1">
            {PIPELINE_STAGES.map((item) => {
              const count = stageNodes.get(item.id)?.length ?? 0
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onStageChange(item.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                    activeStage === item.id ? 'bg-primary/10 text-foreground ring-1 ring-primary/20' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', activeStage === item.id ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                    <Icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[10px] opacity-75">{item.description}</span>
                  </span>
                  <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] leading-none">{count}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="border-t border-border p-2">
          <Button size="sm" variant="outline" className="h-8 w-full justify-start text-xs" onClick={onAddNode}>
            <Plus size={13} className="mr-1.5" />
            添加工作项
          </Button>
        </div>
      </aside>

      <main className="min-w-0 overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <StageIcon size={16} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">{stage.label}</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{stage.description}</p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs">
              <Search size={13} className="mr-1.5" />
              筛选
            </Button>
            <Button size="sm" className="h-8 text-xs" onClick={onAddNode}>
              <Plus size={13} className="mr-1.5" />
              新建
            </Button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-4">
            {stageMetrics(activeStage, nodes, allNodes).map((metric) => (
              <PipelineStageMetric key={metric.label} {...metric} />
            ))}
          </div>

          <StagePrimaryWorkspace stageId={activeStage} />

          <section className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">生产工作项</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">确认后的任务才进入这里；候选和缺口先留在阶段工作区处理。</p>
              </div>
              <span className="rounded border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">{nodes.length} 项</span>
            </div>
            <div className="divide-y divide-border/70">
              {nodes.length > 0 ? nodes.map((node) => (
                <StageNodeRow
                  key={node.ID}
                  node={node}
                  selected={selectedNode?.ID === node.ID}
                  onSelect={() => onSelectNode(node)}
                  onOpenWorkspace={() => onOpenWorkspace(node)}
                  onDelete={() => onDeleteNode(node)}
                />
              )) : (
                <div className="flex min-h-28 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                  <Inbox size={22} className="text-muted-foreground/60" />
                  <p className="text-xs text-muted-foreground">这个阶段还没有正式工作项。可以先处理上方候选，再批量生成任务。</p>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onAddNode}>
                    <Plus size={13} className="mr-1.5" />
                    添加工作项
                  </Button>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <StageSummaryPanel
        stageId={activeStage}
        selectedNode={selectedInStage}
        nodeCount={nodes.length}
        onOpenWorkspace={selectedInStage ? () => onOpenWorkspace(selectedInStage) : undefined}
        onDelete={selectedInStage ? () => onDeleteNode(selectedInStage) : undefined}
      />
    </div>
  )
}

function stageMetrics(stageId: PipelineStageId, nodes: PipelineNode[], allNodes: PipelineNode[]): Array<{ label: string; value: string; tone: PipelineMetricTone }> {
  const finalCount = nodes.filter((node) => node.status === 'final').length
  const reviewCount = nodes.filter((node) => node.status === 'under_review').length
  const rejectedCount = nodes.filter((node) => node.status === 'rejected').length
  const total = nodes.length

  if (stageId === 'script') {
    return [
      { label: '工作项', value: String(total), tone: 'neutral' },
      { label: '增量候选', value: '14', tone: 'sky' },
      { label: '冲突', value: '3', tone: 'amber' },
      { label: '已完成', value: String(finalCount), tone: 'emerald' },
    ]
  }
  if (stageId === 'asset') {
    return [
      { label: '工作项', value: String(total), tone: 'neutral' },
      { label: '缺失素材', value: '7', tone: 'amber' },
      { label: '待审', value: String(reviewCount || 5), tone: 'sky' },
      { label: '已锁定', value: String(finalCount), tone: 'emerald' },
    ]
  }
  if (stageId === 'delivery') {
    return [
      { label: '工作项', value: String(total), tone: 'neutral' },
      { label: '全局工作项', value: String(allNodes.length), tone: 'sky' },
      { label: '返工', value: String(rejectedCount), tone: 'amber' },
      { label: '已交付', value: String(finalCount), tone: 'emerald' },
    ]
  }
  return [
    { label: '工作项', value: String(total), tone: 'neutral' },
    { label: '待处理', value: String(Math.max(0, total - finalCount)), tone: 'sky' },
    { label: '返工', value: String(rejectedCount), tone: 'amber' },
    { label: '已完成', value: String(finalCount), tone: 'emerald' },
  ]
}

function PipelineStageMetric({ label, value, tone }: { label: string; value: string; tone: PipelineMetricTone }) {
  return (
    <div className={cn(
      'rounded-lg border px-3 py-2.5',
      tone === 'emerald' && 'border-emerald-500/25 bg-emerald-500/10',
      tone === 'sky' && 'border-sky-500/25 bg-sky-500/10',
      tone === 'amber' && 'border-amber-500/25 bg-amber-500/10',
      tone === 'neutral' && 'border-border bg-card',
    )}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold leading-none text-foreground">{value}</p>
    </div>
  )
}

function StagePrimaryWorkspace({ stageId }: { stageId: PipelineStageId }) {
  if (stageId === 'asset') return <AssetPreparationMatrix />
  if (stageId === 'storyboard') return <StoryboardPreparationList />
  if (stageId === 'shot') return <ShotProductionList />
  if (stageId === 'delivery') return <DeliveryCheckList />
  if (stageId === 'setting') return <SettingInboxList />
  return <ScriptAnalysisInbox />
}

function ScriptAnalysisInbox() {
  return (
    <StagePanel title="智能分析收件箱" subtitle="剧本增量先进入候选，不直接覆盖设定、素材或分镜。">
      <StageCandidateRow kind="新增" title="Scene 08 雨夜巷口" source="Script v12 L340-L392" action="创建分场候选并提取角色状态" status="待确认" selected />
      <StageCandidateRow kind="修改" title="林夏受伤描述增强" source="Script v12 L361" action="作为局部状态进入设定准备" status="待合并" />
      <StageCandidateRow kind="冲突" title="顾言动机前后不一致" source="v11/v12 差异" action="进入冲突处理，不自动更新人物档案" status="需判断" warning />
    </StagePanel>
  )
}

function SettingInboxList() {
  return (
    <StagePanel title="设定候选处理" subtitle="确认角色、场景、道具和关系，写入长期设定库。">
      <StageCandidateRow kind="角色" title="林夏 · 雨夜受伤状态" source="Scene 08 / Shot 04" action="作为角色状态，不覆盖基础设定" status="待创建素材需求" selected />
      <StageCandidateRow kind="道具" title="旧伞" source="第 2 集反复出现 3 次" action="创建为道具设定，并生成参考素材" status="待创建" />
      <StageCandidateRow kind="关系" title="林夏 与 顾言关系变化" source="Scene 07 -> Scene 08" action="更新局部关系，不改全局人物关系" status="需确认" warning />
    </StagePanel>
  )
}

function AssetPreparationMatrix() {
  return (
    <StagePanel title="素材覆盖矩阵" subtitle="素材准备管缺口和覆盖，单个需求再打开画布生成。">
      <StageCandidateRow kind="角色" title="林夏 / 雨夜受伤 / 正面半身" source="Setting #12 + Scene 08" action="打开画布：状态卡 + 图像生成" status="缺失" selected warning />
      <StageCandidateRow kind="角色" title="林夏 / 雨夜受伤 / 表情组" source="Setting #12" action="复用主视觉，生成情绪组" status="待生成" />
      <StageCandidateRow kind="场景" title="雨夜巷口 / 环境参考" source="Setting #31" action="锁定 9:16 场景基底" status="待审" />
    </StagePanel>
  )
}

function StoryboardPreparationList() {
  return (
    <StagePanel title="分镜脚本拆分" subtitle="从分场剧本生成分镜候选，确认后再创建 Storyboard。">
      <StageCandidateRow kind="Scene 08" title="巷口远景建立" source="雨夜巷口" action="远景 / 低机位 / 建立空间压迫感" status="待出图" selected />
      <StageCandidateRow kind="Scene 08" title="近景情绪压迫" source="林夏受伤状态" action="近景 / 雨水和擦伤 / 压抑愤怒" status="缺素材" warning />
      <StageCandidateRow kind="Scene 08" title="反打顾言沉默" source="顾言关系变化" action="肩后反打 / 保持距离" status="待确认" />
    </StagePanel>
  )
}

function ShotProductionList() {
  return (
    <StagePanel title="镜头生产队列" subtitle="基于已确认分镜和素材生成视频镜头，管理版本和返工。">
      <StageCandidateRow kind="Shot" title="S08-04 推近特写" source="Storyboard #22" action="5s / 缓慢推近 / 雨水反光" status="可生成" selected />
      <StageCandidateRow kind="Shot" title="S08-05 反打沉默" source="Storyboard #23" action="4s / 肩后反打 / 轻微手持" status="阻塞" warning />
      <StageCandidateRow kind="版本" title="S07-02 v3" source="已生成视频" action="动作过快，建议降低 pacing" status="待选片" />
    </StagePanel>
  )
}

function DeliveryCheckList() {
  return (
    <StagePanel title="成片交付检查" subtitle="检查镜头序列、缺失片段、版本锁定和审核记录。">
      <StageCandidateRow kind="序列" title="EP02 Scene 08" source="24 个镜头" action="2 个镜头未锁定，暂不可最终交付" status="缺失" selected warning />
      <StageCandidateRow kind="版本" title="EP02 cut v3" source="上次合成" action="更新 3 个镜头后重新合成" status="待重合成" />
      <StageCandidateRow kind="交付" title="竖屏 9:16 母版" source="FinalVideo" action="所有镜头锁定后输出" status="未开始" />
    </StagePanel>
  )
}

function StagePanel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2.5">
        <div>
          <p className="text-xs font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <Button size="xs" variant="outline" className="h-7 shrink-0">批量处理</Button>
      </div>
      <div className="divide-y divide-border/70">{children}</div>
    </section>
  )
}

function StageCandidateRow({
  kind,
  title,
  source,
  action,
  status,
  selected,
  warning,
}: {
  kind: string
  title: string
  source: string
  action: string
  status: string
  selected?: boolean
  warning?: boolean
}) {
  return (
    <div className={cn('grid grid-cols-[34px_1fr_1.1fr_112px] gap-3 px-3 py-2.5', selected && 'bg-primary/5')}>
      <div className="pt-1">
        <input type="checkbox" checked={selected} readOnly className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">{kind}</span>
          <p className="truncate text-xs font-medium text-foreground">{title}</p>
        </div>
        <p className="mt-1 truncate text-[10px] text-muted-foreground">{source}</p>
      </div>
      <p className="min-w-0 truncate text-[11px] leading-7 text-muted-foreground">{action}</p>
      <div className="flex items-center justify-end">
        <span className={cn(
          'rounded border px-1.5 py-1 text-[10px] leading-none',
          warning ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-border bg-background text-muted-foreground',
        )}>
          {status}
        </span>
      </div>
    </div>
  )
}

function StageNodeRow({
  node,
  selected,
  onSelect,
  onOpenWorkspace,
  onDelete,
}: {
  node: PipelineNode
  selected?: boolean
  onSelect: () => void
  onOpenWorkspace: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const meta = getPipelineNodeMeta(node.type)
  const status = NODE_STATUS_META[node.status] ?? NODE_STATUS_META.draft
  const Icon = meta.icon
  const typeLabel = t(`pipeline.nodeTypes.${node.type}.label`, { defaultValue: meta.label })
  const statusLabel = t(`pipeline.status.${node.status}`, { defaultValue: status.label })
  const canOpen = node.content_type !== 'custom' && !!node.content_type

  return (
    <div
      className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 transition-colors', selected ? 'bg-primary/5' : 'hover:bg-muted/40')}
      onClick={onSelect}
      role="button"
      tabIndex={0}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', meta.accent)}>
          <Icon size={15} className={meta.iconColor} />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', status.dot)} />
            <p className="truncate text-xs font-semibold text-foreground">{node.name}</p>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{typeLabel}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className={cn('mr-1 rounded px-1.5 py-0.5 text-[10px] font-medium', status.badge)}>{statusLabel}</span>
        {canOpen ? (
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onOpenWorkspace() }} title={t('pipeline.node.enterWorkspace')}>
            <ArrowRight size={14} />
          </Button>
        ) : null}
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete() }} title={t('common.delete')}>
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  )
}

function StageSummaryPanel({
  stageId,
  selectedNode,
  nodeCount,
  onOpenWorkspace,
  onDelete,
}: {
  stageId: PipelineStageId
  selectedNode: PipelineNode | null
  nodeCount: number
  onOpenWorkspace?: () => void
  onDelete?: () => void
}) {
  const { t } = useTranslation()
  const stage = stageDef(stageId)
  const StageIcon = stage.icon
  const status = selectedNode ? (NODE_STATUS_META[selectedNode.status] ?? NODE_STATUS_META.draft) : null

  return (
    <aside className="flex min-h-0 flex-col border-l border-border bg-card">
      <div className="border-b border-border px-3 py-3">
        <div className="flex items-center gap-2">
          <ListChecks size={14} className="text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">阶段摘要</p>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">管线负责进度、影响和审核；画布负责单项生成。</p>
      </div>
      <div className="flex-1 min-h-0 space-y-4 overflow-y-auto p-3">
        <section>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">当前阶段</p>
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <StageIcon size={15} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">{stage.label}</p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{nodeCount} 个正式工作项</p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">选中工作项</p>
          {selectedNode ? (
            <div className="space-y-2 rounded-lg border border-border bg-background p-3">
              <p className="line-clamp-2 text-xs font-semibold text-foreground">{selectedNode.name}</p>
              <div className="flex items-center gap-1.5">
                {status && <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', status.badge)}>{t(`pipeline.status.${selectedNode.status}`, { defaultValue: status.label })}</span>}
                <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">{selectedNode.content_type}</span>
              </div>
              {selectedNode.entity_id ? (
                <p className="truncate text-[10px] text-emerald-600">
                  {t('pipeline.node.linkedEntity', { type: selectedNode.entity_type, id: selectedNode.entity_id })}
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground">还未绑定正式实体。</p>
              )}
              <div className="flex gap-2 pt-1">
                {onOpenWorkspace ? <Button size="sm" className="h-8 flex-1 text-xs" onClick={onOpenWorkspace}>打开工作区</Button> : null}
                {onDelete ? <Button size="sm" variant="outline" className="h-8 text-xs text-destructive hover:text-destructive" onClick={onDelete}>删除</Button> : null}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              选择一个工作项查看摘要。
            </div>
          )}
        </section>

        <section>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">阶段规则</p>
          <div className="space-y-1.5">
            <StageRule ok label="候选先确认，再进入正式工作项" />
            <StageRule ok label="画布从具体工作项打开" />
            <StageRule label="剧本增量只标记影响，不自动覆盖" />
          </div>
        </section>
      </div>
    </aside>
  )
}

function StageRule({ label, ok }: { label: string; ok?: boolean }) {
  const Icon = ok ? CheckCircle2 : AlertTriangle
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Icon size={12} className={cn('shrink-0', ok ? 'text-emerald-600' : 'text-amber-600')} />
      <span className="min-w-0 flex-1">{label}</span>
    </div>
  )
}

function AddNodeDialog({
  open,
  onCancel,
  onCreate,
  isPending,
}: {
  open: boolean
  onCancel: () => void
  onCreate: (body: Partial<PipelineNode>) => void
  isPending?: boolean
}) {
  const { t } = useTranslation()
  const [type, setType] = useState<string>('script_writing')
  const [name, setName] = useState('')

  useEffect(() => {
    if (!open) return
    setType('script_writing')
    setName('')
  }, [open])

  function handleTypeChange(nextType: string) {
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
          <DialogTitle>{t('pipeline.tree.addRoot')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('pipeline.detail.nodeName')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('pipeline.contextMenu.addNode')} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('pipeline.tree.nodeType')}</Label>
            <Select value={type} onValueChange={handleTypeChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORK_NODE_TYPES.map((option) => {
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
  onCreateDependency,
  onDeleteDependency,
  onMoveNode,
  onAutoArrange,
  isMutating,
}: {
  nodes: PipelineNode[]
  edges: PipelineEdge[]
  selectedNodeId?: number
  onNodeClick: (node: PipelineNode) => void
  onCreateDependency: (fromId: number, toId: number) => void
  onDeleteDependency: (edgeId: number) => void
  onMoveNode: (nodeId: number, x: number, y: number) => void
  onAutoArrange: () => void
  isMutating?: boolean
}) {
  const { t } = useTranslation()
  const graphRef = useRef<HTMLDivElement | null>(null)
  const suppressNextNodeClickRef = useRef(false)
  const [dragSourceId, setDragSourceId] = useState<number | null>(null)
  const [dropTargetId, setDropTargetId] = useState<number | null>(null)
  const [connectSourceId, setConnectSourceId] = useState<number | null>(null)
  const [previewPoint, setPreviewPoint] = useState<{ x: number; y: number } | null>(null)
  const [localPositions, setLocalPositions] = useState<Record<number, DependencyNodePosition>>({})
  const compactCardWidth = 132
  const compactCardHeight = 36
  const expandedCardWidth = 184
  const expandedCardHeight = 56
  const extraDependencies = dependencyEdges(edges)
  const layout = useMemo(() => {
    const base = buildDependencyGraphLayout(nodes, edges)
    const positionEntries = Object.entries(localPositions)
    if (positionEntries.length === 0) return base

    const positionedItems = base.items.map((item) => {
      const local = localPositions[item.node.ID]
      return local ? { ...item, x: local.x, y: local.y } : item
    })
    const width = Math.max(base.width, 28 + expandedCardWidth + Math.max(0, ...positionedItems.map((item) => item.x)))
    const height = Math.max(base.height, 28 + expandedCardHeight + Math.max(0, ...positionedItems.map((item) => item.y)))
    return {
      ...base,
      items: positionedItems,
      itemById: new Map(positionedItems.map((item) => [item.node.ID, item])),
      width,
      height,
    }
  }, [nodes, edges, localPositions])

  useEffect(() => {
    const existingIds = new Set(nodes.map((node) => node.ID))
    setLocalPositions((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([id]) => existingIds.has(Number(id))))
      return Object.keys(next).length === Object.keys(prev).length ? prev : next
    })
  }, [nodes])

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setConnectSourceId(null)
      setDragSourceId(null)
      setDropTargetId(null)
      setPreviewPoint(null)
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

  function wouldCreateCycle(fromId: number, toId: number) {
    const outgoing = new Map<number, number[]>()
    for (const edge of edges) {
      outgoing.set(edge.from_node_id, [...(outgoing.get(edge.from_node_id) ?? []), edge.to_node_id])
    }
    const visited = new Set<number>()
    const queue = [toId]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (current === fromId) return true
      if (visited.has(current)) continue
      visited.add(current)
      queue.push(...(outgoing.get(current) ?? []))
    }
    return false
  }

  function canCreateDependencyFrom(fromId: number | null, toId: number) {
    if (!fromId || fromId === toId) return false
    if (edges.some((edge) => edge.from_node_id === fromId && edge.to_node_id === toId)) return false
    return !wouldCreateCycle(fromId, toId)
  }

  function handleNodeActivate(node: PipelineNode) {
    if (connectSourceId) {
      const fromId = connectSourceId
      setConnectSourceId(null)
      setDropTargetId(null)
      setPreviewPoint(null)
      if (canCreateDependencyFrom(fromId, node.ID)) {
        onCreateDependency(fromId, node.ID)
      }
      return
    }
    onNodeClick(node)
  }

  function renderedCardWidth(nodeId: number) {
    return selectedNodeId === nodeId ? expandedCardWidth : compactCardWidth
  }

  function renderedCardHeight(nodeId: number) {
    return selectedNodeId === nodeId ? expandedCardHeight : compactCardHeight
  }

  function pointFromClient(clientX: number, clientY: number) {
    const rect = graphRef.current?.getBoundingClientRect()
    if (!rect) return null
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  function dependencyPath(startX: number, startY: number, endX: number, endY: number) {
    const bend = Math.max(40, Math.abs(endX - startX) / 2)
    return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`
  }

  function targetNodeIdFromPoint(clientX: number, clientY: number) {
    const element = document.elementFromPoint(clientX, clientY)
    const nodeElement = element?.closest('[data-dependency-node-id]') as HTMLElement | null
    const raw = nodeElement?.dataset.dependencyNodeId
    return raw ? Number(raw) : null
  }

  function startDependencyConnect(sourceId: number, e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    let didDrag = false

    const onPointerMove = (ev: PointerEvent) => {
      const distance = Math.hypot(ev.clientX - startX, ev.clientY - startY)
      if (!didDrag && distance < 4) return
      if (!didDrag) {
        didDrag = true
        setConnectSourceId(null)
        setDragSourceId(sourceId)
      }
      setPreviewPoint(pointFromClient(ev.clientX, ev.clientY))
      const targetId = targetNodeIdFromPoint(ev.clientX, ev.clientY)
      setDropTargetId(targetId && canCreateDependencyFrom(sourceId, targetId) ? targetId : null)
    }

    const onPointerUp = (ev: PointerEvent) => {
      if (didDrag) {
        const targetId = targetNodeIdFromPoint(ev.clientX, ev.clientY)
        if (targetId && canCreateDependencyFrom(sourceId, targetId)) {
          onCreateDependency(sourceId, targetId)
        }
        setDragSourceId(null)
        setDropTargetId(null)
        setPreviewPoint(null)
      } else {
        setConnectSourceId((current) => current === sourceId ? null : sourceId)
        setDropTargetId(null)
        setPreviewPoint(null)
      }
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
    }

    const onPointerCancel = () => {
      setDragSourceId(null)
      setDropTargetId(null)
      setPreviewPoint(null)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  }

  function startNodeMove(nodeId: number, e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button')) return
    const item = layout.itemById.get(nodeId)
    if (!item) return

    const startClientX = e.clientX
    const startClientY = e.clientY
    const startX = item.x
    const startY = item.y
    let didMove = false
    let lastPosition: DependencyNodePosition = { x: startX, y: startY }

    const onPointerMove = (ev: PointerEvent) => {
      ev.preventDefault()
      const dx = ev.clientX - startClientX
      const dy = ev.clientY - startClientY
      if (!didMove && Math.hypot(dx, dy) < 4) return
      didMove = true
      suppressNextNodeClickRef.current = true
      setConnectSourceId(null)
      setDropTargetId(null)
      setPreviewPoint(null)

      lastPosition = {
        x: Math.max(0, startX + dx),
        y: Math.max(0, startY + dy),
      }
      setLocalPositions((prev) => ({ ...prev, [nodeId]: lastPosition }))
    }

    const finish = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      if (didMove) {
        setLocalPositions((prev) => ({ ...prev, [nodeId]: lastPosition }))
        onMoveNode(nodeId, lastPosition.x, lastPosition.y)
        window.setTimeout(() => {
          suppressNextNodeClickRef.current = false
        }, 0)
      }
    }

    const cancel = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      suppressNextNodeClickRef.current = false
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background text-center">
        <Network size={28} className="text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">{t('pipeline.dependency.empty', { defaultValue: '暂无依赖关系' })}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">
            {t('pipeline.dependency.title', { defaultValue: '依赖 DAG' })}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t('pipeline.dependency.dragHint', { defaultValue: '拖动节点调整位置；从右侧端口拖到目标节点，或点端口后再点目标节点。' })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground">
            {t('pipeline.dependency.extraCount', { defaultValue: '额外依赖 {{count}} 条', count: extraDependencies.length })}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => {
              setLocalPositions({})
              onAutoArrange()
            }}
            disabled={isMutating}
          >
            <Network size={13} className="mr-1.5" />
            {t('pipeline.dependency.arrange', { defaultValue: '整理排列' })}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
      <div
        ref={graphRef}
        className="relative min-h-full min-w-full"
        style={{ width: layout.width, height: layout.height }}
        onMouseMove={(e) => {
          if (!connectSourceId || dragSourceId) return
          setPreviewPoint(pointFromClient(e.clientX, e.clientY))
          const targetId = targetNodeIdFromPoint(e.clientX, e.clientY)
          setDropTargetId(targetId && canCreateDependencyFrom(connectSourceId, targetId) ? targetId : null)
        }}
        onMouseLeave={() => {
          if (!connectSourceId) return
          setPreviewPoint(null)
          setDropTargetId(null)
        }}
        onClick={(e) => {
          if (e.target !== e.currentTarget) return
          setConnectSourceId(null)
          setDropTargetId(null)
          setPreviewPoint(null)
        }}
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
            const isDependency = edgeRelationType(edge) === EDGE_RELATION_DEPENDENCY
            const startX = from.x + renderedCardWidth(from.node.ID)
            const startY = from.y + renderedCardHeight(from.node.ID) / 2
            const endX = to.x
            const endY = to.y + renderedCardHeight(to.node.ID) / 2
            return (
              <path
                key={edge.ID}
                d={dependencyPath(startX, startY, endX, endY)}
                className={cn('fill-none', isDependency ? 'stroke-primary' : 'stroke-border')}
                strokeWidth={isDependency ? '2' : '1.5'}
                strokeDasharray={isDependency ? '5 4' : undefined}
                markerEnd="url(#pipeline-dependency-arrow)"
              />
            )
          })}
          {(() => {
            const sourceId = dragSourceId ?? connectSourceId
            const source = sourceId ? layout.itemById.get(sourceId) : undefined
            if (!source) return null
            const target = dropTargetId ? layout.itemById.get(dropTargetId) : undefined
            const startX = source.x + renderedCardWidth(source.node.ID)
            const startY = source.y + renderedCardHeight(source.node.ID) / 2
            const end = target
              ? { x: target.x, y: target.y + renderedCardHeight(target.node.ID) / 2 }
              : previewPoint
            if (!end) return null
            return (
              <path
                d={dependencyPath(startX, startY, end.x, end.y)}
                className="fill-none stroke-primary"
                strokeWidth="2"
                strokeDasharray="6 4"
                markerEnd="url(#pipeline-dependency-arrow)"
              />
            )
          })()}
        </svg>

        {layout.edges.map((edge) => {
          if (edgeRelationType(edge) !== EDGE_RELATION_DEPENDENCY) return null
          const from = layout.itemById.get(edge.from_node_id)
          const to = layout.itemById.get(edge.to_node_id)
          if (!from || !to) return null
          const x = (from.x + renderedCardWidth(from.node.ID) + to.x) / 2
          const y = (from.y + renderedCardHeight(from.node.ID) / 2 + to.y + renderedCardHeight(to.node.ID) / 2) / 2
          return (
            <button
              key={`delete-${edge.ID}`}
              type="button"
              className="absolute z-20 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:border-destructive/50 hover:text-destructive"
              style={{ left: x - 12, top: y - 12 }}
              onClick={() => onDeleteDependency(edge.ID)}
              disabled={isMutating}
              title={t('pipeline.dependency.delete', { defaultValue: '删除额外依赖' })}
            >
              <Trash2 size={12} />
            </button>
          )
        })}

        {layout.items.map((item) => {
          const node = item.node
          const meta = getPipelineNodeMeta(node.type)
          const status = NODE_STATUS_META[node.status] ?? NODE_STATUS_META.draft
          const Icon = meta.icon
          const typeLabel = t(`pipeline.nodeTypes.${node.type}.label`, { defaultValue: meta.label })
          const categoryLabel = t(`pipeline.categories.${meta.category}`, { defaultValue: meta.category })
          const isWork = isPipelineWorkNode(node.type)
          const isExpanded = selectedNodeId === node.ID
          const isDropTarget = dropTargetId === node.ID
          const isConnectSource = connectSourceId === node.ID

          return (
            <div
              key={node.ID}
              data-dependency-node-id={node.ID}
              role="button"
              tabIndex={0}
              className={cn(
                'absolute cursor-move rounded-md border bg-card text-left shadow-sm transition-[border-color,background-color,box-shadow,width,height,padding] hover:border-primary/40',
                isExpanded ? 'z-10 border-primary/60 bg-primary/5 p-2' : 'border-border px-2 py-1.5',
                isDropTarget && 'border-primary bg-primary/10 ring-2 ring-primary/30',
                isConnectSource && 'border-primary bg-primary/10 ring-2 ring-primary/30',
              )}
              style={{
                left: item.x,
                top: item.y,
                width: isExpanded ? expandedCardWidth : compactCardWidth,
                height: isExpanded ? expandedCardHeight : compactCardHeight,
                touchAction: 'none',
              }}
              onPointerDown={(e) => startNodeMove(node.ID, e)}
              onClick={() => {
                if (suppressNextNodeClickRef.current) return
                handleNodeActivate(node)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleNodeActivate(node)
                }
                if (e.key === 'Escape') setConnectSourceId(null)
              }}
            >
              <button
                type="button"
                className={cn(
                  'absolute -right-3 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 cursor-crosshair items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:border-primary hover:text-primary',
                  isConnectSource && 'border-primary bg-primary text-primary-foreground hover:text-primary-foreground',
                )}
                onPointerDown={(e) => startDependencyConnect(node.ID, e)}
                title={t('pipeline.dependency.startConnect', { defaultValue: '从这里拖拽或点击开始连线' })}
              >
                <Plus size={13} />
              </button>

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
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}

function PipelineFlowCard({
  node,
  selected,
  workspaceActive,
  expanded,
  onSelect,
  onEnterWorkspace,
  onDelete,
  onMoveBefore,
  onMoveAfter,
}: {
  node: PipelineNode
  selected?: boolean
  workspaceActive?: boolean
  expanded?: boolean
  onSelect: () => void
  onEnterWorkspace: () => void
  onDelete: () => void
  onMoveBefore?: () => void
  onMoveAfter?: () => void
}) {
  const { t, i18n } = useTranslation()
  const meta = getPipelineNodeMeta(node.type)
  const status = NODE_STATUS_META[node.status] ?? NODE_STATUS_META.draft
  const Icon = meta.icon
  const typeLabel = t(`pipeline.nodeTypes.${node.type}.label`, { defaultValue: meta.label })
  const categoryLabel = t(`pipeline.categories.${meta.category}`, { defaultValue: meta.category })
  const isCustomContent = node.content_type === 'custom' || !node.content_type
  const expandedCard = !!selected || !!workspaceActive

  return (
    <div
      className={cn(
        'group relative rounded-md border bg-card text-left shadow-sm transition-[border-color,background-color,box-shadow,min-height,padding]',
        expandedCard ? 'min-h-[64px] p-2' : 'min-h-9 px-1.5 py-1',
        selected ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/40',
        workspaceActive && 'ring-1 ring-primary/40',
      )}
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
      <div className="flex items-center gap-1.5">
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
                'bg-primary/10 text-primary',
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

        </div>
      </div>

      {expandedCard ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 pl-[34px]">
          {node.due_date ? (
            <span className="flex min-w-0 items-center gap-1 truncate text-[10px] text-muted-foreground">
              <CalendarDays size={10} />
              {new Date(node.due_date).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })}
            </span>
          ) : <span />}

          <div className="flex shrink-0 items-center gap-0.5">
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
