import {
  providerRuntimeApiContract,
  type ProviderRuntimeApiContract,
} from '../../src/shared/infrastructure/providerRuntimeApiCatalog'
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
import { SDK_RUNTIME_REQUIRED_RPC_METHODS } from '../../src/shared/infrastructure/sdk-runtime/sdkRuntimeProtocol'
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
import type { SdkRuntimeRunPromptEventSink } from './sdkRuntimeTurnEvents'
import {
  resolveAgentRuntimeAccountConfig,
  type AgentRuntimeAccountConfig,
} from './agentRuntimeAccountResolver'
import { resolveAgentRuntimeHomeEnv } from './agentRuntimeHomeResolver'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'
import {
  claudeOptionsFromAccount,
  codexOptionsFromAccount,
  normalizeClaudeSdkBaseURL,
} from './sdkRuntimeConfigInjector'
import { emitClaudeSdkRuntimeTurnEvents } from './claudeSdkRuntimeStreamAdapter'
import {
  runCodexLikeSdkPrompt,
  type CodexLikeThread,
} from './codexSdkRuntimeStreamAdapter'
import {
  sdkRuntimeClaudePermissionMode,
  sdkRuntimeProviderRequestCallbacks,
  sdkRuntimeProviderRunProfileOptions,
} from './sdkRuntimeServerRequestAdapter'
import {
  handleSdkRuntimeRequest,
  sdkRuntimeProviderResumeTokenFromResult,
  syncProviderThreadResumeToken,
} from './sdkRuntimeRequestHandler'

type CodexConstructor = new (...args: unknown[]) => CodexClient
type CodexClient = {
  startThread(input?: Record<string, unknown>): CodexThread
  resumeThread(threadId: string, input?: Record<string, unknown>): CodexThread
}
type CodexThread = {
  id?: string
  threadId?: string
  run(prompt: string, options?: Record<string, unknown>): Promise<unknown>
  runStreamed?: (prompt: string, options?: Record<string, unknown>) => Promise<unknown> | unknown
}
type CodexLikeRuntimeApi = 'codex-sdk' | 'mova-sdk'

type ClaudeQuery = (input: { prompt: string; options?: Record<string, unknown> }) => AsyncIterable<unknown>

export interface SdkRuntimeDefaultHandlerOptions {
  moduleLoader?: SdkRuntimeModuleLoader
  defaultWorkspaceDir?: () => string
}

export function createCodexSdkRuntimeHandler(options: SdkRuntimeDefaultHandlerOptions = {}) {
  return createCodexLikeSdkRuntimeHandler('codex-sdk', options)
}

export function createMovaSdkRuntimeHandler(options: SdkRuntimeDefaultHandlerOptions = {}) {
  return createCodexLikeSdkRuntimeHandler('mova-sdk', options)
}

function createCodexLikeSdkRuntimeHandler(api: CodexLikeRuntimeApi, options: SdkRuntimeDefaultHandlerOptions = {}) {
  return async <M extends SdkRuntimeRpcMethod>(
    input: ElectronSdkRuntimeRequestInput<M>,
  ): Promise<ElectronSdkRuntimeRequestResult<M>> => {
    if (input.method === 'runtime/probe') {
      const params = paramsFor(input, 'runtime/probe')
      const contract = requiredContract(api)
      const packageName = codexLikeSdkPackageName(params, contract, api)
      return probeRuntimePackage(params, contract, packageName, options, api) as ElectronSdkRuntimeRequestResult<M>
    }
    const runtime = await codexRuntime(input.params, options, api)
    return handleSdkRuntimeRequest(input, runtime) as Promise<ElectronSdkRuntimeRequestResult<M>>
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
      return probeRuntimePackage(params, contract, packageName, options, 'claude-sdk') as ElectronSdkRuntimeRequestResult<M>
    }
    const runtime = await claudeRuntime(input.params, options)
    return handleSdkRuntimeRequest(input, runtime) as Promise<ElectronSdkRuntimeRequestResult<M>>
  }
}

async function codexRuntime(
  params: SdkRuntimeRpcRequestMap[SdkRuntimeRpcMethod],
  options: SdkRuntimeDefaultHandlerOptions,
  api: CodexLikeRuntimeApi = 'codex-sdk',
) {
  const contract = requiredContract(api)
  const packageName = codexLikeSdkPackageName(params, contract, api)
  const workspaceDir = resolveSdkRuntimeWorkspaceDir(options)
  const loaded = await loadSdkRuntimePackage(packageName, options.moduleLoader ?? runtimeStoreLoader(packageName, params.runtime.packageVersion))
  if (!loaded.ok) throw new Error(loaded.error)
  assertSdkRuntimePackageContract(packageName, loaded.module, contract.requiredPackageExports)
  const Codex = requiredExport<CodexConstructor>(loaded.module, 'Codex', packageName)
  const account = resolveSdkRuntimeAccountConfig(params, workspaceDir)
  const codex = new Codex(codexOptionsFromAccount(account, resolveAgentRuntimeHomeEnv(params, workspaceDir), {
    disableBackendWebsockets: api === 'codex-sdk',
  }))
  return {
    workspaceDir,
    describe: describeRuntime(params, contract, packageName, sdkRuntimePackageVersion(packageName, params.runtime.packageVersion)),
    startProviderThread: (threadId?: string, start?: Record<string, unknown>) => {
      const options = codexRuntimeOptions(start)
      return threadId ? codex.resumeThread(threadId, options) : codex.startThread(options)
    },
    runPrompt: async (
      providerThread: unknown,
      prompt: string,
      turn?: Record<string, unknown>,
      events?: SdkRuntimeRunPromptEventSink,
    ) => {
      if (!providerThread || typeof providerThread !== 'object' || typeof (providerThread as CodexThread).run !== 'function') {
        throw new Error(`${packageName} returned a thread without run().`)
      }
      try {
        return await runCodexLikeSdkPrompt(providerThread as CodexLikeThread, prompt, codexRuntimeOptions(turn, events), events)
      } catch (error) {
        throw normalizeCodexLikeSdkRuntimeError(error, api)
      }
    },
  }
}

function codexLikeSdkPackageName(
  params: SdkRuntimeRpcRequestMap['runtime/probe'] | SdkRuntimeRpcRequestMap[SdkRuntimeRpcMethod],
  contract: ProviderRuntimeApiContract,
  api: CodexLikeRuntimeApi,
): string {
  if (api === 'codex-sdk') return params.runtime.sdkPackageName ?? contract.sdkPackageName ?? 'missing-codex-sdk-package'
  return params.runtime.packageName ?? ''
}

function sdkRuntimeCredentialProbe(
  params: SdkRuntimeRpcRequestMap['runtime/probe'],
  options: SdkRuntimeDefaultHandlerOptions,
  api: CodexLikeRuntimeApi | 'claude-sdk',
): SdkRuntimeCredentialProbe {
  const workspaceDir = resolveSdkRuntimeWorkspaceDir(options)
  const account = resolveSdkRuntimeAccountConfig(params, workspaceDir)
  if (api === 'claude-sdk') {
    return sdkRuntimeCredentialProbeForAccount({
      account,
      modelEndpointBaseURL: normalizeClaudeSdkBaseURL(account.modelEndpointBaseURL),
      env: 'ANTHROPIC_API_KEY',
      directEnvReady: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
      missingDetail: 'Claude Agent SDK credentials are missing. Set ANTHROPIC_API_KEY in the Movscript launch environment, or save a Claude API key in the Agent console.',
    })
  }
  return sdkRuntimeCredentialProbeForAccount({
    account,
    env: 'OPENAI_API_KEY',
    directEnvReady: Boolean(process.env.OPENAI_API_KEY?.trim()),
    missingDetail: `${api === 'mova-sdk' ? 'Mova SDK' : 'Codex SDK'} credentials are missing. Sign in to Movscript so the workspace backend has a token, or set OPENAI_API_KEY in the Movscript launch environment for direct OpenAI.`,
  })
}

function sdkRuntimeCredentialProbeForAccount(input: {
  account: AgentRuntimeAccountConfig
  modelEndpointBaseURL?: string
  env: string
  directEnvReady: boolean
  missingDetail: string
}): SdkRuntimeCredentialProbe {
  const acceptedEnv = [input.env]
  const modelEndpointBaseURL = input.modelEndpointBaseURL ?? input.account.modelEndpointBaseURL
  if (input.account.kind === 'apiKey') {
    return {
      ok: true,
      configured: true,
      env: input.env,
      acceptedEnv,
      source: input.account.accountSource,
      modelEndpointBaseURL,
      detail: `Credentials loaded from ${input.account.accountSource}.`,
    }
  }
  if (input.directEnvReady) {
    return {
      ok: true,
      configured: true,
      env: input.env,
      acceptedEnv,
      source: 'launch-env',
      modelEndpointBaseURL,
      detail: `Credentials loaded from ${input.env}.`,
    }
  }
  return {
    ok: false,
    configured: false,
    env: input.env,
    acceptedEnv,
    source: 'none',
    modelEndpointBaseURL,
    detail: input.missingDetail,
  }
}

async function probeRuntimePackage(
  params: SdkRuntimeRpcRequestMap['runtime/probe'],
  contract: ProviderRuntimeApiContract,
  packageName: string,
  options: SdkRuntimeDefaultHandlerOptions,
  api: CodexLikeRuntimeApi | 'claude-sdk',
): Promise<SdkRuntimeProbeResponse> {
  const loaded = await loadSdkRuntimePackage(packageName, options.moduleLoader ?? runtimeStoreLoader(packageName, params.runtime.packageVersion))
  const requiredRpcMethods = contract.requiredRpcMethods ?? []
  const missingRpcMethods = requiredRpcMethods.filter((method) => !SDK_RUNTIME_REQUIRED_RPC_METHODS.includes(method))
  const credentials = sdkRuntimeCredentialProbe(params, options, api)
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
        credentials,
      },
      credentials,
      ...(loaded.error ? { error: loaded.error } : {}),
    }
  }
  const exportProbe = probeSdkRuntimePackageContract(packageName, loaded.module, contract.requiredPackageExports)
  const ok = exportProbe.ok && missingRpcMethods.length === 0 && credentials.ok
  const error = exportProbe.error
    ?? (missingRpcMethods.length > 0 ? `SDK runtime ${contract.api} is missing required RPC methods: ${missingRpcMethods.join(', ')}` : undefined)
    ?? credentials.detail
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
      credentials,
    },
    credentials,
    ...(!ok && error ? { error } : {}),
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
  const accountOptions = claudeOptionsFromAccount(account, resolveAgentRuntimeHomeEnv(params, workspaceDir))
  return {
    workspaceDir,
    describe: describeRuntime(params, contract, packageName, sdkRuntimePackageVersion(packageName, params.runtime.packageVersion)),
    startProviderThread: (threadId?: string) => ({ id: threadId ?? `claude_${randomId()}` }),
    runPrompt: async (
      _providerThread: unknown,
      prompt: string,
      turn?: Record<string, unknown>,
      events?: SdkRuntimeRunPromptEventSink,
    ) => {
      const messages: unknown[] = []
      const resume = claudeProviderThreadResumeToken(_providerThread)
      try {
        const queryOptions: Record<string, unknown> = {
          ...accountOptions,
          ...(turn?.cwd ? { cwd: turn.cwd } : {}),
          ...(turn?.model ? { model: turn.model } : {}),
          ...(resume ? { resume } : {}),
          ...sdkRuntimeProviderRunProfileOptions(turn),
          ...(sdkRuntimeClaudePermissionMode(turn) ? { permissionMode: sdkRuntimeClaudePermissionMode(turn) } : {}),
          ...sdkRuntimeProviderRequestCallbacks(events),
        }
        const stream = query({
          prompt,
          options: queryOptions,
        })
        let index = 0
        for await (const message of stream) {
          messages.push(message)
          emitClaudeSdkRuntimeTurnEvents(message, index, events)
          index += 1
        }
      } catch (error) {
        throw normalizeClaudeSdkRuntimeError(error)
      }
      const resumeToken = sdkRuntimeProviderResumeTokenFromResult(messages)
      if (resumeToken) syncProviderThreadResumeToken(_providerThread, resumeToken)
      return messages
    },
  }
}

function resolveSdkRuntimeAccountConfig(
  params: SdkRuntimeRpcRequestMap[SdkRuntimeRpcMethod],
  workspaceDir: string,
): AgentRuntimeAccountConfig {
  const account = resolveAgentRuntimeAccountConfig({
    workspaceDir,
    providerKey: params.provider.id || params.provider.kind,
    provider: params.provider as unknown as Record<string, unknown>,
    runtimeApi: params.runtime.api,
    preferBackendSession: params.provider.kind === 'codex'
      || params.provider.kind === 'mova'
      || params.provider.kind === 'claude'
      || params.runtime.api === 'codex-sdk'
      || params.runtime.api === 'mova-sdk'
      || params.runtime.api === 'claude-sdk',
    appSettingsWorkspaceDirs: [resolveDefaultSdkRuntimeWorkspaceDir()],
  })
  return account
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
      support: contract.support,
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

function claudeProviderThreadResumeToken(providerThread: unknown): string | undefined {
  if (!isRecord(providerThread)) return undefined
  return stringField(providerThread, 'resumeToken')
    ?? stringField(providerThread, 'claudeSessionId')
    ?? stringField(providerThread, 'session_id')
}

function normalizeClaudeSdkRuntimeError(error: unknown): Error {
  const message = errorMessage(error)
  if (/not logged in|please run\s+\/login/i.test(message)) {
    return new Error('Claude Agent SDK credentials are missing. Save a Claude API key in Agent Console, or set ANTHROPIC_API_KEY in the Movscript launch environment. If you intentionally use Claude Code login instead, run `claude` in a terminal and enter `/login` with the same CLAUDE_CONFIG_DIR.')
  }
  return error instanceof Error ? error : new Error(message)
}

function normalizeCodexLikeSdkRuntimeError(error: unknown, api: CodexLikeRuntimeApi): Error {
  const message = errorMessage(error)
  if (/401|unauthorized|missing bearer|missing .*authentication/i.test(message)) {
    const label = api === 'mova-sdk' ? 'Mova SDK' : 'Codex SDK'
    return new Error(`${label} credentials are missing. Movscript SDK mode uses the backend model gateway by default when a backend session is available. Sign in to Movscript so the workspace backend has a token, or set OPENAI_API_KEY in the Movscript launch environment for direct OpenAI.`)
  }
  return error instanceof Error ? error : new Error(message)
}

function codexRuntimeOptions(
  input?: Record<string, unknown>,
  events?: SdkRuntimeRunPromptEventSink,
): Record<string, unknown> | undefined {
  const next = {
    ...(typeof input?.cwd === 'string' ? { workingDirectory: input.cwd } : {}),
    ...(typeof input?.model === 'string' ? { model: input.model } : {}),
    ...sdkRuntimeProviderRunProfileOptions(input),
    ...sdkRuntimeProviderRequestCallbacks(events),
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

function requiredContract(api: 'codex-sdk' | 'mova-sdk' | 'claude-sdk'): ProviderRuntimeApiContract {
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

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}
