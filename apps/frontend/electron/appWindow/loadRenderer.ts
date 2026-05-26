import type { BrowserWindow } from 'electron'
import { resolveRendererHTMLPath } from './paths'

export function loadRenderer(win: BrowserWindow): void {
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.webContents.session.clearCache().finally(() => {
      void win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
    })
    return
  }

  win.loadFile(resolveRendererHTMLPath())
}
