import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
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
} from './sdkRuntimeDefaultHandlers'
import {
  CODEX_PROVIDER_ID,
  DEFAULT_PROVIDER_SETTINGS,
  providerRuntimeProfile,
} from '../../src/shared/infrastructure/providerConfigStore'
import { registerSdkRuntimeSubscription } from './sdkRuntimeHost'
import { SDK_RUNTIME_REQUIRED_RPC_METHODS } from '../../src/shared/infrastructure/sdk-runtime/sdkRuntimeProtocol'

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

test('Codex SDK runtime handler resolves workspace context cwd and CODEX_HOME', async () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-codex-sdk-workspace-'))
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
      workspaceContext: { scope: 'project', projectId: 42 },
    },
  })

  const expectedCwd = join(workspaceDir, 'local', 'projects', 'project_42')
  assert.equal(thread.cwd, expectedCwd)
  assert.equal((starts[0] as { workingDirectory?: string }).workingDirectory, expectedCwd)
  const options = constructed[0] as { env?: Record<string, string | undefined> }
  assert.equal(options.env?.CODEX_HOME, join(workspaceDir, '.codex'))
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
        baseURL: 'http://localhost:8766/api/v1',
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

  const options = constructed[0] as { baseUrl?: string; apiKey?: string; env?: Record<string, string | undefined> }
  assert.equal(options.baseUrl, 'http://127.0.0.1:8766/v1')
  assert.equal(options.apiKey, 'mv1.backend-session-token')
  assert.equal(options.env?.CODEX_HOME, join(workspaceDir, '.codex'))
})

test('Claude SDK runtime handler calls query and maps streamed result messages', async () => {
  const calls: unknown[] = []
  async function* query(input: unknown) {
    calls.push(input)
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

  const firstCall = calls[0] as { prompt?: string; options?: Record<string, unknown> }
  assert.equal(firstCall.prompt, 'summarize')
  assert.equal(firstCall.options?.cwd, '/repo')
  assert.equal(firstCall.options?.model, 'claude-opus-4-6')
  assert.equal(firstCall.options?.resume, thread.id)
  assert.equal(typeof firstCall.options?.env, 'object')
  const agentMessages = turn.items.filter((item): item is Extract<typeof item, { type: 'agentMessage' }> => item.type === 'agentMessage')
  assert.equal(agentMessages.at(-1)?.text, 'finished')
})

test('Claude SDK runtime handler resolves workspace context cwd and CLAUDE_CONFIG_DIR', async () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-claude-sdk-workspace-'))
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
      workspaceContext: { scope: 'project', projectId: 42 },
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

  const expectedCwd = join(workspaceDir, 'local', 'projects', 'project_42')
  const options = (calls[0] as { options?: Record<string, unknown> }).options ?? {}
  assert.equal(thread.cwd, expectedCwd)
  assert.equal(options.cwd, expectedCwd)
  assert.equal((options.env as Record<string, string | undefined>).CLAUDE_CONFIG_DIR, join(workspaceDir, '.claude'))
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
  assert.equal(env.ANTHROPIC_BASE_URL, 'https://backend.example/v1')
  assert.equal(env.ANTHROPIC_API_BASE_URL, 'https://backend.example/v1')
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
  let constructed = false
  class Codex {
    constructor() {
      constructed = true
      throw new Error('probe should not instantiate')
    }
  }
  const handler = createCodexSdkRuntimeHandler({
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

function claudeContext() {
  const provider = DEFAULT_PROVIDER_SETTINGS.providers.find((item) => item.id === 'claude')!
  return {
    provider,
    runtime: providerRuntimeProfile(provider),
  }
}
