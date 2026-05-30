import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { localAgentClient, type AgentDraft } from '@/shared/infrastructure/localAgentClient'
import {
  buildProposalReviewSegments,
  collectProposalReviewNodes,
  parseProductionProposalDraft,
  type ProposalDraftContent,
  type ProposalNodeDecisions,
  type ProposalSegmentNode,
} from '@/features/production/domain/productionProposalReviewModel'

interface ProductionOrchestrationReviewControllerInput {
  projectId?: number
  searchParams: URLSearchParams
  currentProductionSnapshot: { segments: ProposalSegmentNode[] }
  structureStatusLabel: string
}

export function useProductionOrchestrationReviewController({
  projectId,
  searchParams,
  currentProductionSnapshot,
  structureStatusLabel,
}: ProductionOrchestrationReviewControllerInput) {
  const openedDraftId = searchParams.get('draftId')?.trim() || ''
  const openedSettingDraftId = searchParams.get('settingDraftId')?.trim() || ''
  const openedAssetProposalDraftId = searchParams.get('assetProposalDraftId')?.trim() || ''
  const reviewOpen = searchParams.get('view') === 'review'
  const [proposalPreviewDraft, setProposalPreviewDraft] = useState<ProposalDraftContent | null>(null)
  const [proposalNodeDecisions, setProposalNodeDecisions] = useState<ProposalNodeDecisions>({})

  const openedDraftQuery = useQuery<AgentDraft | null>({
    queryKey: ['production-orchestration-draft', projectId, openedDraftId],
    queryFn: async () => {
      if (!projectId || !openedDraftId) return null
      return localAgentClient.getDraft(openedDraftId)
    },
    enabled: !!projectId && !!openedDraftId,
  })
  const openedSettingDraftQuery = useQuery<AgentDraft | null>({
    queryKey: ['production-orchestration-setting-draft', projectId, openedSettingDraftId],
    queryFn: async () => {
      if (!projectId || !openedSettingDraftId) return null
      return localAgentClient.getDraft(openedSettingDraftId)
    },
    enabled: !!projectId && !!openedSettingDraftId,
  })
  const openedAssetProposalDraftQuery = useQuery<AgentDraft | null>({
    queryKey: ['production-orchestration-asset-proposal-draft', projectId, openedAssetProposalDraftId],
    queryFn: async () => {
      if (!projectId || !openedAssetProposalDraftId) return null
      return localAgentClient.getDraft(openedAssetProposalDraftId)
    },
    enabled: !!projectId && !!openedAssetProposalDraftId,
  })

  const proposalReviewNodeCount = useMemo(
    () => proposalPreviewDraft ? collectProposalReviewNodes(buildProposalReviewSegments(proposalPreviewDraft.proposal.segments, currentProductionSnapshot)).length : 0,
    [currentProductionSnapshot, proposalPreviewDraft],
  )
  const workspaceStatusLabel = reviewOpen
    ? proposalPreviewDraft
      ? `待审节点 ${proposalReviewNodeCount}`
      : '等待 AI 草稿'
    : structureStatusLabel

  useEffect(() => {
    const draft = openedDraftQuery.data
    if (!draft || draft.kind !== 'production_proposal') {
      setProposalPreviewDraft(null)
      return
    }
    const parsed = parseProductionProposalDraft(draft)
    setProposalPreviewDraft(parsed)
    setProposalNodeDecisions({})
  }, [openedDraftId, openedDraftQuery.data])

  useEffect(() => {
    if (proposalPreviewDraft) {
      setProposalNodeDecisions({})
    }
  }, [proposalPreviewDraft])

  function clearProposalReview() {
    setProposalPreviewDraft(null)
    setProposalNodeDecisions({})
  }

  return {
    openedDraftId,
    openedSettingDraftId,
    openedAssetProposalDraftId,
    openedDraftQuery,
    openedSettingDraftQuery,
    openedAssetProposalDraftQuery,
    proposalPreviewDraft,
    proposalNodeDecisions,
    setProposalNodeDecisions,
    proposalReviewNodeCount,
    reviewOpen,
    workspaceStatusLabel,
    clearProposalReview,
  }
}
