import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ListChecks, Loader2, ShieldCheck, Route, X } from 'lucide-react'
import {
  AgentRunInteractionActionButton,
  AgentRunInteractionAnswerText,
  AgentRunInteractionChoiceButton,
  AgentRunInteractionImpactLabel,
  AgentRunInteractionImpactText,
  AgentRunInteractionMarkerDot,
  AgentRunInteractionMetaBadge,
  AgentRunInteractionRequestActions,
  AgentRunInteractionRequestCard,
  AgentRunInteractionRequestCopy,
  AgentRunInteractionRequestDetail,
  AgentRunInteractionRequestHeader,
  AgentRunInteractionRequestPrompt,
  AgentRunInteractionRequestSummary,
  AgentRunInteractionRequestTitle,
  AgentRunInteractionRuntimeHeader,
  AgentRunInteractionRuntimePanel,
  AgentRunInteractionRuntimeStatusBadge,
  AgentRunInteractionRuntimeTitle,
  AgentRunInteractionSection,
  AgentRunInteractionSectionActions,
  AgentRunInteractionSectionHeader,
  AgentRunInteractionSectionTitle,
  AgentRunInteractionStack,
  AgentRunInteractionStateBadge,
  AgentRunInteractionStatusBadge,
  AgentRunInteractionTextInput,
} from '@movscript/ui'
import { buildAgentRunActivityTimeline, type AgentRunActivityTimelineItem } from '@/features/agent/presentation/agentRunActivityTimeline'
import { approvalImpactLabel, runStatusLabel } from '@/features/agent/domain/agentRunUi'
import { agentPermissionLabel, agentRiskLabel, agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import { agentRunStatusRecipe, agentRunInteractionActionStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { ChatRunActivityApproval, ChatRunActivityEvent, ChatRunActivityInputRequest } from '@/features/agent/state/agentStore'

export { formatLocalAgentAssistantContent } from '@/features/agent/domain/localAgentResult'

export type LocalAgentApprovalRequest = NonNullable<AgentRun['pendingApprovals']>[number] | ChatRunActivityApproval
export type LocalAgentInputRequest = NonNullable<AgentRun['pendingInputRequests']>[number] | ChatRunActivityInputRequest
type PendingApproval = LocalAgentApprovalRequest
type PendingInputRequest = LocalAgentInputRequest
type ApprovalLike = Pick<PendingApproval, 'toolName' | 'risk' | 'permission'> & { preview?: unknown }

export interface LocalAgentRunInteractionPanelProps {
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

function localAgentApprovalImpactI18nText(approval: ApprovalLike, t: ReturnType<typeof useTranslation>['t']): string {
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
      return t('agents.chat.task.approvalImpact.workStart', { defaultValue: 'Approving will submit async runtime work; generation jobs may consume quota and subagent runs start worker agents.' })
    case 'core_work_cancel':
      return t('agents.chat.task.approvalImpact.workCancel', { defaultValue: 'Approving will cancel async runtime work; unfinished outputs or worker follow-up may not be produced.' })
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
    <AgentRunInteractionRequestCard requestKind="input" status={request.status}>
      <AgentRunInteractionRequestHeader>
        <AgentRunInteractionRequestCopy>
          <AgentRunInteractionRequestTitle>{request.title}</AgentRunInteractionRequestTitle>
          {meta}
        </AgentRunInteractionRequestCopy>
        <AgentRunInteractionStateBadge requestKind="input" status={request.status}>
          {inputRunInteractionStatusLabel(request.status, t)}
        </AgentRunInteractionStateBadge>
      </AgentRunInteractionRequestHeader>
      <AgentRunInteractionRequestSummary hiddenContent={!request.summary}>
        {request.summary ?? ''}
      </AgentRunInteractionRequestSummary>
      <AgentRunInteractionRequestPrompt>{request.question}</AgentRunInteractionRequestPrompt>
      {request.choices.length > 0 && (
        <AgentRunInteractionStack>
          {request.choices.map((choice) => (
            <AgentRunInteractionChoiceButton
              key={choice.id}
              type="button"
              selected={selectedChoiceIds.has(choice.id)}
              disabled={controlsDisabled}
              onClick={() => onAnswer({ choiceIds: [choice.id] })}
              data-testid="agent-run-input-choice"
              aria-label={t('agents.chat.task.answerChoiceAria', { title: request.title, choice: choice.label })}
            >
              <AgentRunInteractionRequestCopy>
                <AgentRunInteractionRequestTitle>{choice.label}</AgentRunInteractionRequestTitle>
                {choice.description ? <AgentRunInteractionRequestDetail>{choice.description}</AgentRunInteractionRequestDetail> : null}
              </AgentRunInteractionRequestCopy>
            </AgentRunInteractionChoiceButton>
          ))}
        </AgentRunInteractionStack>
      )}
      {(request.allowCustomAnswer || request.inputType === 'text') && (
        <AgentRunInteractionRequestHeader>
          <AgentRunInteractionTextInput
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={controlsDisabled}
            placeholder={placeholder ?? t('common.inputPlaceholder')}
            data-testid="agent-run-input-text"
            aria-label={t('agents.chat.task.answerCustomAria', { title: request.title })}
          />
          <AgentRunInteractionActionButton
            type="button"
            size="sm"
            variant="soft"
            disabled={controlsDisabled || !text.trim()}
            onClick={() => onAnswer({ text: text.trim() })}
            data-testid="agent-run-input-submit"
            aria-label={t('agents.chat.task.submitCustomAria', { title: request.title })}
          >
            {sendLabel ?? t('common.send')}
          </AgentRunInteractionActionButton>
        </AgentRunInteractionRequestHeader>
      )}
      {answered && inputAnswerSummaryText(request, t) && (
        <AgentRunInteractionAnswerText>
          {inputAnswerSummaryText(request, t)}
        </AgentRunInteractionAnswerText>
      )}
    </AgentRunInteractionRequestCard>
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
    <AgentRunInteractionRequestCard status={approval.status} approving={approving}>
      <AgentRunInteractionRequestHeader>
        <AgentRunInteractionRequestCopy>
          <AgentRunInteractionRequestTitle title={approvalTitle}>{approvalTitle}</AgentRunInteractionRequestTitle>
          {approval.risk && (
            <AgentRunInteractionMetaBadge>
              {localAgentApprovalRiskText(approval.risk, t)}
            </AgentRunInteractionMetaBadge>
          )}
          {approval.permission && (
            <AgentRunInteractionMetaBadge>
              {localAgentApprovalPermissionText(approval.permission, t)}
            </AgentRunInteractionMetaBadge>
          )}
        </AgentRunInteractionRequestCopy>
        <AgentRunInteractionRequestActions>
          <AgentRunInteractionStateBadge status={approval.status}>
            {localAgentApprovalStatusText(approval.status, t)}
          </AgentRunInteractionStateBadge>
          {isPending ? (
            <>
              {onReject && (
                <AgentRunInteractionActionButton type="button" size="xs" variant="ghost" actionTone="reject" onClick={() => onReject([approval.id])}>
                  {t('agents.chat.task.reject')}
                </AgentRunInteractionActionButton>
              )}
              {onApprove && (
                <AgentRunInteractionActionButton type="button" size="xs" onClick={() => onApprove([approval.id])}>
                  {t('agents.chat.task.approve')}
                </AgentRunInteractionActionButton>
              )}
            </>
          ) : null}
        </AgentRunInteractionRequestActions>
      </AgentRunInteractionRequestHeader>
      {approvalReason && <AgentRunInteractionRequestDetail>{approvalReason}</AgentRunInteractionRequestDetail>}
      <AgentRunInteractionImpactText status={approval.status}>
        <AgentRunInteractionImpactLabel>{t('agents.chat.task.approvalImpact.label')}: </AgentRunInteractionImpactLabel>
        {localAgentApprovalImpactText(approval, t)}
      </AgentRunInteractionImpactText>
      {approvalDetails ? approvalDetails(approval) : null}
    </AgentRunInteractionRequestCard>
  )
}

function localAgentApprovalTitle(approval: PendingApproval, t: ReturnType<typeof useTranslation>['t']) {
  if (approval.toolName !== 'core_work_start') return agentToolNameLabel(approval.toolName, t)
  const args = approvalArgs(approval)
  const kind = typeof args?.kind === 'string' ? args.kind : undefined
  if (kind === 'generation_job') return t('agents.chat.task.approvalOperation.generationJob', { defaultValue: '创建生成任务' })
  if (kind === 'subagent_run') return t('agents.chat.task.approvalOperation.subagentRun', { defaultValue: '启动子 agent 运行' })
  return t('agents.chat.task.approvalOperation.default', { defaultValue: '提交异步任务' })
}

function approvalArgs(approval: PendingApproval): Record<string, unknown> | undefined {
  if (!('args' in approval) || !approval.args || typeof approval.args !== 'object' || Array.isArray(approval.args)) return undefined
  return approval.args as Record<string, unknown>
}

function localAgentApprovalReason(approval: PendingApproval, t: ReturnType<typeof useTranslation>['t']) {
  if (/^[\w.:/-]+\s+需要用户确认后才能执行[。.]?$/.test(approval.reason.trim())) {
    return ''
  }
  if (approval.toolName === 'core_work_start' && /core_work_start|agent\.work\.write|work\.write/i.test(approval.reason)) {
    return t('agents.chat.task.approvalOperation.confirmBeforeRun', { defaultValue: '需要用户确认后才能执行。' })
  }
  return approval.reason
}

export function LocalAgentRunInteractionPanel({
  run,
  approving = false,
  title,
  events = [],
  onApprove,
  onReject,
  onAnswerInput,
  approvalDetails,
}: LocalAgentRunInteractionPanelProps) {
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
  const actionHistory = (buildAgentRunActivityTimeline({ run, events })?.items ?? [])
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
    ? pendingInputs.length > 0 ? t('agents.chat.task.waitingForInput') : t('agents.chat.task.waitingForApproval')
    : run.status === 'cancelled'
      ? t('agents.chat.task.cancelled')
    : interactionRunStatusLabel(run.status, t)
  const showBulkApprovalActions = pendingApprovals.length > 1
  const runStatusRecipe = agentRunStatusRecipe(run.status)

  return (
    <AgentRunInteractionRuntimePanel>
      <AgentRunInteractionRuntimeHeader>
        <AgentRunInteractionRuntimeTitle>
          <Route size={14} />
          {title ?? t('agents.chat.task.panelTitle')}
        </AgentRunInteractionRuntimeTitle>
        <AgentRunInteractionRuntimeStatusBadge intent={runStatusRecipe.intent} emphasis={runStatusRecipe.emphasis}>
          {statusLabel}
        </AgentRunInteractionRuntimeStatusBadge>
      </AgentRunInteractionRuntimeHeader>

      {actionInputs.length > 0 && onAnswerInput && (
        <AgentRunInteractionSection>
          <AgentRunInteractionSectionHeader>
            <AgentRunInteractionSectionTitle>
              <ListChecks size={12} />
              {t('agents.chat.task.inputRequired')}
            </AgentRunInteractionSectionTitle>
          </AgentRunInteractionSectionHeader>
          <AgentRunInteractionStack>
            {actionInputs.map((request) => (
              <LocalAgentInputRequestCard
                key={request.id}
                request={request}
                disabled={approving || request.status !== 'pending' || !onAnswerInput}
                onAnswer={(answer) => onAnswerInput?.(request.id, answer)}
              />
            ))}
          </AgentRunInteractionStack>
        </AgentRunInteractionSection>
      )}

      {actionApprovals.length > 0 && (
        <AgentRunInteractionSection state={approvalTone}>
          <AgentRunInteractionSectionHeader>
            <AgentRunInteractionSectionTitle state={approvalTone}>
              <ShieldCheck size={12} />
              {runInteractionApprovalSectionTitle(approvalTone, t)}
            </AgentRunInteractionSectionTitle>
            <AgentRunInteractionSectionActions visible={showBulkApprovalActions}>
              <AgentRunInteractionActionButton
                type="button"
                size="xs"
                variant="ghost"
                actionTone="reject"
                onClick={() => onReject?.(pendingApprovals.map((approval) => approval.id))}
                disabled={!showBulkApprovalActions || approving || !onReject}
              >
                <X size={10} />
                {t('agents.chat.task.rejectAll')}
              </AgentRunInteractionActionButton>
              <AgentRunInteractionActionButton
                type="button"
                size="xs"
                variant="soft"
                onClick={() => onApprove?.(pendingApprovals.map((approval) => approval.id))}
                disabled={!showBulkApprovalActions || approving || !onApprove}
              >
                {approving ? <Loader2 size={10} /> : <Check size={10} />}
                {t('agents.chat.task.approveAll')}
              </AgentRunInteractionActionButton>
            </AgentRunInteractionSectionActions>
          </AgentRunInteractionSectionHeader>
          <AgentRunInteractionStack>
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
          </AgentRunInteractionStack>
        </AgentRunInteractionSection>
      )}

      {actionHistory.length > 0 && (
        <AgentRunInteractionSection>
          <AgentRunInteractionSectionHeader>
            <AgentRunInteractionSectionTitle>
              <ListChecks size={12} />
              {t('agents.chat.task.interactionHistory')}
            </AgentRunInteractionSectionTitle>
          </AgentRunInteractionSectionHeader>
          <AgentRunInteractionStack>
            {actionHistory.map((item) => (
              <RunInteractionActionHistoryItem key={item.id} item={item} />
            ))}
          </AgentRunInteractionStack>
        </AgentRunInteractionSection>
      )}

      {timingEvents.length > 0 && (
        <AgentRunInteractionSection>
          <AgentRunInteractionSectionHeader>
            <AgentRunInteractionSectionTitle>
              <Route size={12} />
              {t('agents.chat.task.timing')}
            </AgentRunInteractionSectionTitle>
          </AgentRunInteractionSectionHeader>
          <AgentRunInteractionStack>
            {timingEvents.map((event) => {
              const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : undefined
              const durationMs = typeof data?.durationMs === 'number' ? data.durationMs : undefined
              const focusTimings = data?.focusTimings && typeof data.focusTimings === 'object'
                ? data.focusTimings as Record<string, unknown>
                : undefined
              const focusMs = typeof focusTimings?.focusMs === 'number' ? focusTimings.focusMs : undefined
              return (
                <AgentRunInteractionRequestCard key={event.id} status="completed">
                  <AgentRunInteractionRequestHeader>
                    <AgentRunInteractionRequestTitle>{event.title}</AgentRunInteractionRequestTitle>
                    {durationMs !== undefined && (
                      <AgentRunInteractionMetaBadge>
                        {Math.round(durationMs)}ms
                      </AgentRunInteractionMetaBadge>
                    )}
                  </AgentRunInteractionRequestHeader>
                  {event.summary && <AgentRunInteractionRequestDetail>{event.summary}</AgentRunInteractionRequestDetail>}
                  {focusMs !== undefined && <AgentRunInteractionRequestSummary>{t('agents.chat.task.focusTotal', { ms: Math.round(focusMs) })}</AgentRunInteractionRequestSummary>}
                </AgentRunInteractionRequestCard>
              )
            })}
          </AgentRunInteractionStack>
        </AgentRunInteractionSection>
      )}
    </AgentRunInteractionRuntimePanel>
  )
}

function RunInteractionActionHistoryItem({ item }: { item: AgentRunActivityTimelineItem }) {
  const actionRecipe = agentRunInteractionActionStatusRecipe(item.status)
  return (
    <AgentRunInteractionRequestCard status={item.status}>
      <AgentRunInteractionRequestHeader>
        <AgentRunInteractionRequestCopy>
          <AgentRunInteractionMarkerDot size="xs" status={item.status} />
          <AgentRunInteractionRequestTitle>{item.title}</AgentRunInteractionRequestTitle>
        </AgentRunInteractionRequestCopy>
        <AgentRunInteractionStatusBadge intent={actionRecipe.intent} emphasis={actionRecipe.emphasis}>
          {item.statusLabel ?? item.status}
        </AgentRunInteractionStatusBadge>
      </AgentRunInteractionRequestHeader>
      {item.summary && <AgentRunInteractionRequestDetail>{item.summary}</AgentRunInteractionRequestDetail>}
    </AgentRunInteractionRequestCard>
  )
}

function runInteractionApprovalSectionTitle(tone: 'pending' | 'approved' | 'rejected' | 'idle', t: ReturnType<typeof useTranslation>['t']): string {
  if (tone === 'approved') return t('agents.chat.task.approvalApprovedSection')
  if (tone === 'rejected') return t('agents.chat.task.approvalRejectedSection')
  return t('agents.chat.task.approvalRequired')
}

function interactionRunStatusLabel(status: AgentRun['status'], t: ReturnType<typeof useTranslation>['t']): string {
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

function inputRunInteractionStatusLabel(status: string, t: ReturnType<typeof useTranslation>['t']): string {
  if (status === 'answered') return t('agents.chat.task.inputAnswered')
  if (status === 'cancelled') return t('agents.chat.task.inputCancelled')
  return t('agents.chat.task.inputPending')
}

function inputAnswerSummaryText(request: PendingInputRequest, t: ReturnType<typeof useTranslation>['t']): string {
  return [
    request.answer?.choiceIds?.length ? t('agents.chat.task.choiceAnswerSummary', { value: inputAnswerChoiceLabels(request).join(', ') }) : undefined,
    request.answer?.text ? t('agents.chat.task.customAnswerSummary', { value: request.answer.text }) : undefined,
  ].filter(Boolean).join(t('agents.chat.task.answerSummarySeparator'))
}

function inputAnswerChoiceLabels(request: PendingInputRequest): string[] {
  return (request.answer?.choiceIds ?? []).map((choiceId) => request.choices.find((choice) => choice.id === choiceId)?.label ?? choiceId)
}
