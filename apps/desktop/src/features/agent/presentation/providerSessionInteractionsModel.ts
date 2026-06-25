import type { TFunction } from 'i18next'
import { approvalImpactLabel, runStatusLabel } from '@/features/agent/domain/agentRunUi'
import { agentPermissionLabel, agentRiskLabel, agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import type { ChatRunActivityApproval, ChatRunActivityInputRequest } from '@/features/agent/state/agentStore'
import type { AgentRun } from '@movscript/agent-protocol'

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
  return t('agents.chat.task.approvalOperation.default', { defaultValue: '旧异步任务交接' })
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

  const toolName = normalizeToolName(approval.toolName)
  switch (toolName) {
    case 'generation_content_unit_image_generate':
    case 'system_generate_content_unit_image':
      return t('agents.chat.task.approvalImpact.contentUnitImageGenerationCreate', { defaultValue: 'Approving will compile the content-unit prompt, submit image generation, and write candidates after success. It may consume generation quota.' })
    case 'generation_content_unit_video_generate':
    case 'system_generate_content_unit_video':
      return t('agents.chat.task.approvalImpact.contentUnitVideoGenerationCreate', { defaultValue: 'Approving will compile the content-unit prompt, submit video generation, and write candidates after success. It may consume generation quota.' })
    case 'generation_image_generate':
    case 'generation_video_generate':
    case 'generation_audio_generate':
    case 'generation_voiceover_generate':
    case 'system_generate_voiceover':
    case 'generation_music_generate':
    case 'system_generate_music':
    case 'generation_sfx_generate':
    case 'system_generate_sfx':
    case 'generation_subtitle_generate':
    case 'system_generate_subtitle':
    case 'generation_subtitle_align':
    case 'system_align_subtitle':
    case 'generation_subtitle_translate':
    case 'system_translate_subtitle':
    case 'generation_job_create':
      return t('agents.chat.task.approvalImpact.generationCreate')
    case 'generation_job_cancel':
      return t('agents.chat.task.approvalImpact.generationCancel')
    case 'movscript_project_create':
      return t('agents.chat.task.approvalImpact.projectCreate')
    case 'core_memory_delete':
      return t('agents.chat.task.approvalImpact.memoryDelete')
    case 'core_work_start':
      return t('agents.chat.task.approvalImpact.workStart', { defaultValue: 'Legacy compatibility: approving will hand off old async work. New generation and editing flows use explicit generation_* or editing_task_* tools.' })
    case 'core_work_cancel':
      return t('agents.chat.task.approvalImpact.workCancel', { defaultValue: 'Legacy compatibility: approving will cancel old async work. New generation jobs should use an explicit generation cancellation path.' })
    case 'system_artifact_upload_export':
    case 'system_artifact_upload_hls_stream':
      return t('agents.chat.task.approvalImpact.artifactWrite', { defaultValue: 'Approving will host a completed export or HLS artifact; it will not render media or write business candidates.' })
    case 'system_artifact_get_stream':
      return t('agents.chat.task.approvalImpact.artifactRead', { defaultValue: 'Approving will only read hosted media stream metadata or playback URLs.' })
    default:
      break
  }

  const permission = approval.permission ?? ''
  if (permission === 'workspace.apply') return t('agents.chat.task.approvalImpact.workspaceApply')
  if (permission.includes('editing.task') && !permission.includes('read')) {
    return t('agents.chat.task.approvalImpact.editingTask', { defaultValue: 'Approving will run a local editing task through Electron mediaPipeline; the backend will not perform timeline rendering.' })
  }
  if (permission.includes('editing.candidate')) {
    return t('agents.chat.task.approvalImpact.editingCandidate', { defaultValue: 'Approving will write a RawResource editing export as a business candidate; it will not automatically adopt the result.' })
  }
  if (permission.includes('editing.export')) {
    return t('agents.chat.task.approvalImpact.editingExport', { defaultValue: 'Approving will process an editing export or resource import; it will not automatically write a business candidate.' })
  }
  if (permission.includes('editing.timeline') || permission.includes('editing.project')) {
    return t('agents.chat.task.approvalImpact.editingProject', { defaultValue: 'Approving will modify MediaEditingProject or timeline data without rendering media or calling AI providers.' })
  }
  if (permission.includes('editing.runtime')) {
    return t('agents.chat.task.approvalImpact.editingRuntime', { defaultValue: 'Approving will only read local editing runtime capabilities.' })
  }
  if (permission.includes('artifact') && (permission.includes('write') || permission.includes('upload') || permission.includes('publish'))) {
    return t('agents.chat.task.approvalImpact.artifactWrite', { defaultValue: 'Approving will host a completed export or HLS artifact; it will not render media or write business candidates.' })
  }
  if (permission.includes('artifact') && permission.includes('read')) {
    return t('agents.chat.task.approvalImpact.artifactRead', { defaultValue: 'Approving will only read hosted media stream metadata or playback URLs.' })
  }
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

function normalizeToolName(toolName: string | undefined): string | undefined {
  return toolName?.replace(/^mcp__movscript__/, '')
}

function inputAnswerChoiceLabels(request: ProviderSessionInputRequest): string[] {
  return (request.answer?.choiceIds ?? []).map((choiceId) => request.choices.find((choice) => choice.id === choiceId)?.label ?? choiceId)
}
