import { modelTurnContext, type ContextTracePayload } from '../../../../context/prompt/turn/modelTurnContext.js'
import type { CompactedPromptHistory } from '../../../../context/prompt/hygiene/promptHygiene.js'
import { isJSONRecord } from '../../../../shared/json/jsonValue.js'
import {
  appendRuntimeInputMessagesToUserMessage,
  collectPendingRuntimeInputMessages,
} from '../../../../state/run/input/runtime/runtimeRunInputs.js'
import type { AgentMessage, AgentRun } from '../../../../state/shared/types.js'

export interface PreparedModelInput {
  effectiveUserMessage: string
  promptHistory: CompactedPromptHistory
  runtimeInputMessages: AgentMessage[]
  historyTrace?: ContextTracePayload
}

export interface PromptTooLongRecoveryProjection {
  preparedInput: PreparedModelInput
  droppedHistoryMessageCount: number
  retainedHistoryMessageCount: number
  summaryChars: number
}

export function prepareModelInput(input: {
  run: AgentRun
  threadMessages: AgentMessage[]
  rootUserMessageId?: string
  userMessage?: string
}): PreparedModelInput | undefined {
  const { run, threadMessages } = input
  const lastUser = input.rootUserMessageId
    ? threadMessages.find((message) => message.id === input.rootUserMessageId && message.role === 'user')
    : [...threadMessages].reverse().find((message) => message.role === 'user')
  const frozenUserMessage = typeof input.userMessage === 'string' && input.userMessage.trim().length > 0
    ? input.userMessage.trim()
    : undefined
  if (!lastUser && !frozenUserMessage) return undefined

  const rootIndex = lastUser ? threadMessages.findIndex((message) => message.id === lastUser.id) : -1
  const supplementalUserMessages = rootIndex >= 0 && !frozenUserMessage
    ? threadMessages.slice(rootIndex + 1).filter((message) => message.role === 'user')
    : []
  const baseEffectiveUserMessage = frozenUserMessage ?? (supplementalUserMessages.length > 0
    ? [
      lastUser!.content,
      '',
      '[后续用户补充]',
      ...supplementalUserMessages.map((message) => message.content),
    ].join('\n')
    : lastUser!.content)
  const runtimeInputMessages = collectPendingRuntimeInputMessages({ run, threadMessages })
  const effectiveUserMessage = appendRuntimeInputMessagesToUserMessage(baseEffectiveUserMessage, runtimeInputMessages)
  const promptHistoryInput: AgentMessage[] = threadMessages.filter((message, index) => (
    message.role !== 'system'
    && (!lastUser || message.id !== lastUser.id)
    && (rootIndex < 0 || index <= rootIndex || message.role !== 'user')
  ))
  const promptHistory = modelTurnContext.compactThreadHistory({
    messages: promptHistoryInput,
    maxMessages: numberField(run.metadata?.limits, 'maxHistoryMessages'),
    threadSummary: run.metadata?.threadContextSummary,
  })
  const historyTrace = modelTurnContext.buildHistoryCompactedTrace(promptHistory)
  return {
    effectiveUserMessage,
    promptHistory,
    runtimeInputMessages,
    ...(historyTrace ? { historyTrace } : {}),
  }
}

export function buildPromptTooLongRecoveryProjection(input: PreparedModelInput): PromptTooLongRecoveryProjection {
  const recoverySummary = renderPromptTooLongRecoverySummary(input.promptHistory.messages)
  const summary = [input.promptHistory.summary, recoverySummary].filter(Boolean).join('\n\n')
  const preparedInput: PreparedModelInput = {
    ...input,
    promptHistory: {
      messages: [],
      ...(summary ? { summary } : {}),
      compactedCount: input.promptHistory.compactedCount + input.promptHistory.messages.length,
      inputCount: input.promptHistory.inputCount,
      retainedCount: 0,
      filteredCount: input.promptHistory.filteredCount,
      summaryChars: summary.length,
      projectionDecisions: [
        ...input.promptHistory.projectionDecisions,
        {
          action: 'compact',
          stage: 'history_window',
          reason: 'Prompt-too-long recovery collapsed the remaining recent history before retrying.',
          messageCount: input.promptHistory.messages.length,
          retainedCount: 0,
          summaryChars: summary.length,
          maxMessages: 0,
        },
      ],
    },
  }
  return {
    preparedInput,
    droppedHistoryMessageCount: input.promptHistory.messages.length,
    retainedHistoryMessageCount: 0,
    summaryChars: summary.length,
  }
}

function renderPromptTooLongRecoverySummary(messages: AgentMessage[]): string | undefined {
  if (messages.length === 0) return undefined
  return [
    'Prompt-too-long recovery summary:',
    `- ${messages.length} recent history message(s) were collapsed for this retry and are not included verbatim.`,
    ...messages.slice(-6).map((message) => `- ${message.role}: ${truncateForRecoverySummary(message.content)}`),
    '- The full transcript remains durable outside this model-context projection.',
  ].join('\n')
}

function truncateForRecoverySummary(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length <= 180 ? normalized : `${normalized.slice(0, 179)}...`
}

function numberField(value: unknown, key?: string): number | undefined {
  const candidate = key && isJSONRecord(value) ? value[key] : value
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined
}
