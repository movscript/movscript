import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { buildContentDraftReviewModel, dedupeDrafts } from '@/lib/contentWorkbenchDraftReviewModel'
import type { ContentGenerationMomentRow } from '@/lib/contentWorkbenchModel'
import { buildContentWorkbenchReviewQueueSummary } from '@/lib/contentWorkbenchReviewQueue'
import { localAgentClient, type AgentDraft } from '@/lib/localAgentClient'
import { mergeProjectWorkbenchArtifactReviewSearchParams } from '@/lib/projectWorkbenchDraftReview'

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
  const reviewDraftId = searchParams.get('draftId')?.trim() ?? ''
  const reviewMode = searchParams.get('view') === 'review' || reviewDraftId.length > 0

  useEffect(() => {
    if (reviewMode) setCollapsed(false)
  }, [reviewMode])

  const draftsQuery = useQuery<AgentDraft[]>({
    queryKey: ['workbench', 'production', 'content-drafts', projectId],
    queryFn: async () => {
      if (!projectId) return []
      const contentUnitProposals = await localAgentClient.listDrafts({
        projectId,
        kind: 'content_unit_proposal',
        status: ['draft', 'accepted'],
        limit: 20,
      })
      return dedupeDrafts(contentUnitProposals.drafts)
    },
    enabled: !!projectId,
    retry: false,
  })

  const drafts = draftsQuery.data ?? []
  const draftsById = useMemo(() => new Map(drafts.map((draft) => [draft.id, draft] as const)), [drafts])
  const selectedDraft = reviewDraftId ? draftsById.get(reviewDraftId) ?? null : drafts[0] ?? null
  const reviewModel = useMemo(() => {
    if (!selectedDraft) return null
    return buildContentDraftReviewModel(selectedDraft, {
      rowByMomentId: new Map(rows.map((row) => [row.moment.ID, row] as const)),
      rowByUnitId: new Map(rows.flatMap((row) => row.units.map((unit) => [unit.ID, row] as const))),
    })
  }, [rows, selectedDraft])
  const queueSummary = useMemo(() => buildContentWorkbenchReviewQueueSummary({
    drafts,
    selectedReview: reviewModel ? {
      warningCount: reviewModel.warnings.length,
      diffCount: reviewModel.diffs.length,
      addedCount: reviewModel.diffs.filter((diff) => diff.state === 'added').length,
      changedCount: reviewModel.diffs.filter((diff) => diff.state === 'changed').length,
    } : null,
  }), [drafts, reviewModel])

  function selectDraft(draftId: string) {
    setCollapsed(false)
    setSearchParams((current) => mergeProjectWorkbenchArtifactReviewSearchParams(current, {
      workbenchId: 'content_orchestration',
      primary: {
        proposalKind: 'content_unit_proposal',
        fallbackDraftId: draftId,
      },
    }), { replace: true })
  }

  function closeReview() {
    setCollapsed(true)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('view')
      next.delete('draftId')
      return next
    }, { replace: true })
  }

  return {
    collapsed,
    setCollapsed,
    reviewDraftId,
    reviewMode,
    draftsQuery,
    drafts,
    selectedDraft,
    reviewModel,
    queueSummary,
    showReviewPanel: reviewMode || draftsQuery.isLoading || (drafts.length > 0 && !collapsed),
    selectDraft,
    closeReview,
  }
}
