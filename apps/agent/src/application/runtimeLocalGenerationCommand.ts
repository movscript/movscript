import { applyRuntimeThreadContextSummary } from '../context/runtimeThreadContextSummary.js'
import { parseGenerationDebugCommand } from '../context/localDiagnosticCommands.js'
import { projectRunOntoThread } from '../state/runProjection.js'
import { buildRunRound, type AgentRunRoundInfo } from '../state/runRound.js'
import { applyRunCompletion } from '../state/runStatus.js'
import { completeRunStep } from '../state/runTrace.js'
import type { AgentStore } from '../state/store.js'
import type {
  AgentMessage,
  AgentRun,
  AgentRunStep,
  AgentThread,
  AgentTraceEvent,
  AgentTraceEventKind,
  JSONValue,
} from '../state/types.js'
import type { ToolExecutionResult } from '../orchestration/toolExecutor.js'
import type { AgentCommandRuntime } from '../context/commandRouter.js'
import type { AgentMemory } from '../memory/types.js'
import { buildFinalAssistantContent } from './assistantMessage.js'
import { createRuntimeMessage } from './runtimeMessageFactory.js'
import { appendThreadMessage } from './threadLifecycle.js'

export interface RuntimeLocalGenerationTraceInput {
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

export function isRuntimeLocalGenerationCommand(command: AgentCommandRuntime): boolean {
  return command.name === 'image' || command.name === 'video'
}

export async function applyRuntimeLocalGenerationCommand(input: {
  store: Pick<AgentStore, 'updateRun' | 'updateThread'>
  run: AgentRun
  thread: AgentThread
  command: AgentCommandRuntime
  userMessage: string
  warnings: string[]
  memories: AgentMemory[]
  memoryStorePath?: string
  now: () => string
  timestampMs: () => number
  executeGenerationTool: (call: RuntimeLocalGenerationOperationCall) => Promise<ToolExecutionResult>
  recordTrace: (run: AgentRun, trace: RuntimeLocalGenerationTraceInput) => void
  createStep: (run: AgentRun, type: AgentRunStep['type'], round?: AgentRunRoundInfo, toolName?: string) => AgentRunStep
  emitAssistantMessage: (run: AgentRun, message: AgentMessage) => void
  emitRunSnapshot: (run: AgentRun, options: { done?: boolean }) => void
}): Promise<AgentMessage> {
  const generationCommand = parseGenerationDebugCommand(input.command)
  if (!generationCommand) throw new Error('generation command could not be parsed')
  const localRound = buildRunRound(1, 'Runtime command', 'runtime_rule')
  input.recordTrace(input.run, {
    kind: 'policy',
    title: `${input.command.name === 'image' ? 'Image' : 'Video'} command handled locally`,
    summary: `${input.command.rawName ?? `/${input.command.name}`} forces a generation tool call for chain debugging.`,
    status: 'completed',
    round: localRound,
    data: {
      command: input.command,
      modelGatewayCalled: false,
      reason: `${input.command.name} is a deterministic generation debug command`,
      generation: generationCommand,
    },
  })

  const finalRound = buildRunRound(999, 'Final response', 'final')
  const toolArgs: Record<string, JSONValue> = {
    prompt: generationCommand.prompt,
    output_type: generationCommand.outputType,
    job_type: generationCommand.jobType,
    ...(generationCommand.aspectRatio ? { aspect_ratio: generationCommand.aspectRatio } : {}),
    ...(generationCommand.duration !== undefined ? { duration: generationCommand.duration } : {}),
    feature_key: generationCommand.featureKey,
    timeout_ms: generationCommand.timeoutMs,
    wait: false,
    ...(generationCommand.referenceResourceIds.length > 0
      ? { input_resource_ids: generationCommand.referenceResourceIds }
      : {}),
    ...(Object.keys(generationCommand.extraParams).length > 0
      ? { extra_params: generationCommand.extraParams }
      : {}),
  }
  const forcedCall = { name: 'runtime_operation_start' as const, args: { kind: 'generation_job', request: toolArgs } }
  input.run.metadata = {
    ...(input.run.metadata ?? {}),
    forcedToolCall: forcedCall as unknown as JSONValue,
  }
  input.store.updateRun(input.run)

  const toolStep = input.createStep(input.run, 'tool_call', localRound, 'runtime_operation_start')
  const startedAt = input.timestampMs()
  input.recordTrace(input.run, {
    kind: 'tool_call',
    title: 'Tool started: runtime_operation_start',
    summary: `${input.command.name === 'image' ? '图片' : '视频'}生成任务正在提交。`,
    status: 'started',
    round: localRound,
    stepId: toolStep.id,
    toolName: 'runtime_operation_start',
    data: { call: forcedCall },
  })
  const createResult = await input.executeGenerationTool(forcedCall)
  let execResult = createResult
  let finalToolCall: RuntimeLocalGenerationOperationCall = forcedCall
  const operationId = operationIdFromStartResult(createResult.result)
  if (!createResult.error && operationId) {
    const waitArgs: Record<string, JSONValue> = { operationIds: [operationId], mode: 'any' }
    if (generationCommand.timeoutMs !== undefined) waitArgs.timeoutMs = generationCommand.timeoutMs
    finalToolCall = { name: 'runtime_operation_wait', args: waitArgs }
    execResult = await input.executeGenerationTool(finalToolCall)
  }
  const durationMs = input.timestampMs() - startedAt
  completeRunStep(toolStep, {
    completedAt: input.now(),
    status: execResult.error ? 'failed' : 'completed',
    result: execResult.result,
    ...(execResult.error ? { error: execResult.error } : {}),
    ...(execResult.errorData !== undefined ? { errorData: execResult.errorData } : {}),
    durationMs,
  })
  input.store.updateRun(input.run)
  input.recordTrace(input.run, {
    kind: 'tool_call',
    title: execResult.error ? 'Tool call failed: runtime_operation_start' : 'Tool completed: runtime_operation_start',
    summary: `${execResult.error ?? 'generation job finished'} (${durationMs}ms)`,
    status: execResult.error ? 'failed' : 'completed',
    round: localRound,
    stepId: toolStep.id,
    toolName: finalToolCall.name,
    data: { source: execResult.source, result: execResult.result, error: execResult.error, errorData: execResult.errorData, sandboxed: execResult.sandboxed, durationMs },
    durationMs,
  })

  const assistantContent = buildFinalAssistantContent({
    userMessage: input.userMessage,
    modelContent: '',
    toolResults: [{
      call: finalToolCall,
      ...(execResult.error ? { error: execResult.error } : { result: execResult.result }),
    }],
    warnings: input.warnings,
    memories: input.memories,
    run: input.run,
    ...(input.memoryStorePath ? { memoryStorePath: input.memoryStorePath } : {}),
  })
  const assistant = createRuntimeMessage({
    threadId: input.thread.id,
    role: 'assistant',
    content: assistantContent || '（无内容）',
    runId: input.run.id,
  })
  appendThreadMessage({ thread: input.thread, message: assistant })

  const messageStep = input.createStep(input.run, 'message', finalRound)
  completeRunStep(messageStep, {
    completedAt: input.now(),
    result: { messageId: assistant.id, localCommand: input.command.name },
  })
  input.recordTrace(input.run, {
    kind: 'assistant',
    title: 'Assistant message created',
    summary: assistant.content.slice(0, 180),
    status: 'completed',
    round: finalRound,
    stepId: messageStep.id,
    data: { messageId: assistant.id, chars: assistant.content.length, content: assistant.content, source: 'runtime_rule' },
  })

  applyRunCompletion(input.run, {
    now: input.now(),
    assistantMessageId: assistant.id,
    warnings: input.warnings,
    metadataPatch: {
      memoryIds: input.memories.map((memory) => memory.id),
      writtenMemoryIds: [],
    },
  })
  input.recordTrace(input.run, {
    kind: 'run',
    title: 'Run finished',
    summary: `Run ${input.run.status} after forced ${input.command.name} generation.`,
    status: input.run.warnings && input.run.warnings.length > 0 ? 'info' : 'completed',
    round: finalRound,
    data: { status: input.run.status, warningCount: input.run.warnings?.length ?? 0, modelGatewayCalled: false, toolResultCount: 1 },
  })
  projectRunOntoThread(input.thread, input.run)
  input.thread.updatedAt = input.run.updatedAt
  applyRuntimeThreadContextSummary({ thread: input.thread, run: input.run, now: input.now() })
  input.store.updateThread(input.thread)
  input.store.updateRun(input.run)
  input.emitAssistantMessage(input.run, assistant)
  input.emitRunSnapshot(input.run, { done: true })
  return assistant
}

type RuntimeLocalGenerationOperationCall = {
  name: 'runtime_operation_start' | 'runtime_operation_wait' | 'runtime_operation_get'
  args: Record<string, JSONValue>
}

function operationIdFromStartResult(result: JSONValue | undefined): string | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined
  const operation = result.operation
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) return undefined
  return typeof operation.id === 'string' && operation.id.trim() ? operation.id : undefined
}
