import type { ProviderModelAPIKind } from '@movscript/core/agent'
import type {
  ProviderKind,
  ProviderRuntimeApi,
} from './providerConfigStore'
import type { AgentRuntimeRpcMethod } from './agent-runtime/agentRuntimeProtocol'
import { PROVIDER_RUNTIME_API_CONTRACT_INPUTS } from './providerRuntimeApiCatalogContracts'

export type ProviderRuntimeAdapterStatus = 'available' | 'pending'
export type ProviderRuntimeTransport = 'sdk-client' | 'app-server'
export type RuntimeBackendAdapterStatus = ProviderRuntimeAdapterStatus
export type RuntimeBackendTransport = ProviderRuntimeTransport
export type RuntimeBackendCapabilitySupportLevel = 'supported' | 'unsupported' | 'degraded'

export interface RuntimeBackendCapabilitySupport {
  supported: boolean
  level: RuntimeBackendCapabilitySupportLevel
  reason?: string
}

export interface RuntimeBackendThreadContract {
  list: boolean
  read: boolean
  start: boolean
  resume: boolean
  interrupt: boolean
  stream: boolean
}

export interface RuntimeBackendCapabilityContract {
  tools: boolean
  permissions: boolean
  mcp: boolean
  config: boolean
  account: boolean
}

export interface RuntimeBackendSupportContract {
  thread: Record<keyof RuntimeBackendThreadContract, RuntimeBackendCapabilitySupport>
  capabilities: Record<keyof RuntimeBackendCapabilityContract, RuntimeBackendCapabilitySupport>
}

type RuntimeBackendSupportOverrides = {
  thread?: Partial<Record<keyof RuntimeBackendThreadContract, Partial<RuntimeBackendCapabilitySupport>>>
  capabilities?: Partial<Record<keyof RuntimeBackendCapabilityContract, Partial<RuntimeBackendCapabilitySupport>>>
}

export interface ProviderRuntimeApiContract {
  api: ProviderRuntimeApi
  label: string
  transport: ProviderRuntimeTransport
  adapterStatus: ProviderRuntimeAdapterStatus
  providerKinds: ProviderKind[]
  modelAPIKinds: ProviderModelAPIKind[]
  packageName?: string
  sdkPackageName?: string
  binaryPackageName?: string
  requiredPackageExports?: string[]
  requiredRpcMethods?: AgentRuntimeRpcMethod[]
  thread: RuntimeBackendThreadContract
  capabilities: RuntimeBackendCapabilityContract
  support: RuntimeBackendSupportContract
}

export type RuntimeBackendContract = ProviderRuntimeApiContract

export type RuntimeBackendContractInput = Omit<ProviderRuntimeApiContract, 'support'> & {
  support?: RuntimeBackendSupportOverrides
}

export const PROVIDER_RUNTIME_API_CONTRACTS: ProviderRuntimeApiContract[] =
  PROVIDER_RUNTIME_API_CONTRACT_INPUTS.map(defineRuntimeBackendContract)

function defineRuntimeBackendContract(input: RuntimeBackendContractInput): ProviderRuntimeApiContract {
  return {
    ...input,
    support: runtimeBackendSupportContract(input.thread, input.capabilities, input.support),
  }
}

function runtimeBackendSupportContract(
  thread: RuntimeBackendThreadContract,
  capabilities: RuntimeBackendCapabilityContract,
  overrides: RuntimeBackendSupportOverrides = {},
): RuntimeBackendSupportContract {
  return {
    thread: {
      list: runtimeBackendCapabilitySupport(thread.list, overrides.thread?.list),
      read: runtimeBackendCapabilitySupport(thread.read, overrides.thread?.read),
      start: runtimeBackendCapabilitySupport(thread.start, overrides.thread?.start),
      resume: runtimeBackendCapabilitySupport(thread.resume, overrides.thread?.resume),
      interrupt: runtimeBackendCapabilitySupport(thread.interrupt, overrides.thread?.interrupt),
      stream: runtimeBackendCapabilitySupport(thread.stream, overrides.thread?.stream),
    },
    capabilities: {
      tools: runtimeBackendCapabilitySupport(capabilities.tools, overrides.capabilities?.tools),
      permissions: runtimeBackendCapabilitySupport(capabilities.permissions, overrides.capabilities?.permissions),
      mcp: runtimeBackendCapabilitySupport(capabilities.mcp, overrides.capabilities?.mcp),
      config: runtimeBackendCapabilitySupport(capabilities.config, overrides.capabilities?.config),
      account: runtimeBackendCapabilitySupport(capabilities.account, overrides.capabilities?.account),
    },
  }
}

function runtimeBackendCapabilitySupport(
  fallbackSupported: boolean,
  override: Partial<RuntimeBackendCapabilitySupport> | undefined,
): RuntimeBackendCapabilitySupport {
  const supported = override?.supported ?? fallbackSupported
  return {
    supported,
    level: override?.level ?? (supported ? 'supported' : 'unsupported'),
    ...(override?.reason ? { reason: override.reason } : {}),
  }
}

export function providerRuntimeApiContract(api: ProviderRuntimeApi): ProviderRuntimeApiContract | undefined {
  return PROVIDER_RUNTIME_API_CONTRACTS.find((contract) => contract.api === api)
}

export const RUNTIME_BACKEND_CONTRACTS: RuntimeBackendContract[] = PROVIDER_RUNTIME_API_CONTRACTS

export function runtimeBackendContract(api: ProviderRuntimeApi): RuntimeBackendContract | undefined {
  return providerRuntimeApiContract(api)
}

export function providerRuntimeAdapterAvailable(api: ProviderRuntimeApi): boolean {
  return providerRuntimeApiContract(api)?.adapterStatus === 'available'
}

export function runtimeBackendAvailable(api: ProviderRuntimeApi): boolean {
  return providerRuntimeAdapterAvailable(api)
}

export function providerRuntimeApiSupportsKind(api: ProviderRuntimeApi, kind: ProviderKind): boolean {
  const contract = providerRuntimeApiContract(api)
  return Boolean(contract?.providerKinds.includes(kind))
}

export function runtimeBackendSupportsKind(api: ProviderRuntimeApi, kind: ProviderKind): boolean {
  return providerRuntimeApiSupportsKind(api, kind)
}

export function runtimeBackendSupport(api: ProviderRuntimeApi): RuntimeBackendSupportContract | undefined {
  return runtimeBackendContract(api)?.support
}

export function providerRuntimeModelAPIKinds(api: ProviderRuntimeApi): ProviderModelAPIKind[] {
  return [...(providerRuntimeApiContract(api)?.modelAPIKinds ?? [])]
}
