import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { providerSessionClient, type WorkspaceArtifact } from '@/shared/infrastructure/providerSessionClient'
import {
  buildWorkspaceReviewSegments,
  collectWorkspaceReviewNodes,
  parseProductionWorkspaceArtifact,
  type ProductionWorkspaceArtifactContent,
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
  const openedAssetWorkspaceArtifactId = searchParams.get('assetWorkspaceArtifactId')?.trim()
    || searchParams.get('assetWorkspaceWorkspaceId')?.trim()
    || ''
  const reviewOpen = searchParams.get('view') === 'review'
  const [workspacePreviewWorkspace, setWorkspacePreviewWorkspace] = useState<ProductionWorkspaceArtifactContent | null>(null)
  const [workspaceNodeDecisions, setWorkspaceNodeDecisions] = useState<WorkspaceNodeDecisions>({})

  const openedWorkspaceQuery = useQuery<WorkspaceArtifact | null>({
    queryKey: ['production-orchestration-workspace', projectId, openedWorkspaceId],
    queryFn: async () => {
      if (!projectId || !openedWorkspaceId) return null
      return providerSessionClient.getWorkspaceArtifact(openedWorkspaceId)
    },
    enabled: !!projectId && !!openedWorkspaceId,
  })
  const openedSettingWorkspaceQuery = useQuery<WorkspaceArtifact | null>({
    queryKey: ['production-orchestration-setting-workspace', projectId, openedSettingWorkspaceId],
    queryFn: async () => {
      if (!projectId || !openedSettingWorkspaceId) return null
      return providerSessionClient.getWorkspaceArtifact(openedSettingWorkspaceId)
    },
    enabled: !!projectId && !!openedSettingWorkspaceId,
  })
  const openedAssetWorkspaceArtifactQuery = useQuery<WorkspaceArtifact | null>({
    queryKey: ['production-orchestration-asset-workspace-workspace', projectId, openedAssetWorkspaceArtifactId],
    queryFn: async () => {
      if (!projectId || !openedAssetWorkspaceArtifactId) return null
      return providerSessionClient.getWorkspaceArtifact(openedAssetWorkspaceArtifactId)
    },
    enabled: !!projectId && !!openedAssetWorkspaceArtifactId,
  })

  const workspaceReviewNodeCount = useMemo(
    () => workspacePreviewWorkspace ? collectWorkspaceReviewNodes(buildWorkspaceReviewSegments(workspacePreviewWorkspace.workspace.segments, currentProductionSnapshot)).length : 0,
    [currentProductionSnapshot, workspacePreviewWorkspace],
  )
  const workspaceStatusLabel = reviewOpen
    ? workspacePreviewWorkspace
      ? `待审节点 ${workspaceReviewNodeCount}`
      : '等待 AI 草案'
    : structureStatusLabel

  useEffect(() => {
    const workspace = openedWorkspaceQuery.data
    if (!workspace || workspace.kind !== 'production_workspace') {
      setWorkspacePreviewWorkspace(null)
      return
    }
    const parsed = parseProductionWorkspaceArtifact(workspace)
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
    openedAssetWorkspaceArtifactId,
    openedWorkspaceQuery,
    openedSettingWorkspaceQuery,
    openedAssetWorkspaceArtifactQuery,
    workspacePreviewWorkspace,
    workspaceNodeDecisions,
    setWorkspaceNodeDecisions,
    workspaceReviewNodeCount,
    reviewOpen,
    workspaceStatusLabel,
    clearWorkspaceReview,
  }
}
