import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../../../catalog/manifest/agentManifest.js'
import { parseAgentCommand } from '../../../context/command/commandRouter.js'
import type { AgentRuntimeContractResolver } from '../../../contracts/runtime/runtimeContract.js'
import { InMemoryAgentStore } from '../../../state/store/core/store.js'
import type {
  AgentCapabilitiesResponse,
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentThread,
} from '../../../state/shared/types.js'
import { applyRuntimeLocalCommandDispatch } from './runtimeLocalCommandDispatch.js'

test('applyRuntimeLocalCommandDispatch ignores forced-tool and normal chat runs', async () => {
  const store = new InMemoryAgentStore()
  const forced = makeRun({ metadata: { forcedToolCall: { name: 'tool_a', args: {} } } })
  const chat = makeRun({ id: 'run_2' })
  const thread = makeThread()

  assert.equal(await applyRuntimeLocalCommandDispatch({
    ...baseInput(store, forced, thread, parseAgentCommand('/context')),
  }), false)
  assert.equal(await applyRuntimeLocalCommandDispatch({
    ...baseInput(store, chat, thread, parseAgentCommand('hello')),
  }), false)
})

test('applyRuntimeLocalCommandDispatch handles diagnostic commands locally', async () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  const thread = makeThread()
  store.createThread(thread)
  store.createRun(run)
  const assistantMessages: AgentMessage[] = []

  const handled = await applyRuntimeLocalCommandDispatch({
    ...baseInput(store, run, thread, parseAgentCommand('/context')),
    emitAssistantMessage: (_run, message) => assistantMessages.push(message),
  })

  assert.equal(handled, true)
  assert.equal(run.status, 'completed')
  assert.equal(run.assistantMessageId, undefined)
  assert.deepEqual(assistantMessages, [])
  assert.equal(store.getThread('thread_1')?.messages.length, 0)
  assert.equal(store.getThread('thread_1')?.contextDiagnostics?.[0]?.runId, 'run_1')
})

test('applyRuntimeLocalCommandDispatch does not handle generation slash commands locally', async () => {
  const store = new InMemoryAgentStore()
  const run = makeRun()
  const thread = makeThread()
  store.createThread(thread)
  store.createRun(run)

  const handled = await applyRuntimeLocalCommandDispatch({
    ...baseInput(store, run, thread, parseAgentCommand('/image a red title card')),
  })

  assert.equal(handled, false)
  assert.equal(run.status, 'in_progress')
  assert.equal(run.metadata?.forcedToolCall, undefined)
})

function baseInput(
  store: InMemoryAgentStore,
  run: AgentRun,
  thread: AgentThread,
  command: ReturnType<typeof parseAgentCommand>,
): Parameters<typeof applyRuntimeLocalCommandDispatch>[0] {
  return {
    store,
    run,
    thread,
    command,
    manifest: DEFAULT_AGENT_MANIFEST,
    skills: [],
    context: debugContext(),
    tools: capabilities().resolvedTools,
    runtimeLimits: run.runtimeLimits,
    memories: [],
    warnings: [],
    history: thread.messages,
    userMessage: command.payload,
    contractResolver: emptyContractResolver(),
    now: () => '2026-01-01T00:00:01.000Z',
    timestampMs: monotonicClock(1000, 1010),
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

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
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
    ...overrides,
  }
}

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

function capabilities(): AgentCapabilitiesResponse {
  return {
    activeAgentManifest: DEFAULT_AGENT_MANIFEST,
    mcp: { connected: true, resources: [], tools: [] },
    registry: [],
    resolvedTools: {
      discovered: [],
      available: [],
      blocked: [],
      byName: {},
    },
    warnings: [],
  }
}

function debugContext() {
  return {
    route: { pathname: '/agent' },
    projects: [],
    selection: null,
    recentResources: [],
    attachments: [],
    memories: [],
    labels: [],
  }
}

function emptyContractResolver(): AgentRuntimeContractResolver {
  return {
    find: () => undefined,
    requiresConfiguredModel: () => false,
  }
}

function monotonicClock(...values: number[]) {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)] ?? 0
}
