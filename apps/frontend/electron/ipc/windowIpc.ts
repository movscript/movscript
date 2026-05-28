import { BrowserWindow, ipcMain } from 'electron'
import type {
  ElectronWindowControlAction,
  ElectronWindowState,
} from '../../src/shared/contracts/electronApi'

const trackedWindows = new WeakSet<BrowserWindow>()

export function registerWindowIpcHandlers(): void {
  ipcMain.handle('window:control', (event, action?: ElectronWindowControlAction) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for window control')
    trackWindowState(win)

    if (action === 'close') {
      win.close()
      return undefined
    }

    if (action === 'minimize') {
      win.minimize()
      return windowState(win)
    }

    if (action === 'toggleFullscreen') {
      win.setFullScreen(!win.isFullScreen())
      return windowState(win)
    }

    throw new Error(`Unsupported window control action: ${String(action)}`)
  })

  ipcMain.handle('window:get-state', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for window state')
    trackWindowState(win)
    return windowState(win)
  })
}

function trackWindowState(win: BrowserWindow): void {
  if (trackedWindows.has(win)) return
  trackedWindows.add(win)

  const sendState = () => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return
    win.webContents.send('window:state', windowState(win))
  }

  win.on('focus', sendState)
  win.on('blur', sendState)
  win.on('enter-full-screen', sendState)
  win.on('leave-full-screen', sendState)
  win.on('maximize', sendState)
  win.on('unmaximize', sendState)
}

function windowState(win: BrowserWindow): ElectronWindowState {
  return {
    fullscreen: win.isFullScreen(),
    focused: win.isFocused(),
  }
}
