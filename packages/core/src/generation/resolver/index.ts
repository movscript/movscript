import { inferGenerationCallProfile } from './inferCallProfile.js'
import { matchGenerationModels } from './matchModels.js'
import { normalizeGenerationResolverOutput, normalizeGenerationResolverReferences } from './normalizeReferences.js'
import type {
  ResolveGenerationModelsInput,
  ResolveGenerationModelsResult,
  GenerationResolverBlocker,
  GenerationResolverModelLike,
} from './types.js'

export * from './types.js'
export * from './normalizeReferences.js'
export * from './inferCallProfile.js'
export * from './modelProfile.js'
export * from './matchModels.js'

export function resolveGenerationModels<Model extends GenerationResolverModelLike>(
  input: ResolveGenerationModelsInput<Model>,
): ResolveGenerationModelsResult<Model> {
  const output = normalizeGenerationResolverOutput(input.targetOutput)
  const { references, blockers: referenceBlockers } = normalizeGenerationResolverReferences(input.references)
  const blockers: GenerationResolverBlocker[] = [...referenceBlockers]
  if (!output) {
    blockers.push({
      code: 'missing_output',
      message: '需要明确目标输出类型',
    })
  }
  const profile = output ? inferGenerationCallProfile(output, references) : null
  if (!profile) {
    return {
      profile,
      references,
      matches: [],
      blocked: [],
      blockers,
    }
  }
  const { matches, blocked } = matchGenerationModels(input.models ?? [], profile, references)
  return {
    profile,
    references,
    matches,
    blocked,
    blockers,
  }
}
