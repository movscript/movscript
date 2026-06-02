import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Archive,
  ChevronDown,
  ChevronRight,
  History,
  MessageSquare,
  PanelTopOpen,
  Plus,
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
  AgentModeProjectMenuContent,
  AgentModeProjectSelectButton,
  AgentModeResizeHandle,
  AgentModeRoot,
  AgentModeSidebar,
  AgentModeSidebarScroll,
  AgentModeSidebarTop,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useResizablePanel,
} from '@movscript/ui'
import { useTranslation } from 'react-i18next'

import { AgentBuiltinChatShell } from '@/features/agent/components/AgentBuiltinChatShell'
import { AgentBrowserPanel } from '@/features/agent/components/AgentBrowserPanel'
import { openAgentPanelThread, AGENT_PANEL_THREAD_EVENT } from '@/features/agent/application/agentPanelBridge'
import { conversationDisplayTitle, formatAgentDate, formatAgentRelativeTime, localThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import { conversationFromRuntimeThreadSummary } from '@/features/agent/presentation/agentRuntimeThreadConversation'
import { api } from '@/shared/infrastructure/api'
import { localAgentClient, type AgentSessionSummary, type AgentThreadSummary } from '@/shared/infrastructure/localAgentClient'
import { projectListQueryKey } from '@/features/project/application/projectQueries'
import { ROUTES } from '@/routes/projectRoutes'
import { useAgentConversationTabRuntimeStatusLights } from '@/features/agent/presentation/useAgentConversationTabRuntimeStatusLights'
import { useAgentPanelUiStore } from '@/features/agent/presentation/agentPanelUiStore'
import type { AgentRuntimeStatusLight } from '@/features/agent/domain/agentRuntimeStatusLight'
import type { Conversation } from '@/features/agent/state/agentStore'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import type { Project } from '@/types'

const DEFAULT_VISIBLE_PROJECT_GROUPS = 5
const DEFAULT_VISIBLE_CHAT_CONVERSATIONS = 5
const AGENT_SIDEBAR_WIDTH_STORAGE_KEY = 'movscript-agent-mode-sidebar-width'
const AGENT_SIDEBAR_DEFAULT_WIDTH = 288
const AGENT_SIDEBAR_MIN_WIDTH = 180
const AGENT_SIDEBAR_MAX_WIDTH = 420
const AGENT_SIDEBAR_COLLAPSED_WIDTH = 0
export const AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY = 'movscript-agent-mode-content-panel-width'
export const AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH = 380
export const AGENT_MODE_CONTENT_PANEL_MIN_WIDTH = 200
export const AGENT_MODE_CONTENT_PANEL_MAX_WIDTH = 1500

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

function clampAgentSidebarWidth(width: number) {
  return Math.min(AGENT_SIDEBAR_MAX_WIDTH, Math.max(AGENT_SIDEBAR_MIN_WIDTH, width))
}

export function clampAgentModeContentPanelWidth(width: number) {
  return Math.min(AGENT_MODE_CONTENT_PANEL_MAX_WIDTH, Math.max(AGENT_MODE_CONTENT_PANEL_MIN_WIDTH, width))
}

function agentModeRenderDiagnosticsEnabled() {
  return import.meta.env.DEV && import.meta.env.VITE_MOVSCRIPT_AGENT_MODE_RENDER_DIAGNOSTICS === '1'
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
  const { t, i18n } = useTranslation()
  const project = useProjectStore((s) => s.current)
  const setCurrentProject = useProjectStore((s) => s.setCurrent)
  const currentUser = useUserStore((s) => s.currentUser)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const userId = currentUser ? String(currentUser.ID) : ''
  const getActiveConversationId = useAgentSessionStore((s) => s.getActiveConversationId)
  const createRuntimeConversation = useAgentSessionStore((s) => s.createRuntimeConversation)
  const removeRuntimeConversation = useAgentSessionStore((s) => s.removeRuntimeConversation)
  const setActiveConversation = useAgentSessionStore((s) => s.setActiveConversation)
  const pageTasks = useAgentSessionStore((s) => s.pageTasks)
  const runtimeThreadProjections = useAgentSessionStore((s) => s.runtimeThreadProjections)
  const localThreadIdsByConversation = useAgentSessionStore((s) => s.localThreadIdsByConversation)
  const sessionIdsByConversation = useAgentSessionStore((s) => s.sessionIdsByConversation)
  const setLocalThreadId = useAgentSessionStore((s) => s.setLocalThreadId)
  const setConversationSessionId = useAgentSessionStore((s) => s.setConversationSessionId)
  const setConversationRuntime = useAgentSessionStore((s) => s.setConversationRuntime)
  const clearConversationRuntimeState = useAgentSessionStore((s) => s.clearConversationRuntimeState)
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [showAllProjectGroups, setShowAllProjectGroups] = useState(false)
  const [openProjectGroups, setOpenProjectGroups] = useState<Record<number, boolean>>({})
  const [conversationsOpen, setConversationsOpen] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(true)
  const [showAllChatConversations, setShowAllChatConversations] = useState(false)
  const [showAllHistoryConversations, setShowAllHistoryConversations] = useState(false)
  const [relativeTimeNow, setRelativeTimeNow] = useState(() => Date.now())
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') return AGENT_SIDEBAR_DEFAULT_WIDTH
    const saved = Number(window.localStorage.getItem(AGENT_SIDEBAR_WIDTH_STORAGE_KEY))
    return Number.isFinite(saved) ? clampAgentSidebarWidth(saved) : AGENT_SIDEBAR_DEFAULT_WIDTH
  })
  const sidebarCollapsed = useAgentPanelUiStore((s) => s.agentModeSidebarCollapsed)
  const setSidebarCollapsed = useAgentPanelUiStore((s) => s.setAgentModeSidebarCollapsed)
  const sidebarResize = useResizablePanel({
    size: sidebarWidth,
    onSizeChange: setSidebarWidth,
    minSize: AGENT_SIDEBAR_MIN_WIDTH,
    maxSize: AGENT_SIDEBAR_MAX_WIDTH,
    resizeEdge: 'right',
    collapsed: sidebarCollapsed,
    onCollapsedChange: setSidebarCollapsed,
    collapseMode: 'after-min',
    ariaLabel: '调整左侧栏宽度',
  })
  const renderedSidebarWidth = sidebarCollapsed ? AGENT_SIDEBAR_COLLAPSED_WIDTH : sidebarWidth

  useEffect(() => {
    window.localStorage.setItem(AGENT_SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    const interval = window.setInterval(() => setRelativeTimeNow(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: projectListQueryKey(currentOrgID),
    queryFn: () => api.get('/projects').then((response) => response.data),
  })
  const { data: localThreads = [], isLoading: localThreadsLoading, refetch: refetchLocalThreads } = useQuery<AgentThreadSummary[]>({
    queryKey: ['local-agent-threads', localAgentClient.baseURL, 'agent-mode-sidebar'],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.listThreads({ includeProvisional: true }).then((r) => r.threads)
    },
    retry: false,
  })
  const { data: localSessions = [] } = useQuery<AgentSessionSummary[]>({
    queryKey: ['local-agent-sessions', localAgentClient.baseURL, 'agent-mode-sidebar'],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.listSessions().then((r) => r.sessions)
    },
    retry: false,
  })

  const conversations = useMemo(() => {
    return localThreads.map((thread) => conversationFromRuntimeThreadSummary(thread, t))
  }, [localThreads, t])
  const conversationsWithRuntimeProjection = useMemo(
    () => conversations.map((conversation) => {
      const projectionMessages = runtimeThreadProjections[conversation.id]?.messages
      return projectionMessages ? { ...conversation, messages: projectionMessages } : conversation
    }),
    [conversations, runtimeThreadProjections],
  )
  const activeConversationId = getActiveConversationId(userId)
  const openConversations = useMemo(
    () => conversationsWithRuntimeProjection.filter((conversation) => conversation.archived !== true),
    [conversationsWithRuntimeProjection],
  )
  const runtimeStatusLights = useAgentConversationTabRuntimeStatusLights(openConversations)
  const archivedConversations = useMemo(
    () => conversationsWithRuntimeProjection
      .filter((conversation) => conversation.archived === true)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [conversationsWithRuntimeProjection],
  )
  const archivedRuntimeThreadIds = useMemo(
    () => new Set(archivedConversations.flatMap((conversation) => conversation.runtimeThreadId ? [conversation.runtimeThreadId] : [])),
    [archivedConversations],
  )
  const openRuntimeThreadIds = useMemo(
    () => new Set(openConversations.flatMap((conversation) => {
      const ids = conversation.runtimeThreadId ? [conversation.runtimeThreadId] : []
      if (conversation.id.startsWith('thread_')) ids.push(conversation.id)
      return ids
    })),
    [openConversations],
  )
  const localSessionsById = useMemo(() => new Map(localSessions.map((session) => [session.id, session])), [localSessions])
  const localThreadsById = useMemo(() => new Map(localThreads.map((thread) => [thread.id, thread])), [localThreads])
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
        localThreadsById,
        localThreadIdsByConversation,
        localSessionsById,
        sessionIdsByConversation,
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
      .map((group) => ({
        ...group,
        conversations: group.conversations.sort(compareConversationCreationOrder),
      }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName, i18n.resolvedLanguage))
    return { projectGroups, chatConversations }
  }, [i18n.resolvedLanguage, localSessionsById, localThreadsById, localThreadIdsByConversation, openConversations, pageTasks, projectNamesById, sessionIdsByConversation, t])
  const { projectGroups, chatConversations } = conversationsByScope
  const visibleProjectGroups = showAllProjectGroups ? projectGroups : projectGroups.slice(0, DEFAULT_VISIBLE_PROJECT_GROUPS)
  const hiddenProjectGroupCount = Math.max(0, projectGroups.length - visibleProjectGroups.length)
  const projectConversationCount = projectGroups.reduce((sum, group) => sum + group.conversations.length, 0)
  const sortedChatConversations = useMemo(
    () => [...chatConversations].sort(compareConversationCreationOrder),
    [chatConversations],
  )
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
    ...localThreads
      .filter((thread) => !archivedRuntimeThreadIds.has(thread.id) && !openRuntimeThreadIds.has(thread.id))
      .map((thread) => ({
        type: 'runtime-thread' as const,
        id: thread.id,
        timestamp: Date.parse(thread.updatedAt) || 0,
        thread,
      })),
  ].sort((a, b) => b.timestamp - a.timestamp), [archivedConversations, archivedRuntimeThreadIds, localThreads, openRuntimeThreadIds])
  const visibleHistoryItems = showAllHistoryConversations
    ? historyItems
    : historyItems.slice(0, DEFAULT_VISIBLE_CHAT_CONVERSATIONS)
  const hiddenHistoryItemCount = Math.max(0, historyItems.length - visibleHistoryItems.length)
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  function threadIdForConversation(conversation: Conversation) {
    return localThreadIdsByConversation[conversation.id]
      ?? conversation.runtimeThreadId
      ?? (conversation.id.startsWith('thread_') ? conversation.id : undefined)
  }

  async function startNewConversation() {
    try {
      await localAgentClient.ensureRunning()
      const thread = await localAgentClient.startProvisionalConversation({
        title: t('agents.chat.newConversation'),
        ...(project?.ID ? { projectId: project.ID } : {}),
      })
      const createdAt = Date.parse(thread.createdAt)
      const updatedAt = Date.parse(thread.updatedAt)
      const conversationId = createRuntimeConversation(userId, {
        threadId: thread.id,
        ...(thread.sessionId ? { sessionId: thread.sessionId } : {}),
        title: localThreadTitle(thread, t),
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
      })
      setLocalThreadId(conversationId, thread.id)
      if (thread.sessionId) setConversationSessionId(conversationId, thread.sessionId)
      setConversationRuntime(conversationId, {
        ...(thread.sessionId ? { sessionId: thread.sessionId } : {}),
        threadId: thread.id,
        loading: false,
        building: false,
        error: undefined,
      })
      void refetchLocalThreads()
      navigate(ROUTES.project.agent)
    } catch (error) {
      console.error('[agent] failed to start provisional conversation', error)
    }
  }

  function selectConversation(id: string) {
    void (async () => {
      const runtimeThreadId = id.startsWith('thread_') ? id : undefined
      if (runtimeThreadId) {
        await localAgentClient.updateThread(runtimeThreadId, { archived: false })
        void refetchLocalThreads()
      }
      setActiveConversation(userId, id)
      navigate(ROUTES.project.agent)
    })().catch((error) => {
      console.error('[agent] failed to restore runtime conversation', error)
    })
  }

  function archiveConversationFromSidebar(conversation: Conversation) {
    void (async () => {
      const runtimeThreadId = threadIdForConversation(conversation)
      if (runtimeThreadId) {
        await localAgentClient.updateThread(runtimeThreadId, { archived: true })
        void refetchLocalThreads()
      }
      if (getActiveConversationId(userId) === conversation.id) setActiveConversation(userId, null)
    })().catch((error) => {
      console.error('[agent] failed to archive runtime conversation', error)
    })
  }

  function cleanupDeletedRuntimeConversations(conversationId: string, deletedThreadIds: Iterable<string>) {
    const deletedThreadIdSet = new Set(deletedThreadIds)
    const sessionState = useAgentSessionStore.getState()
    const idsToRemove = new Set<string>([conversationId])
    for (const id of Object.keys(sessionState.conversationRuntimes)) {
      const runtimeThreadId = sessionState.localThreadIdsByConversation[id]
        ?? sessionState.conversationRuntimes[id]?.threadId
        ?? (id.startsWith('thread_') ? id : undefined)
      if (runtimeThreadId && deletedThreadIdSet.has(runtimeThreadId)) idsToRemove.add(id)
    }
    for (const id of idsToRemove) {
      removeRuntimeConversation(userId, id)
      clearConversationRuntimeState(id)
    }
  }

  function deleteConversationFromSidebar(conversation: Conversation) {
    void (async () => {
      const runtimeThreadId = threadIdForConversation(conversation)
      if (!runtimeThreadId) {
        removeRuntimeConversation(userId, conversation.id)
        clearConversationRuntimeState(conversation.id)
        return
      }
      const deletion = await localAgentClient.deleteThread(runtimeThreadId)
      cleanupDeletedRuntimeConversations(conversation.id, [deletion.threadId])
      void refetchLocalThreads()
    })().catch((error) => {
      console.error('[agent] failed to delete runtime conversation', error)
    })
  }

  function deleteHistoryThread(threadId: string) {
    void (async () => {
      const deletion = await localAgentClient.deleteThread(threadId)
      cleanupDeletedRuntimeConversations(threadId, [deletion.threadId])
      void refetchLocalThreads()
    })().catch((error) => {
      console.error('[agent] failed to delete runtime thread', error)
    })
  }

  function toggleProjectGroup(projectId: number) {
    setOpenProjectGroups((state) => ({ ...state, [projectId]: !(state[projectId] ?? false) }))
  }

  function selectProject(nextProject: Project | null) {
    setCurrentProject(nextProject)
    navigate(ROUTES.project.agent)
  }

  function restoreHistoryThread(threadId: string) {
    navigate(ROUTES.project.agent)
    window.setTimeout(() => openAgentPanelThread(threadId), 0)
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
        {!sidebarCollapsed ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <AgentModeProjectSelectButton>
                <AgentModeLabel>{project?.name ?? t('agents.chat.agentModeSidebar.currentProjectFallback')}</AgentModeLabel>
                <AgentModeMeta>{projects.length}</AgentModeMeta>
                <AgentModeIconSlot><ChevronDown size={12} /></AgentModeIconSlot>
              </AgentModeProjectSelectButton>
            </DropdownMenuTrigger>
            <AgentModeProjectMenuContent>
              <DropdownMenuItem onSelect={() => selectProject(null)}>
                {t('agents.chat.agentModeSidebar.allProjects')}
              </DropdownMenuItem>
              {projects.length > 0 ? <DropdownMenuSeparator /> : null}
              {projects.map((item) => (
                <DropdownMenuItem key={item.ID} onSelect={() => selectProject(item)}>
                  {item.name}
                </DropdownMenuItem>
              ))}
            </AgentModeProjectMenuContent>
          </DropdownMenu>
        ) : null}
        <AgentModePrimaryNavItem
          onClick={startNewConversation}
          title={t('agents.chat.agentModeSidebar.newConversation')}
        >
          <AgentModeIconSlot><Plus size={14} /></AgentModeIconSlot>
          <AgentModeLabel>{t('agents.chat.agentModeSidebar.newConversation')}</AgentModeLabel>
        </AgentModePrimaryNavItem>
      </AgentModeSidebarTop>

      <AgentModeSidebarScroll>
        <AgentSidebarGroup
          title={t('agents.chat.agentModeSidebar.project')}
          icon={<PanelTopOpen size={13} />}
          trailing={`${projectConversationCount}`}
          open={projectsOpen}
          onOpenChange={setProjectsOpen}
        >
          {projectGroups.length === 0 ? (
            <AgentModeEmptyText>{t('agents.chat.agentModeSidebar.noProjectConversations')}</AgentModeEmptyText>
          ) : (
            <AgentModeGroupList>
              {visibleProjectGroups.map((group) => (
                <AgentModeProjectGroup key={group.projectId}>
                  <AgentModeProjectGroupToggle
                    onClick={() => toggleProjectGroup(group.projectId)}
                    aria-expanded={openProjectGroups[group.projectId] ?? false}
                  >
                    {(openProjectGroups[group.projectId] ?? false)
                      ? <AgentModeIconSlot><ChevronDown size={12} /></AgentModeIconSlot>
                      : <AgentModeIconSlot><ChevronRight size={12} /></AgentModeIconSlot>}
                    <AgentModeLabel>{group.projectName}</AgentModeLabel>
                    <AgentModeMeta>{group.conversations.length}</AgentModeMeta>
                  </AgentModeProjectGroupToggle>
                  {(openProjectGroups[group.projectId] ?? false) ? (
                    <AgentModeGroupList nested>
                      {group.conversations.map((conversation) => (
                        <AgentSidebarConversation
                          key={conversation.id}
                          conversation={conversation}
                          active={conversation.id === activeConversationId}
                          locale={locale}
                          title={conversationDisplayTitle(conversation, t)}
                          archived={conversation.archived === true}
                          now={relativeTimeNow}
                          runtimeStatusLight={runtimeStatusLights[conversation.id]}
                          onClick={() => selectConversation(conversation.id)}
                          onArchive={() => archiveConversationFromSidebar(conversation)}
                          archiveLabel={t('agents.chat.archiveConversation')}
                        />
                      ))}
                    </AgentModeGroupList>
                  ) : null}
                </AgentModeProjectGroup>
              ))}
              {hiddenProjectGroupCount > 0 || showAllProjectGroups ? (
                <AgentModeCompactNavItem
                  onClick={() => setShowAllProjectGroups((value) => !value)}
                >
                  {showAllProjectGroups
                    ? t('agents.chat.agentModeSidebar.showFewerProjects')
                    : t('agents.chat.agentModeSidebar.showMoreProjects', { count: hiddenProjectGroupCount })}
                </AgentModeCompactNavItem>
              ) : null}
            </AgentModeGroupList>
          )}
        </AgentSidebarGroup>

        <AgentSidebarGroup
          title={t('agents.chat.agentModeSidebar.conversations')}
          icon={<MessageSquare size={13} />}
          trailing={chatConversations.length > 0 ? `${chatConversations.length}` : undefined}
          open={conversationsOpen}
          onOpenChange={setConversationsOpen}
        >
          {sortedChatConversations.length === 0 ? (
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
                  runtimeStatusLight={runtimeStatusLights[conversation.id]}
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
              {localThreadsLoading ? t('common.loadingShort') : t('agents.chat.noHistoryConversations')}
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
                      title={localThreadTitle(thread, t)}
                      description={[
                        t('agents.chat.messagesCount', { count: thread.messageCount }),
                        thread.projectId ? t('agents.chat.panel.drafts.projectBadge', { id: thread.projectId }) : null,
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
    localThreadsById: Map<string, AgentThreadSummary>
    localThreadIdsByConversation: Record<string, string>
    localSessionsById: Map<string, AgentSessionSummary>
    sessionIdsByConversation: Record<string, string>
    pageTasks: ReturnType<typeof useAgentSessionStore.getState>['pageTasks']
  },
) {
  const taskProjectId = Object.values(context.pageTasks)
    .filter((task) => task.conversationId === conversation.id)
    .map((task) => task.payload.projectId)
    .find((projectId): projectId is number => typeof projectId === 'number')
  if (taskProjectId !== undefined) return taskProjectId

  const sessionId = context.sessionIdsByConversation[conversation.id] ?? conversation.runtimeSessionId
  const sessionProjectId = sessionId ? context.localSessionsById.get(sessionId)?.projectId : undefined
  if (typeof sessionProjectId === 'number') return sessionProjectId

  const threadId = context.localThreadIdsByConversation[conversation.id] ?? conversation.runtimeThreadId
  const threadProjectId = threadId ? context.localThreadsById.get(threadId)?.projectId : undefined
  return typeof threadProjectId === 'number' ? threadProjectId : undefined
}

function compareConversationCreationOrder(a: Conversation, b: Conversation) {
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id)
}

function AgentSidebarConversation({
  conversation,
  active,
  locale,
  title,
  archived,
  now,
  runtimeStatusLight,
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
  runtimeStatusLight?: AgentRuntimeStatusLight
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
        icon={runtimeStatusLight ? (
          <span className="agent-mode-conversation__icon-stack">
            <span
              className="agent-mode-conversation-runtime-light"
              data-runtime-state={runtimeStatusLight.state}
              aria-hidden="true"
              title={runtimeStatusLight.detail}
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

function ProjectAgentChatSurface({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const getActiveConversationId = useAgentSessionStore((s) => s.getActiveConversationId)
  const createRuntimeConversation = useAgentSessionStore((s) => s.createRuntimeConversation)
  const setActiveConversation = useAgentSessionStore((s) => s.setActiveConversation)
  const setLocalThreadId = useAgentSessionStore((s) => s.setLocalThreadId)
  const setConversationSessionId = useAgentSessionStore((s) => s.setConversationSessionId)
  const setConversationRuntime = useAgentSessionStore((s) => s.setConversationRuntime)
  const { data: runtimeThreads = [], isLoading: runtimeThreadsLoading, refetch: refetchRuntimeThreads } = useQuery<AgentThreadSummary[]>({
    queryKey: ['local-agent-threads', localAgentClient.baseURL, 'project-agent-chat-surface'],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.listThreads({ includeProvisional: true }).then((result) => result.threads)
    },
    retry: false,
  })
  const [pendingThreadIdToOpen, setPendingThreadIdToOpen] = useState<string | null>(null)
  const creatingConversationRef = useRef(false)
  const activeConversationId = getActiveConversationId(userId)
  const activeConversationOpen = !!activeConversationId && (
    runtimeThreads.some((thread) => thread.id === activeConversationId && thread.archived !== true)
  )

  useEffect(() => {
    function handleThreadOpen(event: Event) {
      const detail = (event as CustomEvent<{ threadId?: string }>).detail
      if (detail?.threadId?.trim()) setPendingThreadIdToOpen(detail.threadId)
    }

    window.addEventListener(AGENT_PANEL_THREAD_EVENT, handleThreadOpen)
    return () => window.removeEventListener(AGENT_PANEL_THREAD_EVENT, handleThreadOpen)
  }, [])

  useEffect(() => {
    if (runtimeThreadsLoading) return
    if (activeConversationOpen) {
      creatingConversationRef.current = false
      return
    }
    const latestOpenRuntimeThread = runtimeThreads
      .filter((thread) => thread.archived !== true && thread.lifecycle !== 'abandoned')
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]
    if (latestOpenRuntimeThread) {
      setActiveConversation(userId, latestOpenRuntimeThread.id)
      creatingConversationRef.current = false
      return
    }
    if (creatingConversationRef.current) return
    creatingConversationRef.current = true
    void (async () => {
      try {
        await localAgentClient.ensureRunning()
        const thread = await localAgentClient.startProvisionalConversation({
          title: t('agents.chat.newConversation'),
        })
        const createdAt = Date.parse(thread.createdAt)
        const updatedAt = Date.parse(thread.updatedAt)
        const conversationId = createRuntimeConversation(userId, {
          threadId: thread.id,
          ...(thread.sessionId ? { sessionId: thread.sessionId } : {}),
          title: localThreadTitle(thread, t),
          createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
          updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
        })
        setLocalThreadId(conversationId, thread.id)
        if (thread.sessionId) setConversationSessionId(conversationId, thread.sessionId)
        setConversationRuntime(conversationId, {
          ...(thread.sessionId ? { sessionId: thread.sessionId } : {}),
          threadId: thread.id,
          loading: false,
          building: false,
          error: undefined,
        })
        void refetchRuntimeThreads()
      } catch (error) {
        creatingConversationRef.current = false
        console.error('[agent] failed to start provisional conversation', error)
      }
    })()
  }, [activeConversationOpen, createRuntimeConversation, refetchRuntimeThreads, runtimeThreads, runtimeThreadsLoading, setActiveConversation, setConversationRuntime, setConversationSessionId, setLocalThreadId, t, userId])

  return (
    <AgentModeChatSurface>
      <AgentModeChatSurfaceInner>
        <AgentBuiltinChatShell
          userId={userId}
          onCollapse={() => { }}
          showCollapse={false}
          host="immersive"
          surface="page"
          pendingThreadIdToOpen={pendingThreadIdToOpen}
          onPendingThreadHandled={() => setPendingThreadIdToOpen(null)}
        />
      </AgentModeChatSurfaceInner>
    </AgentModeChatSurface>
  )
}

function ProjectAgentModeWorkspace({ userId }: { userId: string }) {
  return (
    <ProjectAgentChatSurface userId={userId} />
  )
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
