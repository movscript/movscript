import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Loader2, FileText, Layers, Camera, Settings2, Send, UserCircle, ChevronDown, CheckCircle, XCircle, RotateCcw, Package, Film, Clapperboard, CalendarDays } from 'lucide-react'
import { api } from '@/lib/api'
import {
  canManagePipelineNodeAssignment,
  canReviewPipelineNode,
  canSubmitPipelineNode,
  effectiveLeadId,
} from '@/lib/pipelinePermissions'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import type { Pipeline, PipelineNode, Script, Storyboard, Shot, Asset, Episode, Scene, FinalVideo, PipelineContentType, Project, ProjectMember } from '@/types'
import { Button } from '@movscript/ui'
import { cn } from '@/lib/utils'
import { ScriptWorkspace } from '@/pages/work/workspaces/ScriptWorkspace'
import { StoryboardWorkspace } from '@/pages/work/workspaces/StoryboardWorkspace'
import { ShotWorkspace } from '@/pages/work/workspaces/ShotWorkspace'
import { AssetWorkspace } from '@/pages/work/workspaces/AssetWorkspace'
import { EpisodeWorkspace } from '@/pages/work/workspaces/EpisodeWorkspace'
import { SceneWorkspace } from '@/pages/work/workspaces/SceneWorkspace'
import { MediaViewer } from '@/components/shared/MediaViewer'
import { useTranslation } from 'react-i18next'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { getPipelineNodeSpec, scriptTypeForPipelineNode, type PipelineEntityType } from './nodeSpec'

// ── Content type config ───────────────────────────────────────────────────────

type ContentItem = Script | Storyboard | Shot | Asset | Episode | Scene | FinalVideo

interface ContentTypeCfg {
  icon: React.ElementType
  entityType?: PipelineEntityType
  supportsAssignee?: boolean
  listKey: (pid: number) => (string | number)[]
  listFn: (pid: number, nodeId: string) => Promise<ContentItem[]>
  createFn: (pid: number, node: PipelineNode) => Promise<ContentItem>
  getLabel: (item: ContentItem) => string
  getSub: (item: ContentItem) => string
  getPatchUrl: (item: ContentItem) => string
  getAssigneeId: (item: ContentItem) => number | undefined
}

const CONTENT_TYPE_CONFIG: Record<PipelineContentType, ContentTypeCfg> = {
  script: {
    icon: FileText,
    entityType: 'script',
    supportsAssignee: true,
    listKey: (pid) => ['scripts', pid],
    listFn: (pid, nodeId) =>
      api.get(`/projects/${pid}/scripts?pipeline_node_id=${nodeId}`).then((r) => r.data),
    createFn: (pid, node) =>
      api.post(`/projects/${pid}/scripts`, {
        title: '新剧本',
        script_type: scriptTypeForPipelineNode(node.type),
        pipeline_node_id: node.ID,
      }).then((r) => r.data),
    getLabel: (item) => (item as Script).title,
    getSub: (item) => { const s = item as Script; return `${s.script_type} · ${s.status}` },
    getPatchUrl: (item) => `/scripts/${item.ID}`,
    getAssigneeId: (item) => (item as Script).assignee_id,
  },
  storyboard: {
    icon: Layers,
    entityType: 'storyboard',
    supportsAssignee: true,
    listKey: (pid) => ['storyboards', pid],
    listFn: (pid, nodeId) =>
      api.get(`/projects/${pid}/storyboards?pipeline_node_id=${nodeId}`).then((r) => r.data),
    createFn: (pid, node) =>
      api.post(`/projects/${pid}/storyboards`, {
        title: '新分镜',
        pipeline_node_id: node.ID,
      }).then((r) => r.data),
    getLabel: (item) => { const s = item as Storyboard; return s.title || `分镜 #${s.ID}` },
    getSub: (item) => (item as Storyboard).status ?? '',
    getPatchUrl: (item) => `/storyboards/${item.ID}`,
    getAssigneeId: (item) => (item as Storyboard).assignee_id,
  },
  shot: {
    icon: Camera,
    entityType: 'shot',
    supportsAssignee: true,
    listKey: (pid) => ['shots', pid],
    listFn: (pid, nodeId) =>
      api.get(`/projects/${pid}/shots?pipeline_node_id=${nodeId}`).then((r) => r.data),
    createFn: (pid, node) =>
      api.post(`/projects/${pid}/shots`, {
        description: '',
        pipeline_node_id: node.ID,
      }).then((r) => r.data),
    getLabel: (item) => { const s = item as Shot; return s.description || `镜头 #${s.ID}` },
    getSub: (item) => (item as Shot).status ?? '',
    getPatchUrl: (item) => `/shots/${item.ID}`,
    getAssigneeId: (item) => (item as Shot).assignee_id,
  },
  asset: {
    icon: Package,
    entityType: 'asset',
    listKey: (pid) => ['assets', pid],
    listFn: (pid, nodeId) =>
      api.get(`/projects/${pid}/assets?pipeline_node_id=${nodeId}`).then((r) => r.data),
    createFn: (pid, node) =>
      api.post(`/projects/${pid}/assets`, {
        name: '新素材',
        type: 'draft',
        description: '',
        pipeline_node_id: node.ID,
      }).then((r) => r.data),
    getLabel: (item) => (item as Asset).name,
    getSub: (item) => (item as Asset).type,
    getPatchUrl: (item) => `/projects/${(item as Asset).project_id}/assets/${item.ID}`,
    getAssigneeId: () => undefined,
  },
  episode: {
    icon: Film,
    entityType: 'episode',
    listKey: (pid) => ['episodes-project', pid],
    listFn: (pid, nodeId) =>
      api.get(`/projects/${pid}/episodes?pipeline_node_id=${nodeId}`).then((r) => r.data),
    createFn: (pid, node) =>
      api.post(`/projects/${pid}/episodes`, {
        title: node.name || '新剧集',
        synopsis: '',
        pipeline_node_id: node.ID,
      }).then((r) => r.data),
    getLabel: (item) => (item as Episode).title,
    getSub: (item) => { const e = item as Episode; return `EP${e.number} · ${e.status}` },
    getPatchUrl: (item) => `/episodes/${item.ID}`,
    getAssigneeId: () => undefined,
  },
  final_video: {
    icon: Film,
    entityType: 'final_video',
    listKey: (pid) => ['final-video', pid],
    listFn: (pid, nodeId) =>
      api.get(`/projects/${pid}/final-videos?pipeline_node_id=${nodeId}`).then((r) => r.data),
    createFn: (pid, node) =>
      api.post(`/projects/${pid}/final-videos`, {
        title: node.name || '成片',
        pipeline_node_id: node.ID,
      }).then((r) => r.data),
    getLabel: (item) => (item as FinalVideo).title || `成片 #${item.ID}`,
    getSub: (item) => (item as FinalVideo).status ?? '',
    getPatchUrl: (item) => `/final-videos/${item.ID}`,
    getAssigneeId: () => undefined,
  },
  scene: {
    icon: Clapperboard,
    entityType: 'scene',
    listKey: (pid) => ['scenes', pid],
    listFn: (pid, nodeId) =>
      api.get(`/projects/${pid}/scenes?pipeline_node_id=${nodeId}`).then((r) => r.data),
    createFn: (pid, node) =>
      api.post(`/projects/${pid}/scenes`, {
        title: node.name || '新分场',
        location: '',
        time_of_day: 'day',
        pipeline_node_id: node.ID,
      }).then((r) => r.data),
    getLabel: (item) => (item as Scene).title,
    getSub: (item) => { const s = item as Scene; return `${s.location || ''} · ${s.time_of_day || ''}` },
    getPatchUrl: (item) => `/scenes/${item.ID}`,
    getAssigneeId: () => undefined,
  },
  custom: {
    icon: Settings2,
    listKey: (pid) => ['custom', pid],
    listFn: async () => [],
    createFn: async () => ({ ID: 0 } as unknown as ContentItem),
    getLabel: () => '',
    getSub: () => '',
    getPatchUrl: () => '',
    getAssigneeId: () => undefined,
  },
}

// ── Assignee picker ───────────────────────────────────────────────────────────

function AssigneePicker({
  assigneeId,
  members,
  patchUrl,
  queryKey,
}: {
  assigneeId: number | undefined
  members: ProjectMember[]
  patchUrl: string
  queryKey: unknown[]
}) {
  const qc = useQueryClient()
  const assignMutation = useMutation({
    mutationFn: (userId: number | null) =>
      api.patch(patchUrl, { assignee_id: userId }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  const current = members.find((m) => m.user_id === assigneeId)

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground border border-border rounded-full px-1.5 py-0.5 hover:bg-muted transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <UserCircle size={10} />
          <span className="max-w-[60px] truncate">
            {current?.user?.username ?? '分配'}
          </span>
          <ChevronDown size={8} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[120px] bg-popover border border-border rounded-md shadow-md py-1 text-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu.Item
            className="px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted cursor-pointer outline-none"
            onSelect={() => assignMutation.mutate(null)}
          >
            未分配
          </DropdownMenu.Item>
          {members.map((m) => (
            <DropdownMenu.Item
              key={m.user_id}
              className={cn(
                'px-3 py-1.5 text-xs hover:bg-muted cursor-pointer outline-none',
                m.user_id === assigneeId ? 'font-medium text-foreground' : 'text-muted-foreground'
              )}
              onSelect={() => assignMutation.mutate(m.user_id)}
            >
              {m.user?.username ?? `用户 ${m.user_id}`}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

// ── List item ─────────────────────────────────────────────────────────────────

function ListItem({
  item,
  cfg,
  selected,
  onClick,
  queryKey,
  members,
}: {
  item: ContentItem
  cfg: ContentTypeCfg
  selected: boolean
  onClick: () => void
  queryKey: unknown[]
  members: ProjectMember[]
}) {
  const patchUrl = cfg.getPatchUrl(item)
  const assigneeId = cfg.getAssigneeId(item)

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 border-b border-border hover:bg-background transition-colors',
        selected ? 'bg-background border-l-2 border-l-primary' : ''
      )}
    >
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{cfg.getLabel(item)}</p>
          <p className="text-xs text-muted-foreground truncate">{cfg.getSub(item)}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {patchUrl && cfg.supportsAssignee ? (
            <AssigneePicker
              assigneeId={assigneeId}
              members={members}
              patchUrl={patchUrl}
              queryKey={queryKey}
            />
          ) : null}
        </div>
      </div>
    </button>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({
  contentType,
  item,
}: {
  contentType: PipelineContentType
  item: ContentItem
}) {
  if (contentType === 'script') return <ScriptWorkspace script={item as Script} />
  if (contentType === 'storyboard') return <StoryboardWorkspace storyboard={item as Storyboard} />
  if (contentType === 'shot') return <ShotWorkspace shot={item as Shot} />
  if (contentType === 'asset') return <AssetWorkspace asset={item as Asset} />
  if (contentType === 'episode') return <EpisodeWorkspace episode={item as Episode} />
  if (contentType === 'scene') return <SceneWorkspace scene={item as Scene} />
  if (contentType === 'final_video') return <FinalVideoWorkspace video={item as FinalVideo} />
  return null
}

function FinalVideoWorkspace({ video }: { video: FinalVideo }) {
  const { t } = useTranslation()
  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground truncate">{video.title || t('pages.finalVideos.defaultTitle')}</h2>
          {video.description && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{video.description}</p>}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{video.status}</span>
      </div>
      {video.resource ? (
        <MediaViewer resource={video.resource} fit="contain" className="aspect-video w-full rounded-lg" />
      ) : (
        <div className="aspect-video rounded-lg bg-muted flex items-center justify-center text-sm text-muted-foreground">
          {t('pages.finalVideos.noMedia')}
        </div>
      )}
    </div>
  )
}

function ArtifactDetailArea({
  contentType,
  cfg,
  item,
  itemsLoading,
  canCreate,
  creating,
  onCreate,
}: {
  contentType: PipelineContentType
  cfg: ContentTypeCfg
  item: ContentItem | null
  itemsLoading: boolean
  canCreate: boolean
  creating: boolean
  onCreate: () => void
}) {
  const { t } = useTranslation()
  const Icon = cfg.icon

  if (itemsLoading) {
    return (
      <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center">
        <Loader2 size={18} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (contentType === 'custom') {
    return (
      <div className="flex-1 min-w-0 min-h-0 flex flex-col items-center justify-center gap-2">
        <Settings2 size={24} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('pipeline.workspace.customHint')}</p>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="flex-1 min-w-0 min-h-0 flex flex-col items-center justify-center gap-3">
        <Icon size={28} className="text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{t('pipeline.workspace.empty')}</p>
        {canCreate ? (
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={onCreate}
            disabled={creating}
          >
            {creating ? (
              <Loader2 size={12} className="animate-spin mr-1.5" />
            ) : (
              <Plus size={12} className="mr-1.5" />
            )}
            {t('pipeline.workspace.createFirst', { type: t(`pipeline.contentTypes.${contentType}`) })}
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
      <DetailPanel contentType={contentType} item={item} />
    </div>
  )
}

function ChildNodeListItem({
  node,
  selected,
  onClick,
}: {
  node: PipelineNode
  selected: boolean
  onClick: () => void
}) {
  const { t } = useTranslation()
  const spec = getPipelineNodeSpec(node.type)
  const cfg = CONTENT_TYPE_CONFIG[spec.contentType]
  const Icon = cfg?.icon ?? Settings2

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 border-b border-border hover:bg-background transition-colors',
        selected ? 'bg-background border-l-2 border-l-primary' : '',
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon size={14} className="text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{node.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {t(`pipeline.contentTypes.${spec.contentType}`)}
            {node.entity_id ? ` · #${node.entity_id}` : ''}
          </p>
        </div>
      </div>
    </button>
  )
}

// ── Node ownership ────────────────────────────────────────────────────────────

function NodeOwnershipPanel({
  projectId,
  project,
  node,
  members,
  currentUserId,
  pipeline,
}: {
  projectId?: number
  project?: Project | null
  node: PipelineNode | null
  members: ProjectMember[]
  currentUserId?: number
  pipeline?: Pipeline
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const updateNode = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put(`/pipeline/nodes/${node!.ID}`, body).then((r) => r.data),
    onSuccess: (updated) => {
      qc.setQueryData(['pipeline-node', String(node?.ID)], updated)
      qc.invalidateQueries({ queryKey: ['pipeline', projectId] })
    },
  })

  if (!node) return null

  const assignee = members.find((member) => member.user_id === node.assignee_id)?.user?.username ?? '未分配'
  const lead = members.find((member) => member.user_id === node.lead_id)?.user?.username ?? '未指定'
  const fallbackLead = effectiveLeadId(node, project, pipeline)
  const fallbackLeadName = fallbackLead
    ? members.find((member) => member.user_id === fallbackLead)?.user?.username ?? `用户 ${fallbackLead}`
    : undefined
  const canManageAssignment = canManagePipelineNodeAssignment({ node, project, members, currentUserId, pipeline })
  const dueDateValue = node.due_date ? node.due_date.slice(0, 10) : ''

  function updateUserField(field: 'assignee_id' | 'lead_id', value: string) {
    updateNode.mutate({ [field]: value ? Number(value) : null })
  }

  return (
    <aside className="w-80 shrink-0 border-l border-border bg-card flex flex-col min-h-0">
      <div className="px-3 py-2.5 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">节点协作</p>
          <span className="text-xs text-muted-foreground">{node.status}</span>
        </div>
      </div>

      <div className="p-3 space-y-3 text-sm">
        <div className="rounded-md border border-border bg-background p-3">
          <p className="font-medium text-foreground line-clamp-2">{node.name}</p>
          {node.description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-4">{node.description}</p>}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>执行：{node.assignee_id ? assignee : fallbackLeadName ? `未分配（${fallbackLeadName} 兜底）` : assignee}</span>
            <span>负责：{lead}</span>
            {node.entity_type && <span>{node.entity_type} #{node.entity_id ?? '-'}</span>}
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs text-muted-foreground">执行者</span>
          <select
            className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
            value={node.assignee_id ?? ''}
            onChange={(event) => updateUserField('assignee_id', event.target.value)}
            disabled={updateNode.isPending || !canManageAssignment}
          >
            <option value="">未分配</option>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>{member.user?.username ?? `用户 ${member.user_id}`}</option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs text-muted-foreground">负责人</span>
          <select
            className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
            value={node.lead_id ?? ''}
            onChange={(event) => updateUserField('lead_id', event.target.value)}
            disabled={updateNode.isPending || !canManageAssignment}
          >
            <option value="">未指定</option>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>{member.user?.username ?? `用户 ${member.user_id}`}</option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs text-muted-foreground">截止日期</span>
          <div className="relative">
            <CalendarDays size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="date"
              className="w-full h-8 rounded-md border border-border bg-background pl-7 pr-2 text-xs"
              value={dueDateValue}
              onChange={(event) => updateNode.mutate({ due_date: event.target.value ? new Date(`${event.target.value}T00:00:00`).toISOString() : null })}
              disabled={updateNode.isPending || !canManageAssignment}
            />
          </div>
        </label>

        <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => navigate(`/pipeline/nodes/${node.ID}`)}>
          <CheckCircle size={14} />
          打开节点工作台
        </Button>
      </div>
    </aside>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface StageWorkspaceContentProps {
  nodeId?: string | number
  embedded?: boolean
  onBack?: () => void
}

export function StageWorkspaceContent({
  nodeId: nodeIdProp,
  embedded = false,
  onBack,
}: StageWorkspaceContentProps) {
  const params = useParams<{ nodeId: string }>()
  const nodeId = nodeIdProp ? String(nodeIdProp) : params.nodeId
  const navigate = useNavigate()
  const { t } = useTranslation()
  const qc = useQueryClient()
  const project = useProjectStore((s) => s.current)
  const currentUser = useUserStore((s) => s.currentUser)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedChildNodeId, setSelectedChildNodeId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)

  const nodeQueryKey = ['pipeline-node', nodeId]

  const { data: node, isLoading: nodeLoading } = useQuery<PipelineNode>({
    queryKey: nodeQueryKey,
    queryFn: () => api.get(`/pipeline/nodes/${nodeId}`).then((r) => r.data),
    enabled: !!nodeId,
  })

  const { data: members = [] } = useQuery<ProjectMember[]>({
    queryKey: ['project-members', project?.ID],
    queryFn: () => api.get(`/projects/${project!.ID}/members`).then((r) => r.data),
    enabled: !!project?.ID,
  })

  const nodeSpec = getPipelineNodeSpec(node?.type ?? 'custom')
  const isWorkNode = nodeSpec.category === 'work'
  const isArtifactNode = nodeSpec.category === 'artifact'

  const { data: pipeline, isLoading: pipelineLoading } = useQuery<Pipeline>({
    queryKey: ['pipeline', project?.ID],
    queryFn: () => api.get(`/projects/${project!.ID}/pipeline`).then((r) => r.data),
    enabled: !!project?.ID && !!nodeId,
  })

  const childNodes = useMemo(() => {
    if (!pipeline || !node) return []
    const nodeMap = new Map(pipeline.nodes.map((item) => [item.ID, item]))
    return pipeline.edges
      .filter((edge) => edge.from_node_id === node.ID)
      .map((edge) => nodeMap.get(edge.to_node_id))
      .filter((item): item is PipelineNode => !!item && getPipelineNodeSpec(item.type).category === 'artifact')
      .sort((a, b) => a.ID - b.ID)
  }, [pipeline, node])

  const selectedChildNode = isWorkNode
    ? childNodes.find((item) => item.ID === selectedChildNodeId) ?? childNodes[0] ?? null
    : null
  const detailNode = isWorkNode ? selectedChildNode : node ?? null
  const contentType: PipelineContentType = (detailNode?.content_type as PipelineContentType) ?? 'custom'
  const cfg = CONTENT_TYPE_CONFIG[contentType]
  const detailNodeId = detailNode?.ID ? String(detailNode.ID) : ''
  const listQueryKey = [...cfg.listKey(project?.ID ?? 0), detailNodeId]

  const { data: items = [], isLoading: itemsLoading } = useQuery<ContentItem[]>({
    queryKey: listQueryKey,
    queryFn: () => cfg.listFn(project!.ID, detailNodeId),
    enabled: !!project && !!detailNodeId && contentType !== 'custom',
  })

  const linkedScriptId =
    contentType === 'script' && detailNode?.entity_type === 'script' && detailNode.entity_id
      ? detailNode.entity_id
      : null
  const { data: linkedScript, isLoading: linkedScriptLoading } = useQuery<Script>({
    queryKey: ['script-linked-entity', project?.ID, linkedScriptId],
    queryFn: () => api.get(`/projects/${project!.ID}/scripts/${linkedScriptId}`).then((r) => r.data),
    enabled: !!project && !!linkedScriptId && !items.some((item) => item.ID === linkedScriptId),
  })

  const createMutation = useMutation({
    mutationFn: () => cfg.createFn(project!.ID, detailNode!),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: listQueryKey })
      if (cfg.entityType && created.ID) {
        api.put(`/pipeline/nodes/${detailNode!.ID}`, {
          entity_type: cfg.entityType,
          entity_id: created.ID,
        }).then((r) => {
          if (detailNode?.ID === node?.ID) qc.setQueryData(nodeQueryKey, r.data)
          qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
        }).catch(() => {/* keep the created content even if node link refresh fails */})
      }
      setSelectedId(created.ID)
    },
    onSettled: () => setCreating(false),
  })

  const submitNode = useMutation({
    mutationFn: () => api.post(`/pipeline/nodes/${nodeId}/submit`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nodeQueryKey })
      qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
    },
  })
  const approveNode = useMutation({
    mutationFn: () => api.post(`/pipeline/nodes/${nodeId}/approve`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nodeQueryKey })
      qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
    },
  })
  const rejectNode = useMutation({
    mutationFn: () => api.post(`/pipeline/nodes/${nodeId}/reject`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nodeQueryKey })
      qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
    },
  })
  const reopenNode = useMutation({
    mutationFn: () => api.post(`/pipeline/nodes/${nodeId}/reopen`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nodeQueryKey })
      qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
    },
  })

  useEffect(() => {
    setSelectedId(null)
    setSelectedChildNodeId(null)
  }, [nodeId])

  const linkedItem = detailNode?.entity_id
    ? items.find((item) => item.ID === detailNode.entity_id)
    : undefined
  const selected = linkedItem ?? linkedScript ?? items.find((i) => i.ID === selectedId) ?? items[0] ?? null
  const isLoadingSelectedItem = itemsLoading || linkedScriptLoading

  if (nodeLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  const headerContentType: PipelineContentType = (node?.content_type as PipelineContentType) ?? 'custom'
  const HeaderIcon = CONTENT_TYPE_CONFIG[headerContentType].icon
  const nodeStatus = node?.status ?? 'draft'
  const canSubmitNode = node ? canSubmitPipelineNode({ node, project, members, currentUserId: currentUser?.ID, pipeline }) : false
  const canReviewNode = node ? canReviewPipelineNode({ node, project, members, currentUserId: currentUser?.ID, pipeline }) : false

  const NODE_STATUS_BADGE: Record<string, string> = {
    draft:        'bg-muted text-muted-foreground',
    under_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    rejected:     'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    final:        'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className={cn('flex items-center gap-3 border-b border-border shrink-0', embedded ? 'px-3 py-2' : 'px-4 py-3')}>
        <button
          onClick={() => onBack ? onBack() : navigate('/pipeline')}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {embedded ? <XCircle size={15} /> : <ArrowLeft size={16} />}
        </button>
        <HeaderIcon size={15} className="text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{node?.name}</p>
          <p className="text-xs text-muted-foreground">
            {t(`pipeline.contentTypes.${headerContentType}`)}
          </p>
        </div>

        {/* Node status badge */}
        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', NODE_STATUS_BADGE[nodeStatus] ?? NODE_STATUS_BADGE.draft)}>
          {t(`pipeline.status.${nodeStatus}`)}
        </span>

        {/* Node state-machine actions */}
        {nodeStatus === 'draft' && canSubmitNode && (
          <button
            onClick={() => submitNode.mutate()}
            disabled={submitNode.isPending}
            className="flex items-center gap-1 text-[11px] font-medium text-amber-600 hover:text-amber-700 border border-amber-200 hover:bg-amber-50 rounded-full px-2.5 py-1 transition-colors"
          >
            {submitNode.isPending ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
            {t('pipeline.node.actions.submit')}
          </button>
        )}
        {nodeStatus === 'under_review' && canReviewNode && (
          <>
            <button
              onClick={() => approveNode.mutate()}
              disabled={approveNode.isPending}
              className="flex items-center gap-1 text-[11px] font-medium text-green-600 hover:text-green-700 border border-green-200 hover:bg-green-50 rounded-full px-2.5 py-1 transition-colors"
            >
              {approveNode.isPending ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />}
              {t('pipeline.node.actions.approve')}
            </button>
            <button
              onClick={() => rejectNode.mutate()}
              disabled={rejectNode.isPending}
              className="flex items-center gap-1 text-[11px] font-medium text-red-600 hover:text-red-700 border border-red-200 hover:bg-red-50 rounded-full px-2.5 py-1 transition-colors"
            >
              {rejectNode.isPending ? <Loader2 size={10} className="animate-spin" /> : <XCircle size={10} />}
              {t('pipeline.node.actions.reject')}
            </button>
          </>
        )}
        {(nodeStatus === 'rejected' || nodeStatus === 'final') && canReviewNode && (
          <button
            onClick={() => reopenNode.mutate()}
            disabled={reopenNode.isPending}
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-full px-2.5 py-1 transition-colors"
          >
            {reopenNode.isPending ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
            {t('pipeline.node.actions.reopen')}
          </button>
        )}

        {isArtifactNode && contentType !== 'custom' && cfg.entityType && !node?.entity_id && (
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => { setCreating(true); createMutation.mutate() }}
            disabled={creating || createMutation.isPending}
          >
            {(creating || createMutation.isPending) ? (
              <Loader2 size={12} className="animate-spin mr-1.5" />
            ) : (
              <Plus size={12} className="mr-1.5" />
            )}
            {t('common.create')}
          </Button>
        )}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {isWorkNode ? (
          <>
            <div className="w-72 shrink-0 border-r border-border bg-card overflow-hidden">
              <div className="h-full overflow-y-auto">
                {pipelineLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 size={16} className="animate-spin text-muted-foreground" />
                  </div>
                ) : childNodes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-2 px-4 text-center">
                    <Layers size={26} className="text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">{t('pipeline.workspace.empty')}</p>
                  </div>
                ) : (
                  childNodes.map((child) => (
                    <ChildNodeListItem
                      key={child.ID}
                      node={child}
                      selected={selectedChildNode?.ID === child.ID}
                      onClick={() => { setSelectedChildNodeId(child.ID); setSelectedId(null) }}
                    />
                  ))
                )}
              </div>
            </div>
            <ArtifactDetailArea
              contentType={contentType}
              cfg={cfg}
              item={selected}
              itemsLoading={isLoadingSelectedItem}
              canCreate={!!selectedChildNode && contentType !== 'custom' && !detailNode?.entity_id}
              creating={creating || createMutation.isPending}
              onCreate={() => { setCreating(true); createMutation.mutate() }}
            />
            <NodeOwnershipPanel
              projectId={project?.ID}
              project={project}
              node={detailNode}
              members={members}
              currentUserId={currentUser?.ID}
              pipeline={pipeline}
            />
          </>
        ) : (
          <>
            <ArtifactDetailArea
              contentType={contentType}
              cfg={cfg}
              item={selected}
              itemsLoading={isLoadingSelectedItem}
              canCreate={isArtifactNode && contentType !== 'custom' && !detailNode?.entity_id}
              creating={creating || createMutation.isPending}
              onCreate={() => { setCreating(true); createMutation.mutate() }}
            />
            <NodeOwnershipPanel
              projectId={project?.ID}
              project={project}
              node={detailNode}
              members={members}
              currentUserId={currentUser?.ID}
              pipeline={pipeline}
            />
          </>
        )}
      </div>
    </div>
  )
}

export default function StageWorkspacePage() {
  return <StageWorkspaceContent />
}
