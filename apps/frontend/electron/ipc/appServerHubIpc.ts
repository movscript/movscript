import { ipcMain } from 'electron'
import { appServerHub } from '../services/appServerHub'
import type {
  ElectronAppServerHubCloseInput,
  ElectronAppServerHubConnectInput,
  ElectronAppServerHubMessage,
  ElectronAppServerHubNotifyInput,
  ElectronAppServerHubRequestInput,
  ElectronAppServerHubSendInput,
  ElectronAppServerHubSnapshotInput,
} from '../../src/shared/contracts/electronApi'

const APP_SERVER_HUB_IPC_CHANNELS = {
  connect: 'app-server-hub:connect',
  send: 'app-server-hub:send',
  request: 'app-server-hub:request',
  notify: 'app-server-hub:notify',
  close: 'app-server-hub:close',
  snapshot: 'app-server-hub:snapshot',
  message: 'app-server-hub:message',
}

export function registerAppServerHubIpcHandlers(): void {
  ipcMain.handle(APP_SERVER_HUB_IPC_CHANNELS.connect, (event, input?: ElectronAppServerHubConnectInput) => {
    return appServerHub.connect(requireHubConnectInput(input), event.sender, APP_SERVER_HUB_IPC_CHANNELS.message)
  })

  ipcMain.handle(APP_SERVER_HUB_IPC_CHANNELS.send, (_event, input?: ElectronAppServerHubSendInput) => {
    appServerHub.send(input?.connectionId, input?.payload)
  })

  ipcMain.handle(APP_SERVER_HUB_IPC_CHANNELS.request, (_event, input?: ElectronAppServerHubRequestInput) => {
    return appServerHub.request(requireHubRequestInput(input))
  })

  ipcMain.handle(APP_SERVER_HUB_IPC_CHANNELS.notify, (_event, input?: ElectronAppServerHubNotifyInput) => {
    return appServerHub.notify(requireHubNotifyInput(input))
  })

  ipcMain.handle(APP_SERVER_HUB_IPC_CHANNELS.close, (_event, input?: ElectronAppServerHubCloseInput) => {
    appServerHub.close(input?.connectionId)
  })

  ipcMain.handle(APP_SERVER_HUB_IPC_CHANNELS.snapshot, (_event, input?: ElectronAppServerHubSnapshotInput) => {
    return appServerHub.snapshot(input?.connectionId)
  })
}

function requireHubConnectInput(input: ElectronAppServerHubConnectInput | undefined): ElectronAppServerHubConnectInput {
  if (!input?.url?.trim()) throw new Error('app-server hub connect requires url')
  return input
}

function requireHubRequestInput(input: ElectronAppServerHubRequestInput | undefined): ElectronAppServerHubRequestInput {
  if (!input?.url?.trim()) throw new Error('app-server hub request requires url')
  if (!input.method?.trim()) throw new Error('app-server hub request requires method')
  return input
}

function requireHubNotifyInput(input: ElectronAppServerHubNotifyInput | undefined): ElectronAppServerHubNotifyInput {
  if (!input?.url?.trim()) throw new Error('app-server hub notify requires url')
  if (!input.method?.trim()) throw new Error('app-server hub notify requires method')
  return input
}

export type AppServerHubIpcMessage = ElectronAppServerHubMessage
