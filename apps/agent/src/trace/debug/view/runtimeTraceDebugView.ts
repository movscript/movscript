import type { AgentRun, AgentTraceEvent } from '../../../state/shared/types.js'
import type { AgentRunTraceSummary } from '@movscript/protocol'
import {
  AGENT_DEBUG_FIELD_GUIDE,
  DEBUG_BUNDLE_CAPABILITIES,
  DEBUG_BUNDLE_SCHEMA_V2,
  DEBUG_BUNDLE_SCHEMA_URL_V2,
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
  buildModelContextViews,
  buildModelCallSummaries,
} from './runtime-trace-debug-view/modelCalls.js'
import {
  buildPromptDetails,
  buildRuntimeContextProjectionViews,
} from './runtime-trace-debug-view/promptContext.js'
import {
  buildRuntimeFrames,
} from './runtime-trace-debug-view/runtimeFrames.js'
import {
  buildDebugReportText,
  debugBundleRunSnapshot,
  debugBundleRunSummary,
} from './runtime-trace-debug-view/report.js'
import {
  buildContextMutationViews,
  buildRuntimeContextDiffWindowViews,
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
  AgentRuntimeContextDiffWindowView,
  AgentRuntimeContextProjectionView,
  AgentRuntimeContextChangeView,
  AgentRuntimeContextDiffView,
  AgentRuntimeFrame,
  AgentRuntimeFrameFocus,
  AgentRuntimeFrameKind,
  AgentRuntimeFinalizeFrame,
  AgentRuntimeRoundFrame,
  AgentRuntimeSetupFrame,
  AgentRunRuntimeSummary,
  AgentRuntimeSkillOmissionView,
  AgentSkillContextProjectionView,
  AgentSkillTraceEntry,
  AgentRuntimeSkillTraceSummary,
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
  const contextProjections = buildRuntimeContextProjectionViews(events)
  const contextMutations = buildContextMutationViews(events)
  const contextDiffWindows = buildRuntimeContextDiffWindowViews({ events, contextProjections, contextMutations })
  const messageWrites = buildMessageWrites(events)
  const toolCalls = buildToolCalls(events)
  const modelContext = buildModelContextViews({ modelCalls, events, messageWriteFromEvent })
  const skillTrace = buildSkillTraceSummary(events)
  const promptDetails = correlatePromptDetailsWithRuntimeState({
    promptDetails: basePromptDetails,
    events,
    skillTrace,
    contextMutations,
  })
  const attentionEvents = buildAttentionEvents(events)
  const pendingActions = buildPendingActions(input.run)
  const runtimeSummary = buildRuntimeSummary({
    events,
    promptDetails,
    skillTrace,
    toolCalls,
    contextMutations,
    contextProjections,
    pendingActions,
  })
  const runtimeFrames = buildRuntimeFrames({
    events,
    promptDetails,
    contextProjections,
    contextDiffWindows,
    contextMutations,
    modelCalls,
    modelContext,
    skillTrace: skillTrace.entries,
    messageWrites,
    toolCalls,
    attentionEvents,
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
    schema: DEBUG_BUNDLE_SCHEMA_V2,
    schemaUrl: DEBUG_BUNDLE_SCHEMA_URL_V2,
    generatedAt,
    capabilities: DEBUG_BUNDLE_CAPABILITIES,
    runId: input.run.id,
    run: debugBundleRunSnapshot(input.run),
    runSummary: debugBundleRunSummary(input.run),
    trace,
    fieldGuide: AGENT_DEBUG_FIELD_GUIDE,
    coverage,
    readinessChecklist,
    runtimeSummary,
    runtimeFrames,
    attentionEvents,
    pendingActions,
    events,
  }
  return {
    schema: 'movscript.agent-trace-debug-view.v2',
    generatedAt,
    runId: input.run.id,
    run: input.run,
    trace,
    coverage,
    readinessChecklist,
    runtimeSummary,
    runtimeFrames,
    attentionEvents,
    pendingActions,
    fieldGuide: AGENT_DEBUG_FIELD_GUIDE,
    events,
    reportText,
    bundle,
  }
}
