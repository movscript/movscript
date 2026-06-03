import type { ResolvedAgentSkill } from '../../../state/shared/types.js'
import {
  fitTextSectionsToBudget,
  type TextSectionBudgetDecision,
  type TextSectionBudgetDegradation,
  type TextSectionBudgetPart,
  type FitTextSectionsResult,
} from '../../../shared/text/textSectionBudgeter.js'
import {
  promptFragmentForDebugPart,
  type PromptDebugPartLike,
  type PromptFragment,
} from '../registry/promptFragments.js'
import { decidePromptEligibility, type PromptEligibilityDecision } from './promptEligibility.js'

export interface PromptPolicyPart extends TextSectionBudgetPart, PromptDebugPartLike {}

export interface PromptPolicyInput<T extends PromptPolicyPart = PromptPolicyPart> {
  candidateParts: T[]
  skills: ResolvedAgentSkill[]
  limitChars: number
  warnings: string[]
}

export interface PromptPolicyResult<T extends PromptPolicyPart = PromptPolicyPart> {
  approvedParts: T[]
  fragments: PromptFragment[]
  eligibilityDecisions: PromptEligibilityDecision[]
  budgetLedger: PromptBudgetLedger
  warnings: string[]
  degraded?: TextSectionBudgetDegradation
}

export interface PromptBudgetLedger {
  limitChars: number
  initialSectionPromptChars: number
  finalSectionPromptChars: number
  decisionCount: number
  decisions: PromptBudgetDecision[]
}

export interface PromptBudgetDecision extends Omit<TextSectionBudgetDecision, 'textCharsBefore' | 'textCharsAfter'> {
  promptCharsBefore: number
  promptCharsAfter: number
}

export function applyPromptPolicy<T extends PromptPolicyPart>(input: PromptPolicyInput<T>): PromptPolicyResult<T> {
  const candidateFragments = input.candidateParts.map((part) => promptFragmentForDebugPart(part, {
    budgetPriority: promptPartPriority(input.skills, part.id),
  }))
  const eligibilityDecisions = candidateFragments.map(decidePromptEligibility)
  const eligiblePartIds = new Set(eligibilityDecisions
    .filter((decision) => decision.eligible)
    .map((decision) => decision.fragmentId))
  const eligibleParts = input.candidateParts.filter((part) => eligiblePartIds.has(part.id))
  const fitted = fitTextSectionsToBudget({
    parts: eligibleParts,
    limit: input.limitChars,
    warnings: input.warnings,
    priorityOfPart: (part) => promptPartPriority(input.skills, part.id),
    lowPriorityDropWarning: (part) => `prompt.size.exceeded: dropped non-critical skill ${part.id}`,
    secondaryDropWarning: (part) => `prompt.size.exceeded: dropped skill ${part.id}`,
    examplesDropWarning: 'prompt.size.exceeded: stripped examples sections',
  })
  return {
    approvedParts: fitted.parts,
    fragments: fitted.parts.map((part) => promptFragmentForDebugPart(part, {
      budgetPriority: promptPartPriority(input.skills, part.id),
    })),
    eligibilityDecisions,
    budgetLedger: buildPromptBudgetLedger(fitted, input.limitChars),
    warnings: fitted.warnings,
    ...(fitted.degraded ? { degraded: fitted.degraded } : {}),
  }
}

export function promptPartPriority(skills: ResolvedAgentSkill[], partId: string): number {
  const skillId = partId.startsWith('skill.') ? partId.slice('skill.'.length) : partId
  return skills.find((skill) => skill.id === skillId)?.resolvedPriority ?? 100
}

function buildPromptBudgetLedger(
  fitted: Pick<FitTextSectionsResult<PromptPolicyPart>, 'initialTextChars' | 'finalTextChars' | 'decisions'>,
  limitChars: number,
): PromptBudgetLedger {
  return {
    limitChars,
    initialSectionPromptChars: fitted.initialTextChars,
    finalSectionPromptChars: fitted.finalTextChars,
    decisionCount: fitted.decisions.length,
    decisions: fitted.decisions.map(toPromptBudgetDecision),
  }
}

function toPromptBudgetDecision(decision: TextSectionBudgetDecision): PromptBudgetDecision {
  const { textCharsBefore, textCharsAfter, ...rest } = decision
  return {
    ...rest,
    promptCharsBefore: textCharsBefore,
    promptCharsAfter: textCharsAfter,
  }
}
