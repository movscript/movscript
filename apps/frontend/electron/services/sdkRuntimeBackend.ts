import {
  AGENT_RUNTIME_REQUIRED_RPC_METHODS,
} from '../../src/shared/infrastructure/agent-runtime/agentRuntimeProtocol'
import {
  registerAgentRuntimeHandler,
} from './agentRuntimeHost'
import {
  createClaudeSdkRuntimeHandler,
  createCodexSdkRuntimeHandler,
  createMovaSdkRuntimeHandler,
  type SdkRuntimeDefaultHandlerOptions,
} from './sdkRuntimeDefaultHandlers'

export type SdkRuntimeBackendOptions = SdkRuntimeDefaultHandlerOptions

export function installSdkRuntimeBackendHandlers(options: SdkRuntimeBackendOptions = {}): () => void {
  const disposers = [
    registerAgentRuntimeHandler('codex-sdk', createCodexSdkRuntimeHandler(options), {
      supportedMethods: AGENT_RUNTIME_REQUIRED_RPC_METHODS,
    }),
    registerAgentRuntimeHandler('mova-sdk', createMovaSdkRuntimeHandler(options), {
      supportedMethods: AGENT_RUNTIME_REQUIRED_RPC_METHODS,
    }),
    registerAgentRuntimeHandler('claude-sdk', createClaudeSdkRuntimeHandler(options), {
      supportedMethods: AGENT_RUNTIME_REQUIRED_RPC_METHODS,
    }),
  ]
  return () => {
    for (const dispose of disposers) dispose()
  }
}

export function installDefaultSdkRuntimeHandlers(options: SdkRuntimeBackendOptions = {}): () => void {
  return installSdkRuntimeBackendHandlers(options)
}

export {
  createClaudeSdkRuntimeHandler,
  createCodexSdkRuntimeHandler,
  createMovaSdkRuntimeHandler,
}
export type { SdkRuntimeDefaultHandlerOptions }
