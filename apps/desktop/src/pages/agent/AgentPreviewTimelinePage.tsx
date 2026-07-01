import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { MediaViewer } from '@movscript/resource-surface/resource-media-viewer'
import { api } from '@/shared/infrastructure/api'
import type { RawResource } from '@/types'
import { AgentPreviewTimelineSurface, agentPreviewTimelineResourceIds } from '@movscript/project-surface/react'
import { useAgentMcpApiProxy } from './useAgentMcpApiProxy'
import { agentSurfaceKeys, agentSurfaceParams, fetchAgentSurfaceSnapshot } from './agentSurfaceData'

export default function AgentPreviewTimelinePage() {
  const proxy = useAgentMcpApiProxy()
  const projectId = proxy.params.get('projectId') ?? undefined
  const productionId = proxy.params.get('productionId') ?? proxy.params.get('production_id') ?? undefined
  const queryParams = useMemo(() => agentSurfaceParams(proxy.params, { projectId, productionId }), [proxy.params, projectId, productionId])
  const timelineScopeId = String(queryParams.productionId ?? queryParams.production_id ?? productionId ?? '') || undefined
  const { data: snapshot, isLoading, error } = useQuery({
    queryKey: agentSurfaceKeys.snapshot('preview-timeline', queryParams),
    queryFn: () => fetchAgentSurfaceSnapshot('preview-timeline', queryParams),
    enabled: proxy.ready && Boolean(timelineScopeId),
  })
  const previewResourceIds = useMemo(() => agentPreviewTimelineResourceIds(snapshot), [snapshot])
  const resourceQueries = useQueries({
    queries: previewResourceIds.map((id) => ({
      queryKey: agentSurfaceKeys.timelineResourcePreview(id),
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

  return (
    <AgentPreviewTimelineSurface
      ready={proxy.ready}
      params={proxy.params}
      projectId={projectId}
      productionId={timelineScopeId}
      snapshot={snapshot}
      isLoading={isLoading}
      error={error}
      resourcesById={resourcesById}
      renderResourcePreview={(resource) => <MediaViewer resource={resource as RawResource} fit="contain" lightbox />}
    />
  )
}
