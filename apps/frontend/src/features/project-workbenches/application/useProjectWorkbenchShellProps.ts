import { type ReactNode } from 'react'

import { useWorkbenchCanvasLauncher, type CanvasWorkbenchKind } from '@/features/canvas/presentation/useWorkbenchCanvasLauncher'
import {
  getProjectWorkbenchDefinition,
  type ProjectWorkbenchId,
} from '@/features/project-workbenches/domain/projectWorkbenchRegistry'
import type { WorkbenchProjectHeaderProps } from '@movscript/ui'

export interface ProjectWorkbenchShellInput {
  workbenchId: ProjectWorkbenchId
  projectName?: string
  kicker?: string
  title?: string
  description?: string
  badges?: ReactNode
  headerBody?: ReactNode
  actions?: ReactNode
  onRefresh?: () => void
  refreshing?: boolean
  refreshLabel?: string
  generationKind?: CanvasWorkbenchKind
  className?: string
}

export function useProjectWorkbenchShellProps({
  workbenchId,
  projectName,
  kicker,
  title,
  description,
  badges,
  headerBody,
  actions,
  onRefresh,
  refreshing = false,
  refreshLabel = '刷新上下文',
  generationKind,
  className,
}: ProjectWorkbenchShellInput): WorkbenchProjectHeaderProps & {
  workbenchId: ProjectWorkbenchId
  className?: string
} {
  const workbench = getProjectWorkbenchDefinition(workbenchId)
  const generation = useWorkbenchCanvasLauncher(generationKind)

  return {
    workbenchId,
    className,
    icon: workbench.icon,
    kicker: kicker || projectName,
    title: title || workbench.title,
    description: description || workbench.purpose,
    badges,
    headerBody,
    actions,
    onRefresh,
    refreshing,
    refreshLabel,
    primaryAction: generationKind ? {
      label: generation.label,
      disabled: generation.disabled,
      loading: generation.loading,
      onClick: generation.open,
    } : undefined,
  }
}
