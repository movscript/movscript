import {
  AgentChatContentStack,
  AgentChatMessage,
  AgentMessageSection,
} from '@movscript/ui'
import type { AgentChatThreadItem } from '@/features/agent/domain/agentChatThreadItems'
import {
  AgentChatInlineList,
  AgentChatPreviewBlock,
  AgentChatSectionTitle,
  AgentChatTextBlock,
} from '@/features/agent/components/agent-chat-items/AgentChatThreadItemBlocks'
import { agentChatSystemItemView } from '@/features/agent/domain/agentChatSystemItemViews'

export function AgentChatSystemItem({ item }: { item: Extract<AgentChatThreadItem, { type: 'reviewMode' | 'systemNotice' | 'approvalReview' | 'contextCompaction' | 'unknown' }> }) {
  const view = agentChatSystemItemView(item)
  return (
    <AgentChatMessage role="system" avatar="i">
      <AgentMessageSection title={<AgentChatSectionTitle title={view.title} meta={view.meta} />} tone={view.tone}>
        <AgentChatContentStack>
          {view.detail ? <AgentChatTextBlock label="Details" value={view.detail} tone={view.tone} /> : null}
          <AgentChatInlineList label="Timeline" values={view.timeline} />
          <AgentChatInlineList label="Action context" values={view.actionContext} />
          {view.reviewDetails ? <AgentChatPreviewBlock label="Review" value={view.reviewDetails} contentKind="rawDetails" /> : null}
          {view.rawDetailsLabel && view.rawDetails !== undefined ? (
            <AgentChatPreviewBlock label={view.rawDetailsLabel} value={view.rawDetails} contentKind="rawDetails" />
          ) : null}
        </AgentChatContentStack>
      </AgentMessageSection>
    </AgentChatMessage>
  )
}
