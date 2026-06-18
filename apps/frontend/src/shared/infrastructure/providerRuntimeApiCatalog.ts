import type {
  ProviderKind,
  ProviderRuntimeApi,
} from './providerConfigStore'
import type { SdkRuntimeRpcMethod } from './sdk-runtime/sdkRuntimeProtocol'

export type ProviderRuntimeAdapterStatus = 'available' | 'pending'
export type ProviderRuntimeTransport = 'app-server-json-rpc' | 'sdk-client'

export interface ProviderRuntimeApiContract {
  api: ProviderRuntimeApi
  label: string
  transport: ProviderRuntimeTransport
  adapterStatus: ProviderRuntimeAdapterStatus
  providerKinds: ProviderKind[]
  packageName?: string
  sdkPackageName?: string
  binaryPackageName?: string
  requiredPackageExports?: string[]
  requiredRpcMethods?: SdkRuntimeRpcMethod[]
  thread: {
    list: boolean
    read: boolean
    start: boolean
    resume: boolean
    interrupt: boolean
    stream: boolean
  }
  capabilities: {
    tools: boolean
    permissions: boolean
    mcp: boolean
    config: boolean
    account: boolean
  }
}

export const PROVIDER_RUNTIME_API_CONTRACTS: ProviderRuntimeApiContract[] = [
  {
    api: 'app-server',
    label: 'App Server JSON-RPC',
    transport: 'app-server-json-rpc',
    adapterStatus: 'available',
    providerKinds: ['codex', 'mova'],
    thread: {
      list: true,
      read: true,
      start: true,
      resume: true,
      interrupt: true,
      stream: true,
    },
    capabilities: {
      tools: true,
      permissions: true,
      mcp: true,
      config: true,
      account: true,
    },
  },
  {
    api: 'codex-sdk',
    label: 'Codex SDK',
    transport: 'sdk-client',
    adapterStatus: 'available',
    providerKinds: ['codex'],
    packageName: '@openai/codex',
    sdkPackageName: '@openai/codex-sdk',
    requiredPackageExports: ['Codex'],
    requiredRpcMethods: [
      'runtime/probe',
      'runtime/describe',
      'thread/list',
      'thread/read',
      'thread/start',
      'thread/resume',
      'thread/rename',
      'thread/archive',
      'thread/unarchive',
      'thread/delete',
      'thread/settings/update',
      'thread/goal/set',
      'turn/start',
      'turn/text/start',
      'turn/steer',
      'turn/interrupt',
      'runtime/notify/threadSubscribe',
      'runtime/notify/serverRequestsSubscribe',
    ],
    thread: {
      list: true,
      read: true,
      start: true,
      resume: true,
      interrupt: true,
      stream: true,
    },
    capabilities: {
      tools: true,
      permissions: true,
      mcp: true,
      config: true,
      account: true,
    },
  },
  {
    api: 'claude-sdk',
    label: 'Claude Agent SDK',
    transport: 'sdk-client',
    adapterStatus: 'available',
    providerKinds: ['claude'],
    packageName: '@anthropic-ai/claude-agent-sdk',
    binaryPackageName: '@anthropic-ai/claude-code',
    requiredPackageExports: ['query'],
    requiredRpcMethods: [
      'runtime/probe',
      'runtime/describe',
      'thread/list',
      'thread/read',
      'thread/start',
      'thread/resume',
      'thread/rename',
      'thread/archive',
      'thread/unarchive',
      'thread/delete',
      'thread/settings/update',
      'thread/goal/set',
      'turn/start',
      'turn/text/start',
      'turn/steer',
      'turn/interrupt',
      'runtime/notify/threadSubscribe',
      'runtime/notify/serverRequestsSubscribe',
    ],
    thread: {
      list: true,
      read: true,
      start: true,
      resume: true,
      interrupt: true,
      stream: true,
    },
    capabilities: {
      tools: true,
      permissions: true,
      mcp: true,
      config: false,
      account: false,
    },
  },
]

export function providerRuntimeApiContract(api: ProviderRuntimeApi): ProviderRuntimeApiContract | undefined {
  return PROVIDER_RUNTIME_API_CONTRACTS.find((contract) => contract.api === api)
}

export function providerRuntimeAdapterAvailable(api: ProviderRuntimeApi): boolean {
  return providerRuntimeApiContract(api)?.adapterStatus === 'available'
}

export function providerRuntimeApiSupportsKind(api: ProviderRuntimeApi, kind: ProviderKind): boolean {
  const contract = providerRuntimeApiContract(api)
  return Boolean(contract?.providerKinds.includes(kind))
}
