const { app, BrowserWindow } = require('electron')
const { join } = require('node:path')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, 'electronGenerationPreload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })
  await win.loadURL(process.env.MOVSCRIPT_E2E_RENDERER_URL || 'about:blank')
})

app.on('window-all-closed', () => {
  app.quit()
})
