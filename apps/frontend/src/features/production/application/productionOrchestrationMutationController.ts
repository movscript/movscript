import {
  createSemanticEntity,
  semanticEntityConfig,
  updateSemanticEntity,
  type SemanticEntityPayload,
} from '@/shared/infrastructure/api/semanticEntities'
import type { ScriptVersion } from '@/shared/infrastructure/api/scriptVersions'
import { translateApiError, type APIErrorBody } from '@/shared/infrastructure/apiError'
import { isRecord } from '@/shared/domain/jsonValue'
import { inferScriptBlockKind, scriptBlockContentFromLines } from '@/features/production/domain/productionScriptBlocks'
import {
  type ProductionWritingExpressionEditTarget,
  type ProductionWritingExpressionSavePayload,
} from '@/features/production/domain/productionWritingExpressions'
import type { SettingRecord, SceneMomentRecord, ScriptBlockRecord, SegmentRecord } from '@/features/production/domain/productionOrchestrationData'
import {
  buildProductionSceneMomentReorderPatches,
  buildProductionSegmentReorderPatches,
  type ProductionOrchestrationDropPosition,
} from '@/features/production/domain/productionOrchestrationWorkspaceModel'
import {
  createProductionWritingExpressionWorkspaceProjection,
  deleteProductionSceneMomentWorkspaceProjection,
  deleteProductionSegmentWorkspaceProjection,
  deleteProductionWritingExpressionWorkspaceProjection,
  linkProductionSceneMomentReferenceWorkspaceProjection,
  saveProductionSceneMomentOrderWorkspaceProjection,
  saveProductionSceneMomentWorkspaceProjection,
  saveProductionSegmentOrderWorkspaceProjection,
  saveProductionSegmentWorkspaceProjection,
  saveProductionWritingExpressionWorkspaceProjection,
  unlinkProductionSceneMomentReferenceWorkspaceProjection,
  type ProductionWorkspaceSnapshot,
} from '@/features/production/application/productionWorkspaceRepository'
import { toast } from '@/shared/ui/toastStore'

export interface ProductionOrchestrationMutationQueryClient {
  invalidateQueries: (input: { queryKey: readonly unknown[] | unknown[] }) => Promise<unknown>
}

export interface ProductionOrchestrationMutationBaseInput {
  projectId?: number
  queryClient: ProductionOrchestrationMutationQueryClient
  queryKey: readonly unknown[]
  refetch: () => Promise<unknown>
}

function productionMutationErrorMessage(error: unknown, fallback: string) {
  const apiErrorData = (error as { response?: { data?: unknown } })?.response?.data
  const responseData = isRecord(apiErrorData) ? apiErrorData as APIErrorBody : null
  return responseData ? translateApiError(responseData, 'common.requestFailed') : error instanceof Error ? error.message : fallback
}

function refreshProductionOrchestration(input: ProductionOrchestrationMutationBaseInput) {
  void input.refetch()
  void input.queryClient.invalidateQueries({ queryKey: input.queryKey })
}

export function buildBindProductionScriptVersionMutationOptions(input: ProductionOrchestrationMutationBaseInput & {
  scriptVersionsQueryKey: readonly unknown[]
}) {
  return {
    mutationFn: async ({ productionId, scriptVersionId }: { productionId: number; scriptVersionId: number | null }) => {
      if (!input.projectId || !productionId) throw new Error('请先选择制作')
      return updateSemanticEntity(input.projectId, semanticEntityConfig('productions'), productionId, {
        script_version_id: scriptVersionId,
        source_type: scriptVersionId ? 'script' : 'direct',
      })
    },
    onSuccess: () => {
      toast.success('制作剧本已更新')
      void input.refetch()
      void input.queryClient.invalidateQueries({ queryKey: input.queryKey })
      void input.queryClient.invalidateQueries({ queryKey: input.scriptVersionsQueryKey })
    },
    onError: (error: unknown) => {
      toast.error(productionMutationErrorMessage(error, '绑定剧本失败'))
    },
  }
}

export function buildBindSceneMomentScriptBlockMutationOptions(input: ProductionOrchestrationMutationBaseInput) {
  return {
    mutationFn: async ({ momentId, scriptBlockId }: { momentId: number; scriptBlockId: number | null }) => {
      if (!input.projectId) throw new Error('请先选择项目')
      return updateSemanticEntity(input.projectId, semanticEntityConfig('sceneMoments'), momentId, {
        script_block_id: scriptBlockId ?? null,
      })
    },
    onSuccess: () => {
      toast.success('当前情节参考已更新')
      refreshProductionOrchestration(input)
    },
    onError: (error: unknown) => {
      toast.error(productionMutationErrorMessage(error, '绑定情节参考失败'))
    },
  }
}

export function buildCreateAndBindSceneMomentScriptBlockMutationOptions(input: ProductionOrchestrationMutationBaseInput & {
  selectedScriptVersion: ScriptVersion | null
  scriptSourceText: string
  scriptBlocks: ScriptBlockRecord[]
}) {
  return {
    mutationFn: async ({ momentId, startLine, endLine }: { momentId: number; startLine: number; endLine: number }) => {
      if (!input.projectId) throw new Error('请先选择项目')
      if (!input.selectedScriptVersion) throw new Error('请先绑定制作剧本')
      const content = scriptBlockContentFromLines(input.scriptSourceText, startLine, endLine)
      if (!content.trim()) throw new Error('请选择有正文的剧本范围')
      const blocksForVersion = input.scriptBlocks.filter((block) => Number(block.script_version_id) === input.selectedScriptVersion?.ID)
      const inferred = inferScriptBlockKind(content)
      const block = await createSemanticEntity(input.projectId, semanticEntityConfig('scriptBlocks'), {
        script_id: input.selectedScriptVersion.script_id,
        script_version_id: input.selectedScriptVersion.ID,
        order: blocksForVersion.length + 1,
        kind: inferred.kind,
        speaker: inferred.speaker,
        content,
        start_line: startLine,
        end_line: endLine,
        start_char: 0,
        end_char: 0,
        status: 'active',
      }) as ScriptBlockRecord
      await updateSemanticEntity(input.projectId, semanticEntityConfig('sceneMoments'), momentId, {
        script_block_id: block.ID,
      })
      return block
    },
    onSuccess: () => {
      toast.success('剧本块已创建并绑定')
      refreshProductionOrchestration(input)
    },
    onError: (error: unknown) => {
      toast.error(productionMutationErrorMessage(error, '创建剧本块失败'))
    },
  }
}

export function buildUpdateSegmentMutationOptions(input: ProductionOrchestrationMutationBaseInput) {
  return {
    mutationFn: async ({ productionId, currentSnapshot, segmentId, payload }: {
      productionId: number
      currentSnapshot: ProductionWorkspaceSnapshot
      segmentId: number
      payload: SemanticEntityPayload
    }) => {
      if (!input.projectId) throw new Error('请先选择项目')
      return saveProductionSegmentWorkspaceProjection({ projectId: input.projectId, productionId, currentSnapshot, segmentId, payload })
    },
    onSuccess: () => {
      toast.success('编排段已更新')
      refreshProductionOrchestration(input)
    },
    onError: (error: unknown) => {
      toast.error(productionMutationErrorMessage(error, '保存编排段失败'))
    },
  }
}

export function buildDeleteSegmentMutationOptions(input: ProductionOrchestrationMutationBaseInput) {
  return {
    mutationFn: async ({ productionId, currentSnapshot, segmentId }: {
      productionId: number
      currentSnapshot: ProductionWorkspaceSnapshot
      segmentId: number
    }) => {
      if (!input.projectId) throw new Error('请先选择项目')
      return deleteProductionSegmentWorkspaceProjection({ projectId: input.projectId, productionId, currentSnapshot, segmentId })
    },
    onSuccess: () => {
      toast.success('编排段已删除')
      refreshProductionOrchestration(input)
    },
    onError: (error: unknown) => {
      toast.error(productionMutationErrorMessage(error, '删除编排段失败'))
    },
  }
}

export function buildReorderProductionSegmentsMutationOptions(input: ProductionOrchestrationMutationBaseInput) {
  return {
    mutationFn: async ({ productionId, currentSnapshot, segments, draggedSegmentId, targetSegmentId, position }: {
      productionId: number
      currentSnapshot: ProductionWorkspaceSnapshot
      segments: SegmentRecord[]
      draggedSegmentId: number
      targetSegmentId: number
      position: ProductionOrchestrationDropPosition
    }) => {
      if (!input.projectId) throw new Error('请先选择项目')
      const patches = buildProductionSegmentReorderPatches(segments, draggedSegmentId, targetSegmentId, position)
      await saveProductionSegmentOrderWorkspaceProjection({ projectId: input.projectId, productionId, currentSnapshot, patches })
      return { draggedSegmentId }
    },
    onSuccess: () => {
      toast.success('编排段顺序已更新')
      refreshProductionOrchestration(input)
    },
    onError: (error: unknown) => {
      toast.error(productionMutationErrorMessage(error, '编排段顺序更新失败'))
    },
  }
}

export function buildUpdateSceneMomentMutationOptions(input: ProductionOrchestrationMutationBaseInput) {
  return {
    mutationFn: async ({ productionId, currentSnapshot, momentId, payload }: {
      productionId: number
      currentSnapshot: ProductionWorkspaceSnapshot
      momentId: number
      payload: SemanticEntityPayload
    }) => {
      if (!input.projectId) throw new Error('请先选择项目')
      return saveProductionSceneMomentWorkspaceProjection({ projectId: input.projectId, productionId, currentSnapshot, momentId, payload })
    },
    onSuccess: () => {
      toast.success('情节已更新')
      refreshProductionOrchestration(input)
    },
    onError: (error: unknown) => {
      toast.error(productionMutationErrorMessage(error, '保存情节失败'))
    },
  }
}

export function buildReorderProductionSceneMomentsMutationOptions(input: ProductionOrchestrationMutationBaseInput) {
  return {
    mutationFn: async ({ productionId, currentSnapshot, sceneMoments, draggedMomentId, targetSegmentId, targetMomentId, position }: {
      productionId: number
      currentSnapshot: ProductionWorkspaceSnapshot
      sceneMoments: SceneMomentRecord[]
      draggedMomentId: number
      targetSegmentId: number
      targetMomentId?: number | null
      position?: ProductionOrchestrationDropPosition
    }) => {
      if (!input.projectId) throw new Error('请先选择项目')
      const patches = buildProductionSceneMomentReorderPatches({
        sceneMoments,
        draggedMomentId,
        targetSegmentId,
        targetMomentId,
        position,
      })
      await saveProductionSceneMomentOrderWorkspaceProjection({ projectId: input.projectId, productionId, currentSnapshot, patches })
      return { draggedMomentId }
    },
    onSuccess: () => {
      toast.success('情节顺序已更新')
      refreshProductionOrchestration(input)
    },
    onError: (error: unknown) => {
      toast.error(productionMutationErrorMessage(error, '情节顺序更新失败'))
    },
  }
}

export function buildDeleteSceneMomentMutationOptions(input: ProductionOrchestrationMutationBaseInput) {
  return {
    mutationFn: async ({ productionId, currentSnapshot, momentId }: {
      productionId: number
      currentSnapshot: ProductionWorkspaceSnapshot
      momentId: number
    }) => {
      if (!input.projectId) throw new Error('请先选择项目')
      return deleteProductionSceneMomentWorkspaceProjection({ projectId: input.projectId, productionId, currentSnapshot, momentId })
    },
    onSuccess: () => {
      toast.success('情节已删除')
      refreshProductionOrchestration(input)
    },
    onError: (error: unknown) => {
      toast.error(productionMutationErrorMessage(error, '删除情节失败'))
    },
  }
}

export function buildLinkSceneMomentReferenceMutationOptions(input: ProductionOrchestrationMutationBaseInput) {
  return {
    mutationFn: async ({ productionId, currentSnapshot, momentId, referenceId, role, settings }: {
      productionId: number
      currentSnapshot: ProductionWorkspaceSnapshot
      momentId: number
      referenceId: number
      role: string
      settings: SettingRecord[]
    }) => {
      if (!input.projectId) throw new Error('请先选择项目')
      const reference = settings.find((item) => item.ID === referenceId)
      if (!reference) throw new Error('未找到设定')
      return linkProductionSceneMomentReferenceWorkspaceProjection({ projectId: input.projectId, productionId, currentSnapshot, momentId, reference, role })
    },
    onSuccess: () => {
      toast.success('情节设定已绑定')
      refreshProductionOrchestration(input)
    },
    onError: (error: unknown) => {
      toast.error(productionMutationErrorMessage(error, '绑定情节设定失败'))
    },
  }
}

export function buildUnlinkSceneMomentReferenceMutationOptions(input: ProductionOrchestrationMutationBaseInput) {
  return {
    mutationFn: async ({ productionId, currentSnapshot, momentId, referenceId }: {
      productionId: number
      currentSnapshot: ProductionWorkspaceSnapshot
      momentId: number
      referenceId: number
    }) => {
      if (!input.projectId) throw new Error('请先选择项目')
      return unlinkProductionSceneMomentReferenceWorkspaceProjection({ projectId: input.projectId, productionId, currentSnapshot, momentId, referenceId })
    },
    onSuccess: () => {
      toast.success('情节设定已移除')
      refreshProductionOrchestration(input)
    },
    onError: (error: unknown) => {
      toast.error(productionMutationErrorMessage(error, '移除情节设定失败'))
    },
  }
}

export function buildUpdateWritingExpressionMutationOptions(input: ProductionOrchestrationMutationBaseInput) {
  return {
    mutationFn: async ({ productionId, currentSnapshot, target, payload }: {
      productionId: number
      currentSnapshot: ProductionWorkspaceSnapshot
      target: ProductionWritingExpressionEditTarget
      payload: ProductionWritingExpressionSavePayload
    }) => {
      if (!input.projectId) throw new Error('请先选择项目')
      return saveProductionWritingExpressionWorkspaceProjection({ projectId: input.projectId, productionId, currentSnapshot, target, payload })
    },
    onSuccess: () => {
      toast.success('表达条目已更新')
      refreshProductionOrchestration(input)
    },
    onError: (error: unknown) => {
      toast.error(productionMutationErrorMessage(error, '保存表达条目失败'))
    },
  }
}

export function buildDeleteWritingExpressionMutationOptions(input: ProductionOrchestrationMutationBaseInput) {
  return {
    mutationFn: async ({ productionId, currentSnapshot, expressionId }: {
      productionId: number
      currentSnapshot: ProductionWorkspaceSnapshot
      expressionId: number
    }) => {
      if (!input.projectId) throw new Error('请先选择项目')
      return deleteProductionWritingExpressionWorkspaceProjection({ projectId: input.projectId, productionId, currentSnapshot, expressionId })
    },
    onSuccess: () => {
      toast.success('表达条目已删除')
      refreshProductionOrchestration(input)
    },
    onError: (error: unknown) => {
      toast.error(productionMutationErrorMessage(error, '删除表达条目失败'))
    },
  }
}

export function buildCreateWritingExpressionMutationOptions(input: ProductionOrchestrationMutationBaseInput) {
  return {
    mutationFn: async ({ productionId, currentSnapshot, momentId, order, scriptBlockId }: {
      productionId: number
      currentSnapshot: ProductionWorkspaceSnapshot
      momentId: number
      order: number
      scriptBlockId?: number | null
    }) => {
      if (!input.projectId) throw new Error('请先选择项目')
      return createProductionWritingExpressionWorkspaceProjection({ projectId: input.projectId, productionId, currentSnapshot, momentId, order, scriptBlockId })
    },
    onSuccess: () => {
      toast.success('已新增表达条目')
      refreshProductionOrchestration(input)
    },
    onError: (error: unknown) => {
      toast.error(productionMutationErrorMessage(error, '新增表达条目失败'))
    },
  }
}
