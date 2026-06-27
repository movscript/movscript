import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AgentProjectStatusSurface } from '@movscript/project-surface/react'
import { useAgentMcpApiProxy } from './useAgentMcpApiProxy'
import { agentSurfaceKeys, agentSurfaceParams, fetchAgentSurfaceSnapshot } from './agentSurfaceData'

export default function AgentProjectStatusPage() {
  const proxy = useAgentMcpApiProxy()
  const projectId = proxy.params.get('projectId') ?? undefined
  const productionId = proxy.params.get('productionId') ?? proxy.params.get('production_id') ?? undefined
  const queryParams = useMemo(() => agentSurfaceParams(proxy.params, { projectId, productionId }), [proxy.params, projectId, productionId])
  const timelineScopeId = String(queryParams.productionId ?? queryParams.production_id ?? productionId ?? '') || undefined
  const { data: snapshot, isLoading, error } = useQuery({
    queryKey: agentSurfaceKeys.snapshot('project-status', queryParams),
    queryFn: () => fetchAgentSurfaceSnapshot('project-status', queryParams),
    enabled: proxy.ready && Boolean(projectId),
  })

  return (
    <AgentProjectStatusSurface
      ready={proxy.ready}
      params={proxy.params}
      projectId={projectId}
      productionId={timelineScopeId}
      snapshot={snapshot}
      isLoading={isLoading}
      error={error}
    />
  )
}
