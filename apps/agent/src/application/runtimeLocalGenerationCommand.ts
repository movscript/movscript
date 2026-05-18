import {
  buildGenerationEvent,
  buildGenerationTimeoutEvent,
  extractGenerationMonitorRequest,
  type GenerationEvent,
} from '../generation/generationEvents.js'
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
  executeGenerationTool: (call: { name: 'movscript_create_generation_job' | 'movscript_get_generation_job'; args: Record<string, JSONValue> }) => Promise<ToolExecutionResult>
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
  const forcedCall = { name: 'movscript_create_generation_job' as const, args: toolArgs }
  input.run.metadata = {
    ...(input.run.metadata ?? {}),
    forcedToolCall: forcedCall as unknown as JSONValue,
  }
  input.store.updateRun(input.run)

  const toolStep = input.createStep(input.run, 'tool_call', localRound, 'movscript_create_generation_job')
  const startedAt = input.timestampMs()
  input.recordTrace(input.run, {
    kind: 'tool_call',
    title: 'Tool started: movscript_create_generation_job',
    summary: `${input.command.name === 'image' ? '图片' : '视频'}生成任务正在提交。`,
    status: 'started',
    round: localRound,
    stepId: toolStep.id,
    toolName: 'movscript_create_generation_job',
    data: { call: forcedCall },
  })
  const createResult = await input.executeGenerationTool(forcedCall)
  let execResult = createResult
  const generationEvent = buildGenerationEvent(forcedCall, createResult.result)
  if (!createResult.error && generationEvent) {
    recordLocalGenerationTrace(input, localRound, toolStep.id, generationEvent)
    const monitorRequest = extractGenerationMonitorRequest(forcedCall, createResult.result, generationEvent)
    if (monitorRequest) {
      execResult = await monitorLocalGenerationJob({
        ...input,
        initialEvent: generationEvent,
        localRound,
        stepId: toolStep.id,
        request: monitorRequest,
        fallbackResult: createResult,
      })
    }
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
    title: execResult.error ? 'Tool call failed: movscript_create_generation_job' : 'Tool completed: movscript_create_generation_job',
    summary: `${execResult.error ?? 'generation job finished'} (${durationMs}ms)`,
    status: execResult.error ? 'failed' : 'completed',
    round: localRound,
    stepId: toolStep.id,
    toolName: 'movscript_create_generation_job',
    data: { source: execResult.source, result: execResult.result, error: execResult.error, errorData: execResult.errorData, sandboxed: execResult.sandboxed, durationMs },
    durationMs,
  })

  const assistantContent = buildFinalAssistantContent({
    userMessage: input.userMessage,
    modelContent: '',
    toolResults: [{
      call: forcedCall,
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

function recordLocalGenerationTrace(
  input: Pick<Parameters<typeof applyRuntimeLocalGenerationCommand>[0], 'recordTrace' | 'run'>,
  localRound: AgentRunRoundInfo,
  stepId: string,
  event: GenerationEvent,
): void {
  input.recordTrace(input.run, {
    kind: 'tool_call',
    title: `Generation ${event.stage}: ${event.jobId !== undefined ? `Job #${event.jobId}` : event.toolName}`,
    summary: event.message,
    status: event.stage === 'failed' ? 'failed' : event.terminal ? 'completed' : 'info',
    round: localRound,
    stepId,
    toolName: 'movscript_create_generation_job',
    data: { generation: event },
  })
}

async function monitorLocalGenerationJob(input: {
  executeGenerationTool: Parameters<typeof applyRuntimeLocalGenerationCommand>[0]['executeGenerationTool']
  recordTrace: Parameters<typeof applyRuntimeLocalGenerationCommand>[0]['recordTrace']
  run: AgentRun
  request: NonNullable<ReturnType<typeof extractGenerationMonitorRequest>>
  initialEvent: GenerationEvent
  fallbackResult: ToolExecutionResult
  localRound: AgentRunRoundInfo
  stepId: string
}): Promise<ToolExecutionResult> {
  if (input.request.timeoutMs <= 0) return input.fallbackResult
  const deadline = Date.now() + input.request.timeoutMs
  let previousKey = localGenerationEventChangeKey(input.initialEvent)
  let lastEmittedAt = Date.now()
  let latestResult = input.fallbackResult
  const heartbeatMs = input.request.heartbeatMs > 0 ? input.request.heartbeatMs : Number.POSITIVE_INFINITY

  while (Date.now() <= deadline) {
    const pollResult = await input.executeGenerationTool({ name: input.request.toolName, args: input.request.args })
    latestResult = pollResult
    if (pollResult.error) return pollResult
    const event = buildGenerationEvent({ name: input.request.toolName, args: input.request.args }, pollResult.result)
    if (!event) {
      await sleepLocalGeneration(input.request.pollIntervalMs)
      continue
    }
    const now = Date.now()
    const nextKey = localGenerationEventChangeKey(event)
    if (event.terminal || nextKey !== previousKey || now - lastEmittedAt >= heartbeatMs) {
      recordLocalGenerationTrace(input, input.localRound, input.stepId, event)
      previousKey = nextKey
      lastEmittedAt = now
    }
    if (event.terminal) return pollResult
    await sleepLocalGeneration(Math.min(input.request.pollIntervalMs, Math.max(0, deadline - now)))
  }

  recordLocalGenerationTrace(input, input.localRound, input.stepId, buildGenerationTimeoutEvent(input.initialEvent))
  return latestResult
}

function localGenerationEventChangeKey(event: GenerationEvent): string {
  return [
    event.stage,
    event.status,
    event.progress ?? '',
    event.outputResourceId ?? '',
  ].join(':')
}

function sleepLocalGeneration(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}
