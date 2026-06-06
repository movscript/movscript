import type { IpcRenderer } from 'electron'
import type {
  ElectronAPI,
  ElectronAppServerMessage,
} from '../../../src/shared/contracts/electronApi'

type AppServerMessageHandler = (message: ElectronAppServerMessage) => void

export function createAppServerAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'distributeAppServerConfig' | 'ensureAppServer' | 'getAppServerStatus' | 'stopAppServer' | 'appServerConnect' | 'appServerSend' | 'appServerClose' | 'onAppServerMessage'> {
  const appServerMessages = createMessageSubscription<ElectronAppServerMessage, AppServerMessageHandler>(ipcRenderer, 'app-server:message')

  return {
    distributeAppServerConfig: (input) => ipcRenderer.invoke('app-server:distribute', input),
    ensureAppServer: (input) => ipcRenderer.invoke('app-server:ensure', input),
    getAppServerStatus: (input) => ipcRenderer.invoke('app-server:status', input),
    stopAppServer: (input) => ipcRenderer.invoke('app-server:stop', input),
    appServerConnect: (input) => ipcRenderer.invoke('app-server:connect', input),
    appServerSend: (input) => ipcRenderer.invoke('app-server:send', input),
    appServerClose: (input) => ipcRenderer.invoke('app-server:close', input),
    onAppServerMessage: appServerMessages.subscribe,
  }
}

function createMessageSubscription<TMessage, THandler extends (message: TMessage) => void>(ipcRenderer: IpcRenderer, channel: string): { subscribe: (handler: THandler) => () => void } {
  const messageHandlers = new Set<THandler>()
  let messageListenerInstalled = false
  const messageListener = (_event: unknown, message: TMessage) => {
    for (const handler of Array.from(messageHandlers)) handler(message)
  }
  const ensureMessageListener = () => {
    if (messageListenerInstalled) return
    ipcRenderer.on(channel, messageListener)
    messageListenerInstalled = true
  }
  const removeMessageListenerIfUnused = () => {
    if (!messageListenerInstalled || messageHandlers.size > 0) return
    ipcRenderer.removeListener(channel, messageListener)
    messageListenerInstalled = false
  }

  return {
    subscribe: (handler: THandler) => {
      messageHandlers.add(handler)
      ensureMessageListener()
      return () => {
        messageHandlers.delete(handler)
        removeMessageListenerIfUnused()
      }
    },
  }
}
