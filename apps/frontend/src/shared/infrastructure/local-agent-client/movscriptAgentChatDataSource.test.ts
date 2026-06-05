import assert from 'node:assert/strict'
import test from 'node:test'
import { AGENT_PROTOCOL_VERSION, AGENT_RUNTIME_EVENT_V2_SCHEMA } from '@movscript/protocol'

import { createMovScriptAgentChatDataSource } from '@/shared/infrastructure/local-agent-client/movscriptAgentChatDataSource'
import type { AgentChatNotification, AgentChatServerRequestResponse } from '@/features/agent/domain/agentChatProtocol'
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

test('MovScript Agent data source preserves media mention URLs when sending structured inputs', async () => {
  const runMessages: Array<Record<string, unknown>> = []
  const client = {
    getThread: async () => movscriptThread(),
    forSession: () => ({
      runMessageStream: async (request: Record<string, unknown>) => {
        runMessages.push(request)
        return {
          thread: movscriptThread({ lastRunId: 'run_1' }),
          run: movscriptRun({ id: 'run_1', status: 'completed' }),
          sourceMessage: undefined,
        }
      },
    }),
  } as unknown as LocalAgentClient

  const dataSource = createMovScriptAgentChatDataSource(client)
  await dataSource.startTurn?.({
    threadId: 'thread_1',
    clientUserMessageId: 'client_msg_media',
    inputs: [
      { type: 'text', text: 'Review media', textElements: [] },
      { type: 'image', url: 'https://cdn.example.com/frame.png', detail: 'auto', name: 'Frame', mimeType: 'image/png', resourceId: 7 },
      { type: 'mention', name: 'External cut', path: 'att_external_video', kind: 'video', mimeType: 'video/mp4', url: 'https://cdn.example.com/external.mp4' },
      { type: 'mention', name: 'Resource cut', path: 'resource:42', kind: 'video', mimeType: 'video/mp4', url: 'https://cdn.example.com/resource-cut.mp4' },
    ],
  })

  assert.deepEqual(runMessages, [{
    message: [
      'Review media',
      '[image: https://cdn.example.com/frame.png] resource: 7 name: Frame mime: image/png',
      '@[mention:External cut] att_external_video url: https://cdn.example.com/external.mp4 kind: video mime: video/mp4',
      '@[mention:Resource cut] resource:42 url: https://cdn.example.com/resource-cut.mp4 kind: video mime: video/mp4',
    ].join('\n'),
    sourceMessageId: 'client_msg_media',
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
    getThread: async () => movscriptThread(),
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

test('MovScript Agent data source resolves independently streamed pending interactions', async () => {
  const approvals: string[] = []
  const inputAnswers: Array<{ runId: string; input: Record<string, unknown> }> = []
  const seenRequests: Array<{ id: string; method: string }> = []
  const notifications: AgentChatNotification[] = []
  const client = {
    getThread: async () => movscriptThread(),
    streamThread: async (_threadId: string, options: { onRuntimeEvent?: (event: unknown) => void }) => {
      options.onRuntimeEvent?.({
        schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
        protocolVersion: AGENT_PROTOCOL_VERSION,
        id: 'event_interaction',
        scope: { type: 'thread', id: 'thread_1' },
        ordinal: 1,
        cursor: 'cursor_1',
        emittedAt: '2026-06-04T00:00:00.000Z',
        kind: 'interaction.upserted',
        causality: { threadId: 'thread_1', runId: 'run_active', interactionId: 'interaction_approval_1' },
        entity: {
          type: 'interaction',
          value: {
            id: 'interaction_approval_1',
            threadId: 'thread_1',
            runId: 'run_active',
            kind: 'approval',
            status: 'pending',
            payload: {
              approvalId: 'approval_1',
              toolName: 'writeFile',
              reason: 'Needs write access',
            },
            createdAt: '2026-06-04T00:00:00.000Z',
            updatedAt: '2026-06-04T00:00:00.000Z',
          },
        },
      })
      options.onRuntimeEvent?.({
        schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
        protocolVersion: AGENT_PROTOCOL_VERSION,
        id: 'event_input_interaction',
        scope: { type: 'thread', id: 'thread_1' },
        ordinal: 2,
        cursor: 'cursor_2',
        emittedAt: '2026-06-04T00:00:01.000Z',
        kind: 'interaction.upserted',
        causality: { threadId: 'thread_1', runId: 'run_active', interactionId: 'interaction_input_1' },
        entity: {
          type: 'interaction',
          value: {
            id: 'interaction_input_1',
            threadId: 'thread_1',
            runId: 'run_active',
            kind: 'input',
            status: 'pending',
            payload: {
              title: 'Provide detail',
              question: 'What should change?',
              inputType: 'text',
            },
            createdAt: '2026-06-04T00:00:01.000Z',
            updatedAt: '2026-06-04T00:00:01.000Z',
          },
        },
      })
      options.onRuntimeEvent?.({
        schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
        protocolVersion: AGENT_PROTOCOL_VERSION,
        id: 'event_selection_interaction',
        scope: { type: 'thread', id: 'thread_1' },
        ordinal: 3,
        cursor: 'cursor_3',
        emittedAt: '2026-06-04T00:00:02.000Z',
        kind: 'interaction.upserted',
        causality: { threadId: 'thread_1', runId: 'run_active', interactionId: 'interaction_selection_1' },
        entity: {
          type: 'interaction',
          value: {
            id: 'interaction_selection_1',
            threadId: 'thread_1',
            runId: 'run_active',
            kind: 'selection',
            status: 'pending',
            payload: {
              requestId: 'selection_request_1',
              title: 'Select option',
              question: 'Pick one',
              choices: [{ id: 'a', label: 'Option A' }],
            },
            createdAt: '2026-06-04T00:00:02.000Z',
            updatedAt: '2026-06-04T00:00:02.000Z',
          },
        },
      })
      options.onRuntimeEvent?.({
        schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
        protocolVersion: AGENT_PROTOCOL_VERSION,
        id: 'event_selection_interaction_resolved',
        scope: { type: 'thread', id: 'thread_1' },
        ordinal: 4,
        cursor: 'cursor_4',
        emittedAt: '2026-06-04T00:00:03.000Z',
        kind: 'interaction.upserted',
        causality: { threadId: 'thread_1', runId: 'run_active', interactionId: 'interaction_selection_1' },
        entity: {
          type: 'interaction',
          value: {
            id: 'interaction_selection_1',
            threadId: 'thread_1',
            runId: 'run_active',
            kind: 'selection',
            status: 'answered',
            payload: {
              requestId: 'selection_request_1',
              title: 'Select option',
              question: 'Pick one',
              choices: [{ id: 'a', label: 'Option A' }],
            },
            result: { choiceIds: ['a'] },
            createdAt: '2026-06-04T00:00:02.000Z',
            updatedAt: '2026-06-04T00:00:03.000Z',
            resolvedAt: '2026-06-04T00:00:03.000Z',
          },
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

  const dataSource = createMovScriptAgentChatDataSource(client)
  dataSource.subscribeThread?.({
    threadId: 'thread_1',
    onNotification: (notification) => notifications.push(notification),
    onServerRequest: (request) => {
      seenRequests.push({ id: request.id, method: request.method })
      if (request.id === 'interaction_input_1') return { action: 'answer', text: 'Change the title.' }
      if (request.id === 'selection_request_1') return { action: 'answer', choiceIds: ['a'] }
      return { action: 'approve' }
    },
  })
  await flushPromises()

  assert.deepEqual(seenRequests, [
    { id: 'approval_1', method: 'item/permissions/requestApproval' },
    { id: 'interaction_input_1', method: 'item/tool/requestUserInput' },
    { id: 'selection_request_1', method: 'item/tool/requestUserInput' },
  ])
  assert.deepEqual(approvals, ['interaction_approval_1'])
  assert.deepEqual(inputAnswers, [
    { runId: 'run_active', input: { requestId: 'interaction_input_1', text: 'Change the title.' } },
    { runId: 'run_active', input: { requestId: 'selection_request_1', choiceIds: ['a'] } },
  ])
  assert.deepEqual(notifications.map((notification) => notification.method), ['serverRequest/resolved'])
  assert.deepEqual(notifications[0]?.event, {
    type: 'serverRequestResolved',
    threadId: 'thread_1',
    requestId: 'selection_request_1',
    raw: notifications[0]?.raw,
  })
})

test('MovScript Agent data source answers input interactions on execution run instead of display anchor run', async () => {
  const inputAnswers: Array<{ runId: string; input: Record<string, unknown> }> = []
  const seenRequests: Array<{ id: string; turnId?: string; runId?: unknown }> = []
  const client = {
    getThread: async () => movscriptThread(),
    streamThread: async (_threadId: string, options: { onRuntimeEvent?: (event: unknown) => void }) => {
      options.onRuntimeEvent?.({
        schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
        protocolVersion: AGENT_PROTOCOL_VERSION,
        id: 'event_display_input_interaction',
        scope: { type: 'thread', id: 'display_thread_1' },
        ordinal: 1,
        cursor: 'cursor_1',
        emittedAt: '2026-06-04T00:00:01.000Z',
        kind: 'interaction.upserted',
        causality: { threadId: 'worker_thread_1', runId: 'worker_run_1', interactionId: 'interaction_input_1' },
        entity: {
          type: 'interaction',
          value: {
            id: 'interaction_input_1',
            threadId: 'worker_thread_1',
            displayThreadId: 'display_thread_1',
            displayAnchor: { threadId: 'display_thread_1', runId: 'display_run_1', placement: 'after' },
            runId: 'worker_run_1',
            originRunId: 'origin_run_1',
            kind: 'input',
            status: 'pending',
            payload: {
              requestId: 'input_1',
              title: 'Worker input',
              question: 'Continue worker?',
              inputType: 'text',
            },
            createdAt: '2026-06-04T00:00:01.000Z',
            updatedAt: '2026-06-04T00:00:01.000Z',
          },
        },
      })
    },
    answerRunInput: async (runId: string, input: Record<string, unknown>) => {
      inputAnswers.push({ runId, input })
      return movscriptRun({ id: runId })
    },
  } as unknown as LocalAgentClient

  const dataSource = createMovScriptAgentChatDataSource(client)
  dataSource.subscribeThread?.({
    threadId: 'display_thread_1',
    onServerRequest: (request) => {
      seenRequests.push({
        id: request.id,
        turnId: request.turnId,
        runId: isRecord(request.params) ? request.params.runId : undefined,
      })
      return { action: 'answer', text: 'Continue.' }
    },
  })
  await flushPromises()

  assert.deepEqual(seenRequests, [{
    id: 'input_1',
    turnId: 'display_run_1',
    runId: 'worker_run_1',
  }])
  assert.deepEqual(inputAnswers, [{
    runId: 'worker_run_1',
    input: { requestId: 'input_1', text: 'Continue.' },
  }])
})

test('MovScript Agent data source maps rejected and cancelled input requests to explicit runtime input text', async () => {
  const rejected = await resolveMovScriptInputRequestWithResponse({ action: 'reject', reason: 'Not now.' })
  const cancelled = await resolveMovScriptInputRequestWithResponse({ action: 'cancel' })

  assert.deepEqual(rejected, {
    runId: 'run_active',
    input: { requestId: 'input_1', text: 'Not now.' },
  })
  assert.deepEqual(cancelled, {
    runId: 'run_active',
    input: { requestId: 'input_1', text: 'Cancelled.' },
  })
})

test('MovScript Agent data source forwards input answers with choice ids and custom text', async () => {
  const answer = await resolveMovScriptInputRequestWithResponse({
    action: 'answer',
    choiceIds: ['choice_1'],
    text: 'Use this variant.',
  })

  assert.deepEqual(answer, {
    runId: 'run_active',
    input: {
      requestId: 'input_1',
      choiceIds: ['choice_1'],
      text: 'Use this variant.',
    },
  })
})

test('MovScript Agent data source surfaces MCP tool calls and matching approval requests from one stream', async () => {
  const approvals: string[] = []
  const notifications: AgentChatNotification[] = []
  const seenRequests: Array<{ id: string; method: string; toolName?: unknown; args?: unknown }> = []
  const client = {
    getThread: async () => movscriptThread(),
    streamThread: async (_threadId: string, options: { onRuntimeEvent?: (event: unknown) => void }) => {
      options.onRuntimeEvent?.({
        schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
        protocolVersion: AGENT_PROTOCOL_VERSION,
        id: 'event_step_focus',
        scope: { type: 'thread', id: 'thread_1' },
        ordinal: 1,
        cursor: 'cursor_1',
        emittedAt: '2026-06-04T00:00:00.000Z',
        kind: 'step.upserted',
        causality: { threadId: 'thread_1', runId: 'run_active' },
        entity: {
          type: 'step',
          value: {
            id: 'call_Ys6DnWNeoWwc3bT6XWAs3eu4',
            runId: 'run_active',
            type: 'tool_call',
            status: 'in_progress',
            toolName: 'movscript_focus_get',
            args: {},
            createdAt: '2026-06-04T00:00:00.000Z',
          },
        },
      })
      options.onRuntimeEvent?.({
        schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
        protocolVersion: AGENT_PROTOCOL_VERSION,
        id: 'event_interaction_focus',
        scope: { type: 'thread', id: 'thread_1' },
        ordinal: 2,
        cursor: 'cursor_2',
        emittedAt: '2026-06-04T00:00:01.000Z',
        kind: 'interaction.upserted',
        causality: { threadId: 'thread_1', runId: 'run_active', interactionId: 'interaction_focus_approval' },
        entity: {
          type: 'interaction',
          value: {
            id: 'interaction_focus_approval',
            threadId: 'thread_1',
            runId: 'run_active',
            kind: 'approval',
            status: 'pending',
            payload: {
              approvalId: 'approval_focus_get',
              toolName: 'movscript_focus_get',
              reason: 'Read current MovScript focus context',
              args: {},
              preview: { tool: 'movscript_focus_get' },
            },
            createdAt: '2026-06-04T00:00:01.000Z',
            updatedAt: '2026-06-04T00:00:01.000Z',
          },
        },
      })
    },
    approveInteraction: async (interactionId: string) => {
      approvals.push(interactionId)
      return { interaction: {}, run: movscriptRun() }
    },
  } as unknown as LocalAgentClient

  const dataSource = createMovScriptAgentChatDataSource(client)
  dataSource.subscribeThread?.({
    threadId: 'thread_1',
    onNotification: (notification) => notifications.push(notification),
    onServerRequest: (request) => {
      seenRequests.push({
        id: request.id,
        method: request.method,
        toolName: isRecord(request.params) ? request.params.toolName : undefined,
        args: isRecord(request.params) ? request.params.args : undefined,
      })
      return { action: 'approve' }
    },
  })
  await flushRuntimeStream()

  const toolNotification = notifications.find((notification) => notification.method === 'item/started')
  const item = isRecord(toolNotification?.params) && isRecord(toolNotification.params.item) ? toolNotification.params.item : {}
  assert.equal(item.type, 'mcpToolCall')
  assert.equal(item.id, 'call_Ys6DnWNeoWwc3bT6XWAs3eu4')
  assert.equal(item.server, 'movscript_workspace')
  assert.equal(item.tool, 'movscript_focus_get')
  assert.equal(item.status, 'inProgress')
  assert.deepEqual(seenRequests, [{
    id: 'approval_focus_get',
    method: 'item/permissions/requestApproval',
    toolName: 'movscript_focus_get',
    args: {},
  }])
  assert.deepEqual(approvals, ['interaction_focus_approval'])
})

test('MovScript Agent data source can approve MCP tool steps when causality carries interaction id', async () => {
  const approvals: string[] = []
  const seenRequests: Array<{ id: string; method: string; itemId?: string; toolName?: unknown; interactionId?: unknown }> = []
  const client = {
    getThread: async () => movscriptThread(),
    streamThread: async (_threadId: string, options: { onRuntimeEvent?: (event: unknown) => void }) => {
      options.onRuntimeEvent?.({
        schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
        protocolVersion: AGENT_PROTOCOL_VERSION,
        id: 'event_step_focus',
        scope: { type: 'thread', id: 'thread_1' },
        ordinal: 1,
        cursor: 'cursor_1',
        emittedAt: '2026-06-04T00:00:00.000Z',
        kind: 'step.upserted',
        causality: { threadId: 'thread_1', runId: 'run_active', interactionId: 'interaction_focus_approval' },
        entity: {
          type: 'step',
          value: {
            id: 'call_Ys6DnWNeoWwc3bT6XWAs3eu4',
            runId: 'run_active',
            type: 'tool_call',
            status: 'in_progress',
            toolName: 'movscript_focus_get',
            args: {},
            createdAt: '2026-06-04T00:00:00.000Z',
          },
        },
      })
    },
    approveInteraction: async (interactionId: string) => {
      approvals.push(interactionId)
      return { interaction: {}, run: movscriptRun() }
    },
  } as unknown as LocalAgentClient

  const dataSource = createMovScriptAgentChatDataSource(client)
  dataSource.subscribeThread?.({
    threadId: 'thread_1',
    onNotification: () => undefined,
    onServerRequest: (request) => {
      seenRequests.push({
        id: request.id,
        method: request.method,
        itemId: request.itemId,
        toolName: isRecord(request.params) ? request.params.toolName : undefined,
        interactionId: isRecord(request.params) ? request.params.interactionId : undefined,
      })
      return { action: 'approve' }
    },
  })
  await flushRuntimeStream()

  assert.deepEqual(seenRequests, [{
    id: 'interaction_focus_approval',
    method: 'item/permissions/requestApproval',
    itemId: 'call_Ys6DnWNeoWwc3bT6XWAs3eu4',
    toolName: 'movscript_focus_get',
    interactionId: 'interaction_focus_approval',
  }])
  assert.deepEqual(approvals, ['interaction_focus_approval'])
})

test('MovScript Agent data source recovers MCP approval requests from pending run state when step causality has no interaction id', async () => {
  const approvals: string[] = []
  const seenRequests: Array<{ id: string; method: string; toolName?: unknown; interactionId?: unknown }> = []
  const client = {
    getThread: async () => movscriptThread(),
    streamThread: async (_threadId: string, options: { onRuntimeEvent?: (event: unknown) => void }) => {
      options.onRuntimeEvent?.({
        schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
        protocolVersion: AGENT_PROTOCOL_VERSION,
        id: 'event_step_focus',
        scope: { type: 'thread', id: 'thread_1' },
        ordinal: 1,
        cursor: 'cursor_1',
        emittedAt: '2026-06-04T00:00:00.000Z',
        kind: 'step.upserted',
        causality: { threadId: 'thread_1', runId: 'run_active' },
        entity: {
          type: 'step',
          value: {
            id: 'call_Ys6DnWNeoWwc3bT6XWAs3eu4',
            runId: 'run_active',
            type: 'tool_call',
            status: 'in_progress',
            toolName: 'movscript_focus_get',
            args: {},
            createdAt: '2026-06-04T00:00:00.000Z',
          },
        },
      })
    },
    getRun: async (runId: string) => movscriptRun({
      id: runId,
      status: 'requires_action',
      pendingApprovals: [{
        id: 'approval_focus_get',
        runId,
        interactionId: 'interaction_focus_approval',
        toolName: 'movscript_focus_get',
        reason: 'Read current MovScript focus context',
        args: {},
        status: 'pending',
        createdAt: '2026-06-04T00:00:00.000Z',
        updatedAt: '2026-06-04T00:00:00.000Z',
      }],
    }),
    approveInteraction: async (interactionId: string) => {
      approvals.push(interactionId)
      return { interaction: {}, run: movscriptRun() }
    },
  } as unknown as LocalAgentClient

  const dataSource = createMovScriptAgentChatDataSource(client)
  dataSource.subscribeThread?.({
    threadId: 'thread_1',
    onServerRequest: (request) => {
      seenRequests.push({
        id: request.id,
        method: request.method,
        toolName: isRecord(request.params) ? request.params.toolName : undefined,
        interactionId: isRecord(request.params) ? request.params.interactionId : undefined,
      })
      return { action: 'approve' }
    },
  })
  await flushRuntimeStream()

  assert.deepEqual(seenRequests, [{
    id: 'approval_focus_get',
    method: 'item/permissions/requestApproval',
    toolName: 'movscript_focus_get',
    interactionId: 'interaction_focus_approval',
  }])
  assert.deepEqual(approvals, ['interaction_focus_approval'])
})

test('MovScript Agent data source surfaces missing interaction approvals from pending run lookup as notices', async () => {
  const approvals: string[] = []
  const seenRequests: string[] = []
  const notifications: AgentChatNotification[] = []
  const client = {
    getThread: async () => movscriptThread(),
    streamThread: async (_threadId: string, options: { onRuntimeEvent?: (event: unknown) => void }) => {
      options.onRuntimeEvent?.({
        schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
        protocolVersion: AGENT_PROTOCOL_VERSION,
        id: 'event_step_focus',
        scope: { type: 'thread', id: 'thread_1' },
        ordinal: 1,
        cursor: 'cursor_1',
        emittedAt: '2026-06-04T00:00:00.000Z',
        kind: 'step.upserted',
        causality: { threadId: 'thread_1', runId: 'run_active' },
        entity: {
          type: 'step',
          value: {
            id: 'call_Ys6DnWNeoWwc3bT6XWAs3eu4',
            runId: 'run_active',
            type: 'tool_call',
            status: 'in_progress',
            toolName: 'movscript_focus_get',
            args: {},
            createdAt: '2026-06-04T00:00:00.000Z',
          },
        },
      })
    },
    getRun: async (runId: string) => movscriptRun({
      id: runId,
      status: 'requires_action',
      pendingApprovals: [{
        id: 'approval_focus_get',
        runId,
        toolName: 'movscript_focus_get',
        reason: 'Read current MovScript focus context',
        permission: 'workspace.read',
        status: 'pending',
        createdAt: '2026-06-04T00:00:00.000Z',
        updatedAt: '2026-06-04T00:00:00.000Z',
      }],
    }),
    approveInteraction: async (interactionId: string) => {
      approvals.push(interactionId)
      return { interaction: {}, run: movscriptRun() }
    },
  } as unknown as LocalAgentClient

  const dataSource = createMovScriptAgentChatDataSource(client)
  dataSource.subscribeThread?.({
    threadId: 'thread_1',
    onNotification: (notification) => notifications.push(notification),
    onServerRequest: (request) => {
      seenRequests.push(request.id)
      return { action: 'approve' }
    },
  })
  await flushRuntimeStream()

  assert.deepEqual(seenRequests, [])
  assert.deepEqual(approvals, [])
  assert.equal(notifications.some((notification) => notification.method === 'item/started'), true)
  const notice = notifications.find((notification) => notification.method === 'item/completed'
    && isRecord(notification.params)
    && isRecord(notification.params.item)
    && notification.params.item.code === 'runtime.approval.missing_interaction')
  assert.ok(notice)
  assert.equal(isRecord(notice.params) ? notice.params.threadId : undefined, 'thread_1')
  assert.equal(isRecord(notice.params) ? notice.params.turnId : undefined, 'run_active')
  assert.match(JSON.stringify(notice.params), /the UI will show approval controls when the interaction event arrives/)
})

test('MovScript Agent data source deduplicates MCP step approval fallback against later interaction event', async () => {
  const approvals: string[] = []
  const seenRequests: string[] = []
  const client = {
    getThread: async () => movscriptThread(),
    streamThread: async (_threadId: string, options: { onRuntimeEvent?: (event: unknown) => void }) => {
      options.onRuntimeEvent?.({
        schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
        protocolVersion: AGENT_PROTOCOL_VERSION,
        id: 'event_step_focus',
        scope: { type: 'thread', id: 'thread_1' },
        ordinal: 1,
        cursor: 'cursor_1',
        emittedAt: '2026-06-04T00:00:00.000Z',
        kind: 'step.upserted',
        causality: { threadId: 'thread_1', runId: 'run_active', interactionId: 'interaction_focus_approval' },
        entity: {
          type: 'step',
          value: {
            id: 'call_Ys6DnWNeoWwc3bT6XWAs3eu4',
            runId: 'run_active',
            type: 'tool_call',
            status: 'in_progress',
            toolName: 'movscript_focus_get',
            args: {},
            createdAt: '2026-06-04T00:00:00.000Z',
          },
        },
      })
      options.onRuntimeEvent?.({
        schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
        protocolVersion: AGENT_PROTOCOL_VERSION,
        id: 'event_interaction_focus',
        scope: { type: 'thread', id: 'thread_1' },
        ordinal: 2,
        cursor: 'cursor_2',
        emittedAt: '2026-06-04T00:00:01.000Z',
        kind: 'interaction.upserted',
        causality: { threadId: 'thread_1', runId: 'run_active', interactionId: 'interaction_focus_approval' },
        entity: {
          type: 'interaction',
          value: {
            id: 'interaction_focus_approval',
            threadId: 'thread_1',
            runId: 'run_active',
            kind: 'approval',
            status: 'pending',
            payload: {
              approvalId: 'approval_focus_get',
              toolName: 'movscript_focus_get',
              reason: 'Read current MovScript focus context',
            },
            createdAt: '2026-06-04T00:00:01.000Z',
            updatedAt: '2026-06-04T00:00:01.000Z',
          },
        },
      })
    },
    approveInteraction: async (interactionId: string) => {
      approvals.push(interactionId)
      return { interaction: {}, run: movscriptRun() }
    },
  } as unknown as LocalAgentClient

  const dataSource = createMovScriptAgentChatDataSource(client)
  dataSource.subscribeThread?.({
    threadId: 'thread_1',
    onServerRequest: (request) => {
      seenRequests.push(request.id)
      return { action: 'approve' }
    },
  })
  await flushRuntimeStream()

  assert.deepEqual(seenRequests, ['interaction_focus_approval'])
  assert.deepEqual(approvals, ['interaction_focus_approval'])
})

test('MovScript Agent data source exposes session-wide server request subscriptions', async () => {
  const scopedSessions: string[] = []
  const approvals: string[] = []
  const inputAnswers: Array<{ runId: string; input: Record<string, unknown> }> = []
  const seenRequests: Array<{ id: string; threadId?: string; method: string }> = []
  const notifications: AgentChatNotification[] = []
  const client = {
    listRuntimeSessionsFromWorkspace: async () => ({
      sessions: [{
        session: {
          id: 'session_1',
          createdAt: '2026-06-04T00:00:00.000Z',
          updatedAt: '2026-06-04T00:00:01.000Z',
        },
        workspaceDir: '/workspace',
        state: {
          interactiveThreadId: 'thread_1',
          messageCount: 0,
        },
        runs: [],
        paths: {},
        running: true,
        stale: false,
      }, {
        session: {
          id: 'session_stale',
          createdAt: '2026-06-04T00:00:00.000Z',
          updatedAt: '2026-06-04T00:00:01.000Z',
        },
        state: { messageCount: 0 },
        runs: [],
        paths: {},
        running: true,
        stale: true,
      }],
    }),
    forSession: (input: { sessionId: string }) => {
      scopedSessions.push(input.sessionId)
      return {
        streamSession: async (_sessionId: string, options: { onRuntimeEvent?: (event: unknown) => void }) => {
          options.onRuntimeEvent?.({
            schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
            protocolVersion: AGENT_PROTOCOL_VERSION,
            id: 'event_session_interaction',
            scope: { type: 'session', id: 'session_1' },
            ordinal: 1,
            cursor: 'cursor_1',
            emittedAt: '2026-06-04T00:00:01.000Z',
            kind: 'interaction.upserted',
            causality: { threadId: 'worker_thread_1', runId: 'run_worker', interactionId: 'interaction_approval_1' },
            entity: {
              type: 'interaction',
              value: {
                id: 'interaction_approval_1',
                threadId: 'worker_thread_1',
                displayThreadId: 'thread_1',
                runId: 'run_worker',
                kind: 'approval',
                status: 'pending',
                payload: {
                  approvalId: 'approval_1',
                  toolName: 'movscript_focus_get',
                  reason: 'Tool approval required',
                },
                createdAt: '2026-06-04T00:00:01.000Z',
                updatedAt: '2026-06-04T00:00:01.000Z',
              },
            },
          })
          options.onRuntimeEvent?.({
            schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
            protocolVersion: AGENT_PROTOCOL_VERSION,
            id: 'event_session_input',
            scope: { type: 'session', id: 'session_1' },
            ordinal: 2,
            cursor: 'cursor_2',
            emittedAt: '2026-06-04T00:00:02.000Z',
            kind: 'interaction.upserted',
            causality: { threadId: 'worker_thread_1', runId: 'run_worker', interactionId: 'interaction_input_1' },
            entity: {
              type: 'interaction',
              value: {
                id: 'interaction_input_1',
                threadId: 'worker_thread_1',
                displayThreadId: 'thread_1',
                runId: 'run_worker',
                kind: 'input',
                status: 'pending',
                payload: {
                  requestId: 'input_1',
                  title: 'Need input',
                  question: 'Continue worker?',
                  inputType: 'text',
                },
                createdAt: '2026-06-04T00:00:02.000Z',
                updatedAt: '2026-06-04T00:00:02.000Z',
              },
            },
          })
          options.onRuntimeEvent?.({
            schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
            protocolVersion: AGENT_PROTOCOL_VERSION,
            id: 'event_session_interaction_resolved',
            scope: { type: 'session', id: 'session_1' },
            ordinal: 3,
            cursor: 'cursor_3',
            emittedAt: '2026-06-04T00:00:03.000Z',
            kind: 'interaction.upserted',
            causality: { threadId: 'worker_thread_1', runId: 'run_worker', interactionId: 'interaction_approval_1' },
            entity: {
              type: 'interaction',
              value: {
                id: 'interaction_approval_1',
                threadId: 'worker_thread_1',
                displayThreadId: 'thread_1',
                runId: 'run_worker',
                kind: 'approval',
                status: 'approved',
                payload: {
                  approvalId: 'approval_1',
                  toolName: 'movscript_focus_get',
                  reason: 'Tool approval required',
                },
                result: { approved: true },
                createdAt: '2026-06-04T00:00:01.000Z',
                updatedAt: '2026-06-04T00:00:03.000Z',
                resolvedAt: '2026-06-04T00:00:03.000Z',
              },
            },
          })
        },
        approveInteraction: async (interactionId: string) => {
          approvals.push(interactionId)
          return { interaction: {}, run: movscriptRun({ id: 'run_worker' }) }
        },
        answerRunInput: async (runId: string, input: Record<string, unknown>) => {
          inputAnswers.push({ runId, input })
          return movscriptRun({ id: runId })
        },
      }
    },
  } as unknown as LocalAgentClient

  const dataSource = createMovScriptAgentChatDataSource(client)
  const dispose = await Promise.resolve(dataSource.subscribeServerRequests?.({
    onNotification: (notification) => notifications.push(notification),
    onServerRequest: (request) => {
      seenRequests.push({ id: request.id, threadId: request.threadId, method: request.method })
      if (request.method === 'item/tool/requestUserInput') return { action: 'answer', text: 'Continue.' }
      return { action: 'approve' }
    },
  }))
  await flushPromises()
  await flushPromises()
  dispose?.()

  assert.deepEqual(scopedSessions, ['session_1'])
  assert.deepEqual(seenRequests, [
    { id: 'approval_1', threadId: 'thread_1', method: 'item/permissions/requestApproval' },
    { id: 'input_1', threadId: 'thread_1', method: 'item/tool/requestUserInput' },
  ])
  assert.deepEqual(approvals, ['interaction_approval_1'])
  assert.deepEqual(inputAnswers, [{
    runId: 'run_worker',
    input: { requestId: 'input_1', text: 'Continue.' },
  }])
  assert.deepEqual(notifications.map((notification) => notification.method), ['serverRequest/resolved'])
  assert.deepEqual(notifications[0]?.event, {
    type: 'serverRequestResolved',
    threadId: 'thread_1',
    requestId: 'approval_1',
    raw: notifications[0]?.raw,
  })
})

test('MovScript Agent data source deduplicates server requests across session and thread streams', async () => {
  const approvals: string[] = []
  const seenRequests: string[] = []
  const pendingApprovalEvent = {
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: 'event_interaction',
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 1,
    cursor: 'cursor_1',
    emittedAt: '2026-06-04T00:00:01.000Z',
    kind: 'interaction.upserted',
    causality: { threadId: 'thread_1', runId: 'run_active', interactionId: 'interaction_approval_1' },
    entity: {
      type: 'interaction',
      value: {
        id: 'interaction_approval_1',
        threadId: 'thread_1',
        runId: 'run_active',
        kind: 'approval',
        status: 'pending',
        payload: {
          approvalId: 'approval_1',
          toolName: 'movscript_focus_get',
          reason: 'Tool approval required',
        },
        createdAt: '2026-06-04T00:00:01.000Z',
        updatedAt: '2026-06-04T00:00:01.000Z',
      },
    },
  }
  const client = {
    listRuntimeSessionsFromWorkspace: async () => ({
      sessions: [{
        session: {
          id: 'session_1',
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
    getThread: async () => movscriptThread(),
    streamThread: async (_threadId: string, options: { onRuntimeEvent?: (event: unknown) => void }) => {
      options.onRuntimeEvent?.(pendingApprovalEvent)
    },
    forSession: () => ({
      getThread: async () => movscriptThread(),
      streamThread: async (_threadId: string, options: { onRuntimeEvent?: (event: unknown) => void }) => {
        options.onRuntimeEvent?.(pendingApprovalEvent)
      },
      streamSession: async (_sessionId: string, options: { onRuntimeEvent?: (event: unknown) => void }) => {
        options.onRuntimeEvent?.(pendingApprovalEvent)
      },
      approveInteraction: async (interactionId: string) => {
        approvals.push(interactionId)
        return { interaction: {}, run: movscriptRun() }
      },
    }),
  } as unknown as LocalAgentClient

  const dataSource = createMovScriptAgentChatDataSource(client)
  const dispose = await Promise.resolve(dataSource.subscribeServerRequests?.({
    onServerRequest: (request) => {
      seenRequests.push(request.id)
      return { action: 'approve' }
    },
  }))
  dataSource.subscribeThread?.({
    threadId: 'thread_1',
    onServerRequest: (request) => {
      seenRequests.push(request.id)
      return { action: 'approve' }
    },
  })
  await flushPromises()
  await flushPromises()
  dispose?.()

  assert.deepEqual(seenRequests, ['approval_1'])
  assert.deepEqual(approvals, ['interaction_approval_1'])
})

test('MovScript Agent data source keeps same request and interaction ids distinct across runtime scopes', async () => {
  const approvals: string[] = []
  const seenRequests: Array<{ id: string; threadId?: string; turnId?: string }> = []
  const client = {
    listRuntimeSessionsFromWorkspace: async () => ({
      sessions: [{
        ...movscriptRuntimeSessionSummary(),
        session: { id: 'session_1', createdAt: '2026-06-04T00:00:00.000Z', updatedAt: '2026-06-04T00:00:01.000Z' },
        state: { interactiveThreadId: 'thread_1', messageCount: 0 },
      }, {
        ...movscriptRuntimeSessionSummary(),
        session: { id: 'session_2', createdAt: '2026-06-04T00:00:00.000Z', updatedAt: '2026-06-04T00:00:01.000Z' },
        state: { interactiveThreadId: 'thread_2', messageCount: 0 },
      }],
    }),
    forSession: (input: { sessionId: string }) => ({
      streamSession: async (_sessionId: string, options: { onRuntimeEvent?: (event: unknown) => void }) => {
        const index = input.sessionId === 'session_1' ? '1' : '2'
        options.onRuntimeEvent?.({
          schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
          protocolVersion: AGENT_PROTOCOL_VERSION,
          id: `event_interaction_${index}`,
          scope: { type: 'session', id: input.sessionId },
          ordinal: 1,
          cursor: `cursor_${index}`,
          emittedAt: '2026-06-04T00:00:01.000Z',
          kind: 'interaction.upserted',
          causality: { threadId: `thread_${index}`, runId: `run_${index}`, interactionId: 'interaction_approval_1' },
          entity: {
            type: 'interaction',
            value: {
              id: 'interaction_approval_1',
              threadId: `thread_${index}`,
              runId: `run_${index}`,
              kind: 'approval',
              status: 'pending',
              payload: {
                approvalId: 'approval_1',
                toolName: 'movscript_focus_get',
                reason: 'Tool approval required',
              },
              createdAt: '2026-06-04T00:00:01.000Z',
              updatedAt: '2026-06-04T00:00:01.000Z',
            },
          },
        })
      },
      approveInteraction: async (interactionId: string) => {
        approvals.push(interactionId)
        return { interaction: {}, run: movscriptRun() }
      },
    }),
  } as unknown as LocalAgentClient

  const dataSource = createMovScriptAgentChatDataSource(client)
  const dispose = await Promise.resolve(dataSource.subscribeServerRequests?.({
    onServerRequest: (request) => {
      seenRequests.push({ id: request.id, threadId: request.threadId, turnId: request.turnId })
      return { action: 'approve' }
    },
  }))
  await flushRuntimeStream()
  dispose?.()

  assert.deepEqual(seenRequests, [
    { id: 'approval_1', threadId: 'thread_1', turnId: 'run_1' },
    { id: 'approval_1', threadId: 'thread_2', turnId: 'run_2' },
  ])
  assert.deepEqual(approvals, ['interaction_approval_1', 'interaction_approval_1'])
})

test('MovScript Agent data source releases dedupe when server request handling returns undefined', async () => {
  const seenRequests: string[] = []
  const pendingApprovalEvent = movscriptPendingApprovalInteractionEvent()
  let emitRuntimeEvent: ((event: unknown) => void) | undefined
  const client = {
    listRuntimeSessionsFromWorkspace: async () => ({
      sessions: [movscriptRuntimeSessionSummary()],
    }),
    forSession: () => ({
      streamSession: async (_sessionId: string, options: { onRuntimeEvent?: (event: unknown) => void }) => {
        emitRuntimeEvent = options.onRuntimeEvent
      },
    }),
  } as unknown as LocalAgentClient

  const dataSource = createMovScriptAgentChatDataSource(client)
  const dispose = await Promise.resolve(dataSource.subscribeServerRequests?.({
    onServerRequest: (request) => {
      seenRequests.push(request.id)
      return undefined
    },
  }))
  await flushRuntimeStream()
  emitRuntimeEvent?.(pendingApprovalEvent)
  await flushRuntimeStream()
  emitRuntimeEvent?.(pendingApprovalEvent)
  await flushRuntimeStream()
  dispose?.()

  assert.deepEqual(seenRequests, ['approval_1', 'approval_1'])
})

test('MovScript Agent data source releases dedupe when a server request is resolved externally', async () => {
  const approvals: string[] = []
  const seenRequests: string[] = []
  const pendingApprovalEvent = movscriptPendingApprovalInteractionEvent()
  const resolvedApprovalEvent = movscriptResolvedApprovalInteractionEvent()
  let emitRuntimeEvent: ((event: unknown) => void) | undefined
  const client = {
    listRuntimeSessionsFromWorkspace: async () => ({
      sessions: [movscriptRuntimeSessionSummary()],
    }),
    forSession: () => ({
      streamSession: async (_sessionId: string, options: { onRuntimeEvent?: (event: unknown) => void }) => {
        emitRuntimeEvent = options.onRuntimeEvent
      },
      approveInteraction: async (interactionId: string) => {
        approvals.push(interactionId)
        return { interaction: {}, run: movscriptRun() }
      },
    }),
  } as unknown as LocalAgentClient

  const dataSource = createMovScriptAgentChatDataSource(client)
  const dispose = await Promise.resolve(dataSource.subscribeServerRequests?.({
    onServerRequest: (request) => {
      seenRequests.push(request.id)
      return { action: 'approve' }
    },
  }))
  await flushRuntimeStream()
  emitRuntimeEvent?.(pendingApprovalEvent)
  await flushRuntimeStream()
  emitRuntimeEvent?.(pendingApprovalEvent)
  emitRuntimeEvent?.(resolvedApprovalEvent)
  await flushRuntimeStream()
  emitRuntimeEvent?.(pendingApprovalEvent)
  await flushRuntimeStream()
  dispose?.()

  assert.deepEqual(seenRequests, ['approval_1', 'approval_1'])
  assert.deepEqual(approvals, ['interaction_approval_1', 'interaction_approval_1'])
})

test('MovScript Agent data source streams thread metadata notifications', async () => {
  const notifications: AgentChatNotification[] = []
  const client = {
    getThread: async () => movscriptThread(),
    streamThread: async (_threadId: string, options: { onRuntimeEvent?: (event: unknown) => void }) => {
      options.onRuntimeEvent?.({
        schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
        protocolVersion: AGENT_PROTOCOL_VERSION,
        id: 'event_thread',
        scope: { type: 'thread', id: 'thread_1' },
        ordinal: 1,
        cursor: 'cursor_1',
        emittedAt: '2026-06-04T00:00:01.000Z',
        kind: 'thread.upserted',
        causality: { threadId: 'thread_1' },
        entity: {
          type: 'thread',
          value: movscriptThread({
            title: 'Updated title',
            status: 'completed',
            updatedAt: '2026-06-04T00:00:05.000Z',
          }),
        },
      })
      options.onRuntimeEvent?.({
        schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
        protocolVersion: AGENT_PROTOCOL_VERSION,
        id: 'event_status',
        scope: { type: 'thread', id: 'thread_1' },
        ordinal: 2,
        cursor: 'cursor_2',
        emittedAt: '2026-06-04T00:00:02.000Z',
        kind: 'runtime_status.upserted',
        causality: { threadId: 'thread_1', runId: 'run_active' },
        entity: {
          type: 'runtime_status',
          value: {
            id: 'status_1',
            threadId: 'thread_1',
            runId: 'run_active',
            content: 'Runtime active',
            status: {
              kind: 'status_light',
              state: 'active',
              label: 'Active',
              detail: 'Running tools',
            },
            createdAt: '2026-06-04T00:00:02.000Z',
          },
        },
      })
    },
  } as unknown as LocalAgentClient

  const dataSource = createMovScriptAgentChatDataSource(client)
  dataSource.subscribeThread?.({
    threadId: 'thread_1',
    onNotification: (notification) => notifications.push(notification),
  })
  await flushPromises()

  assert.equal(notifications[0]?.method, 'thread/metadata/updated')
  assert.deepEqual(notifications[0]?.params, {
    threadId: 'thread_1',
    threadName: 'Updated title',
    preview: 'Updated title',
    status: 'completed',
    updatedAt: 1780531205,
  })
  assert.equal(notifications[1]?.method, 'runtime/status/updated')
  assert.equal(notifications[1]?.event?.type, 'systemNotice')
  assert.equal(notifications[1]?.event?.type === 'systemNotice' ? notifications[1].event.title : '', 'Active')
})

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function flushRuntimeStream(): Promise<void> {
  await flushPromises()
  await flushPromises()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

async function resolveMovScriptInputRequestWithResponse(response: AgentChatServerRequestResponse): Promise<{ runId: string; input: Record<string, unknown> } | undefined> {
  let inputAnswer: { runId: string; input: Record<string, unknown> } | undefined
  const client = {
    getThread: async () => movscriptThread(),
    streamThread: async (_threadId: string, options: { onRuntimeEvent?: (event: unknown) => void }) => {
      options.onRuntimeEvent?.({
        schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
        protocolVersion: AGENT_PROTOCOL_VERSION,
        id: 'event_input_interaction',
        scope: { type: 'thread', id: 'thread_1' },
        ordinal: 1,
        cursor: 'cursor_1',
        emittedAt: '2026-06-04T00:00:01.000Z',
        kind: 'interaction.upserted',
        causality: { threadId: 'thread_1', runId: 'run_active', interactionId: 'interaction_input_1' },
        entity: {
          type: 'interaction',
          value: {
            id: 'interaction_input_1',
            threadId: 'thread_1',
            runId: 'run_active',
            kind: 'input',
            status: 'pending',
            payload: {
              requestId: 'input_1',
              title: 'Need input',
              question: 'Continue?',
              inputType: 'text',
            },
            createdAt: '2026-06-04T00:00:01.000Z',
            updatedAt: '2026-06-04T00:00:01.000Z',
          },
        },
      })
    },
    answerRunInput: async (runId: string, input: Record<string, unknown>) => {
      inputAnswer = { runId, input }
      return movscriptRun({ id: runId })
    },
  } as unknown as LocalAgentClient

  const dataSource = createMovScriptAgentChatDataSource(client)
  dataSource.subscribeThread?.({
    threadId: 'thread_1',
    onServerRequest: () => response,
  })
  await flushRuntimeStream()
  return inputAnswer
}

function movscriptRuntimeSessionSummary() {
  return {
    session: {
      id: 'session_1',
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
  }
}

function movscriptPendingApprovalInteractionEvent() {
  return {
    schema: AGENT_RUNTIME_EVENT_V2_SCHEMA,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    id: 'event_interaction',
    scope: { type: 'thread', id: 'thread_1' },
    ordinal: 1,
    cursor: 'cursor_1',
    emittedAt: '2026-06-04T00:00:01.000Z',
    kind: 'interaction.upserted',
    causality: { threadId: 'thread_1', runId: 'run_active', interactionId: 'interaction_approval_1' },
    entity: {
      type: 'interaction',
      value: {
        id: 'interaction_approval_1',
        threadId: 'thread_1',
        runId: 'run_active',
        kind: 'approval',
        status: 'pending',
        payload: {
          approvalId: 'approval_1',
          toolName: 'movscript_focus_get',
          reason: 'Tool approval required',
        },
        createdAt: '2026-06-04T00:00:01.000Z',
        updatedAt: '2026-06-04T00:00:01.000Z',
      },
    },
  }
}

function movscriptResolvedApprovalInteractionEvent() {
  return {
    ...movscriptPendingApprovalInteractionEvent(),
    id: 'event_interaction_resolved',
    ordinal: 2,
    cursor: 'cursor_2',
    emittedAt: '2026-06-04T00:00:02.000Z',
    entity: {
      type: 'interaction',
      value: {
        id: 'interaction_approval_1',
        threadId: 'thread_1',
        runId: 'run_active',
        kind: 'approval',
        status: 'approved',
        payload: {
          approvalId: 'approval_1',
          toolName: 'movscript_focus_get',
          reason: 'Tool approval required',
        },
        result: { approved: true },
        createdAt: '2026-06-04T00:00:01.000Z',
        updatedAt: '2026-06-04T00:00:02.000Z',
        resolvedAt: '2026-06-04T00:00:02.000Z',
      },
    },
  }
}
