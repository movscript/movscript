import assert from 'node:assert/strict'
import test from 'node:test'

import {
  listRuntimeRunSummariesFromWorkspace,
  listRuntimeSessionSummariesFromWorkspace,
  listRuntimeThreadPageFromWorkspace,
  listRuntimeThreadSummariesFromWorkspace,
  runtimeRunSummariesFromRuntimeSession,
  runtimeThreadSummaryFromRuntimeSession,
  runtimeThreadSummaryFromThread,
} from '@/features/agent/application/agentRuntimeThreadQueryCache'
import { localAgentClient } from '@/shared/infrastructure/localAgentClient'
import type { AgentRuntimeSessionSummary, AgentThread } from '@/shared/infrastructure/localAgentClient'

test('runtime thread cache summaries count only projected transcript messages', () => {
  const summary = runtimeThreadSummaryFromThread({
    id: 'thread_1',
    archived: false,
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:04.000Z',
    messages: [
      {
        id: 'user_1',
        threadId: 'thread_1',
        role: 'user',
        content: 'Start',
        createdAt: '2026-05-19T00:00:01.000Z',
      },
      {
        id: 'status_1',
        threadId: 'thread_1',
        role: 'assistant',
        content: 'Generating image',
        metadata: { promptEligibility: 'exclude' },
        createdAt: '2026-05-19T00:00:02.000Z',
      },
      {
        id: 'assistant_1',
        threadId: 'thread_1',
        role: 'assistant',
        content: 'Done',
        createdAt: '2026-05-19T00:00:03.000Z',
      },
      {
        id: 'status_2',
        threadId: 'thread_1',
        role: 'assistant',
        content: 'Runtime status updated',
        metadata: { promptEligibility: 'exclude' },
        createdAt: '2026-05-19T00:00:04.000Z',
      },
    ],
  } as AgentThread)

  assert.equal(summary.messageCount, 2)
  assert.equal(summary.lastMessageAt, '2026-05-19T00:00:03.000Z')
})

test('runtime thread cache maps workspace session summaries to thread summaries', () => {
  const summary = runtimeThreadSummaryFromRuntimeSession({
    session: {
      id: 'session_1',
      title: 'Session title',
      projectId: 12,
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:01.000Z',
    },
    state: {
      rootThreadId: 'thread_root',
      interactiveThreadId: 'thread_interactive',
      activeThreadId: 'thread_worker',
      title: 'Thread title',
      projectId: 13,
      status: 'running',
      threadUpdatedAt: '2026-06-03T00:00:03.000Z',
      messageCount: 4,
      lastMessageAt: '2026-06-03T00:00:02.000Z',
    },
    paths: {
      sessionDate: '2026/06/03',
      sessionDir: '/tmp/session_1',
      runtimeLogPath: '/tmp/session_1/rollout.jsonl',
      runtimePath: '/tmp/session_1/runtime.json',
      lockPath: '/tmp/session_1/run.lock',
      heartbeatPath: '/tmp/session_1/heartbeat',
      socketPath: '/tmp/session_1/agent.sock',
    },
    running: true,
    stale: false,
  } satisfies AgentRuntimeSessionSummary)

  assert.equal(summary?.id, 'thread_interactive')
  assert.equal(summary?.sessionId, 'session_1')
  assert.equal(summary?.title, 'Thread title')
  assert.equal(summary?.projectId, 13)
  assert.equal(summary?.status, 'running')
  assert.equal(summary?.messageCount, 4)
  assert.equal(summary?.lastMessageAt, '2026-06-03T00:00:02.000Z')
})

test('runtime run cache maps workspace session summaries to run list items', () => {
  const runs = runtimeRunSummariesFromRuntimeSession({
    session: {
      id: 'session_1',
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:01.000Z',
    },
    workspaceDir: '/tmp/movscript-workspace',
    runs: [{
      id: 'run_1',
      threadId: 'thread_1',
      status: 'requires_action',
      role: 'worker',
      taskGraphId: 'task_graph_1',
      taskId: 'task_1',
      pendingApprovals: [{ id: 'approval_1', status: 'pending' }],
      pendingInputRequests: [{ id: 'input_1', status: 'resolved' }],
      metadata: { subagentName: 'Einstein' },
      createdAt: '2026-06-03T00:00:02.000Z',
      updatedAt: '2026-06-03T00:00:03.000Z',
      steps: [{ id: 'step_1' }],
    }, {
      id: 'run_unknown',
      threadId: 'thread_1',
      status: 'new-runtime-status',
      createdAt: '2026-06-03T00:00:02.000Z',
      updatedAt: '2026-06-03T00:00:03.000Z',
      steps: [],
    }],
    paths: {
      sessionDate: '2026/06/03',
      sessionDir: '/tmp/session_1',
      runtimeLogPath: '/tmp/session_1/rollout.jsonl',
      runtimePath: '/tmp/session_1/runtime.json',
      lockPath: '/tmp/session_1/run.lock',
      heartbeatPath: '/tmp/session_1/heartbeat',
      socketPath: '/tmp/session_1/agent.sock',
    },
    running: false,
    stale: true,
  } satisfies AgentRuntimeSessionSummary)

  assert.equal(runs.length, 1)
  assert.equal(runs[0]?.id, 'run_1')
  assert.equal(runs[0]?.sessionId, 'session_1')
  assert.equal(runs[0]?.workspaceDir, '/tmp/movscript-workspace')
  assert.equal(runs[0]?.status, 'requires_action')
  assert.equal(runs[0]?.role, 'worker')
  assert.equal(runs[0]?.pendingApprovals?.[0]?.status, 'pending')
  assert.equal(runs[0]?.pendingInputRequests?.[0]?.status, 'resolved')
  assert.equal(runs[0]?.steps.length, 1)
})

test('workspace session list helpers do not start a runtime when filesystem sessions are empty', async () => {
  const client = localAgentClient as typeof localAgentClient & {
    listRuntimeSessionsFromWorkspace: typeof localAgentClient.listRuntimeSessionsFromWorkspace
    ensureRunning: typeof localAgentClient.ensureRunning
    listThreads: typeof localAgentClient.listThreads
    listSessions: typeof localAgentClient.listSessions
  }
  const original = {
    listRuntimeSessionsFromWorkspace: client.listRuntimeSessionsFromWorkspace,
    ensureRunning: client.ensureRunning,
    listThreads: client.listThreads,
    listSessions: client.listSessions,
  }
  let started = false
  try {
    client.listRuntimeSessionsFromWorkspace = async () => ({ sessions: [] })
    client.ensureRunning = async () => {
      started = true
      throw new Error('ensureRunning should not be called for filesystem session listing')
    }
    client.listThreads = async () => {
      throw new Error('listThreads should not be called for filesystem session listing')
    }
    client.listSessions = async () => {
      throw new Error('listSessions should not be called for filesystem session listing')
    }

    assert.deepEqual(await listRuntimeThreadSummariesFromWorkspace({ includeProvisional: true }), [])
    assert.deepEqual(await listRuntimeSessionSummariesFromWorkspace(), [])
    assert.deepEqual(await listRuntimeRunSummariesFromWorkspace(), [])
    assert.deepEqual(await listRuntimeThreadPageFromWorkspace({ includeProvisional: true, limit: 10 }), {
      threads: [],
      total: 0,
      limit: 10,
      hasMore: false,
    })
    assert.equal(started, false)
  } finally {
    client.listRuntimeSessionsFromWorkspace = original.listRuntimeSessionsFromWorkspace
    client.ensureRunning = original.ensureRunning
    client.listThreads = original.listThreads
    client.listSessions = original.listSessions
  }
})
