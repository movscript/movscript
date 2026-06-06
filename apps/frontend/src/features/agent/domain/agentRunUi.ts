import type { AgentTraceEvent } from '@/shared/infrastructure/providerSessionClient'
import type { AgentTraceView } from './agent-run-ui/types'
import { traceKindLabel as traceKindLabelImpl } from './agent-run-ui/labels'
import { agentTraceView as agentTraceViewImpl, hasUnloadedTraceEvents as hasUnloadedTraceEventsImpl } from './agent-run-ui/traceView'

export type * from './agent-run-ui/types'
export {
  buildTraceEventLink,
  canCancelWorkerRun,
  traceDeepLinkMissing,
  traceEventIdFromHash,
} from './agent-run-ui/links'
export {
  agentPlanStatusLabel,
  approvalImpactLabel,
  approvalPermissionLabel,
  approvalRiskLabel,
  approvalStatusLabel,
  inputTypeLabel,
  runApprovalModeLabel,
  runRoleLabel,
  runStatusLabel,
  toolApprovalLabel,
  toolGrantModeLabel,
  traceCategoryLabel,
  traceEventStatusLabel,
} from './agent-run-ui/labels'
export { formatTraceEventDuration, traceEventDurationMs } from './agent-run-ui/traceView'

export function traceKindLabel(kind: AgentTraceEvent['kind']): string {
  return traceKindLabelImpl(kind)
}

export function agentTraceView(event: AgentTraceEvent): AgentTraceView {
  return agentTraceViewImpl(event)
}

export function hasUnloadedTraceEvents(input: { loaded: number; total?: number; hasMore: boolean }): boolean {
  return hasUnloadedTraceEventsImpl(input)
}
