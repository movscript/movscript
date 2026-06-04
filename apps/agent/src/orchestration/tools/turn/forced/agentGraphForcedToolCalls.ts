import type { RuntimeModelChatMessage } from '../../../../model/config/modelConfig.js'
import type { AgentToolCallOrigin, ToolCall } from '../../../../state/shared/types.js'
import type { AgentGraphTraceInput } from '../../../graph/types/agentGraphTypes.js'
import type { AgentGraphMakeId } from '../../../graph/input/agentGraphInputRequests.js'

export function buildForcedToolCallInjection(input: {
  forcedToolCalls?: ToolCall[]
  trace: Pick<AgentGraphTraceInput, 'roundIndex' | 'roundLabel' | 'roundSource'>
  makeId: AgentGraphMakeId
}): { trace: AgentGraphTraceInput; history: RuntimeModelChatMessage[]; requestedCalls: ToolCall[]; roundIndex: number } | undefined {
  if (input.trace.roundIndex !== 1 || !input.forcedToolCalls || input.forcedToolCalls.length === 0) return undefined
  const forcedToolCalls = input.forcedToolCalls.map(normalizeToolCall)
  const trace = forcedToolCallTrace(input.trace, forcedToolCalls)
  return {
    trace: {
      kind: 'permission',
      title: 'Forced tool calls injected',
      summary: `${forcedToolCalls.length} forced runtime tool call(s)`,
      status: 'info',
      ...trace,
      data: {
        forcedCalls: forcedToolCalls.map((call) => call.name),
        origins: forcedToolCalls.flatMap((call) => call.origin ? [call.origin] : []),
      },
    },
    history: [{
      role: 'assistant',
      content: [],
      tool_calls: forcedToolCalls.map((call) => ({
        id: call.id ?? input.makeId('call'),
        type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
      })),
    }],
    requestedCalls: forcedToolCalls,
    roundIndex: trace.roundIndex,
  }
}

export function normalizeToolCall(call: ToolCall): ToolCall {
  return {
    id: call.id ?? makeId('call'),
    name: call.name,
    ...(call.args ? { args: call.args } : {}),
    ...(call.origin ? { origin: call.origin } : {}),
  }
}

export function forcedToolCallTrace(
  fallback: Pick<AgentGraphTraceInput, 'roundIndex' | 'roundLabel' | 'roundSource'>,
  calls: ToolCall[] | undefined,
): Pick<AgentGraphTraceInput, 'roundIndex' | 'roundLabel' | 'roundSource'> {
  const origin = commonOrigin(calls)
  if (origin?.roundIndex === undefined) return fallback
  return {
    roundIndex: origin.roundIndex,
    roundLabel: origin.roundLabel ?? `Model turn ${origin.roundIndex}`,
    roundSource: 'runtime_rule',
  }
}

function commonOrigin(calls: ToolCall[] | undefined): AgentToolCallOrigin | undefined {
  const origins = (calls ?? []).flatMap((call) => call.origin?.roundIndex !== undefined ? [call.origin] : [])
  if (origins.length === 0) return undefined
  const first = origins[0]
  if (!first) return undefined
  return origins.every((origin) => origin.roundIndex === first.roundIndex) ? first : undefined
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
