import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { canStartLocalAgentFromClient, localAgentClient, type AgentCapabilitiesResponse, type AgentHealth, type AgentInspectResponse } from '@/lib/localAgentClient'
import type { ConversationAgentContextConfig } from '@/components/agent/AgentContextPanels'
import type { Project } from '@/types'

export interface UseAgentLocalRuntimeContextControllerOptions {
  agentContextConfig: ConversationAgentContextConfig
  currentProject: Project | null
  enabled?: boolean
}

export function useAgentLocalRuntimeContextController({
  agentContextConfig,
  currentProject,
  enabled = true,
}: UseAgentLocalRuntimeContextControllerOptions) {
  const [startingLocalAgent, setStartingLocalAgent] = useState(false)
  const [localAgentStartError, setLocalAgentStartError] = useState<string | null>(null)
  const {
    data: localAgentHealth,
    error: localAgentHealthError,
    isFetching: checkingLocalAgent,
    refetch: refetchLocalAgentHealth,
  } = useQuery<AgentHealth>({
    queryKey: ['local-agent-health', localAgentClient.baseURL],
    queryFn: () => localAgentClient.ensureRunning(),
    enabled,
    retry: false,
    refetchInterval: enabled ? 5000 : false,
  })

  const localAgentOnline = !!localAgentHealth?.ok && !localAgentHealthError
  const canAutoStartLocalAgent = canStartLocalAgentFromClient()
  const localAgentErrorMessage = localAgentStartError
    ?? (!localAgentOnline && localAgentHealthError instanceof Error ? localAgentHealthError.message : null)

  const { data: localAgentInspect, isFetching: fetchingLocalAgentInspect, refetch: refetchLocalAgentInspect } = useQuery<AgentInspectResponse>({
    queryKey: ['local-agent-panel-inspect', localAgentClient.baseURL],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.inspect()
    },
    enabled: enabled && localAgentOnline,
    retry: false,
  })
  const { data: localAgentCapabilities, isFetching: fetchingLocalAgentCapabilities, refetch: refetchLocalAgentCapabilities } = useQuery<AgentCapabilitiesResponse>({
    queryKey: ['local-agent-panel-capabilities', localAgentClient.baseURL, currentProject?.ID ?? null, agentContextConfig.enabled ? agentContextConfig.manifest?.id ?? 'custom' : 'default'],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.getCapabilities({
        ...(currentProject ? { projectId: currentProject.ID } : {}),
      })
    },
    enabled: enabled && localAgentOnline,
    retry: false,
  })

  const refreshAgentCatalogContext = useCallback(() => {
    void refetchLocalAgentInspect()
    void refetchLocalAgentCapabilities()
  }, [refetchLocalAgentCapabilities, refetchLocalAgentInspect])

  const startLocalAgent = useCallback(async () => {
    if (startingLocalAgent) return
    setStartingLocalAgent(true)
    setLocalAgentStartError(null)
    try {
      await localAgentClient.ensureRunning()
      await refetchLocalAgentHealth()
    } catch (error) {
      setLocalAgentStartError(error instanceof Error ? error.message : String(error))
    } finally {
      setStartingLocalAgent(false)
    }
  }, [refetchLocalAgentHealth, startingLocalAgent])

  return {
    canAutoStartLocalAgent,
    checkingLocalAgent,
    fetchingLocalAgentCapabilities,
    fetchingLocalAgentInspect,
    localAgentCapabilities,
    localAgentErrorMessage,
    localAgentHealth,
    localAgentInspect,
    localAgentOnline,
    refetchLocalAgentHealth,
    refreshAgentCatalogContext,
    startLocalAgent,
    startingLocalAgent,
  }
}
