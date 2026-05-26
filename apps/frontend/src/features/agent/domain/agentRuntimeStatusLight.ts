import type { AgentRun, AgentRunStatus, AgentRuntimeSnapshotV2 } from '@/shared/infrastructure/localAgentClient'
import { runtimeStatusStateFromSnapshot } from '@movscript/event-state'

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

export const WAITING_RUNTIME_STATUS_LIGHT: AgentRuntimeStatusLight = {
  state: 'waiting',
  label: '等待',
  detail: 'Runtime 正在等待外部信息或用户确认，例如异步生成任务结果。',
}

export const ACTIVE_RUNTIME_STATUS_LIGHT: AgentRuntimeStatusLight = {
  state: 'active',
  label: '运行',
  detail: 'Runtime 正在触发 run 循环。',
}

const ACTIVE_RUN_STATUSES = new Set<AgentRunStatus>(['queued', 'in_progress'])
const WAITING_RUN_STATUSES = new Set<AgentRunStatus>(['requires_action'])
export function runtimeStatusLightFromThreadRuntimeSnapshot(
  snapshot?: Pick<AgentRuntimeSnapshotV2, 'entities' | 'scope'> | null,
): AgentRuntimeStatusLight {
  const state = runtimeStatusStateFromSnapshot(snapshot)
  if (state === 'active') return ACTIVE_RUNTIME_STATUS_LIGHT
  if (state === 'waiting') return WAITING_RUNTIME_STATUS_LIGHT
  return STOPPED_RUNTIME_STATUS_LIGHT
}

export function runtimeStatusLightFromActiveRun(
  run: AgentRun | null | undefined,
  fallback: AgentRuntimeStatusLight = STOPPED_RUNTIME_STATUS_LIGHT,
): AgentRuntimeStatusLight {
  if (!run) return fallback
  if (ACTIVE_RUN_STATUSES.has(run.status)) return ACTIVE_RUNTIME_STATUS_LIGHT
  if (WAITING_RUN_STATUSES.has(run.status)) return WAITING_RUNTIME_STATUS_LIGHT
  return fallback
}
