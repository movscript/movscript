import { createHash } from 'node:crypto'
import type { RuntimeModelChatMessage, RuntimeModelChatTool } from '../../../model/config/modelConfig.js'
import type { RuntimePromptContext } from '../pipeline/runtimePromptPipeline.js'
import type { ContextBundle, ContextLedger, RetrievedContextRecord } from '../../ledger/shared/contextLedgerTypes.js'
import { refKey } from '../../ledger/retrieval/retrievedContextStore.js'

export interface BuildContextBundleInput {
  promptContext: RuntimePromptContext
  messages: RuntimeModelChatMessage[]
  tools: RuntimeModelChatTool[]
  ledger?: ContextLedger
  runId?: string
  threadId?: string
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  createdAt?: string
}

export function buildContextBundle(input: BuildContextBundleInput): ContextBundle {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const promptHash = stableHash({
    prompt: input.promptContext.promptLedger.promptHash,
    tools: input.tools.map((tool) => tool.function.name),
  })
  const activeRecords = (input.ledger?.retrieved ?? []).filter((record) => (record.status ?? 'active') === 'active')
  const amendedRecords = (input.ledger?.retrieved ?? []).filter((record) => record.status === 'amended')
  const deletedRecords = (input.ledger?.retrieved ?? []).filter((record) => record.status === 'deleted')
  const ledgerFragmentById = new Map(input.promptContext.promptLedger.fragments.map((fragment) => [fragment.id, fragment]))
  return {
    schema: 'movscript.context-bundle.v1',
    id: `ctxb_${hashText([
      input.runId ?? input.ledger?.runId ?? '',
      input.threadId ?? input.ledger?.threadId ?? '',
      input.roundId ?? '',
      String(input.roundIndex ?? ''),
      promptHash,
    ].join(':')).slice(0, 16)}`,
    ...(input.runId ?? input.ledger?.runId ? { runId: input.runId ?? input.ledger?.runId } : {}),
    ...(input.threadId ?? input.ledger?.threadId ? { threadId: input.threadId ?? input.ledger?.threadId } : {}),
    ...(input.roundId ? { roundId: input.roundId } : {}),
    ...(input.roundIndex !== undefined ? { roundIndex: input.roundIndex } : {}),
    ...(input.roundLabel ? { roundLabel: input.roundLabel } : {}),
    createdAt,
    promptLedgerId: input.promptContext.promptLedger.id,
    promptHash,
    messageCount: input.messages.length,
    toolCount: input.tools.length,
    systemMessageCount: input.promptContext.providerProjection.systemMessages.length,
    promptChars: input.promptContext.promptStats.totalChars,
    budget: {
      usedChars: input.promptContext.promptStats.budget.usedChars,
      limitChars: input.promptContext.promptStats.budget.limitChars,
      remainingChars: input.promptContext.promptStats.budget.remainingChars,
      pressure: contextPressure(input.promptContext.promptStats.budget.status),
    },
    promptParts: input.promptContext.promptStats.parts.map((part) => ({
      id: part.id,
      kind: part.kind,
      title: part.title,
      charCount: part.chars,
      hash: ledgerFragmentById.get(part.id)?.contentHash ?? part.contentHash,
      layer: part.layer,
      contextLayer: part.contextLayer,
      source: part.source,
      lifecycle: part.lifecycle,
      authority: part.authority,
    })),
    promptBudget: {
      initialSectionPromptChars: input.promptContext.budgetLedger.initialSectionPromptChars,
      finalSectionPromptChars: input.promptContext.budgetLedger.finalSectionPromptChars,
      decisionCount: input.promptContext.budgetLedger.decisionCount,
      decisions: input.promptContext.budgetLedger.decisions,
    },
    contextRefs: (input.ledger?.retrieved ?? []).map(contextBundleRef),
    activeContextKeys: activeRecords.map((record) => refKey(record.ref)),
    amendedContextKeys: amendedRecords.map((record) => refKey(record.ref)),
    deletedContextKeys: deletedRecords.map((record) => refKey(record.ref)),
  }
}

function contextBundleRef(record: RetrievedContextRecord): ContextBundle['contextRefs'][number] {
  return {
    key: refKey(record.ref),
    ref: record.ref,
    status: record.status ?? 'active',
    title: record.title,
    source: record.source,
    evidence: record.evidence,
    ...(record.version ? { version: record.version } : {}),
    ...(record.contentHash ? { contentHash: record.contentHash } : {}),
    ...(record.charCount !== undefined ? { charCount: record.charCount } : {}),
  }
}

function contextPressure(status: RuntimePromptContext['promptStats']['budget']['status']): NonNullable<ContextBundle['budget']>['pressure'] {
  switch (status) {
    case 'exceeded': return 'over'
    case 'critical': return 'high'
    case 'warning': return 'medium'
    default: return 'low'
  }
}

function stableHash(value: unknown): string {
  return `sha256:${hashText(stableStringify(value))}`
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`
}
