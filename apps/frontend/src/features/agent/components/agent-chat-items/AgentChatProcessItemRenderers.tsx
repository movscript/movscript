import {
  AgentChatContentStack,
  AgentChatMessage,
  AgentMessageSection,
  AgentPlanOverviewList,
  AgentPlanOverviewTaskBadge,
  AgentPlanOverviewTaskBody,
  AgentPlanOverviewTaskCard,
  AgentPlanOverviewTaskHeader,
  AgentPlanOverviewTaskTitle,
} from '@movscript/ui'
import type { AgentChatThreadItem } from '@/features/agent/domain/agentChatThreadItems'
import {
  agentChatPlanItemView,
  agentChatPlanStatusIntent,
  agentChatReasoningItemView,
} from '@/features/agent/domain/agentChatProcessItemViews'
import {
  AgentChatInspectBlock,
  AgentChatPreviewBlock,
  AgentChatSectionTitle,
  AgentChatTextBlock,
} from '@/features/agent/components/agent-chat-items/AgentChatThreadItemBlocks'

export function AgentChatReasoningItem({ item }: { item: Extract<AgentChatThreadItem, { type: 'reasoning' }> }) {
  const view = agentChatReasoningItemView(item)
  if (!view.visible) return null
  return (
    <AgentChatMessage role="assistant" avatar="R">
      <AgentMessageSection title={<AgentChatSectionTitle title={view.title} meta={view.meta} />} tone={view.tone}>
        <AgentChatContentStack>
          {view.summary ? <AgentChatTextBlock label="Summary" value={view.summary} tone="process" /> : null}
          {view.trace ? <AgentChatTextBlock label="Trace summary" value={view.trace} tone="diagnostic" contentKind="trace" /> : null}
          {view.errorDetails !== undefined ? <AgentChatPreviewBlock label="Error" value={view.errorDetails} tone="diagnostic" contentKind="error" /> : null}
          <AgentChatInspectBlock entries={[
            view.resultDetails !== undefined ? { label: 'result', value: view.resultDetails, tone: 'result' } : null,
            view.rawDetails !== undefined ? { label: 'reasoning', value: view.rawDetails } : null,
          ]} />
        </AgentChatContentStack>
      </AgentMessageSection>
    </AgentChatMessage>
  )
}

export function AgentChatPlanItem({ item }: { item: Extract<AgentChatThreadItem, { type: 'plan' }> }) {
  const view = agentChatPlanItemView(item)
  if (!view.visible) return null
  return (
    <AgentChatMessage role="assistant" avatar="P">
      <AgentMessageSection title={<AgentChatSectionTitle title="Plan" meta={view.steps.length ? [`${view.steps.length} step(s)`] : []} />} tone="process">
        <AgentChatContentStack>
          {view.intro ? <AgentChatTextBlock label="Context" value={view.intro} tone="process" /> : null}
          {view.steps.length ? (
            <AgentPlanOverviewList>
              {view.steps.map((planItem, index) => (
                <AgentPlanOverviewTaskCard key={`${index}:${planItem.text}`}>
                  <AgentPlanOverviewTaskBody>
                    <AgentPlanOverviewTaskHeader>
                      <AgentPlanOverviewTaskTitle>{planItem.text}</AgentPlanOverviewTaskTitle>
                      <AgentPlanOverviewTaskBadge intent={agentChatPlanStatusIntent(planItem.status)}>
                        {planItem.status}
                      </AgentPlanOverviewTaskBadge>
                    </AgentPlanOverviewTaskHeader>
                  </AgentPlanOverviewTaskBody>
                </AgentPlanOverviewTaskCard>
              ))}
            </AgentPlanOverviewList>
          ) : (
            <AgentChatTextBlock label="Text" value={view.text} tone="process" />
          )}
          <AgentChatInspectBlock entries={[
            view.details !== undefined ? { label: 'plan', value: view.details } : null,
          ]} />
        </AgentChatContentStack>
      </AgentMessageSection>
    </AgentChatMessage>
  )
}
