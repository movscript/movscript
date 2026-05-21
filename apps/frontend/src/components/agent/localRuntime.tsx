import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ListChecks, Loader2, ShieldCheck, Workflow, X } from 'lucide-react'
import { Badge, Button } from '@movscript/ui'
import { cn } from '@/lib/utils'
import { buildAgentRunTimeline, type AgentTimelineItem } from '@/lib/agentTimeline'
import { approvalImpactLabel, runStatusLabel } from '@/lib/agentRunUi'
import { agentPermissionLabel, agentRiskLabel, agentToolNameLabel } from '@/lib/agentToolDisplay'
import type { AgentRun } from '@/lib/localAgentClient'
import type { ChatRunActivityEvent } from '@/store/agentStore'

export { formatLocalAgentAssistantContent } from '@/lib/localAgentResult'

type PendingApproval = NonNullable<AgentRun['pendingApprovals']>[number]
type PendingInputRequest = NonNullable<AgentRun['pendingInputRequests']>[number]
type ApprovalLike = Pick<PendingApproval, 'toolName' | 'risk' | 'permission' | 'preview'>

export interface LocalAgentWorkflowPanelProps {
  run: AgentRun | null
  approving?: boolean
  title?: ReactNode
  className?: string
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
  className?: string
}

export interface LocalAgentApprovalRequestCardProps {
  approval: PendingApproval
  approving?: boolean
  onApprove?: (approvalIds?: string[]) => void
  onReject?: (approvalIds?: string[]) => void
  approvalDetails?: (approval: PendingApproval) => ReactNode
  className?: string
}

export function localAgentApprovalImpactText(approval: ApprovalLike, t?: ReturnType<typeof useTranslation>['t']): string {
  if (t) return localAgentApprovalImpactI18nText(approval, t)
  return approvalImpactLabel(approval)
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
    case 'movscript_create_generation_job':
      return t('agents.chat.workflow.approvalImpact.generationCreate')
    case 'movscript_cancel_generation_job':
      return t('agents.chat.workflow.approvalImpact.generationCancel')
    case 'movscript_create_project':
      return t('agents.chat.workflow.approvalImpact.projectCreate')
    case 'movscript_delete_memory':
      return t('agents.chat.workflow.approvalImpact.memoryDelete')
    case 'movscript_spawn_subagent':
      return t('agents.chat.workflow.approvalImpact.subagentSpawn')
    case 'movscript_cancel_subagent':
      return t('agents.chat.workflow.approvalImpact.subagentCancel')
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
  className,
}: LocalAgentInputRequestCardProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const answered = request.status === 'answered'
  const controlsDisabled = disabled || request.status !== 'pending'
  const selectedChoiceIds = new Set(request.answer?.choiceIds ?? [])
  return (
    <div className={cn('min-h-28 rounded-md border border-border bg-background/70 px-2 py-1.5 shadow-sm', request.status === 'answered' && 'border-green-500/25', className)}>
      <div className="flex flex-wrap items-center gap-1">
        <div className="font-medium text-foreground">{request.title}</div>
        {meta}
        {request.status !== 'pending' && (
          <Badge variant={request.status === 'answered' ? 'success' : 'outline'} className="h-4 shrink-0 px-1 type-micro">
            {inputWorkflowStatusLabel(request.status, t)}
          </Badge>
        )}
      </div>
      <p className={cn('mt-0.5 min-h-4 type-tiny leading-relaxed text-muted-foreground', !request.summary && 'invisible')} aria-hidden={!request.summary}>
        {request.summary ?? ''}
      </p>
      <p className="mt-1 type-tiny leading-relaxed text-foreground">{request.question}</p>
      {request.choices.length > 0 && (
        <div className="mt-1.5 grid gap-1">
          {request.choices.map((choice) => (
            <Button
              key={choice.id}
              type="button"
              size="xs"
              variant={selectedChoiceIds.has(choice.id) ? 'secondary' : 'outline'}
              disabled={controlsDisabled}
              onClick={() => onAnswer({ choiceIds: [choice.id] })}
              data-testid="agent-run-input-choice"
              aria-label={t('agents.chat.workflow.answerChoiceAria', { title: request.title, choice: choice.label })}
              className={cn('h-auto justify-start whitespace-normal px-2 py-1 text-left type-tiny', selectedChoiceIds.has(choice.id) && 'border-green-500/30 bg-green-500/10 text-green-900 dark:text-green-200')}
            >
              <span className="min-w-0">
                <span className="block font-medium">{choice.label}</span>
                {choice.description && <span className="block type-micro leading-relaxed text-muted-foreground">{choice.description}</span>}
              </span>
            </Button>
          ))}
        </div>
      )}
      {(request.allowCustomAnswer || request.inputType === 'text') && (
        <div className="mt-1.5 flex items-center gap-1">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={controlsDisabled}
            placeholder={placeholder ?? t('common.inputPlaceholder')}
            data-testid="agent-run-input-text"
            aria-label={t('agents.chat.workflow.answerCustomAria', { title: request.title })}
            className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 type-tiny outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={controlsDisabled || !text.trim()}
            onClick={() => onAnswer({ text: text.trim() })}
            data-testid="agent-run-input-submit"
            aria-label={t('agents.chat.workflow.submitCustomAria', { title: request.title })}
            className="px-2 type-tiny"
          >
            {sendLabel ?? t('common.send')}
          </Button>
        </div>
      )}
      {answered && inputAnswerSummaryText(request, t) && (
        <p className="mt-1.5 rounded border border-green-500/20 bg-green-500/10 px-2 py-1 type-tiny leading-relaxed text-green-800 dark:text-green-300">
          {inputAnswerSummaryText(request, t)}
        </p>
      )}
    </div>
  )
}

export function LocalAgentApprovalRequestCard({
  approval,
  approving,
  onApprove,
  onReject,
  approvalDetails,
  className,
}: LocalAgentApprovalRequestCardProps) {
  const { t } = useTranslation()
  const isPending = approval.status === 'pending'
  return (
    <div data-runtime-approving={approving ? 'true' : undefined} className={cn('rounded border bg-background/70 px-2 py-1.5', workflowApprovalItemClass(approval.status), className)}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium text-foreground" title={approval.toolName}>{agentToolNameLabel(approval.toolName, t)}</span>
          {approval.risk && (
            <Badge variant="outline" className="h-4 shrink-0 px-1 type-micro">
              {localAgentApprovalRiskText(approval.risk, t)}
            </Badge>
          )}
          {approval.permission && (
            <Badge variant="outline" className="h-4 shrink-0 px-1 type-micro">
              {localAgentApprovalPermissionText(approval.permission, t)}
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isPending ? (
            <>
              {onReject && (
                <Button type="button" size="xs" variant="outline" onClick={() => onReject([approval.id])} className="px-1.5 type-micro">
                  {t('agents.chat.workflow.reject')}
                </Button>
              )}
              {onApprove && (
                <Button type="button" size="xs" onClick={() => onApprove([approval.id])} className="px-1.5 type-micro">
                  {t('agents.chat.workflow.approve')}
                </Button>
              )}
            </>
          ) : (
            <Badge variant={approval.status === 'approved' ? 'success' : 'destructive'} className="h-5 shrink-0 px-1.5 type-micro">
              {approval.status === 'approved' ? t('agents.chat.workflow.approvalApproved') : t('agents.chat.workflow.approvalRejected')}
            </Badge>
          )}
        </div>
      </div>
      <p className="mt-1 type-tiny leading-relaxed text-muted-foreground">{approval.reason}</p>
      <div className={cn('mt-1 rounded border px-1.5 py-1 type-tiny leading-relaxed', workflowApprovalImpactClass(approval.status))}>
        <span className="font-medium">{t('agents.chat.workflow.approvalImpact.label')}: </span>
        {localAgentApprovalImpactText(approval, t)}
      </div>
      {approvalDetails ? approvalDetails(approval) : null}
    </div>
  )
}

export function LocalAgentWorkflowPanel({
  run,
  approving = false,
  title,
  className,
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

  return (
    <div className={cn('mx-1 my-2 rounded-md border border-border bg-background/70 p-2.5 type-label', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
          <Workflow size={13} />
          <span className="truncate">{title ?? t('agents.chat.workflow.panelTitle')}</span>
        </div>
        <Badge variant={run.status === 'failed' ? 'destructive' : run.status === 'requires_action' ? 'warning' : run.status === 'in_progress' || run.status === 'cancelled' ? 'secondary' : 'outline'} className="shrink-0 type-micro">
          {statusLabel}
        </Badge>
      </div>

      {actionInputs.length > 0 && onAnswerInput && (
        <div className="mb-2 rounded-md border border-border bg-muted/20 p-2">
          <div className="mb-1.5 flex min-w-0 items-center gap-1.5 font-medium text-foreground">
            <ListChecks size={12} />
            <span className="truncate">{t('agents.chat.workflow.inputRequired')}</span>
          </div>
          <div className="space-y-2">
            {actionInputs.map((request) => (
              <LocalAgentInputRequestCard
                key={request.id}
                request={request}
                disabled={approving || request.status !== 'pending' || !onAnswerInput}
                onAnswer={(answer) => onAnswerInput?.(request.id, answer)}
              />
            ))}
          </div>
        </div>
      )}

      {actionApprovals.length > 0 && (
        <div className={cn('rounded-md border p-2', workflowApprovalSectionClass(approvalTone))}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className={cn('flex min-w-0 items-center gap-1.5 font-medium', workflowApprovalTitleClass(approvalTone))}>
              <ShieldCheck size={12} />
              <span className="truncate">{workflowApprovalSectionTitle(approvalTone, t)}</span>
            </div>
            <div className={cn('flex shrink-0 items-center gap-1', !showBulkApprovalActions && 'invisible')}>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => onReject?.(pendingApprovals.map((approval) => approval.id))}
                disabled={!showBulkApprovalActions || approving || !onReject}
                className="shrink-0 px-2 type-tiny text-muted-foreground hover:text-destructive"
              >
                <X size={10} />
                {t('agents.chat.workflow.rejectAll')}
              </Button>
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => onApprove?.(pendingApprovals.map((approval) => approval.id))}
                disabled={!showBulkApprovalActions || approving || !onApprove}
                className="shrink-0 px-2 type-tiny"
              >
                {approving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                {t('agents.chat.workflow.approveAll')}
              </Button>
            </div>
          </div>
          <div className="space-y-1">
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
          </div>
        </div>
      )}

      {actionHistory.length > 0 && (
        <div className="mt-2 rounded-md border border-border/70 bg-muted/20 p-2">
          <div className="mb-1.5 flex min-w-0 items-center gap-1.5 font-medium text-foreground">
            <ListChecks size={12} />
            <span className="truncate">{t('agents.chat.workflow.interactionHistory')}</span>
          </div>
          <div className="space-y-1">
            {actionHistory.map((item) => (
              <WorkflowActionHistoryItem key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {timingEvents.length > 0 && (
        <div className="mt-2 rounded-md border border-border bg-muted/20 p-2">
          <div className="mb-1.5 flex items-center gap-1.5 font-medium text-foreground">
            <Workflow size={12} />
            <span className="truncate">{t('agents.chat.workflow.timing')}</span>
          </div>
          <div className="space-y-1">
            {timingEvents.map((event) => {
              const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : undefined
              const durationMs = typeof data?.durationMs === 'number' ? data.durationMs : undefined
              const focusTimings = data?.focusTimings && typeof data.focusTimings === 'object'
                ? data.focusTimings as Record<string, unknown>
                : undefined
              const focusMs = typeof focusTimings?.focusMs === 'number' ? focusTimings.focusMs : undefined
              return (
                <div key={event.id} className="rounded border border-border/70 bg-background/70 px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-foreground">{event.title}</span>
                    {durationMs !== undefined && (
                      <Badge variant="outline" className="shrink-0 type-micro">
                        {Math.round(durationMs)}ms
                      </Badge>
                    )}
                  </div>
                  {event.summary && <p className="mt-0.5 type-tiny leading-relaxed text-muted-foreground">{event.summary}</p>}
                  {focusMs !== undefined && <p className="mt-0.5 type-micro text-muted-foreground/80">{t('agents.chat.workflow.focusTotal', { ms: Math.round(focusMs) })}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function WorkflowActionHistoryItem({ item }: { item: AgentTimelineItem }) {
  return (
    <div className="rounded border border-border/70 bg-background/70 px-2 py-1.5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', workflowActionDotClass(item.status))} />
          <span className="truncate type-tiny font-medium text-foreground">{item.title}</span>
        </div>
        <Badge variant={workflowActionBadgeVariant(item.status)} className="shrink-0 type-micro">
          {item.statusLabel ?? item.status}
        </Badge>
      </div>
      {item.summary && <p className="mt-0.5 type-tiny leading-relaxed text-muted-foreground">{item.summary}</p>}
    </div>
  )
}

function workflowActionBadgeVariant(status: string): 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' {
  if (status === 'approved' || status === 'answered' || status === 'completed') return 'success'
  if (status === 'rejected' || status === 'cancelled' || status === 'failed') return 'destructive'
  if (status === 'pending' || status === 'in_progress') return 'warning'
  return 'outline'
}

function workflowActionDotClass(status: string): string {
  if (status === 'approved' || status === 'answered' || status === 'completed') return 'bg-green-500'
  if (status === 'rejected' || status === 'cancelled' || status === 'failed') return 'bg-destructive'
  return 'bg-amber-500'
}

function workflowApprovalSectionTitle(tone: 'pending' | 'approved' | 'rejected' | 'idle', t: ReturnType<typeof useTranslation>['t']): string {
  if (tone === 'approved') return t('agents.chat.workflow.approvalApprovedSection')
  if (tone === 'rejected') return t('agents.chat.workflow.approvalRejectedSection')
  return t('agents.chat.workflow.approvalRequired')
}

function workflowApprovalSectionClass(tone: 'pending' | 'approved' | 'rejected' | 'idle'): string {
  if (tone === 'approved') return 'border-green-500/25 bg-background/70'
  if (tone === 'rejected') return 'border-destructive/25 bg-background/70'
  return 'border-border bg-muted/20'
}

function workflowApprovalTitleClass(tone: 'pending' | 'approved' | 'rejected' | 'idle'): string {
  if (tone === 'approved') return 'text-green-800 dark:text-green-300'
  if (tone === 'rejected') return 'text-destructive'
  return 'text-foreground'
}

function workflowApprovalImpactClass(status: string): string {
  if (status === 'approved') return 'border-green-500/20 bg-green-500/10 text-green-900 dark:text-green-200'
  if (status === 'rejected') return 'border-destructive/20 bg-destructive/10 text-destructive'
  return 'border-border/70 bg-background/70 text-muted-foreground'
}

function workflowApprovalItemClass(status: string): string {
  if (status === 'approved') return 'border-green-500/20'
  if (status === 'rejected') return 'border-destructive/20'
  return 'border-border/70'
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
