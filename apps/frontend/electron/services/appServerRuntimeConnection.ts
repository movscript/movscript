import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface, type Interface as ReadlineInterface } from 'node:readline'
import type {
  ProviderConfig,
  ProviderRuntimeProfile,
} from '../../src/shared/infrastructure/providerConfigStore'
import {
  notificationEventFromContext,
  publishAgentRuntimeNotification,
  requestAgentRuntimeServerRequest,
} from './agentRuntimeHost'
import type {
  AppServerCommand,
  AppServerRuntimeApi,
} from './appServerRuntimeCommand'
import {
  normalizeAppServerNotification,
  threadIdFromAppServerNotification,
  type AppServerJsonRpcMessage,
} from './appServerRuntimeMapper'
import {
  appServerAgentRequest,
  appServerResponseForAgentResponse,
  defaultAgentResponseForRequest,
} from './appServerRuntimeServerRequests'

export interface AppServerConnectionContext {
  api: AppServerRuntimeApi
  provider: ProviderConfig
  runtime: ProviderRuntimeProfile
  workspaceDir: string
  env: NodeJS.ProcessEnv
  command: AppServerCommand
}

type JsonRpcId = number | string

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

const appServerConnections = new Map<string, Promise<AppServerConnection>>()

export async function appServerConnection(context: AppServerConnectionContext): Promise<AppServerConnection> {
  const key = appServerConnectionKey(context)
  let pending = appServerConnections.get(key)
  if (!pending) {
    pending = createInitializedAppServerConnection(context, () => {
      if (appServerConnections.get(key) === pending) appServerConnections.delete(key)
    })
    appServerConnections.set(key, pending)
    pending.catch(() => {
      if (appServerConnections.get(key) === pending) appServerConnections.delete(key)
    })
  }
  return pending
}

export class AppServerConnection {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly lines: ReadlineInterface
  private readonly pending = new Map<JsonRpcId, PendingRequest>()
  private nextId = 1
  private closed = false

  constructor(
    private readonly context: AppServerConnectionContext,
    private readonly onClose?: () => void,
  ) {
    const args = [
      ...(context.command.args ?? []),
      '--listen',
      'stdio://',
      '--session-source',
      'vscode',
    ]
    this.child = spawn(context.command.command, args, {
      cwd: context.workspaceDir,
      env: context.env,
      stdio: 'pipe',
    })
    this.lines = createInterface({ input: this.child.stdout })
    this.lines.on('line', (line) => this.handleLine(line))
    this.child.stderr.on('data', (chunk) => {
      const text = String(chunk).trim()
      if (text) console.warn(`[Movscript app-server:${context.api}] ${text}`)
    })
    this.child.on('error', (error) => this.close(error))
    this.child.on('exit', (code, signal) => {
      this.close(new Error(`${context.api} app-server exited${code === null ? '' : ` with code ${code}`}${signal ? ` (${signal})` : ''}`))
    })
  }

  async initialize(): Promise<void> {
    await this.request('initialize', {
      clientInfo: {
        name: 'movscript_desktop',
        title: 'MovScript Desktop',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
    })
    this.notify('initialized')
  }

  request(method: string, params?: unknown): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error(`${this.context.api} app-server is closed.`))
    const id = this.nextId++
    const message = params === undefined ? { id, method } : { id, method, params }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.write(message)
    })
  }

  notify(method: string, params?: unknown): void {
    this.write(params === undefined ? { method } : { method, params })
  }

  private write(message: AppServerJsonRpcMessage): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private handleLine(line: string): void {
    const text = line.trim()
    if (!text) return
    let message: AppServerJsonRpcMessage
    try {
      message = JSON.parse(text) as AppServerJsonRpcMessage
    } catch {
      console.warn(`[Movscript app-server:${this.context.api}] ignored non-JSON stdout: ${text}`)
      return
    }
    if (message.id !== undefined && (Object.prototype.hasOwnProperty.call(message, 'result') || Object.prototype.hasOwnProperty.call(message, 'error'))) {
      this.handleResponse(message)
      return
    }
    if (message.id !== undefined && typeof message.method === 'string') {
      void this.handleServerRequest(message)
      return
    }
    if (typeof message.method === 'string') {
      this.handleNotification(message)
    }
  }

  private handleResponse(message: AppServerJsonRpcMessage): void {
    const pending = message.id === undefined ? undefined : this.pending.get(message.id)
    if (!pending || message.id === undefined) return
    this.pending.delete(message.id)
    if (message.error !== undefined) {
      pending.reject(jsonRpcError(message.error, this.context.api))
      return
    }
    pending.resolve(message.result)
  }

  private async handleServerRequest(message: AppServerJsonRpcMessage): Promise<void> {
    const request = appServerAgentRequest(message)
    if (!request) {
      this.write({ id: message.id, result: {} })
      return
    }
    try {
      const response = await requestAgentRuntimeServerRequest({
        provider: this.context.provider,
        runtime: this.context.runtime,
        ...(request.threadId ? { threadId: request.threadId } : {}),
      }, request)
      this.write({
        id: message.id,
        result: appServerResponseForAgentResponse(request, response ?? defaultAgentResponseForRequest(request)),
      })
    } catch (error) {
      this.write({
        id: message.id,
        error: {
          code: -32603,
          message: errorMessage(error),
        },
      })
    }
  }

  private handleNotification(message: AppServerJsonRpcMessage): void {
    const notification = normalizeAppServerNotification(message, this.context)
    const threadId = threadIdFromAppServerNotification(notification)
    publishAgentRuntimeNotification(notificationEventFromContext({
      provider: this.context.provider,
      runtime: this.context.runtime,
      ...(threadId ? { threadId } : {}),
    }, notification))
  }

  private close(error: Error): void {
    if (this.closed) return
    this.closed = true
    this.lines.close()
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
    if (!this.child.killed) this.child.kill()
    this.onClose?.()
  }
}

async function createInitializedAppServerConnection(
  context: AppServerConnectionContext,
  onClose: () => void,
): Promise<AppServerConnection> {
  const connection = new AppServerConnection(context, onClose)
  await connection.initialize()
  return connection
}

function appServerConnectionKey(context: AppServerConnectionContext): string {
  return [context.api, context.runtime.id, context.provider.id, context.workspaceDir, context.command.command].join(':')
}

function jsonRpcError(error: unknown, api: string): Error {
  if (isRecord(error)) {
    const message = stringField(error.message) ?? JSON.stringify(error)
    return new Error(`${api} app-server error: ${message}`)
  }
  return new Error(`${api} app-server error: ${String(error)}`)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
