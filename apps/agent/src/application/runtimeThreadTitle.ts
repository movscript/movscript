import type { AgentMessage, AgentRunStreamEvent, AgentThread } from '../state/types.js'
import {
  applyThreadTitleGenerationFallback,
  applyThreadTitleGenerationResult,
  markThreadTitleGenerationPending,
  shouldGenerateThreadTitle,
} from '../state/threadTitle.js'
import { normalizeBackendAPIBaseURL, normalizeBackendAuthToken } from './runAuth.js'
import { callModel, type ModelCallInput, type ModelCallResult } from '../model/modelClient.js'
import { resolveRuntimeChatModelConfig } from '../model/modelConfig.js'
import type { ConfiguredRuntimeModelConfig } from '../model/modelConfig.js'

export async function ensureRuntimeThreadTitle(input: {
  thread: AgentThread
  userMessage: AgentMessage | undefined
  authInput?: { backendAuthToken?: unknown; backendAPIBaseURL?: unknown }
  signal?: AbortSignal
  now: () => string
  updateThread: (thread: AgentThread) => void
  runId?: string
  emitRunStreamEvent?: (runId: string, event: AgentRunStreamEvent) => void
  resolveModelConfig?: () => ConfiguredRuntimeModelConfig | undefined
  callModel?: (input: ModelCallInput) => Promise<ModelCallResult>
}): Promise<AgentThread | undefined> {
  const { thread, userMessage } = input
  if (!shouldGenerateThreadTitle(thread, userMessage)) return undefined
  if (!userMessage) return undefined
  markThreadTitleGenerationPending(thread, input.now())
  input.updateThread(thread)

  try {
    const modelConfig = (input.resolveModelConfig ?? resolveRuntimeChatModelConfig)()
    if (!modelConfig) throw new Error('no model config found')
    const result = await (input.callModel ?? callModel)({
      config: modelConfig,
      auth: {
        ...normalizeBackendAuthToken(input.authInput?.backendAuthToken),
        ...normalizeBackendAPIBaseURL(input.authInput?.backendAPIBaseURL),
      },
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: [
            'You generate short chat thread titles.',
            'Return only the title text.',
            'Use the same language as the user message.',
            'Keep it under 12 Chinese characters or 6 English words.',
            'Do not add quotes, punctuation, or explanations.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: userMessage.content.slice(0, 1200),
        },
      ],
      signal: input.signal,
      retry: { maxAttempts: 1 },
    })
    applyThreadTitleGenerationResult({
      thread,
      userMessage,
      modelTitle: result.content,
      now: input.now(),
    })
  } catch (error) {
    applyThreadTitleGenerationFallback({
      thread,
      userMessage,
      error,
      now: input.now(),
    })
  }

  thread.updatedAt = input.now()
  input.updateThread(thread)
  if (input.runId && thread.title?.trim()) {
    input.emitRunStreamEvent?.(input.runId, {
      type: 'thread_title',
      runId: input.runId,
      threadId: thread.id,
      title: thread.title.trim(),
      updatedAt: thread.updatedAt,
    })
  }
  return thread
}

export function applyRuntimeThreadTitleRequest(input: {
  thread: AgentThread
  userMessage: AgentMessage | undefined
  authInput?: { backendAuthToken?: unknown; backendAPIBaseURL?: unknown }
  signal?: AbortSignal
  now: () => string
  updateThread: (thread: AgentThread) => void
  runId?: string
  emitRunStreamEvent?: (runId: string, event: AgentRunStreamEvent) => void
  resolveModelConfig?: () => ConfiguredRuntimeModelConfig | undefined
  callModel?: (input: ModelCallInput) => Promise<ModelCallResult>
}): Promise<AgentThread | undefined> {
  return ensureRuntimeThreadTitle({
    thread: input.thread,
    userMessage: input.userMessage,
    authInput: input.authInput ?? {},
    signal: input.signal,
    now: input.now,
    updateThread: input.updateThread,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.emitRunStreamEvent ? { emitRunStreamEvent: input.emitRunStreamEvent } : {}),
    ...(input.resolveModelConfig ? { resolveModelConfig: input.resolveModelConfig } : {}),
    ...(input.callModel ? { callModel: input.callModel } : {}),
  })
}
