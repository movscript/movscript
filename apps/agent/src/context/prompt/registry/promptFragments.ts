import { createHash } from 'node:crypto'

export type PromptFragmentSource =
  | 'runtime_policy'
  | 'runtime_state'
  | 'command_contract'
  | 'tool_contract'
  | 'skill'
  | 'project_context'
  | 'project_standard'
  | 'thread_history'
  | 'thread_summary'
  | 'memory'
  | 'reference'
  | 'tool_result'
  | 'user_input'
  | 'attachment'
  | 'diagnostic'

export type PromptFragmentLayer =
  | 'runtime_policy'
  | 'tool_contract'
  | 'task_state'
  | 'verified_context'
  | 'user_request'
  | 'skill_behavior'
  | 'retrieved_context'
  | 'memory_context'
  | 'conversation_context'
  | 'diagnostic_context'

export type PromptFragmentLifecycle = 'model_turn' | 'run' | 'thread' | 'project' | 'global'

export type PromptFragmentTrustLevel = 'runtime' | 'verified' | 'user_claimed' | 'advisory' | 'unknown'

export type PromptFragmentInstructionAuthority = 'system' | 'developer' | 'advisory' | 'data'

export type PromptFragmentEligibility = 'eligible' | 'ineligible' | 'conditional'

export type PromptFragmentRenderMode = 'system_message' | 'conversation_message' | 'tool_schema' | 'data_ref'

export interface PromptFragment {
  id: string
  source: PromptFragmentSource
  owner: string
  layer: PromptFragmentLayer
  lifecycle: PromptFragmentLifecycle
  trustLevel: PromptFragmentTrustLevel
  instructionAuthority: PromptFragmentInstructionAuthority
  promptEligibility: PromptFragmentEligibility
  contentHash: string
  renderMode: PromptFragmentRenderMode
  budgetPriority: number
  inclusionReason: string
}

export interface PromptDebugPartLike {
  id: string
  kind: string
  title: string
  content: string
}

type PromptFragmentClassification = Omit<PromptFragment, 'id' | 'contentHash' | 'renderMode' | 'budgetPriority'>

interface PromptFragmentClassificationRule {
  matches: (part: Pick<PromptDebugPartLike, 'id' | 'kind'>) => boolean
  classification: PromptFragmentClassification
}

const PROMPT_FRAGMENT_CLASSIFICATION_RULES: readonly PromptFragmentClassificationRule[] = [
  exactPart('runtime.core', {
    source: 'runtime_policy',
    owner: 'runtime',
    layer: 'runtime_policy',
    lifecycle: 'run',
    trustLevel: 'runtime',
    instructionAuthority: 'system',
    promptEligibility: 'eligible',
    inclusionReason: 'runtime contract is required for every model turn',
  }),
  exactPart('runtime.source_boundary', {
    source: 'runtime_policy',
    owner: 'runtime',
    layer: 'runtime_policy',
    lifecycle: 'run',
    trustLevel: 'runtime',
    instructionAuthority: 'system',
    promptEligibility: 'eligible',
    inclusionReason: 'source boundary is required to classify runtime facts and advisory context',
  }),
  prefixedPart('command.', {
    source: 'command_contract',
    owner: 'runtime.command',
    layer: 'runtime_policy',
    lifecycle: 'model_turn',
    trustLevel: 'runtime',
    instructionAuthority: 'developer',
    promptEligibility: 'conditional',
    inclusionReason: 'current command changes output or tool requirements',
  }),
  exactPart('tools.available', {
    source: 'tool_contract',
    owner: 'runtime.tools',
    layer: 'tool_contract',
    lifecycle: 'model_turn',
    trustLevel: 'runtime',
    instructionAuthority: 'developer',
    promptEligibility: 'eligible',
    inclusionReason: 'model-readable tool guidance for runtime-approved tools',
  }),
  exactPart('context.summary', {
    source: 'project_context',
    owner: 'runtime.context',
    layer: 'verified_context',
    lifecycle: 'model_turn',
    trustLevel: 'verified',
    instructionAuthority: 'data',
    promptEligibility: 'conditional',
    inclusionReason: 'current project or UI focus is relevant to the run',
  }),
  exactPart('thread.runtime_state', {
    source: 'runtime_state',
    owner: 'runtime.thread',
    layer: 'task_state',
    lifecycle: 'model_turn',
    trustLevel: 'runtime',
    instructionAuthority: 'data',
    promptEligibility: 'conditional',
    inclusionReason: 'thread runtime state is needed to avoid duplicate or stale actions',
  }),
  exactPart('thread.continuity', {
    source: 'thread_summary',
    owner: 'runtime.thread',
    layer: 'conversation_context',
    lifecycle: 'thread',
    trustLevel: 'advisory',
    instructionAuthority: 'data',
    promptEligibility: 'conditional',
    inclusionReason: 'thread summary preserves continuity after history compaction',
  }),
  exactPart('skills.discovery', {
    source: 'skill',
    owner: 'runtime.skills',
    layer: 'skill_behavior',
    lifecycle: 'run',
    trustLevel: 'runtime',
    instructionAuthority: 'advisory',
    promptEligibility: 'conditional',
    inclusionReason: 'skill discovery helps the model inspect runtime-approved skills',
  }),
  prefixedPart('skill.', {
    source: 'skill',
    owner: 'runtime.skills',
    layer: 'skill_behavior',
    lifecycle: 'run',
    trustLevel: 'runtime',
    instructionAuthority: 'developer',
    promptEligibility: 'conditional',
    inclusionReason: 'activated skill instruction is approved for this run',
  }),
  exactPart('context.memories', {
    source: 'memory',
    owner: 'runtime.memory',
    layer: 'memory_context',
    lifecycle: 'thread',
    trustLevel: 'advisory',
    instructionAuthority: 'data',
    promptEligibility: 'conditional',
    inclusionReason: 'memory context is available as advisory data',
  }),
  exactPart('context.warnings', {
    source: 'diagnostic',
    owner: 'runtime.diagnostics',
    layer: 'diagnostic_context',
    lifecycle: 'model_turn',
    trustLevel: 'runtime',
    instructionAuthority: 'developer',
    promptEligibility: 'conditional',
    inclusionReason: 'runtime warnings may affect the current model turn',
  }),
]

export function promptFragmentForDebugPart(part: PromptDebugPartLike, options: {
  budgetPriority?: number
} = {}): PromptFragment {
  const classification = classifyPromptDebugPart(part)
  return {
    id: part.id,
    ...classification,
    contentHash: hashPromptFragmentContent(part.content),
    renderMode: 'system_message',
    budgetPriority: options.budgetPriority ?? 100,
    inclusionReason: classification.inclusionReason,
  }
}

export function classifyPromptDebugPart(part: Pick<PromptDebugPartLike, 'id' | 'kind'>): PromptFragmentClassification {
  for (const rule of PROMPT_FRAGMENT_CLASSIFICATION_RULES) {
    if (rule.matches(part)) return { ...rule.classification }
  }
  return {
    source: part.kind === 'tool' ? 'tool_contract' : part.kind === 'skill' ? 'skill' : 'diagnostic',
    owner: 'runtime.prompt',
    layer: part.kind === 'tool' ? 'tool_contract' : part.kind === 'skill' ? 'skill_behavior' : 'diagnostic_context',
    lifecycle: 'model_turn',
    trustLevel: 'unknown',
    instructionAuthority: part.kind === 'context' ? 'data' : 'advisory',
    promptEligibility: 'conditional',
    inclusionReason: 'unclassified prompt part retained for compatibility',
  }
}

export function hashPromptFragmentContent(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function exactPart(id: string, classification: PromptFragmentClassification): PromptFragmentClassificationRule {
  return {
    matches: (part) => part.id === id,
    classification,
  }
}

function prefixedPart(prefix: string, classification: PromptFragmentClassification): PromptFragmentClassificationRule {
  return {
    matches: (part) => part.id.startsWith(prefix),
    classification,
  }
}
