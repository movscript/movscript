import type { ProviderModelAPIKind } from '@movscript/core/agent'
import type {
  ProviderKind,
  ProviderRuntimeApi,
} from './providerConfigStore'
import type { SdkRuntimeRpcMethod } from './sdk-runtime/sdkRuntimeProtocol'

export type ProviderRuntimeAdapterStatus = 'available' | 'pending'
export type ProviderRuntimeTransport = 'sdk-client' | 'app-server'

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
    api: 'codex-app-server',
    label: 'Codex app-server',
    transport: 'app-server',
    adapterStatus: 'available',
    providerKinds: ['codex'],
    modelAPIKinds: ['openai_responses', 'openai_chat_completions'],
    packageName: '@openai/codex',
    binaryPackageName: '@openai/codex',
    requiredRpcMethods: [
      'runtime/probe',
      'runtime/describe',
      'capabilities/get',
      'permissionProfile/list',
      'skills/list',
      'skills/extraRoots/set',
      'plugin/list',
      'plugin/installed',
      'plugin/install',
      'plugin/uninstall',
      'mcpServerStatus/list',
      'mcpServer/resource/read',
      'mcpServer/tool/call',
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
    api: 'mova-app-server',
    label: 'Mova app-server',
    transport: 'app-server',
    adapterStatus: 'available',
    providerKinds: ['mova'],
    modelAPIKinds: ['openai_responses', 'openai_chat_completions'],
    binaryPackageName: '@movscript/mova',
    requiredRpcMethods: [
      'runtime/probe',
      'runtime/describe',
      'capabilities/get',
      'permissionProfile/list',
      'skills/list',
      'skills/extraRoots/set',
      'plugin/list',
      'plugin/installed',
      'plugin/install',
      'plugin/uninstall',
      'mcpServerStatus/list',
      'mcpServer/resource/read',
      'mcpServer/tool/call',
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
    api: 'codex-sdk',
    label: 'Codex SDK',
    transport: 'sdk-client',
    adapterStatus: 'available',
    providerKinds: ['codex'],
    modelAPIKinds: ['openai_responses', 'openai_chat_completions'],
    packageName: '@openai/codex',
    sdkPackageName: '@openai/codex-sdk',
    requiredPackageExports: ['Codex'],
    requiredRpcMethods: [
      'runtime/probe',
      'runtime/describe',
      'capabilities/get',
      'permissionProfile/list',
      'skills/list',
      'skills/extraRoots/set',
      'plugin/list',
      'plugin/installed',
      'plugin/install',
      'plugin/uninstall',
      'mcpServerStatus/list',
      'mcpServer/resource/read',
      'mcpServer/tool/call',
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
    api: 'mova-sdk',
    label: 'Mova SDK',
    transport: 'sdk-client',
    adapterStatus: 'available',
    providerKinds: ['mova'],
    modelAPIKinds: ['openai_responses', 'openai_chat_completions'],
    binaryPackageName: '@movscript/mova',
    requiredPackageExports: ['Codex'],
    requiredRpcMethods: [
      'runtime/probe',
      'runtime/describe',
      'capabilities/get',
      'permissionProfile/list',
      'skills/list',
      'skills/extraRoots/set',
      'plugin/list',
      'plugin/installed',
      'plugin/install',
      'plugin/uninstall',
      'mcpServerStatus/list',
      'mcpServer/resource/read',
      'mcpServer/tool/call',
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
    modelAPIKinds: ['anthropic_messages'],
    packageName: '@anthropic-ai/claude-agent-sdk',
    binaryPackageName: '@anthropic-ai/claude-code',
    requiredPackageExports: ['query'],
    requiredRpcMethods: [
      'runtime/probe',
      'runtime/describe',
      'capabilities/get',
      'permissionProfile/list',
      'skills/list',
      'skills/extraRoots/set',
      'plugin/list',
      'plugin/installed',
      'plugin/install',
      'plugin/uninstall',
      'mcpServerStatus/list',
      'mcpServer/resource/read',
      'mcpServer/tool/call',
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

export function providerRuntimeModelAPIKinds(api: ProviderRuntimeApi): ProviderModelAPIKind[] {
  return [...(providerRuntimeApiContract(api)?.modelAPIKinds ?? [])]
}
