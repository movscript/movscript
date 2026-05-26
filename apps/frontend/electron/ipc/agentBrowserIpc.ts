import { BrowserWindow, ipcMain } from 'electron'
import { getAgentBrowserController } from '../services/agentBrowser'

export function registerAgentBrowserIpcHandlers(): void {
  ipcMain.handle('agent-browser:navigate', (event, input?: { tabId?: string; url?: string; bounds?: { x?: number; y?: number; width?: number; height?: number } | null }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for agent browser')
    return getAgentBrowserController(win).navigate({ tabId: input?.tabId, url: input?.url ?? '', bounds: input?.bounds })
  })

  ipcMain.handle('agent-browser:activate', (event, input?: { tabId?: string; bounds?: { x?: number; y?: number; width?: number; height?: number } | null }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for agent browser')
    return getAgentBrowserController(win).activate({ tabId: input?.tabId, bounds: input?.bounds })
  })

  ipcMain.handle('agent-browser:set-bounds', (event, input?: { bounds?: { x?: number; y?: number; width?: number; height?: number } | null } | null) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for agent browser')
    return getAgentBrowserController(win).setBounds(input?.bounds)
  })

  ipcMain.handle('agent-browser:hide', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for agent browser')
    return getAgentBrowserController(win).hide()
  })

  ipcMain.handle('agent-browser:get-state', (event, input?: { tabId?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for agent browser')
    return getAgentBrowserController(win).getState(input?.tabId)
  })

  ipcMain.handle('agent-browser:close', (event, input?: { tabId?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for agent browser')
    return getAgentBrowserController(win).close(input?.tabId)
  })

  ipcMain.handle('agent-browser:go-back', (event, input?: { tabId?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for agent browser')
    return getAgentBrowserController(win).goBack(input?.tabId)
  })

  ipcMain.handle('agent-browser:go-forward', (event, input?: { tabId?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for agent browser')
    return getAgentBrowserController(win).goForward(input?.tabId)
  })

  ipcMain.handle('agent-browser:reload', (event, input?: { tabId?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for agent browser')
    return getAgentBrowserController(win).reload(input?.tabId)
  })

  ipcMain.handle('agent-browser:stop', (event, input?: { tabId?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No browser window for agent browser')
    return getAgentBrowserController(win).stop(input?.tabId)
  })
}
