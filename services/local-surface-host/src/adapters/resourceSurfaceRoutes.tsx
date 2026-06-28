import { useMemo } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import {
  AgentResourceDetailSurface,
  AgentResourceLibrarySurface,
  type AgentResourceLibraryRenderProps,
} from '@movscript/resource-surface/react'
import { ResourceLibraryView } from '@movscript/resource-surface/pages'

const localDataAPI = axios.create({
  baseURL: '/api/v1',
})

interface LocalRawResource {
  ID: number
  type: 'image' | 'video' | 'audio' | 'text' | 'file' | string
  name: string
  url: string
  size?: number
  mime_type?: string
}

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

export function LocalAgentResourceLibraryRoute() {
  const params = useLocalAgentSurfaceParams()

  return (
    <AgentResourceLibrarySurface
      ready
      params={params}
      renderLibrary={(props: AgentResourceLibraryRenderProps) => (
        <ResourceLibraryView
          variant="page"
          initialSearch={props.initialSearch}
          initialType={props.initialType}
          initialScope={props.initialScope}
          focusResourceId={props.focusResourceId}
          agentReferenceActions={props.agentReferenceActions}
        />
      )}
    />
  )
}

export function LocalAgentResourceDetailRoute() {
  const routeParams = useParams()
  const params = useLocalAgentSurfaceParams()
  const resourceId = numberParam(routeParams.resourceId) ?? numberParam(params.get('resourceId'))

  const { data: resource, isLoading, error } = useQuery<LocalRawResource | undefined>({
    queryKey: ['local-agent-surface', 'resource-detail', resourceId],
    queryFn: () => localDataAPI.get<LocalRawResource>(`/resources/${resourceId}`).then((result) => result.data),
    enabled: resourceId !== undefined,
  })
  const { data: usages, isLoading: usagesLoading } = useQuery<ResourceUsageSummary>({
    queryKey: ['local-agent-surface', 'resource-usages', resourceId],
    queryFn: () => localDataAPI.get<ResourceUsageSummary>(`/resources/${resourceId}/usages`).then((result) => result.data),
    enabled: resourceId !== undefined,
  })

  return (
    <AgentResourceDetailSurface
      ready
      params={params}
      resourceId={resourceId}
      resource={resource as unknown as Record<string, unknown> | undefined}
      usages={usages as unknown as Record<string, unknown> | undefined}
      isLoading={isLoading}
      usagesLoading={usagesLoading}
      error={error}
      renderResourcePreview={(nextResource) => (
        <LocalResourcePreview resource={nextResource as LocalRawResource} />
      )}
    />
  )
}

function LocalResourcePreview({ resource }: { resource: LocalRawResource }) {
  const url = localResourceURL(resource.url)
  const label = resource.name || `Resource #${resource.ID}`

  if (resource.type === 'image') {
    return <img className="local-resource-preview" src={url} alt={label} loading="lazy" />
  }
  if (resource.type === 'video') {
    return <video className="local-resource-preview" src={url} controls playsInline preload="metadata" />
  }
  if (resource.type === 'audio') {
    return <audio className="local-resource-preview local-resource-preview--audio" src={url} controls />
  }
  return (
    <a className="agent-surface-link" href={url} target="_blank" rel="noreferrer">
      {label}
    </a>
  )
}

function localResourceURL(url: string): string {
  if (/^https?:\/\//.test(url) || url.startsWith('blob:') || url.startsWith('data:')) return url
  if (url.startsWith('/')) return url
  return url
}

function useLocalAgentSurfaceParams(): URLSearchParams {
  const location = useLocation()
  return useMemo(() => new URLSearchParams(location.search), [location.search])
}

function numberParam(value: string | undefined | null): number | undefined {
  if (!value) return undefined
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : undefined
}
