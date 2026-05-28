import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/shared/infrastructure/api'
import { toast } from '@/shared/ui/toastStore'
import type { Canvas, NodeType, PaginatedResponse, RawResource, ResourceBinding } from '@/types'

export function resourceToNodeType(resource: RawResource): NodeType | undefined {
  if (resource.type === 'image' || resource.type === 'video' || resource.type === 'text') {
    return resource.type
  }
  return undefined
}

export function resourceMatchesSearch(resource: RawResource, query: string) {
  const term = query.trim().toLowerCase()
  if (!term) return true
  return [resource.ID, resource.name, resource.type, resource.mime_type]
    .some((value) => String(value ?? '').toLowerCase().includes(term))
}

export function fileToCanvasResourceNodeType(file: Pick<File, 'name' | 'type'>): NodeType | undefined {
  const mime = file.type.toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('text/')) return 'text'
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'heif'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return 'video'
  if (['txt', 'md', 'json', 'csv', 'ts', 'tsx', 'js', 'jsx', 'css', 'html', 'xml', 'yaml', 'yml', 'log'].includes(ext)) return 'text'
  return undefined
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
  canvas,
  canvasId,
  removeFailedMessage,
}: {
  canvas?: Canvas
  canvasId: string
  removeFailedMessage: string
}) {
  const qc = useQueryClient()
  const [removingRunResultResourceId, setRemovingRunResultResourceId] = useState<number>()

  const { data: dependencyBindings = [] } = useQuery<ResourceBinding[]>({
    queryKey: ['canvas-dependencies', canvas?.project_id, canvasId],
    queryFn: () => api.get(`/projects/${canvas!.project_id}/resource-bindings`, {
      params: {
        owner_type: 'canvas',
        owner_id: canvasId,
      },
    }).then((r) => r.data),
    enabled: !!canvas?.project_id && !!canvasId,
  })

  const { data: nodeResourcePage } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['canvas-node-resources'],
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources'] })
      qc.invalidateQueries({ queryKey: ['canvas-resource-shelf', 'resources'] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || removeFailedMessage)
    },
    onSettled: () => {
      setRemovingRunResultResourceId(undefined)
    },
  })

  return {
    dependencyBindings,
    nodeResources,
    nodeResourceById,
    removingRunResultResourceId,
    removeRunResultResource,
  }
}
