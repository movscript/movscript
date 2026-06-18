import { BrowserWindow, ipcMain, type WebContents } from 'electron'
import { appServerManager } from '../services/appServerManager'
import type {
  ElectronAppServerEnsureInput,
  ElectronAppServerLogEvent,
  ElectronAppServerStatusInput,
  ElectronAppServerStopInput,
} from '../../src/shared/contracts/electronApi'

type AppServerIpcChannels = {
  distribute: string
  ensure: string
  status: string
  stop: string
  log: string
}

const APP_SERVER_IPC_CHANNELS: AppServerIpcChannels = {
  distribute: 'app-server:distribute',
  ensure: 'app-server:ensure',
  status: 'app-server:status',
  stop: 'app-server:stop',
  log: 'app-server:log',
}

let logForwarderRegistered = false

export function registerAppServerIpcHandlers(): void {
  registerAppServerIpcChannelHandlers(APP_SERVER_IPC_CHANNELS)
}

function registerAppServerIpcChannelHandlers(channels: AppServerIpcChannels): void {
  registerAppServerLogForwarder(channels.log)

  ipcMain.handle(channels.distribute, (_event, input?: ElectronAppServerEnsureInput) => {
    return appServerManager.distribute(input)
  })

  ipcMain.handle(channels.ensure, async (_event, input?: ElectronAppServerEnsureInput) => {
    return appServerManager.ensure(input)
  })

  ipcMain.handle(channels.status, (_event, input?: ElectronAppServerStatusInput) => {
    return appServerManager.status(input?.profileId)
  })

  ipcMain.handle(channels.stop, (_event, input?: ElectronAppServerStopInput) => {
    return appServerManager.stop(input?.profileId)
  })
}

function registerAppServerLogForwarder(channel: string): void {
  if (logForwarderRegistered) return
  logForwarderRegistered = true
  appServerManager.onLog((event: ElectronAppServerLogEvent) => {
    for (const contents of webContentsForAppServerLogs()) {
      if (!contents.isDestroyed()) contents.send(channel, event)
    }
  })
}

function webContentsForAppServerLogs(): WebContents[] {
  return Array.from(new Set(BrowserWindow.getAllWindows().map((window) => window.webContents)))
}
