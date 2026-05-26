import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Archive,
  Bot,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  ExternalLink,
  FolderOpen,
  History,
  LogOut,
  MessageSquare,
  PanelTopOpen,
  Plug,
  Plus,
  Settings,
  UserRound,
} from 'lucide-react'
import {
  AgentModeActionNavItem,
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
  AgentModeNavLinkItem,
  AgentModePrimaryNavItem,
  AgentModeProjectGroup,
  AgentModeProjectGroupToggle,
  AgentModeProjectMenuContent,
  AgentModeProjectSelectButton,
  AgentModeResizeHandle,
  AgentModeRoot,
  AgentModeSidebar,
  AgentModeSidebarFooter,
  AgentModeSidebarScroll,
  AgentModeSidebarTop,
  AgentModeUserAvatar,
  AgentModeUserCopy,
  AgentModeUserMenuContent,
  AgentModeUserMenuLabel,
  AgentModeUserMenuName,
  AgentModeUserMenuRole,
  AgentModeUserMeta,
  AgentModeUserName,
  AgentModeUserTrigger,
  AgentModeWorkspace,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@movscript/ui'
import { useTranslation } from 'react-i18next'

import { AgentBuiltinChatShell } from '@/features/agent/components/AgentBuiltinChatShell'
import { AgentBrowserPanel } from '@/features/agent/components/AgentBrowserPanel'
import { openAgentPanelThread, AGENT_PANEL_THREAD_EVENT } from '@/features/agent/application/agentPanelBridge'
import { conversationDisplayTitle, formatAgentDate, localThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import { api } from '@/shared/infrastructure/api'
import { openAdminConsole } from '@/shared/infrastructure/adminConsole'
import { localAgentClient, type AgentSessionSummary, type AgentThreadSummary } from '@/shared/infrastructure/localAgentClient'
import { projectListQueryKey } from '@/features/project/application/projectQueries'
import { runtimeNavItems } from '@runtime'
import { ROUTES } from '@/routes/projectRoutes'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { useAgentPanelUiStore } from '@/features/agent/presentation/agentPanelUiStore'
import { useAgentStore, type Conversation } from '@/features/agent/state/agentStore'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import type { Project } from '@/types'

const DEFAULT_VISIBLE_PROJECT_GROUPS = 5
const DEFAULT_VISIBLE_CHAT_CONVERSATIONS = 5
const AGENT_SIDEBAR_WIDTH_STORAGE_KEY = 'movscript-agent-mode-sidebar-width'
const AGENT_SIDEBAR_DEFAULT_WIDTH = 288
const AGENT_SIDEBAR_MIN_WIDTH = 220
const AGENT_SIDEBAR_MAX_WIDTH = 420
const AGENT_CONTENT_PANEL_RATIO_STORAGE_KEY = 'movscript-agent-mode-content-panel-ratio'
const AGENT_CONTENT_PANEL_DEFAULT_RATIO = 0.34
const AGENT_CONTENT_PANEL_MIN_RATIO = 0.24
const AGENT_CONTENT_PANEL_MAX_RATIO = 0.48
const AGENT_CONTENT_PANEL_MIN_WIDTH = 280
const AGENT_CONTENT_PANEL_MAX_WIDTH = 640
const AGENT_CHAT_MIN_WIDTH = 420

function clampAgentSidebarWidth(width: number) {
  return Math.min(AGENT_SIDEBAR_MAX_WIDTH, Math.max(AGENT_SIDEBAR_MIN_WIDTH, width))
}

function clampAgentContentPanelRatio(ratio: number) {
  return Math.min(AGENT_CONTENT_PANEL_MAX_RATIO, Math.max(AGENT_CONTENT_PANEL_MIN_RATIO, ratio))
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

  return (
    <AgentModeRoot>
      {fullscreen && !embeddedInShell && (
        <AgentModeFullscreenLayout>
          <ProjectAgentModeSidebar />
          <ProjectAgentModeWorkspace userId={userId} />
        </AgentModeFullscreenLayout>
      )}
      {(!fullscreen || embeddedInShell) && (
        <ProjectAgentModeWorkspace userId={userId} />
      )}
    </AgentModeRoot>
  )
}

export function ProjectAgentModeSidebar() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const project = useProjectStore((s) => s.current)
  const currentUser = useUserStore((s) => s.currentUser)
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const orgMemberships = useUserStore((s) => s.orgMemberships)
  const apiBaseURL = useAppSettingsStore((s) => s.settings.apiBaseURL)
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
  const [manageOpen, setManageOpen] = useState(true)
  const [showAllChatConversations, setShowAllChatConversations] = useState(false)
  const [showAllHistoryConversations, setShowAllHistoryConversations] = useState(false)
  const resizeStart = useRef({ x: 0, width: AGENT_SIDEBAR_DEFAULT_WIDTH })
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') return AGENT_SIDEBAR_DEFAULT_WIDTH
    const saved = Number(window.localStorage.getItem(AGENT_SIDEBAR_WIDTH_STORAGE_KEY))
    return Number.isFinite(saved) ? clampAgentSidebarWidth(saved) : AGENT_SIDEBAR_DEFAULT_WIDTH
  })
  const [resizing, setResizing] = useState(false)

  useEffect(() => {
    window.localStorage.setItem(AGENT_SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    if (!resizing) return

    const handlePointerMove = (event: PointerEvent) => {
      const delta = event.clientX - resizeStart.current.x
      setSidebarWidth(clampAgentSidebarWidth(resizeStart.current.width + delta))
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
  }, [resizing])

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    resizeStart.current = { x: event.clientX, width: sidebarWidth }
    setResizing(true)
  }

  const adjustSidebarWidth = (delta: number) => {
    setSidebarWidth((width) => clampAgentSidebarWidth(width + delta))
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
        conversations: group.conversations.sort((a, b) => b.updatedAt - a.updatedAt),
      }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName, i18n.resolvedLanguage))
    return { projectGroups, chatConversations }
  }, [i18n.resolvedLanguage, localSessionsById, localThreadsById, localThreadIdsByConversation, openConversations, pageTasks, projectNamesById, sessionIdsByConversation, t])
  const { projectGroups, chatConversations } = conversationsByScope
  const visibleProjectGroups = showAllProjectGroups ? projectGroups : projectGroups.slice(0, DEFAULT_VISIBLE_PROJECT_GROUPS)
  const hiddenProjectGroupCount = Math.max(0, projectGroups.length - visibleProjectGroups.length)
  const projectConversationCount = projectGroups.reduce((sum, group) => sum + group.conversations.length, 0)
  const sortedChatConversations = useMemo(
    () => [...chatConversations].sort((a, b) => b.updatedAt - a.updatedAt),
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
  const currentMembership = orgMemberships.find((membership) => membership.org_id === currentOrgID)

  function startNewConversation() {
    archiveConversations(userId, conversations.filter((conversation) => conversation.archived !== true).map((conversation) => conversation.id))
    createConversation(userId)
    navigate(ROUTES.project.agent)
  }

  function selectConversation(id: string) {
    archiveConversations(userId, conversations
      .filter((conversation) => conversation.id !== id && conversation.archived !== true)
      .map((conversation) => conversation.id))
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
      style={{ width: sidebarWidth }}
    >
      <AgentModeSidebarTop>
        <AgentModePrimaryNavItem
          onClick={startNewConversation}
        >
          <AgentModeIconSlot><Plus size={14} /></AgentModeIconSlot>
          <AgentModeLabel>{t('agents.chat.agentModeSidebar.newConversation')}</AgentModeLabel>
        </AgentModePrimaryNavItem>
        <AgentModeNavLinkItem>
          <NavLink to={ROUTES.plugins}>
            <AgentModeIconSlot><Plug size={14} /></AgentModeIconSlot>
            <AgentModeLabel>{t('agents.chat.agentModeSidebar.plugins')}</AgentModeLabel>
          </NavLink>
        </AgentModeNavLinkItem>
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

        <AgentSidebarGroup
          title={t('sidebar.sections.manage')}
          icon={<Settings size={13} />}
          open={manageOpen}
          onOpenChange={setManageOpen}
        >
          <AgentModeGroupList>
            <AgentModeNavItem to={ROUTES.orgSelect} icon={<Building2 size={13} />} label={t('sidebar.items.workspace')} />
            <AgentModeNavItem to={ROUTES.agentConsole} icon={<Bot size={13} />} label={t('sidebar.items.agentConsole')} end />
            {runtimeNavItems.filter((item) => (item.section ?? 'manage') === 'manage').map((item) => {
              const RuntimeIcon = item.icon
              return <AgentModeNavItem key={item.to} to={item.to} icon={<RuntimeIcon size={13} />} label={item.label} />
            })}
            {currentUser?.system_role === 'super_admin' && (
              <AgentModeActionItem
                icon={<ExternalLink size={13} />}
                label={t('sidebar.items.adminConsole')}
                onClick={() => void openAdminConsole(apiBaseURL)}
              />
            )}
          </AgentModeGroupList>
        </AgentSidebarGroup>

      </AgentModeSidebarScroll>

      <AgentModeSidebarFooter>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <AgentModeUserTrigger>
              <AgentModeUserAvatar fallback={currentUser?.username[0]?.toUpperCase() ?? <UserRound size={13} />} />
              <AgentModeUserCopy>
                <AgentModeUserName>{currentUser?.username ?? t('agents.chat.agentModeSidebar.defaultUser')}</AgentModeUserName>
                <AgentModeUserMeta>
                  {currentMembership?.org_name ?? t('agents.chat.agentModeSidebar.settingsUser')}
                </AgentModeUserMeta>
              </AgentModeUserCopy>
              <AgentModeIconSlot><ChevronDown size={12} /></AgentModeIconSlot>
            </AgentModeUserTrigger>
          </DropdownMenuTrigger>
          <AgentModeUserMenuContent>
            <DropdownMenuLabel>
              <AgentModeUserMenuLabel>
                <AgentModeUserMenuName>{currentUser?.username ?? t('agents.chat.agentModeSidebar.defaultUser')}</AgentModeUserMenuName>
                <AgentModeUserMenuRole>
                  {currentMembership
                    ? t(`org.roles.${currentMembership.role}`, { defaultValue: currentMembership.role })
                    : currentUser?.system_role === 'super_admin' ? t('sidebar.roles.superAdmin') : t('sidebar.roles.user')}
                </AgentModeUserMenuRole>
              </AgentModeUserMenuLabel>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate(ROUTES.user)}>
              <AgentModeIconSlot><CircleUserRound size={14} /></AgentModeIconSlot>
              {t('header.titles.user')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setCurrentUser(null)}>
              <AgentModeIconSlot><LogOut size={14} /></AgentModeIconSlot>
              {t('sidebar.logout')}
            </DropdownMenuItem>
          </AgentModeUserMenuContent>
        </DropdownMenu>
      </AgentModeSidebarFooter>
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
    </AgentModeSidebar>
  )
}

function AgentModeNavItem({
  to,
  icon,
  label,
  end = false,
}: {
  to: string
  icon: ReactNode
  label: string
  end?: boolean
}) {
  return (
    <AgentModeNavLinkItem>
      <NavLink to={to} end={end}>
        <AgentModeIconSlot>{icon}</AgentModeIconSlot>
        <AgentModeLabel>{label}</AgentModeLabel>
      </NavLink>
    </AgentModeNavLinkItem>
  )
}

function AgentModeActionItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <AgentModeActionNavItem
      onClick={onClick}
    >
      <AgentModeIconSlot>{icon}</AgentModeIconSlot>
      <AgentModeLabel>{label}</AgentModeLabel>
    </AgentModeActionNavItem>
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

function AgentSidebarConversation({
  conversation,
  active,
  locale,
  title,
  archived,
  onClick,
  onArchive,
  archiveLabel,
}: {
  conversation: Conversation
  active: boolean
  locale: string
  title: string
  archived: boolean
  onClick: () => void
  onArchive?: () => void
  archiveLabel: string
}) {
  const lastMessage = conversation.messages[conversation.messages.length - 1]?.content.trim()

  return (
    <AgentModeConversationRow>
      <AgentModeConversationItem
        onClick={onClick}
        active={active}
        icon={archived ? <Archive size={11} /> : <MessageSquare size={11} />}
        title={title}
        description={lastMessage || formatAgentDate(conversation.updatedAt, locale)}
        hasAction={Boolean(onArchive && !archived)}
      />
      {onArchive && !archived ? (
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
          onCollapse={() => {}}
          showCollapse={false}
          surface="page"
          pageEmptyAccessory={<AgentModeProjectSelectCard />}
          pendingThreadIdToOpen={pendingThreadIdToOpen}
          onPendingThreadHandled={() => setPendingThreadIdToOpen(null)}
        />
      </AgentModeChatSurfaceInner>
    </AgentModeChatSurface>
  )
}

function AgentModeProjectSelectCard() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const current = useProjectStore((s) => s.current)
  const setCurrent = useProjectStore((s) => s.setCurrent)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: projectListQueryKey(currentOrgID),
    queryFn: () => api.get('/projects').then((response) => response.data),
  })

  function selectProject(project: Project) {
    setCurrent(project)
    navigate(ROUTES.project.agent)
  }

  if (projects.length === 0) {
    return (
      <AgentModeProjectSelectButton
        type="button"
        onClick={() => navigate(ROUTES.projects)}
      >
        <AgentModeIconSlot><FolderOpen size={15} /></AgentModeIconSlot>
        <AgentModeLabel>{t('agents.chat.agentModeProjectPicker.noProjects')}</AgentModeLabel>
        <AgentModeIconSlot><Plus size={14} /></AgentModeIconSlot>
      </AgentModeProjectSelectButton>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <AgentModeProjectSelectButton
          type="button"
          title={current?.name ?? t('agents.chat.agentModeProjectPicker.title')}
          aria-label={t('agents.chat.agentModeProjectPicker.title')}
        >
          <AgentModeIconSlot><FolderOpen size={15} /></AgentModeIconSlot>
          <AgentModeLabel>
            {current?.name ?? t('agents.chat.agentModeProjectPicker.title')}
          </AgentModeLabel>
          <AgentModeIconSlot><ChevronDown size={14} /></AgentModeIconSlot>
        </AgentModeProjectSelectButton>
      </DropdownMenuTrigger>
      <AgentModeProjectMenuContent>
        <DropdownMenuLabel>{t('agents.chat.agentModeProjectPicker.title')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects.map((project) => (
          <DropdownMenuItem key={project.ID} onClick={() => selectProject(project)}>
            <AgentModeLabel>{project.name}</AgentModeLabel>
            {current?.ID === project.ID ? <AgentModeIconSlot><Check size={14} /></AgentModeIconSlot> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate(ROUTES.projects)}>
          <AgentModeIconSlot><FolderOpen size={14} /></AgentModeIconSlot>
          {t('agents.chat.agentModeProjectPicker.manageProjects')}
        </DropdownMenuItem>
      </AgentModeProjectMenuContent>
    </DropdownMenu>
  )
}

function ProjectAgentModeWorkspace({ userId }: { userId: string }) {
  const workspaceRef = useRef<HTMLElement | null>(null)
  const [workspaceWidth, setWorkspaceWidth] = useState(0)

  useEffect(() => {
    const node = workspaceRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      setWorkspaceWidth(Math.round(entry.contentRect.width))
    })
    observer.observe(node)
    setWorkspaceWidth(Math.round(node.getBoundingClientRect().width))
    return () => observer.disconnect()
  }, [])

  return (
    <AgentModeWorkspace ref={workspaceRef}>
      <ProjectAgentChatSurface userId={userId} />
      <ProjectAgentContentPanel workspaceWidth={workspaceWidth} />
    </AgentModeWorkspace>
  )
}

function ProjectAgentContentPanel({ workspaceWidth }: { workspaceWidth: number }) {
  const collapsed = useAgentPanelUiStore((s) => s.agentModeContentPanelCollapsed)
  const resizeStart = useRef({ x: 0, width: 0 })
  const [panelRatio, setPanelRatio] = useState(() => {
    if (typeof window === 'undefined') return AGENT_CONTENT_PANEL_DEFAULT_RATIO
    const saved = Number(window.localStorage.getItem(AGENT_CONTENT_PANEL_RATIO_STORAGE_KEY))
    return Number.isFinite(saved) ? clampAgentContentPanelRatio(saved) : AGENT_CONTENT_PANEL_DEFAULT_RATIO
  })
  const [resizing, setResizing] = useState(false)
  const availablePanelWidth = workspaceWidth > 0 ? workspaceWidth - AGENT_CHAT_MIN_WIDTH : 0
  const contentPanelFits = availablePanelWidth >= AGENT_CONTENT_PANEL_MIN_WIDTH
  const panelMaxWidth = contentPanelFits
    ? Math.min(AGENT_CONTENT_PANEL_MAX_WIDTH, Math.floor(workspaceWidth * AGENT_CONTENT_PANEL_MAX_RATIO), availablePanelWidth)
    : AGENT_CONTENT_PANEL_MIN_WIDTH
  const ratioWidth = workspaceWidth > 0 ? Math.round(workspaceWidth * panelRatio) : 0
  const renderedPanelWidth = Math.min(panelMaxWidth, Math.max(AGENT_CONTENT_PANEL_MIN_WIDTH, ratioWidth))

  useEffect(() => {
    window.localStorage.setItem(AGENT_CONTENT_PANEL_RATIO_STORAGE_KEY, String(panelRatio))
  }, [panelRatio])

  useEffect(() => {
    if (!resizing) return

    const handlePointerMove = (event: PointerEvent) => {
      if (workspaceWidth <= 0) return
      const delta = resizeStart.current.x - event.clientX
      const nextWidth = Math.min(panelMaxWidth, Math.max(AGENT_CONTENT_PANEL_MIN_WIDTH, resizeStart.current.width + delta))
      setPanelRatio(clampAgentContentPanelRatio(nextWidth / workspaceWidth))
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
  }, [panelMaxWidth, resizing, workspaceWidth])

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    resizeStart.current = { x: event.clientX, width: renderedPanelWidth }
    setResizing(true)
  }

  const adjustPanelWidth = (delta: number) => {
    if (workspaceWidth <= 0) return
    const nextWidth = Math.min(panelMaxWidth, Math.max(AGENT_CONTENT_PANEL_MIN_WIDTH, renderedPanelWidth + delta))
    setPanelRatio(clampAgentContentPanelRatio(nextWidth / workspaceWidth))
  }

  if (collapsed || !contentPanelFits) return null

  return (
    <AgentModeContentPanel
      resizing={resizing}
      style={{ width: renderedPanelWidth, flexBasis: renderedPanelWidth }}
      aria-label="Agent 内容区"
    >
      <AgentBrowserPanel />
      <AgentModeResizeHandle
        role="separator"
        aria-orientation="vertical"
        aria-label="调整内容区宽度"
        aria-valuemin={AGENT_CONTENT_PANEL_MIN_WIDTH}
        aria-valuemax={panelMaxWidth}
        aria-valuenow={renderedPanelWidth}
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
    </AgentModeContentPanel>
  )
}
