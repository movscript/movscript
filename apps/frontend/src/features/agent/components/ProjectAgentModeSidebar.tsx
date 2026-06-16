import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useResizablePanel } from '@movscript/ui/layout'
import { useTranslation } from 'react-i18next'

import { resolveAgentChatShellProvider } from '@/features/agent/components/AgentUnifiedChatShell'
import {
  appServerConversationIdForThread,
  appServerConversationRecordsFromSourceThreads,
  conversationFromRegistryRecord,
} from '@/features/agent/components/ProjectAgentModeConversationModel'
import {
  buildProjectAgentModeConversationScopes,
  buildProjectAgentModeHistoryItems,
  sortAgentModeOpenConversations,
} from '@/features/agent/components/ProjectAgentModeSidebarModel'
import { ProjectAgentModeSidebarView } from '@/features/agent/components/ProjectAgentModeSidebarView'
import { openAppServerThread } from '@/features/agent/components/AppServerChatShell'
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
import { providerSessionKeys, providerSessionThreadKeys } from '@/features/agent/application/providerSessionQueryKeys'
import { conversationDisplayTitle, providerThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import { api } from '@/shared/infrastructure/api'
import { providerSessionClient, type AgentSessionSummary, type AgentThreadSummary } from '@/shared/infrastructure/providerSessionClient'
import { projectKeys } from '@/features/project/application/projectQueries'
import { ROUTES } from '@/routes/projectRoutes'
import { useAgentConversationTabProviderSessionStatusLights } from '@/features/agent/presentation/useAgentConversationTabProviderSessionStatusLights'
import { useAgentContentAreaStore } from '@/features/agent/state/agentContentAreaStore'
import {
  AGENT_MODE_SIDEBAR_DEFAULT_WIDTH,
  AGENT_MODE_SIDEBAR_MAX_WIDTH,
  AGENT_MODE_SIDEBAR_MIN_WIDTH,
  clampAgentModeSidebarWidth,
} from '@/features/agent/presentation/agentModePanelSizing'
import {
  agentConversationIdForRegistryInput,
  selectAgentConversationRegistryRecords,
} from '@movscript/core/agent'
import type { Conversation } from '@/features/agent/state/agentStore'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import {
  providerInstanceId,
  providerProtocol,
  usesAppServerProtocol,
  useProviderConfigStore,
} from '@/shared/infrastructure/providerConfigStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import type { Project } from '@/types'

const DEFAULT_VISIBLE_CHAT_CONVERSATIONS = 5

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
    queryKey: projectKeys.list(currentOrgID),
    queryFn: () => api.get('/projects').then((response) => response.data),
  })
  const { data: providerSessionThreads = [], isLoading: providerSessionThreadsLoading, refetch: refetchProviderSessionThreads } = useQuery<AgentThreadSummary[]>({
    queryKey: providerSessionThreadKeys.list(providerSessionClient.baseURL, activeProviderIdentity, 'agent-mode-sidebar'),
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
    queryKey: providerSessionKeys.list(providerSessionClient.baseURL, activeProviderIdentity, 'agent-mode-sidebar'),
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
  const openConversations = useMemo(() => sortAgentModeOpenConversations(rawOpenConversations), [rawOpenConversations])
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
  const conversationsByScope = useMemo(() => buildProjectAgentModeConversationScopes({
    conversationThreadBindings,
    conversationsById,
    locale: i18n.resolvedLanguage,
    openConversations,
    pageTasks,
    projectFallbackLabel: t('agents.chat.agentModeSidebar.projectFallback'),
    projectNamesById,
    providerSessionThreadsById,
    providerSessionsById,
  }), [conversationThreadBindings, conversationsById, i18n.resolvedLanguage, providerSessionsById, providerSessionThreadsById, openConversations, pageTasks, projectNamesById, t])
  const { projectGroups, chatConversations } = conversationsByScope
  const visibleProjectGroups = projectGroups
  const sortedChatConversations = chatConversations
  const visibleChatConversations = showAllChatConversations
    ? sortedChatConversations
    : sortedChatConversations.slice(0, DEFAULT_VISIBLE_CHAT_CONVERSATIONS)
  const hiddenChatConversationCount = Math.max(0, sortedChatConversations.length - visibleChatConversations.length)
  const historyItems = useMemo(() => buildProjectAgentModeHistoryItems({
    archivedConversations,
    archivedProviderThreadIds,
    closedConversations,
    closedProviderThreadIds,
    openProviderThreadIds,
    sourceThreads,
  }), [archivedConversations, archivedProviderThreadIds, closedConversations, closedProviderThreadIds, sourceThreads, openProviderThreadIds])
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
      ...Object.keys(sessionState.conversationsById),
    ])
    for (const id of mappedConversationIds) {
      const providerThreadId = sessionState.conversationThreadBindings[id]?.providerThreadId
        ?? (id.startsWith('thread_') ? id : undefined)
      if (providerThreadId && deletedThreadIdSet.has(providerThreadId)) idsToRemove.add(id)
    }
    for (const id of idsToRemove) {
      removeProviderSessionConversation(userId, id)
      removeContentArea(id)
    }
  }

  function deleteConversationFromSidebar(conversation: Conversation) {
    void (async () => {
      const providerThreadId = threadIdForConversation(conversation)
      if (!providerThreadId) {
        removeProviderSessionConversation(userId, conversation.id)
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

  return (
    <ProjectAgentModeSidebarView
      headerActions={headerActions}
      resizing={sidebarResize.resizing}
      sidebarWidth={sidebarWidth}
      resizeHandleProps={sidebarResize.resizeHandleProps}
      projectGroups={visibleProjectGroups}
      openProjectGroups={openProjectGroups}
      expandedProjectThreadGroups={expandedProjectThreadGroups}
      activeConversationId={activeConversationId}
      locale={locale}
      now={relativeTimeNow}
      providerSessionStatusLights={providerSessionStatusLights}
      chatConversationsOpen={conversationsOpen}
      sortedChatConversations={sortedChatConversations}
      visibleChatConversations={visibleChatConversations}
      hiddenChatConversationCount={hiddenChatConversationCount}
      showAllChatConversations={showAllChatConversations}
      historyOpen={historyOpen}
      historyItems={historyItems}
      visibleHistoryItems={visibleHistoryItems}
      hiddenHistoryItemCount={hiddenHistoryItemCount}
      showAllHistoryConversations={showAllHistoryConversations}
      sourceThreadsLoading={sourceThreadsLoading}
      labels={{
        startConversation: t('agents.chat.agentModeSidebar.startConversation'),
        projectHeading: '项目',
        noProjectConversations: t('agents.chat.agentModeSidebar.noProjectConversations'),
        archiveConversation: t('agents.chat.archiveConversation'),
        collapseProjectConversations: t('agents.chat.agentModeSidebar.collapseProjectConversations'),
        expandProjectConversations: t('agents.chat.agentModeSidebar.expandProjectConversations'),
        conversations: t('agents.chat.agentModeSidebar.conversations'),
        showFewerConversations: t('agents.chat.agentModeSidebar.showFewerConversations'),
        showMoreConversations: (count) => t('agents.chat.agentModeSidebar.showMoreConversations', { count }),
        history: t('agents.chat.conversationHistory'),
        loading: t('common.loadingShort'),
        noHistoryConversations: t('agents.chat.noHistoryConversations'),
        deleteConversation: t('agents.chat.deleteConversation'),
      }}
      onStartConversation={startNewConversation}
      onToggleProjectGroup={toggleProjectGroup}
      onToggleProjectThreadGroup={toggleProjectThreadGroup}
      onSelectConversation={selectConversation}
      onArchiveConversation={archiveConversationFromSidebar}
      onChatConversationsOpenChange={setConversationsOpen}
      onToggleShowAllChatConversations={() => setShowAllChatConversations((value) => !value)}
      onHistoryOpenChange={setHistoryOpen}
      onToggleShowAllHistoryConversations={() => setShowAllHistoryConversations((value) => !value)}
      onDeleteConversation={deleteConversationFromSidebar}
      onRestoreThread={restoreHistoryThread}
      onDeleteThread={deleteHistoryThread}
      getConversationTitle={(conversation) => conversationDisplayTitle(conversation, t)}
      getThreadTitle={(thread) => providerThreadTitle(thread, t)}
      getThreadDescription={(thread) => [
        t('agents.chat.messagesCount', { count: thread.messageCount }),
        thread.projectId ? t('agents.chat.panel.workspaces.projectBadge', { id: thread.projectId }) : null,
      ].filter(Boolean).join(' · ')}
    />
  )
}
