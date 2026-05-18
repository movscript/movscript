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
  schema: 'movscript.thread-context-summary.v2'
  threadId: string
  updatedAt: string
  userGoal?: string
  stablePreferences: string[]
  acceptedFacts: FactRecord[]
  artifactRefs: ContextRef[]
  retrievedRefs: ContextRef[]
  invalidatedRefs: ContextRef[]
  openDecisions: string[]
  recentRunRefs: Array<{
    runId: string
    summary: string
    artifactRefs: ContextRef[]
    retrievedRefs: ContextRef[]
  }>
  summaryProvenance: {
    strategy: 'deterministic'
    runId: string
    createdAt: string
    factsRequireEvidence: true
    summariesAreAdvisory: true
  }
  compactStats: {
    recentRunRefCount: number
    artifactRefCount: number
    retrievedRefCount: number
    acceptedFactCount: number
    invalidatedRefCount: number
    maxSummaryChars: number
  }
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
  const allRetrievedRefs = mergeContextRefs(previous?.retrievedRefs ?? [], retrievedRefs)
  const acceptedFacts = mergeFacts(previous?.acceptedFacts ?? [], ledger.facts)
  const invalidatedRefs = mergeContextRefs(previous?.invalidatedRefs ?? [], normalizeInvalidatedRefs(input.run.metadata?.invalidatedContextRefs))
  const recentRunRef = {
    runId: input.run.id,
    summary: truncateSummary(assistant?.content ?? input.run.warnings?.join('\n') ?? input.run.status, input.maxSummaryChars ?? MAX_THREAD_SUMMARY_CHARS),
    artifactRefs: ledger.artifactRefs,
    retrievedRefs,
  }
  const maxSummaryChars = input.maxSummaryChars ?? MAX_THREAD_SUMMARY_CHARS
  const recentRunRefs = [recentRunRef, ...(previous?.recentRunRefs ?? []).filter((ref) => ref.runId !== input.run.id)].slice(0, input.maxRunRefs ?? 8)
  return {
    schema: 'movscript.thread-context-summary.v2',
    threadId: input.threadId,
    updatedAt: now,
    ...(user?.content ? { userGoal: truncateSummary(user.content, 500) } : previous?.userGoal ? { userGoal: previous.userGoal } : {}),
    stablePreferences: previous?.stablePreferences ?? [],
    acceptedFacts,
    artifactRefs,
    retrievedRefs: allRetrievedRefs,
    invalidatedRefs,
    openDecisions: previous?.openDecisions ?? [],
    recentRunRefs,
    summaryProvenance: {
      strategy: 'deterministic',
      runId: input.run.id,
      createdAt: now,
      factsRequireEvidence: true,
      summariesAreAdvisory: true,
    },
    compactStats: {
      recentRunRefCount: recentRunRefs.length,
      artifactRefCount: artifactRefs.length,
      retrievedRefCount: allRetrievedRefs.length,
      acceptedFactCount: acceptedFacts.length,
      invalidatedRefCount: invalidatedRefs.length,
      maxSummaryChars,
    },
  }
}

export function normalizeThreadContextSummary(value: unknown): ThreadContextSummary | undefined {
  if (!isRecord(value) || value.schema !== 'movscript.thread-context-summary.v2') return undefined
  const threadId = stringField(value.threadId)
  const updatedAt = stringField(value.updatedAt)
  if (!threadId || !updatedAt) return undefined
  const recentRunRefs = Array.isArray(value.recentRunRefs) ? value.recentRunRefs.flatMap(normalizeRecentRunRef) : []
  const artifactRefs = Array.isArray(value.artifactRefs) ? value.artifactRefs.flatMap(normalizeContextRef) : []
  const retrievedRefs = Array.isArray(value.retrievedRefs) ? value.retrievedRefs.flatMap(normalizeContextRef) : []
  const invalidatedRefs = Array.isArray(value.invalidatedRefs) ? value.invalidatedRefs.flatMap(normalizeContextRef) : []
  const acceptedFacts = Array.isArray(value.acceptedFacts) ? value.acceptedFacts.flatMap(normalizeFactRecord) : []
  const provenance = normalizeSummaryProvenance(value.summaryProvenance, recentRunRefs[0]?.runId, updatedAt)
  return {
    schema: 'movscript.thread-context-summary.v2',
    threadId,
    updatedAt,
    ...(stringField(value.userGoal) ? { userGoal: stringField(value.userGoal) } : {}),
    stablePreferences: stringArray(value.stablePreferences),
    acceptedFacts,
    artifactRefs,
    retrievedRefs,
    invalidatedRefs,
    openDecisions: stringArray(value.openDecisions),
    recentRunRefs,
    summaryProvenance: provenance,
    compactStats: normalizeCompactStats(value.compactStats, {
      recentRunRefCount: recentRunRefs.length,
      artifactRefCount: artifactRefs.length,
      retrievedRefCount: retrievedRefs.length,
      acceptedFactCount: acceptedFacts.length,
      invalidatedRefCount: invalidatedRefs.length,
      maxSummaryChars: MAX_THREAD_SUMMARY_CHARS,
    }),
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
    summary.retrievedRefs.length > 0 ? `- Retrieved refs: ${summary.retrievedRefs.slice(0, 12).map(formatRef).join(', ')}${summary.retrievedRefs.length > 12 ? `; ${summary.retrievedRefs.length - 12} more` : ''}` : undefined,
    summary.acceptedFacts.length > 0 ? '- Accepted facts:' : undefined,
    ...summary.acceptedFacts.slice(0, 8).map((fact) => `  - ${fact.claim} (source=${fact.source}; evidence=${fact.evidence}; refs=${fact.refs.map(formatRef).join(', ') || 'none'})`),
    summary.invalidatedRefs.length > 0 ? `- Invalidated refs: ${summary.invalidatedRefs.map(formatRef).join(', ')}` : undefined,
    summary.openDecisions.length > 0 ? `- Open decisions: ${summary.openDecisions.join('; ')}` : undefined,
    summary.recentRunRefs.length > 0 ? '- Recent runs:' : undefined,
    ...summary.recentRunRefs.slice(0, 4).map((run) => `  - ${run.runId}: ${run.summary}${run.retrievedRefs.length > 0 ? `; refs=${run.retrievedRefs.map(formatRef).join(', ')}` : ''}`),
    `- Summary provenance: strategy=${summary.summaryProvenance.strategy}; sourceRun=${summary.summaryProvenance.runId}; factsRequireEvidence=${summary.summaryProvenance.factsRequireEvidence}; summariesAreAdvisory=${summary.summaryProvenance.summariesAreAdvisory}.`,
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

function normalizeLedger(value: unknown): { retrieved: Array<{ ref: ContextRef }>; artifactRefs: ContextRef[]; facts: FactRecord[] } {
  if (!isRecord(value)) return { retrieved: [], artifactRefs: [], facts: [] }
  return {
    retrieved: Array.isArray(value.retrieved)
      ? value.retrieved.flatMap((record) => {
        if (!isRecord(record)) return []
        const ref = normalizeContextRef(record.ref)[0]
        return ref ? [{ ref }] : []
      })
      : [],
    artifactRefs: Array.isArray(value.artifactRefs) ? value.artifactRefs.flatMap(normalizeContextRef) : [],
    facts: Array.isArray(value.facts) ? value.facts.flatMap(normalizeFactRecord) : [],
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

function mergeFacts(left: FactRecord[], right: FactRecord[]): FactRecord[] {
  const byId = new Map<string, FactRecord>()
  for (const fact of [...left, ...right]) byId.set(fact.id, fact)
  return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

function normalizeInvalidatedRefs(value: unknown): ContextRef[] {
  return Array.isArray(value) ? value.flatMap(normalizeContextRef) : []
}

function normalizeFactRecord(value: unknown): FactRecord[] {
  if (!isRecord(value)) return []
  const id = stringField(value.id)
  const claim = stringField(value.claim)
  const source = normalizeContextSource(value.source)
  const evidence = normalizeEvidenceLevel(value.evidence)
  const createdAt = stringField(value.createdAt)
  if (!id || !claim || !source || !evidence || !createdAt) return []
  return [{
    id,
    claim,
    source,
    evidence,
    refs: Array.isArray(value.refs) ? value.refs.flatMap(normalizeContextRef) : [],
    createdAt,
  }]
}

function normalizeSummaryProvenance(value: unknown, fallbackRunId: string | undefined, fallbackCreatedAt: string): ThreadContextSummary['summaryProvenance'] {
  const record = isRecord(value) ? value : undefined
  return {
    strategy: 'deterministic',
    runId: stringField(record?.runId) ?? fallbackRunId ?? 'unknown',
    createdAt: stringField(record?.createdAt) ?? fallbackCreatedAt,
    factsRequireEvidence: true,
    summariesAreAdvisory: true,
  }
}

function normalizeCompactStats(value: unknown, fallback: ThreadContextSummary['compactStats']): ThreadContextSummary['compactStats'] {
  const record = isRecord(value) ? value : undefined
  return {
    recentRunRefCount: numberField(record?.recentRunRefCount) ?? fallback.recentRunRefCount,
    artifactRefCount: numberField(record?.artifactRefCount) ?? fallback.artifactRefCount,
    retrievedRefCount: numberField(record?.retrievedRefCount) ?? fallback.retrievedRefCount,
    acceptedFactCount: numberField(record?.acceptedFactCount) ?? fallback.acceptedFactCount,
    invalidatedRefCount: numberField(record?.invalidatedRefCount) ?? fallback.invalidatedRefCount,
    maxSummaryChars: numberField(record?.maxSummaryChars) ?? fallback.maxSummaryChars,
  }
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

function normalizeContextSource(value: unknown): FactRecord['source'] | undefined {
  return value === 'system'
    || value === 'catalog'
    || value === 'profile'
    || value === 'skill'
    || value === 'tool_result'
    || value === 'mcp'
    || value === 'backend'
    || value === 'draft'
    || value === 'memory'
    || value === 'knowledge'
    || value === 'user_input'
    || value === 'assistant_history'
    || value === 'thread_summary'
    ? value
    : undefined
}

function normalizeEvidenceLevel(value: unknown): FactRecord['evidence'] | undefined {
  return value === 'verified'
    || value === 'runtime_state'
    || value === 'user_claimed'
    || value === 'draft'
    || value === 'advisory'
    || value === 'summary'
    || value === 'unknown'
    ? value
    : undefined
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}
