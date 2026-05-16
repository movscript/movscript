import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentManifest } from '../catalog/agentManifest.js'
import { createEmptyCatalogRegistry } from '../catalog/registry.js'
import type { AgentMessage, AgentRun, AgentThread } from '../state/types.js'
import type { AgentRuntimeCatalogSnapshot } from './runtimeCatalogSnapshot.js'
import { StaticToolRegistry } from '../tools/toolRegistry.js'
import { prepareRuntimeRunExecutionPreflight } from './runtimeRunExecutionPreflight.js'

test('prepareRuntimeRunExecutionPreflight skips missing and cancelled runs', async () => {
  const store = new InMemoryAgentStore()
  const cancelled = makeRun({ id: 'run_cancelled', status: 'cancelled' })
  store.createThread(makeThread())
  store.createRun(cancelled)
  let titleCalls = 0

  const missing = await prepareRuntimeRunExecutionPreflight({
    runId: 'missing',
    store,
    catalogSnapshots: fakeCatalogSnapshots(),
    getAuth: () => ({}),
    throwIfRunCancelled: () => {},
    ensureThreadTitle: async () => {
      titleCalls += 1
    },
  })
  const skipped = await prepareRuntimeRunExecutionPreflight({
    runId: 'run_cancelled',
    store,
    catalogSnapshots: fakeCatalogSnapshots(),
    getAuth: () => ({}),
    throwIfRunCancelled: () => {},
    ensureThreadTitle: async () => {
      titleCalls += 1
    },
  })

  assert.equal(missing.skipped, true)
  assert.equal(missing.run, undefined)
  assert.equal(skipped.skipped, true)
  assert.equal(skipped.run?.id, 'run_cancelled')
  assert.equal(titleCalls, 0)
})

test('prepareRuntimeRunExecutionPreflight checks cancellation, resolves title source, and returns catalog snapshot', async () => {
  const store = new InMemoryAgentStore()
  const user = makeMessage({ id: 'msg_1', content: 'original user message' })
  const thread = makeThread({ messages: [user] })
  const run = makeRun({
    input: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: 'frozen user request',
      sourceMessageId: 'msg_1',
      executionMode: 'chat',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  })
  store.createThread(thread)
  store.createRun(run)
  const catalogSnapshot = makeCatalogSnapshot('catalog_1')
  const checked: string[] = []
  const titles: Array<{ threadId: string; content?: string; auth?: string; runId: string }> = []

  const result = await prepareRuntimeRunExecutionPreflight({
    runId: run.id,
    store,
    catalogSnapshots: fakeCatalogSnapshots(catalogSnapshot),
    getAuth: () => ({ backendAuthToken: 'token_1' }),
    throwIfRunCancelled: (runId) => checked.push(runId),
    ensureThreadTitle: async (targetThread, titleUser, auth, _signal, targetRunId) => {
      titles.push({
        threadId: targetThread.id,
        content: titleUser?.content,
        auth: auth?.backendAuthToken,
        runId: targetRunId,
      })
    },
  })

  assert.equal(result.skipped, false)
  assert.equal(result.run?.id, 'run_1')
  assert.equal(result.thread?.id, 'thread_1')
  assert.equal(result.titleUser?.content, 'frozen user request')
  assert.equal(result.catalogSnapshot?.id, 'catalog_1')
  assert.deepEqual(checked, ['run_1'])
  assert.deepEqual(titles, [{
    threadId: 'thread_1',
    content: 'frozen user request',
    auth: 'token_1',
    runId: 'run_1',
  }])
})

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: 'msg_1',
    threadId: 'thread_1',
    role: 'user',
    content: 'hello',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'queued',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}

function fakeCatalogSnapshots(snapshot = makeCatalogSnapshot('catalog_default')): { getForRun(runId: string): AgentRuntimeCatalogSnapshot } {
  return {
    getForRun: () => snapshot,
  }
}

function makeCatalogSnapshot(id: string): AgentRuntimeCatalogSnapshot {
  const manifest: AgentManifest = {
    schema: 'movscript.agent.current',
    id: 'agent',
    name: 'Agent',
    version: '1.0.0',
    tools: [],
  }
  return {
    id,
    catalogVersion: null,
    defaultAgentManifest: manifest,
    toolRegistry: new StaticToolRegistry([]),
    layeredRegistry: createEmptyCatalogRegistry('catalog_v1'),
    pluginWarnings: [],
  }
}
