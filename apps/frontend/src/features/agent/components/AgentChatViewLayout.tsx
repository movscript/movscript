import type { ComponentProps } from 'react'
import { AgentDebugPreviewDialog } from '@/features/agent/components/AgentDebugPreviewDialog'
import type { AgentChatHeaderSectionProps } from '@/features/agent/components/AgentChatHeaderSection'
import type { AgentConversationThreadSectionProps } from '@/features/agent/components/AgentConversationThreadSection'
import type { AgentComposerSectionProps } from '@/features/agent/components/AgentComposerSection'
import type { Conversation } from '@/features/agent/state/agentStore'

export interface AgentChatViewLayoutProps {
  composer: AgentComposerSectionProps
  debugPreview: ComponentProps<typeof AgentDebugPreviewDialog>
  header: AgentChatHeaderSectionProps
  runtimeHistory: {
    archivedConversations: Conversation[]
    conversations: Conversation[]
    onRestoreArchivedConversation?: (id: string) => void
    onRestoreLocalThread: (threadId: string) => Promise<void>
  }
  thread: AgentConversationThreadSectionProps
}
