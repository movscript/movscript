import {
  createSemanticEntity,
  semanticEntityConfig,
  updateSemanticEntity,
  type SemanticEntityConfig,
} from '@/api/semanticEntities'
import { buildContentUnitProposalPatch, buildContentUnitReorderPatchPlan, buildContentUnitTimelineMovePlan } from '@/lib/contentWorkbenchWriteModel'
import { apiErrorMessage } from '@/lib/contentWorkbenchStatus'
import type { ContentGenerationMomentRow, ContentWorkbenchRecord } from '@/lib/contentWorkbenchModel'
import type { ContentWorkbenchDropPosition } from '@/lib/contentWorkbenchTimeline'
import { draftEntityId } from '@/lib/contentWorkbenchDraftReviewModel'
import { localAgentClient, type AgentDraft } from '@/lib/localAgentClient'
import { isRecord } from '@/lib/jsonValue'
import { toast } from '@/store/toastStore'

export interface ContentWorkbenchMutationQueryClient {
  invalidateQueries: (input: { queryKey: readonly unknown[] | unknown[] }) => Promise<unknown>
}

export function buildRejectContentDraftMutationOptions(input: {
  refetchDrafts: () => Promise<unknown>
  closeReview: () => void
}) {
  return {
    mutationFn: async (draft: AgentDraft) => localAgentClient.rejectDraft(draft.id, '用户在内容编排工作台退回该制作项草案'),
    onSuccess: async () => {
      toast.success('AI 草案已退回')
      await input.refetchDrafts()
      input.closeReview()
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, 'AI 草案退回失败'))
    },
  }
}

export function buildMarkContentDraftReviewedMutationOptions(input: {
  projectId?: number
  selectedMomentId?: number
  refetchDrafts: () => Promise<unknown>
  closeReview: () => void
}) {
  return {
    mutationFn: async (draft: AgentDraft) => localAgentClient.updateDraft(draft.id, {
      status: 'applied',
      target: {
        ...(isRecord(draft.target) ? draft.target : {}),
        projectId: input.projectId,
        entityType: 'scene_moment',
        entityId: input.selectedMomentId ?? draftEntityId(draft.target) ?? draftEntityId(draft.source),
        field: 'content_unit_proposal_review',
      },
      metadata: {
        ...(isRecord(draft.metadata) ? draft.metadata : {}),
        reviewedFrom: 'content-workbench',
        reviewedAt: new Date().toISOString(),
        backendWritePerformed: false,
        reviewDisposition: 'manual_review_completed',
      },
    }),
    onSuccess: async () => {
      toast.success('AI 草案已标记为处理完成')
      await input.refetchDrafts()
      input.closeReview()
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, 'AI 草案状态更新失败'))
    },
  }
}

export function buildApplyContentUnitProposalMutationOptions(input: {
  projectId?: number
  contentUnitConfig: SemanticEntityConfig
  contentUnits: ContentWorkbenchRecord[]
  queryClient: ContentWorkbenchMutationQueryClient
  productionWorkbenchQueryKey: readonly unknown[]
  selectContentUnit: (unitId: number) => void
  setOptimisticSelectedUnit: (unit: ContentWorkbenchRecord) => void
}) {
  return {
    mutationFn: async ({ unitId, proposal }: { unitId: number; proposal: Record<string, unknown> }) => {
      if (!input.projectId) throw new Error('缺少项目')
      const current = input.contentUnits.find((unit) => unit.ID === unitId)
      return updateSemanticEntity(input.projectId, input.contentUnitConfig, unitId, buildContentUnitProposalPatch(current, proposal))
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
      const plan = buildContentUnitReorderPatchPlan(row, draggedUnitId, targetUnitId, position)
      await Promise.all(plan.patches.map((patch) => updateSemanticEntity(input.projectId!, input.contentUnitConfig, patch.unitId, patch.payload)))
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
      const plan = buildContentUnitTimelineMovePlan({
        row,
        unitId,
        startSec,
        previewTimelines: input.previewTimelines,
      })
      if (plan.kind === 'update_item') {
        await updateSemanticEntity(input.projectId, input.previewTimelineItemConfig, plan.itemId, plan.payload)
        return { unitId }
      }

      let timelineId = plan.timelineId
      if (!timelineId) {
        const timeline = await createSemanticEntity(input.projectId, semanticEntityConfig('previewTimelines'), plan.timelinePayload ?? {})
        timelineId = timeline.ID
      }
      await createSemanticEntity(input.projectId, input.previewTimelineItemConfig, {
        ...plan.itemPayload,
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
