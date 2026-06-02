import {
  createSemanticEntity,
  semanticEntityConfig,
  updateSemanticEntity,
  type SemanticEntityConfig,
} from '@/shared/infrastructure/api/semanticEntities'
import { buildContentUnitWorkspacePatch, buildContentUnitReorderPatchTaskGraph, buildContentUnitTimelineMoveTaskGraph } from '@/features/content/domain/contentWorkbenchWriteModel'
import { apiErrorMessage } from '@/features/content/domain/contentWorkbenchStatus'
import type { ContentGenerationMomentRow, ContentWorkbenchRecord } from '@/features/content/domain/contentWorkbenchModel'
import type { ContentWorkbenchDropPosition } from '@/features/content/domain/contentWorkbenchTimeline'
import { workspaceEntityId } from '@/features/content/domain/contentWorkbenchWorkspaceReviewModel'
import { localAgentClient, type AgentWorkspace } from '@/shared/infrastructure/localAgentClient'
import { isRecord } from '@/shared/domain/jsonValue'
import { toast } from '@/shared/ui/toastStore'

export interface ContentWorkbenchMutationQueryClient {
  invalidateQueries: (input: { queryKey: readonly unknown[] | unknown[] }) => Promise<unknown>
}

export function buildRejectContentWorkspaceMutationOptions(input: {
  refetchWorkspaces: () => Promise<unknown>
  closeReview: () => void
}) {
  return {
    mutationFn: async (workspace: AgentWorkspace) => localAgentClient.rejectWorkspace(workspace.id, '用户在内容编排工作台退回该制作项草案'),
    onSuccess: async () => {
      toast.success('AI 草案已退回')
      await input.refetchWorkspaces()
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
  refetchWorkspaces: () => Promise<unknown>
  closeReview: () => void
}) {
  return {
    mutationFn: async (workspace: AgentWorkspace) => localAgentClient.updateWorkspace(workspace.id, {
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
      await input.refetchWorkspaces()
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
      return updateSemanticEntity(input.projectId, input.contentUnitConfig, unitId, buildContentUnitWorkspacePatch(current, workspace))
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
      await Promise.all(taskGraph.patches.map((patch) => updateSemanticEntity(input.projectId!, input.contentUnitConfig, patch.unitId, patch.payload)))
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
      if (taskGraph.kind === 'update_item') {
        await updateSemanticEntity(input.projectId, input.previewTimelineItemConfig, taskGraph.itemId, taskGraph.payload)
        return { unitId }
      }

      let timelineId = taskGraph.timelineId
      if (!timelineId) {
        const timeline = await createSemanticEntity(input.projectId, semanticEntityConfig('previewTimelines'), taskGraph.timelinePayload ?? {})
        timelineId = timeline.ID
      }
      await createSemanticEntity(input.projectId, input.previewTimelineItemConfig, {
        ...taskGraph.itemPayload,
        preview_timeline_id: timelineId,
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
