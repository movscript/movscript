import assert from 'node:assert/strict'
import test from 'node:test'

import { createAppServerChatDataSource } from '@/shared/infrastructure/app-server/appServerChatDataSource'
import { appServerThreadTurnItemServerRequestResponseFromAgentChat } from '@/shared/infrastructure/app-server/appServerThreadTurnItemProtocolAdapter'
import type { AppServerRpcClient } from '@/shared/infrastructure/app-server/appServerRpcClient'
import { agentRunProfilePresetById } from '@/features/agent/domain/agentRunProfilePreset'

test('app-server thread-turn-item data source maps provider-neutral thread lifecycle operations to app-server requests', async () => {
  const requests: Array<{ method: string; params: unknown }> = []
  const client = {
    requestProtocol: async (method: string, params: unknown) => {
      requests.push({ method, params })
      return { thread: appServerThread({ name: method }) }
    },
  } as unknown as AppServerRpcClient

  const dataSource = createAppServerChatDataSource(client)
  const renamed = await dataSource.renameThread?.({ threadId: 'thread_1', name: 'Renamed' })
  await dataSource.archiveThread?.({ threadId: 'thread_1' })
  await dataSource.unarchiveThread?.({ threadId: 'thread_1' })

  assert.equal(dataSource.provider, 'mova')
  assert.equal(dataSource.label, 'Mova app-server')
  assert.equal(renamed && typeof renamed === 'object' && 'provider' in renamed ? renamed.provider : null, 'mova')
  assert.deepEqual(requests, [
    { method: 'thread/name/set', params: { threadId: 'thread_1', name: 'Renamed' } },
    { method: 'thread/archive', params: { threadId: 'thread_1' } },
    { method: 'thread/unarchive', params: { threadId: 'thread_1' } },
  ])
})

test('app-server protocol data source preserves injected provider identity', async () => {
  const client = {
    listThreads: async () => ({ data: [appServerThread()], nextCursor: null }),
    readThread: async () => ({ thread: appServerThread({ id: 'thread_read' }) }),
    startThread: async () => ({ thread: appServerThread({ id: 'thread_started' }) }),
  } as unknown as AppServerRpcClient

  const dataSource = createAppServerChatDataSource(client, {
    provider: 'mova',
    providerId: 'mova-studio',
    providerInstanceId: 'mova-studio-home',
    label: 'Mova',
  })
  const listed = await dataSource.listThreads()
  const read = await dataSource.readThread('thread_read')
  const started = await dataSource.startThread()

  assert.equal(dataSource.provider, 'mova')
  assert.equal(dataSource.providerId, 'mova-studio')
  assert.equal(dataSource.providerInstanceId, 'mova-studio-home')
  assert.equal(dataSource.label, 'Mova')
  assert.equal(listed.threads[0]?.provider, 'mova')
  assert.equal(read.provider, 'mova')
  assert.equal(started.provider, 'mova')
})

test('app-server protocol data source reads thread turns through paged turns list when available', async () => {
  const calls: Array<{ method: string; params: unknown }> = []
  const client = {
    readThread: async (threadId: string, input: unknown) => {
      calls.push({ method: 'thread/read', params: { threadId, input } })
      return { thread: appServerThread({ id: threadId, turns: [appServerTurn('metadata_turn')] }) }
    },
    listThreadTurns: async (params: unknown) => {
      calls.push({ method: 'thread/turns/list', params })
      return {
        data: [appServerTurn('turn_2'), appServerTurn('turn_1')],
        nextCursor: null,
        backwardsCursor: null,
      }
    },
  } as unknown as AppServerRpcClient

  const dataSource = createAppServerChatDataSource(client)
  const thread = await dataSource.readThread('thread_1', {
    includeTurns: true,
    beforeTurnId: 'turn_3',
    beforeItemId: 'item_3',
    limit: 20,
    direction: 'older',
  })

  assert.deepEqual(calls, [
    {
      method: 'thread/turns/list',
      params: {
        threadId: 'thread_1',
        cursor: '{"turnId":"turn_3","includeAnchor":false}',
        limit: 20,
        sortDirection: 'desc',
        itemsView: 'full',
      },
    },
  ])
  assert.deepEqual(thread.turns.map((turn) => turn.id), ['turn_1', 'turn_2'])
})

test('app-server protocol data source reads metadata only for newer turn pages', async () => {
  const calls: Array<{ method: string; params: unknown }> = []
  const client = {
    readThread: async (threadId: string, input: unknown) => {
      calls.push({ method: 'thread/read', params: { threadId, input } })
      return { thread: appServerThread({ id: threadId, name: 'Updated thread metadata', turns: [appServerTurn('metadata_turn')] }) }
    },
    listThreadTurns: async (params: unknown) => {
      calls.push({ method: 'thread/turns/list', params })
      return {
        data: [appServerTurn('turn_4')],
        nextCursor: null,
        backwardsCursor: null,
      }
    },
  } as unknown as AppServerRpcClient

  const dataSource = createAppServerChatDataSource(client)
  const thread = await dataSource.readThread('thread_1', {
    includeTurns: true,
    afterTurnId: 'turn_3',
    afterItemId: 'item_3',
    limit: 1,
    direction: 'newer',
  })

  assert.deepEqual(calls, [
    {
      method: 'thread/turns/list',
      params: {
        threadId: 'thread_1',
        cursor: '{"turnId":"turn_3","includeAnchor":false}',
        limit: 1,
        sortDirection: 'asc',
        itemsView: 'full',
      },
    },
    { method: 'thread/read', params: { threadId: 'thread_1', input: { includeTurns: false } } },
  ])
  assert.equal(thread.name, 'Updated thread metadata')
  assert.deepEqual(thread.turns.map((turn) => turn.id), ['turn_4'])
})

test('app-server protocol data source falls back to thread/read when turns list is unavailable', async () => {
  const calls: Array<{ method: string; params: unknown }> = []
  const client = {
    readThread: async (threadId: string, input: unknown) => {
      calls.push({ method: 'thread/read', params: { threadId, input } })
      const includeTurns = input && typeof input === 'object' && 'includeTurns' in input
        ? (input as { includeTurns?: unknown }).includeTurns
        : undefined
      return { thread: appServerThread({ id: threadId, turns: includeTurns === false ? [] : [appServerTurn('full_turn')] }) }
    },
    listThreadTurns: async (params: unknown) => {
      calls.push({ method: 'thread/turns/list', params })
      throw new Error('thread/turns/list method not found')
    },
  } as unknown as AppServerRpcClient

  const dataSource = createAppServerChatDataSource(client)
  const thread = await dataSource.readThread('thread_1', {
    includeTurns: true,
    afterTurnId: 'turn_1',
    afterItemId: 'item_1',
    limit: 20,
    direction: 'newer',
  })

  assert.deepEqual(calls, [
    {
      method: 'thread/turns/list',
      params: {
        threadId: 'thread_1',
        cursor: '{"turnId":"turn_1","includeAnchor":false}',
        limit: 20,
        sortDirection: 'asc',
        itemsView: 'full',
      },
    },
    {
      method: 'thread/read',
      params: {
        threadId: 'thread_1',
        input: {
          includeTurns: true,
          afterTurnId: 'turn_1',
          afterItemId: 'item_1',
          limit: 20,
          direction: 'newer',
        },
      },
    },
  ])
  assert.deepEqual(thread.turns.map((turn) => turn.id), ['full_turn'])
})

test('app-server protocol data source treats pre-message materialization errors as an empty thread', async () => {
  const calls: Array<{ method: string; params: unknown }> = []
  const client = {
    readThread: async (threadId: string, input: unknown) => {
      calls.push({ method: 'thread/read', params: { threadId, input } })
      return { thread: appServerThread({ id: threadId, turns: [appServerTurn('full_turn')] }) }
    },
    listThreadTurns: async (params: unknown) => {
      calls.push({ method: 'thread/turns/list', params })
      throw new Error('thread 019eb75c-31ee-75f2-85ad-2b52ed95be04 is not materialized yet; thread/turns/list is unavailable before first user message')
    },
  } as unknown as AppServerRpcClient

  const dataSource = createAppServerChatDataSource(client)
  const thread = await dataSource.readThread('019eb75c-31ee-75f2-85ad-2b52ed95be04', {
    includeTurns: true,
    limit: 1,
    direction: 'newer',
  })

  assert.deepEqual(calls, [
    {
      method: 'thread/turns/list',
      params: {
        threadId: '019eb75c-31ee-75f2-85ad-2b52ed95be04',
        limit: 1,
        sortDirection: 'desc',
        itemsView: 'full',
      },
    },
  ])
  assert.equal(thread.id, '019eb75c-31ee-75f2-85ad-2b52ed95be04')
  assert.equal(thread.status, 'idle')
  assert.deepEqual(thread.turns, [])
})

test('app-server protocol data source exposes provider thread and session tree ids explicitly', async () => {
  const client = {
    readThread: async () => ({ thread: appServerThread({ id: 'thread_read', sessionId: 'session_tree_1' }) }),
  } as unknown as AppServerRpcClient

  const dataSource = createAppServerChatDataSource(client)
  const thread = await dataSource.readThread('thread_read')

  assert.equal(thread.id, 'thread_read')
  assert.equal(thread.providerThreadId, 'thread_read')
  assert.equal(thread.providerSessionTreeId, 'session_tree_1')
  assert.equal(thread.sessionId, 'session_tree_1')
})

test('app-server protocol data source preserves thread cwd for project grouping', async () => {
  const client = {
    readThread: async () => ({ thread: appServerThread({ id: 'thread_project', cwd: '/workspace/.movscript/user/7/projects/project_42' }) }),
  } as unknown as AppServerRpcClient

  const dataSource = createAppServerChatDataSource(client)
  const thread = await dataSource.readThread('thread_project')

  assert.equal(thread.cwd, '/workspace/.movscript/user/7/projects/project_42')
})

test('app-server protocol data source does not fabricate session tree ids from thread ids', async () => {
  const client = {
    readThread: async () => ({ thread: appServerThread({ id: 'thread_without_tree', sessionId: '' }) }),
  } as unknown as AppServerRpcClient

  const dataSource = createAppServerChatDataSource(client)
  const thread = await dataSource.readThread('thread_without_tree')

  assert.equal(thread.providerThreadId, 'thread_without_tree')
  assert.equal(thread.providerSessionTreeId, undefined)
  assert.equal(thread.sessionId, undefined)
})

test('app-server protocol data source resumes threads through app-server resume rpc', async () => {
  const calls: Array<Record<string, unknown>> = []
  const client = {
    resumeThread: async (params: Record<string, unknown>) => {
      calls.push(params)
      return { thread: appServerThread({ id: params.threadId }) }
    },
  } as unknown as AppServerRpcClient

  const dataSource = createAppServerChatDataSource(client, {
    defaultThreadCwd: '/workspace/project',
    workspaceContext: { scope: 'project', projectId: 42 },
  })
  const thread = await dataSource.resumeThread?.({ threadId: 'thread_1', model: 'gpt-5.4' })

  assert.equal(thread?.id, 'thread_1')
  assert.equal(calls[0]?.threadId, 'thread_1')
  assert.equal(calls[0]?.model, 'gpt-5.4')
  assert.equal(calls[0]?.cwd, '/workspace/project')
  assert.match(String(calls[0]?.developerInstructions ?? ''), /projectId\/project_id 42/)
})

test('app-server protocol data source builds default labels from provider keys', () => {
  const client = {} as unknown as AppServerRpcClient
  const dataSource = createAppServerChatDataSource(client, { provider: 'studio-agent' })

  assert.equal(dataSource.provider, 'studio-agent')
  assert.equal(dataSource.label, 'Studio Agent app-server')
})

test('app-server protocol data source preserves provider identity in thread notifications', () => {
  const notificationHandlers: Array<(notification: { method: string; params?: unknown }) => void> = []
  const client = {
    onNotification: (handler: (notification: { method: string; params?: unknown }) => void) => {
      notificationHandlers.push(handler)
      return () => undefined
    },
    onServerRequest: () => () => undefined,
  } as unknown as AppServerRpcClient
  const dataSource = createAppServerChatDataSource(client, {
    provider: 'mova',
    label: 'Mova',
  })
  const notifications: unknown[] = []

  dataSource.subscribeThread?.({
    threadId: 'thread_1',
    onNotification: (notification) => notifications.push(notification),
  })
  notificationHandlers[0]?.({
    method: 'thread/started',
    params: { thread: appServerThread({ id: 'thread_1' }) },
  })

  const thread = ((notifications[0] as { params?: { thread?: { provider?: string } } })?.params?.thread)
  assert.equal(thread?.provider, 'mova')
})

test('app-server thread-turn-item data source forwards model selection to thread and turn requests', async () => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = []
  const client = {
    startThread: async (params: Record<string, unknown>) => {
      calls.push({ method: 'thread/start', params })
      return { thread: appServerThread() }
    },
    startTurn: async (params: Record<string, unknown>) => {
      calls.push({ method: 'turn/start', params })
      return {
        turn: {
          id: 'turn_1',
          status: 'inProgress',
          error: null,
          startedAt: 3,
          completedAt: null,
          items: [],
        },
      }
    },
  } as unknown as AppServerRpcClient

  const dataSource = createAppServerChatDataSource(client)
  await dataSource.startThread({ model: 'gpt-5.4', modelProvider: 'movscript' })
  await dataSource.startTurn?.({
    threadId: 'thread_1',
    inputs: [{ type: 'text', text: 'hello', textElements: [] }],
    model: 'gpt-5.4-mini',
  })

  assert.deepEqual(calls, [
    { method: 'thread/start', params: { model: 'gpt-5.4', modelProvider: 'movscript', threadSource: 'user' } },
    {
      method: 'turn/start',
      params: {
        threadId: 'thread_1',
        clientUserMessageId: undefined,
        input: [{ type: 'text', text: 'hello', text_elements: [] }],
        model: 'gpt-5.4-mini',
      },
    },
  ])
})

test('app-server thread-turn-item data source only forwards API-ready image URLs', async () => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = []
  const client = {
    startTurn: async (params: Record<string, unknown>) => {
      calls.push({ method: 'turn/start', params })
      return {
        turn: {
          id: 'turn_1',
          status: 'inProgress',
          error: null,
          startedAt: 3,
          completedAt: null,
          items: [],
        },
      }
    },
  } as unknown as AppServerRpcClient

  const dataSource = createAppServerChatDataSource(client)
  await dataSource.startTurn?.({
    threadId: 'thread_1',
    inputs: [
      { type: 'image', url: 'data:image/png;base64,AAAA', detail: 'auto', name: 'Inline' },
      {
        type: 'image',
        url: 'http://localhost:8765/api/v1/resources/42/file',
        detail: 'auto',
        name: 'Local resource',
        resourceId: 42,
      },
      { type: 'localImage', path: '/tmp/frame.png', detail: 'auto' },
    ],
  })

  assert.deepEqual(calls, [
    {
      method: 'turn/start',
      params: {
        threadId: 'thread_1',
        clientUserMessageId: undefined,
        input: [
          { type: 'image', url: 'data:image/png;base64,AAAA', detail: 'auto' },
          { type: 'mention', name: 'Local resource', path: 'resource:42' },
          { type: 'localImage', path: '/tmp/frame.png', detail: 'auto' },
        ],
      },
    },
  ])
})

test('app-server protocol adapter keeps local dynamic tool images out of inputImage responses', () => {
  const response = appServerThreadTurnItemServerRequestResponseFromAgentChat(
    { id: 'req_1', method: 'item/tool/call', params: {}, raw: {} } as never,
    {
      action: 'toolResult',
      success: true,
      contentItems: [
        { type: 'inputImage', imageUrl: 'http://localhost:8765/api/v1/resources/9/file' },
        { type: 'inputImage', imageUrl: 'https://cdn.example.com/render.png' },
        { type: 'image', data: 'AAAA', mimeType: 'image/png' },
      ],
    },
  )

  assert.deepEqual(response, {
    contentItems: [
      { type: 'inputText', text: 'Image result: http://localhost:8765/api/v1/resources/9/file' },
      { type: 'inputImage', imageUrl: 'https://cdn.example.com/render.png' },
      { type: 'inputImage', imageUrl: 'data:image/png;base64,AAAA' },
    ],
    success: true,
  })
})

test('app-server thread-turn-item data source forwards run profiles to thread and turn requests', async () => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = []
  const client = {
    startThread: async (params: Record<string, unknown>) => {
      calls.push({ method: 'thread/start', params })
      return { thread: appServerThread() }
    },
    startTurn: async (params: Record<string, unknown>) => {
      calls.push({ method: 'turn/start', params })
      return {
        turn: {
          id: 'turn_1',
          status: 'inProgress',
          error: null,
          startedAt: 3,
          completedAt: null,
          items: [],
        },
      }
    },
  } as unknown as AppServerRpcClient

  const dataSource = createAppServerChatDataSource(client)
  await dataSource.startThread({ runProfile: agentRunProfilePresetById('full-access') })
  await dataSource.startTurn?.({
    threadId: 'thread_1',
    inputs: [{ type: 'text', text: 'hello', textElements: [] }],
    runProfile: agentRunProfilePresetById('read-only'),
  })

  assert.deepEqual(calls, [
    {
      method: 'thread/start',
      params: {
        approvalPolicy: 'never',
        approvalsReviewer: 'user',
        permissions: ':danger-full-access',
        threadSource: 'user',
      },
    },
    {
      method: 'turn/start',
      params: {
        threadId: 'thread_1',
        clientUserMessageId: undefined,
        input: [{ type: 'text', text: 'hello', text_elements: [] }],
        approvalPolicy: 'on-request',
        approvalsReviewer: 'user',
        permissions: ':read-only',
      },
    },
  ])
})

test('app-server thread-turn-item data source forwards thread controls and goals', async () => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = []
  const client = {
    startThread: async (params: Record<string, unknown>) => {
      calls.push({ method: 'thread/start', params })
      return { thread: appServerThread() }
    },
    startTurn: async (params: Record<string, unknown>) => {
      calls.push({ method: 'turn/start', params })
      return {
        turn: {
          id: 'turn_1',
          status: 'inProgress',
          error: null,
          startedAt: 3,
          completedAt: null,
          items: [],
        },
      }
    },
    requestProtocol: async (method: string, params: Record<string, unknown>) => {
      calls.push({ method, params })
      return { goal: { objective: params.objective, status: params.status } }
    },
  } as unknown as AppServerRpcClient

  const dataSource = createAppServerChatDataSource(client, {
    resolveModelForRequest: () => ({ model: 'gpt-5.5' }),
  })
  await dataSource.startThread({ collaborationMode: 'plan' })
  await dataSource.setThreadGoal?.({ threadId: 'thread_1', objective: 'Ship the UI', status: 'active' })
  await dataSource.startTurn?.({
    threadId: 'thread_1',
    inputs: [{ type: 'text', text: 'hello', textElements: [] }],
    collaborationMode: 'plan',
  })

  assert.deepEqual(calls, [
    {
      method: 'thread/start',
      params: {
        model: 'gpt-5.5',
        threadSource: 'user',
      },
    },
    {
      method: 'thread/goal/set',
      params: {
        threadId: 'thread_1',
        objective: 'Ship the UI',
        status: 'active',
      },
    },
    {
      method: 'turn/start',
      params: {
        threadId: 'thread_1',
        clientUserMessageId: undefined,
        input: [{ type: 'text', text: 'hello', text_elements: [] }],
        model: 'gpt-5.5',
        collaborationMode: {
          mode: 'plan',
          settings: {
            model: 'gpt-5.5',
            reasoning_effort: null,
            developer_instructions: null,
          },
        },
      },
    },
  ])
})

test('app-server thread-turn-item data source omits collaboration mode when plan mode has no model', async () => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = []
  const client = {
    startTurn: async (params: Record<string, unknown>) => {
      calls.push({ method: 'turn/start', params })
      return {
        turn: {
          id: 'turn_1',
          status: 'inProgress',
          error: null,
          startedAt: 3,
          completedAt: null,
          items: [],
        },
      }
    },
  } as unknown as AppServerRpcClient

  const dataSource = createAppServerChatDataSource(client)
  await dataSource.startTurn?.({
    threadId: 'thread_1',
    inputs: [{ type: 'text', text: 'hello', textElements: [] }],
    collaborationMode: 'plan',
  })

  assert.deepEqual(calls, [
    {
      method: 'turn/start',
      params: {
        threadId: 'thread_1',
        clientUserMessageId: undefined,
        input: [{ type: 'text', text: 'hello', text_elements: [] }],
      },
    },
  ])
})

test('app-server protocol data source forwards the scoped thread cwd', async () => {
  const calls: Array<Record<string, unknown>> = []
  const client = {
    startThread: async (params: Record<string, unknown>) => {
      calls.push(params)
      return { thread: appServerThread() }
    },
  } as unknown as AppServerRpcClient

  const dataSource = createAppServerChatDataSource(client, {
    defaultThreadCwd: '/workspace/.movscript/workdirs/users/7/projects/42',
  })
  await dataSource.startThread()
  await dataSource.startThread({ cwd: '/custom/cwd' })

  assert.deepEqual(calls, [
    { cwd: '/workspace/.movscript/workdirs/users/7/projects/42', threadSource: 'user' },
    { cwd: '/custom/cwd', threadSource: 'user' },
  ])
})

test('app-server protocol data source injects workspace boundary instructions for scoped threads', async () => {
  const calls: Array<Record<string, unknown>> = []
  const client = {
    startThread: async (params: Record<string, unknown>) => {
      calls.push(params)
      return { thread: appServerThread() }
    },
  } as unknown as AppServerRpcClient

  const dataSource = createAppServerChatDataSource(client, {
    defaultThreadCwd: '/workspace/.movscript/local/projects/project_42',
    workspaceContext: { scope: 'project', projectId: 42 },
  })
  await dataSource.startThread()

  const developerInstructions = String(calls[0]?.developerInstructions ?? '')
  assert.equal(calls[0]?.cwd, '/workspace/.movscript/local/projects/project_42')
  assert.match(developerInstructions, /MovScript workspace boundary/)
  assert.match(developerInstructions, /Only edit files and call project-scoped MovScript MCP tools for projectId\/project_id 42/)
  assert.match(developerInstructions, /Do not pass userId\/user_id\/orgId\/org_id/)
  assert.match(developerInstructions, /include projectId\/project_id on every project-scoped call/)
})

test('app-server protocol data source injects global workspace MCP project-id guidance', async () => {
  const calls: Array<Record<string, unknown>> = []
  const client = {
    startThread: async (params: Record<string, unknown>) => {
      calls.push(params)
      return { thread: appServerThread() }
    },
  } as unknown as AppServerRpcClient

  const dataSource = createAppServerChatDataSource(client, {
    defaultThreadCwd: '/workspace/.movscript/local',
    workspaceContext: { scope: 'global' },
  })
  await dataSource.startThread()

  const developerInstructions = String(calls[0]?.developerInstructions ?? '')
  assert.match(developerInstructions, /global MovScript workspace session/)
  assert.match(developerInstructions, /every project-scoped MovScript MCP domain\/generation\/workspace tool call must include the intended projectId\/project_id explicitly/)
})

test('app-server thread-turn-item data source exposes global server request subscriptions', async () => {
  const handlers: Array<(request: { id: string; method: string; params?: unknown }) => unknown> = []
  const notificationHandlers: Array<(notification: { method: string; params?: unknown }) => void> = []
  const client = {
    onNotification: (handler: (notification: { method: string; params?: unknown }) => void) => {
      notificationHandlers.push(handler)
      return () => {
        const index = notificationHandlers.indexOf(handler)
        if (index >= 0) notificationHandlers.splice(index, 1)
      }
    },
    onServerRequest: (handler: (request: { id: string; method: string; params?: unknown }) => unknown) => {
      handlers.push(handler)
      return () => {
        const index = handlers.indexOf(handler)
        if (index >= 0) handlers.splice(index, 1)
      }
    },
  } as unknown as AppServerRpcClient

  const dataSource = createAppServerChatDataSource(client)
  const seenRequests: unknown[] = []
  const seenNotifications: unknown[] = []
  const dispose = dataSource.subscribeServerRequests?.({
    onNotification: (notification) => seenNotifications.push(notification),
    onServerRequest: (request) => {
      seenRequests.push(request)
      return {
        action: 'approve',
        permissions: { network: null, fileSystem: null },
        scope: 'turn',
        strictAutoReview: false,
      }
    },
  })

  assert.equal(handlers.length, 1)
  assert.equal(notificationHandlers.length, 1)
  const response = await handlers[0]({
    id: 'request_1',
    method: 'item/permissions/requestApproval',
    params: {
      threadId: 'thread_1',
      turnId: 'turn_1',
      itemId: 'call_1',
      cwd: '/repo',
      permissions: { network: null, fileSystem: null },
    },
  })

  assert.deepEqual(seenRequests, [{
    id: 'request_1',
    method: 'item/permissions/requestApproval',
    threadId: 'thread_1',
    turnId: 'turn_1',
    itemId: 'call_1',
    params: {
      threadId: 'thread_1',
      turnId: 'turn_1',
      itemId: 'call_1',
      cwd: '/repo',
      permissions: { network: null, fileSystem: null },
    },
    raw: {
      id: 'request_1',
      method: 'item/permissions/requestApproval',
      params: {
        threadId: 'thread_1',
        turnId: 'turn_1',
        itemId: 'call_1',
        cwd: '/repo',
        permissions: { network: null, fileSystem: null },
      },
    },
  }])
  assert.deepEqual(response, {
    permissions: { network: null, fileSystem: null },
    scope: 'turn',
    strictAutoReview: false,
  })
  notificationHandlers[0]?.({
    method: 'serverRequest/resolved',
    params: { threadId: 'thread_1', requestId: 'request_1' },
  })
  notificationHandlers[0]?.({
    method: 'thread/name/updated',
    params: { threadId: 'thread_1', name: 'Ignored globally' },
  })
  assert.deepEqual(seenNotifications, [{
    method: 'serverRequest/resolved',
    params: { threadId: 'thread_1', requestId: 'request_1' },
    event: {
      type: 'serverRequestResolved',
      threadId: 'thread_1',
      requestId: 'request_1',
      raw: {
        method: 'serverRequest/resolved',
        params: { threadId: 'thread_1', requestId: 'request_1' },
      },
    },
    raw: {
      method: 'serverRequest/resolved',
      params: { threadId: 'thread_1', requestId: 'request_1' },
    },
  }])

  if (typeof dispose === 'function') dispose()
  assert.equal(handlers.length, 0)
  assert.equal(notificationHandlers.length, 0)
})

function appServerThread(patch: Record<string, unknown> = {}) {
  return {
    id: 'thread_1',
    sessionId: 'session_1',
    preview: 'hello',
    name: null,
    createdAt: 1,
    updatedAt: 2,
    status: { type: 'idle' },
    turns: [],
    ...patch,
  }
}

function appServerTurn(id: string) {
  return {
    id,
    status: 'completed',
    itemsView: 'full',
    error: null,
    startedAt: 1,
    completedAt: 2,
    durationMs: 1000,
    items: [],
  }
}
