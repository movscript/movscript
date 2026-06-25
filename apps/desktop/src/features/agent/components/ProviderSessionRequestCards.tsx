import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AgentRunInteractionActionButton,
  AgentRunInteractionAnswerText,
  AgentRunInteractionChoiceButton,
  AgentRunInteractionImpactLabel,
  AgentRunInteractionImpactText,
  AgentRunInteractionMetaBadge,
  AgentRunInteractionRequestActions,
  AgentRunInteractionRequestCard,
  AgentRunInteractionRequestCopy,
  AgentRunInteractionRequestDetail,
  AgentRunInteractionRequestHeader,
  AgentRunInteractionRequestPrompt,
  AgentRunInteractionRequestSummary,
  AgentRunInteractionRequestTitle,
  AgentRunInteractionStack,
  AgentRunInteractionStateBadge,
  AgentRunInteractionTextInput,
} from '@/features/agent/components/run-interaction-ui'
import {
  inputAnswerSummaryText,
  inputRunInteractionStatusLabel,
  providerSessionApprovalImpactText,
  providerSessionApprovalPermissionText,
  providerSessionApprovalReason,
  providerSessionApprovalRiskText,
  providerSessionApprovalStatusText,
  providerSessionApprovalTitle,
  type ProviderSessionApprovalRequest,
  type ProviderSessionInputRequest,
} from '@/features/agent/presentation/providerSessionInteractionsModel'

export interface ProviderSessionInputRequestCardProps {
  request: ProviderSessionInputRequest
  disabled?: boolean
  onAnswer: (answer: { choiceIds?: string[]; text?: string }) => void
  sendLabel?: string
  placeholder?: string
  meta?: ReactNode
}

export interface ProviderSessionApprovalRequestCardProps {
  approval: ProviderSessionApprovalRequest
  approving?: boolean
  onApprove?: (approvalIds?: string[]) => void
  onApproveForSession?: (approvalIds?: string[]) => void
  onReject?: (approvalIds?: string[]) => void
  approvalDetails?: (approval: ProviderSessionApprovalRequest) => ReactNode
}

export function ProviderSessionInputRequestCard({
  request,
  disabled,
  onAnswer,
  sendLabel,
  placeholder,
  meta,
}: ProviderSessionInputRequestCardProps) {
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

export function ProviderSessionApprovalRequestCard({
  approval,
  approving,
  onApprove,
  onApproveForSession,
  onReject,
  approvalDetails,
}: ProviderSessionApprovalRequestCardProps) {
  const { t } = useTranslation()
  const isPending = approval.status === 'pending'
  const approvalTitle = providerSessionApprovalTitle(approval, t)
  const approvalReason = providerSessionApprovalReason(approval, t)
  return (
    <AgentRunInteractionRequestCard status={approval.status} approving={approving}>
      <AgentRunInteractionRequestHeader>
        <AgentRunInteractionRequestCopy>
          <AgentRunInteractionRequestTitle title={approvalTitle}>{approvalTitle}</AgentRunInteractionRequestTitle>
          {approval.risk && (
            <AgentRunInteractionMetaBadge>
              {providerSessionApprovalRiskText(approval.risk, t)}
            </AgentRunInteractionMetaBadge>
          )}
          {approval.permission && (
            <AgentRunInteractionMetaBadge>
              {providerSessionApprovalPermissionText(approval.permission, t)}
            </AgentRunInteractionMetaBadge>
          )}
        </AgentRunInteractionRequestCopy>
        <AgentRunInteractionRequestActions>
          <AgentRunInteractionStateBadge status={approval.status}>
            {providerSessionApprovalStatusText(approval.status, t)}
          </AgentRunInteractionStateBadge>
          {isPending ? (
            <>
              {onReject && (
                <AgentRunInteractionActionButton type="button" size="xs" variant="ghost" actionTone="reject" onClick={() => onReject([approval.id])}>
                  {t('agents.chat.task.reject')}
                </AgentRunInteractionActionButton>
              )}
              {onApproveForSession && (
                <AgentRunInteractionActionButton type="button" size="xs" variant="soft" onClick={() => onApproveForSession([approval.id])}>
                  {t('agents.chat.task.approveForSession', { defaultValue: '本会话允许' })}
                </AgentRunInteractionActionButton>
              )}
              {onApprove && (
                <AgentRunInteractionActionButton type="button" size="xs" onClick={() => onApprove([approval.id])}>
                  {t('agents.chat.task.approveOnce', { defaultValue: '允许本次' })}
                </AgentRunInteractionActionButton>
              )}
            </>
          ) : null}
        </AgentRunInteractionRequestActions>
      </AgentRunInteractionRequestHeader>
      {approvalReason && <AgentRunInteractionRequestDetail>{approvalReason}</AgentRunInteractionRequestDetail>}
      <AgentRunInteractionImpactText status={approval.status}>
        <AgentRunInteractionImpactLabel>{t('agents.chat.task.approvalImpact.label')}: </AgentRunInteractionImpactLabel>
        {providerSessionApprovalImpactText(approval, t)}
      </AgentRunInteractionImpactText>
      {approvalDetails ? approvalDetails(approval) : null}
    </AgentRunInteractionRequestCard>
  )
}
