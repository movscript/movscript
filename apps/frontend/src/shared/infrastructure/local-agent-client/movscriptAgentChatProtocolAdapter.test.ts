import assert from 'node:assert/strict'
import test from 'node:test'
import { AGENT_PROTOCOL_VERSION, AGENT_RUNTIME_EVENT_V2_SCHEMA, type AgentRun, type AgentThread } from '@movscript/protocol'
import {
  agentChatNotificationFromMovScriptRuntimeEvent,
  agentChatServerRequestsFromMovScriptRun,
  agentChatThreadFromMovScriptAgent,
} from '@/shared/infrastructure/local-agent-client/movscriptAgentChatProtocolAdapter'

test('maps MovScript Agent messages and runs into Codex-shaped thread turns and items', () => {
  const thread = agentChatThreadFromMovScriptAgent({
    thread: threadFixture(),
    runs: [runFixture()],
  })

  assert.equal(thread.provider, 'movscript')
  assert.equal(thread.id, 'thread_1')
  assert.equal(thread.turns.length, 1)
  assert.equal(thread.turns[0]?.id, 'run_1')
  assert.equal(thread.turns[0]?.status, 'completed')
  assert.deepEqual(thread.turns[0]?.items.map((item) => item.type), ['userMessage', 'agentMessage', 'dynamicToolCall'])
  const firstItem = thread.turns[0]?.items[0]
  const firstContent = firstItem?.type === 'userMessage' ? firstItem.content[0] : undefined
  assert.equal(firstContent?.type === 'text' ? firstContent.text : '', 'Make a plan')
  assert.equal(thread.turns[0]?.items[1]?.type === 'agentMessage' ? thread.turns[0].items[1].text : '', 'Plan ready')
})

test('maps MovScript Agent runtime events into Codex-shaped stream notifications', () => {
  const run = runFixture({ status: 'in_progress' })
  const runNotification = agentChatNotificationFromMovScriptRuntimeEvent({
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: 'event_run',
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 1,
    cursor: 'cursor_1',
    emittedAt: '2026-06-04T00:00:00.000Z',
    kind: 'run.upserted',
    causality: { threadId: 'thread_1', runId: 'run_1' },
    entity: { type: 'run', value: run },
  })
  const progressNotification = agentChatNotificationFromMovScriptRuntimeEvent({
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: 'event_progress',
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 2,
    cursor: 'cursor_2',
    emittedAt: '2026-06-04T00:00:01.000Z',
    kind: 'assistant.progress',
    causality: { threadId: 'thread_1', runId: 'run_1' },
    assistantProgress: {
      runId: 'run_1',
      traceId: 'msg_stream',
      delta: 'hello',
      accumulated: 'hello',
      createdAt: '2026-06-04T00:00:01.000Z',
    },
  })

  assert.equal(runNotification?.method, 'turn/started')
  assert.equal(progressNotification?.method, 'item/agentMessage/delta')
  assert.deepEqual(progressNotification?.params, {
    threadId: 'thread_1',
    turnId: 'run_1',
    itemId: 'msg_stream',
    delta: 'hello',
  })
})

test('maps MovScript Agent pending interactions into Codex-shaped server requests', () => {
  const requests = agentChatServerRequestsFromMovScriptRun(runFixture({
    status: 'requires_action',
    pendingApprovals: [{
      id: 'approval_1',
      runId: 'run_1',
      toolName: 'writeFile',
      reason: 'Needs write access',
      permission: 'workspace-write',
      status: 'pending',
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
    }],
    pendingInputRequests: [{
      id: 'input_1',
      runId: 'run_1',
      title: 'Choose',
      question: 'Continue?',
      inputType: 'confirmation',
      choices: [],
      allowCustomAnswer: false,
      status: 'pending',
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
    }],
  }))

  assert.deepEqual(requests.map((request) => request.method), [
    'item/permissions/requestApproval',
    'item/tool/requestUserInput',
  ])
  assert.equal(requests[0]?.threadId, 'thread_1')
  assert.equal(requests[0]?.turnId, 'run_1')
})

function threadFixture(): AgentThread {
  return {
    id: 'thread_1',
    sessionId: 'session_1',
    title: 'Planning',
    status: 'completed',
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:03.000Z',
    messages: [{
      id: 'msg_user',
      threadId: 'thread_1',
      role: 'user',
      content: 'Make a plan',
      runId: 'run_1',
      createdAt: '2026-06-04T00:00:00.000Z',
    }, {
      id: 'msg_agent',
      threadId: 'thread_1',
      role: 'assistant',
      content: 'Plan ready',
      runId: 'run_1',
      createdAt: '2026-06-04T00:00:02.000Z',
    }],
  }
}

function runFixture(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    runtimeLimits: {
      approvalMode: 'interactive',
      maxToolCalls: 10,
      maxIterations: 5,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:03.000Z',
    startedAt: '2026-06-04T00:00:00.000Z',
    completedAt: '2026-06-04T00:00:03.000Z',
    steps: [{
      id: 'step_tool',
      runId: 'run_1',
      type: 'tool_call',
      status: 'completed',
      toolName: 'search',
      title: 'Search',
      createdAt: '2026-06-04T00:00:01.000Z',
      completedAt: '2026-06-04T00:00:02.000Z',
    }],
    ...overrides,
  }
}
