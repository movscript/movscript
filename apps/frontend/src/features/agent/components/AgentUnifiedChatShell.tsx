import { useMemo } from 'react'

import { AppServerChatShell } from '@/features/agent/components/AppServerChatShell'
import {
  resolveNewConversationProvider,
  usesAppServerProtocol,
  useProviderConfigStore,
} from '@/shared/infrastructure/providerConfigStore'

export interface AgentUnifiedChatShellProps {
  userId: string
  onCollapse: () => void
  showCollapse?: boolean
  host?: 'dock-panel' | 'floating-panel' | 'immersive'
  surface?: 'panel' | 'page'
}

export function AgentUnifiedChatShell(props: AgentUnifiedChatShellProps) {
  const providerSettings = useProviderConfigStore((s) => s.settings)
  const activeProvider = useMemo(() => resolveNewConversationProvider(providerSettings), [providerSettings])

  if (!usesAppServerProtocol(activeProvider)) return null

  return (
    <AppServerChatShell
      userId={props.userId}
      provider={activeProvider}
      host={props.host}
      surface={props.surface}
      showCollapse={props.showCollapse}
      onCollapse={props.onCollapse}
    />
  )
}
