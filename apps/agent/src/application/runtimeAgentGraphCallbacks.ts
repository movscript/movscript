import type { AgentGraphInput, AgentGraphTraceInput } from '../orchestration/agentGraph.js'
import type { GenerationEvent } from '../generation/generationEvents.js'
import type { AgentRun, AgentRunStep, AgentTraceEvent, AgentTraceEventKind } from '../state/types.js'
import type { AgentStore } from '../state/store.js'
import type { AgentRunRoundInfo } from '../state/runRound.js'
import { completeRuntimeRunStep } from './runtimeRunStepCompletion.js'

export interface RuntimeAgentGraphTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  round?: AgentRunRoundInfo
  stepId?: string
  toolName?: string
  data?: unknown
  durationMs?: number
}

export function createRuntimeAgentGraphCallbacks(input: {
  store: Pick<AgentStore, 'updateRun'>
  run: AgentRun
  now: () => string
  recordTrace: (run: AgentRun, trace: RuntimeAgentGraphTraceInput) => void
  emitVolatileTrace: (run: AgentRun, trace: AgentGraphTraceInput) => void
  createStep: (run: AgentRun, type: AgentRunStep['type'], round: AgentRunRoundInfo, toolName?: string) => AgentRunStep
  emitRunSnapshot: (run: AgentRun) => void
}): Pick<AgentGraphInput, 'onTrace' | 'onGenerationEvent' | 'onStepCreate' | 'onStepComplete'> {
  return {
    onTrace: (traceInput) => {
      if (traceInput.volatile) {
        input.emitVolatileTrace(input.run, traceInput)
        return
      }
      input.recordTrace(input.run, {
        kind: traceInput.kind,
        title: traceInput.title,
        summary: traceInput.summary,
        status: traceInput.status,
        round: roundFromGraphTrace(traceInput),
        stepId: traceInput.stepId,
        toolName: traceInput.toolName,
        data: traceInput.data,
        durationMs: traceInput.durationMs,
      })
      input.store.updateRun(input.run)
    },
    onGenerationEvent: (event, trace) => {
      input.recordTrace(input.run, {
        kind: 'tool_call',
        title: generationTraceTitle(event),
        summary: event.message,
        status: generationTraceStatus(event),
        round: roundFromGraphTrace(trace),
        stepId: trace.stepId,
        toolName: trace.toolName,
        data: { generation: event },
      })
      input.store.updateRun(input.run)
    },
    onStepCreate: (type, roundIndex, roundLabel, roundSource, toolName) => {
      const step = input.createStep(input.run, type, { roundId: `round_${roundIndex}`, roundIndex, roundLabel, roundSource }, toolName)
      return step.id
    },
    onStepComplete: (stepId, result, error, sandboxed) => {
      completeRuntimeRunStep({
        store: input.store,
        run: input.run,
        stepId,
        ...(result !== undefined ? { result } : {}),
        ...(error ? { error } : {}),
        ...(sandboxed ? { sandboxed } : {}),
        completedAt: input.now(),
        emitRunSnapshot: input.emitRunSnapshot,
      })
    },
  }
}

function roundFromGraphTrace(trace: Pick<AgentGraphTraceInput, 'roundIndex' | 'roundLabel' | 'roundSource'>): AgentRunRoundInfo {
  return {
    roundId: `round_${trace.roundIndex}`,
    roundIndex: trace.roundIndex,
    roundLabel: trace.roundLabel,
    roundSource: trace.roundSource,
  }
}

function generationTraceTitle(event: GenerationEvent): string {
  return `Generation ${event.stage}: ${event.jobId !== undefined ? `Job #${event.jobId}` : event.toolName}`
}

function generationTraceStatus(event: GenerationEvent): AgentTraceEvent['status'] {
  if (event.stage === 'failed') return 'failed'
  return event.terminal ? 'completed' : 'info'
}
