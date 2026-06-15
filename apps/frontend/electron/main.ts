import { app, BrowserWindow, dialog } from 'electron'
import { installChromiumRenderDiagnostics } from './diagnostics/rendering'
import { installApplicationMenu } from './appMenu'
import {
  bootstrapManagedServicesBeforeWindow,
  broadcastBackendStatus,
  ensureMCPServerReady,
  hasManagedServicesShutdownCompleted,
  shutdownManagedServices,
} from './managedServices'
import { registerIpcHandlers } from './ipc'
import {
  flushPendingProviderActivationURLs,
  installProviderActivationHost,
} from './services/providerActivationHost'
import { openHomeWindow } from './services/appWindowRegistry'
import { installAdminProtocol, registerAdminProtocolPrivileges } from './adminWindow'
import { installAppUpdateScheduler, uninstallAppUpdateScheduler } from './services/appUpdate'

const desktopSmokeTest = process.argv.includes('--movscript-desktop-smoke-test') || process.env.MOVSCRIPT_DESKTOP_SMOKE_TEST === '1'

async function shutdownFromSignal(signal: NodeJS.Signals): Promise<void> {
  uninstallAppUpdateScheduler()
  await shutdownManagedServices()
  const exitCode = signal === 'SIGINT' ? 130 : 143
  app.exit(exitCode)
}

installChromiumRenderDiagnostics()
installProviderActivationHost({ broadcastBackendStatus })
registerAdminProtocolPrivileges()

app.whenReady().then(async () => {
  installApplicationMenu()
  installAdminProtocol()
  try {
    await bootstrapManagedServicesBeforeWindow()
  } catch (error) {
    console.error('[bootstrap] failed to start desktop services', error)
    dialog.showErrorBox('MovScript failed to start', error instanceof Error ? error.message : String(error))
    app.quit()
    return
  }

  if (desktopSmokeTest) {
    console.log('MOVSCRIPT_DESKTOP_SMOKE_OK')
    await shutdownManagedServices()
    app.exit(0)
    return
  }

  openHomeWindow()
  installAppUpdateScheduler()
  await flushPendingProviderActivationURLs()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openHomeWindow()
  })
}).catch((error) => {
  console.error('[bootstrap] failed to start desktop app', error)
  app.quit()
})

app.on('window-all-closed', () => {
  // Windows are disposable work surfaces. Keep the app and managed services
  // alive until the user explicitly quits so project/agent windows can be
  // reopened without treating an empty desktop as process shutdown.
})

app.on('before-quit', (event) => {
  uninstallAppUpdateScheduler()
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
