import type { IpcRenderer } from 'electron'
import type {
  ElectronAPI,
  ElectronCodexAppServerMessage,
} from '../../../src/shared/contracts/electronApi'

type CodexAppServerMessageHandler = (message: ElectronCodexAppServerMessage) => void

export function createCodexAppServerAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'ensureCodexAppServer' | 'getCodexAppServerStatus' | 'stopCodexAppServer' | 'codexAppServerConnect' | 'codexAppServerSend' | 'codexAppServerClose' | 'onCodexAppServerMessage'> {
  const messageHandlers = new Set<CodexAppServerMessageHandler>()
  let messageListenerInstalled = false
  const messageListener = (_event: unknown, message: ElectronCodexAppServerMessage) => {
    for (const handler of Array.from(messageHandlers)) handler(message)
  }
  const ensureMessageListener = () => {
    if (messageListenerInstalled) return
    ipcRenderer.on('codex:app-server-message', messageListener)
    messageListenerInstalled = true
  }
  const removeMessageListenerIfUnused = () => {
    if (!messageListenerInstalled || messageHandlers.size > 0) return
    ipcRenderer.removeListener('codex:app-server-message', messageListener)
    messageListenerInstalled = false
  }

  return {
    ensureCodexAppServer: (input) => ipcRenderer.invoke('codex:app-server-ensure', input),
    getCodexAppServerStatus: (input) => ipcRenderer.invoke('codex:app-server-status', input),
    stopCodexAppServer: (input) => ipcRenderer.invoke('codex:app-server-stop', input),
    codexAppServerConnect: (input) => ipcRenderer.invoke('codex:app-server-connect', input),
    codexAppServerSend: (input) => ipcRenderer.invoke('codex:app-server-send', input),
    codexAppServerClose: (input) => ipcRenderer.invoke('codex:app-server-close', input),
    onCodexAppServerMessage: (handler) => {
      messageHandlers.add(handler)
      ensureMessageListener()
      return () => {
        messageHandlers.delete(handler)
        removeMessageListenerIfUnused()
      }
    },
  }
}
