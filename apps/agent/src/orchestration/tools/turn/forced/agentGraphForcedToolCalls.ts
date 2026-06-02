import type { RuntimeModelChatMessage } from '../../../../model/config/modelConfig.js'
import type { ToolCall } from '../../../../state/shared/types.js'
import type { AgentGraphTraceInput } from '../../../graph/types/agentGraphTypes.js'
import type { AgentGraphMakeId } from '../../../graph/input/agentGraphInputRequests.js'

export function buildForcedToolCallInjection(input: {
  forcedToolCalls?: ToolCall[]
  trace: Pick<AgentGraphTraceInput, 'roundIndex' | 'roundLabel' | 'roundSource'>
  makeId: AgentGraphMakeId
}): { trace: AgentGraphTraceInput; history: RuntimeModelChatMessage[]; requestedCalls: ToolCall[] } | undefined {
  if (input.trace.roundIndex !== 1 || !input.forcedToolCalls || input.forcedToolCalls.length === 0) return undefined
  const forcedToolCalls = input.forcedToolCalls.map(normalizeToolCall)
  return {
    trace: {
      kind: 'permission',
      title: 'Forced tool calls injected',
      summary: `${forcedToolCalls.length} forced runtime tool call(s)`,
      status: 'info',
      ...input.trace,
      data: { forcedCalls: forcedToolCalls.map((call) => call.name) },
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
  }
}

export function normalizeToolCall(call: ToolCall): ToolCall {
  return {
    id: call.id ?? makeId('call'),
    name: call.name,
    ...(call.args ? { args: call.args } : {}),
  }
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
