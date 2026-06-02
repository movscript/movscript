import { createHash } from 'node:crypto'
import type { ComposedModelTurnContext } from '../../../../context/prompt/turn/modelTurnContext.js'
import { summarizeInputRequestsTrace } from '../../../../trace/summaries/interaction/requests/interactionTrace.js'
import { isPromptTooLongModelError, type ModelCallResult } from '../../../../model/client/modelClient.js'
import { createDefaultRuntimeModelRouter } from '../../../../model/router/modelRouter.js'
import type { AgentInputRequest } from '../../../../state/shared/types.js'
import type { AgentGraphInput, AgentGraphTraceInput } from '../../../graph/types/agentGraphTypes.js'
import { buildModelRetryInputRequest, type AgentGraphMakeId } from '../../../graph/input/agentGraphInputRequests.js'
import {
  buildModelRoundCompletedTrace,
  buildModelRoundStartedTrace,
  buildModelRouteSelectedTrace,
  createModelTraceCallback,
} from '../trace/agentGraphModelTrace.js'

type ModelRoundTraceBase = Pick<AgentGraphTraceInput, 'roundIndex' | 'roundLabel' | 'roundSource'>

export type AgentGraphModelCallResult =
  | { kind: 'completed'; modelResult: ModelCallResult }
  | { kind: 'failed'; error: string }
  | { kind: 'requires_action'; pendingInputRequest: AgentInputRequest; warning: string }
  | { kind: 'prompt_too_long'; error: string }

export async function callReasoningModelTurn(input: AgentGraphInput, options: {
  modelTurnContext: ComposedModelTurnContext
  trace: ModelRoundTraceBase
  makeId: AgentGraphMakeId
  deferPromptTooLongRecovery?: boolean
}): Promise<AgentGraphModelCallResult> {
  const { modelTurnContext, trace } = options
  const { messages, tools } = modelTurnContext
  const modelRouter = input.modelRouter ?? createDefaultRuntimeModelRouter(input.config)
  const reasoningRoute = modelRouter.resolve('reasoning')
  if (!reasoningRoute) {
    return { kind: 'failed', error: 'run requires a configured reasoning model route' }
  }

  input.onTrace(buildModelRouteSelectedTrace(reasoningRoute, modelTurnContext.contextBundle, trace))
  const roundStartedAtMs = Date.now()
  input.onTrace(buildModelRoundStartedTrace({
    route: reasoningRoute,
    contextBundle: modelTurnContext.contextBundle,
    messageCount: messages.length,
    toolCount: tools.length,
    trace,
  }))

  let modelResult: ModelCallResult
  try {
    modelResult = await modelRouter.call({
      capability: 'reasoning',
      messages,
      tools,
      toolChoice: tools.length > 0 ? 'auto' : undefined,
      auth: input.auth,
      signal: input.signal,
      onTrace: createModelTraceCallback({
        onTrace: input.onTrace,
        contextBundle: modelTurnContext.contextBundle,
        trace,
      }),
    })
  } catch (error) {
    if (isAbortError(error) || input.signal?.aborted) throw error
    const message = error instanceof Error ? error.message : String(error)
    if (options.deferPromptTooLongRecovery !== false && isPromptTooLongModelError(error)) {
      input.onTrace({
        kind: 'context',
        title: 'Prompt too long recovery needed',
        summary: `Model input exceeded provider context limits (${message.length} error chars).`,
        status: 'blocked',
        ...trace,
        data: {
          eventType: 'context.prompt_too_long_detected',
          contextEventType: 'context.prompt_too_long_detected',
          errorHash: hashString(message),
          errorChars: message.length,
          errorMode: 'summary',
          contextBundleId: modelTurnContext.contextBundle.id,
          promptHash: modelTurnContext.contextBundle.promptHash,
        },
      })
      return { kind: 'prompt_too_long', error: message }
    }
    const pendingInputRequest = buildModelRetryInputRequest(input.run.id, message, options.makeId)
    input.onTrace({
      kind: 'input',
      title: 'Model call recovery required',
      summary: `Model call recovery required (${message.length} error chars).`,
      status: 'blocked',
      ...trace,
      data: {
        eventType: 'model.call.recovery_required',
        errorHash: hashString(message),
        errorChars: message.length,
        errorMode: 'summary',
        inputRequestSummary: summarizeInputRequestsTrace([pendingInputRequest]),
      },
    })
    return {
      kind: 'requires_action',
      pendingInputRequest,
      warning: `模型调用未完成：${message}`,
    }
  }

  const roundDurationMs = Math.max(0, Date.now() - roundStartedAtMs)
  input.onTrace(buildModelRoundCompletedTrace({
    result: modelResult,
    contextBundle: modelTurnContext.contextBundle,
    durationMs: roundDurationMs,
    trace,
  }))
  return { kind: 'completed', modelResult }
}

function hashString(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
