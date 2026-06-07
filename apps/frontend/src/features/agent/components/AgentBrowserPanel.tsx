import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  ArrowLeft,
  Boxes,
  Clapperboard,
  FileText,
  FolderOpen,
  Globe2,
  HardDrive,
  Home,
  LayoutTemplate,
  Loader2,
  PackageSearch,
  PenLine,
  MoreHorizontal,
  Plus,
  RefreshCw,
  ScanSearch,
  Search,
  Square,
  X,
  XCircle,
} from 'lucide-react'
import {
  AgentBrowserBadge,
  AgentBrowserAddressForm,
  AgentBrowserBlankContent,
  AgentBrowserBlankForm,
  AgentBrowserContentFlow,
  AgentBrowserContentGroup,
  AgentBrowserContentGroupCopy,
  AgentBrowserContentGroupDescription,
  AgentBrowserContentGroupHeader,
  AgentBrowserContentGroupIcon,
  AgentBrowserContentGroupIndex,
  AgentBrowserContentGroupItems,
  AgentBrowserContentGroupOverflow,
  AgentBrowserContentGroupState,
  AgentBrowserContentGroupTitle,
  AgentBrowserContentGroupTitleRow,
  AgentBrowserContentItem,
  AgentBrowserContentItemCopy,
  AgentBrowserContentItemDescription,
  AgentBrowserContentItemMeta,
  AgentBrowserContentItemTitle,
  AgentBrowserContentMatrix,
  AgentBrowserContentSummary,
  AgentBrowserContentSummaryGrid,
  AgentBrowserContentSummaryMain,
  AgentBrowserContentToolbar,
  AgentBrowserContentToolButton,
  AgentBrowserDividerSection,
  AgentBrowserHeader,
  AgentBrowserIconButton,
  AgentBrowserInternalPane,
  AgentBrowserInlineError,
  AgentBrowserInput,
  AgentBrowserInputRow,
  AgentBrowserKeyValue,
  AgentBrowserLauncherForm,
  AgentBrowserLauncherIcon,
  AgentBrowserLauncherSubmitButton,
  AgentBrowserMenuItemIcon,
  AgentBrowserMenuContent,
  AgentBrowserNavButton,
  AgentBrowserNavGrid,
  AgentBrowserProjectDescription,
  AgentBrowserProjectEmpty,
  AgentBrowserProjectHeader,
  AgentBrowserProjectHeaderCopy,
  AgentBrowserProjectMetaLabel,
  AgentBrowserProjectNavigationPage,
  AgentBrowserProjectPage,
  AgentBrowserProjectTitle,
  AgentBrowserResourcePane,
  AgentBrowserRoot,
  AgentBrowserSectionIntro,
  AgentBrowserSectionLabel,
  AgentBrowserTabBar,
  AgentBrowserTabButton,
  AgentBrowserTabCloseButton,
  AgentBrowserTabIcon,
  AgentBrowserTabList,
  AgentBrowserTabSurface,
  AgentBrowserToolbar,
  AgentBrowserUrlMeta,
  AgentBrowserViewport,
  AgentBrowserWebOverlay,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@movscript/ui'
import type { LucideIcon } from 'lucide-react'
import { CanvasListView } from '@/features/canvas/components/CanvasListView'
import { ProjectStandardsContent } from '@/features/project-standards/components/ProjectStandardsPage'
import { ExternalResourceSearchPage, ResourceLibraryView } from '@/features/resources/components/ResourcesPage'
import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import { isActiveSemanticEntityRecord } from '@/shared/domain/semanticEntityVisibility'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { workspaceOwnerContext } from '@/shared/infrastructure/session/workspaceOwnerContext'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'
import type { Script } from '@/types'
import { listWorkspaceScripts } from '@/features/scripts/application/scriptWorkspaceRepository'

type BrowserBounds = {
  x: number
  y: number
  width: number
  height: number
}

type WebTabState = {
  tabId: string
  visible: boolean
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error?: string
}

type AgentBrowserTab =
  | {
    id: string
    kind: 'project_home'
    title: string
    createdAt: number
  }
  | {
    id: string
    kind: 'web'
    title: string
    url?: string
    createdAt: number
  }
  | {
    id: string
    kind: 'resources'
    title: string
    createdAt: number
  }
  | {
    id: string
    kind: 'external_resources'
    title: string
    createdAt: number
  }
  | {
    id: string
    kind: 'canvas_list'
    title: string
    createdAt: number
  }
  | {
    id: string
    kind: 'project_standards'
    title: string
    createdAt: number
  }

interface ProjectNavigationGroup {
  key: string
  title: string
  description: string
  icon: LucideIcon
  tone: 'plan' | 'script' | 'asset' | 'production' | 'content'
  items: ProjectNavigationLink[]
  loading: boolean
}

interface ProjectNavigationLink {
  id: string
  title: string
  description: string
  to?: string
  onClick?: () => void
  status?: string
}

const EMPTY_WEB_STATE: WebTabState = {
  tabId: '',
  visible: false,
  url: '',
  title: '',
  loading: false,
  canGoBack: false,
  canGoForward: false,
}

function createTabId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function AgentBrowserPanel() {
  const project = useProjectStore((state) => state.current)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [tabs, setTabs] = useState<AgentBrowserTab[]>(() => [{
    id: 'project_home',
    kind: 'project_home',
    title: '内容导航',
    createdAt: Date.now(),
  }])
  const [activeTabId, setActiveTabId] = useState('project_home')
  const [webStates, setWebStates] = useState<Record<string, WebTabState>>({})
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [addressWorkspace, setAddressWorkspace] = useState('')
  const [toolbarAddressWorkspace, setToolbarAddressWorkspace] = useState('')
  const [error, setError] = useState<string | null>(null)
  const available = typeof window !== 'undefined' && typeof window.api?.embeddedBrowserNavigate === 'function'
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]
  const activeWebState = activeTab?.kind === 'web' ? webStates[activeTab.id] ?? { ...EMPTY_WEB_STATE, tabId: activeTab.id, url: activeTab.url ?? '' } : null
  const activeWebURL = activeTab?.kind === 'web' ? activeWebState?.url || activeTab.url || '' : ''

  const readBounds = useCallback((): BrowserBounds | null => {
    const viewport = viewportRef.current
    if (!viewport) return null
    const rect = viewport.getBoundingClientRect()
    if (rect.width < 16 || rect.height < 16) return null
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    }
  }, [])

  const syncBounds = useCallback(() => {
    if (!available) return
    if (!activeTab || activeTab.kind !== 'web' || !(activeWebState?.url || activeTab.url)) {
      void window.api?.embeddedBrowserHide?.()
      return
    }
    void window.api?.embeddedBrowserActivate?.({ tabId: activeTab.id, bounds: readBounds() })
  }, [activeTab, activeWebState?.url, available, readBounds])

  useEffect(() => {
    if (!available) return
    const unsubscribe = window.api?.onEmbeddedBrowserState?.((next) => {
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
  }, [available])

  useEffect(() => {
    syncBounds()
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(syncBounds)
    observer.observe(viewport)
    window.addEventListener('resize', syncBounds)
    window.addEventListener('scroll', syncBounds, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', syncBounds)
      window.removeEventListener('scroll', syncBounds, true)
    }
  }, [syncBounds])

  useEffect(() => {
    return () => {
      void window.api?.embeddedBrowserHide?.()
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
      [tabId]: { ...(current[tabId] ?? EMPTY_WEB_STATE), tabId, url, loading: true, error: undefined },
    }))
    try {
      const next = await window.api?.embeddedBrowserNavigate?.({
        tabId,
        url,
        bounds: readBounds(),
      })
      if (next) setWebStates((current) => ({ ...current, [tabId]: next }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setWebStates((current) => ({
        ...current,
        [tabId]: { ...(current[tabId] ?? EMPTY_WEB_STATE), tabId, loading: false, error: caught instanceof Error ? caught.message : String(caught) },
      }))
    }
  }

  function openProjectHomeTab() {
    if (!tabs.some((tab) => tab.id === 'project_home')) {
      setTabs((current) => [{
        id: 'project_home',
        kind: 'project_home',
        title: '内容导航',
        createdAt: Date.now(),
      }, ...current])
    }
    setActiveTabId('project_home')
    setLauncherOpen(false)
  }

  function openBlankWebTab() {
    const id = createTabId('web')
    setTabs((current) => [...current, { id, kind: 'web', title: '空白页', createdAt: Date.now() }])
    setActiveTabId(id)
    setLauncherOpen(false)
    setAddressWorkspace('')
    void window.api?.embeddedBrowserHide?.()
  }

  function openInternalTab(kind: 'resources' | 'external_resources' | 'canvas_list' | 'project_standards', title: string, options?: { replaceActiveBlank?: boolean }) {
    const replaceActiveBlank = options?.replaceActiveBlank && activeTab?.kind === 'web' && !activeTab.url && !activeWebState?.url
    if (replaceActiveBlank && activeTab?.kind === 'web') {
      setTabs((current) => current.map((tab) => (
        tab.id === activeTab.id && tab.kind === 'web'
          ? { id: tab.id, kind, title, createdAt: tab.createdAt }
          : tab
      )))
      setActiveTabId(activeTab.id)
      setLauncherOpen(false)
      void window.api?.embeddedBrowserHide?.()
      return
    }

    const existing = tabs.find((tab) => tab.kind === kind)
    if (existing) {
      setActiveTabId(existing.id)
      setLauncherOpen(false)
      void window.api?.embeddedBrowserHide?.()
      return
    }

    const id = createTabId(kind)
    setTabs((current) => [...current, { id, kind, title, createdAt: Date.now() }])
    setActiveTabId(id)
    setLauncherOpen(false)
    void window.api?.embeddedBrowserHide?.()
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

  function openProjectStandardsTab() {
    openInternalTab('project_standards', '项目规范')
  }

  async function openWebFromLauncher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const url = addressWorkspace.trim()
    if (!url) return
    const existingBlank = activeTab?.kind === 'web' && !activeTab.url && !activeWebState?.url ? activeTab : null
    const id = existingBlank?.id ?? createTabId('web')
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
    if (closingTab.kind === 'web') {
      void window.api?.embeddedBrowserClose?.({ tabId })
      setWebStates((current) => {
        const next = { ...current }
        delete next[tabId]
        return next
      })
    }
    const remaining = tabs.filter((tab) => tab.id !== tabId)
    if (remaining.length === 0) {
      const fallback: AgentBrowserTab = {
        id: 'project_home',
        kind: 'project_home',
        title: '内容导航',
        createdAt: Date.now(),
      }
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
      action: () => { if (activeTab?.kind === 'web') void window.api?.embeddedBrowserGoBack?.({ tabId: activeTab.id }) },
    },
    {
      label: '前进',
      icon: ArrowRight,
      disabled: webNavigationDisabled || !activeWebState?.canGoForward,
      action: () => { if (activeTab?.kind === 'web') void window.api?.embeddedBrowserGoForward?.({ tabId: activeTab.id }) },
    },
    {
      label: activeWebState?.loading ? '停止加载' : '刷新',
      icon: activeWebState?.loading ? Square : RefreshCw,
      disabled: webNavigationDisabled,
      action: () => {
        if (activeTab?.kind !== 'web') return
        void (activeWebState?.loading
          ? window.api?.embeddedBrowserStop?.({ tabId: activeTab.id })
          : window.api?.embeddedBrowserReload?.({ tabId: activeTab.id }))
      },
    },
  ], [activeTab, activeWebState?.canGoBack, activeWebState?.canGoForward, activeWebState?.loading, webNavigationDisabled])

  return (
    <AgentBrowserRoot>
      <AgentBrowserHeader>
        <AgentBrowserTabBar>
          <AgentBrowserTabList>
            {tabs.map((tab) => {
              const active = tab.id === activeTabId
              const webState = tab.kind === 'web' ? webStates[tab.id] : undefined
              const Icon = tab.kind === 'project_home' ? Home : tab.kind === 'resources' ? HardDrive : tab.kind === 'external_resources' ? ScanSearch : tab.kind === 'canvas_list' ? LayoutTemplate : tab.kind === 'project_standards' ? PenLine : Globe2
              return (
                <AgentBrowserTabSurface
                  key={tab.id}
                  active={active}
                >
                  <AgentBrowserTabButton
                    title={tab.kind === 'web' ? webState?.url ?? tab.url ?? tab.title : tab.title}
                    onClick={() => setActiveTabId(tab.id)}
                  >
                    <AgentBrowserTabIcon loading={webState?.loading}>
                      {webState?.loading ? <Loader2 size={12} /> : <Icon size={12} />}
                    </AgentBrowserTabIcon>
                    <span>{tabTitle(tab, webState, project?.name)}</span>
                  </AgentBrowserTabButton>
                  <AgentBrowserTabCloseButton
                    aria-label="关闭标签"
                    title="关闭标签"
                    onClick={() => closeTab(tab.id)}
                  >
                    <X size={11} />
                  </AgentBrowserTabCloseButton>
                </AgentBrowserTabSurface>
              )
            })}
          </AgentBrowserTabList>
          <AgentBrowserIconButton title="新建网页标签" aria-label="新建网页标签" onClick={openBlankWebTab}>
            <Plus size={14} />
          </AgentBrowserIconButton>
          <AgentBrowserIconButton title="打开资源库" aria-label="打开资源库" onClick={openResourceLibraryTab}>
            <HardDrive size={14} />
          </AgentBrowserIconButton>
          <AgentBrowserIconButton title="打开外部资源" aria-label="打开外部资源" onClick={openExternalResourceLibraryTab}>
            <ScanSearch size={14} />
          </AgentBrowserIconButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <AgentBrowserIconButton title="浏览器操作" aria-label="浏览器操作">
                <MoreHorizontal size={14} />
              </AgentBrowserIconButton>
            </DropdownMenuTrigger>
            <AgentBrowserMenuContent>
              <DropdownMenuItem onClick={() => setLauncherOpen((open) => !open)}>
                <AgentBrowserMenuItemIcon>
                  <Search size={13} />
                </AgentBrowserMenuItemIcon>
                打开网页
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openProjectHomeTab}>
                <AgentBrowserMenuItemIcon>
                  <Home size={13} />
                </AgentBrowserMenuItemIcon>
                打开内容导航
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openResourceLibraryTab}>
                <AgentBrowserMenuItemIcon>
                  <HardDrive size={13} />
                </AgentBrowserMenuItemIcon>
                打开资源库
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openExternalResourceLibraryTab}>
                <AgentBrowserMenuItemIcon>
                  <ScanSearch size={13} />
                </AgentBrowserMenuItemIcon>
                打开外部资源
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openCanvasListTab}>
                <AgentBrowserMenuItemIcon>
                  <LayoutTemplate size={13} />
                </AgentBrowserMenuItemIcon>
                打开画布列表
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openProjectStandardsTab}>
                <AgentBrowserMenuItemIcon>
                  <PenLine size={13} />
                </AgentBrowserMenuItemIcon>
                打开项目规范
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={openBlankWebTab}>
                <AgentBrowserMenuItemIcon>
                  <Globe2 size={13} />
                </AgentBrowserMenuItemIcon>
                新建空白网页
              </DropdownMenuItem>
            </AgentBrowserMenuContent>
          </DropdownMenu>
        </AgentBrowserTabBar>
        {activeTab?.kind === 'web' && (activeWebState?.url || activeTab.url) ? (
          <AgentBrowserToolbar>
            {toolbarActions.map((item) => {
              const Icon = item.icon
              return (
                <AgentBrowserIconButton
                  key={item.label}
                  disabled={item.disabled}
                  title={item.label}
                  aria-label={item.label}
                  onClick={item.action}
                >
                  <Icon size={13} />
                </AgentBrowserIconButton>
              )
            })}
            <AgentBrowserUrlMeta asChild>
              <AgentBrowserAddressForm onSubmit={submitToolbarAddress}>
                <AgentBrowserInput
                  value={toolbarAddressWorkspace}
                  onChange={(event) => setToolbarAddressWorkspace(event.target.value)}
                  placeholder="网址或搜索"
                  aria-label="网页地址"
                  disabled={!available}
                />
                <AgentBrowserLauncherSubmitButton disabled={!available || !toolbarAddressWorkspace.trim()}>
                  打开
                </AgentBrowserLauncherSubmitButton>
              </AgentBrowserAddressForm>
            </AgentBrowserUrlMeta>
          </AgentBrowserToolbar>
        ) : null}
        {launcherOpen ? (
          <AgentBrowserLauncherForm onSubmit={openWebFromLauncher}>
            <AgentBrowserLauncherIcon>
              <Search size={13} />
            </AgentBrowserLauncherIcon>
            <AgentBrowserInput
              value={addressWorkspace}
              onChange={(event) => setAddressWorkspace(event.target.value)}
              placeholder="输入网址或搜索"
              autoFocus
            />
            <AgentBrowserLauncherSubmitButton disabled={!addressWorkspace.trim()}>
              打开
            </AgentBrowserLauncherSubmitButton>
          </AgentBrowserLauncherForm>
        ) : null}
        {error ? (
          <AgentBrowserInlineError icon={<XCircle size={13} />}>
            {error}
          </AgentBrowserInlineError>
        ) : null}
      </AgentBrowserHeader>
      <AgentBrowserViewport ref={viewportRef}>
        {activeTab?.kind === 'project_home' ? (
          <ProjectHomeBrowserPage
            onOpenProjectStandards={openProjectStandardsTab}
            onOpenResourceLibrary={openResourceLibraryTab}
            onOpenExternalResourceLibrary={openExternalResourceLibraryTab}
            onOpenCanvasList={openCanvasListTab}
          />
        ) : activeTab?.kind === 'resources' ? (
          <AgentBrowserResourcePane>
            <ResourceLibraryView variant="pane" />
          </AgentBrowserResourcePane>
        ) : activeTab?.kind === 'external_resources' ? (
          <AgentBrowserResourcePane>
            <ExternalResourceSearchPage variant="pane" />
          </AgentBrowserResourcePane>
        ) : activeTab?.kind === 'canvas_list' ? (
          <AgentBrowserInternalPane>
            <CanvasListView source="agent" />
          </AgentBrowserInternalPane>
        ) : activeTab?.kind === 'project_standards' ? (
          <AgentBrowserInternalPane>
            <ProjectStandardsContent />
          </AgentBrowserInternalPane>
        ) : activeTab?.kind === 'web' && !(activeWebState?.url || activeTab.url) ? (
          <BlankWebTab
            onOpenResourceLibrary={openResourceLibraryInCurrentTab}
            onOpenExternalResourceLibrary={openExternalResourceLibraryInCurrentTab}
            onOpenCanvasList={openCanvasListInCurrentTab}
            onSubmit={(url) => {
              setAddressWorkspace(url)
              void navigateWebTab(activeTab.id, url)
            }}
          />
        ) : (
          <AgentBrowserWebOverlay loading={activeWebState?.loading} aria-hidden="true" />
        )}
      </AgentBrowserViewport>
    </AgentBrowserRoot>
  )
}

function tabTitle(tab: AgentBrowserTab, webState: WebTabState | undefined, projectName?: string) {
  if (tab.kind === 'project_home') return projectName ? `${projectName}` : '内容导航'
  if (tab.kind === 'resources') return tab.title
  if (tab.kind === 'external_resources') return tab.title
  if (tab.kind === 'canvas_list') return tab.title
  if (tab.kind === 'project_standards') return tab.title
  return webState?.title || tab.title || webState?.url || tab.url || '空白页'
}

function BlankWebTab({
  onOpenResourceLibrary,
  onOpenExternalResourceLibrary,
  onOpenCanvasList,
  onSubmit,
}: {
  onOpenResourceLibrary: () => void
  onOpenExternalResourceLibrary: () => void
  onOpenCanvasList: () => void
  onSubmit: (url: string) => void
}) {
  const [value, setValue] = useState('')
  const navItems = [
    {
      title: '资源库',
      description: '搜索、上传和预览可引用资源',
      icon: HardDrive,
      action: onOpenResourceLibrary,
    },
    {
      title: '外部资源',
      description: '搜索外部图片和视频并加入素材库',
      icon: ScanSearch,
      action: onOpenExternalResourceLibrary,
    },
    {
      title: '画布列表',
      description: '查看、创建和打开项目画布',
      icon: LayoutTemplate,
      action: onOpenCanvasList,
    },
  ]

  return (
    <AgentBrowserBlankForm
      onSubmit={(event) => {
        event.preventDefault()
        if (value.trim()) onSubmit(value.trim())
      }}
    >
      <AgentBrowserBlankContent>
        <AgentBrowserSectionIntro
          title="内容导航"
          description="从常用工作区开始，或在下方打开网页。"
        />
        <AgentBrowserNavGrid>
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <AgentBrowserNavButton
                key={item.title}
                icon={<Icon size={18} />}
                title={item.title}
                description={item.description}
                trailing={<ArrowRight size={14} />}
                onClick={item.action}
              />
            )
          })}
        </AgentBrowserNavGrid>
        <AgentBrowserDividerSection>
          <AgentBrowserSectionLabel icon={<Globe2 size={13} />}>
            打开网页
          </AgentBrowserSectionLabel>
          <AgentBrowserInputRow>
            <AgentBrowserInput value={value} onChange={(event) => setValue(event.target.value)} placeholder="网址或搜索" />
            <AgentBrowserLauncherSubmitButton disabled={!value.trim()}>打开</AgentBrowserLauncherSubmitButton>
          </AgentBrowserInputRow>
        </AgentBrowserDividerSection>
      </AgentBrowserBlankContent>
    </AgentBrowserBlankForm>
  )
}

function ProjectHomeBrowserPage({
  onOpenProjectStandards,
  onOpenResourceLibrary,
  onOpenExternalResourceLibrary,
  onOpenCanvasList,
}: {
  onOpenProjectStandards: () => void
  onOpenResourceLibrary: () => void
  onOpenExternalResourceLibrary: () => void
  onOpenCanvasList: () => void
}) {
  const project = useProjectStore((state) => state.current)
  const projectId = project?.ID
  const currentUser = useUserStore((state) => state.currentUser)
  const currentOrgID = useUserStore((state) => state.currentOrgID)
  const orgMemberships = useUserStore((state) => state.orgMemberships)
  const workspaceContext = useMemo(
    () => workspaceOwnerContext({ currentUser, currentOrgID, orgMemberships }),
    [currentOrgID, currentUser?.ID, orgMemberships],
  )
  const scriptsQuery = useQuery<Script[]>({
    queryKey: ['embedded-browser-navigation', projectId, 'scripts', workspaceContext.userId ?? 'local', workspaceContext.orgId ?? 'personal'],
    queryFn: () => listWorkspaceScripts(projectId!, workspaceContext),
    enabled: !!projectId,
  })
  const referencesQuery = useQuery<SemanticEntityRecord[]>({
    queryKey: ['embedded-browser-navigation', projectId, 'settings'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('settings')),
    enabled: !!projectId,
  })
  const assetSlotsQuery = useQuery<SemanticEntityRecord[]>({
    queryKey: ['embedded-browser-navigation', projectId, 'assetSlots'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('assetSlots')),
    enabled: !!projectId,
  })
  const productionsQuery = useQuery<SemanticEntityRecord[]>({
    queryKey: ['embedded-browser-navigation', projectId, 'productions'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('productions')),
    enabled: !!projectId,
  })
  const sceneMomentsQuery = useQuery<SemanticEntityRecord[]>({
    queryKey: ['embedded-browser-navigation', projectId, 'sceneMoments'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('sceneMoments')),
    enabled: !!projectId,
  })
  const contentUnitsQuery = useQuery<SemanticEntityRecord[]>({
    queryKey: ['embedded-browser-navigation', projectId, 'contentUnits'],
    queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('contentUnits')),
    enabled: !!projectId,
  })

  if (!project) {
    return (
      <AgentBrowserProjectEmpty
        icon={<FolderOpen size={21} />}
        title="内容导航"
        description="当前还没有选中的项目。选择项目后可从这里进入剧本、设定、素材、制作、情节和内容。"
      />
    )
  }

  const groups: ProjectNavigationGroup[] = [
    {
      key: 'standards',
      title: '项目规范',
      description: '项目级画幅、视觉风格、镜头语言、节奏和负面约束。',
      icon: Home,
      tone: 'plan',
      loading: false,
      items: [{
        id: String(project.ID),
        title: '项目规范',
        description: firstText(
          recordField(project, 'visual_style'),
          recordField(project, 'project_style'),
          project.description,
          '查看和维护当前项目规范',
        ),
        status: firstText(recordField(project, 'aspect_ratio'), project.status, '规范'),
        onClick: onOpenProjectStandards,
      }],
    },
    {
      key: 'scripts',
      title: '剧本列表',
      description: '剧本文本、分块和后续编排引用。',
      icon: FileText,
      tone: 'script',
      loading: scriptsQuery.isLoading,
      items: (scriptsQuery.data ?? [])
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0) || a.ID - b.ID)
        .map((script) => ({
          id: String(script.ID),
          title: script.title || `剧本 #${script.ID}`,
          description: firstText(script.summary, script.description, script.script_type, '暂无摘要'),
          status: script.script_type,
          to: withRouteParams(ROUTES.project.scripts, { script_id: script.ID }),
        })),
    },
    {
      key: 'references',
      title: '设定列表',
      description: '角色、世界观、风格和可复用创作约束。',
      icon: PenLine,
      tone: 'plan',
      loading: referencesQuery.isLoading,
      items: visibleRecords(referencesQuery.data).map((record, recordIndex) => ({
        id: recordStableId(record, 'reference', recordIndex),
        title: titleOfRecord(record, '设定'),
        description: firstText(record.description, record.content, record.kind, '暂无描述'),
        status: stringField(record.status ?? record.kind),
        to: withRouteParams(ROUTES.project.preProduction, { reference_id: recordRouteId(record) }),
      })),
    },
    {
      key: 'assets',
      title: '素材列表',
      description: '素材需求、候选资源和锁定状态。',
      icon: PackageSearch,
      tone: 'asset',
      loading: assetSlotsQuery.isLoading,
      items: visibleRecords(assetSlotsQuery.data).map((record, recordIndex) => ({
        id: recordStableId(record, 'asset', recordIndex),
        title: titleOfRecord(record, '素材'),
        description: firstText(record.description, record.prompt_hint, record.kind, '暂无描述'),
        status: stringField(record.status ?? record.kind),
        to: withRouteParams(ROUTES.project.preProduction, {
          asset_slot_id: recordRouteId(record),
          reference_id: numberField(record.setting_id),
        }),
      })),
    },
    {
      key: 'productions',
      title: '制作列表',
      description: '制作方案、制作任务和整体进度。',
      icon: Clapperboard,
      tone: 'production',
      loading: productionsQuery.isLoading,
      items: visibleRecords(productionsQuery.data).map((record, recordIndex) => ({
        id: recordStableId(record, 'production', recordIndex),
        title: titleOfRecord(record, '制作'),
        description: firstText(record.description, record.summary, record.kind, '暂无描述'),
        status: stringField(record.status),
        to: withRouteParams(ROUTES.project.productionOrchestration, { productionId: recordRouteId(record) }),
      })),
    },
    {
      key: 'moments',
      title: '情节列表',
      description: '编排段、情节点和上下游引用关系。',
      icon: Boxes,
      tone: 'production',
      loading: sceneMomentsQuery.isLoading,
      items: visibleRecords(sceneMomentsQuery.data).map((record, recordIndex) => ({
        id: recordStableId(record, 'moment', recordIndex),
        title: titleOfRecord(record, '情节'),
        description: firstText(record.description, record.action_text, record.location_text, record.mood, '暂无描述'),
        status: stringField(record.status),
        to: withRouteParams(ROUTES.project.productionOrchestration, {
          productionId: numberField(record.production_id),
          scene_moment_id: recordRouteId(record),
        }),
      })),
    },
    {
      key: 'content',
      title: '内容列表',
      description: '内容单元、关键帧、生成上下文和预览挂载。',
      icon: LayoutTemplate,
      tone: 'content',
      loading: contentUnitsQuery.isLoading,
      items: visibleRecords(contentUnitsQuery.data).map((record, recordIndex) => ({
        id: recordStableId(record, 'content', recordIndex),
        title: titleOfRecord(record, '内容'),
        description: firstText(record.description, record.prompt, record.visual_intent, record.kind, '暂无描述'),
        status: stringField(record.status ?? record.kind),
        to: withRouteParams(ROUTES.project.productionOrchestration, {
          productionId: numberField(record.production_id),
          scene_moment_id: numberField(record.scene_moment_id),
          content_unit_id: recordRouteId(record),
        }),
      })),
    },
  ]
  const topGroups = groups.slice(0, 4)
  const productionGroups = groups.slice(4)
  const totalItems = groups.reduce((sum, group) => sum + group.items.length, 0)
  const loadingGroups = groups.filter((group) => group.loading).length
  const rows = groups.map((group): [string, string | number] => [
    group.title.replace('列表', ''),
    group.loading ? '...' : group.items.length,
  ])

  return (
    <AgentBrowserProjectNavigationPage>
      <AgentBrowserProjectHeader>
        <AgentBrowserProjectHeaderCopy>
          <AgentBrowserProjectMetaLabel icon={<Home size={14} />}>
            内部页面
          </AgentBrowserProjectMetaLabel>
          <AgentBrowserProjectTitle>内容导航</AgentBrowserProjectTitle>
          <AgentBrowserProjectDescription>
            {project.name}
          </AgentBrowserProjectDescription>
        </AgentBrowserProjectHeaderCopy>
        <AgentBrowserContentToolbar aria-label="常用内容入口">
          <AgentBrowserContentToolButton icon={<PenLine size={13} />} onClick={onOpenProjectStandards}>
            规范
          </AgentBrowserContentToolButton>
          <AgentBrowserContentToolButton icon={<HardDrive size={13} />} onClick={onOpenResourceLibrary}>
            资源库
          </AgentBrowserContentToolButton>
          <AgentBrowserContentToolButton icon={<ScanSearch size={13} />} onClick={onOpenExternalResourceLibrary}>
            外部资源
          </AgentBrowserContentToolButton>
          <AgentBrowserContentToolButton icon={<LayoutTemplate size={13} />} onClick={onOpenCanvasList}>
            画布
          </AgentBrowserContentToolButton>
        </AgentBrowserContentToolbar>
      </AgentBrowserProjectHeader>
      <AgentBrowserContentSummary aria-label="当前项目内容概览">
        <AgentBrowserContentSummaryMain label="内容对象" value={totalItems} />
        <AgentBrowserContentSummaryGrid>
          {rows.map(([label, value]) => (
            <AgentBrowserKeyValue key={label} label={label} value={value} strong />
          ))}
        </AgentBrowserContentSummaryGrid>
        {loadingGroups > 0 ? (
          <AgentBrowserBadge>{loadingGroups} 项读取中</AgentBrowserBadge>
        ) : null}
      </AgentBrowserContentSummary>

      <AgentBrowserContentMatrix aria-label="核心内容入口">
        {topGroups.map((group, index) => (
          <ProjectNavigationGroupSection key={group.key} group={group} index={index} variant="featured" />
        ))}
      </AgentBrowserContentMatrix>

      <AgentBrowserContentFlow aria-label="生产链路内容">
        {productionGroups.map((group, index) => (
          <ProjectNavigationGroupSection key={group.key} group={group} index={index + topGroups.length} variant="lane" />
        ))}
      </AgentBrowserContentFlow>
    </AgentBrowserProjectNavigationPage>
  )
}

function ProjectNavigationGroupSection({
  group,
  index,
  variant,
}: {
  group: ProjectNavigationGroup
  index: number
  variant: 'featured' | 'lane'
}) {
  const Icon = group.icon
  const previewItems = group.items.slice(0, variant === 'featured' ? 3 : 4)

  return (
    <AgentBrowserContentGroup tone={group.tone} variant={variant}>
      <AgentBrowserContentGroupHeader>
        <AgentBrowserContentGroupIcon>
          <Icon size={17} />
        </AgentBrowserContentGroupIcon>
        <AgentBrowserContentGroupCopy>
          <AgentBrowserContentGroupTitleRow>
            <AgentBrowserContentGroupIndex>{String(index + 1).padStart(2, '0')}</AgentBrowserContentGroupIndex>
            <AgentBrowserContentGroupTitle>{group.title}</AgentBrowserContentGroupTitle>
          </AgentBrowserContentGroupTitleRow>
          <AgentBrowserContentGroupDescription>{group.description}</AgentBrowserContentGroupDescription>
        </AgentBrowserContentGroupCopy>
        <AgentBrowserBadge>{group.loading ? '读取中' : `${group.items.length}`}</AgentBrowserBadge>
      </AgentBrowserContentGroupHeader>
      <AgentBrowserContentGroupItems>
        {group.loading ? (
          <AgentBrowserContentGroupState>正在读取当前项目数据...</AgentBrowserContentGroupState>
        ) : group.items.length === 0 ? (
          <AgentBrowserContentGroupState>暂无数据</AgentBrowserContentGroupState>
        ) : (
          previewItems.map((item) => (
            item.to ? (
              <AgentBrowserContentItem asChild key={`${group.key}-${item.id}`}>
                <Link
                  to={item.to}
                >
                  <ProjectNavigationItemContent item={item} />
                </Link>
              </AgentBrowserContentItem>
            ) : (
              <AgentBrowserContentItem
                key={`${group.key}-${item.id}`}
                onClick={item.onClick}
              >
                <ProjectNavigationItemContent item={item} />
              </AgentBrowserContentItem>
            )
          ))
        )}
        {!group.loading && group.items.length > previewItems.length ? (
          <AgentBrowserContentGroupOverflow>
            另有 {group.items.length - previewItems.length} 项
          </AgentBrowserContentGroupOverflow>
        ) : null}
      </AgentBrowserContentGroupItems>
    </AgentBrowserContentGroup>
  )
}

function ProjectNavigationItemContent({ item }: { item: ProjectNavigationLink }) {
  return (
    <>
      <AgentBrowserContentItemCopy>
        <AgentBrowserContentItemTitle>{item.title}</AgentBrowserContentItemTitle>
        <AgentBrowserContentItemDescription>{item.description}</AgentBrowserContentItemDescription>
      </AgentBrowserContentItemCopy>
      <AgentBrowserContentItemMeta>
        {item.status ? <span>{item.status}</span> : null}
        <ArrowRight size={14} />
      </AgentBrowserContentItemMeta>
    </>
  )
}

function visibleRecords(records?: SemanticEntityRecord[]) {
  return (records ?? [])
    .filter(isActiveSemanticEntityRecord)
    .slice()
    .sort(compareRecordOrder)
}

function compareRecordOrder(a: SemanticEntityRecord, b: SemanticEntityRecord) {
  const orderDelta = (numberField(a.order) ?? recordNumericId(a) ?? 0) - (numberField(b.order) ?? recordNumericId(b) ?? 0)
  if (orderDelta !== 0) return orderDelta
  return recordSortKey(a).localeCompare(recordSortKey(b))
}

function titleOfRecord(record: SemanticEntityRecord, fallback: string) {
  return firstText(record.title, record.name, record.label, `${fallback} #${recordDisplayId(record)}`)
}

function recordRouteId(record: SemanticEntityRecord) {
  return numberField(record.ID) ?? numberField(record.id) ?? stringField(record.id)
}

function recordNumericId(record: SemanticEntityRecord) {
  return numberField(record.ID) ?? numberField(record.id)
}

function recordDisplayId(record: SemanticEntityRecord) {
  return firstText(record.ID, record.id, record.title, record.name, record.label, '未编号')
}

function recordStableId(record: SemanticEntityRecord, fallback: string, index: number) {
  return firstText(record.ID, record.id, record.uuid, record.key, record.path, `${fallback}-${index}`)
}

function recordSortKey(record: SemanticEntityRecord) {
  return firstText(record.ID, record.id, record.title, record.name, record.label)
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberField(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined
}

function recordField(record: unknown, key: string) {
  if (!record || typeof record !== 'object') return undefined
  return (record as Record<string, unknown>)[key]
}
