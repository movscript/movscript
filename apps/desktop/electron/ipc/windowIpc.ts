import { BrowserWindow, ipcMain } from 'electron'
import type {
  ElectronOpenCanvasWindowInput,
  ElectronOpenEditingProjectWindowInput,
  ElectronOpenProjectWindowInput,
  ElectronOpenSettingsWindowInput,
  ElectronOpenToolWindowInput,
  ElectronWindowControlAction,
  ElectronWindowState,
} from '../../src/shared/contracts/electronApi'
import {
  contextForWebContents,
  openAgentWindow,
  openCanvasWindow,
  openEditingWindow,
  openEditingProjectWindow,
  openHomeWindow,
  openProjectWindow,
  openSettingsWindow,
  openToolWindow,
  updateWindowRouteContext,
} from '../services/appWindowRegistry'

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

  ipcMain.handle('window:get-context', (event) => {
    return contextForWebContents(event.sender)
  })

  ipcMain.handle('window:open-home', () => {
    return openHomeWindow()
  })

  ipcMain.handle('window:open-agent', () => {
    return openAgentWindow()
  })

  ipcMain.handle('window:open-project', (_event, input?: ElectronOpenProjectWindowInput) => {
    if (!input) throw new Error('Project window input is required')
    return openProjectWindow(input)
  })

  ipcMain.handle('window:open-editing', () => {
    return openEditingWindow()
  })

  ipcMain.handle('window:open-editing-project', (_event, input?: ElectronOpenEditingProjectWindowInput) => {
    if (!input) throw new Error('Editing project window input is required')
    return openEditingProjectWindow(input)
  })

  ipcMain.handle('window:open-canvas', (_event, input?: ElectronOpenCanvasWindowInput) => {
    return openCanvasWindow(input)
  })

  ipcMain.handle('window:open-tool', (_event, input?: ElectronOpenToolWindowInput) => {
    return openToolWindow(input)
  })

  ipcMain.handle('window:open-settings', (_event, input?: ElectronOpenSettingsWindowInput) => {
    return openSettingsWindow(input)
  })

  ipcMain.handle('window:update-route-context', (event, input) => {
    if (!input) throw new Error('Window route context input is required')
    return updateWindowRouteContext(event.sender, input)
  })
}

function trackWindowState(win: BrowserWindow): void {
  if (trackedWindows.has(win)) return
  trackedWindows.add(win)

  const sendState = () => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return
    try {
      win.webContents.send('window:state', windowState(win))
    } catch (error) {
      if (String(error).includes('Render frame was disposed')) return
      throw error
    }
  }

  win.on('focus', sendState)
  win.on('blur', sendState)
  win.on('enter-full-screen', sendState)
  win.on('leave-full-screen', sendState)
  win.on('maximize', sendState)
  win.on('unmaximize', sendState)
  win.once('closed', () => {
    win.removeListener('focus', sendState)
    win.removeListener('blur', sendState)
    win.removeListener('enter-full-screen', sendState)
    win.removeListener('leave-full-screen', sendState)
    win.removeListener('maximize', sendState)
    win.removeListener('unmaximize', sendState)
  })
}

function windowState(win: BrowserWindow): ElectronWindowState {
  return {
    fullscreen: win.isFullScreen(),
    focused: win.isFocused(),
  }
}
