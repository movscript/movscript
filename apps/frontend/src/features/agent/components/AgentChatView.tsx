import type { ReactNode } from 'react'
import type { AgentChatHost } from '@/features/agent/components/AgentBuiltinChatShell'
import { AgentChatPageLayout } from '@/features/agent/components/AgentChatPageLayout'
import { AgentChatPanelLayout } from '@/features/agent/components/AgentChatPanelLayout'
import {
  useAgentChatViewController,
  type AgentChatViewControllerInput,
} from '@/features/agent/presentation/useAgentChatViewController'

export interface AgentChatViewProps extends AgentChatViewControllerInput {
  host?: AgentChatHost
  surface?: 'panel' | 'page'
  pageEmptyAccessory?: ReactNode
}

export function AgentChatView({ host, surface = 'panel', pageEmptyAccessory, ...props }: AgentChatViewProps) {
  const layoutProps = useAgentChatViewController(props)
  const resolvedHost = host ?? (surface === 'page' ? 'immersive' : 'dock-panel')
  return surface === 'page'
    ? <AgentChatPageLayout {...layoutProps} host={resolvedHost} emptyAccessory={pageEmptyAccessory} />
    : <AgentChatPanelLayout {...layoutProps} host={resolvedHost} />
}
