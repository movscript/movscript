import type { AgentRuntimeContract } from '../contracts/runtimeContract.js'
import { buildRuntimeContractMetadata } from '../contracts/runtimeContract.js'
import type { AgentManifest } from '../catalog/agentManifest.js'
import { cloneJSONValue, isJSONRecord } from '../jsonValue.js'
import type { AgentRun, AgentRunInput, AgentRunPolicy, AgentRunRole, JSONValue, ToolCall } from './types.js'

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
  runInput?: AgentRunInput
  runtimeContract?: AgentRuntimeContract
  role?: AgentRunRole
  parentRunId?: string
  planId?: string
  taskId?: string
  progress?: number
  blockedReason?: string
}

export function buildAgentRun(input: BuildAgentRunInput): AgentRun {
  return {
    id: input.id,
    threadId: input.threadId,
    status: 'queued',
    ...(input.role ? { role: input.role } : {}),
    ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
    ...(input.planId ? { planId: input.planId } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(typeof input.progress === 'number' ? { progress: input.progress } : {}),
    ...(input.blockedReason ? { blockedReason: input.blockedReason } : {}),
    ...(input.runInput ? { input: cloneAgentRunInput(input.runInput) } : {}),
    agentManifest: input.agentManifest,
    policy: input.policy,
    createdAt: input.now,
    updatedAt: input.now,
    steps: [],
    ...withMetadata(buildAgentRunMetadata(input)),
  }
}

export function buildRunCreationMetadata(input: {
  existing?: Record<string, JSONValue>
  inputMetadata?: unknown
  hasExplicitAgentManifest: boolean
  catalogSnapshot: { id: string; catalogVersion: string | null }
}): Record<string, JSONValue> {
  return {
    ...(input.existing ? cloneJSONValue(input.existing) : {}),
    ...(isJSONRecord(input.inputMetadata) ? cloneJSONValue(input.inputMetadata) : {}),
    ...(!input.hasExplicitAgentManifest ? { manifestSource: 'default' } : {}),
    catalogSnapshot: {
      id: input.catalogSnapshot.id,
      version: input.catalogSnapshot.catalogVersion,
    },
  }
}

function buildAgentRunMetadata(input: BuildAgentRunInput): Record<string, JSONValue> | undefined {
  const approvedToolNames = input.approvedToolNames ?? []
  const metadata: Record<string, JSONValue> = {
    ...(input.forcedToolCall ? { forcedToolCall: cloneToolCall(input.forcedToolCall) as unknown as JSONValue } : {}),
    ...(approvedToolNames.length > 0 ? { approvedToolNames: [...approvedToolNames] as JSONValue } : {}),
    ...(input.clientInput !== undefined ? { clientInput: cloneJSONValue(input.clientInput) } : {}),
    ...(input.initialUserMessageId ? { initialUserMessageId: input.initialUserMessageId } : {}),
    ...(buildRuntimeContractMetadata(input.runtimeContract) ?? {}),
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined
}

function withMetadata(metadata: Record<string, JSONValue> | undefined): { metadata?: Record<string, JSONValue> } {
  return metadata ? { metadata } : {}
}

function cloneAgentRunInput(input: AgentRunInput): AgentRunInput {
  return {
    schema: input.schema,
    userMessage: input.userMessage,
    ...(input.clientInput !== undefined ? { clientInput: cloneJSONValue(input.clientInput) } : {}),
    ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
    executionMode: input.executionMode,
    ...(input.parent ? { parent: { ...input.parent } } : {}),
    ...(input.task
      ? {
        task: {
          id: input.task.id,
          title: input.task.title,
          ...(input.task.description ? { description: input.task.description } : {}),
          instructions: input.task.instructions,
          ...(input.task.expectedArtifacts ? { expectedArtifacts: [...input.task.expectedArtifacts] } : {}),
        },
      }
      : {}),
    ...(input.forcedToolCall ? { forcedToolCall: cloneToolCall(input.forcedToolCall) } : {}),
    createdAt: input.createdAt,
  }
}

function cloneToolCall(call: ToolCall): ToolCall {
  return {
    ...(call.id ? { id: call.id } : {}),
    name: call.name,
    ...(call.args ? { args: cloneJSONValue(call.args) } : {}),
    ...(call.arguments ? { arguments: cloneJSONValue(call.arguments) } : {}),
  }
}
