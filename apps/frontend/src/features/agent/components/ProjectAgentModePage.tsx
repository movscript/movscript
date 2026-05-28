import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
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
} from '@movscript/ui'
import { useTranslation } from 'react-i18next'

import { AgentBuiltinChatShell } from '@/features/agent/components/AgentBuiltinChatShell'
import { AgentBrowserPanel } from '@/features/agent/components/AgentBrowserPanel'
import { openAgentPanelThread, AGENT_PANEL_THREAD_EVENT } from '@/features/agent/application/agentPanelBridge'
import { conversationDisplayTitle, formatAgentDate, formatAgentRelativeTime, localThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import { api } from '@/shared/infrastructure/api'
import { localAgentClient, type AgentSessionSummary, type AgentThreadSummary } from '@/shared/infrastructure/localAgentClient'
import { projectListQueryKey } from '@/features/project/application/projectQueries'
import { ROUTES } from '@/routes/projectRoutes'
import { useAgentConversationTabRuntimeStatusLights } from '@/features/agent/presentation/useAgentConversationTabRuntimeStatusLights'
import { useAgentPanelUiStore } from '@/features/agent/presentation/agentPanelUiStore'
import type { AgentRuntimeStatusLight } from '@/features/agent/domain/agentRuntimeStatusLight'
import { useAgentStore, type Conversation } from '@/features/agent/state/agentStore'
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
  const currentUser = useUserStore((s) => s.currentUser)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const userId = currentUser ? String(currentUser.ID) : ''
  const getConversations = useAgentStore((s) => s.getConversations)
  const getActiveConversationId = useAgentStore((s) => s.getActiveConversationId)
  const createConversation = useAgentStore((s) => s.createConversation)
  const setActiveConversation = useAgentStore((s) => s.setActiveConversation)
  const archiveConversations = useAgentStore((s) => s.archiveConversations)
  const unarchiveConversation = useAgentStore((s) => s.unarchiveConversation)
  const pageTasks = useAgentSessionStore((s) => s.pageTasks)
  const localThreadIdsByConversation = useAgentSessionStore((s) => s.localThreadIdsByConversation)
  const sessionIdsByConversation = useAgentSessionStore((s) => s.sessionIdsByConversation)
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [showAllProjectGroups, setShowAllProjectGroups] = useState(false)
  const [openProjectGroups, setOpenProjectGroups] = useState<Record<number, boolean>>({})
  const [conversationsOpen, setConversationsOpen] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(true)
  const [showAllChatConversations, setShowAllChatConversations] = useState(false)
  const [showAllHistoryConversations, setShowAllHistoryConversations] = useState(false)
  const [relativeTimeNow, setRelativeTimeNow] = useState(() => Date.now())
  const resizeStart = useRef({ x: 0, width: AGENT_SIDEBAR_DEFAULT_WIDTH })
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') return AGENT_SIDEBAR_DEFAULT_WIDTH
    const saved = Number(window.localStorage.getItem(AGENT_SIDEBAR_WIDTH_STORAGE_KEY))
    return Number.isFinite(saved) ? clampAgentSidebarWidth(saved) : AGENT_SIDEBAR_DEFAULT_WIDTH
  })
  const sidebarCollapsed = useAgentPanelUiStore((s) => s.agentModeSidebarCollapsed)
  const setSidebarCollapsed = useAgentPanelUiStore((s) => s.setAgentModeSidebarCollapsed)
  const [resizing, setResizing] = useState(false)
  const renderedSidebarWidth = sidebarCollapsed ? AGENT_SIDEBAR_COLLAPSED_WIDTH : sidebarWidth

  useEffect(() => {
    window.localStorage.setItem(AGENT_SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    const interval = window.setInterval(() => setRelativeTimeNow(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!resizing || sidebarCollapsed) return

    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = resizeStart.current.width + event.clientX - resizeStart.current.x
      if (nextWidth < AGENT_SIDEBAR_MIN_WIDTH) {
        if (resizeStart.current.width <= AGENT_SIDEBAR_MIN_WIDTH) {
          setSidebarCollapsed(true)
          setResizing(false)
          return
        }
        setSidebarWidth(AGENT_SIDEBAR_MIN_WIDTH)
        return
      }
      setSidebarWidth(clampAgentSidebarWidth(nextWidth))
    }
    const handlePointerUp = () => setResizing(false)
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [resizing, setSidebarCollapsed, sidebarCollapsed])

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (sidebarCollapsed) return
    event.preventDefault()
    resizeStart.current = { x: event.clientX, width: sidebarWidth }
    setResizing(true)
  }

  const adjustSidebarWidth = (delta: number) => {
    const nextWidth = sidebarWidth + delta
    if (nextWidth < AGENT_SIDEBAR_MIN_WIDTH) {
      if (sidebarWidth <= AGENT_SIDEBAR_MIN_WIDTH) {
        setSidebarCollapsed(true)
        return
      }
      setSidebarWidth(AGENT_SIDEBAR_MIN_WIDTH)
      return
    }
    setSidebarWidth(clampAgentSidebarWidth(nextWidth))
  }

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: projectListQueryKey(currentOrgID),
    queryFn: () => api.get('/projects').then((response) => response.data),
  })
  const { data: localThreads = [], isLoading: localThreadsLoading } = useQuery<AgentThreadSummary[]>({
    queryKey: ['local-agent-threads', localAgentClient.baseURL, 'agent-mode-sidebar'],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.listThreads().then((r) => r.threads)
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

  const conversations = getConversations(userId)
  const activeConversationId = getActiveConversationId(userId)
  const openConversations = useMemo(
    () => conversations.filter((conversation) => conversation.archived !== true),
    [conversations],
  )
  const runtimeStatusLights = useAgentConversationTabRuntimeStatusLights(openConversations)
  const archivedConversations = useMemo(
    () => conversations
      .filter((conversation) => conversation.archived === true)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  )
  const archivedRuntimeThreadIds = useMemo(
    () => new Set(archivedConversations.flatMap((conversation) => conversation.runtimeThreadId ? [conversation.runtimeThreadId] : [])),
    [archivedConversations],
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
      .filter((thread) => !archivedRuntimeThreadIds.has(thread.id))
      .map((thread) => ({
        type: 'runtime-thread' as const,
        id: thread.id,
        timestamp: Date.parse(thread.updatedAt) || 0,
        thread,
      })),
  ].sort((a, b) => b.timestamp - a.timestamp), [archivedConversations, archivedRuntimeThreadIds, localThreads])
  const visibleHistoryItems = showAllHistoryConversations
    ? historyItems
    : historyItems.slice(0, DEFAULT_VISIBLE_CHAT_CONVERSATIONS)
  const hiddenHistoryItemCount = Math.max(0, historyItems.length - visibleHistoryItems.length)
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  function startNewConversation() {
    createConversation(userId)
    navigate(ROUTES.project.agent)
  }

  function selectConversation(id: string) {
    unarchiveConversation(userId, id)
    setActiveConversation(userId, id)
    navigate(ROUTES.project.agent)
  }

  function toggleProjectGroup(projectId: number) {
    setOpenProjectGroups((state) => ({ ...state, [projectId]: !(state[projectId] ?? false) }))
  }

  function restoreHistoryThread(threadId: string) {
    navigate(ROUTES.project.agent)
    window.setTimeout(() => openAgentPanelThread(threadId), 0)
  }

  return (
    <AgentModeSidebar
      resizing={resizing}
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
                          onArchive={() => archiveConversations(userId, [conversation.id])}
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
                  onArchive={() => archiveConversations(userId, [conversation.id])}
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
                      archiveLabel={t('agents.chat.archiveConversation')}
                    />
                  )
                }
                const thread = item.thread
                return (
                  <AgentModeConversationItem
                    key={thread.id}
                    icon={<History size={11} />}
                    title={localThreadTitle(thread, t)}
                    description={[
                      t('agents.chat.messagesCount', { count: thread.messageCount }),
                      thread.projectId ? t('agents.chat.panel.drafts.projectBadge', { id: thread.projectId }) : null,
                    ].filter(Boolean).join(' · ')}
                    meta={formatAgentDate(thread.updatedAt, locale)}
                    onClick={() => restoreHistoryThread(thread.id)}
                  />
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
          role="separator"
          aria-orientation="vertical"
          aria-label="调整左侧栏宽度"
          aria-valuemin={AGENT_SIDEBAR_MIN_WIDTH}
          aria-valuemax={AGENT_SIDEBAR_MAX_WIDTH}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          side="right"
          active={resizing}
          onPointerDown={startResize}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault()
              adjustSidebarWidth(event.shiftKey ? -32 : -12)
            }
            if (event.key === 'ArrowRight') {
              event.preventDefault()
              adjustSidebarWidth(event.shiftKey ? 32 : 12)
            }
          }}
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
  archiveLabel,
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
  archiveLabel: string
}) {
  const relativeTime = formatAgentRelativeTime(conversation.updatedAt, locale, now)
  const showArchiveAction = Boolean(active && onArchive && !archived)

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
        hasAction={showArchiveAction}
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
    </AgentModeConversationRow>
  )
}

function ProjectAgentChatSurface({ userId }: { userId: string }) {
  const getActiveConversationId = useAgentStore((s) => s.getActiveConversationId)
  const getConversations = useAgentStore((s) => s.getConversations)
  const createConversation = useAgentStore((s) => s.createConversation)
  const [pendingThreadIdToOpen, setPendingThreadIdToOpen] = useState<string | null>(null)
  const activeConversationId = getActiveConversationId(userId)
  const activeConversationOpen = !!activeConversationId && getConversations(userId).some((conversation) => conversation.id === activeConversationId && conversation.archived !== true)

  useEffect(() => {
    function handleThreadOpen(event: Event) {
      const detail = (event as CustomEvent<{ threadId?: string }>).detail
      if (detail?.threadId?.trim()) setPendingThreadIdToOpen(detail.threadId)
    }

    window.addEventListener(AGENT_PANEL_THREAD_EVENT, handleThreadOpen)
    return () => window.removeEventListener(AGENT_PANEL_THREAD_EVENT, handleThreadOpen)
  }, [])

  useEffect(() => {
    if (activeConversationOpen) return
    createConversation(userId)
  }, [activeConversationOpen, createConversation, userId])

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
  const resizeStart = useRef({ x: 0, width: AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH })
  const [resizing, setResizing] = useState(false)

  useEffect(() => {
    onWidthChange?.(panelWidth)
  }, [onWidthChange, panelWidth])

  useEffect(() => {
    window.localStorage.setItem(AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY, String(panelWidth))
  }, [panelWidth])

  useEffect(() => {
    if (!resizing) return

    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = resizeStart.current.width - (event.clientX - resizeStart.current.x)
      if (nextWidth < AGENT_MODE_CONTENT_PANEL_MIN_WIDTH) {
        if (resizeStart.current.width <= AGENT_MODE_CONTENT_PANEL_MIN_WIDTH) {
          setCollapsed(true)
          setResizing(false)
          return
        }
        setPanelWidth(AGENT_MODE_CONTENT_PANEL_MIN_WIDTH)
        return
      }
      setPanelWidth(clampAgentModeContentPanelWidth(nextWidth))
    }
    const handlePointerUp = () => setResizing(false)
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [resizing, setCollapsed])

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    resizeStart.current = { x: event.clientX, width: panelWidth }
    setResizing(true)
  }

  const adjustPanelWidth = (delta: number) => {
    const nextWidth = panelWidth + delta
    if (nextWidth < AGENT_MODE_CONTENT_PANEL_MIN_WIDTH) {
      if (panelWidth <= AGENT_MODE_CONTENT_PANEL_MIN_WIDTH) {
        setCollapsed(true)
        return
      }
      setPanelWidth(AGENT_MODE_CONTENT_PANEL_MIN_WIDTH)
      return
    }
    setPanelWidth(clampAgentModeContentPanelWidth(nextWidth))
  }

  return (
    <AgentModeContentPanel
      resizing={resizing}
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
          role="separator"
          aria-orientation="vertical"
          aria-label="调整对话区宽度"
          aria-valuemin={AGENT_MODE_CONTENT_PANEL_MIN_WIDTH}
          aria-valuemax={AGENT_MODE_CONTENT_PANEL_MAX_WIDTH}
          aria-valuenow={panelWidth}
          tabIndex={0}
          side="left"
          active={resizing}
          onPointerDown={startResize}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault()
              adjustPanelWidth(event.shiftKey ? 32 : 12)
            }
            if (event.key === 'ArrowRight') {
              event.preventDefault()
              adjustPanelWidth(event.shiftKey ? -32 : -12)
            }
          }}
        />
      ) : null}
    </AgentModeContentPanel>
  )
}
