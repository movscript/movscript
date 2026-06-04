import assert from 'node:assert/strict'
import test from 'node:test'
import { AGENT_PROTOCOL_VERSION, AGENT_RUNTIME_EVENT_V2_SCHEMA } from '@movscript/protocol'

import { createMovScriptAgentChatDataSource } from '@/shared/infrastructure/local-agent-client/movscriptAgentChatDataSource'
import type { LocalAgentClient } from '@/shared/infrastructure/localAgentClient'

test('MovScript Agent data source steers active turns through runtime input mode', async () => {
  const runMessages: Array<Record<string, unknown>> = []
  const client = {
    getThread: async () => movscriptThread(),
    forSession: () => ({
      runMessageStream: async (input: Record<string, unknown>) => {
        runMessages.push(input)
        return {
          thread: movscriptThread({ lastRunId: 'run_active' }),
          run: movscriptRun({ id: 'run_active', status: 'in_progress' }),
          sourceMessage: undefined,
        }
      },
    }),
  } as unknown as LocalAgentClient

  const dataSource = createMovScriptAgentChatDataSource(client)
  await dataSource.steerTurn?.({
    threadId: 'thread_1',
    turnId: 'run_active',
    clientUserMessageId: 'client_msg_2',
    inputs: [{ type: 'text', text: 'continue with more context', textElements: [] }],
  })

  assert.deepEqual(runMessages, [{
    message: 'continue with more context',
    sourceMessageId: 'client_msg_2',
    activeRunMode: 'runtime_input',
  }])
})

test('MovScript Agent data source sends turns through the thread runtime session', async () => {
  const scopedSessions: string[] = []
  const runMessages: Array<Record<string, unknown>> = []
  const client = {
    listRuntimeSessionsFromWorkspace: async () => ({
      sessions: [{
        session: {
          id: 'session_thread_1',
          createdAt: '2026-06-04T00:00:00.000Z',
          updatedAt: '2026-06-04T00:00:01.000Z',
        },
        state: {
          interactiveThreadId: 'thread_1',
          messageCount: 0,
        },
        runs: [],
        paths: {},
        running: true,
        stale: false,
      }],
    }),
    getThread: async () => {
      throw new Error('global thread lookup should not be used')
    },
    forSession: (input: { sessionId: string }) => {
      scopedSessions.push(input.sessionId)
      return {
        getThread: async () => movscriptThread({ sessionId: input.sessionId }),
        runMessageStream: async (request: Record<string, unknown>) => {
          runMessages.push(request)
          return {
            thread: movscriptThread({ sessionId: input.sessionId, lastRunId: 'run_1' }),
            run: movscriptRun({ id: 'run_1', status: 'completed' }),
            sourceMessage: undefined,
          }
        },
      }
    },
  } as unknown as LocalAgentClient

  const dataSource = createMovScriptAgentChatDataSource(client)
  await dataSource.startTextTurn({
    threadId: 'thread_1',
    text: 'hello',
    clientUserMessageId: 'client_msg_1',
  })

  assert.deepEqual(scopedSessions, ['session_thread_1', 'session_thread_1'])
  assert.deepEqual(runMessages, [{
    message: 'hello',
    sourceMessageId: 'client_msg_1',
    activeRunMode: 'new_run',
  }])
})

test('MovScript Agent data source interrupts the active run for a turn', async () => {
  const cancellations: Array<{ runId: string; reason?: string }> = []
  const client = {
    getThread: async () => movscriptThread({ activeRunId: 'run_active' }),
    cancelRun: async (runId: string, input: { reason?: string }) => {
      cancellations.push({ runId, reason: input.reason })
      return movscriptRun({ id: runId, status: 'cancelled' })
    },
  } as unknown as LocalAgentClient

  const dataSource = createMovScriptAgentChatDataSource(client)
  await dataSource.interruptTurn?.({
    threadId: 'thread_1',
    turnId: 'run_active',
    reason: 'Stop from test',
  })

  assert.deepEqual(cancellations, [{ runId: 'run_active', reason: 'Stop from test' }])
})

test('MovScript Agent data source maps provider-neutral thread lifecycle operations to local runtime APIs', async () => {
  const updates: Array<{ threadId: string; input: Record<string, unknown> }> = []
  const deletions: string[] = []
  const client = {
    updateThread: async (threadId: string, input: Record<string, unknown>) => {
      updates.push({ threadId, input })
      return movscriptThread({
        id: threadId,
        title: typeof input.title === 'string' ? input.title : 'Thread 1',
        archived: input.archived,
      })
    },
    deleteThread: async (threadId: string) => {
      deletions.push(threadId)
      return {
        deleted: true,
        threadId,
        deletedRunIds: [],
        deletedTaskGraphIds: [],
        deletedTaskIds: [],
        deletedRuntimeWorkIds: [],
        deletedRuntimeInteractionIds: [],
        deletedRuntimeContinuationIds: [],
      }
    },
  } as unknown as LocalAgentClient

  const dataSource = createMovScriptAgentChatDataSource(client)
  const renamed = await dataSource.renameThread?.({ threadId: 'thread_1', name: 'Renamed' })
  await dataSource.archiveThread?.({ threadId: 'thread_1' })
  await dataSource.unarchiveThread?.({ threadId: 'thread_1' })
  await dataSource.deleteThread?.({ threadId: 'thread_1' })

  assert.equal(renamed && typeof renamed === 'object' && 'name' in renamed ? renamed.name : null, 'Renamed')
  assert.deepEqual(updates, [
    { threadId: 'thread_1', input: { title: 'Renamed' } },
    { threadId: 'thread_1', input: { archived: true } },
    { threadId: 'thread_1', input: { archived: false } },
  ])
  assert.deepEqual(deletions, ['thread_1'])
})

test('MovScript Agent data source resolves streamed pending server requests through local runtime APIs', async () => {
  const approvals: string[] = []
  const inputAnswers: Array<{ runId: string; input: Record<string, unknown> }> = []
  const client = {
    streamThread: async (_threadId: string, options: { onRuntimeEvent?: (event: unknown) => void }) => {
      options.onRuntimeEvent?.({
        schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
        protocolVersion: AGENT_PROTOCOL_VERSION,
        id: 'event_run',
        scope: { type: 'thread', id: 'thread_1' },
        ordinal: 1,
        cursor: 'cursor_1',
        emittedAt: '2026-06-04T00:00:00.000Z',
        kind: 'run.upserted',
        causality: { threadId: 'thread_1', runId: 'run_active' },
        entity: {
          type: 'run',
          value: movscriptRun({
            status: 'requires_action',
            pendingApprovals: [{
              id: 'approval_1',
              runId: 'run_active',
              interactionId: 'interaction_approval_1',
              toolName: 'writeFile',
              reason: 'Needs write access',
              status: 'pending',
              createdAt: '2026-06-04T00:00:00.000Z',
              updatedAt: '2026-06-04T00:00:00.000Z',
            }],
            pendingInputRequests: [{
              id: 'input_1',
              runId: 'run_active',
              title: 'Continue',
              question: 'Continue?',
              inputType: 'text',
              choices: [],
              allowCustomAnswer: true,
              status: 'pending',
              createdAt: '2026-06-04T00:00:00.000Z',
              updatedAt: '2026-06-04T00:00:00.000Z',
            }],
          }),
        },
      })
    },
    approveInteraction: async (interactionId: string) => {
      approvals.push(interactionId)
      return { interaction: {}, run: movscriptRun() }
    },
    answerRunInput: async (runId: string, input: Record<string, unknown>) => {
      inputAnswers.push({ runId, input })
      return movscriptRun()
    },
  } as unknown as LocalAgentClient
  const seenMethods: string[] = []

  const dataSource = createMovScriptAgentChatDataSource(client)
  dataSource.subscribeThread?.({
    threadId: 'thread_1',
    onServerRequest: (request) => {
      seenMethods.push(request.method)
      if (request.method === 'item/tool/requestUserInput') return { action: 'answer', text: 'Continue.' }
      return { action: 'approve' }
    },
  })
  await flushPromises()

  assert.deepEqual(seenMethods, ['item/permissions/requestApproval', 'item/tool/requestUserInput'])
  assert.deepEqual(approvals, ['interaction_approval_1'])
  assert.deepEqual(inputAnswers, [{
    runId: 'run_active',
    input: { requestId: 'input_1', text: 'Continue.' },
  }])
})

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function movscriptThread(patch: Record<string, unknown> = {}) {
  return {
    id: 'thread_1',
    sessionId: 'session_1',
    title: 'Thread 1',
    status: 'running',
    activeRunId: 'run_active',
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:01.000Z',
    messages: [],
    ...patch,
  }
}

function movscriptRun(patch: Record<string, unknown> = {}) {
  return {
    id: 'run_active',
    threadId: 'thread_1',
    status: 'in_progress',
    role: 'assistant',
    steps: [],
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:01.000Z',
    startedAt: '2026-06-04T00:00:00.000Z',
    ...patch,
  }
}
