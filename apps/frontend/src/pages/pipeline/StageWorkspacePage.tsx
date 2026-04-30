import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Loader2, FileText, Layers, Camera, Settings2, UserCircle, ChevronDown, XCircle, Package, Film, Clapperboard } from 'lucide-react'
import { api } from '@/lib/api'
import {
  canManagePipelineNodeAssignment,
  effectiveLeadId,
  projectRoleFor,
} from '@/lib/pipelinePermissions'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import type { Pipeline, PipelineNode, Script, Storyboard, Shot, Asset, Episode, Scene, FinalVideo, PipelineContentType, Project, ProjectMember, ResourceBinding } from '@/types'
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
import { scriptTypeForPipelineNode, type PipelineEntityType } from './nodeSpec'
import { ArtifactWorkspaceFrame } from '@/pages/work/ArtifactWorkspaceFrame'

// ── Content type config ───────────────────────────────────────────────────────

type ContentItem = Script | Storyboard | Shot | Asset | Episode | Scene | FinalVideo

const ASSIGNMENT_LOG = '[movscript:pipeline-assignment]'

console.log(ASSIGNMENT_LOG, 'stage-workspace.module-loaded')

function apiErrorPayload(error: unknown) {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number; data?: unknown } }).response
    return { status: response?.status, data: response?.data }
  }
  return error
}

function projectMembersWithOwner(members: ProjectMember[], project?: Project | null) {
  if (!project?.owner_id || members.some((member) => member.user_id === project.owner_id)) {
    return members
  }
  return [
    {
      ID: 0,
      project_id: project.ID,
      user_id: project.owner_id,
      user: project.owner,
      role: 'owner',
    } satisfies ProjectMember,
    ...members,
  ]
}

function memberName(members: ProjectMember[], userId?: number) {
  if (!userId) return ''
  return members.find((member) => member.user_id === userId)?.user?.username ?? `用户 ${userId}`
}

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
    getSub: (item) => (item as Script).script_type,
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
    getSub: (item) => (item as Storyboard).description,
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
    getSub: (item) => { const e = item as Episode; return `EP${e.number}` },
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
    getSub: () => '',
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
        pipeline_node_id: node.ID,
      }).then((r) => r.data),
    getLabel: (item) => (item as Scene).title,
    getSub: (item) => `场景 ${(item as Scene).number}`,
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
    onMutate: (userId) => {
      console.log(ASSIGNMENT_LOG, 'artifact-assignee.request', { patchUrl, userId, queryKey })
    },
    onSuccess: (data, userId) => {
      console.log(ASSIGNMENT_LOG, 'artifact-assignee.success', { patchUrl, userId, data })
      qc.invalidateQueries({ queryKey })
    },
    onError: (error, userId) => {
      console.error(ASSIGNMENT_LOG, 'artifact-assignee.error', { patchUrl, userId, error: apiErrorPayload(error) })
    },
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
  node,
  pipeline,
  members,
  onNodeUpdated,
}: {
  contentType: PipelineContentType
  item: ContentItem
  node?: PipelineNode
  pipeline?: Pipeline
  members: ProjectMember[]
  onNodeUpdated: (node: PipelineNode) => void
}) {
  const frameProps = { node, pipeline, members, onNodeUpdated }
  if (contentType === 'script') return <ScriptWorkspace script={item as Script} {...frameProps} />
  if (contentType === 'storyboard') return <StoryboardWorkspace storyboard={item as Storyboard} {...frameProps} />
  if (contentType === 'shot') return <ShotWorkspace shot={item as Shot} {...frameProps} />
  if (contentType === 'asset') return <AssetWorkspace asset={item as Asset} {...frameProps} />
  if (contentType === 'episode') return <EpisodeWorkspace episode={item as Episode} {...frameProps} />
  if (contentType === 'scene') return <SceneWorkspace scene={item as Scene} {...frameProps} />
  if (contentType === 'final_video') return <FinalVideoWorkspace video={item as FinalVideo} {...frameProps} />
  return null
}

function FinalVideoWorkspace({
  video,
  node,
  pipeline,
  members,
  onNodeUpdated,
}: {
  video: FinalVideo
  node?: PipelineNode
  pipeline?: Pipeline
  members?: ProjectMember[]
  onNodeUpdated?: (node: PipelineNode) => void
}) {
  const { t } = useTranslation()
  const projectId = useProjectStore((s) => s.current?.ID)
  const { data: bindings = [] } = useQuery<ResourceBinding[]>({
    queryKey: ['resource-bindings', projectId, 'final_video', video.ID, 'final'],
    queryFn: () => api.get(`/projects/${projectId}/entities/final_video/${video.ID}/resources`, { params: { role: 'final' } }).then((r) => r.data),
    enabled: !!projectId,
  })
  const resource = bindings.find((binding) => binding.resource)?.resource
  return (
    <ArtifactWorkspaceFrame
      kind="final_video"
      title={video.title || t('pages.finalVideos.defaultTitle')}
      subtitle={video.description}
      node={node}
      pipeline={pipeline}
      members={members}
      onNodeUpdated={onNodeUpdated}
    >
      <div className="h-full overflow-y-auto p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground truncate">{video.title || t('pages.finalVideos.defaultTitle')}</h2>
            {video.description && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{video.description}</p>}
          </div>
        </div>
        {resource ? (
          <MediaViewer resource={resource} fit="contain" className="aspect-video w-full rounded-lg" />
        ) : (
          <div className="aspect-video rounded-lg bg-muted flex items-center justify-center text-sm text-muted-foreground">
            {t('pages.finalVideos.noMedia')}
          </div>
        )}
      </div>
    </ArtifactWorkspaceFrame>
  )
}

function ContentDetailArea({
  contentType,
  cfg,
  item,
  node,
  pipeline,
  members,
  itemsLoading,
  canCreate,
  creating,
  onCreate,
  onNodeUpdated,
}: {
  contentType: PipelineContentType
  cfg: ContentTypeCfg
  item: ContentItem | null
  node?: PipelineNode
  pipeline?: Pipeline
  members: ProjectMember[]
  itemsLoading: boolean
  canCreate: boolean
  creating: boolean
  onCreate: () => void
  onNodeUpdated: (node: PipelineNode) => void
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
      <DetailPanel
        contentType={contentType}
        item={item}
        node={node}
        pipeline={pipeline}
        members={members}
        onNodeUpdated={onNodeUpdated}
      />
    </div>
  )
}

// ── Node assignment ───────────────────────────────────────────────────────────

function NodeAssignmentControls({
  project,
  node,
  members,
  currentUserId,
  pipeline,
  onNodeUpdated,
}: {
  project?: Project | null
  node: PipelineNode
  members: ProjectMember[]
  currentUserId?: number
  pipeline?: Pipeline
  onNodeUpdated: (node: PipelineNode) => void
}) {
  const updateNode = useMutation({
    mutationFn: (body: Record<string, number | null>) =>
      api.put(`/pipeline/nodes/${node.ID}`, body).then((r) => r.data as PipelineNode),
    onMutate: (body) => {
      console.log(ASSIGNMENT_LOG, 'workspace-assignment.request', {
        nodeId: node.ID,
        body,
        currentUserId,
      })
    },
    onSuccess: (updated, body) => {
      console.log(ASSIGNMENT_LOG, 'workspace-assignment.success', { nodeId: node.ID, body, updated })
      onNodeUpdated(updated)
    },
    onError: (error, body) => {
      console.error(ASSIGNMENT_LOG, 'workspace-assignment.error', {
        nodeId: node.ID,
        body,
        error: apiErrorPayload(error),
      })
    },
  })

  const fallbackLead = effectiveLeadId(node, project, pipeline)
  const fallbackLeadName = fallbackLead
    ? memberName(members, fallbackLead) || `用户 ${fallbackLead}`
    : undefined
  const canManageAssignment = canManagePipelineNodeAssignment({ node, project, members, currentUserId, pipeline })
  const projectRole = projectRoleFor(project, members, currentUserId)

  useEffect(() => {
    console.log(ASSIGNMENT_LOG, 'workspace-assignment.render', {
      node: {
        ID: node.ID,
        project_id: node.project_id,
        type: node.type,
        status: node.status,
        assignee_id: node.assignee_id,
        lead_id: node.lead_id,
      },
      project: project ? { ID: project.ID, owner_id: project.owner_id } : null,
      currentUserId,
      projectRole,
      canManageAssignment,
      fallbackLead,
      members: members.map((member) => ({
        ID: member.ID,
        user_id: member.user_id,
        role: member.role,
        username: member.user?.username,
      })),
      pipelineLoaded: !!pipeline,
    })
  }, [
    canManageAssignment,
    currentUserId,
    fallbackLead,
    members,
    node.ID,
    node.assignee_id,
    node.lead_id,
    node.project_id,
    node.status,
    node.type,
    pipeline,
    project,
    projectRole,
  ])

  function updateUserField(field: 'assignee_id' | 'lead_id', value: string) {
    console.log(ASSIGNMENT_LOG, 'workspace-assignment.change', {
      nodeId: node.ID,
      field,
      rawValue: value,
      nextValue: value ? Number(value) : null,
      disabled: updateNode.isPending || !canManageAssignment,
    })
    updateNode.mutate({ [field]: value ? Number(value) : null })
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>执行</span>
        <select
          className="h-7 w-32 rounded-md border border-border bg-background px-2 text-xs text-foreground disabled:opacity-60"
          value={node.assignee_id ?? ''}
          onChange={(event) => updateUserField('assignee_id', event.target.value)}
          disabled={updateNode.isPending || !canManageAssignment}
          title={!canManageAssignment ? '当前用户没有分配权限' : undefined}
        >
          <option value="">{fallbackLeadName ? `未分配（${fallbackLeadName}）` : '未分配'}</option>
          {members.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.user?.username ?? `用户 ${member.user_id}`}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>负责</span>
          <select
            className="h-7 w-32 rounded-md border border-border bg-background px-2 text-xs text-foreground disabled:opacity-60"
            value={node.lead_id ?? ''}
            onChange={(event) => updateUserField('lead_id', event.target.value)}
            disabled={updateNode.isPending || !canManageAssignment}
            title={!canManageAssignment ? '当前用户没有分配权限' : undefined}
          >
            <option value="">未指定</option>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>{member.user?.username ?? `用户 ${member.user_id}`}</option>
            ))}
          </select>
      </label>
    </div>
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
  const assignmentMembers = useMemo(() => projectMembersWithOwner(members, project), [members, project])

  const { data: pipeline } = useQuery<Pipeline>({
    queryKey: ['pipeline', project?.ID],
    queryFn: () => api.get(`/projects/${project!.ID}/pipeline`).then((r) => r.data),
    enabled: !!project?.ID && !!nodeId,
  })

  const detailNode = node ?? null
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

  useEffect(() => {
    setSelectedId(null)
  }, [nodeId])

  const linkedItem = detailNode?.entity_id
    ? items.find((item) => item.ID === detailNode.entity_id)
    : undefined
  const selected = linkedItem ?? linkedScript ?? items.find((i) => i.ID === selectedId) ?? items[0] ?? null
  const isLoadingSelectedItem = itemsLoading || linkedScriptLoading

  useEffect(() => {
    if (!nodeId) return
    console.log(ASSIGNMENT_LOG, 'workspace-page.state', {
      nodeId,
      embedded,
      nodeLoading,
      node: node ? {
        ID: node.ID,
        project_id: node.project_id,
        type: node.type,
        content_type: node.content_type,
        status: node.status,
        assignee_id: node.assignee_id,
        lead_id: node.lead_id,
        entity_type: node.entity_type,
        entity_id: node.entity_id,
      } : null,
      project: project ? { ID: project.ID, owner_id: project.owner_id } : null,
      currentUserId: currentUser?.ID,
      rawMemberCount: members.length,
      assignmentMemberCount: assignmentMembers.length,
      pipelineLoaded: !!pipeline,
      pipelineNodeCount: pipeline?.nodes?.length,
    })
  }, [
    assignmentMembers.length,
    currentUser?.ID,
    embedded,
    members.length,
    node,
    nodeId,
    nodeLoading,
    pipeline,
    project,
  ])

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

        {detailNode && (
          <NodeAssignmentControls
            project={project}
            node={detailNode}
            members={assignmentMembers}
            currentUserId={currentUser?.ID}
            pipeline={pipeline}
            onNodeUpdated={(updated) => {
              qc.setQueryData(nodeQueryKey, updated)
              qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
            }}
          />
        )}

        <span className={cn('shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full', NODE_STATUS_BADGE[nodeStatus] ?? NODE_STATUS_BADGE.draft)}>
          {t(`pipeline.status.${nodeStatus}`)}
        </span>

        {contentType !== 'custom' && cfg.entityType && !detailNode?.entity_id && (
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
        <ContentDetailArea
          contentType={contentType}
          cfg={cfg}
          item={selected}
          node={detailNode ?? undefined}
          pipeline={pipeline}
          members={assignmentMembers}
          itemsLoading={isLoadingSelectedItem}
          canCreate={contentType !== 'custom' && !!cfg.entityType && !detailNode?.entity_id}
          creating={creating || createMutation.isPending}
          onCreate={() => { setCreating(true); createMutation.mutate() }}
          onNodeUpdated={(updated) => {
            qc.setQueryData(nodeQueryKey, updated)
            qc.invalidateQueries({ queryKey: ['pipeline', project?.ID] })
          }}
        />
      </div>
    </div>
  )
}

export default function StageWorkspacePage() {
  return <StageWorkspaceContent />
}
