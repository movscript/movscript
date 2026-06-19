import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface, type Interface as ReadlineInterface } from 'node:readline'
import type {
  AgentChatInput,
  AgentChatNotification,
  AgentChatServerRequest,
  AgentChatServerRequestResponse,
  AgentChatThread,
  AgentChatThreadItem,
  AgentChatTurn,
  AgentThreadExecutionSettings,
} from '@movscript/core/agent/chat'
import {
  providerRuntimeApiContract,
  type ProviderRuntimeApiContract,
} from '../../src/shared/infrastructure/providerRuntimeApiCatalog'
import type {
  ProviderConfig,
  ProviderRuntimeProfile,
} from '../../src/shared/infrastructure/providerConfigStore'
import type {
  ElectronSdkRuntimeRequestInput,
  ElectronSdkRuntimeRequestResult,
} from '../../src/shared/contracts/electronApi'
import type {
  SdkRuntimeCredentialProbe,
  SdkRuntimeDescribeResponse,
  SdkRuntimeProbeResponse,
  SdkRuntimeRpcMethod,
  SdkRuntimeRpcRequestMap,
} from '../../src/shared/infrastructure/sdk-runtime/sdkRuntimeProtocol'
import {
  SDK_RUNTIME_REQUIRED_RPC_METHODS,
} from '../../src/shared/infrastructure/sdk-runtime/sdkRuntimeProtocol'
import { resolveAgentRuntimeAccountConfig, type AgentRuntimeAccountConfig } from './agentRuntimeAccountResolver'
import { resolveAgentRuntimeHomeEnv } from './agentRuntimeHomeResolver'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'
import {
  codexOptionsFromAccount,
} from './sdkRuntimeConfigInjector'
import {
  notificationEventFromContext,
  publishSdkRuntimeNotification,
  requestSdkRuntimeServerRequest,
} from './sdkRuntimeHost'
import { sdkRuntimeCapabilitiesResponse } from './sdkRuntimeCapabilities'

export type AppServerRuntimeApi = 'codex-app-server' | 'mova-app-server'
export type AppServerKind = 'codex' | 'mova'

export interface AppServerRuntimeHandlerOptions {
  defaultWorkspaceDir?: () => string
  appServerCommandResolver?: (input: {
    api: AppServerRuntimeApi
    kind: AppServerKind
    provider: ProviderConfig
    runtime: ProviderRuntimeProfile
  }) => AppServerCommand | undefined
}

export interface AppServerCommand {
  command: string
  args?: string[]
  resolvedFrom?: string
}

interface AppServerConnectionContext {
  api: AppServerRuntimeApi
  kind: AppServerKind
  provider: ProviderConfig
  runtime: ProviderRuntimeProfile
  workspaceDir: string
  contract: ProviderRuntimeApiContract
  account: AgentRuntimeAccountConfig
  env: NodeJS.ProcessEnv
  config?: Record<string, unknown>
  command: AppServerCommand
}

type JsonRpcId = number | string

type JsonRpcMessage = {
  id?: JsonRpcId
  method?: string
  params?: unknown
  result?: unknown
  error?: { code?: number; message?: string; data?: unknown } | unknown
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

const appServerConnections = new Map<string, Promise<AppServerConnection>>()

export function createCodexAppServerRuntimeHandler(options: AppServerRuntimeHandlerOptions = {}) {
  return createAppServerRuntimeHandler('codex-app-server', options)
}

export function createMovaAppServerRuntimeHandler(options: AppServerRuntimeHandlerOptions = {}) {
  return createAppServerRuntimeHandler('mova-app-server', options)
}

function createAppServerRuntimeHandler(
  api: AppServerRuntimeApi,
  options: AppServerRuntimeHandlerOptions = {},
) {
  return async <M extends SdkRuntimeRpcMethod>(
    input: ElectronSdkRuntimeRequestInput<M>,
  ): Promise<ElectronSdkRuntimeRequestResult<M>> => {
    if (input.method === 'runtime/probe') {
      return probeAppServerRuntime(api, paramsFor(input, 'runtime/probe'), options) as ElectronSdkRuntimeRequestResult<M>
    }
    if (input.method === 'runtime/describe') {
      return describeAppServerRuntime(api, input.params, options) as ElectronSdkRuntimeRequestResult<M>
    }
    if (input.method === 'capabilities/get') {
      return sdkRuntimeCapabilitiesResponse(paramsFor(input, 'capabilities/get')) as ElectronSdkRuntimeRequestResult<M>
    }
    if (input.method === 'runtime/notify/threadSubscribe' || input.method === 'runtime/notify/serverRequestsSubscribe') {
      return undefined as ElectronSdkRuntimeRequestResult<M>
    }
    const context = appServerContext(api, input.params, options)
    const connection = await appServerConnection(context)
    return handleAppServerRuntimeRequest(input, connection, context) as Promise<ElectronSdkRuntimeRequestResult<M>>
  }
}

async function handleAppServerRuntimeRequest<M extends SdkRuntimeRpcMethod>(
  input: ElectronSdkRuntimeRequestInput<M>,
  connection: AppServerConnection,
  context: AppServerConnectionContext,
): Promise<unknown> {
  switch (input.method) {
    case 'permissionProfile/list':
      return connection.request('permissionProfile/list', stripRuntimeContext(input.params))
    case 'skills/list':
      return connection.request('skills/list', stripRuntimeContext(input.params))
    case 'skills/extraRoots/set':
      return connection.request('skills/extraRoots/set', stripRuntimeContext(input.params))
    case 'plugin/list':
      return connection.request('plugin/list', stripRuntimeContext(input.params))
    case 'plugin/installed':
      return connection.request('plugin/installed', stripRuntimeContext(input.params))
    case 'plugin/install':
      return connection.request('plugin/install', stripRuntimeContext(input.params))
    case 'plugin/uninstall':
      return connection.request('plugin/uninstall', stripRuntimeContext(input.params))
    case 'mcpServerStatus/list':
      return connection.request('mcpServerStatus/list', stripRuntimeContext(input.params))
    case 'mcpServer/resource/read':
      return connection.request('mcpServer/resource/read', stripRuntimeContext(input.params))
    case 'mcpServer/tool/call':
      return connection.request('mcpServer/tool/call', stripRuntimeContext(input.params))
    case 'thread/list': {
      const params = paramsFor(input, 'thread/list')
      const response = await connection.request('thread/list', compactParams({
        limit: params.limit,
        cursor: params.cursor,
      }))
      const record = isRecord(response) ? response : {}
      const data = Array.isArray(record.data) ? record.data : Array.isArray(record.threads) ? record.threads : []
      return {
        threads: data.flatMap((thread) => normalizeAppServerThread(thread, context)),
        nextCursor: stringOrNull(record.nextCursor),
      }
    }
    case 'thread/read': {
      const params = paramsFor(input, 'thread/read')
      const response = await connection.request('thread/read', {
        threadId: params.threadId,
        includeTurns: params.read?.includeTurns !== false,
      })
      return requireAppServerThread(response, context)
    }
    case 'thread/start': {
      const params = paramsFor(input, 'thread/start')
      const response = await connection.request('thread/start', appServerThreadStartParams(params, context))
      const thread = requireAppServerThread(response, context)
      if (params.title?.trim()) {
        await connection.request('thread/name/set', { threadId: thread.id, name: params.title.trim() })
        return { ...thread, name: params.title.trim() }
      }
      return thread
    }
    case 'thread/resume': {
      const params = paramsFor(input, 'thread/resume')
      const response = await connection.request('thread/resume', appServerThreadResumeParams(params, context))
      return requireAppServerThread(response, context)
    }
    case 'thread/rename': {
      const params = paramsFor(input, 'thread/rename')
      await connection.request('thread/name/set', { threadId: params.threadId, name: params.name })
      return readThreadAfterMutation(connection, params.threadId, context)
    }
    case 'thread/archive': {
      const params = paramsFor(input, 'thread/archive')
      return connection.request('thread/archive', { threadId: params.threadId })
    }
    case 'thread/unarchive': {
      const params = paramsFor(input, 'thread/unarchive')
      const response = await connection.request('thread/unarchive', { threadId: params.threadId })
      return isRecord(response) && response.thread
        ? requireAppServerThread(response, context)
        : response
    }
    case 'thread/delete': {
      const params = paramsFor(input, 'thread/delete')
      await connection.request('thread/archive', { threadId: params.threadId })
      publishSdkRuntimeNotification(notificationEventFromContext(params, {
        method: 'thread/closed',
        params: { threadId: params.threadId },
      }))
      return { ok: true }
    }
    case 'thread/settings/update': {
      const params = paramsFor(input, 'thread/settings/update')
      await connection.request('thread/settings/update', appServerThreadSettingsUpdateParams(params, context))
      return appServerExecutionSettings(params, context)
    }
    case 'thread/goal/set': {
      const params = paramsFor(input, 'thread/goal/set')
      const response = await connection.request('thread/goal/set', compactParams({
        threadId: params.threadId,
        objective: params.objective,
        status: params.status,
        tokenBudget: params.tokenBudget,
      }))
      return isRecord(response) && response.goal ? response.goal : response
    }
    case 'turn/text/start': {
      const params = paramsFor(input, 'turn/text/start')
      const response = await connection.request('turn/start', appServerTurnStartParams({
        ...params,
        inputs: [{ type: 'text', text: params.text, textElements: [] }],
      }, context))
      return requireAppServerTurn(response)
    }
    case 'turn/start': {
      const params = paramsFor(input, 'turn/start')
      const response = await connection.request('turn/start', appServerTurnStartParams(params, context))
      return requireAppServerTurn(response)
    }
    case 'turn/steer': {
      const params = paramsFor(input, 'turn/steer')
      return connection.request('turn/steer', {
        threadId: params.threadId,
        expectedTurnId: params.turnId,
        clientUserMessageId: params.clientUserMessageId,
        input: params.inputs.map(appServerUserInput),
      })
    }
    case 'turn/interrupt': {
      const params = paramsFor(input, 'turn/interrupt')
      return connection.request('turn/interrupt', {
        threadId: params.threadId,
        turnId: params.turnId,
      })
    }
    default:
      throw new Error(`app-server runtime method is not implemented yet: ${input.method}`)
  }
}

class AppServerConnection {
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

  private write(message: JsonRpcMessage): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private handleLine(line: string): void {
    const text = line.trim()
    if (!text) return
    let message: JsonRpcMessage
    try {
      message = JSON.parse(text) as JsonRpcMessage
    } catch (error) {
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

  private handleResponse(message: JsonRpcMessage): void {
    const pending = message.id === undefined ? undefined : this.pending.get(message.id)
    if (!pending || message.id === undefined) return
    this.pending.delete(message.id)
    if (message.error !== undefined) {
      pending.reject(jsonRpcError(message.error, this.context.api))
      return
    }
    pending.resolve(message.result)
  }

  private async handleServerRequest(message: JsonRpcMessage): Promise<void> {
    const request = appServerAgentRequest(message)
    if (!request) {
      this.write({ id: message.id, result: {} })
      return
    }
    try {
      const response = await requestSdkRuntimeServerRequest({
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

  private handleNotification(message: JsonRpcMessage): void {
    const notification = normalizeAppServerNotification(message, this.context)
    const threadId = threadIdFromAppServerNotification(notification)
    publishSdkRuntimeNotification(notificationEventFromContext({
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

async function appServerConnection(context: AppServerConnectionContext): Promise<AppServerConnection> {
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

function appServerContext(
  api: AppServerRuntimeApi,
  params: SdkRuntimeRpcRequestMap[SdkRuntimeRpcMethod],
  options: AppServerRuntimeHandlerOptions,
): AppServerConnectionContext {
  const contract = requiredContract(api)
  const kind = appServerKindForApi(api)
  const workspaceDir = resolveSdkRuntimeWorkspaceDir(options)
  const account = resolveSdkRuntimeAccountConfig(params, workspaceDir)
  const homeEnv = resolveAgentRuntimeHomeEnv(params, workspaceDir)
  const codexOptions = codexOptionsFromAccount(account, homeEnv, { disableBackendWebsockets: true })
  const env = appServerEnv(codexOptions, homeEnv)
  const command = resolveAppServerCommand({ api, kind, provider: params.provider, runtime: params.runtime }, options)
  return {
    api,
    kind,
    provider: params.provider,
    runtime: params.runtime,
    workspaceDir,
    contract,
    account,
    env,
    ...(appServerConfig(codexOptions) ? { config: appServerConfig(codexOptions) } : {}),
    command,
  }
}

function probeAppServerRuntime(
  api: AppServerRuntimeApi,
  params: SdkRuntimeRpcRequestMap['runtime/probe'],
  options: AppServerRuntimeHandlerOptions,
): SdkRuntimeProbeResponse {
  const contract = requiredContract(api)
  const kind = appServerKindForApi(api)
  const workspaceDir = resolveSdkRuntimeWorkspaceDir(options)
  const account = resolveSdkRuntimeAccountConfig(params, workspaceDir)
  const credentials = appServerCredentialProbe(account, api)
  let command: AppServerCommand | undefined
  let commandError: string | undefined
  try {
    command = resolveAppServerCommand({ api, kind, provider: params.provider, runtime: params.runtime }, options)
  } catch (error) {
    commandError = errorMessage(error)
  }
  const requiredRpcMethods = contract.requiredRpcMethods ?? []
  const missingRpcMethods = requiredRpcMethods.filter((method) => !SDK_RUNTIME_REQUIRED_RPC_METHODS.includes(method))
  const ok = Boolean(command) && missingRpcMethods.length === 0 && credentials.ok
  return {
    ok,
    runtime: runtimeDescription(params),
    sdk: {
      packageName: command?.resolvedFrom ?? `${kind} app-server`,
      ...(params.runtime.packageVersion ? { version: params.runtime.packageVersion } : {}),
    },
    contract: {
      api: contract.api,
      label: contract.label,
      providerKinds: contract.providerKinds,
      ...(contract.requiredRpcMethods ? { requiredRpcMethods: contract.requiredRpcMethods } : {}),
    },
    checks: {
      packageLoad: command
        ? { ok: true }
        : { ok: false, ...(commandError ? { error: commandError } : {}) },
      requiredExports: {
        ok: true,
        required: [],
        missing: [],
      },
      requiredRpcMethods: {
        ok: missingRpcMethods.length === 0,
        required: [...requiredRpcMethods],
        missing: missingRpcMethods,
      },
      credentials,
    },
    credentials,
    ...(!ok ? { error: commandError ?? credentials.detail ?? `${contract.label} probe failed.` } : {}),
  }
}

function describeAppServerRuntime(
  api: AppServerRuntimeApi,
  params: SdkRuntimeRpcRequestMap[SdkRuntimeRpcMethod],
  options: AppServerRuntimeHandlerOptions,
): SdkRuntimeDescribeResponse {
  const contract = requiredContract(api)
  const kind = appServerKindForApi(api)
  let command: AppServerCommand | undefined
  try {
    command = resolveAppServerCommand({ api, kind, provider: params.provider, runtime: params.runtime }, options)
  } catch {
    command = undefined
  }
  return {
    runtime: runtimeDescription(params),
    contract: {
      api: contract.api,
      label: contract.label,
      transport: contract.transport,
      providerKinds: contract.providerKinds,
      ...(contract.requiredRpcMethods ? { requiredRpcMethods: contract.requiredRpcMethods } : {}),
      thread: contract.thread,
      capabilities: contract.capabilities,
    },
    ...(command
      ? {
          sdk: {
            packageName: command.resolvedFrom ?? `${kind} app-server`,
            resolvedFrom: command.command,
          },
        }
      : {}),
  }
}

function resolveAppServerCommand(
  input: {
    api: AppServerRuntimeApi
    kind: AppServerKind
    provider: ProviderConfig
    runtime: ProviderRuntimeProfile
  },
  options: AppServerRuntimeHandlerOptions,
): AppServerCommand {
  const override = options.appServerCommandResolver?.(input)
  if (override) return override
  const configured = input.runtime.executableCommand?.trim()
    ?? (input.runtime.executableEnvVar ? process.env[input.runtime.executableEnvVar]?.trim() : undefined)
    ?? process.env[defaultExecutableEnvVar(input.kind)]?.trim()
  if (configured) return assertCommand(splitCommand(configured), configured)
  for (const candidate of appServerBinaryCandidates(input.kind)) {
    try {
      accessSync(candidate, constants.X_OK)
      return { command: candidate, resolvedFrom: candidate }
    } catch {
      // Keep looking; probe will report the complete failure below.
    }
  }
  throw new Error(`${input.api} app-server binary was not found. Set ${defaultExecutableEnvVar(input.kind)} or runtime.executableCommand.`)
}

function appServerBinaryCandidates(kind: AppServerKind): string[] {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  return [
    resolve(process.cwd(), 'app-server-bin', kind, 'app-server'),
    resolve(process.cwd(), '..', 'app-server-bin', kind, 'app-server'),
    resolve(process.cwd(), '..', '..', 'app-server-bin', kind, 'app-server'),
    resolve(process.cwd(), '..', '..', '..', 'app-server-bin', kind, 'app-server'),
    resolve(process.cwd(), '..', '..', '..', '..', 'app-server-bin', kind, 'app-server'),
    ...(resourcesPath ? [
      resolve(resourcesPath, 'app-server-bin', kind, 'app-server'),
      resolve(resourcesPath, 'app-server', kind, 'app-server'),
    ] : []),
  ]
}

function assertCommand(command: AppServerCommand, source: string): AppServerCommand {
  if (command.command.includes('/')) accessSync(command.command, constants.X_OK)
  return {
    ...command,
    resolvedFrom: command.resolvedFrom ?? source,
  }
}

function splitCommand(value: string): AppServerCommand {
  const parts = shellWords(value)
  if (parts.length === 0) throw new Error('app-server executable command is empty.')
  return {
    command: parts[0],
    ...(parts.length > 1 ? { args: parts.slice(1) } : {}),
    resolvedFrom: value,
  }
}

function shellWords(value: string): string[] {
  const words: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false
  for (const char of value) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      escaping = true
      continue
    }
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char
      continue
    }
    if (!quote && /\s/.test(char)) {
      if (current) {
        words.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current) words.push(current)
  return words
}

function appServerThreadStartParams(
  params: SdkRuntimeRpcRequestMap['thread/start'],
  context: AppServerConnectionContext,
): Record<string, unknown> {
  return compactParams({
    ...appServerThreadRunOptions(recordFromParams(params), context),
    sessionStartSource: 'startup',
    threadSource: 'user',
    ...(context.config ? { config: context.config } : {}),
  })
}

function appServerThreadResumeParams(
  params: SdkRuntimeRpcRequestMap['thread/resume'],
  context: AppServerConnectionContext,
): Record<string, unknown> {
  return compactParams({
    threadId: params.threadId,
    ...appServerThreadRunOptions(recordFromParams(params), context),
    ...(context.config ? { config: context.config } : {}),
  })
}

function appServerThreadSettingsUpdateParams(
  params: SdkRuntimeRpcRequestMap['thread/settings/update'],
  context: AppServerConnectionContext,
): Record<string, unknown> {
  return compactParams({
    threadId: params.threadId,
    ...appServerTurnRunOptions(recordFromParams(params), context),
  })
}

function appServerTurnStartParams(
  params: SdkRuntimeRpcRequestMap['turn/start'],
  context: AppServerConnectionContext,
): Record<string, unknown> {
  return compactParams({
    threadId: params.threadId,
    clientUserMessageId: params.clientUserMessageId,
    input: params.inputs.map(appServerUserInput),
    ...appServerTurnRunOptions(recordFromParams(params), context),
  })
}

function appServerThreadRunOptions(
  input: Record<string, unknown>,
  context: AppServerConnectionContext,
): Record<string, unknown> {
  const options = appServerNeutralRunOptions(input, context)
  return compactParams({
    cwd: options.cwd,
    model: options.model,
    modelProvider: options.modelProvider,
    approvalPolicy: options.approvalPolicy,
    approvalsReviewer: options.approvalsReviewer,
    ...(options.permissions ? { permissions: options.permissions } : { sandbox: options.sandboxMode }),
  })
}

function appServerTurnRunOptions(
  input: Record<string, unknown>,
  context: AppServerConnectionContext,
): Record<string, unknown> {
  const options = appServerNeutralRunOptions(input, context)
  return compactParams({
    cwd: options.cwd,
    model: options.model,
    modelProvider: options.modelProvider,
    approvalPolicy: options.approvalPolicy,
    approvalsReviewer: options.approvalsReviewer,
    ...(options.permissions ? { permissions: options.permissions } : { sandboxPolicy: sandboxPolicyFromMode(options.sandboxMode, options.cwd) }),
  })
}

function appServerNeutralRunOptions(
  input: Record<string, unknown>,
  context: AppServerConnectionContext,
): {
  cwd?: string
  model?: string
  modelProvider?: string
  approvalPolicy?: string
  approvalsReviewer?: string
  permissions?: string
  sandboxMode?: string
} {
  const runProfile = isRecord(input.runProfile) ? input.runProfile : undefined
  return {
    cwd: stringField(input.cwd) ?? context.workspaceDir,
    model: stringField(input.model),
    modelProvider: stringField(input.modelProvider),
    approvalPolicy: stringField(input.approvalPolicy) ?? stringField(runProfile?.approvalPolicy),
    approvalsReviewer: stringField(input.approvalsReviewer) ?? stringField(runProfile?.approvalsReviewer),
    permissions: stringField(input.permissions) ?? stringField(runProfile?.permissionProfileId),
    sandboxMode: stringField(input.sandbox) ?? stringField(input.sandboxPolicy) ?? stringField(runProfile?.fallbackSandbox),
  }
}

function appServerExecutionSettings(
  params: SdkRuntimeRpcRequestMap['thread/settings/update'],
  context: AppServerConnectionContext,
): AgentThreadExecutionSettings {
  const options = appServerNeutralRunOptions(recordFromParams(params), context)
  return compactParams({
    model: options.model,
    modelProvider: options.modelProvider,
    cwd: options.cwd,
    approvalPolicy: options.approvalPolicy,
    approvalsReviewer: options.approvalsReviewer,
    permissions: options.permissions,
    sandbox: options.sandboxMode,
    sandboxPolicy: sandboxPolicyFromMode(options.sandboxMode, options.cwd),
  }) as AgentThreadExecutionSettings
}

function sandboxPolicyFromMode(mode: string | undefined, cwd: string | undefined): unknown {
  if (mode === 'danger-full-access') return { type: 'dangerFullAccess' }
  if (mode === 'read-only') return { type: 'readOnly', networkAccess: false }
  if (mode === 'workspace-write') {
    return {
      type: 'workspaceWrite',
      writableRoots: cwd ? [cwd] : [],
      networkAccess: false,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    }
  }
  return undefined
}

function appServerUserInput(input: AgentChatInput): Record<string, unknown> {
  if (input.type === 'text') {
    return {
      type: 'text',
      text: input.text,
      text_elements: input.textElements ?? [],
    }
  }
  if (input.type === 'image') {
    return compactParams({
      type: 'image',
      url: input.url,
      detail: input.detail,
    })
  }
  if (input.type === 'localImage') {
    return compactParams({
      type: 'localImage',
      path: input.path,
      detail: input.detail,
    })
  }
  if (input.type === 'skill') return { type: 'skill', name: input.name, path: input.path }
  return { type: 'mention', name: input.name, path: input.path }
}

function normalizeAppServerNotification(
  message: JsonRpcMessage,
  context: AppServerConnectionContext,
): AgentChatNotification {
  const params = isRecord(message.params) ? { ...message.params } : message.params
  if (isRecord(params)) {
    if (isRecord(params.thread)) params.thread = normalizeAppServerThread(params.thread, context, message.params)[0] ?? params.thread
    if (isRecord(params.turn)) params.turn = normalizeAppServerTurn(params.turn)[0] ?? params.turn
    if (isRecord(params.item)) params.item = normalizeAppServerThreadItem(params.item)[0] ?? params.item
  }
  return {
    method: message.method ?? 'unknown',
    ...(params !== undefined ? { params } : {}),
    raw: message,
  }
}

function requireAppServerThread(response: unknown, context: AppServerConnectionContext): AgentChatThread {
  const thread = normalizeAppServerThread(isRecord(response) && response.thread ? response.thread : response, context, response)[0]
  if (!thread) throw new Error(`${context.api} app-server response did not include a thread.`)
  return thread
}

function requireAppServerTurn(response: unknown): AgentChatTurn {
  const turn = normalizeAppServerTurn(isRecord(response) && response.turn ? response.turn : response)[0]
  if (!turn) throw new Error('app-server response did not include a turn.')
  return turn
}

function normalizeAppServerThread(
  value: unknown,
  context: AppServerConnectionContext,
  raw?: unknown,
): AgentChatThread[] {
  if (!isRecord(value)) return []
  const id = stringField(value.id)
  if (!id) return []
  const executionSettings = appServerThreadExecutionSettings(value, raw)
  return [{
    provider: context.provider.kind,
    id,
    providerThreadId: id,
    providerSessionTreeId: stringField(value.sessionId) ?? id,
    sessionId: stringField(value.sessionId) ?? id,
    preview: stringField(value.preview) ?? '',
    name: value.name === null ? null : stringField(value.name) ?? null,
    createdAt: numberField(value.createdAt) ?? unixSecondsNow(),
    updatedAt: numberField(value.updatedAt) ?? unixSecondsNow(),
    status: appServerThreadStatus(value.status),
    cwd: stringField(value.cwd) ?? null,
    ...(Object.keys(executionSettings).length ? { executionSettings } : {}),
    turns: Array.isArray(value.turns) ? value.turns.flatMap(normalizeAppServerTurn) : [],
    raw: raw ?? value,
  }]
}

function appServerThreadExecutionSettings(
  thread: Record<string, unknown>,
  raw?: unknown,
): AgentThreadExecutionSettings {
  const response = isRecord(raw) ? raw : {}
  const activePermissionProfile = isRecord(response.activePermissionProfile)
    ? response.activePermissionProfile
    : isRecord(response.threadSettings) && isRecord(response.threadSettings.activePermissionProfile)
      ? response.threadSettings.activePermissionProfile
      : undefined
  return compactParams({
    model: stringField(response.model) ?? stringField(thread.model),
    modelProvider: stringField(response.modelProvider) ?? stringField(thread.modelProvider),
    cwd: stringField(response.cwd) ?? stringField(thread.cwd),
    approvalPolicy: typeof response.approvalPolicy === 'string' ? response.approvalPolicy : undefined,
    approvalsReviewer: stringField(response.approvalsReviewer),
    sandbox: response.sandbox,
    sandboxPolicy: response.sandboxPolicy,
    permissions: activePermissionProfile ? stringField(activePermissionProfile.id) : undefined,
  }) as AgentThreadExecutionSettings
}

function normalizeAppServerTurn(value: unknown): AgentChatTurn[] {
  if (!isRecord(value)) return []
  const id = stringField(value.id)
  if (!id) return []
  return [{
    id,
    items: Array.isArray(value.items) ? value.items.flatMap(normalizeAppServerThreadItem) : [],
    itemsView: value.itemsView === 'notLoaded' || value.itemsView === 'summary' || value.itemsView === 'full' ? value.itemsView : 'full',
    status: typeof value.status === 'string' ? value.status : 'inProgress',
    error: isRecord(value.error) ? value.error : null,
    startedAt: typeof value.startedAt === 'number' ? value.startedAt : null,
    completedAt: typeof value.completedAt === 'number' ? value.completedAt : null,
    durationMs: typeof value.durationMs === 'number' ? value.durationMs : null,
    raw: value,
  }]
}

function normalizeAppServerThreadItem(value: unknown): AgentChatThreadItem[] {
  if (!isRecord(value)) return []
  if (value.type === 'enteredReviewMode') {
    return [{
      type: 'reviewMode',
      id: stringField(value.id) ?? 'enteredReviewMode',
      action: 'entered',
      review: stringField(value.review) ?? '',
      raw: value,
    }]
  }
  if (value.type === 'exitedReviewMode') {
    return [{
      type: 'reviewMode',
      id: stringField(value.id) ?? 'exitedReviewMode',
      action: 'exited',
      review: stringField(value.review) ?? '',
      raw: value,
    }]
  }
  if (value.type === 'userMessage') {
    return [{
      ...value,
      type: 'userMessage',
      id: stringField(value.id) ?? 'userMessage',
      clientId: value.clientId === null ? null : stringField(value.clientId) ?? null,
      content: Array.isArray(value.content) ? value.content.map(normalizeAppServerInput) : [],
      raw: value,
    } as AgentChatThreadItem]
  }
  return [{ ...value, id: stringField(value.id) ?? `item_${Date.now().toString(36)}` } as AgentChatThreadItem]
}

function normalizeAppServerInput(value: unknown): AgentChatInput {
  if (!isRecord(value)) return { type: 'text', text: '', textElements: [] }
  if (value.type === 'text') {
    return {
      type: 'text',
      text: stringField(value.text) ?? '',
      textElements: Array.isArray(value.textElements)
        ? value.textElements
        : Array.isArray(value.text_elements)
          ? value.text_elements
          : [],
    }
  }
  if (value.type === 'image') {
    return compactParams({
      type: 'image',
      url: stringField(value.url) ?? '',
      detail: stringField(value.detail),
    }) as AgentChatInput
  }
  if (value.type === 'localImage') {
    return compactParams({
      type: 'localImage',
      path: stringField(value.path) ?? '',
      detail: stringField(value.detail),
    }) as AgentChatInput
  }
  if (value.type === 'skill') return { type: 'skill', name: stringField(value.name) ?? '', path: stringField(value.path) ?? '' }
  return { type: 'mention', name: stringField(value.name) ?? '', path: stringField(value.path) ?? '' }
}

function appServerAgentRequest(message: JsonRpcMessage): AgentChatServerRequest | undefined {
  if (message.id === undefined || typeof message.method !== 'string') return undefined
  const params = isRecord(message.params) ? message.params : {}
  const threadId = stringField(params.threadId)
  const turnId = stringField(params.turnId)
  const itemId = stringField(params.itemId) ?? stringField(params.callId)
  return {
    id: String(message.id),
    method: message.method,
    ...(threadId ? { threadId } : {}),
    ...(turnId ? { turnId } : {}),
    ...(itemId ? { itemId } : {}),
    params: message.params,
    raw: message,
  }
}

function appServerResponseForAgentResponse(
  request: AgentChatServerRequest,
  response: AgentChatServerRequestResponse,
): unknown {
  if (request.method === 'item/commandExecution/requestApproval') {
    return { decision: commandExecutionDecision(response) }
  }
  if (request.method === 'item/fileChange/requestApproval') {
    return { decision: fileChangeDecision(response) }
  }
  if (request.method === 'item/permissions/requestApproval') {
    return permissionsResponse(request, response)
  }
  if (request.method === 'item/tool/requestUserInput') {
    return { answers: userInputAnswers(response) }
  }
  if (request.method === 'mcpServer/elicitation/request') {
    return elicitationResponse(response)
  }
  if (request.method === 'item/tool/call') {
    return dynamicToolResponse(response)
  }
  if (request.method === 'applyPatchApproval' || request.method === 'execCommandApproval') {
    return { decision: reviewDecision(response) }
  }
  return response
}

function defaultAgentResponseForRequest(request: AgentChatServerRequest): AgentChatServerRequestResponse {
  if (request.method === 'item/tool/call') return { action: 'toolResult', success: false, contentItems: [] }
  if (request.method === 'mcpServer/elicitation/request') return { action: 'elicitation', accepted: false, content: null, meta: null }
  if (request.method === 'item/tool/requestUserInput') return { action: 'answer', answers: {}, text: 'Rejected.' }
  if (request.method === 'item/permissions/requestApproval') return { action: 'reject' }
  return { action: 'reject', reason: 'No UI subscriber handled the request.' }
}

function commandExecutionDecision(response: AgentChatServerRequestResponse): unknown {
  if (response.action === 'approve') {
    if (response.networkPolicyAmendment !== undefined) {
      return { applyNetworkPolicyAmendment: { network_policy_amendment: response.networkPolicyAmendment } }
    }
    if (response.execPolicyAmendment !== undefined) {
      return { acceptWithExecpolicyAmendment: { execpolicy_amendment: response.execPolicyAmendment } }
    }
    return response.scope === 'session' ? 'acceptForSession' : 'accept'
  }
  return response.action === 'cancel' ? 'cancel' : 'decline'
}

function fileChangeDecision(response: AgentChatServerRequestResponse): unknown {
  if (response.action === 'approve') return response.scope === 'session' ? 'acceptForSession' : 'accept'
  return response.action === 'cancel' ? 'cancel' : 'decline'
}

function reviewDecision(response: AgentChatServerRequestResponse): unknown {
  if (response.action === 'approve') {
    if (response.networkPolicyAmendment !== undefined) {
      return { network_policy_amendment: { network_policy_amendment: response.networkPolicyAmendment } }
    }
    if (response.execPolicyAmendment !== undefined) {
      return { approved_execpolicy_amendment: { proposed_execpolicy_amendment: response.execPolicyAmendment } }
    }
    return response.scope === 'session' ? 'approved_for_session' : 'approved'
  }
  return response.action === 'cancel' ? 'abort' : 'denied'
}

function permissionsResponse(
  request: AgentChatServerRequest,
  response: AgentChatServerRequestResponse,
): unknown {
  if (response.action !== 'approve') return { permissions: {}, scope: 'turn' }
  const params = isRecord(request.params) ? request.params : {}
  const permissions = isRecord(response.permissions)
    ? response.permissions
    : isRecord(params.permissions)
      ? params.permissions
      : {}
  return compactParams({
    permissions,
    scope: response.scope ?? 'turn',
    strictAutoReview: response.strictAutoReview,
  })
}

function userInputAnswers(response: AgentChatServerRequestResponse): Record<string, { answers: string[] }> {
  if (response.action !== 'answer') return {}
  const output: Record<string, { answers: string[] }> = {}
  if (response.answers) {
    for (const [key, value] of Object.entries(response.answers)) output[key] = { answers: answerStrings(value) }
  }
  if (response.choiceIds?.length) output.choiceIds = { answers: response.choiceIds }
  if (typeof response.text === 'string') output.text = { answers: [response.text] }
  return output
}

function answerStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (value === undefined || value === null) return []
  return [String(value)]
}

function elicitationResponse(response: AgentChatServerRequestResponse): unknown {
  if (response.action === 'cancel') return { action: 'cancel', content: null, _meta: null }
  if (response.action !== 'elicitation' || !response.accepted) return { action: 'decline', content: null, _meta: null }
  return {
    action: 'accept',
    content: response.content ?? null,
    _meta: response.meta ?? null,
  }
}

function dynamicToolResponse(response: AgentChatServerRequestResponse): unknown {
  if (response.action !== 'toolResult') return { success: false, contentItems: [] }
  return {
    success: response.success,
    contentItems: response.contentItems ?? [],
  }
}

async function readThreadAfterMutation(
  connection: AppServerConnection,
  threadId: string,
  context: AppServerConnectionContext,
): Promise<AgentChatThread | unknown> {
  try {
    const response = await connection.request('thread/read', { threadId, includeTurns: false })
    return requireAppServerThread(response, context)
  } catch {
    return { threadId }
  }
}

function stripRuntimeContext(value: unknown): Record<string, unknown> {
  const record = isRecord(value) ? { ...value } : {}
  delete record.provider
  delete record.runtime
  return compactParams(record)
}

function threadIdFromAppServerNotification(notification: AgentChatNotification): string | undefined {
  const params = isRecord(notification.params) ? notification.params : {}
  return stringField(params.threadId)
    ?? (isRecord(params.thread) ? stringField(params.thread.id) : undefined)
}

function appServerThreadStatus(value: unknown): AgentChatThread['status'] {
  if (value === 'notLoaded' || value === 'idle' || value === 'running' || value === 'failed' || value === 'completed' || value === 'cancelled') return value
  if (value === 'active') return 'running'
  return 'unknown'
}

function appServerEnv(codexOptions: Record<string, unknown> | undefined, fallback: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = isRecord(codexOptions?.env) ? codexOptions.env : fallback
  const output: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') output[key] = value
  }
  return output
}

function appServerConfig(codexOptions: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return isRecord(codexOptions?.config) ? codexOptions.config : undefined
}

function appServerCredentialProbe(
  account: AgentRuntimeAccountConfig,
  api: AppServerRuntimeApi,
): SdkRuntimeCredentialProbe {
  const acceptedEnv = ['OPENAI_API_KEY']
  const directEnvReady = Boolean(process.env.OPENAI_API_KEY?.trim())
  const modelEndpointBaseURL = account.modelEndpointBaseURL
  if (account.kind === 'apiKey') {
    return {
      ok: true,
      configured: true,
      env: 'OPENAI_API_KEY',
      acceptedEnv,
      source: account.accountSource,
      modelEndpointBaseURL,
      detail: `Credentials loaded from ${account.accountSource}.`,
    }
  }
  if (directEnvReady) {
    return {
      ok: true,
      configured: true,
      env: 'OPENAI_API_KEY',
      acceptedEnv,
      source: 'launch-env',
      modelEndpointBaseURL,
      detail: 'Credentials loaded from OPENAI_API_KEY.',
    }
  }
  return {
    ok: false,
    configured: false,
    env: 'OPENAI_API_KEY',
    acceptedEnv,
    source: 'none',
    modelEndpointBaseURL,
    detail: `${api === 'mova-app-server' ? 'Mova' : 'Codex'} app-server credentials are missing. Sign in to Movscript so the workspace backend has a token, or set OPENAI_API_KEY in the Movscript launch environment for direct OpenAI.`,
  }
}

function resolveSdkRuntimeAccountConfig(
  params: SdkRuntimeRpcRequestMap[SdkRuntimeRpcMethod],
  workspaceDir: string,
): AgentRuntimeAccountConfig {
  return resolveAgentRuntimeAccountConfig({
    workspaceDir,
    providerKey: params.provider.id || params.provider.kind,
    provider: params.provider as unknown as Record<string, unknown>,
    runtimeApi: params.runtime.api,
    preferBackendSession: params.provider.kind === 'codex'
      || params.provider.kind === 'mova'
      || params.runtime.api === 'codex-app-server'
      || params.runtime.api === 'mova-app-server',
    appSettingsWorkspaceDirs: [resolveDefaultSdkRuntimeWorkspaceDir()],
  })
}

function resolveSdkRuntimeWorkspaceDir(options: AppServerRuntimeHandlerOptions): string {
  return options.defaultWorkspaceDir?.() ?? resolveDefaultSdkRuntimeWorkspaceDir()
}

function resolveDefaultSdkRuntimeWorkspaceDir(): string {
  try {
    return resolveDesktopDefaultMovScriptWorkspaceDir()
  } catch {
    return process.cwd()
  }
}

function runtimeDescription(
  params: Pick<SdkRuntimeRpcRequestMap[SdkRuntimeRpcMethod], 'runtime'>,
): SdkRuntimeDescribeResponse['runtime'] {
  return {
    id: params.runtime.id,
    api: params.runtime.api,
    label: params.runtime.label,
    ...(params.runtime.packageName ? { packageName: params.runtime.packageName } : {}),
    ...(params.runtime.sdkPackageName ? { sdkPackageName: params.runtime.sdkPackageName } : {}),
    ...(params.runtime.binaryPackageName ? { binaryPackageName: params.runtime.binaryPackageName } : {}),
    ...(params.runtime.packageVersion ? { packageVersion: params.runtime.packageVersion } : {}),
    ...(params.runtime.protocolVersion ? { protocolVersion: params.runtime.protocolVersion } : {}),
  }
}

function requiredContract(api: AppServerRuntimeApi): ProviderRuntimeApiContract {
  const contract = providerRuntimeApiContract(api)
  if (!contract) throw new Error(`Missing runtime contract: ${api}`)
  return contract
}

function appServerKindForApi(api: AppServerRuntimeApi): AppServerKind {
  return api === 'mova-app-server' ? 'mova' : 'codex'
}

function defaultExecutableEnvVar(kind: AppServerKind): string {
  return kind === 'mova' ? 'MOVSCRIPT_MOVA_APP_SERVER' : 'MOVSCRIPT_CODEX_APP_SERVER'
}

function paramsFor<M extends SdkRuntimeRpcMethod>(
  input: ElectronSdkRuntimeRequestInput,
  method: M,
): SdkRuntimeRpcRequestMap[M] {
  if (input.method !== method) throw new Error(`Expected app-server runtime method ${method}, got ${input.method}`)
  return input.params as SdkRuntimeRpcRequestMap[M]
}

function jsonRpcError(error: unknown, api: string): Error {
  if (isRecord(error)) {
    const message = stringField(error.message) ?? JSON.stringify(error)
    return new Error(`${api} app-server error: ${message}`)
  }
  return new Error(`${api} app-server error: ${String(error)}`)
}

function compactParams<T extends object>(input: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) output[key] = value
  }
  return output as T
}

function recordFromParams(value: object): Record<string, unknown> {
  return value as unknown as Record<string, unknown>
}

function stringField(value: unknown): string | undefined
function stringField(record: Record<string, unknown> | undefined, field: string): string | undefined
function stringField(recordOrValue: Record<string, unknown> | unknown, field?: string): string | undefined {
  const value = field ? (recordOrValue as Record<string, unknown> | undefined)?.[field] : recordOrValue
  return typeof value === 'string' && value.trim() ? value : undefined
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function unixSecondsNow(): number {
  return Math.floor(Date.now() / 1000)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
