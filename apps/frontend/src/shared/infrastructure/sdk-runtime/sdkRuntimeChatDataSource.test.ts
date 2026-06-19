import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  AgentChatThread,
  AgentChatTurn,
} from '@movscript/core/agent/chat'
import { CODEX_PROVIDER_ID, DEFAULT_PROVIDER_SETTINGS, providerRuntimeProfile } from '@/shared/infrastructure/providerConfigStore'
import { providerRuntimeApiContract } from '@/shared/infrastructure/providerRuntimeApiCatalog'
import { createSdkRuntimeChatDataSource } from '@/shared/infrastructure/sdk-runtime/sdkRuntimeChatDataSource'
import type {
  SdkRuntimeClient,
  SdkRuntimeRpcMethod,
  SdkRuntimeRpcRequestMap,
  SdkRuntimeRpcResponseMap,
} from '@/shared/infrastructure/sdk-runtime/sdkRuntimeProtocol'

test('SDK runtime data source maps neutral chat operations to runtime RPC methods', async () => {
  const provider = DEFAULT_PROVIDER_SETTINGS.providers.find((item) => item.id === CODEX_PROVIDER_ID)!
  const runtime = {
    ...providerRuntimeProfile(provider),
    id: 'codex-codex-sdk',
    api: 'codex-sdk',
  }
  const contract = providerRuntimeApiContract('codex-sdk')!
  const requests: Array<{ method: SdkRuntimeRpcMethod; params: unknown }> = []
  const dataSource = createSdkRuntimeChatDataSource(fakeClient(requests), {
    provider,
    runtime,
    contract,
    workspaceContext: { scope: 'project', projectId: 42 },
    resolveModelForRequest: () => ({ model: 'gpt-5.4' }),
  })

  const thread = await dataSource.startThread({ cwd: '/repo' })
  const turn = await dataSource.startTextTurn({ threadId: thread.id, text: 'hello' })
  await dataSource.interruptTurn?.({ threadId: thread.id, turnId: turn.id, reason: 'user' })
  await dataSource.listThreads({ limit: 5, cursor: null })
  await dataSource.capabilities?.runtime?.probe()
  await dataSource.capabilities?.skills?.list({ cwds: ['/repo'], forceReload: true })
  await dataSource.capabilities?.config?.listPermissionProfiles?.()
  await dataSource.capabilities?.mcp?.listServers()
  await dataSource.capabilities?.mcp?.readResource({ server: 'workspace', uri: 'resource://project/context', threadId: thread.id })

  assert.deepEqual(requests.map((request) => request.method), [
    'thread/start',
    'turn/text/start',
    'turn/interrupt',
    'thread/list',
    'runtime/probe',
    'skills/list',
    'permissionProfile/list',
    'mcpServerStatus/list',
    'mcpServer/resource/read',
  ])
  assert.equal((requests[0]?.params as { model?: string }).model, 'gpt-5.4')
  assert.deepEqual((requests[0]?.params as { workspaceContext?: unknown }).workspaceContext, { scope: 'project', projectId: 42 })
  assert.deepEqual((requests[1]?.params as { workspaceContext?: unknown }).workspaceContext, { scope: 'project', projectId: 42 })
  assert.equal((requests[1]?.params as { text?: string }).text, 'hello')
  assert.equal((requests[2]?.params as { reason?: string }).reason, 'user')
  assert.equal(dataSource.providerInstanceId, 'codex-codex-sdk')
  assert.equal((requests[5]?.params as { cwds?: string[] }).cwds?.[0], '/repo')
  assert.equal((requests[8]?.params as { uri?: string }).uri, 'resource://project/context')
  assert.equal(dataSource.capabilities?.command, undefined)
  assert.equal(dataSource.capabilities?.fs, undefined)
  assert.equal(Boolean(dataSource.capabilities?.mcp?.listServers), true)
  assert.equal(Boolean(dataSource.capabilities?.config?.listPermissionProfiles), true)
  assert.equal(dataSource.capabilities?.account, undefined)
})

test('SDK runtime data source delegates subscriptions to the runtime client', async () => {
  const provider = DEFAULT_PROVIDER_SETTINGS.providers.find((item) => item.id === CODEX_PROVIDER_ID)!
  const runtime = providerRuntimeProfile(provider)
  const contract = providerRuntimeApiContract('codex-sdk')!
  let subscribedThreadId: string | undefined
  const dataSource = createSdkRuntimeChatDataSource({
    request: fakeRequest,
    subscribe: (input) => {
      subscribedThreadId = input.threadId
      input.onNotification?.({ method: 'runtime/ready' })
      return () => {
        subscribedThreadId = undefined
      }
    },
  }, {
    provider,
    runtime,
    contract,
  })

  let notified = false
  const unsubscribe = await dataSource.subscribeThread?.({
    threadId: 'thread_1',
    onNotification: () => {
      notified = true
    },
  })

  assert.equal(subscribedThreadId, 'thread_1')
  assert.equal(notified, true)
  if (typeof unsubscribe === 'function') unsubscribe()
  assert.equal(subscribedThreadId, undefined)
})

function fakeClient(requests: Array<{ method: SdkRuntimeRpcMethod; params: unknown }>): SdkRuntimeClient {
  return {
    request: async (method, params) => {
      requests.push({ method, params })
      return fakeRequest(method, params)
    },
  }
}

async function fakeRequest<M extends SdkRuntimeRpcMethod>(
  method: M,
  params: SdkRuntimeRpcRequestMap[M],
): Promise<SdkRuntimeRpcResponseMap[M]> {
  if (method === 'thread/list') return { threads: [fakeThread('thread_1')] } as SdkRuntimeRpcResponseMap[M]
  if (method === 'thread/read') return fakeThread((params as { threadId: string }).threadId) as SdkRuntimeRpcResponseMap[M]
  if (method === 'thread/start' || method === 'thread/resume') return fakeThread('thread_1') as SdkRuntimeRpcResponseMap[M]
  if (method === 'turn/start' || method === 'turn/text/start') return fakeTurn('turn_1') as SdkRuntimeRpcResponseMap[M]
  if (method === 'runtime/describe') {
    return {
      runtime: { id: 'runtime', api: 'codex-sdk', label: 'Runtime' },
      contract: {
        api: 'codex-sdk',
        label: 'Codex SDK',
        transport: 'sdk-client',
        providerKinds: ['codex'],
        thread: { list: true, read: true, start: true, resume: true, interrupt: true, stream: true },
        capabilities: { tools: true, permissions: true, mcp: true, config: true, account: true },
      },
    } as SdkRuntimeRpcResponseMap[M]
  }
  if (method === 'runtime/probe') {
    return {
      ok: true,
      runtime: { id: 'runtime', api: 'codex-sdk', label: 'Runtime' },
      sdk: { packageName: '@openai/codex-sdk' },
      contract: {
        api: 'codex-sdk',
        label: 'Codex SDK',
        providerKinds: ['codex'],
        requiredPackageExports: ['Codex'],
        requiredRpcMethods: ['runtime/probe'],
      },
      checks: {
        packageLoad: { ok: true },
        requiredExports: { ok: true, required: ['Codex'], missing: [] },
        requiredRpcMethods: { ok: true, required: ['runtime/probe'], missing: [] },
      },
    } as SdkRuntimeRpcResponseMap[M]
  }
  if (method === 'capabilities/get') {
    return {
      ok: true,
      runtime: { id: 'runtime', api: 'codex-sdk', label: 'Runtime' },
      provider: { id: 'codex', kind: 'codex', label: 'Codex' },
      capabilities: {
        tools: true,
        permissions: true,
        mcp: true,
        config: true,
        account: true,
        serverRequests: true,
        skillsList: true,
        defaultSkillBootstrap: true,
        mcpBridge: true,
        permissionProfiles: true,
      },
      warnings: [],
      unsupported: {},
    } as SdkRuntimeRpcResponseMap[M]
  }
  if (method === 'skills/list') return { data: [], skills: [] } as SdkRuntimeRpcResponseMap[M]
  if (method === 'permissionProfile/list') return { permissionProfiles: [] } as SdkRuntimeRpcResponseMap[M]
  if (method === 'mcpServerStatus/list') return { servers: [] } as SdkRuntimeRpcResponseMap[M]
  if (method === 'mcpServer/tool/call') return { result: null } as SdkRuntimeRpcResponseMap[M]
  if (method === 'plugin/list' || method === 'plugin/installed') return { marketplaces: [] } as SdkRuntimeRpcResponseMap[M]
  if (method === 'plugin/install' || method === 'plugin/uninstall' || method === 'skills/extraRoots/set') return { ok: true } as SdkRuntimeRpcResponseMap[M]
  return undefined as SdkRuntimeRpcResponseMap[M]
}

function fakeThread(id: string): AgentChatThread {
  return {
    provider: 'codex',
    id,
    providerThreadId: id,
    preview: '',
    name: null,
    createdAt: 0,
    updatedAt: 0,
    status: 'idle',
    turns: [],
  }
}

function fakeTurn(id: string): AgentChatTurn {
  return {
    id,
    items: [],
    itemsView: 'full',
    status: 'completed',
    error: null,
    startedAt: null,
    completedAt: null,
    durationMs: null,
  }
}
