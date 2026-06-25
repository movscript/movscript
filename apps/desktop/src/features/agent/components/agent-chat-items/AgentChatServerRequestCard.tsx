import { AgentChatContentStack, AgentChatMessage, AgentMessageSection } from '@/shared/ui/AgentMessageUi'
import { Button } from '@movscript/ui/primitives'
import {
  agentChatServerRequestView,
  MOVSCRIPT_DECISION_REQUEST_METHOD,
  type AgentChatServerRequest,
  type AgentChatServerRequestResponse,
} from '@movscript/agent-chat'
import {
  AgentChatMovScriptDecisionForm,
  AgentChatServerRequestAnswerForm,
  AgentChatServerRequestElicitationForm,
  AgentChatServerRequestToolResultForm,
} from '@/features/agent/components/agent-chat-items/AgentChatServerRequestForms'
import {
  AgentChatInspectBlock,
  AgentChatInlineList,
  AgentChatPreviewBlock,
  AgentChatSectionTitle,
} from '@/features/agent/components/agent-chat-items/AgentChatThreadItemBlocks'

export function AgentChatServerRequestCard({
  request,
  onApprove,
  onApproveForSession,
  onApproveWithExecPolicyAmendment,
  onApproveWithNetworkPolicyAmendment,
  onApproveWithStrictAutoReview,
  onAnswer,
  onCancel,
  onReject,
}: {
  request: AgentChatServerRequest
  onApprove: () => void
  onApproveForSession?: () => void
  onApproveWithExecPolicyAmendment?: () => void
  onApproveWithNetworkPolicyAmendment?: (amendmentIndex: number) => void
  onApproveWithStrictAutoReview?: () => void
  onAnswer?: (response: AgentChatServerRequestResponse) => void
  onCancel?: () => void
  onReject: () => void
}) {
  const view = agentChatServerRequestView(request)
  const allowOptions = [
    view.canApproveForSession ? {
      key: 'session',
      label: 'Allow for session',
      onClick: onApproveForSession ?? onApprove,
    } : null,
    view.canApproveWithExecPolicyAmendment ? {
      key: 'exec-policy',
      label: 'Allow similar command',
      onClick: onApproveWithExecPolicyAmendment ?? onApprove,
    } : null,
    ...view.networkPolicyAmendments.map((_, amendmentIndex) => ({
      key: `network-policy:${amendmentIndex}`,
      label: `Allow network policy ${amendmentIndex + 1}`,
      onClick: () => onApproveWithNetworkPolicyAmendment?.(amendmentIndex),
    })),
    view.canApproveWithStrictAutoReview ? {
      key: 'strict-review',
      label: 'Allow with strict review',
      onClick: onApproveWithStrictAutoReview ?? onApprove,
    } : null,
  ].filter((option): option is { key: string; label: string; onClick: () => void } => Boolean(option))
  return (
    <AgentChatMessage
      role="system"
      avatar="!"
      data-testid="agent-chat-server-request"
      actions={(
        <div className="agent-chat-request-actions">
          {view.canReject ? (
            <Button type="button" size="sm" variant="ghost" onClick={onReject}>
              Reject
            </Button>
          ) : null}
          {view.canCancel ? (
            <Button type="button" size="sm" variant="ghost" onClick={onCancel ?? onReject}>
              Cancel
            </Button>
          ) : null}
          {view.canAnswer || view.canElicit || view.canSubmitToolResult ? null : (
            <>
              {allowOptions.length > 0 ? (
                <details className="agent-chat-request-menu">
                  <summary className="agent-chat-request-menu-summary">
                    More allow options
                  </summary>
                  <div
                    role="menu"
                    className="agent-chat-request-menu-content"
                  >
                    {allowOptions.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        role="menuitem"
                        className="agent-chat-request-menu-item"
                        onClick={option.onClick}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </details>
              ) : null}
              <Button type="button" size="sm" onClick={onApprove} disabled={!view.canApprove}>
                {view.canApprove ? 'Allow once' : 'Approve'}
              </Button>
            </>
          )}
        </div>
      )}
    >
      <AgentMessageSection
        title={<AgentChatSectionTitle title={view.title} meta={view.meta} />}
        tone="diagnostic"
      >
        <AgentChatContentStack>
          {view.summary.length > 0 ? <AgentChatInlineList label="Summary" values={view.summary} /> : null}
          {view.argumentDetails !== undefined ? <AgentChatPreviewBlock label="Arguments" value={view.argumentDetails} contentKind="arguments" /> : null}
          {view.canAnswer ? (
            request.method === MOVSCRIPT_DECISION_REQUEST_METHOD ? (
              <AgentChatMovScriptDecisionForm
                request={request}
                onAnswer={(response) => onAnswer?.(response)}
              />
            ) : (
              <AgentChatServerRequestAnswerForm
                request={request}
                onAnswer={(response) => onAnswer?.(response)}
              />
            )
          ) : null}
          {view.canElicit ? (
            <AgentChatServerRequestElicitationForm
              request={request}
              onAnswer={(response) => onAnswer?.(response)}
            />
          ) : null}
          {view.canSubmitToolResult ? (
            <AgentChatServerRequestToolResultForm
              request={request}
              onAnswer={(response) => onAnswer?.(response)}
            />
          ) : null}
          {view.externalUrl ? (
            <a
              href={view.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="agent-chat-request-link"
            >
              Open URL
            </a>
          ) : null}
          <AgentChatInspectBlock entries={[
            { label: 'request', value: view.requestDetails },
          ]} />
        </AgentChatContentStack>
      </AgentMessageSection>
    </AgentChatMessage>
  )
}
