import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../../../../catalog/manifest/agentManifest.js'
import { createEmptyCatalogRegistry } from '../../../../catalog/registry/core/registry.js'
import { parseAgentCommand } from '../../../../context/command/commandRouter.js'
import type { AgentRuntimeContractResolver } from '../../../../contracts/runtime/runtimeContract.js'
import { InMemoryAgentWorkspaceStore } from '../../../../workspaces/store/workspaceStore.js'
import { ReferenceManager } from '../../../../reference/manager/referenceManager.js'
import { EMPTY_REFERENCE_STORE } from '../../../../reference/store/referenceStore.js'
import { MemoryManager } from '../../../../memory/manager/memoryManager.js'
import { InMemoryAgentMemoryStore } from '../../../../memory/store/in-memory/memoryStore.js'
import { InMemoryAgentStore } from '../../../../state/store/core/store.js'
import { buildAgentUpdateState } from '../../../../updates/policy/updatePolicy.js'
import type {
  AgentCapabilitiesResponse,
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentThread,
  JSONValue,
} from '../../../../state/shared/types.js'
import { StaticToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'
import type { AgentRuntimeCatalogSnapshot } from '../../../catalog/snapshot/core/runtimeCatalogSnapshot.js'
import { applyRuntimeRunLocalCommandHandling } from './runtimeRunLocalCommandHandling.js'
import type { RuntimeRunSetupResolution } from '../setup/resolution/runtimeRunSetupResolution.js'
import {
  createDefaultWorkspaceApplyPort,
  createDefaultWorkspaceApplyPreviewPort,
  createDefaultExternalToolGatewayPort,
  createDefaultWorkspaceSnapshotHydrationPort,
  createDefaultProjectStandardsPort,
  createDefaultResourceFilePort,
  createDefaultVideoFrameExtractionPort,
  createDefaultRuntimeToolHandlerRegistry,
} from '../../../shared/tools/runtimeToolHandlers.js'

const defaultRuntimeToolHandlers = createDefaultRuntimeToolHandlerRegistry()
const defaultWorkspaceApplyBackend = {
  async applyReview(): Promise<any> {
    return { performed: false, skippedReason: 'backend disabled in test' }
  },
  async previewApplyReview(): Promise<any> {
    return { performed: false, skippedReason: 'backend disabled in test' }
  },
}
const defaultWorkspaceApplyPort = createDefaultWorkspaceApplyPort(defaultWorkspaceApplyBackend)
const defaultWorkspaceApplyPreviewPort = createDefaultWorkspaceApplyPreviewPort(defaultWorkspaceApplyBackend)
const defaultProjectStandardsBackend = {
  async getProject(): Promise<any> {
    return { performed: false, skippedReason: 'backend disabled in test' }
  },
}

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
      inspectAgentCatalog: () => ({}),
      updateActiveSkills: () => ({}),
      updatePlan: () => ({}),
      startWork: async (_run, args) => {
        calls.push({ name: 'core_work_start', args })
        return { status: 'started', work: { id: 'work_1', kind: 'generation_job', status: 'running' } } as JSONValue
      },
      getWork: () => ({}),
      listWork: () => ({}),
      waitWork: () => ({}),
      cancelWork: () => ({}),
    } as Parameters<typeof applyRuntimeRunLocalCommandHandling>[0]['catalogManager'],
  })

  assert.equal(handled, true)
  assert.equal(run.status, 'completed')
  assert.equal(calls[0]?.name, 'core_work_start')
  assert.equal(calls.length, 1)
  assert.equal((run.metadata?.forcedToolCall as any)?.name, 'core_work_start')
})

function baseInput(
  store: InMemoryAgentStore,
  run: AgentRun,
  thread: AgentThread,
  message: string,
): Parameters<typeof applyRuntimeRunLocalCommandHandling>[0] {
  const memoryStore = new InMemoryAgentMemoryStore()
  const memoryManager = new MemoryManager(memoryStore)
  const mcpClient = {
    initialize: async () => ({}),
    callTool: async () => ({ ok: true }),
  }
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
    workspaceStore: new InMemoryAgentWorkspaceStore(),
    externalToolGatewayPort: createDefaultExternalToolGatewayPort(mcpClient),
    workspaceApplyPort: defaultWorkspaceApplyPort,
    workspaceApplyPreviewPort: defaultWorkspaceApplyPreviewPort,
    workspaceSnapshotHydrationPort: createDefaultWorkspaceSnapshotHydrationPort(mcpClient),
    resourceFilePort: createDefaultResourceFilePort(mcpClient),
    videoFrameExtractionPort: createDefaultVideoFrameExtractionPort({ downloadResourceFile: async () => ({ performed: false, skippedReason: 'backend disabled in test' }) }),
    projectStandardsPort: createDefaultProjectStandardsPort(defaultProjectStandardsBackend),
    memoryManager,
    runtimeToolHandlers: defaultRuntimeToolHandlers,
    referenceManager: new ReferenceManager(EMPTY_REFERENCE_STORE),
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
    activeAgentManifest: DEFAULT_AGENT_MANIFEST,
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
    activeAgentManifest: DEFAULT_AGENT_MANIFEST,
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
    runtimeLimits: { approvalMode: 'interactive',
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
