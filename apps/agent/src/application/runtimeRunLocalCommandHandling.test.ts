import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { createEmptyCatalogRegistry } from '../catalog/registry.js'
import { parseAgentCommand } from '../context/commandRouter.js'
import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import { BackendApplyClient } from '../drafts/backendApplyClient.js'
import { InMemoryAgentDraftStore } from '../drafts/draftStore.js'
import { KnowledgeManager } from '../knowledge/knowledgeManager.js'
import { EMPTY_KNOWLEDGE_STORE } from '../knowledge/knowledgeStore.js'
import { MemoryManager } from '../memory/memoryManager.js'
import { InMemoryAgentMemoryStore } from '../memory/memoryStore.js'
import { InMemoryAgentStore } from '../state/store.js'
import { buildAgentUpdateState } from '../updates/updatePolicy.js'
import type {
  AgentCapabilitiesResponse,
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentThread,
  JSONValue,
} from '../state/types.js'
import { StaticToolRegistry } from '../tools/toolRegistry.js'
import type { AgentRuntimeCatalogSnapshot } from './runtimeCatalogSnapshot.js'
import { applyRuntimeRunLocalCommandHandling } from './runtimeRunLocalCommandHandling.js'
import type { RuntimeRunSetupResolution } from './runtimeRunSetupResolution.js'

test('applyRuntimeRunLocalCommandHandling handles diagnostic commands through the dispatch boundary', async () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  const thread = makeThread()
  store.createThread(thread)
  store.createRun(run)

  const handled = await applyRuntimeRunLocalCommandHandling({
    ...baseInput(store, run, thread, '/context'),
  })

  assert.equal(handled, true)
  assert.equal(run.status, 'completed')
  assert.equal(store.getThread(thread.id)?.messages.at(-1)?.role, 'assistant')
})

test('applyRuntimeRunLocalCommandHandling executes generation commands with catalog snapshot tools', async () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  const thread = makeThread()
  store.createThread(thread)
  store.createRun(run)
  const calls: Array<{ name: string; args?: Record<string, JSONValue> }> = []

  const handled = await applyRuntimeRunLocalCommandHandling({
    ...baseInput(store, run, thread, '/image a title card'),
    catalogManager: {
      startIO: async (_run, args) => {
        calls.push({ name: 'agent_io_start', args })
        return { status: 'started', operation: { id: 'io_1', kind: 'generation_job', status: 'running' } } as JSONValue
      },
      waitIO: async (_run, args) => {
        calls.push({ name: 'agent_io_wait', args })
        return { status: 'completed', done: true, completed: [], failed: [], cancelled: [], pending: [] } as JSONValue
      },
    } as Parameters<typeof applyRuntimeRunLocalCommandHandling>[0]['catalogManager'],
  })

  assert.equal(handled, true)
  assert.equal(run.status, 'completed')
  assert.equal(calls[0]?.name, 'agent_io_start')
  assert.equal(calls[1]?.name, 'agent_io_wait')
  assert.equal((run.metadata?.forcedToolCall as any)?.name, 'agent_io_start')
})

function baseInput(
  store: InMemoryAgentStore,
  run: AgentRun,
  thread: AgentThread,
  message: string,
): Parameters<typeof applyRuntimeRunLocalCommandHandling>[0] {
  const memoryStore = new InMemoryAgentMemoryStore()
  const memoryManager = new MemoryManager(memoryStore)
  return {
    store,
    run,
    thread,
    command: parseAgentCommand(message),
    setup: setupResolution(),
    memories: [],
    history: thread.messages,
    userMessage: message,
    memoryStore,
    contractResolver: emptyContractResolver(),
    catalogSnapshot: catalogSnapshot(),
    mcpClient: {
      initialize: async () => ({}),
      callTool: async () => ({ ok: true }),
    },
    draftStore: new InMemoryAgentDraftStore(),
    backendApplyClient: new BackendApplyClient(),
    memoryManager,
    knowledgeManager: new KnowledgeManager(EMPTY_KNOWLEDGE_STORE),
    catalogManager: {} as Parameters<typeof applyRuntimeRunLocalCommandHandling>[0]['catalogManager'],
    now: () => '2026-01-01T00:00:01.000Z',
    timestampMs: monotonicClock(1000, 1010, 1020, 1030),
    recordTrace: () => {},
    createStep: (targetRun, type, round, toolName) => {
      const step: AgentRunStep = {
        id: `step_${targetRun.steps.length + 1}`,
        runId: targetRun.id,
        type,
        status: 'in_progress',
        createdAt: '2026-01-01T00:00:00.000Z',
        ...(round ? {
          roundId: round.roundId,
          roundIndex: round.roundIndex,
          roundLabel: round.roundLabel,
          roundSource: round.roundSource,
        } : {}),
        ...(toolName ? { toolName } : {}),
      }
      targetRun.steps.push(step)
      return step
    },
    emitAssistantMessage: () => {},
    emitRunSnapshot: () => {},
  }
}

function setupResolution(): Pick<RuntimeRunSetupResolution, 'activeManifest' | 'skills' | 'layers' | 'capabilities' | 'debugContext'> {
  return {
    activeManifest: DEFAULT_AGENT_MANIFEST,
    skills: [],
    capabilities: capabilities(),
    debugContext: {
      route: { pathname: '/agent' },
      projects: [],
      project: undefined,
      selection: null,
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
  }
}

function capabilities(): AgentCapabilitiesResponse {
  return {
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    mcp: {
      connected: true,
      resources: [],
      tools: [],
    },
    registry: [],
    resolvedTools: {
      discovered: [],
      available: [],
      blocked: [],
      byName: {},
    },
    warnings: [],
    updates: buildAgentUpdateState({
      runtimeVersion: 'test-runtime',
      manifestVersion: 'test-manifest',
    }),
  }
}

function catalogSnapshot(): AgentRuntimeCatalogSnapshot {
  return {
    id: 'catalog_1',
    catalogVersion: null,
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: new StaticToolRegistry([]),
    layeredRegistry: createEmptyCatalogRegistry('catalog_v1'),
    pluginWarnings: [],
  }
}

function emptyContractResolver(): AgentRuntimeContractResolver {
  return {
    find: () => undefined,
    requiresConfiguredModel: () => false,
  }
}

function makeRun(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
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
  }
}

function makeThread(): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    messages: [message('msg_user', 'user', 'hello')],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function message(id: string, role: AgentMessage['role'], content: string): AgentMessage {
  return {
    id,
    threadId: 'thread_1',
    role,
    content,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function monotonicClock(...values: number[]): () => number {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)] ?? 0
}
