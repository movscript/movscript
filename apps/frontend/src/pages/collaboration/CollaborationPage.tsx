import { useEffect, useMemo, useState } from 'react'
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

import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/api/semanticEntities'
import { usePermissions } from '@/hooks/usePermissions'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import type { ProjectMember, User } from '@/types'
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@movscript/ui'

const ROLE_LABELS: Record<string, string> = {
  owner: '负责人',
  director: '导演',
  writer: '编剧',
  generator: '执行',
  viewer: '观察者',
}

type TaskStatus = 'todo' | 'in_progress' | 'submitted' | 'changes_requested' | 'approved' | 'blocked' | 'cancelled'
type TaskPriority = 'high' | 'medium' | 'low'
type TaskView = 'all' | 'mine' | 'review'
type WorkItemStatus = 'todo' | 'running' | 'blocked' | 'review' | 'done' | 'cancelled'
type WorkItemKind = 'human' | 'ai' | 'hybrid' | 'review' | 'fix'
type UserTaskType = 'execution' | 'generation' | 'hybrid' | 'review' | 'fix' | 'decision' | 'coordination'
type WorkTargetType = 'project' | 'production' | 'segment' | 'scene_moment' | 'content_unit' | 'asset_slot' | 'keyframe' | 'delivery_version'
type WorkItemResultType = 'none' | 'status_change' | 'lock_asset_candidate' | 'accept_keyframe' | 'approve_delivery_version'
type TaskPurpose = 'general' | 'review_output' | 'choose_asset_candidate' | 'confirm_content_unit' | 'accept_keyframe' | 'approve_delivery'

interface WorkItem {
  ID: number
  project_id: number
  production_id?: number
  target_type: string
  target_id: number
  kind: WorkItemKind | string
  title: string
  description: string
  status: WorkItemStatus | string
  priority: string
  assignee_id?: number
  assignee?: User
  source_job_id?: number
  source_canvas_id?: number
  result_type?: WorkItemResultType | string
  result_json?: string
  apply_status?: 'not_applicable' | 'pending' | 'applied' | 'failed' | string
  applied_at?: string
  apply_error?: string
  metadata_json?: string
  CreatedAt: string
  UpdatedAt: string
}

interface WorkItemMetadata {
  task_type?: UserTaskType
  target_label?: string
  due?: string
  deliverable?: string
  review_note?: string
  submitted_at?: string
  approved_at?: string
  reviewer_name?: string
}

type WorkReviewStatus = 'pending' | 'approved' | 'changes_requested' | 'rejected'

interface WorkReview {
  ID: number
  project_id: number
  work_item_id: number
  reviewer_id?: number
  reviewer?: User
  status: WorkReviewStatus | string
  comment: string
  metadata_json?: string
  CreatedAt: string
  UpdatedAt: string
}

interface ProjectTask {
  id: string
  workItemID: number
  title: string
  description: string
  target: string
  taskType: UserTaskType
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
  sourceJobID?: number
  sourceCanvasID?: number
  resultType: WorkItemResultType | string
  resultJSON: string
  applyStatus: string
  appliedAt?: string
  applyError?: string
  raw: WorkItem
  metadata: WorkItemMetadata
}

interface WorkTargetOption {
  key: string
  type: WorkTargetType
  id: number
  label: string
  productionId?: number
  status?: string
  subtitle?: string
}

interface MemberOption {
  id: number
  name: string
  role: string
}

interface TaskCreateDraft {
  title: string
  description: string
  taskType: UserTaskType
  target: WorkTargetOption
  assignee: MemberOption
  due: string
  priority: TaskPriority
  resultType: WorkItemResultType
  resultJSON: string
}

const seededTasks: ProjectTask[] = []

const targetTypeLabels: Record<WorkTargetType, string> = {
  project: '项目',
  production: '制作',
  segment: '剧本段落',
  scene_moment: '情景',
  content_unit: '制作项',
  asset_slot: '素材需求',
  keyframe: '关键帧',
  delivery_version: '交付版本',
}

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
  blocked: {
    label: '被阻塞',
    className: 'border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300',
    icon: AlertTriangle,
  },
  approved: {
    label: '已完成',
    className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    icon: CheckCircle2,
  },
  cancelled: {
    label: '已取消',
    className: 'border-muted bg-muted/45 text-muted-foreground',
    icon: Trash2,
  },
}

const taskTypeMeta: Record<UserTaskType, { label: string; kind: WorkItemKind; description: string }> = {
  execution: { label: '执行任务', kind: 'human', description: '人工完成明确交付物' },
  generation: { label: 'AI 生成任务', kind: 'ai', description: '创建或跟进 AI 生成结果' },
  hybrid: { label: '人机协作任务', kind: 'hybrid', description: '人工准备输入，AI 产出候选' },
  review: { label: '审核任务', kind: 'review', description: '确认产出是否可用' },
  fix: { label: '返工任务', kind: 'fix', description: '根据反馈修改已有产出' },
  decision: { label: '选择任务', kind: 'review', description: '从多个候选中做选择' },
  coordination: { label: '协调任务', kind: 'human', description: '处理阻塞、依赖或外部确认' },
}

const priorityMeta: Record<TaskPriority, { label: string; className: string }> = {
  high: { label: '高', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  medium: { label: '中', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  low: { label: '低', className: 'bg-muted text-muted-foreground' },
}

const reviewStatusMeta: Record<WorkReviewStatus, { label: string; className: string }> = {
  pending: { label: '待审核', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  approved: { label: '通过', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  changes_requested: { label: '要求修改', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  rejected: { label: '拒绝', className: 'bg-muted text-muted-foreground' },
}

const resultTypeMeta: Record<WorkItemResultType, { label: string; description: string }> = {
  none: { label: '只完成任务', description: '不改变生产实体' },
  status_change: { label: '更新目标状态', description: '通过审核后更新目标对象状态' },
  lock_asset_candidate: { label: '锁定素材候选', description: '把素材需求锁定到指定候选' },
  accept_keyframe: { label: '接受关键帧', description: '将关键帧标记为 accepted' },
  approve_delivery_version: { label: '批准交付版本', description: '将交付版本标记为 approved' },
}

const taskPurposeMeta: Record<TaskPurpose, {
  label: string
  description: string
  taskType: UserTaskType
  resultType: WorkItemResultType
  targetTypes?: WorkTargetType[]
  defaultStatus?: string
  defaultTitle: string
}> = {
  general: {
    label: '让成员处理一件事',
    description: '只跟踪执行和审核，不自动改变实体',
    taskType: 'execution',
    resultType: 'none',
    defaultTitle: '处理制作事项',
  },
  review_output: {
    label: '审核一个产出',
    description: '成员提交说明，负责人确认是否完成',
    taskType: 'review',
    resultType: 'none',
    defaultTitle: '审核制作产出',
  },
  choose_asset_candidate: {
    label: '从候选中选择采用项',
    description: '通过后锁定素材需求到指定候选',
    taskType: 'decision',
    resultType: 'lock_asset_candidate',
    targetTypes: ['asset_slot'],
    defaultTitle: '选择素材候选',
  },
  confirm_content_unit: {
    label: '确认制作项',
    description: '通过后将制作项标记为 confirmed',
    taskType: 'review',
    resultType: 'status_change',
    targetTypes: ['content_unit'],
    defaultStatus: 'confirmed',
    defaultTitle: '确认制作项',
  },
  accept_keyframe: {
    label: '接受关键帧',
    description: '通过后将关键帧状态变为 accepted',
    taskType: 'review',
    resultType: 'accept_keyframe',
    targetTypes: ['keyframe'],
    defaultTitle: '接受关键帧',
  },
  approve_delivery: {
    label: '批准交付版本',
    description: '通过后将交付版本状态变为 approved',
    taskType: 'review',
    resultType: 'approve_delivery_version',
    targetTypes: ['delivery_version'],
    defaultTitle: '批准交付版本',
  },
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
    return members.map((member): MemberOption => ({
      id: member.user_id,
      name: memberDisplayName(member),
      role: ROLE_LABELS[member.role] ?? member.role,
    }))
  }
  return currentUser ? [{ id: currentUser.ID, name: currentUser.username, role: '负责人' }] : []
}

function parseWorkItemMetadata(raw?: string): WorkItemMetadata {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeTaskPriority(priority?: string): TaskPriority {
  if (priority === 'high' || priority === 'medium' || priority === 'low') return priority
  if (priority === 'urgent') return 'high'
  if (priority === 'normal') return 'medium'
  return 'medium'
}

function workStatusToTaskStatus(status: string, metadata: WorkItemMetadata): TaskStatus {
  if (status === 'running') return 'in_progress'
  if (status === 'review') return 'submitted'
  if (status === 'done') return 'approved'
  if (status === 'blocked') return 'blocked'
  if (status === 'cancelled') return 'cancelled'
  if (metadata.review_note && metadata.review_note.includes('要求修改')) return 'changes_requested'
  return 'todo'
}

function taskStatusToWorkStatus(status: TaskStatus): WorkItemStatus {
  if (status === 'in_progress') return 'running'
  if (status === 'submitted') return 'review'
  if (status === 'approved') return 'done'
  if (status === 'blocked') return 'blocked'
  if (status === 'cancelled') return 'cancelled'
  return 'todo'
}

function inferTaskType(item: WorkItem, metadata: WorkItemMetadata): UserTaskType {
  if (metadata.task_type && taskTypeMeta[metadata.task_type]) return metadata.task_type
  if (item.kind === 'ai') return 'generation'
  if (item.kind === 'hybrid') return 'hybrid'
  if (item.kind === 'review') return 'review'
  if (item.kind === 'fix') return 'fix'
  if (item.status === 'blocked') return 'coordination'
  return 'execution'
}

function workItemToProjectTask(item: WorkItem, reviewerName: string): ProjectTask {
  const metadata = parseWorkItemMetadata(item.metadata_json)
  const assignee = item.assignee
  const taskType = inferTaskType(item, metadata)
  return {
    id: `TASK-${item.ID}`,
    workItemID: item.ID,
    title: item.title,
    description: item.description || taskTypeMeta[taskType].description,
    target: metadata.target_label || `${item.target_type} #${item.target_id}`,
    taskType,
    assigneeId: item.assignee_id ?? 0,
    assigneeName: assignee?.username || (item.assignee_id ? `成员 ${item.assignee_id}` : '未分配'),
    reviewerName: metadata.reviewer_name || reviewerName,
    priority: normalizeTaskPriority(item.priority),
    status: workStatusToTaskStatus(item.status, metadata),
    due: metadata.due || '未设置',
    submittedAt: metadata.submitted_at,
    approvedAt: metadata.approved_at,
    deliverable: metadata.deliverable,
    reviewNote: metadata.review_note,
    sourceJobID: item.source_job_id,
    sourceCanvasID: item.source_canvas_id,
    resultType: item.result_type || 'none',
    resultJSON: item.result_json || '',
    applyStatus: item.apply_status || 'not_applicable',
    appliedAt: item.applied_at,
    applyError: item.apply_error,
    raw: item,
    metadata,
  }
}

function buildWorkItemPayload(task: ProjectTask, patch: Partial<ProjectTask> = {}) {
  const next = { ...task, ...patch }
  const metadata: WorkItemMetadata = {
    ...task.metadata,
    ...(patch.metadata ?? {}),
    task_type: next.taskType,
    target_label: next.target,
    due: next.due,
    deliverable: next.deliverable,
    review_note: next.reviewNote,
    submitted_at: next.submittedAt,
    approved_at: next.approvedAt,
    reviewer_name: next.reviewerName,
  }
  return {
    production_id: next.raw.production_id,
    target_type: next.raw.target_type || 'project',
    target_id: next.raw.target_id,
    kind: taskTypeMeta[next.taskType].kind,
    title: next.title,
    description: next.description,
    status: taskStatusToWorkStatus(next.status),
    priority: next.priority === 'high' ? 'high' : next.priority === 'low' ? 'low' : 'normal',
    assignee_id: next.assigneeId || undefined,
    source_job_id: next.sourceJobID ?? next.raw.source_job_id,
    source_canvas_id: next.sourceCanvasID ?? next.raw.source_canvas_id,
    result_type: next.resultType || next.raw.result_type || 'none',
    result_json: next.resultJSON ?? next.raw.result_json ?? '',
    metadata_json: JSON.stringify(metadata),
  }
}

function reviewStatusLabel(status: string) {
  return reviewStatusMeta[status as WorkReviewStatus]?.label ?? status
}

function reviewStatusClassName(status: string) {
  return reviewStatusMeta[status as WorkReviewStatus]?.className ?? 'bg-muted text-muted-foreground'
}

function applyStatusLabel(status: string) {
  if (status === 'applied') return '已应用'
  if (status === 'pending') return '待应用'
  if (status === 'failed') return '应用失败'
  return '无需应用'
}

function formatDateTime(value?: string) {
  if (!value) return '暂无'
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return value
  return time.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function optionalPositiveID(value: string) {
  const n = Number(value.trim())
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined
}

function taskMatchesUser(task: ProjectTask, user: User | null) {
  if (!user) return false
  return task.assigneeId === user.ID || task.assigneeName === user.username
}

function titleOfRecord(record: SemanticEntityRecord, fallback: string) {
  return String(record.title ?? record.name ?? record.label ?? `${fallback} #${record.ID}`)
}

function numericField(record: SemanticEntityRecord, key: string) {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringField(record: SemanticEntityRecord, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function targetOption(type: WorkTargetType, record: SemanticEntityRecord, fallback: string): WorkTargetOption {
  const status = stringField(record, 'status')
  const slotKey = stringField(record, 'slot_key')
  const kind = stringField(record, 'kind')
  return {
    key: `${type}:${record.ID}`,
    type,
    id: record.ID,
    label: `${targetTypeLabels[type]} · ${titleOfRecord(record, fallback)}`,
    productionId: type === 'production' ? record.ID : numericField(record, 'production_id'),
    status,
    subtitle: [kind, slotKey, status].filter(Boolean).join(' · '),
  }
}

function purposeTargetOptions(purpose: TaskPurpose, options: WorkTargetOption[]) {
  const allowed = taskPurposeMeta[purpose].targetTypes
  if (!allowed) return options
  return options.filter((option) => allowed.includes(option.type))
}

function defaultResultJSON(purpose: TaskPurpose) {
  const meta = taskPurposeMeta[purpose]
  if (meta.resultType === 'status_change') {
    return JSON.stringify({ status: meta.defaultStatus ?? 'confirmed' })
  }
  return ''
}

function resultSummary(resultType: WorkItemResultType, resultJSON: string) {
  if (resultType === 'none') return '通过后只完成任务，不自动改变实体。'
  if (resultType === 'status_change') {
    try {
      const parsed = JSON.parse(resultJSON) as { status?: string }
      return `通过后目标状态会变为 ${parsed.status || '指定状态'}。`
    } catch {
      return '通过后目标状态会按所选状态更新。'
    }
  }
  if (resultType === 'lock_asset_candidate') return '通过后系统会锁定素材需求到指定候选。'
  if (resultType === 'accept_keyframe') return '通过后关键帧状态会变为 accepted。'
  if (resultType === 'approve_delivery_version') return '通过后交付版本状态会变为 approved。'
  return '通过后应用任务结果。'
}

function firstOptionKey(options: WorkTargetOption[]) {
  return options[0]?.key ?? ''
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

function TaskCreateDialog({
  open,
  onOpenChange,
  projectName,
  memberOptions,
  targetOptions,
  onSubmit,
  isSubmitting,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName: string
  memberOptions: MemberOption[]
  targetOptions: WorkTargetOption[]
  onSubmit: (draft: TaskCreateDraft) => void
  isSubmitting: boolean
}) {
  const [purpose, setPurpose] = useState<TaskPurpose>('general')
  const [title, setTitle] = useState(taskPurposeMeta.general.defaultTitle)
  const [description, setDescription] = useState('')
  const [targetKey, setTargetKey] = useState(firstOptionKey(targetOptions))
  const [assigneeId, setAssigneeId] = useState(memberOptions[0]?.id ? String(memberOptions[0].id) : '')
  const [due, setDue] = useState('明天 18:00')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [targetStatus, setTargetStatus] = useState('confirmed')
  const [candidateID, setCandidateID] = useState('')

  const availableTargets = useMemo(() => purposeTargetOptions(purpose, targetOptions), [purpose, targetOptions])
  const selectedTarget = availableTargets.find((target) => target.key === targetKey) ?? availableTargets[0]
  const selectedAssignee = memberOptions.find((member) => String(member.id) === assigneeId) ?? memberOptions[0]
  const purposeMeta = taskPurposeMeta[purpose]
  const resultType = purposeMeta.resultType
  const resultJSON = resultType === 'status_change'
    ? JSON.stringify({ status: targetStatus.trim() || purposeMeta.defaultStatus || 'confirmed' })
    : resultType === 'lock_asset_candidate' && candidateID.trim()
      ? JSON.stringify({ asset_slot_candidate_id: Number(candidateID.trim()) })
      : defaultResultJSON(purpose)
  const canSubmit = !!selectedTarget && !!selectedAssignee && title.trim() && (resultType !== 'lock_asset_candidate' || optionalPositiveID(candidateID))

  useEffect(() => {
    const options = purposeTargetOptions(purpose, targetOptions)
    if (!options.some((option) => option.key === targetKey)) {
      setTargetKey(firstOptionKey(options))
    }
    const meta = taskPurposeMeta[purpose]
    setTitle((current) => current.trim() ? current : meta.defaultTitle)
    setTargetStatus(meta.defaultStatus ?? 'confirmed')
    if (meta.resultType !== 'lock_asset_candidate') setCandidateID('')
  }, [purpose, targetKey, targetOptions])

  useEffect(() => {
    if (!assigneeId && memberOptions[0]) {
      setAssigneeId(String(memberOptions[0].id))
    }
  }, [assigneeId, memberOptions])

  useEffect(() => {
    if (!targetKey && targetOptions[0]) {
      setTargetKey(targetOptions[0].key)
    }
  }, [targetKey, targetOptions])

  function submit() {
    if (!selectedTarget || !selectedAssignee || !canSubmit) return
    const fallbackDescription = `${taskPurposeMeta[purpose].label}，面向${selectedTarget.label}，成员完成后提交审核。`
    onSubmit({
      title: title.trim(),
      description: description.trim() || fallbackDescription,
      taskType: purposeMeta.taskType,
      target: selectedTarget,
      assignee: selectedAssignee,
      due,
      priority,
      resultType,
      resultJSON,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[min(920px,calc(100vw-32px))] overflow-auto p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>新建任务</DialogTitle>
          <DialogDescription>
            选择任务目的和关联对象，系统会自动生成完成后的实体动作。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 p-5">
          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <ClipboardList size={14} />
              <span>任务目的</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(taskPurposeMeta).map(([key, meta]) => {
                const active = purpose === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPurpose(key as TaskPurpose)}
                    className={cn(
                      'min-h-[86px] rounded-md border p-3 text-left transition-colors',
                      active ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/40'
                    )}
                  >
                    <p className="text-sm font-semibold text-foreground">{meta.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{meta.description}</p>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="grid grid-cols-[minmax(0,1fr)_280px] gap-4">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">关联对象</label>
                <select
                  value={selectedTarget?.key ?? ''}
                  onChange={(event) => setTargetKey(event.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                >
                  {availableTargets.map((target) => (
                    <option key={target.key} value={target.key}>{target.label}</option>
                  ))}
                </select>
                {availableTargets.length === 0 && (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">当前任务目的没有可用对象。</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">执行成员</label>
                  <select
                    value={selectedAssignee ? String(selectedAssignee.id) : ''}
                    onChange={(event) => setAssigneeId(event.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                  >
                    {memberOptions.map((member) => (
                      <option key={member.id} value={member.id}>{member.name} · {member.role}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">截止时间</label>
                  <select
                    value={due}
                    onChange={(event) => setDue(event.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                  >
                    <option value="今天 18:00">今天 18:00</option>
                    <option value="明天 18:00">明天 18:00</option>
                    <option value="本周五 18:00">本周五 18:00</option>
                    <option value="未设置">未设置</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_150px] gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">任务标题</label>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">优先级</label>
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as TaskPriority)}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                  >
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">任务说明</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="可补充交付要求、审核重点或上下文"
                  className="min-h-[82px] w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>

              {resultType === 'status_change' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">通过后目标状态</label>
                  <select
                    value={targetStatus}
                    onChange={(event) => setTargetStatus(event.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                  >
                    <option value="confirmed">confirmed</option>
                    <option value="locked">locked</option>
                    <option value="accepted">accepted</option>
                    <option value="approved">approved</option>
                  </select>
                </div>
              )}

              {resultType === 'lock_asset_candidate' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">候选 ID</label>
                  <input
                    value={candidateID}
                    onChange={(event) => setCandidateID(event.target.value)}
                    inputMode="numeric"
                    placeholder="输入 asset_slot_candidate_id"
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                </div>
              )}
            </div>

            <aside className="space-y-3 rounded-md border border-border bg-background p-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">对象摘要</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{selectedTarget?.label ?? '未选择对象'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{selectedTarget?.subtitle || projectName}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Info label="任务类型" value={taskTypeMeta[purposeMeta.taskType].label} />
                <Info label="完成动作" value={resultTypeMeta[resultType].label} />
                <Info label="执行成员" value={selectedAssignee?.name ?? '未选择'} />
                <Info label="截止时间" value={due} />
              </div>
              <div className="rounded-md border border-border bg-card p-3">
                <p className="text-xs font-medium text-muted-foreground">发布摘要</p>
                <p className="mt-2 text-sm leading-6 text-foreground">
                  将任务“{title.trim() || purposeMeta.defaultTitle}”分配给{selectedAssignee?.name ?? '成员'}。
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{resultSummary(resultType, resultJSON)}</p>
              </div>
            </aside>
          </section>
        </div>

        <DialogFooter className="border-t border-border px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>取消</Button>
          <Button onClick={submit} disabled={!canSubmit || isSubmitting} loading={isSubmitting}>发布任务</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [selectedTaskId, setSelectedTaskId] = useState(seededTasks[0]?.id ?? '')
  const [view, setView] = useState<TaskView>('all')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [submitDeliverable, setSubmitDeliverable] = useState('')
  const [submitJobId, setSubmitJobId] = useState('')
  const [submitCanvasId, setSubmitCanvasId] = useState('')
  const [reviewComment, setReviewComment] = useState('')
  const qc = useQueryClient()

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
  const { canManageMembers, isDirector } = usePermissions(members)
  const canManageWorkItems = canManageMembers || isDirector
  const memberOptions = useMemo(() => buildMemberOptions(members, currentUser), [members, currentUser])
  const reviewerName = members.find((member) => member.role === 'owner')?.user?.username ?? currentUser?.username ?? '项目负责人'

  const { data: workItems = [], isLoading: loadingTasks } = useQuery<WorkItem[]>({
    queryKey: ['work-items', projectId],
    queryFn: () => api.get(`/projects/${projectId}/entities/work-items`).then((response) => response.data),
    enabled: !!projectId,
  })

  const { data: workReviews = [] } = useQuery<WorkReview[]>({
    queryKey: ['work-reviews', projectId],
    queryFn: () => api.get(`/projects/${projectId}/entities/work-reviews`).then((response) => response.data),
    enabled: !!projectId,
  })

  const { data: productions = [] } = useQuery<SemanticEntityRecord[]>({
    queryKey: ['work-targets', projectId, 'productions'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('productions')) as Promise<SemanticEntityRecord[]>,
    enabled: !!projectId,
  })

  const { data: segments = [] } = useQuery<SemanticEntityRecord[]>({
    queryKey: ['work-targets', projectId, 'segments'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('segments')) as Promise<SemanticEntityRecord[]>,
    enabled: !!projectId,
  })

  const { data: contentUnits = [] } = useQuery<SemanticEntityRecord[]>({
    queryKey: ['work-targets', projectId, 'content-units'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('contentUnits')) as Promise<SemanticEntityRecord[]>,
    enabled: !!projectId,
  })

  const { data: assetSlots = [] } = useQuery<SemanticEntityRecord[]>({
    queryKey: ['work-targets', projectId, 'asset-slots'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('assetSlots')) as Promise<SemanticEntityRecord[]>,
    enabled: !!projectId,
  })

  const { data: keyframes = [] } = useQuery<SemanticEntityRecord[]>({
    queryKey: ['work-targets', projectId, 'keyframes'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('keyframes')) as Promise<SemanticEntityRecord[]>,
    enabled: !!projectId,
  })

  const { data: deliveryVersions = [] } = useQuery<SemanticEntityRecord[]>({
    queryKey: ['work-targets', projectId, 'delivery-versions'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('deliveryVersions')) as Promise<SemanticEntityRecord[]>,
    enabled: !!projectId,
  })

  const workTargetOptions = useMemo<WorkTargetOption[]>(() => {
    if (!projectId) return []
    return [
      { key: `project:${projectId}`, type: 'project', id: projectId, label: `项目 · ${project?.name ?? '当前项目'}` },
      ...productions.map((record) => targetOption('production', record, '制作')),
      ...segments.map((record) => targetOption('segment', record, '剧本段落')),
      ...contentUnits.map((record) => targetOption('content_unit', record, '制作项')),
      ...assetSlots.map((record) => targetOption('asset_slot', record, '素材需求')),
      ...keyframes.map((record) => targetOption('keyframe', record, '关键帧')),
      ...deliveryVersions.map((record) => targetOption('delivery_version', record, '交付版本')),
    ]
  }, [assetSlots, contentUnits, deliveryVersions, keyframes, productions, project?.name, projectId, segments])

  const tasks = useMemo(
    () => workItems.map((item) => workItemToProjectTask(item, reviewerName)),
    [reviewerName, workItems]
  )

  const createWorkItem = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post(`/projects/${projectId}/entities/work-items`, payload).then((response) => response.data as WorkItem),
    onSuccess: (item) => {
      void qc.invalidateQueries({ queryKey: ['work-items', projectId] })
      setSelectedTaskId(`TASK-${item.ID}`)
      setView('all')
      setStatusFilter('all')
      setTaskDialogOpen(false)
    },
  })

  const patchWorkItem = useMutation({
    mutationFn: async ({
      task,
      patch,
      review,
    }: {
      task: ProjectTask
      patch: Partial<ProjectTask>
      review?: { status: WorkReviewStatus; comment: string }
    }) => {
      const updated = await api.patch(
        `/projects/${projectId}/entities/work-items/${task.workItemID}`,
        buildWorkItemPayload(task, patch)
      ).then((response) => response.data)
      if (review) {
        await api.post(`/projects/${projectId}/entities/work-reviews`, {
          work_item_id: task.workItemID,
          reviewer_id: currentUser?.ID,
          status: review.status,
          comment: review.comment,
          metadata_json: JSON.stringify({ source: 'collaboration_page' }),
        })
      }
      return updated
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['work-items', projectId] })
      void qc.invalidateQueries({ queryKey: ['work-reviews', projectId] })
    },
  })

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

  const selectedTaskReviews = useMemo(() => {
    if (!selectedTask) return []
    return workReviews
      .filter((review) => review.work_item_id === selectedTask.workItemID)
      .sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime())
  }, [selectedTask, workReviews])

  useEffect(() => {
    setSubmitDeliverable(selectedTask?.deliverable && selectedTask.deliverable !== '处理中' ? selectedTask.deliverable : '')
    setSubmitJobId(selectedTask?.sourceJobID ? String(selectedTask.sourceJobID) : '')
    setSubmitCanvasId(selectedTask?.sourceCanvasID ? String(selectedTask.sourceCanvasID) : '')
    setReviewComment('')
  }, [selectedTask?.workItemID])

  function updateTask(task: ProjectTask, patch: Partial<ProjectTask>, review?: { status: WorkReviewStatus; comment: string }) {
    patchWorkItem.mutate({ task, patch, review })
  }

  function submitTaskForReview(task: ProjectTask) {
    const deliverable = submitDeliverable.trim() || task.deliverable || '已提交执行结果，等待负责人审核。'
    updateTask(task, {
      status: 'submitted',
      submittedAt: new Date().toISOString(),
      deliverable,
      reviewNote: '等待负责人审核。',
      sourceJobID: optionalPositiveID(submitJobId),
      sourceCanvasID: optionalPositiveID(submitCanvasId),
    })
  }

  function reviewTask(task: ProjectTask, status: Extract<WorkReviewStatus, 'approved' | 'changes_requested'>) {
    const fallback = status === 'approved' ? '负责人已通过，任务完成。' : '负责人要求修改后重新提交。'
    const comment = reviewComment.trim() || fallback
    updateTask(task, {
      status: status === 'approved' ? 'approved' : 'changes_requested',
      approvedAt: status === 'approved' ? new Date().toISOString() : task.approvedAt,
      reviewNote: comment,
    }, {
      status,
      comment,
    })
    setReviewComment('')
  }

  function createTask(draft: TaskCreateDraft) {
    if (!projectId) return
    const metadata: WorkItemMetadata = {
      task_type: draft.taskType,
      target_label: draft.target.label,
      due: draft.due.trim() || '未设置',
      reviewer_name: reviewerName,
    }
    createWorkItem.mutate({
      production_id: draft.target.productionId,
      target_type: draft.target.type,
      target_id: draft.target.id,
      kind: taskTypeMeta[draft.taskType].kind,
      title: draft.title.trim(),
      description: draft.description.trim(),
      status: draft.taskType === 'coordination' ? 'blocked' : 'todo',
      priority: draft.priority === 'high' ? 'high' : draft.priority === 'low' ? 'low' : 'normal',
      assignee_id: draft.assignee.id,
      result_type: draft.resultType,
      result_json: draft.resultType === 'none' ? '' : draft.resultJSON.trim(),
      metadata_json: JSON.stringify(metadata),
    })
  }

  return (
    <div className="h-full min-w-0 overflow-auto bg-background">
      <div className="min-w-[1180px] space-y-4 p-6">
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
            <Button className="gap-2" onClick={() => setTaskDialogOpen(true)} disabled={!canManageWorkItems || memberOptions.length === 0 || workTargetOptions.length === 0}>
              <Plus size={15} />
              新建任务
            </Button>
          </div>
        </header>

        <TaskCreateDialog
          open={taskDialogOpen}
          onOpenChange={setTaskDialogOpen}
          projectName={project?.name ?? '当前项目'}
          memberOptions={memberOptions}
          targetOptions={workTargetOptions}
          onSubmit={createTask}
          isSubmitting={createWorkItem.isPending}
        />

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
                <span>任务发布</span>
              </div>
              <div className="space-y-3 rounded-md border border-border bg-background p-3">
                <p className="text-xs leading-5 text-muted-foreground">
                  选择任务目的、关联对象和完成动作后发布。系统会自动生成底层任务结果，不需要手写 JSON。
                </p>
                <Button className="w-full gap-2" onClick={() => setTaskDialogOpen(true)} disabled={!canManageWorkItems || memberOptions.length === 0 || workTargetOptions.length === 0}>
                  <UserCheck size={15} />
                  新建任务
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
                          <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{taskTypeMeta[task.taskType].label}</span>
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
              {loadingTasks && (
                <div className="grid min-h-[260px] place-items-center rounded-lg border border-dashed border-border text-center">
                  <div>
                    <Clock3 size={24} className="mx-auto text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">正在加载任务</p>
                    <p className="mt-1 text-xs text-muted-foreground">从项目 WorkItem 列表读取分配记录。</p>
                  </div>
                </div>
              )}
              {!loadingTasks && visibleTasks.length === 0 && (
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
              <p className="mt-1 text-xs text-muted-foreground">任务可声明完成后的实体变更；负责人通过时由后端应用并记录事件。</p>
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
                    <Info label="任务类型" value={taskTypeMeta[selectedTask.taskType].label} />
                    <Info label="执行成员" value={selectedTask.assigneeName} />
                    <Info label="审核人" value={selectedTask.reviewerName} />
                    <Info label="截止时间" value={selectedTask.due} />
                    <Info label="关联对象" value={selectedTask.target} />
                  </div>
                </DetailBlock>

                <DetailBlock title="任务说明" icon={ListChecks}>
                  <p className="text-sm leading-relaxed text-muted-foreground">{selectedTask.description}</p>
                </DetailBlock>

                <DetailBlock title="完成动作" icon={ClipboardCheck}>
                  <div className="space-y-2 rounded-md border border-border bg-background p-3 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <Info label="动作" value={resultTypeMeta[(selectedTask.resultType as WorkItemResultType) || 'none']?.label ?? selectedTask.resultType} />
                      <Info label="应用状态" value={applyStatusLabel(selectedTask.applyStatus)} />
                    </div>
                    {selectedTask.resultJSON && (
                      <pre className="max-h-28 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] text-muted-foreground">{selectedTask.resultJSON}</pre>
                    )}
                    {selectedTask.applyError && <p className="text-rose-600 dark:text-rose-300">{selectedTask.applyError}</p>}
                    {selectedTask.appliedAt && <p className="text-muted-foreground">应用时间：{formatDateTime(selectedTask.appliedAt)}</p>}
                  </div>
                </DetailBlock>

                <DetailBlock title="提交内容" icon={FileCheck2}>
                  <div className="space-y-2">
                    <div className="rounded-md border border-border bg-background p-3">
                      <p className="text-sm text-foreground">{selectedTask.deliverable ?? '成员尚未提交交付物。'}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <span>提交时间：{formatDateTime(selectedTask.submittedAt)}</span>
                        <span>通过时间：{formatDateTime(selectedTask.approvedAt)}</span>
                      </div>
                      {(selectedTask.sourceJobID || selectedTask.sourceCanvasID) && (
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                          {selectedTask.sourceJobID && <span className="rounded bg-muted px-2 py-1">Job #{selectedTask.sourceJobID}</span>}
                          {selectedTask.sourceCanvasID && <span className="rounded bg-muted px-2 py-1">Canvas #{selectedTask.sourceCanvasID}</span>}
                        </div>
                      )}
                    </div>
                    {selectedTask.status !== 'approved' && (
                      <div className="space-y-2 rounded-md border border-border bg-background p-3">
                        <textarea
                          value={submitDeliverable}
                          onChange={(event) => setSubmitDeliverable(event.target.value)}
                          placeholder="填写交付说明，例如已上传的资源、生成结果、处理范围或待审核重点"
                          className="min-h-[76px] w-full resize-none rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={submitJobId}
                            onChange={(event) => setSubmitJobId(event.target.value)}
                            placeholder="关联 Job ID"
                            inputMode="numeric"
                            className="h-8 rounded-md border border-border bg-card px-2 text-xs outline-none focus:border-primary"
                          />
                          <input
                            value={submitCanvasId}
                            onChange={(event) => setSubmitCanvasId(event.target.value)}
                            placeholder="关联 Canvas ID"
                            inputMode="numeric"
                            className="h-8 rounded-md border border-border bg-card px-2 text-xs outline-none focus:border-primary"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </DetailBlock>

                <DetailBlock title="审核意见" icon={MessageSquareText}>
                  <div className="space-y-2">
                    <div className="rounded-md border border-border bg-background p-3 text-sm leading-relaxed text-muted-foreground">
                      {selectedTask.reviewNote ?? '暂无审核意见。'}
                    </div>
                    {selectedTaskReviews.length > 0 && (
                      <div className="space-y-2">
                        {selectedTaskReviews.map((review) => (
                          <div key={review.ID} className="rounded-md border border-border bg-background p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className={cn('rounded px-2 py-0.5 text-[10px] font-medium', reviewStatusClassName(review.status))}>
                                {reviewStatusLabel(review.status)}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{formatDateTime(review.CreatedAt)}</span>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">
                              {review.comment || '无文字意见'}
                            </p>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              审核人：{review.reviewer?.username || (review.reviewer_id ? `成员 ${review.reviewer_id}` : selectedTask.reviewerName)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    {selectedTask.status === 'submitted' && canManageWorkItems && (
                      <textarea
                        value={reviewComment}
                        onChange={(event) => setReviewComment(event.target.value)}
                        placeholder="填写审核意见，会同步写入任务审核记录"
                        className="min-h-[76px] w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    )}
                  </div>
                </DetailBlock>

                <div className="grid gap-2 border-t border-border pt-3">
                  <Button
                    variant="outline"
                    className="justify-start gap-2"
                    onClick={() => updateTask(selectedTask, { status: 'in_progress', deliverable: '处理中' })}
                    disabled={selectedTask.status === 'approved' || patchWorkItem.isPending}
                  >
                    <Clock3 size={15} />
                    标记进行中
                  </Button>
                  <Button
                    className="justify-start gap-2"
                    onClick={() => submitTaskForReview(selectedTask)}
                    disabled={selectedTask.status === 'submitted' || selectedTask.status === 'approved' || patchWorkItem.isPending}
                  >
                    <Send size={15} />
                    提交审核
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start gap-2"
                    onClick={() => reviewTask(selectedTask, 'changes_requested')}
                    disabled={selectedTask.status !== 'submitted' || !canManageWorkItems || patchWorkItem.isPending}
                  >
                    <RefreshCcw size={15} />
                    要求修改
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start gap-2"
                    onClick={() => reviewTask(selectedTask, 'approved')}
                    disabled={selectedTask.status !== 'submitted' || !canManageWorkItems || patchWorkItem.isPending}
                  >
                    <CheckCircle2 size={15} />
                    通过完成
                  </Button>
                </div>

                {!canManageWorkItems && selectedTask.status === 'submitted' && (
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
