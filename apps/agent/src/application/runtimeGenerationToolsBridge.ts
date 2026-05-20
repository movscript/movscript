import type { MCPClient } from '../mcpClient.js'
import type { AgentRun, AgentTraceEvent, JSONValue } from '../state/types.js'
import type { GenerationEvent } from '../generation/generationEvents.js'
import {
  waitRuntimeGenerationJobs,
  type RuntimeGenerationJobsWaitResult,
} from './runtimeGenerationJobWait.js'

export interface RuntimeGenerationToolsBridge {
  waitGenerationJobs: (run: AgentRun, input?: Record<string, JSONValue>, options?: { signal?: AbortSignal }) => Promise<JSONValue>
}

export function createRuntimeGenerationToolsBridge(input: {
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>
  recordTrace?: (run: AgentRun, trace: {
    kind: AgentTraceEvent['kind']
    title: string
    summary?: string
    status: AgentTraceEvent['status']
    toolName?: string
    data?: unknown
  }) => void
  waitFlow?: typeof waitRuntimeGenerationJobs
}): RuntimeGenerationToolsBridge {
  const waitFlow = input.waitFlow ?? waitRuntimeGenerationJobs
  return {
    waitGenerationJobs: async (run, request = {}, options = {}) => {
      const result = await waitFlow({
        mcpClient: input.mcpClient,
        request,
        signal: options.signal,
        onGenerationEvent: (event) => recordRuntimeGenerationTrace(input.recordTrace, run, event),
      })
      recordRuntimeGenerationWaitTrace(input.recordTrace, run, result)
      return result as unknown as JSONValue
    },
  }
}

function recordRuntimeGenerationTrace(
  recordTrace: Parameters<typeof createRuntimeGenerationToolsBridge>[0]['recordTrace'],
  run: AgentRun,
  event: GenerationEvent,
): void {
  recordTrace?.(run, {
    kind: 'tool_call',
    title: `Generation ${event.stage}: ${event.jobId !== undefined ? `Job #${event.jobId}` : event.toolName}`,
    summary: event.message,
    status: event.stage === 'failed' ? 'failed' : event.terminal ? 'completed' : 'info',
    toolName: 'movscript_wait_generation_jobs',
    data: { generation: event },
  })
}

function recordRuntimeGenerationWaitTrace(
  recordTrace: Parameters<typeof createRuntimeGenerationToolsBridge>[0]['recordTrace'],
  run: AgentRun,
  result: RuntimeGenerationJobsWaitResult,
): void {
  recordTrace?.(run, {
    kind: 'tool_call',
    title: `Generation wait ${result.status}`,
    summary: result.message,
    status: result.status === 'failed' ? 'failed' : result.done ? 'completed' : 'info',
    toolName: 'movscript_wait_generation_jobs',
    data: { generationWait: result },
  })
}
