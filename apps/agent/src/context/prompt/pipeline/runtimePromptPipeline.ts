import type { AgentManifest } from '../../../catalog/manifest/agentManifest.js'
import type {
  AgentDebugContextPanel,
  AgentMessage,
  AgentRuntimeLimits,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
} from '../../../state/shared/types.js'
import type { NormalizedClientInput } from '../../input/client/normalizeClientInput.js'
import type { AgentCommandRuntime } from '../../command/commandRouter.js'
import { collectPromptCandidateParts, type SkillDiscoverySummary } from '../registry/promptCandidateParts.js'
import {
  applyPromptPolicy,
  type PromptBudgetLedger,
} from '../policy/promptPolicy.js'
import {
  compilePromptBundleForProviderProjection,
  type ProviderPromptProjection,
} from '../compiler/providerPromptProjectionCompiler.js'
import { buildPromptBundle, type PromptBundle } from '../compiler/promptBundle.js'
import { buildPromptStats, type PromptStats } from '../stats/promptStats.js'
import { buildPromptLedger, type PromptLedger } from '../ledger/promptLedger.js'
import type { PromptEligibilityDecision } from '../policy/promptEligibility.js'

export interface RuntimePromptContextInput {
  manifest: AgentManifest
  skills: ResolvedAgentSkill[]
  skillDiscovery?: SkillDiscoverySummary
  context: AgentDebugContextPanel
  tools: ResolvedToolCatalog
  runtimeLimits: AgentRuntimeLimits
  warnings: string[]
  history: AgentMessage[]
  userMessage: string
  clientInput?: NormalizedClientInput
  threadSummary?: string
  runtimeState?: unknown
  command?: AgentCommandRuntime
}

export interface RuntimePromptContext {
  promptBundle: PromptBundle
  providerProjection: ProviderPromptProjection
  promptEligibilityDecisions: PromptEligibilityDecision[]
  promptLedger: PromptLedger
  promptStats: PromptStats
  budgetLedger: PromptBudgetLedger
  warnings: string[]
  degraded?: 'dropped_low_priority_skills' | 'dropped_skills' | 'dropped_examples'
}

export function runRuntimePromptPipeline(input: RuntimePromptContextInput): RuntimePromptContext {
  const promptCandidates = collectPromptCandidateParts(input)

  const promptPolicy = applyPromptPolicy({
    candidateParts: promptCandidates.candidateParts,
    skills: input.skills,
    limitChars: sectionPromptBudgetLimit(input.manifest),
    warnings: promptCandidates.warnings,
  })
  const finalDebugParts = promptPolicy.approvedParts
  const promptFragments = promptPolicy.fragments
  const promptBundle = buildPromptBundle({
    approvedParts: finalDebugParts,
    promptFragments,
    history: input.history,
    userMessage: input.userMessage,
    ...(input.clientInput ? { clientInput: input.clientInput } : {}),
  })
  const compiledPrompt = compilePromptBundleForProviderProjection(promptBundle)
  const budgetLedger = promptPolicy.budgetLedger
  const promptLedger = buildPromptLedger({
    promptBundle: compiledPrompt.promptBundle,
    providerProjection: compiledPrompt.providerProjection,
    budget: budgetLedger,
  })
  const promptStats = buildPromptStats({
    promptBundle: compiledPrompt.promptBundle,
    providerProjection: compiledPrompt.providerProjection,
    limitChars: contextWindowCharLimit(input.manifest),
    budgetLedger,
  })

  return {
    promptBundle: compiledPrompt.promptBundle,
    providerProjection: compiledPrompt.providerProjection,
    promptEligibilityDecisions: promptPolicy.eligibilityDecisions,
    promptLedger,
    promptStats,
    budgetLedger,
    warnings: promptPolicy.warnings,
    ...(promptPolicy.degraded ? { degraded: promptPolicy.degraded } : {}),
  }
}

function sectionPromptBudgetLimit(manifest: AgentManifest): number {
  const value = manifest.metadata?.systemPromptCharLimit
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 32000
}

function contextWindowCharLimit(manifest: AgentManifest): number {
  const value = manifest.metadata?.contextWindowCharLimit
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : sectionPromptBudgetLimit(manifest)
}
