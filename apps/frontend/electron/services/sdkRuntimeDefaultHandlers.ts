import { isAbsolute, join } from 'node:path'
import type {
  AgentChatInput,
  AgentChatThread,
  AgentChatThreadItem,
  AgentChatTurn,
  AgentThreadExecutionSettings,
  AgentThreadGoalState,
} from '@movscript/core/agent/chat'
import {
  ensureMovScriptWorkspaceContext,
  resolveMovScriptWorkspaceContextPaths,
  type MovScriptWorkspaceContextInput,
} from '@movscript/core/workspace/node'
import {
  providerRuntimeApiContract,
  type ProviderRuntimeApiContract,
} from '../../src/shared/infrastructure/providerRuntimeApiCatalog'
import type {
  ElectronSdkRuntimeRequestInput,
  ElectronSdkRuntimeRequestResult,
} from '../../src/shared/contracts/electronApi'
import type {
  SdkRuntimeDescribeResponse,
  SdkRuntimeProbeResponse,
  SdkRuntimeRpcMethod,
  SdkRuntimeRpcRequestMap,
} from '../../src/shared/infrastructure/sdk-runtime/sdkRuntimeProtocol'
import {
  SDK_RUNTIME_REQUIRED_RPC_METHODS,
} from '../../src/shared/infrastructure/sdk-runtime/sdkRuntimeProtocol'
import {
  assertSdkRuntimePackageContract,
  loadSdkRuntimePackage,
  probeSdkRuntimePackageContract,
  requiredExport,
  type SdkRuntimeModuleLoader,
} from './sdkRuntimePackageLoader'
import {
  createInstallingSdkRuntimePackageStoreLoader,
  installedSdkRuntimePackageVersion,
} from './sdkRuntimePackageStore'
import {
  sdkRuntimeTurnItemsFromResult,
} from './sdkRuntimeMessageMapper'
import {
  notificationEventFromContext,
  publishSdkRuntimeNotification,
  registerSdkRuntimeHandler,
} from './sdkRuntimeHost'
import {
  resolveAgentRuntimeAccountConfig,
  type AgentRuntimeAccountConfig,
} from './appServerConfigDistribution'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'

type CodexConstructor = new (...args: unknown[]) => CodexClient
type CodexClient = {
  startThread(input?: Record<string, unknown>): CodexThread
  resumeThread(threadId: string, input?: Record<string, unknown>): CodexThread
}
type CodexThread = {
  id?: string
  threadId?: string
  run(prompt: string, options?: Record<string, unknown>): Promise<unknown>
}

type ClaudeQuery = (input: { prompt: string; options?: Record<string, unknown> }) => AsyncIterable<unknown>

interface SdkRuntimeDefaultHandlerOptions {
  moduleLoader?: SdkRuntimeModuleLoader
  defaultWorkspaceDir?: () => string
}

interface RuntimeThreadRecord {
  thread: AgentChatThread
  providerThread?: unknown
  activeQuery?: { interrupt?: () => void; abort?: () => void; close?: () => void }
}

const runtimeThreads = new Map<string, RuntimeThreadRecord>()
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'

export function installDefaultSdkRuntimeHandlers(options: SdkRuntimeDefaultHandlerOptions = {}): () => void {
  const disposers = [
    registerSdkRuntimeHandler('codex-sdk', createCodexSdkRuntimeHandler(options), {
      supportedMethods: SDK_RUNTIME_REQUIRED_RPC_METHODS,
    }),
    registerSdkRuntimeHandler('claude-sdk', createClaudeSdkRuntimeHandler(options), {
      supportedMethods: SDK_RUNTIME_REQUIRED_RPC_METHODS,
    }),
  ]
  return () => {
    for (const dispose of disposers) dispose()
  }
}

export function createCodexSdkRuntimeHandler(options: SdkRuntimeDefaultHandlerOptions = {}) {
  return async <M extends SdkRuntimeRpcMethod>(
    input: ElectronSdkRuntimeRequestInput<M>,
  ): Promise<ElectronSdkRuntimeRequestResult<M>> => {
    if (input.method === 'runtime/probe') {
      const params = paramsFor(input, 'runtime/probe')
      const contract = requiredContract('codex-sdk')
      const packageName = params.runtime.sdkPackageName ?? contract.sdkPackageName ?? 'missing-codex-sdk-package'
      return probeRuntimePackage(params, contract, packageName, options) as ElectronSdkRuntimeRequestResult<M>
    }
    const runtime = await codexRuntime(input.params, options)
    return handleRuntimeRequest(input, runtime) as Promise<ElectronSdkRuntimeRequestResult<M>>
  }
}

export function createClaudeSdkRuntimeHandler(options: SdkRuntimeDefaultHandlerOptions = {}) {
  return async <M extends SdkRuntimeRpcMethod>(
    input: ElectronSdkRuntimeRequestInput<M>,
  ): Promise<ElectronSdkRuntimeRequestResult<M>> => {
    if (input.method === 'runtime/probe') {
      const params = paramsFor(input, 'runtime/probe')
      const contract = requiredContract('claude-sdk')
      const packageName = params.runtime.packageName ?? contract.packageName ?? 'missing-claude-sdk-package'
      return probeRuntimePackage(params, contract, packageName, options) as ElectronSdkRuntimeRequestResult<M>
    }
    const runtime = await claudeRuntime(input.params, options)
    return handleRuntimeRequest(input, runtime) as Promise<ElectronSdkRuntimeRequestResult<M>>
  }
}

async function codexRuntime(params: SdkRuntimeRpcRequestMap[SdkRuntimeRpcMethod], options: SdkRuntimeDefaultHandlerOptions) {
  const contract = requiredContract('codex-sdk')
  const packageName = params.runtime.sdkPackageName ?? contract.sdkPackageName ?? 'missing-codex-sdk-package'
  const workspaceDir = resolveSdkRuntimeWorkspaceDir(options)
  const loaded = await loadSdkRuntimePackage(packageName, options.moduleLoader ?? runtimeStoreLoader(packageName, params.runtime.packageVersion))
  if (!loaded.ok) throw new Error(loaded.error)
  assertSdkRuntimePackageContract(packageName, loaded.module, contract.requiredPackageExports)
  const Codex = requiredExport<CodexConstructor>(loaded.module, 'Codex', packageName)
  const account = resolveSdkRuntimeAccountConfig(params, workspaceDir)
  const codex = new Codex(codexOptionsFromAccount(account, sdkRuntimeHomeEnv(params, workspaceDir)))
  return {
    workspaceDir,
    describe: describeRuntime(params, contract, packageName, sdkRuntimePackageVersion(packageName, params.runtime.packageVersion)),
    startProviderThread: (threadId?: string, start?: Record<string, unknown>) => {
      const options = codexRuntimeOptions(start)
      return threadId ? codex.resumeThread(threadId, options) : codex.startThread(options)
    },
    runPrompt: async (providerThread: unknown, prompt: string, turn?: Record<string, unknown>) => {
      if (!providerThread || typeof providerThread !== 'object' || typeof (providerThread as CodexThread).run !== 'function') {
        throw new Error(`${packageName} returned a thread without run().`)
      }
      return (providerThread as CodexThread).run(prompt, codexRuntimeOptions(turn))
    },
  }
}

async function probeRuntimePackage(
  params: SdkRuntimeRpcRequestMap['runtime/probe'],
  contract: ProviderRuntimeApiContract,
  packageName: string,
  options: SdkRuntimeDefaultHandlerOptions,
): Promise<SdkRuntimeProbeResponse> {
  const loaded = await loadSdkRuntimePackage(packageName, options.moduleLoader ?? runtimeStoreLoader(packageName, params.runtime.packageVersion))
  const requiredRpcMethods = contract.requiredRpcMethods ?? []
  const missingRpcMethods = requiredRpcMethods.filter((method) => !SDK_RUNTIME_REQUIRED_RPC_METHODS.includes(method))
  const base = {
    runtime: runtimeDescription(params),
    sdk: {
      packageName,
      ...(sdkRuntimePackageVersion(packageName, params.runtime.packageVersion) ? { version: sdkRuntimePackageVersion(packageName, params.runtime.packageVersion) } : {}),
    },
    contract: {
      api: contract.api,
      label: contract.label,
      providerKinds: contract.providerKinds,
      ...(contract.requiredPackageExports ? { requiredPackageExports: contract.requiredPackageExports } : {}),
      ...(contract.requiredRpcMethods ? { requiredRpcMethods: contract.requiredRpcMethods } : {}),
    },
  }
  if (!loaded.ok) {
    return {
      ok: false,
      ...base,
      checks: {
        packageLoad: { ok: false, ...(loaded.error ? { error: loaded.error } : {}) },
        requiredExports: {
          ok: false,
          required: [...(contract.requiredPackageExports ?? [])],
          missing: [...(contract.requiredPackageExports ?? [])],
          ...(loaded.error ? { error: loaded.error } : {}),
        },
        requiredRpcMethods: {
          ok: missingRpcMethods.length === 0,
          required: [...requiredRpcMethods],
          missing: missingRpcMethods,
        },
      },
      ...(loaded.error ? { error: loaded.error } : {}),
    }
  }
  const exportProbe = probeSdkRuntimePackageContract(packageName, loaded.module, contract.requiredPackageExports)
  const ok = exportProbe.ok && missingRpcMethods.length === 0
  return {
    ok,
    ...base,
    checks: {
      packageLoad: { ok: true },
      requiredExports: {
        ok: exportProbe.ok,
        required: exportProbe.requiredExports,
        missing: exportProbe.missingExports,
        ...(exportProbe.error ? { error: exportProbe.error } : {}),
      },
      requiredRpcMethods: {
        ok: missingRpcMethods.length === 0,
        required: [...requiredRpcMethods],
        missing: missingRpcMethods,
      },
    },
    ...(!ok ? { error: exportProbe.error ?? `SDK runtime ${contract.api} is missing required RPC methods: ${missingRpcMethods.join(', ')}` } : {}),
  }
}

async function claudeRuntime(params: SdkRuntimeRpcRequestMap[SdkRuntimeRpcMethod], options: SdkRuntimeDefaultHandlerOptions) {
  const contract = requiredContract('claude-sdk')
  const packageName = params.runtime.packageName ?? contract.packageName ?? 'missing-claude-sdk-package'
  const workspaceDir = resolveSdkRuntimeWorkspaceDir(options)
  const loaded = await loadSdkRuntimePackage(packageName, options.moduleLoader ?? runtimeStoreLoader(packageName, params.runtime.packageVersion))
  if (!loaded.ok) throw new Error(loaded.error)
  assertSdkRuntimePackageContract(packageName, loaded.module, contract.requiredPackageExports)
  const query = requiredExport<ClaudeQuery>(loaded.module, 'query', packageName)
  const account = resolveSdkRuntimeAccountConfig(params, workspaceDir)
  const accountOptions = claudeOptionsFromAccount(account, sdkRuntimeHomeEnv(params, workspaceDir))
  return {
    workspaceDir,
    describe: describeRuntime(params, contract, packageName, sdkRuntimePackageVersion(packageName, params.runtime.packageVersion)),
    startProviderThread: (threadId?: string) => ({ id: threadId ?? `claude_${randomId()}` }),
    runPrompt: async (_providerThread: unknown, prompt: string, turn?: Record<string, unknown>) => {
      const messages: unknown[] = []
      const stream = query({
        prompt,
        options: {
          ...accountOptions,
          ...(turn?.cwd ? { cwd: turn.cwd } : {}),
          ...(turn?.model ? { model: turn.model } : {}),
          ...(turn?.threadId ? { resume: turn.threadId } : {}),
        },
      })
      for await (const message of stream) messages.push(message)
      return messages
    },
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
  })
}

function resolveSdkRuntimeWorkspaceDir(options: SdkRuntimeDefaultHandlerOptions): string {
  return options.defaultWorkspaceDir?.() ?? resolveDefaultSdkRuntimeWorkspaceDir()
}

function resolveDefaultSdkRuntimeWorkspaceDir(): string {
  try {
    return resolveDesktopDefaultMovScriptWorkspaceDir()
  } catch {
    return process.cwd()
  }
}

function sdkRuntimeHomeEnv(
  params: SdkRuntimeRpcRequestMap[SdkRuntimeRpcMethod],
  workspaceDir: string,
): NodeJS.ProcessEnv {
  if (params.provider.kind === 'claude' || params.runtime.api === 'claude-sdk') {
    return { CLAUDE_CONFIG_DIR: join(workspaceDir, '.claude') }
  }
  if (params.provider.kind === 'codex' || params.runtime.api === 'codex-sdk') {
    const home = providerHomeDir(params.provider.appServerProfile?.home, workspaceDir, '.codex')
    const envNames = new Set(['CODEX_HOME', ...(params.provider.appServerProfile?.compatibilityHomeEnvNames ?? [])])
    return Object.fromEntries(Array.from(envNames).map((name) => [name, home]))
  }
  return {}
}

function providerHomeDir(home: string | undefined, workspaceDir: string, fallback: string): string {
  const value = home?.trim() || fallback
  return isAbsolute(value) ? value : join(workspaceDir, value)
}

function codexOptionsFromAccount(account: AgentRuntimeAccountConfig, envOverrides: NodeJS.ProcessEnv): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = {
    baseUrl: account.baseURL,
    ...(account.kind === 'apiKey' ? { apiKey: account.apiKey } : {}),
    env: {
      ...process.env,
      ...envOverrides,
    },
  }
  return Object.keys(next).length ? next : undefined
}

function claudeOptionsFromAccount(account: AgentRuntimeAccountConfig, envOverrides: NodeJS.ProcessEnv): Record<string, unknown> {
  const shouldSetBaseURL = account.backendProviderSelected || account.baseURL !== DEFAULT_OPENAI_BASE_URL
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...envOverrides,
    ...(account.kind === 'apiKey' ? { ANTHROPIC_API_KEY: account.apiKey } : {}),
    ...(shouldSetBaseURL
      ? {
          ANTHROPIC_BASE_URL: account.baseURL,
          ANTHROPIC_API_BASE_URL: account.baseURL,
        }
      : {}),
  }
  return { env }
}

async function handleRuntimeRequest(
  input: ElectronSdkRuntimeRequestInput,
  runtime: Awaited<ReturnType<typeof codexRuntime>> | Awaited<ReturnType<typeof claudeRuntime>>,
): Promise<unknown> {
  if (input.method === 'runtime/describe') return runtime.describe
  if (input.method === 'thread/list') return { threads: threadsForRuntime(input.params.runtime.id) }
  if (input.method === 'thread/read') {
    const params = paramsFor(input, 'thread/read')
    return readRuntimeThread(params.runtime.id, params.threadId)
  }
  if (input.method === 'thread/start') return startRuntimeThread(paramsFor(input, 'thread/start'), runtime)
  if (input.method === 'thread/resume') return resumeRuntimeThread(paramsFor(input, 'thread/resume'), runtime)
  if (input.method === 'thread/rename') return renameRuntimeThread(paramsFor(input, 'thread/rename'))
  if (input.method === 'thread/archive') return archiveRuntimeThread(paramsFor(input, 'thread/archive'), true)
  if (input.method === 'thread/unarchive') return archiveRuntimeThread(paramsFor(input, 'thread/unarchive'), false)
  if (input.method === 'thread/delete') return deleteRuntimeThread(paramsFor(input, 'thread/delete'))
  if (input.method === 'thread/settings/update') return updateRuntimeThreadSettings(paramsFor(input, 'thread/settings/update'))
  if (input.method === 'thread/goal/set') return setRuntimeThreadGoal(paramsFor(input, 'thread/goal/set'))
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
    return interruptRuntimeTurn(params.runtime.id, params.threadId)
  }
  if (input.method === 'runtime/notify/threadSubscribe' || input.method === 'runtime/notify/serverRequestsSubscribe') return undefined
  throw new Error(`SDK runtime method is not implemented yet: ${input.method}`)
}

async function startRuntimeThread(
  params: SdkRuntimeRpcRequestMap['thread/start'],
  runtime: Awaited<ReturnType<typeof codexRuntime>> | Awaited<ReturnType<typeof claudeRuntime>>,
): Promise<AgentChatThread> {
  const options = runtimeOptions(params, runtime.workspaceDir)
  const providerThread = runtime.startProviderThread(undefined, options)
  const threadId = providerThreadId(providerThread) ?? `${params.provider.kind}_${randomId()}`
  const thread = baseThread(params.provider.kind, params.runtime.id, threadId, params.title, stringField(options, 'cwd') ?? params.cwd)
  runtimeThreads.set(runtimeThreadKey(params.runtime.id, threadId), { thread, providerThread })
  publishThreadNotification({ ...params, threadId }, 'thread/started', { thread })
  return thread
}

async function resumeRuntimeThread(
  params: SdkRuntimeRpcRequestMap['thread/resume'],
  runtime: Awaited<ReturnType<typeof codexRuntime>> | Awaited<ReturnType<typeof claudeRuntime>>,
): Promise<AgentChatThread> {
  const key = runtimeThreadKey(params.runtime.id, params.threadId)
  const existing = runtimeThreads.get(key)
  if (existing) return existing.thread
  const options = runtimeOptions(params, runtime.workspaceDir)
  const providerThread = runtime.startProviderThread(params.threadId, options)
  const thread = baseThread(params.provider.kind, params.runtime.id, params.threadId, null, stringField(options, 'cwd') ?? params.cwd)
  runtimeThreads.set(key, { thread, providerThread })
  publishThreadNotification(params, 'thread/started', { thread })
  return thread
}

async function startRuntimeTextTurn(
  params: SdkRuntimeRpcRequestMap['turn/text/start'],
  runtime: Awaited<ReturnType<typeof codexRuntime>> | Awaited<ReturnType<typeof claudeRuntime>>,
): Promise<AgentChatTurn> {
  const thread = await resumeRuntimeThread(params, runtime)
  const record = runtimeThreads.get(runtimeThreadKey(params.runtime.id, params.threadId))
  if (!record) throw new Error(`SDK runtime thread is not available: ${params.threadId}`)
  const startedAt = Date.now()
  const turnId = `turn_${randomId()}`
  const pendingTurn: AgentChatTurn = {
    id: turnId,
    items: [userMessageItem(turnId, params.text, params.clientUserMessageId)],
    itemsView: 'full',
    status: 'inProgress',
    error: null,
    startedAt,
    completedAt: null,
    durationMs: null,
  }
  publishThreadNotification(params, 'thread/status/changed', { status: 'running' })
  publishThreadNotification(params, 'turn/started', { turn: pendingTurn })
  const options = runtimeOptions(params, runtime.workspaceDir, record.thread.cwd)
  if (typeof options.cwd === 'string' && record.thread.cwd !== options.cwd) {
    record.thread = { ...record.thread, cwd: options.cwd }
  }
  const result = await runtime.runPrompt(record.providerThread, params.text, options)
  const completedAt = Date.now()
  const resultItems = sdkRuntimeTurnItemsFromResult({ turnId, result })
  const turn: AgentChatTurn = {
    id: turnId,
    items: [
      userMessageItem(turnId, params.text, params.clientUserMessageId),
      ...resultItems,
    ],
    itemsView: 'full',
    status: 'completed',
    error: null,
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
    raw: result,
  }
  const assistantItem = turn.items.find((item): item is Extract<AgentChatThreadItem, { type: 'agentMessage' }> => item.type === 'agentMessage')
  if (assistantItem?.text) {
    publishThreadNotification(params, 'item/agentMessage/delta', {
      turnId,
      itemId: assistantItem.id,
      delta: assistantItem.text,
      phase: null,
    })
  }
  thread.turns = [...thread.turns, turn]
  thread.status = 'idle'
  thread.updatedAt = completedAt
  thread.preview = params.text
  publishThreadNotification(params, 'turn/completed', { turn })
  publishThreadNotification(params, 'thread/status/changed', { status: 'idle' })
  return turn
}

function renameRuntimeThread(params: SdkRuntimeRpcRequestMap['thread/rename']): AgentChatThread {
  const record = requireRuntimeThreadRecord(params.runtime.id, params.threadId)
  const updated = {
    ...record.thread,
    name: params.name,
    updatedAt: Date.now(),
  }
  record.thread = updated
  publishThreadNotification(params, 'thread/name/updated', { name: params.name })
  return updated
}

function archiveRuntimeThread(
  params: SdkRuntimeRpcRequestMap['thread/archive'] | SdkRuntimeRpcRequestMap['thread/unarchive'],
  archived: boolean,
): AgentChatThread {
  const record = requireRuntimeThreadRecord(params.runtime.id, params.threadId)
  const updated = {
    ...record.thread,
    updatedAt: Date.now(),
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
  runtimeThreads.delete(runtimeThreadKey(params.runtime.id, params.threadId))
  publishThreadNotification(params, 'thread/closed', { threadId: params.threadId })
  return { ok: true }
}

function updateRuntimeThreadSettings(params: SdkRuntimeRpcRequestMap['thread/settings/update']): AgentThreadExecutionSettings {
  const record = requireRuntimeThreadRecord(params.runtime.id, params.threadId)
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
    updatedAt: Date.now(),
  }
  publishThreadNotification(params, 'thread/settings/updated', { threadSettings: executionSettings })
  return executionSettings
}

function setRuntimeThreadGoal(params: SdkRuntimeRpcRequestMap['thread/goal/set']): AgentThreadGoalState {
  const record = requireRuntimeThreadRecord(params.runtime.id, params.threadId)
  const now = Date.now()
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

function interruptRuntimeTurn(runtimeId: string, threadId: string): unknown {
  const record = runtimeThreads.get(runtimeThreadKey(runtimeId, threadId))
  record?.activeQuery?.interrupt?.()
  record?.activeQuery?.abort?.()
  record?.activeQuery?.close?.()
  return { ok: true }
}

function describeRuntime(
  params: SdkRuntimeRpcRequestMap[SdkRuntimeRpcMethod],
  contract: ProviderRuntimeApiContract,
  packageName: string,
  packageVersion?: string,
): SdkRuntimeDescribeResponse {
  return {
    runtime: runtimeDescription(params),
    contract: {
      api: contract.api,
      label: contract.label,
      transport: contract.transport,
      providerKinds: contract.providerKinds,
      ...(contract.requiredPackageExports ? { requiredPackageExports: contract.requiredPackageExports } : {}),
      ...(contract.requiredRpcMethods ? { requiredRpcMethods: contract.requiredRpcMethods } : {}),
      thread: contract.thread,
      capabilities: contract.capabilities,
    },
    sdk: {
      packageName,
      ...(packageVersion ? { version: packageVersion } : {}),
    },
  }
}

function runtimeDescription(
  params: SdkRuntimeRpcRequestMap[SdkRuntimeRpcMethod],
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

function baseThread(provider: string, runtimeId: string, threadId: string, title?: string | null, cwd?: string | null): AgentChatThread {
  const now = Date.now()
  return {
    provider,
    id: threadId,
    providerThreadId: threadId,
    providerSessionTreeId: runtimeId,
    preview: '',
    name: title ?? null,
    createdAt: now,
    updatedAt: now,
    status: 'idle',
    ...(cwd ? { cwd } : {}),
    turns: [],
  }
}

function userMessageItem(turnId: string, text: string, clientId?: string | null): AgentChatThreadItem {
  return {
    type: 'userMessage',
    id: `${turnId}_user`,
    clientId: clientId ?? null,
    content: [{ type: 'text', text, textElements: [] }],
  }
}

function readRuntimeThread(runtimeId: string, threadId: string): AgentChatThread {
  return requireRuntimeThreadRecord(runtimeId, threadId).thread
}

function threadsForRuntime(runtimeId: string): AgentChatThread[] {
  return Array.from(runtimeThreads.entries())
    .filter(([key]) => key.startsWith(`${runtimeId}:`))
    .map(([, record]) => record.thread)
}

function requireRuntimeThreadRecord(runtimeId: string, threadId: string): RuntimeThreadRecord {
  const record = runtimeThreads.get(runtimeThreadKey(runtimeId, threadId))
  if (!record) throw new Error(`SDK runtime thread not found: ${threadId}`)
  return record
}

function promptFromInputs(inputs: AgentChatInput[]): string {
  return inputs.map((input) => input.type === 'text' ? input.text : `[${input.type}] ${'name' in input ? input.name : ''}`.trim()).join('\n').trim()
}

function providerThreadId(providerThread: unknown): string | undefined {
  if (!isRecord(providerThread)) return undefined
  return stringField(providerThread, 'id') ?? stringField(providerThread, 'threadId')
}

function runtimeOptions(params: object, workspaceDir: string, fallbackCwd?: string | null): Record<string, unknown> {
  const record = params as Record<string, unknown>
  const cwd = resolveSdkRuntimeCwd(record, workspaceDir, fallbackCwd)
  return {
    ...(cwd ? { cwd } : {}),
    ...(typeof record.model === 'string' ? { model: record.model } : {}),
    ...(typeof record.threadId === 'string' ? { threadId: record.threadId } : {}),
  }
}

function resolveSdkRuntimeCwd(record: Record<string, unknown>, workspaceDir: string, fallbackCwd?: string | null): string | undefined {
  if (typeof record.cwd === 'string' && record.cwd.trim()) return record.cwd
  if (record.cwd === null) return undefined
  if (typeof fallbackCwd === 'string' && fallbackCwd.trim()) return fallbackCwd
  const workspaceContext = isRecord(record.workspaceContext) ? record.workspaceContext : undefined
  const projectId = record.projectId
  if (!workspaceContext && typeof projectId !== 'number' && typeof projectId !== 'string') return undefined
  return ensureMovScriptWorkspaceContext(resolveMovScriptWorkspaceContextPaths({
    workspaceDir,
    ...(workspaceContext as MovScriptWorkspaceContextInput | undefined),
    ...(projectId !== undefined && !workspaceContext?.projectId ? { projectId: projectId as string | number } : {}),
  })).providerSessionCwd
}

function codexRuntimeOptions(input?: Record<string, unknown>): Record<string, unknown> | undefined {
  const next = {
    ...(typeof input?.cwd === 'string' ? { workingDirectory: input.cwd } : {}),
    ...(typeof input?.model === 'string' ? { model: input.model } : {}),
  }
  return Object.keys(next).length ? next : undefined
}

function paramsFor<M extends SdkRuntimeRpcMethod>(
  input: ElectronSdkRuntimeRequestInput,
  method: M,
): SdkRuntimeRpcRequestMap[M] {
  if (input.method !== method) throw new Error(`Expected SDK runtime method ${method}, got ${input.method}`)
  return input.params as SdkRuntimeRpcRequestMap[M]
}

function requiredContract(api: 'codex-sdk' | 'claude-sdk'): ProviderRuntimeApiContract {
  const contract = providerRuntimeApiContract(api)
  if (!contract) throw new Error(`Missing runtime contract: ${api}`)
  return contract
}

function runtimeStoreLoader(packageName: string, packageVersion?: string): SdkRuntimeModuleLoader {
  return createInstallingSdkRuntimePackageStoreLoader({
    packageVersions: {
      [packageName]: packageVersion,
    },
  })
}

function sdkRuntimePackageVersion(packageName: string, configuredVersion?: string): string | undefined {
  return configuredVersion?.trim() || installedSdkRuntimePackageVersion(packageName)
}

function runtimeThreadKey(runtimeId: string, threadId: string): string {
  return `${runtimeId}:${threadId}`
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
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
