import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FileCheck2,
  ListChecks,
  ListFilter,
  ListTodo,
  MessageSquareText,
  Plus,
  RefreshCcw,
  Send,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react'

import { usePermissions } from '@/hooks/usePermissions'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import type { ProjectMember, User } from '@/types'
import { Badge, Button } from '@movscript/ui'

const ROLE_LABELS: Record<string, string> = {
  owner: '负责人',
  director: '导演',
  writer: '编剧',
  generator: '执行',
  viewer: '观察者',
}

type TaskStatus = 'todo' | 'in_progress' | 'submitted' | 'changes_requested' | 'approved'
type TaskPriority = 'high' | 'medium' | 'low'
type TaskView = 'all' | 'mine' | 'review'

interface ProjectTask {
  id: string
  title: string
  description: string
  target: string
  assigneeId: number
  assigneeName: string
  reviewerName: string
  priority: TaskPriority
  status: TaskStatus
  due: string
  submittedAt?: string
  approvedAt?: string
  deliverable?: string
  reviewNote?: string
}

const seededTasks: ProjectTask[] = [
  {
    id: 'TASK-1042',
    title: '补齐雨夜巷口关键帧参考',
    description: '根据已确认的角色资料生成 3 张关键帧候选，突出巷口空间、伞面遮挡和人物对峙距离。',
    target: 'S01 雨夜巷口对峙',
    assigneeId: 2,
    assigneeName: '张三',
    reviewerName: '项目负责人',
    priority: 'high',
    status: 'submitted',
    due: '今天 18:00',
    submittedAt: '今天 16:20',
    deliverable: '已提交 3 张候选图和提示词说明',
    reviewNote: '待负责人确认是否可作为后续视频生成锚点。',
  },
  {
    id: 'TASK-1043',
    title: '旧伞纸条特写素材整理',
    description: '上传或整理旧伞、湿纸条和字迹可读性的参考素材，标记推荐版本。',
    target: 'S02 旧伞纸条特写',
    assigneeId: 3,
    assigneeName: '李四',
    reviewerName: '项目负责人',
    priority: 'high',
    status: 'changes_requested',
    due: '明天 12:00',
    deliverable: '候选图 2 张',
    reviewNote: '纸条文字仍然不够清楚，需要补一张更近的特写。',
  },
  {
    id: 'TASK-1044',
    title: '雨声与脚步声音效草案',
    description: '整理 2 条音效方案，区分环境雨声、远处车流和脚步声层次。',
    target: 'S01 雨夜巷口对峙',
    assigneeId: 4,
    assigneeName: '王五',
    reviewerName: '项目负责人',
    priority: 'medium',
    status: 'in_progress',
    due: '明天 20:00',
    deliverable: '制作中',
  },
  {
    id: 'TASK-1045',
    title: '天台对白镜头返工说明',
    description: '把负责人反馈整理成可执行返工清单，明确视线、停顿和对白节奏。',
    target: 'S04 天台反转对白',
    assigneeId: 2,
    assigneeName: '张三',
    reviewerName: '项目负责人',
    priority: 'medium',
    status: 'todo',
    due: '周五 19:00',
  },
  {
    id: 'TASK-1046',
    title: '第一集视频候选验收',
    description: '检查已生成视频片段是否满足画面连续性、剧情信息和交付规格。',
    target: 'EP01 成片候选',
    assigneeId: 1,
    assigneeName: '项目负责人',
    reviewerName: '项目负责人',
    priority: 'low',
    status: 'approved',
    due: '昨天 17:00',
    submittedAt: '昨天 15:10',
    approvedAt: '昨天 16:30',
    deliverable: '验收记录已归档',
  },
]

const statusMeta: Record<TaskStatus, { label: string; className: string; icon: typeof ClipboardList }> = {
  todo: {
    label: '待处理',
    className: 'border-muted bg-muted/45 text-muted-foreground',
    icon: ListTodo,
  },
  in_progress: {
    label: '进行中',
    className: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    icon: Clock3,
  },
  submitted: {
    label: '待审核',
    className: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    icon: Send,
  },
  changes_requested: {
    label: '需修改',
    className: 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    icon: RefreshCcw,
  },
  approved: {
    label: '已完成',
    className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    icon: CheckCircle2,
  },
}

const priorityMeta: Record<TaskPriority, { label: string; className: string }> = {
  high: { label: '高', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  medium: { label: '中', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  low: { label: '低', className: 'bg-muted text-muted-foreground' },
}

const workflow = [
  { title: '分配任务', detail: '负责人把任务指派给项目成员', icon: UserCheck },
  { title: '成员处理', detail: '成员在我的任务里查看并推进', icon: ListChecks },
  { title: '提交审核', detail: '完成后提交交付物与说明', icon: Send },
  { title: '通过完成', detail: '负责人审核通过或要求修改', icon: BadgeCheck },
]

function memberDisplayName(member: ProjectMember) {
  return member.user?.username || `成员 ${member.user_id}`
}

function buildMemberOptions(members: ProjectMember[], currentUser: User | null) {
  if (members.length > 0) {
    return members.map((member) => ({
      id: member.user_id,
      name: memberDisplayName(member),
      role: ROLE_LABELS[member.role] ?? member.role,
    }))
  }
  return currentUser ? [{ id: currentUser.ID, name: currentUser.username, role: '负责人' }] : []
}

function taskMatchesUser(task: ProjectTask, user: User | null) {
  if (!user) return false
  return task.assigneeId === user.ID || task.assigneeName === user.username
}

function StatusPill({ status }: { status: TaskStatus }) {
  const meta = statusMeta[status]
  const Icon = meta.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium', meta.className)}>
      <Icon size={12} />
      {meta.label}
    </span>
  )
}

function PriorityPill({ priority }: { priority: TaskPriority }) {
  const meta = priorityMeta[priority]
  return <span className={cn('rounded-md px-2 py-1 text-xs font-medium', meta.className)}>{meta.label}优先级</span>
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
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Users size={15} />
          <span>项目成员</span>
        </div>
        <Badge variant="secondary" className="text-[10px]">{members.length} 人</Badge>
      </div>

      {canManageMembers && (
        <div className="mb-3 grid gap-2 rounded-md border border-border bg-background p-2">
          <select
            className="h-9 rounded-md border border-border bg-card px-2 text-xs text-foreground"
            value={selectedUser}
            onChange={(event) => setSelectedUser(event.target.value)}
          >
            <option value="">选择成员</option>
            {users.map((user) => <option key={user.ID} value={user.ID}>{user.username}</option>)}
          </select>
          <div className="flex gap-2">
            <select
              className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-xs text-foreground"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="director">导演</option>
              <option value="writer">编剧</option>
              <option value="generator">执行</option>
              <option value="viewer">观察者</option>
            </select>
            <Button
              size="sm"
              onClick={() => {
                if (!selectedUser) return
                addMember.mutate({ user_id: Number(selectedUser), role })
                setSelectedUser('')
              }}
              className="gap-1"
            >
              <Plus size={13} /> 添加
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {members.slice(0, 6).map((member) => (
          <div key={member.ID} className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {memberDisplayName(member)[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{memberDisplayName(member)}</p>
              <p className="text-[11px] text-muted-foreground">{ROLE_LABELS[member.role] ?? member.role}</p>
            </div>
            {canManageMembers && member.role !== 'owner' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeMember.mutate(member.ID)}
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                aria-label="移除成员"
              >
                <Trash2 size={13} />
              </Button>
            )}
          </div>
        ))}
        {members.length === 0 && <p className="text-xs text-muted-foreground">暂无项目成员。先添加成员后即可分配任务。</p>}
      </div>
    </section>
  )
}

export default function CollaborationPage() {
  const project = useProjectStore((state) => state.current)
  const currentUser = useUserStore((state) => state.currentUser)
  const projectId = project?.ID
  const [tasks, setTasks] = useState<ProjectTask[]>(seededTasks)
  const [selectedTaskId, setSelectedTaskId] = useState(seededTasks[0]?.id ?? '')
  const [view, setView] = useState<TaskView>('all')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskAssignee, setNewTaskAssignee] = useState('')
  const [newTaskDue, setNewTaskDue] = useState('明天 18:00')

  const { data: projectDetail } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get(`/projects/${projectId}`).then((response) => response.data),
    enabled: !!projectId,
  })

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((response) => response.data),
  })

  const members: ProjectMember[] = projectDetail?.members ?? []
  const { canManageMembers } = usePermissions(members)
  const memberOptions = useMemo(() => buildMemberOptions(members, currentUser), [members, currentUser])
  const reviewerName = members.find((member) => member.role === 'owner')?.user?.username ?? currentUser?.username ?? '项目负责人'

  const metrics = useMemo(() => {
    const mine = tasks.filter((task) => taskMatchesUser(task, currentUser)).length
    const review = tasks.filter((task) => task.status === 'submitted').length
    const doing = tasks.filter((task) => task.status === 'in_progress' || task.status === 'changes_requested').length
    const done = tasks.filter((task) => task.status === 'approved').length
    return [
      { label: '全部任务', value: tasks.length, icon: ClipboardList, className: 'text-foreground' },
      { label: '我的任务', value: mine, icon: UserCheck, className: 'text-sky-600' },
      { label: '待审核', value: review, icon: BadgeCheck, className: 'text-amber-600' },
      { label: '处理中', value: doing, icon: Clock3, className: 'text-blue-600' },
      { label: '已完成', value: done, icon: CheckCircle2, className: 'text-emerald-600' },
    ]
  }, [tasks, currentUser])

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (view === 'mine' && !taskMatchesUser(task, currentUser)) return false
      if (view === 'review' && task.status !== 'submitted') return false
      if (statusFilter !== 'all' && task.status !== statusFilter) return false
      return true
    })
  }, [currentUser, statusFilter, tasks, view])

  const selectedTask = useMemo(() => {
    return visibleTasks.find((task) => task.id === selectedTaskId) ?? visibleTasks[0] ?? tasks[0]
  }, [selectedTaskId, tasks, visibleTasks])

  function updateTask(taskId: string, patch: Partial<ProjectTask>) {
    setTasks((items) => items.map((task) => task.id === taskId ? { ...task, ...patch } : task))
  }

  function createTask() {
    const assignee = memberOptions.find((member) => String(member.id) === newTaskAssignee) ?? memberOptions[0]
    if (!newTaskTitle.trim() || !assignee) return
    const task: ProjectTask = {
      id: `TASK-${1100 + tasks.length}`,
      title: newTaskTitle.trim(),
      description: '由负责人新建并分配给项目成员，成员完成后提交审核。',
      target: project?.name ?? '当前项目',
      assigneeId: assignee.id,
      assigneeName: assignee.name,
      reviewerName,
      priority: 'medium',
      status: 'todo',
      due: newTaskDue.trim() || '未设置',
    }
    setTasks((items) => [task, ...items])
    setSelectedTaskId(task.id)
    setView('all')
    setStatusFilter('all')
    setNewTaskTitle('')
  }

  return (
    <div className="h-full min-w-[1180px] overflow-auto bg-background">
      <div className="space-y-4 p-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{project?.name ?? '当前项目'}</span>
              <ChevronRight size={13} />
              <span>任务</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">任务</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              面向项目成员的任务分配、个人执行、提交审核和负责人通过。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setView('mine')}>
              <UserCheck size={15} />
              我的任务
            </Button>
            <Button className="gap-2" onClick={createTask}>
              <Plus size={15} />
              分配任务
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-4 gap-3">
          {workflow.map((step, index) => {
            const Icon = step.icon
            return (
              <div key={step.title} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{index + 1}. {step.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </section>

        <section className="grid grid-cols-5 gap-3">
          {metrics.map((metric) => {
            const Icon = metric.icon
            return (
              <button
                key={metric.label}
                type="button"
                onClick={() => {
                  if (metric.label === '我的任务') setView('mine')
                  if (metric.label === '待审核') setView('review')
                  if (metric.label === '全部任务') setView('all')
                }}
                className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{metric.label}</span>
                  <Icon size={15} className={metric.className} />
                </div>
                <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{metric.value}</p>
              </button>
            )
          })}
        </section>

        <section className="grid grid-cols-[260px_minmax(0,1fr)_360px] gap-4">
          <aside className="space-y-3">
            <section className="rounded-lg border border-border bg-card p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Plus size={15} />
                <span>快速分配</span>
              </div>
              <div className="space-y-2">
                <input
                  value={newTaskTitle}
                  onChange={(event) => setNewTaskTitle(event.target.value)}
                  placeholder="任务标题"
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                />
                <select
                  value={newTaskAssignee}
                  onChange={(event) => setNewTaskAssignee(event.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                >
                  <option value="">选择执行成员</option>
                  {memberOptions.map((member) => (
                    <option key={member.id} value={member.id}>{member.name} · {member.role}</option>
                  ))}
                </select>
                <input
                  value={newTaskDue}
                  onChange={(event) => setNewTaskDue(event.target.value)}
                  placeholder="截止时间"
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                />
                <Button className="w-full gap-2" onClick={createTask} disabled={!newTaskTitle.trim() || memberOptions.length === 0}>
                  <UserCheck size={15} />
                  分配给成员
                </Button>
              </div>
            </section>

            <ManagementTab
              members={members}
              users={users}
              canManageMembers={canManageMembers}
              projectId={projectId}
            />
          </aside>

          <main className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <ListTodo size={16} />
                <h2 className="text-sm font-semibold">任务列表</h2>
                <Badge variant="secondary" className="text-[10px]">{visibleTasks.length} 项</Badge>
              </div>
              <div className="flex items-center gap-2">
                {(['all', 'mine', 'review'] as const).map((mode) => (
                  <Button
                    key={mode}
                    variant={view === mode ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setView(mode)}
                  >
                    {mode === 'all' ? '全部' : mode === 'mine' ? '我的' : '待审核'}
                  </Button>
                ))}
                <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2">
                  <ListFilter size={13} className="text-muted-foreground" />
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as TaskStatus | 'all')}
                    className="h-8 bg-transparent text-xs outline-none"
                    aria-label="状态筛选"
                  >
                    <option value="all">全部状态</option>
                    {Object.entries(statusMeta).map(([status, meta]) => (
                      <option key={status} value={status}>{meta.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-3 p-3">
              {visibleTasks.map((task) => {
                const active = selectedTask?.id === task.id
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => setSelectedTaskId(task.id)}
                    className={cn(
                      'w-full rounded-lg border bg-background p-3 text-left transition-colors',
                      active ? 'border-primary/45 shadow-sm' : 'border-border hover:border-muted-foreground/30'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusPill status={task.status} />
                          <PriorityPill priority={task.priority} />
                          <span className="font-mono text-xs text-muted-foreground">{task.id}</span>
                        </div>
                        <p className="mt-2 truncate text-sm font-semibold">{task.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{task.description}</p>
                      </div>
                      <div className="grid w-[260px] shrink-0 grid-cols-2 gap-2 text-xs">
                        <Info label="执行成员" value={task.assigneeName} />
                        <Info label="截止时间" value={task.due} />
                        <Info label="关联对象" value={task.target} />
                        <Info label="审核人" value={task.reviewerName} />
                      </div>
                    </div>
                  </button>
                )
              })}
              {visibleTasks.length === 0 && (
                <div className="grid min-h-[260px] place-items-center rounded-lg border border-dashed border-border text-center">
                  <div>
                    <ClipboardList size={24} className="mx-auto text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">没有符合条件的任务</p>
                    <p className="mt-1 text-xs text-muted-foreground">调整筛选条件，或在左侧快速分配新任务。</p>
                  </div>
                </div>
              )}
            </div>
          </main>

          <aside className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ClipboardCheck size={16} />
                <span>任务详情</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">任务完成只代表执行事项通过，不直接改变内容采用或交付状态。</p>
            </div>

            {selectedTask && (
              <div className="space-y-4 p-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={selectedTask.status} />
                    <PriorityPill priority={selectedTask.priority} />
                  </div>
                  <h3 className="mt-3 text-base font-semibold">{selectedTask.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedTask.id} · {selectedTask.target}</p>
                </div>

                <DetailBlock title="分配信息" icon={UserCheck}>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Info label="执行成员" value={selectedTask.assigneeName} />
                    <Info label="审核人" value={selectedTask.reviewerName} />
                    <Info label="截止时间" value={selectedTask.due} />
                    <Info label="关联对象" value={selectedTask.target} />
                  </div>
                </DetailBlock>

                <DetailBlock title="任务说明" icon={ListChecks}>
                  <p className="text-sm leading-relaxed text-muted-foreground">{selectedTask.description}</p>
                </DetailBlock>

                <DetailBlock title="提交内容" icon={FileCheck2}>
                  <div className="rounded-md border border-border bg-background p-3">
                    <p className="text-sm text-foreground">{selectedTask.deliverable ?? '成员尚未提交交付物。'}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span>提交时间：{selectedTask.submittedAt ?? '暂无'}</span>
                      <span>通过时间：{selectedTask.approvedAt ?? '暂无'}</span>
                    </div>
                  </div>
                </DetailBlock>

                <DetailBlock title="审核意见" icon={MessageSquareText}>
                  <div className="rounded-md border border-border bg-background p-3 text-sm leading-relaxed text-muted-foreground">
                    {selectedTask.reviewNote ?? '暂无审核意见。'}
                  </div>
                </DetailBlock>

                <div className="grid gap-2 border-t border-border pt-3">
                  <Button
                    variant="outline"
                    className="justify-start gap-2"
                    onClick={() => updateTask(selectedTask.id, { status: 'in_progress', deliverable: '处理中' })}
                    disabled={selectedTask.status === 'approved'}
                  >
                    <Clock3 size={15} />
                    标记进行中
                  </Button>
                  <Button
                    className="justify-start gap-2"
                    onClick={() => updateTask(selectedTask.id, {
                      status: 'submitted',
                      submittedAt: '刚刚',
                      deliverable: selectedTask.deliverable === '处理中' || !selectedTask.deliverable ? '已提交执行结果，等待负责人审核。' : selectedTask.deliverable,
                      reviewNote: '等待负责人审核。',
                    })}
                    disabled={selectedTask.status === 'submitted' || selectedTask.status === 'approved'}
                  >
                    <Send size={15} />
                    提交审核
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start gap-2"
                    onClick={() => updateTask(selectedTask.id, {
                      status: 'changes_requested',
                      reviewNote: '负责人要求修改后重新提交。',
                    })}
                    disabled={selectedTask.status !== 'submitted' || !canManageMembers}
                  >
                    <RefreshCcw size={15} />
                    要求修改
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start gap-2"
                    onClick={() => updateTask(selectedTask.id, {
                      status: 'approved',
                      approvedAt: '刚刚',
                      reviewNote: '负责人已通过，任务完成。',
                    })}
                    disabled={selectedTask.status !== 'submitted' || !canManageMembers}
                  >
                    <CheckCircle2 size={15} />
                    通过完成
                  </Button>
                </div>

                {!canManageMembers && selectedTask.status === 'submitted' && (
                  <div className="flex gap-2 rounded-md border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>只有项目负责人或具备成员管理权限的用户可以通过任务或要求修改。</span>
                  </div>
                )}
              </div>
            )}
          </aside>
        </section>
      </div>
    </div>
  )
}

function DetailBlock({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof ClipboardList
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Icon size={14} />
        <span>{title}</span>
      </div>
      {children}
    </section>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-card px-2 py-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-medium text-foreground">{value}</p>
    </div>
  )
}
