import assert from 'node:assert/strict'
import test from 'node:test'

import { CodexAppServerRpcClient } from '@/shared/infrastructure/codex-app-server/codexAppServerRpcClient'

test('codex app-server rpc client sends codex-native thread and turn requests', async () => {
  const originalWebSocket = globalThis.WebSocket
  const sockets: FakeWebSocket[] = []
  ;(globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = class extends FakeWebSocket {
    constructor(url: string) {
      super(url)
      sockets.push(this)
    }
  } as unknown as typeof WebSocket

  try {
    const client = new CodexAppServerRpcClient('ws://127.0.0.1:48765')
    const threadPromise = client.startThread({ cwd: '/tmp/project', threadSource: 'user' })

    const socket = await waitFor(() => sockets[0])
    const initialize = await waitForSent(socket, 'initialize')
    assert.deepEqual(initialize.params?.capabilities, { experimentalApi: true, requestAttestation: true })
    socket.respond(initialize.id, { userAgent: 'codex-test', codexHome: '/tmp/codex' })
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

    const turnPromise = client.startTextTurn({
      threadId: 'thread_1',
      clientUserMessageId: 'client_msg_1',
      text: 'hello codex',
    })
    const turnStart = await waitForSent(socket, 'turn/start')
    assert.deepEqual(turnStart.params, {
      threadId: 'thread_1',
      clientUserMessageId: 'client_msg_1',
      input: [{ type: 'text', text: 'hello codex', text_elements: [] }],
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

test('codex app-server rpc client returns protocol-shaped fallback server request responses', async () => {
  const originalWebSocket = globalThis.WebSocket
  const sockets: FakeWebSocket[] = []
  ;(globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = class extends FakeWebSocket {
    constructor(url: string) {
      super(url)
      sockets.push(this)
    }
  } as unknown as typeof WebSocket

  try {
    const client = new CodexAppServerRpcClient('ws://127.0.0.1:48766', 0)
    const initializePromise = client.initialize()
    const socket = await waitFor(() => sockets[0])
    const initialize = await waitForSent(socket, 'initialize')
    socket.respond(initialize.id, { userAgent: 'codex-test', codexHome: '/tmp/codex' })
    await initializePromise

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
  } finally {
    if (originalWebSocket) globalThis.WebSocket = originalWebSocket
  }
})

test('codex app-server rpc client defers early server requests until the UI handler is registered', async () => {
  const originalWebSocket = globalThis.WebSocket
  const sockets: FakeWebSocket[] = []
  ;(globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = class extends FakeWebSocket {
    constructor(url: string) {
      super(url)
      sockets.push(this)
    }
  } as unknown as typeof WebSocket

  try {
    const client = new CodexAppServerRpcClient('ws://127.0.0.1:48767')
    const initializePromise = client.initialize()
    const socket = await waitFor(() => sockets[0])
    const initialize = await waitForSent(socket, 'initialize')
    socket.respond(initialize.id, { userAgent: 'codex-test', codexHome: '/tmp/codex' })
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

  serverRequest(id: string, method: string, params: unknown): void {
    this.emit('message', { data: JSON.stringify({ id, method, params }) })
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
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
