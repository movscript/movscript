import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronLeft, ChevronRight, ListChecks, Loader2, ShieldCheck, Route, X } from 'lucide-react'
import {
  AgentRunInteractionActionButton, AgentRunInteractionMarkerDot, AgentRunInteractionMetaBadge, AgentRunInteractionRequestCard, AgentRunInteractionRequestCopy, AgentRunInteractionRequestDetail, AgentRunInteractionRequestHeader, AgentRunInteractionRequestSummary, AgentRunInteractionRequestTitle, AgentRunInteractionProviderSessionHeader, AgentRunInteractionProviderSessionPanel, AgentRunInteractionProviderSessionStatusBadge, AgentRunInteractionProviderSessionTitle, AgentRunInteractionSection, AgentRunInteractionSectionActions, AgentRunInteractionSectionHeader, AgentRunInteractionSectionTitle, AgentRunInteractionStack, AgentRunInteractionStatusBadge, } from '@/features/agent/components/run-interaction-ui'
import { buildAgentRunActivityTimeline, AgentRunActivityTimelineItem } from '@/features/agent/presentation/agentRunActivityTimeline'
import { agentRunStatusRecipe, agentRunInteractionActionStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import {
  clampPage, interactionRunStatusLabel, runInteractionApprovalSectionTitle, ProviderSessionApprovalRequest, } from '@/features/agent/presentation/providerSessionInteractionsModel'
import type { AgentRun } from '@movscript/agent-protocol'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import {
  ProviderSessionApprovalRequestCard,
  ProviderSessionInputRequestCard,
} from '@/features/agent/components/ProviderSessionRequestCards'

export { formatProviderSessionAssistantContent } from '@/features/agent/domain/providerSessionResult'
export {
  providerSessionApprovalImpactText,
  providerSessionApprovalPermissionText,
  providerSessionApprovalRiskText,
  providerSessionApprovalStatusText,
} from '@/features/agent/presentation/providerSessionInteractionsModel'
export type {
  ProviderSessionApprovalRequest,
  ProviderSessionInputRequest,
} from '@/features/agent/presentation/providerSessionInteractionsModel'
export {
  ProviderSessionApprovalRequestCard,
  ProviderSessionInputRequestCard,
} from '@/features/agent/components/ProviderSessionRequestCards'
export type {
  ProviderSessionApprovalRequestCardProps,
  ProviderSessionInputRequestCardProps,
} from '@/features/agent/components/ProviderSessionRequestCards'

type PendingApproval = ProviderSessionApprovalRequest
export interface ProviderSessionRunInteractionPanelProps {
  run: AgentRun | null
  approving?: boolean
  title?: ReactNode
  events?: ChatRunActivityEvent[]
  onApprove?: (approvalIds?: string[]) => void
  onApproveForSession?: (approvalIds?: string[]) => void
  onReject?: (approvalIds?: string[]) => void
  onAnswerInput?: (requestId: string, answer: { choiceIds?: string[]; text?: string }) => void
  approvalDetails?: (approval: PendingApproval) => ReactNode
}

export function ProviderSessionRunInteractionPanel({
  run,
  approving = false,
  title,
  events = [],
  onApprove,
  onApproveForSession,
  onReject,
  onAnswerInput,
  approvalDetails,
}: ProviderSessionRunInteractionPanelProps) {
  const { t } = useTranslation()
  const [inputPage, setInputPage] = useState(0)
  const [approvalPage, setApprovalPage] = useState(0)

  const actionApprovals = (run?.pendingApprovals ?? []).filter((approval) => approval.status === 'pending' || approval.status === 'approved' || approval.status === 'rejected')
  const pendingApprovals = actionApprovals.filter((approval) => approval.status === 'pending')
  const actionInputs = (run?.pendingInputRequests ?? []).filter((request) => request.status === 'pending' || request.status === 'answered' || request.status === 'cancelled')
  const pendingInputs = actionInputs.filter((request) => request.status === 'pending')
  const pendingActionItemIds = new Set([
    ...actionApprovals.map((approval) => `approval-${approval.id}`),
    ...actionInputs.map((request) => `input-${request.id}`),
  ])
  const actionHistory = (run ? buildAgentRunActivityTimeline({ run, events })?.items ?? [] : [])
    .filter((item) => (item.type === 'approval' || item.type === 'input_request') && !pendingActionItemIds.has(item.id))
  const hasSettledApprovals = actionApprovals.some((approval) => approval.status === 'approved' || approval.status === 'rejected')
  const approvalTone = pendingApprovals.length > 0
    ? 'pending'
    : actionApprovals.some((approval) => approval.status === 'rejected')
      ? 'rejected'
      : hasSettledApprovals ? 'approved' : 'idle'
  const traceEvents = [...(run?.traceEvents ?? []), ...events]
  const timingEvents = traceEvents.filter((event) => {
    const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : undefined
    return typeof data?.durationMs === 'number'
      || (typeof event.title === 'string' && /timing|setup complete|resolved/i.test(event.title))
  })
  const statusLabel = run?.status === 'requires_action'
    ? pendingInputs.length > 0 ? t('agents.chat.task.waitingForInput') : t('agents.chat.task.waitingForApproval')
    : run?.status === 'cancelled'
      ? t('agents.chat.task.cancelled')
    : run ? interactionRunStatusLabel(run.status, t) : ''
  const showBulkApprovalActions = pendingApprovals.length > 1
  const runStatusRecipe = agentRunStatusRecipe(run?.status ?? 'queued')
  const safeInputPage = clampPage(inputPage, actionInputs.length)
  const safeApprovalPage = clampPage(approvalPage, actionApprovals.length)
  const visibleInput = actionInputs[safeInputPage]
  const visibleApproval = actionApprovals[safeApprovalPage]

  useEffect(() => {
    if (inputPage !== safeInputPage) setInputPage(safeInputPage)
  }, [inputPage, safeInputPage])

  useEffect(() => {
    if (approvalPage !== safeApprovalPage) setApprovalPage(safeApprovalPage)
  }, [approvalPage, safeApprovalPage])

  if (!run) return null

  return (
    <AgentRunInteractionProviderSessionPanel>
      <AgentRunInteractionProviderSessionHeader>
        <AgentRunInteractionProviderSessionTitle>
          <Route size={14} />
          {title ?? t('agents.chat.task.panelTitle')}
        </AgentRunInteractionProviderSessionTitle>
        <AgentRunInteractionProviderSessionStatusBadge intent={runStatusRecipe.intent} emphasis={runStatusRecipe.emphasis}>
          {statusLabel}
        </AgentRunInteractionProviderSessionStatusBadge>
      </AgentRunInteractionProviderSessionHeader>

      {actionInputs.length > 0 && onAnswerInput && (
        <AgentRunInteractionSection>
          <AgentRunInteractionSectionHeader>
            <AgentRunInteractionSectionTitle>
              <ListChecks size={12} />
              {t('agents.chat.task.inputRequired')}
            </AgentRunInteractionSectionTitle>
            <RunInteractionPager
              visible={actionInputs.length > 1}
              page={safeInputPage}
              pageCount={actionInputs.length}
              previousLabel={t('agents.chat.task.previousInput', { defaultValue: '上一条输入请求' })}
              nextLabel={t('agents.chat.task.nextInput', { defaultValue: '下一条输入请求' })}
              onPageChange={setInputPage}
            />
          </AgentRunInteractionSectionHeader>
          {visibleInput && (
            <AgentRunInteractionStack>
              <ProviderSessionInputRequestCard
                key={visibleInput.id}
                request={visibleInput}
                disabled={approving || visibleInput.status !== 'pending' || !onAnswerInput}
                onAnswer={(answer) => onAnswerInput?.(visibleInput.id, answer)}
              />
            </AgentRunInteractionStack>
          )}
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
            <RunInteractionPager
              visible={actionApprovals.length > 1}
              page={safeApprovalPage}
              pageCount={actionApprovals.length}
              previousLabel={t('agents.chat.task.previousApproval', { defaultValue: '上一条审批请求' })}
              nextLabel={t('agents.chat.task.nextApproval', { defaultValue: '下一条审批请求' })}
              onPageChange={setApprovalPage}
            />
          </AgentRunInteractionSectionHeader>
          {visibleApproval && (
            <AgentRunInteractionStack>
              <ProviderSessionApprovalRequestCard
                key={visibleApproval.id}
                approval={visibleApproval}
                approving={approving}
                onApprove={onApprove}
                onApproveForSession={onApproveForSession}
                onReject={onReject}
                approvalDetails={approvalDetails}
              />
            </AgentRunInteractionStack>
          )}
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
    </AgentRunInteractionProviderSessionPanel>
  )
}

function RunInteractionPager({
  visible,
  page,
  pageCount,
  previousLabel,
  nextLabel,
  onPageChange,
}: {
  visible: boolean
  page: number
  pageCount: number
  previousLabel: string
  nextLabel: string
  onPageChange: (page: number) => void
}) {
  if (!visible) return null
  const previousPage = Math.max(0, page - 1)
  const nextPage = Math.min(pageCount - 1, page + 1)
  return (
    <AgentRunInteractionSectionActions>
      <button
        type="button"
        className="agent-run-interaction-pager__button"
        disabled={page <= 0}
        onClick={() => onPageChange(previousPage)}
        aria-label={previousLabel}
        title={previousLabel}
      >
        <ChevronLeft size={12} />
      </button>
      <span className="agent-run-interaction-pager__count">{page + 1}/{pageCount}</span>
      <button
        type="button"
        className="agent-run-interaction-pager__button"
        disabled={page >= pageCount - 1}
        onClick={() => onPageChange(nextPage)}
        aria-label={nextLabel}
        title={nextLabel}
      >
        <ChevronRight size={12} />
      </button>
    </AgentRunInteractionSectionActions>
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
