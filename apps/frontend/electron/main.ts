import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { startBackend, stopBackend } from './backend'
import { ensureProductionRuntimeRunning, stopProductionRuntime } from './productionRuntime'
import { startMCPServer, stopMCPServer, updateMCPContextSnapshot } from './mcp/server'
import type { MCPContextSnapshot } from './mcp/types'

function resolvePreloadPath(): string {
  const jsPath = join(__dirname, '../preload/index.js')
  const mjsPath = join(__dirname, '../preload/index.mjs')
  return existsSync(jsPath) ? jsPath : mjsPath
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: resolvePreloadPath(),
      sandbox: false
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools()
    }
  })
}

app.whenReady().then(async () => {
  await startBackend()
  await startMCPServer()
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

ipcMain.handle('production-runtime:ensure-running', (_e, input?: { baseURL?: string }) => {
  return ensureProductionRuntimeRunning(input)
})
