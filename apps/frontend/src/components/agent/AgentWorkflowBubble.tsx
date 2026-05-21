import React from 'react'
import { Bot } from 'lucide-react'
import { AgentChatMessage } from '@movscript/ui'
import {
  DraftDiff,
  isDraftApplyPreview,
  safeJSONStringify,
} from '@/components/agent/AgentDebugPreviewDialog'
import {
  LocalAgentApprovalRequestCard,
  LocalAgentInputRequestCard,
} from '@/components/agent/localRuntime'
import { formatAgentDividerTime } from '@/lib/agentMessageDivider'
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
  if (!run) return null
  const interactions = workflowInteractions(run)
  if (interactions.length === 0) return null
  return (
    <>
      {interactions.map((interaction) => {
        return (
          <AgentChatMessage
            key={`${run.id}-${interaction.id}`}
            role="assistant"
            avatar={<Bot size={14} />}
            data-agent-divider-label={formatAgentDividerTime(interaction.createdAt)}
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
                approvalDetails={(approval) => localAgentApprovalDetails(approval)}
              />
            )}
          </AgentChatMessage>
        )
      })}
    </>
  )
}

function localAgentApprovalDetails(approval: AgentPendingApprovalRequest) {
  return (
    <>
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
