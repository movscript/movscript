import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Play,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react'
import { api } from '@/lib/api'
import { canManagePipelineNodeAssignment, effectiveLeadId } from '@/lib/pipelinePermissions'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import { usePermissions } from '@/hooks/usePermissions'
import type { Pipeline, PipelineNode, PipelineNodeStatus, Project, ProjectMember, User } from '@/types'
import { Badge } from '@movscript/ui'
import { Button } from '@movscript/ui'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@movscript/ui'
import { useTranslation } from 'react-i18next'

const ROLE_LABEL_KEYS: Record<string, string> = {
  owner: 'pages.collaboration.roles.owner',
  director: 'pages.collaboration.roles.director',
  writer: 'pages.collaboration.roles.writer',
  generator: 'pages.collaboration.roles.generator',
  viewer: 'pages.collaboration.roles.viewer',
}

const STATUS_CLASS: Record<PipelineNodeStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  under_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  final: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
}

type NodeView = 'my_assigned' | 'my_lead' | 'review' | 'rejected' | 'final'

function assigneeName(members: ProjectMember[], userId?: number) {
  if (!userId) return '未分配'
  return members.find((member) => member.user_id === userId)?.user?.username ?? `用户 ${userId}`
}

function dateInputValue(value?: string) {
  return value ? value.slice(0, 10) : ''
}

function dueDatePayload(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null
}

function NodeCard({
  node,
  members,
  pipeline,
  project,
  currentUserId,
  onUpdate,
}: {
  node: PipelineNode
  members: ProjectMember[]
  pipeline?: Pipeline
  project?: Project | null
  currentUserId?: number
  onUpdate: (nodeId: number, body: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const canManageAssignment = canManagePipelineNodeAssignment({ node, project, members, currentUserId, pipeline })
  const fallbackLead = effectiveLeadId(node, project, pipeline)
  const fallbackLeadName = fallbackLead ? assigneeName(members, fallbackLead) : undefined

  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-medium text-foreground">{node.name}</h3>
            <Badge className={STATUS_CLASS[node.status]}>
              {t(`pipeline.status.${node.status}`)}
            </Badge>
          </div>
          {node.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{node.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <UserRound size={12} />
              执行：{node.assignee_id ? assigneeName(members, node.assignee_id) : fallbackLeadName ? `未分配（${fallbackLeadName} 兜底）` : '未分配'}
            </span>
            <span>负责：{assigneeName(members, node.lead_id)}</span>
            {node.due_date && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={12} />
                {new Date(node.due_date).toLocaleDateString()}
              </span>
            )}
            {node.entity_type && <span>{node.entity_type} #{node.entity_id ?? '-'}</span>}
          </div>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => navigate(`/pipeline/nodes/${node.ID}`)}>
          <Play size={13} />
          去完成
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          value={node.assignee_id ?? ''}
          onChange={(event) => onUpdate(node.ID, { assignee_id: event.target.value ? Number(event.target.value) : null })}
          disabled={!canManageAssignment}
        >
          <option value="">未分配执行者</option>
          {members.map((member) => (
            <option key={member.user_id} value={member.user_id}>{member.user?.username ?? `用户 ${member.user_id}`}</option>
          ))}
        </select>
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          value={node.lead_id ?? ''}
          onChange={(event) => onUpdate(node.ID, { lead_id: event.target.value ? Number(event.target.value) : null })}
          disabled={!canManageAssignment}
        >
          <option value="">未指定负责人</option>
          {members.map((member) => (
            <option key={member.user_id} value={member.user_id}>{member.user?.username ?? `用户 ${member.user_id}`}</option>
          ))}
        </select>
        <input
          type="date"
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          value={dateInputValue(node.due_date)}
          onChange={(event) => onUpdate(node.ID, { due_date: dueDatePayload(event.target.value) })}
          disabled={!canManageAssignment}
        />
      </div>
    </div>
  )
}

function PipelinePeopleView({
  nodes,
  members,
  pipeline,
  project,
  currentUserId,
  onUpdate,
}: {
  nodes: PipelineNode[]
  members: ProjectMember[]
  pipeline?: Pipeline
  project?: Project | null
  currentUserId?: number
  onUpdate: (nodeId: number, body: Record<string, unknown>) => void
}) {
  const navigate = useNavigate()
  const [view, setView] = useState<NodeView>('my_assigned')

  const groups = useMemo(() => ({
    my_assigned: nodes.filter((node) => node.assignee_id === currentUserId),
    my_lead: nodes.filter((node) => node.lead_id === currentUserId),
    review: nodes.filter((node) => node.status === 'under_review'),
    rejected: nodes.filter((node) => node.status === 'rejected'),
    final: nodes.filter((node) => node.status === 'final'),
  }), [currentUserId, nodes])

  const viewMeta: Array<{ id: NodeView; label: string; icon: typeof Clock }> = [
    { id: 'my_assigned', label: '我的任务', icon: Play },
    { id: 'my_lead', label: '我负责的', icon: UserRound },
    { id: 'review', label: '待审核', icon: Clock },
    { id: 'rejected', label: '被打回', icon: AlertTriangle },
    { id: 'final', label: '已完成', icon: CheckCircle2 },
  ]

  const visible = groups[view]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {viewMeta.map((item) => {
          const Icon = item.icon
          const active = view === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${active ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted/50'}`}
            >
              <Icon size={12} />
              {item.label}
              <span>{groups[item.id].length}</span>
            </button>
          )
        })}
        <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={() => navigate('/pipeline')}>
          <Plus size={13} />
          从管线创建节点
        </Button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background p-8 text-center">
          <p className="text-sm text-muted-foreground">当前视图没有节点</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((node) => (
            <NodeCard
              key={node.ID}
              node={node}
              members={members}
              pipeline={pipeline}
              project={project}
              currentUserId={currentUserId}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ManagementTab({
  members,
  users,
  canManageMembers,
  projectId,
}: {
  members: ProjectMember[]
  users: User[]
  canManageMembers: boolean
  projectId?: number
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [selectedUser, setSelectedUser] = useState('')
  const [role, setRole] = useState('viewer')

  const addMember = useMutation({
    mutationFn: (m: { user_id: number; role: string }) =>
      api.post(`/projects/${projectId}/members`, m).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
  })

  const removeMember = useMutation({
    mutationFn: (memberId: number) => api.delete(`/projects/${projectId}/members/${memberId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
  })

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t('pages.collaboration.teamMembers')}</h2>
      {canManageMembers && (
        <div className="mb-4 flex flex-wrap gap-2">
          <select
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
          >
            <option value="">{t('pages.collaboration.selectUser')}</option>
            {users.map((u) => <option key={u.ID} value={u.ID}>{u.username}</option>)}
          </select>
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="director">{t('pages.collaboration.roles.director')}</option>
            <option value="writer">{t('pages.collaboration.roles.writer')}</option>
            <option value="generator">{t('pages.collaboration.roles.generator')}</option>
            <option value="viewer">{t('pages.collaboration.roles.viewer')}</option>
          </select>
          <Button
            onClick={() => {
              if (!selectedUser) return
              addMember.mutate({ user_id: Number(selectedUser), role })
              setSelectedUser('')
            }}
            className="gap-1"
          >
            <Plus size={14} /> {t('pages.collaboration.add')}
          </Button>
        </div>
      )}
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.ID} className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 shadow-sm">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
              {m.user?.username?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{m.user?.username}</p>
            </div>
            <Badge className="bg-muted text-muted-foreground">
              {ROLE_LABEL_KEYS[m.role] ? t(ROLE_LABEL_KEYS[m.role]) : m.role}
            </Badge>
            {canManageMembers && m.role !== 'owner' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeMember.mutate(m.ID)}
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                aria-label={t('pages.collaboration.remove')}
              >
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        ))}
        {members.length === 0 && <p className="text-sm text-muted-foreground">{t('pages.collaboration.noMembers')}</p>}
      </div>
    </div>
  )
}

export default function CollaborationPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const currentUser = useUserStore((s) => s.currentUser)

  const { data: projectDetail } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get(`/projects/${projectId}`).then((r) => r.data),
    enabled: !!projectId,
  })

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
  })

  const { data: pipeline, isLoading } = useQuery<Pipeline>({
    queryKey: ['pipeline', projectId],
    queryFn: () => api.get(`/projects/${projectId}/pipeline`).then((r) => r.data),
    enabled: !!projectId,
    refetchInterval: 30_000,
  })

  const members: ProjectMember[] = projectDetail?.members ?? []
  const { canManageMembers } = usePermissions(members)

  const updateNode = useMutation({
    mutationFn: ({ nodeId, body }: { nodeId: number; body: Record<string, unknown> }) =>
      api.put(`/pipeline/nodes/${nodeId}`, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline', projectId] }),
  })

  const nodes = pipeline?.nodes ?? []

  return (
    <div className="max-w-4xl">
      <Tabs defaultValue="nodes">
        <TabsList className="mb-6">
          <TabsTrigger value="nodes">
            {t('pages.collaboration.tasks')}
            {nodes.length > 0 && (
              <Badge className="ml-1.5 bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {nodes.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="management">{t('pages.collaboration.management')}</TabsTrigger>
        </TabsList>

        <TabsContent value="nodes">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loadingShort')}</p>
          ) : (
            <PipelinePeopleView
              nodes={nodes}
              members={members}
              pipeline={pipeline}
              project={project}
              currentUserId={currentUser?.ID}
              onUpdate={(nodeId, body) => updateNode.mutate({ nodeId, body })}
            />
          )}
        </TabsContent>

        <TabsContent value="management">
          <ManagementTab
            members={members}
            users={users}
            canManageMembers={canManageMembers}
            projectId={projectId}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
