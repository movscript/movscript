import { AgentChatContentStack, AgentChatMessage, AgentMessageSection } from '@/shared/ui/AgentMessageUi'
import type { AgentChatNotificationEvent } from '@movscript/agent-chat'
import { agentChatContentDefaultOpen } from '@movscript/agent-chat'
import { agentChatRecentCapabilityEventView } from '@movscript/agent-chat'
import {
  AgentChatSectionTitle,
  AgentChatTextBlock,
} from '@/features/agent/components/agent-chat-items/AgentChatThreadItemBlocks'

export function AgentChatRecentCapabilityEventCard({ event }: { event: AgentChatNotificationEvent }) {
  const view = agentChatRecentCapabilityEventView(event)
  return (
    <AgentChatMessage role="system" avatar="~" data-testid="agent-chat-capability-event">
      <AgentMessageSection
        title={<AgentChatSectionTitle title={view.title} meta={view.meta} />}
        tone={view.tone}
        defaultOpen={agentChatContentDefaultOpen('summary', view.detail)}
      >
        <AgentChatContentStack>
          {view.detail ? <AgentChatTextBlock label="Details" value={view.detail} tone={view.tone} /> : null}
        </AgentChatContentStack>
      </AgentMessageSection>
    </AgentChatMessage>
  )
}
