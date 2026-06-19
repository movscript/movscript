import {
  AGENT_RUNTIME_REQUIRED_RPC_METHODS,
} from '../../src/shared/infrastructure/agent-runtime/agentRuntimeProtocol'
import {
  registerAgentRuntimeHandler,
} from './agentRuntimeHost'
import {
  createCodexAppServerRuntimeHandler,
  createMovaAppServerRuntimeHandler,
  type AppServerRuntimeHandlerOptions,
} from './appServerRuntimeBackend'
import {
  installSdkRuntimeBackendHandlers,
  type SdkRuntimeBackendOptions,
} from './sdkRuntimeBackend'

export interface AgentRuntimeDefaultHandlerOptions extends AppServerRuntimeHandlerOptions, SdkRuntimeBackendOptions {}

export function installAgentRuntimeDefaultHandlers(options: AgentRuntimeDefaultHandlerOptions = {}): () => void {
  const disposers = [
    registerAgentRuntimeHandler('codex-app-server', createCodexAppServerRuntimeHandler(options), {
      supportedMethods: AGENT_RUNTIME_REQUIRED_RPC_METHODS,
    }),
    registerAgentRuntimeHandler('mova-app-server', createMovaAppServerRuntimeHandler(options), {
      supportedMethods: AGENT_RUNTIME_REQUIRED_RPC_METHODS,
    }),
    installSdkRuntimeBackendHandlers(options),
  ]
  return () => {
    for (const dispose of disposers) dispose()
  }
}

export function installDefaultAgentRuntimeHandlers(options: AgentRuntimeDefaultHandlerOptions = {}): () => void {
  return installAgentRuntimeDefaultHandlers(options)
}
