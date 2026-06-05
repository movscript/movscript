import {
  AgentChatContentStack,
  AgentChatMessage,
  AgentMessageSection,
} from '@movscript/ui'
import type { AgentChatThreadItem } from '@/features/agent/domain/agentChatThreadItems'
import {
  agentChatAgentMessageView,
  agentChatHookPromptView,
  agentChatUserMessageView,
} from '@/features/agent/domain/agentChatMessageViews'
import {
  AgentChatImagePreviewGrid,
  AgentChatInlineList,
  AgentChatMediaPreviewGrid,
  AgentChatPreviewBlock,
  AgentChatSectionTitle,
  AgentChatTextBlock,
} from '@/features/agent/components/agent-chat-items/AgentChatThreadItemBlocks'

export function AgentChatUserMessageItem({ item }: { item: Extract<AgentChatThreadItem, { type: 'userMessage' }> }) {
  const view = agentChatUserMessageView(item)
  return (
    <AgentChatMessage role="user" avatar="U" data-testid="agent-chat-user-message">
      <AgentChatContentStack>
        {view.text ? <div className="whitespace-pre-wrap break-words">{view.text}</div> : null}
        {view.textElementSummary.length > 0 ? (
          <AgentChatInlineList label="Text spans" values={view.textElementSummary} />
        ) : null}
        {view.textElementDetails.length > 0 ? (
          <AgentChatPreviewBlock label="Text elements" value={view.textElementDetails} contentKind="rawDetails" />
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
        {view.attachments.length > 0 ? (
          <AgentChatPreviewBlock label="Attachment details" value={view.attachments} contentKind="rawDetails" />
        ) : null}
        {view.rawDetails !== undefined ? (
          <AgentChatPreviewBlock label="User message details" value={view.rawDetails} contentKind="rawDetails" />
        ) : null}
        {!view.text && view.attachments.length === 0 ? <div className="text-muted-foreground">Empty user message</div> : null}
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
          {view.rawDetails !== undefined ? <AgentChatPreviewBlock label="Hook details" value={view.rawDetails} contentKind="rawDetails" /> : null}
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
        <div className="whitespace-pre-wrap break-words">{view.text || (streaming ? '...' : '')}</div>
        {(view.phaseLabel || view.hasMemoryCitation) ? (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {view.phaseLabel ? <span className="rounded border border-border px-2 py-1">{view.phaseLabel}</span> : null}
            {view.hasMemoryCitation ? <span className="rounded border border-border px-2 py-1">memory citation</span> : null}
          </div>
        ) : null}
        {view.memoryCitationSummary.length > 0 ? (
          <AgentChatInlineList label="Memory citations" values={view.memoryCitationSummary} />
        ) : null}
        {view.memoryCitationDetails ? (
          <AgentChatPreviewBlock label="Memory citation details" value={view.memoryCitationDetails} contentKind="rawDetails" />
        ) : null}
        {view.rawDetails !== undefined ? (
          <AgentChatPreviewBlock label="Message details" value={view.rawDetails} contentKind="rawDetails" />
        ) : null}
      </AgentChatContentStack>
    </AgentChatMessage>
  )
}
