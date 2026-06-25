import type {
  AgentRuntimeCredentialProbe,
  AgentRuntimeDescribeResponse,
  AgentRuntimeRpcMethod,
  AgentRuntimeRpcRequestMap,
} from '../../src/shared/infrastructure/agent-runtime/agentRuntimeProtocol'
import {
  runtimeBackendContract,
  type RuntimeBackendContract,
} from '../../src/shared/infrastructure/providerRuntimeApiCatalog'
import type {
  ProviderConfig,
  ProviderRuntimeProfile,
} from '../../src/shared/infrastructure/providerConfigStore'
import { resolveAgentRuntimeAccountConfig, type AgentRuntimeAccountConfig } from './agentRuntimeAccountResolver'
import { resolveAgentRuntimeHomeEnv } from './agentRuntimeHomeResolver'
import { codexOptionsFromAccount } from './agentRuntimeConfigInjector'
import type { AppServerConnectionContext } from './appServerRuntimeConnection'
import {
  resolveAppServerCommand,
  type AppServerCommand,
  type AppServerCommandResolverInput,
  type AppServerCommandResolverOptions,
  type AppServerKind,
  type AppServerRuntimeApi,
} from './appServerRuntimeCommand'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'

export interface AppServerRuntimeHandlerOptions extends AppServerCommandResolverOptions {
  defaultWorkspaceDir?: () => string
}

export interface AppServerRuntimeContext extends AppServerConnectionContext {
  kind: AppServerKind
  contract: RuntimeBackendContract
  account: AgentRuntimeAccountConfig
  config?: Record<string, unknown>
}

export function appServerContext(
  api: AppServerRuntimeApi,
  params: AgentRuntimeRpcRequestMap[AgentRuntimeRpcMethod],
  options: AppServerRuntimeHandlerOptions,
): AppServerRuntimeContext {
  const contract = requiredAppServerRuntimeContract(api)
  const kind = appServerKindForApi(api)
  const workspaceDir = resolveAppServerRuntimeWorkspaceDir(options)
  const account = resolveAppServerRuntimeAccountConfig(params, workspaceDir)
  const homeEnv = resolveAgentRuntimeHomeEnv(params, workspaceDir)
  const codexOptions = codexOptionsFromAccount(account, homeEnv, { disableBackendWebsockets: true })
  const env = appServerEnv(codexOptions, homeEnv)
  const config = appServerConfig(codexOptions)
  const command = resolveAppServerCommand({ api, kind, provider: params.provider, runtime: params.runtime }, options)
  return appServerContextFromResolvedCommand({
    api,
    kind,
    provider: params.provider,
    runtime: params.runtime,
    workspaceDir,
    contract,
    account,
    env,
    config,
    command,
  })
}

function appServerContextFromResolvedCommand(input: {
  api: AppServerRuntimeApi
  kind: AppServerKind
  provider: ProviderConfig
  runtime: ProviderRuntimeProfile
  workspaceDir: string
  contract: RuntimeBackendContract
  account: AgentRuntimeAccountConfig
  env: NodeJS.ProcessEnv
  config: Record<string, unknown> | undefined
  command: AppServerCommand
}): AppServerRuntimeContext {
  return {
    api: input.api,
    kind: input.kind,
    provider: input.provider,
    runtime: input.runtime,
    workspaceDir: input.workspaceDir,
    contract: input.contract,
    account: input.account,
    env: input.env,
    ...(input.config ? { config: input.config } : {}),
    command: input.command,
  }
}

export function requiredAppServerRuntimeContract(api: AppServerRuntimeApi): RuntimeBackendContract {
  const contract = runtimeBackendContract(api)
  if (!contract) throw new Error(`Missing runtime contract: ${api}`)
  return contract
}

export function appServerKindForApi(api: AppServerRuntimeApi): AppServerKind {
  return api === 'mova-app-server' ? 'mova' : 'codex'
}

export function appServerRuntimeDescription(
  params: Pick<AgentRuntimeRpcRequestMap[AgentRuntimeRpcMethod], 'runtime'>,
): AgentRuntimeDescribeResponse['runtime'] {
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

export function appServerCredentialProbe(
  account: AgentRuntimeAccountConfig,
  api: AppServerRuntimeApi,
): AgentRuntimeCredentialProbe {
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

export function resolveAppServerRuntimeWorkspaceDir(options: AppServerRuntimeHandlerOptions): string {
  return options.defaultWorkspaceDir?.() ?? resolveDefaultAgentRuntimeWorkspaceDir()
}

export function resolveAppServerRuntimeAccountConfig(
  params: AgentRuntimeRpcRequestMap[AgentRuntimeRpcMethod],
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
    appSettingsWorkspaceDirs: [resolveDefaultAgentRuntimeWorkspaceDir()],
  })
}

function resolveDefaultAgentRuntimeWorkspaceDir(): string {
  try {
    return resolveDesktopDefaultMovScriptWorkspaceDir()
  } catch {
    return process.cwd()
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
