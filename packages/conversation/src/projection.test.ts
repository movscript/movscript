import assert from 'node:assert/strict'
import test from 'node:test'

import { buildRuntimeThreadConversationProjection, mergeProjectedRuntimeMessages, projectRuntimeThreadMessages } from './index'
import type { AgentChatMessage, AgentMessage, AgentRun, AgentRunActivityEvent, AgentThread } from '@movscript/protocol'


const NOW = '2026-05-19T00:00:00.000Z'

test('projectRuntimeThreadMessages binds runtime user and assistant messages to their source run', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({ id: 'msg_user', role: 'user', content: 'Create a draft', createdAt: '2026-05-19T00:00:01.000Z' }),
      makeMessage({ id: 'msg_assistant', role: 'assistant', content: 'Draft created', runId: 'run_1', createdAt: '2026-05-19T00:00:03.000Z' }),
    ],
  })
  const run = makeRun({
    id: 'run_1',
    input: { sourceMessageId: 'msg_user', userMessage: 'Create a draft' },
    assistantMessageId: 'msg_assistant',
  })

  const messages = await projectRuntimeThreadMessages({
    thread,
    runs: [run],
    deps: projectionDeps(),
  })

  assert.deepEqual(messages.map((message) => message.id), ['runtime:msg_user', 'runtime:msg_assistant'])
  assert.deepEqual(messages[0].meta?.runtimeMessage, {
    threadId: 'thread_1',
    messageId: 'msg_user',
    runId: 'run_1',
  })
  assert.deepEqual(messages[1].meta?.runtimeMessage, {
    threadId: 'thread_1',
    messageId: 'msg_assistant',
    runId: 'run_1',
  })
})

test('projectRuntimeThreadMessages preserves runtime status metadata from runtime-authored assistant messages', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({ id: 'msg_user', role: 'user', content: 'Generate image', createdAt: '2026-05-19T00:00:01.000Z' }),
      makeMessage({
        id: 'msg_assistant',
        role: 'assistant',
        content: '任务正在后台运行，完成后会自动接续。你可以继续发送消息。',
        runId: 'run_1',
        createdAt: '2026-05-19T00:00:02.000Z',
        metadata: {
          kind: 'runtime_status',
          runtimeStatus: {
            kind: 'async_work_handoff',
            title: '异步任务已提交',
            detail: '任务正在后台运行，完成后会自动接续。你可以继续发送消息。',
            workId: 'work_1',
            workKind: 'generation_job',
            workStatus: 'running',
          },
        },
      }),
    ],
  })
  const run = makeRun({
    id: 'run_1',
    input: { sourceMessageId: 'msg_user', userMessage: 'Generate image' },
    assistantMessageId: 'msg_assistant',
  })

  const messages = await projectRuntimeThreadMessages({
    thread,
    runs: [run],
    deps: projectionDeps(),
  })

  assert.equal(messages[1].meta?.runtimeStatus?.kind, 'async_work_handoff')
  assert.equal(messages[1].meta?.runtimeStatus?.workId, 'work_1')
  assert.equal(messages[1].meta?.runtimeStatus?.workKind, 'generation_job')
  assert.equal(messages[1].meta?.runtimeStatus?.workStatus, 'running')
})

test('projectRuntimeThreadMessages preserves existing local message ids for runtime-backed messages', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({ id: 'msg_user', role: 'user', content: 'Continue', createdAt: '2026-05-19T00:00:01.000Z' }),
    ],
  })
  const existing: AgentChatMessage = {
    id: 'local_user_message',
    role: 'user',
    content: 'Continue',
    meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_user' } },
    timestamp: 1,
  }

  const messages = await projectRuntimeThreadMessages({
    thread,
    existingMessages: [existing],
    deps: projectionDeps(),
  })

  assert.equal(messages[0].id, 'local_user_message')
  assert.deepEqual(messages[0].meta?.runtimeMessage, {
    threadId: 'thread_1',
    messageId: 'msg_user',
  })
})

test('projectRuntimeThreadMessages upgrades matching local user echoes to runtime-backed messages', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({
        id: 'msg_user',
        role: 'user',
        content: 'Create image',
        createdAt: '2026-05-19T00:00:01.000Z',
        clientInput: { visibleMessage: 'Create image', attachments: [] },
      }),
    ],
  })
  const existing: AgentChatMessage = {
    id: 'local_user_message',
    role: 'user',
    content: 'Create image',
    meta: { modelId: 1, agentName: 'Local Runtime', permissionMode: 'ask' },
    timestamp: 1,
  }

  const messages = await projectRuntimeThreadMessages({
    thread,
    existingMessages: [existing],
    deps: projectionDeps(),
  })

  assert.equal(messages[0].id, 'local_user_message')
  assert.deepEqual(messages[0].meta?.runtimeMessage, {
    threadId: 'thread_1',
    messageId: 'msg_user',
  })
})

test('projectRuntimeThreadMessages accepts host-specific local echo content keys', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({
        id: 'msg_user',
        role: 'user',
        content: 'Create image',
        createdAt: '2026-05-19T00:00:01.000Z',
        clientInput: { visibleMessage: 'Create image', attachments: [] },
      }),
    ],
  })
  const existing: AgentChatMessage = {
    id: 'local_user_message',
    role: 'user',
    content: 'Create image\n\n[host attachment prompt]\n1. reference.png',
    meta: { modelId: 1, agentName: 'Local Runtime', permissionMode: 'ask' },
    timestamp: 1,
  }

  const messages = await projectRuntimeThreadMessages({
    thread,
    existingMessages: [existing],
    deps: {
      ...projectionDeps(),
      localUserEchoContentKey: (text) => (text.split('\n\n[host attachment prompt]')[0] ?? '').replace(/\s+/g, ' ').trim(),
    },
  })

  assert.equal(messages[0].id, 'local_user_message')
  assert.deepEqual(messages[0].meta?.runtimeMessage, {
    threadId: 'thread_1',
    messageId: 'msg_user',
  })
})

test('projectRuntimeThreadMessages restores user attachments from runtime client input', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({
        id: 'msg_user',
        role: 'user',
        content: 'Use this reference',
        createdAt: '2026-05-19T00:00:01.000Z',
        clientInput: {
          visibleMessage: 'Use this reference',
          attachments: [{
            id: 'att_1',
            name: 'reference.png',
            mimeType: 'image/png',
            size: 128,
            resourceId: 42,
          }],
        },
      }),
    ],
  })

  const messages = await projectRuntimeThreadMessages({
    thread,
    deps: projectionDeps(),
  })

  assert.deepEqual(messages[0].attachments, [{
    id: 'att_1',
    name: 'reference.png',
    type: 'image',
    mimeType: 'image/png',
    size: 128,
    resourceId: 42,
  }])
})

test('projectRuntimeThreadMessages preserves plan revision metadata snapshots', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({
        id: 'msg_taskGraph',
        role: 'assistant',
        content: 'Plan updated',
        createdAt: '2026-05-19T00:00:01.000Z',
        metadata: {
          kind: 'plan_revision',
          planRevision: {
            schema: 'movscript.agent.plan-revision.v1',
            id: 'plan_revision_1',
            planId: 'plan_1',
            threadId: 'thread_1',
            snapshot: {
              schema: 'movscript.agent.plan.v1',
              id: 'plan_1',
              threadId: 'thread_1',
              items: [{ step: 'Wire tool', status: 'in_progress' }],
              completedCount: 0,
              totalCount: 1,
              createdAt: NOW,
              updatedAt: NOW,
            },
            createdAt: NOW,
          },
        },
      }),
    ],
  })

  const messages = await projectRuntimeThreadMessages({
    thread,
    deps: projectionDeps(),
  })

  assert.equal(messages[0].meta?.planRevision?.id, 'plan_revision_1')
  assert.equal(messages[0].meta?.planRevision?.snapshot.items[0].status, 'in_progress')
})

test('projectRuntimeThreadMessages does not attach final run payload to plan revisions', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({
        id: 'msg_plan',
        role: 'assistant',
        content: 'Plan updated',
        createdAt: '2026-05-19T00:00:01.000Z',
        runId: 'run_1',
        metadata: {
          kind: 'plan_revision',
          planRevision: {
            schema: 'movscript.agent.plan-revision.v1',
            id: 'plan_revision_1',
            planId: 'plan_1',
            threadId: 'thread_1',
            runId: 'run_1',
            snapshot: {
              schema: 'movscript.agent.plan.v1',
              id: 'plan_1',
              threadId: 'thread_1',
              runId: 'run_1',
              items: [{ step: 'Generate', status: 'completed' }],
              completedCount: 1,
              totalCount: 1,
              createdAt: NOW,
              updatedAt: NOW,
            },
            createdAt: NOW,
          },
        },
      }),
    ],
  })
  const run = makeRun({ id: 'run_1', assistantMessageId: 'msg_plan' })

  const messages = await projectRuntimeThreadMessages({
    thread,
    runs: [run],
    deps: projectionDeps(),
  })

  assert.equal(messages[0].meta?.planRevision?.id, 'plan_revision_1')
  assert.equal(messages[0].meta?.generationJobs, undefined)
  assert.equal(messages[0].meta?.localRunActivity, undefined)
  assert.equal(messages[0].attachments, undefined)
})

test('projectRuntimeThreadMessages creates synthetic assistant messages for top-level runs without persisted assistant messages', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({ id: 'msg_user', role: 'user', content: 'Use the tool', createdAt: '2026-05-19T00:00:01.000Z' }),
    ],
  })
  const run = makeRun({
    id: 'run_requires_action',
    status: 'requires_action',
    input: { sourceMessageId: 'msg_user', userMessage: 'Use the tool' },
    pendingApprovals: [{
      id: 'approval_1',
      runId: 'run_requires_action',
      toolName: 'movscript_test_tool',
      reason: 'needs confirmation',
      status: 'pending',
      createdAt: '2026-05-19T00:00:02.000Z',
      updatedAt: '2026-05-19T00:00:02.000Z',
    }],
  })
  const workerRun = makeRun({
    id: 'run_worker',
    role: 'worker',
    parentRunId: 'run_requires_action',
    status: 'completed',
  })

  const messages = await projectRuntimeThreadMessages({
    thread,
    runs: [workerRun, run],
    deps: projectionDeps(),
  })

  assert.deepEqual(messages.map((message) => message.id), [
    'runtime:msg_user',
    'runtime-run:run_requires_action:assistant',
  ])
  assert.equal(messages[1].role, 'assistant')
  assert.match(messages[1].content, /movscript_test_tool/)
  assert.deepEqual(messages[1].meta?.runtimeMessage, {
    threadId: 'thread_1',
    runId: 'run_requires_action',
  })
})

test('buildRuntimeThreadConversationProjection combines run state and message projection', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({ id: 'msg_user', role: 'user', content: 'Use the tool', createdAt: '2026-05-19T00:00:01.000Z' }),
    ],
    activeRunId: 'run_active',
  })
  const activeRun = makeRun({
    id: 'run_active',
    input: { sourceMessageId: 'msg_user', userMessage: 'Use the tool' },
  })
  const ensuredRun = makeRun({
    id: 'run_requires_action',
    status: 'requires_action',
    pendingApprovals: [{
      id: 'approval_1',
      runId: 'run_requires_action',
      toolName: 'movscript_test_tool',
      reason: 'needs confirmation',
      status: 'pending',
      createdAt: '2026-05-19T00:00:02.000Z',
      updatedAt: '2026-05-19T00:00:02.000Z',
    }],
  })

  const projection = await buildRuntimeThreadConversationProjection({
    thread,
    runs: [activeRun],
    ensureRuns: [ensuredRun],
    current: { activeRunIds: [activeRun.id] },
    deps: projectionDeps(),
  })

  assert.deepEqual(projection.runs.map((run) => run.id), ['run_active', 'run_requires_action'])
  assert.deepEqual(projection.actionableRuns.map((run) => run.id), ['run_requires_action'])
  assert.equal(projection.currentRun?.id, 'run_requires_action')
  assert.equal(projection.messages.some((message) => message.meta?.runtimeMessage?.runId === 'run_requires_action'), true)
})

test('projectRuntimeThreadMessages preserves existing synthetic assistant ids by runtime run id', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({ id: 'msg_user', role: 'user', content: 'Use the tool', createdAt: '2026-05-19T00:00:01.000Z' }),
    ],
  })
  const run = makeRun({
    id: 'run_requires_action',
    status: 'requires_action',
    input: { sourceMessageId: 'msg_user', userMessage: 'Use the tool' },
    pendingApprovals: [{
      id: 'approval_1',
      runId: 'run_requires_action',
      toolName: 'movscript_test_tool',
      reason: 'needs confirmation',
      status: 'pending',
      createdAt: '2026-05-19T00:00:02.000Z',
      updatedAt: '2026-05-19T00:00:02.000Z',
    }],
  })
  const existing: AgentChatMessage = {
    id: 'local_assistant_result',
    role: 'assistant',
    content: 'old synthetic content',
    meta: { runtimeMessage: { threadId: 'thread_1', runId: 'run_requires_action' } },
    timestamp: 1,
  }

  const messages = await projectRuntimeThreadMessages({
    thread,
    runs: [run],
    existingMessages: [existing],
    liveEventsByRunId: {
      run_requires_action: [{
        id: 'live_event_1',
        kind: 'runtime',
        title: 'Runtime',
        status: 'completed',
        createdAt: '2026-05-19T00:00:02.000Z',
      }],
    },
    deps: projectionDeps(),
  })

  assert.equal(messages[1].id, 'local_assistant_result')
  assert.equal(messages[1].meta?.localRunActivity?.events.some((event) => event.id === 'live_event_1'), true)
})

test('projectRuntimeThreadMessages keeps resumed old runs in creation order', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({ id: 'msg_old', role: 'user', content: 'Older interrupted work', createdAt: '2026-05-19T00:00:01.000Z' }),
      makeMessage({ id: 'msg_new', role: 'user', content: 'Newer work', createdAt: '2026-05-19T00:01:00.000Z' }),
    ],
  })
  const oldResumedRun = makeRun({
    id: 'run_old',
    status: 'completed',
    input: { sourceMessageId: 'msg_old', userMessage: 'Older interrupted work' },
    createdAt: '2026-05-19T00:00:02.000Z',
    updatedAt: '2026-05-19T00:05:00.000Z',
    completedAt: '2026-05-19T00:05:00.000Z',
  })
  const newerRun = makeRun({
    id: 'run_new',
    status: 'completed',
    input: { sourceMessageId: 'msg_new', userMessage: 'Newer work' },
    createdAt: '2026-05-19T00:01:01.000Z',
    updatedAt: '2026-05-19T00:01:30.000Z',
    completedAt: '2026-05-19T00:01:30.000Z',
  })

  const messages = await projectRuntimeThreadMessages({
    thread,
    runs: [newerRun, oldResumedRun],
    deps: projectionDeps(),
  })

  assert.deepEqual(messages.map((message) => message.meta?.runtimeMessage?.runId ?? message.id), [
    'run_old',
    'run_old',
    'run_new',
    'run_new',
  ])
})

test('projectRuntimeThreadMessages keeps persisted assistant results with their source run order', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({ id: 'msg_old', role: 'user', content: 'Older work', createdAt: '2026-05-19T00:00:01.000Z' }),
      makeMessage({ id: 'msg_new', role: 'user', content: 'Newer work', createdAt: '2026-05-19T00:01:00.000Z' }),
      makeMessage({ id: 'msg_new_assistant', role: 'assistant', content: 'New result', runId: 'run_new', createdAt: '2026-05-19T00:01:30.000Z' }),
      makeMessage({ id: 'msg_old_assistant', role: 'assistant', content: 'Old resumed result', runId: 'run_old', createdAt: '2026-05-19T00:05:00.000Z' }),
    ],
  })
  const oldResumedRun = makeRun({
    id: 'run_old',
    input: { sourceMessageId: 'msg_old', userMessage: 'Older work' },
    assistantMessageId: 'msg_old_assistant',
    createdAt: '2026-05-19T00:00:02.000Z',
    updatedAt: '2026-05-19T00:05:00.000Z',
    completedAt: '2026-05-19T00:05:00.000Z',
  })
  const newerRun = makeRun({
    id: 'run_new',
    input: { sourceMessageId: 'msg_new', userMessage: 'Newer work' },
    assistantMessageId: 'msg_new_assistant',
    createdAt: '2026-05-19T00:01:01.000Z',
    updatedAt: '2026-05-19T00:01:30.000Z',
    completedAt: '2026-05-19T00:01:30.000Z',
  })

  const messages = await projectRuntimeThreadMessages({
    thread,
    runs: [newerRun, oldResumedRun],
    deps: projectionDeps(),
  })

  assert.deepEqual(messages.map((message) => message.meta?.runtimeMessage?.runId ?? message.id), [
    'run_old',
    'run_old',
    'run_new',
    'run_new',
  ])
})

test('projectRuntimeThreadMessages binds runtime input user messages to the target run', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({ id: 'msg_user', role: 'user', content: 'Start work', createdAt: '2026-05-19T00:00:01.000Z' }),
      makeMessage({
        id: 'msg_runtime_input',
        role: 'user',
        content: 'Add this constraint',
        runId: 'run_1',
        createdAt: '2026-05-19T00:00:03.000Z',
        metadata: { kind: 'runtime_input', targetRunId: 'run_1', mode: 'soft', status: 'accepted' },
      }),
      makeMessage({ id: 'msg_assistant', role: 'assistant', content: 'Done', runId: 'run_1', createdAt: '2026-05-19T00:00:04.000Z' }),
    ],
  })
  const run = makeRun({
    id: 'run_1',
    input: { sourceMessageId: 'msg_user', userMessage: 'Start work' },
    assistantMessageId: 'msg_assistant',
  })

  const messages = await projectRuntimeThreadMessages({
    thread,
    runs: [run],
    deps: projectionDeps(),
  })

  assert.deepEqual(messages.map((message) => message.meta?.runtimeMessage), [
    { threadId: 'thread_1', messageId: 'msg_user', runId: 'run_1' },
    { threadId: 'thread_1', messageId: 'msg_runtime_input', runId: 'run_1' },
    { threadId: 'thread_1', messageId: 'msg_assistant', runId: 'run_1' },
  ])
  assert.deepEqual(messages[1]?.meta?.runtimeInput, {
    threadId: 'thread_1',
    messageId: 'msg_runtime_input',
    runId: 'run_1',
    status: 'accepted',
  })
})

test('projectRuntimeThreadMessages interleaves same-run user messages with run output by timestamp', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({ id: 'msg_user', role: 'user', content: 'Start work', createdAt: '2026-05-19T00:00:01.000Z' }),
      makeMessage({
        id: 'msg_plan',
        role: 'assistant',
        content: 'Plan updated',
        runId: 'run_1',
        createdAt: '2026-05-19T00:00:02.000Z',
        metadata: {
          kind: 'plan_revision',
          planRevision: {
            schema: 'movscript.agent.plan-revision.v1',
            id: 'plan_revision_1',
            planId: 'plan_1',
            threadId: 'thread_1',
            runId: 'run_1',
            snapshot: {
              schema: 'movscript.agent.plan.v1',
              id: 'plan_1',
              threadId: 'thread_1',
              runId: 'run_1',
              items: [{ step: 'Read', status: 'completed' }],
              completedCount: 1,
              totalCount: 1,
              createdAt: NOW,
              updatedAt: NOW,
            },
            createdAt: NOW,
          },
        },
      }),
      makeMessage({
        id: 'msg_runtime_input',
        role: 'user',
        content: 'Add this constraint',
        runId: 'run_1',
        createdAt: '2026-05-19T00:00:03.000Z',
        metadata: { kind: 'runtime_input', targetRunId: 'run_1', mode: 'soft', status: 'accepted' },
      }),
      makeMessage({ id: 'msg_assistant', role: 'assistant', content: 'Done', runId: 'run_1', createdAt: '2026-05-19T00:00:04.000Z' }),
    ],
  })
  const run = makeRun({
    id: 'run_1',
    input: { sourceMessageId: 'msg_user', userMessage: 'Start work' },
    assistantMessageId: 'msg_assistant',
  })

  const messages = await projectRuntimeThreadMessages({
    thread,
    runs: [run],
    deps: projectionDeps(),
  })

  assert.deepEqual(messages.map((message) => message.id), [
    'runtime:msg_user',
    'runtime:msg_plan',
    'runtime:msg_runtime_input',
    'runtime:msg_assistant',
  ])
})

test('mergeProjectedRuntimeMessages replaces only messages from the projected runtime thread', () => {
  const localMessage: AgentChatMessage = {
    id: 'local_error',
    role: 'assistant',
    content: 'local error',
    timestamp: 1,
  }
  const oldRuntimeMessage: AgentChatMessage = {
    id: 'old_runtime',
    role: 'assistant',
    content: 'old',
    meta: { runtimeMessage: { threadId: 'thread_1', runId: 'run_old' } },
    timestamp: 2,
  }
  const otherRuntimeMessage: AgentChatMessage = {
    id: 'other_runtime',
    role: 'assistant',
    content: 'other',
    meta: { runtimeMessage: { threadId: 'thread_other', runId: 'run_other' } },
    timestamp: 3,
  }
  const projectedMessage: AgentChatMessage = {
    id: 'projected_runtime',
    role: 'assistant',
    content: 'projected',
    meta: { runtimeMessage: { threadId: 'thread_1', runId: 'run_new' } },
    timestamp: 4,
  }

  const merged = mergeProjectedRuntimeMessages({
    existingMessages: [localMessage, oldRuntimeMessage, otherRuntimeMessage],
    projectedMessages: [projectedMessage],
    threadId: 'thread_1',
  })

  assert.deepEqual(merged.map((message) => message.id), ['local_error', 'other_runtime', 'projected_runtime'])
})

test('mergeProjectedRuntimeMessages preserves projected run order instead of completion timestamps', () => {
  const projectedMessages: AgentChatMessage[] = [
    {
      id: 'runtime:msg_run_1_user',
      role: 'user',
      content: 'Run 1',
      meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_run_1_user', runId: 'run_1' } },
      timestamp: 1,
    },
    {
      id: 'runtime:msg_run_1_assistant',
      role: 'assistant',
      content: 'Run 1 result',
      meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_run_1_assistant', runId: 'run_1' } },
      timestamp: 100,
    },
    {
      id: 'runtime:msg_run_2_user',
      role: 'user',
      content: 'Run 2',
      meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_run_2_user', runId: 'run_2' } },
      timestamp: 2,
    },
    {
      id: 'runtime:msg_run_2_assistant',
      role: 'assistant',
      content: 'Run 2 result',
      meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_run_2_assistant', runId: 'run_2' } },
      timestamp: 20,
    },
    {
      id: 'runtime:msg_run_3_user',
      role: 'user',
      content: 'Run 3',
      meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_run_3_user', runId: 'run_3' } },
      timestamp: 3,
    },
    {
      id: 'runtime:msg_run_3_assistant',
      role: 'assistant',
      content: 'Run 3 result',
      meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_run_3_assistant', runId: 'run_3' } },
      timestamp: 30,
    },
  ]

  const merged = mergeProjectedRuntimeMessages({
    existingMessages: [],
    projectedMessages,
    threadId: 'thread_1',
  })

  assert.deepEqual(merged.map((message) => message.meta?.runtimeMessage?.runId), [
    'run_1',
    'run_1',
    'run_2',
    'run_2',
    'run_3',
    'run_3',
  ])
})

test('mergeProjectedRuntimeMessages removes stale projected messages that lost runtime metadata', () => {
  const staleProjectedMessage: AgentChatMessage = {
    id: 'runtime:msg_assistant',
    role: 'assistant',
    content: 'Generated result',
    timestamp: 2,
  }
  const projectedMessage: AgentChatMessage = {
    id: 'runtime:msg_assistant',
    role: 'assistant',
    content: 'Generated result',
    meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_assistant', runId: 'run_1' } },
    timestamp: 2,
  }

  const once = mergeProjectedRuntimeMessages({
    existingMessages: [staleProjectedMessage],
    projectedMessages: [projectedMessage],
    threadId: 'thread_1',
  })
  const twice = mergeProjectedRuntimeMessages({
    existingMessages: once,
    projectedMessages: [projectedMessage],
    threadId: 'thread_1',
  })

  assert.deepEqual(once.map((message) => message.id), ['runtime:msg_assistant'])
  assert.deepEqual(twice.map((message) => message.id), ['runtime:msg_assistant'])
  assert.deepEqual(twice[0]?.meta?.runtimeMessage, { threadId: 'thread_1', messageId: 'msg_assistant', runId: 'run_1' })
})

test('mergeProjectedRuntimeMessages replaces local generated assistant echoes with the runtime projection', () => {
  const localGeneratedMessage: AgentChatMessage = {
    id: 'local_assistant_result',
    role: 'assistant',
    content: 'Generated result',
    meta: { contextLabels: ['run completed'] },
    timestamp: 1,
  }
  const projectedMessage: AgentChatMessage = {
    id: 'runtime:msg_assistant',
    role: 'assistant',
    content: 'Generated result',
    meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_assistant', runId: 'run_1' } },
    timestamp: 2,
  }

  const merged = mergeProjectedRuntimeMessages({
    existingMessages: [localGeneratedMessage],
    projectedMessages: [projectedMessage],
    threadId: 'thread_1',
  })

  assert.deepEqual(merged.map((message) => message.id), ['runtime:msg_assistant'])
})

function makeThread(input: { messages: AgentMessage[] }): AgentThread {
  return {
    id: 'thread_1',
    status: 'completed',
    createdAt: NOW,
    updatedAt: NOW,
    messages: input.messages,
  }
}

function makeMessage(input: Pick<AgentMessage, 'id' | 'role' | 'content' | 'createdAt'> & { runId?: string; clientInput?: unknown; metadata?: AgentMessage['metadata'] }): AgentMessage {
  return {
    id: input.id,
    threadId: 'thread_1',
    role: input.role,
    content: input.content,
    ...(input.clientInput ? { clientInput: input.clientInput } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    createdAt: input.createdAt,
  }
}

function makeRun(input: Partial<AgentRun> & { id: string }): AgentRun {
  return {
    ...input,
    id: input.id,
    threadId: 'thread_1',
    status: input.status ?? 'completed',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-19T00:00:02.000Z',
    updatedAt: '2026-05-19T00:00:03.000Z',
    steps: [],
  }
}

function projectionDeps() {
  return {
    assistantResultPayloadForRun: async (run: AgentRun, liveEvents: AgentRunActivityEvent[] = []) => ({
      meta: {
        runtimeMessage: {
          threadId: run.threadId,
          runId: run.id,
          ...(run.assistantMessageId ? { messageId: run.assistantMessageId } : {}),
        },
        ...(liveEvents.length > 0
          ? {
            localRunActivity: {
              runId: run.id,
              threadId: run.threadId,
              status: run.status,
              createdAt: run.createdAt,
              updatedAt: run.updatedAt,
              steps: [],
              events: liveEvents,
            },
          }
          : {}),
      },
    }),
    formatAssistantContent: (run: AgentRun, thread: Pick<AgentThread, 'messages'>) => {
      const assistant = thread.messages.find((item) => item.id === run.assistantMessageId)
        ?? [...thread.messages].reverse().find((item) => item.role === 'assistant' && item.runId === run.id)
      if (assistant) return assistant.content
      const approvalTools = (run.pendingApprovals ?? []).map((approval) => approval.toolName).join(', ')
      if (approvalTools) return approvalTools
      return run.error ?? ''
    },
  }
}
