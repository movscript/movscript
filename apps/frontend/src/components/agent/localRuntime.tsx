import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ListChecks, Loader2, ShieldCheck, Workflow, X } from 'lucide-react'
import { Badge, Button } from '@movscript/ui'
import i18n from '@/i18n'
import { cn } from '@/lib/utils'
import type { AgentRun, AgentThread } from '@/lib/localAgentClient'
import type { ChatRunActivityEvent } from '@/store/agentStore'

type PendingApproval = NonNullable<AgentRun['pendingApprovals']>[number]
type PendingInputRequest = NonNullable<AgentRun['pendingInputRequests']>[number]

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
  className?: string
}

export function formatLocalAgentAssistantContent(run: AgentRun, thread: Pick<AgentThread, 'messages'>) {
  const t = i18n.t.bind(i18n)
  const assistant = thread.messages.find((item) => item.id === run.assistantMessageId)
    ?? [...thread.messages].reverse().find((item) => item.role === 'assistant')
  const pendingApprovals = (run.pendingApprovals ?? []).filter((approval) => approval.status === 'pending')
  const pendingInputs = (run.pendingInputRequests ?? []).filter((request) => request.status === 'pending')
  const content = assistant?.content
    ?? (run.status === 'failed'
      ? t('agents.chat.workflow.failed', { error: run.error ?? t('agents.chat.workflow.unknownError') })
      : run.status === 'cancelled'
        ? t('agents.chat.workflow.cancelledMessage')
        : run.status === 'requires_action'
          ? pendingInputs.length > 0
            ? t('agents.chat.workflow.needsInput', {
              items: pendingInputs.map((request) => `- ${request.title}: ${request.question}`).join('\n'),
            })
            : t('agents.chat.workflow.needsApproval', {
              items: pendingApprovals.map((approval) => `- ${approval.toolName}: ${approval.reason}`).join('\n') || t('agents.chat.workflow.waitingForToolCallConfirmation'),
            })
          : t('agents.chat.workflow.noAssistantMessage'))

  if (run.status !== 'completed_with_warnings' || !run.warnings?.length) return content
  const missing = run.warnings.filter((warning) => !content.includes(warning))
  if (missing.length === 0) return content
  return `${content}\n\n${t('agents.chat.workflow.warnings')}:\n${missing.map((warning) => `- ${warning}`).join('\n')}`
}

export function LocalAgentInputRequestCard({
  request,
  disabled,
  onAnswer,
  sendLabel,
  placeholder,
  className,
}: LocalAgentInputRequestCardProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  return (
    <div className={cn('rounded border border-sky-500/20 bg-background/70 px-2 py-1.5', className)}>
      <div className="font-medium text-foreground">{request.title}</div>
      {request.summary && <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{request.summary}</p>}
      <p className="mt-1 text-[10px] leading-relaxed text-foreground">{request.question}</p>
      {request.choices.length > 0 && (
        <div className="mt-1.5 grid gap-1">
          {request.choices.map((choice) => (
            <Button
              key={choice.id}
              type="button"
              size="xs"
              variant="outline"
              disabled={disabled}
              onClick={() => onAnswer({ choiceIds: [choice.id] })}
              className="h-auto justify-start whitespace-normal px-2 py-1 text-left text-[10px]"
            >
              <span className="min-w-0">
                <span className="block font-medium">{choice.label}</span>
                {choice.description && <span className="block text-[9px] leading-relaxed text-muted-foreground">{choice.description}</span>}
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
            disabled={disabled}
            placeholder={placeholder ?? t('common.inputPlaceholder')}
            className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button
            type="button"
            size="xs"
            variant="secondary"
            disabled={disabled || !text.trim()}
            onClick={() => onAnswer({ text: text.trim() })}
            className="h-7 px-2 text-[10px]"
          >
            {sendLabel ?? t('common.send')}
          </Button>
        </div>
      )}
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

  const pendingApprovals = (run.pendingApprovals ?? []).filter((approval) => approval.status === 'pending')
  const pendingInputs = (run.pendingInputRequests ?? []).filter((request) => request.status === 'pending')
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
    : run.status.replace(/_/g, ' ')
  const showBulkApprovalActions = pendingApprovals.length > 1

  return (
    <div className={cn('mx-1 my-2 rounded-md border border-border bg-background/70 p-2.5 text-xs', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
          <Workflow size={13} />
          <span className="truncate">{title ?? t('agents.chat.workflow.panelTitle')}</span>
        </div>
        <Badge variant={run.status === 'failed' ? 'destructive' : run.status === 'requires_action' ? 'warning' : run.status === 'in_progress' || run.status === 'cancelled' ? 'secondary' : 'outline'} className="shrink-0 text-[9px]">
          {statusLabel}
        </Badge>
      </div>

      {pendingInputs.length > 0 && onAnswerInput && (
        <div className="mb-2 rounded-md border border-sky-500/30 bg-sky-500/10 p-2">
          <div className="mb-1.5 flex min-w-0 items-center gap-1.5 font-medium text-sky-800 dark:text-sky-300">
            <ListChecks size={12} />
            <span className="truncate">{t('agents.chat.workflow.inputRequired')}</span>
          </div>
          <div className="space-y-2">
            {pendingInputs.map((request) => (
              <LocalAgentInputRequestCard
                key={request.id}
                request={request}
                disabled={approving || !onAnswerInput}
                onAnswer={(answer) => onAnswerInput?.(request.id, answer)}
              />
            ))}
          </div>
        </div>
      )}

      {pendingApprovals.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
              <ShieldCheck size={12} />
              <span className="truncate">{t('agents.chat.workflow.approvalRequired')}</span>
            </div>
            {showBulkApprovalActions && (
              <>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => onReject?.(pendingApprovals.map((approval) => approval.id))}
                  disabled={approving || !onReject}
                  className="h-6 shrink-0 px-2 text-[10px] text-muted-foreground hover:text-destructive"
                >
                  <X size={10} />
                  {t('agents.chat.workflow.rejectAll')}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  onClick={() => onApprove?.(pendingApprovals.map((approval) => approval.id))}
                  disabled={approving || !onApprove}
                  className="h-6 shrink-0 px-2 text-[10px]"
                >
                  {approving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                  {t('agents.chat.workflow.approveAll')}
                </Button>
              </>
            )}
          </div>
          <div className="space-y-1">
            {pendingApprovals.map((approval) => (
              <div key={approval.id} className="rounded border border-amber-500/20 bg-background/60 px-2 py-1.5">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-medium text-foreground">{approval.toolName}</span>
                    {approval.risk && (
                      <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">
                        {approval.risk}
                      </Badge>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {onReject && (
                      <Button type="button" size="xs" variant="outline" onClick={() => onReject([approval.id])} disabled={approving} className="h-5 px-1.5 text-[9px]">
                        {t('agents.chat.workflow.reject')}
                      </Button>
                    )}
                    {onApprove && (
                      <Button type="button" size="xs" onClick={() => onApprove([approval.id])} disabled={approving} className="h-5 px-1.5 text-[9px]">
                        {t('agents.chat.workflow.approve')}
                      </Button>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{approval.reason}</p>
                {approvalDetails ? approvalDetails(approval) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {timingEvents.length > 0 && (
        <div className="mt-2 rounded-md border border-sky-500/30 bg-sky-500/10 p-2">
          <div className="mb-1.5 flex items-center gap-1.5 font-medium text-sky-800 dark:text-sky-300">
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
                <div key={event.id} className="rounded border border-sky-500/20 bg-background/60 px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-foreground">{event.title}</span>
                    {durationMs !== undefined && (
                      <Badge variant="outline" className="shrink-0 text-[9px]">
                        {Math.round(durationMs)}ms
                      </Badge>
                    )}
                  </div>
                  {event.summary && <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{event.summary}</p>}
                  {focusMs !== undefined && <p className="mt-0.5 text-[9px] text-muted-foreground/80">{t('agents.chat.workflow.focusTotal', { ms: Math.round(focusMs) })}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
