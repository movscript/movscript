import { AgentChatShellView } from '@/features/agent/components/AgentChatShellView'
import type { AgentChatDataSourceShellProps } from '@/features/agent/application/agentChatDataSourceShellTypes'
import { useAgentChatDataSourceShellController } from '@/features/agent/application/useAgentChatDataSourceShellController'

export function AgentChatDataSourceShell(props: AgentChatDataSourceShellProps) {
  const viewProps = useAgentChatDataSourceShellController(props)
  return <AgentChatShellView {...viewProps} />
}
