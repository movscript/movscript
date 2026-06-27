import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AgentImpactSurface, type AgentImpactAcceptStaleInput } from '@movscript/project-surface/react'
import { useAgentMcpApiProxy } from './useAgentMcpApiProxy'
import { agentSurfaceKeys, agentSurfaceParams, fetchAgentSurfaceSnapshot, invalidateAgentSurfaceQueries, postAgentSurfaceAction } from './agentSurfaceData'

export default function AgentImpactPage() {
  const proxy = useAgentMcpApiProxy()
  const queryClient = useQueryClient()
  const projectId = proxy.params.get('projectId') ?? undefined
  const target = proxy.params.get('target') ?? undefined
  const source = proxy.params.get('source') ?? 'domain_regeneration_plan'
  const queryParams = useMemo(() => agentSurfaceParams(proxy.params, { projectId, target, source }), [proxy.params, projectId, target, source])
  const { data: snapshot, isLoading, error } = useQuery({
    queryKey: agentSurfaceKeys.snapshot('impact', queryParams),
    queryFn: () => fetchAgentSurfaceSnapshot('impact', queryParams),
    enabled: proxy.ready,
  })
  const acceptStale = useMutation({
    mutationFn: (input: AgentImpactAcceptStaleInput) => postAgentSurfaceAction('impact', 'accept-stale', queryParams, {
      projectId,
      contentUnitId: input.contentUnitId,
      candidateId: input.candidateId,
      ...(input.resourceId ? { resourceId: input.resourceId } : {}),
      metadata: {
        surface: 'agent_impact',
        intent: 'accept_stale',
      },
    }),
    onSuccess: () => {
      invalidateAgentSurfaceQueries(queryClient, [
        'impact',
        'content-candidates',
        'content-prompt',
        'project-status',
        'preview-timeline',
      ])
    },
  })

  return (
    <AgentImpactSurface
      ready={proxy.ready}
      params={proxy.params}
      projectId={projectId}
      target={target}
      source={source}
      snapshot={snapshot}
      isLoading={isLoading}
      error={error}
      acceptStalePending={acceptStale.isPending}
      acceptStaleError={acceptStale.error}
      acceptStaleSuccess={acceptStale.isSuccess}
      onAcceptStale={(input) => acceptStale.mutate(input)}
    />
  )
}
