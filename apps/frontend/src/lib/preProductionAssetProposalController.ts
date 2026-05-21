import {
  buildAssetCandidateProposalReviewSearchParams,
  createAssetCandidateProposalDraft,
  launchAssetCandidateProposalAgent,
} from '@/lib/preProductionAgentLaunch'
import {
  candidateReferenceResourceIds,
  slotScopeLabel,
  type AssetSlotViewModel,
} from '@/lib/preProductionAssetRows'
import type { PreProductionCandidateGenerationKind } from '@/lib/preProductionAssetCandidateWrite'
import { toast } from '@/store/toastStore'

export interface PreProductionAssetProposalControllerOptions {
  projectId?: number
  cleanupRef: { current: (() => void) | null }
  setReviewSearchParams: (updater: (current: URLSearchParams) => URLSearchParams) => void
}

export function buildPreProductionAssetProposalMutationOptions({
  projectId,
  cleanupRef,
  setReviewSearchParams,
}: PreProductionAssetProposalControllerOptions) {
  return {
    mutationFn: async ({ row, kind }: { row: AssetSlotViewModel; kind: PreProductionCandidateGenerationKind }) => {
      if (!projectId) throw new Error('请先选择项目')
      const referenceIds = candidateReferenceResourceIds(row)
      const slotName = row.slot.name || `素材需求 #${row.slot.ID}`
      const draftShell = await createAssetCandidateProposalDraft({
        projectId,
        assetSlotId: row.slot.ID,
        slotName,
        slotKind: row.kind,
        description: row.slot.description,
        promptHint: row.slot.prompt_hint,
        ownerLabel: slotScopeLabel(row.slot),
        referenceResourceIds: referenceIds,
        requestedOutputKind: kind,
      })
      const requestId = `asset_proposal_${row.slot.ID}_${Date.now().toString(36)}`
      cleanupRef.current?.()
      cleanupRef.current = launchAssetCandidateProposalAgent({
        requestId,
        projectId,
        assetSlotId: row.slot.ID,
        slotName,
        draftId: draftShell.id,
        onSettled: async (payload) => {
          if (payload.run?.status === 'failed') {
            toast.error(payload.run.error || payload.error || '素材候选提案生成失败')
            cleanupRef.current?.()
            cleanupRef.current = null
            return
          }
          if (payload.run?.status === 'cancelled') {
            toast.info('素材候选提案已停止')
            cleanupRef.current?.()
            cleanupRef.current = null
            return
          }
          if (!payload.run || (payload.run.status !== 'completed' && payload.run.status !== 'completed_with_warnings')) return
          const reviewSearchInput = {
            assetSlotId: row.slot.ID,
            fallbackDraftId: draftShell.id,
            artifacts: payload.artifacts,
          }
          setReviewSearchParams((current) => buildAssetCandidateProposalReviewSearchParams(current, reviewSearchInput))
          const draftId = buildAssetCandidateProposalReviewSearchParams(new URLSearchParams(), reviewSearchInput).get('draftId') ?? draftShell.id
          toast.success(`素材候选提案已准备，可在 AI 草稿中审阅：${draftId}`)
          cleanupRef.current?.()
          cleanupRef.current = null
        },
      })
      return { draft: draftShell }
    },
    onSuccess: () => {
      toast.success('已打开 AI 素材候选提案助手')
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : '准备素材候选提案失败')
    },
  }
}
