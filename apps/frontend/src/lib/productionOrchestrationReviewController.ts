import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { localAgentClient, type AgentDraft } from '@/lib/localAgentClient'
import {
  buildProposalReviewSegments,
  collectProposalReviewNodes,
  parseProductionProposalDraft,
  type ProposalDraftContent,
  type ProposalNodeDecisions,
  type ProposalSegmentNode,
} from '@/lib/productionProposalReviewModel'

export type ProductionOrchestrationWorkspaceView = 'structure' | 'review'

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
  const [proposalPreviewDraft, setProposalPreviewDraft] = useState<ProposalDraftContent | null>(null)
  const [proposalNodeDecisions, setProposalNodeDecisions] = useState<ProposalNodeDecisions>({})
  const [workspaceView, setWorkspaceView] = useState<ProductionOrchestrationWorkspaceView>('structure')

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
  const workspaceStatusLabel = workspaceView === 'review'
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
    setWorkspaceView('review')
  }, [openedDraftId, openedDraftQuery.data])

  useEffect(() => {
    if (proposalPreviewDraft) {
      setProposalNodeDecisions({})
    }
  }, [proposalPreviewDraft])

  useEffect(() => {
    if (openedSettingDraftId || openedAssetProposalDraftId || openedDraftId) {
      setWorkspaceView('review')
    }
  }, [openedAssetProposalDraftId, openedDraftId, openedSettingDraftId])

  function showReview() {
    setWorkspaceView('review')
  }

  function showStructure() {
    setWorkspaceView('structure')
  }

  function clearProposalReview() {
    setProposalPreviewDraft(null)
    setProposalNodeDecisions({})
    setWorkspaceView('structure')
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
    workspaceView,
    setWorkspaceView,
    workspaceStatusLabel,
    showReview,
    showStructure,
    clearProposalReview,
  }
}
