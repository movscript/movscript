import assert from 'node:assert/strict'
import test from 'node:test'

import type { AgentChatDataSource, AgentChatThread } from '@movscript/core/agent/chat'
import {
  CLAUDE_PROVIDER_ID,
  CODEX_PROVIDER_ID,
  CODEX_RUNTIME_API_ENV,
  DEFAULT_PROVIDER_SETTINGS,
  providerRuntimeApi,
  providerRuntimeProfile,
  providerSettingsWithRuntimeEnv,
} from '@/shared/infrastructure/providerConfigStore'
import {
  createAgentChatDataSourceForProvider,
  type AgentRuntimeDataSourceFactoryInput,
  type AgentTextModelCatalogLoadInput,
} from '@/features/agent/application/agentChatDataSourceFactory'
import { registerAgentRuntimeDataSourceFactory } from '@/features/agent/application/agentRuntimeDataSourceRegistry'
import { agentSettingsModelSelectionPatch, useAgentStore } from '@/features/agent/state/agentStore'
import type {
  AgentRuntimeClient,
  AgentRuntimeRpcMethod,
  AgentRuntimeRpcRequestMap,
  AgentRuntimeRpcResponseMap,
} from '@/shared/infrastructure/agent-runtime/agentRuntimeProtocol'
import type { PublicModel } from '@/types'

test('factory routes codex-sdk runtime to injected SDK data source adapter', async () => {
  const settings = providerSettingsWithRuntimeEnv(DEFAULT_PROVIDER_SETTINGS, {
    [CODEX_RUNTIME_API_ENV]: 'codex-sdk',
  })
  const provider = requiredProvider(settings.providers.find((item) => item.id === CODEX_PROVIDER_ID))
  let captured: AgentRuntimeDataSourceFactoryInput | undefined
  let capturedModelLoad: AgentTextModelCatalogLoadInput | undefined

  const dataSource = await createAgentChatDataSourceForProvider(provider, {
    loadTextModels: async (input) => {
      capturedModelLoad = input
      return []
    },
    runtimeDataSources: {
      'codex-sdk': (input) => {
        captured = input
        return fakeDataSource(input)
      },
    },
  })

  assert.equal(dataSource.provider, 'codex')
  assert.equal(dataSource.providerId, CODEX_PROVIDER_ID)
  assert.equal(dataSource.providerInstanceId, 'codex-codex-sdk')
  assert.equal(captured?.runtime.api, 'codex-sdk')
  assert.equal(captured?.runtime.sdkPackageName, '@openai/codex-sdk')
  assert.equal(captured?.contract.transport, 'sdk-client')
  assert.equal(captured?.resolveModelForRequest().model, undefined)
  assert.deepEqual(capturedModelLoad?.apiKinds, ['openai_responses', 'openai_chat_completions'])
})

test('factory routes codex app-server runtime to the runtime data source adapter', async () => {
  const provider = requiredProvider(DEFAULT_PROVIDER_SETTINGS.providers.find((item) => item.id === CODEX_PROVIDER_ID))
  let captured: AgentRuntimeDataSourceFactoryInput | undefined

  const dataSource = await createAgentChatDataSourceForProvider(provider, {
    loadTextModels: async () => [],
    runtimeDataSources: {
      'codex-app-server': (input) => {
        captured = input
        return fakeDataSource(input)
      },
    },
  })

  assert.equal(providerRuntimeApi(provider), 'codex-app-server')
  assert.equal(dataSource.provider, 'codex')
  assert.equal(dataSource.providerInstanceId, 'codex-codex-app-server')
  assert.equal(captured?.runtime.api, 'codex-app-server')
  assert.equal(captured?.contract.transport, 'app-server')
})

test('factory routes claude-sdk runtime to injected SDK data source adapter', async () => {
  const settings = providerSettingsWithRuntimeEnv(DEFAULT_PROVIDER_SETTINGS, {})
  const provider = requiredProvider(settings.providers.find((item) => item.id === CLAUDE_PROVIDER_ID))
  let captured: AgentRuntimeDataSourceFactoryInput | undefined
  let capturedModelLoad: AgentTextModelCatalogLoadInput | undefined

  const dataSource = await createAgentChatDataSourceForProvider(provider, {
    loadTextModels: async (input) => {
      capturedModelLoad = input
      return []
    },
    runtimeDataSources: {
      'claude-sdk': (input) => {
        captured = input
        return fakeDataSource(input)
      },
    },
  })

  assert.equal(providerRuntimeApi(provider), 'claude-sdk')
  assert.equal(providerRuntimeProfile(provider).packageName, '@anthropic-ai/claude-agent-sdk')
  assert.equal(dataSource.provider, 'claude')
  assert.equal(dataSource.providerId, CLAUDE_PROVIDER_ID)
  assert.equal(dataSource.providerInstanceId, 'claude-sdk')
  assert.equal(captured?.contract.capabilities.permissions, true)
  assert.equal(captured?.contract.capabilities.account, false)
  assert.deepEqual(capturedModelLoad?.apiKinds, ['anthropic_messages'])
})

test('factory only forwards explicitly selected catalog models to SDK requests', async () => {
  const settings = providerSettingsWithRuntimeEnv(DEFAULT_PROVIDER_SETTINGS, {
    [CODEX_RUNTIME_API_ENV]: 'codex-sdk',
  })
  const provider = requiredProvider(settings.providers.find((item) => item.id === CODEX_PROVIDER_ID))
  const previousModelIdByProviderProfile = useAgentStore.getState().settings.modelIdByProviderProfile
  let captured: AgentRuntimeDataSourceFactoryInput | undefined

  try {
    useAgentStore.getState().updateSettings(agentSettingsModelSelectionPatch(useAgentStore.getState().settings, provider.id, 'gpt-5.4'))
    await createAgentChatDataSourceForProvider(provider, {
      loadTextModels: async () => [modelFixture({ id: 1, model_id: 'gpt-5.4' })],
      runtimeDataSources: {
        'codex-sdk': (input) => {
          captured = input
          return fakeDataSource(input)
        },
      },
    })
    assert.equal(captured?.resolveModelForRequest().model, 'gpt-5.4')

    captured = undefined
    useAgentStore.getState().updateSettings(agentSettingsModelSelectionPatch(useAgentStore.getState().settings, provider.id, 'gpt-5.5'))
    await createAgentChatDataSourceForProvider(provider, {
      loadTextModels: async () => [modelFixture({ id: 1, model_id: 'gpt-5.4' })],
      runtimeDataSources: {
        'codex-sdk': (input) => {
          captured = input
          return fakeDataSource(input)
        },
      },
    })
    assert.equal(captured?.resolveModelForRequest().model, undefined)
  } finally {
    useAgentStore.getState().updateSettings({ modelIdByProviderProfile: previousModelIdByProviderProfile, modelId: null })
  }
})

test('factory uses registered SDK data source adapters when no test override is supplied', async () => {
  const settings = providerSettingsWithRuntimeEnv(DEFAULT_PROVIDER_SETTINGS, {
    [CODEX_RUNTIME_API_ENV]: 'codex-sdk',
  })
  const provider = requiredProvider(settings.providers.find((item) => item.id === CODEX_PROVIDER_ID))
  const unregister = registerAgentRuntimeDataSourceFactory('codex-sdk', (input) => fakeDataSource(input))

  try {
    const dataSource = await createAgentChatDataSourceForProvider(provider, {
      loadTextModels: async () => [],
    })

    assert.equal(dataSource.provider, 'codex')
    assert.equal(dataSource.providerInstanceId, 'codex-codex-sdk')
  } finally {
    unregister()
  }
})

test('factory reports missing SDK runtime clients without touching model catalog loading', async () => {
  const settings = providerSettingsWithRuntimeEnv(DEFAULT_PROVIDER_SETTINGS, {
    [CODEX_RUNTIME_API_ENV]: 'codex-sdk',
  })
  const provider = requiredProvider(settings.providers.find((item) => item.id === CODEX_PROVIDER_ID))
  let loadedModels = false

  await assert.rejects(
    () => createAgentChatDataSourceForProvider(provider, {
      loadTextModels: async () => {
        loadedModels = true
        return []
      },
    }),
    /no Codex SDK runtime client is available in this environment/,
  )
  assert.equal(loadedModels, false)
})

test('factory creates Agent runtime data sources from runtime clients when no adapter is registered', async () => {
  const settings = providerSettingsWithRuntimeEnv(DEFAULT_PROVIDER_SETTINGS, {
    [CODEX_RUNTIME_API_ENV]: 'codex-sdk',
  })
  const provider = requiredProvider(settings.providers.find((item) => item.id === CODEX_PROVIDER_ID))
  const requests: Array<{ method: AgentRuntimeRpcMethod; params: unknown }> = []

  const dataSource = await createAgentChatDataSourceForProvider(provider, {
    loadTextModels: async () => [],
    runtimeClient: async () => agentRuntimeClient(requests),
  })

  assert.equal(dataSource.provider, 'codex')
  assert.equal(dataSource.providerInstanceId, 'codex-codex-sdk')
  await dataSource.startThread({ cwd: '/workspace' })
  await dataSource.startTextTurn({ threadId: 'thread_1', text: 'hello' })
  assert.deepEqual(requests.map((request) => request.method), ['thread/start', 'turn/text/start'])
})

test('factory rejects mismatched runtime adapter provider kinds before invoking adapter', async () => {
  const mismatchedProvider = {
    id: 'custom-claude-runtime',
    kind: 'custom-agent',
    protocol: 'sdk',
    label: 'Custom Claude Runtime',
    enabled: true,
    runtime: {
      id: 'custom-claude-runtime',
      api: 'claude-sdk',
      label: 'Claude Agent SDK',
      packageName: '@anthropic-ai/claude-agent-sdk',
    },
  }
  let invoked = false

  await assert.rejects(
    () => createAgentChatDataSourceForProvider(mismatchedProvider, {
      loadTextModels: async () => [],
      runtimeDataSources: {
        'claude-sdk': (input) => {
          invoked = true
          return fakeDataSource(input)
        },
      },
    }),
    /does not support provider kind custom-agent/,
  )
  assert.equal(invoked, false)
})

function fakeDataSource(input: AgentRuntimeDataSourceFactoryInput): AgentChatDataSource {
  return {
    provider: input.provider.kind,
    providerId: input.provider.id,
    providerInstanceId: input.runtime.id,
    label: input.provider.label,
    async listThreads() {
      return { threads: [] }
    },
    async readThread(threadId) {
      return fakeThread(input, threadId)
    },
    async startThread() {
      return fakeThread(input, 'thread_1')
    },
    async startTextTurn() {
      return {
        id: 'turn_1',
        items: [],
        itemsView: 'full',
        status: 'completed',
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null,
      }
    },
  }
}

function fakeThread(input: AgentRuntimeDataSourceFactoryInput, threadId: string): AgentChatThread {
  return {
    provider: input.provider.kind,
    id: threadId,
    providerThreadId: threadId,
    preview: '',
    name: null,
    createdAt: 0,
    updatedAt: 0,
    status: 'idle',
    turns: [],
  }
}

function agentRuntimeClient(requests: Array<{ method: AgentRuntimeRpcMethod; params: unknown }>): AgentRuntimeClient {
  return {
    request: async (method, params) => {
      requests.push({ method, params })
      return sdkRuntimeResponse(method, params)
    },
  }
}

async function sdkRuntimeResponse<M extends AgentRuntimeRpcMethod>(
  method: M,
  params: AgentRuntimeRpcRequestMap[M],
): Promise<AgentRuntimeRpcResponseMap[M]> {
  const input = {
    provider: { kind: 'codex' },
    runtime: { id: 'codex-codex-sdk' },
  } as AgentRuntimeDataSourceFactoryInput
  if (method === 'thread/start') return fakeThread(input, 'thread_1') as AgentRuntimeRpcResponseMap[M]
  if (method === 'turn/text/start') {
    return {
      id: 'turn_1',
      items: [],
      itemsView: 'full',
      status: 'completed',
      error: null,
      startedAt: null,
      completedAt: null,
      durationMs: null,
    } as AgentRuntimeRpcResponseMap[M]
  }
  if (method === 'thread/list') return { threads: [] } as AgentRuntimeRpcResponseMap[M]
  if (method === 'thread/read') return fakeThread(input, (params as { threadId: string }).threadId) as AgentRuntimeRpcResponseMap[M]
  return undefined as AgentRuntimeRpcResponseMap[M]
}

function requiredProvider<T>(provider: T | undefined): T {
  assert.ok(provider)
  return provider
}

function modelFixture(patch: Pick<PublicModel, 'id' | 'model_id'> & Partial<PublicModel>): PublicModel {
  return {
    display_name: patch.model_id,
    capabilities: ['text'],
    accepts_image_input: false,
    ...patch,
  }
}
