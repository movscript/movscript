import {
  AgentBrowserInternalPane,
  AgentBrowserResourcePane,
  AgentBrowserWebOverlay,
} from '@/features/agent/components/AgentBrowserUi'

import { CanvasListView } from '@/features/canvas/components/CanvasListView'
import { ProjectStandardsContent } from '@/features/project-standards/components/ProjectStandardsPage'
import { ResourceLibraryView } from '@/features/resources/components/ResourcesPage'
import { ExternalResourceSearchPage } from '@/features/resources/components/ResourcesPageExternalSearch'
import type { Project } from '@/types'
import { AgentSessionOutputPane } from '@/features/agent/components/AgentSessionOutputPane'
import { ProjectHomeBrowserPage } from '@/features/agent/components/AgentBrowserProjectHomePage'
import { AgentBrowserBlankWebTab } from '@/features/agent/components/AgentBrowserBlankWebTab'
import type {
  AgentBrowserContentTab,
  AgentBrowserWebTabState,
} from '@/features/agent/state/agentContentAreaStore'

export function AgentBrowserTabContent({
  activeTab,
  activeWebState,
  project,
  sessionConversationId,
  onOpenProjectStandards,
  onOpenResourceLibrary,
  onOpenExternalResourceLibrary,
  onOpenCanvasList,
  onOpenResourceLibraryInCurrentTab,
  onOpenExternalResourceLibraryInCurrentTab,
  onOpenCanvasListInCurrentTab,
  onNavigateBlankWebTab,
}: {
  activeTab: AgentBrowserContentTab | undefined
  activeWebState: AgentBrowserWebTabState | null
  project: Project | null
  sessionConversationId: string
  onOpenProjectStandards: () => void
  onOpenResourceLibrary: () => void
  onOpenExternalResourceLibrary: () => void
  onOpenCanvasList: () => void
  onOpenResourceLibraryInCurrentTab: () => void
  onOpenExternalResourceLibraryInCurrentTab: () => void
  onOpenCanvasListInCurrentTab: () => void
  onNavigateBlankWebTab: (tabId: string, url: string) => void
}) {
  if (activeTab?.kind === 'project_home') {
    return (
      <ProjectHomeBrowserPage
        project={project}
        onOpenProjectStandards={onOpenProjectStandards}
        onOpenResourceLibrary={onOpenResourceLibrary}
        onOpenExternalResourceLibrary={onOpenExternalResourceLibrary}
        onOpenCanvasList={onOpenCanvasList}
      />
    )
  }

  if (activeTab?.kind === 'resources') {
    return (
      <AgentBrowserResourcePane>
        <ResourceLibraryView variant="pane" />
      </AgentBrowserResourcePane>
    )
  }

  if (activeTab?.kind === 'external_resources') {
    return (
      <AgentBrowserResourcePane>
        <ExternalResourceSearchPage variant="pane" />
      </AgentBrowserResourcePane>
    )
  }

  if (activeTab?.kind === 'canvas_list') {
    return (
      <AgentBrowserInternalPane>
        <CanvasListView source="agent" />
      </AgentBrowserInternalPane>
    )
  }

  if (activeTab?.kind === 'project_standards') {
    return (
      <AgentBrowserInternalPane>
        <ProjectStandardsContent />
      </AgentBrowserInternalPane>
    )
  }

  if (activeTab?.kind === 'session_output') {
    return (
      <AgentBrowserInternalPane>
        <AgentSessionOutputPane conversationId={sessionConversationId} projectId={project?.ID} />
      </AgentBrowserInternalPane>
    )
  }

  if (activeTab?.kind === 'web' && !(activeWebState?.url || activeTab.url)) {
    return (
      <AgentBrowserBlankWebTab
        onOpenResourceLibrary={onOpenResourceLibraryInCurrentTab}
        onOpenExternalResourceLibrary={onOpenExternalResourceLibraryInCurrentTab}
        onOpenCanvasList={onOpenCanvasListInCurrentTab}
        onSubmit={(url) => onNavigateBlankWebTab(activeTab.id, url)}
      />
    )
  }

  return <AgentBrowserWebOverlay loading={activeWebState?.loading} aria-hidden="true" />
}
