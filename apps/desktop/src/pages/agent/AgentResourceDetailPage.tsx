import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MediaViewer } from '@movscript/resource-surface/resource-media-viewer'
import { api } from '@/shared/infrastructure/api'
import type { RawResource } from '@/types'
import { AgentResourceDetailSurface } from '@movscript/resource-surface/react'
import { useAgentMcpApiProxy } from './useAgentMcpApiProxy'

interface ResourceUsageSummary {
  resource_id: number
  jobs: Array<Record<string, unknown>>
  derivatives: Array<Record<string, unknown>>
  decisions: Array<Record<string, unknown>>
  counts: {
    jobs: number
    derivatives: number
    decisions: number
    total: number
  }
}

export default function AgentResourceDetailPage() {
  const routeParams = useParams()
  const proxy = useAgentMcpApiProxy()
  const resourceId = numberParam(routeParams.resourceId) ?? numberParam(proxy.params.get('resourceId'))

  const { data: resource, isLoading, error } = useQuery<RawResource | undefined>({
    queryKey: ['agent-surface', 'resource-detail', resourceId],
    queryFn: () => api.get<RawResource>(`/resources/${resourceId}`).then((result) => result.data),
    enabled: proxy.ready && resourceId !== undefined,
  })
  const { data: usages, isLoading: usagesLoading } = useQuery<ResourceUsageSummary>({
    queryKey: ['agent-surface', 'resource-usages', resourceId],
    queryFn: () => api.get<ResourceUsageSummary>(`/resources/${resourceId}/usages`).then((result) => result.data),
    enabled: proxy.ready && resourceId !== undefined,
  })

  return (
    <AgentResourceDetailSurface
      ready={proxy.ready}
      params={proxy.params}
      resourceId={resourceId}
      resource={resource as unknown as Record<string, unknown> | undefined}
      usages={usages as unknown as Record<string, unknown> | undefined}
      isLoading={isLoading}
      usagesLoading={usagesLoading}
      error={error}
      renderResourcePreview={(nextResource) => <MediaViewer resource={nextResource as RawResource} fit="contain" lightbox />}
    />
  )
}

function numberParam(value: string | undefined | null): number | undefined {
  if (!value) return undefined
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : undefined
}
