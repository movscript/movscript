import {
  AgentChatContentStack,
  AgentChatMessage,
  AgentMessageSection,
} from '@movscript/ui'
import type { AgentChatNotificationEvent } from '@/features/agent/domain/agentChatProtocol'
import { agentChatContentDefaultOpen } from '@/features/agent/domain/agentChatDisplayPolicy'
import { agentChatRecentCapabilityEventView } from '@/features/agent/domain/agentChatRecentCapabilityEvents'
import {
  AgentChatPreviewBlock,
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
          {event.raw !== undefined ? <AgentChatPreviewBlock label="Event details" value={event.raw} contentKind="rawDetails" /> : null}
        </AgentChatContentStack>
      </AgentMessageSection>
    </AgentChatMessage>
  )
}
