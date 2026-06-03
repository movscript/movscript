import { cloneJSONValue, isJSONRecord } from '../../../../shared/json/jsonValue.js'
import type {
  AgentMessage,
  AgentPlan,
  AgentPlanTask,
  AgentPlanTaskStatus,
  AgentPlanRevision,
  AgentRun,
  AgentThread,
  JSONValue,
} from '../../../../state/shared/types.js'
import type { AgentStore } from '../../../../state/store/core/store.js'
import { buildThreadMessage } from '../../../../messages/thread/threadMessage.js'
import { isoNow, makeId } from '../../../../shared/runtime/runtimeIdentity.js'
import { requireRuntimeThread } from '../../../shared/store/runtimeStoreLookup.js'

const PLAN_SCHEMA = 'movscript.agent.plan.v1'
const PLAN_REVISION_SCHEMA = 'movscript.agent.plan-revision.v1'
const MAX_PLAN_TASKS = 20
const MAX_PLAN_REVISIONS = 100
const MAX_STEP_CHARS = 300
const MAX_EXPLANATION_CHARS = 1000
const VALID_STATUSES = new Set<AgentPlanTaskStatus>(['pending', 'in_progress', 'completed'])

export interface UpdatePlanInput {
  planId?: unknown
  explanation?: unknown
  tasks?: unknown
  items?: unknown
}

export interface UpdatePlanResult {
  status: 'updated' | 'unchanged'
  plan: AgentPlan
  revision?: AgentPlanRevision
  message?: AgentMessage
}

export function updateRuntimePlan(input: {
  store: Pick<AgentStore, 'getThread' | 'updateThread'>
  run: AgentRun
  request?: UpdatePlanInput | Record<string, JSONValue>
  now?: string
  planId?: string
  revisionId?: string
  messageId?: string
}): UpdatePlanResult {
  const now = input.now ?? isoNow()
  const thread = requireRuntimeThread(input.store, input.run.threadId)
  const request = input.request ?? {}
  const planId = normalizeOptionalString(request.planId, MAX_STEP_CHARS)
  const tasks = normalizePlanTasks(request.tasks ?? request.items)
  const explanation = normalizeOptionalString((input.request ?? {}).explanation, MAX_EXPLANATION_CHARS)
  assertAtMostOneInProgress(tasks)

  const current = thread.currentPlan
  if (current && isSamePlanRequest(current, { planId, tasks })) {
    return {
      status: 'unchanged',
      plan: clonePlan(current),
    }
  }
  const plan: AgentPlan = {
    schema: PLAN_SCHEMA,
    id: planId ?? current?.id ?? input.planId ?? makeId('plan'),
    threadId: thread.id,
    runId: input.run.id,
    ...(explanation ? { explanation } : {}),
    items: tasks,
    completedCount: tasks.filter((item) => item.status === 'completed').length,
    totalCount: tasks.length,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  }
  const revision: AgentPlanRevision = {
    schema: PLAN_REVISION_SCHEMA,
    id: input.revisionId ?? makeId('plan_revision'),
    planId: plan.id,
    threadId: thread.id,
    runId: input.run.id,
    ...(explanation ? { explanation } : {}),
    snapshot: clonePlan(plan),
    createdAt: now,
  }
  const message = buildThreadMessage({
    id: input.messageId ?? makeId('msg'),
    threadId: thread.id,
    role: 'assistant',
    content: 'Plan updated',
    now,
    runId: input.run.id,
    metadata: {
      kind: 'plan_revision',
      promptHistory: 'exclude',
      planRevision: revision as unknown as JSONValue,
    },
  })

  applyPlanRevision({ thread, plan, revision, message })
  input.store.updateThread(thread)
  return { status: 'updated', plan, revision, message }
}

function isSamePlanRequest(current: AgentPlan, input: {
  planId?: string
  tasks: AgentPlanTask[]
}): boolean {
  if (input.planId && input.planId !== current.id) return false
  if (current.items.length !== input.tasks.length) return false
  return current.items.every((item, index) => {
    const next = input.tasks[index]
    return !!next && item.step === next.step && item.status === next.status
  })
}

export function applyPlanRevision(input: {
  thread: AgentThread
  plan: AgentPlan
  revision: AgentPlanRevision
  message: AgentMessage
}): AgentThread {
  input.thread.currentPlan = clonePlan(input.plan)
  input.thread.planRevisions = [
    ...(input.thread.planRevisions ?? []),
    clonePlanRevision(input.revision),
  ].slice(-MAX_PLAN_REVISIONS)
  input.thread.messages.push(input.message)
  input.thread.updatedAt = input.message.createdAt
  return input.thread
}

function normalizePlanTasks(value: unknown): AgentPlanTask[] {
  if (!Array.isArray(value)) throw new Error('core_update_plan requires tasks to be an array')
  if (value.length > MAX_PLAN_TASKS) throw new Error(`core_update_plan supports at most ${MAX_PLAN_TASKS} tasks`)
  return value.map((item, index) => {
    if (!isJSONRecord(item)) throw new Error(`core_update_plan tasks[${index}] must be an object`)
    const step = normalizeOptionalString(item.step ?? item.title ?? item.name, MAX_STEP_CHARS)
    if (!step) throw new Error(`core_update_plan tasks[${index}].step is required`)
    const status = normalizeProgressStatus(item.status)
    if (!VALID_STATUSES.has(status as AgentPlanTaskStatus)) {
      throw new Error(`core_update_plan tasks[${index}].status must be pending, in_progress, or completed`)
    }
    return { step, status: status as AgentPlanTaskStatus }
  })
}

function assertAtMostOneInProgress(items: AgentPlanTask[]): void {
  const count = items.filter((item) => item.status === 'in_progress').length
  if (count > 1) throw new Error('core_update_plan allows at most one in_progress item')
}

function normalizeOptionalString(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, maxChars)
}

function normalizeProgressStatus(value: unknown): AgentPlanTaskStatus | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'pending'
    || normalized === 'todo'
    || normalized === 'not_ready'
    || normalized === 'not_started'
    || normalized === '未就绪'
    || normalized === '未开始'
    || normalized === '待办'
    || normalized === '待处理'
  ) return 'pending'
  if (normalized === 'in_progress'
    || normalized === 'running'
    || normalized === 'doing'
    || normalized === '进行中'
    || normalized === '执行中'
  ) return 'in_progress'
  if (normalized === 'completed'
    || normalized === 'complete'
    || normalized === 'done'
    || normalized === 'finished'
    || normalized === '已完成'
    || normalized === '完成'
  ) return 'completed'
  return undefined
}

function clonePlan(plan: AgentPlan): AgentPlan {
  return cloneJSONValue(plan as unknown as JSONValue) as unknown as AgentPlan
}

function clonePlanRevision(revision: AgentPlanRevision): AgentPlanRevision {
  return cloneJSONValue(revision as unknown as JSONValue) as unknown as AgentPlanRevision
}
