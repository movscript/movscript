import type { BrowserWindow, Rectangle } from 'electron'
import {
  emptyState,
  HIDDEN_BOUNDS,
  normalizeAgentBrowserBounds,
  normalizeRendererAgentBrowserBounds,
  normalizeTabId,
  type AgentBrowserBounds,
  type AgentBrowserState,
} from './agentBrowser/state'
import {
  createAgentBrowserWebTab,
  destroyAgentBrowserWebTab,
  type AgentBrowserWebTab,
} from './agentBrowser/tab'
import { normalizeAgentBrowserURL } from './agentBrowser/url'

export { normalizeAgentBrowserBounds }
export type { AgentBrowserBounds, AgentBrowserState }

const controllers = new WeakMap<BrowserWindow, AgentBrowserController>()
const AGENT_BROWSER_DIAGNOSTICS_ENV = 'MOVSCRIPT_AGENT_BROWSER_DIAGNOSTICS'

function agentBrowserDiagnosticsEnabled(): boolean {
  const value = process.env[AGENT_BROWSER_DIAGNOSTICS_ENV]
  if (!value) return false
  return !['0', 'false', 'off', 'no'].includes(value.toLowerCase())
}

function formatBounds(bounds: AgentBrowserBounds | Rectangle | null | undefined): string {
  if (!bounds) return 'hidden'
  return `${bounds.width}x${bounds.height}+${bounds.x}+${bounds.y}`
}

export function getAgentBrowserController(win: BrowserWindow): AgentBrowserController {
  const existing = controllers.get(win)
  if (existing) return existing
  const controller = new AgentBrowserController(win)
  controllers.set(win, controller)
  win.once('closed', () => controller.destroy())
  return controller
}

export class AgentBrowserController {
  private activeTabId: string | null = null
  private bounds: Rectangle | null = null
  private readonly tabs = new Map<string, AgentBrowserWebTab>()
  private readonly lastBoundsLogSignatures = new Map<string, string>()

  constructor(private readonly win: BrowserWindow) {}

  navigate(input: { tabId?: string; url: string; bounds?: Partial<AgentBrowserBounds> | null }): AgentBrowserState {
    const tabId = normalizeTabId(input.tabId)
    const url = normalizeAgentBrowserURL(input.url)
    const tab = this.ensureTab(tabId)
    this.activate({ tabId, bounds: input.bounds })
    tab.state = { ...tab.state, url, error: undefined, loading: true }
    void tab.view.webContents.loadURL(url).catch((error) => {
      this.updateState(tabId, { loading: false, error: error instanceof Error ? error.message : String(error) })
    })
    this.publishState(tabId)
    return tab.state
  }

  activate(input: { tabId?: string; bounds?: Partial<AgentBrowserBounds> | null }): AgentBrowserState {
    const tabId = normalizeTabId(input.tabId)
    const tab = this.tabs.get(tabId)
    if (!tab) return emptyState(tabId)
    this.activeTabId = tabId
    this.setBounds(input.bounds)
    return this.readState(tabId)
  }

  setBounds(input?: Partial<AgentBrowserBounds> | null): AgentBrowserState {
    const bounds = normalizeRendererAgentBrowserBounds(input, this.win.webContents.getZoomFactor())
    this.logBounds('setBounds', normalizeAgentBrowserBounds(input), bounds)
    this.bounds = bounds
    if (!bounds) {
      this.hideAllViews()
      return this.activeTabId ? this.updateState(this.activeTabId, { visible: false }) : emptyState()
    }
    return this.showActiveView()
  }

  goBack(tabId?: string): AgentBrowserState {
    const tab = this.tabForAction(tabId)
    if (tab?.view.webContents.canGoBack()) tab.view.webContents.goBack()
    return tab ? this.readState(tab.id) : emptyState(normalizeTabId(tabId))
  }

  goForward(tabId?: string): AgentBrowserState {
    const tab = this.tabForAction(tabId)
    if (tab?.view.webContents.canGoForward()) tab.view.webContents.goForward()
    return tab ? this.readState(tab.id) : emptyState(normalizeTabId(tabId))
  }

  reload(tabId?: string): AgentBrowserState {
    const tab = this.tabForAction(tabId)
    tab?.view.webContents.reload()
    return tab ? this.readState(tab.id) : emptyState(normalizeTabId(tabId))
  }

  stop(tabId?: string): AgentBrowserState {
    const tab = this.tabForAction(tabId)
    tab?.view.webContents.stop()
    return tab ? this.readState(tab.id) : emptyState(normalizeTabId(tabId))
  }

  hide(): AgentBrowserState {
    return this.setBounds(null)
  }

  close(tabId?: string): AgentBrowserState {
    const resolvedTabId = normalizeTabId(tabId)
    const tab = this.tabs.get(resolvedTabId)
    if (!tab) return emptyState(resolvedTabId)
    this.tabs.delete(resolvedTabId)
    if (this.activeTabId === resolvedTabId) this.activeTabId = null
    destroyAgentBrowserWebTab(this.win, tab)
    return emptyState(resolvedTabId)
  }

  getState(tabId?: string): AgentBrowserState {
    const resolvedTabId = normalizeTabId(tabId)
    return this.tabs.has(resolvedTabId) ? this.readState(resolvedTabId) : emptyState(resolvedTabId)
  }

  destroy(): void {
    for (const tab of this.tabs.values()) {
      destroyAgentBrowserWebTab(this.win, tab)
    }
    this.tabs.clear()
    this.activeTabId = null
  }

  private ensureTab(tabId: string): AgentBrowserWebTab {
    const existing = this.tabs.get(tabId)
    if (existing) return existing
    const tab = createAgentBrowserWebTab(this.win, tabId, {
      readState: (id) => this.readState(id),
      updateState: (id, patch) => this.updateState(id, patch),
    })
    this.tabs.set(tabId, tab)
    return tab
  }

  private readState(tabId: string): AgentBrowserState {
    const tab = this.tabs.get(tabId)
    const wc = tab?.view.webContents
    if (!tab || !wc) return emptyState(tabId)
    return this.updateState(tabId, {
      url: wc.getURL() || tab.state.url,
      title: wc.getTitle(),
      loading: wc.isLoading(),
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward(),
    })
  }

  private updateState(tabId: string, patch: Partial<AgentBrowserState>): AgentBrowserState {
    const tab = this.tabs.get(tabId)
    if (!tab) return emptyState(tabId)
    tab.state = {
      ...tab.state,
      ...patch,
      tabId,
      visible: this.activeTabId === tabId && !!this.bounds,
    }
    this.publishState(tabId)
    return tab.state
  }

  private publishState(tabId: string): void {
    if (this.win.isDestroyed()) return
    const tab = this.tabs.get(tabId)
    this.win.webContents.send('agent-browser:state', tab?.state ?? emptyState(tabId))
  }

  private hideAllViews(): void {
    for (const tab of this.tabs.values()) {
      tab.view.setVisible(false)
      tab.view.setBounds(HIDDEN_BOUNDS)
      tab.state = { ...tab.state, visible: false }
      this.publishState(tab.id)
    }
  }

  private showActiveView(): AgentBrowserState {
    if (!this.activeTabId || !this.bounds) {
      this.hideAllViews()
      return emptyState(this.activeTabId ?? undefined)
    }
    let activeState: AgentBrowserState = emptyState(this.activeTabId)
    for (const tab of this.tabs.values()) {
      if (tab.id === this.activeTabId) {
        this.logBounds('showActiveView', null, this.bounds, tab.id)
        tab.view.setBounds(this.bounds)
        tab.view.setVisible(true)
        activeState = this.updateState(tab.id, { visible: true })
      } else {
        tab.view.setVisible(false)
        tab.view.setBounds(HIDDEN_BOUNDS)
        this.updateState(tab.id, { visible: false })
      }
    }
    return activeState
  }

  private tabForAction(tabId?: string): AgentBrowserWebTab | undefined {
    return this.tabs.get(normalizeTabId(tabId ?? this.activeTabId ?? undefined))
  }

  private logBounds(
    reason: string,
    rendererBounds: AgentBrowserBounds | null,
    electronBounds: AgentBrowserBounds | null,
    tabId = this.activeTabId ?? 'none',
  ): void {
    if (this.win.isDestroyed() || this.win.webContents.isDestroyed()) return
    const contentBounds = this.win.getContentBounds()
    const zoomFactor = this.win.webContents.getZoomFactor()
    const suspicious = isSuspiciousAgentBrowserBounds(electronBounds, contentBounds, zoomFactor)
    if (!agentBrowserDiagnosticsEnabled() && !suspicious) return

    const signature = [
      reason,
      tabId,
      formatBounds(rendererBounds),
      formatBounds(electronBounds),
      formatBounds(contentBounds),
      zoomFactor.toFixed(3),
      suspicious ? 'suspicious' : 'ok',
    ].join('|')
    if (this.lastBoundsLogSignatures.get(tabId) === signature) return
    this.lastBoundsLogSignatures.set(tabId, signature)

    const message = [
      `[agent-browser:bounds] ${suspicious ? 'suspicious ' : ''}${reason}`,
      `tab=${tabId}`,
      `renderer=${formatBounds(rendererBounds)}`,
      `electron=${formatBounds(electronBounds)}`,
      `content=${formatBounds(contentBounds)}`,
      `zoom=${zoomFactor.toFixed(3)}`,
    ].join(' ')
    if (suspicious) console.warn(message)
    else console.info(message)
  }
}

function isSuspiciousAgentBrowserBounds(
  bounds: AgentBrowserBounds | null,
  contentBounds: Rectangle,
  zoomFactor: number,
): boolean {
  if (!bounds) return false
  if (!Number.isFinite(zoomFactor) || zoomFactor <= 0) return true
  if (zoomFactor > 2 || zoomFactor < 0.5) return true

  const margin = 64
  if (bounds.x < -margin || bounds.y < -margin) return true
  if (bounds.width > contentBounds.width + margin) return true
  if (bounds.height > contentBounds.height + margin) return true
  if (bounds.x + bounds.width > contentBounds.width + margin) return true
  if (bounds.y + bounds.height > contentBounds.height + margin) return true

  const contentArea = Math.max(1, contentBounds.width * contentBounds.height)
  const boundsArea = bounds.width * bounds.height
  return boundsArea > contentArea * 1.25
}
