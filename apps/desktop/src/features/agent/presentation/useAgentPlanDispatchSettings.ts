import { useCallback, useMemo } from 'react'
import type { PlanDispatchSettings } from '@/features/agent/application/agentPlanActions'
import type { AgentSettings } from '@/features/agent/state/agentStore'

interface UseAgentPlanDispatchSettingsInput {
  settings: AgentSettings
  updateSettings: (settings: Partial<AgentSettings>) => void
}

export function useAgentPlanDispatchSettings({
  settings,
  updateSettings,
}: UseAgentPlanDispatchSettingsInput) {
  const planDispatchSettings = useMemo<PlanDispatchSettings>(() => ({
    maxWorkers: settings.planMaxWorkers,
    maxTaskAttempts: settings.planMaxTaskAttempts,
    workerTimeoutMs: settings.planWorkerTimeoutMs,
  }), [settings.planMaxWorkers, settings.planMaxTaskAttempts, settings.planWorkerTimeoutMs])

  const updateTaskGraphDispatchSettings = useCallback((next: PlanDispatchSettings) => {
    updateSettings({
      planMaxWorkers: next.maxWorkers,
      planMaxTaskAttempts: next.maxTaskAttempts,
      planWorkerTimeoutMs: next.workerTimeoutMs,
    })
  }, [updateSettings])

  return {
    planDispatchSettings,
    updateTaskGraphDispatchSettings,
  }
}
