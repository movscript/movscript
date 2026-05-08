import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { getBackendLaunchPolicy, getBackendStatus, LOCAL_BACKEND_URL, type BackendStatus, startBackend, stopBackend } from './backend'
import { ensureAgentRuntimeRunning, setAgentRuntimeAPIBaseURL, stopAgentRuntime } from './agentRuntime'
import { setMCPAPIBaseURL, startMCPServer, stopMCPServer, updateMCPContextSnapshot } from './mcp/server'
import type { MCPContextSnapshot } from './mcp/types'

function resolvePreloadPath(): string {
  const jsPath = join(__dirname, '../preload/index.js')
  const mjsPath = join(__dirname, '../preload/index.mjs')
  return existsSync(jsPath) ? jsPath : mjsPath
}

function resolveAppIconPath(): string {
  const packagedIcon = join(process.resourcesPath || '', 'logo.png')
  if (app.isPackaged && existsSync(packagedIcon)) return packagedIcon
  return join(process.cwd(), '../../assets/logo.png')
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: resolveAppIconPath(),
    webPreferences: {
      preload: resolvePreloadPath(),
      sandbox: false
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.webContents.session.clearCache().finally(() => {
      void win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
    })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools()
    }
  })
}

function broadcastBackendStatus(status: BackendStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('backend:status', status)
  }
}

let shutdownCompleted = false
let shutdownPromise: Promise<void> | null = null

async function shutdownManagedServices(): Promise<void> {
  if (shutdownPromise) return shutdownPromise
  shutdownPromise = (async () => {
    try {
      await stopAgentRuntime()
      await stopMCPServer()
      await stopBackend(broadcastBackendStatus)
    } finally {
      shutdownCompleted = true
    }
  })()
  return shutdownPromise
}

async function shutdownFromSignal(signal: NodeJS.Signals): Promise<void> {
  await shutdownManagedServices()
  const exitCode = signal === 'SIGINT' ? 130 : 143
  app.exit(exitCode)
}

async function startAgentRuntimeOnAppReady(): Promise<void> {
  const status = await ensureAgentRuntimeRunning()
  if (!status.ok) {
    console.warn(`[agent] auto-start failed: ${status.error ?? 'unknown error'}`)
    return
  }
  console.info(`[agent] auto-start ${status.started ? 'started' : 'ready'} at ${status.baseURL}${status.pid ? ` pid=${status.pid}` : ''}`)
}

async function bootstrapBackendBeforeAgent(): Promise<boolean> {
  const policy = getBackendLaunchPolicy()
  console.info(`[bootstrap] backend policy=${policy}`)
  const status = await startBackend(policy, broadcastBackendStatus)
  if (policy !== 'spawn') return true

  if (status.state !== 'ready') {
    console.warn(`[backend] local bootstrap failed: ${status.message ?? status.state}`)
    return false
  }

  console.info(`[bootstrap] local backend ready at ${LOCAL_BACKEND_URL}; starting agent after backend`)
  setMCPAPIBaseURL(LOCAL_BACKEND_URL)
  await setAgentRuntimeAPIBaseURL(LOCAL_BACKEND_URL)
  return true
}

app.whenReady().then(async () => {
  await startMCPServer()
  if (await bootstrapBackendBeforeAgent()) {
    void startAgentRuntimeOnAppReady()
  }
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
  if (shutdownCompleted) return
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

ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'] })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('dialog:saveFile', async (_e, defaultPath?: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath })
  return canceled ? null : filePath
})

ipcMain.handle('mcp:update-context', (_e, snapshot: MCPContextSnapshot) => {
  updateMCPContextSnapshot(snapshot)
})

ipcMain.handle('backend:get-status', () => {
  return getBackendStatus()
})

ipcMain.handle('app:set-settings', async (_e, settings?: { apiBaseURL?: string; launchMode?: 'cloud' | 'local' }) => {
  if (settings?.launchMode === 'local') {
    broadcastBackendStatus({ state: 'starting', baseURL: LOCAL_BACKEND_URL })
    await startBackend('spawn', broadcastBackendStatus)
  } else if (settings?.launchMode === 'cloud') {
    await stopBackend(broadcastBackendStatus, { terminate: true })
  }
  if (!settings?.apiBaseURL) return
  setMCPAPIBaseURL(settings.apiBaseURL)
  await setAgentRuntimeAPIBaseURL(settings.apiBaseURL)
  await ensureAgentRuntimeRunning()
})

ipcMain.handle('agent:ensure-running', (_e, input?: { baseURL?: string }) => {
  return ensureAgentRuntimeRunning(input)
})
