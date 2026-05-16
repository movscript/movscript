import { formatInputAnswerMessage } from '../context/normalizeRunInput.js'
import { buildRuntimeUserMessage, type NormalizedClientInput } from '../context/normalizeClientInput.js'
import { resolveRunInputUserMessage } from '../state/runInput.js'
import type { AgentMessage, AgentRun, AgentThread } from '../state/types.js'

export interface ResolvedRunExecutionInput {
  sourceUser?: AgentMessage
  sourceMessageId?: string
  baseUserMessage: string
  userMessage: string
  answeredInputCount: number
}

export interface ResolvedRunCreationUserInput {
  explicitUserMessage?: string
  sourceUser?: AgentMessage
}

export interface ResolvedPreviewRunMessageInput {
  message: string
  sourceUser?: AgentMessage
  source: 'client_input' | 'message' | 'thread_latest_user'
}

export function resolveRunCreationUserInput(input: {
  userMessage?: unknown
  thread: AgentThread
}): ResolvedRunCreationUserInput {
  const explicitUserMessage = normalizeNonEmptyString(input.userMessage)
  if (explicitUserMessage) return { explicitUserMessage }
  const sourceUser = latestThreadUserMessage(input.thread)
  return sourceUser ? { sourceUser } : {}
}

export function resolveToolRunUserMessage(input: {
  clientInput?: NormalizedClientInput
  message?: unknown
  toolName: string
}): string {
  if (input.clientInput) return buildRuntimeUserMessage(input.clientInput)
  return normalizeNonEmptyString(input.message) ?? `Run tool ${input.toolName}`
}

export function resolveToolRunThreadTitle(input: {
  title?: unknown
  toolName: string
}): string {
  return normalizeNonEmptyString(input.title) ?? `Tool run: ${input.toolName}`
}

export function resolvePreviewRunMessageInput(input: {
  clientInput?: NormalizedClientInput
  message?: unknown
  thread?: AgentThread
}): ResolvedPreviewRunMessageInput {
  if (input.clientInput) {
    return {
      message: buildRuntimeUserMessage(input.clientInput),
      source: 'client_input',
    }
  }
  const explicitMessage = normalizeNonEmptyString(input.message)
  if (explicitMessage) {
    return {
      message: explicitMessage,
      source: 'message',
    }
  }
  const sourceUser = input.thread ? latestThreadUserMessage(input.thread) : undefined
  if (sourceUser) {
    return {
      message: sourceUser.content,
      sourceUser,
      source: 'thread_latest_user',
    }
  }
  throw new Error('preview requires a message or a thread with a user message')
}

export function resolveRunTitleUser(run: AgentRun, thread: AgentThread): AgentMessage | undefined {
  const sourceUser = resolveRunSourceUser(run, thread)
  return sourceUser && run.input?.userMessage
    ? { ...sourceUser, content: run.input.userMessage }
    : sourceUser
}

export function resolveRunExecutionInput(run: AgentRun, thread: AgentThread): ResolvedRunExecutionInput {
  const sourceUser = resolveRunSourceUser(run, thread)
  const baseUserMessage = resolveRunInputUserMessage(run.input, sourceUser?.content)
  if (!baseUserMessage) throw new Error('run requires at least one user message')

  const answeredInputMessages = (run.pendingInputRequests ?? [])
    .filter((request) => request.status === 'answered')
    .map((request) => formatInputAnswerMessage(request, request.answer?.choiceIds ?? [], request.answer?.text))
  const userMessage = answeredInputMessages.length > 0
    ? [
      baseUserMessage,
      '',
      '[后续用户补充]',
      ...answeredInputMessages,
    ].join('\n')
    : baseUserMessage

  return {
    ...(sourceUser ? { sourceUser } : {}),
    ...(sourceUser ? { sourceMessageId: sourceUser.id } : {}),
    baseUserMessage,
    userMessage,
    answeredInputCount: answeredInputMessages.length,
  }
}

function resolveRunSourceUser(run: AgentRun, thread: AgentThread): AgentMessage | undefined {
  const sourceMessageId = getRunSourceMessageId(run)
  if (sourceMessageId) {
    return thread.messages.find((message) => message.id === sourceMessageId && message.role === 'user')
  }
  if (run.input) return undefined
  return [...thread.messages].reverse().find((message) => message.role === 'user')
}

function latestThreadUserMessage(thread: AgentThread): AgentMessage | undefined {
  return [...thread.messages].reverse().find((message) => message.role === 'user')
}

function getRunSourceMessageId(run: AgentRun): string | undefined {
  return run.input?.sourceMessageId
    ?? (typeof run.metadata?.initialUserMessageId === 'string' ? run.metadata.initialUserMessageId : undefined)
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}
