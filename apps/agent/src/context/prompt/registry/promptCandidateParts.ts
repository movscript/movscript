import type { AgentManifest } from '../../../catalog/manifest/agentManifest.js'
import type {
  AgentDebugContextPanel,
  AgentRuntimeLimits,
  CompiledPromptPreview,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
} from '../../../state/shared/types.js'
import { parseAgentCommand, type AgentCommandRuntime } from '../../command/commandRouter.js'
import type {
  PromptFragmentProvider,
  PromptFragmentProviderInput,
  SkillDiscoverySummary,
} from './promptFragmentProvider.js'
import { resolvePromptOptions } from './promptOptions.js'
import { runtimePromptProviders } from './providers/runtimePromptProviders.js'
import { contextPromptProviders } from './providers/contextPromptProviders.js'
import { commandToolPromptProviders } from './providers/commandToolPromptProviders.js'
import { skillPromptProviders } from './providers/skillPromptProviders.js'
import { warningPromptProviders } from './providers/warningPromptProviders.js'

export type { PromptFragmentProvider, SkillDiscoveryItem, SkillDiscoverySummary } from './promptFragmentProvider.js'

export interface PromptCandidatePartsInput {
  manifest: AgentManifest
  skills: ResolvedAgentSkill[]
  skillDiscovery?: SkillDiscoverySummary
  context: AgentDebugContextPanel
  tools: ResolvedToolCatalog
  runtimeLimits: AgentRuntimeLimits
  warnings: string[]
  userMessage: string
  threadSummary?: string
  runtimeState?: unknown
  command?: AgentCommandRuntime
}

export interface PromptCandidatePartsResult {
  candidateParts: CompiledPromptPreview['debugParts']
  warnings: string[]
  command: AgentCommandRuntime
}

export function collectPromptCandidateParts(input: PromptCandidatePartsInput): PromptCandidatePartsResult {
  const warnings = [...input.warnings]
  const command = input.command ?? parseAgentCommand(input.userMessage)
  const promptOptions = resolvePromptOptions(input.manifest.metadata?.promptOptions)
  const updatePlanAvailable = input.tools.available.some((tool) => tool.name === 'core_update_plan')
  const providerInput: PromptFragmentProviderInput = {
    manifest: input.manifest,
    skills: input.skills,
    ...(input.skillDiscovery ? { skillDiscovery: input.skillDiscovery } : {}),
    context: input.context,
    tools: input.tools,
    runtimeLimits: input.runtimeLimits,
    warnings: input.warnings,
    userMessage: input.userMessage,
    ...(input.threadSummary !== undefined ? { threadSummary: input.threadSummary } : {}),
    ...(input.runtimeState !== undefined ? { runtimeState: input.runtimeState } : {}),
    command,
    promptOptions,
    updatePlanAvailable,
  }
  const candidateParts = PROMPT_FRAGMENT_PROVIDERS.flatMap((provider) => provider.collect(providerInput))

  return { candidateParts, warnings, command }
}

export function promptFragmentProviders(): readonly PromptFragmentProvider[] {
  return PROMPT_FRAGMENT_PROVIDERS
}

const PROMPT_FRAGMENT_PROVIDERS: readonly PromptFragmentProvider[] = [
  ...runtimePromptProviders,
  ...contextPromptProviders,
  ...commandToolPromptProviders,
  ...skillPromptProviders,
  ...warningPromptProviders,
]
