import { WebContentsView, type BrowserWindow } from 'electron'
import { normalizeEmbeddedBrowserURL } from './url'
import { emptyState, HIDDEN_BOUNDS, type EmbeddedBrowserState } from './state'

export interface EmbeddedBrowserWebTab {
  id: string
  view: WebContentsView
  state: EmbeddedBrowserState
}

export interface EmbeddedBrowserTabEvents {
  readState: (tabId: string) => EmbeddedBrowserState
  updateState: (tabId: string, patch: Partial<EmbeddedBrowserState>) => EmbeddedBrowserState
}

export function createEmbeddedBrowserWebTab(
  win: BrowserWindow,
  tabId: string,
  events: EmbeddedBrowserTabEvents,
): EmbeddedBrowserWebTab {
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      partition: 'persist:movscript-ai-ui-browser',
    },
  })
  view.setBackgroundColor('#ffffff')
  view.setVisible(false)
  view.setBounds(HIDDEN_BOUNDS)
  win.contentView.addChildView(view)
  const tab: EmbeddedBrowserWebTab = {
    id: tabId,
    view,
    state: emptyState(tabId),
  }
  attachWebContentsEvents(tab, events)
  return tab
}

export function destroyEmbeddedBrowserWebTab(win: BrowserWindow, tab: EmbeddedBrowserWebTab): void {
  try {
    win.contentView.removeChildView(tab.view)
  } catch {
    // The BrowserWindow may already be destroyed.
  }
  tab.view.webContents.close()
}

function attachWebContentsEvents(tab: EmbeddedBrowserWebTab, events: EmbeddedBrowserTabEvents): void {
  const wc = tab.view.webContents
  wc.setWindowOpenHandler(({ url }) => {
    try {
      const normalizedURL = normalizeEmbeddedBrowserURL(url)
      void wc.loadURL(normalizedURL)
    } catch {
      // Drop unsupported protocols in the embedded browser.
    }
    return { action: 'deny' }
  })
  wc.on('did-start-loading', () => events.updateState(tab.id, { loading: true, error: undefined }))
  wc.on('did-stop-loading', () => events.readState(tab.id))
  wc.on('did-navigate', () => events.readState(tab.id))
  wc.on('did-navigate-in-page', () => events.readState(tab.id))
  wc.on('page-title-updated', (_event, title) => events.updateState(tab.id, { title }))
  wc.on('did-fail-load', (_event, code, description, validatedURL, isMainFrame) => {
    if (!isMainFrame) return
    if (code === -3) return
    events.updateState(tab.id, { loading: false, url: validatedURL || tab.state.url, error: description })
  })
}
