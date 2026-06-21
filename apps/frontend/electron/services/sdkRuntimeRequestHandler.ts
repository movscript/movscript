import type {
  AgentChatInput,
  AgentChatThread,
  AgentChatThreadItem,
  AgentChatTurn,
  AgentThreadExecutionSettings,
  AgentThreadGoalState,
} from '@movscript/core/agent/chat'
import type {
  ElectronSdkRuntimeRequestInput,
} from '../../src/shared/contracts/electronApi'
import type {
  SdkRuntimeDescribeResponse,
  SdkRuntimeRpcMethod,
  SdkRuntimeRpcRequestMap,
} from '../../src/shared/infrastructure/sdk-runtime/sdkRuntimeProtocol'
import {
  sdkRuntimeTurnItemsFromResult,
} from './sdkRuntimeMessageMapper'
import { sdkRuntimeNotificationFromTurnEvent } from './sdkRuntimeNotificationMapper'
import { sdkRuntimeCapabilitiesResponse } from './sdkRuntimeCapabilities'
import {
  callSdkRuntimeMcpTool,
  listSdkRuntimeMcpServers,
  readSdkRuntimeMcpResource,
} from './sdkRuntimeMcpBridge'
import {
  installAgentRuntimeBundledPlugin,
  listAgentRuntimeBundledPlugins,
} from './agentRuntimeBundledPluginCatalog'
import { listSdkRuntimePermissionProfiles } from './sdkRuntimePermissionProfiles'
import {
  ensureSdkRuntimeDefaultSkills,
  listSdkRuntimeSkills,
  setSdkRuntimeExtraSkillRoots,
} from './sdkRuntimeSkillService'
import { resolveDesktopWorkspaceContextPaths } from './workspaceRealm'
import type { SdkRuntimeRunPromptEventSink, SdkRuntimeTurnEvent } from './sdkRuntimeTurnEvents'
import {
  notificationEventFromContext,
  requestSdkRuntimeServerRequest,
  publishSdkRuntimeNotification,
} from './sdkRuntimeHost'
import {
  createSdkRuntimeBaseThread,
  createSdkRuntimeUserMessageItem,
  deleteSdkRuntimeThreadRecord,
  getSdkRuntimeThreadRecord,
  interruptSdkRuntimeTurn,
  isSdkRuntimeThreadDeleted,
  listSdkRuntimeThreads,
  requireSdkRuntimeThreadRecord,
  sdkRuntimeProviderThreadNeedsRefresh,
  setSdkRuntimeThreadRecord,
  type SdkRuntimeThreadRecord,
} from './sdkRuntimeThreadRepository'

export interface SdkRuntimeResolvedRuntime {
  workspaceDir: string
  describe: SdkRuntimeDescribeResponse
  startProviderThread: (threadId?: string, start?: Record<string, unknown>) => unknown
  runPrompt: (
    providerThread: unknown,
    prompt: string,
    turn?: Record<string, unknown>,
    events?: SdkRuntimeRunPromptEventSink,
  ) => Promise<unknown>
}

export async function handleSdkRuntimeRequest(
  input: ElectronSdkRuntimeRequestInput,
  runtime: SdkRuntimeResolvedRuntime,
): Promise<unknown> {
  if (input.method === 'runtime/describe') return runtime.describe
  if (input.method === 'capabilities/get') return sdkRuntimeCapabilitiesResponse(paramsFor(input, 'capabilities/get'))
  if (input.method === 'permissionProfile/list') return listSdkRuntimePermissionProfiles()
  if (input.method === 'skills/list') {
    const params = paramsFor(input, 'skills/list')
    return listSdkRuntimeSkills({
      provider: params.provider,
      runtime: params.runtime,
      workspaceDir: runtime.workspaceDir,
      cwds: params.cwds,
    })
  }
  if (input.method === 'skills/extraRoots/set') {
    const params = paramsFor(input, 'skills/extraRoots/set')
    return setSdkRuntimeExtraSkillRoots({
      provider: params.provider,
      runtime: params.runtime,
      extraRoots: params.extraRoots,
    })
  }
  if (input.method === 'plugin/list' || input.method === 'plugin/installed') return listAgentRuntimeBundledPlugins({ workspaceDir: runtime.workspaceDir })
  if (input.method === 'plugin/install') return installAgentRuntimeBundledPlugin({
    ...paramsFor(input, 'plugin/install'),
    workspaceDir: runtime.workspaceDir,
  })
  if (input.method === 'plugin/uninstall') return { ok: true, pluginId: paramsFor(input, 'plugin/uninstall').pluginId ?? null }
  if (input.method === 'mcpServerStatus/list') return listSdkRuntimeMcpServers()
  if (input.method === 'mcpServer/resource/read') return readSdkRuntimeMcpResource(paramsFor(input, 'mcpServer/resource/read'))
  if (input.method === 'mcpServer/tool/call') return callSdkRuntimeMcpTool(paramsFor(input, 'mcpServer/tool/call'))
  if (input.method === 'thread/list') return { threads: listSdkRuntimeThreads(input.params.runtime.id) }
  if (input.method === 'thread/read') {
    const params = paramsFor(input, 'thread/read')
    return readRuntimeThread(params, runtime)
  }
  if (input.method === 'thread/start') return startRuntimeThread(paramsFor(input, 'thread/start'), runtime)
  if (input.method === 'thread/resume') return resumeRuntimeThread(paramsFor(input, 'thread/resume'), runtime)
  if (input.method === 'thread/rename') return renameRuntimeThread(paramsFor(input, 'thread/rename'), runtime)
  if (input.method === 'thread/archive') return archiveRuntimeThread(paramsFor(input, 'thread/archive'), runtime, true)
  if (input.method === 'thread/unarchive') return archiveRuntimeThread(paramsFor(input, 'thread/unarchive'), runtime, false)
  if (input.method === 'thread/delete') return deleteRuntimeThread(paramsFor(input, 'thread/delete'))
  if (input.method === 'thread/settings/update') return updateRuntimeThreadSettings(paramsFor(input, 'thread/settings/update'), runtime)
  if (input.method === 'thread/goal/set') return setRuntimeThreadGoal(paramsFor(input, 'thread/goal/set'), runtime)
  if (input.method === 'turn/text/start') return startRuntimeTextTurn(paramsFor(input, 'turn/text/start'), runtime)
  if (input.method === 'turn/start') {
    const params = paramsFor(input, 'turn/start')
    return startRuntimeTextTurn({
      ...params,
      text: promptFromInputs(params.inputs),
    }, runtime)
  }
  if (input.method === 'turn/steer') {
    const params = paramsFor(input, 'turn/steer')
    return startRuntimeTextTurn({
      ...params,
      text: promptFromInputs(params.inputs),
    }, runtime)
  }
  if (input.method === 'turn/interrupt') {
    const params = paramsFor(input, 'turn/interrupt')
    return interruptSdkRuntimeTurn(params.runtime.id, params.threadId)
  }
  if (input.method === 'runtime/notify/threadSubscribe' || input.method === 'runtime/notify/serverRequestsSubscribe') return undefined
  throw new Error(`Unsupported SDK runtime method: ${input.method}`)
}

async function startRuntimeThread(
  params: SdkRuntimeRpcRequestMap['thread/start'],
  runtime: SdkRuntimeResolvedRuntime,
): Promise<AgentChatThread> {
  const options = runtimeOptions(params, runtime.workspaceDir)
  ensureSdkRuntimeDefaultSkills({
    cwd: stringField(options, 'cwd') ?? params.cwd ?? undefined,
    workspaceDir: runtime.workspaceDir,
    provider: params.provider,
    runtime: params.runtime,
  })
  const providerThread = runtime.startProviderThread(undefined, options)
  const threadId = providerThreadId(providerThread) ?? `${params.provider.kind}_${randomId()}`
  const thread = createSdkRuntimeBaseThread(params.provider.kind, params.runtime.id, threadId, params.title, stringField(options, 'cwd') ?? params.cwd)
  setSdkRuntimeThreadRecord(params.runtime.id, threadId, { thread, providerThread, providerThreadOptions: options })
  publishThreadNotification({ ...params, threadId }, 'thread/started', { thread })
  return thread
}

async function resumeRuntimeThread(
  params: SdkRuntimeRpcRequestMap['thread/resume'],
  runtime: SdkRuntimeResolvedRuntime,
): Promise<AgentChatThread> {
  if (isSdkRuntimeThreadDeleted(params.runtime.id, params.threadId)) throw new Error(`SDK runtime thread not found: ${params.threadId}`)
  const existing = getSdkRuntimeThreadRecord(params.runtime.id, params.threadId)
  if (existing) return existing.thread
  const options = runtimeOptions(params, runtime.workspaceDir)
  ensureSdkRuntimeDefaultSkills({
    cwd: stringField(options, 'cwd') ?? params.cwd ?? undefined,
    workspaceDir: runtime.workspaceDir,
    provider: params.provider,
    runtime: params.runtime,
  })
  const providerThread = runtime.startProviderThread(params.threadId, options)
  const thread = createSdkRuntimeBaseThread(params.provider.kind, params.runtime.id, params.threadId, null, stringField(options, 'cwd') ?? params.cwd)
  setSdkRuntimeThreadRecord(params.runtime.id, params.threadId, { thread, providerThread, providerThreadOptions: options })
  publishThreadNotification(params, 'thread/started', { thread })
  return thread
}

async function startRuntimeTextTurn(
  params: SdkRuntimeRpcRequestMap['turn/text/start'],
  runtime: SdkRuntimeResolvedRuntime,
): Promise<AgentChatTurn> {
  let thread = await resumeRuntimeThread(params, runtime)
  const record = getSdkRuntimeThreadRecord(params.runtime.id, params.threadId)
  if (!record) throw new Error(`SDK runtime thread is not available: ${params.threadId}`)
  const startedAtMs = Date.now()
  const startedAt = unixSecondsFromMs(startedAtMs)
  const turnId = `turn_${randomId()}`
  const pendingTurn: AgentChatTurn = {
    id: turnId,
    items: [createSdkRuntimeUserMessageItem(turnId, params.text, params.clientUserMessageId)],
    itemsView: 'full',
    status: 'inProgress',
    error: null,
    startedAt,
    completedAt: null,
    durationMs: null,
  }
  publishThreadNotification(params, 'thread/status/changed', { status: 'running' })
  publishThreadNotification(params, 'turn/started', { turn: pendingTurn })
  const options = runtimeOptions({
    ...(record.thread.executionSettings ?? {}),
    ...params,
  }, runtime.workspaceDir, record.thread.cwd)
  ensureSdkRuntimeDefaultSkills({
    cwd: stringField(options, 'cwd'),
    workspaceDir: runtime.workspaceDir,
    provider: params.provider,
    runtime: params.runtime,
  })
  if (sdkRuntimeProviderThreadNeedsRefresh(record, options)) {
    record.providerThread = runtime.startProviderThread(undefined, options)
    record.providerThreadOptions = options
  }
  if (typeof options.cwd === 'string' && record.thread.cwd !== options.cwd) {
    record.thread = { ...record.thread, cwd: options.cwd }
    thread = record.thread
  }
  let streamedAssistantDelta = false
  let result: unknown
  try {
    result = await runtime.runPrompt(record.providerThread, params.text, options, {
      turnId,
      emit: (event) => {
        if (event.type === 'agent.delta') streamedAssistantDelta = true
        publishRuntimeTurnEvent(params, event)
      },
      requestServer: (request) => requestSdkRuntimeServerRequest(params, request),
    })
  } catch (error) {
    const failedAtMs = Date.now()
    const failedAt = unixSecondsFromMs(failedAtMs)
    const failedTurn: AgentChatTurn = {
      ...pendingTurn,
      status: 'failed',
      error: { message: errorMessage(error) },
      completedAt: failedAt,
      durationMs: failedAtMs - startedAtMs,
      raw: error,
    }
    thread = {
      ...thread,
      turns: [...thread.turns, failedTurn],
      status: 'failed',
      updatedAt: failedAt,
    }
    record.thread = thread
    publishRuntimeTurnEvent(params, {
      type: 'turn.failed',
      turnId,
      error: { message: errorMessage(error) },
      raw: error,
    })
    publishThreadNotification(params, 'thread/status/changed', { status: 'failed' })
    throw error
  }
  const providerResumeToken = sdkRuntimeProviderResumeTokenFromResult(result)
  const completedAtMs = Date.now()
  const completedAt = unixSecondsFromMs(completedAtMs)
  const resultItems = sdkRuntimeTurnItemsFromResult({ turnId, result })
  const turn: AgentChatTurn = {
    id: turnId,
    items: [
      createSdkRuntimeUserMessageItem(turnId, params.text, params.clientUserMessageId),
      ...resultItems,
    ],
    itemsView: 'full',
    status: 'completed',
    error: null,
    startedAt,
    completedAt,
    durationMs: completedAtMs - startedAtMs,
    raw: result,
  }
  if (providerResumeToken) syncProviderThreadResumeToken(record.providerThread, providerResumeToken)
  const assistantItem = turn.items.find((item): item is Extract<AgentChatThreadItem, { type: 'agentMessage' }> => item.type === 'agentMessage')
  if (!streamedAssistantDelta && assistantItem?.text) {
    publishThreadNotification(params, 'item/agentMessage/delta', {
      turnId,
      itemId: assistantItem.id,
      delta: assistantItem.text,
      phase: null,
    })
  }
  thread = {
    ...thread,
    turns: [...thread.turns, turn],
    status: 'idle',
    updatedAt: completedAt,
    preview: params.text,
  }
  record.thread = thread
  publishThreadNotification(params, 'turn/completed', { turn })
  publishThreadNotification(params, 'thread/status/changed', { status: 'idle' })
  return turn
}

async function renameRuntimeThread(
  params: SdkRuntimeRpcRequestMap['thread/rename'],
  runtime: SdkRuntimeResolvedRuntime,
): Promise<AgentChatThread> {
  const record = await ensureRuntimeThreadRecord(params, runtime)
  const updated = {
    ...record.thread,
    name: params.name,
    updatedAt: unixSecondsNow(),
  }
  record.thread = updated
  publishThreadNotification(params, 'thread/name/updated', { threadName: params.name })
  return updated
}

async function archiveRuntimeThread(
  params: SdkRuntimeRpcRequestMap['thread/archive'] | SdkRuntimeRpcRequestMap['thread/unarchive'],
  runtime: SdkRuntimeResolvedRuntime,
  archived: boolean,
): Promise<AgentChatThread> {
  const record = await ensureRuntimeThreadRecord(params, runtime)
  const updated = {
    ...record.thread,
    updatedAt: unixSecondsNow(),
    raw: {
      ...(isRecord(record.thread.raw) ? record.thread.raw : {}),
      archived,
    },
  }
  record.thread = updated
  publishThreadNotification(params, archived ? 'thread/archived' : 'thread/unarchived', { threadId: params.threadId })
  return updated
}

function deleteRuntimeThread(params: SdkRuntimeRpcRequestMap['thread/delete']): { ok: true } {
  deleteSdkRuntimeThreadRecord(params.runtime.id, params.threadId)
  publishThreadNotification(params, 'thread/closed', { threadId: params.threadId })
  return { ok: true }
}

async function updateRuntimeThreadSettings(
  params: SdkRuntimeRpcRequestMap['thread/settings/update'],
  runtime: SdkRuntimeResolvedRuntime,
): Promise<AgentThreadExecutionSettings> {
  const record = await ensureRuntimeThreadRecord(params, runtime)
  const executionSettings: AgentThreadExecutionSettings = {
    ...(record.thread.executionSettings ?? {}),
    ...(typeof params.cwd === 'string' || params.cwd === null ? { cwd: params.cwd } : {}),
    ...(typeof params.model === 'string' ? { model: params.model } : {}),
    ...(typeof params.modelProvider === 'string' ? { modelProvider: params.modelProvider } : {}),
    ...(typeof params.runProfile?.approvalPolicy === 'string' ? { approvalPolicy: params.runProfile.approvalPolicy } : {}),
    ...(typeof params.runProfile?.approvalsReviewer === 'string' ? { approvalsReviewer: params.runProfile.approvalsReviewer } : {}),
    ...(typeof params.runProfile?.permissionProfileId === 'string' ? { permissions: params.runProfile.permissionProfileId } : {}),
    ...(params.runProfile?.fallbackSandbox !== undefined ? { sandbox: params.runProfile.fallbackSandbox } : {}),
  }
  record.thread = {
    ...record.thread,
    ...(executionSettings.cwd !== undefined ? { cwd: executionSettings.cwd } : {}),
    executionSettings,
    updatedAt: unixSecondsNow(),
  }
  publishThreadNotification(params, 'thread/settings/updated', { threadSettings: executionSettings })
  return executionSettings
}

async function setRuntimeThreadGoal(
  params: SdkRuntimeRpcRequestMap['thread/goal/set'],
  runtime: SdkRuntimeResolvedRuntime,
): Promise<AgentThreadGoalState> {
  const record = await ensureRuntimeThreadRecord(params, runtime)
  const now = unixSecondsNow()
  const previous = record.thread.goal ?? undefined
  const goal: AgentThreadGoalState = {
    objective: params.objective ?? previous?.objective ?? '',
    status: params.status ?? previous?.status ?? 'active',
    ...(params.tokenBudget !== undefined ? { tokenBudget: params.tokenBudget } : previous?.tokenBudget !== undefined ? { tokenBudget: previous.tokenBudget } : {}),
    ...(previous?.tokensUsed !== undefined ? { tokensUsed: previous.tokensUsed } : {}),
    ...(previous?.timeUsedSeconds !== undefined ? { timeUsedSeconds: previous.timeUsedSeconds } : {}),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  }
  record.thread = {
    ...record.thread,
    goal,
    updatedAt: now,
  }
  publishThreadNotification(params, 'thread/goal/updated', { goal })
  return goal
}

async function readRuntimeThread(
  params: SdkRuntimeRpcRequestMap['thread/read'],
  runtime: SdkRuntimeResolvedRuntime,
): Promise<AgentChatThread> {
  return (await ensureRuntimeThreadRecord(params, runtime)).thread
}

async function ensureRuntimeThreadRecord(
  params: SdkRuntimeRpcRequestMap['thread/resume'],
  runtime: SdkRuntimeResolvedRuntime,
): Promise<SdkRuntimeThreadRecord> {
  const existing = getSdkRuntimeThreadRecord(params.runtime.id, params.threadId)
  if (existing) return existing
  await resumeRuntimeThread(params, runtime)
  return requireSdkRuntimeThreadRecord(params.runtime.id, params.threadId)
}

function promptFromInputs(inputs: AgentChatInput[]): string {
  return inputs.map((input) => input.type === 'text' ? input.text : `[${input.type}] ${'name' in input ? input.name : ''}`.trim()).join('\n').trim()
}

function providerThreadId(providerThread: unknown): string | undefined {
  if (!isRecord(providerThread)) return undefined
  return stringField(providerThread, 'id') ?? stringField(providerThread, 'threadId')
}

export function syncProviderThreadResumeToken(providerThread: unknown, resumeToken: string): void {
  if (!isRecord(providerThread)) return
  providerThread.resumeToken = resumeToken
}

export function sdkRuntimeProviderResumeTokenFromResult(result: unknown): string | undefined {
  const messages = Array.isArray(result) ? result : [result]
  for (const message of messages) {
    const resumeToken = providerResumeTokenFromSdkMessage(message)
    if (resumeToken) return resumeToken
  }
  return undefined
}

function providerResumeTokenFromSdkMessage(message: unknown, depth = 0): string | undefined {
  if (!isRecord(message) || depth > 2) return undefined
  const direct = stringField(message, 'session_id')
    ?? stringField(message, 'resumeToken')
    ?? stringField(message, 'resume_token')
    ?? stringField(message, 'claudeSessionId')
  if (direct) return direct
  for (const field of ['message', 'data', 'event', 'result']) {
    const nested = providerResumeTokenFromSdkMessage(message[field], depth + 1)
    if (nested) return nested
  }
  return undefined
}

function runtimeOptions(params: object, workspaceDir: string, fallbackCwd?: string | null): Record<string, unknown> {
  const record = params as Record<string, unknown>
  const cwd = resolveSdkRuntimeCwd(record, workspaceDir, fallbackCwd)
  const runProfile = isRecord(record.runProfile) ? record.runProfile : undefined
  return {
    ...(cwd ? { cwd } : {}),
    ...(typeof record.model === 'string' ? { model: record.model } : {}),
    ...(typeof record.threadId === 'string' ? { threadId: record.threadId } : {}),
    ...(typeof record.approvalPolicy === 'string' ? { approvalPolicy: record.approvalPolicy } : {}),
    ...(typeof record.approvalsReviewer === 'string' ? { approvalsReviewer: record.approvalsReviewer } : {}),
    ...(typeof record.permissions === 'string' ? { permissions: record.permissions } : {}),
    ...(Object.prototype.hasOwnProperty.call(record, 'sandbox') ? { sandbox: record.sandbox } : {}),
    ...(typeof runProfile?.approvalPolicy === 'string' ? { approvalPolicy: runProfile.approvalPolicy } : {}),
    ...(typeof runProfile?.approvalsReviewer === 'string' ? { approvalsReviewer: runProfile.approvalsReviewer } : {}),
    ...(typeof runProfile?.permissionProfileId === 'string' ? { permissions: runProfile.permissionProfileId } : {}),
    ...(Object.prototype.hasOwnProperty.call(runProfile ?? {}, 'fallbackSandbox') ? { sandbox: runProfile?.fallbackSandbox } : {}),
  }
}

function resolveSdkRuntimeCwd(record: Record<string, unknown>, workspaceDir: string, fallbackCwd?: string | null): string | undefined {
  if (typeof record.cwd === 'string' && record.cwd.trim()) return record.cwd
  if (record.cwd === null) return undefined
  if (typeof fallbackCwd === 'string' && fallbackCwd.trim()) return fallbackCwd
  const workspaceContext = isRecord(record.workspaceContext) ? record.workspaceContext : undefined
  if (!workspaceContext) return undefined
  return resolveDesktopWorkspaceContextPaths({
    workspaceDir,
    workspaceContext,
  }).providerSessionCwd
}

function paramsFor<M extends SdkRuntimeRpcMethod>(
  input: ElectronSdkRuntimeRequestInput,
  method: M,
): SdkRuntimeRpcRequestMap[M] {
  if (input.method !== method) throw new Error(`Expected SDK runtime method ${method}, got ${input.method}`)
  return input.params as SdkRuntimeRpcRequestMap[M]
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function unixSecondsNow(): number {
  return unixSecondsFromMs(Date.now())
}

function unixSecondsFromMs(value: number): number {
  return Math.floor(value / 1000)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function publishRuntimeTurnEvent(
  context: (SdkRuntimeRpcRequestMap[SdkRuntimeRpcMethod] & { threadId?: string }),
  event: SdkRuntimeTurnEvent,
): void {
  const notification = sdkRuntimeNotificationFromTurnEvent(event)
  const params = isRecord(notification.params) ? notification.params : {}
  publishSdkRuntimeNotification(notificationEventFromContext(context, {
    ...notification,
    params: {
      ...params,
      ...(context.threadId ? { threadId: context.threadId } : {}),
      runtimeId: context.runtime.id,
    },
  }))
}

function publishThreadNotification(
  context: (SdkRuntimeRpcRequestMap[SdkRuntimeRpcMethod] & { threadId?: string }),
  method: string,
  params: Record<string, unknown>,
): void {
  publishSdkRuntimeNotification(notificationEventFromContext(context, {
    method,
    params: {
      ...params,
      ...(context.threadId ? { threadId: context.threadId } : {}),
      runtimeId: context.runtime.id,
    },
  }))
}
