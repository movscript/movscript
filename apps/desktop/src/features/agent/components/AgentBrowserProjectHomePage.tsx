import { FolderOpen } from 'lucide-react'

import {
  AgentBrowserProjectEmpty,
} from '@/features/agent/components/AgentBrowserInternalPageUi'
import {
  AgentBrowserProjectHomeContent,
} from '@/features/agent/components/AgentBrowserProjectHomePageParts'
import { useAgentBrowserProjectHomeController } from '@/features/agent/components/useAgentBrowserProjectHomeController'
import type { Project } from '@/types'

export function ProjectHomeBrowserPage({
  project,
  onOpenProjectStandards,
  onOpenResourceLibrary,
  onOpenExternalResourceLibrary,
  onOpenCanvasList,
  onOpenEditingProjects,
}: {
  project: Project | null
  onOpenProjectStandards: () => void
  onOpenResourceLibrary: () => void
  onOpenExternalResourceLibrary: () => void
  onOpenCanvasList: () => void
  onOpenEditingProjects: () => void
}) {
  if (!project) {
    return (
      <AgentBrowserProjectEmpty
        icon={<FolderOpen size={21} />}
        title="内容导航"
        description="当前还没有选中的项目。选择项目后可从这里进入手记、设定、素材、制作、情节和内容。"
      />
    )
  }

  return (
    <ProjectHomeBrowserProjectContent
      project={project}
      onOpenProjectStandards={onOpenProjectStandards}
      onOpenResourceLibrary={onOpenResourceLibrary}
      onOpenExternalResourceLibrary={onOpenExternalResourceLibrary}
      onOpenCanvasList={onOpenCanvasList}
      onOpenEditingProjects={onOpenEditingProjects}
    />
  )
}

function ProjectHomeBrowserProjectContent({
  project,
  onOpenProjectStandards,
  onOpenResourceLibrary,
  onOpenExternalResourceLibrary,
  onOpenCanvasList,
  onOpenEditingProjects,
}: {
  project: Project
  onOpenProjectStandards: () => void
  onOpenResourceLibrary: () => void
  onOpenExternalResourceLibrary: () => void
  onOpenCanvasList: () => void
  onOpenEditingProjects: () => void
}) {
  const model = useAgentBrowserProjectHomeController({
    onOpenCanvasList,
    onOpenProjectStandards,
    onOpenResourceLibrary,
    project,
  })

  return (
    <AgentBrowserProjectHomeContent
      model={model}
      onOpenCanvasList={onOpenCanvasList}
      onOpenEditingProjects={onOpenEditingProjects}
      onOpenExternalResourceLibrary={onOpenExternalResourceLibrary}
      onOpenProjectStandards={onOpenProjectStandards}
      onOpenResourceLibrary={onOpenResourceLibrary}
    />
  )
}
