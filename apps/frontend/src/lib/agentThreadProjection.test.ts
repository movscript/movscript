import assert from 'node:assert/strict'
import test from 'node:test'

import { mergeProjectedRuntimeMessages, projectRuntimeThreadMessages } from './agentThreadProjection'
import type { AgentMessage, AgentRun, AgentThread } from './localAgentClient'
import type { ChatMessage } from '@/store/agentStore'

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
    deps: { fetchRunGenerationView: async () => emptyGenerationReplay() },
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

test('projectRuntimeThreadMessages preserves existing local message ids for runtime-backed messages', async () => {
  const thread = makeThread({
    messages: [
      makeMessage({ id: 'msg_user', role: 'user', content: 'Continue', createdAt: '2026-05-19T00:00:01.000Z' }),
    ],
  })
  const existing: ChatMessage = {
    id: 'local_user_message',
    role: 'user',
    content: 'Continue',
    meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_user' } },
    timestamp: 1,
  }

  const messages = await projectRuntimeThreadMessages({
    thread,
    existingMessages: [existing],
    deps: { fetchRunGenerationView: async () => emptyGenerationReplay() },
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
  const existing: ChatMessage = {
    id: 'local_user_message',
    role: 'user',
    content: 'Create image',
    meta: { modelId: 1, agentName: 'Local Runtime', permissionMode: 'ask' },
    timestamp: 1,
  }

  const messages = await projectRuntimeThreadMessages({
    thread,
    existingMessages: [existing],
    deps: { fetchRunGenerationView: async () => emptyGenerationReplay() },
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
    deps: { fetchRunGenerationView: async () => emptyGenerationReplay() },
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
    deps: { fetchRunGenerationView: async () => emptyGenerationReplay() },
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
    deps: {
      fetchRunGenerationView: async () => ({
        jobs: [{
          jobId: 27,
          status: 'succeeded',
          terminal: true,
          outputResourceId: 30,
        }],
        latestJob: null,
        outputResourceIds: [30],
        outputResources: [{
          ID: 30,
          owner_id: 1,
          type: 'image',
          name: 'result.png',
          url: '/api/v1/resources/30/file',
          size: 100,
          mime_type: 'image/png',
        }],
        metadataByResourceId: new Map(),
        active: 0,
        terminal: 1,
        succeeded: 1,
        failed: 0,
        cancelled: 0,
        timeout: 0,
      }),
    },
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
    deps: { fetchRunGenerationView: async () => emptyGenerationReplay() },
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
  const existing: ChatMessage = {
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
    deps: { fetchRunGenerationView: async () => emptyGenerationReplay() },
  })

  assert.equal(messages[1].id, 'local_assistant_result')
  assert.equal(messages[1].meta?.localRunActivity?.events.some((event) => event.id === 'live_event_1'), true)
})

test('mergeProjectedRuntimeMessages replaces only messages from the projected runtime thread', () => {
  const localMessage: ChatMessage = {
    id: 'local_error',
    role: 'assistant',
    content: 'local error',
    timestamp: 1,
  }
  const oldRuntimeMessage: ChatMessage = {
    id: 'old_runtime',
    role: 'assistant',
    content: 'old',
    meta: { runtimeMessage: { threadId: 'thread_1', runId: 'run_old' } },
    timestamp: 2,
  }
  const otherRuntimeMessage: ChatMessage = {
    id: 'other_runtime',
    role: 'assistant',
    content: 'other',
    meta: { runtimeMessage: { threadId: 'thread_other', runId: 'run_other' } },
    timestamp: 3,
  }
  const projectedMessage: ChatMessage = {
    id: 'projected_runtime',
    role: 'assistant',
    content: 'projected',
    meta: { runtimeMessage: { threadId: 'thread_1', runId: 'run_new' } },
    timestamp: 4,
  }

  const merged = mergeProjectedRuntimeMessages(
    [localMessage, oldRuntimeMessage, otherRuntimeMessage],
    [projectedMessage],
    'thread_1',
  )

  assert.deepEqual(merged.map((message) => message.id), ['local_error', 'other_runtime', 'projected_runtime'])
})

test('mergeProjectedRuntimeMessages removes stale projected messages that lost runtime metadata', () => {
  const staleProjectedMessage: ChatMessage = {
    id: 'runtime:msg_assistant',
    role: 'assistant',
    content: 'Generated result',
    timestamp: 2,
  }
  const projectedMessage: ChatMessage = {
    id: 'runtime:msg_assistant',
    role: 'assistant',
    content: 'Generated result',
    meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_assistant', runId: 'run_1' } },
    timestamp: 2,
  }

  const once = mergeProjectedRuntimeMessages([staleProjectedMessage], [projectedMessage], 'thread_1')
  const twice = mergeProjectedRuntimeMessages(once, [projectedMessage], 'thread_1')

  assert.deepEqual(once.map((message) => message.id), ['runtime:msg_assistant'])
  assert.deepEqual(twice.map((message) => message.id), ['runtime:msg_assistant'])
  assert.deepEqual(twice[0]?.meta?.runtimeMessage, { threadId: 'thread_1', messageId: 'msg_assistant', runId: 'run_1' })
})

test('mergeProjectedRuntimeMessages replaces local generated assistant echoes with the runtime projection', () => {
  const localGeneratedMessage: ChatMessage = {
    id: 'local_assistant_result',
    role: 'assistant',
    content: 'Generated result',
    meta: { contextLabels: ['run completed'] },
    timestamp: 1,
  }
  const projectedMessage: ChatMessage = {
    id: 'runtime:msg_assistant',
    role: 'assistant',
    content: 'Generated result',
    meta: { runtimeMessage: { threadId: 'thread_1', messageId: 'msg_assistant', runId: 'run_1' } },
    timestamp: 2,
  }

  const merged = mergeProjectedRuntimeMessages([localGeneratedMessage], [projectedMessage], 'thread_1')

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

function emptyGenerationReplay() {
  return {
    jobs: [],
    latestJob: null,
    outputResourceIds: [],
    outputResources: [],
    metadataByResourceId: new Map(),
    active: 0,
    terminal: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    timeout: 0,
  }
}
