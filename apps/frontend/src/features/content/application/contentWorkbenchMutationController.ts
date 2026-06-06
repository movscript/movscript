import {
  type SemanticEntityConfig,
} from '@/shared/infrastructure/api/semanticEntities'
import { buildContentUnitWorkspacePatch, buildContentUnitReorderPatchTaskGraph, buildContentUnitTimelineMoveTaskGraph } from '@/features/content/domain/contentWorkbenchWriteModel'
import {
  reorderContentUnitsWorkspaceEdit,
  saveContentUnitTimingWorkspaceEdit,
  saveContentUnitWorkspaceEdit,
} from '@/features/content/application/contentUnitWorkspaceRepository'
import { apiErrorMessage } from '@/features/content/domain/contentWorkbenchStatus'
import type { ContentGenerationMomentRow, ContentWorkbenchRecord } from '@/features/content/domain/contentWorkbenchModel'
import type { ContentWorkbenchDropPosition } from '@/features/content/domain/contentWorkbenchTimeline'
import { workspaceEntityId } from '@/features/content/domain/contentWorkbenchWorkspaceReviewModel'
import { providerSessionClient, type WorkspaceArtifact } from '@/shared/infrastructure/providerSessionClient'
import { isRecord } from '@/shared/domain/jsonValue'
import { toast } from '@/shared/ui/toastStore'

export interface ContentWorkbenchMutationQueryClient {
  invalidateQueries: (input: { queryKey: readonly unknown[] | unknown[] }) => Promise<unknown>
}

export function buildRejectContentWorkspaceMutationOptions(input: {
  refetchWorkspaceArtifacts?: () => Promise<unknown>
  /** @deprecated Use refetchWorkspaceArtifacts. */
  refetchWorkspaces?: () => Promise<unknown>
  closeReview: () => void
}) {
  return {
    mutationFn: async (workspace: WorkspaceArtifact) => providerSessionClient.rejectWorkspaceArtifact(workspace.id, '用户在内容编排工作台退回该制作项草案'),
    onSuccess: async () => {
      toast.success('AI 草案已退回')
      await (input.refetchWorkspaceArtifacts ?? input.refetchWorkspaces)?.()
      input.closeReview()
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, 'AI 草案退回失败'))
    },
  }
}

export function buildMarkContentWorkspaceReviewedMutationOptions(input: {
  projectId?: number
  selectedMomentId?: number
  refetchWorkspaceArtifacts?: () => Promise<unknown>
  /** @deprecated Use refetchWorkspaceArtifacts. */
  refetchWorkspaces?: () => Promise<unknown>
  closeReview: () => void
}) {
  return {
    mutationFn: async (workspace: WorkspaceArtifact) => providerSessionClient.updateWorkspaceArtifact(workspace.id, {
      status: 'applied',
      target: {
        ...(isRecord(workspace.target) ? workspace.target : {}),
        projectId: input.projectId,
        entityType: 'scene_moment',
        entityId: input.selectedMomentId ?? workspaceEntityId(workspace.target) ?? workspaceEntityId(workspace.source),
        field: 'content_unit_workspace_review',
      },
      metadata: {
        ...(isRecord(workspace.metadata) ? workspace.metadata : {}),
        reviewedFrom: 'content-workbench',
        reviewedAt: new Date().toISOString(),
        backendWritePerformed: false,
        reviewDisposition: 'manual_review_completed',
      },
    }),
    onSuccess: async () => {
      toast.success('AI 草案已标记为处理完成')
      await (input.refetchWorkspaceArtifacts ?? input.refetchWorkspaces)?.()
      input.closeReview()
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, 'AI 草案状态更新失败'))
    },
  }
}

export function buildApplyContentUnitWorkspaceMutationOptions(input: {
  projectId?: number
  contentUnitConfig: SemanticEntityConfig
  contentUnits: ContentWorkbenchRecord[]
  queryClient: ContentWorkbenchMutationQueryClient
  productionWorkbenchQueryKey: readonly unknown[]
  selectContentUnit: (unitId: number) => void
  setOptimisticSelectedUnit: (unit: ContentWorkbenchRecord) => void
}) {
  return {
    mutationFn: async ({ unitId, workspace }: { unitId: number; workspace: Record<string, unknown> }) => {
      if (!input.projectId) throw new Error('缺少项目')
      const current = input.contentUnits.find((unit) => unit.ID === unitId)
      if (!current) throw new Error('未找到制作项')
      return saveContentUnitWorkspaceEdit(input.projectId, current, buildContentUnitWorkspacePatch(current, workspace)) as Promise<ContentWorkbenchRecord>
    },
    onSuccess: async (saved: ContentWorkbenchRecord) => {
      input.selectContentUnit(saved.ID)
      input.setOptimisticSelectedUnit(saved)
      await input.queryClient.invalidateQueries({ queryKey: input.productionWorkbenchQueryKey })
      await input.queryClient.invalidateQueries({ queryKey: [input.contentUnitConfig.kind, input.projectId] })
      toast.success('已采纳草案字段')
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, '采纳草案失败'))
    },
  }
}

export function buildReorderContentUnitsMutationOptions(input: {
  projectId?: number
  contentUnitConfig: SemanticEntityConfig
  queryClient: ContentWorkbenchMutationQueryClient
  productionWorkbenchQueryKey: readonly unknown[]
  selectContentUnitFromRow: (row: ContentGenerationMomentRow, unitId: number) => void
}) {
  return {
    mutationFn: async ({ row, draggedUnitId, targetUnitId, position }: {
      row: ContentGenerationMomentRow
      draggedUnitId: number
      targetUnitId: number
      position: ContentWorkbenchDropPosition
    }) => {
      if (!input.projectId) throw new Error('请先选择项目')
      const taskGraph = buildContentUnitReorderPatchTaskGraph(row, draggedUnitId, targetUnitId, position)
      await reorderContentUnitsWorkspaceEdit(input.projectId, row.units, row.keyframes, taskGraph.patches.map((patch) => ({
        unitId: patch.unitId,
        order: Number(patch.payload.order),
      })))
      return { draggedUnitId }
    },
    onSuccess: async (_data: { draggedUnitId: number }, variables: {
      row: ContentGenerationMomentRow
      draggedUnitId: number
    }) => {
      await input.queryClient.invalidateQueries({ queryKey: input.productionWorkbenchQueryKey })
      input.selectContentUnitFromRow(variables.row, variables.draggedUnitId)
      toast.success('制作项顺序已更新')
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, '制作项顺序更新失败'))
    },
  }
}

export function buildMoveContentUnitOnTimelineMutationOptions(input: {
  projectId?: number
  previewTimelineItemConfig: SemanticEntityConfig
  previewTimelines: ContentWorkbenchRecord[]
  queryClient: ContentWorkbenchMutationQueryClient
  productionWorkbenchQueryKey: readonly unknown[]
  selectContentUnit: (unitId: number) => void
}) {
  return {
    mutationFn: async ({ row, unitId, startSec }: {
      row: ContentGenerationMomentRow
      unitId: number
      startSec: number
    }) => {
      if (!input.projectId) throw new Error('请先选择项目')
      const taskGraph = buildContentUnitTimelineMoveTaskGraph({
        row,
        unitId,
        startSec,
        previewTimelines: input.previewTimelines,
      })
      const unit = row.units.find((item) => item.ID === unitId)
      if (!unit) throw new Error('未找到制作项')
      const timingPayload = taskGraph.kind === 'update_item' ? taskGraph.payload : taskGraph.itemPayload
      await saveContentUnitTimingWorkspaceEdit(input.projectId, unit, row.keyframes.filter((keyframe) => Number(keyframe.content_unit_id) === unitId), {
        localStartSec: Number(timingPayload.start_sec),
        localDurationSec: Number(timingPayload.duration_sec),
        order: Number(timingPayload.order),
      })
      return { unitId }
    },
    onSuccess: async (_data: { unitId: number }, variables: { unitId: number }) => {
      await input.queryClient.invalidateQueries({ queryKey: input.productionWorkbenchQueryKey })
      input.selectContentUnit(variables.unitId)
      toast.success('制作项时间已更新')
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, '制作项时间更新失败'))
    },
  }
}
