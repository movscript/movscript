import type { AgentSurfaceSnapshot } from '../../data.js'
import { useProjectSurfaceRuntime } from '../../runtime/index.js'
import { AgentProjectStatusSurface } from '../AgentProjectStatusSurface.js'

export interface ProjectProgressSurfaceProps {
  params?: URLSearchParams
  productionId?: string
  snapshot?: AgentSurfaceSnapshot
  isLoading?: boolean
  error?: Error
}

export function ProjectProgressSurface({
  params,
  productionId,
  snapshot,
  isLoading,
  error,
}: ProjectProgressSurfaceProps) {
  const runtime = useProjectSurfaceRuntime()

  return (
    <AgentProjectStatusSurface
      ready={Boolean(runtime.project.projectId)}
      params={params ?? new URLSearchParams()}
      projectId={runtime.project.projectId}
      productionId={productionId}
      snapshot={snapshot}
      isLoading={isLoading}
      error={error}
    />
  )
}
