import type { IpcRenderer } from 'electron'
import type {
  ElectronAPI,
  ElectronSdkRuntimeNotificationEvent,
  ElectronSdkRuntimeServerRequestEvent,
} from '../../../src/shared/contracts/electronApi'

type SdkRuntimeNotificationHandler = (event: ElectronSdkRuntimeNotificationEvent) => void
type SdkRuntimeServerRequestHandler = (event: ElectronSdkRuntimeServerRequestEvent) => void

export function createSdkRuntimeAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'sdkRuntimeRequest' | 'sdkRuntimePackageStatus' | 'sdkRuntimeCancelPackageInstall' | 'sdkRuntimeNotify' | 'sdkRuntimeRespondToServerRequest' | 'onSdkRuntimeNotification' | 'onSdkRuntimeServerRequest'> {
  const notifications = createMessageSubscription<ElectronSdkRuntimeNotificationEvent, SdkRuntimeNotificationHandler>(ipcRenderer, 'sdk-runtime:notification')
  const serverRequests = createMessageSubscription<ElectronSdkRuntimeServerRequestEvent, SdkRuntimeServerRequestHandler>(ipcRenderer, 'sdk-runtime:server-request')
  return {
    sdkRuntimeRequest: (input) => ipcRenderer.invoke('sdk-runtime:request', input),
    sdkRuntimePackageStatus: (input) => ipcRenderer.invoke('sdk-runtime:package-status', input),
    sdkRuntimeCancelPackageInstall: (input) => ipcRenderer.invoke('sdk-runtime:package-install-cancel', input),
    sdkRuntimeNotify: (input) => ipcRenderer.invoke('sdk-runtime:notify', input),
    sdkRuntimeRespondToServerRequest: (input) => ipcRenderer.invoke('sdk-runtime:server-request-response', input),
    onSdkRuntimeNotification: notifications.subscribe,
    onSdkRuntimeServerRequest: serverRequests.subscribe,
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
