import type { AgentManifest } from '../../../catalog/manifest/agentManifest.js'
import type {
  AgentDebugContextPanel,
  AgentRuntimeLimits,
  CompiledPromptPreview,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
} from '../../../state/shared/types.js'
import type { AgentCommandRuntime } from '../../command/commandRouter.js'

export type PromptCandidatePart = CompiledPromptPreview['debugParts'][number]

export interface PromptFragmentProvider {
  id: string
  collect: (input: PromptFragmentProviderInput) => PromptCandidatePart[]
}

export interface PromptFragmentProviderInput {
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
  command: AgentCommandRuntime
  promptOptions: PromptOptions
  updatePlanAvailable: boolean
}

export interface PromptOptions {
  includeFinalSourceBlock: boolean
}

export interface SkillDiscoverySummary {
  configFileId?: string
  configFileName?: string
  catalogVersion?: string | null
  enabledPackIds: string[]
  availableSkills: SkillDiscoveryItem[]
}

export interface SkillDiscoveryItem {
  id: string
  name: string
  description?: string
  active: boolean
  loadMode?: 'core' | 'on_demand' | 'manual' | string
  tags?: string[]
  triggerHints?: string[]
  useWhen?: string[]
  conflicts?: string[]
}
