import type { JSONValue } from '../../../../shared/protocol/types.js'
import type { AgentRun, AgentTraceEvent, AgentTraceEventKind } from '../../../../state/shared/types.js'
import type { AgentRunRoundInfo } from '../../../../state/run/core/round/runRound.js'
import type { NormalizedClientInput } from '../../../../context/input/client/normalizeClientInput.js'
import type { AgentCommandRuntime } from '../../../../context/command/commandRouter.js'
import {
  buildLocalDiagnosticFallbackContextResult,
  isLocalDiagnosticCommand,
} from '../../../../context/diagnostics/commands/localDiagnosticCommands.js'

export interface RuntimeFocusContextTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  round?: AgentRunRoundInfo
  data?: unknown
}

export interface RuntimeFocusContextResult {
  contextResult: JSONValue
  contextError?: string
  contextStartedAt: number
  contextDurationMs: number
}

export async function resolveRuntimeFocusContext(input: {
  run: AgentRun
  command: AgentCommandRuntime
  clientInput?: NormalizedClientInput
  setupRound: AgentRunRoundInfo
  timestampMs: () => number
  now: () => string
  mcpClient: {
    initialize(options?: { signal?: AbortSignal }): Promise<unknown>
    callTool(name: string, args?: Record<string, JSONValue>, options?: { signal?: AbortSignal }): Promise<JSONValue>
  }
  signal?: AbortSignal
  recordTrace: (run: AgentRun, trace: RuntimeFocusContextTraceInput) => void
  updateRun: (run: AgentRun) => void
}): Promise<RuntimeFocusContextResult> {
  const contextStartedAt = input.timestampMs()
  try {
    await input.mcpClient.initialize({ signal: input.signal })
    const contextResult = await input.mcpClient.callTool('get_focus_context', {}, { signal: input.signal })
    return {
      contextResult,
      contextStartedAt,
      contextDurationMs: input.timestampMs() - contextStartedAt,
    }
  } catch (error) {
    const contextError = error instanceof Error ? error.message : String(error)
    const contextDurationMs = input.timestampMs() - contextStartedAt
    const diagnosticCommand = isLocalDiagnosticCommand(input.command.name)
    input.recordTrace(input.run, {
      kind: 'context',
      title: 'Focus failed',
      summary: `${contextError} (${contextDurationMs}ms)`,
      status: diagnosticCommand ? 'blocked' : 'failed',
      round: input.setupRound,
      data: {
        source: 'mcp_focus',
        endpoint: 'get_focus_context',
        error: contextError,
        durationMs: contextDurationMs,
        startedAt: new Date(contextStartedAt).toISOString(),
        completedAt: input.now(),
        fallback: diagnosticCommand ? 'client_input_snapshot' : 'none',
      },
    })
    input.updateRun(input.run)
    if (!diagnosticCommand) throw error
    return {
      contextResult: buildLocalDiagnosticFallbackContextResult(input.clientInput, contextError),
      contextError,
      contextStartedAt,
      contextDurationMs,
    }
  }
}
