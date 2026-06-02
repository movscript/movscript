import { useQuery } from '@tanstack/react-query'

import { localAgentClient, type AgentWorkspace } from '@/shared/infrastructure/localAgentClient'

type SearchParamsSetter = (
  nextInit: URLSearchParams | ((current: URLSearchParams) => URLSearchParams),
  navigateOptions?: { replace?: boolean },
) => void

type PreProductionReviewWorkspaceKind = Extract<AgentWorkspace['kind'], 'setting_workspace' | 'asset_workspace'>

export async function loadPreProductionReviewWorkspaces(
  projectId: number,
  kind: PreProductionReviewWorkspaceKind,
  workspaceIds: string[],
): Promise<AgentWorkspace[]> {
  const ids = Array.from(new Set(workspaceIds.map((id) => id.trim()).filter(Boolean)))
  if (ids.length === 0) return []
  const workspaces = await Promise.all(ids.map(async (workspaceId) => {
    try {
      return await localAgentClient.getWorkspace(workspaceId)
    } catch {
      return null
    }
  }))
  return workspaces.filter((workspace): workspace is AgentWorkspace => Boolean(workspace && workspace.projectId === projectId && workspace.kind === kind))
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
  const openedAssetWorkspaceWorkspaceId = searchParams.get('assetWorkspaceWorkspaceId')?.trim() || ''

  const assetWorkspaceWorkspacesQuery = useQuery<AgentWorkspace[]>({
    queryKey: ['asset-workspace-workspaces', projectId, openedAssetWorkspaceWorkspaceId, openedWorkspaceId],
    queryFn: () => loadPreProductionReviewWorkspaces(projectId!, 'asset_workspace', [openedAssetWorkspaceWorkspaceId, openedWorkspaceId]),
    enabled: !!projectId && workspaceView === 'review' && Boolean(openedAssetWorkspaceWorkspaceId || openedWorkspaceId),
    refetchInterval: workspaceView === 'review' ? 1500 : false,
  })
  const settingWorkspaceWorkspacesQuery = useQuery<AgentWorkspace[]>({
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
    openedAssetWorkspaceWorkspaceId,
    assetWorkspaceWorkspacesQuery,
    settingWorkspaceWorkspacesQuery,
    setWorkspaceView,
    openReviewWorkspace: () => setWorkspaceView('review'),
    openMainWorkspace: () => setWorkspaceView('main'),
  }
}
