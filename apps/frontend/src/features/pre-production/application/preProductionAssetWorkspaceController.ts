import {
  buildAssetCandidateWorkspaceReviewSearchParams,
  createAssetCandidateWorkspaceWorkspace,
  launchAssetCandidateWorkspaceAgent,
} from '@/features/pre-production/application/preProductionAgentLaunch'
import {
  candidateReferenceResourceIds,
  slotScopeLabel,
  type AssetSlotViewModel,
} from '@/features/pre-production/domain/preProductionAssetRows'
import type { PreProductionCandidateGenerationKind } from '@/features/pre-production/domain/preProductionAssetCandidateWrite'
import { toast } from '@/shared/ui/toastStore'

export interface PreProductionAssetWorkspaceControllerOptions {
  projectId?: number
  cleanupRef: { current: (() => void) | null }
  setReviewSearchParams: (updater: (current: URLSearchParams) => URLSearchParams) => void
}

export function buildPreProductionAssetWorkspaceMutationOptions({
  projectId,
  cleanupRef,
  setReviewSearchParams,
}: PreProductionAssetWorkspaceControllerOptions) {
  return {
    mutationFn: async ({ row, kind }: { row: AssetSlotViewModel; kind: PreProductionCandidateGenerationKind }) => {
      if (!projectId) throw new Error('请先选择项目')
      const referenceIds = candidateReferenceResourceIds(row)
      const slotName = row.slot.name || `素材需求 #${row.slot.ID}`
      const workspaceShell = await createAssetCandidateWorkspaceWorkspace({
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
      const requestId = `asset_workspace_${row.slot.ID}_${Date.now().toString(36)}`
      cleanupRef.current?.()
      cleanupRef.current = launchAssetCandidateWorkspaceAgent({
        requestId,
        projectId,
        assetSlotId: row.slot.ID,
        slotName,
        workspaceId: workspaceShell.id,
        onSettled: async (payload) => {
          if (payload.run?.status === 'failed') {
            toast.error(payload.run.error || payload.error || '素材候选工作区生成失败')
            cleanupRef.current?.()
            cleanupRef.current = null
            return
          }
          if (payload.run?.status === 'cancelled') {
            toast.info('素材候选工作区已停止')
            cleanupRef.current?.()
            cleanupRef.current = null
            return
          }
          if (!payload.run || (payload.run.status !== 'completed' && payload.run.status !== 'completed_with_warnings')) return
          const reviewSearchInput = {
            assetSlotId: row.slot.ID,
            fallbackWorkspaceId: workspaceShell.id,
            artifacts: payload.artifacts,
          }
          setReviewSearchParams((current) => buildAssetCandidateWorkspaceReviewSearchParams(current, reviewSearchInput))
          const workspaceId = buildAssetCandidateWorkspaceReviewSearchParams(new URLSearchParams(), reviewSearchInput).get('workspaceId') ?? workspaceShell.id
          toast.success(`素材候选工作区已准备，可在 AI 工作区中审阅：${workspaceId}`)
          cleanupRef.current?.()
          cleanupRef.current = null
        },
      })
      return { workspace: workspaceShell }
    },
    onSuccess: () => {
      toast.success('已打开 AI 素材候选工作区助手')
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : '准备素材候选工作区失败')
    },
  }
}
