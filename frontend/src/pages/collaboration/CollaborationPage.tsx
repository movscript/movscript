import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Task, TaskStatus, TaskPriority, ProjectMember, User } from '@/types'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useState } from 'react'
import {
  Plus, Trash2, MessageSquare, ChevronDown, ChevronUp,
  CheckCircle, Play, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

const ROLE_LABELS: Record<string, string> = {
  owner: '负责人', director: '导演', writer: '编剧', generator: '生成工程师', viewer: '查看者',
}
const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: '待处理', in_progress: '进行中', review: '待审核', done: '已完成',
}
const STATUS_BADGE_VARIANT: Record<TaskStatus, string> = {
  pending: 'secondary',
  in_progress: 'default',
  review: 'outline',
  done: 'secondary',
}
const STATUS_BADGE_CLASS: Record<TaskStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  in_progress: 'bg-muted text-muted-foreground',
  review: 'bg-muted text-muted-foreground',
  done: 'bg-muted text-foreground',
}
const PRIORITY_LABELS: Record<TaskPriority, string> = { low: '低', medium: '中', high: '高' }
const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'text-muted-foreground', medium: 'text-muted-foreground', high: 'text-destructive',
}
const REF_TYPE_LABELS: Record<string, string> = {
  episode: '分集', scene: '分场', storyboard: '分镜', shot: '镜头',
}

// ── WorkingCard ─────────────────────────────────────────────────────────────

function WorkingCard({
  task,
  onClose,
  onComplete,
}: {
  task: Task
  onClose: () => void
  onComplete: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Task info header */}
        <div className="px-6 py-5 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold ${PRIORITY_COLORS[task.priority]}`}>
                  {PRIORITY_LABELS[task.priority]}优先级
                </span>
                <Badge className={STATUS_BADGE_CLASS[task.status]}>
                  {STATUS_LABELS[task.status]}
                </Badge>
                {task.ref_type && (
                  <span className="text-xs text-muted-foreground">{REF_TYPE_LABELS[task.ref_type] ?? task.ref_type}</span>
                )}
              </div>
              <h2 className="text-lg font-semibold text-foreground leading-snug">{task.title}</h2>
              {task.description && (
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{task.description}</p>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-muted-foreground hover:text-muted-foreground shrink-0 h-7 w-7">
              <X size={16} />
            </Button>
          </div>
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
            <span>负责人：{task.assignee?.username ?? '未分配'}</span>
            {task.deadline && (
              <span>截止：{new Date(task.deadline).toLocaleDateString('zh-CN')}</span>
            )}
          </div>
        </div>

        {/* Work notes area */}
        <div className="px-6 py-4">
          <Label className="block text-xs font-medium text-muted-foreground mb-2">工作记录（可选）</Label>
          <Textarea
            className="w-full resize-none text-sm leading-relaxed"
            rows={4}
            placeholder="记录你的工作进展、遇到的问题或完成说明…"
          />
        </div>

        {/* Actions */}
        <div className="px-6 pb-5 flex items-center justify-between">
          <Button variant="ghost" onClick={onClose} className="text-sm text-muted-foreground">
            稍后再说
          </Button>
          <Button
            onClick={onComplete}
            className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2.5 text-sm font-medium"
          >
            <CheckCircle size={15} />
            标记完成
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  users,
  currentUserId,
  onUpdate,
  onDelete,
  onWork,
}: {
  task: Task
  users: User[]
  currentUserId?: number
  onUpdate: (id: number, data: Partial<Task>) => void
  onDelete: (id: number) => void
  onWork: (task: Task) => void
}) {
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [expanded, setExpanded] = useState(false)
  const [comment, setComment] = useState('')

  const { data: comments = [] } = useQuery({
    queryKey: ['task-comments', task.ID],
    queryFn: () => api.get(`/projects/${projectId}/tasks/${task.ID}/comments`).then((r) => r.data),
    enabled: expanded,
  })

  const addComment = useMutation({
    mutationFn: (content: string) =>
      api.post(`/projects/${projectId}/tasks/${task.ID}/comments`, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-comments', task.ID] })
      setComment('')
    },
  })

  const isAssignedToMe = task.assignee_id === currentUserId
  const canWork = task.status !== 'done'

  return (
    <div className={`border border-border rounded-lg bg-background shadow-sm text-sm ${isAssignedToMe ? 'border-primary/30' : ''}`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className={`text-xs font-bold shrink-0 ${PRIORITY_COLORS[task.priority]}`}>
          {PRIORITY_LABELS[task.priority]}
        </span>
        <span className="flex-1 font-medium truncate">{task.title}</span>
        {task.ref_type && (
          <span className="text-xs text-muted-foreground shrink-0">{REF_TYPE_LABELS[task.ref_type] ?? task.ref_type}</span>
        )}
        <Badge className={`${STATUS_BADGE_CLASS[task.status]} shrink-0`}>
          {STATUS_LABELS[task.status]}
        </Badge>

        {/* 去完成 button — shown only when assigned to current user and not done */}
        {isAssignedToMe && canWork && (
          <button
            onClick={() => onWork(task)}
            className="flex items-center gap-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90 px-2.5 py-0.5 rounded-full shrink-0 transition-colors"
          >
            <Play size={10} />
            去完成
          </button>
        )}

        <Button variant="ghost" size="icon" onClick={() => setExpanded((v) => !v)} className="text-muted-foreground hover:text-foreground shrink-0 h-6 w-6">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(task.ID)} className="text-muted-foreground hover:text-destructive shrink-0 h-6 w-6">
          <Trash2 size={13} />
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-border px-3 py-3 space-y-3">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>负责人：{task.assignee?.username ?? '未分配'}</span>
            {task.deadline && <span>截止：{new Date(task.deadline).toLocaleDateString('zh-CN')}</span>}
          </div>
          {task.description && <p className="text-foreground text-xs">{task.description}</p>}

          <div className="flex gap-2 flex-wrap">
            <select
              className="border border-border rounded-md px-2 py-1 text-xs bg-background text-foreground"
              value={task.assignee_id ?? ''}
              onChange={(e) => onUpdate(task.ID, { assignee_id: Number(e.target.value) || undefined })}
            >
              <option value="">未分配</option>
              {users.map((u) => <option key={u.ID} value={u.ID}>{u.username}</option>)}
            </select>
            <select
              className="border border-border rounded-md px-2 py-1 text-xs bg-background text-foreground"
              value={task.priority}
              onChange={(e) => onUpdate(task.ID, { priority: e.target.value as TaskPriority })}
            >
              {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}优先级</option>)}
            </select>
            <select
              className="border border-border rounded-md px-2 py-1 text-xs bg-background text-foreground"
              value={task.status}
              onChange={(e) => onUpdate(task.ID, { status: e.target.value as TaskStatus })}
            >
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {/* Comments */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <MessageSquare size={12} /> 评论
            </p>
            {comments.map((c: { ID: number; user?: User; content: string; CreatedAt: string }) => (
              <div key={c.ID} className="text-xs bg-card rounded p-2">
                <span className="font-medium text-foreground">{c.user?.username ?? '?'}</span>
                <span className="text-muted-foreground ml-2">{new Date(c.CreatedAt).toLocaleString('zh-CN')}</span>
                <p className="mt-1 text-muted-foreground">{c.content}</p>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                className="flex-1 text-xs"
                placeholder="添加评论…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && comment.trim() && addComment.mutate(comment)}
              />
              <Button
                size="sm"
                onClick={() => comment.trim() && addComment.mutate(comment)}
                className="text-xs"
              >
                发送
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── TasksTab ──────────────────────────────────────────────────────────────────

function TasksTab({
  tasks,
  users,
  currentUserId,
  tasksLoading,
  onUpdate,
  onDelete,
}: {
  tasks: Task[]
  users: User[]
  currentUserId?: number
  tasksLoading: boolean
  onUpdate: (id: number, data: Partial<Task>) => void
  onDelete: (id: number) => void
}) {
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const [myTasksOnly, setMyTasksOnly] = useState(false)
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('')
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState<TaskPriority>('medium')
  const [newRefType, setNewRefType] = useState('')
  const [newAssigneeId, setNewAssigneeId] = useState<number | ''>('')
  const [workingTask, setWorkingTask] = useState<Task | null>(null)

  const createTask = useMutation({
    mutationFn: (t: Partial<Task>) => api.post(`/projects/${projectId}/tasks`, t).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] })
      setNewTitle('')
    },
  })

  const updateTask = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Task> }) =>
      api.put(`/projects/${projectId}/tasks/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  })

  function handleComplete() {
    if (!workingTask) return
    updateTask.mutate({ id: workingTask.ID, data: { status: 'done' } })
    setWorkingTask(null)
  }

  const filtered = tasks
    .filter((t) => (myTasksOnly ? t.assignee_id === currentUserId : true))
    .filter((t) => (statusFilter ? t.status === statusFilter : true))

  const myCount = tasks.filter((t) => t.assignee_id === currentUserId).length

  return (
    <>
      {/* Create task */}
      <div className="border border-border rounded-lg p-3 bg-background shadow-sm space-y-2 mb-4">
        <p className="text-xs font-medium text-muted-foreground">新建任务</p>
        <Input
          placeholder="任务标题 *"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newTitle.trim()) {
              createTask.mutate({
                title: newTitle,
                priority: newPriority,
                ref_type: newRefType || undefined,
                assignee_id: newAssigneeId || undefined,
              })
            }
          }}
        />
        <div className="flex gap-2 flex-wrap">
          <select
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-background text-foreground"
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
          >
            {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}优先级</option>)}
          </select>
          <select
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-background text-foreground"
            value={newRefType}
            onChange={(e) => setNewRefType(e.target.value)}
          >
            <option value="">关联类型</option>
            {Object.entries(REF_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select
            className="border border-border rounded-md px-2 py-1.5 text-xs flex-1 bg-background text-foreground"
            value={newAssigneeId}
            onChange={(e) => setNewAssigneeId(Number(e.target.value) || '')}
          >
            <option value="">分配给…</option>
            {users.map((u) => <option key={u.ID} value={u.ID}>{u.username}</option>)}
          </select>
          <Button
            size="sm"
            onClick={() => newTitle.trim() && createTask.mutate({
              title: newTitle,
              priority: newPriority,
              ref_type: newRefType || undefined,
              assignee_id: newAssigneeId || undefined,
            })}
            disabled={!newTitle.trim() || createTask.isPending}
            className="flex items-center gap-1 text-xs"
          >
            <Plus size={12} /> 创建
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          onClick={() => setMyTasksOnly(false)}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${!myTasksOnly ? 'bg-foreground text-background border-foreground' : 'text-muted-foreground border-border hover:bg-muted/50'}`}
        >
          全部 ({tasks.length})
        </button>
        <button
          onClick={() => setMyTasksOnly(true)}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${myTasksOnly ? 'bg-foreground text-background border-foreground' : 'text-muted-foreground border-border hover:bg-muted/50'}`}
        >
          我的任务 ({myCount})
        </button>
        <div className="h-4 w-px bg-border mx-1" />
        {(['', 'pending', 'in_progress', 'review', 'done'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${statusFilter === s ? 'bg-foreground text-background border-foreground' : 'text-muted-foreground border-border hover:bg-muted/50'}`}
          >
            {s === '' ? '全状态' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Task list */}
      {tasksLoading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无任务</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <TaskCard
              key={t.ID}
              task={t}
              users={users}
              currentUserId={currentUserId}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onWork={setWorkingTask}
            />
          ))}
        </div>
      )}

      {/* WorkingCard modal */}
      {workingTask && (
        <WorkingCard
          task={workingTask}
          onClose={() => setWorkingTask(null)}
          onComplete={handleComplete}
        />
      )}
    </>
  )
}

// ── ManagementTab ─────────────────────────────────────────────────────────────

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
    <div>
      <h2 className="text-sm font-semibold mb-3 text-muted-foreground">团队成员</h2>
      {canManageMembers && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <select
            className="border border-border rounded-md px-3 py-2 text-sm flex-1 bg-background text-foreground"
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
          >
            <option value="">选择用户</option>
            {users.map((u) => <option key={u.ID} value={u.ID}>{u.username}</option>)}
          </select>
          <select
            className="border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="director">导演</option>
            <option value="writer">编剧</option>
            <option value="generator">生成工程师</option>
            <option value="viewer">查看者</option>
          </select>
          <Button
            onClick={() => {
              if (!selectedUser) return
              addMember.mutate({ user_id: Number(selectedUser), role })
              setSelectedUser('')
            }}
            className="flex items-center gap-1"
          >
            <Plus size={14} /> 添加
          </Button>
        </div>
      )}
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.ID} className="border border-border rounded-lg px-4 py-3 bg-background shadow-sm flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
              {m.user?.username?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{m.user?.username}</p>
            </div>
            <Badge className="bg-muted text-muted-foreground">
              {ROLE_LABELS[m.role] ?? m.role}
            </Badge>
            {canManageMembers && m.role !== 'owner' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeMember.mutate(m.ID)}
                className="text-muted-foreground hover:text-destructive transition-colors h-7 w-7"
                aria-label="移除"
              >
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        ))}
        {members.length === 0 && <p className="text-sm text-muted-foreground">暂无成员</p>}
      </div>
    </div>
  )
}

// ── CollaborationPage ────────────────────────────────────────────────────────

export default function CollaborationPage() {
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

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ['tasks', projectId],
    queryFn: () => api.get(`/projects/${projectId}/tasks`).then((r) => r.data),
    enabled: !!projectId,
    refetchInterval: 30_000,
  })

  const members: ProjectMember[] = projectDetail?.members ?? []
  const { canManageMembers } = usePermissions(members)

  const updateTask = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Task> }) =>
      api.put(`/projects/${projectId}/tasks/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  })

  const deleteTask = useMutation({
    mutationFn: (id: number) => api.delete(`/projects/${projectId}/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  })

  return (
    <div className="max-w-3xl">
      <Tabs defaultValue="tasks">
        <TabsList className="mb-6">
          <TabsTrigger value="tasks">
            任务
            {tasks.length > 0 && (
              <Badge className="ml-1.5 bg-muted text-muted-foreground text-xs px-1.5 py-0.5">
                {tasks.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="management">管理</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks">
          <TasksTab
            tasks={tasks}
            users={users}
            currentUserId={currentUser?.ID}
            tasksLoading={tasksLoading}
            onUpdate={(id, data) => updateTask.mutate({ id, data })}
            onDelete={(id) => deleteTask.mutate(id)}
          />
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
