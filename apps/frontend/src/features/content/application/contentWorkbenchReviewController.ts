import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { buildContentWorkspaceReviewModel, dedupeWorkspaceArtifacts } from '@/features/content/domain/contentWorkbenchWorkspaceReviewModel'
import type { ContentGenerationMomentRow } from '@/features/content/domain/contentWorkbenchModel'
import { buildContentWorkbenchReviewQueueSummary } from '@/features/content/domain/contentWorkbenchReviewQueue'
import { providerSessionClient, type WorkspaceArtifact } from '@/shared/infrastructure/providerSessionClient'
import { mergeProjectWorkbenchArtifactReviewSearchParams } from '@/features/project-workbenches/application/projectWorkbenchWorkspaceReview'

type SearchParamsSetter = (
  nextInit: URLSearchParams | ((current: URLSearchParams) => URLSearchParams),
  navigateOptions?: { replace?: boolean },
) => void

export function useContentWorkbenchReviewController({
  projectId,
  rows,
  searchParams,
  setSearchParams,
}: {
  projectId?: number
  rows: ContentGenerationMomentRow[]
  searchParams: URLSearchParams
  setSearchParams: SearchParamsSetter
}) {
  const [collapsed, setCollapsed] = useState(false)
  const reviewWorkspaceId = searchParams.get('workspaceId')?.trim() ?? ''
  const reviewMode = searchParams.get('view') === 'review' || reviewWorkspaceId.length > 0

  useEffect(() => {
    if (reviewMode) setCollapsed(false)
  }, [reviewMode])

  const workspaceArtifactsQuery = useQuery<WorkspaceArtifact[]>({
    queryKey: ['workbench', 'production', 'content-workspaces', projectId],
    queryFn: async () => {
      if (!projectId) return []
      const contentUnitWorkspaces = await providerSessionClient.listWorkspaceArtifacts({
        projectId,
        kind: 'content_unit_workspace',
        status: ['workspace', 'accepted'],
        limit: 20,
      })
      return dedupeWorkspaceArtifacts(contentUnitWorkspaces.workspaces)
    },
    enabled: !!projectId,
    retry: false,
  })

  const workspaceArtifacts = workspaceArtifactsQuery.data ?? []
  const workspaceArtifactsById = useMemo(() => new Map(workspaceArtifacts.map((workspace) => [workspace.id, workspace] as const)), [workspaceArtifacts])
  const selectedWorkspace = reviewWorkspaceId ? workspaceArtifactsById.get(reviewWorkspaceId) ?? null : workspaceArtifacts[0] ?? null
  const reviewModel = useMemo(() => {
    if (!selectedWorkspace) return null
    return buildContentWorkspaceReviewModel(selectedWorkspace, {
      rowByMomentId: new Map(rows.map((row) => [row.moment.ID, row] as const)),
      rowByUnitId: new Map(rows.flatMap((row) => row.units.map((unit) => [unit.ID, row] as const))),
    })
  }, [rows, selectedWorkspace])
  const queueSummary = useMemo(() => buildContentWorkbenchReviewQueueSummary({
    workspaces: workspaceArtifacts,
    selectedReview: reviewModel ? {
      warningCount: reviewModel.warnings.length,
      diffCount: reviewModel.diffs.length,
      addedCount: reviewModel.diffs.filter((diff) => diff.state === 'added').length,
      changedCount: reviewModel.diffs.filter((diff) => diff.state === 'changed').length,
    } : null,
  }), [workspaceArtifacts, reviewModel])

  function selectWorkspace(workspaceId: string) {
    setCollapsed(false)
    setSearchParams((current) => mergeProjectWorkbenchArtifactReviewSearchParams(current, {
      workbenchId: 'content_orchestration',
      primary: {
        workspaceKind: 'content_unit_workspace',
        fallbackWorkspaceId: workspaceId,
      },
    }), { replace: true })
  }

  function closeReview() {
    setCollapsed(true)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('view')
      next.delete('workspaceId')
      return next
    }, { replace: true })
  }

  return {
    collapsed,
    setCollapsed,
    reviewWorkspaceId,
    reviewMode,
    workspaceArtifactsQuery,
    workspaceArtifacts,
    workspacesQuery: workspaceArtifactsQuery,
    workspaces: workspaceArtifacts,
    selectedWorkspace,
    reviewModel,
    queueSummary,
    showReviewPanel: reviewMode || workspaceArtifactsQuery.isLoading || (workspaceArtifacts.length > 0 && !collapsed),
    selectWorkspace,
    closeReview,
  }
}
