import { useQuery } from '@tanstack/react-query'

import { localAgentClient, type AgentDraft } from '@/lib/localAgentClient'

type SearchParamsSetter = (
  nextInit: URLSearchParams | ((current: URLSearchParams) => URLSearchParams),
  navigateOptions?: { replace?: boolean },
) => void

type PreProductionReviewDraftKind = Extract<AgentDraft['kind'], 'setting_proposal' | 'asset_proposal'>

export async function loadPreProductionReviewDrafts(
  projectId: number,
  kind: PreProductionReviewDraftKind,
  draftIds: string[],
): Promise<AgentDraft[]> {
  const ids = Array.from(new Set(draftIds.map((id) => id.trim()).filter(Boolean)))
  if (ids.length === 0) return []
  const drafts = await Promise.all(ids.map(async (draftId) => {
    try {
      return await localAgentClient.getDraft(draftId)
    } catch {
      return null
    }
  }))
  return drafts.filter((draft): draft is AgentDraft => Boolean(draft && draft.projectId === projectId && draft.kind === kind))
}

export function usePreProductionReviewController({
  projectId,
  searchParams,
  setSearchParams,
}: {
  projectId?: number
  searchParams: URLSearchParams
  setSearchParams: SearchParamsSetter
}) {
  const workspaceView = searchParams.get('view') === 'review' ? 'review' : 'main'
  const openedDraftId = searchParams.get('draftId')?.trim() || ''
  const openedSettingDraftId = searchParams.get('settingDraftId')?.trim() || ''
  const openedAssetProposalDraftId = searchParams.get('assetProposalDraftId')?.trim() || ''

  const assetProposalDraftsQuery = useQuery<AgentDraft[]>({
    queryKey: ['asset-proposal-drafts', projectId, openedAssetProposalDraftId, openedDraftId],
    queryFn: () => loadPreProductionReviewDrafts(projectId!, 'asset_proposal', [openedAssetProposalDraftId, openedDraftId]),
    enabled: !!projectId && workspaceView === 'review' && Boolean(openedAssetProposalDraftId || openedDraftId),
    refetchInterval: workspaceView === 'review' ? 1500 : false,
  })
  const settingProposalDraftsQuery = useQuery<AgentDraft[]>({
    queryKey: ['setting-proposal-drafts', projectId, openedSettingDraftId, openedDraftId],
    queryFn: () => loadPreProductionReviewDrafts(projectId!, 'setting_proposal', [openedSettingDraftId, openedDraftId]),
    enabled: !!projectId && workspaceView === 'review' && Boolean(openedSettingDraftId || openedDraftId),
    refetchInterval: workspaceView === 'review' ? 1500 : false,
  })

  function setWorkspaceView(view: 'main' | 'review') {
    const next = new URLSearchParams(searchParams)
    if (view === 'review') next.set('view', 'review')
    else next.delete('view')
    setSearchParams(next, { replace: true })
  }

  return {
    workspaceView,
    openedDraftId,
    openedSettingDraftId,
    openedAssetProposalDraftId,
    assetProposalDraftsQuery,
    settingProposalDraftsQuery,
    setWorkspaceView,
    openReviewWorkspace: () => setWorkspaceView('review'),
    openMainWorkspace: () => setWorkspaceView('main'),
  }
}
