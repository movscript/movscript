import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Loader2, FileText, Layers, Camera, Settings2, Send, UserCircle, ChevronDown, CheckCircle, XCircle, RotateCcw, Package } from 'lucide-react'
import { api } from '@/lib/api'
import { useProjectStore } from '@/store/projectStore'
import type { PipelineNode, Script, Storyboard, Shot, Asset, PipelineContentType, ReviewStatus, ProjectMember } from '@/types'
import { Button } from '@movscript/ui'
import { cn } from '@/lib/utils'
import { ReviewStatusBadge } from '@/components/detail'
import { ScriptWorkspace } from '@/pages/work/workspaces/ScriptWorkspace'
import { StoryboardWorkspace } from '@/pages/work/workspaces/StoryboardWorkspace'
import { ShotWorkspace } from '@/pages/work/workspaces/ShotWorkspace'
import { AssetWorkspace } from '@/pages/work/workspaces/AssetWorkspace'
import { useTranslation } from 'react-i18next'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

// ── Content type config ───────────────────────────────────────────────────────

type ContentItem = Script | Storyboard | Shot | Asset

interface ContentTypeCfg {
  icon: React.ElementType
  listKey: (pid: number) => (string | number)[]
  listFn: (pid: number, nodeId: string) => Promise<ContentItem[]>
  createFn: (pid: number, node: PipelineNode) => Promise<ContentItem>
  getLabel: (item: ContentItem) => string
  getSub: (item: ContentItem) => string
  getReviewStatus: (item: ContentItem) => ReviewStatus | undefined
  getApiUrl: (item: ContentItem) => string
  getPatchUrl: (item: ContentItem) => string
  getAssigneeId: (item: ContentItem) => number | undefined
}

function scriptTypeForPipelineNode(type: string): Script['script_type'] {
  if (type === 'episode_writing' || type === 'episode_script') return 'episode'
  if (type === 'scene_writing' || type === 'scene_script') return 'scene'
  return 'main'
}

const CONTENT_TYPE_CONFIG: Record<PipelineContentType, ContentTypeCfg> = {
  script: {
    icon: FileText,
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
    getReviewStatus: (item) => (item as Script).review_status,
    getApiUrl: (item) => `/scripts/${item.ID}`,
    getPatchUrl: (item) => `/scripts/${item.ID}`,
    getAssigneeId: (item) => (item as Script).assignee_id,
  },
  storyboard: {
    icon: Layers,
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
    getReviewStatus: (item) => (item as Storyboard).review_status,
    getApiUrl: (item) => `/storyboards/${item.ID}`,
    getPatchUrl: (item) => `/storyboards/${item.ID}`,
    getAssigneeId: (item) => (item as Storyboard).assignee_id,
  },
  shot: {
    icon: Camera,
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
    getReviewStatus: (item) => (item as Shot).review_status,
    getApiUrl: (item) => `/shots/${item.ID}`,
    getPatchUrl: (item) => `/shots/${item.ID}`,
    getAssigneeId: (item) => (item as Shot).assignee_id,
  },
  asset: {
    icon: Package,
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
    getReviewStatus: (item) => (item as Asset).review_status,
    getApiUrl: (item) => `/projects/${(item as Asset).project_id}/assets/${item.ID}`,
    getPatchUrl: () => '',
    getAssigneeId: () => undefined,
  },
  custom: {
    icon: Settings2,
    listKey: (pid) => ['custom', pid],
    listFn: async () => [],
    createFn: async () => ({ ID: 0 } as unknown as ContentItem),
    getLabel: () => '',
    getSub: () => '',
    getReviewStatus: () => undefined,
    getApiUrl: () => '',
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
  const { t } = useTranslation()
  const qc = useQueryClient()
  const reviewStatus = cfg.getReviewStatus(item)
  const patchUrl = cfg.getPatchUrl(item)

  const submitReview = useMutation({
    mutationFn: () => api.patch(patchUrl, { review_status: 'under_review' }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

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
          {patchUrl ? (
            <AssigneePicker
              assigneeId={cfg.getAssigneeId(item)}
              members={members}
              patchUrl={patchUrl}
              queryKey={queryKey}
            />
          ) : null}
          <ReviewStatusBadge status={reviewStatus} />
          {patchUrl && (!reviewStatus || reviewStatus === 'draft') && (
            <button
              onClick={() => submitReview.mutate()}
              disabled={submitReview.isPending}
              className="flex items-center gap-0.5 text-[10px] text-amber-600 hover:text-amber-700 border border-amber-200 hover:bg-amber-50 rounded-full px-1.5 py-0.5 transition-colors"
            >
              {submitReview.isPending
                ? <Loader2 size={9} className="animate-spin" />
                : <Send size={9} />
              }
              {t('review.submit')}
            </button>
          )}
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
  return null
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

  const contentType: PipelineContentType = (node?.content_type as PipelineContentType) ?? 'custom'
  const cfg = CONTENT_TYPE_CONFIG[contentType]
  const listQueryKey = [...cfg.listKey(project?.ID ?? 0), nodeId]

  const { data: items = [], isLoading: itemsLoading } = useQuery<ContentItem[]>({
    queryKey: listQueryKey,
    queryFn: () => cfg.listFn(project!.ID, nodeId!),
    enabled: !!project && !!nodeId && contentType !== 'custom',
  })

  const createMutation = useMutation({
    mutationFn: () => cfg.createFn(project!.ID, node!),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: listQueryKey })
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

  const selected = items.find((i) => i.ID === selectedId) ?? null

  if (nodeLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  const Icon = cfg.icon
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
        <Icon size={15} className="text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{node?.name}</p>
          <p className="text-xs text-muted-foreground">
            {t(`pipeline.contentTypes.${contentType}`)}
          </p>
        </div>

        {/* Node status badge */}
        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', NODE_STATUS_BADGE[nodeStatus] ?? NODE_STATUS_BADGE.draft)}>
          {t(`pipeline.status.${nodeStatus}`)}
        </span>

        {/* Node state-machine actions */}
        {nodeStatus === 'draft' && (
          <button
            onClick={() => submitNode.mutate()}
            disabled={submitNode.isPending}
            className="flex items-center gap-1 text-[11px] font-medium text-amber-600 hover:text-amber-700 border border-amber-200 hover:bg-amber-50 rounded-full px-2.5 py-1 transition-colors"
          >
            {submitNode.isPending ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
            {t('pipeline.node.actions.submit')}
          </button>
        )}
        {nodeStatus === 'under_review' && (
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
        {(nodeStatus === 'rejected' || nodeStatus === 'final') && (
          <button
            onClick={() => reopenNode.mutate()}
            disabled={reopenNode.isPending}
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-full px-2.5 py-1 transition-colors"
          >
            {reopenNode.isPending ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
            {t('pipeline.node.actions.reopen')}
          </button>
        )}

        {contentType !== 'custom' && (
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

      {/* Body: left list + right detail */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left list */}
        <div className={cn(
          'flex flex-col border-r border-border bg-card overflow-hidden shrink-0',
          selected ? 'w-72' : 'flex-1'
        )}>
          <div className="flex-1 overflow-y-auto">
            {itemsLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : contentType === 'custom' ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <Settings2 size={24} className="text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('pipeline.workspace.customHint')}</p>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <Icon size={28} className="text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">{t('pipeline.workspace.empty')}</p>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => { setCreating(true); createMutation.mutate() }}
                  disabled={creating || createMutation.isPending}
                >
                  {(creating || createMutation.isPending) ? (
                    <Loader2 size={12} className="animate-spin mr-1.5" />
                  ) : (
                    <Plus size={12} className="mr-1.5" />
                  )}
                  {t('pipeline.workspace.createFirst', { type: t(`pipeline.contentTypes.${contentType}`) })}
                </Button>
              </div>
            ) : (
              items.map((item) => (
                <ListItem
                  key={item.ID}
                  item={item}
                  cfg={cfg}
                  selected={selectedId === item.ID}
                  onClick={() => setSelectedId(item.ID)}
                  queryKey={listQueryKey}
                  members={members}
                />
              ))
            )}
          </div>
        </div>

        {/* Right detail panel */}
        {selected && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-end px-3 py-1.5 border-b border-border shrink-0">
              <button
                onClick={() => setSelectedId(null)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <DetailPanel
                contentType={contentType}
                item={selected}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function StageWorkspacePage() {
  return <StageWorkspaceContent />
}
