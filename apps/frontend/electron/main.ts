import { app, BrowserWindow } from 'electron'
import { createWindow } from './appWindow'
import {
  bootstrapManagedServicesBeforeWindow,
  broadcastBackendStatus,
  ensureMCPServerReady,
  hasManagedServicesShutdownCompleted,
  shutdownManagedServices,
} from './managedServices'
import { registerIpcHandlers } from './ipc'

async function shutdownFromSignal(signal: NodeJS.Signals): Promise<void> {
  await shutdownManagedServices()
  const exitCode = signal === 'SIGINT' ? 130 : 143
  app.exit(exitCode)
}

app.whenReady().then(async () => {
  await bootstrapManagedServicesBeforeWindow()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((error) => {
  console.error('[bootstrap] failed to start desktop services', error)
  createWindow()
})

app.on('window-all-closed', async () => {
  await shutdownManagedServices()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  if (hasManagedServicesShutdownCompleted()) return
  event.preventDefault()
  void shutdownManagedServices().finally(() => {
    app.exit(0)
  })
})

process.once('SIGINT', () => {
  void shutdownFromSignal('SIGINT')
})

process.once('SIGTERM', () => {
  void shutdownFromSignal('SIGTERM')
})

registerIpcHandlers({
  broadcastBackendStatus,
  ensureMCPServerReady,
})
