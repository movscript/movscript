import assert from 'node:assert/strict'
import test from 'node:test'

import { AppServerRpcClient, appServerScopedEnvURLKeys, appServerURL, ensureAppServerRpcClient, ensureAppServerURL } from '@/shared/infrastructure/app-server/appServerRpcClient'
import type { ProviderConfig } from '@/shared/infrastructure/providerConfigStore'

test('app-server rpc client sends thread and turn requests over the app-server wire protocol', async () => {
  const originalWebSocket = globalThis.WebSocket
  const sockets: FakeWebSocket[] = []
  ;(globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = class extends FakeWebSocket {
    constructor(url: string) {
      super(url)
      sockets.push(this)
    }
  } as unknown as typeof WebSocket

  try {
    const client = new AppServerRpcClient('ws://127.0.0.1:48765')
    const threadPromise = client.startThread({ cwd: '/tmp/project', threadSource: 'user' })

    const socket = await waitFor(() => sockets[0])
    const initialize = await waitForSent(socket, 'initialize')
    assert.deepEqual(initialize.params?.capabilities, { experimentalApi: true, requestAttestation: false })
    socket.respond(initialize.id, { userAgent: 'app-server-test' })
    const initialized = await waitForSent(socket, 'initialized')
    assert.equal(initialized.id, undefined)

    const threadStart = await waitForSent(socket, 'thread/start')
    assert.deepEqual(threadStart.params, { cwd: '/tmp/project', threadSource: 'user' })
    socket.respond(threadStart.id, {
      thread: {
        id: 'thread_1',
        sessionId: 'session_1',
        preview: '',
        createdAt: 1,
        updatedAt: 1,
        status: { type: 'idle' },
        name: null,
        turns: [],
      },
    })

    const thread = await threadPromise
    assert.equal(thread.thread.id, 'thread_1')

    const listPromise = client.listThreads({ limit: 7, cursor: 'cursor_1' })
    const threadList = await waitForSent(socket, 'thread/list')
    assert.deepEqual(threadList.params, {
      limit: 7,
      cursor: 'cursor_1',
      sortKey: 'updated_at',
      sortDirection: 'desc',
      archived: false,
      modelProviders: [],
      sourceKinds: ['cli', 'vscode', 'exec', 'appServer', 'subAgent', 'unknown'],
    })
    socket.respond(threadList.id, {
      data: [],
      nextCursor: null,
      backwardsCursor: null,
    })
    assert.deepEqual(await listPromise, {
      data: [],
      nextCursor: null,
      backwardsCursor: null,
    })

    const turnsPromise = client.listThreadTurns({
      threadId: 'thread_1',
      cursor: '{"turnId":"turn_1","includeAnchor":false}',
      limit: 20,
      sortDirection: 'desc',
      itemsView: 'full',
    })
    const turnsList = await waitForSent(socket, 'thread/turns/list')
    assert.deepEqual(turnsList.params, {
      threadId: 'thread_1',
      cursor: '{"turnId":"turn_1","includeAnchor":false}',
      limit: 20,
      sortDirection: 'desc',
      itemsView: 'full',
    })
    socket.respond(turnsList.id, {
      data: [],
      nextCursor: null,
      backwardsCursor: null,
    })
    assert.deepEqual(await turnsPromise, {
      data: [],
      nextCursor: null,
      backwardsCursor: null,
    })

    const resumePromise = client.resumeThread({ threadId: 'thread_1', cwd: '/tmp/project', model: 'gpt-5.4' })
    const threadResume = await waitForSent(socket, 'thread/resume')
    assert.deepEqual(threadResume.params, { threadId: 'thread_1', cwd: '/tmp/project', model: 'gpt-5.4' })
    socket.respond(threadResume.id, {
      thread: {
        id: 'thread_1',
        sessionId: 'session_1',
        preview: '',
        createdAt: 1,
        updatedAt: 1,
        status: { type: 'idle' },
        name: null,
        turns: [],
      },
      model: 'gpt-5.4',
      modelProvider: 'openai',
      serviceTier: null,
      cwd: '/tmp/project',
      instructionSources: [],
      approvalPolicy: 'on-request',
      approvalsReviewer: 'user',
      sandbox: { type: 'readOnly', networkAccess: false },
      reasoningEffort: null,
    })
    assert.equal((await resumePromise).thread.id, 'thread_1')

    const turnPromise = client.startTextTurn({
      threadId: 'thread_1',
      clientUserMessageId: 'client_msg_1',
      text: 'hello provider',
    })
    const turnStart = await waitForSent(socket, 'turn/start')
    assert.deepEqual(turnStart.params, {
      threadId: 'thread_1',
      clientUserMessageId: 'client_msg_1',
      input: [{ type: 'text', text: 'hello provider', text_elements: [] }],
    })
    socket.respond(turnStart.id, {
      turn: {
        id: 'turn_1',
        status: 'inProgress',
        error: null,
        startedAt: 2,
        completedAt: null,
        items: [],
      },
    })

    const turn = await turnPromise
    assert.equal(turn.turn.id, 'turn_1')

    const steerPromise = client.steerTurn({
      threadId: 'thread_1',
      expectedTurnId: 'turn_1',
      clientUserMessageId: 'client_msg_2',
      input: [{ type: 'text', text: 'adjust course', text_elements: [] }],
    })
    const turnSteer = await waitForSent(socket, 'turn/steer')
    assert.deepEqual(turnSteer.params, {
      threadId: 'thread_1',
      expectedTurnId: 'turn_1',
      clientUserMessageId: 'client_msg_2',
      input: [{ type: 'text', text: 'adjust course', text_elements: [] }],
    })
    socket.respond(turnSteer.id, { turnId: 'turn_1' })
    assert.deepEqual(await steerPromise, { turnId: 'turn_1' })

    const interruptPromise = client.interruptTurn({
      threadId: 'thread_1',
      turnId: 'turn_1',
    })
    const turnInterrupt = await waitForSent(socket, 'turn/interrupt')
    assert.deepEqual(turnInterrupt.params, {
      threadId: 'thread_1',
      turnId: 'turn_1',
    })
    socket.respond(turnInterrupt.id, {})
    assert.deepEqual(await interruptPromise, {})

    const filePromise = client.requestProtocol('fs/readFile', { path: '/tmp/project/README.md', omitMe: undefined })
    const fsReadFile = await waitForSent(socket, 'fs/readFile')
    assert.deepEqual(fsReadFile.params, { path: '/tmp/project/README.md' })
    socket.respond(fsReadFile.id, { dataBase64: 'aGVsbG8=' })
    assert.deepEqual(await filePromise, { dataBase64: 'aGVsbG8=' })

    const realtimeStartPromise = client.requestProtocol('thread/realtime/start', {
      threadId: 'thread_1',
      outputModality: 'audio',
      voice: 'alloy',
      transport: { type: 'websocket' },
    })
    const realtimeStart = await waitForSent(socket, 'thread/realtime/start')
    assert.deepEqual(realtimeStart.params, {
      threadId: 'thread_1',
      outputModality: 'audio',
      voice: 'alloy',
      transport: { type: 'websocket' },
    })
    socket.respond(realtimeStart.id, {})
    assert.deepEqual(await realtimeStartPromise, {})

    const realtimeTextPromise = client.requestProtocol('thread/realtime/appendText', { threadId: 'thread_1', text: 'continue' })
    const realtimeText = await waitForSent(socket, 'thread/realtime/appendText')
    assert.deepEqual(realtimeText.params, { threadId: 'thread_1', text: 'continue' })
    socket.respond(realtimeText.id, {})
    assert.deepEqual(await realtimeTextPromise, {})

    const realtimeAudioPromise = client.requestProtocol('thread/realtime/appendAudio', {
      threadId: 'thread_1',
      audio: {
        data: 'AAAA',
        sampleRate: 24000,
        numChannels: 1,
        samplesPerChannel: null,
        itemId: null,
      },
    })
    const realtimeAudio = await waitForSent(socket, 'thread/realtime/appendAudio')
    assert.deepEqual(realtimeAudio.params, {
      threadId: 'thread_1',
      audio: {
        data: 'AAAA',
        sampleRate: 24000,
        numChannels: 1,
        samplesPerChannel: null,
        itemId: null,
      },
    })
    socket.respond(realtimeAudio.id, {})
    assert.deepEqual(await realtimeAudioPromise, {})

    const realtimeVoicesPromise = client.requestProtocol('thread/realtime/listVoices', {})
    const realtimeVoices = await waitForSent(socket, 'thread/realtime/listVoices')
    assert.deepEqual(realtimeVoices.params, {})
    socket.respond(realtimeVoices.id, { voices: { v1: ['alloy'], v2: ['alloy'], defaultV1: 'alloy', defaultV2: 'alloy' } })
    assert.deepEqual(await realtimeVoicesPromise, { voices: { v1: ['alloy'], v2: ['alloy'], defaultV1: 'alloy', defaultV2: 'alloy' } })

    const realtimeStopPromise = client.requestProtocol('thread/realtime/stop', { threadId: 'thread_1' })
    const realtimeStop = await waitForSent(socket, 'thread/realtime/stop')
    assert.deepEqual(realtimeStop.params, { threadId: 'thread_1' })
    socket.respond(realtimeStop.id, {})
    assert.deepEqual(await realtimeStopPromise, {})
  } finally {
    if (originalWebSocket) globalThis.WebSocket = originalWebSocket
  }
})

test('app-server rpc client shares one initialize handshake across concurrent requests', async () => {
  const originalWebSocket = globalThis.WebSocket
  const sockets: FakeWebSocket[] = []
  ;(globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = class extends FakeWebSocket {
    constructor(url: string) {
      super(url)
      sockets.push(this)
    }
  } as unknown as typeof WebSocket

  try {
    const client = new AppServerRpcClient('ws://127.0.0.1:48768')
    const listPromise = client.listThreads()
    const readPromise = client.readThread('thread_1', {
      includeTurns: true,
      afterTurnId: 'turn_10',
      afterItemId: 'item_10',
      limit: 25,
      direction: 'newer',
    })

    const socket = await waitFor(() => sockets[0])
    const initialize = await waitForSent(socket, 'initialize')
    socket.respond(initialize.id, { userAgent: 'app-server-test' })
    await waitForSent(socket, 'initialized')

    const threadList = await waitForSent(socket, 'thread/list')
    const threadRead = await waitForSent(socket, 'thread/read')
    assert.deepEqual(threadRead.params, {
      threadId: 'thread_1',
      includeTurns: true,
      afterTurnId: 'turn_10',
      afterItemId: 'item_10',
      limit: 25,
      direction: 'newer',
    })
    socket.respond(threadList.id, {
      data: [],
      nextCursor: null,
      backwardsCursor: null,
    })
    socket.respond(threadRead.id, {
      thread: {
        id: 'thread_1',
        sessionId: 'session_1',
        preview: '',
        createdAt: 1,
        updatedAt: 1,
        status: { type: 'idle' },
        name: null,
        turns: [],
      },
    })

    assert.deepEqual(await listPromise, {
      data: [],
      nextCursor: null,
      backwardsCursor: null,
    })
    assert.equal((await readPromise).thread.id, 'thread_1')
    assert.equal(socket.sent.filter((message) => message.method === 'initialize').length, 1)
  } finally {
    if (originalWebSocket) globalThis.WebSocket = originalWebSocket
  }
})

test('app-server rpc client recovers from already initialized handshake errors', async () => {
  const originalWebSocket = globalThis.WebSocket
  const sockets: FakeWebSocket[] = []
  ;(globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = class extends FakeWebSocket {
    constructor(url: string) {
      super(url)
      sockets.push(this)
    }
  } as unknown as typeof WebSocket

  try {
    const client = new AppServerRpcClient('ws://127.0.0.1:48769')
    const listPromise = client.listThreads()

    const socket = await waitFor(() => sockets[0])
    const initialize = await waitForSent(socket, 'initialize')
    socket.respondError(initialize.id, -32600, 'Already initialized')
    await waitForSent(socket, 'initialized')

    const threadList = await waitForSent(socket, 'thread/list')
    socket.respond(threadList.id, {
      data: [],
      nextCursor: null,
      backwardsCursor: null,
    })

    assert.deepEqual(await listPromise, {
      data: [],
      nextCursor: null,
      backwardsCursor: null,
    })
  } finally {
    if (originalWebSocket) globalThis.WebSocket = originalWebSocket
  }
})

test('app-server rpc client returns protocol-shaped fallback server request responses', async () => {
  const originalWebSocket = globalThis.WebSocket
  const sockets: FakeWebSocket[] = []
  ;(globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = class extends FakeWebSocket {
    constructor(url: string) {
      super(url)
      sockets.push(this)
    }
  } as unknown as typeof WebSocket

  try {
    const client = new AppServerRpcClient('ws://127.0.0.1:48766')
    const initializePromise = client.initialize()
    const socket = await waitFor(() => sockets[0])
    const initialize = await waitForSent(socket, 'initialize')
    socket.respond(initialize.id, { userAgent: 'app-server-test' })
    await initializePromise
    const dispose = client.onServerRequest(() => undefined)

    socket.serverRequest('request_permissions_1', 'item/permissions/requestApproval', {
      threadId: 'thread_1',
      turnId: 'turn_1',
      itemId: 'call_1',
      permissions: { network: null, fileSystem: null },
    })

    const permissionsResponse = await waitForResponse(socket, 'request_permissions_1')
    assert.deepEqual(permissionsResponse.result, {
      permissions: {},
      scope: 'turn',
      strictAutoReview: true,
    })

    socket.serverRequest('request_input_1', 'item/tool/requestUserInput', { threadId: 'thread_1' })
    const inputResponse = await waitForResponse(socket, 'request_input_1')
    assert.deepEqual(inputResponse.result, { answers: {} })
    dispose()
  } finally {
    if (originalWebSocket) globalThis.WebSocket = originalWebSocket
  }
})

test('app-server rpc client defers early server requests until the UI handler is registered', async () => {
  const originalWebSocket = globalThis.WebSocket
  const sockets: FakeWebSocket[] = []
  ;(globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = class extends FakeWebSocket {
    constructor(url: string) {
      super(url)
      sockets.push(this)
    }
  } as unknown as typeof WebSocket

  try {
    const client = new AppServerRpcClient('ws://127.0.0.1:48767')
    const initializePromise = client.initialize()
    const socket = await waitFor(() => sockets[0])
    const initialize = await waitForSent(socket, 'initialize')
    socket.respond(initialize.id, { userAgent: 'app-server-test' })
    await initializePromise

    socket.serverRequest('approval_1', 'item/commandExecution/requestApproval', {
      threadId: 'thread_1',
      turnId: 'turn_1',
      itemId: 'call_1',
      command: 'pnpm test',
      cwd: '/repo',
    })
    await nextTick()
    assert.equal(socket.sent.some((message) => message.id === 'approval_1'), false)

    const seenRequests: unknown[] = []
    const dispose = client.onServerRequest((request) => {
      seenRequests.push(request)
      return { decision: 'accept' }
    })

    const approvalResponse = await waitForResponse(socket, 'approval_1')
    assert.deepEqual(seenRequests, [{
      id: 'approval_1',
      method: 'item/commandExecution/requestApproval',
      params: {
        threadId: 'thread_1',
        turnId: 'turn_1',
        itemId: 'call_1',
        command: 'pnpm test',
        cwd: '/repo',
      },
    }])
    assert.deepEqual(approvalResponse.result, { decision: 'accept' })
    dispose()
  } finally {
    if (originalWebSocket) globalThis.WebSocket = originalWebSocket
  }
})

test('app-server rpc client keeps MCP elicitation requests pending without a UI handler', async () => {
  const originalWebSocket = globalThis.WebSocket
  const sockets: FakeWebSocket[] = []
  ;(globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = class extends FakeWebSocket {
    constructor(url: string) {
      super(url)
      sockets.push(this)
    }
  } as unknown as typeof WebSocket

  try {
    const client = new AppServerRpcClient('ws://127.0.0.1:48770', 0)
    const initializePromise = client.initialize()
    const socket = await waitFor(() => sockets[0])
    const initialize = await waitForSent(socket, 'initialize')
    socket.respond(initialize.id, { userAgent: 'app-server-test' })
    await initializePromise

    socket.serverRequest('elicitation_1', 'mcpServer/elicitation/request', {
      threadId: 'thread_1',
      turnId: 'turn_1',
      server: 'figma',
      message: 'Allow Figma access?',
    })
    await nextTick()
    assert.equal(socket.sent.some((message) => message.id === 'elicitation_1'), false)

    const dispose = client.onServerRequest((request) => {
      assert.equal(request.method, 'mcpServer/elicitation/request')
      return { action: 'accept', content: {}, _meta: null }
    })

    const response = await waitForResponse(socket, 'elicitation_1')
    assert.deepEqual(response.result, { action: 'accept', content: {}, _meta: null })
    dispose()
  } finally {
    if (originalWebSocket) globalThis.WebSocket = originalWebSocket
  }
})

test('app-server rpc client lets later server request handlers answer when earlier handlers ignore', async () => {
  const originalWebSocket = globalThis.WebSocket
  const sockets: FakeWebSocket[] = []
  ;(globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = class extends FakeWebSocket {
    constructor(url: string) {
      super(url)
      sockets.push(this)
    }
  } as unknown as typeof WebSocket

  try {
    const client = new AppServerRpcClient('ws://127.0.0.1:48771')
    const initializePromise = client.initialize()
    const socket = await waitFor(() => sockets[0])
    const initialize = await waitForSent(socket, 'initialize')
    socket.respond(initialize.id, { userAgent: 'app-server-test' })
    await initializePromise

    const ignored: string[] = []
    const disposeIgnored = client.onServerRequest((request) => {
      ignored.push(request.method)
      return undefined
    })
    const disposeAnswering = client.onServerRequest((request) => {
      assert.equal(request.method, 'mcpServer/elicitation/request')
      return { action: 'accept', content: { ok: true }, _meta: null }
    })

    socket.serverRequest('elicitation_2', 'mcpServer/elicitation/request', {
      threadId: 'thread_1',
      turnId: 'turn_1',
      server: 'figma',
      message: 'Allow Figma access?',
    })

    const response = await waitForResponse(socket, 'elicitation_2')
    assert.deepEqual(ignored, ['mcpServer/elicitation/request'])
    assert.deepEqual(response.result, { action: 'accept', content: { ok: true }, _meta: null })
    disposeIgnored()
    disposeAnswering()
  } finally {
    if (originalWebSocket) globalThis.WebSocket = originalWebSocket
  }
})

test('app-server manual URL cache is scoped by provider profile', () => {
  const movaProvider: ProviderConfig = {
    id: 'mova',
    kind: 'mova',
    protocol: 'app-server',
    messageAdapter: 'thread-turn-item',
    label: 'Mova',
    enabled: true,
    appServerProfile: {
      id: 'mova-movscript-home',
      label: 'Mova',
      providerKey: 'mova',
      home: '.movscript/.mova',
      lifecycle: 'movscript-owned',
    },
  }
  const codexProvider: ProviderConfig = {
    id: 'codex',
    kind: 'codex',
    protocol: 'app-server',
    messageAdapter: 'thread-turn-item',
    label: 'Codex',
    enabled: true,
    appServerProfile: {
      id: 'codex-movscript-home',
      label: 'Codex',
      providerKey: 'codex',
      home: '.movscript/.codex',
      lifecycle: 'movscript-owned',
    },
  }

  const scopedStorage = new Map<string, string>()
  withFakeWindow('?appServerWsUrl=ws://127.0.0.1:41234', scopedStorage, () => {
    assert.equal(appServerURL(movaProvider), 'ws://127.0.0.1:41234')
    assert.equal(scopedStorage.get('movscript.appServerWsUrl.mova.mova-movscript-home'), 'ws://127.0.0.1:41234')
  })

  const unscopedStorage = new Map<string, string>([
    ['movscript.appServerWsUrl', 'ws://127.0.0.1:51234'],
  ])
  withFakeWindow('', unscopedStorage, () => {
    assert.equal(appServerURL(), 'ws://127.0.0.1:51234')
    assert.equal(appServerURL(codexProvider), undefined)
    assert.equal(appServerURL(movaProvider), undefined)
  })
})

test('app-server env URL keys prefer provider profile identity over provider kind', () => {
  const studioProvider: ProviderConfig = {
    id: 'studio-primary',
    kind: 'mova',
    protocol: 'app-server',
    messageAdapter: 'thread-turn-item',
    label: 'Studio Mova',
    enabled: true,
    appServerProfile: {
      id: 'studio-home',
      label: 'Studio Mova',
      providerKey: 'studio-agent',
      home: '.movscript/.studio-agent',
      lifecycle: 'movscript-owned',
    },
  }

  assert.deepEqual(appServerScopedEnvURLKeys(studioProvider), [
    'VITE_STUDIO_AGENT_APP_SERVER_WS_URL',
    'VITE_MOVSCRIPT_STUDIO_AGENT_APP_SERVER_WS_URL',
    'VITE_STUDIO_HOME_APP_SERVER_WS_URL',
    'VITE_MOVSCRIPT_STUDIO_HOME_APP_SERVER_WS_URL',
    'VITE_STUDIO_PRIMARY_APP_SERVER_WS_URL',
    'VITE_MOVSCRIPT_STUDIO_PRIMARY_APP_SERVER_WS_URL',
    'VITE_MOVA_APP_SERVER_WS_URL',
    'VITE_MOVSCRIPT_MOVA_APP_SERVER_WS_URL',
  ])
})

test('app-server ensure sends neutral provider home through neutral Electron API first', async () => {
  const provider: ProviderConfig = {
    id: 'mova',
    kind: 'mova',
    protocol: 'app-server',
    messageAdapter: 'thread-turn-item',
    label: 'Mova',
    enabled: true,
    appServerProfile: {
      id: 'mova-movscript-home',
      label: 'Mova',
      providerKey: 'mova',
      home: '.movscript/.mova',
      lifecycle: 'movscript-owned',
    },
  }
  let ensuredProfile: Record<string, unknown> | undefined
  await withFakeWindow('', new Map(), async () => {
    const endpoint = await ensureAppServerURL(provider)
    assert.equal(endpoint, 'ws://127.0.0.1:41235')
  }, {
    ensureAppServer: async (input: { profile: Record<string, unknown> }) => {
      ensuredProfile = input.profile
      return {
        ok: true,
        running: true,
        managed: true,
        profileId: 'mova-movscript-home',
        endpoint: 'ws://127.0.0.1:41235',
      }
    },
  })

  assert.equal(ensuredProfile?.home, '.mova')
  assert.equal((ensuredProfile as Record<string, unknown> | undefined)?.[['codex', 'Home'].join('')], undefined)
  assert.equal(ensuredProfile?.providerKey, 'mova')
})

test('app-server rpc client relays managed endpoints through Electron IPC', async () => {
  const sentPayloads: string[] = []
  const messageHandlers: Array<(message: { connectionId: string, kind: string, data?: string }) => void> = []
  let connectedURL = ''
  await withFakeWindow('', new Map(), async () => {
    const client = new AppServerRpcClient('managed:///mova-movscript-home')
    const initializePromise = client.initialize()
    const initialize = await waitFor(() => sentPayloads.map((payload) => JSON.parse(payload) as SentMessage).find((message) => message.method === 'initialize'))
    for (const handler of messageHandlers) {
      handler({
        connectionId: 'connection-1',
        kind: 'message',
        data: JSON.stringify({ id: initialize.id, result: { userAgent: 'app-server-test' } }),
      })
    }
    await initializePromise
    await waitFor(() => sentPayloads.map((payload) => JSON.parse(payload) as SentMessage).find((message) => message.method === 'initialized'))
    await client.close()
  }, {
    appServerConnect: async (input: { url: string }) => {
      connectedURL = input.url
      return { connectionId: 'connection-1' }
    },
    appServerSend: async (input: { payload: string }) => {
      sentPayloads.push(input.payload)
    },
    appServerClose: async () => undefined,
    onAppServerMessage: (handler: (message: { connectionId: string, kind: string, data?: string }) => void) => {
      messageHandlers.push(handler)
      return () => undefined
    },
  })

  assert.equal(connectedURL, 'managed:///mova-movscript-home')
})

test('default Mova provider initializes through a managed Electron relay endpoint', async () => {
  const provider: ProviderConfig = {
    id: 'mova',
    kind: 'mova',
    protocol: 'app-server',
    messageAdapter: 'thread-turn-item',
    label: 'Mova',
    enabled: true,
    appServerProfile: {
      id: 'mova-movscript-home',
      label: 'Mova',
      providerKey: 'mova',
      home: '.movscript/.mova',
      lifecycle: 'movscript-owned',
    },
  }
  const sentPayloads: string[] = []
  const messageHandlers: Array<(message: { connectionId: string, kind: string, data?: string }) => void> = []
  let ensuredProfile: Record<string, unknown> | undefined
  let connectedURL = ''
  await withFakeWindow('', new Map(), async () => {
    const client = await ensureAppServerRpcClient(provider)
    assert.ok(client)
    const initializePromise = client.initialize()
    const initialize = await waitFor(() => sentPayloads.map((payload) => JSON.parse(payload) as SentMessage).find((message) => message.method === 'initialize'))
    for (const handler of messageHandlers) {
      handler({
        connectionId: 'connection-1',
        kind: 'message',
        data: JSON.stringify({ id: initialize.id, result: { userAgent: 'mova-test' } }),
      })
    }
    await initializePromise
    await client.close()
  }, {
    ensureAppServer: async (input: { profile: Record<string, unknown> }) => {
      ensuredProfile = input.profile
      return {
        ok: true,
        running: true,
        managed: true,
        profileId: 'mova-movscript-home',
        endpoint: 'managed:///mova-movscript-home',
      }
    },
    appServerConnect: async (input: { url: string }) => {
      connectedURL = input.url
      return { connectionId: 'connection-1' }
    },
    appServerSend: async (input: { payload: string }) => {
      sentPayloads.push(input.payload)
    },
    appServerClose: async () => undefined,
    onAppServerMessage: (handler: (message: { connectionId: string, kind: string, data?: string }) => void) => {
      messageHandlers.push(handler)
      return () => undefined
    },
  })

  assert.equal(ensuredProfile?.providerKey, 'mova')
  assert.equal(ensuredProfile?.home, '.mova')
  assert.equal(connectedURL, 'managed:///mova-movscript-home')
})

interface SentMessage {
  id?: number | string
  method?: string
  params?: Record<string, unknown>
  result?: unknown
}

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3
  readonly sent: SentMessage[] = []
  readyState = FakeWebSocket.CONNECTING
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>()

  constructor(readonly url: string) {
    globalThis.setTimeout(() => {
      this.readyState = FakeWebSocket.OPEN
      this.emit('open', {})
    }, 0)
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as SentMessage)
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED
    this.emit('close', {})
  }

  respond(id: number | string | undefined, result: unknown): void {
    assert.ok(typeof id === 'number' || typeof id === 'string')
    this.emit('message', { data: JSON.stringify({ id, result }) })
  }

  respondError(id: number | string | undefined, code: number, message: string, data?: unknown): void {
    assert.ok(typeof id === 'number' || typeof id === 'string')
    this.emit('message', { data: JSON.stringify({ id, error: { code, message, data } }) })
  }

  serverRequest(id: string, method: string, params: unknown): void {
    this.emit('message', { data: JSON.stringify({ id, method, params }) })
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

function withFakeWindow<T>(search: string, storage: Map<string, string>, fn: () => T, api?: unknown): T {
  const previousWindow = (globalThis as typeof globalThis & { window?: unknown }).window
  const fakeWindow = {
    location: { search },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    },
    ...(api ? { api } : {}),
  }
  Object.defineProperty(globalThis, 'window', {
    value: fakeWindow,
    configurable: true,
  })
  const restoreWindow = () => {
    if (previousWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window')
    } else {
      Object.defineProperty(globalThis, 'window', {
        value: previousWindow,
        configurable: true,
      })
    }
  }
  try {
    const result = fn()
    const maybePromise = result as unknown as { finally?: (handler: () => void) => unknown } | undefined
    if (maybePromise && typeof maybePromise.finally === 'function') {
      return maybePromise.finally(restoreWindow) as T
    }
    restoreWindow()
    return result
  } catch (error) {
    restoreWindow()
    throw error
  }
}

async function waitFor<T>(read: () => T | undefined): Promise<T> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 1000) {
    const value = read()
    if (value !== undefined) return value
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('Timed out waiting for value')
}

async function waitForSent(socket: FakeWebSocket, method: string): Promise<SentMessage> {
  return waitFor(() => socket.sent.find((message) => message.method === method))
}

async function waitForResponse(socket: FakeWebSocket, id: string): Promise<SentMessage> {
  return waitFor(() => socket.sent.find((message) => message.id === id))
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
