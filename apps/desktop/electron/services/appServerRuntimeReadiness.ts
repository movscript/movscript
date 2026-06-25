import {
  AGENT_RUNTIME_REQUIRED_RPC_METHODS,
  type AgentRuntimeDescribeResponse,
  type AgentRuntimeProbeResponse,
  type AgentRuntimeRpcMethod,
  type AgentRuntimeRpcRequestMap,
} from '../../src/shared/infrastructure/agent-runtime/agentRuntimeProtocol'
import {
  appServerCredentialProbe,
  appServerKindForApi,
  appServerRuntimeDescription,
  requiredAppServerRuntimeContract,
  resolveAppServerRuntimeAccountConfig,
  resolveAppServerRuntimeWorkspaceDir,
  type AppServerRuntimeHandlerOptions,
} from './appServerRuntimeContext'
import {
  resolveAppServerCommand,
  type AppServerCommand,
  type AppServerRuntimeApi,
} from './appServerRuntimeCommand'

export function probeAppServerRuntime(
  api: AppServerRuntimeApi,
  params: AgentRuntimeRpcRequestMap['runtime/probe'],
  options: AppServerRuntimeHandlerOptions,
): AgentRuntimeProbeResponse {
  const contract = requiredAppServerRuntimeContract(api)
  const kind = appServerKindForApi(api)
  const workspaceDir = resolveAppServerRuntimeWorkspaceDir(options)
  const account = resolveAppServerRuntimeAccountConfig(params, workspaceDir)
  const credentials = appServerCredentialProbe(account, api)
  let command: AppServerCommand | undefined
  let commandError: string | undefined
  try {
    command = resolveAppServerCommand({ api, kind, provider: params.provider, runtime: params.runtime }, options)
  } catch (error) {
    commandError = errorMessage(error)
  }
  const requiredRpcMethods = contract.requiredRpcMethods ?? []
  const missingRpcMethods = requiredRpcMethods.filter((method) => !AGENT_RUNTIME_REQUIRED_RPC_METHODS.includes(method))
  const ok = Boolean(command) && missingRpcMethods.length === 0 && credentials.ok
  return {
    ok,
    runtime: appServerRuntimeDescription(params),
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

export function describeAppServerRuntime(
  api: AppServerRuntimeApi,
  params: AgentRuntimeRpcRequestMap[AgentRuntimeRpcMethod],
  options: AppServerRuntimeHandlerOptions,
): AgentRuntimeDescribeResponse {
  const contract = requiredAppServerRuntimeContract(api)
  const kind = appServerKindForApi(api)
  let command: AppServerCommand | undefined
  try {
    command = resolveAppServerCommand({ api, kind, provider: params.provider, runtime: params.runtime }, options)
  } catch {
    command = undefined
  }
  return {
    runtime: appServerRuntimeDescription(params),
    contract: {
      api: contract.api,
      label: contract.label,
      transport: contract.transport,
      providerKinds: contract.providerKinds,
      ...(contract.requiredRpcMethods ? { requiredRpcMethods: contract.requiredRpcMethods } : {}),
      thread: contract.thread,
      capabilities: contract.capabilities,
      support: contract.support,
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
