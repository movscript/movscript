import { app, dialog } from 'electron'
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
import { LOCAL_BACKEND_URL, setBackendStatus } from './services/backend'
import { getElectronRuntimeConfig } from './services/runtimeConfig'
import {
  shutdownDesktopApplicationRuntime,
  startDesktopApplicationRuntime,
} from '../runtime/desktopApplicationRuntime'

const desktopSmokeTest = process.argv.includes('--movscript-desktop-smoke-test') || process.env.MOVSCRIPT_DESKTOP_SMOKE_TEST === '1'
const hasSingleInstanceLock = desktopSmokeTest || app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (app.isReady()) openHomeWindow()
  })
  startDesktopApp()
}

async function shutdownFromSignal(signal: NodeJS.Signals): Promise<void> {
  uninstallAppUpdateScheduler()
  await shutdownManagedServices()
  await shutdownDesktopApplicationRuntime()
  const exitCode = signal === 'SIGINT' ? 130 : 143
  app.exit(exitCode)
}

function startDesktopApp(): void {
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
      const bootstrap = await bootstrapManagedServicesBeforeWindow()
      await startDesktopApplicationRuntime({
        ...(bootstrap.localRuntime ? { localRuntime: bootstrap.localRuntime } : {}),
      })
      markBootstrapRuntimeReady(bootstrap)
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
      await shutdownDesktopApplicationRuntime()
      app.exit(0)
      return
    }

    installAppUpdateScheduler()
    await flushPendingProviderActivationURLs()
    openHomeWindow()

    app.on('activate', () => {
      openHomeWindow()
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
      void shutdownDesktopApplicationRuntime().finally(() => {
        app.exit(0)
      })
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
}

function markBootstrapRuntimeReady(
  bootstrap: Awaited<ReturnType<typeof bootstrapManagedServicesBeforeWindow>>,
): void {
  if (!bootstrap.localRuntime?.enabled) return
  try {
    const runtimeConfig = getElectronRuntimeConfig()
    setBackendStatus({
      state: 'ready',
      baseURL: runtimeConfig.runtimeConnection.gatewayBaseURL || runtimeConfig.runtime.gateway.baseURL || LOCAL_BACKEND_URL,
    }, broadcastBackendStatus)
  } catch (error) {
    console.warn('[bootstrap] failed to publish local runtime readiness', error)
    setBackendStatus({ state: 'ready', baseURL: LOCAL_BACKEND_URL }, broadcastBackendStatus)
  }
}

function writeDesktopSmokeMarker(): void {
  const markerFile = process.env.MOVSCRIPT_DESKTOP_SMOKE_MARKER_FILE?.trim()
  if (!markerFile) return
  mkdirSync(dirname(markerFile), { recursive: true })
  writeFileSync(markerFile, 'MOVSCRIPT_DESKTOP_SMOKE_OK\n', 'utf8')
}
