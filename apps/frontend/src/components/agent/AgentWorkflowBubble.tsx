import React from 'react'
import { useTranslation } from 'react-i18next'
import { Bot } from 'lucide-react'
import { AgentChatMessage, Badge } from '@movscript/ui'
import {
  DraftDiff,
  isDraftApplyPreview,
  safeJSONStringify,
} from '@/components/agent/AgentDebugPreviewDialog'
import {
  LocalAgentApprovalRequestCard,
  LocalAgentInputRequestCard,
  localAgentApprovalPermissionText,
} from '@/components/agent/localRuntime'
import type { AgentRun } from '@/lib/localAgentClient'
import type {
  AgentInputAnswer,
  AgentPendingApprovalRequest,
  AgentPendingInputRequest,
} from '@/lib/agentWorkflowInteraction'

type LocalAgentWorkflowInteraction =
  | { id: string; kind: 'input'; createdAt: string; request: AgentPendingInputRequest }
  | { id: string; kind: 'approval'; createdAt: string; approval: AgentPendingApprovalRequest }

export function LocalAgentWorkflowBubble({
  run,
  approving = false,
  onApprove,
  onReject,
  onAnswerInput,
}: {
  run: AgentRun | null
  approving?: boolean
  onApprove?: (approvalIds?: string[]) => void
  onReject?: (approvalIds?: string[]) => void
  onAnswerInput?: (requestId: string, answer: AgentInputAnswer) => void
}) {
  const { t } = useTranslation()
  if (!run) return null
  const interactions = workflowInteractions(run)
  if (interactions.length === 0) return null
  return (
    <>
      {interactions.map((interaction) => {
        const workflowBadge = workflowInteractionBadge(interaction, t)
        return (
          <AgentChatMessage
            key={`${run.id}-${interaction.id}`}
            role="assistant"
            avatar={<Bot size={13} />}
            author="MovScript Agent"
            footer={(
              <Badge variant={workflowBadge.variant} className="type-micro leading-4 px-1.5 py-0">
                {workflowBadge.label}
              </Badge>
            )}
          >
            {interaction.kind === 'input' ? (
              <LocalAgentInputRequestCard
                request={interaction.request}
                disabled={approving || interaction.request.status !== 'pending' || !onAnswerInput}
                onAnswer={(answer) => onAnswerInput?.(interaction.request.id, answer)}
              />
            ) : (
              <LocalAgentApprovalRequestCard
                approval={interaction.approval}
                approving={approving}
                onApprove={onApprove}
                onReject={onReject}
                approvalDetails={(approval) => localAgentApprovalDetails(approval, t)}
              />
            )}
          </AgentChatMessage>
        )
      })}
    </>
  )
}

function localAgentApprovalDetails(approval: AgentPendingApprovalRequest, t: ReturnType<typeof useTranslation>['t']) {
  return (
    <>
      {approval.permission && (
        <p className="mt-0.5 truncate type-micro text-muted-foreground/70">{t('agents.chat.panel.runtime.permission')}: {localAgentApprovalPermissionText(approval.permission, t)}</p>
      )}
      {approval.args && (
        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-1.5 type-micro text-muted-foreground">
          {safeJSONStringify(approval.args)}
        </pre>
      )}
      {(() => {
        const applyPreview = isDraftApplyPreview(approval.preview) ? approval.preview : null
        return applyPreview ? (
          <div className="mt-1 space-y-1">
            <div className="rounded border border-border/70 bg-muted/20 p-1.5 type-micro leading-relaxed text-muted-foreground">
              {applyPreview.review.sideEffect}
            </div>
            <DraftDiff preview={applyPreview} />
          </div>
        ) : null
      })()}
    </>
  )
}

function workflowInteractions(run: AgentRun): LocalAgentWorkflowInteraction[] {
  const approvals = run.pendingApprovals ?? []
  const inputs = run.pendingInputRequests ?? []
  return [
    ...inputs
      .filter((request) => request.status === 'pending' || request.status === 'answered' || request.status === 'cancelled')
      .map((request) => ({
        id: `input-${request.id}`,
        kind: 'input' as const,
        createdAt: request.createdAt,
        request,
      })),
    ...approvals
      .filter((approval) => approval.status === 'pending' || approval.status === 'approved' || approval.status === 'rejected')
      .map((approval) => ({
        id: `approval-${approval.id}`,
        kind: 'approval' as const,
        createdAt: approval.createdAt,
        approval,
      })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

function workflowInteractionBadge(interaction: LocalAgentWorkflowInteraction, t: ReturnType<typeof useTranslation>['t']): { label: string; variant: 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' } {
  if (interaction.kind === 'input') {
    if (interaction.request.status === 'answered') return { label: t('agents.chat.workflow.inputAnswered'), variant: 'success' }
    if (interaction.request.status === 'cancelled') return { label: t('agents.chat.workflow.cancelled'), variant: 'secondary' }
    return { label: t('agents.chat.workflow.waitingForInput'), variant: 'warning' }
  }
  if (interaction.approval.status === 'approved') return { label: t('agents.chat.workflow.approvalApproved'), variant: 'success' }
  if (interaction.approval.status === 'rejected') return { label: t('agents.chat.workflow.approvalRejected'), variant: 'destructive' }
  return { label: t('agents.chat.workflow.waitingForApproval'), variant: 'warning' }
}
