import { useMemo } from 'react'

import { CodexThreadChatShell } from '@/features/agent/components/CodexThreadChatShell'
import { MovScriptAgentChatShell } from '@/features/agent/components/MovScriptAgentChatShell'
import {
  resolveNewConversationAgentProvider,
  useAgentProviderConfigStore,
} from '@/features/agent/state/agentProviderConfigStore'

export interface AgentUnifiedChatShellProps {
  userId: string
  onCollapse: () => void
  showCollapse?: boolean
  host?: 'dock-panel' | 'floating-panel' | 'immersive'
  surface?: 'panel' | 'page'
  pendingStartupStatus?: 'creating' | 'restoring' | null
  pendingThreadIdToOpen?: string | null
  pendingThreadSessionIdToOpen?: string | null
  onPendingThreadHandled?: (threadId: string) => void
  onStartupSettled?: () => void
}

export function AgentUnifiedChatShell(props: AgentUnifiedChatShellProps) {
  const agentProviderSettings = useAgentProviderConfigStore((s) => s.settings)
  const activeProvider = useMemo(() => resolveNewConversationAgentProvider(agentProviderSettings), [agentProviderSettings])

  if (activeProvider.kind === 'codex') {
    return (
      <CodexThreadChatShell
        userId={props.userId}
        host={props.host}
        surface={props.surface}
        showCollapse={props.showCollapse}
        onCollapse={props.onCollapse}
      />
    )
  }

  return (
    <MovScriptAgentChatShell
      userId={props.userId}
      host={props.host}
      surface={props.surface}
      showCollapse={props.showCollapse}
      onCollapse={props.onCollapse}
    />
  )
}
