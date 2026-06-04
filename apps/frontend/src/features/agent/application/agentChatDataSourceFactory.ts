import type { AgentChatDataSource } from '@/features/agent/domain/agentChatProtocol'
import type { AgentProviderConfig } from '@/features/agent/state/agentProviderConfigStore'
import { createCodexAgentChatDataSource } from '@/shared/infrastructure/codex-app-server/codexAgentChatDataSource'
import { ensureCodexAppServerRpcClient } from '@/shared/infrastructure/codex-app-server/codexAppServerRpcClient'
import { createMovScriptAgentChatDataSource } from '@/shared/infrastructure/local-agent-client/movscriptAgentChatDataSource'
import { localAgentClient } from '@/shared/infrastructure/localAgentClient'

export async function createAgentChatDataSourceForProvider(provider: AgentProviderConfig): Promise<AgentChatDataSource> {
  if (provider.kind === 'codex') {
    const client = await ensureCodexAppServerRpcClient(provider)
    if (!client) throw new Error('Codex app-server is not available')
    return createCodexAgentChatDataSource(client)
  }
  return createMovScriptAgentChatDataSource(localAgentClient)
}
