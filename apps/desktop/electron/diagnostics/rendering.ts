import { app, type BrowserWindow } from 'electron'

const CHROMIUM_RENDER_DIAGNOSTICS_ENV = 'MOVSCRIPT_CHROMIUM_RENDER_DIAGNOSTICS'
const RENDERER_DIAGNOSTIC_PREFIXES = [
  '[agent-mode:paint]',
  '[canvas:render]',
  '[canvas:media]',
]

function envFlagEnabled(name: string): boolean {
  const value = process.env[name]
  if (!value) return false
  return !['0', 'false', 'off', 'no'].includes(value.toLowerCase())
}

export function chromiumRenderDiagnosticsEnabled(): boolean {
  return envFlagEnabled(CHROMIUM_RENDER_DIAGNOSTICS_ENV)
}

export function installChromiumRenderDiagnostics(): void {
  if (!chromiumRenderDiagnosticsEnabled()) return

  app.commandLine.appendSwitch('enable-logging', 'stderr')
  app.commandLine.appendSwitch(
    'vmodule',
    [
      '*/tile_manager*=2',
      '*/picture_layer_tiling*=2',
      '*/cc/resources*=1',
      '*/gpu*=1',
    ].join(','),
  )
  app.commandLine.appendSwitch('enable-precise-memory-info')

  app.on('child-process-gone', (_event, details) => {
    console.warn(
      `[rendering-diagnostics] child-process-gone type=${details.type} reason=${details.reason} exitCode=${details.exitCode} service=${details.serviceName ?? ''}`,
    )
  })

  console.info(
    `[rendering-diagnostics] enabled via ${CHROMIUM_RENDER_DIAGNOSTICS_ENV}=1; Chromium tile/gpu logs will be written to stderr`,
  )
}

export function bindWindowRenderDiagnostics(win: BrowserWindow): void {
  bindRendererDiagnosticConsole(win)

  if (!chromiumRenderDiagnosticsEnabled()) return

  const logWindowState = (reason: string) => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return
    const bounds = win.getBounds()
    const contentBounds = win.getContentBounds()
    console.info(
      `[rendering-diagnostics] window ${reason} bounds=${bounds.width}x${bounds.height}+${bounds.x}+${bounds.y} content=${contentBounds.width}x${contentBounds.height}+${contentBounds.x}+${contentBounds.y} zoom=${win.webContents.getZoomFactor().toFixed(3)} pid=${win.webContents.getOSProcessId()}`,
    )
  }

  logWindowState('created')
  win.on('resize', () => logWindowState('resize'))
  win.webContents.on('zoom-changed', () => logWindowState('zoom-changed'))
  win.webContents.on('render-process-gone', (_event, details) => {
    console.warn(
      `[rendering-diagnostics] render-process-gone reason=${details.reason} exitCode=${details.exitCode}`,
    )
  })
}

function bindRendererDiagnosticConsole(win: BrowserWindow): void {
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (!RENDERER_DIAGNOSTIC_PREFIXES.some((prefix) => message.startsWith(prefix))) return
    const levelName = ['log', 'warn', 'error', 'debug'].at(level) ?? String(level)
    console.info(`[renderer-diagnostics] level=${levelName} ${message} source=${sourceId}:${line}`)
  })
}
