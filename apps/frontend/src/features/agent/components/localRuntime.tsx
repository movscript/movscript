import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ListChecks, Loader2, ShieldCheck, Workflow, X } from 'lucide-react'
import {
  AgentWorkflowActionButton,
  AgentWorkflowAnswerText,
  AgentWorkflowChoiceButton,
  AgentWorkflowImpactLabel,
  AgentWorkflowImpactText,
  AgentWorkflowMarkerDot,
  AgentWorkflowMetaBadge,
  AgentWorkflowRequestActions,
  AgentWorkflowRequestCard,
  AgentWorkflowRequestCopy,
  AgentWorkflowRequestDetail,
  AgentWorkflowRequestHeader,
  AgentWorkflowRequestPrompt,
  AgentWorkflowRequestSummary,
  AgentWorkflowRequestTitle,
  AgentWorkflowRuntimeHeader,
  AgentWorkflowRuntimePanel,
  AgentWorkflowRuntimeStatusBadge,
  AgentWorkflowRuntimeTitle,
  AgentWorkflowSection,
  AgentWorkflowSectionActions,
  AgentWorkflowSectionHeader,
  AgentWorkflowSectionTitle,
  AgentWorkflowStack,
  AgentWorkflowStateBadge,
  AgentWorkflowStatusBadge,
  AgentWorkflowTextInput,
} from '@movscript/ui'
import { buildAgentRunTimeline, type AgentTimelineItem } from '@/features/agent/domain/agentTimeline'
import { approvalImpactLabel, runStatusLabel } from '@/features/agent/domain/agentRunUi'
import { agentPermissionLabel, agentRiskLabel, agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import { agentRunStatusRecipe, agentWorkflowActionStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { ChatRunActivityApproval, ChatRunActivityEvent, ChatRunActivityInputRequest } from '@/features/agent/state/agentStore'

export { formatLocalAgentAssistantContent } from '@/features/agent/domain/localAgentResult'

export type LocalAgentApprovalRequest = NonNullable<AgentRun['pendingApprovals']>[number] | ChatRunActivityApproval
export type LocalAgentInputRequest = NonNullable<AgentRun['pendingInputRequests']>[number] | ChatRunActivityInputRequest
type PendingApproval = LocalAgentApprovalRequest
type PendingInputRequest = LocalAgentInputRequest
type ApprovalLike = Pick<PendingApproval, 'toolName' | 'risk' | 'permission' | 'preview'>

export interface LocalAgentWorkflowPanelProps {
  run: AgentRun | null
  approving?: boolean
  title?: ReactNode
  events?: ChatRunActivityEvent[]
  onApprove?: (approvalIds?: string[]) => void
  onReject?: (approvalIds?: string[]) => void
  onAnswerInput?: (requestId: string, answer: { choiceIds?: string[]; text?: string }) => void
  approvalDetails?: (approval: PendingApproval) => ReactNode
}

export interface LocalAgentInputRequestCardProps {
  request: PendingInputRequest
  disabled?: boolean
  onAnswer: (answer: { choiceIds?: string[]; text?: string }) => void
  sendLabel?: string
  placeholder?: string
  meta?: ReactNode
}

export interface LocalAgentApprovalRequestCardProps {
  approval: PendingApproval
  approving?: boolean
  onApprove?: (approvalIds?: string[]) => void
  onReject?: (approvalIds?: string[]) => void
  approvalDetails?: (approval: PendingApproval) => ReactNode
}

export function localAgentApprovalImpactText(approval: ApprovalLike, t?: ReturnType<typeof useTranslation>['t']): string {
  if (t) return localAgentApprovalImpactI18nText(approval, t)
  return approvalImpactLabel(approval as Pick<NonNullable<AgentRun['pendingApprovals']>[number], 'toolName' | 'risk' | 'permission' | 'preview'>)
}

export function localAgentApprovalRiskText(risk: string, t: ReturnType<typeof useTranslation>['t']): string {
  return agentRiskLabel(risk, t)
}

export function localAgentApprovalPermissionText(permission: string, t: ReturnType<typeof useTranslation>['t']): string {
  return agentPermissionLabel(permission, t)
}

export function localAgentApprovalStatusText(status: string | undefined, t: ReturnType<typeof useTranslation>['t']): string {
  switch (status) {
    case 'pending':
      return t('agents.chat.workflow.approvalPending')
    case 'approved':
      return t('agents.chat.workflow.approvalApproved')
    case 'rejected':
      return t('agents.chat.workflow.approvalRejected')
    case 'cancelled':
      return t('agents.chat.workflow.cancelled')
    case 'expired':
      return t('agents.chat.workflow.approvalExpired')
    default:
      return status ?? '-'
  }
}

function localAgentApprovalImpactI18nText(approval: ApprovalLike, t: ReturnType<typeof useTranslation>['t']): string {
  const previewSideEffect = approvalPreviewSideEffectText(approval.preview)
  if (previewSideEffect) return t('agents.chat.workflow.approvalImpact.previewApply', { sideEffect: previewSideEffect })

  switch (approval.toolName) {
    case 'generation_job_create':
      return t('agents.chat.workflow.approvalImpact.generationCreate')
    case 'generation_job_cancel':
      return t('agents.chat.workflow.approvalImpact.generationCancel')
    case 'movscript_project_create':
      return t('agents.chat.workflow.approvalImpact.projectCreate')
    case 'core_memory_delete':
      return t('agents.chat.workflow.approvalImpact.memoryDelete')
    case 'core_work_start':
      return t('agents.chat.workflow.approvalImpact.workStart', { defaultValue: 'Approving will submit async runtime work; generation jobs may consume quota and subagent runs start worker agents.' })
    case 'core_work_cancel':
      return t('agents.chat.workflow.approvalImpact.workCancel', { defaultValue: 'Approving will cancel async runtime work; unfinished outputs or worker follow-up may not be produced.' })
    default:
      break
  }

  const permission = approval.permission ?? ''
  if (permission === 'draft.apply') return t('agents.chat.workflow.approvalImpact.draftApply')
  if (permission.includes('generation')) return t('agents.chat.workflow.approvalImpact.generationGeneric')
  if (permission.includes('project') && permission.includes('write')) return t('agents.chat.workflow.approvalImpact.projectWrite')
  if (permission.includes('draft') && permission.includes('write')) return t('agents.chat.workflow.approvalImpact.draftWrite')
  if (permission.includes('memory') && permission.includes('write')) return t('agents.chat.workflow.approvalImpact.memoryWrite')
  if (approval.risk === 'destructive') return t('agents.chat.workflow.approvalImpact.destructive')
  if (approval.risk === 'write') return t('agents.chat.workflow.approvalImpact.write')
  return t('agents.chat.workflow.approvalImpact.default')
}

function approvalPreviewSideEffectText(preview: unknown): string | null {
  if (!preview || typeof preview !== 'object') return null
  const review = (preview as { review?: unknown }).review
  if (!review || typeof review !== 'object') return null
  const sideEffect = (review as { sideEffect?: unknown }).sideEffect
  return typeof sideEffect === 'string' && sideEffect.trim() ? sideEffect : null
}

export function LocalAgentInputRequestCard({
  request,
  disabled,
  onAnswer,
  sendLabel,
  placeholder,
  meta,
}: LocalAgentInputRequestCardProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const answered = request.status === 'answered'
  const controlsDisabled = disabled || request.status !== 'pending'
  const selectedChoiceIds = new Set(request.answer?.choiceIds ?? [])
  return (
    <AgentWorkflowRequestCard requestKind="input" status={request.status}>
      <AgentWorkflowRequestHeader>
        <AgentWorkflowRequestCopy>
          <AgentWorkflowRequestTitle>{request.title}</AgentWorkflowRequestTitle>
          {meta}
        </AgentWorkflowRequestCopy>
        <AgentWorkflowStateBadge requestKind="input" status={request.status}>
          {inputWorkflowStatusLabel(request.status, t)}
        </AgentWorkflowStateBadge>
      </AgentWorkflowRequestHeader>
      <AgentWorkflowRequestSummary hiddenContent={!request.summary}>
        {request.summary ?? ''}
      </AgentWorkflowRequestSummary>
      <AgentWorkflowRequestPrompt>{request.question}</AgentWorkflowRequestPrompt>
      {request.choices.length > 0 && (
        <AgentWorkflowStack>
          {request.choices.map((choice) => (
            <AgentWorkflowChoiceButton
              key={choice.id}
              type="button"
              selected={selectedChoiceIds.has(choice.id)}
              disabled={controlsDisabled}
              onClick={() => onAnswer({ choiceIds: [choice.id] })}
              data-testid="agent-run-input-choice"
              aria-label={t('agents.chat.workflow.answerChoiceAria', { title: request.title, choice: choice.label })}
            >
              <AgentWorkflowRequestCopy>
                <AgentWorkflowRequestTitle>{choice.label}</AgentWorkflowRequestTitle>
                {choice.description ? <AgentWorkflowRequestDetail>{choice.description}</AgentWorkflowRequestDetail> : null}
              </AgentWorkflowRequestCopy>
            </AgentWorkflowChoiceButton>
          ))}
        </AgentWorkflowStack>
      )}
      {(request.allowCustomAnswer || request.inputType === 'text') && (
        <AgentWorkflowRequestHeader>
          <AgentWorkflowTextInput
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={controlsDisabled}
            placeholder={placeholder ?? t('common.inputPlaceholder')}
            data-testid="agent-run-input-text"
            aria-label={t('agents.chat.workflow.answerCustomAria', { title: request.title })}
          />
          <AgentWorkflowActionButton
            type="button"
            size="sm"
            variant="soft"
            disabled={controlsDisabled || !text.trim()}
            onClick={() => onAnswer({ text: text.trim() })}
            data-testid="agent-run-input-submit"
            aria-label={t('agents.chat.workflow.submitCustomAria', { title: request.title })}
          >
            {sendLabel ?? t('common.send')}
          </AgentWorkflowActionButton>
        </AgentWorkflowRequestHeader>
      )}
      {answered && inputAnswerSummaryText(request, t) && (
        <AgentWorkflowAnswerText>
          {inputAnswerSummaryText(request, t)}
        </AgentWorkflowAnswerText>
      )}
    </AgentWorkflowRequestCard>
  )
}

export function LocalAgentApprovalRequestCard({
  approval,
  approving,
  onApprove,
  onReject,
  approvalDetails,
}: LocalAgentApprovalRequestCardProps) {
  const { t } = useTranslation()
  const isPending = approval.status === 'pending'
  const approvalTitle = localAgentApprovalTitle(approval, t)
  const approvalReason = localAgentApprovalReason(approval, t)
  return (
    <AgentWorkflowRequestCard status={approval.status} approving={approving}>
      <AgentWorkflowRequestHeader>
        <AgentWorkflowRequestCopy>
          <AgentWorkflowRequestTitle title={approvalTitle}>{approvalTitle}</AgentWorkflowRequestTitle>
          {approval.risk && (
            <AgentWorkflowMetaBadge>
              {localAgentApprovalRiskText(approval.risk, t)}
            </AgentWorkflowMetaBadge>
          )}
          {approval.permission && (
            <AgentWorkflowMetaBadge>
              {localAgentApprovalPermissionText(approval.permission, t)}
            </AgentWorkflowMetaBadge>
          )}
        </AgentWorkflowRequestCopy>
        <AgentWorkflowRequestActions>
          <AgentWorkflowStateBadge status={approval.status}>
            {localAgentApprovalStatusText(approval.status, t)}
          </AgentWorkflowStateBadge>
          {isPending ? (
            <>
              {onReject && (
                <AgentWorkflowActionButton type="button" size="xs" variant="ghost" actionTone="reject" onClick={() => onReject([approval.id])}>
                  {t('agents.chat.workflow.reject')}
                </AgentWorkflowActionButton>
              )}
              {onApprove && (
                <AgentWorkflowActionButton type="button" size="xs" onClick={() => onApprove([approval.id])}>
                  {t('agents.chat.workflow.approve')}
                </AgentWorkflowActionButton>
              )}
            </>
          ) : null}
        </AgentWorkflowRequestActions>
      </AgentWorkflowRequestHeader>
      {approvalReason && <AgentWorkflowRequestDetail>{approvalReason}</AgentWorkflowRequestDetail>}
      <AgentWorkflowImpactText status={approval.status}>
        <AgentWorkflowImpactLabel>{t('agents.chat.workflow.approvalImpact.label')}: </AgentWorkflowImpactLabel>
        {localAgentApprovalImpactText(approval, t)}
      </AgentWorkflowImpactText>
      {approvalDetails ? approvalDetails(approval) : null}
    </AgentWorkflowRequestCard>
  )
}

function localAgentApprovalTitle(approval: PendingApproval, t: ReturnType<typeof useTranslation>['t']) {
  if (approval.toolName !== 'core_work_start') return agentToolNameLabel(approval.toolName, t)
  const args = approval.args && typeof approval.args === 'object' && !Array.isArray(approval.args)
    ? approval.args as Record<string, unknown>
    : undefined
  const kind = typeof args?.kind === 'string' ? args.kind : undefined
  if (kind === 'generation_job') return t('agents.chat.workflow.approvalOperation.generationJob', { defaultValue: '创建生成任务' })
  if (kind === 'subagent_run') return t('agents.chat.workflow.approvalOperation.subagentRun', { defaultValue: '启动子 agent 运行' })
  return t('agents.chat.workflow.approvalOperation.default', { defaultValue: '提交异步任务' })
}

function localAgentApprovalReason(approval: PendingApproval, t: ReturnType<typeof useTranslation>['t']) {
  if (/^[\w.:/-]+\s+需要用户确认后才能执行[。.]?$/.test(approval.reason.trim())) {
    return ''
  }
  if (approval.toolName === 'core_work_start' && /core_work_start|agent\.work\.write|work\.write/i.test(approval.reason)) {
    return t('agents.chat.workflow.approvalOperation.confirmBeforeRun', { defaultValue: '需要用户确认后才能执行。' })
  }
  return approval.reason
}

export function LocalAgentWorkflowPanel({
  run,
  approving = false,
  title,
  events = [],
  onApprove,
  onReject,
  onAnswerInput,
  approvalDetails,
}: LocalAgentWorkflowPanelProps) {
  const { t } = useTranslation()
  if (!run) return null

  const actionApprovals = (run.pendingApprovals ?? []).filter((approval) => approval.status === 'pending' || approval.status === 'approved' || approval.status === 'rejected')
  const pendingApprovals = actionApprovals.filter((approval) => approval.status === 'pending')
  const actionInputs = (run.pendingInputRequests ?? []).filter((request) => request.status === 'pending' || request.status === 'answered' || request.status === 'cancelled')
  const pendingInputs = actionInputs.filter((request) => request.status === 'pending')
  const pendingActionItemIds = new Set([
    ...actionApprovals.map((approval) => `approval-${approval.id}`),
    ...actionInputs.map((request) => `input-${request.id}`),
  ])
  const actionHistory = (buildAgentRunTimeline({ run, events })?.items ?? [])
    .filter((item) => (item.type === 'approval' || item.type === 'input_request') && !pendingActionItemIds.has(item.id))
  const hasSettledApprovals = actionApprovals.some((approval) => approval.status === 'approved' || approval.status === 'rejected')
  const approvalTone = pendingApprovals.length > 0
    ? 'pending'
    : actionApprovals.some((approval) => approval.status === 'rejected')
      ? 'rejected'
      : hasSettledApprovals ? 'approved' : 'idle'
  const traceEvents = [...(run.traceEvents ?? []), ...events]
  const timingEvents = traceEvents.filter((event) => {
    const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : undefined
    return typeof data?.durationMs === 'number'
      || (typeof event.title === 'string' && /timing|setup complete|resolved/i.test(event.title))
  })
  const statusLabel = run.status === 'requires_action'
    ? pendingInputs.length > 0 ? t('agents.chat.workflow.waitingForInput') : t('agents.chat.workflow.waitingForApproval')
    : run.status === 'cancelled'
      ? t('agents.chat.workflow.cancelled')
    : workflowRunStatusLabel(run.status, t)
  const showBulkApprovalActions = pendingApprovals.length > 1
  const runStatusRecipe = agentRunStatusRecipe(run.status)

  return (
    <AgentWorkflowRuntimePanel>
      <AgentWorkflowRuntimeHeader>
        <AgentWorkflowRuntimeTitle>
          <Workflow size={14} />
          {title ?? t('agents.chat.workflow.panelTitle')}
        </AgentWorkflowRuntimeTitle>
        <AgentWorkflowRuntimeStatusBadge intent={runStatusRecipe.intent} emphasis={runStatusRecipe.emphasis}>
          {statusLabel}
        </AgentWorkflowRuntimeStatusBadge>
      </AgentWorkflowRuntimeHeader>

      {actionInputs.length > 0 && onAnswerInput && (
        <AgentWorkflowSection>
          <AgentWorkflowSectionHeader>
            <AgentWorkflowSectionTitle>
              <ListChecks size={12} />
              {t('agents.chat.workflow.inputRequired')}
            </AgentWorkflowSectionTitle>
          </AgentWorkflowSectionHeader>
          <AgentWorkflowStack>
            {actionInputs.map((request) => (
              <LocalAgentInputRequestCard
                key={request.id}
                request={request}
                disabled={approving || request.status !== 'pending' || !onAnswerInput}
                onAnswer={(answer) => onAnswerInput?.(request.id, answer)}
              />
            ))}
          </AgentWorkflowStack>
        </AgentWorkflowSection>
      )}

      {actionApprovals.length > 0 && (
        <AgentWorkflowSection state={approvalTone}>
          <AgentWorkflowSectionHeader>
            <AgentWorkflowSectionTitle state={approvalTone}>
              <ShieldCheck size={12} />
              {workflowApprovalSectionTitle(approvalTone, t)}
            </AgentWorkflowSectionTitle>
            <AgentWorkflowSectionActions visible={showBulkApprovalActions}>
              <AgentWorkflowActionButton
                type="button"
                size="xs"
                variant="ghost"
                actionTone="reject"
                onClick={() => onReject?.(pendingApprovals.map((approval) => approval.id))}
                disabled={!showBulkApprovalActions || approving || !onReject}
              >
                <X size={10} />
                {t('agents.chat.workflow.rejectAll')}
              </AgentWorkflowActionButton>
              <AgentWorkflowActionButton
                type="button"
                size="xs"
                variant="soft"
                onClick={() => onApprove?.(pendingApprovals.map((approval) => approval.id))}
                disabled={!showBulkApprovalActions || approving || !onApprove}
              >
                {approving ? <Loader2 size={10} /> : <Check size={10} />}
                {t('agents.chat.workflow.approveAll')}
              </AgentWorkflowActionButton>
            </AgentWorkflowSectionActions>
          </AgentWorkflowSectionHeader>
          <AgentWorkflowStack>
            {actionApprovals.map((approval) => (
              <LocalAgentApprovalRequestCard
                key={approval.id}
                approval={approval}
                approving={approving}
                onApprove={onApprove}
                onReject={onReject}
                approvalDetails={approvalDetails}
              />
            ))}
          </AgentWorkflowStack>
        </AgentWorkflowSection>
      )}

      {actionHistory.length > 0 && (
        <AgentWorkflowSection>
          <AgentWorkflowSectionHeader>
            <AgentWorkflowSectionTitle>
              <ListChecks size={12} />
              {t('agents.chat.workflow.interactionHistory')}
            </AgentWorkflowSectionTitle>
          </AgentWorkflowSectionHeader>
          <AgentWorkflowStack>
            {actionHistory.map((item) => (
              <WorkflowActionHistoryItem key={item.id} item={item} />
            ))}
          </AgentWorkflowStack>
        </AgentWorkflowSection>
      )}

      {timingEvents.length > 0 && (
        <AgentWorkflowSection>
          <AgentWorkflowSectionHeader>
            <AgentWorkflowSectionTitle>
              <Workflow size={12} />
              {t('agents.chat.workflow.timing')}
            </AgentWorkflowSectionTitle>
          </AgentWorkflowSectionHeader>
          <AgentWorkflowStack>
            {timingEvents.map((event) => {
              const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : undefined
              const durationMs = typeof data?.durationMs === 'number' ? data.durationMs : undefined
              const focusTimings = data?.focusTimings && typeof data.focusTimings === 'object'
                ? data.focusTimings as Record<string, unknown>
                : undefined
              const focusMs = typeof focusTimings?.focusMs === 'number' ? focusTimings.focusMs : undefined
              return (
                <AgentWorkflowRequestCard key={event.id} status="completed">
                  <AgentWorkflowRequestHeader>
                    <AgentWorkflowRequestTitle>{event.title}</AgentWorkflowRequestTitle>
                    {durationMs !== undefined && (
                      <AgentWorkflowMetaBadge>
                        {Math.round(durationMs)}ms
                      </AgentWorkflowMetaBadge>
                    )}
                  </AgentWorkflowRequestHeader>
                  {event.summary && <AgentWorkflowRequestDetail>{event.summary}</AgentWorkflowRequestDetail>}
                  {focusMs !== undefined && <AgentWorkflowRequestSummary>{t('agents.chat.workflow.focusTotal', { ms: Math.round(focusMs) })}</AgentWorkflowRequestSummary>}
                </AgentWorkflowRequestCard>
              )
            })}
          </AgentWorkflowStack>
        </AgentWorkflowSection>
      )}
    </AgentWorkflowRuntimePanel>
  )
}

function WorkflowActionHistoryItem({ item }: { item: AgentTimelineItem }) {
  const actionRecipe = agentWorkflowActionStatusRecipe(item.status)
  return (
    <AgentWorkflowRequestCard status={item.status}>
      <AgentWorkflowRequestHeader>
        <AgentWorkflowRequestCopy>
          <AgentWorkflowMarkerDot size="xs" status={item.status} />
          <AgentWorkflowRequestTitle>{item.title}</AgentWorkflowRequestTitle>
        </AgentWorkflowRequestCopy>
        <AgentWorkflowStatusBadge intent={actionRecipe.intent} emphasis={actionRecipe.emphasis}>
          {item.statusLabel ?? item.status}
        </AgentWorkflowStatusBadge>
      </AgentWorkflowRequestHeader>
      {item.summary && <AgentWorkflowRequestDetail>{item.summary}</AgentWorkflowRequestDetail>}
    </AgentWorkflowRequestCard>
  )
}

function workflowApprovalSectionTitle(tone: 'pending' | 'approved' | 'rejected' | 'idle', t: ReturnType<typeof useTranslation>['t']): string {
  if (tone === 'approved') return t('agents.chat.workflow.approvalApprovedSection')
  if (tone === 'rejected') return t('agents.chat.workflow.approvalRejectedSection')
  return t('agents.chat.workflow.approvalRequired')
}

function workflowRunStatusLabel(status: AgentRun['status'], t: ReturnType<typeof useTranslation>['t']): string {
  switch (status) {
    case 'queued':
      return t('agents.chat.workflow.runQueued')
    case 'in_progress':
      return t('agents.chat.workflow.runInProgress')
    case 'requires_action':
      return t('agents.chat.workflow.runRequiresAction')
    case 'completed':
      return t('agents.chat.workflow.runCompleted')
    case 'completed_with_warnings':
      return t('agents.chat.workflow.runCompletedWithWarnings')
    case 'failed':
      return t('agents.chat.workflow.runFailed')
    case 'cancelled':
      return t('agents.chat.workflow.cancelled')
    default:
      return runStatusLabel(status)
  }
}

function inputWorkflowStatusLabel(status: string, t: ReturnType<typeof useTranslation>['t']): string {
  if (status === 'answered') return t('agents.chat.workflow.inputAnswered')
  if (status === 'cancelled') return t('agents.chat.workflow.inputCancelled')
  return t('agents.chat.workflow.inputPending')
}

function inputAnswerSummaryText(request: PendingInputRequest, t: ReturnType<typeof useTranslation>['t']): string {
  return [
    request.answer?.choiceIds?.length ? t('agents.chat.workflow.choiceAnswerSummary', { value: inputAnswerChoiceLabels(request).join(', ') }) : undefined,
    request.answer?.text ? t('agents.chat.workflow.customAnswerSummary', { value: request.answer.text }) : undefined,
  ].filter(Boolean).join(t('agents.chat.workflow.answerSummarySeparator'))
}

function inputAnswerChoiceLabels(request: PendingInputRequest): string[] {
  return (request.answer?.choiceIds ?? []).map((choiceId) => request.choices.find((choice) => choice.id === choiceId)?.label ?? choiceId)
}
