import { defineFeatureStatusRecipeGroup, type UiStatusRecipe } from '@/shared/presentation/semanticRecipe'
import type { GenerationJobBadgeState } from '@/features/agent/domain/agentGenerationDisplay'
import type { AgentWorkspaceStatus, AgentRun } from '@/shared/infrastructure/localAgentClient'

export type AgentStatusRecipe = UiStatusRecipe

export function agentRunStatusRecipe(status: AgentRun['status'] | string): AgentStatusRecipe {
  return agentRunStatus.recipe(status)
}

export function agentRunInteractionStatusRecipe(status: string): AgentStatusRecipe {
  return agentRunInteractionStatus.recipe(status)
}

export function agentRunInteractionActionStatusRecipe(status: string): AgentStatusRecipe {
  return agentRunInteractionActionStatus.recipe(status)
}

export function agentWorkspaceStatusRecipe(status: AgentWorkspaceStatus | string): AgentStatusRecipe {
  return agentWorkspaceStatus.recipe(status)
}

export function agentGenerationStatusRecipe(state: GenerationJobBadgeState): AgentStatusRecipe {
  return agentGenerationStatus.recipe(state)
}

export function agentToolCallStatusRecipe(status: string): AgentStatusRecipe {
  return agentToolCallStatus.recipe(status)
}

export function agentConfigStatusRecipe(configured: boolean): AgentStatusRecipe {
  return agentReadinessStatusRecipe(configured)
}

export function agentTestResultRecipe(ok: boolean): AgentStatusRecipe {
  return agentBooleanResultStatus.recipe(ok ? 'ok' : 'failed')
}

export function agentAttentionStatusRecipe(attentionCount: number, failureCount = 0): AgentStatusRecipe {
  if (attentionCount > 0) return agentAttentionStatus.recipe('attention')
  if (failureCount > 0) return agentAttentionStatus.recipe('failed')
  return agentAttentionStatus.recipe('default')
}

export function agentReadinessStatusRecipe(ready: boolean): AgentStatusRecipe {
  return agentReadinessStatus.recipe(ready ? 'ready' : 'missing')
}

export function agentAvailabilityStatusRecipe(available: boolean): AgentStatusRecipe {
  return agentAvailabilityStatus.recipe(available ? 'available' : 'unavailable')
}

export function agentOptionalStatusRecipe(present: boolean): AgentStatusRecipe {
  return agentOptionalStatus.recipe(present ? 'present' : 'default')
}

export function agentSeverityStatusRecipe(severity: string): AgentStatusRecipe {
  return agentSeverityStatus.recipe(severity)
}

export function agentPerformanceHealthRecipe(degraded: boolean): AgentStatusRecipe {
  return agentPerformanceHealthStatus.recipe(degraded ? 'degraded' : 'healthy')
}

export function agentPerformanceOperationRecipe(status: string, slow = false): AgentStatusRecipe {
  if (slow && status !== 'error' && status !== 'failed' && status !== 'cancelled' && status !== 'blocked') {
    return agentPerformanceOperationStatus.recipe('slow')
  }
  return agentPerformanceOperationStatus.recipe(status)
}

export function agentPerformanceLogRecipe(level: string): AgentStatusRecipe {
  return agentPerformanceLogStatus.recipe(level)
}

export function agentSlowDiagnosticRecipe(severity: string): AgentStatusRecipe {
  return agentSlowDiagnosticStatus.recipe(severity)
}

const agentRunStatus = defineFeatureStatusRecipeGroup('agent.run.status', {
  completed: 'success',
  completed_with_warnings: 'warning',
  requires_action: 'warning',
  failed: 'danger',
  default: 'neutral',
})

const agentRunInteractionStatus = defineFeatureStatusRecipeGroup('agent.task.status', {
  completed: 'success',
  done: 'success',
  in_progress: 'info',
  running: 'info',
  queued: 'info',
  pending: 'info',
  completed_with_warnings: 'warning',
  requires_action: 'warning',
  blocked: 'warning',
  needs_review: 'warning',
  failed: 'danger',
  cancelled: 'danger',
  rejected: 'danger',
  default: 'neutral',
})

const agentRunInteractionActionStatus = defineFeatureStatusRecipeGroup('agent.run-interaction-action.status', {
  approved: 'success',
  answered: 'success',
  completed: 'success',
  rejected: 'danger',
  cancelled: 'danger',
  failed: 'danger',
  pending: 'warning',
  in_progress: 'warning',
  default: 'neutral',
})

const agentWorkspaceStatus = defineFeatureStatusRecipeGroup('agent.workspace.status', {
  applied: 'success',
  rejected: 'danger',
  accepted: 'warning',
  default: 'neutral',
})

const agentGenerationStatus = defineFeatureStatusRecipeGroup('agent.generation.status', {
  completed: 'success',
  cancelled: 'warning',
  timeout: 'warning',
  failed: 'danger',
  default: 'neutral',
})

const agentToolCallStatus = defineFeatureStatusRecipeGroup('agent.tool-call.status', {
  completed: 'success',
  failed: 'danger',
  blocked: 'warning',
  default: 'neutral',
})

const agentBooleanResultStatus = defineFeatureStatusRecipeGroup('agent.boolean-result.status', {
  ok: 'success',
  failed: 'danger',
  default: 'neutral',
})

const agentAttentionStatus = defineFeatureStatusRecipeGroup('agent.attention.status', {
  attention: 'warning',
  failed: 'danger',
  default: 'neutral',
})

const agentReadinessStatus = defineFeatureStatusRecipeGroup('agent.readiness.status', {
  ready: 'success',
  missing: 'warning',
  default: 'neutral',
})

const agentAvailabilityStatus = defineFeatureStatusRecipeGroup('agent.availability.status', {
  available: 'success',
  unavailable: 'danger',
  default: 'neutral',
})

const agentOptionalStatus = defineFeatureStatusRecipeGroup('agent.optional.status', {
  present: 'success',
  default: 'neutral',
})

const agentSeverityStatus = defineFeatureStatusRecipeGroup('agent.severity.status', {
  ready: 'success',
  success: 'success',
  action: 'danger',
  error: 'danger',
  danger: 'danger',
  failed: 'danger',
  warning: 'warning',
  blocked: 'warning',
  default: 'neutral',
})

const agentPerformanceHealthStatus = defineFeatureStatusRecipeGroup('agent.performance.health.status', {
  healthy: 'success',
  degraded: 'warning',
  default: 'neutral',
})

const agentPerformanceOperationStatus = defineFeatureStatusRecipeGroup('agent.performance.operation.status', {
  error: 'danger',
  failed: 'danger',
  cancelled: 'warning',
  blocked: 'warning',
  slow: 'warning',
  success: 'success',
  completed: 'success',
  running: 'neutral',
  default: 'neutral',
})

const agentPerformanceLogStatus = defineFeatureStatusRecipeGroup('agent.performance.log.status', {
  error: 'danger',
  warning: 'warning',
  default: 'neutral',
})

const agentSlowDiagnosticStatus = defineFeatureStatusRecipeGroup('agent.slow-diagnostic.status', {
  error: 'danger',
  default: 'warning',
})
