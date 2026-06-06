import assert from 'node:assert/strict'
import test from 'node:test'

import { prepareSendProviderSession, type PrepareSendProviderSessionDeps } from './agentSendProviderSessionReadiness'
import type { AgentSendWorkspace } from '@/features/agent/application/agentSendWorkspace'

test('prepareSendProviderSession starts provider session service, syncs model config, and marks session run', async () => {
  const calls: string[] = []
  await prepareSendProviderSession({
    workspace: workspace({ providerModelId: 'runtime-model' }),
    providerSessionOnline: false,
    providerSessionBaseURL: 'http://localhost:4123',
    signal: new AbortController().signal,
    deps: depsFixture(calls),
  })

  assert.deepEqual(calls, [
    'start:provider-session-ensure-running:http://localhost:4123',
    'ensureRunning',
    'complete:provider-session-ensure-running:completed',
    'refetchHealth',
    'thinking',
    'started:http-request-provider-save-model-config',
    'syncModel:runtime-model',
    'complete:http-request-provider-save-model-config:completed',
    'started:http-request-provider-session-message-run',
  ])
})

test('prepareSendProviderSession skips ensure-running when provider session is already online and falls back to model name', async () => {
  const calls: string[] = []
  await prepareSendProviderSession({
    workspace: workspace({ name: 'display-model' }),
    providerSessionOnline: true,
    providerSessionBaseURL: 'http://localhost:4123',
    signal: new AbortController().signal,
    deps: depsFixture(calls),
  })

  assert.equal(calls.includes('ensureRunning'), false)
  assert.equal(calls.includes('refetchHealth'), false)
  assert.equal(calls.includes('syncModel:display-model'), true)
  assert.equal(calls.some((call) => call.startsWith('start:provider-session-mcp-ready')), false)
})

test('prepareSendProviderSession stops after ensure-running if the send signal is aborted', async () => {
  const calls: string[] = []
  const controller = new AbortController()
  const deps = depsFixture(calls)
  deps.ensureRunning = async () => {
    calls.push('ensureRunning')
    controller.abort(new Error('stopped'))
  }

  await assert.rejects(
    () => prepareSendProviderSession({
      workspace: workspace(),
      providerSessionOnline: false,
      providerSessionBaseURL: 'http://localhost:4123',
      signal: controller.signal,
      deps,
    }),
    /stopped/,
  )
  assert.equal(calls.includes('refetchHealth'), false)
})

function depsFixture(calls: string[]): PrepareSendProviderSessionDeps {
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
    refetchProviderSessionHealth: async () => {
      calls.push('refetchHealth')
    },
    syncProviderSessionModelConfig: async (model) => {
      calls.push(`syncModel:${model}`)
    },
    setPendingAssistantThinking: () => {
      calls.push('thinking')
    },
    abortError: () => new Error('aborted'),
  }
}

function workspace(model: Partial<AgentSendWorkspace['model']> = {}): AgentSendWorkspace {
  return {
    id: 'workspace_1',
    createdAt: 1,
    route: 'provider-session',
    visibleUserContent: 'Hello',
    attachments: [],
    model: { id: 1, ...model },
    agent: { id: null },
    settings: {
      includeProjectContext: true,
      includeRecentResources: false,
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
    providerSession: {},
    warnings: [],
  }
}
