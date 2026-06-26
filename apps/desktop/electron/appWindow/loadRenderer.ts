import type { BrowserWindow } from 'electron'
import { installDevRendererNetworkRecovery } from './devRendererNetworkRecovery'
import { resolveRendererHTMLPath } from './paths'

export interface RendererRouteTarget {
  route?: string
  search?: string
}

export function loadRenderer(win: BrowserWindow, target: RendererRouteTarget = {}): void {
  const rendererURL = process.env['ELECTRON_RENDERER_URL']
  const route = rendererTargetPath(target)
  if (rendererURL) {
    const targetURL = new URL(route, rendererURL).toString()
    installDevRendererNetworkRecovery(win, rendererURL, targetURL)
    void win.webContents.session.clearCache().finally(() => {
      void win.loadURL(targetURL)
    })
    return
  }

  win.loadFile(resolveRendererHTMLPath(), route === '/' ? undefined : { hash: route })
}

function rendererTargetPath(target: RendererRouteTarget): string {
  const route = target.route?.startsWith('/') ? target.route : '/'
  const search = target.search
    ? target.search.startsWith('?') ? target.search : `?${target.search}`
    : ''
  return `${route}${search}`
}
