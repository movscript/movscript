import {
  createSemanticEntity,
  semanticEntityConfig,
  updateSemanticEntity,
  type SemanticEntityPayload,
} from '@/api/semanticEntities'
import type { ScriptVersion } from '@/api/scriptVersions'
import { translateApiError, type APIErrorBody } from '@/lib/apiError'
import { isRecord } from '@/lib/jsonValue'
import { inferScriptBlockKind, scriptBlockContentFromLines } from '@/lib/productionScriptBlocks'
import {
  writingExpressionPayload,
  type ProductionWritingExpressionEditTarget,
  type ProductionWritingExpressionSavePayload,
} from '@/lib/productionWritingExpressions'
import type { ScriptBlockRecord } from '@/lib/productionOrchestrationData'
import { toast } from '@/store/toastStore'

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
  productionId: number
  scriptVersionsQueryKey: readonly unknown[]
}) {
  return {
    mutationFn: async (scriptVersionId: number | null) => {
      if (!input.projectId || !input.productionId) throw new Error('请先选择制作')
      return updateSemanticEntity(input.projectId, semanticEntityConfig('productions'), input.productionId, {
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

export function buildUpdateSceneMomentMutationOptions(input: ProductionOrchestrationMutationBaseInput) {
  return {
    mutationFn: async ({ momentId, payload }: { momentId: number; payload: SemanticEntityPayload }) => {
      if (!input.projectId) throw new Error('请先选择项目')
      return updateSemanticEntity(input.projectId, semanticEntityConfig('sceneMoments'), momentId, payload)
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

export function buildLinkSceneMomentReferenceMutationOptions(input: ProductionOrchestrationMutationBaseInput) {
  return {
    mutationFn: async ({ momentId, referenceId, role }: { momentId: number; referenceId: number; role: string }) => {
      if (!input.projectId) throw new Error('请先选择项目')
      return createSemanticEntity(input.projectId, semanticEntityConfig('creativeReferenceUsages'), {
        owner_type: 'scene_moment',
        owner_id: momentId,
        creative_reference_id: referenceId,
        role,
        source: 'manual',
        status: 'confirmed',
      })
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

export function buildUpdateWritingExpressionMutationOptions(input: ProductionOrchestrationMutationBaseInput) {
  return {
    mutationFn: async ({ target, payload }: { target: ProductionWritingExpressionEditTarget; payload: ProductionWritingExpressionSavePayload }) => {
      if (!input.projectId) throw new Error('请先选择项目')
      if (target.kind === 'writingExpressions') {
        const entityPayload = writingExpressionPayload(payload)
        return updateSemanticEntity(input.projectId, semanticEntityConfig('writingExpressions'), target.id, {
          kind: entityPayload.kind,
          speaker: entityPayload.speaker,
          text: entityPayload.text,
          note: entityPayload.note,
          intent: entityPayload.intent,
        })
      }
      return createSemanticEntity(input.projectId, semanticEntityConfig('writingExpressions'), writingExpressionPayload({
        ...payload,
        scene_moment_id: target.sceneMomentId,
        script_block_id: target.scriptBlockId ?? payload.script_block_id ?? null,
        order: target.order,
      }))
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

export function buildCreateWritingExpressionMutationOptions(input: ProductionOrchestrationMutationBaseInput) {
  return {
    mutationFn: async ({ momentId, order, scriptBlockId }: { momentId: number; order: number; scriptBlockId?: number | null }) => {
      if (!input.projectId) throw new Error('请先选择项目')
      return createSemanticEntity(input.projectId, semanticEntityConfig('writingExpressions'), {
        scene_moment_id: momentId,
        script_block_id: scriptBlockId ?? null,
        order,
        kind: 'dialogue',
        speaker: '',
        text: '',
        note: '',
        intent: '',
      })
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
