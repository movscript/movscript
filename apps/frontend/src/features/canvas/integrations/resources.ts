import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { invalidateAssetCandidateConsumers } from '@/lib/assetCandidateQueryInvalidation'
import { toast } from '@/store/toastStore'
import type { Canvas, NodeType, PaginatedResponse, RawResource, ResourceBinding } from '@/types'

export interface CanvasPushTarget {
  kind: 'asset_slot'
  id: number
  label: string
}

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

  async function pushResource(target: CanvasPushTarget, resourceId: number) {
    if (!canvas?.project_id) return
    if (target.kind === 'asset_slot') {
      await api.post(`/projects/${canvas.project_id}/entities/asset-slot-candidates`, {
        asset_slot_id: target.id,
        resource_id: resourceId,
        source_type: 'canvas',
        source_id: Number(canvas.ID),
        status: 'candidate',
        note: `由 Canvas 推送加入候选：${target.label}`,
      })
      toast.success('已加入素材候选')
      invalidateAssetCandidateConsumers(qc, canvas.project_id)
      qc.invalidateQueries({ queryKey: ['canvas-resource-shelf', 'asset-slots', canvas.project_id] })
    }
  }

  return {
    dependencyBindings,
    nodeResources,
    nodeResourceById,
    removingRunResultResourceId,
    removeRunResultResource,
    pushResource,
  }
}
