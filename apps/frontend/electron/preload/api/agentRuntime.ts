import type { IpcRenderer } from 'electron'
import type {
  ElectronAPI,
  ElectronAgentRuntimeStreamMessage,
} from '../../../src/shared/contracts/electronApi'

type AgentRuntimeStreamMessageHandler = (message: ElectronAgentRuntimeStreamMessage) => void

export function createAgentRuntimeAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'ensureAgentRuntime' | 'stopAgentRuntime' | 'agentRuntimeRequest' | 'agentRuntimeOpenEventStream' | 'agentRuntimeCloseEventStream' | 'onAgentRuntimeStreamMessage' | 'listAgentRuntimeSessions' | 'getAgentWorkspaceConfig' | 'saveAgentWorkspaceConfig' | 'listAgentWorkspaceFiles' | 'readAgentWorkspaceFile' | 'writeAgentWorkspaceFile' | 'deleteAgentWorkspaceFile'> {
  const streamMessageHandlers = new Set<AgentRuntimeStreamMessageHandler>()
  let streamMessageListenerInstalled = false
  const streamMessageListener = (_event: unknown, message: ElectronAgentRuntimeStreamMessage) => {
    for (const handler of Array.from(streamMessageHandlers)) handler(message)
  }
  const ensureStreamMessageListener = () => {
    if (streamMessageListenerInstalled) return
    ipcRenderer.on('agent:runtime-stream-message', streamMessageListener)
    streamMessageListenerInstalled = true
  }
  const removeStreamMessageListenerIfUnused = () => {
    if (!streamMessageListenerInstalled || streamMessageHandlers.size > 0) return
    ipcRenderer.removeListener('agent:runtime-stream-message', streamMessageListener)
    streamMessageListenerInstalled = false
  }

  return {
    ensureAgentRuntime: (input) => ipcRenderer.invoke('agent:ensure-running', input),
    stopAgentRuntime: () => ipcRenderer.invoke('agent:stop-running'),
    agentRuntimeRequest: (input) => ipcRenderer.invoke('agent:runtime-request', input),
    agentRuntimeOpenEventStream: (input) => ipcRenderer.invoke('agent:runtime-open-event-stream', input),
    agentRuntimeCloseEventStream: (input) => ipcRenderer.invoke('agent:runtime-close-event-stream', input),
    listAgentRuntimeSessions: (input) => ipcRenderer.invoke('agent:runtime-list-sessions', input),
    getAgentWorkspaceConfig: (input) => ipcRenderer.invoke('agent:workspace-config-get', input),
    saveAgentWorkspaceConfig: (input) => ipcRenderer.invoke('agent:workspace-config-save', input),
    listAgentWorkspaceFiles: (input) => ipcRenderer.invoke('agent:workspace-files-list', input),
    readAgentWorkspaceFile: (input) => ipcRenderer.invoke('agent:workspace-files-read', input),
    writeAgentWorkspaceFile: (input) => ipcRenderer.invoke('agent:workspace-files-write', input),
    deleteAgentWorkspaceFile: (input) => ipcRenderer.invoke('agent:workspace-files-delete', input),
    onAgentRuntimeStreamMessage: (handler: AgentRuntimeStreamMessageHandler) => {
      streamMessageHandlers.add(handler)
      ensureStreamMessageListener()
      return () => {
        streamMessageHandlers.delete(handler)
        removeStreamMessageListenerIfUnused()
      }
    },
  }
}
