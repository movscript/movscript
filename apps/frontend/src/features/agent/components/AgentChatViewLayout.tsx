import type { ComponentProps } from 'react'
import { AgentDebugPreviewDialog } from '@/features/agent/components/AgentDebugPreviewDialog'
import { ContextDiagnosticDialog } from '@/features/agent/components/ContextDiagnosticDialog'
import type { AgentChatHeaderSectionProps } from '@/features/agent/components/AgentChatHeaderSection'
import type { AgentConversationThreadSectionProps } from '@/features/agent/components/AgentConversationThreadSection'
import type { AgentComposerSectionProps } from '@/features/agent/components/AgentComposerSection'
import type { Conversation } from '@/features/agent/state/agentStore'

export interface AgentChatThreadLayoutProps extends AgentConversationThreadSectionProps {
  conversationStarted: boolean
}

export interface AgentChatViewLayoutProps {
  composer: AgentComposerSectionProps
  contextDiagnosticDialog: ComponentProps<typeof ContextDiagnosticDialog>
  debugPreview: ComponentProps<typeof AgentDebugPreviewDialog>
  header: AgentChatHeaderSectionProps
  providerSessionHistory: {
    archivedConversations: Conversation[]
    conversations: Conversation[]
    onRestoreArchivedConversation?: (id: string) => void
    onRestoreProviderThread: (threadId: string, sessionId?: string) => Promise<void>
  }
  thread: AgentChatThreadLayoutProps
}
