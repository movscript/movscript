import { AgentChatContentStack, AgentChatMessage, AgentMessageSection } from '@/shared/ui/AgentMessageUi'
import { agentChatSystemItemView, type AgentChatThreadItem } from '@movscript/agent-chat'
import {
  AgentChatInspectBlock,
  AgentChatInlineList,
  AgentChatSectionTitle,
  AgentChatTextBlock,
} from '@/features/agent/components/agent-chat-items/AgentChatThreadItemBlocks'

export function AgentChatSystemItem({ item }: { item: Extract<AgentChatThreadItem, { type: 'reviewMode' | 'systemNotice' | 'approvalReview' | 'contextCompaction' | 'unknown' }> }) {
  const view = agentChatSystemItemView(item)
  return (
    <AgentChatMessage role="system" avatar="i">
      <AgentMessageSection title={<AgentChatSectionTitle title={view.title} meta={view.meta} />} tone={view.tone}>
        <AgentChatContentStack>
          {view.detail ? <AgentChatTextBlock label="Details" value={view.detail} tone={view.tone} /> : null}
          <AgentChatInlineList label="Timeline" values={view.timeline} />
          <AgentChatInlineList label="Action context" values={view.actionContext} />
          <AgentChatInspectBlock entries={[
            view.reviewDetails ? { label: 'review', value: view.reviewDetails } : null,
            view.rawDetails !== undefined ? { label: view.rawDetailsLabel ?? 'system', value: view.rawDetails } : null,
          ]} />
        </AgentChatContentStack>
      </AgentMessageSection>
    </AgentChatMessage>
  )
}
