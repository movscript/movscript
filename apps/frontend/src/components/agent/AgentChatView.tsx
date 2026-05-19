import { AgentChatViewLayout } from '@/components/agent/AgentChatViewLayout'
import {
  useAgentChatViewController,
  type AgentChatViewControllerInput,
} from '@/components/agent/useAgentChatViewController'

export interface AgentChatViewProps extends AgentChatViewControllerInput {}

export function AgentChatView(props: AgentChatViewProps) {
  const layoutProps = useAgentChatViewController(props)
  return <AgentChatViewLayout {...layoutProps} />
}
