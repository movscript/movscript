import { createHash } from 'node:crypto'
import { runtimeModelContentText } from '../../../messages/model/modelMessage.js'
import type { ProviderPromptProjection } from '../compiler/providerPromptProjectionCompiler.js'
import type { PromptBundle } from '../compiler/promptBundle.js'
import type { PromptBudgetLedger } from '../policy/promptPolicy.js'
import type { PromptFragment } from '../registry/promptFragments.js'
import { promptFragmentEvidenceRef, type PromptFragmentEvidenceRef } from './promptEvidence.js'

export interface PromptLedger {
  schema: 'movscript.prompt-ledger.v1'
  id: string
  promptBundleId: string
  promptHash: string
  sectionPromptHash: string
  providerSystemPromptHash: string
  messageCount: number
  systemMessageCount: number
  sectionPromptChars: number
  providerSystemChars: number
  requestChars: number
  fragmentCount: number
  fragments: PromptLedgerFragment[]
  evidenceRefs: PromptFragmentEvidenceRef[]
  budget: PromptBudgetLedger
}

export interface PromptLedgerFragment {
  id: string
  title: string
  kind: string
  source: PromptFragment['source']
  owner: string
  layer: PromptFragment['layer']
  lifecycle: PromptFragment['lifecycle']
  authority: PromptFragment['instructionAuthority']
  trustLevel: PromptFragment['trustLevel']
  contentHash: string
  renderMode: PromptFragment['renderMode']
  budgetPriority: number
  inclusionReason: string
}

export function buildPromptLedger(input: {
  promptBundle: PromptBundle
  providerProjection: ProviderPromptProjection
  budget: PromptBudgetLedger
}): PromptLedger {
  const fragments = input.promptBundle.sections.map((section) => {
    const fragment = section.fragment
    return {
      id: fragment.id,
      title: section.title,
      kind: section.kind,
      source: fragment.source,
      owner: fragment.owner,
      layer: fragment.layer,
      lifecycle: fragment.lifecycle,
      authority: fragment.instructionAuthority,
      trustLevel: fragment.trustLevel,
      contentHash: fragment.contentHash,
      renderMode: fragment.renderMode,
      budgetPriority: fragment.budgetPriority,
      inclusionReason: fragment.inclusionReason,
    }
  })
  const promptHash = stableHash({
    messages: input.providerProjection.messages.map((message) => ({
      role: message.role,
      content: runtimeModelContentText(message.content),
      tool_call_id: 'tool_call_id' in message ? message.tool_call_id : undefined,
    })),
  })
  const sectionPromptHash = `sha256:${hashText(input.promptBundle.sectionPrompt)}`
  const providerSystemPromptHash = `sha256:${hashText(input.providerProjection.systemPrompt)}`
  return {
    schema: 'movscript.prompt-ledger.v1',
    id: `prompt_${promptHash.slice('sha256:'.length, 'sha256:'.length + 16)}`,
    promptBundleId: input.promptBundle.id,
    promptHash,
    sectionPromptHash,
    providerSystemPromptHash,
    messageCount: input.providerProjection.messages.length,
    systemMessageCount: input.providerProjection.systemMessages.length,
    sectionPromptChars: input.promptBundle.sectionPrompt.length,
    providerSystemChars: input.providerProjection.systemPrompt.length,
    requestChars: input.providerProjection.messages.reduce((total, message) => total + message.role.length + runtimeModelContentText(message.content).length + 2, 0),
    fragmentCount: fragments.length,
    fragments,
    evidenceRefs: input.promptBundle.sections.map((section) => promptFragmentEvidenceRef(section.fragment, section.title)),
    budget: input.budget,
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
