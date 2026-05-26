import type { BrowserWindow } from 'electron'

const TITLE_BAR_HEIGHT = 34
const MAC_TRAFFIC_LIGHT_VISUAL_SIZE = 14

export function titleBarOptionsForPlatform(platform: NodeJS.Platform): Electron.BrowserWindowConstructorOptions {
  const isMacOS = platform === 'darwin'
  return {
    titleBarStyle: isMacOS ? 'hiddenInset' : 'hidden',
    ...(isMacOS
      ? { trafficLightPosition: trafficLightPositionForZoom() }
      : { titleBarOverlay: { height: TITLE_BAR_HEIGHT } }),
  }
}

export function bindTitlebarChromeToZoom(win: BrowserWindow, platform: NodeJS.Platform): void {
  const syncTitlebarChromeWithZoom = () => {
    const zoomFactor = win.webContents.getZoomFactor()
    if (platform === 'darwin') {
      win.setWindowButtonPosition(trafficLightPositionForZoom(zoomFactor))
      return
    }
    win.setTitleBarOverlay({ height: Math.max(1, Math.round(TITLE_BAR_HEIGHT * zoomFactor)) })
  }

  win.webContents.on('zoom-changed', () => {
    setTimeout(syncTitlebarChromeWithZoom, 0)
  })
  win.webContents.once('did-finish-load', syncTitlebarChromeWithZoom)
}

function trafficLightPositionForZoom(zoomFactor = 1): { x: number; y: number } {
  return {
    x: 14,
    y: Math.max(0, Math.round((TITLE_BAR_HEIGHT * zoomFactor - MAC_TRAFFIC_LIGHT_VISUAL_SIZE) / 2)),
  }
}
