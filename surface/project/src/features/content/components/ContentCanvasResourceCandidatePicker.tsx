import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { resourceKeys } from '@movscript/resource-surface/data'
import { surfaceDataApi as api } from '@movscript/shared/surface-http'
import { ResourceLibraryPicker, type ResourceTypeFilter } from '@movscript/resource-surface/resource-library-picker'
import type { RawResource } from '@movscript/shared'
import type { ContentCanvasUploadedResource } from '../application/contentCanvasWorkspaceGateway'
import type { NodeMediaKind } from './contentCanvasWorkspaceNodeModel'

const PAGE_SIZE = 12

export function ContentCanvasResourceCandidatePicker({
  mediaKind,
  onSelect,
}: {
  mediaKind: NodeMediaKind
  onSelect: (resource: ContentCanvasUploadedResource) => void
}) {
  const [search, setSearch] = useState('')
  const [type, setType] = useState<ResourceTypeFilter>(() => resourceTypeForMediaKind(mediaKind))
  const [page, setPage] = useState(1)
  const typeOptions = useMemo(() => resourceTypeOptionsForMediaKind(mediaKind), [mediaKind])
  const query = useQuery({
    queryKey: resourceKeys.contentWorkspaceCandidates({ search, type, page }),
    queryFn: () => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('page_size', String(PAGE_SIZE))
      if (search.trim()) params.set('search', search.trim())
      if (type !== 'all') params.set('type', type)
      return api.get(`/resources?${params}`).then((response) => response.data as { items?: RawResource[]; total?: number })
    },
    staleTime: 20_000,
  })
  const resources = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <ResourceLibraryPicker
      resources={resources}
      selectedResource={null}
      search={search}
      type={type}
      page={page}
      pageCount={pageCount}
      total={total}
      isLoading={query.isLoading || query.isFetching}
      typeOptions={typeOptions}
      className="content-canvas-resource-candidate-picker"
      listClassName="content-canvas-resource-candidate-picker__list"
      onSearch={(value) => {
        setSearch(value)
        setPage(1)
      }}
      onType={(value) => {
        setType(value)
        setPage(1)
      }}
      onPage={setPage}
      onSelect={(resource) => onSelect(contentCanvasResourceFromRawResource(resource))}
    />
  )
}

function contentCanvasResourceFromRawResource(resource: RawResource): ContentCanvasUploadedResource {
  return {
    id: resource.ID,
    name: resource.name,
    type: resource.type,
    mimeType: resource.mime_type,
  }
}

function resourceTypeForMediaKind(kind: NodeMediaKind): ResourceTypeFilter {
  if (kind === 'image' || kind === 'board' || kind === 'keyframe') return 'image'
  if (kind === 'video' || kind === 'scene') return 'video'
  if (kind === 'audio') return 'audio'
  if (kind === 'text') return 'text'
  return 'all'
}

function resourceTypeOptionsForMediaKind(kind: NodeMediaKind): ResourceTypeFilter[] {
  const type = resourceTypeForMediaKind(kind)
  return type === 'all' ? ['all', 'image', 'video', 'audio', 'text', 'file'] : [type, 'all']
}
