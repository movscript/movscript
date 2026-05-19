import type { ComponentProps } from 'react'
import { AgentMain } from '@movscript/ui'
import { AgentDebugPreviewDialog } from '@/components/agent/AgentDebugPreviewDialog'
import { AgentChatHeaderSection, type AgentChatHeaderSectionProps } from '@/components/agent/AgentChatHeaderSection'
import { AgentConversationThreadSection, type AgentConversationThreadSectionProps } from '@/components/agent/AgentConversationThreadSection'
import { AgentContextSection, type AgentContextSectionProps } from '@/components/agent/AgentContextSection'
import { AgentComposerSection, type AgentComposerSectionProps } from '@/components/agent/AgentComposerSection'

export interface AgentChatViewLayoutProps {
  composer: AgentComposerSectionProps
  context: AgentContextSectionProps
  debugPreview: ComponentProps<typeof AgentDebugPreviewDialog>
  header: AgentChatHeaderSectionProps
  thread: AgentConversationThreadSectionProps
}

export function AgentChatViewLayout({
  composer,
  context,
  debugPreview,
  header,
  thread,
}: AgentChatViewLayoutProps) {
  return (
    <AgentMain className="ai-agent-panel-main">
      <AgentDebugPreviewDialog {...debugPreview} />
      <section className="ai-agent-panel-card ai-agent-panel-content-card">
        <AgentChatHeaderSection {...header} />
        <AgentConversationThreadSection {...thread} />
      </section>
      <AgentContextSection {...context} />
      <AgentComposerSection {...composer} />
    </AgentMain>
  )
}
