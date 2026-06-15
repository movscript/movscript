import { type ReactNode } from 'react'

import { useWorkbenchCanvasLauncher, type CanvasWorkbenchKind } from '@/features/canvas/presentation/useWorkbenchCanvasLauncher'
import {
  getProjectEntryDefinition,
  type ProjectEntryId,
} from '@/features/project/domain/projectEntryRegistry'
import type { WorkbenchProjectHeaderProps } from '@movscript/ui/business/workbench'

export interface ProjectEntryShellInput {
  projectEntryId: ProjectEntryId
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

export function useProjectEntryShellProps({
  projectEntryId,
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
}: ProjectEntryShellInput): WorkbenchProjectHeaderProps & {
  workbenchId: ProjectEntryId
  className?: string
} {
  const entry = getProjectEntryDefinition(projectEntryId)
  const generation = useWorkbenchCanvasLauncher(generationKind)

  return {
    workbenchId: projectEntryId,
    className,
    icon: entry.icon,
    kicker: kicker || projectName,
    title: title || entry.title,
    description: description || entry.purpose,
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
