import { BrowserWindow } from 'electron'
import { bindDevtoolsShortcut } from './devtools'
import { loadRenderer } from './loadRenderer'
import { resolveAppIconPath, resolvePreloadPath } from './paths'
import { bindTitlebarChromeToZoom, titleBarOptionsForPlatform } from './titlebar'

export function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: resolveAppIconPath(),
    ...titleBarOptionsForPlatform(process.platform),
    webPreferences: {
      preload: resolvePreloadPath(),
      sandbox: false,
    },
  })

  bindTitlebarChromeToZoom(win, process.platform)
  loadRenderer(win)
  bindDevtoolsShortcut(win)
}
