import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AgentModeContentPanel,
  AgentModeResizeHandle,
} from '@/features/agent/components/AgentModeUi'
import { useResizablePanel } from '@movscript/ui/layout'
import { AgentBrowserPanel } from '@/features/agent/components/AgentBrowserPanel'
import { resolveAgentChatShellProvider } from '@/features/agent/components/AgentUnifiedChatShell'
import { listProviderSessionThreadSummariesFromWorkspace } from '@/features/agent/application/providerSessionThreadQueryCache'
import { providerSessionThreadKeys } from '@/features/agent/application/providerSessionQueryKeys'
import { providerSessionClient, type AgentThreadSummary } from '@/shared/infrastructure/providerSessionClient'
import { api } from '@/shared/infrastructure/api'
import { projectKeys } from '@/features/project/application/projectQueries'
import {
  AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH,
  AGENT_MODE_CONTENT_PANEL_MAX_WIDTH,
  AGENT_MODE_CONTENT_PANEL_MIN_WIDTH,
  clampAgentModeContentPanelWidth,
} from '@/features/agent/presentation/agentModePanelSizing'
import {
  DEFAULT_AGENT_CONTENT_AREA_ID,
  useAgentContentAreaStore,
} from '@/features/agent/state/agentContentAreaStore'
import {
  selectActiveAgentConversationRegistryRecord,
} from '@movscript/core/agent'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import {
  providerInstanceId,
  providerProtocol,
  usesAppServerProtocol,
  useProviderConfigStore,
} from '@/shared/infrastructure/providerConfigStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import type { Project } from '@/types'

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
    queryKey: providerSessionThreadKeys.list(providerSessionClient.baseURL, activeProviderIdentity, 'agent-content-panel'),
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
    queryKey: projectKeys.list(currentOrgID),
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
