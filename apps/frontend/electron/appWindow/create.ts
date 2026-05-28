import { BrowserWindow } from 'electron'
import { bindWindowRenderDiagnostics } from '../diagnostics/rendering'
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
  bindWindowRenderDiagnostics(win)
  loadRenderer(win)
  bindDevtoolsShortcut(win)
}
