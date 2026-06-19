import assert from 'node:assert/strict'
import test from 'node:test'

import { applyProviderSessionThreadMutationResult, listProviderSessionRunSummariesFromProviderSessions, listProviderSessionSummariesFromWorkspace, listProviderSessionThreadPageFromWorkspace, listProviderSessionThreadSummariesFromWorkspace, providerThreadUpdatedResult, providerSessionRunSummariesFromProviderSession, providerSessionThreadSummaryFromProviderSession, providerSessionThreadSummaryFromThread, } from '@/features/agent/application/providerSessionThreadQueryCache'
import {
  isProviderSessionThreadListQueryKey, providerSessionConsoleProfileKey, providerSessionKeys, providerSessionRunKeys, providerSessionThreadKeys, } from '@/features/agent/application/providerSessionQueryKeys'
import { providerSessionClient } from '@/shared/infrastructure/providerSessionClient'
import type { AgentThread } from '@movscript/core/agent/protocol'
import type { ProviderSessionSummary } from '@/shared/contracts/electronApiProviderSessions'

test('provider session query keys own thread and console cache prefixes', () => {
  const identity = {
    provider: 'openai',
    providerId: 'codex',
    providerInstanceId: 'codex:http://localhost:4123',
    providerProtocol: 'provider-session',
  }

  assert.deepEqual(providerSessionThreadKeys.list(identity, 'agent-mode-sidebar'), [
    'provider-session-threads',
    identity,
    'agent-mode-sidebar',
  ])
  assert.deepEqual(providerSessionKeys.list(identity, 'agent-mode-sidebar'), [
    'provider-sessions',
    identity,
    'agent-mode-sidebar',
  ])
  assert.deepEqual(providerSessionThreadKeys.panelHistory, ['provider-session-panel-thread-history'])
  assert.deepEqual(providerSessionKeys.workspace, ['agent-console-provider-sessions', 'workspace'])
  assert.deepEqual(providerSessionKeys.workspaceProfile('codex'), ['agent-console-provider-sessions', 'workspace', 'codex'])
  assert.deepEqual(providerSessionRunKeys.console, ['agent-console-runs', 'provider-sessions'])
  assert.deepEqual(providerSessionRunKeys.consoleProfile('codex'), ['agent-console-runs', 'provider-sessions', 'codex'])
  assert.deepEqual(providerSessionThreadKeys.console, ['agent-console-threads', 'provider-sessions'])
  assert.deepEqual(providerSessionThreadKeys.consoleProfile('codex'), ['agent-console-threads', 'provider-sessions', 'codex'])
  assert.equal(providerSessionConsoleProfileKey(undefined), 'none')
  assert.equal(providerSessionConsoleProfileKey(' codex '), 'codex')
  assert.equal(isProviderSessionThreadListQueryKey(providerSessionThreadKeys.list(identity, 'agent-mode-sidebar')), true)
  assert.equal(isProviderSessionThreadListQueryKey(providerSessionThreadKeys.panelHistory), false)
})

test('provider session thread cache summaries count only projected transcript messages', () => {
  const summary = providerSessionThreadSummaryFromThread({
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
        content: 'Provider session status updated',
        metadata: { promptEligibility: 'exclude' },
        createdAt: '2026-05-19T00:00:04.000Z',
      },
    ],
  } as AgentThread)

  assert.equal(summary.messageCount, 2)
  assert.equal(summary.lastMessageAt, '2026-05-19T00:00:03.000Z')
})

test('provider session thread cache maps provider session summaries to thread summaries', () => {
  const summary = providerSessionThreadSummaryFromProviderSession({
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
  } satisfies ProviderSessionSummary)

  assert.equal(summary?.id, 'thread_interactive')
  assert.equal(summary?.sessionId, 'session_1')
  assert.equal(summary?.title, 'Thread title')
  assert.equal(summary?.projectId, 13)
  assert.equal(summary?.status, 'running')
  assert.equal(summary?.messageCount, 4)
  assert.equal(summary?.lastMessageAt, '2026-06-03T00:00:02.000Z')
})

test('provider thread updated result owns list cache updates', () => {
  const writes: unknown[] = []
  const queryClient = {
    setQueriesData: (filters: unknown, updater: (threads?: unknown[]) => unknown[]) => {
      writes.push(filters)
      writes.push(updater([{ id: 'thread_1', title: 'Old' }]))
      writes.push(updater([{ id: 'thread_2', title: 'Other' }]))
    },
  }
  const result = providerThreadUpdatedResult({
    thread: {
      id: 'thread_1',
      title: 'New',
      archived: false,
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:01.000Z',
      messageCount: 1,
    },
  })

  applyProviderSessionThreadMutationResult(queryClient as never, result)

  assert.equal(result.event.type, 'ProviderThreadUpdated')
  assert.deepEqual(result.changedIds, ['thread_1'])
  assert.equal(typeof (writes[0] as { predicate?: unknown }).predicate, 'function')
  assert.deepEqual(writes[1], [{ id: 'thread_1', title: 'New', archived: false, createdAt: '2026-06-03T00:00:00.000Z', updatedAt: '2026-06-03T00:00:01.000Z', messageCount: 1 }])
  assert.deepEqual((writes[2] as Array<{ id: string }>).map(item => item.id), ['thread_1', 'thread_2'])
})

test('provider session thread cache does not use provider session title as thread title', () => {
  const summary = providerSessionThreadSummaryFromProviderSession({
    session: {
      id: 'session_1',
      title: 'MovscriptCodex',
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:01.000Z',
    },
    state: {
      interactiveThreadId: 'thread_interactive',
      title: 'MovscriptCodex',
      status: 'running',
      threadUpdatedAt: '2026-06-03T00:00:03.000Z',
      messageCount: 4,
    },
  } satisfies ProviderSessionSummary)

  assert.equal(summary?.id, 'thread_interactive')
  assert.equal(summary?.title, undefined)
})

test('provider session thread list overlays workspace index with live thread titles', async () => {
  const client = providerSessionClient as typeof providerSessionClient & {
    listProviderSessionsFromWorkspace: typeof providerSessionClient.listProviderSessionsFromWorkspace
    listThreads: typeof providerSessionClient.listThreads
  }
  const original = {
    listProviderSessionsFromWorkspace: client.listProviderSessionsFromWorkspace,
    listThreads: client.listThreads,
  }
  try {
    client.listProviderSessionsFromWorkspace = async () => ({
      sessions: [{
        session: {
          id: 'session_1',
          title: 'MovscriptCodex',
          createdAt: '2026-06-03T00:00:00.000Z',
          updatedAt: '2026-06-03T00:00:01.000Z',
        },
        state: {
          interactiveThreadId: 'thread_interactive',
          title: 'MovscriptCodex',
          status: 'running',
          threadUpdatedAt: '2026-06-03T00:00:03.000Z',
          messageCount: 4,
        },
      }],
    })
    client.listThreads = async () => ({
      threads: [{
        id: 'thread_interactive',
        sessionId: 'session_1',
        title: '真正的 Thread 标题',
        archived: false,
        status: 'running',
        createdAt: '2026-06-03T00:00:00.000Z',
        updatedAt: '2026-06-03T00:00:03.000Z',
        messageCount: 5,
      }],
      total: 1,
      limit: 100,
      hasMore: false,
    })

    const summaries = await listProviderSessionThreadSummariesFromWorkspace({ includeProvisional: true })

    assert.equal(summaries.length, 1)
    assert.equal(summaries[0]?.title, '真正的 Thread 标题')
    assert.equal(summaries[0]?.messageCount, 5)
  } finally {
    client.listProviderSessionsFromWorkspace = original.listProviderSessionsFromWorkspace
    client.listThreads = original.listThreads
  }
})

test('provider session run cache maps provider session summaries to run list items', () => {
  const runs = providerSessionRunSummariesFromProviderSession({
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
  } satisfies ProviderSessionSummary)

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

test('provider session index helpers do not start a provider process when filesystem sessions are empty', async () => {
  const client = providerSessionClient as typeof providerSessionClient & {
    listProviderSessionsFromWorkspace: typeof providerSessionClient.listProviderSessionsFromWorkspace
    ensureRunning: typeof providerSessionClient.ensureRunning
    listThreads: typeof providerSessionClient.listThreads
    listSessions: typeof providerSessionClient.listSessions
  }
  const original = {
    listProviderSessionsFromWorkspace: client.listProviderSessionsFromWorkspace,
    ensureRunning: client.ensureRunning,
    listThreads: client.listThreads,
    listSessions: client.listSessions,
  }
  let started = false
  try {
    client.listProviderSessionsFromWorkspace = async () => ({ sessions: [] })
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

    assert.deepEqual(await listProviderSessionThreadSummariesFromWorkspace({ includeProvisional: true }), [])
    assert.deepEqual(await listProviderSessionSummariesFromWorkspace(), [])
    assert.deepEqual(await listProviderSessionRunSummariesFromProviderSessions(), [])
    assert.deepEqual(await listProviderSessionThreadPageFromWorkspace({ includeProvisional: true, limit: 10 }), {
      threads: [],
      total: 0,
      limit: 10,
      hasMore: false,
    })
    assert.equal(started, false)
  } finally {
    client.listProviderSessionsFromWorkspace = original.listProviderSessionsFromWorkspace
    client.ensureRunning = original.ensureRunning
    client.listThreads = original.listThreads
    client.listSessions = original.listSessions
  }
})

test('provider session run summaries are scoped by provider profile key', async () => {
  const client = providerSessionClient as typeof providerSessionClient & {
    listProviderSessionsFromWorkspace: typeof providerSessionClient.listProviderSessionsFromWorkspace
  }
  const original = client.listProviderSessionsFromWorkspace
  const calls: unknown[] = []
  try {
    client.listProviderSessionsFromWorkspace = async (input?: unknown) => {
      calls.push(input)
      return {
        sessions: [{
          session: {
            id: 'session_1',
            createdAt: '2026-06-03T00:00:00.000Z',
            updatedAt: '2026-06-03T00:00:01.000Z',
          },
          runs: [{
            id: 'run_1',
            threadId: 'thread_1',
            status: 'requires_action',
            createdAt: '2026-06-03T00:00:02.000Z',
            updatedAt: '2026-06-03T00:00:03.000Z',
            steps: [],
          }],
        }],
      }
    }

    const runs = await listProviderSessionRunSummariesFromProviderSessions({ providerProfileKey: 'codex' })

    assert.deepEqual(calls, [{ providerProfileKey: 'codex' }])
    assert.equal(runs.length, 1)
    assert.equal(runs[0]?.id, 'run_1')
  } finally {
    client.listProviderSessionsFromWorkspace = original
  }
})
