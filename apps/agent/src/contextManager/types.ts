import type { JSONValue } from '../types.js'

export type ContextScope = 'service' | 'profile' | 'thread' | 'run' | 'turn'

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
  | 'profile'
  | 'skill'
  | 'tool_result'
  | 'mcp'
  | 'backend'
  | 'draft'
  | 'memory'
  | 'knowledge'
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

export interface ContextRef {
  type:
    | 'knowledge'
    | 'memory'
    | 'draft'
    | 'tool_result'
    | 'project'
    | 'production'
    | 'asset_slot'
    | 'generation_job'
    | 'plan'
  id: string
  title?: string
  version?: string
  hash?: string
  source?: string
  metadata?: Record<string, JSONValue>
}

export interface RetrievedContextRecord {
  ref: ContextRef
  source: ContextSource
  evidence: EvidenceLevel
  title: string
  summary?: string
  contentHash?: string
  charCount?: number
  retrievedAt: string
  usedInPrompt: boolean
  reusedFromRunId?: string
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
  createdAt: string
  updatedAt: string
}
