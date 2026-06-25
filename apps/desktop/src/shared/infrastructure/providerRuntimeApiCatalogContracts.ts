import { AGENT_RUNTIME_REQUIRED_RPC_METHODS } from './agent-runtime/agentRuntimeProtocol'
import type { RuntimeBackendContractInput } from './providerRuntimeApiCatalog'

const FULL_THREAD_CONTRACT = {
  list: true,
  read: true,
  start: true,
  resume: true,
  interrupt: true,
  stream: true,
} as const

const FULL_RUNTIME_CAPABILITIES = {
  tools: true,
  permissions: true,
  mcp: true,
  config: true,
  account: true,
} as const

export const PROVIDER_RUNTIME_API_CONTRACT_INPUTS: RuntimeBackendContractInput[] = [
  {
    api: 'codex-app-server',
    label: 'Codex app-server',
    transport: 'app-server',
    adapterStatus: 'available',
    providerKinds: ['codex'],
    modelAPIKinds: ['openai_responses', 'openai_chat_completions'],
    packageName: '@openai/codex',
    binaryPackageName: '@movscript/mova-app-server',
    requiredRpcMethods: AGENT_RUNTIME_REQUIRED_RPC_METHODS,
    thread: FULL_THREAD_CONTRACT,
    capabilities: FULL_RUNTIME_CAPABILITIES,
  },
  {
    api: 'mova-app-server',
    label: 'Mova app-server',
    transport: 'app-server',
    adapterStatus: 'available',
    providerKinds: ['mova'],
    modelAPIKinds: ['openai_responses', 'openai_chat_completions'],
    binaryPackageName: '@movscript/mova-app-server',
    requiredRpcMethods: AGENT_RUNTIME_REQUIRED_RPC_METHODS,
    thread: FULL_THREAD_CONTRACT,
    capabilities: FULL_RUNTIME_CAPABILITIES,
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
    requiredRpcMethods: AGENT_RUNTIME_REQUIRED_RPC_METHODS,
    thread: FULL_THREAD_CONTRACT,
    capabilities: FULL_RUNTIME_CAPABILITIES,
  },
  {
    api: 'mova-sdk',
    label: 'Mova SDK',
    transport: 'sdk-client',
    adapterStatus: 'available',
    providerKinds: ['mova'],
    modelAPIKinds: ['openai_responses', 'openai_chat_completions'],
    requiredPackageExports: ['Codex'],
    requiredRpcMethods: AGENT_RUNTIME_REQUIRED_RPC_METHODS,
    thread: FULL_THREAD_CONTRACT,
    capabilities: FULL_RUNTIME_CAPABILITIES,
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
    requiredRpcMethods: AGENT_RUNTIME_REQUIRED_RPC_METHODS,
    thread: FULL_THREAD_CONTRACT,
    capabilities: {
      tools: true,
      permissions: true,
      mcp: true,
      config: false,
      account: false,
    },
    support: {
      capabilities: {
        config: {
          supported: false,
          level: 'unsupported',
          reason: 'Claude Agent SDK does not expose the full Codex config surface.',
        },
        account: {
          supported: false,
          level: 'unsupported',
          reason: 'Claude credentials are resolved by MovScript account settings or ANTHROPIC_* environment variables.',
        },
      },
    },
  },
]
