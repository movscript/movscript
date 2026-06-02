import { modelTurnContext } from '../../../../context/prompt/turn/modelTurnContext.js'
import { buildModelToolResultRef } from '../../../../context/tool-result/toolResultContext.js'
import { buildGenerationEvent, extractGenerationMonitorRequest } from '../../../../generation/events/generationEvents.js'
import type { RuntimeModelChatMessage } from '../../../../model/config/modelConfig.js'
import { formatToolNameForDisplay } from '../../../../tools/registry/naming/toolNames.js'
import type { JSONValue, ToolCall, ToolCallOutcome } from '../../../../state/shared/types.js'
import { buildAgentToolResultRecord, buildModelToolResultContextFromRecord } from '../../../../state/store/tool-results/toolResultStore.js'
import type { AgentGraphInput, AgentGraphTraceInput } from '../../../graph/types/agentGraphTypes.js'
import { normalizeToolCall } from '../forced/agentGraphForcedToolCalls.js'
import { monitorGenerationJob } from '../../../model/generation/agentGraphGenerationMonitor.js'
import { buildRollbackRecord } from '../../rules/rollback/agentGraphRollbackRules.js'
import { recordToolResultContext } from '../../trace/context/agentGraphToolContextTrace.js'
import {
  buildToolCompletedTrace,
  buildToolFailedTrace,
  buildToolReplayGuardTrace,
  buildToolResultDroppedTrace,
} from '../../trace/execution/agentGraphToolExecutionTrace.js'
import { findReplayableToolStep, toolReplayGuardData } from '../../replay/toolReplayGuard.js'
import { executeTool } from '../../execution/executor/toolExecutor.js'

export interface AgentGraphToolTurnResult {
  outcome: ToolCallOutcome
  turnResult: {
    toolCall: ToolCall
    content: string
    supplementalMessages?: RuntimeModelChatMessage[]
  }
  warning?: string
}

export async function executeToolTurn(input: AgentGraphInput, options: {
  call: ToolCall
  roundIndex: number
  roundLabel: string
  roundSource: AgentGraphTraceInput['roundSource']
}): Promise<AgentGraphToolTurnResult> {
  const { call, roundIndex, roundLabel, roundSource } = options
  const replay = findReplayableToolStep({ run: input.run, call, registry: input.registry })
  const stepId = input.onStepCreate('tool_call', roundIndex, roundLabel, roundSource, call.name, call.args)
  const startedAt = Date.now()
  if (replay) {
    const result = replay.step.result
    const durationMs = Date.now() - startedAt
    const toolTrace = {
      roundIndex,
      roundLabel,
      roundSource,
      stepId,
    }
    input.onStepComplete(stepId, result, undefined, replay.step.sandboxed)
    input.onTrace(buildToolReplayGuardTrace({
      call,
      result,
      replayGuard: toolReplayGuardData({ replay, call }),
      durationMs,
      trace: toolTrace,
    }))
    recordToolResultContext(input, {
      call,
      result,
      source: 'runtime',
      trace: toolTrace,
    })
    const resultRef = result === undefined ? undefined : buildModelToolResultRef(call, result)
    const storedToolResult = resultRef
      ? input.toolResultStore?.listToolResults({ runId: input.run.id, refKey: resultRef.key })[0]
      : undefined
    const tool = input.registry.get(call.name)
    const modelToolResult = storedToolResult?.dropped === true
      ? buildModelToolResultContextFromRecord(storedToolResult)
      : modelTurnContext.buildToolResultContext({
        run: input.run,
        call,
        result,
        maxResultSizeChars: tool?.execution?.maxResultSizeChars,
      })
    if (result !== undefined && modelToolResult.resultRef && modelToolResult.dropped) {
      input.toolResultStore?.upsertToolResult(buildAgentToolResultRecord({
        runId: input.run.id,
        threadId: input.run.threadId,
        call,
        result,
        modelContext: modelToolResult,
        resultRef: modelToolResult.resultRef,
      }))
    }
    const droppedTrace = modelTurnContext.buildToolResultDroppedTrace(call.name, modelToolResult)
    if (droppedTrace) {
      input.onTrace(buildToolResultDroppedTrace(call.name, droppedTrace, toolTrace))
    }
    return {
      outcome: {
        call,
        result,
        rollback: buildRollbackRecord(call, result, replay.step.sandboxed),
      },
      turnResult: {
        toolCall: normalizeToolCall(call),
        content: modelToolResult.content,
      },
    }
  }
  try {
    const execResult = await executeTool(call, {
      run: input.run,
      draftStore: input.draftStore,
      externalToolGatewayPort: input.externalToolGatewayPort,
      draftApplyPort: input.draftApplyPort,
      draftApplyPreviewPort: input.draftApplyPreviewPort,
      proposalSnapshotHydrationPort: input.proposalSnapshotHydrationPort,
      resourceFilePort: input.resourceFilePort,
      imageProcessingPort: input.imageProcessingPort,
      videoFrameExtractionPort: input.videoFrameExtractionPort,
      projectStandardsPort: input.projectStandardsPort,
      registry: input.registry,
      runtimeToolHandlers: input.runtimeToolHandlers,
      memoryManager: input.memoryManager,
      referenceManager: input.referenceManager,
      catalogManager: input.catalogManager,
      sandboxMode: input.runtimeLimits.sandboxMode === true,
      permissionGate: {
        currentProjectId: input.context.project?.id,
        manifest: input.manifest,
        catalog: input.capabilities,
        approvedToolNames: input.approvedToolNames,
        approvalMode: input.runtimeLimits.approvalMode,
        runRole: input.run.role,
      },
      signal: input.signal,
    })
    throwIfAborted(input.signal)
    const durationMs = Date.now() - startedAt
    const toolTrace = {
      roundIndex,
      roundLabel,
      roundSource,
      stepId,
    }
    if (execResult.error) {
      input.onStepComplete(stepId, undefined, execResult.error)
      input.onTrace(buildToolFailedTrace({
        call,
        message: execResult.error,
        errorData: execResult.errorData,
        pipeline: execResult.pipeline as unknown as undefined | JSONValue,
        durationMs,
        trace: toolTrace,
      }))
      const modelToolResult = modelTurnContext.buildToolResultContext({
        run: input.run,
        call,
        error: execResult.error,
        maxResultSizeChars: execResult.pipeline?.execution.maxResultSizeChars,
      })
      return {
        outcome: { call, error: execResult.error },
        warning: `${formatToolNameForDisplay(call.name)} 未完成：${execResult.error}`,
        turnResult: {
          toolCall: normalizeToolCall(call),
          content: modelToolResult.content,
        },
      }
    }
    input.onStepComplete(stepId, execResult.result, undefined, execResult.sandboxed)
    input.onTrace(buildToolCompletedTrace({
      call,
      source: execResult.source,
      result: execResult.result,
      sandboxed: execResult.sandboxed,
      pipeline: execResult.pipeline as unknown as undefined | JSONValue,
      durationMs,
      trace: toolTrace,
    }))
    recordToolResultContext(input, {
      call,
      result: execResult.result,
      source: execResult.source,
      trace: toolTrace,
    })
    const generationEvent = buildGenerationEvent(call, execResult.result)
    if (generationEvent && input.onGenerationEvent) {
      const generationTrace = {
        roundIndex,
        roundLabel,
        roundSource,
        stepId,
        toolName: call.name,
      }
      input.onGenerationEvent(generationEvent, generationTrace)
      const monitorRequest = extractGenerationMonitorRequest(call, execResult.result, generationEvent)
      if (monitorRequest) {
        await monitorGenerationJob(monitorRequest, generationEvent, input, generationTrace)
        throwIfAborted(input.signal)
      }
    }
    const toolResult = execResult.result
    const resultRef = toolResult === undefined ? undefined : buildModelToolResultRef(call, toolResult)
    const storedToolResult = resultRef
      ? input.toolResultStore?.listToolResults({ runId: input.run.id, refKey: resultRef.key })[0]
      : undefined
    const modelToolResult = storedToolResult?.dropped === true
      ? buildModelToolResultContextFromRecord(storedToolResult)
      : modelTurnContext.buildToolResultContext({
        run: input.run,
        call,
        result: toolResult,
        maxResultSizeChars: execResult.pipeline?.execution.maxResultSizeChars,
      })
    if (toolResult !== undefined && modelToolResult.resultRef && modelToolResult.dropped) {
      input.toolResultStore?.upsertToolResult(buildAgentToolResultRecord({
        runId: input.run.id,
        threadId: input.run.threadId,
        call,
        result: toolResult,
        modelContext: modelToolResult,
        resultRef: modelToolResult.resultRef,
      }))
    }
    const droppedTrace = modelTurnContext.buildToolResultDroppedTrace(call.name, modelToolResult)
    if (droppedTrace) {
      input.onTrace(buildToolResultDroppedTrace(call.name, droppedTrace, toolTrace))
    }
    return {
      outcome: {
        call,
        ...(execResult.error ? { error: execResult.error } : { result: execResult.result }),
        rollback: buildRollbackRecord(call, execResult.result, execResult.sandboxed),
      },
      turnResult: {
        toolCall: normalizeToolCall(call),
        content: modelToolResult.content,
        ...(execResult.supplementalMessages && execResult.supplementalMessages.length > 0 ? { supplementalMessages: execResult.supplementalMessages } : {}),
      },
    }
  } catch (error) {
    if (isAbortError(error) || input.signal?.aborted) throw error
    const message = error instanceof Error ? error.message : String(error)
    const durationMs = Date.now() - startedAt
    input.onStepComplete(stepId, undefined, message)
    input.onTrace(buildToolFailedTrace({
      call,
      message,
      durationMs,
      trace: {
        roundIndex,
        roundLabel,
        roundSource,
        stepId,
      },
    }))
    const modelToolResult = modelTurnContext.buildToolResultContext({ run: input.run, call, error: message })
    return {
      outcome: { call, error: message },
      warning: `${formatToolNameForDisplay(call.name)} 未完成：${message}`,
      turnResult: {
        toolCall: normalizeToolCall(call),
        content: modelToolResult.content,
      },
    }
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const reason = signal.reason
  if (reason instanceof Error) throw reason
  const error = new Error(typeof reason === 'string' ? reason : 'Run was cancelled.')
  error.name = 'AbortError'
  throw error
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
