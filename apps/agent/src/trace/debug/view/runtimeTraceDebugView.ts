import type { AgentRun, AgentTraceEvent } from '../../../state/shared/types.js'
import type { AgentRunTraceSummary } from '@movscript/protocol'
import {
  AGENT_DEBUG_FIELD_GUIDE,
  DEBUG_BUNDLE_CAPABILITIES,
  DEBUG_BUNDLE_SCHEMA,
  DEBUG_BUNDLE_SCHEMA_URL,
} from './runtime-trace-debug-view/contract.js'
import {
  buildDebugCoverageSummary,
  buildDebugReadinessChecklist,
} from './runtime-trace-debug-view/coverage.js'
import {
  buildAttentionEvents,
  buildMessageWrites,
  buildPendingActions,
  buildToolCalls,
  messageWriteFromEvent,
} from './runtime-trace-debug-view/eventViews.js'
import {
  buildModelCallContexts,
  buildModelCallSummaries,
} from './runtime-trace-debug-view/modelCalls.js'
import {
  buildPromptDetails,
  buildRoundContextUpdateViews,
} from './runtime-trace-debug-view/promptContext.js'
import {
  buildDebugReportText,
  debugBundleRunSnapshot,
  debugBundleRunSummary,
} from './runtime-trace-debug-view/report.js'
import {
  buildContextMutationViews,
  buildRuntimeSummary,
  buildSkillTraceSummary,
  correlatePromptDetailsWithRuntimeState,
} from './runtime-trace-debug-view/runtimeState.js'
import type {
  AgentTraceDebugView,
} from './runtime-trace-debug-view/types.js'

export { AGENT_DEBUG_FIELD_GUIDE } from './runtime-trace-debug-view/contract.js'
export type {
  AgentContextMutationView,
  AgentDebugAttentionEvent,
  AgentDebugCoverageSummary,
  AgentDebugFieldGuideItem,
  AgentDebugReadinessItem,
  AgentGenericPromptProjectionView,
  AgentMessageWriteView,
  AgentModelCallContextView,
  AgentModelCallSummary,
  AgentPendingActionView,
  AgentPromptContextLedgerStateView,
  AgentPromptDetailView,
  AgentPromptHistoryProjectionView,
  AgentPromptSkillStateView,
  AgentRoundContextUpdateView,
  AgentRunRuntimeSummary,
  AgentRuntimeSkillOmissionView,
  AgentSkillContextProjectionView,
  AgentSkillTraceEntry,
  AgentSkillTraceSummary,
  AgentToolCallView,
  AgentTraceDebugView,
  AgentTraceRefView,
} from './runtime-trace-debug-view/types.js'

export function buildRuntimeTraceDebugView(input: {
  run: AgentRun
  events: AgentTraceEvent[]
  summary: AgentRunTraceSummary
  generatedAt?: string
}): AgentTraceDebugView {
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const events = [...input.events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const modelCalls = buildModelCallSummaries(events)
  const coverage = buildDebugCoverageSummary({ events, total: input.summary.total, modelCalls })
  const readinessChecklist = buildDebugReadinessChecklist(coverage)
  const basePromptDetails = buildPromptDetails(events)
  const roundContextUpdates = buildRoundContextUpdateViews(events)
  const contextMutations = buildContextMutationViews(events)
  const messageWrites = buildMessageWrites(events)
  const toolCalls = buildToolCalls(events)
  const modelCallContexts = buildModelCallContexts({ modelCalls, events, messageWriteFromEvent })
  const skillTimeline = buildSkillTraceSummary(events)
  const promptDetails = correlatePromptDetailsWithRuntimeState({
    promptDetails: basePromptDetails,
    events,
    skillTimeline,
    contextMutations,
  })
  const attentionEvents = buildAttentionEvents(events)
  const pendingActions = buildPendingActions(input.run)
  const runtimeSummary = buildRuntimeSummary({
    events,
    promptDetails,
    skillTimeline,
    toolCalls,
    contextMutations,
    roundContextUpdates,
    pendingActions,
  })
  const trace = {
    loaded: events.length,
    total: input.summary.total,
    hasMore: false as const,
  }
  const reportText = buildDebugReportText({
    runId: input.run.id,
    run: input.run,
    coverage,
    modelCalls,
    events,
  })
  const bundle = {
    schema: DEBUG_BUNDLE_SCHEMA,
    schemaUrl: DEBUG_BUNDLE_SCHEMA_URL,
    generatedAt,
    capabilities: DEBUG_BUNDLE_CAPABILITIES,
    runId: input.run.id,
    run: debugBundleRunSnapshot(input.run),
    runSummary: debugBundleRunSummary(input.run),
    trace,
    fieldGuide: AGENT_DEBUG_FIELD_GUIDE,
    coverage,
    readinessChecklist,
    modelCalls,
    modelCallContexts,
    runtimeSummary,
    roundContextUpdates,
    promptDetails,
    contextMutations,
    messageWrites,
    toolCalls,
    attentionEvents,
    pendingActions,
    events,
  }
  return {
    schema: 'movscript.agent-trace-debug-view.v1',
    generatedAt,
    runId: input.run.id,
    run: input.run,
    trace,
    coverage,
    readinessChecklist,
    modelCalls,
    modelCallContexts,
    runtimeSummary,
    skillTimeline,
    roundContextUpdates,
    promptDetails,
    contextMutations,
    messageWrites,
    toolCalls,
    attentionEvents,
    pendingActions,
    fieldGuide: AGENT_DEBUG_FIELD_GUIDE,
    events,
    reportText,
    bundle,
  }
}
