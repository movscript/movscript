import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { useProjectAgentModeSidebarActions } from '@/features/agent/components/useProjectAgentModeSidebarActions'
import {
  buildProjectAgentModeConversationScopes,
  buildProjectAgentModeHistoryItems,
  sortAgentModeOpenConversations,
} from '@/features/agent/components/ProjectAgentModeSidebarModel'
import {
  agentThreadRegistryProviderIdentity,
  useAgentThreadRegistryHydrations,
} from '@/features/agent/application/useAgentThreadRegistryHydration'
import { conversationDisplayTitle, providerThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import { api } from '@/shared/infrastructure/api'
import type { AgentSessionSummary, AgentThreadSummary } from '@movscript/core/agent/protocol'
import { projectKeys } from '@/features/project/application/projectQueries'
import { useAgentConversationTabProviderSessionStatusLights } from '@/features/agent/presentation/useAgentConversationTabProviderSessionStatusLights'
import {
  AGENT_MODE_SIDEBAR_DEFAULT_WIDTH,
  AGENT_MODE_SIDEBAR_MAX_WIDTH,
  AGENT_MODE_SIDEBAR_MIN_WIDTH,
  clampAgentModeSidebarWidth,
} from '@/features/agent/presentation/agentModePanelSizing'
import type { Conversation } from '@/features/agent/state/agentStore'
import {
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

export function useProjectAgentModeSidebarController({
  headerActions,
  width,
  onWidthChange,
}: {
  headerActions?: ReactNode
  width?: number
  onWidthChange?: (width: number) => void
} = {}) {
  const { t, i18n } = useTranslation()
  const currentUser = useUserStore((s) => s.currentUser)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const userId = currentUser ? String(currentUser.ID) : ''
  const activeConversationId = useAgentActiveConversationId(userId, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
  const conversationsById = useAgentConversationRecordsById()
  const pageTasks = useAgentPageTasks()
  const conversationThreadBindings = useAgentConversationThreadBindings()
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
  const {
    archiveConversationFromSidebar,
    deleteConversationFromSidebar,
    deleteHistoryThread,
    restoreHistoryThread,
    selectConversation,
    startNewConversation,
  } = useProjectAgentModeSidebarActions({
    activeAgentProvider,
    conversations,
    conversationRecordsById,
    conversationsById,
    conversationThreadBindings,
    providerByIdentityKey,
    providerSessionThreadsByConversationId,
    refetchSourceThreads,
    setNewConversationProviderId,
    userId,
  })

  function toggleProjectGroup(projectId: number) {
    setOpenProjectGroups((state) => ({ ...state, [projectId]: !(state[projectId] ?? false) }))
  }

  function toggleProjectThreadGroup(projectId: number) {
    setExpandedProjectThreadGroups((state) => ({ ...state, [projectId]: !(state[projectId] ?? false) }))
  }

  return {
    activeConversationId,
    chatConversationsOpen: conversationsOpen,
    expandedProjectThreadGroups,
    getConversationTitle: (conversation: Conversation) => conversationDisplayTitle(conversation, t),
    getThreadDescription: (thread: AgentThreadSummary) => [
      t('agents.chat.messagesCount', { count: thread.messageCount }),
      thread.projectId ? t('agents.chat.panel.workspaces.projectBadge', { id: thread.projectId }) : null,
    ].filter(Boolean).join(' · '),
    getThreadTitle: (thread: AgentThreadSummary) => providerThreadTitle(thread, t),
    headerActions,
    hiddenChatConversationCount,
    hiddenHistoryItemCount,
    historyItems,
    historyOpen,
    labels: {
      startConversation: t('agents.chat.agentModeSidebar.startConversation'),
      projectHeading: '项目',
      noProjectConversations: t('agents.chat.agentModeSidebar.noProjectConversations'),
      archiveConversation: t('agents.chat.archiveConversation'),
      collapseProjectConversations: t('agents.chat.agentModeSidebar.collapseProjectConversations'),
      expandProjectConversations: t('agents.chat.agentModeSidebar.expandProjectConversations'),
      conversations: t('agents.chat.agentModeSidebar.globalConversations'),
      showFewerConversations: t('agents.chat.agentModeSidebar.showFewerConversations'),
      showMoreConversations: (count: number) => t('agents.chat.agentModeSidebar.showMoreConversations', { count }),
      history: t('agents.chat.conversationHistory'),
      loading: t('common.loadingShort'),
      noHistoryConversations: t('agents.chat.noHistoryConversations'),
      deleteConversation: t('agents.chat.deleteConversation'),
    },
    locale,
    now: relativeTimeNow,
    onArchiveConversation: archiveConversationFromSidebar,
    onChatConversationsOpenChange: setConversationsOpen,
    onDeleteConversation: deleteConversationFromSidebar,
    onDeleteThread: deleteHistoryThread,
    onHistoryOpenChange: setHistoryOpen,
    onRestoreThread: restoreHistoryThread,
    onSelectConversation: selectConversation,
    onStartConversation: startNewConversation,
    onToggleProjectGroup: toggleProjectGroup,
    onToggleProjectThreadGroup: toggleProjectThreadGroup,
    onToggleShowAllChatConversations: () => setShowAllChatConversations((value) => !value),
    onToggleShowAllHistoryConversations: () => setShowAllHistoryConversations((value) => !value),
    openProjectGroups,
    projectGroups: visibleProjectGroups,
    providerSessionStatusLights,
    resizeHandleProps: sidebarResize.resizeHandleProps,
    resizing: sidebarResize.resizing,
    showAllChatConversations,
    showAllHistoryConversations,
    sidebarWidth,
    sortedChatConversations,
    sourceThreadsLoading,
    visibleChatConversations,
    visibleHistoryItems,
  }
}
