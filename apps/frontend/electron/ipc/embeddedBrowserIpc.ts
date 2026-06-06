import { BrowserWindow, ipcMain } from 'electron'
import { getEmbeddedBrowserController } from '../services/embeddedBrowser'

export function registerEmbeddedBrowserIpcHandlers(): void {
  ipcMain.handle('embedded-browser:navigate', (event, input?: { tabId?: string; url?: string; bounds?: { x?: number; y?: number; width?: number; height?: number } | null }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for embedded browser')
    return getEmbeddedBrowserController(win).navigate({ tabId: input?.tabId, url: input?.url ?? '', bounds: input?.bounds })
  })

  ipcMain.handle('embedded-browser:activate', (event, input?: { tabId?: string; bounds?: { x?: number; y?: number; width?: number; height?: number } | null }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for embedded browser')
    return getEmbeddedBrowserController(win).activate({ tabId: input?.tabId, bounds: input?.bounds })
  })

  ipcMain.handle('embedded-browser:set-bounds', (event, input?: { bounds?: { x?: number; y?: number; width?: number; height?: number } | null } | null) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for embedded browser')
    return getEmbeddedBrowserController(win).setBounds(input?.bounds)
  })

  ipcMain.handle('embedded-browser:hide', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for embedded browser')
    return getEmbeddedBrowserController(win).hide()
  })

  ipcMain.handle('embedded-browser:get-state', (event, input?: { tabId?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for embedded browser')
    return getEmbeddedBrowserController(win).getState(input?.tabId)
  })

  ipcMain.handle('embedded-browser:close', (event, input?: { tabId?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for embedded browser')
    return getEmbeddedBrowserController(win).close(input?.tabId)
  })

  ipcMain.handle('embedded-browser:go-back', (event, input?: { tabId?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for embedded browser')
    return getEmbeddedBrowserController(win).goBack(input?.tabId)
  })

  ipcMain.handle('embedded-browser:go-forward', (event, input?: { tabId?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for embedded browser')
    return getEmbeddedBrowserController(win).goForward(input?.tabId)
  })

  ipcMain.handle('embedded-browser:reload', (event, input?: { tabId?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for embedded browser')
    return getEmbeddedBrowserController(win).reload(input?.tabId)
  })

  ipcMain.handle('embedded-browser:stop', (event, input?: { tabId?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for embedded browser')
    return getEmbeddedBrowserController(win).stop(input?.tabId)
  })
}
