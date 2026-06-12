import type {
  AgentChatGoalStatus,
  AgentThreadGoalState,
} from './agentChatProtocol.js'

export function agentThreadGoalStateFromUnknown(value: unknown): AgentThreadGoalState | undefined {
  if (!isRecord(value)) return undefined
  const objective = stringValue(value.objective)
  if (!objective) return undefined
  return {
    objective,
    status: agentChatGoalStatusValue(value.status) ?? 'active',
    tokenBudget: nullableNumberValue(value.tokenBudget),
    tokensUsed: numberValue(value.tokensUsed),
    timeUsedSeconds: numberValue(value.timeUsedSeconds),
    createdAt: numberValue(value.createdAt),
    updatedAt: numberValue(value.updatedAt),
  }
}

export function agentThreadGoalStatusLabel(status: AgentChatGoalStatus): string {
  if (status === 'active') return '追求目标'
  if (status === 'paused') return '目标已暂停'
  if (status === 'blocked') return '目标受阻'
  if (status === 'usageLimited') return '目标额度受限'
  if (status === 'budgetLimited') return '目标预算受限'
  if (status === 'complete') return '目标已达成'
  return status
}

function agentChatGoalStatusValue(value: unknown): AgentChatGoalStatus | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() as AgentChatGoalStatus : undefined
}

function nullableNumberValue(value: unknown): number | null | undefined {
  if (value === null) return null
  return numberValue(value)
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
