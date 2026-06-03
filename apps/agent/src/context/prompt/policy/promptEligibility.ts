import type { PromptFragment } from '../registry/promptFragments.js'
import { enforcePromptAuthority, type PromptAuthorityDecision } from './promptAuthority.js'

export interface PromptEligibilityDecision {
  fragmentId: string
  eligible: boolean
  reason: string
  authority: PromptAuthorityDecision
}

export function decidePromptEligibility(fragment: PromptFragment): PromptEligibilityDecision {
  const authority = enforcePromptAuthority(fragment)
  if (!authority.allowed) {
    return {
      fragmentId: fragment.id,
      eligible: false,
      reason: authority.reason,
      authority,
    }
  }
  if (fragment.promptEligibility === 'ineligible') {
    return {
      fragmentId: fragment.id,
      eligible: false,
      reason: 'fragment is marked ineligible by classification',
      authority,
    }
  }
  return {
    fragmentId: fragment.id,
    eligible: true,
    reason: fragment.promptEligibility === 'eligible'
      ? 'fragment is explicitly eligible'
      : 'fragment is conditionally eligible for this candidate set',
    authority,
  }
}
