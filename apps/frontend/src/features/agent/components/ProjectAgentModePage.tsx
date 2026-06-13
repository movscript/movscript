import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Folder,
  History,
  MessageSquare,
  Plus,
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
  IdentityMark,
  useResizablePanel,
} from '@movscript/ui'
import { useTranslation } from 'react-i18next'

import { AgentUnifiedChatShell, resolveAgentChatShellProvider } from '@/features/agent/components/AgentUnifiedChatShell'
import { AgentBrowserPanel } from '@/features/agent/components/AgentBrowserPanel'
import {
  openAppServerThread,
} from '@/features/agent/components/AppServerChatShell'
import {
  agentConversationRegistryInputFromThreadSummary,
  agentThreadSummaryRegistryOpenState,
  shouldHydrateAgentThreadSummary,
  useAgentThreadRegistryHydration,
} from '@/features/agent/application/useAgentThreadRegistryHydration'
import { openAgentPanelNewConversation, openAgentPanelThread } from '@/features/agent/application/agentPanelBridge'
import {
  listProviderSessionSummariesFromWorkspace,
  listProviderSessionThreadSummariesFromWorkspace,
} from '@/features/agent/application/providerSessionThreadQueryCache'
import { conversationDisplayTitle, formatAgentDate, formatAgentRelativeTime, providerThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import { api } from '@/shared/infrastructure/api'
import { providerSessionClient, type AgentSessionSummary, type AgentThreadSummary } from '@/shared/infrastructure/providerSessionClient'
import { projectListQueryKey } from '@/features/project/application/projectQueries'
import { ROUTES } from '@/routes/projectRoutes'
import { useRouteLayoutPaneController } from '@/features/app-shell/application/useRouteLayoutPaneController'
import {
  APP_SHELL_AGENT_CONTENT_PANE_ID,
  APP_SHELL_AGENT_SIDEBAR_PANE_ID,
  routeLayoutSpecForPathname,
} from '@/routes/routeLayoutRegistry'
import { useAgentConversationTabProviderSessionStatusLights } from '@/features/agent/presentation/useAgentConversationTabProviderSessionStatusLights'
import { DEFAULT_AGENT_CONTENT_AREA_ID, useAgentContentAreaStore } from '@/features/agent/state/agentContentAreaStore'
import {
  AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH,
  AGENT_MODE_CONTENT_PANEL_MAX_WIDTH,
  AGENT_MODE_CONTENT_PANEL_MIN_WIDTH,
  AGENT_MODE_SIDEBAR_DEFAULT_WIDTH,
  AGENT_MODE_SIDEBAR_MAX_WIDTH,
  AGENT_MODE_SIDEBAR_MIN_WIDTH,
  clampAgentModeSidebarWidth,
  clampAgentModeContentPanelWidth,
} from '@/features/agent/presentation/agentModePanelSizing'
import {
  agentModeRenderDiagnosticsEnabled,
  scheduleAgentModePaintDiagnostics,
} from '@/features/agent/presentation/agentModePaintDiagnostics'
import type { ProviderSessionStatusLight } from '@movscript/core/agent'
import {
  agentConversationIdForRegistryInput,
  selectActiveAgentConversationRegistryRecord,
  selectAgentConversationRegistryRecords,
  type AgentConversationRegistryRecord,
} from '@movscript/core/agent'
import type { Conversation } from '@/features/agent/state/agentStore'
import { useAgentSessionStore, type AgentConversationThreadBinding } from '@/features/agent/state/agentSessionStore'
import {
  enabledProviders,
  providerInstanceId,
  providerProtocol,
  usesAppServerProtocol,
  useProviderConfigStore,
  type ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import type { Project } from '@/types'

const DEFAULT_VISIBLE_PROJECT_CONVERSATIONS = 5
const DEFAULT_VISIBLE_CHAT_CONVERSATIONS = 5
const PROJECT_AGENT_ROUTE_LAYOUT = routeLayoutSpecForPathname(ROUTES.project.agent)

export default function ProjectAgentModePage({
  fullscreen = false,
  embeddedInShell = false,
}: {
  fullscreen?: boolean
  embeddedInShell?: boolean
}) {
  const currentUser = useUserStore((s) => s.currentUser)
  const userId = currentUser ? String(currentUser.ID) : ''

  useEffect(() => {
    if (!agentModeRenderDiagnosticsEnabled()) return
    return scheduleAgentModePaintDiagnostics()
  }, [embeddedInShell, fullscreen])

  return (
    <AgentModeRoot>
      {fullscreen && !embeddedInShell && (
        <ProjectAgentModeFullscreen userId={userId} />
      )}
      {(!fullscreen || embeddedInShell) && (
        <ProjectAgentModeWorkspace userId={userId} />
      )}
    </AgentModeRoot>
  )
}

function ProjectAgentModeFullscreen({ userId }: { userId: string }) {
  const agentSidebarPane = useRouteLayoutPaneController({
    routeLayout: PROJECT_AGENT_ROUTE_LAYOUT,
    paneId: APP_SHELL_AGENT_SIDEBAR_PANE_ID,
    clampSize: clampAgentModeSidebarWidth,
  })
  const agentContentPane = useRouteLayoutPaneController({
    routeLayout: PROJECT_AGENT_ROUTE_LAYOUT,
    paneId: APP_SHELL_AGENT_CONTENT_PANE_ID,
    clampSize: clampAgentModeContentPanelWidth,
    fallbackState: 'default',
  })

  return (
    <AgentModeFullscreenLayout>
      <ProjectAgentModeSidebar
        width={agentSidebarPane.size}
        onWidthChange={agentSidebarPane.setSize}
      />
      <ProjectAgentModeWorkspace userId={userId} />
      <ProjectAgentContentPanel
        manageOwnWidth
        collapsed={agentContentPane.collapsed}
        onCollapsedChange={(collapsed) => {
          if (collapsed) agentContentPane.collapse()
          else agentContentPane.show()
        }}
        width={agentContentPane.size}
        onWidthChange={agentContentPane.setSize}
      />
    </AgentModeFullscreenLayout>
  )
}

export function ProjectAgentModeSidebar({
  headerActions,
  width,
  onWidthChange,
}: {
  headerActions?: ReactNode
  width?: number
  onWidthChange?: (width: number) => void
} = {}) {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const currentUser = useUserStore((s) => s.currentUser)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const userId = currentUser ? String(currentUser.ID) : ''
  const getActiveConversationId = useAgentSessionStore((s) => s.getActiveConversationId)
  const activeConversationId = useAgentSessionStore((s) => s.activeConversationIdsByUser?.[userId] ?? null)
  const conversationsById = useAgentSessionStore((s) => s.conversationsById)
  const upsertConversation = useAgentSessionStore((s) => s.upsertConversation)
  const removeProviderSessionConversation = useAgentSessionStore((s) => s.removeProviderSessionConversation)
  const setActiveConversation = useAgentSessionStore((s) => s.setActiveConversation)
  const setConversationOpenInRegistry = useAgentSessionStore((s) => s.setConversationOpen)
  const pageTasks = useAgentSessionStore((s) => s.pageTasks)
  const conversationThreadBindings = useAgentSessionStore((s) => s.conversationThreadBindings)
  const clearConversationProviderSessionState = useAgentSessionStore((s) => s.clearConversationProviderSessionState)
  const removeContentArea = useAgentContentAreaStore((s) => s.removeContentArea)
  const [openProjectGroups, setOpenProjectGroups] = useState<Record<number, boolean>>({})
  const [expandedProjectThreadGroups, setExpandedProjectThreadGroups] = useState<Record<number, boolean>>({})
  const [conversationsOpen, setConversationsOpen] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(true)
  const [showAllChatConversations, setShowAllChatConversations] = useState(false)
  const [showAllHistoryConversations, setShowAllHistoryConversations] = useState(false)
  const [relativeTimeNow, setRelativeTimeNow] = useState(() => Date.now())
  const sidebarWidth = clampAgentModeSidebarWidth(width ?? AGENT_MODE_SIDEBAR_DEFAULT_WIDTH)
  const setSidebarWidth = useCallback((nextWidth: number) => {
    onWidthChange?.(clampAgentModeSidebarWidth(nextWidth))
  }, [onWidthChange])
  const sidebarResize = useResizablePanel({
    size: sidebarWidth,
    onSizeChange: setSidebarWidth,
    minSize: AGENT_MODE_SIDEBAR_MIN_WIDTH,
    maxSize: AGENT_MODE_SIDEBAR_MAX_WIDTH,
    resizeEdge: 'right',
    ariaLabel: '调整左侧栏宽度',
  })
  const providerSettings = useProviderConfigStore((s) => s.settings)
  const setNewConversationProviderId = useProviderConfigStore((s) => s.setNewConversationProviderId)
  const appServerProviders = useMemo(() => enabledProviders(providerSettings).filter(usesAppServerProtocol), [providerSettings])
  const activeRegistryState = useMemo(() => ({
    activeConversationIdsByUser: { [userId]: activeConversationId },
    conversationsById,
  }), [activeConversationId, conversationsById, userId])
  const activeAgentProvider = useMemo(
    () => resolveAgentChatShellProvider(providerSettings, userId, activeRegistryState),
    [activeRegistryState, providerSettings, userId],
  )
  const appServerMode = usesAppServerProtocol(activeAgentProvider)
  const activeProviderIdentity = useMemo(() => ({
    provider: activeAgentProvider.kind,
    providerId: activeAgentProvider.id,
    providerInstanceId: providerInstanceId(activeAgentProvider),
    providerProtocol: providerProtocol(activeAgentProvider),
  }), [activeAgentProvider])

  useEffect(() => {
    const interval = window.setInterval(() => setRelativeTimeNow(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: projectListQueryKey(currentOrgID),
    queryFn: () => api.get('/projects').then((response) => response.data),
  })
  const { data: providerSessionThreads = [], isLoading: providerSessionThreadsLoading, refetch: refetchProviderSessionThreads } = useQuery<AgentThreadSummary[]>({
    queryKey: ['provider-session-threads', providerSessionClient.baseURL, activeProviderIdentity, 'agent-mode-sidebar'],
    queryFn: () => listProviderSessionThreadSummariesFromWorkspace({ includeProvisional: true, providerProfileKey: activeAgentProvider.id }),
    enabled: !appServerMode,
    retry: false,
  })
  const appServerThreadHydration = useAgentThreadRegistryHydration({
    userId,
    provider: activeAgentProvider,
    enabled: appServerMode,
  })
  const { data: providerSessions = [] } = useQuery<AgentSessionSummary[]>({
    queryKey: ['provider-sessions', providerSessionClient.baseURL, activeProviderIdentity, 'agent-mode-sidebar'],
    queryFn: () => listProviderSessionSummariesFromWorkspace({ providerProfileKey: activeAgentProvider.id }),
    enabled: !appServerMode,
    retry: false,
  })
  const sourceThreads = appServerMode ? appServerThreadHydration.sourceThreads : providerSessionThreads
  const sourceThreadsLoading = appServerMode ? appServerThreadHydration.isLoading : providerSessionThreadsLoading
  const refetchSourceThreads = appServerMode ? appServerThreadHydration.refetch : refetchProviderSessionThreads
  useEffect(() => {
    if (appServerMode) return
    const currentRecords = useAgentSessionStore.getState().conversationsById
    for (const thread of sourceThreads) {
      const existing = currentRecords[thread.id]
      if (!shouldHydrateAgentThreadSummary(thread, existing)) continue
      upsertConversation({
        id: thread.id,
        userId,
        ...activeProviderIdentity,
        ...(thread.sessionId?.trim() ? { providerSessionId: thread.sessionId.trim() } : {}),
        providerThreadId: thread.id,
        ...(thread.title?.trim() ? { title: thread.title.trim() } : {}),
        ...(typeof thread.projectId === 'number' ? { projectId: thread.projectId } : {}),
        ...(thread.status ? { status: thread.status } : {}),
        archived: thread.archived === true,
        open: agentThreadSummaryRegistryOpenState(thread, existing),
        createdAt: Date.parse(thread.createdAt) || undefined,
        updatedAt: Date.parse(thread.updatedAt) || undefined,
      })
    }
  }, [activeProviderIdentity, appServerMode, sourceThreads, upsertConversation, userId])
  const conversations = useMemo(() => {
    if (appServerMode) {
      return appServerConversationRecordsFromSourceThreads({
        conversationsById,
        providerIdentity: activeProviderIdentity,
        sourceThreads,
        userId,
      }).map(conversationFromRegistryRecord)
    }
    return selectAgentConversationRegistryRecords(conversationsById, {
      userId,
      ...activeProviderIdentity,
      includeClosed: true,
      includeArchived: true,
    }).map(conversationFromRegistryRecord)
  }, [activeProviderIdentity, appServerMode, conversationsById, sourceThreads, userId])
  const rawOpenConversations = useMemo(
    () => conversations.filter((conversation) => conversation.archived !== true && conversationsById[conversation.id]?.open !== false),
    [conversations, conversationsById],
  )
  const openConversations = useMemo(() => {
    const sourceIndex = new Map(rawOpenConversations.map((conversation, index) => [conversation.id, index]))
    return rawOpenConversations.sort((a, b) => b.updatedAt - a.updatedAt || (sourceIndex.get(a.id) ?? 0) - (sourceIndex.get(b.id) ?? 0))
  }, [rawOpenConversations])
  const providerSessionStatusLights = useAgentConversationTabProviderSessionStatusLights(openConversations)
  const archivedConversations = useMemo(
    () => conversations
      .filter((conversation) => conversation.archived === true)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  )
  const closedConversations = useMemo(
    () => conversations
      .filter((conversation) => conversation.archived !== true && conversationsById[conversation.id]?.open === false)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations, conversationsById],
  )
  const archivedProviderThreadIds = useMemo(
    () => new Set(archivedConversations.flatMap((conversation) => conversation.providerThreadId ? [conversation.providerThreadId] : [])),
    [archivedConversations],
  )
  const closedProviderThreadIds = useMemo(
    () => new Set(closedConversations.flatMap((conversation) => conversation.providerThreadId ? [conversation.providerThreadId] : [])),
    [closedConversations],
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
  const providerSessionThreadsById = useMemo(() => new Map(sourceThreads.map((thread) => [thread.id, thread])), [sourceThreads])
  const projectNamesById = useMemo(() => {
    const names = new Map<number, string>()
    for (const item of projects) names.set(item.ID, item.name)
    return names
  }, [projects])
  const conversationsByScope = useMemo(() => {
    const projectGroupsById = new Map<number, { projectId: number; projectName: string; conversations: Conversation[] }>()
    const chatConversations: Conversation[] = []
    for (const conversation of openConversations) {
      const projectId = conversationProjectId(conversation, {
        conversationsById,
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
        projectName: projectNamesById.get(projectId) ?? `${t('agents.chat.agentModeSidebar.projectFallback')} #${projectId}`,
        conversations: [],
      }
      group.conversations.push(conversation)
      projectGroupsById.set(projectId, group)
    }
    const projectGroups = Array.from(projectGroupsById.values())
      .sort((a, b) => a.projectName.localeCompare(b.projectName, i18n.resolvedLanguage))
    return { projectGroups, chatConversations }
  }, [conversationThreadBindings, conversationsById, i18n.resolvedLanguage, providerSessionsById, providerSessionThreadsById, openConversations, pageTasks, projectNamesById, t])
  const { projectGroups, chatConversations } = conversationsByScope
  const visibleProjectGroups = projectGroups
  const projectConversationGroupsEmpty = visibleProjectGroups.length === 0
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
    ...closedConversations.map((conversation) => ({
      type: 'conversation' as const,
      id: conversation.id,
      timestamp: conversation.updatedAt,
      conversation,
    })),
    ...sourceThreads
      .filter((thread) => shouldHydrateAgentThreadSummary(thread) && !archivedProviderThreadIds.has(thread.id) && !closedProviderThreadIds.has(thread.id) && !openProviderThreadIds.has(thread.id))
      .map((thread) => ({
        type: 'provider-thread' as const,
        id: thread.id,
        timestamp: Date.parse(thread.updatedAt) || 0,
        thread,
      })),
  ].sort((a, b) => b.timestamp - a.timestamp), [archivedConversations, archivedProviderThreadIds, closedConversations, closedProviderThreadIds, sourceThreads, openProviderThreadIds])
  const visibleHistoryItems = showAllHistoryConversations
    ? historyItems
    : historyItems.slice(0, DEFAULT_VISIBLE_CHAT_CONVERSATIONS)
  const hiddenHistoryItemCount = Math.max(0, historyItems.length - visibleHistoryItems.length)
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  function upsertAppServerConversationForThread(threadId: string, open = true) {
    const sourceThread = providerSessionThreadsById.get(threadId)
    if (sourceThread) {
      return upsertConversation(agentConversationRegistryInputFromThreadSummary({
        thread: sourceThread,
        userId,
        providerIdentity: activeProviderIdentity,
        open,
      }))
    }
    return appServerConversationIdForThread(threadId, activeProviderIdentity)
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
    openAgentPanelNewConversation({
      workspaceContext: { scope: 'global' },
    })
    navigate(ROUTES.project.agent)
  }

  function selectConversation(id: string) {
    void (async () => {
      const conversation = conversations.find((item) => item.id === id)
      const providerThreadId = conversation?.providerThreadId
        ?? conversationsById[id]?.providerThreadId
        ?? (id.startsWith('thread_') ? id : undefined)
      if (providerThreadId) {
        if (appServerMode) {
          upsertAppServerConversationForThread(providerThreadId, true)
        } else {
          await providerSessionClientForThread(providerThreadId).updateThread(providerThreadId, { archived: false })
          void refetchSourceThreads()
        }
      }
      const conversationId = appServerMode && providerThreadId
        ? appServerConversationIdForThread(providerThreadId, activeProviderIdentity)
        : id
      setActiveConversation(userId, conversationId)
      setConversationOpenInRegistry(userId, conversationId, true)
      if (appServerMode && providerThreadId) openAppServerThread({ threadId: providerThreadId, provider: activeAgentProvider })
      navigate(ROUTES.project.agent)
    })().catch((error) => {
      console.error('[agent] failed to restore provider-session conversation', error)
    })
  }

  function archiveConversationFromSidebar(conversation: Conversation) {
    void (async () => {
      const providerThreadId = threadIdForConversation(conversation)
      if (providerThreadId && providerSessionThreadsById.get(providerThreadId)?.status === 'running') {
        window.alert(t('agents.chat.stopBeforeClosingConversation'))
        return
      }
      setConversationOpenInRegistry(userId, conversation.id, false)
      if (getActiveConversationId(userId) === conversation.id) {
        setActiveConversation(userId, null)
      }
    })().catch((error) => {
      console.error('[agent] failed to archive provider-session conversation', error)
    })
  }

  function cleanupDeletedProviderSessionConversations(conversationId: string, deletedThreadIds: Iterable<string>) {
    const deletedThreadIdSet = new Set(deletedThreadIds)
    const sessionState = useAgentSessionStore.getState()
    const idsToRemove = new Set<string>([conversationId])
    const mappedConversationIds = new Set([
      ...Object.keys(sessionState.conversationThreadBindings),
      ...Object.keys(sessionState.conversationProviderSessionStates),
      ...Object.keys(sessionState.conversationsById),
    ])
    for (const id of mappedConversationIds) {
      const providerThreadId = sessionState.conversationThreadBindings[id]?.providerThreadId
        ?? sessionState.conversationProviderSessionStates[id]?.threadId
        ?? (id.startsWith('thread_') ? id : undefined)
      if (providerThreadId && deletedThreadIdSet.has(providerThreadId)) idsToRemove.add(id)
    }
    for (const id of idsToRemove) {
      removeProviderSessionConversation(userId, id)
      clearConversationProviderSessionState(id)
      removeContentArea(id)
    }
  }

  function deleteConversationFromSidebar(conversation: Conversation) {
    void (async () => {
      const providerThreadId = threadIdForConversation(conversation)
      if (!providerThreadId) {
        removeProviderSessionConversation(userId, conversation.id)
        clearConversationProviderSessionState(conversation.id)
        removeContentArea(conversation.id)
        return
      }
      const deletion = await providerSessionClientForConversation(conversation).deleteThread(providerThreadId)
      cleanupDeletedProviderSessionConversations(conversation.id, [deletion.threadId])
      void refetchSourceThreads()
    })().catch((error) => {
      console.error('[agent] failed to delete provider-session conversation', error)
    })
  }

  function deleteHistoryThread(threadId: string) {
    void (async () => {
      const deletion = await providerSessionClientForThread(threadId).deleteThread(threadId)
      cleanupDeletedProviderSessionConversations(threadId, [deletion.threadId])
      void refetchSourceThreads()
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
    const conversationId = appServerMode
      ? upsertAppServerConversationForThread(threadId, true)
      : agentConversationIdForRegistryInput({
          providerThreadId: threadId,
          ...activeProviderIdentity,
        })
    setConversationOpenInRegistry(userId, conversationId, true)
    setActiveConversation(userId, conversationId)
    navigate(ROUTES.project.agent)
    window.setTimeout(() => {
      if (appServerMode) {
        openAppServerThread({ threadId, provider: activeAgentProvider })
      } else {
        openAgentPanelThread(threadId, providerSessionThreadsById.get(threadId)?.sessionId)
      }
    }, 0)
  }

  function switchAgentProvider(provider: ProviderConfig) {
    if (provider.id === activeAgentProvider.id) return
    setNewConversationProviderId(provider.id)
    const activeRecord = activeConversationId ? conversationsById[activeConversationId] : undefined
    if (
      activeRecord
      && (
        activeRecord.providerId !== provider.id
        || activeRecord.providerInstanceId !== providerInstanceId(provider)
        || activeRecord.providerProtocol !== providerProtocol(provider)
      )
    ) {
      setActiveConversation(userId, null)
    }
    navigate(ROUTES.project.agent)
  }

  return (
    <AgentModeSidebar
      resizing={sidebarResize.resizing}
      width={sidebarWidth}
    >
      <AgentModeSidebarTop>
        {headerActions ? (
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
        <AgentProviderSegmentedSwitch
          providers={appServerProviders}
          activeProvider={activeAgentProvider}
          onSelect={switchAgentProvider}
        />
      </AgentModeSidebarTop>

      <AgentModeSidebarScroll>
        <div className="agent-mode-sidebar-project-heading">
          <span>项目</span>
        </div>
        {projectConversationGroupsEmpty ? (
          <AgentModeEmptyText>{t('agents.chat.agentModeSidebar.noProjectConversations')}</AgentModeEmptyText>
        ) : (
          <AgentModeGroupList>
            {visibleProjectGroups.map((group) => (
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
              {sourceThreadsLoading ? t('common.loadingShort') : t('agents.chat.noHistoryConversations')}
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

      <AgentModeResizeHandle
        {...sidebarResize.resizeHandleProps}
        side="right"
      />
    </AgentModeSidebar>
  )
}

function AgentProviderSegmentedSwitch({
  activeProvider,
  onSelect,
  providers,
}: {
  activeProvider: ProviderConfig
  onSelect: (provider: ProviderConfig) => void
  providers: ProviderConfig[]
}) {
  if (providers.length === 0) return null

  return (
    <div className="agent-mode-provider-switch" role="group" aria-label="选择 Agent app-server">
      {providers.map((provider) => {
        const active = provider.id === activeProvider.id
        return (
          <button
            key={provider.id}
            type="button"
            className="agent-mode-provider-switch__item"
            data-active={active ? 'true' : undefined}
            onClick={() => onSelect(provider)}
            aria-pressed={active}
            aria-label={provider.label}
            title={provider.label}
          >
            <IdentityMark kind="agent" id={provider.kind} />
          </button>
        )
      })}
    </div>
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
    conversationsById: Record<string, AgentConversationRegistryRecord>
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

  const recordProjectId = conversation.id ? context.conversationsById[conversation.id]?.projectId : undefined
  if (typeof recordProjectId === 'number') return recordProjectId

  const threadId = binding?.providerThreadId ?? conversation.providerThreadId
  const threadProjectId = threadId ? context.providerSessionThreadsById.get(threadId)?.projectId : undefined
  return typeof threadProjectId === 'number' ? threadProjectId : undefined
}

function appServerConversationIdForThread(
  threadId: string,
  providerIdentity: {
    provider: string
    providerId: string
    providerInstanceId: string
    providerProtocol: string
  },
): string {
  return agentConversationIdForRegistryInput({
    providerThreadId: threadId,
    ...providerIdentity,
  })
}

function appServerConversationRecordsFromSourceThreads(input: {
  conversationsById: Record<string, AgentConversationRegistryRecord>
  providerIdentity: {
    provider: string
    providerId: string
    providerInstanceId: string
    providerProtocol: string
  }
  sourceThreads: AgentThreadSummary[]
  userId: string
}): AgentConversationRegistryRecord[] {
  const records: AgentConversationRegistryRecord[] = []
  const sourceRecordIds = new Set<string>()
  for (const thread of input.sourceThreads) {
    const canonicalId = appServerConversationIdForThread(thread.id, input.providerIdentity)
    const existing = input.conversationsById[canonicalId] ?? input.conversationsById[thread.id]
    if (!shouldHydrateAgentThreadSummary(thread, existing)) continue
    const registryInput = agentConversationRegistryInputFromThreadSummary({
      thread,
      userId: input.userId,
      providerIdentity: input.providerIdentity,
      open: agentThreadSummaryRegistryOpenState(thread, existing),
    })
    const id = existing?.id ?? canonicalId
    sourceRecordIds.add(id)
    records.push({
      id,
      userId: input.userId,
      providerThreadId: thread.id,
      open: registryInput.open !== false,
      archived: registryInput.archived === true,
      createdAt: registryInput.createdAt ?? Date.now(),
      updatedAt: registryInput.updatedAt ?? Date.now(),
      ...(registryInput.provider ? { provider: registryInput.provider } : {}),
      ...(registryInput.providerId ? { providerId: registryInput.providerId } : {}),
      ...(registryInput.providerInstanceId ? { providerInstanceId: registryInput.providerInstanceId } : {}),
      ...(registryInput.providerProtocol ? { providerProtocol: registryInput.providerProtocol } : {}),
      ...(registryInput.providerSessionId ? { providerSessionId: registryInput.providerSessionId } : {}),
      ...(registryInput.title ? { title: registryInput.title } : {}),
      ...(registryInput.status ? { status: registryInput.status } : {}),
      ...(typeof registryInput.projectId === 'number' ? { projectId: registryInput.projectId } : {}),
    })
  }
  const sourceThreadIds = new Set(input.sourceThreads.map((thread) => thread.id))
  for (const record of selectAgentConversationRegistryRecords(input.conversationsById, {
    userId: input.userId,
    ...input.providerIdentity,
    includeClosed: true,
    includeArchived: true,
  })) {
    if (sourceRecordIds.has(record.id) || sourceThreadIds.has(record.providerThreadId)) continue
    records.push(record)
  }
  return records.sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
}

function conversationFromRegistryRecord(record: AgentConversationRegistryRecord): Conversation {
  const conversation: Conversation & { providerProtocol?: string } = {
    id: record.id,
    title: record.title ?? '',
    transcriptMessages: [],
    ...(record.providerSessionId ? { providerSessionId: record.providerSessionId } : {}),
    providerThreadId: record.providerThreadId,
    ...(record.archived ? { archived: true } : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
  if (record.providerProtocol) conversation.providerProtocol = record.providerProtocol
  return conversation
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

function ProjectAgentChatSurface({ userId }: { userId: string }) {
  const providerSettings = useProviderConfigStore((s) => s.settings)
  const activeConversationId = useAgentSessionStore((s) => s.activeConversationIdsByUser?.[userId] ?? null)
  const conversationsById = useAgentSessionStore((s) => s.conversationsById)
  const activeRegistryState = useMemo(() => ({
    activeConversationIdsByUser: { [userId]: activeConversationId },
    conversationsById,
  }), [activeConversationId, conversationsById, userId])
  const activeProvider = useMemo(
    () => resolveAgentChatShellProvider(providerSettings, userId, activeRegistryState),
    [activeRegistryState, providerSettings, userId],
  )
  const activeProviderIdentity = useMemo(() => ({
    provider: activeProvider.kind,
    providerId: activeProvider.id,
    providerInstanceId: providerInstanceId(activeProvider),
    providerProtocol: providerProtocol(activeProvider),
  }), [activeProvider])
  const setActiveConversation = useAgentSessionStore((s) => s.setActiveConversation)
  const openConversations = useMemo(
    () => selectAgentConversationRegistryRecords(conversationsById, { userId, ...activeProviderIdentity }),
    [activeProviderIdentity, conversationsById, userId],
  )
  const activeConversationOpen = !!activeConversationId
    && openConversations.some((record) => record.id === activeConversationId)
  const emptyThreadLabel = '我们做些什么'

  useEffect(() => {
    if (activeConversationOpen) {
      return
    }
    setActiveConversation(userId, openConversations[0]?.id ?? null)
  }, [activeConversationOpen, openConversations, setActiveConversation, userId])

  return (
    <AgentModeChatSurface>
      <AgentModeChatSurfaceInner>
        <AgentUnifiedChatShell
          userId={userId}
          emptyThreadLabel={emptyThreadLabel}
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

function projectIdFromProviderSessionCwd(cwd: string | null | undefined): number | undefined {
  const normalized = cwd?.replace(/\\/g, '/')
  if (!normalized) return undefined
  const match = /(?:^|\/)\.movscript\/(?:local|user\/[^/]+|org\/[^/]+)\/projects\/project_(\d+)(?:\/|$)/.exec(normalized)
    ?? /(?:^|\/)(?:local|user\/[^/]+|org\/[^/]+)\/projects\/project_(\d+)(?:\/|$)/.exec(normalized)
  if (!match?.[1]) return undefined
  const projectId = Number(match[1])
  return Number.isInteger(projectId) && projectId > 0 ? projectId : undefined
}

function positiveInteger(value: string | number | null | undefined): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function projectForAgentContentSession(projectId: number, projects: Project[]): Project {
  const existing = projects.find((project) => project.ID === projectId)
  if (existing) return existing
  const now = new Date(0).toISOString()
  return {
    ID: projectId,
    name: `项目 #${projectId}`,
    description: '',
    owner_id: 0,
    CreatedAt: now,
    UpdatedAt: now,
  }
}

export function ProjectAgentContentPanel({
  manageOwnWidth = false,
  collapsed = false,
  onCollapsedChange,
  width,
  onWidthChange,
}: {
  manageOwnWidth?: boolean
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  width?: number
  onWidthChange?: (width: number) => void
} = {}) {
  const currentUser = useUserStore((s) => s.currentUser)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const userId = currentUser ? String(currentUser.ID) : ''
  const providerSettings = useProviderConfigStore((s) => s.settings)
  const activeConversationId = useAgentSessionStore((s) => s.activeConversationIdsByUser?.[userId] ?? null)
  const conversationsById = useAgentSessionStore((s) => s.conversationsById)
  const activeRegistryState = useMemo(() => ({
    activeConversationIdsByUser: { [userId]: activeConversationId },
    conversationsById,
  }), [activeConversationId, conversationsById, userId])
  const activeProvider = useMemo(
    () => resolveAgentChatShellProvider(providerSettings, userId, activeRegistryState),
    [activeRegistryState, providerSettings, userId],
  )
  const activeProviderIdentity = useMemo(() => ({
    provider: activeProvider.kind,
    providerId: activeProvider.id,
    providerInstanceId: providerInstanceId(activeProvider),
    providerProtocol: providerProtocol(activeProvider),
  }), [activeProvider])
  const appServerMode = usesAppServerProtocol(activeProvider)
  const appServerActiveRecord = useMemo(() => selectActiveAgentConversationRegistryRecord({
    activeConversationIdsByUser: { [userId]: activeConversationId },
    conversationsById,
  }, {
    userId,
    ...activeProviderIdentity,
  }), [activeConversationId, activeProviderIdentity, conversationsById, userId])
  const sessionConversationId = appServerMode
    ? appServerActiveRecord?.id ?? activeConversationId
    : activeConversationId
  const sessionWorkspaceContext = useAgentSessionStore((s) => (
    sessionConversationId ? s.workspacesByUser[userId]?.[sessionConversationId]?.workspaceContext : undefined
  ))
  const sessionThreadBinding = useAgentSessionStore((s) => (
    sessionConversationId ? s.conversationThreadBindings[sessionConversationId] : undefined
  ))
  const { data: providerSessionThreads = [] } = useQuery<AgentThreadSummary[]>({
    queryKey: ['provider-session-threads', providerSessionClient.baseURL, activeProviderIdentity, 'agent-content-panel'],
    queryFn: () => listProviderSessionThreadSummariesFromWorkspace({ includeProvisional: true, providerProfileKey: activeProvider.id }),
    enabled: !appServerMode,
    retry: false,
  })
  const providerThreadProjectId = useMemo(() => {
    const providerThreadId = appServerActiveRecord?.providerThreadId
      ?? (activeConversationId ? conversationsById[activeConversationId]?.providerThreadId : undefined)
    if (!providerThreadId) return undefined
    return providerSessionThreads.find((thread) => thread.id === providerThreadId)?.projectId
  }, [activeConversationId, appServerActiveRecord, conversationsById, providerSessionThreads])
  const sessionProjectId = positiveInteger(sessionWorkspaceContext?.projectId)
    ?? positiveInteger(appServerActiveRecord?.projectId)
    ?? positiveInteger(providerThreadProjectId)
    ?? projectIdFromProviderSessionCwd(sessionThreadBinding?.providerThreadCwd)
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: projectListQueryKey(currentOrgID),
    queryFn: () => api.get('/projects').then((response) => response.data),
    enabled: sessionProjectId !== undefined,
  })
  const sessionProject = useMemo(() => (
    sessionProjectId === undefined ? null : projectForAgentContentSession(sessionProjectId, projects)
  ), [projects, sessionProjectId])
  const panelWidth = clampAgentModeContentPanelWidth(width ?? AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH)
  const setPanelWidth = useCallback((nextWidth: number) => {
    onWidthChange?.(clampAgentModeContentPanelWidth(nextWidth))
  }, [onWidthChange])
  const panelResize = useResizablePanel({
    size: panelWidth,
    onSizeChange: setPanelWidth,
    minSize: AGENT_MODE_CONTENT_PANEL_MIN_WIDTH,
    maxSize: AGENT_MODE_CONTENT_PANEL_MAX_WIDTH,
    resizeEdge: 'left',
    collapsed,
    onCollapsedChange,
    collapseMode: 'after-min',
    ariaLabel: '调整对话区宽度',
  })
  const contentAreaId = appServerMode
    ? appServerActiveRecord?.providerThreadId ?? activeConversationId ?? DEFAULT_AGENT_CONTENT_AREA_ID
    : activeConversationId ?? DEFAULT_AGENT_CONTENT_AREA_ID

  return (
    <AgentModeContentPanel
      resizing={panelResize.resizing}
      collapsed={collapsed}
      width={manageOwnWidth ? panelWidth : undefined}
      minWidth={AGENT_MODE_CONTENT_PANEL_MIN_WIDTH}
      aria-label="Agent 内容区"
      aria-hidden={collapsed ? true : undefined}
    >
      <AgentBrowserPanel contentAreaId={contentAreaId} conversationId={sessionConversationId} project={sessionProject} />
      {!collapsed ? (
        <AgentModeResizeHandle
          {...panelResize.resizeHandleProps}
          side="left"
        />
      ) : null}
    </AgentModeContentPanel>
  )
}
