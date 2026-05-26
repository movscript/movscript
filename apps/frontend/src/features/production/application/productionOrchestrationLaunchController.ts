import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ScriptVersion } from '@/shared/infrastructure/api/scriptVersions'
import { buildPageKey } from '@/features/agent/domain/agentCommandInput'
import type { AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import type { ProductionAnalysisTarget } from '@/features/production/domain/productionAnalysisText'
import type { ProductionProposalLaunchProduction } from '@/features/production/application/productionProposalAgentLaunch'
import {
  buildProductionProposalReviewSearchParams,
  ensureProductionProposalDraft,
  launchProductionProposalAgent,
  productionProposalLaunchLabel,
} from '@/features/production/application/productionProposalAgentLaunch'
import type { ProposalSegmentNode } from '@/features/production/domain/productionProposalReviewModel'
import { ROUTES } from '@/routes/projectRoutes'
import { toast } from '@/shared/ui/toastStore'

export type ProductionOrchestrationLaunchStage = 'idle' | 'production'

export type ProductionOrchestrationSearchParamsSetter = (
  nextInit: URLSearchParams | ((current: URLSearchParams) => URLSearchParams),
  navigateOptions?: { replace?: boolean },
) => void

export interface ProductionOrchestrationLaunchQueryClient {
  invalidateQueries(input: { queryKey: readonly unknown[] }): Promise<unknown> | unknown
}

export interface ProductionOrchestrationLaunchControllerInput {
  projectId?: number
  effectiveProductionId: number
  selectedProduction?: ProductionProposalLaunchProduction | null
  openedDraftId?: string
  canLaunchLinkedProposal: boolean
  productionSnapshot: { segments: ProposalSegmentNode[] }
  selectedScriptVersion?: ScriptVersion | null
  scriptVersions: ScriptVersion[]
  setSearchParams: ProductionOrchestrationSearchParamsSetter
  showReview: () => void
  refetch: () => Promise<unknown> | unknown
  queryClient: ProductionOrchestrationLaunchQueryClient
  queryKey: readonly unknown[]
}

export function buildProductionProposalLaunchRequestId(now = Date.now(), random = Math.random()) {
  return `production_orchestrate_${now.toString(36)}_${random.toString(36).slice(2, 8)}`
}

export function productionProposalLaunchBlockedReason({
  projectId,
  effectiveProductionId,
  canLaunchLinkedProposal,
}: {
  projectId?: number
  effectiveProductionId: number
  canLaunchLinkedProposal: boolean
}) {
  if (!projectId || !effectiveProductionId) return 'missing_production'
  if (!canLaunchLinkedProposal) return 'missing_script'
  return null
}

export function buildProductionProposalLaunchPageKey({
  projectId,
  effectiveProductionId,
  selectedProduction,
}: {
  projectId?: number
  effectiveProductionId: number
  selectedProduction?: ProductionProposalLaunchProduction | null
}) {
  return buildPageKey({
    route: { pathname: ROUTES.project.productionOrchestration },
    projectId,
    productionId: effectiveProductionId || undefined,
    selection: effectiveProductionId
      ? {
        entityType: 'production',
        entityId: effectiveProductionId,
        label: selectedProduction ? String(selectedProduction.name ?? `制作 #${selectedProduction.ID}`) : `制作 #${effectiveProductionId}`,
      }
      : undefined,
    labels: ['production-orchestration'],
  })
}

export function buildProductionProposalSettledReviewSearchParams(
  current: URLSearchParams,
  input: {
    productionId: number
    fallbackDraftId: string
    artifacts?: AgentTaskArtifactRef[]
  },
) {
  return buildProductionProposalReviewSearchParams(current, {
    productionId: input.productionId,
    fallbackDraftId: input.fallbackDraftId,
    artifacts: input.artifacts,
  })
}

export function useProductionOrchestrationLaunchController(input: ProductionOrchestrationLaunchControllerInput) {
  const [orchestrationStage, setOrchestrationStage] = useState<ProductionOrchestrationLaunchStage>('idle')
  const orchestrationCleanupRef = useRef<(() => void) | null>(null)
  const productionPageKey = useMemo(
    () => buildProductionProposalLaunchPageKey({
      projectId: input.projectId,
      effectiveProductionId: input.effectiveProductionId,
      selectedProduction: input.selectedProduction,
    }),
    [input.effectiveProductionId, input.projectId, input.selectedProduction],
  )

  useEffect(() => {
    return () => orchestrationCleanupRef.current?.()
  }, [])

  const refreshProductionQueries = useCallback(async () => {
    await Promise.all([
      input.refetch(),
      input.queryClient.invalidateQueries({ queryKey: input.queryKey }),
    ])
  }, [input])

  const ensureProductionProposalDraftForLaunch = useCallback(async (target: ProductionAnalysisTarget, options?: { seedProposalFromSnapshot?: boolean; requireLinkedScript?: boolean }) => {
    const blockedReason = productionProposalLaunchBlockedReason({
      projectId: input.projectId,
      effectiveProductionId: input.effectiveProductionId,
      canLaunchLinkedProposal: options?.requireLinkedScript === false ? true : input.canLaunchLinkedProposal,
    })
    if (blockedReason === 'missing_script') {
      toast.error('请先绑定可用剧本后再发起制作提案。')
      return null
    }
    if (blockedReason) return null

    const productionDraft = await ensureProductionProposalDraft({
      projectId: input.projectId!,
      productionId: input.effectiveProductionId,
      production: input.selectedProduction,
      productionPageKey,
      openedDraftId: input.openedDraftId,
      productionSnapshot: input.productionSnapshot,
      scriptVersion: input.selectedScriptVersion,
      projectScripts: input.scriptVersions,
      seedProposalFromSnapshot: options?.seedProposalFromSnapshot,
    })

    input.setSearchParams((current) => buildProductionProposalSettledReviewSearchParams(current, {
      productionId: input.effectiveProductionId,
      fallbackDraftId: productionDraft.id,
    }), { replace: true })

    input.showReview()
    return { productionDraft, target }
  }, [input, productionPageKey])

  const handleAnalyzeTarget = useCallback(async (target: ProductionAnalysisTarget) => {
    const drafts = await ensureProductionProposalDraftForLaunch(target, { requireLinkedScript: true })
    if (!drafts || !input.projectId || !input.effectiveProductionId) return

    const requestId = buildProductionProposalLaunchRequestId()
    const productionLabel = productionProposalLaunchLabel(input.selectedProduction, input.effectiveProductionId)
    setOrchestrationStage('production')
    orchestrationCleanupRef.current?.()
    orchestrationCleanupRef.current = launchProductionProposalAgent({
      requestId,
      projectId: input.projectId,
      productionId: input.effectiveProductionId,
      productionLabel,
      draftId: drafts.productionDraft.id,
      target,
      onSettled: async (payload) => {
        if (payload.status !== 'completed') {
          setOrchestrationStage('idle')
          await refreshProductionQueries()
          return
        }
        input.setSearchParams((current) => buildProductionProposalSettledReviewSearchParams(current, {
          productionId: input.effectiveProductionId,
          fallbackDraftId: drafts.productionDraft.id,
          artifacts: payload.artifacts,
        }), { replace: true })
        input.showReview()
        setOrchestrationStage('idle')
        await refreshProductionQueries()
      },
    })
  }, [ensureProductionProposalDraftForLaunch, input, refreshProductionQueries])

  const openProposalMode = useCallback(async () => {
    await ensureProductionProposalDraftForLaunch({ scope: 'production' }, { seedProposalFromSnapshot: true, requireLinkedScript: false })
  }, [ensureProductionProposalDraftForLaunch])

  return {
    orchestrationStage,
    productionPageKey,
    openProposalMode,
    handleAnalyzeTarget,
  }
}
