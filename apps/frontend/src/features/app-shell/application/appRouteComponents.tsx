import React from 'react'

const lazyRetryDelays = [250, 750, 1500]

function lazyWithRetry<T extends React.ComponentType<any>>(
  load: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    let lastError: unknown
    for (let attempt = 0; attempt <= lazyRetryDelays.length; attempt += 1) {
      try {
        return await load()
      } catch (error) {
        lastError = error
        const delay = lazyRetryDelays[attempt]
        if (delay === undefined) break
        await new Promise((resolve) => window.setTimeout(resolve, delay))
      }
    }
    throw lastError
  })
}

export const ProjectAgentContentPanel = lazyWithRetry(() => import('@/features/agent/components/ProjectAgentModePage').then((module) => ({ default: module.ProjectAgentContentPanel })))
export const ProjectAgentModeSidebar = lazyWithRetry(() => import('@/features/agent/components/ProjectAgentModePage').then((module) => ({ default: module.ProjectAgentModeSidebar })))
export const ProjectAIAssistantPanel = lazyWithRetry(() => import('@/features/agent/components/ProjectAgentModePage').then((module) => ({ default: module.ProjectAIAssistantPanel })))
export const AgentTerminalPanel = lazyWithRetry(() => import('@/features/agent/components/AgentTerminalPanel').then((module) => ({ default: module.AgentTerminalPanel })))

export const AuthPage = lazyWithRetry(() => import('@/pages/AuthPage'))
export const OnboardingPage = lazyWithRetry(() => import('@/pages/onboarding/OnboardingPage'))
export const AppSettingsPage = lazyWithRetry(() => import('@/pages/app-settings/AppSettingsPage'))
export const CanvasListPage = lazyWithRetry(() => import('@/pages/canvas/CanvasListPage'))
export const CanvasEditorPage = lazyWithRetry(() => import('@/pages/canvas/CanvasEditorPage'))
export const ContentCanvasWorkspacePage = lazyWithRetry(() => import('@/features/content/components/ContentCanvasWorkspacePage'))
export const RefImageGenPage = lazyWithRetry(() => import('@/pages/tools/RefImageGenPage'))
export const RefVideoGenPage = lazyWithRetry(() => import('@/pages/tools/RefVideoGenPage'))
export const AudioGenPage = lazyWithRetry(() => import('@/pages/tools/AudioGenPage'))
export const MotionImitationPage = lazyWithRetry(() => import('@/pages/tools/MotionImitationPage'))
export const StyleTransferPage = lazyWithRetry(() => import('@/pages/tools/StyleTransferPage'))
export const MultiAnglePage = lazyWithRetry(() => import('@/pages/tools/MultiAnglePage'))
export const OrgSelectPage = lazyWithRetry(() => import('@/pages/org/OrgSelectPage'))
export const InvitePage = lazyWithRetry(() => import('@/pages/auth/InvitePage'))
export const ResourcesPage = lazyWithRetry(() => import('@/pages/resources/ResourcesPage'))
export const ExternalResourcesPage = lazyWithRetry(() => import('@/pages/resources/ExternalResourcesPage'))
export const ShotLibraryPage = lazyWithRetry(() => import('@/pages/shot-library/ShotLibraryPage'))
export const JobsPage = lazyWithRetry(() => import('@/pages/jobs/JobsPage'))
export const PluginToolPage = lazyWithRetry(() => import('@/pages/plugins/PluginToolPage'))
export const GlobalHomePage = lazyWithRetry(() => import('@/pages/home/GlobalHomePage'))
export const ProjectsPage = lazyWithRetry(() => import('@/features/project/components/ProjectsPage'))
export const ProjectDataPage = lazyWithRetry(() => import('@/features/project/components/ProjectDataPage'))
export const EditingListPage = lazyWithRetry(() => import('@/pages/editing/EditingListPage'))
export const EditingWorkspacePage = lazyWithRetry(() => import('@/pages/editing/EditingWorkspacePage'))
export const ProjectOverviewPage = lazyWithRetry(() => import('@/pages/project/ProjectOverviewPage'))
export const ProjectSettingsPage = lazyWithRetry(() => import('@/pages/project/ProjectSettingsPage'))
export const ProjectStandardsPage = lazyWithRetry(() => import('@/pages/project/standards/ProjectStandardsPage'))
export const AgentModePage = lazyWithRetry(() => import('@/pages/agent-mode/AgentModePage'))
export const AgentModeCanvasListPage = lazyWithRetry(() => import('@/pages/agent-mode/AgentModeCanvasListPage'))
export const ScriptsPage = lazyWithRetry(() => import('@/pages/scripts/ScriptsPage'))
export const AgentConnectionsPage = lazyWithRetry(() => import('@/pages/agent/AgentConnectionsPage'))
export const AgentResourceLibraryPage = lazyWithRetry(() => import('@/pages/agent/AgentResourceLibraryPage'))
export const MovScriptWorkspaceFilesPage = lazyWithRetry(() => import('@/pages/agent/MovScriptWorkspaceFilesPage'))
export const MovScriptWorkspaceReviewPage = lazyWithRetry(() => import('@/pages/agent/MovScriptWorkspaceReviewPage'))
export const ModelProvidersPage = lazyWithRetry(() => import('@/pages/agent/ModelProvidersPage'))
export const AgentsPage = lazyWithRetry(() => import('@/pages/agent/AgentsPage'))
export const AIAgentSettingsPage = lazyWithRetry(() => import('@/pages/agent/AIAgentSettingsPage'))
export const ClientPluginsPage = lazyWithRetry(() => import('@/pages/plugins/ClientPluginsPage'))
