import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER } from '../contracts/runtimeContract.js'
import { InMemoryAgentStore } from '../state/store.js'
import type {
  AgentDebugContextPanel,
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentThread,
  ResolvedToolCatalog,
} from '../state/types.js'
import { parseAgentCommand } from '../context/commandRouter.js'
import {
  applyRuntimeLocalDiagnosticCommand,
  type RuntimeLocalDiagnosticTraceInput,
} from './runtimeLocalDiagnosticCommand.js'

const now = '2026-01-01T00:00:01.000Z'

test('applyRuntimeLocalDiagnosticCommand completes memory diagnostic run without model gateway side effects', () => {
  const store = new InMemoryAgentStore()
  const thread = makeThread()
  const run = makeRun({ status: 'in_progress' })
  store.createThread(thread)
  store.createRun(run)
  const traces: RuntimeLocalDiagnosticTraceInput[] = []
  const assistantMessages: AgentMessage[] = []
  const snapshots: string[] = []
  let completedStep: AgentRunStep | undefined

  const assistant = applyRuntimeLocalDiagnosticCommand({
    store,
    run,
    thread,
    command: parseAgentCommand('/memory lens'),
    manifest: DEFAULT_AGENT_MANIFEST,
    skills: [],
    context: debugContext(),
    tools: emptyTools(),
    policy: run.policy,
    memories: [{
      id: 'mem_1',
      projectId: 42,
      title: 'Lens',
      kind: 'preference',
      content: 'Use a wide lens.',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
    warnings: [],
    history: thread.messages,
    userMessage: '/memory lens',
    memoryStorePath: '/tmp/memories.json',
    contractResolver: EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
    now: () => now,
    recordTrace: (_run, trace) => traces.push(trace),
    createStep: (targetRun, type, round) => {
      const step: AgentRunStep = {
        id: 'step_1',
        runId: targetRun.id,
        type,
        status: 'in_progress',
        createdAt: now,
        ...(round ? {
          roundId: round.roundId,
          roundIndex: round.roundIndex,
          roundLabel: round.roundLabel,
          roundSource: round.roundSource,
        } : {}),
      }
      targetRun.steps.push(step)
      completedStep = step
      return step
    },
    emitAssistantMessage: (_run, message) => assistantMessages.push(message),
    emitRunSnapshot: (targetRun, options) => snapshots.push(`${targetRun.status}:${options.done === true}`),
  })

  assert.equal(assistant.id, run.assistantMessageId)
  assert.equal(run.status, 'completed')
  assert.deepEqual(run.metadata?.memoryIds, ['mem_1'])
  assert.deepEqual(run.metadata?.writtenMemoryIds, [])
  assert.equal(thread.status, 'completed')
  assert.equal(thread.activeRunId, undefined)
  assert.equal(thread.messages.at(-1)?.id, assistant.id)
  assert.equal(completedStep?.type, 'message')
  assert.equal(completedStep?.status, 'completed')
  assert.equal((completedStep?.result as any)?.localCommand, 'memory')
  assert.equal((completedStep?.result as any)?.messageId, assistant.id)
  assert.equal(traces[0]?.kind, 'policy')
  assert.equal((traces[0]?.data as any)?.modelGatewayCalled, false)
  assert.equal(traces[1]?.kind, 'assistant')
  assert.equal(traces[2]?.kind, 'run')
  assert.equal((traces[2]?.data as any)?.modelGatewayCalled, false)
  assert.deepEqual(assistantMessages.map((message) => message.id), [assistant.id])
  assert.deepEqual(snapshots, ['completed:true'])
})

test('applyRuntimeLocalDiagnosticCommand preserves warning completion status and context diagnostic metadata', () => {
  const store = new InMemoryAgentStore()
  const thread = makeThread()
  const run = makeRun({ status: 'in_progress' })
  store.createThread(thread)
  store.createRun(run)
  let completedStep: AgentRunStep | undefined

  applyRuntimeLocalDiagnosticCommand({
    store,
    run,
    thread,
    command: parseAgentCommand('/context'),
    manifest: DEFAULT_AGENT_MANIFEST,
    skills: [],
    context: debugContext(),
    tools: emptyTools(),
    policy: run.policy,
    memories: [],
    warnings: ['Focus unavailable: mcp offline'],
    history: thread.messages,
    userMessage: '/context',
    contractResolver: EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
    now: () => now,
    recordTrace: () => {},
    createStep: (targetRun, type) => {
      const step: AgentRunStep = {
        id: 'step_1',
        runId: targetRun.id,
        type,
        status: 'in_progress',
        createdAt: now,
      }
      targetRun.steps.push(step)
      completedStep = step
      return step
    },
    emitAssistantMessage: () => {},
    emitRunSnapshot: () => {},
  })

  const diagnostic = (completedStep?.result as any)?.diagnostic
  assert.equal(run.status, 'completed_with_warnings')
  assert.deepEqual(run.warnings, ['Focus unavailable: mcp offline'])
  assert.equal(diagnostic?.schema, 'movscript.local_context_diagnostic.v1')
  assert.equal(diagnostic?.modelGatewayCalled, false)
  assert.equal(Array.isArray(diagnostic?.messages), true)
  assert.equal(Array.isArray(diagnostic?.tools?.modelTools), true)
})

test('applyRuntimeLocalDiagnosticCommand completes compact command and refreshes thread summary metadata', () => {
  const store = new InMemoryAgentStore()
  const thread = makeThread({
    messages: Array.from({ length: 9 }, (_, index): AgentMessage => ({
      id: `msg_${index}`,
      threadId: 'thread_1',
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `message ${index}`,
      createdAt: `2026-01-01T00:00:0${index}.000Z`,
    })),
  })
  const run = makeRun({ status: 'in_progress' })
  store.createThread(thread)
  store.createRun(run)
  let completedStep: AgentRunStep | undefined

  const assistant = applyRuntimeLocalDiagnosticCommand({
    store,
    run,
    thread,
    command: parseAgentCommand('/compact'),
    manifest: DEFAULT_AGENT_MANIFEST,
    skills: [],
    context: debugContext(),
    tools: emptyTools(),
    policy: run.policy,
    memories: [],
    warnings: [],
    history: thread.messages,
    userMessage: '/compact',
    contractResolver: EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
    now: () => now,
    recordTrace: () => {},
    createStep: (targetRun, type) => {
      const step: AgentRunStep = {
        id: 'step_1',
        runId: targetRun.id,
        type,
        status: 'in_progress',
        createdAt: now,
      }
      targetRun.steps.push(step)
      completedStep = step
      return step
    },
    emitAssistantMessage: () => {},
    emitRunSnapshot: () => {},
  })

  const diagnostic = (completedStep?.result as any)?.diagnostic
  assert.equal(run.status, 'completed')
  assert.equal((completedStep?.result as any)?.localCommand, 'compact')
  assert.equal(diagnostic?.schema, 'movscript.local_compact_diagnostic.v1')
  assert.equal(diagnostic?.compact?.historyCompactedCount, 3)
  assert.equal(thread.messages.at(-1)?.id, assistant.id)
  assert.equal((thread.metadata?.threadContextSummary as any)?.schema, 'movscript.thread-context-summary.v2')
  assert.equal((run.metadata?.threadContextSummary as any)?.schema, 'movscript.thread-context-summary.v2')
})

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    status: 'running',
    activeRunId: 'run_1',
    messages: [userMessage()],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
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

function userMessage(): AgentMessage {
  return {
    id: 'msg_user',
    threadId: 'thread_1',
    role: 'user',
    content: '/memory lens',
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function debugContext(): AgentDebugContextPanel {
  return {
    route: { pathname: '/agent/debug' },
    projects: [],
    project: { id: 42, name: 'Project' },
    selection: null,
    recentResources: [],
    attachments: [],
    memories: [],
    labels: [],
  }
}

function emptyTools(): ResolvedToolCatalog {
  return {
    discovered: [],
    available: [],
    blocked: [],
    byName: {},
  }
}
