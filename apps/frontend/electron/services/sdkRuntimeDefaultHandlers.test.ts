import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA,
  resolveMovScriptWorkspacePaths,
  writeMovScriptWorkspaceConfig,
} from '@movscript/core/workspace/node'
import { writeMovScriptBackendAuth, writeMovScriptBackendConfig } from '@movscript/core/backend/node'

import {
  createClaudeSdkRuntimeHandler,
  createCodexSdkRuntimeHandler,
  createMovaSdkRuntimeHandler,
} from './sdkRuntimeDefaultHandlers'
import {
  CODEX_PROVIDER_ID,
  DEFAULT_PROVIDER_SETTINGS,
  MOVA_PROVIDER_ID,
  providerRuntimeProfile,
} from '../../src/shared/infrastructure/providerConfigStore'
import {
  registerSdkRuntimeSubscription,
  respondToSdkRuntimeServerRequest,
} from './sdkRuntimeHost'
import { SDK_RUNTIME_REQUIRED_RPC_METHODS } from '../../src/shared/infrastructure/sdk-runtime/sdkRuntimeProtocol'
import { writeAgentRuntimeApiKey } from './appSettingsSecrets'

test('Codex SDK runtime handler calls Codex startThread and thread.run', async () => {
  const calls: string[] = []
  class Codex {
    startThread(input?: Record<string, unknown>) {
      calls.push(`start:${input?.workingDirectory}`)
      return {
        id: 'codex_thread_1',
        run: async (prompt: string, options?: Record<string, unknown>) => {
          calls.push(`run:${prompt}:${options?.model}`)
          return { finalResponse: 'done' }
        },
      }
    }
    resumeThread() {
      throw new Error('unexpected resume')
    }
  }
  const handler = createCodexSdkRuntimeHandler({
    moduleLoader: async (specifier) => {
      assert.equal(specifier, '@openai/codex-sdk')
      return { Codex }
    },
  })

  const thread = await handler({
    method: 'thread/start',
    params: {
      ...codexContext(),
      cwd: '/repo',
      model: 'gpt-5.4',
    },
  })
  const turn = await handler({
    method: 'turn/text/start',
    params: {
      ...codexContext(),
      threadId: thread.id,
      text: 'fix tests',
      model: 'gpt-5.4',
    },
  })

  assert.deepEqual(calls, ['start:/repo', 'run:fix tests:gpt-5.4'])
  assert.equal(turn.items[1]?.type, 'agentMessage')
  assert.equal(turn.items[1]?.type === 'agentMessage' ? turn.items[1].text : '', 'done')
})

test('Codex SDK runtime handler passes run profile options and brokers provider server requests', async () => {
  const providerResponses: unknown[] = []
  let runOptions: Record<string, unknown> | undefined
  async function* streamEvents() {
    yield {
      type: 'item/permissions/requestApproval',
      id: 'codex-permission-req-1',
      params: {
        toolName: 'shell',
        permission: 'workspace-write',
        reason: 'needs write access',
      },
      respond: (response: unknown) => providerResponses.push(response),
    }
    yield { type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text: 'approved' } }
  }
  class Codex {
    startThread() {
      return {
        id: 'codex_profile_thread',
        run: async () => {
          throw new Error('unexpected buffered run')
        },
        runStreamed: async (_prompt: string, options?: Record<string, unknown>) => {
          runOptions = options
          return { events: streamEvents() }
        },
      }
    }
    resumeThread() {
      return this.startThread()
    }
  }
  const context = {
    ...codexContext(),
    runtime: {
      ...codexContext().runtime,
      id: 'codex-profile-runtime',
    },
  }
  const serverRequests: string[] = []
  const unregister = registerSdkRuntimeSubscription({
    subscriptionId: 'codex-profile-server-requests',
    runtimeId: context.runtime.id,
    threadId: 'codex_profile_thread',
    sendNotification: () => {},
    sendServerRequest: (event) => {
      serverRequests.push(event.request.method)
      void respondToSdkRuntimeServerRequest({
        runtimeId: event.runtimeId,
        requestId: event.request.id,
        response: { action: 'approve', scope: 'turn' },
      })
    },
  })
  const handler = createCodexSdkRuntimeHandler({
    moduleLoader: async () => ({ Codex }),
  })

  try {
    const thread = await handler({
      method: 'thread/start',
      params: context,
    })
    await handler({
      method: 'turn/text/start',
      params: {
        ...context,
        threadId: thread.id,
        text: 'use a tool',
        runProfile: {
          approvalPolicy: 'on-request',
          approvalsReviewer: 'user',
          permissionProfileId: ':workspace',
          fallbackSandbox: 'workspace-write',
        },
      },
    })

    assert.equal(runOptions?.approvalPolicy, 'on-request')
    assert.equal(runOptions?.permissions, ':workspace')
    assert.equal(runOptions?.sandboxMode, 'workspace-write')
    assert.equal(typeof runOptions?.requestServer, 'function')
    assert.deepEqual(serverRequests, ['item/permissions/requestApproval'])
    assert.deepEqual(providerResponses, [{ action: 'approve', scope: 'turn' }])
  } finally {
    unregister()
  }
})

test('Codex SDK runtime handler applies updated model before the first provider turn starts', async () => {
  const starts: Array<Record<string, unknown> | undefined> = []
  const runs: Array<string | undefined> = []
  class Codex {
    startThread(input?: Record<string, unknown>) {
      starts.push(input)
      const thread: { id?: string; run: (prompt: string) => Promise<unknown> } = {
        run: async () => {
          runs.push(input?.model as string | undefined)
          thread.id = 'codex_provider_thread_1'
          return { finalResponse: 'done' }
        },
      }
      return thread
    }
    resumeThread() {
      throw new Error('unexpected resume')
    }
  }
  const handler = createCodexSdkRuntimeHandler({
    moduleLoader: async () => ({ Codex }),
  })

  const thread = await handler({
    method: 'thread/start',
    params: {
      ...codexContext(),
      cwd: '/repo',
    },
  })
  await handler({
    method: 'thread/settings/update',
    params: {
      ...codexContext(),
      threadId: thread.id,
      cwd: '/repo',
      model: 'gpt-5.4',
    },
  })
  await handler({
    method: 'turn/text/start',
    params: {
      ...codexContext(),
      threadId: thread.id,
      text: 'fix tests',
    },
  })

  assert.equal(starts.length, 2)
  assert.equal(starts[0]?.model, undefined)
  assert.equal(starts[1]?.model, 'gpt-5.4')
  assert.deepEqual(runs, ['gpt-5.4'])
})

test('Codex SDK runtime handler recreates failed empty provider threads when model changes', async () => {
  const starts: Array<Record<string, unknown> | undefined> = []
  const runs: Array<string | undefined> = []
  class Codex {
    startThread(input?: Record<string, unknown>) {
      starts.push(input)
      const thread: { id?: string; run: () => Promise<unknown> } = {
        run: async () => {
          runs.push(input?.model as string | undefined)
          if (!input?.model) {
            thread.id = 'codex_provider_failed_thread'
            throw new Error('unexpected status 404 Not Found: model "gpt-5.5" not found')
          }
          thread.id = 'codex_provider_fixed_thread'
          return { finalResponse: 'done' }
        },
      }
      return thread
    }
    resumeThread() {
      throw new Error('unexpected resume')
    }
  }
  const handler = createCodexSdkRuntimeHandler({
    moduleLoader: async () => ({ Codex }),
  })

  const thread = await handler({
    method: 'thread/start',
    params: {
      ...codexContext(),
      cwd: '/repo',
    },
  })
  await assert.rejects(
    () => handler({
      method: 'turn/start',
      params: {
        ...codexContext(),
        threadId: thread.id,
        inputs: [{ type: 'text', text: 'first attempt', textElements: [] }],
      },
    }),
    /gpt-5\.5/,
  )
  await handler({
    method: 'thread/settings/update',
    params: {
      ...codexContext(),
      threadId: thread.id,
      cwd: '/repo',
      model: 'gpt-5.4',
    },
  })
  await handler({
    method: 'turn/start',
    params: {
      ...codexContext(),
      threadId: thread.id,
      inputs: [{ type: 'text', text: 'second attempt', textElements: [] }],
      model: 'gpt-5.4',
    },
  })

  assert.equal(starts.length, 2)
  assert.equal(starts[0]?.model, undefined)
  assert.equal(starts[1]?.model, 'gpt-5.4')
  assert.deepEqual(runs, [undefined, 'gpt-5.4'])
})

test('Codex SDK runtime handler resolves workspace context cwd and CODEX_HOME', async () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-codex-sdk-workspace-'))
  writeMovScriptBackendConfig(workspaceDir, {
    baseURL: 'http://localhost:8766',
    activeUserId: 1,
    realm: { kind: 'local', id: 'local' },
  })
  writeMovScriptBackendAuth(workspaceDir, { token: 'mv1.local-session', userId: 1, realm: { kind: 'local', id: 'local' } })
  const constructed: unknown[] = []
  const starts: unknown[] = []
  class Codex {
    constructor(options?: unknown) {
      constructed.push(options)
    }
    startThread(input?: Record<string, unknown>) {
      starts.push(input)
      return { id: 'codex_thread_1', run: async () => ({ finalResponse: 'done' }) }
    }
    resumeThread() {
      return { id: 'codex_thread_1', run: async () => ({ finalResponse: 'done' }) }
    }
  }
  const handler = createCodexSdkRuntimeHandler({
    defaultWorkspaceDir: () => workspaceDir,
    moduleLoader: async () => ({ Codex }),
  })

  const thread = await handler({
    method: 'thread/start',
    params: {
      ...codexContext(),
      workspaceContext: { scope: 'project', projectDir: join(workspaceDir, 'demo-project') },
    },
  })

  const expectedCwd = join(workspaceDir, 'demo-project')
  assert.equal(thread.cwd, expectedCwd)
  assert.equal((starts[0] as { workingDirectory?: string }).workingDirectory, expectedCwd)
  const options = constructed[0] as { env?: Record<string, string | undefined> }
  assert.equal(options.env?.CODEX_HOME, join(workspaceDir, '.codex'))
  assert.equal(existsSync(join(workspaceDir, '.codex')), true)
})

test('Codex SDK runtime handler injects backend service base URL and API key', async () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-codex-sdk-backend-'))
  writeMovScriptBackendConfig(workspaceDir, { baseURL: 'http://localhost:8766/api/v1' })
  writeMovScriptBackendAuth(workspaceDir, { token: 'mv1.backend-session-token' })
  writeMovScriptWorkspaceConfig(resolveMovScriptWorkspacePaths(workspaceDir).configPath, {
    schema: MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA,
    updatedAt: '2026-06-18T00:00:00.000Z',
    providers: {
      codex: {
        providerRef: 'backend:501',
        config: { mode: 'backendKey', modelProviderRef: 'backend:501' },
        auth: { mode: 'backendKey', modelProviderRef: 'backend:501' },
      },
    },
  })
  const constructed: unknown[] = []
  class Codex {
    constructor(options?: unknown) {
      constructed.push(options)
    }
    startThread() {
      return { id: 'codex_thread_1', run: async () => ({ finalResponse: 'done' }) }
    }
    resumeThread() {
      return { id: 'codex_thread_1', run: async () => ({ finalResponse: 'done' }) }
    }
  }
  const handler = createCodexSdkRuntimeHandler({
    defaultWorkspaceDir: () => workspaceDir,
    moduleLoader: async () => ({ Codex }),
  })

  await handler({
    method: 'runtime/describe',
    params: codexContext(),
  })

  const options = constructed[0] as { baseUrl?: string; apiKey?: string; env?: Record<string, string | undefined>; config?: Record<string, unknown> }
  assert.equal(options.baseUrl, 'http://127.0.0.1:8766/v1')
  assert.equal(options.apiKey, 'mv1.backend-session-token')
  assert.deepEqual(options.config, {
    model_provider: 'movscript-backend-openai',
    model_providers: {
      'movscript-backend-openai': {
        name: 'Movscript Backend',
        base_url: 'http://127.0.0.1:8766/v1',
        env_key: 'OPENAI_API_KEY',
        wire_api: 'responses',
        supports_websockets: false,
      },
    },
  })
  assert.equal(options.env?.OPENAI_API_KEY, 'mv1.backend-session-token')
  assert.equal(options.env?.OPENAI_BASE_URL, 'http://127.0.0.1:8766/v1')
  assert.equal(options.env?.OPENAI_API_BASE_URL, 'http://127.0.0.1:8766/v1')
  assert.equal(options.env?.CODEX_HOME, join(workspaceDir, '.codex'))
})

test('Codex SDK runtime handler defaults to the workspace backend session', async () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-codex-sdk-default-backend-'))
  writeMovScriptBackendConfig(workspaceDir, { baseURL: 'http://localhost:8766' })
  writeMovScriptBackendAuth(workspaceDir, { token: 'mv1.workspace-backend-token' })
  const constructed: unknown[] = []
  class Codex {
    constructor(options?: unknown) {
      constructed.push(options)
    }
    startThread() {
      return { id: 'codex_thread_1', run: async () => ({ finalResponse: 'done' }) }
    }
    resumeThread() {
      return { id: 'codex_thread_1', run: async () => ({ finalResponse: 'done' }) }
    }
  }
  const handler = createCodexSdkRuntimeHandler({
    defaultWorkspaceDir: () => workspaceDir,
    moduleLoader: async () => ({ Codex }),
  })

  await handler({
    method: 'runtime/describe',
    params: codexContext(),
  })

  const options = constructed[0] as { baseUrl?: string; apiKey?: string; env?: Record<string, string | undefined>; config?: Record<string, unknown> }
  assert.equal(options.baseUrl, 'http://127.0.0.1:8766/v1')
  assert.equal(options.apiKey, 'mv1.workspace-backend-token')
  assert.deepEqual(options.config, {
    model_provider: 'movscript-backend-openai',
    model_providers: {
      'movscript-backend-openai': {
        name: 'Movscript Backend',
        base_url: 'http://127.0.0.1:8766/v1',
        env_key: 'OPENAI_API_KEY',
        wire_api: 'responses',
        supports_websockets: false,
      },
    },
  })
  assert.equal(options.env?.OPENAI_API_KEY, 'mv1.workspace-backend-token')
  assert.equal(options.env?.OPENAI_BASE_URL, 'http://127.0.0.1:8766/v1')
  assert.equal(options.env?.OPENAI_API_BASE_URL, 'http://127.0.0.1:8766/v1')
})

test('Mova SDK runtime handler uses the Codex-compatible SDK interface when a package is configured', async () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-mova-sdk-workspace-'))
  const calls: string[] = []
  const constructed: unknown[] = []
  class Codex {
    constructor(options?: unknown) {
      constructed.push(options)
    }
    startThread(input?: Record<string, unknown>) {
      calls.push(`start:${input?.workingDirectory}`)
      return {
        id: 'mova_thread_1',
        run: async (prompt: string, options?: Record<string, unknown>) => {
          calls.push(`run:${prompt}:${options?.model}`)
          return { finalResponse: 'mova done' }
        },
      }
    }
    resumeThread() {
      throw new Error('unexpected resume')
    }
  }
  const handler = createMovaSdkRuntimeHandler({
    defaultWorkspaceDir: () => workspaceDir,
    moduleLoader: async (specifier) => {
      assert.equal(specifier, '/local/mova-sdk/dist/index.js')
      return { Codex }
    },
  })
  const context = {
    ...movaContext(),
    runtime: {
      ...movaContext().runtime,
      packageName: '/local/mova-sdk/dist/index.js',
    },
  }

  const thread = await handler({
    method: 'thread/start',
    params: {
      ...context,
      cwd: '/repo',
      model: 'mova-model',
    },
  })
  const turn = await handler({
    method: 'turn/text/start',
    params: {
      ...context,
      threadId: thread.id,
      text: 'draft scene',
      model: 'mova-model',
    },
  })

  assert.deepEqual(calls, ['start:/repo', 'run:draft scene:mova-model'])
  const options = constructed[0] as { env?: Record<string, string | undefined> }
  assert.equal(options.env?.MOVA_HOME, join(workspaceDir, '.mova'))
  assert.equal(options.env?.CODEX_HOME, join(workspaceDir, '.mova'))
  assert.equal(existsSync(join(workspaceDir, '.mova')), true)
  assert.equal(turn.items[1]?.type, 'agentMessage')
  assert.equal(turn.items[1]?.type === 'agentMessage' ? turn.items[1].text : '', 'mova done')
})

test('Mova SDK runtime handler fails clearly until the local SDK package is configured', async () => {
  const handler = createMovaSdkRuntimeHandler()

  await assert.rejects(
    () => handler({
      method: 'runtime/describe',
      params: movaContext(),
    }),
    /SDK package name is empty/,
  )
})

test('Codex SDK runtime handler reports missing API key credentials with an actionable message', async () => {
  class Codex {
    startThread() {
      return {
        id: 'codex_thread_1',
        run: async () => {
          throw new Error('unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.openai.com/v1/responses')
        },
      }
    }
    resumeThread() {
      return {
        id: 'codex_thread_1',
        run: async () => {
          throw new Error('unexpected status 401 Unauthorized: Missing bearer or basic authentication in header')
        },
      }
    }
  }
  const handler = createCodexSdkRuntimeHandler({
    defaultWorkspaceDir: () => mkdtempSync(join(tmpdir(), 'movscript-codex-sdk-missing-auth-')),
    moduleLoader: async () => ({ Codex }),
  })
  const thread = await handler({
    method: 'thread/start',
    params: codexContext(),
  })

  await assert.rejects(
    () => handler({
      method: 'turn/text/start',
      params: {
        ...codexContext(),
        threadId: thread.id,
        text: 'hello',
      },
    }),
    /Codex SDK credentials are missing[\s\S]*backend model gateway[\s\S]*OPENAI_API_KEY/,
  )
})

test('Claude SDK runtime handler calls query and maps streamed result messages', async () => {
  const calls: unknown[] = []
  const claudeSessionId = '550e8400-e29b-41d4-a716-446655440000'
  async function* query(input: unknown) {
    calls.push(input)
    yield { type: 'system', subtype: 'init', session_id: claudeSessionId }
    yield { type: 'assistant', text: 'working' }
    yield { type: 'result', result: 'finished' }
  }
  const handler = createClaudeSdkRuntimeHandler({
    moduleLoader: async (specifier) => {
      assert.equal(specifier, '@anthropic-ai/claude-agent-sdk')
      return { query }
    },
  })

  const thread = await handler({
    method: 'thread/start',
    params: {
      ...claudeContext(),
      cwd: '/repo',
      model: 'claude-opus-4-6',
    },
  })
  const turn = await handler({
    method: 'turn/text/start',
    params: {
      ...claudeContext(),
      threadId: thread.id,
      text: 'summarize',
      cwd: '/repo',
      model: 'claude-opus-4-6',
    },
  })
  const savedThread = await handler({
    method: 'thread/read',
    params: {
      ...claudeContext(),
      threadId: thread.id,
    },
  })
  await handler({
    method: 'turn/text/start',
    params: {
      ...claudeContext(),
      threadId: thread.id,
      text: 'continue',
    },
  })

  const firstCall = calls[0] as { prompt?: string; options?: Record<string, unknown> }
  const secondCall = calls[1] as { prompt?: string; options?: Record<string, unknown> }
  const savedThreadRaw = savedThread.raw && typeof savedThread.raw === 'object'
    ? savedThread.raw as Record<string, unknown>
    : {}
  assert.equal(firstCall.prompt, 'summarize')
  assert.equal(firstCall.options?.cwd, '/repo')
  assert.equal(firstCall.options?.model, 'claude-opus-4-6')
  assert.equal(firstCall.options?.resume, undefined)
  assert.equal(savedThread.sessionId, undefined)
  assert.equal(savedThread.providerSessionTreeId, undefined)
  assert.equal(savedThreadRaw.providerSessionId, undefined)
  assert.equal(secondCall.prompt, 'continue')
  assert.equal(secondCall.options?.resume, claudeSessionId)
  assert.equal(typeof firstCall.options?.env, 'object')
  const agentMessages = turn.items.filter((item): item is Extract<typeof item, { type: 'agentMessage' }> => item.type === 'agentMessage')
  assert.equal(agentMessages.at(-1)?.text, 'finished')
})

test('Claude SDK runtime handler passes run profile options and canUseTool approval callback', async () => {
  const calls: unknown[] = []
  const callbackResults: unknown[] = []
  async function* query(input: unknown) {
    calls.push(input)
    const options = (input as { options?: Record<string, unknown> }).options
    assert.equal(typeof options?.canUseTool, 'function')
    callbackResults.push(await (options.canUseTool as (...args: unknown[]) => Promise<unknown>)('Bash', { command: 'echo hello' }, {}))
    yield { type: 'result', result: 'allowed' }
  }
  const context = {
    ...claudeContext(),
    runtime: {
      ...claudeContext().runtime,
      id: 'claude-profile-runtime',
    },
  }
  const serverRequests: string[] = []
  const handler = createClaudeSdkRuntimeHandler({
    moduleLoader: async () => ({ query }),
  })
  const thread = await handler({
    method: 'thread/start',
    params: context,
  })
  const unregister = registerSdkRuntimeSubscription({
    subscriptionId: 'claude-profile-server-requests',
    runtimeId: context.runtime.id,
    threadId: thread.id,
    sendNotification: () => {},
    sendServerRequest: (event) => {
      serverRequests.push(event.request.method)
      void respondToSdkRuntimeServerRequest({
        runtimeId: event.runtimeId,
        requestId: event.request.id,
        response: { action: 'approve', scope: 'turn' },
      })
    },
  })

  try {
    await handler({
      method: 'turn/text/start',
      params: {
        ...context,
        threadId: thread.id,
        text: 'use bash',
        runProfile: {
          approvalPolicy: 'on-request',
          approvalsReviewer: 'user',
          permissionProfileId: ':workspace',
          fallbackSandbox: 'workspace-write',
        },
      },
    })

    const firstCall = calls[0] as { options?: Record<string, unknown> }
    assert.equal(firstCall.options?.approvalPolicy, 'on-request')
    assert.equal(firstCall.options?.permissionProfileId, ':workspace')
    assert.equal(firstCall.options?.sandboxMode, 'workspace-write')
    assert.deepEqual(serverRequests, ['item/permissions/requestApproval'])
    assert.deepEqual(callbackResults, [{ behavior: 'allow' }])
  } finally {
    unregister()
  }
})

test('Claude SDK runtime handler resolves workspace context cwd and CLAUDE_CONFIG_DIR', async () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-claude-sdk-workspace-'))
  writeMovScriptBackendConfig(workspaceDir, {
    baseURL: 'http://localhost:8766',
    activeUserId: 1,
    realm: { kind: 'local', id: 'local' },
  })
  writeMovScriptBackendAuth(workspaceDir, { token: 'mv1.local-session', userId: 1, realm: { kind: 'local', id: 'local' } })
  const calls: unknown[] = []
  async function* query(input: unknown) {
    calls.push(input)
    yield { type: 'result', result: 'finished' }
  }
  const handler = createClaudeSdkRuntimeHandler({
    defaultWorkspaceDir: () => workspaceDir,
    moduleLoader: async () => ({ query }),
  })

  const thread = await handler({
    method: 'thread/start',
    params: {
      ...claudeContext(),
      workspaceContext: { scope: 'project', projectDir: join(workspaceDir, 'demo-project') },
    },
  })
  await handler({
    method: 'turn/text/start',
    params: {
      ...claudeContext(),
      threadId: thread.id,
      text: 'summarize',
    },
  })

  const expectedCwd = join(workspaceDir, 'demo-project')
  const options = (calls[0] as { options?: Record<string, unknown> }).options ?? {}
  assert.equal(thread.cwd, expectedCwd)
  assert.equal(options.cwd, expectedCwd)
  assert.equal((options.env as Record<string, string | undefined>).CLAUDE_CONFIG_DIR, join(workspaceDir, '.claude'))
  assert.equal(existsSync(join(workspaceDir, '.claude')), true)
})

test('Claude SDK runtime handler injects backend service credentials through subprocess env', async () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-claude-sdk-backend-'))
  writeMovScriptBackendConfig(workspaceDir, { baseURL: 'https://backend.example/api/v1' })
  writeMovScriptBackendAuth(workspaceDir, { token: 'mv1.backend-session-token' })
  writeMovScriptWorkspaceConfig(resolveMovScriptWorkspacePaths(workspaceDir).configPath, {
    schema: MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA,
    updatedAt: '2026-06-18T00:00:00.000Z',
    providers: {
      claude: {
        providerRef: 'backend:anthropic',
        config: { mode: 'backendKey', modelProviderRef: 'backend:anthropic' },
        auth: { mode: 'backendKey', modelProviderRef: 'backend:anthropic' },
      },
    },
  })
  const calls: unknown[] = []
  async function* query(input: unknown) {
    calls.push(input)
    yield { type: 'result', result: 'finished' }
  }
  const handler = createClaudeSdkRuntimeHandler({
    defaultWorkspaceDir: () => workspaceDir,
    moduleLoader: async () => ({ query }),
  })

  const thread = await handler({
    method: 'thread/start',
    params: claudeContext(),
  })
  await handler({
    method: 'turn/text/start',
    params: {
      ...claudeContext(),
      threadId: thread.id,
      text: 'hello',
    },
  })

  const env = ((calls[0] as { options?: { env?: Record<string, string | undefined> } }).options?.env) ?? {}
  assert.equal(env.ANTHROPIC_API_KEY, 'mv1.backend-session-token')
  assert.equal(env.ANTHROPIC_BASE_URL, 'https://backend.example')
  assert.equal(env.ANTHROPIC_API_BASE_URL, 'https://backend.example')
  assert.equal(env.CLAUDE_CONFIG_DIR, join(workspaceDir, '.claude'))
})

test('Claude SDK runtime handler defaults to the workspace backend session', async () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-claude-sdk-default-backend-'))
  writeMovScriptBackendConfig(workspaceDir, { baseURL: 'http://localhost:8766' })
  writeMovScriptBackendAuth(workspaceDir, { token: 'mv1.default-backend-token' })
  const calls: unknown[] = []
  async function* query(input: unknown) {
    calls.push(input)
    yield { type: 'result', result: 'finished' }
  }
  const handler = createClaudeSdkRuntimeHandler({
    defaultWorkspaceDir: () => workspaceDir,
    moduleLoader: async () => ({ query }),
  })

  const probe = await handler({
    method: 'runtime/probe',
    params: claudeContext(),
  })
  assert.equal(probe.ok, true)
  assert.equal(probe.credentials?.source, 'movscript-backend-session')
  assert.equal(probe.credentials?.modelEndpointBaseURL, 'http://127.0.0.1:8766')

  const thread = await handler({
    method: 'thread/start',
    params: claudeContext(),
  })
  await handler({
    method: 'turn/text/start',
    params: {
      ...claudeContext(),
      threadId: thread.id,
      text: 'hello',
    },
  })

  const env = ((calls[0] as { options?: { env?: Record<string, string | undefined> } }).options?.env) ?? {}
  assert.equal(env.ANTHROPIC_API_KEY, 'mv1.default-backend-token')
  assert.equal(env.ANTHROPIC_BASE_URL, 'http://127.0.0.1:8766')
  assert.equal(env.ANTHROPIC_API_BASE_URL, 'http://127.0.0.1:8766')
  assert.equal(env.CLAUDE_CONFIG_DIR, join(workspaceDir, '.claude'))
})

test('Claude SDK runtime handler injects saved Agent Console API key through subprocess env', async () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-claude-sdk-saved-key-'))
  writeAgentRuntimeApiKey(workspaceDir, {
    providerKey: 'claude-code',
    apiKey: 'sk-ant-saved-key',
  })
  const calls: unknown[] = []
  async function* query(input: unknown) {
    calls.push(input)
    yield { type: 'result', result: 'finished' }
  }
  const handler = createClaudeSdkRuntimeHandler({
    defaultWorkspaceDir: () => workspaceDir,
    moduleLoader: async () => ({ query }),
  })

  const probe = await handler({
    method: 'runtime/probe',
    params: claudeContext(),
  })
  assert.equal(probe.ok, true)
  assert.equal(probe.credentials?.source, 'movscript-app-settings')

  const thread = await handler({
    method: 'thread/start',
    params: claudeContext(),
  })
  await handler({
    method: 'turn/text/start',
    params: {
      ...claudeContext(),
      threadId: thread.id,
      text: 'hello',
    },
  })

  const env = ((calls[0] as { options?: { env?: Record<string, string | undefined> } }).options?.env) ?? {}
  assert.equal(env.ANTHROPIC_API_KEY, 'sk-ant-saved-key')
  assert.equal(env.CLAUDE_CONFIG_DIR, join(workspaceDir, '.claude'))
})

test('Claude SDK runtime handler preserves SDK reasoning and tool messages as neutral items', async () => {
  async function* query() {
    yield { id: 'reasoning_1', type: 'reasoning', text: 'thinking' }
    yield { id: 'tool_1', type: 'tool_use', name: 'Read', input: { file: 'a.ts' } }
    yield { id: 'result_1', type: 'result', result: 'finished' }
  }
  const handler = createClaudeSdkRuntimeHandler({
    moduleLoader: async () => ({ query }),
  })

  const thread = await handler({
    method: 'thread/start',
    params: claudeContext(),
  })
  const turn = await handler({
    method: 'turn/text/start',
    params: {
      ...claudeContext(),
      threadId: thread.id,
      text: 'inspect',
    },
  })

  assert.deepEqual(turn.items.map((item) => item.type), ['userMessage', 'reasoning', 'mcpToolCall', 'agentMessage'])
})

test('Claude SDK runtime handler reports missing API key credentials with an actionable message', async () => {
  async function* query() {
    throw new Error('Claude Code returned an error result: Not logged in · Please run /login')
  }
  const handler = createClaudeSdkRuntimeHandler({
    moduleLoader: async () => ({ query }),
  })
  const thread = await handler({
    method: 'thread/start',
    params: claudeContext(),
  })

  await assert.rejects(
    () => handler({
      method: 'turn/text/start',
      params: {
        ...claudeContext(),
        threadId: thread.id,
        text: 'hello',
      },
    }),
    /Claude Agent SDK credentials are missing[\s\S]*ANTHROPIC_API_KEY[\s\S]*claude[\s\S]*\/login/,
  )
})

test('SDK runtime handlers report missing package exports as API contract errors', async () => {
  const handler = createCodexSdkRuntimeHandler({
    moduleLoader: async () => ({}),
  })

  await assert.rejects(
    () => handler({
      method: 'runtime/describe',
      params: codexContext(),
    }),
    /does not expose required SDK exports: Codex/,
  )
})

test('SDK runtime probe validates package exports without instantiating SDK clients', async () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-codex-sdk-probe-auth-'))
  writeMovScriptBackendConfig(workspaceDir, { baseURL: 'http://localhost:8766' })
  writeMovScriptBackendAuth(workspaceDir, { token: 'mv1.workspace-backend-token' })
  let constructed = false
  class Codex {
    constructor() {
      constructed = true
      throw new Error('probe should not instantiate')
    }
  }
  const handler = createCodexSdkRuntimeHandler({
    defaultWorkspaceDir: () => workspaceDir,
    moduleLoader: async () => ({ Codex }),
  })

  const probe = await handler({
    method: 'runtime/probe',
    params: codexContext(),
  })

  assert.equal(probe.ok, true)
  assert.equal(constructed, false)
  assert.equal(probe.checks.packageLoad.ok, true)
  assert.equal(probe.checks.requiredExports.ok, true)
  assert.equal(probe.checks.requiredRpcMethods.ok, true)
  assert.equal(probe.credentials?.ok, true)
  assert.equal(probe.credentials?.source, 'movscript-backend-session')
  assert.equal(probe.credentials?.modelEndpointBaseURL, 'http://127.0.0.1:8766/v1')
})

test('SDK runtime probe reports missing package exports as readiness failures', async () => {
  const handler = createClaudeSdkRuntimeHandler({
    moduleLoader: async () => ({}),
  })

  const probe = await handler({
    method: 'runtime/probe',
    params: claudeContext(),
  })

  assert.equal(probe.ok, false)
  assert.equal(probe.checks.packageLoad.ok, true)
  assert.deepEqual(probe.checks.requiredExports.missing, ['query'])
  assert.match(probe.error ?? '', /required SDK exports: query/)
})

test('Claude SDK runtime probe reports missing credentials before send', async () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-claude-sdk-probe-missing-auth-'))
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  async function* query() {
    yield { type: 'result', result: 'finished' }
  }
  try {
    const handler = createClaudeSdkRuntimeHandler({
      defaultWorkspaceDir: () => workspaceDir,
      moduleLoader: async () => ({ query }),
    })

    const probe = await handler({
      method: 'runtime/probe',
      params: claudeContext(),
    })

    assert.equal(probe.ok, false)
    assert.equal(probe.checks.credentials?.ok, false)
    assert.equal(probe.credentials?.configured, false)
    assert.equal(probe.credentials?.env, 'ANTHROPIC_API_KEY')
    assert.match(probe.error ?? '', /ANTHROPIC_API_KEY/)
  } finally {
    if (previousAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = previousAnthropicKey
  }
})

test('SDK runtime describe reports configured package versions', async () => {
  class Codex {
    startThread() {
      return { id: 'thread_1', run: async () => ({ finalResponse: 'ok' }) }
    }
    resumeThread() {
      return { id: 'thread_1', run: async () => ({ finalResponse: 'ok' }) }
    }
  }
  const handler = createCodexSdkRuntimeHandler({
    moduleLoader: async () => ({ Codex }),
  })

  const description = await handler({
    method: 'runtime/describe',
    params: {
      ...codexContext(),
      runtime: {
        ...codexContext().runtime,
        packageVersion: '1.2.3',
      },
    },
  })

  assert.equal(description.sdk?.version, '1.2.3')
  assert.deepEqual(description.contract.requiredPackageExports, ['Codex'])
  assert.deepEqual(description.contract.requiredRpcMethods, SDK_RUNTIME_REQUIRED_RPC_METHODS)
  assert.equal(description.contract.support.capabilities.account.supported, true)
  assert.equal(description.contract.support.thread.stream.level, 'supported')
})

test('SDK runtime capabilities expose structured backend support gaps', async () => {
  async function* query() {
    yield { type: 'result', result: 'finished' }
  }
  const handler = createClaudeSdkRuntimeHandler({
    moduleLoader: async () => ({ query }),
  })

  const capabilities = await handler({
    method: 'capabilities/get',
    params: claudeContext(),
  })

  assert.equal(capabilities.support.capabilities.config.supported, false)
  assert.equal(capabilities.support.capabilities.config.level, 'unsupported')
  assert.match(capabilities.unsupported.config, /Claude Agent SDK/)
  assert.deepEqual(capabilities.warnings, Object.values(capabilities.unsupported))
})

test('SDK runtime handlers implement the neutral thread management RPC surface', async () => {
  class Codex {
    startThread() {
      return { id: 'managed_thread', run: async () => ({ finalResponse: 'done' }) }
    }
    resumeThread() {
      return { id: 'managed_thread', run: async () => ({ finalResponse: 'done' }) }
    }
  }
  const context = {
    ...codexContext(),
    runtime: {
      ...codexContext().runtime,
      id: 'codex-management-runtime',
    },
  }
  const handler = createCodexSdkRuntimeHandler({
    moduleLoader: async () => ({ Codex }),
  })

  const thread = await handler({
    method: 'thread/start',
    params: context,
  })
  const renamed = await handler({
    method: 'thread/rename',
    params: {
      ...context,
      threadId: thread.id,
      name: 'Managed',
    },
  })
  const settings = await handler({
    method: 'thread/settings/update',
    params: {
      ...context,
      threadId: thread.id,
      cwd: '/repo',
      model: 'gpt-5.4',
    },
  })
  const goal = await handler({
    method: 'thread/goal/set',
    params: {
      ...context,
      threadId: thread.id,
      objective: 'finish integration',
      status: 'active',
      tokenBudget: 1000,
    },
  })
  const steer = await handler({
    method: 'turn/steer',
    params: {
      ...context,
      threadId: thread.id,
      turnId: 'turn_1',
      inputs: [{ type: 'text', text: 'keep going', textElements: [] }],
    },
  })
  const archived = await handler({
    method: 'thread/archive',
    params: {
      ...context,
      threadId: thread.id,
    },
  })
  await handler({
    method: 'thread/unarchive',
    params: {
      ...context,
      threadId: thread.id,
    },
  })
  const deleted = await handler({
    method: 'thread/delete',
    params: {
      ...context,
      threadId: thread.id,
    },
  })

  assert.equal(renamed.name, 'Managed')
  assert.deepEqual(settings, { cwd: '/repo', model: 'gpt-5.4' })
  assert.equal(goal.objective, 'finish integration')
  assert.equal(steer.status, 'completed')
  assert.equal((archived.raw as { archived?: boolean }).archived, true)
  assert.deepEqual(deleted, { ok: true })
  await assert.rejects(
    () => handler({
      method: 'thread/read',
      params: {
        ...context,
        threadId: thread.id,
      },
    }),
    /SDK runtime thread not found/,
  )
})

test('SDK runtime handlers resume missing thread records before lifecycle mutations', async () => {
  const calls: string[] = []
  class Codex {
    startThread() {
      throw new Error('unexpected start')
    }
    resumeThread(threadId: string) {
      calls.push(`resume:${threadId}`)
      return { id: threadId, run: async () => ({ finalResponse: 'done' }) }
    }
  }
  const context = {
    ...codexContext(),
    runtime: {
      ...codexContext().runtime,
      id: 'codex-missing-record-runtime',
    },
  }
  const handler = createCodexSdkRuntimeHandler({
    moduleLoader: async () => ({ Codex }),
  })

  const archived = await handler({
    method: 'thread/archive',
    params: {
      ...context,
      threadId: 'managed_history_thread',
    },
  })
  await handler({
    method: 'thread/unarchive',
    params: {
      ...context,
      threadId: 'managed_history_thread',
    },
  })

  assert.deepEqual(calls, ['resume:managed_history_thread'])
  assert.equal((archived.raw as { archived?: boolean }).archived, true)
})

test('SDK runtime handlers publish neutral thread and turn notifications', async () => {
  class Codex {
    startThread() {
      return { id: 'notified_thread', run: async () => ({ finalResponse: 'done' }) }
    }
    resumeThread() {
      return { id: 'notified_thread', run: async () => ({ finalResponse: 'done' }) }
    }
  }
  const context = {
    ...codexContext(),
    runtime: {
      ...codexContext().runtime,
      id: 'codex-notification-runtime',
    },
  }
  const received: string[] = []
  const unregister = registerSdkRuntimeSubscription({
    subscriptionId: 'handler-notifications',
    runtimeId: context.runtime.id,
    threadId: 'notified_thread',
    sendNotification: (event) => received.push(event.notification.method),
  })
  const handler = createCodexSdkRuntimeHandler({
    moduleLoader: async () => ({ Codex }),
  })

  try {
    const thread = await handler({
      method: 'thread/start',
      params: context,
    })
    await handler({
      method: 'turn/text/start',
      params: {
        ...context,
        threadId: thread.id,
        text: 'hello',
      },
    })

    assert.deepEqual(received, [
      'thread/started',
      'thread/status/changed',
      'turn/started',
      'item/agentMessage/delta',
      'turn/completed',
      'thread/status/changed',
    ])
  } finally {
    unregister()
  }
})

test('Codex SDK runtime publishes streamed assistant deltas before the turn settles', async () => {
  let releaseStream!: () => void
  const streamBlocker = new Promise<void>((resolve) => {
    releaseStream = resolve
  })
  async function* streamEvents() {
    yield { type: 'item.updated', item: { id: 'item_1', type: 'agent_message', text: 'hel' } }
    await streamBlocker
    yield { type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text: 'hello' } }
    yield {
      type: 'turn.completed',
      usage: {
        cached_input_tokens: 0,
        input_tokens: 1,
        output_tokens: 1,
        reasoning_output_tokens: 0,
      },
    }
  }
  const calls: string[] = []
  class Codex {
    startThread() {
      return {
        id: 'codex_stream_thread',
        run: async () => {
          throw new Error('unexpected buffered run')
        },
        runStreamed: async (prompt: string, options?: Record<string, unknown>) => {
          calls.push(`stream:${prompt}:${options?.model}`)
          return { events: streamEvents() }
        },
      }
    }
    resumeThread() {
      return this.startThread()
    }
  }
  const context = {
    ...codexContext(),
    runtime: {
      ...codexContext().runtime,
      id: 'codex-streaming-runtime',
    },
  }
  const handler = createCodexSdkRuntimeHandler({
    moduleLoader: async () => ({ Codex }),
  })
  const thread = await handler({
    method: 'thread/start',
    params: context,
  })
  const received: Array<{ method: string; delta?: string }> = []
  const unregister = registerSdkRuntimeSubscription({
    subscriptionId: 'codex-streaming-notifications',
    runtimeId: context.runtime.id,
    threadId: thread.id,
    sendNotification: (event) => {
      const params = event.notification.params as { delta?: string } | undefined
      received.push({ method: event.notification.method, ...(params?.delta ? { delta: params.delta } : {}) })
    },
  })

  try {
    const turnPromise = handler({
      method: 'turn/text/start',
      params: {
        ...context,
        threadId: thread.id,
        text: 'hello',
        model: 'gpt-5.4',
      },
    })
    await new Promise((resolve) => setImmediate(resolve))

    assert.deepEqual(received.filter((event) => event.method === 'item/agentMessage/delta'), [
      { method: 'item/agentMessage/delta', delta: 'hel' },
    ])
    assert.equal(received.some((event) => event.method === 'turn/completed'), false)

    releaseStream()
    const turn = await turnPromise
    const agentMessages = turn.items.filter((item): item is Extract<typeof item, { type: 'agentMessage' }> => item.type === 'agentMessage')
    assert.deepEqual(calls, ['stream:hello:gpt-5.4'])
    assert.equal(agentMessages.at(-1)?.id, 'item_1')
    assert.equal(agentMessages.at(-1)?.text, 'hello')
    assert.deepEqual(received.filter((event) => event.method === 'item/agentMessage/delta'), [
      { method: 'item/agentMessage/delta', delta: 'hel' },
      { method: 'item/agentMessage/delta', delta: 'lo' },
    ])
    assert.equal(received.at(-2)?.method, 'turn/completed')
  } finally {
    unregister()
    releaseStream()
  }
})

test('Codex SDK runtime preserves direct delta-only stream text as final turn output', async () => {
  async function* streamEvents() {
    yield { type: 'agent.delta', itemId: 'assistant_direct_1', delta: 'hello ' }
    yield { type: 'agent.delta', itemId: 'assistant_direct_1', delta: 'world' }
    yield {
      type: 'turn.completed',
      usage: {
        cached_input_tokens: 0,
        input_tokens: 1,
        output_tokens: 2,
        reasoning_output_tokens: 0,
      },
    }
  }
  class Codex {
    startThread() {
      return {
        id: 'codex_direct_delta_thread',
        run: async () => {
          throw new Error('unexpected buffered run')
        },
        runStreamed: async () => ({ events: streamEvents() }),
      }
    }
    resumeThread() {
      return this.startThread()
    }
  }
  const context = {
    ...codexContext(),
    runtime: {
      ...codexContext().runtime,
      id: 'codex-direct-delta-runtime',
    },
  }
  const received: string[] = []
  const unregister = registerSdkRuntimeSubscription({
    subscriptionId: 'codex-direct-delta-notifications',
    runtimeId: context.runtime.id,
    threadId: 'codex_direct_delta_thread',
    sendNotification: (event) => {
      const params = event.notification.params as { delta?: string } | undefined
      if (event.notification.method === 'item/agentMessage/delta' && params?.delta) received.push(params.delta)
    },
  })
  const handler = createCodexSdkRuntimeHandler({
    moduleLoader: async () => ({ Codex }),
  })

  try {
    const thread = await handler({
      method: 'thread/start',
      params: context,
    })
    const turn = await handler({
      method: 'turn/text/start',
      params: {
        ...context,
        threadId: thread.id,
        text: 'hello',
      },
    })

    assert.deepEqual(received, ['hello ', 'world'])
    const agentMessages = turn.items.filter((item): item is Extract<typeof item, { type: 'agentMessage' }> => item.type === 'agentMessage')
    assert.equal(agentMessages.at(-1)?.text, 'hello world')
  } finally {
    unregister()
  }
})

test('SDK runtime handlers publish failed turn notifications when provider execution fails', async () => {
  class Codex {
    startThread() {
      return {
        id: 'failed_thread',
        run: async () => {
          throw new Error('provider exploded')
        },
      }
    }
    resumeThread() {
      return {
        id: 'failed_thread',
        run: async () => {
          throw new Error('provider exploded')
        },
      }
    }
  }
  const context = {
    ...codexContext(),
    runtime: {
      ...codexContext().runtime,
      id: 'codex-failed-notification-runtime',
    },
  }
  const received: Array<{ method: string; status?: string }> = []
  const unregister = registerSdkRuntimeSubscription({
    subscriptionId: 'handler-failed-notifications',
    runtimeId: context.runtime.id,
    threadId: 'failed_thread',
    sendNotification: (event) => {
      const params = event.notification.params as { status?: string } | undefined
      received.push({ method: event.notification.method, ...(params?.status ? { status: params.status } : {}) })
    },
  })
  const handler = createCodexSdkRuntimeHandler({
    moduleLoader: async () => ({ Codex }),
  })

  try {
    const thread = await handler({
      method: 'thread/start',
      params: context,
    })
    await assert.rejects(
      () => handler({
        method: 'turn/text/start',
        params: {
          ...context,
          threadId: thread.id,
          text: 'hello',
        },
      }),
      /provider exploded/,
    )
    const savedThread = await handler({
      method: 'thread/read',
      params: {
        ...context,
        threadId: thread.id,
      },
    })

    assert.equal(savedThread.status, 'failed')
    assert.equal(savedThread.turns.at(-1)?.status, 'failed')
    assert.equal(savedThread.turns.at(-1)?.error?.message, 'provider exploded')
    assert.deepEqual(received.map((event) => event.method), [
      'thread/started',
      'thread/status/changed',
      'turn/started',
      'turn/failed',
      'thread/status/changed',
    ])
    assert.equal(received.at(-1)?.status, 'failed')
  } finally {
    unregister()
  }
})

test('Claude SDK runtime publishes assistant deltas before the turn settles', async () => {
  let releaseStream!: () => void
  const streamBlocker = new Promise<void>((resolve) => {
    releaseStream = resolve
  })
  async function* query() {
    yield { type: 'assistant', text: 'streaming draft' }
    await streamBlocker
    yield { type: 'result', result: 'finished' }
  }
  const context = {
    ...claudeContext(),
    runtime: {
      ...claudeContext().runtime,
      id: 'claude-streaming-runtime',
    },
  }
  const handler = createClaudeSdkRuntimeHandler({
    moduleLoader: async () => ({ query }),
  })
  const thread = await handler({
    method: 'thread/start',
    params: context,
  })
  const received: Array<{ method: string; delta?: string }> = []
  const unregister = registerSdkRuntimeSubscription({
    subscriptionId: 'claude-streaming-notifications',
    runtimeId: context.runtime.id,
    threadId: thread.id,
    sendNotification: (event) => {
      const params = event.notification.params as { delta?: string } | undefined
      received.push({ method: event.notification.method, ...(params?.delta ? { delta: params.delta } : {}) })
    },
  })

  try {
    const turnPromise = handler({
      method: 'turn/text/start',
      params: {
        ...context,
        threadId: thread.id,
        text: 'hello',
      },
    })
    await new Promise((resolve) => setImmediate(resolve))

    assert.deepEqual(received.filter((event) => event.method === 'item/agentMessage/delta'), [
      { method: 'item/agentMessage/delta', delta: 'streaming draft' },
    ])
    assert.equal(received.some((event) => event.method === 'turn/completed'), false)

    releaseStream()
    const turn = await turnPromise
    const agentMessages = turn.items.filter((item): item is Extract<typeof item, { type: 'agentMessage' }> => item.type === 'agentMessage')
    assert.equal(agentMessages.at(-1)?.text, 'finished')
    assert.equal(received.filter((event) => event.method === 'item/agentMessage/delta').length, 1)
    assert.equal(received.at(-2)?.method, 'turn/completed')
  } finally {
    unregister()
    releaseStream()
  }
})

function codexContext() {
  const provider = DEFAULT_PROVIDER_SETTINGS.providers.find((item) => item.id === CODEX_PROVIDER_ID)!
  return {
    provider,
    runtime: {
      ...providerRuntimeProfile(provider),
      id: 'codex-codex-sdk',
      api: 'codex-sdk',
    },
  }
}

function movaContext() {
  const provider = DEFAULT_PROVIDER_SETTINGS.providers.find((item) => item.id === MOVA_PROVIDER_ID)!
  return {
    provider,
    runtime: providerRuntimeProfile(provider),
  }
}

function claudeContext() {
  const provider = DEFAULT_PROVIDER_SETTINGS.providers.find((item) => item.id === 'claude')!
  return {
    provider,
    runtime: providerRuntimeProfile(provider),
  }
}
