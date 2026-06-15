import {
  AGENT_BLANK_TAB_ID,
  AGENT_PROJECT_HOME_TAB_ID,
  type AgentBrowserContentTab,
  type AgentBrowserWebTabState,
} from '@/features/agent/state/agentContentAreaStore'

export const EMPTY_AGENT_BROWSER_WEB_STATE: AgentBrowserWebTabState = {
  tabId: '',
  visible: false,
  url: '',
  title: '',
  loading: false,
  canGoBack: false,
  canGoForward: false,
}

export function createAgentBrowserTabId(prefix: string, scope = '') {
  const scopeSegment = scope.trim().replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 36)
  return [
    prefix,
    scopeSegment,
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 7),
  ].filter(Boolean).join('_')
}

export function agentBrowserTabTitle(tab: AgentBrowserContentTab, webState: AgentBrowserWebTabState | undefined, projectName?: string) {
  if (tab.kind === 'project_home') return projectName ? `${projectName}` : '内容导航'
  if (tab.kind === 'resources') return tab.title
  if (tab.kind === 'external_resources') return tab.title
  if (tab.kind === 'canvas_list') return tab.title
  if (tab.kind === 'project_standards') return tab.title
  if (tab.kind === 'session_output') return tab.title
  return webState?.title || tab.title || webState?.url || tab.url || '空白页'
}

export function isSingleDefaultProjectHomeBrowserState(state: { tabs: AgentBrowserContentTab[]; activeTabId: string }) {
  return state.tabs.length === 1
    && state.activeTabId === AGENT_PROJECT_HOME_TAB_ID
    && state.tabs[0]?.id === AGENT_PROJECT_HOME_TAB_ID
    && state.tabs[0]?.kind === 'project_home'
}

export function isSingleDefaultBlankBrowserState(state: { tabs: AgentBrowserContentTab[]; activeTabId: string }) {
  const tab = state.tabs[0]
  return state.tabs.length === 1
    && state.activeTabId === AGENT_BLANK_TAB_ID
    && tab?.id === AGENT_BLANK_TAB_ID
    && tab.kind === 'web'
    && !tab.url
}
