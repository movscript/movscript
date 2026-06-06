import { useQuery } from '@tanstack/react-query'

import { providerSessionClient, type WorkspaceArtifact } from '@/shared/infrastructure/providerSessionClient'

type SearchParamsSetter = (
  nextInit: URLSearchParams | ((current: URLSearchParams) => URLSearchParams),
  navigateOptions?: { replace?: boolean },
) => void

type PreProductionReviewWorkspaceKind = Extract<WorkspaceArtifact['kind'], 'setting_workspace' | 'asset_workspace'>

export async function loadPreProductionReviewWorkspaces(
  projectId: number,
  kind: PreProductionReviewWorkspaceKind,
  workspaceIds: string[],
): Promise<WorkspaceArtifact[]> {
  const ids = Array.from(new Set(workspaceIds.map((id) => id.trim()).filter(Boolean)))
  if (ids.length === 0) return []
  const workspaces = await Promise.all(ids.map(async (workspaceId) => {
    try {
      return await providerSessionClient.getWorkspaceArtifact(workspaceId)
    } catch {
      return null
    }
  }))
  return workspaces.filter((workspace): workspace is WorkspaceArtifact => Boolean(workspace && workspace.projectId === projectId && workspace.kind === kind))
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
  const openedWorkspaceId = searchParams.get('workspaceId')?.trim() || ''
  const openedSettingWorkspaceId = searchParams.get('settingWorkspaceId')?.trim() || ''
  const openedAssetWorkspaceArtifactId = searchParams.get('assetWorkspaceArtifactId')?.trim()
    || searchParams.get('assetWorkspaceWorkspaceId')?.trim()
    || ''

  const assetWorkspaceArtifactsQuery = useQuery<WorkspaceArtifact[]>({
    queryKey: ['asset-workspace-workspaces', projectId, openedAssetWorkspaceArtifactId, openedWorkspaceId],
    queryFn: () => loadPreProductionReviewWorkspaces(projectId!, 'asset_workspace', [openedAssetWorkspaceArtifactId, openedWorkspaceId]),
    enabled: !!projectId && workspaceView === 'review' && Boolean(openedAssetWorkspaceArtifactId || openedWorkspaceId),
    refetchInterval: workspaceView === 'review' ? 1500 : false,
  })
  const settingWorkspaceArtifactsQuery = useQuery<WorkspaceArtifact[]>({
    queryKey: ['setting-workspace-workspaces', projectId, openedSettingWorkspaceId, openedWorkspaceId],
    queryFn: () => loadPreProductionReviewWorkspaces(projectId!, 'setting_workspace', [openedSettingWorkspaceId, openedWorkspaceId]),
    enabled: !!projectId && workspaceView === 'review' && Boolean(openedSettingWorkspaceId || openedWorkspaceId),
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
    openedWorkspaceId,
    openedSettingWorkspaceId,
    openedAssetWorkspaceWorkspaceId: openedAssetWorkspaceArtifactId,
    openedAssetWorkspaceArtifactId,
    assetWorkspaceArtifactsQuery,
    settingWorkspaceArtifactsQuery,
    assetWorkspaceWorkspacesQuery: assetWorkspaceArtifactsQuery,
    settingWorkspaceWorkspacesQuery: settingWorkspaceArtifactsQuery,
    setWorkspaceView,
    openReviewWorkspace: () => setWorkspaceView('review'),
    openMainWorkspace: () => setWorkspaceView('main'),
  }
}
