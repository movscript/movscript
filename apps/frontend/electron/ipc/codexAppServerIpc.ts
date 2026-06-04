import { ipcMain, type WebContents } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { createServer, Socket } from 'node:net'
import {
  CODEX_AGENT_RUNTIME_DIR_NAME,
  resolveAgentWorkspaceRuntimePaths,
} from '@movscript/agent-runtime'
import type {
  ElectronCodexAppServerCloseInput,
  ElectronCodexAppServerConnectInput,
  ElectronCodexAppServerEnsureInput,
  ElectronCodexAppServerMessage,
  ElectronCodexAppServerSendInput,
  ElectronCodexAppServerStatus,
  ElectronCodexAppServerStatusInput,
  ElectronCodexAppServerStopInput,
} from '../../src/shared/contracts/electronApi'

type CodexRelaySocket = {
  send: (payload: string) => void
  close: () => void
  onMessage: (handler: (data: string) => void) => void
  onError: (handler: (error: Error) => void) => void
  onClose: (handler: () => void) => void
}

type CodexAppServerConnection = {
  id: string
  url: string
  socket: CodexRelaySocket
  sender: WebContents
}

const connections = new Map<string, CodexAppServerConnection>()
const managedServers = new Map<string, ManagedCodexAppServer>()

type ManagedCodexAppServer = {
  profileId: string
  label?: string
  endpoint: string
  executablePath: string
  codexHome: string
  workspaceDir?: string
  child: ChildProcess
  startedAt: number
  lastError?: string
}

export function registerCodexAppServerIpcHandlers(): void {
  ipcMain.handle('codex:app-server-ensure', async (_event, input?: ElectronCodexAppServerEnsureInput) => {
    return ensureCodexAppServer(input)
  })

  ipcMain.handle('codex:app-server-status', (_event, input?: ElectronCodexAppServerStatusInput) => {
    return codexAppServerStatus(input?.profileId)
  })

  ipcMain.handle('codex:app-server-stop', (_event, input?: ElectronCodexAppServerStopInput) => {
    return stopCodexAppServer(input?.profileId)
  })

  ipcMain.handle('codex:app-server-connect', async (event, input?: ElectronCodexAppServerConnectInput) => {
    const url = validateCodexAppServerURL(input?.url)
    const id = randomUUID()
    const socket = await openCodexRelaySocket(url)
    const connection: CodexAppServerConnection = { id, url, socket, sender: event.sender }
    connections.set(id, connection)

    event.sender.once('destroyed', () => closeConnection(id))
    socket.onMessage((data) => {
      sendToRenderer(connection, {
        connectionId: id,
        kind: 'message',
        data,
      })
    })
    socket.onError((error) => {
      sendToRenderer(connection, {
        connectionId: id,
        kind: 'error',
        error: error.message || `Codex app-server WebSocket error: ${url}`,
      })
    })
    socket.onClose(() => {
      connections.delete(id)
      sendToRenderer(connection, {
        connectionId: id,
        kind: 'close',
      })
    })

    return { connectionId: id }
  })

  ipcMain.handle('codex:app-server-send', (_event, input?: ElectronCodexAppServerSendInput) => {
    const connectionId = input?.connectionId?.trim()
    if (!connectionId) throw new Error('Codex app-server send requires connectionId')
    const connection = connections.get(connectionId)
    if (!connection) throw new Error(`Codex app-server connection not found: ${connectionId}`)
    if (typeof input?.payload !== 'string') throw new Error('Codex app-server send requires a string payload')
    connection.socket.send(input.payload)
  })

  ipcMain.handle('codex:app-server-close', (_event, input?: ElectronCodexAppServerCloseInput) => {
    closeConnection(input?.connectionId)
  })
}

async function ensureCodexAppServer(input: ElectronCodexAppServerEnsureInput | undefined): Promise<ElectronCodexAppServerStatus> {
  const profile = input?.profile
  const profileId = profile?.id?.trim()
  if (!profileId) return codexAppServerError('codex', 'Codex app-server profile id is required')
  const label = profile?.label?.trim() || undefined

  const existing = managedServers.get(profileId)
  if (existing && existing.child.exitCode === null && !existing.child.killed) return codexAppServerStatus(profileId)

  const executablePath = profile?.executablePath?.trim() || process.env.MOVSCRIPT_CODEX_BIN?.trim() || 'codex'
  const workspaceDir = profile?.workspaceDir?.trim() || process.cwd()
  const codexPaths = resolveAgentWorkspaceRuntimePaths(workspaceDir, { runtimeDirName: CODEX_AGENT_RUNTIME_DIR_NAME })
  mkdirSync(codexPaths.agentDir, { recursive: true })
  const codexHome = resolveCodexHome(profile?.codexHome?.trim(), workspaceDir, codexPaths.agentDir)
  mkdirSync(codexHome, { recursive: true })
  const port = await reserveLocalPort()
  const endpoint = `ws://127.0.0.1:${port}`
  const child = spawn(executablePath, ['app-server', '--listen', endpoint], {
    cwd: workspaceDir,
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      MOVSCRIPT_CODEX_APP_SERVER_PROFILE_ID: profileId,
    },
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const server: ManagedCodexAppServer = {
    profileId,
    ...(label ? { label } : {}),
    endpoint,
    executablePath,
    codexHome,
    workspaceDir,
    child,
    startedAt: Date.now(),
  }
  managedServers.set(profileId, server)
  child.stdout?.on('data', (chunk) => console.info(`[codex:${profileId}] ${String(chunk).trimEnd()}`))
  child.stderr?.on('data', (chunk) => console.info(`[codex:${profileId}] ${String(chunk).trimEnd()}`))
  child.on('error', (error) => {
    server.lastError = error.message
    console.error(`[codex:${profileId}] app-server spawn error`, error)
  })
  child.on('exit', (code, signal) => {
    server.lastError = code === 0 ? undefined : `Codex app-server exited code=${code ?? 'null'} signal=${signal ?? 'null'}`
    console.info(`[codex:${profileId}] app-server exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
  })

  try {
    await waitForCodexAppServerReady(endpoint)
    return codexAppServerStatus(profileId)
  } catch (error) {
    server.lastError = errorMessage(error)
    if (child.exitCode === null && !child.killed) child.kill()
    return codexAppServerStatus(profileId)
  }
}

function codexAppServerStatus(profileId?: string): ElectronCodexAppServerStatus {
  const normalized = profileId?.trim()
  const server = normalized
    ? managedServers.get(normalized)
    : Array.from(managedServers.values()).find((item) => item.child.exitCode === null && !item.child.killed)
  if (!server) return codexAppServerError(normalized || 'codex', 'Codex app-server is not running')
  const running = server.child.exitCode === null && !server.child.killed
  return {
    ok: running && !server.lastError,
    running,
    managed: true,
    profileId: server.profileId,
    ...(server.label ? { label: server.label } : {}),
    endpoint: server.endpoint,
    ...(server.child.pid ? { pid: server.child.pid } : {}),
    executablePath: server.executablePath,
    codexHome: server.codexHome,
    ...(server.workspaceDir ? { workspaceDir: server.workspaceDir } : {}),
    ...(server.lastError ? { error: server.lastError } : {}),
  }
}

function stopCodexAppServer(profileId?: string): ElectronCodexAppServerStatus {
  const normalized = profileId?.trim()
  const server = normalized
    ? managedServers.get(normalized)
    : Array.from(managedServers.values()).find((item) => item.child.exitCode === null && !item.child.killed)
  if (!server) return codexAppServerError(normalized || 'codex', 'Codex app-server is not running')
  if (server.child.exitCode === null && !server.child.killed) server.child.kill()
  managedServers.delete(server.profileId)
  return {
    ok: true,
    running: false,
    managed: true,
    profileId: server.profileId,
    ...(server.label ? { label: server.label } : {}),
    endpoint: server.endpoint,
    executablePath: server.executablePath,
    codexHome: server.codexHome,
    ...(server.workspaceDir ? { workspaceDir: server.workspaceDir } : {}),
  }
}

function codexAppServerError(profileId: string, error: string): ElectronCodexAppServerStatus {
  return {
    ok: false,
    running: false,
    managed: false,
    profileId,
    error,
  }
}

function resolveCodexHome(value: string | undefined, workspaceDir: string, defaultCodexAgentDir: string): string {
  const input = value?.trim()
  if (!input || input === '~' || input.startsWith('~/') || isAbsolute(input) || !isMovScriptManagedCodexHome(input)) {
    return resolve(defaultCodexAgentDir)
  }
  if (input === '.movscript/codex/CODEX_HOME' || input.startsWith('.movscript/codex/CODEX_HOME/')) {
    return resolve(defaultCodexAgentDir)
  }
  return resolve(workspaceDir || process.cwd(), input)
}

function isMovScriptManagedCodexHome(value: string): boolean {
  return value === '.movscript/.codex'
    || value.startsWith('.movscript/.codex/')
    || value === '.movscript/codex/CODEX_HOME'
    || value.startsWith('.movscript/codex/CODEX_HOME/')
}

async function reserveLocalPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : undefined
      server.close(() => {
        if (typeof port === 'number') resolvePort(port)
        else reject(new Error('Failed to reserve local Codex app-server port'))
      })
    })
  })
}

async function waitForCodexAppServerReady(endpoint: string): Promise<void> {
  const healthURL = endpoint.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')
  const readyURL = `${healthURL.replace(/\/+$/, '')}/readyz`
  const deadline = Date.now() + 10_000
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const response = await fetch(readyURL)
      if (response.ok) return
      lastError = new Error(`Codex app-server readiness returned ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150))
  }
  throw new Error(`Timed out waiting for Codex app-server at ${readyURL}: ${errorMessage(lastError)}`)
}

function validateCodexAppServerURL(value: string | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error('Codex app-server URL is required')
  const parsed = new URL(trimmed)
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error(`Codex app-server URL must use ws:// or wss://: ${trimmed}`)
  }
  return parsed.toString()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function openCodexRelaySocket(url: string): Promise<CodexRelaySocket> {
  const WebSocketCtor = globalThis.WebSocket
  if (WebSocketCtor) return openNativeWebSocket(WebSocketCtor, url)
  const parsed = new URL(url)
  if (parsed.protocol !== 'ws:') {
    throw new Error('Electron main process does not provide WebSocket; only ws:// Codex app-server URLs are supported by the fallback relay')
  }
  return openNodeWebSocket(parsed)
}

function openNativeWebSocket(WebSocketCtor: typeof WebSocket, url: string): Promise<CodexRelaySocket> {
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
      const error = new Error(`Failed to connect Codex app-server: ${url}`)
      for (const handler of errorHandlers) handler(error)
      reject(error)
    }, { once: true })
    socket.addEventListener('close', () => {
      for (const handler of closeHandlers) handler()
    })
  })
}

function openNodeWebSocket(url: URL): Promise<CodexRelaySocket> {
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
          reject(new Error(`Codex app-server WebSocket handshake failed: ${status}`))
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
  connection.socket.close()
}

function sendToRenderer(connection: CodexAppServerConnection, message: ElectronCodexAppServerMessage): void {
  if (connection.sender.isDestroyed()) return
  connection.sender.send('codex:app-server-message', message)
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
      if (length > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Codex app-server WebSocket frame is too large')
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
