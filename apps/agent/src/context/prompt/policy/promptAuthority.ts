import type { PromptFragment } from '../registry/promptFragments.js'

export interface PromptAuthorityDecision {
  fragmentId: string
  allowed: boolean
  reason: string
}

export function enforcePromptAuthority(fragment: PromptFragment): PromptAuthorityDecision {
  if (fragment.source === 'tool_result' && fragment.instructionAuthority !== 'data') {
    return {
      fragmentId: fragment.id,
      allowed: false,
      reason: 'tool result fragments must be data, not instructions',
    }
  }
  if ((fragment.source === 'reference' || fragment.source === 'memory') && fragment.instructionAuthority !== 'data') {
    return {
      fragmentId: fragment.id,
      allowed: false,
      reason: 'retrieved reference and memory fragments must be data, not instructions',
    }
  }
  return {
    fragmentId: fragment.id,
    allowed: true,
    reason: 'fragment authority is compatible with its source and render mode',
  }
}
