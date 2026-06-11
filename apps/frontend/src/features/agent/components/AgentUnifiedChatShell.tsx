import { useEffect, useMemo, useState } from 'react'

import {
  AppServerChatShell,
  appServerThreadOpenEvent,
  readAppServerActiveThreadId,
} from '@/features/agent/components/AppServerChatShell'
import { AGENT_CONVERSATION_OPEN_STATE_CHANGED_EVENT } from '@/features/agent/presentation/agentConversationOpenOrder'
import {
  enabledProviders,
  resolveNewConversationProvider,
  usesAppServerProtocol,
  useProviderConfigStore,
  type ProviderConfig,
  type ProviderSettings,
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
  const [activeThreadVersion, setActiveThreadVersion] = useState(0)
  const activeProvider = useMemo(
    () => resolveAgentChatShellProvider(providerSettings),
    [activeThreadVersion, providerSettings],
  )

  useEffect(() => {
    const appServerProviders = enabledProviders(providerSettings).filter(usesAppServerProtocol)
    const handleActiveThreadChanged = () => setActiveThreadVersion((version) => version + 1)

    window.addEventListener('storage', handleActiveThreadChanged)
    window.addEventListener(AGENT_CONVERSATION_OPEN_STATE_CHANGED_EVENT, handleActiveThreadChanged)
    for (const provider of appServerProviders) {
      window.addEventListener(appServerThreadOpenEvent(provider), handleActiveThreadChanged)
    }

    return () => {
      window.removeEventListener('storage', handleActiveThreadChanged)
      window.removeEventListener(AGENT_CONVERSATION_OPEN_STATE_CHANGED_EVENT, handleActiveThreadChanged)
      for (const provider of appServerProviders) {
        window.removeEventListener(appServerThreadOpenEvent(provider), handleActiveThreadChanged)
      }
    }
  }, [providerSettings])

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

function resolveAgentChatShellProvider(settings: ProviderSettings): ProviderConfig {
  const selectedProvider = resolveNewConversationProvider(settings)
  if (!usesAppServerProtocol(selectedProvider)) return selectedProvider
  if (readAppServerActiveThreadId(selectedProvider)) return selectedProvider
  const activeProvider = enabledProviders(settings)
    .filter(usesAppServerProtocol)
    .find((provider) => readAppServerActiveThreadId(provider))
  return activeProvider ?? selectedProvider
}
