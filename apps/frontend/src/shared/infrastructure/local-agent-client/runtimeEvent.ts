import { AGENT_RUNTIME_EVENT_V2_SCHEMA, type AgentRuntimeEventV2 } from '@movscript/protocol'

export function parseRuntimeEvent(data: string): AgentRuntimeEventV2 | undefined {
  const value = JSON.parse(data) as AgentRuntimeEventV2
  return value?.schema === AGENT_RUNTIME_EVENT_V2_SCHEMA ? value : undefined
}
