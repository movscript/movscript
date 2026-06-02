import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { buildContentWorkspaceReviewModel, dedupeWorkspaces } from '@/features/content/domain/contentWorkbenchWorkspaceReviewModel'
import type { ContentGenerationMomentRow } from '@/features/content/domain/contentWorkbenchModel'
import { buildContentWorkbenchReviewQueueSummary } from '@/features/content/domain/contentWorkbenchReviewQueue'
import { localAgentClient, type AgentWorkspace } from '@/shared/infrastructure/localAgentClient'
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

  const workspacesQuery = useQuery<AgentWorkspace[]>({
    queryKey: ['workbench', 'production', 'content-workspaces', projectId],
    queryFn: async () => {
      if (!projectId) return []
      const contentUnitWorkspaces = await localAgentClient.listWorkspaces({
        projectId,
        kind: 'content_unit_workspace',
        status: ['workspace', 'accepted'],
        limit: 20,
      })
      return dedupeWorkspaces(contentUnitWorkspaces.workspaces)
    },
    enabled: !!projectId,
    retry: false,
  })

  const workspaces = workspacesQuery.data ?? []
  const workspacesById = useMemo(() => new Map(workspaces.map((workspace) => [workspace.id, workspace] as const)), [workspaces])
  const selectedWorkspace = reviewWorkspaceId ? workspacesById.get(reviewWorkspaceId) ?? null : workspaces[0] ?? null
  const reviewModel = useMemo(() => {
    if (!selectedWorkspace) return null
    return buildContentWorkspaceReviewModel(selectedWorkspace, {
      rowByMomentId: new Map(rows.map((row) => [row.moment.ID, row] as const)),
      rowByUnitId: new Map(rows.flatMap((row) => row.units.map((unit) => [unit.ID, row] as const))),
    })
  }, [rows, selectedWorkspace])
  const queueSummary = useMemo(() => buildContentWorkbenchReviewQueueSummary({
    workspaces,
    selectedReview: reviewModel ? {
      warningCount: reviewModel.warnings.length,
      diffCount: reviewModel.diffs.length,
      addedCount: reviewModel.diffs.filter((diff) => diff.state === 'added').length,
      changedCount: reviewModel.diffs.filter((diff) => diff.state === 'changed').length,
    } : null,
  }), [workspaces, reviewModel])

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
    workspacesQuery,
    workspaces,
    selectedWorkspace,
    reviewModel,
    queueSummary,
    showReviewPanel: reviewMode || workspacesQuery.isLoading || (workspaces.length > 0 && !collapsed),
    selectWorkspace,
    closeReview,
  }
}
