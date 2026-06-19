import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useResizablePanel } from '@movscript/ui/layout'
import { useTranslation } from 'react-i18next'

import { resolveAgentChatShellProvider } from '@/features/agent/components/AgentUnifiedChatShell'
import {
  agentRuntimeConversationIdForThread,
  agentRuntimeConversationRecordsFromProviderSources,
  agentRuntimeProviderIdentityKey,
  conversationFromRegistryRecord,
} from '@/features/agent/components/ProjectAgentModeConversationModel'
import {
  buildProjectAgentModeConversationScopes,
  buildProjectAgentModeHistoryItems,
  sortAgentModeOpenConversations,
} from '@/features/agent/components/ProjectAgentModeSidebarModel'
import { ProjectAgentModeSidebarView } from '@/features/agent/components/ProjectAgentModeSidebarView'
import { openAgentRuntimeThread } from '@/features/agent/components/AgentRuntimeChatShell'
import {
  agentThreadRegistryProviderIdentity,
  useAgentThreadRegistryHydrations,
} from '@/features/agent/application/useAgentThreadRegistryHydration'
import { openAgentPanelNewConversation } from '@/features/agent/application/agentPanelBridge'
import { createAgentChatDataSourceForProvider } from '@/features/agent/application/agentChatDataSourceFactory'
import { conversationDisplayTitle, providerThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import { api } from '@/shared/infrastructure/api'
import type { AgentSessionSummary } from '@movscript/core/agent/protocol'
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
import type { Conversation } from '@/features/agent/state/agentStore'
import {
  agentConversationRegistryActions,
  readAgentConversationRegistrySnapshot,
  useAgentActiveConversationId,
  useAgentConversationRecordsById,
  useAgentConversationThreadBindings,
} from '@/features/agent/state/agentConversationRegistryStore'
import { AGENT_MODE_CONVERSATION_FOCUS_SCOPE } from '@/features/agent/state/agentConversationFocusScope'
import { useAgentPageTasks } from '@/features/agent/state/agentTaskQueueStore'
import {
  enabledProviders,
  useProviderConfigStore,
  type ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'
import { providerSupportsAgentProfile } from '@/features/agent/application/agentProfileModel'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import type { Project } from '@/types'

const DEFAULT_VISIBLE_CHAT_CONVERSATIONS = 5
const MISSING_ARCHIVED_RUNTIME_THREAD_MESSAGE = 'no archived rollout found'

function isMissingArchivedRuntimeThread(error: unknown): boolean {
  return error instanceof Error && error.message.includes(MISSING_ARCHIVED_RUNTIME_THREAD_MESSAGE)
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
  const registryActions = agentConversationRegistryActions()
  const getActiveConversationId = registryActions.getActiveConversationId
  const removeProviderSessionConversation = registryActions.removeProviderSessionConversation
  const setActiveConversation = registryActions.setActiveConversation
  const setConversationOpenInRegistry = registryActions.setConversationOpen
  const activeConversationId = useAgentActiveConversationId(userId, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
  const conversationsById = useAgentConversationRecordsById()
  const pageTasks = useAgentPageTasks()
  const conversationThreadBindings = useAgentConversationThreadBindings()
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
  const activeRegistryState = useMemo(() => ({
    activeConversationIdsByUser: { [userId]: activeConversationId },
    conversationsById,
  }), [activeConversationId, conversationsById, userId])
  const agentProviders = useMemo(
    () => enabledProviders(providerSettings).filter(providerSupportsAgentProfile),
    [providerSettings],
  )
  const activeAgentProvider = useMemo(
    () => resolveAgentChatShellProvider(providerSettings, userId, activeRegistryState),
    [activeRegistryState, providerSettings, userId],
  )
  const activeProviderIdentity = useMemo(() => agentThreadRegistryProviderIdentity(activeAgentProvider), [activeAgentProvider])
  const providerByIdentityKey = useMemo(() => {
    const providers = new Map<string, ProviderConfig>()
    for (const provider of agentProviders) {
      providers.set(agentRuntimeProviderIdentityKey(agentThreadRegistryProviderIdentity(provider)), provider)
    }
    return providers
  }, [agentProviders])

  useEffect(() => {
    const interval = window.setInterval(() => setRelativeTimeNow(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: projectKeys.list(currentOrgID),
    queryFn: () => api.get('/projects').then((response) => response.data),
  })
  const runtimeThreadHydration = useAgentThreadRegistryHydrations({
    userId,
    providers: agentProviders,
    enabled: true,
  })
  const providerSessions = useMemo<AgentSessionSummary[]>(() => [], [])
  const sourceThreads = useMemo(() => runtimeThreadHydration.providerHydrations.flatMap((hydration) => (
    hydration.sourceThreads.map((thread) => ({
      providerIdentity: hydration.providerIdentity,
      thread,
    }))
  )), [runtimeThreadHydration.providerHydrations])
  const sourceThreadSummaries = runtimeThreadHydration.sourceThreads
  const sourceThreadsLoading = runtimeThreadHydration.isLoading
  const refetchSourceThreads = runtimeThreadHydration.refetch
  const runtimeConversationRecords = useMemo(() => {
    return agentRuntimeConversationRecordsFromProviderSources({
      conversationsById,
      providerSources: runtimeThreadHydration.providerHydrations.map((hydration) => ({
        providerIdentity: hydration.providerIdentity,
        sourceThreads: hydration.sourceThreads,
      })),
      userId,
    })
  }, [conversationsById, runtimeThreadHydration.providerHydrations, userId])
  const conversationRecordsById = useMemo(() => {
    const next = { ...conversationsById }
    for (const record of runtimeConversationRecords) next[record.id] = record
    return next
  }, [conversationsById, runtimeConversationRecords])
  const conversations = useMemo(() => runtimeConversationRecords.map(conversationFromRegistryRecord), [runtimeConversationRecords])
  const rawOpenConversations = useMemo(
    () => conversations.filter((conversation) => conversation.archived !== true && conversationRecordsById[conversation.id]?.open !== false),
    [conversations, conversationRecordsById],
  )
  const openConversations = useMemo(
    () => sortAgentModeOpenConversations({ conversations: rawOpenConversations, conversationsById: conversationRecordsById }),
    [conversationRecordsById, rawOpenConversations],
  )
  const providerSessionStatusLights = useAgentConversationTabProviderSessionStatusLights(openConversations)
  const archivedConversations = useMemo(
    () => conversations
      .filter((conversation) => conversation.archived === true)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  )
  const closedConversations = useMemo(
    () => conversations
      .filter((conversation) => conversation.archived !== true && conversationRecordsById[conversation.id]?.open === false)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations, conversationRecordsById],
  )
  const archivedConversationIds = useMemo(
    () => new Set(archivedConversations.map((conversation) => conversation.id)),
    [archivedConversations],
  )
  const closedConversationIds = useMemo(
    () => new Set(closedConversations.map((conversation) => conversation.id)),
    [closedConversations],
  )
  const openConversationIds = useMemo(
    () => new Set(openConversations.map((conversation) => conversation.id)),
    [openConversations],
  )
  const providerSessionsById = useMemo(() => new Map(providerSessions.map((session) => [session.id, session])), [providerSessions])
  const providerSessionThreadsById = useMemo(() => new Map(sourceThreadSummaries.map((thread) => [thread.id, thread])), [sourceThreadSummaries])
  const providerSessionThreadsByConversationId = useMemo(() => new Map(sourceThreads.map((sourceThread) => [
    agentRuntimeConversationIdForThread(sourceThread.thread.id, sourceThread.providerIdentity),
    sourceThread.thread,
  ])), [sourceThreads])
  const projectNamesById = useMemo(() => {
    const names = new Map<number, string>()
    for (const item of projects) names.set(item.ID, item.name)
    return names
  }, [projects])
  const conversationsByScope = useMemo(() => buildProjectAgentModeConversationScopes({
    conversationThreadBindings,
    conversationsById: conversationRecordsById,
    locale: i18n.resolvedLanguage,
    openConversations,
    pageTasks,
    projectFallbackLabel: t('agents.chat.agentModeSidebar.projectFallback'),
    projectNamesById,
    providerSessionThreadsById,
    providerSessionsById,
  }), [conversationThreadBindings, conversationRecordsById, i18n.resolvedLanguage, providerSessionsById, providerSessionThreadsById, openConversations, pageTasks, projectNamesById, t])
  const { projectGroups, chatConversations } = conversationsByScope
  const visibleProjectGroups = projectGroups
  const sortedChatConversations = chatConversations
  const visibleChatConversations = showAllChatConversations
    ? sortedChatConversations
    : sortedChatConversations.slice(0, DEFAULT_VISIBLE_CHAT_CONVERSATIONS)
  const hiddenChatConversationCount = Math.max(0, sortedChatConversations.length - visibleChatConversations.length)
  const historyItems = useMemo(() => buildProjectAgentModeHistoryItems({
    archivedConversations,
    archivedConversationIds,
    closedConversations,
    closedConversationIds,
    openConversationIds,
    sourceThreads,
  }), [archivedConversations, archivedConversationIds, closedConversations, closedConversationIds, sourceThreads, openConversationIds])
  const visibleHistoryItems = showAllHistoryConversations
    ? historyItems
    : historyItems.slice(0, DEFAULT_VISIBLE_CHAT_CONVERSATIONS)
  const hiddenHistoryItemCount = Math.max(0, historyItems.length - visibleHistoryItems.length)
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  function providerForIdentity(identity: Partial<typeof activeProviderIdentity> | undefined): ProviderConfig {
    if (!identity) return activeAgentProvider
    return providerByIdentityKey.get(agentRuntimeProviderIdentityKey(identity)) ?? activeAgentProvider
  }

  function providerForConversation(conversationId: string): ProviderConfig {
    return providerForIdentity(conversationRecordsById[conversationId] ?? conversationsById[conversationId])
  }

  function upsertAgentRuntimeConversationForThread(threadId: string, provider: ProviderConfig, open = true) {
    const providerIdentity = agentThreadRegistryProviderIdentity(provider)
    const conversationId = agentRuntimeConversationIdForThread(threadId, providerIdentity)
    const existing = conversationRecordsById[conversationId] ?? conversationsById[conversationId]
    registryActions.upsertConversation(existing ?? {
      userId,
      ...providerIdentity,
      providerThreadId: threadId,
      open,
      archived: false,
    })
    setConversationOpenInRegistry(userId, conversationId, open, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
    return conversationId
  }

  function threadIdForConversation(conversation: Conversation) {
    return conversationThreadBindings[conversation.id]?.providerThreadId
      ?? conversation.providerThreadId
      ?? (conversation.id.startsWith('thread_') ? conversation.id : undefined)
  }

  async function agentRuntimeDataSource(provider: ProviderConfig = activeAgentProvider) {
    return createAgentChatDataSourceForProvider(provider)
  }

  async function setRuntimeThreadArchived(threadId: string, archived: boolean, provider: ProviderConfig = activeAgentProvider) {
    const dataSource = await agentRuntimeDataSource(provider)
    if (archived) await dataSource.archiveThread?.({ threadId })
    else {
      try {
        await dataSource.unarchiveThread?.({ threadId })
      } catch (error) {
        if (isMissingArchivedRuntimeThread(error)) return
        throw error
      }
    }
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
        ?? conversationRecordsById[id]?.providerThreadId
        ?? conversationsById[id]?.providerThreadId
        ?? (id.startsWith('thread_') ? id : undefined)
      const targetProvider = providerForConversation(id)
      if (providerThreadId) {
        upsertAgentRuntimeConversationForThread(providerThreadId, targetProvider, true)
        await setRuntimeThreadArchived(providerThreadId, false, targetProvider)
        void refetchSourceThreads()
      }
      setNewConversationProviderId(targetProvider.id)
      const conversationId = providerThreadId
        ? agentRuntimeConversationIdForThread(providerThreadId, agentThreadRegistryProviderIdentity(targetProvider))
        : id
      setActiveConversation(userId, conversationId, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
      setConversationOpenInRegistry(userId, conversationId, true, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
      if (providerThreadId) {
        window.setTimeout(() => {
          openAgentRuntimeThread({ threadId: providerThreadId, provider: targetProvider })
        }, 0)
      }
      navigate(ROUTES.project.agent)
    })().catch((error) => {
      console.error('[agent] failed to restore agent runtime conversation', error)
    })
  }

  function archiveConversationFromSidebar(conversation: Conversation) {
    void (async () => {
      const providerThreadId = threadIdForConversation(conversation)
      if (providerThreadId && providerSessionThreadsByConversationId.get(conversation.id)?.status === 'running') {
        window.alert(t('agents.chat.stopBeforeClosingConversation'))
        return
      }
      setConversationOpenInRegistry(userId, conversation.id, false, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
      if (getActiveConversationId(userId, AGENT_MODE_CONVERSATION_FOCUS_SCOPE) === conversation.id) {
        setActiveConversation(userId, null, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
      }
    })().catch((error) => {
      console.error('[agent] failed to archive agent runtime conversation', error)
    })
  }

  function cleanupDeletedProviderSessionConversations(
    conversationId: string,
    deletedThreadIds: Iterable<string>,
    providerIdentity?: Partial<typeof activeProviderIdentity>,
  ) {
    const deletedThreadIdSet = new Set(deletedThreadIds)
    const sessionState = readAgentConversationRegistrySnapshot()
    const idsToRemove = new Set<string>([conversationId])
    const mappedConversationIds = new Set([
      ...Object.keys(sessionState.conversationThreadBindings),
      ...Object.keys(sessionState.conversationsById),
    ])
    for (const id of mappedConversationIds) {
      const record = sessionState.conversationsById[id]
      if (providerIdentity && record && agentRuntimeProviderIdentityKey(record) !== agentRuntimeProviderIdentityKey(providerIdentity)) continue
      const providerThreadId = sessionState.conversationThreadBindings[id]?.providerThreadId
        ?? record?.providerThreadId
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
      const targetProvider = providerForConversation(conversation.id)
      const dataSource = await agentRuntimeDataSource(targetProvider)
      if (!dataSource.deleteThread) throw new Error(`${targetProvider.label} 不支持删除 thread。`)
      await dataSource.deleteThread({ threadId: providerThreadId })
      cleanupDeletedProviderSessionConversations(conversation.id, [providerThreadId], agentThreadRegistryProviderIdentity(targetProvider))
      void refetchSourceThreads()
    })().catch((error) => {
      console.error('[agent] failed to delete agent runtime conversation', error)
    })
  }

  function deleteHistoryThread(threadId: string, providerIdentity: typeof activeProviderIdentity) {
    void (async () => {
      const targetProvider = providerForIdentity(providerIdentity)
      const dataSource = await agentRuntimeDataSource(targetProvider)
      if (!dataSource.deleteThread) throw new Error(`${targetProvider.label} 不支持删除 thread。`)
      await dataSource.deleteThread({ threadId })
      cleanupDeletedProviderSessionConversations(agentRuntimeConversationIdForThread(threadId, providerIdentity), [threadId], providerIdentity)
      void refetchSourceThreads()
    })().catch((error) => {
      console.error('[agent] failed to delete agent runtime thread', error)
    })
  }

  function toggleProjectGroup(projectId: number) {
    setOpenProjectGroups((state) => ({ ...state, [projectId]: !(state[projectId] ?? false) }))
  }

  function toggleProjectThreadGroup(projectId: number) {
    setExpandedProjectThreadGroups((state) => ({ ...state, [projectId]: !(state[projectId] ?? false) }))
  }

  function restoreHistoryThread(threadId: string, providerIdentity: typeof activeProviderIdentity) {
    const targetProvider = providerForIdentity(providerIdentity)
    const conversationId = upsertAgentRuntimeConversationForThread(threadId, targetProvider, true)
    setNewConversationProviderId(targetProvider.id)
    setConversationOpenInRegistry(userId, conversationId, true, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
    setActiveConversation(userId, conversationId, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
    navigate(ROUTES.project.agent)
    window.setTimeout(() => {
      openAgentRuntimeThread({ threadId, provider: targetProvider })
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
        conversations: t('agents.chat.agentModeSidebar.globalConversations'),
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
