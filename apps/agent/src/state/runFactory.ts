import type { AgentRuntimeContract } from '../contracts/runtimeContract.js'
import { buildRuntimeContractMetadata } from '../contracts/runtimeContract.js'
import type { AgentManifest } from '../manifest/agentManifest.js'
import type { AgentRun, AgentRunPolicy, JSONValue, ToolCall } from './types.js'

export interface BuildAgentRunInput {
  id: string
  threadId: string
  now: string
  agentManifest: AgentManifest
  policy: AgentRunPolicy
  approvedToolNames?: string[]
  clientInput?: JSONValue
  initialUserMessageId?: string
  forcedToolCall?: ToolCall
  runtimeContract?: AgentRuntimeContract
}

export function buildAgentRun(input: BuildAgentRunInput): AgentRun {
  return {
    id: input.id,
    threadId: input.threadId,
    status: 'queued',
    agentManifest: input.agentManifest,
    policy: input.policy,
    createdAt: input.now,
    updatedAt: input.now,
    steps: [],
    traceEvents: [],
    ...withMetadata(buildAgentRunMetadata(input)),
  }
}

function buildAgentRunMetadata(input: BuildAgentRunInput): Record<string, JSONValue> | undefined {
  const metadata: Record<string, JSONValue> = {
    ...(input.forcedToolCall ? { forcedToolCall: input.forcedToolCall as unknown as JSONValue } : {}),
    ...((input.approvedToolNames?.length ?? 0) > 0 ? { approvedToolNames: input.approvedToolNames as JSONValue } : {}),
    ...(input.clientInput !== undefined ? { clientInput: input.clientInput } : {}),
    ...(input.initialUserMessageId ? { initialUserMessageId: input.initialUserMessageId } : {}),
    ...(buildRuntimeContractMetadata(input.runtimeContract) ?? {}),
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined
}

function withMetadata(metadata: Record<string, JSONValue> | undefined): { metadata?: Record<string, JSONValue> } {
  return metadata ? { metadata } : {}
}
