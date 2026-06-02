import type { JSONValue } from '../../../shared/protocol/types.js'

export type ContextScope = 'service' | 'config_file' | 'thread' | 'run' | 'turn'

export type ContextLayer =
  | 'runtime_contract'
  | 'focus'
  | 'behavior'
  | 'retrieved'
  | 'tool_loop'
  | 'thread_continuity'
  | 'warning'

export type ContextSource =
  | 'system'
  | 'catalog'
  | 'config_file'
  | 'skill'
  | 'tool_result'
  | 'mcp'
  | 'backend'
  | 'draft'
  | 'memory'
  | 'reference'
  | 'user_input'
  | 'assistant_history'
  | 'thread_summary'

export type EvidenceLevel =
  | 'verified'
  | 'runtime_state'
  | 'user_claimed'
  | 'draft'
  | 'advisory'
  | 'summary'
  | 'unknown'

export type ContextRecordStatus = 'active' | 'amended' | 'deleted' | 'expired'

export interface ContextRef {
  type:
    | 'reference'
    | 'memory'
    | 'draft'
    | 'tool_result'
    | 'project'
    | 'production'
    | 'asset_slot'
    | 'generation_job'
    | 'taskGraph'
  id: string
  title?: string
  version?: string
  hash?: string
  source?: string
  metadata?: Record<string, JSONValue>
}

export interface RetrievedContextRecord {
  id?: string
  version?: string
  ref: ContextRef
  status?: ContextRecordStatus
  source: ContextSource
  evidence: EvidenceLevel
  title: string
  summary?: string
  contentHash?: string
  charCount?: number
  retrievedAt: string
  usedInPrompt: boolean
  reusedFromRunId?: string
  supersedes?: string
  amendedBy?: string
  deletedBy?: string
  deletedAt?: string
  deleteReason?: string
  mutationId?: string
  updatedAt?: string
}

export interface FactRecord {
  id: string
  claim: string
  evidence: EvidenceLevel
  source: ContextSource
  refs: ContextRef[]
  createdAt: string
}

export interface ContextLedger {
  schema: 'movscript.context-ledger.v1'
  runId: string
  threadId: string
  catalogSnapshotId: string
  catalogSnapshotVersion?: string
  activeSkillIds: string[]
  visibleToolNames: string[]
  retrieved: RetrievedContextRecord[]
  facts: FactRecord[]
  artifactRefs: ContextRef[]
  unresolvedQuestions: Array<{
    id: string
    question: string
    blocking: boolean
    source: ContextSource
  }>
  mutations?: ContextMutation[]
  createdAt: string
  updatedAt: string
}

export type ContextMutation =
  | {
    id: string
    type: 'append'
    record: RetrievedContextRecord
    reason?: string
    createdAt: string
  }
  | {
    id: string
    type: 'amend'
    targetKey: string
    record: RetrievedContextRecord
    reason?: string
    createdAt: string
  }
  | {
    id: string
    type: 'delete'
    targetKey: string
    reason?: string
    createdAt: string
  }

export interface ContextMutationSummary {
  schema: 'movscript.context-mutation-summary.v1'
  total: number
  appended: number
  amended: number
  deleted: number
  affectedContextKeys: string[]
  appendedContextKeys: string[]
  amendedContextKeys: string[]
  deletedContextKeys: string[]
  latest?: {
    id: string
    type: ContextMutation['type']
    createdAt: string
    reason?: string
  }
}

export interface ContextBundle {
  schema: 'movscript.context-bundle.v1'
  id: string
  runId?: string
  threadId?: string
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  createdAt: string
  promptHash: string
  messageCount: number
  toolCount: number
  systemMessageCount: number
  promptChars: number
  budget?: {
    usedChars: number
    limitChars: number
    remainingChars: number
    pressure: 'low' | 'medium' | 'high' | 'over'
  }
  promptParts: Array<{
    id: string
    kind: string
    title: string
    charCount: number
    hash: string
    layer?: string
    contextLayer?: string
  }>
  promptBudget?: {
    initialSystemChars: number
    finalSystemChars: number
    decisionCount: number
    decisions: Array<{
      action: string
      stage: string
      partId: string
      partTitle: string
      partKind: string
      reason: string
      originalChars: number
      renderedChars: number
      promptCharsBefore: number
      promptCharsAfter: number
      limitChars: number
      priority?: number
    }>
  }
  contextRefs: Array<{
    key: string
    ref: ContextRef
    status: ContextRecordStatus
    title: string
    source: ContextSource
    evidence: EvidenceLevel
    version?: string
    contentHash?: string
    charCount?: number
  }>
  activeContextKeys: string[]
  amendedContextKeys: string[]
  deletedContextKeys: string[]
}
