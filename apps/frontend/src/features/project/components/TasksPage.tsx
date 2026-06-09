import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  BadgeCheck,
  Bot,
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

import {
  createSemanticEntity,
  listSemanticEntities,
  semanticEntityConfig,
  updateSemanticEntity,
  type SemanticEntityPayload,
  type SemanticEntityRecord,
} from '@/shared/infrastructure/api/semanticEntities'
import {
  ProjectTaskActionButton,
  ProjectTaskActionStack,
  ProjectTaskAvatar,
  ProjectTaskBadge,
  ProjectTaskCallout,
  ProjectTaskCodeBlock,
  ProjectTaskDetailBlock,
  ProjectTaskDetailIntro,
  ProjectTaskDialog,
  ProjectTaskDialogBody,
  ProjectTaskDialogBodyInner,
  ProjectTaskDialogContent,
  ProjectTaskDialogDescription,
  ProjectTaskDialogFooter,
  ProjectTaskDialogHeader,
  ProjectTaskDialogTitle,
  ProjectTaskDividerStack,
  ProjectTaskEmptyState,
  ProjectTaskFeedbackText,
  ProjectTaskField,
  ProjectTaskFieldGrid,
  ProjectTaskFieldLabel,
  ProjectTaskFilterControl,
  ProjectTaskFormColumn,
  ProjectTaskFormGrid,
  ProjectTaskHeading,
  ProjectTaskIconActionButton,
  ProjectTaskInfoGrid,
  ProjectTaskInfoItem,
  ProjectTaskInput,
  ProjectTaskInlineRow,
  ProjectTaskListCard,
  ProjectTaskListCardBadges,
  ProjectTaskListCardContent,
  ProjectTaskListCardLayout,
  ProjectTaskMainGrid,
  ProjectTaskMeta,
  ProjectTaskMetaList,
  ProjectTaskMetricGrid,
  ProjectTaskPageLayout,
  ProjectTaskPanel,
  ProjectTaskDetailPanel,
  ProjectTaskListPanel,
  ProjectTaskPublishPanel,
  ProjectTaskPurposeButton,
  ProjectTaskPurposeGrid,
  ProjectTaskReviewRecord,
  ProjectTaskSelect,
  ProjectTaskSidebar,
  ProjectTaskStack,
  ProjectTaskStatusBadge,
  ProjectTaskSubmitMetaGrid,
  ProjectTaskSummaryPanel,
  ProjectTaskSurfaceItem,
  ProjectTaskText,
  ProjectTaskTextarea,
  ProjectTaskWorkflowGrid,
  ProjectSurfaceHeader,
  type ProjectTaskMetricItem,
} from '@movscript/ui'
import { buildCommandFirstClientInput } from '@/features/agent/domain/agentCommandInput'
import { openAgentPanelWorkspace, openAgentPanelThread, registerAgentPanelPageTool } from '@/features/agent/application/agentPanelBridge'
import { usePermissions } from '@/features/project/application/usePermissions'
import { api } from '@/shared/infrastructure/api'
import { generatedKeyframeCandidateTargetId, isGeneratedKeyframeCandidateRecord, isUnresolvedCandidateStatus } from '@/features/agent/domain/agentGeneratedResourceBinding'
import { invalidateAssetCandidateConsumers } from '@/shared/infrastructure/assetCandidateQueryInvalidation'
import { agentRunPath, ROUTES } from '@/routes/projectRoutes'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import type { ProjectMember, User } from '@/types'
import {
  projectAiAssignmentRecipe,
  projectErrorRecipe,
  projectPriorityRecipe,
  projectReviewStatusRecipe,
  projectTaskStatusRecipe,
} from '@/features/project/presentation/projectSemanticUi'

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
type WorkTargetType = 'project' | 'production' | 'segment' | 'scene_moment' | 'content_unit' | 'asset_slot' | 'keyframe'
type WorkItemResultType = 'none' | 'lock_asset_candidate' | 'accept_keyframe'
type TaskPurpose = 'general' | 'review_output' | 'choose_asset_candidate' | 'accept_keyframe'
type TaskAgentKey = 'project_assistant' | 'asset_agent' | 'storyboard_agent'

interface TaskAgentOption {
  key: TaskAgentKey
  name: string
  description: string
}

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
  agent_key?: TaskAgentKey | string
  agent_name?: string
  agent_source?: 'task_publish' | string
  agent_request_id?: string
  agent_thread_id?: string
  agent_run_id?: string
  agent_session_id?: string
  agent_status?: string
  agent_published_at?: string
  agent_completed_at?: string
  agent_error?: string
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
  subtitle?: string
}

interface MemberOption {
  id: number
  name: string
  role: string
}

interface TaskCreateWorkspace {
  title: string
  description: string
  taskType: UserTaskType
  target: WorkTargetOption
  assignee: MemberOption
  due: string
  priority: TaskPriority
  resultType: WorkItemResultType
  resultJSON: string
  agentKey?: TaskAgentKey
}

interface TaskCreateDialogInitialWorkspace {
  purpose?: TaskPurpose
  targetType?: WorkTargetType
  targetId?: number
  candidateId?: number
}

const seededTasks: ProjectTask[] = []

const taskAgentOptions: TaskAgentOption[] = [
  {
    key: 'project_assistant',
    name: '项目助理 Agent',
    description: '整理上下文、拆解执行步骤，并把处理过程留在任务会话里。',
  },
  {
    key: 'asset_agent',
    name: '素材 Agent',
    description: '适合素材需求、候选资源、图片或视频资产相关任务。',
  },
  {
    key: 'storyboard_agent',
    name: '分镜 Agent',
    description: '适合画面锚点、镜头描述和内容结构相关任务。',
  },
]

const defaultTaskAgentKey: TaskAgentKey = 'project_assistant'

function taskAgentOptionByKey(key?: string) {
  return taskAgentOptions.find((agent) => agent.key === key) ?? taskAgentOptions.find((agent) => agent.key === defaultTaskAgentKey)!
}

const targetTypeLabels: Record<WorkTargetType, string> = {
  project: '项目',
  production: '制作',
  segment: '编排段',
  scene_moment: '情景',
  content_unit: '制作项',
  asset_slot: '素材需求',
  keyframe: '画面锚点',
}

const statusMeta: Record<TaskStatus, { label: string; icon: typeof ClipboardList }> = {
  todo: {
    label: '待处理',
    icon: ListTodo,
  },
  in_progress: {
    label: '进行中',
    icon: Clock3,
  },
  submitted: {
    label: '待审核',
    icon: Send,
  },
  changes_requested: {
    label: '需修改',
    icon: RefreshCcw,
  },
  blocked: {
    label: '被阻塞',
    icon: AlertTriangle,
  },
  approved: {
    label: '已完成',
    icon: CheckCircle2,
  },
  cancelled: {
    label: '已取消',
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

const priorityMeta: Record<TaskPriority, { label: string }> = {
  high: { label: '高' },
  medium: { label: '中' },
  low: { label: '低' },
}

const reviewStatusMeta: Record<WorkReviewStatus, { label: string }> = {
  pending: { label: '待审核' },
  approved: { label: '通过' },
  changes_requested: { label: '要求修改' },
  rejected: { label: '拒绝' },
}

const resultTypeMeta: Record<WorkItemResultType, { label: string; description: string }> = {
  none: { label: '只完成任务', description: '不改变生产实体' },
  lock_asset_candidate: { label: '锁定素材候选', description: '把素材需求锁定到指定候选' },
  accept_keyframe: { label: '采纳画面锚点', description: '采纳候选画面锚点' },
}

const taskPurposeMeta: Record<TaskPurpose, {
  label: string
  description: string
  taskType: UserTaskType
  resultType: WorkItemResultType
  targetTypes?: WorkTargetType[]
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
  accept_keyframe: {
    label: '采纳画面锚点',
    description: '通过后采纳候选画面锚点',
    taskType: 'review',
    resultType: 'accept_keyframe',
    targetTypes: ['keyframe'],
    defaultTitle: '采纳画面锚点',
  },
}

function isTaskPurpose(value: string | null): value is TaskPurpose {
  return !!value && Object.prototype.hasOwnProperty.call(taskPurposeMeta, value)
}

function isWorkTargetType(value: string | null): value is WorkTargetType {
  return !!value && Object.prototype.hasOwnProperty.call(targetTypeLabels, value)
}

function positiveSearchParamID(value: string | null) {
  if (!value) return undefined
  const n = Number(value.trim())
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined
}

function taskCreateInitialWorkspaceFromSearch(params: URLSearchParams): TaskCreateDialogInitialWorkspace | undefined {
  if (params.get('create') !== '1') return undefined
  const purpose = params.get('purpose')
  const targetType = params.get('target_type')
  return {
    purpose: isTaskPurpose(purpose) ? purpose : undefined,
    targetType: isWorkTargetType(targetType) ? targetType : undefined,
    targetId: positiveSearchParamID(params.get('target_id')),
    candidateId: positiveSearchParamID(params.get('candidate_id')),
  }
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

function agentWorkStatusLabel(status?: string, requestId?: string) {
  if (!status && !requestId) return '未发布'
  if (status === 'queued') return '已发布'
  if (status === 'in_progress' || status === 'running') return '执行中'
  if (status === 'requires_action') return '等待确认'
  if (status === 'completed') return '已完成'
  if (status === 'completed_with_warnings') return '完成有警告'
  if (status === 'failed' || status === 'error') return '失败'
  if (status === 'cancelled') return '已取消'
  if (requestId) return status ? `已发布 · ${status}` : '已发布'
  return status ?? '未发布'
}

function agentRequestCanRetry(status?: string) {
  return status === 'failed' || status === 'error' || status === 'cancelled'
}

function buildAgentTaskMessage(task: ProjectTask, projectName: string) {
  const lines = [
    '请基于任务系统中的这条任务开始处理，并把执行过程和结果保留在当前 AI 会话里。',
    '',
    `项目：${projectName}`,
    `任务 ID：${task.id}`,
    `任务标题：${task.title}`,
    `任务类型：${taskTypeMeta[task.taskType].label}`,
    `当前状态：${statusMeta[task.status].label}`,
    `优先级：${priorityMeta[task.priority].label}`,
    `执行成员：${task.assigneeName}`,
    `审核人：${task.reviewerName}`,
    `关联对象：${task.target}`,
    `截止时间：${task.due}`,
    '',
    '任务说明：',
    task.description || '无',
    '',
    '完成动作：',
    `${resultTypeMeta[(task.resultType as WorkItemResultType) || 'none']?.label ?? task.resultType}。${resultSummary((task.resultType as WorkItemResultType) || 'none', task.resultJSON)}`,
  ]
  if (task.deliverable) {
    lines.push('', '已有提交内容：', task.deliverable)
  }
  if (task.reviewNote) {
    lines.push('', '审核意见：', task.reviewNote)
  }
  lines.push(
    '',
    '执行要求：',
    '- 先按任务说明处理，不要自动把业务任务标记完成。',
    '- 如果需要人确认，请在会话里说明需要确认的点。',
    '- 完成后给出可供成员提交审核的结果摘要。',
  )
  return lines.join('\n')
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

function recordField(record: SemanticEntityRecord, key: string) {
  const value = record[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as SemanticEntityRecord : undefined
}

function targetOption(type: WorkTargetType, record: SemanticEntityRecord, fallback: string): WorkTargetOption {
  const slotKey = stringField(record, 'slot_key')
  const kind = stringField(record, 'kind')
  return {
    key: `${type}:${record.ID}`,
    type,
    id: record.ID,
    label: `${targetTypeLabels[type]} · ${titleOfRecord(record, fallback)}`,
    productionId: type === 'production' ? record.ID : numericField(record, 'production_id'),
    subtitle: [kind, slotKey].filter(Boolean).join(' · '),
  }
}

function purposeTargetOptions(purpose: TaskPurpose, options: WorkTargetOption[]) {
  const allowed = taskPurposeMeta[purpose].targetTypes
  if (!allowed) return options
  return options.filter((option) => allowed.includes(option.type))
}

function candidateOptionsForAssetSlot(candidates: SemanticEntityRecord[], assetSlotId?: number) {
  if (!assetSlotId) return []
  return candidates.filter((candidate) => (
    numericField(candidate, 'asset_slot_id') === assetSlotId
    && numericField(candidate, 'candidate_asset_slot_id')
    && isUnresolvedCandidateStatus(candidate.status)
    && assetSlotCandidateHasResource(candidate)
  ))
}

function assetSlotCandidateHasResource(candidate: SemanticEntityRecord) {
  const candidateSlot = recordField(candidate, 'candidate_asset_slot')
  return candidateSlot ? recordHasLoadedResource(candidateSlot) : recordHasLoadedResource(candidate)
}

function candidateOptionLabel(candidate: SemanticEntityRecord) {
  const candidateSlot = recordField(candidate, 'candidate_asset_slot')
  const slotLabel = candidateSlot ? titleOfRecord(candidateSlot, '候选素材') : `候选素材 #${numericField(candidate, 'candidate_asset_slot_id') ?? candidate.ID}`
  return `${slotLabel} · ${candidate.status ?? 'candidate'}`
}

function keyframeCandidateOptionsForTarget(keyframes: SemanticEntityRecord[], targetKeyframeId?: number) {
  if (!targetKeyframeId) return []
  return keyframes.filter((keyframe) => (
    generatedKeyframeCandidateTargetId(keyframe) === targetKeyframeId
    && isUnresolvedCandidateStatus(keyframe.status)
    && recordHasLoadedResource(keyframe)
  ))
}

function recordHasLoadedResource(record: SemanticEntityRecord) {
  const resource = recordField(record, 'resource')
  return resource !== undefined && numericField(resource, 'ID') !== undefined
}

function keyframeCandidateOptionLabel(candidate: SemanticEntityRecord) {
  const label = titleOfRecord(candidate, '候选画面锚点')
  return `${label} · ${candidate.status ?? 'candidate'}`
}

function defaultResultJSON(_purpose: TaskPurpose) {
  return ''
}

function resultSummary(resultType: WorkItemResultType, resultJSON: string) {
  if (resultType === 'none') return '通过后只完成任务，不自动改变实体。'
  if (resultType === 'lock_asset_candidate') return '通过后系统会锁定素材需求到指定候选。'
  if (resultType === 'accept_keyframe') {
    try {
      const parsed = JSON.parse(resultJSON) as { keyframe_candidate_id?: unknown }
      if (parsed.keyframe_candidate_id) return '通过后系统会采纳候选画面锚点，并把候选资源同步到目标画面锚点。'
    } catch {
      // Fall through to the direct-accept copy below.
    }
    return '通过后系统会采纳候选画面锚点。'
  }
  return '通过后应用任务结果。'
}

function firstOptionKey(options: WorkTargetOption[]) {
  return options[0]?.key ?? ''
}

function StatusPill({ status }: { status: TaskStatus }) {
  const meta = statusMeta[status]
  const Icon = meta.icon
  return (
    <ProjectTaskStatusBadge {...projectTaskStatusRecipe(status)}>
      <Icon size={12} />
      {meta.label}
    </ProjectTaskStatusBadge>
  )
}

function PriorityPill({ priority }: { priority: TaskPriority }) {
  const meta = priorityMeta[priority]
  return <ProjectTaskStatusBadge {...projectPriorityRecipe(priority)}>{meta.label}优先级</ProjectTaskStatusBadge>
}

function TaskCreateDialog({
  open,
  onOpenChange,
  initialWorkspace,
  projectName,
  memberOptions,
  targetOptions,
  assetSlotCandidates,
  keyframes,
  onSubmit,
  isSubmitting,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialWorkspace?: TaskCreateDialogInitialWorkspace
  projectName: string
  memberOptions: MemberOption[]
  targetOptions: WorkTargetOption[]
  assetSlotCandidates: SemanticEntityRecord[]
  keyframes: SemanticEntityRecord[]
  onSubmit: (workspace: TaskCreateWorkspace) => void
  isSubmitting: boolean
}) {
  const [purpose, setPurpose] = useState<TaskPurpose>('general')
  const [title, setTitle] = useState(taskPurposeMeta.general.defaultTitle)
  const [description, setDescription] = useState('')
  const [targetKey, setTargetKey] = useState(firstOptionKey(targetOptions))
  const [assigneeId, setAssigneeId] = useState(memberOptions[0]?.id ? String(memberOptions[0].id) : '')
  const [due, setDue] = useState('明天 18:00')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [candidateID, setCandidateID] = useState('')
  const [agentKey, setAgentKey] = useState<TaskAgentKey | ''>('')
  const initialTargetKey = initialWorkspace?.targetType && initialWorkspace.targetId ? `${initialWorkspace.targetType}:${initialWorkspace.targetId}` : ''

  const availableTargets = useMemo(() => purposeTargetOptions(purpose, targetOptions), [purpose, targetOptions])
  const selectedTarget = availableTargets.find((target) => target.key === targetKey) ?? availableTargets[0]
  const selectedAssignee = memberOptions.find((member) => String(member.id) === assigneeId) ?? memberOptions[0]
  const purposeMeta = taskPurposeMeta[purpose]
  const selectedAgent = agentKey ? taskAgentOptionByKey(agentKey) : undefined
  const resultType = purposeMeta.resultType
  const candidateOptions = useMemo(
    () => candidateOptionsForAssetSlot(assetSlotCandidates, resultType === 'lock_asset_candidate' ? selectedTarget?.id : undefined),
    [assetSlotCandidates, resultType, selectedTarget?.id],
  )
  const keyframeCandidateOptions = useMemo(
    () => keyframeCandidateOptionsForTarget(keyframes, resultType === 'accept_keyframe' ? selectedTarget?.id : undefined),
    [keyframes, resultType, selectedTarget?.id],
  )
  const matchedAssetCandidate = candidateOptions.find((candidate) => String(candidate.ID) === candidateID)
  const requestedAssetCandidateUnavailable = resultType === 'lock_asset_candidate'
    && initialWorkspace?.candidateId !== undefined
    && selectedTarget?.type === 'asset_slot'
    && selectedTarget.id === initialWorkspace.targetId
    && candidateID === String(initialWorkspace.candidateId)
    && !candidateOptions.some((candidate) => candidate.ID === initialWorkspace.candidateId)
  const selectedCandidate = requestedAssetCandidateUnavailable
    ? undefined
    : matchedAssetCandidate ?? candidateOptions[0]
  const matchedKeyframeCandidate = keyframeCandidateOptions.find((candidate) => String(candidate.ID) === candidateID)
  const requestedKeyframeCandidateUnavailable = resultType === 'accept_keyframe'
    && initialWorkspace?.candidateId !== undefined
    && selectedTarget?.type === 'keyframe'
    && selectedTarget.id === initialWorkspace.targetId
    && candidateID === String(initialWorkspace.candidateId)
    && !keyframeCandidateOptions.some((candidate) => candidate.ID === initialWorkspace.candidateId)
  const selectedKeyframeCandidate = requestedKeyframeCandidateUnavailable
    ? undefined
    : matchedKeyframeCandidate ?? keyframeCandidateOptions[0]
  const resultJSON = resultType === 'lock_asset_candidate' && selectedCandidate
      ? JSON.stringify({ asset_slot_candidate_id: selectedCandidate.ID })
      : resultType === 'accept_keyframe' && selectedKeyframeCandidate
        ? JSON.stringify({ keyframe_candidate_id: selectedKeyframeCandidate.ID })
      : defaultResultJSON(purpose)
  const canSubmit = !!selectedTarget && !!selectedAssignee && title.trim() && (resultType !== 'lock_asset_candidate' || !!selectedCandidate) && !requestedKeyframeCandidateUnavailable
    && !requestedAssetCandidateUnavailable

  useEffect(() => {
    if (!open) return
    const nextPurpose = initialWorkspace?.purpose ?? 'general'
    const nextTargets = purposeTargetOptions(nextPurpose, targetOptions)
    const nextTargetKey = initialTargetKey && nextTargets.some((target) => target.key === initialTargetKey)
      ? initialTargetKey
      : firstOptionKey(nextTargets)
    setPurpose(nextPurpose)
    setTitle(taskPurposeMeta[nextPurpose].defaultTitle)
    setDescription('')
    setTargetKey(nextTargetKey)
    setAssigneeId(memberOptions[0]?.id ? String(memberOptions[0].id) : '')
    setDue('明天 18:00')
    setPriority('medium')
    setCandidateID(initialWorkspace?.candidateId ? String(initialWorkspace.candidateId) : '')
    setAgentKey('')
  }, [initialWorkspace?.candidateId, initialWorkspace?.purpose, initialTargetKey, memberOptions, open, targetOptions])

  useEffect(() => {
    const options = purposeTargetOptions(purpose, targetOptions)
    if (!options.some((option) => option.key === targetKey)) {
      setTargetKey(firstOptionKey(options))
    }
    const meta = taskPurposeMeta[purpose]
    setTitle((current) => current.trim() ? current : meta.defaultTitle)
    if (meta.resultType !== 'lock_asset_candidate' && meta.resultType !== 'accept_keyframe') setCandidateID('')
  }, [purpose, targetKey, targetOptions])

  useEffect(() => {
    if (resultType !== 'lock_asset_candidate') return
    if (requestedAssetCandidateUnavailable) return
    if (!candidateOptions.length) {
      setCandidateID('')
      return
    }
    if (!candidateOptions.some((candidate) => String(candidate.ID) === candidateID)) {
      setCandidateID(String(candidateOptions[0].ID))
    }
  }, [candidateID, candidateOptions, requestedAssetCandidateUnavailable, resultType])

  useEffect(() => {
    if (resultType !== 'accept_keyframe') return
    if (requestedKeyframeCandidateUnavailable) return
    if (!keyframeCandidateOptions.length) {
      setCandidateID('')
      return
    }
    if (!keyframeCandidateOptions.some((candidate) => String(candidate.ID) === candidateID)) {
      setCandidateID(String(keyframeCandidateOptions[0].ID))
    }
  }, [candidateID, keyframeCandidateOptions, requestedKeyframeCandidateUnavailable, resultType])

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
      agentKey: selectedAgent?.key,
    })
  }

  return (
    <ProjectTaskDialog open={open} onOpenChange={onOpenChange}>
      <ProjectTaskDialogContent>
        <ProjectTaskDialogHeader>
          <ProjectTaskDialogTitle>新建任务</ProjectTaskDialogTitle>
          <ProjectTaskDialogDescription>
            选择任务目的和关联对象，系统会自动生成完成后的实体动作。
          </ProjectTaskDialogDescription>
        </ProjectTaskDialogHeader>

        <ProjectTaskDialogBody>
          <ProjectTaskDialogBodyInner>
            <ProjectTaskStack>
              <ProjectTaskInlineRow>
                <ClipboardList size={14} />
                <ProjectTaskText variant="label" tone="muted">任务目的</ProjectTaskText>
              </ProjectTaskInlineRow>
              <ProjectTaskPurposeGrid>
                {Object.entries(taskPurposeMeta).map(([key, meta]) => {
                  const active = purpose === key
                  return (
                    <ProjectTaskPurposeButton
                      key={key}
                      type="button"
                      active={active}
                      title={meta.label}
                      description={meta.description}
                      onClick={() => setPurpose(key as TaskPurpose)}
                    />
                  )
                })}
              </ProjectTaskPurposeGrid>
            </ProjectTaskStack>

            <ProjectTaskFormGrid>
              <ProjectTaskFormColumn>
                <ProjectTaskField>
                  <ProjectTaskFieldLabel>关联对象</ProjectTaskFieldLabel>
                  <ProjectTaskSelect
                    value={selectedTarget?.key ?? ''}
                    onChange={(event) => setTargetKey(event.target.value)}
                  >
                    {availableTargets.map((target) => (
                      <option key={target.key} value={target.key}>{target.label}</option>
                    ))}
                  </ProjectTaskSelect>
                  {availableTargets.length === 0 && (
                    <ProjectTaskFeedbackText tone="danger">当前任务目的没有可用对象。</ProjectTaskFeedbackText>
                  )}
                </ProjectTaskField>

                <ProjectTaskFieldGrid>
                  <ProjectTaskField>
                    <ProjectTaskFieldLabel>执行成员</ProjectTaskFieldLabel>
                    <ProjectTaskSelect
                      value={selectedAssignee ? String(selectedAssignee.id) : ''}
                      onChange={(event) => setAssigneeId(event.target.value)}
                    >
                      {memberOptions.map((member) => (
                        <option key={member.id} value={member.id}>{member.name} · {member.role}</option>
                      ))}
                    </ProjectTaskSelect>
                  </ProjectTaskField>
                  <ProjectTaskField>
                    <ProjectTaskFieldLabel>截止时间</ProjectTaskFieldLabel>
                    <ProjectTaskSelect
                      value={due}
                      onChange={(event) => setDue(event.target.value)}
                    >
                      <option value="今天 18:00">今天 18:00</option>
                      <option value="明天 18:00">明天 18:00</option>
                      <option value="本周五 18:00">本周五 18:00</option>
                      <option value="未设置">未设置</option>
                    </ProjectTaskSelect>
                  </ProjectTaskField>
                </ProjectTaskFieldGrid>

                <ProjectTaskFieldGrid variant="title-priority">
                  <ProjectTaskField>
                    <ProjectTaskFieldLabel>任务标题</ProjectTaskFieldLabel>
                    <ProjectTaskInput
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </ProjectTaskField>
                  <ProjectTaskField>
                    <ProjectTaskFieldLabel>优先级</ProjectTaskFieldLabel>
                    <ProjectTaskSelect
                      value={priority}
                      onChange={(event) => setPriority(event.target.value as TaskPriority)}
                    >
                      <option value="high">高</option>
                      <option value="medium">中</option>
                      <option value="low">低</option>
                    </ProjectTaskSelect>
                  </ProjectTaskField>
                </ProjectTaskFieldGrid>

                <ProjectTaskField>
                  <ProjectTaskFieldLabel>任务说明</ProjectTaskFieldLabel>
                  <ProjectTaskTextarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="可补充交付要求、审核重点或上下文"
                  />
                </ProjectTaskField>

                {resultType === 'lock_asset_candidate' && (
                  <ProjectTaskField>
                    <ProjectTaskFieldLabel>候选素材</ProjectTaskFieldLabel>
                    <ProjectTaskSelect
                      value={selectedCandidate ? String(selectedCandidate.ID) : ''}
                      onChange={(event) => setCandidateID(event.target.value)}
                      disabled={!candidateOptions.length}
                    >
                      {requestedAssetCandidateUnavailable && <option value="">指定候选不可采纳</option>}
                      {candidateOptions.map((candidate) => (
                        <option key={candidate.ID} value={candidate.ID}>{candidateOptionLabel(candidate)}</option>
                      ))}
                    </ProjectTaskSelect>
                    {!candidateOptions.length && (
                      <ProjectTaskFeedbackText tone="danger">
                        {requestedAssetCandidateUnavailable ? '指定素材候选缺少资源或已不可采纳，请回预制作或 AI 助手重新加入候选。' : '当前素材需求暂无可采纳候选，请先在预制作或 AI 助手中加入带资源的候选。'}
                      </ProjectTaskFeedbackText>
                    )}
                    {candidateOptions.length > 0 && requestedAssetCandidateUnavailable && (
                      <ProjectTaskFeedbackText tone="danger">指定素材候选缺少资源或已不可采纳，请重新选择一个可采纳候选，或回预制作/AI 助手重新加入候选。</ProjectTaskFeedbackText>
                    )}
                  </ProjectTaskField>
                )}

                {resultType === 'accept_keyframe' && (
                  <ProjectTaskField>
                    <ProjectTaskFieldLabel>候选画面锚点</ProjectTaskFieldLabel>
                    <ProjectTaskSelect
                      value={selectedKeyframeCandidate ? String(selectedKeyframeCandidate.ID) : ''}
                      onChange={(event) => setCandidateID(event.target.value)}
                      disabled={!keyframeCandidateOptions.length}
                    >
                      {requestedKeyframeCandidateUnavailable && <option value="">指定候选不可采纳</option>}
                      {keyframeCandidateOptions.map((candidate) => (
                        <option key={candidate.ID} value={candidate.ID}>{keyframeCandidateOptionLabel(candidate)}</option>
                      ))}
                    </ProjectTaskSelect>
                    {!keyframeCandidateOptions.length && (
                      <ProjectTaskFeedbackText tone={requestedKeyframeCandidateUnavailable ? 'danger' : 'neutral'}>
                        {requestedKeyframeCandidateUnavailable ? '指定候选缺少资源或已不可采纳，请回工作台拒绝该候选或重新加入候选。' : '当前画面锚点暂无 AI 候选，通过后会直接采纳当前画面锚点。'}
                      </ProjectTaskFeedbackText>
                    )}
                    {keyframeCandidateOptions.length > 0 && requestedKeyframeCandidateUnavailable && (
                      <ProjectTaskFeedbackText tone="danger">指定候选缺少资源或已不可采纳，请重新选择一个可采纳候选，或回工作台拒绝该候选后重新加入候选。</ProjectTaskFeedbackText>
                    )}
                  </ProjectTaskField>
                )}
              </ProjectTaskFormColumn>

              <ProjectTaskSummaryPanel>
                <ProjectTaskStack density="compact">
                  <ProjectTaskText variant="label" tone="muted">对象摘要</ProjectTaskText>
                  <ProjectTaskText variant="body" tone="foreground">{selectedTarget?.label ?? '未选择对象'}</ProjectTaskText>
                  <ProjectTaskText variant="label" tone="muted">{selectedTarget?.subtitle || projectName}</ProjectTaskText>
                </ProjectTaskStack>
                <ProjectTaskInfoGrid>
                  <ProjectTaskInfoItem label="任务类型" value={taskTypeMeta[purposeMeta.taskType].label} />
                  <ProjectTaskInfoItem label="完成动作" value={resultTypeMeta[resultType].label} />
                  <ProjectTaskInfoItem label="执行成员" value={selectedAssignee?.name ?? '未选择'} />
                  <ProjectTaskInfoItem label="截止时间" value={due} />
                </ProjectTaskInfoGrid>
                <ProjectTaskDividerStack>
                  <ProjectTaskFieldLabel>AI 助手</ProjectTaskFieldLabel>
                  <ProjectTaskSelect
                    value={agentKey}
                    onChange={(event) => setAgentKey(event.target.value as TaskAgentKey | '')}
                  >
                    <option value="">不发送给 AI 助手</option>
                    {taskAgentOptions.map((agent) => (
                      <option key={agent.key} value={agent.key}>{agent.name}</option>
                    ))}
                  </ProjectTaskSelect>
                  <ProjectTaskText variant="label" tone="muted">
                    {selectedAgent ? selectedAgent.description : '仅创建人工任务，之后仍可在任务详情中交给 AI 助手。'}
                  </ProjectTaskText>
                </ProjectTaskDividerStack>
                <ProjectTaskDividerStack>
                  <ProjectTaskText variant="label" tone="muted">发布摘要</ProjectTaskText>
                  <ProjectTaskText variant="body" tone="foreground">
                    将任务“{title.trim() || purposeMeta.defaultTitle}”分配给{selectedAssignee?.name ?? '成员'}。
                  </ProjectTaskText>
                  <ProjectTaskText variant="label" tone="muted">{resultSummary(resultType, resultJSON)}</ProjectTaskText>
                  {selectedAgent && (
                    <ProjectTaskStatusBadge {...projectAiAssignmentRecipe()}>
                      <Bot size={12} />
                      发布后交给{selectedAgent.name}
                    </ProjectTaskStatusBadge>
                  )}
                </ProjectTaskDividerStack>
              </ProjectTaskSummaryPanel>
            </ProjectTaskFormGrid>
          </ProjectTaskDialogBodyInner>
        </ProjectTaskDialogBody>

        <ProjectTaskDialogFooter>
          <ProjectTaskActionButton variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>取消</ProjectTaskActionButton>
          <ProjectTaskActionButton onClick={submit} disabled={!canSubmit || isSubmitting} loading={isSubmitting}>发布任务</ProjectTaskActionButton>
        </ProjectTaskDialogFooter>
      </ProjectTaskDialogContent>
    </ProjectTaskDialog>
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
    <ProjectTaskPanel
      title="项目成员"
      icon={Users}
      action={<ProjectTaskBadge>{members.length} 人</ProjectTaskBadge>}
    >
      <ProjectTaskStack>
      {canManageMembers && (
        <ProjectTaskSurfaceItem density="compact">
          <ProjectTaskStack density="compact">
          <ProjectTaskSelect
            controlSize="sm"
            value={selectedUser}
            onChange={(event) => setSelectedUser(event.target.value)}
          >
            <option value="">选择成员</option>
            {users.map((user) => <option key={user.ID} value={user.ID}>{user.username}</option>)}
          </ProjectTaskSelect>
          <ProjectTaskInlineRow>
            <ProjectTaskSelect
              controlSize="sm"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="director">导演</option>
              <option value="writer">编剧</option>
              <option value="generator">执行</option>
              <option value="viewer">观察者</option>
            </ProjectTaskSelect>
            <ProjectTaskActionButton
              size="sm"
              onClick={() => {
                if (!selectedUser) return
                addMember.mutate({ user_id: Number(selectedUser), role })
                setSelectedUser('')
              }}
            >
              <Plus size={14} /> 添加
            </ProjectTaskActionButton>
          </ProjectTaskInlineRow>
          </ProjectTaskStack>
        </ProjectTaskSurfaceItem>
      )}

      <ProjectTaskStack density="compact">
        {members.slice(0, 6).map((member) => (
          <ProjectTaskSurfaceItem key={member.ID} density="compact">
            <ProjectTaskInlineRow>
            <ProjectTaskAvatar size="sm" name={memberDisplayName(member)} />
            <ProjectTaskStack density="compact">
              <ProjectTaskText variant="label" truncate>{memberDisplayName(member)}</ProjectTaskText>
              <ProjectTaskText variant="caption" tone="muted">{ROLE_LABELS[member.role] ?? member.role}</ProjectTaskText>
            </ProjectTaskStack>
            {canManageMembers && member.role !== 'owner' && (
              <ProjectTaskActionButton
                variant="ghost"
                size="icon-sm"
                tone="danger"
                onClick={() => removeMember.mutate(member.ID)}
                aria-label="移除成员"
              >
                <Trash2 size={14} />
              </ProjectTaskActionButton>
            )}
            </ProjectTaskInlineRow>
          </ProjectTaskSurfaceItem>
        ))}
        {members.length === 0 && <ProjectTaskText variant="label" tone="muted">暂无项目成员。先添加成员后即可分配任务。</ProjectTaskText>}
      </ProjectTaskStack>
      </ProjectTaskStack>
    </ProjectTaskPanel>
  )
}

export default function TasksPage() {
  const navigate = useNavigate()
  const project = useProjectStore((state) => state.current)
  const currentUser = useUserStore((state) => state.currentUser)
  const agentPageTasks = useAgentSessionStore((state) => state.pageTasks)
  const projectId = project?.ID
  const [searchParams, setSearchParams] = useSearchParams()
  const taskCreateSearch = searchParams.toString()
  const taskCreateInitialWorkspace = useMemo(() => taskCreateInitialWorkspaceFromSearch(new URLSearchParams(taskCreateSearch)), [taskCreateSearch])
  const [selectedTaskId, setSelectedTaskId] = useState(seededTasks[0]?.id ?? '')
  const [view, setView] = useState<TaskView>('all')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [submitDeliverable, setSubmitDeliverable] = useState('')
  const [submitJobId, setSubmitJobId] = useState('')
  const [submitCanvasId, setSubmitCanvasId] = useState('')
  const [reviewComment, setReviewComment] = useState('')
  const [publishingAgentTaskId, setPublishingAgentTaskId] = useState<string | null>(null)
  const [agentPublishError, setAgentPublishError] = useState<string | null>(null)
  const agentPublishCleanupRef = useRef<Record<string, () => void>>({})
  const qc = useQueryClient()

  useEffect(() => {
    return () => {
      Object.values(agentPublishCleanupRef.current).forEach((cleanup) => cleanup())
      agentPublishCleanupRef.current = {}
    }
  }, [])

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
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('workItems')) as unknown as Promise<WorkItem[]>,
    enabled: !!projectId,
  })

  const { data: workReviews = [] } = useQuery<WorkReview[]>({
    queryKey: ['work-reviews', projectId],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('workReviews')) as unknown as Promise<WorkReview[]>,
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

  const { data: assetSlotCandidates = [] } = useQuery<SemanticEntityRecord[]>({
    queryKey: ['work-targets', projectId, 'asset-slot-candidates'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('assetSlotCandidates')) as Promise<SemanticEntityRecord[]>,
    enabled: !!projectId,
  })

  const { data: keyframes = [] } = useQuery<SemanticEntityRecord[]>({
    queryKey: ['work-targets', projectId, 'keyframes'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('keyframes')) as Promise<SemanticEntityRecord[]>,
    enabled: !!projectId,
  })

  const workTargetOptions = useMemo<WorkTargetOption[]>(() => {
    if (!projectId) return []
    return [
      { key: `project:${projectId}`, type: 'project', id: projectId, label: `项目 · ${project?.name ?? '当前项目'}` },
      ...productions.map((record) => targetOption('production', record, '制作')),
      ...segments.map((record) => targetOption('segment', record, '编排段')),
      ...contentUnits.map((record) => targetOption('content_unit', record, '制作项')),
      ...assetSlots.map((record) => targetOption('asset_slot', record, '素材需求')),
      ...keyframes.filter((record) => !isGeneratedKeyframeCandidateRecord(record)).map((record) => targetOption('keyframe', record, '画面锚点')),
    ]
  }, [assetSlots, contentUnits, keyframes, productions, project?.name, projectId, segments])

  const tasks = useMemo(
    () => workItems.map((item) => workItemToProjectTask(item, reviewerName)),
    [reviewerName, workItems]
  )

  const createWorkItem = useMutation({
    mutationFn: (input: { payload: Record<string, unknown>; agentKey?: TaskAgentKey }) =>
      createSemanticEntity(projectId!, semanticEntityConfig('workItems'), input.payload as SemanticEntityPayload) as unknown as Promise<WorkItem>,
    onSuccess: (item, variables) => {
      void qc.invalidateQueries({ queryKey: ['work-items', projectId] })
      setSelectedTaskId(`TASK-${item.ID}`)
      setView('all')
      setStatusFilter('all')
      clearTaskCreateSearch()
      setTaskDialogOpen(false)
      if (variables.agentKey) {
        void publishTaskToAgent(workItemToProjectTask(item, reviewerName), variables.agentKey)
      }
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
      const updated = await updateSemanticEntity(
        projectId!,
        semanticEntityConfig('workItems'),
        task.workItemID,
        buildWorkItemPayload(task, patch) as SemanticEntityPayload,
      ) as unknown as WorkItem
      if (review) {
        await createSemanticEntity(projectId!, semanticEntityConfig('workReviews'), {
          work_item_id: task.workItemID,
          reviewer_id: currentUser?.ID,
          status: review.status,
          comment: review.comment,
          metadata_json: JSON.stringify({ source: 'collaboration_page' }),
        } as SemanticEntityPayload)
      }
      return updated
    },
    onSuccess: (_updated, variables) => {
      void qc.invalidateQueries({ queryKey: ['work-items', projectId] })
      void qc.invalidateQueries({ queryKey: ['work-reviews', projectId] })
      if (variables.task.resultType === 'lock_asset_candidate' || variables.task.resultType === 'accept_keyframe') {
        invalidateAssetCandidateConsumers(qc, projectId)
      }
    },
  })

  const metrics = useMemo<ProjectTaskMetricItem[]>(() => {
    const mine = tasks.filter((task) => taskMatchesUser(task, currentUser)).length
    const review = tasks.filter((task) => task.status === 'submitted').length
    const doing = tasks.filter((task) => task.status === 'in_progress' || task.status === 'changes_requested').length
    const done = tasks.filter((task) => task.status === 'approved').length
    return [
      { label: '全部任务', value: tasks.length, icon: ClipboardList, iconAccent: 'default' as const },
      { label: '我的任务', value: mine, icon: UserCheck, iconAccent: 'sky' as const },
      { label: '待审核', value: review, icon: BadgeCheck, iconAccent: 'amber' as const },
      { label: '处理中', value: doing, icon: Clock3, iconAccent: 'teal' as const },
      { label: '已完成', value: done, icon: CheckCircle2, iconAccent: 'emerald' as const },
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

  const selectedTaskAgentSession = useMemo(() => {
    const requestId = selectedTask?.metadata.agent_request_id
    return requestId ? agentPageTasks[requestId] : undefined
  }, [agentPageTasks, selectedTask?.metadata.agent_request_id])
  const selectedTaskAgentThreadId = selectedTask?.metadata.agent_thread_id ?? selectedTaskAgentSession?.threadId
  const selectedTaskAgentRunId = selectedTask?.metadata.agent_run_id ?? selectedTaskAgentSession?.runId
  const selectedTaskAgentSessionId = selectedTask?.metadata.agent_session_id ?? selectedTaskAgentSession?.sessionId ?? selectedTaskAgentSession?.run?.sessionId
  const selectedTaskAgentStatus = selectedTaskAgentSession?.run?.status ?? selectedTask?.metadata.agent_status
  const selectedTaskAgentWaiting = !!selectedTask?.metadata.agent_request_id
    && !selectedTaskAgentThreadId
    && !selectedTaskAgentRunId
    && !agentRequestCanRetry(selectedTaskAgentStatus)

  useEffect(() => {
    setSubmitDeliverable(selectedTask?.deliverable && selectedTask.deliverable !== '处理中' ? selectedTask.deliverable : '')
    setSubmitJobId(selectedTask?.sourceJobID ? String(selectedTask.sourceJobID) : '')
    setSubmitCanvasId(selectedTask?.sourceCanvasID ? String(selectedTask.sourceCanvasID) : '')
    setReviewComment('')
  }, [selectedTask?.workItemID])

  useEffect(() => {
    if (!taskCreateInitialWorkspace) return
    if (!canManageWorkItems || memberOptions.length === 0 || workTargetOptions.length === 0) return
    setTaskDialogOpen(true)
  }, [canManageWorkItems, memberOptions.length, taskCreateInitialWorkspace, workTargetOptions.length])

  function clearTaskCreateSearch() {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('create')
      next.delete('purpose')
      next.delete('target_type')
      next.delete('target_id')
      next.delete('candidate_id')
      return next
    }, { replace: true })
  }

  function changeTaskDialogOpen(nextOpen: boolean) {
    setTaskDialogOpen(nextOpen)
    if (!nextOpen && taskCreateInitialWorkspace) clearTaskCreateSearch()
  }

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

  async function publishTaskToAgent(task: ProjectTask, preferredAgentKey?: TaskAgentKey) {
    if (!projectId || publishingAgentTaskId === task.id) return
    if (task.metadata.agent_thread_id) {
      openAgentPanelThread(task.metadata.agent_thread_id, task.metadata.agent_session_id)
      return
    }
    if (task.metadata.agent_run_id) {
      navigate(agentRunPath(task.metadata.agent_run_id, { sessionId: task.metadata.agent_session_id }))
      return
    }
    if (task.metadata.agent_request_id && !agentRequestCanRetry(task.metadata.agent_status)) return

    const requestId = `work_item_${task.workItemID}_${Date.now().toString(36)}`
    const publishedAt = new Date().toISOString()
    const agentOption = taskAgentOptionByKey(preferredAgentKey ?? task.metadata.agent_key)
    setPublishingAgentTaskId(task.id)
    setAgentPublishError(null)

    try {
      await updateSemanticEntity(projectId, semanticEntityConfig('workItems'), task.workItemID, buildWorkItemPayload(task, {
        metadata: {
          agent_key: agentOption.key,
          agent_name: agentOption.name,
          agent_source: 'task_publish',
          agent_request_id: requestId,
          agent_status: 'queued',
          agent_published_at: publishedAt,
        },
      }) as SemanticEntityPayload)
      void qc.invalidateQueries({ queryKey: ['work-items', projectId] })

      agentPublishCleanupRef.current[requestId]?.()
      agentPublishCleanupRef.current[requestId] = registerAgentPanelPageTool(requestId, async (payload) => {
        const runStatus = payload.run?.status ?? payload.status
        const completedAt = new Date().toISOString()
        try {
          await updateSemanticEntity(projectId, semanticEntityConfig('workItems'), task.workItemID, buildWorkItemPayload(task, {
            metadata: {
              agent_key: agentOption.key,
              agent_name: agentOption.name,
              agent_source: 'task_publish',
              agent_request_id: requestId,
              ...(payload.thread?.id ?? payload.run?.threadId ? { agent_thread_id: payload.thread?.id ?? payload.run?.threadId } : {}),
              ...(payload.run?.id ? { agent_run_id: payload.run.id } : {}),
              ...(payload.thread?.sessionId ?? payload.run?.sessionId ? { agent_session_id: payload.thread?.sessionId ?? payload.run?.sessionId } : {}),
              agent_status: runStatus,
              agent_completed_at: completedAt,
              agent_error: payload.run?.error ?? payload.error ?? undefined,
            },
          }) as SemanticEntityPayload)
        } finally {
          agentPublishCleanupRef.current[requestId]?.()
          delete agentPublishCleanupRef.current[requestId]
          void qc.invalidateQueries({ queryKey: ['work-items', projectId] })
        }
      })

      const agentMessage = buildAgentTaskMessage(task, project?.name ?? '当前项目')
      openAgentPanelWorkspace({
        requestId,
        taskType: 'work_item',
        title: `${agentOption.name}: ${task.title}`,
        message: agentMessage,
        displayMessage: `请以${agentOption.name}处理任务：${task.title}`,
        newConversation: true,
        autoSend: true,
        projectId,
        clientInput: buildCommandFirstClientInput({
          message: agentMessage,
          labels: ['project-tasks', 'work-item', 'task-publish'],
          hints: {
            projectId,
            productionId: task.raw.production_id,
            route: { pathname: ROUTES.project.tasks },
            selection: {
              entityType: 'work_item',
              entityId: task.workItemID,
              label: task.title,
            },
          },
        }),
        timeoutMs: 600_000,
        renderMode: 'chat',
      })
    } catch (error) {
      setAgentPublishError(error instanceof Error ? error.message : String(error))
    } finally {
      setPublishingAgentTaskId(null)
    }
  }

  function createTask(workspace: TaskCreateWorkspace) {
    if (!projectId) return
    const metadata: WorkItemMetadata = {
      task_type: workspace.taskType,
      target_label: workspace.target.label,
      due: workspace.due.trim() || '未设置',
      reviewer_name: reviewerName,
      ...(workspace.agentKey ? {
        agent_key: workspace.agentKey,
        agent_name: taskAgentOptionByKey(workspace.agentKey).name,
      } : {}),
    }
    createWorkItem.mutate({
      payload: {
        production_id: workspace.target.productionId,
        target_type: workspace.target.type,
        target_id: workspace.target.id,
        kind: taskTypeMeta[workspace.taskType].kind,
        title: workspace.title.trim(),
        description: workspace.description.trim(),
        status: workspace.taskType === 'coordination' ? 'blocked' : 'todo',
        priority: workspace.priority === 'high' ? 'high' : workspace.priority === 'low' ? 'low' : 'normal',
        assignee_id: workspace.assignee.id,
        result_type: workspace.resultType,
        result_json: workspace.resultType === 'none' ? '' : workspace.resultJSON.trim(),
        metadata_json: JSON.stringify(metadata),
      },
      agentKey: workspace.agentKey,
    })
  }

  return (
    <ProjectTaskPageLayout>
        <ProjectSurfaceHeader
          icon={ClipboardList}
          title="任务"
          description="面向项目成员的任务分配、个人执行、提交审核和负责人通过。"
          meta={<ProjectTaskBadge variant="outline">{tasks.length} 个任务</ProjectTaskBadge>}
          actions={(
            <>
            <ProjectTaskActionButton variant="outline" onClick={() => setView('mine')}>
              <UserCheck size={14} />
              我的任务
            </ProjectTaskActionButton>
            <ProjectTaskActionButton onClick={() => setTaskDialogOpen(true)} disabled={!canManageWorkItems || memberOptions.length === 0 || workTargetOptions.length === 0}>
              <Plus size={14} />
              新建任务
            </ProjectTaskActionButton>
            </>
          )}
        />

        <TaskCreateDialog
          open={taskDialogOpen}
          onOpenChange={changeTaskDialogOpen}
          initialWorkspace={taskDialogOpen ? taskCreateInitialWorkspace : undefined}
          projectName={project?.name ?? '当前项目'}
          memberOptions={memberOptions}
          targetOptions={workTargetOptions}
          assetSlotCandidates={assetSlotCandidates}
          keyframes={keyframes}
          onSubmit={createTask}
          isSubmitting={createWorkItem.isPending}
        />

        <ProjectTaskWorkflowGrid steps={workflow} />

        <ProjectTaskMetricGrid
          metrics={metrics.map((metric) => ({
            ...metric,
            onClick: () => {
              if (metric.label === '我的任务') setView('mine')
              if (metric.label === '待审核') setView('review')
              if (metric.label === '全部任务') setView('all')
            },
          }))}
        />

        <ProjectTaskMainGrid>
          <ProjectTaskSidebar>
            <ProjectTaskPublishPanel title="任务发布" icon={Plus}>
              <ProjectTaskSurfaceItem>
                <ProjectTaskStack>
                <ProjectTaskText variant="label" tone="muted">
                  选择任务目的、关联对象和完成动作后发布。系统会自动生成底层任务结果，不需要手写 JSON。
                </ProjectTaskText>
                <ProjectTaskActionButton onClick={() => setTaskDialogOpen(true)} disabled={!canManageWorkItems || memberOptions.length === 0 || workTargetOptions.length === 0}>
                  <UserCheck size={14} />
                  新建任务
                </ProjectTaskActionButton>
                </ProjectTaskStack>
              </ProjectTaskSurfaceItem>
            </ProjectTaskPublishPanel>

            <ManagementTab
              members={members}
              users={users}
              canManageMembers={canManageMembers}
              projectId={projectId}
            />
          </ProjectTaskSidebar>

          <ProjectTaskListPanel
            title="任务列表"
            icon={ListTodo}
            action={(
              <ProjectTaskInlineRow>
                <ProjectTaskBadge>{visibleTasks.length} 项</ProjectTaskBadge>
                {(['all', 'mine', 'review'] as const).map((mode) => (
                  <ProjectTaskActionButton
                    key={mode}
                    variant={view === mode ? 'solid' : 'outline'}
                    size="sm"
                    onClick={() => setView(mode)}
                  >
                    {mode === 'all' ? '全部' : mode === 'mine' ? '我的' : '待审核'}
                  </ProjectTaskActionButton>
                ))}
                <ProjectTaskFilterControl icon={ListFilter}>
                  <ProjectTaskSelect
                    controlSize="sm"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as TaskStatus | 'all')}
                    aria-label="状态筛选"
                  >
                    <option value="all">全部状态</option>
                    {Object.entries(statusMeta).map(([status, meta]) => (
                      <option key={status} value={status}>{meta.label}</option>
                    ))}
                  </ProjectTaskSelect>
                </ProjectTaskFilterControl>
              </ProjectTaskInlineRow>
            )}
          >
            <ProjectTaskStack>
              {visibleTasks.map((task) => {
                const active = selectedTask?.id === task.id
                return (
                  <ProjectTaskListCard
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    active={active}
                  >
                    <ProjectTaskListCardLayout>
                      <ProjectTaskListCardContent>
                        <ProjectTaskListCardBadges>
                          <StatusPill status={task.status} />
                          <PriorityPill priority={task.priority} />
                          <ProjectTaskMeta asChild>
                            <ProjectTaskText variant="label">{taskTypeMeta[task.taskType].label}</ProjectTaskText>
                          </ProjectTaskMeta>
                          {task.metadata.agent_request_id && (
                            <ProjectTaskStatusBadge {...projectAiAssignmentRecipe()}>
                              <Bot size={12} />
                              AI
                            </ProjectTaskStatusBadge>
                          )}
                          <ProjectTaskText variant="mono-label">{task.id}</ProjectTaskText>
                        </ProjectTaskListCardBadges>
                        <ProjectTaskText variant="body" truncate>{task.title}</ProjectTaskText>
                        <ProjectTaskText variant="label" tone="muted" clamp>{task.description}</ProjectTaskText>
                      </ProjectTaskListCardContent>
                      <ProjectTaskInfoGrid>
                        <ProjectTaskInfoItem label="执行成员" value={task.assigneeName} />
                        <ProjectTaskInfoItem label="截止时间" value={task.due} />
                        <ProjectTaskInfoItem label="关联对象" value={task.target} />
                        <ProjectTaskInfoItem label="审核人" value={task.reviewerName} />
                      </ProjectTaskInfoGrid>
                    </ProjectTaskListCardLayout>
                  </ProjectTaskListCard>
                )
              })}
              {loadingTasks && (
                <ProjectTaskEmptyState
                  icon={Clock3}
                  title="正在加载任务"
                  detail="从项目 WorkItem 列表读取分配记录。"
                />
              )}
              {!loadingTasks && visibleTasks.length === 0 && (
                <ProjectTaskEmptyState
                  icon={ClipboardList}
                  title="没有符合条件的任务"
                  detail="调整筛选条件，或在左侧快速分配新任务。"
                />
              )}
            </ProjectTaskStack>
          </ProjectTaskListPanel>

          <ProjectTaskDetailPanel
            title="任务详情"
            icon={ClipboardCheck}
          >
            <ProjectTaskStack density="loose">
            <ProjectTaskDetailIntro>任务可声明完成后的实体变更；负责人通过时由后端应用并记录事件。</ProjectTaskDetailIntro>
            {selectedTask && (
              <>
                <ProjectTaskStack>
                  <ProjectTaskInlineRow>
                    <StatusPill status={selectedTask.status} />
                    <PriorityPill priority={selectedTask.priority} />
                  </ProjectTaskInlineRow>
                  <ProjectTaskHeading>{selectedTask.title}</ProjectTaskHeading>
                  <ProjectTaskText variant="label" tone="muted">{selectedTask.id} · {selectedTask.target}</ProjectTaskText>
                </ProjectTaskStack>

                <ProjectTaskDetailBlock title="分配信息" icon={UserCheck}>
                  <ProjectTaskInfoGrid>
                    <ProjectTaskInfoItem label="任务类型" value={taskTypeMeta[selectedTask.taskType].label} />
                    <ProjectTaskInfoItem label="执行成员" value={selectedTask.assigneeName} />
                    <ProjectTaskInfoItem label="审核人" value={selectedTask.reviewerName} />
                    <ProjectTaskInfoItem label="截止时间" value={selectedTask.due} />
                    <ProjectTaskInfoItem label="关联对象" value={selectedTask.target} />
                  </ProjectTaskInfoGrid>
                </ProjectTaskDetailBlock>

                <ProjectTaskDetailBlock title="任务说明" icon={ListChecks}>
                  <ProjectTaskText tone="muted">{selectedTask.description}</ProjectTaskText>
                </ProjectTaskDetailBlock>

                <ProjectTaskDetailBlock title="AI 助手" icon={Bot}>
                  <ProjectTaskSurfaceItem>
                    <ProjectTaskStack density="compact">
                    <ProjectTaskInfoGrid>
                      <ProjectTaskInfoItem label="执行 Agent" value={selectedTask.metadata.agent_name ?? taskAgentOptionByKey(selectedTask.metadata.agent_key).name} />
                      <ProjectTaskInfoItem label="会话状态" value={agentWorkStatusLabel(selectedTaskAgentStatus, selectedTask.metadata.agent_request_id)} />
                      <ProjectTaskInfoItem label="发布时间" value={formatDateTime(selectedTask.metadata.agent_published_at)} />
                    </ProjectTaskInfoGrid>
                    {agentPublishError && <ProjectTaskCallout role="alert" tone="danger" compact>{agentPublishError}</ProjectTaskCallout>}
                    {selectedTask.metadata.agent_error && (
                      <ProjectTaskStatusBadge {...projectErrorRecipe()}>
                        {selectedTask.metadata.agent_error}
                      </ProjectTaskStatusBadge>
                    )}
                    <ProjectTaskActionStack>
                      <ProjectTaskActionButton
                        type="button"
                        variant={selectedTaskAgentThreadId || selectedTaskAgentRunId ? 'outline' : 'solid'}
                        onClick={() => {
                          if (selectedTaskAgentThreadId) openAgentPanelThread(selectedTaskAgentThreadId, selectedTaskAgentSessionId)
                          else if (selectedTaskAgentRunId) navigate(agentRunPath(selectedTaskAgentRunId, { sessionId: selectedTaskAgentSessionId }))
                          else void publishTaskToAgent(selectedTask)
                        }}
                        disabled={publishingAgentTaskId === selectedTask.id || selectedTaskAgentWaiting}
                        loading={publishingAgentTaskId === selectedTask.id}
                      >
                        <Bot size={14} />
                        {selectedTaskAgentThreadId || selectedTaskAgentRunId
                          ? '打开 AI 会话'
                          : selectedTaskAgentWaiting
                            ? '等待 AI 会话'
                            : `交给${taskAgentOptionByKey(selectedTask.metadata.agent_key).name}`}
                      </ProjectTaskActionButton>
                      {selectedTaskAgentRunId && (
                        <ProjectTaskActionButton
                          type="button"
                          variant="outline"
                          onClick={() => navigate(agentRunPath(selectedTaskAgentRunId, { sessionId: selectedTaskAgentSessionId }))}
                        >
                          <ChevronRight size={14} />
                          查看运行详情
                        </ProjectTaskActionButton>
                      )}
                    </ProjectTaskActionStack>
                    </ProjectTaskStack>
                  </ProjectTaskSurfaceItem>
                </ProjectTaskDetailBlock>

                <ProjectTaskDetailBlock title="完成动作" icon={ClipboardCheck}>
                  <ProjectTaskSurfaceItem>
                    <ProjectTaskStack density="compact">
                    <ProjectTaskInfoGrid>
                      <ProjectTaskInfoItem label="动作" value={resultTypeMeta[(selectedTask.resultType as WorkItemResultType) || 'none']?.label ?? selectedTask.resultType} />
                      <ProjectTaskInfoItem label="应用状态" value={applyStatusLabel(selectedTask.applyStatus)} />
                    </ProjectTaskInfoGrid>
                    {selectedTask.resultJSON && (
                      <ProjectTaskSurfaceItem variant="muted">
                        <ProjectTaskCodeBlock>{selectedTask.resultJSON}</ProjectTaskCodeBlock>
                      </ProjectTaskSurfaceItem>
                    )}
                    {selectedTask.applyError && <ProjectTaskFeedbackText tone="danger">{selectedTask.applyError}</ProjectTaskFeedbackText>}
                    {selectedTask.appliedAt && <ProjectTaskText variant="label" tone="muted">应用时间：{formatDateTime(selectedTask.appliedAt)}</ProjectTaskText>}
                    </ProjectTaskStack>
                  </ProjectTaskSurfaceItem>
                </ProjectTaskDetailBlock>

                <ProjectTaskDetailBlock title="提交内容" icon={FileCheck2}>
                  <ProjectTaskStack density="compact">
                    <ProjectTaskSurfaceItem>
                      <ProjectTaskText>{selectedTask.deliverable ?? '成员尚未提交交付物。'}</ProjectTaskText>
                      <ProjectTaskSubmitMetaGrid>
                        <ProjectTaskText variant="label" tone="muted">提交时间：{formatDateTime(selectedTask.submittedAt)}</ProjectTaskText>
                        <ProjectTaskText variant="label" tone="muted">通过时间：{formatDateTime(selectedTask.approvedAt)}</ProjectTaskText>
                      </ProjectTaskSubmitMetaGrid>
                      {(selectedTask.sourceJobID || selectedTask.sourceCanvasID) && (
                        <ProjectTaskMetaList>
                          {selectedTask.sourceJobID && <ProjectTaskMeta>Job #{selectedTask.sourceJobID}</ProjectTaskMeta>}
                          {selectedTask.sourceCanvasID && <ProjectTaskMeta>Canvas #{selectedTask.sourceCanvasID}</ProjectTaskMeta>}
                        </ProjectTaskMetaList>
                      )}
                    </ProjectTaskSurfaceItem>
                    {selectedTask.status !== 'approved' && (
                      <ProjectTaskSurfaceItem>
                        <ProjectTaskStack density="compact">
                        <ProjectTaskTextarea
                          value={submitDeliverable}
                          onChange={(event) => setSubmitDeliverable(event.target.value)}
                          placeholder="填写交付说明，例如已上传的资源、生成结果、处理范围或待审核重点"
                        />
                        <ProjectTaskFieldGrid variant="id-pair">
                          <ProjectTaskInput
                            value={submitJobId}
                            onChange={(event) => setSubmitJobId(event.target.value)}
                            placeholder="关联 Job ID"
                            inputMode="numeric"
                          />
                          <ProjectTaskInput
                            value={submitCanvasId}
                            onChange={(event) => setSubmitCanvasId(event.target.value)}
                            placeholder="关联 Canvas ID"
                            inputMode="numeric"
                          />
                        </ProjectTaskFieldGrid>
                        </ProjectTaskStack>
                      </ProjectTaskSurfaceItem>
                    )}
                  </ProjectTaskStack>
                </ProjectTaskDetailBlock>

                <ProjectTaskDetailBlock title="审核意见" icon={MessageSquareText}>
                  <ProjectTaskStack density="compact">
                    <ProjectTaskSurfaceItem>
                      <ProjectTaskText tone="muted">
                      {selectedTask.reviewNote ?? '暂无审核意见。'}
                      </ProjectTaskText>
                    </ProjectTaskSurfaceItem>
                    {selectedTaskReviews.length > 0 && (
                      <ProjectTaskStack density="compact">
                        {selectedTaskReviews.map((review) => (
                          <ProjectTaskReviewRecord
                            key={review.ID}
                            status={projectReviewStatusRecipe(review.status)}
                            statusLabel={reviewStatusLabel(review.status)}
                            createdAt={formatDateTime(review.CreatedAt)}
                            comment={review.comment || '无文字意见'}
                            reviewer={`审核人：${review.reviewer?.username || (review.reviewer_id ? `成员 ${review.reviewer_id}` : selectedTask.reviewerName)}`}
                          />
                        ))}
                      </ProjectTaskStack>
                    )}
                    {selectedTask.status === 'submitted' && canManageWorkItems && (
                      <ProjectTaskTextarea
                        value={reviewComment}
                        onChange={(event) => setReviewComment(event.target.value)}
                        placeholder="填写审核意见，会同步写入任务审核记录"
                      />
                    )}
                  </ProjectTaskStack>
                </ProjectTaskDetailBlock>

                <ProjectTaskActionStack>
                  <ProjectTaskActionButton
                    variant="outline"
                    onClick={() => updateTask(selectedTask, { status: 'in_progress', deliverable: '处理中' })}
                    disabled={selectedTask.status === 'approved' || patchWorkItem.isPending}
                  >
                    <Clock3 size={14} />
                    标记进行中
                  </ProjectTaskActionButton>
                  <ProjectTaskActionButton
                    onClick={() => submitTaskForReview(selectedTask)}
                    disabled={selectedTask.status === 'submitted' || selectedTask.status === 'approved' || patchWorkItem.isPending}
                  >
                    <Send size={14} />
                    提交审核
                  </ProjectTaskActionButton>
                  <ProjectTaskActionButton
                    variant="outline"
                    onClick={() => reviewTask(selectedTask, 'changes_requested')}
                    disabled={selectedTask.status !== 'submitted' || !canManageWorkItems || patchWorkItem.isPending}
                  >
                    <RefreshCcw size={14} />
                    要求修改
                  </ProjectTaskActionButton>
                  <ProjectTaskActionButton
                    variant="outline"
                    onClick={() => reviewTask(selectedTask, 'approved')}
                    disabled={selectedTask.status !== 'submitted' || !canManageWorkItems || patchWorkItem.isPending}
                  >
                    <CheckCircle2 size={14} />
                    通过完成
                  </ProjectTaskActionButton>
                </ProjectTaskActionStack>

                {!canManageWorkItems && selectedTask.status === 'submitted' && (
                  <ProjectTaskCallout tone="warning" compact>
                    <ProjectTaskInlineRow align="start">
                      <AlertTriangle size={14} />
                      <ProjectTaskText variant="label">只有项目负责人或具备成员管理权限的用户可以通过任务或要求修改。</ProjectTaskText>
                    </ProjectTaskInlineRow>
                  </ProjectTaskCallout>
                )}
              </>
            )}
            </ProjectTaskStack>
          </ProjectTaskDetailPanel>
        </ProjectTaskMainGrid>
    </ProjectTaskPageLayout>
  )
}
