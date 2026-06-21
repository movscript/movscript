import { app, BrowserWindow, dialog } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
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
import { installMediaProtocol, registerMediaProtocolPrivileges } from './mediaProtocol'
import { installAppUpdateScheduler, uninstallAppUpdateScheduler } from './services/appUpdate'
import { installAppTray } from './services/appTray'
import { installDockShortcutMenu } from './services/dockShortcutMenu'
import { installDesktopIdentity } from './services/desktopIdentity'

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
registerMediaProtocolPrivileges()
installDesktopIdentity()

app.whenReady().then(async () => {
  installApplicationMenu()
  installAppTray()
  installDockShortcutMenu()
  installAdminProtocol()
  installMediaProtocol()
  try {
    await bootstrapManagedServicesBeforeWindow()
  } catch (error) {
    console.error('[bootstrap] failed to start desktop services', error)
    dialog.showErrorBox('MovScript failed to start', error instanceof Error ? error.message : String(error))
    app.quit()
    return
  }

  if (desktopSmokeTest) {
    writeDesktopSmokeMarker()
    console.log('MOVSCRIPT_DESKTOP_SMOKE_OK')
    await shutdownManagedServices()
    app.exit(0)
    return
  }

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

function writeDesktopSmokeMarker(): void {
  const markerFile = process.env.MOVSCRIPT_DESKTOP_SMOKE_MARKER_FILE?.trim()
  if (!markerFile) return
  mkdirSync(dirname(markerFile), { recursive: true })
  writeFileSync(markerFile, 'MOVSCRIPT_DESKTOP_SMOKE_OK\n', 'utf8')
}
