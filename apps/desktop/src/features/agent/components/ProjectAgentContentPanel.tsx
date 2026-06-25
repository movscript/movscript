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
import { projectKeys } from '@movscript/project-surface/data'
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
  const legacySessionProjectId = positiveInteger(sessionWorkspaceContext?.projectId)
    ?? positiveInteger(activeRecord?.projectId)
    ?? positiveInteger(providerThreadProjectId)
  const sessionProjectUid = nonEmptyString(sessionWorkspaceContext?.projectUid)
  const sessionProjectDir = nonEmptyString(sessionWorkspaceContext?.projectDir) ?? nonEmptyString(sessionThreadBinding?.providerThreadCwd)
  const sessionProjectTitle = nonEmptyString(sessionWorkspaceContext?.projectTitle)
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: projectKeys.list(currentOrgID),
    queryFn: () => api.get('/projects').then((response) => response.data),
    enabled: legacySessionProjectId !== undefined || sessionProjectUid !== undefined,
  })
  const projectFromList = useMemo(() => (
    sessionProjectUid ? projects.find((project) => project.project_uid === sessionProjectUid) : undefined
  ), [projects, sessionProjectUid])
  const ensureProjectQuery = useQuery<Project | null>({
    queryKey: ['projects', 'ensure-by-uid', currentOrgID ?? 'user', sessionProjectUid, sessionProjectTitle],
    queryFn: async () => {
      if (!sessionProjectUid) return null
      const response = await api.post<{ project: Project }>('/projects/ensure', {
        project_uid: sessionProjectUid,
        name: sessionProjectTitle ?? sessionProjectUid,
      })
      return response.data.project
    },
    enabled: Boolean(sessionProjectUid) && legacySessionProjectId === undefined && projectFromList === undefined,
    retry: false,
  })
  const ensuredProject = ensureProjectQuery.data ?? undefined
  useQuery({
    queryKey: ['project-data', 'space-ensure', currentOrgID ?? 'user', currentUser?.ID, sessionProjectUid, positiveInteger(ensuredProject?.ID ?? projectFromList?.ID ?? legacySessionProjectId)],
    queryFn: async () => {
      if (!sessionProjectUid || !currentUser?.ID) return null
      const scopeKind = currentOrgID ? 'org' : 'user'
      const scopeId = currentOrgID ? String(currentOrgID) : String(currentUser.ID)
      await api.post('/project-data/spaces', {
        scope_kind: scopeKind,
        scope_id: scopeId,
        project_uid: sessionProjectUid,
        title: sessionProjectTitle ?? ensuredProject?.name ?? projectFromList?.name ?? sessionProjectUid,
      })
      return null
    },
    enabled: Boolean(sessionProjectUid && currentUser?.ID && positiveInteger(ensuredProject?.ID ?? projectFromList?.ID ?? legacySessionProjectId)),
    retry: false,
  })
  const sessionProjects = useMemo(() => (
    ensuredProject && !projects.some((project) => project.ID === ensuredProject.ID || (project.project_uid && project.project_uid === ensuredProject.project_uid))
      ? [...projects, ensuredProject]
      : projects
  ), [ensuredProject, projects])
  const sessionProject = useMemo(() => (
    projectForAgentContentSession({
      projectId: positiveInteger(legacySessionProjectId ?? ensuredProject?.ID ?? projectFromList?.ID),
      projectUid: sessionProjectUid,
      projectDir: sessionProjectDir,
      projectTitle: sessionProjectTitle,
      projects: sessionProjects,
    })
  ), [ensuredProject?.ID, legacySessionProjectId, projectFromList?.ID, sessionProjectDir, sessionProjectTitle, sessionProjectUid, sessionProjects])
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

function positiveInteger(value: string | number | null | undefined): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function projectForAgentContentSession(input: {
  projectId?: number
  projectUid?: string
  projectDir?: string
  projectTitle?: string
  projects: Project[]
}): Project | null {
  const existing = input.projectId !== undefined
    ? input.projects.find((project) => project.ID === input.projectId)
    : input.projectUid
      ? input.projects.find((project) => project.project_uid === input.projectUid)
      : undefined
  if (existing) {
    return {
      ...existing,
      ...(input.projectDir ? { workspace_path: input.projectDir, project_path: input.projectDir, local: true } : {}),
      ...(input.projectTitle ? { name: input.projectTitle } : {}),
    }
  }
  if (input.projectId === undefined) return null
  const now = new Date(0).toISOString()
  return {
    ID: input.projectId,
    name: input.projectTitle ?? `项目 #${input.projectId}`,
    description: '',
    owner_id: 0,
    ...(input.projectDir ? { workspace_path: input.projectDir, project_path: input.projectDir, local: true } : {}),
    ...(input.projectUid ? { project_uid: input.projectUid } : {}),
    CreatedAt: now,
    UpdatedAt: now,
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
