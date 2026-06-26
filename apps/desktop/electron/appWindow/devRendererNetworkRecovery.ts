import type { BrowserWindow } from 'electron'

const CHROMIUM_ERR_NETWORK_CHANGED = -21
const DEV_RENDERER_NETWORK_RETRY_DELAY_MS = 350
const DEV_RENDERER_NETWORK_MAX_RETRIES = 3
const DEV_RENDERER_NETWORK_STABLE_RESET_MS = 5_000

export function installDevRendererNetworkRecovery(win: BrowserWindow, rendererURL: string, targetURL: string): void {
  const rendererOriginPattern = `${new URL(rendererURL).origin}/*`
  let retryCount = 0
  let pendingRetryFailedURL: string | null = null
  let retryTimer: NodeJS.Timeout | null = null
  let stableTimer: NodeJS.Timeout | null = null

  const clearRetryTimer = () => {
    if (!retryTimer) return
    clearTimeout(retryTimer)
    retryTimer = null
    pendingRetryFailedURL = null
  }

  const clearStableTimer = () => {
    if (!stableTimer) return
    clearTimeout(stableTimer)
    stableTimer = null
  }

  const clearTimers = () => {
    clearRetryTimer()
    clearStableTimer()
  }

  const scheduleRetry = (failedURL: string) => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return
    pendingRetryFailedURL = failedURL
    if (retryTimer) return

    if (retryCount >= DEV_RENDERER_NETWORK_MAX_RETRIES) {
      console.warn(`[renderer] dev server load failed with ERR_NETWORK_CHANGED after ${retryCount} retries: ${failedURL}`)
      return
    }

    retryCount += 1
    clearStableTimer()
    retryTimer = setTimeout(() => {
      const retryFailedURL = pendingRetryFailedURL ?? failedURL
      retryTimer = null
      pendingRetryFailedURL = null
      if (win.isDestroyed() || win.webContents.isDestroyed()) return
      console.warn(`[renderer] retrying dev renderer load after ERR_NETWORK_CHANGED (${retryCount}/${DEV_RENDERER_NETWORK_MAX_RETRIES}): ${retryFailedURL}`)
      void win.loadURL(targetURL)
    }, DEV_RENDERER_NETWORK_RETRY_DELAY_MS)
  }

  win.webContents.on('did-fail-load', (_event, errorCode, _errorDescription, validatedURL) => {
    if (errorCode !== CHROMIUM_ERR_NETWORK_CHANGED) return
    scheduleRetry(validatedURL || rendererURL)
  })

  win.webContents.session.webRequest.onErrorOccurred({ urls: [rendererOriginPattern] }, (details) => {
    if (details.error !== 'net::ERR_NETWORK_CHANGED') return
    scheduleRetry(details.url)
  })

  win.webContents.on('did-finish-load', () => {
    clearStableTimer()
    stableTimer = setTimeout(() => {
      retryCount = 0
      stableTimer = null
    }, DEV_RENDERER_NETWORK_STABLE_RESET_MS)
  })

  win.on('closed', clearTimers)
}
