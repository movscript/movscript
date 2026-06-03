import type { JSONValue } from '../../../shared/protocol/types.js'
import { refKey } from '../../ledger/retrieval/retrievedContextStore.js'
import type { ContextLedger, RetrievedContextRecord } from '../../ledger/shared/contextLedgerTypes.js'
import type { PromptFragment } from '../registry/promptFragments.js'

export type PromptEvidenceRef = PromptFragmentEvidenceRef | PromptContextEvidenceRef

export interface PromptFragmentEvidenceRef extends Record<string, JSONValue> {
  kind: 'prompt_fragment'
  id: string
  title: string
  source: PromptFragment['source']
  owner: string
  lifecycle: PromptFragment['lifecycle']
  authority: PromptFragment['instructionAuthority']
  contentHash: string
}

export interface PromptContextEvidenceRef extends Record<string, JSONValue> {
  kind: 'context_ref'
  key: string
  type: string
  id: string
  title: string
  source: string
  evidence: string
  status: string
  contentHash: string | null
  charCount: number | null
  usedInPrompt: boolean
}

export function promptFragmentEvidenceRef(fragment: PromptFragment, title: string): PromptFragmentEvidenceRef {
  return {
    kind: 'prompt_fragment',
    id: fragment.id,
    title,
    source: fragment.source,
    owner: fragment.owner,
    lifecycle: fragment.lifecycle,
    authority: fragment.instructionAuthority,
    contentHash: fragment.contentHash,
  }
}

export function promptContextEvidenceRef(record: RetrievedContextRecord): PromptContextEvidenceRef {
  return {
    kind: 'context_ref',
    key: refKey(record.ref),
    type: record.ref.type,
    id: record.ref.id,
    title: record.ref.title ?? record.title,
    source: record.source,
    evidence: record.evidence,
    status: record.status ?? 'active',
    contentHash: record.contentHash ?? record.ref.hash ?? null,
    charCount: record.charCount ?? null,
    usedInPrompt: record.usedInPrompt,
  }
}

export function promptContextEvidenceRefsFromLedger(ledger: ContextLedger): PromptContextEvidenceRef[] {
  return ledger.retrieved.map(promptContextEvidenceRef)
}
