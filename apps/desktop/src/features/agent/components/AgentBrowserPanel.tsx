import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Square,
} from 'lucide-react'
import {
  AgentBrowserRoot,
  AgentBrowserViewport,
} from '@/features/agent/components/AgentBrowserUi'
import type { Project } from '@/types'
import { activateEmbeddedBrowser, closeEmbeddedBrowser, embeddedBrowserAvailable, goBackEmbeddedBrowser, goForwardEmbeddedBrowser, hideEmbeddedBrowser, navigateEmbeddedBrowser, reloadEmbeddedBrowser, stopEmbeddedBrowser, subscribeEmbeddedBrowserState } from '@/features/agent/application/embeddedBrowserElectron'
import { agentBrowserBoundsFromViewportElement, subscribeAgentBrowserBoundsSync, type AgentBrowserBounds } from '@/features/agent/presentation/agentBrowserBounds'
import {
  AGENT_PROJECT_HOME_TAB_ID,
  AGENT_SESSION_OUTPUT_TAB_ID,
  createBlankAgentBrowserTab,
  createDefaultAgentBrowserContentState,
  createProjectHomeAgentBrowserTab,
  DEFAULT_AGENT_CONTENT_AREA_ID,
  useAgentContentAreaStore,
  type AgentBrowserContentTab,
  type AgentBrowserWebTabState,
} from '@/features/agent/state/agentContentAreaStore'
import { AgentBrowserTabContent } from '@/features/agent/components/AgentBrowserTabContent'
import { AgentBrowserPanelHeader } from '@/features/agent/components/AgentBrowserPanelHeader'
import {
  EMPTY_AGENT_BROWSER_WEB_STATE,
  createAgentBrowserTabId,
  isSingleDefaultBlankBrowserState,
  isSingleDefaultProjectHomeBrowserState,
} from '@/features/agent/components/AgentBrowserPanelModel'

export interface AgentBrowserPanelProps {
  contentAreaId?: string | null
  conversationId?: string | null
  project?: Project | null
}

export function AgentBrowserPanel({ contentAreaId, conversationId, project = null }: AgentBrowserPanelProps = {}) {
  const resolvedContentAreaId = contentAreaId?.trim() || DEFAULT_AGENT_CONTENT_AREA_ID
  const sessionConversationId = conversationId?.trim() || resolvedContentAreaId
  const hasProject = typeof project?.ID === 'number' && project.ID > 0
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const ensureContentArea = useAgentContentAreaStore((state) => state.ensureContentArea)
  const updateBrowserState = useAgentContentAreaStore((state) => state.updateBrowserState)
  const browserState = useAgentContentAreaStore((state) => (
    state.contentAreasByConversation[resolvedContentAreaId]?.browser
  ))
  const fallbackBrowserState = useMemo(
    () => createDefaultAgentBrowserContentState(Date.now(), { defaultTab: hasProject ? 'project_home' : 'blank' }),
    [hasProject],
  )
  const { tabs, activeTabId, webStates } = browserState ?? fallbackBrowserState
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [addressWorkspace, setAddressWorkspace] = useState('')
  const [toolbarAddressWorkspace, setToolbarAddressWorkspace] = useState('')
  const [error, setError] = useState<string | null>(null)
  const available = embeddedBrowserAvailable()
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]
  const activeWebState = activeTab?.kind === 'web' ? webStates[activeTab.id] ?? { ...EMPTY_AGENT_BROWSER_WEB_STATE, tabId: activeTab.id, url: activeTab.url ?? '' } : null
  const activeWebURL = activeTab?.kind === 'web' ? activeWebState?.url || activeTab.url || '' : ''

  useEffect(() => {
    ensureContentArea(resolvedContentAreaId, { defaultTab: hasProject ? 'project_home' : 'blank' })
  }, [ensureContentArea, hasProject, resolvedContentAreaId])

  useEffect(() => {
    updateBrowserState(resolvedContentAreaId, (current) => {
      if (hasProject && isSingleDefaultBlankBrowserState(current)) {
        return createDefaultAgentBrowserContentState(Date.now(), { defaultTab: 'project_home' })
      }
      if (!hasProject && isSingleDefaultProjectHomeBrowserState(current)) {
        return createDefaultAgentBrowserContentState(Date.now(), { defaultTab: 'blank' })
      }
      return current
    })
  }, [hasProject, resolvedContentAreaId, updateBrowserState])

  const setTabs = useCallback((nextTabs: AgentBrowserContentTab[] | ((current: AgentBrowserContentTab[]) => AgentBrowserContentTab[])) => {
    updateBrowserState(resolvedContentAreaId, (current) => ({
      ...current,
      tabs: typeof nextTabs === 'function' ? nextTabs(current.tabs) : nextTabs,
    }))
  }, [resolvedContentAreaId, updateBrowserState])

  const setActiveTabId = useCallback((nextActiveTabId: string) => {
    updateBrowserState(resolvedContentAreaId, (current) => ({
      ...current,
      activeTabId: nextActiveTabId,
    }))
  }, [resolvedContentAreaId, updateBrowserState])

  const setWebStates = useCallback((
    updater: (current: Record<string, AgentBrowserWebTabState>) => Record<string, AgentBrowserWebTabState>,
  ) => {
    updateBrowserState(resolvedContentAreaId, (current) => ({
      ...current,
      webStates: updater(current.webStates),
    }))
  }, [resolvedContentAreaId, updateBrowserState])

  const readBounds = useCallback((): AgentBrowserBounds | null => (
    agentBrowserBoundsFromViewportElement(viewportRef.current)
  ), [])

  const syncBounds = useCallback(() => {
    if (!available) return
    if (!activeTab || activeTab.kind !== 'web' || !(activeWebState?.url || activeTab.url)) {
      void hideEmbeddedBrowser()
      return
    }
    void activateEmbeddedBrowser({ tabId: activeTab.id, bounds: readBounds() })
  }, [activeTab, activeWebState?.url, available, readBounds])

  useEffect(() => {
    if (!available) return
    const unsubscribe = subscribeEmbeddedBrowserState((next) => {
      setWebStates((current) => ({ ...current, [next.tabId]: next }))
      if (next.title || next.url) {
        setTabs((current) => current.map((tab) => (
          tab.id === next.tabId && tab.kind === 'web'
            ? { ...tab, title: next.title || next.url, url: next.url || tab.url }
            : tab
        )))
      }
      if (next.error) setError(next.error)
    })
    return () => unsubscribe?.()
  }, [available, setTabs, setWebStates])

  useEffect(() => {
    syncBounds()
    return subscribeAgentBrowserBoundsSync(viewportRef.current, syncBounds)
  }, [syncBounds])

  useEffect(() => {
    return () => {
      void hideEmbeddedBrowser()
    }
  }, [])

  useEffect(() => {
    setToolbarAddressWorkspace(activeWebURL)
  }, [activeTabId, activeWebURL])

  async function navigateWebTab(tabId: string, rawURL: string) {
    const url = rawURL.trim()
    if (!url) return
    if (!available) {
      setError('当前运行环境不支持内嵌浏览器，请在 Electron 桌面端使用。')
      return
    }
    setError(null)
    setWebStates((current) => ({
      ...current,
      [tabId]: { ...(current[tabId] ?? EMPTY_AGENT_BROWSER_WEB_STATE), tabId, url, loading: true, error: undefined },
    }))
    try {
      const next = await navigateEmbeddedBrowser({
        tabId,
        url,
        bounds: readBounds(),
      })
      if (next) setWebStates((current) => ({ ...current, [tabId]: next }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setWebStates((current) => ({
        ...current,
        [tabId]: { ...(current[tabId] ?? EMPTY_AGENT_BROWSER_WEB_STATE), tabId, loading: false, error: caught instanceof Error ? caught.message : String(caught) },
      }))
    }
  }

  function openProjectHomeTab() {
    if (!hasProject) {
      openBlankWebTab()
      return
    }
    if (!tabs.some((tab) => tab.id === AGENT_PROJECT_HOME_TAB_ID)) {
      setTabs((current) => [createProjectHomeAgentBrowserTab(), ...current])
    }
    setActiveTabId(AGENT_PROJECT_HOME_TAB_ID)
    setLauncherOpen(false)
  }

  function openBlankWebTab() {
    const id = createAgentBrowserTabId('web', resolvedContentAreaId)
    setTabs((current) => [...current, { id, kind: 'web', title: '空白页', createdAt: Date.now() }])
    setActiveTabId(id)
    setLauncherOpen(false)
    setAddressWorkspace('')
  }

  function openInternalTab(kind: 'resources' | 'external_resources' | 'canvas_list' | 'editing_projects' | 'project_standards' | 'session_output', title: string, options?: { replaceActiveBlank?: boolean }) {
    const replaceActiveBlank = options?.replaceActiveBlank && activeTab?.kind === 'web' && !activeTab.url && !activeWebState?.url
    if (replaceActiveBlank && activeTab?.kind === 'web') {
      setTabs((current) => current.map((tab) => (
        tab.id === activeTab.id && tab.kind === 'web'
          ? { id: tab.id, kind, title, createdAt: tab.createdAt }
          : tab
      )))
      setActiveTabId(activeTab.id)
      setLauncherOpen(false)
      return
    }

    const existing = tabs.find((tab) => tab.kind === kind)
    if (existing) {
      setActiveTabId(existing.id)
      setLauncherOpen(false)
      return
    }

    const id = createAgentBrowserTabId(kind, resolvedContentAreaId)
    setTabs((current) => [...current, { id, kind, title, createdAt: Date.now() }])
    setActiveTabId(id)
    setLauncherOpen(false)
  }

  function openResourceLibraryTab() {
    openInternalTab('resources', '资源库')
  }

  function openResourceLibraryInCurrentTab() {
    openInternalTab('resources', '资源库', { replaceActiveBlank: true })
  }

  function openExternalResourceLibraryTab() {
    openInternalTab('external_resources', '外部资源')
  }

  function openExternalResourceLibraryInCurrentTab() {
    openInternalTab('external_resources', '外部资源', { replaceActiveBlank: true })
  }

  function openCanvasListInCurrentTab() {
    openInternalTab('canvas_list', '画布列表', { replaceActiveBlank: true })
  }

  function openCanvasListTab() {
    openInternalTab('canvas_list', '画布列表')
  }

  function openEditingProjectsTab() {
    openInternalTab('editing_projects', '剪辑')
  }

  function openEditingProjectsInCurrentTab() {
    openInternalTab('editing_projects', '剪辑', { replaceActiveBlank: true })
  }

  function openProjectStandardsTab() {
    openInternalTab('project_standards', '项目规范')
  }

  function openSessionOutputTab() {
    const existing = tabs.find((tab) => tab.kind === 'session_output')
    if (existing) {
      setActiveTabId(existing.id)
      setLauncherOpen(false)
      return
    }
    setTabs((current) => [...current, {
      id: AGENT_SESSION_OUTPUT_TAB_ID,
      kind: 'session_output',
      title: '会话产出',
      createdAt: Date.now(),
    }])
    setActiveTabId(AGENT_SESSION_OUTPUT_TAB_ID)
    setLauncherOpen(false)
  }

  async function openWebFromLauncher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const url = addressWorkspace.trim()
    if (!url) return
    const existingBlank = activeTab?.kind === 'web' && !activeTab.url && !activeWebState?.url ? activeTab : null
    const id = existingBlank?.id ?? createAgentBrowserTabId('web', resolvedContentAreaId)
    if (!existingBlank) {
      setTabs((current) => [...current, { id, kind: 'web', title: url, url, createdAt: Date.now() }])
      setActiveTabId(id)
    } else {
      setTabs((current) => current.map((tab) => tab.id === id && tab.kind === 'web' ? { ...tab, title: url, url } : tab))
    }
    setLauncherOpen(false)
    setAddressWorkspace('')
    await navigateWebTab(id, url)
  }

  async function submitToolbarAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (activeTab?.kind !== 'web') return
    const url = toolbarAddressWorkspace.trim()
    if (!url) return
    setTabs((current) => current.map((tab) => (
      tab.id === activeTab.id && tab.kind === 'web'
        ? { ...tab, title: url, url }
        : tab
    )))
    await navigateWebTab(activeTab.id, url)
  }

  function closeTab(tabId: string) {
    const closingIndex = tabs.findIndex((tab) => tab.id === tabId)
    const closingTab = tabs[closingIndex]
    if (!closingTab) return
    const remaining = tabs.filter((tab) => tab.id !== tabId)
    const nextActiveTab = activeTabId === tabId
      ? remaining[Math.max(0, closingIndex - 1)] ?? remaining[0]
      : activeTab
    if (closingTab.kind === 'web') {
      if (activeTabId === tabId && nextActiveTab?.kind === 'web' && (webStates[nextActiveTab.id]?.url || nextActiveTab.url)) {
        void activateEmbeddedBrowser({ tabId: nextActiveTab.id, bounds: readBounds() })
      }
      void closeEmbeddedBrowser({ tabId })
      setWebStates((current) => {
        const next = { ...current }
        delete next[tabId]
        return next
      })
    }
    if (remaining.length === 0) {
      const fallback: AgentBrowserContentTab = hasProject
        ? createProjectHomeAgentBrowserTab()
        : createBlankAgentBrowserTab()
      setTabs([fallback])
      setActiveTabId(fallback.id)
      return
    }
    setTabs(remaining)
    if (activeTabId === tabId) {
      setActiveTabId(remaining[Math.max(0, closingIndex - 1)]?.id ?? remaining[0].id)
    }
  }

  const webNavigationDisabled = !available || activeTab?.kind !== 'web' || !(activeWebState?.url || activeTab.url)
  const toolbarActions = useMemo(() => [
    {
      label: '后退',
      icon: ArrowLeft,
      disabled: webNavigationDisabled || !activeWebState?.canGoBack,
      action: () => { if (activeTab?.kind === 'web') void goBackEmbeddedBrowser({ tabId: activeTab.id }) },
    },
    {
      label: '前进',
      icon: ArrowRight,
      disabled: webNavigationDisabled || !activeWebState?.canGoForward,
      action: () => { if (activeTab?.kind === 'web') void goForwardEmbeddedBrowser({ tabId: activeTab.id }) },
    },
    {
      label: activeWebState?.loading ? '停止加载' : '刷新',
      icon: activeWebState?.loading ? Square : RefreshCw,
      disabled: webNavigationDisabled,
      action: () => {
        if (activeTab?.kind !== 'web') return
        void (activeWebState?.loading
          ? stopEmbeddedBrowser({ tabId: activeTab.id })
          : reloadEmbeddedBrowser({ tabId: activeTab.id }))
      },
    },
  ], [activeTab, activeWebState?.canGoBack, activeWebState?.canGoForward, activeWebState?.loading, webNavigationDisabled])

  return (
    <AgentBrowserRoot>
      <AgentBrowserPanelHeader
        tabs={tabs}
        activeTabId={activeTabId}
        activeTab={activeTab}
        activeWebState={activeWebState}
        webStates={webStates}
        projectName={project?.name}
        hasProject={hasProject}
        available={available}
        launcherOpen={launcherOpen}
        addressWorkspace={addressWorkspace}
        toolbarAddressWorkspace={toolbarAddressWorkspace}
        error={error}
        toolbarActions={toolbarActions}
        onSetLauncherOpen={setLauncherOpen}
        onSetAddressWorkspace={setAddressWorkspace}
        onSetToolbarAddressWorkspace={setToolbarAddressWorkspace}
        onOpenProjectHomeTab={openProjectHomeTab}
        onOpenBlankWebTab={openBlankWebTab}
        onOpenResourceLibraryTab={openResourceLibraryTab}
        onOpenExternalResourceLibraryTab={openExternalResourceLibraryTab}
        onOpenCanvasListTab={openCanvasListTab}
        onOpenEditingProjectsTab={openEditingProjectsTab}
        onOpenProjectStandardsTab={openProjectStandardsTab}
        onOpenSessionOutputTab={openSessionOutputTab}
        onSetActiveTabId={setActiveTabId}
        onCloseTab={closeTab}
        onOpenWebFromLauncher={openWebFromLauncher}
        onSubmitToolbarAddress={submitToolbarAddress}
      />
      <AgentBrowserViewport ref={viewportRef}>
        <AgentBrowserTabContent
          activeTab={activeTab}
          activeWebState={activeWebState}
          project={project}
          sessionConversationId={sessionConversationId}
          onOpenProjectStandards={openProjectStandardsTab}
          onOpenResourceLibrary={openResourceLibraryTab}
          onOpenExternalResourceLibrary={openExternalResourceLibraryTab}
          onOpenCanvasList={openCanvasListTab}
          onOpenEditingProjects={openEditingProjectsTab}
          onOpenResourceLibraryInCurrentTab={openResourceLibraryInCurrentTab}
          onOpenExternalResourceLibraryInCurrentTab={openExternalResourceLibraryInCurrentTab}
          onOpenCanvasListInCurrentTab={openCanvasListInCurrentTab}
          onOpenEditingProjectsInCurrentTab={openEditingProjectsInCurrentTab}
          onNavigateBlankWebTab={(tabId, url) => {
            setAddressWorkspace(url)
            void navigateWebTab(tabId, url)
          }}
        />
      </AgentBrowserViewport>
    </AgentBrowserRoot>
  )
}
