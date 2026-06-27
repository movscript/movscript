import { useMemo } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { MediaViewer } from '@movscript/resource-surface/resource-media-viewer'
import { api } from '@/shared/infrastructure/api'
import type { RawResource } from '@/types'
import {
  AgentContentCandidatesSurface,
  agentContentCandidateResourceIds,
  type AgentCandidateDecisionInput,
} from '@movscript/project-surface/react'
import { useAgentMcpApiProxy } from './useAgentMcpApiProxy'
import { agentSurfaceKeys, agentSurfaceParams, fetchAgentSurfaceSnapshot, invalidateAgentSurfaceQueries, postAgentSurfaceAction } from './agentSurfaceData'

export default function AgentContentCandidatesPage() {
  const proxy = useAgentMcpApiProxy()
  const queryClient = useQueryClient()
  const projectId = proxy.params.get('projectId') ?? undefined
  const contentUnitId = proxy.params.get('contentUnitId') ?? undefined
  const candidateId = proxy.params.get('candidateId') ?? undefined
  const resourceId = proxy.params.get('resourceId') ?? undefined
  const queryParams = useMemo(() => agentSurfaceParams(proxy.params, { projectId, contentUnitId, candidateId, resourceId }), [proxy.params, projectId, contentUnitId, candidateId, resourceId])
  const { data: snapshot, isLoading, error } = useQuery({
    queryKey: agentSurfaceKeys.snapshot('content-candidates', queryParams),
    queryFn: () => fetchAgentSurfaceSnapshot('content-candidates', queryParams),
    enabled: proxy.ready && Boolean(contentUnitId),
  })
  const previewResourceIds = useMemo(() => agentContentCandidateResourceIds(snapshot), [snapshot])
  const resourceQueries = useQueries({
    queries: previewResourceIds.map((id) => ({
      queryKey: agentSurfaceKeys.candidateResourcePreview(id),
      queryFn: () => api.get<RawResource>(`/resources/${id}`).then((result) => result.data),
      enabled: proxy.ready,
    })),
  })
  const resourcesById = useMemo(() => {
    const entries: Array<[number, RawResource]> = []
    resourceQueries.forEach((query, index) => {
      const id = previewResourceIds[index]
      if (id !== undefined && query.data) entries.push([id, query.data])
    })
    return new Map(entries)
  }, [previewResourceIds, resourceQueries])
  const decision = useMutation({
    mutationFn: (input: AgentCandidateDecisionInput) => postAgentSurfaceAction('content-candidates', 'decision', queryParams, {
      projectId,
      contentUnitId,
      candidateId: input.candidateId,
      decision: input.decision,
      ...(input.resourceId ? { resourceId: input.resourceId } : {}),
      metadata: {
        surface: 'agent_content_candidates',
        intent: 'review_candidates',
      },
    }),
    onSuccess: () => {
      invalidateAgentSurfaceQueries(queryClient, [
        'content-candidates',
        'content-prompt',
        'impact',
        'project-status',
        'preview-timeline',
      ])
    },
  })

  return (
    <AgentContentCandidatesSurface
      ready={proxy.ready}
      params={proxy.params}
      projectId={projectId}
      contentUnitId={contentUnitId}
      candidateId={candidateId}
      resourceId={resourceId}
      snapshot={snapshot}
      isLoading={isLoading}
      error={error}
      resourcesById={resourcesById}
      renderResourcePreview={(resource) => <MediaViewer resource={resource as RawResource} fit="contain" lightbox />}
      decisionPending={decision.isPending}
      decisionError={decision.error}
      decisionSuccess={decision.isSuccess}
      onDecide={(input) => decision.mutate(input)}
    />
  )
}
