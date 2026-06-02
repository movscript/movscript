import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { localAgentClient, type AgentWorkspace } from '@/shared/infrastructure/localAgentClient'
import {
  buildWorkspaceReviewSegments,
  collectWorkspaceReviewNodes,
  parseProductionWorkspaceWorkspace,
  type WorkspaceWorkspaceContent,
  type WorkspaceNodeDecisions,
  type WorkspaceSegmentNode,
} from '@/features/production/domain/productionWorkspaceReviewModel'

interface ProductionOrchestrationReviewControllerInput {
  projectId?: number
  searchParams: URLSearchParams
  currentProductionSnapshot: { segments: WorkspaceSegmentNode[] }
  structureStatusLabel: string
}

export function useProductionOrchestrationReviewController({
  projectId,
  searchParams,
  currentProductionSnapshot,
  structureStatusLabel,
}: ProductionOrchestrationReviewControllerInput) {
  const openedWorkspaceId = searchParams.get('workspaceId')?.trim() || ''
  const openedSettingWorkspaceId = searchParams.get('settingWorkspaceId')?.trim() || ''
  const openedAssetWorkspaceWorkspaceId = searchParams.get('assetWorkspaceWorkspaceId')?.trim() || ''
  const reviewOpen = searchParams.get('view') === 'review'
  const [workspacePreviewWorkspace, setWorkspacePreviewWorkspace] = useState<WorkspaceWorkspaceContent | null>(null)
  const [workspaceNodeDecisions, setWorkspaceNodeDecisions] = useState<WorkspaceNodeDecisions>({})

  const openedWorkspaceQuery = useQuery<AgentWorkspace | null>({
    queryKey: ['production-orchestration-workspace', projectId, openedWorkspaceId],
    queryFn: async () => {
      if (!projectId || !openedWorkspaceId) return null
      return localAgentClient.getWorkspace(openedWorkspaceId)
    },
    enabled: !!projectId && !!openedWorkspaceId,
  })
  const openedSettingWorkspaceQuery = useQuery<AgentWorkspace | null>({
    queryKey: ['production-orchestration-setting-workspace', projectId, openedSettingWorkspaceId],
    queryFn: async () => {
      if (!projectId || !openedSettingWorkspaceId) return null
      return localAgentClient.getWorkspace(openedSettingWorkspaceId)
    },
    enabled: !!projectId && !!openedSettingWorkspaceId,
  })
  const openedAssetWorkspaceWorkspaceQuery = useQuery<AgentWorkspace | null>({
    queryKey: ['production-orchestration-asset-workspace-workspace', projectId, openedAssetWorkspaceWorkspaceId],
    queryFn: async () => {
      if (!projectId || !openedAssetWorkspaceWorkspaceId) return null
      return localAgentClient.getWorkspace(openedAssetWorkspaceWorkspaceId)
    },
    enabled: !!projectId && !!openedAssetWorkspaceWorkspaceId,
  })

  const workspaceReviewNodeCount = useMemo(
    () => workspacePreviewWorkspace ? collectWorkspaceReviewNodes(buildWorkspaceReviewSegments(workspacePreviewWorkspace.workspace.segments, currentProductionSnapshot)).length : 0,
    [currentProductionSnapshot, workspacePreviewWorkspace],
  )
  const workspaceStatusLabel = reviewOpen
    ? workspacePreviewWorkspace
      ? `待审节点 ${workspaceReviewNodeCount}`
      : '等待 AI 工作区'
    : structureStatusLabel

  useEffect(() => {
    const workspace = openedWorkspaceQuery.data
    if (!workspace || workspace.kind !== 'production_workspace') {
      setWorkspacePreviewWorkspace(null)
      return
    }
    const parsed = parseProductionWorkspaceWorkspace(workspace)
    setWorkspacePreviewWorkspace(parsed)
    setWorkspaceNodeDecisions({})
  }, [openedWorkspaceId, openedWorkspaceQuery.data])

  useEffect(() => {
    if (workspacePreviewWorkspace) {
      setWorkspaceNodeDecisions({})
    }
  }, [workspacePreviewWorkspace])

  function clearWorkspaceReview() {
    setWorkspacePreviewWorkspace(null)
    setWorkspaceNodeDecisions({})
  }

  return {
    openedWorkspaceId,
    openedSettingWorkspaceId,
    openedAssetWorkspaceWorkspaceId,
    openedWorkspaceQuery,
    openedSettingWorkspaceQuery,
    openedAssetWorkspaceWorkspaceQuery,
    workspacePreviewWorkspace,
    workspaceNodeDecisions,
    setWorkspaceNodeDecisions,
    workspaceReviewNodeCount,
    reviewOpen,
    workspaceStatusLabel,
    clearWorkspaceReview,
  }
}
