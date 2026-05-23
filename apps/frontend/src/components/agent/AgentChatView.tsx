import type { ReactNode } from 'react'
import { AgentChatPageLayout } from '@/components/agent/AgentChatPageLayout'
import { AgentChatPanelLayout } from '@/components/agent/AgentChatPanelLayout'
import {
  useAgentChatViewController,
  type AgentChatViewControllerInput,
} from '@/components/agent/useAgentChatViewController'

export interface AgentChatViewProps extends AgentChatViewControllerInput {
  surface?: 'panel' | 'page'
  pageEmptyAccessory?: ReactNode
}

export function AgentChatView({ surface = 'panel', pageEmptyAccessory, ...props }: AgentChatViewProps) {
  const layoutProps = useAgentChatViewController(props)
  return surface === 'page'
    ? <AgentChatPageLayout {...layoutProps} emptyAccessory={pageEmptyAccessory} />
    : <AgentChatPanelLayout {...layoutProps} />
}
