import { BrowserWindow } from 'electron'
import type { ElectronAppWindowContext } from '../../src/shared/contracts/electronApi'
import { bindWindowRenderDiagnostics } from '../diagnostics/rendering'
import { bindDevtoolsShortcut } from './devtools'
import { loadRenderer } from './loadRenderer'
import { resolveAppIconPath, resolvePreloadPath } from './paths'
import { bindTitlebarChromeToZoom, titleBarOptionsForPlatform } from './titlebar'

export interface CreateWindowOptions {
  context?: ElectronAppWindowContext
}

export function createWindow(options: CreateWindowOptions = {}): BrowserWindow {
  const context = options.context ?? { kind: 'home', route: '/' }
  const windowSize = context.kind === 'home'
    ? { width: 760, height: 620, minWidth: 560, minHeight: 460 }
    : context.kind === 'projectData'
    ? { width: 1200, height: 820, minWidth: 960, minHeight: 680 }
    : { width: 1280, height: 800, minWidth: 900, minHeight: 620 }
  const win = new BrowserWindow({
    ...windowSize,
    icon: resolveAppIconPath(),
    ...titleBarOptionsForPlatform(process.platform),
    webPreferences: {
      preload: resolvePreloadPath(),
      sandbox: false,
    },
  })

  bindTitlebarChromeToZoom(win, process.platform)
  bindWindowRenderDiagnostics(win)
  loadRenderer(win, { route: context.route, search: context.search })
  bindDevtoolsShortcut(win)
  return win
}
