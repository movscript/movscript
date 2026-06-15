import { AgentChatContentStack, AgentChatMessage, AgentMessageSection } from '@movscript/ui/business/agent'
import {
  type AgentChatThreadItem,
  agentChatAgentMessageView,
  agentChatHookPromptView,
  agentChatUserMessageView,
} from '@movscript/core/agent/chat'
import {
  AgentChatImagePreviewGrid,
  AgentChatInspectBlock,
  AgentChatInlineList,
  AgentChatMediaPreviewGrid,
  AgentChatSectionTitle,
  AgentChatTextBlock,
} from '@/features/agent/components/agent-chat-items/AgentChatThreadItemBlocks'

export function AgentChatUserMessageItem({ item }: { item: Extract<AgentChatThreadItem, { type: 'userMessage' }> }) {
  const view = agentChatUserMessageView(item)
  return (
    <AgentChatMessage role="user" avatar="U" data-testid="agent-chat-user-message">
      <AgentChatContentStack>
        {view.text ? <div className="ms-agent-chat-message-text">{view.text}</div> : null}
        {view.textElementSummary.length > 0 ? (
          <AgentChatInlineList label="Text spans" values={view.textElementSummary} />
        ) : null}
        {view.imageAttachments.length > 0 ? (
          <AgentChatImagePreviewGrid
            label="Image attachments"
            images={view.imageAttachments}
          />
        ) : null}
        {view.mediaAttachments.length > 0 ? (
          <AgentChatMediaPreviewGrid label="Media attachments" media={view.mediaAttachments} />
        ) : null}
        {view.attachments.length > 0 ? (
          <AgentChatInlineList label="Attachments" values={view.attachmentLabels} />
        ) : null}
        <AgentChatInspectBlock entries={[
          view.textElementDetails.length > 0 ? { label: 'textElements', value: view.textElementDetails } : null,
          view.attachments.length > 0 ? { label: 'attachments', value: view.attachments } : null,
          view.rawDetails !== undefined ? { label: 'message', value: view.rawDetails } : null,
        ]} />
        {!view.text && view.attachments.length === 0 ? <div className="ms-agent-chat-empty-text">Empty user message</div> : null}
      </AgentChatContentStack>
    </AgentChatMessage>
  )
}

export function AgentChatHookPromptItem({ item }: { item: Extract<AgentChatThreadItem, { type: 'hookPrompt' }> }) {
  const view = agentChatHookPromptView(item)
  return (
    <AgentChatMessage role="system" avatar="H">
      <AgentMessageSection title={<AgentChatSectionTitle title="Hook prompt" meta={view.meta} />} tone="process">
        <AgentChatContentStack>
          {view.hookRunIds.length ? <AgentChatInlineList label="Hook runs" values={view.hookRunIds} /> : null}
          {view.text ? <AgentChatTextBlock label="Prompt" value={view.text} tone="process" contentKind="prompt" /> : null}
        </AgentChatContentStack>
      </AgentMessageSection>
    </AgentChatMessage>
  )
}

export function AgentChatAgentMessageItem({ item, streaming }: { item: Extract<AgentChatThreadItem, { type: 'agentMessage' }>; streaming?: boolean }) {
  const view = agentChatAgentMessageView(item)
  return (
    <AgentChatMessage role="assistant" avatar="AI" data-testid="agent-chat-agent-message">
      <AgentChatContentStack>
        <div className="ms-agent-chat-message-text">{view.text || (streaming ? '...' : '')}</div>
        {(view.phaseLabel || view.hasMemoryCitation) ? (
          <div className="ms-agent-chat-chip-row">
            {view.phaseLabel ? <span className="ms-agent-chat-chip">{view.phaseLabel}</span> : null}
            {view.hasMemoryCitation ? <span className="ms-agent-chat-chip">memory citation</span> : null}
          </div>
        ) : null}
        {view.memoryCitationSummary.length > 0 ? (
          <AgentChatInlineList label="Memory citations" values={view.memoryCitationSummary} />
        ) : null}
        <AgentChatInspectBlock entries={[
          view.memoryCitationDetails ? { label: 'memoryCitations', value: view.memoryCitationDetails } : null,
          view.rawDetails !== undefined ? { label: 'message', value: view.rawDetails } : null,
        ]} />
      </AgentChatContentStack>
    </AgentChatMessage>
  )
}
