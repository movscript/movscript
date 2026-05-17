import type { AgentMessage, AgentRunInput, AgentRunRole, AgentTask, JSONValue, ToolCall } from './types.js'
import { cloneJSONValue, isRecord } from '../jsonValue.js'
import { WORKER_TASK_INSTRUCTIONS } from './workerTaskPrompt.js'

export interface BuildAgentRunInputSnapshotInput {
  now: string
  sourceMessage?: AgentMessage
  userMessage?: string
  clientInput?: JSONValue
  role?: AgentRunRole
  parentRunId?: string
  planId?: string
  taskId?: string
  forcedToolCall?: ToolCall
  task?: AgentRunInput['task']
}

export function buildAgentRunInputSnapshot(input: BuildAgentRunInputSnapshotInput): AgentRunInput {
  const executionMode = input.forcedToolCall
    ? 'tool'
    : input.role === 'worker' ? 'worker' : 'chat'
  const userMessage = normalizeUserMessage(input.userMessage) ?? input.sourceMessage?.content.trim() ?? ''
  return {
    schema: 'movscript.agent.run-input.v1',
    userMessage,
    ...(input.clientInput !== undefined ? { clientInput: cloneJSONValue(input.clientInput) } : {}),
    ...(input.sourceMessage ? { sourceMessageId: input.sourceMessage.id } : {}),
    executionMode,
    ...(input.parentRunId || input.planId || input.taskId
      ? {
        parent: {
          ...(input.parentRunId ? { runId: input.parentRunId } : {}),
          ...(input.planId ? { planId: input.planId } : {}),
          ...(input.taskId ? { taskId: input.taskId } : {}),
        },
      }
      : {}),
    ...(input.task ? { task: cloneRunInputTask(input.task) } : {}),
    ...(input.forcedToolCall ? { forcedToolCall: cloneToolCall(input.forcedToolCall) } : {}),
    createdAt: input.now,
  }
}

export function resolveRunInputUserMessage(runInput: AgentRunInput | undefined, fallback?: string): string {
  const fromInput = normalizeUserMessage(runInput?.userMessage)
  if (fromInput !== undefined) return fromInput
  return normalizeUserMessage(fallback) ?? ''
}

export function buildAgentRunTaskInputSnapshot(task: AgentTask): AgentRunInput['task'] {
  const metadata = isRecord(task.metadata) ? task.metadata : undefined
  const expectedArtifacts = normalizeStringList(metadata?.expectedArtifacts)
  return {
    id: task.id,
    title: task.title,
    ...(task.description ? { description: task.description } : {}),
    instructions: WORKER_TASK_INSTRUCTIONS,
    ...(expectedArtifacts.length > 0 ? { expectedArtifacts } : {}),
  }
}

export function normalizeAgentRunInputTask(value: unknown): AgentRunInput['task'] | undefined {
  if (!isRecord(value)) return undefined
  const id = normalizeUserMessage(value.id)
  const title = normalizeUserMessage(value.title)
  if (!id || !title) return undefined
  const description = normalizeUserMessage(value.description)
  const instructions = normalizeUserMessage(value.instructions) ?? description ?? title
  const expectedArtifacts = normalizeStringList(value.expectedArtifacts)
  return {
    id,
    title,
    ...(description ? { description } : {}),
    instructions,
    ...(expectedArtifacts.length > 0 ? { expectedArtifacts } : {}),
  }
}

function normalizeUserMessage(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => typeof item === 'string' && item.trim() ? [item.trim()] : [])
}

function cloneRunInputTask(task: NonNullable<AgentRunInput['task']>): AgentRunInput['task'] {
  return {
    id: task.id,
    title: task.title,
    ...(task.description ? { description: task.description } : {}),
    instructions: task.instructions,
    ...(task.expectedArtifacts ? { expectedArtifacts: [...task.expectedArtifacts] } : {}),
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
