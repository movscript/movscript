import { app, BrowserWindow, ipcMain, dialog, session } from 'electron'
import { join } from 'path'
import { startBackend, stopBackend } from './backend'

// Tracks the currently authenticated user ID, injected into every backend request.
let currentUserId = ''

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
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
  // Inject X-User-ID on every request to the local backend so <video src> and
  // <img src> elements work without a separate blob-download step.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['http://localhost:8765/*'] },
    (details, callback) => {
      // Only inject when we have a user ID; otherwise Axios-set headers are preserved.
      if (currentUserId && !details.requestHeaders['X-User-ID']) {
        details.requestHeaders['X-User-ID'] = currentUserId
      }
      callback({ requestHeaders: details.requestHeaders })
    }
  )

  await startBackend()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
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

ipcMain.handle('set-user-id', (_e, id: string) => {
  currentUserId = id
})
