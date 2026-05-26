import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { ChatMessage, ChatRunActivity } from '@/features/agent/state/agentStore'

type ChatMessageMeta = NonNullable<ChatMessage['meta']>

export type RuntimeStatusMessage = NonNullable<ChatMessageMeta['runtimeStatus']>

export function isRuntimeEmptyAssistantPlaceholder(content: string): boolean {
  const normalized = content.trim()
  return normalized === ''
    || normalized === '（无内容）'
    || normalized === '本地 Agent Runtime 没有返回 assistant 消息。'
    || normalized === 'The local Agent runtime did not return an assistant message.'
}

export function runtimeStatusMessageFromRunActivity(input: {
  activity?: ChatMessageMeta['localRunActivity']
  runtimeStatus?: ChatMessageMeta['runtimeStatus']
  generationJobs?: NonNullable<ChatMessageMeta['generationJobs']>
}): RuntimeStatusMessage | undefined {
  if (input.runtimeStatus) return input.runtimeStatus
  const activity = input.activity
  if (!activity) return undefined
  const work = asyncWorkStartFromActivity(activity)
  if (!work) return undefined

  const hasActiveGenerationJob = (input.generationJobs ?? []).some((job) => !job.terminal)
  const active = hasActiveGenerationJob || isActiveRuntimeWorkStatus(work.workStatus)
  return {
    kind: 'async_work_handoff',
    title: '异步任务已提交',
    detail: active
      ? '任务正在后台运行，完成后会自动接续。你可以继续发送消息。'
      : '任务已交给 runtime 后台处理，后续结果会从异步任务返回。你可以继续发送消息。',
    ...(work.workId ? { workId: work.workId } : {}),
    ...(work.workKind ? { workKind: work.workKind } : {}),
    ...(work.workStatus ? { workStatus: work.workStatus } : {}),
  }
}

export function isRuntimeAsyncWorkHandoffRun(run: AgentRun | null | undefined): boolean {
  if (!run || !isTerminalRunStatus(run.status)) return false
  return run.steps.some((step) => step.type === 'tool_call' && step.toolName === 'core_work_start')
}

export function shouldRenderRuntimeStatusOnly(input: {
  content: string
  runtimeStatus?: RuntimeStatusMessage
  hasDiagnosticSection: boolean
  hasResultSection: boolean
  planRevision?: ChatMessageMeta['planRevision']
  showModelSetupAction: boolean
}): boolean {
  return !!input.runtimeStatus
    && isRuntimeEmptyAssistantPlaceholder(input.content)
    && !input.planRevision
    && !input.showModelSetupAction
    && !input.hasResultSection
    && !input.hasDiagnosticSection
}

function asyncWorkStartFromActivity(activity: ChatRunActivity): { workId?: string; workKind?: string; workStatus?: string } | undefined {
  const step = [...(activity.steps ?? [])].reverse().find((item) => item.type === 'tool_call' && item.toolName === 'core_work_start')
  const event = [...(activity.events ?? [])].reverse().find((item) => item.kind === 'tool_call' && item.toolName === 'core_work_start')
  if (!step && !event) return undefined

  const args = recordValue(step?.args)
  const result = recordValue(step?.result)
  const work = recordValue(result?.work) ?? recordValue(recordValue(event?.data)?.runtimeWork)
  return {
    workId: stringValue(work?.id) ?? stringValue(result?.workId),
    workKind: stringValue(work?.kind) ?? stringValue(args?.kind),
    workStatus: stringValue(work?.status) ?? stringValue(result?.status),
  }
}

function isActiveRuntimeWorkStatus(status: string | undefined): boolean {
  return status === 'pending_approval'
    || status === 'queued'
    || status === 'running'
    || status === 'waiting'
    || status === 'started'
}

function isTerminalRunStatus(status: AgentRun['status'] | undefined): boolean {
  return status === 'completed' || status === 'completed_with_warnings' || status === 'failed' || status === 'cancelled'
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
