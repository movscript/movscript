import { estimateRuntimeModelRequestChars, type ProviderPromptProjection } from '../compiler/providerPromptProjectionCompiler.js'
import type { PromptBundle } from '../compiler/promptBundle.js'
import type { PromptFragment, PromptFragmentInstructionAuthority, PromptFragmentLifecycle, PromptFragmentSource } from '../registry/promptFragments.js'
import type { PromptBudgetLedger } from '../policy/promptPolicy.js'

export interface PromptStats {
  totalChars: number
  sectionPromptChars: number
  providerSystemChars: number
  conversationChars: number
  budget: ContextBudgetSnapshot
  parts: Array<{
    id: string
    title: string
    kind: string
    layer: PromptLayer
    contextLayer: ContextPromptLayer
    source: PromptFragmentSource
    lifecycle: PromptFragmentLifecycle
    authority: PromptFragmentInstructionAuthority
    chars: number
    contentHash: string
  }>
  byLayer: Record<PromptLayer, number>
  byContextLayer: Record<ContextPromptLayer, number>
  bySource: Record<string, number>
  byAuthority: Record<string, number>
  budgetLedger: PromptBudgetLedger
}

export interface ContextBudgetSnapshot {
  limitChars: number
  usedChars: number
  remainingChars: number
  usageRatio: number
  deliveryStatus: 'consumed'
  status: 'ok' | 'warning' | 'critical' | 'exceeded'
}

export type PromptLayer = 'level0_core' | 'level1_context' | 'level2_behavior' | 'retrieved_context' | 'runtime_warnings'

export type ContextPromptLayer =
  | 'runtime_contract'
  | 'focus'
  | 'behavior'
  | 'retrieved'
  | 'tool_loop'
  | 'thread_continuity'
  | 'warning'

export function buildPromptStats(input: {
  promptBundle: PromptBundle
  providerProjection: ProviderPromptProjection
  limitChars: number
  budgetLedger: PromptBudgetLedger
}): PromptStats {
  const byLayer: Record<PromptLayer, number> = {
    level0_core: 0,
    level1_context: 0,
    level2_behavior: 0,
    retrieved_context: 0,
    runtime_warnings: 0,
  }
  const bySource: Record<string, number> = {}
  const byAuthority: Record<string, number> = {}
  const byContextLayer: Record<ContextPromptLayer, number> = {
    runtime_contract: 0,
    focus: 0,
    behavior: 0,
    retrieved: 0,
    tool_loop: 0,
    thread_continuity: 0,
    warning: 0,
  }
  const parts = input.promptBundle.sections.map((section) => {
    const fragment = section.fragment
    const layer = promptLayerForFragment(fragment)
    const contextLayer = contextPromptLayerForFragment(fragment)
    const chars = section.chars
    byLayer[layer] += chars
    byContextLayer[contextLayer] += chars
    bySource[fragment.source] = (bySource[fragment.source] ?? 0) + chars
    byAuthority[fragment.instructionAuthority] = (byAuthority[fragment.instructionAuthority] ?? 0) + chars
    return {
      id: section.id,
      title: section.title,
      kind: section.kind,
      layer,
      contextLayer,
      source: fragment.source,
      lifecycle: fragment.lifecycle,
      authority: fragment.instructionAuthority,
      chars,
      contentHash: section.contentHash,
    }
  })
  const totalChars = estimateRuntimeModelRequestChars(input.providerProjection.messages)
  const providerSystemChars = input.providerProjection.systemPrompt.length
  return {
    totalChars,
    sectionPromptChars: input.promptBundle.sectionPrompt.length,
    providerSystemChars,
    conversationChars: Math.max(0, totalChars - providerSystemChars),
    budget: buildContextBudgetSnapshot(totalChars, input.limitChars),
    parts,
    byLayer,
    byContextLayer,
    bySource,
    byAuthority,
    budgetLedger: input.budgetLedger,
  }
}

export function buildContextBudgetSnapshot(usedChars: number, limitChars: number): ContextBudgetSnapshot {
  const normalizedLimit = Number.isFinite(limitChars) && limitChars > 0 ? Math.floor(limitChars) : 32000
  const normalizedUsed = Math.max(0, Math.floor(usedChars))
  const usageRatio = normalizedUsed / normalizedLimit
  return {
    limitChars: normalizedLimit,
    usedChars: normalizedUsed,
    remainingChars: Math.max(0, normalizedLimit - normalizedUsed),
    usageRatio,
    deliveryStatus: 'consumed',
    status: usageRatio >= 1
      ? 'exceeded'
      : usageRatio >= 0.9
        ? 'critical'
        : usageRatio >= 0.7
          ? 'warning'
          : 'ok',
  }
}

function promptLayerForFragment(fragment: PromptFragment): PromptLayer {
  if (fragment.layer === 'runtime_policy' || fragment.layer === 'tool_contract') return 'level0_core'
  if (fragment.layer === 'verified_context' || fragment.layer === 'task_state') return 'level1_context'
  if (fragment.layer === 'skill_behavior') return 'level2_behavior'
  if (fragment.layer === 'memory_context' || fragment.layer === 'conversation_context' || fragment.layer === 'retrieved_context') return 'retrieved_context'
  return 'runtime_warnings'
}

function contextPromptLayerForFragment(fragment: PromptFragment): ContextPromptLayer {
  if (fragment.layer === 'runtime_policy' || fragment.layer === 'tool_contract') return 'runtime_contract'
  if (fragment.source === 'project_context') return 'focus'
  if (fragment.layer === 'task_state') return 'tool_loop'
  if (fragment.layer === 'skill_behavior') return 'behavior'
  if (fragment.layer === 'memory_context' || fragment.layer === 'retrieved_context') return 'retrieved'
  if (fragment.source === 'thread_summary') return 'thread_continuity'
  if (fragment.source === 'diagnostic') return 'warning'
  return 'warning'
}
