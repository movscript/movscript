import { useEffect } from 'react'
import {
  AgentModeFullscreenLayout,
  AgentModeRoot,
} from '@/features/agent/components/AgentModeUi'

import { ProjectAgentContentPanel } from '@/features/agent/components/ProjectAgentContentPanel'
export { ProjectAgentContentPanel } from '@/features/agent/components/ProjectAgentContentPanel'
export { ProjectAIAssistantPanel } from '@/features/agent/components/ProjectAIAssistantPanel'
import { PROJECT_AGENT_ROUTE_LAYOUT } from '@/features/agent/components/ProjectAgentModeLayoutModel'
import { ProjectAgentModeSidebar } from '@/features/agent/components/ProjectAgentModeSidebar'
export { ProjectAgentModeSidebar } from '@/features/agent/components/ProjectAgentModeSidebar'
import { ProjectAgentModeWorkspace } from '@/features/agent/components/ProjectAgentModeWorkspace'
import { useRouteLayoutPaneController } from '@/features/app-shell/application/useRouteLayoutPaneController'
import {
  APP_SHELL_AGENT_CONTENT_PANE_ID,
  APP_SHELL_AGENT_SIDEBAR_PANE_ID,
} from '@/routes/routeLayoutRegistry'
import {
  clampAgentModeContentPanelWidth,
  clampAgentModeSidebarWidth,
} from '@/features/agent/presentation/agentModePanelSizing'
import {
  agentModeRenderDiagnosticsEnabled,
  scheduleAgentModePaintDiagnostics,
} from '@/features/agent/presentation/agentModePaintDiagnostics'
import { useUserStore } from '@/shared/infrastructure/session/userStore'

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
