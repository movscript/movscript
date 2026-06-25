import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MediaViewer } from '@movscript/resource-surface/resource-media-viewer'
import { api } from '@/shared/infrastructure/api'
import type { Job, RawResource } from '@/types'
import { AgentGenerationJobSurface } from '@movscript/project-surface/react'
import { useAgentMcpApiProxy } from './useAgentMcpApiProxy'

export default function AgentGenerationJobPage() {
  const routeParams = useParams()
  const proxy = useAgentMcpApiProxy()
  const jobId = numberParam(routeParams.jobId) ?? numberParam(proxy.params.get('jobId'))
  const routeContentUnitId = proxy.params.get('contentUnitId') ?? undefined

  const { data: job, isLoading, error } = useQuery<Job>({
    queryKey: ['agent-surface', 'generation-job', jobId],
    queryFn: () => api.get<Job>(`/jobs/${jobId}`).then((result) => result.data),
    enabled: proxy.ready && jobId !== undefined,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'pending' || status === 'running' ? 3000 : false
    },
  })

  return (
    <AgentGenerationJobSurface
      ready={proxy.ready}
      params={proxy.params}
      jobId={jobId}
      routeContentUnitId={routeContentUnitId}
      job={job as unknown as Record<string, unknown> | undefined}
      isLoading={isLoading}
      error={error}
      renderResourcePreview={(resource) => <MediaViewer resource={resource as RawResource} fit="contain" lightbox />}
    />
  )
}

function numberParam(value: string | undefined | null): number | undefined {
  if (!value) return undefined
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : undefined
}
