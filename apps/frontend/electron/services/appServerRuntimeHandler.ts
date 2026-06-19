import type {
  AgentChatThread,
} from '@movscript/core/agent/chat'
import type {
  ElectronAgentRuntimeRequestInput,
  ElectronAgentRuntimeRequestResult,
} from '../../src/shared/contracts/electronApi'
import type {
  AgentRuntimeRpcMethod,
  AgentRuntimeRpcRequestMap,
} from '../../src/shared/infrastructure/agent-runtime/agentRuntimeProtocol'
import {
  notificationEventFromContext,
  publishAgentRuntimeNotification,
} from './agentRuntimeHost'
import { agentRuntimeCapabilitiesResponse } from './agentRuntimeCapabilities'
import {
  appServerExecutionSettings,
  appServerThreadResumeParams,
  appServerThreadSettingsUpdateParams,
  appServerThreadStartParams,
  appServerTurnStartParams,
  appServerTurnSteerParams,
  type AppServerRuntimeParamsContext,
} from './appServerRuntimeParams'
import {
  normalizeAppServerThread,
  requireAppServerThread,
  requireAppServerTurn,
} from './appServerRuntimeMapper'
import {
  type AppServerRuntimeApi,
} from './appServerRuntimeCommand'
import {
  appServerConnection,
  type AppServerConnection,
} from './appServerRuntimeConnection'
import {
  appServerParamsWithWorkspaceCwd,
  ensureAppServerBundledPluginInstalled,
} from './appServerBundledPluginInstaller'
import {
  appServerContext,
  type AppServerRuntimeContext,
  type AppServerRuntimeHandlerOptions,
} from './appServerRuntimeContext'
import {
  describeAppServerRuntime,
  probeAppServerRuntime,
} from './appServerRuntimeReadiness'

export type {
  AppServerCommand,
  AppServerKind,
  AppServerRuntimeApi,
} from './appServerRuntimeCommand'
export type { AppServerRuntimeHandlerOptions } from './appServerRuntimeContext'

const APP_SERVER_TRANSIENT_HISTORY_RETRY_DELAYS_MS = [80, 160, 320]

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
  return async <M extends AgentRuntimeRpcMethod>(
    input: ElectronAgentRuntimeRequestInput<M>,
  ): Promise<ElectronAgentRuntimeRequestResult<M>> => {
    if (input.method === 'runtime/probe') {
      return probeAppServerRuntime(api, paramsFor(input, 'runtime/probe'), options) as ElectronAgentRuntimeRequestResult<M>
    }
    if (input.method === 'runtime/describe') {
      return describeAppServerRuntime(api, input.params, options) as ElectronAgentRuntimeRequestResult<M>
    }
    if (input.method === 'capabilities/get') {
      return agentRuntimeCapabilitiesResponse(paramsFor(input, 'capabilities/get')) as ElectronAgentRuntimeRequestResult<M>
    }
    if (input.method === 'runtime/notify/threadSubscribe' || input.method === 'runtime/notify/serverRequestsSubscribe') {
      return undefined as ElectronAgentRuntimeRequestResult<M>
    }
    const context = appServerContext(api, input.params, options)
    const connection = await appServerConnection(context)
    return handleAppServerRuntimeRequest(input, connection, context) as Promise<ElectronAgentRuntimeRequestResult<M>>
  }
}

async function handleAppServerRuntimeRequest<M extends AgentRuntimeRpcMethod>(
  input: ElectronAgentRuntimeRequestInput<M>,
  connection: AppServerConnection,
  context: AppServerRuntimeContext,
): Promise<unknown> {
  switch (input.method) {
    case 'permissionProfile/list':
      return connection.request('permissionProfile/list', stripRuntimeContext(input.params))
    case 'skills/list':
      await ensureAppServerBundledPluginInstalled(connection, context)
      return connection.request('skills/list', appServerParamsWithWorkspaceCwd(stripRuntimeContext(input.params), context.workspaceDir))
    case 'skills/extraRoots/set':
      return connection.request('skills/extraRoots/set', stripRuntimeContext(input.params))
    case 'plugin/list':
      await ensureAppServerBundledPluginInstalled(connection, context)
      return connection.request('plugin/list', appServerParamsWithWorkspaceCwd(stripRuntimeContext(input.params), context.workspaceDir))
    case 'plugin/installed':
      await ensureAppServerBundledPluginInstalled(connection, context)
      return connection.request('plugin/installed', appServerParamsWithWorkspaceCwd(stripRuntimeContext(input.params), context.workspaceDir))
    case 'plugin/install':
      return connection.request('plugin/install', stripRuntimeContext(input.params))
    case 'plugin/uninstall':
      return connection.request('plugin/uninstall', stripRuntimeContext(input.params))
    case 'mcpServerStatus/list':
      await ensureAppServerBundledPluginInstalled(connection, context)
      return connection.request('mcpServerStatus/list', stripRuntimeContext(input.params))
    case 'mcpServer/resource/read':
      return connection.request('mcpServer/resource/read', stripRuntimeContext(input.params))
    case 'mcpServer/tool/call':
      await ensureAppServerBundledPluginInstalled(connection, context)
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
      const response = await requestAppServerThreadRead(
        connection,
        params.threadId,
        params.read?.includeTurns !== false,
      )
      return requireAppServerThread(response, context)
    }
    case 'thread/start': {
      const params = paramsFor(input, 'thread/start')
      await ensureAppServerBundledPluginInstalled(connection, context)
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
      await ensureAppServerBundledPluginInstalled(connection, context)
      const response = await requestAppServerWithTransientHistoryRetry(
        connection,
        'thread/resume',
        appServerThreadResumeParams(params, context),
      )
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
      publishAgentRuntimeNotification(notificationEventFromContext(params, {
        method: 'thread/closed',
        params: { threadId: params.threadId },
      }))
      return { ok: true }
    }
    case 'thread/settings/update': {
      const params = paramsFor(input, 'thread/settings/update')
      await requestAppServerThreadSettingsUpdate(connection, params, context)
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
      await ensureAppServerBundledPluginInstalled(connection, context)
      const response = await requestAppServerWithTransientHistoryRetry(connection, 'turn/start', appServerTurnStartParams({
        ...params,
        inputs: [{ type: 'text', text: params.text, textElements: [] }],
      }, context))
      return requireAppServerTurn(response)
    }
    case 'turn/start': {
      const params = paramsFor(input, 'turn/start')
      await ensureAppServerBundledPluginInstalled(connection, context)
      const response = await requestAppServerWithTransientHistoryRetry(connection, 'turn/start', appServerTurnStartParams(params, context))
      return requireAppServerTurn(response)
    }
    case 'turn/steer': {
      const params = paramsFor(input, 'turn/steer')
      return connection.request('turn/steer', appServerTurnSteerParams(params))
    }
    case 'turn/interrupt': {
      const params = paramsFor(input, 'turn/interrupt')
      return connection.request('turn/interrupt', {
        threadId: params.threadId,
        turnId: params.turnId,
      })
    }
    default:
      throw new Error(`Unsupported app-server runtime method: ${input.method}`)
  }
}

export async function requestAppServerWithTransientHistoryRetry(
  connection: Pick<AppServerConnection, 'request'>,
  method: string,
  params?: unknown,
  retryDelaysMs: readonly number[] = APP_SERVER_TRANSIENT_HISTORY_RETRY_DELAYS_MS,
): Promise<unknown> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await connection.request(method, params)
    } catch (error) {
      if (!isTransientAppServerThreadHistoryError(error) || attempt >= retryDelaysMs.length) throw error
      await sleep(retryDelaysMs[attempt] ?? 0)
    }
  }
}

export async function requestAppServerThreadRead(
  connection: Pick<AppServerConnection, 'request'>,
  threadId: string,
  includeTurns: boolean,
  retryDelaysMs: readonly number[] = APP_SERVER_TRANSIENT_HISTORY_RETRY_DELAYS_MS,
): Promise<unknown> {
  const params = { threadId, includeTurns }
  if (!includeTurns) return connection.request('thread/read', params)

  try {
    return await requestAppServerWithTransientHistoryRetry(connection, 'thread/read', params, retryDelaysMs)
  } catch (error) {
    if (!isAppServerIncludeTurnsFallbackError(error)) throw error
    return connection.request('thread/read', { threadId, includeTurns: false })
  }
}

export async function requestAppServerThreadSettingsUpdate(
  connection: Pick<AppServerConnection, 'request'>,
  params: AgentRuntimeRpcRequestMap['thread/settings/update'],
  context: AppServerRuntimeParamsContext,
): Promise<unknown> {
  const settingsParams = appServerThreadSettingsUpdateParams(params, context)
  try {
    return await connection.request('thread/settings/update', settingsParams)
  } catch (error) {
    if (!isAppServerThreadUnavailableForMutationError(error)) throw error
    await requestAppServerWithTransientHistoryRetry(
      connection,
      'thread/resume',
      appServerThreadResumeParams(params, context),
    )
    return connection.request('thread/settings/update', settingsParams)
  }
}

export function isTransientAppServerThreadHistoryError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase()
  return isAppServerEmptyRolloutHistoryErrorMessage(message)
    || isAppServerUnmaterializedIncludeTurnsErrorMessage(message)
}

export function isAppServerIncludeTurnsFallbackError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase()
  return isAppServerUnmaterializedIncludeTurnsErrorMessage(message)
    || message.includes('ephemeral threads do not support includeturns')
}

export function isAppServerThreadUnavailableForMutationError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase()
  return message.includes('thread not found:')
    || message.includes('thread not loaded:')
    || message.includes('no rollout found for thread id')
}

function isAppServerEmptyRolloutHistoryErrorMessage(message: string): boolean {
  return message.includes('failed to load thread history')
    && message.includes('rollout')
    && message.includes('is empty')
}

function isAppServerUnmaterializedIncludeTurnsErrorMessage(message: string): boolean {
  return message.includes('not materialized yet')
    && message.includes('includeturns is unavailable before first user message')
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, delayMs)))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function readThreadAfterMutation(
  connection: AppServerConnection,
  threadId: string,
  context: AppServerRuntimeContext,
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

function paramsFor<M extends AgentRuntimeRpcMethod>(
  input: ElectronAgentRuntimeRequestInput,
  method: M,
): AgentRuntimeRpcRequestMap[M] {
  if (input.method !== method) throw new Error(`Expected app-server runtime method ${method}, got ${input.method}`)
  return input.params as AgentRuntimeRpcRequestMap[M]
}

function compactParams<T extends object>(input: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) output[key] = value
  }
  return output as T
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
