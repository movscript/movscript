import assert from 'node:assert/strict'
import test from 'node:test'

import { createEventStateStore } from './index'
import {
  isAgentChatUiOnlyAssistantMessage,
  isAgentChatVisibleAssistantMessage,
  isAgentPromptExcludedAssistantMessage,
  isAgentNonTranscriptAssistantMetadata,
  isAgentPromptExcludedAssistantMetadata,
  isAgentUiOnlyAssistantMetadata,
  isAgentUiOnlyAssistantMessage,
  isAgentVisibleAssistantMessage,
} from '@movscript/protocol'
import type {
  AgentMessage,
  AgentRuntimeEventV2,
  AgentRuntimeSnapshotV2,
  AgentRun,
  AgentThread,
  RuntimeInteraction,
} from '@movscript/protocol'

const scope = { type: 'thread', id: 'thread_1' } as const

test('shared assistant metadata boundary classifies runtime UI anchors as non-transcript', () => {
  assert.equal(isAgentUiOnlyAssistantMetadata({ kind: 'runtime_status' }), true)
  assert.equal(isAgentUiOnlyAssistantMetadata({ kind: 'runtime_activity' }), true)
  assert.equal(isAgentUiOnlyAssistantMetadata({ kind: 'plan_revision' }), true)
  assert.equal(isAgentUiOnlyAssistantMetadata({ promptHistory: 'exclude' }), true)
  assert.equal(isAgentUiOnlyAssistantMetadata({ runtimeStatus: { kind: 'async_work_handoff' } }), true)
  assert.equal(isAgentUiOnlyAssistantMetadata({ planRevision: { id: 'plan_1' } }), true)
  assert.equal(isAgentUiOnlyAssistantMetadata({ contextDiagnostic: { modelGatewayCalled: false } }), true)
  assert.equal(isAgentPromptExcludedAssistantMetadata({ localRunActivity: { runId: 'run_1' } }), true)
  assert.equal(isAgentNonTranscriptAssistantMetadata({ localRunActivity: { runId: 'run_1' } }), true)
})

test('shared assistant metadata boundary keeps ordinary transcript metadata visible', () => {
  assert.equal(isAgentUiOnlyAssistantMetadata(undefined), false)
  assert.equal(isAgentUiOnlyAssistantMetadata(null), false)
  assert.equal(isAgentUiOnlyAssistantMetadata([]), false)
  assert.equal(isAgentUiOnlyAssistantMetadata({}), false)
  assert.equal(isAgentUiOnlyAssistantMetadata({ promptHistory: 'include' }), false)
  assert.equal(isAgentUiOnlyAssistantMetadata({ kind: 'runtime_input', targetRunId: 'run_1' }), false)
  assert.equal(isAgentUiOnlyAssistantMetadata({ runtimeStatus: null }), false)
  assert.equal(isAgentUiOnlyAssistantMetadata({ localRunActivity: { runId: 'run_1' } }), false)
  assert.equal(isAgentPromptExcludedAssistantMetadata({ localRunActivity: { runId: 'run_1' } }), true)
})

test('shared assistant message boundary classifies runtime and chat messages consistently', () => {
  assert.equal(isAgentUiOnlyAssistantMessage(message({
    role: 'assistant',
    metadata: { runtimeStatus: { kind: 'async_work_handoff' } },
  })), true)
  assert.equal(isAgentVisibleAssistantMessage(message({
    role: 'assistant',
    metadata: { runtimeStatus: { kind: 'async_work_handoff' } },
  })), false)
  assert.equal(isAgentPromptExcludedAssistantMessage(message({
    role: 'assistant',
    metadata: { localRunActivity: { runId: 'run_1' } },
  })), true)
  assert.equal(isAgentVisibleAssistantMessage(message({
    role: 'assistant',
    metadata: { localRunActivity: { runId: 'run_1' } },
  })), true)
  assert.equal(isAgentChatUiOnlyAssistantMessage({
    role: 'assistant',
    meta: { runtimeStatus: { kind: 'async_work_handoff', title: 'handoff', detail: 'waiting' } },
  }), true)
  assert.equal(isAgentChatVisibleAssistantMessage({
    role: 'assistant',
    meta: { localRunActivity: { runId: 'run_1', threadId: 'thread_1', status: 'completed', createdAt: '2026-05-23T00:00:00.000Z', updatedAt: '2026-05-23T00:00:00.000Z', steps: [], events: [] } },
  }), true)
})

test('EventStateStore projects v2 snapshot and accepted events into a conversation view', () => {
  const store = createEventStateStore({ now: () => '2026-05-23T00:00:00.000Z' })
  store.ingestSnapshot(snapshot({
    messages: [message({ id: 'msg_user', role: 'user', content: 'Hi', createdAt: '2026-05-23T00:00:01.000Z' })],
    runs: [run({ id: 'run_1', status: 'in_progress' })],
  }))
  store.ingestEvent(event({
    id: 'evt_1',
    ordinal: 1,
    kind: 'message.upserted',
    entity: { type: 'message', value: message({ id: 'msg_assistant', role: 'assistant', runId: 'run_1', content: 'Hello', createdAt: '2026-05-23T00:00:02.000Z' }) },
  }))

  const view = store.getConversationView('thread_1')
  assert.deepEqual(view.messages.map((item) => item.id), ['msg_user', 'msg_assistant'])
  assert.deepEqual(view.activeRunIds, ['run_1'])

  const debug = store.getDebugReport(scope)
  assert.deepEqual(debug.input.eventsAccepted, ['evt_1'])
  assert.equal(debug.projection.conversationMessages[1]?.runId, 'run_1')
  assert.equal(debug.invariants.find((item) => item.name === 'no_duplicate_projection_messages')?.status, 'pass')
})

test('EventStateStore rejects duplicate events and ordinal gaps without applying ambiguous state', () => {
  const store = createEventStateStore()
  store.ingestSnapshot(snapshot())
  const first = event({
    id: 'evt_1',
    ordinal: 1,
    kind: 'message.upserted',
    entity: { type: 'message', value: message({ id: 'msg_1', content: 'One' }) },
  })
  store.ingestEvent(first)
  store.ingestEvent(first)
  store.ingestEvent(event({
    id: 'evt_3',
    ordinal: 3,
    kind: 'message.upserted',
    entity: { type: 'message', value: message({ id: 'msg_3', content: 'Three' }) },
  }))

  const view = store.getConversationView('thread_1')
  assert.deepEqual(view.messages.map((item) => item.id), ['msg_1'])

  const debug = store.getDebugReport(scope)
  assert.deepEqual(debug.input.eventsAccepted, ['evt_1'])
  assert.deepEqual(debug.input.eventsDropped.map((item) => item.reason), ['duplicate_event', 'ordinal_gap'])
  assert.deepEqual(debug.input.gaps, [{ expectedOrdinal: 2, receivedOrdinal: 3, action: 'snapshot_required' }])
  assert.equal(debug.invariants.find((item) => item.name === 'no_ordinal_gaps_unresolved')?.status, 'fail')
})

test('EventStateStore rejects old protocol shapes instead of adapting them', () => {
  const store = createEventStateStore()
  store.ingestEvent({ type: 'run', run: run({ id: 'run_legacy' }) } as unknown as AgentRuntimeEventV2)

  const debug = store.getDebugReport(scope)
  assert.deepEqual(debug.input.eventsAccepted, [])
  assert.deepEqual(debug.input.eventsDropped.map((item) => item.reason), ['invalid_schema'])
  assert.deepEqual(store.getConversationView('thread_1').messages, [])
})

test('EventStateStore keeps assistant progress monotonic and hides it once the final assistant message arrives', () => {
  const store = createEventStateStore()
  store.ingestSnapshot(snapshot({ runs: [run({ id: 'run_1', status: 'in_progress' })] }))
  store.ingestEvent(event({
    id: 'evt_1',
    ordinal: 1,
    kind: 'assistant.progress',
    assistantProgress: { runId: 'run_1', traceId: 'trace_1', delta: 'Hel', accumulated: 'Hel', createdAt: '2026-05-23T00:00:02.000Z' },
  }))
  store.ingestEvent(event({
    id: 'evt_2',
    ordinal: 2,
    kind: 'assistant.progress',
    assistantProgress: { runId: 'run_1', traceId: 'trace_1', delta: '', accumulated: 'He', createdAt: '2026-05-23T00:00:03.000Z' },
  }))
  assert.deepEqual(store.getConversationView('thread_1').messages.map((item) => [item.id, item.content]), [
    ['assistant-progress:run_1:trace_1', 'Hel'],
  ])

  store.ingestEvent(event({
    id: 'evt_3',
    ordinal: 3,
    kind: 'message.upserted',
    entity: {
      type: 'message',
      value: message({
        id: 'msg_plan_revision',
        role: 'assistant',
        runId: 'run_1',
        content: 'Plan revision display anchor',
        metadata: { kind: 'plan_revision', promptHistory: 'exclude' },
        createdAt: '2026-05-23T00:00:03.500Z',
      }),
    },
  }))
  assert.deepEqual(store.getConversationView('thread_1').messages.map((item) => [item.id, item.content]), [
    ['assistant-progress:run_1:trace_1', 'Hel'],
  ])

  store.ingestSnapshot(snapshot({ ordinal: 3, messages: [], runs: [run({ id: 'run_1', status: 'in_progress', assistantMessageId: 'msg_final' })] }))
  store.ingestEvent(event({
    id: 'evt_4',
    ordinal: 4,
    kind: 'message.upserted',
    entity: { type: 'message', value: message({ id: 'msg_final', role: 'assistant', runId: 'run_1', content: 'Hello', createdAt: '2026-05-23T00:00:04.000Z' }) },
  }))

  assert.deepEqual(store.getConversationView('thread_1').messages.map((item) => [item.id, item.content]), [
    ['msg_final', 'Hello'],
  ])
  assert.ok(store.getDebugReport(scope).input.eventsDropped.some((item) => item.reason === 'progress_regression'))
})

test('EventStateStore does not let UI-only assistant anchors replace live progress', () => {
  const store = createEventStateStore()
  store.ingestSnapshot(snapshot({
    messages: [
      message({
        id: 'msg_status',
        role: 'assistant',
        runId: 'run_1',
        content: '任务正在后台运行。',
        metadata: {
          kind: 'runtime_status',
          promptHistory: 'exclude',
          runtimeStatus: { kind: 'async_work_handoff', title: '异步任务已提交', detail: '任务正在后台运行。' },
        },
      }),
    ],
    runs: [run({ id: 'run_1', status: 'in_progress', assistantMessageId: 'msg_status' })],
  }))
  store.ingestEvent(event({
    id: 'evt_1',
    ordinal: 1,
    kind: 'assistant.progress',
    assistantProgress: { runId: 'run_1', traceId: 'trace_1', delta: '正在处理', accumulated: '正在处理', createdAt: '2026-05-23T00:00:02.000Z' },
  }))

  assert.deepEqual(store.getConversationView('thread_1').messages.map((item) => [item.id, item.content]), [
    ['assistant-progress:run_1:trace_1', '正在处理'],
  ])

  store.ingestEvent(event({
    id: 'evt_2',
    ordinal: 2,
    kind: 'run.upserted',
    entity: { type: 'run', value: run({ id: 'run_1', status: 'completed', assistantMessageId: 'msg_final' }) },
  }))
  store.ingestEvent(event({
    id: 'evt_3',
    ordinal: 3,
    kind: 'message.upserted',
    entity: { type: 'message', value: message({ id: 'msg_final', role: 'assistant', runId: 'run_1', content: '处理完成。', createdAt: '2026-05-23T00:00:04.000Z' }) },
  }))

  assert.deepEqual(store.getConversationView('thread_1').messages.map((item) => [item.id, item.content]), [
    ['msg_final', '处理完成。'],
  ])
})

test('EventStateStore projects pending interactions without frontend inference', () => {
  const store = createEventStateStore()
  store.ingestSnapshot(snapshot())
  store.ingestEvent(event({
    id: 'evt_1',
    ordinal: 1,
    kind: 'interaction.upserted',
    entity: { type: 'interaction', value: interaction({ id: 'interaction_1', status: 'pending' }) },
  }))
  store.ingestEvent(event({
    id: 'evt_2',
    ordinal: 2,
    kind: 'interaction.upserted',
    entity: { type: 'interaction', value: interaction({ id: 'interaction_1', status: 'approved', resolvedAt: '2026-05-23T00:00:03.000Z' }) },
  }))

  assert.deepEqual(store.getPendingInteractions('thread_1'), [])
  const debug = store.getDebugReport(scope)
  assert.equal(debug.normalized.interactions[0]?.status, 'approved')
  assert.deepEqual(debug.projection.pendingInteractions, [])
})

function snapshot(overrides: Partial<AgentRuntimeSnapshotV2['entities']> & { ordinal?: number } = {}): AgentRuntimeSnapshotV2 {
  const ordinal = overrides.ordinal ?? 0
  return {
    schema: 'movscript.agent.runtime-snapshot.v2',
    protocolVersion: 'movscript.agent.protocol.v1',
    scope,
    cursor: 'cursor_' + ordinal,
    ordinal,
    generatedAt: '2026-05-23T00:00:00.000Z',
    entities: {
      threads: overrides.threads ?? [thread()],
      messages: overrides.messages ?? [],
      runs: overrides.runs ?? [],
      interactions: overrides.interactions ?? [],
      works: overrides.works ?? [],
      continuations: overrides.continuations ?? [],
      plans: overrides.plans ?? [],
      planRevisions: overrides.planRevisions ?? [],
      taskGraphs: overrides.taskGraphs ?? [],
    },
  }
}

function event(overrides: Partial<AgentRuntimeEventV2> & Pick<AgentRuntimeEventV2, 'id' | 'ordinal' | 'kind'>): AgentRuntimeEventV2 {
  return {
    schema: 'movscript.agent.runtime-event.v2',
    protocolVersion: 'movscript.agent.protocol.v1',
    scope,
    cursor: 'cursor_' + overrides.ordinal,
    emittedAt: '2026-05-23T00:00:01.000Z',
    ...overrides,
  } as AgentRuntimeEventV2
}

function thread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: 'thread_1',
    status: 'running',
    activeRunId: 'run_1',
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
    messages: [],
    ...overrides,
  }
}

function message(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: 'msg_1',
    threadId: 'thread_1',
    role: 'user',
    content: 'Message',
    createdAt: '2026-05-23T00:00:01.000Z',
    ...overrides,
  }
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    role: 'planner',
    runtimeLimits: {
      approvalMode: 'interactive',
      maxToolCalls: 10,
      maxIterations: 10,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-23T00:00:01.000Z',
    updatedAt: '2026-05-23T00:00:01.000Z',
    steps: [],
    ...overrides,
  }
}

function interaction(overrides: Partial<RuntimeInteraction> = {}): RuntimeInteraction {
  return {
    id: 'interaction_1',
    threadId: 'thread_1',
    runId: 'run_1',
    kind: 'approval',
    status: 'pending',
    payload: { toolName: 'write_file' },
    createdAt: '2026-05-23T00:00:02.000Z',
    updatedAt: '2026-05-23T00:00:02.000Z',
    ...overrides,
  }
}
