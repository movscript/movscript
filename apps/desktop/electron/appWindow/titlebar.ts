import type { BrowserWindow } from 'electron'

const TITLE_BAR_HEIGHT = 34

export function titleBarOptionsForPlatform(platform: NodeJS.Platform): Electron.BrowserWindowConstructorOptions {
  const isMacOS = platform === 'darwin'
  return {
    titleBarStyle: isMacOS ? 'hiddenInset' : 'hidden',
    ...(isMacOS ? {} : { titleBarOverlay: { height: TITLE_BAR_HEIGHT } }),
  }
}

export function bindTitlebarChromeToZoom(win: BrowserWindow, platform: NodeJS.Platform): void {
  if (platform === 'darwin') {
    win.setWindowButtonVisibility(false)
    return
  }

  const syncTitlebarChromeWithZoom = () => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return
    const zoomFactor = win.webContents.getZoomFactor()
    win.setTitleBarOverlay({ height: Math.max(1, Math.round(TITLE_BAR_HEIGHT * zoomFactor)) })
  }

  const scheduleTitlebarChromeSync = () => {
    syncTitlebarChromeWithZoom()
    setTimeout(syncTitlebarChromeWithZoom, 50)
    setTimeout(syncTitlebarChromeWithZoom, 150)
  }

  win.webContents.on('zoom-changed', scheduleTitlebarChromeSync)
  win.webContents.once('did-finish-load', scheduleTitlebarChromeSync)
}
