import type { AgentChatDataSource, AgentChatModelSelection } from '@/features/agent/domain/agentChatProtocol'
import { fetchAgentBackendModels } from '@/features/agent/domain/agentModelCatalog'
import { useAgentStore } from '@/features/agent/state/agentStore'
import {
  resolveCodexAppServerProfile,
  type AgentProviderConfig,
} from '@/features/agent/state/agentProviderConfigStore'
import { createCodexAgentChatDataSource } from '@/shared/infrastructure/codex-app-server/codexAgentChatDataSource'
import {
  codexAppServerRpcClientForURL,
  ensureCodexAppServerRpcClient,
} from '@/shared/infrastructure/codex-app-server/codexAppServerRpcClient'
import { publicModelId } from '@/shared/domain/modelDisplay'
import { createMovScriptAgentChatDataSource } from '@/shared/infrastructure/local-agent-client/movscriptAgentChatDataSource'
import { localAgentClient } from '@/shared/infrastructure/localAgentClient'

export interface AgentChatDataSourceFactoryOptions {
  codexAppServerPolicy?: 'ensure' | 'status-only'
}

export async function createAgentChatDataSourceForProvider(
  provider: AgentProviderConfig,
  options: AgentChatDataSourceFactoryOptions = {},
): Promise<AgentChatDataSource> {
  if (provider.kind === 'codex') {
    const client = options.codexAppServerPolicy === 'status-only'
      ? await currentCodexAppServerRpcClient(provider)
      : await ensureCodexAppServerRpcClient(provider)
    if (!client) throw new Error('Codex app-server is not available')
    const textModels = await fetchAgentBackendModels().catch(() => [])
    return createCodexAgentChatDataSource(client, {
      resolveModelForRequest: () => selectedAgentModel(textModels),
    })
  }
  return createMovScriptAgentChatDataSource(localAgentClient)
}

async function currentCodexAppServerRpcClient(provider: AgentProviderConfig) {
  const profile = resolveCodexAppServerProfile(provider)
  const electronApi = typeof window === 'undefined' ? undefined : window.api
  const status = await electronApi?.getCodexAppServerStatus?.({ profileId: profile.id })
  if (!status?.ok || !status.endpoint) throw new Error(status?.error || `Codex app-server is not running: ${profile.id}`)
  return codexAppServerRpcClientForURL(status.endpoint)
}

function selectedAgentModel(textModels: Awaited<ReturnType<typeof fetchAgentBackendModels>>): AgentChatModelSelection {
  const settings = useAgentStore.getState().settings
  const modelId = settings.modelId ?? textModels[0]?.id ?? null
  const selectedModel = textModels.find((model) => model.id === modelId)
  return selectedModel ? { model: publicModelId(selectedModel) } : {}
}
