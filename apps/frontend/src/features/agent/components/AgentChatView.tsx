import type { ReactNode } from 'react'
import { AgentChatPageLayout } from '@/features/agent/components/AgentChatPageLayout'
import { AgentChatPanelLayout } from '@/features/agent/components/AgentChatPanelLayout'
import {
  useAgentChatViewController,
  type AgentChatViewControllerInput,
} from '@/features/agent/presentation/useAgentChatViewController'

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
