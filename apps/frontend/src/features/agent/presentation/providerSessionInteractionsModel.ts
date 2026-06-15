import type { TFunction } from 'i18next'
import { approvalImpactLabel, runStatusLabel } from '@/features/agent/domain/agentRunUi'
import { agentPermissionLabel, agentRiskLabel, agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import type { ChatRunActivityApproval, ChatRunActivityInputRequest } from '@/features/agent/state/agentStore'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'

export type ProviderSessionApprovalRequest = NonNullable<AgentRun['pendingApprovals']>[number] | ChatRunActivityApproval
export type ProviderSessionInputRequest = NonNullable<AgentRun['pendingInputRequests']>[number] | ChatRunActivityInputRequest
export type ProviderSessionApprovalTone = 'pending' | 'approved' | 'rejected' | 'idle'

type ApprovalLike = Pick<ProviderSessionApprovalRequest, 'toolName' | 'risk' | 'permission'> & { preview?: unknown }

export function providerSessionApprovalImpactText(approval: ApprovalLike, t?: TFunction): string {
  if (t) return providerSessionApprovalImpactI18nText(approval, t)
  return approvalImpactLabel(approval as Pick<NonNullable<AgentRun['pendingApprovals']>[number], 'toolName' | 'risk' | 'permission' | 'preview'>)
}

export function providerSessionApprovalRiskText(risk: string, t: TFunction): string {
  return agentRiskLabel(risk, t)
}

export function providerSessionApprovalPermissionText(permission: string, t: TFunction): string {
  return agentPermissionLabel(permission, t)
}

export function providerSessionApprovalStatusText(status: string | undefined, t: TFunction): string {
  switch (status) {
    case 'pending':
      return t('agents.chat.task.approvalPending')
    case 'approved':
      return t('agents.chat.task.approvalApproved')
    case 'rejected':
      return t('agents.chat.task.approvalRejected')
    case 'cancelled':
      return t('agents.chat.task.cancelled')
    case 'expired':
      return t('agents.chat.task.approvalExpired')
    default:
      return status ?? '-'
  }
}

export function providerSessionApprovalTitle(approval: ProviderSessionApprovalRequest, t: TFunction): string {
  if (approval.toolName !== 'core_work_start') return agentToolNameLabel(approval.toolName, t)
  const args = approvalArgs(approval)
  const kind = typeof args?.kind === 'string' ? args.kind : undefined
  if (kind === 'generation_job') return t('agents.chat.task.approvalOperation.generationJob', { defaultValue: '创建生成任务' })
  if (kind === 'subagent_run') return t('agents.chat.task.approvalOperation.subagentRun', { defaultValue: '启动子 agent 运行' })
  return t('agents.chat.task.approvalOperation.default', { defaultValue: '提交异步任务' })
}

export function providerSessionApprovalReason(approval: ProviderSessionApprovalRequest, t: TFunction): string {
  if (/^[\w.:/-]+\s+需要用户确认后才能执行[。.]?$/.test(approval.reason.trim())) {
    return ''
  }
  if (approval.toolName === 'core_work_start' && /core_work_start|agent\.work\.write|work\.write/i.test(approval.reason)) {
    return t('agents.chat.task.approvalOperation.confirmBeforeRun', { defaultValue: '需要用户确认后才能执行。' })
  }
  return approval.reason
}

export function runInteractionApprovalSectionTitle(tone: ProviderSessionApprovalTone, t: TFunction): string {
  if (tone === 'approved') return t('agents.chat.task.approvalApprovedSection')
  if (tone === 'rejected') return t('agents.chat.task.approvalRejectedSection')
  return t('agents.chat.task.approvalRequired')
}

export function interactionRunStatusLabel(status: AgentRun['status'], t: TFunction): string {
  switch (status) {
    case 'queued':
      return t('agents.chat.task.runQueued')
    case 'in_progress':
      return t('agents.chat.task.runInProgress')
    case 'requires_action':
      return t('agents.chat.task.runRequiresAction')
    case 'completed':
      return t('agents.chat.task.runCompleted')
    case 'completed_with_warnings':
      return t('agents.chat.task.runCompletedWithWarnings')
    case 'failed':
      return t('agents.chat.task.runFailed')
    case 'cancelled':
      return t('agents.chat.task.cancelled')
    default:
      return runStatusLabel(status)
  }
}

export function inputRunInteractionStatusLabel(status: string, t: TFunction): string {
  if (status === 'answered') return t('agents.chat.task.inputAnswered')
  if (status === 'cancelled') return t('agents.chat.task.inputCancelled')
  return t('agents.chat.task.inputPending')
}

export function inputAnswerSummaryText(request: ProviderSessionInputRequest, t: TFunction): string {
  return [
    request.answer?.choiceIds?.length ? t('agents.chat.task.choiceAnswerSummary', { value: inputAnswerChoiceLabels(request).join(', ') }) : undefined,
    request.answer?.text ? t('agents.chat.task.customAnswerSummary', { value: request.answer.text }) : undefined,
  ].filter(Boolean).join(t('agents.chat.task.answerSummarySeparator'))
}

export function clampPage(page: number, itemCount: number): number {
  if (itemCount <= 0) return 0
  if (!Number.isFinite(page)) return 0
  return Math.min(Math.max(0, Math.floor(page)), itemCount - 1)
}

function providerSessionApprovalImpactI18nText(approval: ApprovalLike, t: TFunction): string {
  const previewSideEffect = approvalPreviewSideEffectText(approval.preview)
  if (previewSideEffect) return t('agents.chat.task.approvalImpact.previewApply', { sideEffect: previewSideEffect })

  switch (approval.toolName) {
    case 'generation_image_generate':
    case 'generation_video_generate':
    case 'generation_job_create':
      return t('agents.chat.task.approvalImpact.generationCreate')
    case 'generation_job_cancel':
      return t('agents.chat.task.approvalImpact.generationCancel')
    case 'movscript_project_create':
      return t('agents.chat.task.approvalImpact.projectCreate')
    case 'core_memory_delete':
      return t('agents.chat.task.approvalImpact.memoryDelete')
    case 'core_work_start':
      return t('agents.chat.task.approvalImpact.workStart', { defaultValue: 'Approving will submit async provider work; generation jobs may consume quota and subagent runs start worker agents.' })
    case 'core_work_cancel':
      return t('agents.chat.task.approvalImpact.workCancel', { defaultValue: 'Approving will cancel async provider work; unfinished outputs or worker follow-up may not be produced.' })
    default:
      break
  }

  const permission = approval.permission ?? ''
  if (permission === 'workspace.apply') return t('agents.chat.task.approvalImpact.workspaceApply')
  if (permission.includes('generation')) return t('agents.chat.task.approvalImpact.generationGeneric')
  if (permission.includes('project') && permission.includes('write')) return t('agents.chat.task.approvalImpact.projectWrite')
  if (permission.includes('workspace') && permission.includes('write')) return t('agents.chat.task.approvalImpact.workspaceWrite')
  if (permission.includes('memory') && permission.includes('write')) return t('agents.chat.task.approvalImpact.memoryWrite')
  if (approval.risk === 'destructive') return t('agents.chat.task.approvalImpact.destructive')
  if (approval.risk === 'write') return t('agents.chat.task.approvalImpact.write')
  return t('agents.chat.task.approvalImpact.default')
}

function approvalPreviewSideEffectText(preview: unknown): string | null {
  if (!preview || typeof preview !== 'object') return null
  const review = (preview as { review?: unknown }).review
  if (!review || typeof review !== 'object') return null
  const sideEffect = (review as { sideEffect?: unknown }).sideEffect
  return typeof sideEffect === 'string' && sideEffect.trim() ? sideEffect : null
}

function approvalArgs(approval: ProviderSessionApprovalRequest): Record<string, unknown> | undefined {
  if (!('args' in approval) || !approval.args || typeof approval.args !== 'object' || Array.isArray(approval.args)) return undefined
  return approval.args as Record<string, unknown>
}

function inputAnswerChoiceLabels(request: ProviderSessionInputRequest): string[] {
  return (request.answer?.choiceIds ?? []).map((choiceId) => request.choices.find((choice) => choice.id === choiceId)?.label ?? choiceId)
}
