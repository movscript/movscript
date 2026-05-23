import type { ComponentProps } from 'react'
import { AgentDebugPreviewDialog } from '@/components/agent/AgentDebugPreviewDialog'
import type { AgentChatHeaderSectionProps } from '@/components/agent/AgentChatHeaderSection'
import type { AgentConversationThreadSectionProps } from '@/components/agent/AgentConversationThreadSection'
import type { AgentComposerSectionProps } from '@/components/agent/AgentComposerSection'

export interface AgentChatViewLayoutProps {
  composer: AgentComposerSectionProps
  debugPreview: ComponentProps<typeof AgentDebugPreviewDialog>
  header: AgentChatHeaderSectionProps
  runtimeHistory: {
    onRestoreLocalThread: (threadId: string) => Promise<void>
  }
  thread: AgentConversationThreadSectionProps
}
