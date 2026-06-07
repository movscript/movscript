import { BrowserWindow, ipcMain, type WebContents } from 'electron'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Socket } from 'node:net'
import { appServerManager } from '../services/appServerManager'
import type {
  ElectronAppServerCloseInput,
  ElectronAppServerConnectInput,
  ElectronAppServerEnsureInput,
  ElectronAppServerLogEvent,
  ElectronAppServerMessage,
  ElectronAppServerSendInput,
  ElectronAppServerStatusInput,
  ElectronAppServerStopInput,
} from '../../src/shared/contracts/electronApi'

type AppServerRelaySocket = {
  send: (payload: string) => void
  close: () => void
  onMessage: (handler: (data: string) => void) => void
  onError: (handler: (error: Error) => void) => void
  onClose: (handler: () => void) => void
}

type AppServerConnection = {
  id: string
  url: string
  socket: AppServerRelaySocket
  sender: WebContents
  messageChannel: string
}

const connections = new Map<string, AppServerConnection>()

type AppServerIpcChannels = {
  distribute: string
  ensure: string
  status: string
  stop: string
  connect: string
  send: string
  close: string
  message: string
  log: string
}

const APP_SERVER_IPC_CHANNELS: AppServerIpcChannels = {
  distribute: 'app-server:distribute',
  ensure: 'app-server:ensure',
  status: 'app-server:status',
  stop: 'app-server:stop',
  connect: 'app-server:connect',
  send: 'app-server:send',
  close: 'app-server:close',
  message: 'app-server:message',
  log: 'app-server:log',
}

let logForwarderRegistered = false

export function registerAppServerIpcHandlers(): void {
  registerAppServerIpcChannelHandlers(APP_SERVER_IPC_CHANNELS)
}

function registerAppServerIpcChannelHandlers(channels: AppServerIpcChannels): void {
  registerAppServerLogForwarder(channels.log)

  ipcMain.handle(channels.distribute, (_event, input?: ElectronAppServerEnsureInput) => {
    return appServerManager.distribute(input)
  })

  ipcMain.handle(channels.ensure, async (_event, input?: ElectronAppServerEnsureInput) => {
    return appServerManager.ensure(input)
  })

  ipcMain.handle(channels.status, (_event, input?: ElectronAppServerStatusInput) => {
    return appServerManager.status(input?.profileId)
  })

  ipcMain.handle(channels.stop, (_event, input?: ElectronAppServerStopInput) => {
    return appServerManager.stop(input?.profileId)
  })

  ipcMain.handle(channels.connect, async (event, input?: ElectronAppServerConnectInput) => {
    const url = validateAppServerURL(input?.url)
    const id = randomUUID()
    const socket = await openAppServerRelaySocket(url)
    const connection: AppServerConnection = { id, url, socket, sender: event.sender, messageChannel: channels.message }
    connections.set(id, connection)
    console.info('[app-server relay] connect', { connectionId: id, url, activeConnections: connections.size })

    event.sender.once('destroyed', () => closeConnection(id))
    socket.onMessage((data) => {
      sendToRenderer(connection, {
        connectionId: id,
        kind: 'message',
        data,
      })
    })
    socket.onError((error) => {
      console.warn('[app-server relay] socket error', { connectionId: id, url, error: error.message })
      sendToRenderer(connection, {
        connectionId: id,
        kind: 'error',
        error: error.message || `app-server WebSocket error: ${url}`,
      })
    })
    socket.onClose(() => {
      connections.delete(id)
      console.info('[app-server relay] socket close', { connectionId: id, url, activeConnections: connections.size })
      sendToRenderer(connection, {
        connectionId: id,
        kind: 'close',
      })
    })

    return { connectionId: id }
  })

  ipcMain.handle(channels.send, (_event, input?: ElectronAppServerSendInput) => {
    const connectionId = input?.connectionId?.trim()
    if (!connectionId) throw new Error('app-server send requires connectionId')
    const connection = connections.get(connectionId)
    if (!connection) throw new Error(`app-server connection not found: ${connectionId}`)
    if (typeof input?.payload !== 'string') throw new Error('app-server send requires a string payload')
    const method = appServerRelayPayloadMethod(input.payload)
    if (method && appServerRelayShouldLogMethod(method)) {
      console.info('[app-server relay] send', { connectionId, url: connection.url, method })
    }
    connection.socket.send(input.payload)
  })

  ipcMain.handle(channels.close, (_event, input?: ElectronAppServerCloseInput) => {
    closeConnection(input?.connectionId)
  })
}

function registerAppServerLogForwarder(channel: string): void {
  if (logForwarderRegistered) return
  logForwarderRegistered = true
  appServerManager.onLog((event: ElectronAppServerLogEvent) => {
    for (const contents of webContentsForAppServerLogs()) {
      if (!contents.isDestroyed()) contents.send(channel, event)
    }
  })
}

function webContentsForAppServerLogs(): WebContents[] {
  const connected = Array.from(connections.values()).map((connection) => connection.sender)
  const windows = BrowserWindow.getAllWindows().map((window) => window.webContents)
  return Array.from(new Set([...connected, ...windows]))
}

function validateAppServerURL(value: string | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error('app-server URL is required')
  const parsed = new URL(trimmed)
  if (parsed.protocol !== 'managed:' && parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error(`app-server URL must use managed://, ws://, or wss://: ${trimmed}`)
  }
  return parsed.toString()
}

async function openAppServerRelaySocket(url: string): Promise<AppServerRelaySocket> {
  const parsed = new URL(url)
  if (parsed.protocol === 'managed:') return appServerManager.openManagedRelaySocket(url)
  const WebSocketCtor = globalThis.WebSocket
  if (WebSocketCtor) return openNativeWebSocket(WebSocketCtor, url)
  if (parsed.protocol !== 'ws:') {
    throw new Error('Electron main process does not provide WebSocket; only ws:// app-server URLs are supported by the fallback relay')
  }
  return openNodeWebSocket(parsed)
}

function openNativeWebSocket(WebSocketCtor: typeof WebSocket, url: string): Promise<AppServerRelaySocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocketCtor(url)
    const messageHandlers = new Set<(data: string) => void>()
    const errorHandlers = new Set<(error: Error) => void>()
    const closeHandlers = new Set<() => void>()
    socket.addEventListener('open', () => {
      resolve({
        send: (payload) => socket.send(payload),
        close: () => socket.close(),
        onMessage: (handler) => { messageHandlers.add(handler) },
        onError: (handler) => { errorHandlers.add(handler) },
        onClose: (handler) => { closeHandlers.add(handler) },
      })
    }, { once: true })
    socket.addEventListener('message', (message) => {
      for (const handler of messageHandlers) handler(stringifyWebSocketData(message.data))
    })
    socket.addEventListener('error', () => {
      const error = new Error(`Failed to connect app-server: ${url}`)
      for (const handler of errorHandlers) handler(error)
      reject(error)
    }, { once: true })
    socket.addEventListener('close', () => {
      for (const handler of closeHandlers) handler()
    })
  })
}

function openNodeWebSocket(url: URL): Promise<AppServerRelaySocket> {
  return new Promise((resolve, reject) => {
    const port = Number(url.port || '80')
    const socket = new Socket()
    const key = randomBytes(16).toString('base64')
    let handshakeBuffer = Buffer.alloc(0)
    let frameBuffer = Buffer.alloc(0)
    let opened = false
    const messageHandlers = new Set<(data: string) => void>()
    const errorHandlers = new Set<(error: Error) => void>()
    const closeHandlers = new Set<() => void>()

    socket.once('connect', () => {
      const path = `${url.pathname || '/'}${url.search || ''}`
      socket.write([
        `GET ${path} HTTP/1.1`,
        `Host: ${url.hostname}:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n'))
    })
    socket.on('data', (chunk) => {
      if (!opened) {
        handshakeBuffer = Buffer.concat([handshakeBuffer, chunk])
        const headerEnd = handshakeBuffer.indexOf('\r\n\r\n')
        if (headerEnd < 0) return
        const header = handshakeBuffer.subarray(0, headerEnd).toString('utf8')
        const remaining = handshakeBuffer.subarray(headerEnd + 4)
        const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
        if (!/^HTTP\/1\.1 101\b/i.test(header) || !header.toLowerCase().includes(`sec-websocket-accept: ${accept.toLowerCase()}`)) {
          const status = header.split('\r\n')[0] || 'invalid response'
          reject(new Error(`app-server WebSocket handshake failed: ${status}`))
          socket.destroy()
          return
        }
        opened = true
        resolve({
          send: (payload) => socket.write(encodeClientTextFrame(payload)),
          close: () => socket.end(encodeClientCloseFrame()),
          onMessage: (handler) => { messageHandlers.add(handler) },
          onError: (handler) => { errorHandlers.add(handler) },
          onClose: (handler) => { closeHandlers.add(handler) },
        })
        if (remaining.length === 0) return
        frameBuffer = Buffer.concat([frameBuffer, remaining])
      } else {
        frameBuffer = Buffer.concat([frameBuffer, chunk])
      }
      const parsed = parseServerFrames(frameBuffer)
      frameBuffer = Buffer.from(parsed.remaining)
      for (const message of parsed.messages) {
        for (const handler of messageHandlers) handler(message)
      }
      if (parsed.closed) socket.end()
    })
    socket.on('error', (error) => {
      for (const handler of errorHandlers) handler(error)
      reject(error)
    })
    socket.on('close', () => {
      for (const handler of closeHandlers) handler()
    })
    socket.connect(port, url.hostname)
  })
}

function closeConnection(connectionId: string | null | undefined): void {
  const normalized = connectionId?.trim()
  if (!normalized) return
  const connection = connections.get(normalized)
  if (!connection) return
  connections.delete(normalized)
  console.info('[app-server relay] close', { connectionId: normalized, url: connection.url, activeConnections: connections.size })
  connection.socket.close()
}

function appServerRelayPayloadMethod(payload: string): string | undefined {
  try {
    const parsed = JSON.parse(payload) as { method?: unknown }
    return typeof parsed.method === 'string' ? parsed.method : undefined
  } catch {
    return undefined
  }
}

function appServerRelayShouldLogMethod(method: string): boolean {
  return method === 'thread/list'
    || method === 'thread/read'
    || method === 'thread/resume'
    || method === 'thread/goal/clear'
    || method === 'thread/goal/get'
    || method === 'thread/goal/set'
}

function sendToRenderer(connection: AppServerConnection, message: ElectronAppServerMessage): void {
  if (connection.sender.isDestroyed()) return
  connection.sender.send(connection.messageChannel, message)
}

function stringifyWebSocketData(data: unknown): string {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data)
  return String(data)
}

function encodeClientTextFrame(payload: string): Buffer {
  return encodeClientFrame(0x1, Buffer.from(payload, 'utf8'))
}

function encodeClientCloseFrame(): Buffer {
  return encodeClientFrame(0x8, Buffer.alloc(0))
}

function encodeClientFrame(opcode: number, payload: Buffer): Buffer {
  const mask = randomBytes(4)
  const headerLength = payload.length < 126 ? 2 : payload.length <= 0xffff ? 4 : 10
  const frame = Buffer.alloc(headerLength + 4 + payload.length)
  frame[0] = 0x80 | opcode
  if (payload.length < 126) {
    frame[1] = 0x80 | payload.length
  } else if (payload.length <= 0xffff) {
    frame[1] = 0x80 | 126
    frame.writeUInt16BE(payload.length, 2)
  } else {
    frame[1] = 0x80 | 127
    frame.writeBigUInt64BE(BigInt(payload.length), 2)
  }
  mask.copy(frame, headerLength)
  for (let index = 0; index < payload.length; index += 1) {
    frame[headerLength + 4 + index] = payload[index] ^ mask[index % 4]
  }
  return frame
}

function parseServerFrames(buffer: Buffer): { messages: string[]; remaining: Buffer; closed: boolean } {
  const messages: string[] = []
  let offset = 0
  let closed = false
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset]
    const second = buffer[offset + 1]
    const opcode = first & 0x0f
    const masked = (second & 0x80) !== 0
    let payloadLength = second & 0x7f
    let headerLength = 2
    if (payloadLength === 126) {
      if (offset + 4 > buffer.length) break
      payloadLength = buffer.readUInt16BE(offset + 2)
      headerLength = 4
    } else if (payloadLength === 127) {
      if (offset + 10 > buffer.length) break
      const length = buffer.readBigUInt64BE(offset + 2)
      if (length > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('app-server WebSocket frame is too large')
      payloadLength = Number(length)
      headerLength = 10
    }
    const maskLength = masked ? 4 : 0
    const frameEnd = offset + headerLength + maskLength + payloadLength
    if (frameEnd > buffer.length) break
    const mask = masked ? buffer.subarray(offset + headerLength, offset + headerLength + 4) : undefined
    const payload = Buffer.from(buffer.subarray(offset + headerLength + maskLength, frameEnd))
    if (mask) {
      for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4]
    }
    if (opcode === 0x1) messages.push(payload.toString('utf8'))
    else if (opcode === 0x8) closed = true
    offset = frameEnd
  }
  return { messages, remaining: buffer.subarray(offset), closed }
}
