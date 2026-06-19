import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AgentModeContentPanel,
  AgentModeResizeHandle,
} from '@/features/agent/components/AgentModeUi'
import { useResizablePanel } from '@movscript/ui/layout'
import { AgentBrowserPanel } from '@/features/agent/components/AgentBrowserPanel'
import { resolveAgentChatShellProfile } from '@/features/agent/components/AgentUnifiedChatShell'
import { useAgentThreadRegistryHydration } from '@/features/agent/application/useAgentThreadRegistryHydration'
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
import { useAgentConversationWorkspace } from '@/features/agent/state/agentConversationDraftStore'
import {
  useAgentActiveConversationId,
  useAgentConversationRecordsById,
  useAgentConversationThreadBinding,
} from '@/features/agent/state/agentConversationRegistryStore'
import { AGENT_MODE_CONVERSATION_FOCUS_SCOPE } from '@/features/agent/state/agentConversationFocusScope'
import { useProviderConfigStore } from '@/shared/infrastructure/providerConfigStore'
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
  const activeConversationId = useAgentActiveConversationId(userId, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
  const conversationsById = useAgentConversationRecordsById()
  const activeRegistryState = useMemo(() => ({
    activeConversationIdsByUser: { [userId]: activeConversationId },
    conversationsById,
  }), [activeConversationId, conversationsById, userId])
  const activeProfile = useMemo(
    () => resolveAgentChatShellProfile(providerSettings, userId, activeRegistryState),
    [activeRegistryState, providerSettings, userId],
  )
  const activeProviderProfile = activeProfile?.providerProfile
  const activeProviderIdentity = useMemo(() => ({
    provider: activeProviderProfile?.kind ?? 'mova',
    providerId: activeProviderProfile?.id,
    providerInstanceId: activeProviderProfile?.instanceId,
    providerProtocol: activeProviderProfile?.protocol,
  }), [activeProviderProfile])
  const activeRecord = useMemo(() => selectActiveAgentConversationRegistryRecord({
    activeConversationIdsByUser: { [userId]: activeConversationId },
    conversationsById,
  }, {
    userId,
    ...activeProviderIdentity,
  }), [activeConversationId, activeProviderIdentity, conversationsById, userId])
  const sessionConversationId = activeRecord?.id ?? null
  const sessionWorkspace = useAgentConversationWorkspace(userId, sessionConversationId ?? '')
  const sessionWorkspaceContext = sessionConversationId ? sessionWorkspace.workspaceContext : undefined
  const sessionThreadBinding = useAgentConversationThreadBinding(sessionConversationId ?? '')
  const runtimeThreadHydration = useAgentThreadRegistryHydration({
    userId,
    provider: activeProfile?.provider,
    enabled: Boolean(activeProfile?.provider),
  })
  const providerThreadProjectId = useMemo(() => {
    const providerThreadId = activeRecord?.providerThreadId
    if (!providerThreadId) return undefined
    return runtimeThreadHydration.sourceThreads.find((thread) => thread.id === providerThreadId)?.projectId
  }, [activeRecord, runtimeThreadHydration.sourceThreads])
  const sessionProjectId = positiveInteger(sessionWorkspaceContext?.projectId)
    ?? positiveInteger(activeRecord?.projectId)
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
  const contentAreaId = activeRecord?.providerThreadId ?? DEFAULT_AGENT_CONTENT_AREA_ID

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
  const match = /(?:^|\/)(?:\.movscript\/)?realms\/(?:local|cloud\/[^/]+)\/(?:user|org)\/[^/]+\/projects\/project_(\d+)(?:\/|$)/.exec(normalized)
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
