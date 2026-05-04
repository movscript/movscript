import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { startBackend, stopBackend } from './backend'
import { ensureProductionRuntimeRunning, setProductionRuntimeAPIBaseURL, stopProductionRuntime } from './productionRuntime'
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

async function startProductionRuntimeOnAppReady(): Promise<void> {
  const status = await ensureProductionRuntimeRunning()
  if (!status.ok) {
    console.warn(`[agent] auto-start failed: ${status.error ?? 'unknown error'}`)
    return
  }
  console.info(`[agent] auto-start ${status.started ? 'started' : 'ready'} at ${status.baseURL}${status.pid ? ` pid=${status.pid}` : ''}`)
}

app.whenReady().then(async () => {
  await startBackend()
  await startMCPServer()
  void startProductionRuntimeOnAppReady()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  await stopProductionRuntime()
  await stopMCPServer()
  await stopBackend()
  if (process.platform !== 'darwin') app.quit()
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

ipcMain.handle('app:set-settings', async (_e, settings?: { apiBaseURL?: string }) => {
  if (!settings?.apiBaseURL) return
  setMCPAPIBaseURL(settings.apiBaseURL)
  await setProductionRuntimeAPIBaseURL(settings.apiBaseURL)
})

ipcMain.handle('agent:ensure-running', (_e, input?: { baseURL?: string }) => {
  return ensureProductionRuntimeRunning(input)
})
