import type { AgentMemory } from '../memory/types.js'
import type { AgentMessage, AgentRun } from '../state/types.js'
import type { ContextRef, FactRecord } from '../contextManager/types.js'
import { isRecord } from '../jsonValue.js'

const DEFAULT_MAX_PROMPT_HISTORY_MESSAGES = 6
const MAX_SUMMARY_ITEM_CHARS = 180
const MAX_THREAD_SUMMARY_CHARS = 4000

const RUNTIME_FAILURE_PATTERNS = [
  /^运行失败：/,
  /^模型这次没有完成回复。/,
  /^模型调用未完成：/,
  /^警告：运行失败/,
  /^警告：模型调用未完成/,
  /backend model gateway HTTP \d+/i,
  /backend model gateway returned/i,
  /no model config found/i,
]

export function filterPromptHistory(messages: AgentMessage[]): AgentMessage[] {
  return messages.filter((message) => !isRuntimeFailureAssistantMessage(message))
}

export interface CompactedPromptHistory {
  messages: AgentMessage[]
  summary?: string
  compactedCount: number
}

export interface ThreadContextSummary {
  schema: 'movscript.thread-context-summary.v1'
  threadId: string
  updatedAt: string
  userGoal?: string
  stablePreferences: string[]
  acceptedFacts: FactRecord[]
  artifactRefs: ContextRef[]
  openDecisions: string[]
  recentRunRefs: Array<{
    runId: string
    summary: string
    artifactRefs: ContextRef[]
    retrievedRefs: ContextRef[]
  }>
}

export function compactPromptHistory(
  messages: AgentMessage[],
  maxMessages = DEFAULT_MAX_PROMPT_HISTORY_MESSAGES,
  threadSummary?: ThreadContextSummary,
): CompactedPromptHistory {
  const filtered = filterPromptHistory(messages)
  const normalizedMax = Number.isFinite(maxMessages) ? Math.max(0, Math.floor(maxMessages)) : DEFAULT_MAX_PROMPT_HISTORY_MESSAGES
  if (filtered.length <= normalizedMax) {
    return {
      messages: filtered,
      ...(threadSummary ? { summary: renderThreadContextSummary(threadSummary) } : {}),
      compactedCount: 0,
    }
  }
  const compacted = filtered.slice(0, filtered.length - normalizedMax)
  const recent = filtered.slice(-normalizedMax)
  const compactedSummary = renderThreadContinuitySummary(compacted)
  const persistedSummary = threadSummary ? renderThreadContextSummary(threadSummary) : undefined
  return {
    messages: recent,
    summary: [persistedSummary, compactedSummary].filter(Boolean).join('\n\n'),
    compactedCount: compacted.length,
  }
}

export function buildThreadContextSummary(input: {
  threadId: string
  messages: AgentMessage[]
  run: AgentRun
  now?: string
  previous?: ThreadContextSummary
  maxRunRefs?: number
  maxSummaryChars?: number
}): ThreadContextSummary {
  const now = input.now ?? new Date().toISOString()
  const previous = input.previous
  const assistant = input.run.assistantMessageId
    ? input.messages.find((message) => message.id === input.run.assistantMessageId)
    : [...input.messages].reverse().find((message) => message.runId === input.run.id && message.role === 'assistant')
  const user = [...input.messages].reverse().find((message) => message.runId !== input.run.id && message.role === 'user')
    ?? [...input.messages].reverse().find((message) => message.role === 'user')
  const ledger = normalizeLedger(input.run.metadata?.contextLedger)
  const artifactRefs = mergeContextRefs(previous?.artifactRefs ?? [], ledger.artifactRefs)
  const retrievedRefs = ledger.retrieved.map((record) => record.ref)
  const recentRunRef = {
    runId: input.run.id,
    summary: truncateSummary(assistant?.content ?? input.run.warnings?.join('\n') ?? input.run.status, input.maxSummaryChars ?? MAX_THREAD_SUMMARY_CHARS),
    artifactRefs: ledger.artifactRefs,
    retrievedRefs,
  }
  return {
    schema: 'movscript.thread-context-summary.v1',
    threadId: input.threadId,
    updatedAt: now,
    ...(user?.content ? { userGoal: truncateSummary(user.content, 500) } : previous?.userGoal ? { userGoal: previous.userGoal } : {}),
    stablePreferences: previous?.stablePreferences ?? [],
    acceptedFacts: previous?.acceptedFacts ?? [],
    artifactRefs,
    openDecisions: previous?.openDecisions ?? [],
    recentRunRefs: [recentRunRef, ...(previous?.recentRunRefs ?? []).filter((ref) => ref.runId !== input.run.id)].slice(0, input.maxRunRefs ?? 8),
  }
}

export function normalizeThreadContextSummary(value: unknown): ThreadContextSummary | undefined {
  if (!isRecord(value) || value.schema !== 'movscript.thread-context-summary.v1') return undefined
  const threadId = stringField(value.threadId)
  const updatedAt = stringField(value.updatedAt)
  if (!threadId || !updatedAt) return undefined
  return {
    schema: 'movscript.thread-context-summary.v1',
    threadId,
    updatedAt,
    ...(stringField(value.userGoal) ? { userGoal: stringField(value.userGoal) } : {}),
    stablePreferences: stringArray(value.stablePreferences),
    acceptedFacts: [],
    artifactRefs: Array.isArray(value.artifactRefs) ? value.artifactRefs.flatMap(normalizeContextRef) : [],
    openDecisions: stringArray(value.openDecisions),
    recentRunRefs: Array.isArray(value.recentRunRefs) ? value.recentRunRefs.flatMap(normalizeRecentRunRef) : [],
  }
}

export function filterPromptMemories(memories: AgentMemory[]): AgentMemory[] {
  return memories.filter((memory) => !isRuntimeFailureText(`${memory.title}\n${memory.content}`))
}

export function buildPromptMemoryIndex(memories: AgentMemory[]): AgentMemory[] {
  return filterPromptMemories(memories).map((memory) => ({
    ...memory,
    content: '',
  }))
}

export function isRuntimeFailureText(text: string): boolean {
  const normalized = text.trim()
  return RUNTIME_FAILURE_PATTERNS.some((pattern) => pattern.test(normalized))
}

function isRuntimeFailureAssistantMessage(message: AgentMessage): boolean {
  return message.role === 'assistant' && isRuntimeFailureText(message.content)
}

function renderThreadContinuitySummary(messages: AgentMessage[]): string {
  const lines = [
    'Earlier thread continuity summary:',
    `- ${messages.length} older message(s) were compacted and are not included verbatim.`,
    ...messages.slice(-6).map((message) => `- ${message.role}: ${truncateForSummary(message.content)}`),
    '- Treat this summary as conversation continuity, not a source of current project facts.',
  ]
  return lines.join('\n')
}

function renderThreadContextSummary(summary: ThreadContextSummary): string {
  const lines = [
    'Persisted thread context summary:',
    summary.userGoal ? `- User goal: ${summary.userGoal}` : undefined,
    summary.artifactRefs.length > 0 ? `- Artifact refs: ${summary.artifactRefs.map(formatRef).join(', ')}` : undefined,
    summary.openDecisions.length > 0 ? `- Open decisions: ${summary.openDecisions.join('; ')}` : undefined,
    summary.recentRunRefs.length > 0 ? '- Recent runs:' : undefined,
    ...summary.recentRunRefs.slice(0, 4).map((run) => `  - ${run.runId}: ${run.summary}${run.retrievedRefs.length > 0 ? `; refs=${run.retrievedRefs.map(formatRef).join(', ')}` : ''}`),
    '- Treat this summary as conversation continuity, not a source of current project facts.',
  ].filter(Boolean)
  return lines.join('\n')
}

function truncateForSummary(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length <= MAX_SUMMARY_ITEM_CHARS ? normalized : `${normalized.slice(0, MAX_SUMMARY_ITEM_CHARS - 1)}…`
}

function truncateSummary(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  const limit = Number.isFinite(maxChars) ? Math.max(1, Math.floor(maxChars)) : MAX_THREAD_SUMMARY_CHARS
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`
}

function normalizeLedger(value: unknown): { retrieved: Array<{ ref: ContextRef }>; artifactRefs: ContextRef[] } {
  if (!isRecord(value)) return { retrieved: [], artifactRefs: [] }
  return {
    retrieved: Array.isArray(value.retrieved)
      ? value.retrieved.flatMap((record) => {
        if (!isRecord(record)) return []
        const ref = normalizeContextRef(record.ref)[0]
        return ref ? [{ ref }] : []
      })
      : [],
    artifactRefs: Array.isArray(value.artifactRefs) ? value.artifactRefs.flatMap(normalizeContextRef) : [],
  }
}

function normalizeRecentRunRef(value: unknown): ThreadContextSummary['recentRunRefs'] {
  if (!isRecord(value)) return []
  const runId = stringField(value.runId)
  const summary = stringField(value.summary)
  if (!runId || !summary) return []
  return [{
    runId,
    summary,
    artifactRefs: Array.isArray(value.artifactRefs) ? value.artifactRefs.flatMap(normalizeContextRef) : [],
    retrievedRefs: Array.isArray(value.retrievedRefs) ? value.retrievedRefs.flatMap(normalizeContextRef) : [],
  }]
}

function normalizeContextRef(value: unknown): ContextRef[] {
  if (!isRecord(value)) return []
  const type = value.type
  const id = stringField(value.id)
  if (!id || !isContextRefType(type)) return []
  return [{
    type,
    id,
    ...(stringField(value.title) ? { title: stringField(value.title) } : {}),
    ...(stringField(value.version) ? { version: stringField(value.version) } : {}),
    ...(stringField(value.hash) ? { hash: stringField(value.hash) } : {}),
    ...(stringField(value.source) ? { source: stringField(value.source) } : {}),
  }]
}

function mergeContextRefs(left: ContextRef[], right: ContextRef[]): ContextRef[] {
  const byKey = new Map<string, ContextRef>()
  for (const ref of [...left, ...right]) byKey.set(`${ref.type}:${ref.id}:${ref.version ?? ref.hash ?? ''}`, ref)
  return Array.from(byKey.values())
}

function formatRef(ref: ContextRef): string {
  return `${ref.type}#${ref.id}${ref.title ? ` ${ref.title}` : ''}`
}

function isContextRefType(value: unknown): value is ContextRef['type'] {
  return value === 'knowledge'
    || value === 'memory'
    || value === 'draft'
    || value === 'tool_result'
    || value === 'project'
    || value === 'production'
    || value === 'asset_slot'
    || value === 'generation_job'
    || value === 'plan'
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}
