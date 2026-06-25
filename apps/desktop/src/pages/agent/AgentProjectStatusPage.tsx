import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AgentProjectStatusSurface } from '@movscript/project-surface/react'
import { useAgentMcpApiProxy } from './useAgentMcpApiProxy'
import { agentSurfaceParams, fetchAgentSurfaceSnapshot } from './agentSurfaceData'

export default function AgentProjectStatusPage() {
  const proxy = useAgentMcpApiProxy()
  const projectId = proxy.params.get('projectId') ?? undefined
  const productionId = proxy.params.get('productionId') ?? undefined
  const queryParams = useMemo(() => agentSurfaceParams(proxy.params, { projectId, productionId }), [proxy.params, projectId, productionId])
  const { data: snapshot, isLoading, error } = useQuery({
    queryKey: ['agent-surface', 'project-status', queryParams],
    queryFn: () => fetchAgentSurfaceSnapshot('project-status', queryParams),
    enabled: proxy.ready && Boolean(projectId),
  })

  return (
    <AgentProjectStatusSurface
      ready={proxy.ready}
      params={proxy.params}
      projectId={projectId}
      productionId={productionId}
      snapshot={snapshot}
      isLoading={isLoading}
      error={error}
    />
  )
}
