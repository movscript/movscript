import type { AgentMessage, AgentInternalRunSignal, AgentThread } from '../../../state/shared/types.js'
import {
  applyThreadTitleGenerationFallback,
  applyThreadTitleGenerationResult,
  markThreadTitleGenerationPending,
  shouldGenerateThreadTitle,
} from '../../../state/thread/threadTitle.js'
import { normalizeBackendAPIBaseURL, normalizeBackendAuthToken } from '../../run/auth/runAuth.js'
import { callModel, type ModelCallInput, type ModelCallResult } from '../../../model/client/modelClient.js'
import { resolveRuntimeChatModelConfig } from '../../../model/config/modelConfig.js'
import { runtimeModelTextContent } from '../../../messages/model/modelMessage.js'
import type { ConfiguredRuntimeModelConfig } from '../../../model/config/modelConfig.js'

export async function ensureRuntimeThreadTitle(input: {
  thread: AgentThread
  userMessage: AgentMessage | undefined
  authInput?: { backendAuthToken?: unknown; backendAPIBaseURL?: unknown }
  signal?: AbortSignal
  now: () => string
  getThread?: (threadId: string) => AgentThread | undefined
  updateThread: (thread: AgentThread) => void
  runId?: string
  emitRunStreamEvent?: (runId: string, event: AgentInternalRunSignal) => void
  resolveModelConfig?: () => ConfiguredRuntimeModelConfig | undefined
  callModel?: (input: ModelCallInput) => Promise<ModelCallResult>
}): Promise<AgentThread | undefined> {
  const { userMessage } = input
  const thread = input.getThread?.(input.thread.id) ?? input.thread
  if (!shouldGenerateThreadTitle(thread, userMessage)) return undefined
  if (!userMessage) return undefined
  markThreadTitleGenerationPending(thread, input.now(), userMessage)
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
          content: runtimeModelTextContent([
            'You generate short chat thread titles.',
            'Return only the title text.',
            'Use the same language as the user message.',
            'Keep it under 12 Chinese characters or 6 English words.',
            'Do not add quotes, punctuation, or explanations.',
          ].join('\n')),
        },
        {
          role: 'user',
          content: runtimeModelTextContent(userMessage.content.slice(0, 1200)),
        },
      ],
      signal: input.signal,
      retry: { maxAttempts: 1 },
    })
    const targetThread = input.getThread?.(thread.id) ?? thread
    applyThreadTitleGenerationResult({
      thread: targetThread,
      userMessage,
      modelTitle: result.content,
      now: input.now(),
    })
    return persistGeneratedThreadTitle({
      thread: targetThread,
      runId: input.runId,
      now: input.now,
      getThread: input.getThread,
      updateThread: input.updateThread,
      emitRunStreamEvent: input.emitRunStreamEvent,
    })
  } catch (error) {
    const targetThread = input.getThread?.(thread.id) ?? thread
    applyThreadTitleGenerationFallback({
      thread: targetThread,
      userMessage,
      error,
      now: input.now(),
    })
    return persistGeneratedThreadTitle({
      thread: targetThread,
      runId: input.runId,
      now: input.now,
      getThread: input.getThread,
      updateThread: input.updateThread,
      emitRunStreamEvent: input.emitRunStreamEvent,
    })
  }
}

export function applyRuntimeThreadTitleRequest(input: {
  thread: AgentThread
  userMessage: AgentMessage | undefined
  authInput?: { backendAuthToken?: unknown; backendAPIBaseURL?: unknown }
  signal?: AbortSignal
  now: () => string
  getThread?: (threadId: string) => AgentThread | undefined
  updateThread: (thread: AgentThread) => void
  runId?: string
  emitRunStreamEvent?: (runId: string, event: AgentInternalRunSignal) => void
  resolveModelConfig?: () => ConfiguredRuntimeModelConfig | undefined
  callModel?: (input: ModelCallInput) => Promise<ModelCallResult>
}): Promise<AgentThread | undefined> {
  return ensureRuntimeThreadTitle({
    thread: input.thread,
    userMessage: input.userMessage,
    authInput: input.authInput ?? {},
    signal: input.signal,
    now: input.now,
    ...(input.getThread ? { getThread: input.getThread } : {}),
    updateThread: input.updateThread,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.emitRunStreamEvent ? { emitRunStreamEvent: input.emitRunStreamEvent } : {}),
    ...(input.resolveModelConfig ? { resolveModelConfig: input.resolveModelConfig } : {}),
    ...(input.callModel ? { callModel: input.callModel } : {}),
  })
}

function persistGeneratedThreadTitle(input: {
  thread: AgentThread
  runId?: string
  now: () => string
  getThread?: (threadId: string) => AgentThread | undefined
  updateThread: (thread: AgentThread) => void
  emitRunStreamEvent?: (runId: string, event: AgentInternalRunSignal) => void
}): AgentThread {
  const updatedAt = input.now()
  const thread = mergeGeneratedThreadTitle(input.getThread?.(input.thread.id), input.thread, updatedAt)
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

function mergeGeneratedThreadTitle(latest: AgentThread | undefined, titled: AgentThread, updatedAt: string): AgentThread {
  const thread = latest ? { ...latest } : titled
  thread.title = titled.title
  thread.metadata = {
    ...(latest?.metadata ?? titled.metadata ?? {}),
    ...(titled.metadata?.titleGeneratedAt ? { titleGeneratedAt: titled.metadata.titleGeneratedAt } : {}),
    ...(titled.metadata?.titleGenerationStatus ? { titleGenerationStatus: titled.metadata.titleGenerationStatus } : {}),
    ...(titled.metadata?.titleSourceMessageId ? { titleSourceMessageId: titled.metadata.titleSourceMessageId } : {}),
    ...(titled.metadata?.titleSource ? { titleSource: titled.metadata.titleSource } : {}),
    ...(titled.metadata?.titleGenerationError ? { titleGenerationError: titled.metadata.titleGenerationError } : {}),
  }
  thread.updatedAt = updatedAt
  return thread
}
