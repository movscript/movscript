import type { ReactNode } from 'react'
import { ProjectAgentModeSidebarView } from '@/features/agent/components/ProjectAgentModeSidebarView'
import { useProjectAgentModeSidebarController } from '@/features/agent/components/useProjectAgentModeSidebarController'

export function ProjectAgentModeSidebar({
  headerActions,
  width,
  onWidthChange,
}: {
  headerActions?: ReactNode
  width?: number
  onWidthChange?: (width: number) => void
} = {}) {
  const controller = useProjectAgentModeSidebarController({
    headerActions,
    width,
    onWidthChange,
  })

  return <ProjectAgentModeSidebarView {...controller} />
}
