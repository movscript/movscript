import type { IpcRenderer } from 'electron'
import type {
  ElectronAPI,
  ElectronAppServerHubMessage,
  ElectronAppServerLogEvent,
} from '../../../src/shared/contracts/electronApi'

type AppServerHubMessageHandler = (message: ElectronAppServerHubMessage) => void
type AppServerLogHandler = (event: ElectronAppServerLogEvent) => void

export function createAppServerAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'distributeAppServerConfig' | 'ensureAppServer' | 'getAppServerStatus' | 'stopAppServer' | 'appServerHubConnect' | 'appServerHubSend' | 'appServerHubRequest' | 'appServerHubNotify' | 'appServerHubClose' | 'getAppServerHubSnapshot' | 'onAppServerHubMessage' | 'onAppServerLog'> {
  const appServerHubMessages = createMessageSubscription<ElectronAppServerHubMessage, AppServerHubMessageHandler>(ipcRenderer, 'app-server-hub:message')
  const appServerLogs = createMessageSubscription<ElectronAppServerLogEvent, AppServerLogHandler>(ipcRenderer, 'app-server:log')

  return {
    distributeAppServerConfig: (input) => ipcRenderer.invoke('app-server:distribute', input),
    ensureAppServer: (input) => ipcRenderer.invoke('app-server:ensure', input),
    getAppServerStatus: (input) => ipcRenderer.invoke('app-server:status', input),
    stopAppServer: (input) => ipcRenderer.invoke('app-server:stop', input),
    appServerHubConnect: (input) => ipcRenderer.invoke('app-server-hub:connect', input),
    appServerHubSend: (input) => ipcRenderer.invoke('app-server-hub:send', input),
    appServerHubRequest: (input) => ipcRenderer.invoke('app-server-hub:request', input),
    appServerHubNotify: (input) => ipcRenderer.invoke('app-server-hub:notify', input),
    appServerHubClose: (input) => ipcRenderer.invoke('app-server-hub:close', input),
    getAppServerHubSnapshot: (input) => ipcRenderer.invoke('app-server-hub:snapshot', input),
    onAppServerHubMessage: appServerHubMessages.subscribe,
    onAppServerLog: appServerLogs.subscribe,
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
