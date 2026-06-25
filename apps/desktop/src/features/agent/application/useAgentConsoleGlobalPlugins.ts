import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { agentConsoleKeys } from '@/features/agent/application/agentQueryKeys'
import { requireWorkspaceRootAPI } from '@/features/agent/application/movScriptWorkspaceElectron'
import {
  loadProjectPluginSnapshot,
  setProjectPluginEnabled,
  type ProjectPluginSnapshot,
} from '@/features/plugins/application/projectPlugins'

export function useAgentConsoleGlobalPlugins({
  onChanged,
}: {
  onChanged: () => void
}) {
  const [togglingKey, setTogglingKey] = useState<string>()
  const [error, setError] = useState<string>()
  const query = useQuery({
    queryKey: agentConsoleKeys.globalPlugins,
    queryFn: async () => {
      const root = await requireWorkspaceRootAPI().getRoot()
      const movScriptHomeDir = root.movScriptHomeDir ?? root.workspaceDir
      return loadProjectPluginSnapshot({ movScriptHomeDir, workspaceDir: movScriptHomeDir })
    },
  })

  async function togglePlugin(plugin: ProjectPluginSnapshot['systemPlugins'][number], enabled: boolean) {
    const snapshot = query.data
    const movScriptHomeDir = snapshot?.movScriptHomeDir ?? snapshot?.workspaceDir
    if (!movScriptHomeDir) return
    setTogglingKey(plugin.pluginKey)
    setError(undefined)
    try {
      await setProjectPluginEnabled({ movScriptHomeDir, workspaceDir: movScriptHomeDir }, plugin.pluginKey, enabled)
      await query.refetch()
      onChanged()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setTogglingKey(undefined)
    }
  }

  return {
    error: error ?? (query.error instanceof Error ? query.error.message : undefined),
    loading: query.isLoading,
    refresh: () => void query.refetch(),
    refreshing: query.isFetching,
    snapshot: query.data,
    togglePlugin,
    togglingKey,
  }
}
