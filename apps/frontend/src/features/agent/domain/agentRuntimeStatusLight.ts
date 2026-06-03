import type { AgentRuntimeStatusRecord } from '@/shared/infrastructure/localAgentClient'

export type AgentRuntimeStatusLightState = 'stopped' | 'waiting' | 'active'

export interface AgentRuntimeStatusLight {
  state: AgentRuntimeStatusLightState
  label: string
  detail: string
}

export const STOPPED_RUNTIME_STATUS_LIGHT: AgentRuntimeStatusLight = {
  state: 'stopped',
  label: '停止',
  detail: 'Runtime 当前不会自行触发新的 run，需要新的用户输入。',
}

export function runtimeStatusLightFromRuntimeStatusRecord(
  record: AgentRuntimeStatusRecord | undefined,
): AgentRuntimeStatusLight | undefined {
  if (record?.status.kind !== 'status_light') return undefined
  return {
    state: record.status.state,
    label: record.status.label,
    detail: record.status.detail,
  }
}
