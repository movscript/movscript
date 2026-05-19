import assert from 'node:assert/strict'
import test from 'node:test'

import { prepareSendRuntime, type PrepareSendRuntimeDeps } from './agentSendRuntimeReadiness'
import type { AgentSendDraft } from './agentSendDraft'

test('prepareSendRuntime starts local runtime, checks MCP, syncs model config, and marks create thread', async () => {
  const calls: string[] = []
  await prepareSendRuntime({
    draft: draft({ runtimeModelId: 'runtime-model' }),
    localAgentOnline: false,
    localAgentBaseURL: 'http://localhost:4123',
    mcpEndpoint: 'http://localhost:4124',
    signal: new AbortController().signal,
    deps: depsFixture(calls),
  })

  assert.deepEqual(calls, [
    'start:local-runtime-ensure-running:http://localhost:4123',
    'ensureRunning',
    'complete:local-runtime-ensure-running:completed',
    'refetchHealth',
    'start:local-runtime-mcp-ready:http://localhost:4124',
    'assertMCPReady',
    'complete:local-runtime-mcp-ready:completed',
    'thinking',
    'started:http-request-local-save-model-config',
    'syncModel:runtime-model',
    'complete:http-request-local-save-model-config:completed',
    'started:http-request-local-create-thread',
  ])
})

test('prepareSendRuntime skips ensure-running when runtime is already online and falls back to model name', async () => {
  const calls: string[] = []
  await prepareSendRuntime({
    draft: draft({ name: 'display-model' }),
    localAgentOnline: true,
    localAgentBaseURL: 'http://localhost:4123',
    signal: new AbortController().signal,
    deps: depsFixture(calls),
  })

  assert.equal(calls.includes('ensureRunning'), false)
  assert.equal(calls.includes('refetchHealth'), false)
  assert.equal(calls.includes('syncModel:display-model'), true)
  assert.equal(calls.includes('start:local-runtime-mcp-ready:http://localhost:4123'), true)
})

test('prepareSendRuntime stops after ensure-running if the send signal is aborted', async () => {
  const calls: string[] = []
  const controller = new AbortController()
  const deps = depsFixture(calls)
  deps.ensureRunning = async () => {
    calls.push('ensureRunning')
    controller.abort(new Error('stopped'))
  }

  await assert.rejects(
    () => prepareSendRuntime({
      draft: draft(),
      localAgentOnline: false,
      localAgentBaseURL: 'http://localhost:4123',
      signal: controller.signal,
      deps,
    }),
    /stopped/,
  )
  assert.equal(calls.includes('refetchHealth'), false)
  assert.equal(calls.includes('assertMCPReady'), false)
})

function depsFixture(calls: string[]): PrepareSendRuntimeDeps {
  return {
    startActivityEvent: (event) => {
      calls.push(`start:${event.id}:${event.summary}`)
    },
    completeActivityEvent: (id, status = 'completed') => {
      calls.push(`complete:${id}:${status}`)
    },
    markActivityEventStarted: (id) => {
      calls.push(`started:${id}`)
    },
    ensureRunning: async () => {
      calls.push('ensureRunning')
    },
    refetchLocalAgentHealth: async () => {
      calls.push('refetchHealth')
    },
    assertMCPReady: async () => {
      calls.push('assertMCPReady')
    },
    syncRuntimeModelConfig: async (model) => {
      calls.push(`syncModel:${model}`)
    },
    setPendingAssistantThinking: () => {
      calls.push('thinking')
    },
    abortError: () => new Error('aborted'),
  }
}

function draft(model: Partial<AgentSendDraft['model']> = {}): AgentSendDraft {
  return {
    id: 'draft_1',
    createdAt: 1,
    route: 'local-runtime',
    visibleUserContent: 'Hello',
    attachments: [],
    model: { id: 1, ...model },
    agent: { id: null },
    settings: {
      permissionMode: 'ask',
      includeProjectContext: true,
      includeRecentResources: false,
      autoPlan: false,
    },
    contextLabels: [],
    context: { recentResources: [] },
    outbound: {
      systemPrompt: '',
      agentContext: '',
      enrichedUserContent: 'Hello',
      messages: [],
    },
    httpRequests: [],
    localRuntime: {},
    warnings: [],
  }
}
