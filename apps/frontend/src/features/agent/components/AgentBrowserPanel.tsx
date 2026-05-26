import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  FolderOpen,
  Globe2,
  Home,
  LayoutTemplate,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Square,
  X,
  XCircle,
} from 'lucide-react'
import {
  AgentBrowserBadge,
  AgentBrowserBlankContent,
  AgentBrowserBlankForm,
  AgentBrowserDataBlock,
  AgentBrowserDataBlockDescription,
  AgentBrowserDataBlockTitle,
  AgentBrowserDividerSection,
  AgentBrowserHeader,
  AgentBrowserIconButton,
  AgentBrowserInlineError,
  AgentBrowserInput,
  AgentBrowserInputRow,
  AgentBrowserKeyValue,
  AgentBrowserKeyValueGrid,
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
  AgentBrowserProjectPage,
  AgentBrowserProjectTitle,
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
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { ROUTES } from '@/routes/projectRoutes'

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
  const navigate = useNavigate()
  const project = useProjectStore((state) => state.current)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [tabs, setTabs] = useState<AgentBrowserTab[]>(() => [{
    id: 'project_home',
    kind: 'project_home',
    title: '项目首页',
    createdAt: Date.now(),
  }])
  const [activeTabId, setActiveTabId] = useState('project_home')
  const [webStates, setWebStates] = useState<Record<string, WebTabState>>({})
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [addressDraft, setAddressDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const available = typeof window !== 'undefined' && typeof window.api?.agentBrowserNavigate === 'function'
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]
  const activeWebState = activeTab?.kind === 'web' ? webStates[activeTab.id] ?? { ...EMPTY_WEB_STATE, tabId: activeTab.id, url: activeTab.url ?? '' } : null

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
      void window.api?.agentBrowserHide?.()
      return
    }
    void window.api?.agentBrowserActivate?.({ tabId: activeTab.id, bounds: readBounds() })
  }, [activeTab, activeWebState?.url, available, readBounds])

  useEffect(() => {
    if (!available) return
    const unsubscribe = window.api?.onAgentBrowserState?.((next) => {
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
      void window.api?.agentBrowserHide?.()
    }
  }, [])

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
      const next = await window.api?.agentBrowserNavigate?.({
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
        title: '项目首页',
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
    setAddressDraft('')
    void window.api?.agentBrowserHide?.()
  }

  function navigateInternalRoute(pathname: string) {
    void window.api?.agentBrowserHide?.()
    navigate(pathname)
  }

  async function openWebFromLauncher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const url = addressDraft.trim()
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
    setAddressDraft('')
    await navigateWebTab(id, url)
  }

  function closeTab(tabId: string) {
    const closingIndex = tabs.findIndex((tab) => tab.id === tabId)
    const closingTab = tabs[closingIndex]
    if (!closingTab) return
    if (closingTab.kind === 'web') {
      void window.api?.agentBrowserClose?.({ tabId })
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
        title: '项目首页',
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
      action: () => { if (activeTab?.kind === 'web') void window.api?.agentBrowserGoBack?.({ tabId: activeTab.id }) },
    },
    {
      label: '前进',
      icon: ArrowRight,
      disabled: webNavigationDisabled || !activeWebState?.canGoForward,
      action: () => { if (activeTab?.kind === 'web') void window.api?.agentBrowserGoForward?.({ tabId: activeTab.id }) },
    },
    {
      label: activeWebState?.loading ? '停止加载' : '刷新',
      icon: activeWebState?.loading ? Square : RefreshCw,
      disabled: webNavigationDisabled,
      action: () => {
        if (activeTab?.kind !== 'web') return
        void (activeWebState?.loading
          ? window.api?.agentBrowserStop?.({ tabId: activeTab.id })
          : window.api?.agentBrowserReload?.({ tabId: activeTab.id }))
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
              const Icon = tab.kind === 'project_home' ? Home : Globe2
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
                打开项目首页
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
            <AgentBrowserUrlMeta>
              {activeWebState?.url || activeTab.url}
            </AgentBrowserUrlMeta>
          </AgentBrowserToolbar>
        ) : null}
        {launcherOpen ? (
          <AgentBrowserLauncherForm onSubmit={openWebFromLauncher}>
            <AgentBrowserLauncherIcon>
              <Search size={13} />
            </AgentBrowserLauncherIcon>
            <AgentBrowserInput
              value={addressDraft}
              onChange={(event) => setAddressDraft(event.target.value)}
              placeholder="输入网址或搜索"
              autoFocus
            />
            <AgentBrowserLauncherSubmitButton disabled={!addressDraft.trim()}>
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
          <ProjectHomeBrowserPage />
        ) : activeTab?.kind === 'web' && !(activeWebState?.url || activeTab.url) ? (
          <BlankWebTab
            onOpenCanvasList={() => navigateInternalRoute(ROUTES.project.agentCanvases)}
            onSubmit={(url) => {
              setAddressDraft(url)
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
  if (tab.kind === 'project_home') return projectName ? `${projectName}` : '项目首页'
  return webState?.title || tab.title || webState?.url || tab.url || '空白页'
}

function BlankWebTab({
  onOpenCanvasList,
  onSubmit,
}: {
  onOpenCanvasList: () => void
  onSubmit: (url: string) => void
}) {
  const [value, setValue] = useState('')
  const navItems = [
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

function ProjectHomeBrowserPage() {
  const project = useProjectStore((state) => state.current)
  if (!project) {
    return (
      <AgentBrowserProjectEmpty
        icon={<FolderOpen size={21} />}
        title="项目首页"
        description="当前还没有选中的项目。这个标签会作为内部页面测试入口。"
      />
    )
  }

  const rows = [
    ['项目状态', project.status || '未设置'],
    ['总集数', project.total_episodes ? `${project.total_episodes}` : '未设置'],
    ['画幅', project.aspect_ratio || '未设置'],
    ['更新时间', formatProjectTime(project.UpdatedAt)],
  ]

  return (
    <AgentBrowserProjectPage>
      <AgentBrowserProjectHeader>
        <AgentBrowserProjectHeaderCopy>
          <AgentBrowserProjectMetaLabel icon={<Home size={14} />}>
            内部页面
          </AgentBrowserProjectMetaLabel>
          <AgentBrowserProjectTitle>{project.name}</AgentBrowserProjectTitle>
          <AgentBrowserProjectDescription>
            {project.description || '暂无项目简介。'}
          </AgentBrowserProjectDescription>
        </AgentBrowserProjectHeaderCopy>
        <AgentBrowserBadge>测试</AgentBrowserBadge>
      </AgentBrowserProjectHeader>
      <AgentBrowserKeyValueGrid>
        {rows.map(([label, value]) => (
          <AgentBrowserKeyValue key={label} label={label} value={value} />
        ))}
      </AgentBrowserKeyValueGrid>
      <AgentBrowserDataBlock>
        <AgentBrowserDataBlockTitle>Agent Browser Page</AgentBrowserDataBlockTitle>
        <AgentBrowserDataBlockDescription>
          这是右侧浏览器的内部页面 MVP。后续情节、设定、草案、生成结果都可以按这种方式作为独立 tab 挂进来。
        </AgentBrowserDataBlockDescription>
      </AgentBrowserDataBlock>
    </AgentBrowserProjectPage>
  )
}

function formatProjectTime(value?: string) {
  if (!value) return '未记录'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return '未记录'
  }
}
