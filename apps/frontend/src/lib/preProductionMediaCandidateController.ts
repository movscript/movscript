import { invalidateAssetCandidateConsumers } from '@/lib/assetCandidateQueryInvalidation'
import {
  getMediaCandidateGenerationResult,
  launchMediaCandidateGenerationAgent,
  mediaCandidateOutputResourceIds,
} from '@/lib/preProductionAgentLaunch'
import { buildPreProductionGeneratedCandidatePayload, type PreProductionCandidateGenerationKind } from '@/lib/preProductionAssetCandidateWrite'
import type { AssetSlotViewModel } from '@/lib/preProductionAssetRows'
import { toast } from '@/store/toastStore'

export interface PreProductionMediaCandidateControllerOptions {
  projectId: number
  cleanupRef: { current: (() => void) | null }
  queryClient: { invalidateQueries: (input: { queryKey: unknown[] }) => Promise<unknown> }
  addCandidateMutation: { mutateAsync: (input: Record<string, string | number | boolean | null>) => Promise<unknown> }
  generationBusy: boolean
}

export function runPreProductionMediaCandidateGeneration(
  row: AssetSlotViewModel,
  kind: PreProductionCandidateGenerationKind,
  options: PreProductionMediaCandidateControllerOptions,
) {
  if (options.generationBusy) return
  const slotName = row.slot.name || `素材需求 #${row.slot.ID}`
  const requestId = `asset_candidate_generation_${row.slot.ID}_${Date.now().toString(36)}`
  options.cleanupRef.current?.()
  options.cleanupRef.current = launchMediaCandidateGenerationAgent({
    requestId,
    projectId: options.projectId,
    assetSlotId: row.slot.ID,
    slotName,
    slotKind: row.kind,
    outputKind: kind,
    description: row.slot.description,
    promptHint: row.slot.prompt_hint,
    onSettled: async (payload) => {
      if (payload.run?.status === 'failed') {
        toast.error(payload.run.error || payload.error || '素材候选生成失败')
        options.cleanupRef.current?.()
        options.cleanupRef.current = null
        return
      }
      if (payload.run?.status === 'cancelled') {
        toast.info('素材候选生成已停止')
        options.cleanupRef.current?.()
        options.cleanupRef.current = null
        return
      }
      if (!payload.run || (payload.run.status !== 'completed' && payload.run.status !== 'completed_with_warnings')) return
      const generated = getMediaCandidateGenerationResult(payload)
      const outputResourceIds = mediaCandidateOutputResourceIds(generated)
      if (outputResourceIds.length > 0) {
        const results = await Promise.allSettled(outputResourceIds.map((outputResourceId) => (
          options.addCandidateMutation.mutateAsync({
            ...buildPreProductionGeneratedCandidatePayload(row, outputResourceId, kind, generated?.jobId),
          })
        )))
        const successCount = results.filter((result) => result.status === 'fulfilled').length
        const failedCount = results.length - successCount
        if (successCount > 0) {
          await options.queryClient.invalidateQueries({ queryKey: ['resources'] })
          invalidateAssetCandidateConsumers(options.queryClient, options.projectId)
        }
        if (failedCount > 0 && successCount > 0) {
          toast.info(`已加入 ${successCount} 个候选，${failedCount} 个失败`)
        } else if (failedCount > 0) {
          toast.error('生成完成，但候选写入失败')
        } else {
          toast.success(outputResourceIds.length === 1
            ? `已加入${kind === 'video' ? '视频' : '图片'}候选 #${outputResourceIds[0]}`
            : `已加入 ${outputResourceIds.length} 个${kind === 'video' ? '视频' : '图片'}候选`)
        }
      } else {
        toast.info('生成流程完成，但没有返回可加入的输出资源')
      }
      options.cleanupRef.current?.()
      options.cleanupRef.current = null
    },
  })
  toast.success(`已打开${kind === 'video' ? '视频' : '图片'}候选生成助手`)
}
