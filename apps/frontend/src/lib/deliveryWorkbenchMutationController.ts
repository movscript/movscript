import {
  createDeliveryTimelineItem,
  createDeliveryVersion,
  createExportRecord,
  deleteDeliveryTimelineItem,
  updateDeliveryTimelineItem,
  type ContentUnit,
  type DeliveryTimelineItem,
  type DeliveryVersion,
  type PreviewTimelineItem,
} from '@/api/deliveryEntities'
import {
  deliveryKindFromContentUnit,
  deliveryKindFromPreviewItem,
  deliveryStatusFromPreviewItem,
  nullableDeliveryNumber,
  sumDeliverySourceTimelineDuration,
} from '@/lib/deliveryWorkbenchModel'

export interface DeliveryWorkbenchMutationQueryClient {
  invalidateQueries: (input: { queryKey: readonly unknown[] | unknown[] }) => Promise<unknown>
}

export async function createDeliveryTimelineItemsFromSource(input: {
  projectId?: number
  deliveryVersionId: number
  sourcePreviewTimelineItems: PreviewTimelineItem[]
  sourceContentUnits: ContentUnit[]
}) {
  if (!input.projectId) throw new Error('缺少项目')

  if (input.sourcePreviewTimelineItems.length > 0) {
    for (const [index, item] of input.sourcePreviewTimelineItems.entries()) {
      await createDeliveryTimelineItem(input.projectId, {
        delivery_version_id: input.deliveryVersionId,
        content_unit_id: nullableDeliveryNumber(item.content_unit_id),
        segment_id: nullableDeliveryNumber(item.segment_id),
        scene_moment_id: nullableDeliveryNumber(item.scene_moment_id),
        keyframe_id: nullableDeliveryNumber(item.keyframe_id),
        kind: deliveryKindFromPreviewItem(item.kind),
        order: item.order || index + 1,
        start_sec: Number.isFinite(item.start_sec) ? item.start_sec : index * 3,
        duration_sec: Math.max(0.5, Number(item.duration_sec) || 3),
        label: item.label || `预览片段 ${index + 1}`,
        status: deliveryStatusFromPreviewItem(item),
        metadata_json: item.metadata_json,
      })
    }
    return
  }

  let cursor = 0
  for (const [index, unit] of input.sourceContentUnits.entries()) {
    const duration = Math.max(0.5, Number(unit.duration_sec) || 3)
    await createDeliveryTimelineItem(input.projectId, {
      delivery_version_id: input.deliveryVersionId,
      content_unit_id: unit.ID,
      kind: deliveryKindFromContentUnit(unit.kind),
      order: index + 1,
      start_sec: cursor,
      duration_sec: duration,
      label: unit.title || `制作项 #${unit.ID}`,
      status: 'missing',
    })
    cursor += duration
  }
}

export function buildCreateDeliveryVersionFromProductionTimelineMutationOptions(input: {
  projectId?: number
  selectedProductionId: number | null
  sourcePreviewTimelineId: number | null
  versions: DeliveryVersion[]
  sourcePreviewTimelineItems: PreviewTimelineItem[]
  sourceContentUnits: ContentUnit[]
  queryClient: DeliveryWorkbenchMutationQueryClient
  versionKey: readonly unknown[]
  setSelectedVersionId: (id: number | null) => void
  setSelectedItemId: (id: number | null) => void
}) {
  return {
    mutationFn: async () => {
      if (!input.projectId) throw new Error('缺少项目')
      const version = await createDeliveryVersion(input.projectId, {
        production_id: input.selectedProductionId,
        preview_timeline_id: input.sourcePreviewTimelineId,
        name: `交付版本 ${input.versions.length + 1}`,
        status: 'draft',
        is_primary: input.versions.length === 0,
        duration_sec: sumDeliverySourceTimelineDuration(input.sourcePreviewTimelineItems, input.sourceContentUnits),
      })
      await createDeliveryTimelineItemsFromSource({
        projectId: input.projectId,
        deliveryVersionId: version.ID,
        sourcePreviewTimelineItems: input.sourcePreviewTimelineItems,
        sourceContentUnits: input.sourceContentUnits,
      })
      return version
    },
    onSuccess: async (version: DeliveryVersion) => {
      await input.queryClient.invalidateQueries({ queryKey: input.versionKey })
      await input.queryClient.invalidateQueries({ queryKey: ['semantic-delivery-timeline-items', input.projectId, version.ID] })
      input.setSelectedVersionId(version.ID)
      input.setSelectedItemId(null)
    },
  }
}

export function buildSeedDeliveryVersionFromProductionTimelineMutationOptions(input: {
  projectId?: number
  selectedVersionId: number | null
  sourcePreviewTimelineItems: PreviewTimelineItem[]
  sourceContentUnits: ContentUnit[]
  queryClient: DeliveryWorkbenchMutationQueryClient
  itemsKey: readonly unknown[]
}) {
  return {
    mutationFn: async () => {
      if (!input.selectedVersionId) return
      await createDeliveryTimelineItemsFromSource({
        projectId: input.projectId,
        deliveryVersionId: input.selectedVersionId,
        sourcePreviewTimelineItems: input.sourcePreviewTimelineItems,
        sourceContentUnits: input.sourceContentUnits,
      })
    },
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: input.itemsKey })
    },
  }
}

export function buildCreateDeliveryTimelineItemMutationOptions(input: {
  projectId?: number
  selectedVersionId: number | null
  timelineItems: DeliveryTimelineItem[]
  queryClient: DeliveryWorkbenchMutationQueryClient
  itemsKey: readonly unknown[]
  setSelectedItemId: (id: number | null) => void
  setEditingItem: (editing: boolean) => void
}) {
  return {
    mutationFn: () => {
      if (!input.projectId || !input.selectedVersionId) throw new Error('缺少交付版本')
      const last = input.timelineItems[input.timelineItems.length - 1]
      const nextStart = last ? last.start_sec + last.duration_sec : 0
      return createDeliveryTimelineItem(input.projectId, {
        delivery_version_id: input.selectedVersionId,
        kind: 'video',
        order: last ? last.order + 1 : 1,
        start_sec: nextStart,
        duration_sec: 3,
        label: `成片片段 ${input.timelineItems.length + 1}`,
        status: 'missing',
      })
    },
    onSuccess: async (item: DeliveryTimelineItem) => {
      await input.queryClient.invalidateQueries({ queryKey: input.itemsKey })
      input.setSelectedItemId(item.ID)
      input.setEditingItem(true)
    },
  }
}

export function buildUpdateDeliveryTimelineItemMutationOptions(input: {
  projectId?: number
  selectedVersionId: number | null
  queryClient: DeliveryWorkbenchMutationQueryClient
  itemsKey: readonly unknown[]
}) {
  return {
    mutationFn: ({ id, payload }: { id: number; payload: Partial<DeliveryTimelineItem> }) => {
      if (!input.projectId || !input.selectedVersionId) throw new Error('缺少交付版本')
      return updateDeliveryTimelineItem(input.projectId, id, {
        ...payload,
        delivery_version_id: input.selectedVersionId,
      })
    },
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: input.itemsKey })
    },
  }
}

export function buildRemoveDeliveryTimelineItemMutationOptions(input: {
  projectId?: number
  queryClient: DeliveryWorkbenchMutationQueryClient
  itemsKey: readonly unknown[]
  setSelectedItemId: (id: number | null) => void
}) {
  return {
    mutationFn: (id: number) => {
      if (!input.projectId) throw new Error('缺少项目')
      return deleteDeliveryTimelineItem(input.projectId, id)
    },
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: input.itemsKey })
      input.setSelectedItemId(null)
    },
  }
}

export function buildCreateExportRecordMutationOptions(input: {
  projectId?: number
  selectedVersionId: number | null
  queryClient: DeliveryWorkbenchMutationQueryClient
  exportsKey: readonly unknown[]
}) {
  return {
    mutationFn: () => {
      if (!input.projectId || !input.selectedVersionId) throw new Error('缺少交付版本')
      return createExportRecord(input.projectId, {
        delivery_version_id: input.selectedVersionId,
        status: 'pending',
        format: 'mp4',
        preset: '1080p',
      })
    },
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: input.exportsKey })
    },
  }
}
