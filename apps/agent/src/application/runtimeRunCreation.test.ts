import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { buildLayeredCatalogRegistry } from '../catalog/registry.js'
import { EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER } from '../contracts/runtimeContract.js'
import type { AgentThread } from '../state/types.js'
import { StaticToolRegistry } from '../tools/toolRegistry.js'
import { buildRuntimeCatalogSnapshot } from './runtimeCatalogSnapshot.js'
import {
  applyRuntimeRunCreation,
  buildRuntimeCreateRun,
  buildRuntimeCreateToolRun,
} from './runtimeRunCreation.js'

test('buildRuntimeCreateRun freezes creation input, policy, hierarchy, and catalog metadata', () => {
  const thread = makeThread()
  const run = buildRuntimeCreateRun({
    runInput: {
      threadId: thread.id,
      approvedToolNames: ['tool_a', 'tool_a', 'tool_b'],
      sandboxMode: true,
      policy: { maxIterations: 3 },
      userMessage: ' Explicit task ',
      role: 'worker',
      parentRunId: 'run_parent',
      planId: 'plan_1',
      taskId: 'task_1',
      task: {
        id: 'task_1',
        title: 'Task title',
        instructions: 'Task instructions',
      },
      metadata: { requestId: 'request_1' },
    },
    thread,
    clientInput: { visibleMessage: 'client text', attachments: [] },
    catalogSnapshot: buildRuntimeCatalogSnapshot({
      id: 'catalog_1',
      defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
      toolRegistry: new StaticToolRegistry([]),
      layeredRegistry: buildLayeredCatalogRegistry({ manifest: DEFAULT_AGENT_MANIFEST, tools: [] }),
      pluginWarnings: [],
    }),
    contractResolver: EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
    runId: 'run_1',
    now: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(run.id, 'run_1')
  assert.equal(run.threadId, 'thread_1')
  assert.equal(run.role, 'worker')
  assert.equal(run.parentRunId, 'run_parent')
  assert.equal(run.planId, 'plan_1')
  assert.equal(run.taskId, 'task_1')
  assert.equal(run.policy.sandboxMode, true)
  assert.equal(run.policy.maxIterations, 3)
  assert.deepEqual(run.metadata?.approvedToolNames, ['tool_a', 'tool_b'])
  assert.equal(run.metadata?.requestId, 'request_1')
  assert.equal(run.metadata?.manifestSource, 'default')
  assert.deepEqual(run.metadata?.catalogSnapshot, { id: 'catalog_1', version: null })
  assert.equal(run.input?.userMessage, 'Explicit task')
  assert.equal(run.input?.sourceMessageId, undefined)
  assert.equal(run.input?.executionMode, 'worker')
  assert.deepEqual(run.input?.parent, {
    runId: 'run_parent',
    planId: 'plan_1',
    taskId: 'task_1',
  })
  assert.deepEqual(run.input?.task, {
    id: 'task_1',
    title: 'Task title',
    instructions: 'Task instructions',
  })
})

test('buildRuntimeCreateRun falls back to the latest thread user message', () => {
  const thread = makeThread()
  const run = buildRuntimeCreateRun({
    runInput: { threadId: thread.id },
    thread,
    catalogSnapshot: buildRuntimeCatalogSnapshot({
      id: 'catalog_2',
      defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
      toolRegistry: new StaticToolRegistry([]),
      layeredRegistry: buildLayeredCatalogRegistry({ manifest: DEFAULT_AGENT_MANIFEST, tools: [] }),
    }),
    contractResolver: EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
    runId: 'run_2',
    now: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(run.role, 'planner')
  assert.equal(run.metadata?.initialUserMessageId, 'msg_latest')
  assert.equal(run.input?.sourceMessageId, 'msg_latest')
  assert.equal(run.input?.userMessage, 'Latest user message')
  assert.equal(run.input?.executionMode, 'chat')
})

test('buildRuntimeCreateToolRun freezes forced tool calls and worker hierarchy', () => {
  const thread = makeThread()
  const sourceMessage = {
    id: 'msg_tool',
    threadId: thread.id,
    role: 'user' as const,
    content: 'Run selected tool',
    createdAt: '2026-01-01T00:00:02.000Z',
  }
  const toolCall = {
    id: 'call_1',
    name: 'tool_a',
    arguments: { value: 1 },
  }

  const run = buildRuntimeCreateToolRun({
    runInput: {
      toolCall,
      threadId: thread.id,
      approvedToolNames: ['tool_a', 'tool_a'],
      sandboxMode: true,
      policy: { maxToolCalls: 1 },
      parentRunId: 'run_parent',
      planId: 'plan_1',
      taskId: 'task_1',
    },
    thread,
    userMessage: sourceMessage,
    toolCall,
    clientInput: { visibleMessage: 'client tool text', attachments: [] },
    catalogSnapshot: buildRuntimeCatalogSnapshot({
      id: 'catalog_tool',
      defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
      toolRegistry: new StaticToolRegistry([]),
      layeredRegistry: buildLayeredCatalogRegistry({ manifest: DEFAULT_AGENT_MANIFEST, tools: [] }),
    }),
    contractResolver: EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
    runId: 'run_tool',
    now: '2026-01-01T00:00:03.000Z',
  })

  assert.equal(run.id, 'run_tool')
  assert.equal(run.role, 'worker')
  assert.equal(run.parentRunId, 'run_parent')
  assert.equal(run.policy.sandboxMode, true)
  assert.equal(run.policy.maxToolCalls, 1)
  assert.equal(run.metadata?.initialUserMessageId, 'msg_tool')
  assert.deepEqual(run.metadata?.approvedToolNames, ['tool_a'])
  assert.deepEqual(run.metadata?.forcedToolCall, toolCall)
  assert.deepEqual(run.metadata?.catalogSnapshot, { id: 'catalog_tool', version: null })
  assert.equal(run.input?.executionMode, 'tool')
  assert.equal(run.input?.sourceMessageId, 'msg_tool')
  assert.deepEqual(run.input?.forcedToolCall, toolCall)
  assert.deepEqual(run.input?.parent, {
    runId: 'run_parent',
    planId: 'plan_1',
    taskId: 'task_1',
  })
})

test('applyRuntimeRunCreation persists run creation side effects in order', () => {
  const thread = makeThread()
  const catalogSnapshot = buildRuntimeCatalogSnapshot({
    id: 'catalog_apply',
    defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    toolRegistry: new StaticToolRegistry([]),
    layeredRegistry: buildLayeredCatalogRegistry({ manifest: DEFAULT_AGENT_MANIFEST, tools: [] }),
  })
  const run = buildRuntimeCreateRun({
    runInput: { threadId: thread.id },
    thread,
    catalogSnapshot,
    contractResolver: EMPTY_AGENT_RUNTIME_CONTRACT_RESOLVER,
    runId: 'run_apply',
    now: '2026-01-01T00:00:02.000Z',
  })
  const calls: string[] = []

  const result = applyRuntimeRunCreation({
    run,
    thread,
    catalogSnapshot,
    runInput: { threadId: thread.id },
    now: '2026-01-01T00:00:02.000Z',
    rememberCatalogRun: (runId, snapshot) => calls.push(`catalog:${runId}:${snapshot.id}`),
    rememberRunAuth: (runId) => calls.push(`auth:${runId}`),
    createRun: (targetRun) => calls.push(`create:${targetRun.id}`),
    updateThread: (targetThread) => calls.push(`thread:${targetThread.id}:${targetThread.activeRunId}:${targetThread.updatedAt}`),
    startRunExecution: (runId) => calls.push(`start:${runId}`),
  })

  assert.equal(result.run.id, 'run_apply')
  assert.equal(result.thread.activeRunId, 'run_apply')
  assert.equal(result.thread.updatedAt, '2026-01-01T00:00:02.000Z')
  assert.deepEqual(calls, [
    'catalog:run_apply:catalog_apply',
    'auth:run_apply',
    'create:run_apply',
    'thread:thread_1:run_apply:2026-01-01T00:00:02.000Z',
    'start:run_apply',
  ])
})

function makeThread(): AgentThread {
  return {
    id: 'thread_1',
    title: 'Thread',
    messages: [
      {
        id: 'msg_old',
        threadId: 'thread_1',
        role: 'user',
        content: 'Old user message',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'msg_latest',
        threadId: 'thread_1',
        role: 'user',
        content: 'Latest user message',
        createdAt: '2026-01-01T00:00:01.000Z',
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:01.000Z',
  }
}
