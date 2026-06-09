import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Clock3,
  Folder,
  History,
  MessageSquare,
  Plus,
  Puzzle,
  Search,
  Smartphone,
  SquarePen,
  Trash2,
} from 'lucide-react'
import {
  AgentModeChatSurface,
  AgentModeChatSurfaceInner,
  AgentModeCompactNavItem,
  AgentModeContentPanel,
  AgentModeConversationArchiveButton,
  AgentModeConversationItem,
  AgentModeConversationRow,
  AgentModeEmptyText,
  AgentModeFullscreenLayout,
  AgentModeGroup,
  AgentModeGroupBody,
  AgentModeGroupList,
  AgentModeGroupToggle,
  AgentModeIconSlot,
  AgentModeLabel,
  AgentModeMeta,
  AgentModePrimaryNavItem,
  AgentModeProjectGroup,
  AgentModeProjectGroupToggle,
  AgentModeResizeHandle,
  AgentModeRoot,
  AgentModeSidebar,
  AgentModeSidebarScroll,
  AgentModeSidebarTop,
  useResizablePanel,
} from '@movscript/ui'
import { useTranslation } from 'react-i18next'

import { AgentUnifiedChatShell } from '@/features/agent/components/AgentUnifiedChatShell'
import { AgentBrowserPanel } from '@/features/agent/components/AgentBrowserPanel'
import {
  appServerThreadOpenEvent,
  openAppServerThread,
  readAppServerActiveThreadId,
} from '@/features/agent/components/AppServerChatShell'
import { createAgentChatDataSourceForProvider } from '@/features/agent/application/agentChatDataSourceFactory'
import { openAgentPanelThread } from '@/features/agent/application/agentPanelBridge'
import {
  listProviderSessionSummariesFromWorkspace,
  listProviderSessionThreadSummariesFromWorkspace,
  providerSessionThreadSummaryFromThread,
  startSharedProvisionalConversation,
  upsertCachedProviderSessionThread,
} from '@/features/agent/application/providerSessionThreadQueryCache'
import { conversationDisplayTitle, formatAgentDate, formatAgentRelativeTime, providerThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import {
  agentConversationOpenRecordsEqual,
  mergeAgentConversationOpenState,
  openAgentConversationIds,
  readAgentActiveConversationId,
  readAgentConversationOpenState,
  removeAgentConversationOpenRecords,
  setAgentConversationOpen,
  writeAgentActiveConversationId,
  writeAgentConversationOpenState,
  type AgentConversationOpenRecord,
} from '@/features/agent/presentation/agentConversationOpenOrder'
import { conversationFromProviderSessionThreadSummary } from '@/features/agent/presentation/providerSessionThreadConversation'
import { api } from '@/shared/infrastructure/api'
import { providerSessionClient, type AgentSessionSummary, type AgentThreadSummary } from '@/shared/infrastructure/providerSessionClient'
import { projectListQueryKey } from '@/features/project/application/projectQueries'
import { ROUTES } from '@/routes/projectRoutes'
import { useAgentConversationTabProviderSessionStatusLights } from '@/features/agent/presentation/useAgentConversationTabProviderSessionStatusLights'
import { useAgentPanelUiStore } from '@/features/agent/presentation/agentPanelUiStore'
import {
  AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH,
  AGENT_MODE_CONTENT_PANEL_MAX_WIDTH,
  AGENT_MODE_CONTENT_PANEL_MIN_WIDTH,
  AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY,
  AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY,
  AGENT_MODE_SIDEBAR_COLLAPSED_WIDTH,
  AGENT_MODE_SIDEBAR_DEFAULT_WIDTH,
  AGENT_MODE_SIDEBAR_MAX_WIDTH,
  AGENT_MODE_SIDEBAR_MIN_WIDTH,
  AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY,
  clampAgentModeSidebarWidth,
  clampAgentModeContentPanelWidth,
} from '@/features/agent/presentation/agentModePanelSizing'
import type { ProviderSessionStatusLight } from '@/features/agent/domain/providerSessionStatusLight'
import type { AgentChatThread } from '@/features/agent/domain/agentChatProtocol'
import type { Conversation } from '@/features/agent/state/agentStore'
import { useAgentSessionStore, type AgentConversationThreadBinding } from '@/features/agent/state/agentSessionStore'
import {
  enabledProviders,
  providerInstanceId,
  resolveNewConversationProvider,
  usesAppServerProtocol,
  useProviderConfigStore,
  type MovScriptWorkspaceContext,
} from '@/shared/infrastructure/providerConfigStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import type { Project } from '@/types'

const DEFAULT_VISIBLE_PROJECT_CONVERSATIONS = 5
const DEFAULT_VISIBLE_CHAT_CONVERSATIONS = 5
const APP_SERVER_THREAD_LIST_STALE_MS = 15_000
const APP_SERVER_THREAD_LIST_REFRESH_MS = 30_000
const APP_SERVER_THREAD_LIST_GC_MS = 5 * 60_000
type AgentWorkspaceScopeSelection = 'global' | 'project'

interface PaintDiagnosticRow {
  selector: string
  rect: string
  scroll: string
  area: number
  scrollArea: number
  position: string
  overflow: string
  transform: string
  filter: string
  backdrop: string
  shadow: string
  willChange: string
}

function readLastAgentModeActiveThreadId(userId: string) {
  return readAgentActiveConversationId(userId)
}

function writeLastAgentModeActiveThreadId(userId: string, threadId: string | null) {
  writeAgentActiveConversationId(userId, threadId)
}

function agentModeRenderDiagnosticsEnabled() {
  return import.meta.env.DEV && import.meta.env.VITE_MOVSCRIPT_RENDER_DIAGNOSTICS === '1'
}

function compactStyleValue(value: string, maxLength = 72) {
  if (!value || value === 'none' || value === 'auto' || value === 'normal') return value
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function diagnosticSelector(element: Element) {
  const className = typeof element.className === 'string'
    ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).map((name) => `.${name}`).join('')
    : ''
  const id = element.id ? `#${element.id}` : ''
  return `${element.tagName.toLowerCase()}${id}${className}`
}

function rectOutsideViewport(rect: DOMRect, margin = 240) {
  return (
    rect.bottom < -margin ||
    rect.right < -margin ||
    rect.top > window.innerHeight + margin ||
    rect.left > window.innerWidth + margin
  )
}

function collectPaintDiagnosticElements(root: HTMLElement) {
  const elements: HTMLElement[] = []
  const visit = (element: HTMLElement) => {
    elements.push(element)
    const style = window.getComputedStyle(element)
    if (style.contentVisibility === 'auto' && rectOutsideViewport(element.getBoundingClientRect())) return
    for (const child of Array.from(element.children)) {
      if (child instanceof HTMLElement) visit(child)
    }
  }
  visit(root)
  return elements
}

function logAgentModePaintDiagnostics(root: HTMLElement) {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const viewportArea = Math.max(1, viewportWidth * viewportHeight)
  const visualScale = window.visualViewport?.scale ?? 1
  const rootRect = root.getBoundingClientRect()
  const rows: PaintDiagnosticRow[] = []
  const elements = collectPaintDiagnosticElements(root)

  for (const element of elements) {
    const rect = element.getBoundingClientRect()
    const width = Math.max(0, Math.round(rect.width))
    const height = Math.max(0, Math.round(rect.height))
    if (width === 0 || height === 0) continue

    const style = window.getComputedStyle(element)
    const area = width * height
    const scrollWidth = Math.max(width, element.scrollWidth)
    const scrollHeight = Math.max(height, element.scrollHeight)
    const scrollArea = scrollWidth * scrollHeight
    const hasPaintEffect = (
      style.transform !== 'none' ||
      style.filter !== 'none' ||
      style.backdropFilter !== 'none' ||
      style.boxShadow !== 'none' ||
      style.willChange !== 'auto' ||
      style.position === 'fixed' ||
      style.position === 'sticky'
    )
    const hasLargeScrollSurface = scrollArea > viewportArea * 1.5
    const isLargeVisibleSurface = area > viewportArea * 0.35
    if (!hasLargeScrollSurface && !isLargeVisibleSurface && !hasPaintEffect) continue

    rows.push({
      selector: diagnosticSelector(element),
      rect: `${width}x${height}+${Math.round(rect.left)}+${Math.round(rect.top)}`,
      scroll: `${scrollWidth}x${scrollHeight}`,
      area,
      scrollArea,
      position: style.position,
      overflow: `${style.overflowX}/${style.overflowY}`,
      transform: compactStyleValue(style.transform),
      filter: compactStyleValue(style.filter),
      backdrop: compactStyleValue(style.backdropFilter),
      shadow: compactStyleValue(style.boxShadow),
      willChange: compactStyleValue(style.willChange),
    })
  }

  rows.sort((a, b) => Math.max(b.area, b.scrollArea) - Math.max(a.area, a.scrollArea))
  console.info(
    `[agent-mode:paint] viewport=${viewportWidth}x${viewportHeight} dpr=${window.devicePixelRatio.toFixed(2)} visualScale=${visualScale.toFixed(3)} root=${Math.round(rootRect.width)}x${Math.round(rootRect.height)} candidates=${rows.length}`,
  )
  for (const [index, row] of rows.slice(0, 24).entries()) {
    console.info(
      [
        `[agent-mode:paint] #${index + 1}`,
        row.selector,
        `rect=${row.rect}`,
        `scroll=${row.scroll}`,
        `position=${row.position}`,
        `overflow=${row.overflow}`,
        `transform=${row.transform}`,
        `filter=${row.filter}`,
        `backdrop=${row.backdrop}`,
        `shadow=${row.shadow}`,
        `willChange=${row.willChange}`,
      ].join(' '),
    )
  }
}

export default function ProjectAgentModePage({
  fullscreen = false,
  embeddedInShell = false,
}: {
  fullscreen?: boolean
  embeddedInShell?: boolean
}) {
  const currentUser = useUserStore((s) => s.currentUser)
  const userId = currentUser ? String(currentUser.ID) : ''
  const contentPanelCollapsed = useAgentPanelUiStore((s) => s.agentModeContentPanelCollapsed)

  useEffect(() => {
    if (!agentModeRenderDiagnosticsEnabled()) return
    const log = () => {
      const root = document.querySelector<HTMLElement>('.project-agent-mode')
      if (root) logAgentModePaintDiagnostics(root)
    }
    const animationFrame = window.requestAnimationFrame(log)
    const timeout = window.setTimeout(log, 350)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.clearTimeout(timeout)
    }
  }, [embeddedInShell, fullscreen])

  return (
    <AgentModeRoot>
      {fullscreen && !embeddedInShell && (
        <AgentModeFullscreenLayout>
          <ProjectAgentModeSidebar />
          <ProjectAgentModeWorkspace userId={userId} />
          <ProjectAgentContentPanel manageOwnWidth collapsed={contentPanelCollapsed} />
        </AgentModeFullscreenLayout>
      )}
      {(!fullscreen || embeddedInShell) && (
        <ProjectAgentModeWorkspace userId={userId} />
      )}
    </AgentModeRoot>
  )
}

export function ProjectAgentModeSidebar({ headerActions }: { headerActions?: ReactNode } = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { t, i18n } = useTranslation()
  const project = useProjectStore((s) => s.current)
  const currentUser = useUserStore((s) => s.currentUser)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const userId = currentUser ? String(currentUser.ID) : ''
  const getActiveConversationId = useAgentSessionStore((s) => s.getActiveConversationId)
  const activeConversationId = useAgentSessionStore((s) => s.activeConversationIdsByUser?.[userId] ?? null)
  const createProviderSessionConversation = useAgentSessionStore((s) => s.createProviderSessionConversation)
  const removeProviderSessionConversation = useAgentSessionStore((s) => s.removeProviderSessionConversation)
  const setActiveConversation = useAgentSessionStore((s) => s.setActiveConversation)
  const pageTasks = useAgentSessionStore((s) => s.pageTasks)
  const conversationThreadBindings = useAgentSessionStore((s) => s.conversationThreadBindings)
  const setConversationProviderThreadBindingId = useAgentSessionStore((s) => s.setConversationProviderThreadBindingId)
  const setConversationProviderSessionTreeId = useAgentSessionStore((s) => s.setConversationProviderSessionTreeId)
  const updateConversationRuntimeState = useAgentSessionStore((s) => s.updateConversationRuntimeState)
  const clearConversationProviderSessionState = useAgentSessionStore((s) => s.clearConversationProviderSessionState)
  const [openProjectGroups, setOpenProjectGroups] = useState<Record<number, boolean>>({})
  const [expandedProjectThreadGroups, setExpandedProjectThreadGroups] = useState<Record<number, boolean>>({})
  const [conversationsOpen, setConversationsOpen] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(true)
  const [showAllChatConversations, setShowAllChatConversations] = useState(false)
  const [showAllHistoryConversations, setShowAllHistoryConversations] = useState(false)
  const [appServerActiveThreadId, setAppServerActiveThreadId] = useState(() => readAppServerActiveThreadId())
  const [relativeTimeNow, setRelativeTimeNow] = useState(() => Date.now())
  const [newConversationWorkspaceScope] = useState<AgentWorkspaceScopeSelection>('project')
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') return AGENT_MODE_SIDEBAR_DEFAULT_WIDTH
    const saved = Number(window.localStorage.getItem(AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY))
    return Number.isFinite(saved) ? clampAgentModeSidebarWidth(saved) : AGENT_MODE_SIDEBAR_DEFAULT_WIDTH
  })
  const sidebarCollapsed = useAgentPanelUiStore((s) => s.agentModeSidebarCollapsed)
  const setSidebarCollapsed = useAgentPanelUiStore((s) => s.setAgentModeSidebarCollapsed)
  const sidebarResize = useResizablePanel({
    size: sidebarWidth,
    onSizeChange: setSidebarWidth,
    minSize: AGENT_MODE_SIDEBAR_MIN_WIDTH,
    maxSize: AGENT_MODE_SIDEBAR_MAX_WIDTH,
    resizeEdge: 'right',
    collapsed: sidebarCollapsed,
    onCollapsedChange: setSidebarCollapsed,
    collapseMode: 'after-min',
    ariaLabel: '调整左侧栏宽度',
  })
  const renderedSidebarWidth = sidebarCollapsed ? AGENT_MODE_SIDEBAR_COLLAPSED_WIDTH : sidebarWidth
  const providerSettings = useProviderConfigStore((s) => s.settings)
  const setNewConversationProviderId = useProviderConfigStore((s) => s.setNewConversationProviderId)
  const availableProviders = useMemo(() => enabledProviders(providerSettings), [providerSettings])
  const newConversationProvider = useMemo(() => resolveNewConversationProvider(providerSettings), [providerSettings])
  const appServerMode = usesAppServerProtocol(newConversationProvider)
  const newConversationWorkspaceContext = useMemo(() => workspaceContextForNewConversation({
    scope: newConversationWorkspaceScope,
    projectId: project?.ID,
  }), [newConversationWorkspaceScope, project?.ID])
  const effectiveNewConversationWorkspaceScope = newConversationWorkspaceContext.scope ?? 'global'

  useEffect(() => {
    window.localStorage.setItem(AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    const interval = window.setInterval(() => setRelativeTimeNow(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: projectListQueryKey(currentOrgID),
    queryFn: () => api.get('/projects').then((response) => response.data),
  })
  const { data: providerSessionThreads = [], isLoading: providerSessionThreadsLoading, refetch: refetchProviderSessionThreads } = useQuery<AgentThreadSummary[]>({
    queryKey: ['provider-session-threads', providerSessionClient.baseURL, 'agent-mode-sidebar'],
    queryFn: () => listProviderSessionThreadSummariesFromWorkspace({ includeProvisional: true }),
    enabled: !appServerMode,
    retry: false,
  })
  const { data: providerSessions = [] } = useQuery<AgentSessionSummary[]>({
    queryKey: ['provider-sessions', providerSessionClient.baseURL, 'agent-mode-sidebar'],
    queryFn: () => listProviderSessionSummariesFromWorkspace(),
    enabled: !appServerMode,
    retry: false,
  })
  const { data: appServerThreads = [], isLoading: appServerThreadsLoading, refetch: refetchAppServerThreads } = useQuery<AgentChatThread[]>({
    queryKey: ['app-server-threads', newConversationProvider.id, providerInstanceId(newConversationProvider), 'agent-mode-sidebar'],
    queryFn: async () => {
      const dataSource = await createAgentChatDataSourceForProvider(newConversationProvider, { appServerPolicy: 'status-only' })
      const page = await dataSource.listThreads({ limit: 50 })
      return page.threads
    },
    enabled: appServerMode,
    retry: false,
    staleTime: APP_SERVER_THREAD_LIST_STALE_MS,
    gcTime: APP_SERVER_THREAD_LIST_GC_MS,
    refetchInterval: APP_SERVER_THREAD_LIST_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (!appServerMode) return undefined
    const openThreadEventName = appServerThreadOpenEvent(newConversationProvider)
    function handleAppServerThreadOpen(event: Event) {
      const threadId = (event as CustomEvent<{ threadId?: string }>).detail?.threadId?.trim()
      if (threadId) setAppServerActiveThreadId(threadId)
      void refetchAppServerThreads()
    }
    window.addEventListener(openThreadEventName, handleAppServerThreadOpen)
    setAppServerActiveThreadId(readAppServerActiveThreadId(newConversationProvider))
    return () => window.removeEventListener(openThreadEventName, handleAppServerThreadOpen)
  }, [appServerMode, newConversationProvider, refetchAppServerThreads])

  const conversations = useMemo(() => {
    return providerSessionThreads.map((thread) => conversationFromProviderSessionThreadSummary(thread, t))
  }, [providerSessionThreads, t])
  const rawOpenConversations = useMemo(
    () => conversations.filter((conversation) => conversation.archived !== true),
    [conversations],
  )
  const availableConversationIds = useMemo(() => rawOpenConversations.map((conversation) => conversation.id), [rawOpenConversations])
  const [conversationOpenState, setConversationOpenState] = useState<AgentConversationOpenRecord[]>(() => readAgentConversationOpenState(userId))
  useEffect(() => {
    setConversationOpenState(readAgentConversationOpenState(userId))
  }, [userId])
  useEffect(() => {
    if (providerSessionThreadsLoading) return
    setConversationOpenState((current) => {
      let merged = mergeAgentConversationOpenState(current, availableConversationIds, { defaultOpen: false })
      const activeConversationExplicitlyClosed = merged.some((record) => record.id === activeConversationId && record.open === false)
      if (activeConversationId && availableConversationIds.includes(activeConversationId) && !activeConversationExplicitlyClosed) {
        merged = setAgentConversationOpen(merged, [activeConversationId], true)
      }
      if (agentConversationOpenRecordsEqual(current, merged)) return current
      writeAgentConversationOpenState(userId, merged)
      return merged
    })
  }, [activeConversationId, availableConversationIds, providerSessionThreadsLoading, userId])
  const openConversationIds = useMemo(() => openAgentConversationIds(conversationOpenState), [conversationOpenState])
  const openConversations = useMemo(() => {
    const openIds = new Set(openConversationIds)
    const orderIndex = new Map(conversationOpenState.map((record, index) => [record.id, index]))
    const sourceIndex = new Map(rawOpenConversations.map((conversation, index) => [conversation.id, index]))
    return rawOpenConversations.filter((conversation) => openIds.has(conversation.id)).sort((a, b) => {
      const aOrder = orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER
      const bOrder = orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER
      return aOrder - bOrder || (sourceIndex.get(a.id) ?? 0) - (sourceIndex.get(b.id) ?? 0)
    })
  }, [conversationOpenState, openConversationIds, rawOpenConversations])
  const providerSessionStatusLights = useAgentConversationTabProviderSessionStatusLights(openConversations)
  const archivedConversations = useMemo(
    () => conversations
      .filter((conversation) => conversation.archived === true)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  )
  const archivedProviderThreadIds = useMemo(
    () => new Set(archivedConversations.flatMap((conversation) => conversation.providerThreadId ? [conversation.providerThreadId] : [])),
    [archivedConversations],
  )
  const openProviderThreadIds = useMemo(
    () => new Set(openConversations.flatMap((conversation) => {
      const ids = conversation.providerThreadId ? [conversation.providerThreadId] : []
      if (conversation.id.startsWith('thread_')) ids.push(conversation.id)
      return ids
    })),
    [openConversations],
  )
  const providerSessionsById = useMemo(() => new Map(providerSessions.map((session) => [session.id, session])), [providerSessions])
  const providerSessionThreadsById = useMemo(() => new Map(providerSessionThreads.map((thread) => [thread.id, thread])), [providerSessionThreads])
  const appServerThreadsByProjectId = useMemo(() => {
    const groups = new Map<number, AgentChatThread[]>()
    for (const thread of appServerThreads) {
      const projectId = projectIdFromProviderSessionCwd(thread.cwd)
      if (projectId === undefined) continue
      const threads = groups.get(projectId) ?? []
      threads.push(thread)
      groups.set(projectId, threads)
    }
    return groups
  }, [appServerThreads])
  const appServerChatThreads = useMemo(
    () => appServerThreads.filter((thread) => projectIdFromProviderSessionCwd(thread.cwd) === undefined),
    [appServerThreads],
  )
  const projectNamesById = useMemo(() => {
    const names = new Map<number, string>()
    for (const item of projects) names.set(item.ID, item.name)
    if (project) names.set(project.ID, project.name)
    return names
  }, [project, projects])
  const conversationsByScope = useMemo(() => {
    const projectGroupsById = new Map<number, { projectId: number; projectName: string; conversations: Conversation[] }>()
    const chatConversations: Conversation[] = []
    for (const conversation of openConversations) {
      const projectId = conversationProjectId(conversation, {
        providerSessionThreadsById,
        conversationThreadBindings,
        providerSessionsById,
        pageTasks,
      })
      if (projectId === undefined) {
        chatConversations.push(conversation)
        continue
      }
      const group = projectGroupsById.get(projectId) ?? {
        projectId,
        projectName: projectNamesById.get(projectId) ?? `${t('agents.chat.agentModeSidebar.currentProjectFallback')} #${projectId}`,
        conversations: [],
      }
      group.conversations.push(conversation)
      projectGroupsById.set(projectId, group)
    }
    const projectGroups = Array.from(projectGroupsById.values())
      .sort((a, b) => a.projectName.localeCompare(b.projectName, i18n.resolvedLanguage))
    return { projectGroups, chatConversations }
  }, [conversationThreadBindings, i18n.resolvedLanguage, providerSessionsById, providerSessionThreadsById, openConversations, pageTasks, projectNamesById, t])
  const { projectGroups, chatConversations } = conversationsByScope
  const appServerProjectGroups = useMemo(() => Array.from(appServerThreadsByProjectId.entries())
    .map(([projectId, threads]) => ({
      projectId,
      projectName: projectNamesById.get(projectId) ?? `${t('agents.chat.agentModeSidebar.currentProjectFallback')} #${projectId}`,
      threads,
    }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName, i18n.resolvedLanguage)), [appServerThreadsByProjectId, i18n.resolvedLanguage, projectNamesById, t])
  const sidebarProjects = useMemo(() => {
    const itemsById = new Map<number, Pick<Project, 'ID' | 'name'>>()
    for (const item of projects) itemsById.set(item.ID, item)
    if (project) itemsById.set(project.ID, project)
    return Array.from(itemsById.values()).sort((a, b) => a.name.localeCompare(b.name, i18n.resolvedLanguage))
  }, [i18n.resolvedLanguage, project, projects])
  const visibleProjectGroups = useMemo(() => {
    const sourceGroups = new Map(projectGroups.map((group) => [group.projectId, group]))
    const groupIds = new Set(sidebarProjects.map((item) => item.ID))
    const groups = sidebarProjects.map((item) => sourceGroups.get(item.ID) ?? {
      projectId: item.ID,
      projectName: item.name,
      conversations: [],
    })
    for (const group of projectGroups) {
      if (!groupIds.has(group.projectId)) groups.push(group)
    }
    return groups.sort((a, b) => a.projectName.localeCompare(b.projectName, i18n.resolvedLanguage))
  }, [i18n.resolvedLanguage, projectGroups, sidebarProjects])
  const visibleAppServerProjectGroups = useMemo(() => {
    const sourceGroups = new Map(appServerProjectGroups.map((group) => [group.projectId, group]))
    const groupIds = new Set(sidebarProjects.map((item) => item.ID))
    const groups = sidebarProjects.map((item) => sourceGroups.get(item.ID) ?? {
      projectId: item.ID,
      projectName: item.name,
      threads: [],
    })
    for (const group of appServerProjectGroups) {
      if (!groupIds.has(group.projectId)) groups.push(group)
    }
    return groups.sort((a, b) => a.projectName.localeCompare(b.projectName, i18n.resolvedLanguage))
  }, [appServerProjectGroups, i18n.resolvedLanguage, sidebarProjects])
  const projectConversationGroupsEmpty = appServerMode ? visibleAppServerProjectGroups.length === 0 : visibleProjectGroups.length === 0
  const sortedChatConversations = chatConversations
  const visibleChatConversations = showAllChatConversations
    ? sortedChatConversations
    : sortedChatConversations.slice(0, DEFAULT_VISIBLE_CHAT_CONVERSATIONS)
  const hiddenChatConversationCount = Math.max(0, sortedChatConversations.length - visibleChatConversations.length)
  const historyItems = useMemo(() => [
    ...archivedConversations.map((conversation) => ({
      type: 'conversation' as const,
      id: conversation.id,
      timestamp: conversation.updatedAt,
      conversation,
    })),
    ...providerSessionThreads
      .filter((thread) => !archivedProviderThreadIds.has(thread.id) && !openProviderThreadIds.has(thread.id))
      .map((thread) => ({
        type: 'provider-thread' as const,
        id: thread.id,
        timestamp: Date.parse(thread.updatedAt) || 0,
        thread,
      })),
  ].sort((a, b) => b.timestamp - a.timestamp), [archivedConversations, archivedProviderThreadIds, providerSessionThreads, openProviderThreadIds])
  const visibleHistoryItems = showAllHistoryConversations
    ? historyItems
    : historyItems.slice(0, DEFAULT_VISIBLE_CHAT_CONVERSATIONS)
  const hiddenHistoryItemCount = Math.max(0, historyItems.length - visibleHistoryItems.length)
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  function selectAppServerThread(threadId: string) {
    setAppServerActiveThreadId(threadId)
    openAppServerThread({ threadId, provider: newConversationProvider })
    navigate(ROUTES.project.agent)
  }

  function threadIdForConversation(conversation: Conversation) {
    return conversationThreadBindings[conversation.id]?.providerThreadId
      ?? conversation.providerThreadId
      ?? (conversation.id.startsWith('thread_') ? conversation.id : undefined)
  }

  function providerSessionClientForThread(threadId: string | undefined) {
    const sessionId = threadId ? providerSessionThreadsById.get(threadId)?.sessionId : undefined
    return sessionId?.trim() ? providerSessionClient.forSession({ sessionId: sessionId.trim() }) : providerSessionClient
  }

  function providerSessionClientForConversation(conversation: Conversation) {
    const sessionId = conversationThreadBindings[conversation.id]?.providerSessionTreeId
      ?? conversation.providerSessionId
    return sessionId?.trim() ? providerSessionClient.forSession({ sessionId: sessionId.trim() }) : providerSessionClientForThread(threadIdForConversation(conversation))
  }

  async function startNewConversation() {
    if (appServerMode) {
      try {
        const dataSource = await createAgentChatDataSourceForProvider(newConversationProvider, {
          workspaceContext: newConversationWorkspaceContext,
        })
        const thread = await dataSource.startThread({
          ...(effectiveNewConversationWorkspaceScope !== 'global' && project?.ID ? { projectId: project.ID } : {}),
        })
        openAppServerThread({ threadId: thread.id, provider: newConversationProvider })
        navigate(ROUTES.project.agent)
      } catch (error) {
        console.error('[agent] failed to start app-server thread', error)
      }
      return
    }

    try {
      const thread = await startSharedProvisionalConversation({
        ...(project?.ID ? { projectId: project.ID } : {}),
      })
      const createdAt = Date.parse(thread.createdAt)
      const updatedAt = Date.parse(thread.updatedAt)
      const threadSummary = providerSessionThreadSummaryFromThread(thread)
      const conversationId = createProviderSessionConversation(userId, {
        threadId: thread.id,
        ...(thread.sessionId ? { sessionId: thread.sessionId } : {}),
        ...(thread.title?.trim() ? { title: thread.title.trim() } : {}),
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
      })
      upsertCachedProviderSessionThread(queryClient, threadSummary)
      setConversationProviderThreadBindingId(conversationId, thread.id)
      if (thread.sessionId) setConversationProviderSessionTreeId(conversationId, thread.sessionId)
      setConversationOpenState((current) => {
        const next = setAgentConversationOpen(current, [conversationId], true)
        writeAgentConversationOpenState(userId, next)
        return next
      })
      updateConversationRuntimeState(conversationId, {
        loading: false,
        building: false,
        error: undefined,
      })
      writeLastAgentModeActiveThreadId(userId, thread.id)
      void refetchProviderSessionThreads()
      void queryClient.invalidateQueries({ queryKey: ['provider-sessions', providerSessionClient.baseURL] })
      navigate(ROUTES.project.agent)
    } catch (error) {
      console.error('[agent] failed to start provisional conversation', error)
    }
  }

  function selectConversation(id: string) {
    void (async () => {
      const providerThreadId = id.startsWith('thread_') ? id : undefined
      if (providerThreadId) {
        await providerSessionClientForThread(providerThreadId).updateThread(providerThreadId, { archived: false })
        void refetchProviderSessionThreads()
      }
      setActiveConversation(userId, id)
      setConversationOpenState((current) => {
        const next = setAgentConversationOpen(current, [id], true)
        writeAgentConversationOpenState(userId, next)
        return next
      })
      writeLastAgentModeActiveThreadId(userId, id)
      navigate(ROUTES.project.agent)
    })().catch((error) => {
      console.error('[agent] failed to restore provider-session conversation', error)
    })
  }

  function archiveConversationFromSidebar(conversation: Conversation) {
    void (async () => {
      setConversationOpenState((current) => {
        const next = setAgentConversationOpen(current, [conversation.id], false)
        writeAgentConversationOpenState(userId, next)
        return next
      })
      if (getActiveConversationId(userId) === conversation.id) {
        setActiveConversation(userId, null)
        writeLastAgentModeActiveThreadId(userId, null)
      }
    })().catch((error) => {
      console.error('[agent] failed to archive provider-session conversation', error)
    })
  }

  function cleanupDeletedProviderSessionConversations(conversationId: string, deletedThreadIds: Iterable<string>) {
    const deletedThreadIdSet = new Set(deletedThreadIds)
    const sessionState = useAgentSessionStore.getState()
    const idsToRemove = new Set<string>([conversationId])
    const lastActiveThreadId = readLastAgentModeActiveThreadId(userId)
    const mappedConversationIds = new Set([
      ...Object.keys(sessionState.conversationThreadBindings),
      ...Object.keys(sessionState.conversationProviderSessionStates),
    ])
    for (const id of mappedConversationIds) {
      const providerThreadId = sessionState.conversationThreadBindings[id]?.providerThreadId
        ?? sessionState.conversationProviderSessionStates[id]?.threadId
        ?? (id.startsWith('thread_') ? id : undefined)
      if (providerThreadId && deletedThreadIdSet.has(providerThreadId)) idsToRemove.add(id)
    }
    if (lastActiveThreadId && deletedThreadIdSet.has(lastActiveThreadId)) {
      writeLastAgentModeActiveThreadId(userId, null)
    }
    for (const id of idsToRemove) {
      removeProviderSessionConversation(userId, id)
      clearConversationProviderSessionState(id)
    }
    setConversationOpenState((current) => {
      const next = removeAgentConversationOpenRecords(current, idsToRemove)
      writeAgentConversationOpenState(userId, next)
      return next
    })
  }

  function deleteConversationFromSidebar(conversation: Conversation) {
    void (async () => {
      const providerThreadId = threadIdForConversation(conversation)
      if (!providerThreadId) {
        removeProviderSessionConversation(userId, conversation.id)
        clearConversationProviderSessionState(conversation.id)
        return
      }
      const deletion = await providerSessionClientForConversation(conversation).deleteThread(providerThreadId)
      cleanupDeletedProviderSessionConversations(conversation.id, [deletion.threadId])
      void refetchProviderSessionThreads()
    })().catch((error) => {
      console.error('[agent] failed to delete provider-session conversation', error)
    })
  }

  function deleteHistoryThread(threadId: string) {
    void (async () => {
      const deletion = await providerSessionClientForThread(threadId).deleteThread(threadId)
      cleanupDeletedProviderSessionConversations(threadId, [deletion.threadId])
      void refetchProviderSessionThreads()
    })().catch((error) => {
      console.error('[agent] failed to delete provider-session thread', error)
    })
  }

  function toggleProjectGroup(projectId: number) {
    setOpenProjectGroups((state) => ({ ...state, [projectId]: !(state[projectId] ?? false) }))
  }

  function toggleProjectThreadGroup(projectId: number) {
    setExpandedProjectThreadGroups((state) => ({ ...state, [projectId]: !(state[projectId] ?? false) }))
  }

  function restoreHistoryThread(threadId: string) {
    setConversationOpenState((current) => {
      const next = setAgentConversationOpen(current, [threadId], true)
      writeAgentConversationOpenState(userId, next)
      return next
    })
    writeLastAgentModeActiveThreadId(userId, threadId)
    navigate(ROUTES.project.agent)
    window.setTimeout(() => openAgentPanelThread(threadId, providerSessionThreadsById.get(threadId)?.sessionId), 0)
  }

  return (
    <AgentModeSidebar
      resizing={sidebarResize.resizing}
      collapsed={sidebarCollapsed}
      style={{ width: renderedSidebarWidth }}
    >
      <AgentModeSidebarTop>
        {!sidebarCollapsed && headerActions ? (
          <div className="agent-mode-sidebar__header-actions">
            {headerActions}
          </div>
        ) : null}
        <AgentModePrimaryNavItem
          onClick={startNewConversation}
          title={t('agents.chat.agentModeSidebar.startConversation')}
        >
          <AgentModeIconSlot><SquarePen size={18} /></AgentModeIconSlot>
          <AgentModeLabel>新对话</AgentModeLabel>
        </AgentModePrimaryNavItem>
        {!sidebarCollapsed ? (
          <>
            <AgentModePrimaryNavItem
              className="agent-mode-nav-item--search"
              onClick={() => navigate(ROUTES.project.agent)}
              title="搜索"
            >
              <AgentModeIconSlot><Search size={19} /></AgentModeIconSlot>
              <AgentModeLabel>搜索</AgentModeLabel>
              <AgentModeMeta>⌘G</AgentModeMeta>
            </AgentModePrimaryNavItem>
            <AgentModePrimaryNavItem onClick={() => navigate(ROUTES.tools.refImageGen)} title="插件">
              <AgentModeIconSlot><Puzzle size={18} /></AgentModeIconSlot>
              <AgentModeLabel>插件</AgentModeLabel>
            </AgentModePrimaryNavItem>
            <AgentModePrimaryNavItem onClick={() => navigate(ROUTES.jobs)} title="自动化">
              <AgentModeIconSlot><Clock3 size={18} /></AgentModeIconSlot>
              <AgentModeLabel>自动化</AgentModeLabel>
            </AgentModePrimaryNavItem>
            <div className="agent-mode-provider-row">
              <AgentModeIconSlot><Smartphone size={18} /></AgentModeIconSlot>
              <select
                value={newConversationProvider.id}
                onChange={(event) => setNewConversationProviderId(event.currentTarget.value)}
                aria-label="选择新建会话使用的 Agent"
              >
                {availableProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label} · {provider.kind}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}
      </AgentModeSidebarTop>

      <AgentModeSidebarScroll>
        {!sidebarCollapsed ? (
          <div className="agent-mode-sidebar-project-heading">
            <span>项目</span>
          </div>
        ) : null}
        {projectConversationGroupsEmpty ? (
          <AgentModeEmptyText>{t('agents.chat.agentModeSidebar.noProjectConversations')}</AgentModeEmptyText>
        ) : (
          <AgentModeGroupList>
            {appServerMode ? visibleAppServerProjectGroups.map((group) => (
              <AgentModeProjectGroup key={group.projectId}>
                {(() => {
                  const open = openProjectGroups[group.projectId] ?? false
                  const expanded = expandedProjectThreadGroups[group.projectId] ?? false
                  const visibleThreads = expanded ? group.threads : group.threads.slice(0, DEFAULT_VISIBLE_PROJECT_CONVERSATIONS)
                  const hasHiddenThreads = group.threads.length > visibleThreads.length
                  return (
                    <>
                      <AgentModeProjectGroupToggle
                        onClick={() => toggleProjectGroup(group.projectId)}
                        aria-expanded={open}
                      >
                        {open
                          ? <AgentModeIconSlot><ChevronDown size={12} /></AgentModeIconSlot>
                          : <AgentModeIconSlot><ChevronRight size={12} /></AgentModeIconSlot>}
                        <AgentModeIconSlot><Folder size={14} /></AgentModeIconSlot>
                        <AgentModeLabel>{group.projectName}</AgentModeLabel>
                        <AgentModeMeta>{group.threads.length}</AgentModeMeta>
                      </AgentModeProjectGroupToggle>
                      {open ? (
                        <AgentModeGroupList nested>
                          {visibleThreads.length > 0 ? visibleThreads.map((thread) => (
                            <AppServerSidebarThread
                              key={thread.id}
                              thread={thread}
                              active={thread.id === appServerActiveThreadId}
                              providerLabel={newConversationProvider.label}
                              locale={locale}
                              now={relativeTimeNow}
                              onClick={() => selectAppServerThread(thread.id)}
                            />
                          )) : (
                            <AgentModeEmptyText>{t('agents.chat.agentModeSidebar.noProjectConversations')}</AgentModeEmptyText>
                          )}
                          {hasHiddenThreads || expanded ? (
                            <AgentModeCompactNavItem onClick={() => toggleProjectThreadGroup(group.projectId)}>
                              {expanded
                                ? t('agents.chat.agentModeSidebar.collapseProjectConversations')
                                : t('agents.chat.agentModeSidebar.expandProjectConversations')}
                            </AgentModeCompactNavItem>
                          ) : null}
                        </AgentModeGroupList>
                      ) : null}
                    </>
                  )
                })()}
              </AgentModeProjectGroup>
            )) : visibleProjectGroups.map((group) => (
              <AgentModeProjectGroup key={group.projectId}>
                {(() => {
                  const open = openProjectGroups[group.projectId] ?? false
                  const expanded = expandedProjectThreadGroups[group.projectId] ?? false
                  const visibleConversations = expanded ? group.conversations : group.conversations.slice(0, DEFAULT_VISIBLE_PROJECT_CONVERSATIONS)
                  const hasHiddenConversations = group.conversations.length > visibleConversations.length
                  return (
                    <>
                      <AgentModeProjectGroupToggle
                        onClick={() => toggleProjectGroup(group.projectId)}
                        aria-expanded={open}
                      >
                        {open
                          ? <AgentModeIconSlot><ChevronDown size={12} /></AgentModeIconSlot>
                          : <AgentModeIconSlot><ChevronRight size={12} /></AgentModeIconSlot>}
                        <AgentModeIconSlot><Folder size={14} /></AgentModeIconSlot>
                        <AgentModeLabel>{group.projectName}</AgentModeLabel>
                        <AgentModeMeta>{group.conversations.length}</AgentModeMeta>
                      </AgentModeProjectGroupToggle>
                      {open ? (
                        <AgentModeGroupList nested>
                          {visibleConversations.length > 0 ? visibleConversations.map((conversation) => (
                            <AgentSidebarConversation
                              key={conversation.id}
                              conversation={conversation}
                              active={conversation.id === activeConversationId}
                              locale={locale}
                              title={conversationDisplayTitle(conversation, t)}
                              archived={conversation.archived === true}
                              now={relativeTimeNow}
                              providerSessionStatusLight={providerSessionStatusLights[conversation.id]}
                              onClick={() => selectConversation(conversation.id)}
                              onArchive={() => archiveConversationFromSidebar(conversation)}
                              archiveLabel={t('agents.chat.archiveConversation')}
                            />
                          )) : (
                            <AgentModeEmptyText>{t('agents.chat.agentModeSidebar.noProjectConversations')}</AgentModeEmptyText>
                          )}
                          {hasHiddenConversations || expanded ? (
                            <AgentModeCompactNavItem onClick={() => toggleProjectThreadGroup(group.projectId)}>
                              {expanded
                                ? t('agents.chat.agentModeSidebar.collapseProjectConversations')
                                : t('agents.chat.agentModeSidebar.expandProjectConversations')}
                            </AgentModeCompactNavItem>
                          ) : null}
                        </AgentModeGroupList>
                      ) : null}
                    </>
                  )
                })()}
              </AgentModeProjectGroup>
            ))}
          </AgentModeGroupList>
        )}

        <AgentSidebarGroup
          title={t('agents.chat.agentModeSidebar.conversations')}
          icon={<MessageSquare size={13} />}
          trailing={appServerMode ? appServerChatThreads.length > 0 ? `${appServerChatThreads.length}` : undefined : chatConversations.length > 0 ? `${chatConversations.length}` : undefined}
          open={conversationsOpen}
          onOpenChange={setConversationsOpen}
        >
          {appServerMode ? (
            appServerChatThreads.length === 0 ? (
              <AgentModeCompactNavItem
                onClick={startNewConversation}
              >
                <AgentModeIconSlot><Plus size={12} /></AgentModeIconSlot>
                {appServerThreadsLoading ? t('common.loadingShort') : t('agents.chat.agentModeSidebar.startConversation')}
              </AgentModeCompactNavItem>
            ) : (
              <AgentModeGroupList nested>
                {appServerChatThreads.map((thread) => (
                  <AppServerSidebarThread
                    key={thread.id}
                    thread={thread}
                    active={thread.id === appServerActiveThreadId}
                    providerLabel={newConversationProvider.label}
                    locale={locale}
                    now={relativeTimeNow}
                    onClick={() => selectAppServerThread(thread.id)}
                  />
                ))}
              </AgentModeGroupList>
            )
          ) : sortedChatConversations.length === 0 ? (
            <AgentModeCompactNavItem
              onClick={startNewConversation}
            >
              <AgentModeIconSlot><Plus size={12} /></AgentModeIconSlot>
              {t('agents.chat.agentModeSidebar.startConversation')}
            </AgentModeCompactNavItem>
          ) : (
            <AgentModeGroupList nested>
              {visibleChatConversations.map((conversation) => (
                <AgentSidebarConversation
                  key={conversation.id}
                  conversation={conversation}
                  active={conversation.id === activeConversationId}
                  locale={locale}
                  title={conversationDisplayTitle(conversation, t)}
                  archived={conversation.archived === true}
                  now={relativeTimeNow}
                  providerSessionStatusLight={providerSessionStatusLights[conversation.id]}
                  onClick={() => selectConversation(conversation.id)}
                  onArchive={() => archiveConversationFromSidebar(conversation)}
                  archiveLabel={t('agents.chat.archiveConversation')}
                />
              ))}
              {hiddenChatConversationCount > 0 || showAllChatConversations ? (
                <AgentModeCompactNavItem
                  onClick={() => setShowAllChatConversations((value) => !value)}
                >
                  {showAllChatConversations
                    ? t('agents.chat.agentModeSidebar.showFewerConversations')
                    : t('agents.chat.agentModeSidebar.showMoreConversations', { count: hiddenChatConversationCount })}
                </AgentModeCompactNavItem>
              ) : null}
            </AgentModeGroupList>
          )}
        </AgentSidebarGroup>

        <AgentSidebarGroup
          title={t('agents.chat.conversationHistory')}
          icon={<History size={13} />}
          trailing={historyItems.length > 0 ? `${historyItems.length}` : undefined}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
        >
          {historyItems.length === 0 ? (
            <AgentModeEmptyText>
              {providerSessionThreadsLoading ? t('common.loadingShort') : t('agents.chat.noHistoryConversations')}
            </AgentModeEmptyText>
          ) : (
            <AgentModeGroupList nested>
              {visibleHistoryItems.map((item) => {
                if (item.type === 'conversation') {
                  return (
                    <AgentSidebarConversation
                      key={item.id}
                      conversation={item.conversation}
                      active={item.conversation.id === activeConversationId}
                      locale={locale}
                      title={conversationDisplayTitle(item.conversation, t)}
                      archived
                      now={relativeTimeNow}
                      onClick={() => selectConversation(item.conversation.id)}
                      onDelete={() => deleteConversationFromSidebar(item.conversation)}
                      archiveLabel={t('agents.chat.archiveConversation')}
                      deleteLabel={t('agents.chat.deleteConversation')}
                    />
                  )
                }
                const thread = item.thread
                return (
                  <AgentModeConversationRow key={thread.id}>
                    <AgentModeConversationItem
                      icon={<History size={11} />}
                      title={providerThreadTitle(thread, t)}
                      description={[
                        t('agents.chat.messagesCount', { count: thread.messageCount }),
                        thread.projectId ? t('agents.chat.panel.workspaces.projectBadge', { id: thread.projectId }) : null,
                      ].filter(Boolean).join(' · ')}
                      meta={formatAgentDate(thread.updatedAt, locale)}
                      onClick={() => restoreHistoryThread(thread.id)}
                      hasAction
                    />
                    <AgentModeConversationArchiveButton
                      type="button"
                      onClick={() => deleteHistoryThread(thread.id)}
                      aria-label={t('agents.chat.deleteConversation')}
                      title={t('agents.chat.deleteConversation')}
                    >
                      <Trash2 size={12} />
                    </AgentModeConversationArchiveButton>
                  </AgentModeConversationRow>
                )
              })}
              {hiddenHistoryItemCount > 0 || showAllHistoryConversations ? (
                <AgentModeCompactNavItem
                  onClick={() => setShowAllHistoryConversations((value) => !value)}
                >
                  {showAllHistoryConversations
                    ? t('agents.chat.agentModeSidebar.showFewerConversations')
                    : t('agents.chat.agentModeSidebar.showMoreConversations', { count: hiddenHistoryItemCount })}
                </AgentModeCompactNavItem>
              ) : null}
            </AgentModeGroupList>
          )}
        </AgentSidebarGroup>

      </AgentModeSidebarScroll>

      {!sidebarCollapsed ? (
        <AgentModeResizeHandle
          {...sidebarResize.resizeHandleProps}
          side="right"
        />
      ) : null}
    </AgentModeSidebar>
  )
}

function AgentSidebarGroup({
  title,
  icon,
  trailing,
  open,
  onOpenChange,
  children,
}: {
  title: string
  icon: ReactNode
  trailing?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <AgentModeGroup>
      <AgentModeGroupToggle
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
      >
        {icon}
        <AgentModeLabel>{title}</AgentModeLabel>
        {trailing ? <AgentModeMeta>{trailing}</AgentModeMeta> : null}
        {open ? <AgentModeIconSlot><ChevronDown size={12} /></AgentModeIconSlot> : <AgentModeIconSlot><ChevronRight size={12} /></AgentModeIconSlot>}
      </AgentModeGroupToggle>
      {open ? <AgentModeGroupBody>{children}</AgentModeGroupBody> : null}
    </AgentModeGroup>
  )
}

function conversationProjectId(
  conversation: Conversation,
  context: {
    providerSessionThreadsById: Map<string, AgentThreadSummary>
    conversationThreadBindings: Record<string, AgentConversationThreadBinding>
    providerSessionsById: Map<string, AgentSessionSummary>
    pageTasks: ReturnType<typeof useAgentSessionStore.getState>['pageTasks']
  },
) {
  const taskProjectId = Object.values(context.pageTasks)
    .filter((task) => task.conversationId === conversation.id)
    .map((task) => task.payload.projectId)
    .find((projectId): projectId is number => typeof projectId === 'number')
  if (taskProjectId !== undefined) return taskProjectId

  const binding = context.conversationThreadBindings[conversation.id]
  const sessionId = binding?.providerSessionTreeId ?? conversation.providerSessionId
  const sessionProjectId = sessionId ? context.providerSessionsById.get(sessionId)?.projectId : undefined
  if (typeof sessionProjectId === 'number') return sessionProjectId

  const threadId = binding?.providerThreadId ?? conversation.providerThreadId
  const threadProjectId = threadId ? context.providerSessionThreadsById.get(threadId)?.projectId : undefined
  return typeof threadProjectId === 'number' ? threadProjectId : undefined
}

function AgentSidebarConversation({
  conversation,
  active,
  locale,
  title,
  archived,
  now,
  providerSessionStatusLight,
  onClick,
  onArchive,
  onDelete,
  archiveLabel,
  deleteLabel,
}: {
  conversation: Conversation
  active: boolean
  locale: string
  title: string
  archived: boolean
  now: number
  providerSessionStatusLight?: ProviderSessionStatusLight
  onClick: () => void
  onArchive?: () => void
  onDelete?: () => void
  archiveLabel: string
  deleteLabel?: string
}) {
  const relativeTime = formatAgentRelativeTime(conversation.updatedAt, locale, now)
  const showArchiveAction = Boolean(active && onArchive && !archived)
  const showDeleteAction = Boolean(archived && onDelete)

  return (
    <AgentModeConversationRow>
      <AgentModeConversationItem
        onClick={onClick}
        active={active}
        icon={providerSessionStatusLight ? (
          <span className="agent-mode-conversation__icon-stack">
            <span
              className="agent-mode-conversation-session-light"
              data-session-state={providerSessionStatusLight.state}
              aria-hidden="true"
              title={providerSessionStatusLight.detail}
            />
          </span>
        ) : undefined}
        title={title}
        meta={relativeTime}
        hasAction={showArchiveAction || showDeleteAction}
      />
      {showArchiveAction ? (
        <AgentModeConversationArchiveButton
          type="button"
          onClick={onArchive}
          aria-label={archiveLabel}
          title={archiveLabel}
        >
          <Archive size={12} />
        </AgentModeConversationArchiveButton>
      ) : null}
      {showDeleteAction ? (
        <AgentModeConversationArchiveButton
          type="button"
          onClick={onDelete}
          aria-label={deleteLabel}
          title={deleteLabel}
        >
          <Trash2 size={12} />
        </AgentModeConversationArchiveButton>
      ) : null}
    </AgentModeConversationRow>
  )
}

function AppServerSidebarThread({
  thread,
  active,
  providerLabel,
  locale,
  now,
  onClick,
}: {
  thread: AgentChatThread
  active: boolean
  providerLabel: string
  locale: string
  now: number
  onClick: () => void
}) {
  const label = providerLabel.trim() || 'App-server'
  const relativeTime = formatAgentRelativeTime(thread.updatedAt * 1000, locale, now)
  const sessionState = thread.status === 'running' ? 'active' : thread.status === 'failed' ? 'waiting' : 'stopped'
  return (
    <AgentModeConversationRow>
      <AgentModeConversationItem
        onClick={onClick}
        active={active}
        icon={(
          <span className="agent-mode-conversation__icon-stack">
            <span
              className="agent-mode-conversation-session-light"
              data-session-state={sessionState}
              aria-hidden="true"
              title={`${label} ${thread.status}`}
            />
          </span>
        )}
        title={thread.name || thread.preview || `Untitled ${label} thread`}
        description={thread.preview || label}
        meta={relativeTime}
      />
    </AgentModeConversationRow>
  )
}

function ProjectAgentChatSurface({ userId }: { userId: string }) {
  const providerSettings = useProviderConfigStore((s) => s.settings)
  const activeProvider = useMemo(() => resolveNewConversationProvider(providerSettings), [providerSettings])
  const appServerMode = usesAppServerProtocol(activeProvider)
  const activeConversationId = useAgentSessionStore((s) => s.activeConversationIdsByUser?.[userId] ?? null)
  const setActiveConversation = useAgentSessionStore((s) => s.setActiveConversation)
  const { data: providerThreads = [], isLoading: providerThreadsLoading } = useQuery<AgentThreadSummary[]>({
    queryKey: ['provider-session-threads', providerSessionClient.baseURL, 'project-agent-chat-surface'],
    queryFn: () => listProviderSessionThreadSummariesFromWorkspace({ includeProvisional: true }),
    enabled: !appServerMode,
    retry: false,
  })
  const frontendOpenState = readAgentConversationOpenState(userId)
  const frontendOpenThreadIds = openAgentConversationIds(frontendOpenState)
  const activeConversationOpen = !!activeConversationId
    && !appServerMode
    && providerThreads.some((thread) => thread.id === activeConversationId && thread.archived !== true)
    && (frontendOpenState.length === 0 || frontendOpenThreadIds.includes(activeConversationId))

  useEffect(() => {
    if (appServerMode) return
    if (providerThreadsLoading) return
    if (activeConversationOpen) {
      if (activeConversationId) writeLastAgentModeActiveThreadId(userId, activeConversationId)
      return
    }
    if (activeConversationId && frontendOpenThreadIds.includes(activeConversationId)) return
    const openProviderThreads = providerThreads
      .filter((thread) => thread.archived !== true && thread.lifecycle !== 'abandoned')
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    if (frontendOpenState.length > 0 && frontendOpenThreadIds.length === 0) return
    const lastActiveThreadId = readLastAgentModeActiveThreadId(userId)
    const threadToOpen = openProviderThreads.find((thread) => thread.id === lastActiveThreadId && frontendOpenThreadIds.includes(thread.id))
      ?? openProviderThreads.find((thread) => frontendOpenThreadIds.includes(thread.id))
    if (threadToOpen) {
      setActiveConversation(userId, threadToOpen.id)
      writeLastAgentModeActiveThreadId(userId, threadToOpen.id)
    }
  }, [activeConversationId, activeConversationOpen, appServerMode, providerThreads, providerThreadsLoading, setActiveConversation, userId])

  return (
    <AgentModeChatSurface>
      <AgentModeChatSurfaceInner>
        <AgentUnifiedChatShell
          userId={userId}
          onCollapse={() => { }}
          showCollapse={false}
          host="immersive"
          surface="page"
        />
      </AgentModeChatSurfaceInner>
    </AgentModeChatSurface>
  )
}

function ProjectAgentModeWorkspace({ userId }: { userId: string }) {
  return (
    <div className="agent-mode-workspace-stack">
      <ProjectAgentChatSurface userId={userId} />
    </div>
  )
}

function workspaceContextForNewConversation(input: {
  scope: AgentWorkspaceScopeSelection
  projectId?: number
}): MovScriptWorkspaceContext {
  if (input.scope === 'global' || input.projectId === undefined) {
    return { scope: 'global' }
  }
  return {
    scope: 'project',
    projectId: input.projectId,
  }
}

function projectIdFromProviderSessionCwd(cwd: string | null | undefined): number | undefined {
  const normalized = cwd?.replace(/\\/g, '/')
  if (!normalized) return undefined
  const match = /(?:^|\/)\.movscript\/(?:local|user\/[^/]+|org\/[^/]+)\/projects\/project_(\d+)(?:\/|$)/.exec(normalized)
  if (!match?.[1]) return undefined
  const projectId = Number(match[1])
  return Number.isInteger(projectId) && projectId > 0 ? projectId : undefined
}

function positiveInteger(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

export function ProjectAgentContentPanel({
  manageOwnWidth = false,
  collapsed = false,
  onWidthChange,
}: {
  manageOwnWidth?: boolean
  collapsed?: boolean
  onWidthChange?: (width: number) => void
} = {}) {
  const setCollapsed = useAgentPanelUiStore((s) => s.setAgentModeContentPanelCollapsed)
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === 'undefined') return AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH
    const saved = Number(window.localStorage.getItem(AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY))
    return Number.isFinite(saved) ? clampAgentModeContentPanelWidth(saved) : AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH
  })
  const panelResize = useResizablePanel({
    size: panelWidth,
    onSizeChange: setPanelWidth,
    minSize: AGENT_MODE_CONTENT_PANEL_MIN_WIDTH,
    maxSize: AGENT_MODE_CONTENT_PANEL_MAX_WIDTH,
    resizeEdge: 'left',
    collapsed,
    onCollapsedChange: setCollapsed,
    collapseMode: 'after-min',
    ariaLabel: '调整对话区宽度',
  })

  useEffect(() => {
    onWidthChange?.(panelWidth)
  }, [onWidthChange, panelWidth])

  useEffect(() => {
    window.localStorage.setItem(AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY, String(panelWidth))
  }, [panelWidth])

  return (
    <AgentModeContentPanel
      resizing={panelResize.resizing}
      collapsed={collapsed}
      style={manageOwnWidth ? (
        collapsed
          ? { width: 0, flexBasis: 0, minWidth: 0 }
          : {
            width: panelWidth,
            flexBasis: panelWidth,
            minWidth: AGENT_MODE_CONTENT_PANEL_MIN_WIDTH,
          }
      ) : undefined}
      aria-label="Agent 内容区"
      aria-hidden={collapsed ? true : undefined}
    >
      <AgentBrowserPanel />
      {!collapsed ? (
        <AgentModeResizeHandle
          {...panelResize.resizeHandleProps}
          side="left"
        />
      ) : null}
    </AgentModeContentPanel>
  )
}
