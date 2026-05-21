import {
  buildPreProductionAuditReviewSearchParams,
  launchPreProductionAuditAgent,
} from '@/lib/preProductionAgentLaunch'
import { toast } from '@/store/toastStore'

export interface PreProductionAuditQueryClient {
  invalidateQueries: (input: { queryKey: unknown[] }) => Promise<unknown>
}

export interface PreProductionAuditControllerOptions {
  projectId?: number
  projectName?: string
  cleanupRef: { current: (() => void) | null }
  queryClient: PreProductionAuditQueryClient
  setLaunching: (launching: boolean) => void
  setReviewSearchParams: (updater: (current: URLSearchParams) => URLSearchParams) => void
  refetchSettingDrafts: () => Promise<unknown>
  refetchAssetProposalDrafts: () => Promise<unknown>
}

export function runPreProductionAudit(options: PreProductionAuditControllerOptions) {
  const {
    projectId,
    projectName,
    cleanupRef,
    queryClient,
    setLaunching,
    setReviewSearchParams,
    refetchSettingDrafts,
    refetchAssetProposalDrafts,
  } = options
  if (!projectId) {
    toast.info('请先选择项目')
    return
  }
  const projectLabel = projectName || `项目 #${projectId}`
  const requestId = `pre_production_audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  setLaunching(true)
  cleanupRef.current?.()
  cleanupRef.current = launchPreProductionAuditAgent({
    requestId,
    projectId,
    projectLabel,
    onSettled: async (payload) => {
      setLaunching(false)
      cleanupRef.current?.()
      cleanupRef.current = null
      if (payload.status === 'cancelled' || payload.run?.status === 'cancelled') {
        toast.info('前期准备梳理已停止')
      } else if (payload.status === 'error' || payload.run?.status === 'failed') {
        toast.error(payload.run?.error || payload.error || '前期准备梳理失败')
      } else {
        setReviewSearchParams((current) => buildPreProductionAuditReviewSearchParams(current, { artifacts: payload.artifacts }))
        toast.success('前期准备梳理完成，可在审阅区查看设定和素材提案')
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pre-production-creative-references', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['semantic-asset-slots-page', projectId] }),
        refetchSettingDrafts(),
        refetchAssetProposalDrafts(),
      ])
    },
  })
  toast.info('已打开前期准备梳理会话；AI 生成的草稿会回到审阅区')
}
