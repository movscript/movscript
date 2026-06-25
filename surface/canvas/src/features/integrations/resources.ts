import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { surfaceDataApi as api } from '@movscript/shared/surface-http'
import { toast } from '@movscript/ui/toast'
import { canvasResourceKeys } from '@movscript/resource-surface/data'
import {
  canvasResourceChangedResult,
  invalidateResourceMutationResult,
  resourceLibraryChangedResult,
} from '@movscript/resource-surface/data'
import type { NodeType, PaginatedResponse, RawResource } from '@movscript/shared'
import {
  canvasResourceMatchesSearch,
  fileToCanvasResourceNodeType as coreFileToCanvasResourceNodeType,
  resourceToCanvasNodeType,
} from '@movscript/core/canvas'

export function resourceToNodeType(resource: RawResource): NodeType | undefined {
  return resourceToCanvasNodeType(resource) as NodeType | undefined
}

export function resourceMatchesSearch(resource: RawResource, query: string) {
  return canvasResourceMatchesSearch(resource, query)
}

export function fileToCanvasResourceNodeType(file: Pick<File, 'name' | 'type'>): NodeType | undefined {
  return coreFileToCanvasResourceNodeType(file) as NodeType | undefined
}

export async function uploadCanvasResourceFile(file: File): Promise<RawResource> {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/resources/upload', fd).then((r) => r.data as RawResource)
}

export async function uploadCanvasTextResource(name: string, content: string): Promise<RawResource> {
  const trimmedName = name.trim() || 'canvas-text'
  const filename = trimmedName.toLowerCase().endsWith('.txt') ? trimmedName : `${trimmedName}.txt`
  const file = new File([content], filename, { type: 'text/plain' })
  return uploadCanvasResourceFile(file)
}

export function useCanvasResourceIntegration({
  removeFailedMessage,
}: {
  removeFailedMessage: string
}) {
  const qc = useQueryClient()
  const [removingRunResultResourceId, setRemovingRunResultResourceId] = useState<number>()

  const { data: nodeResourcePage } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: canvasResourceKeys.nodeResources,
    queryFn: () => api.get('/resources', { params: { page: 1, page_size: 200, type: 'image,video,text' } }).then((r) => r.data),
  })

  const nodeResources = nodeResourcePage?.items ?? []
  const nodeResourceById = useMemo(
    () => new Map(nodeResources.map((resource) => [resource.ID, resource])),
    [nodeResources],
  )

  const removeRunResultResource = useMutation({
    mutationFn: (resourceId: number) => api.delete(`/resources/${resourceId}`).then(() => resourceId),
    onMutate: (resourceId) => {
      setRemovingRunResultResourceId(resourceId)
    },
    onSuccess: (_, resourceId) => {
      invalidateResourceMutationResult(qc, resourceLibraryChangedResult({ changedIds: [resourceId] }))
      invalidateResourceMutationResult(qc, canvasResourceChangedResult({ changedIds: [resourceId] }))
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || removeFailedMessage)
    },
    onSettled: () => {
      setRemovingRunResultResourceId(undefined)
    },
  })

  return {
    nodeResources,
    nodeResourceById,
    removingRunResultResourceId,
    removeRunResultResource,
  }
}
