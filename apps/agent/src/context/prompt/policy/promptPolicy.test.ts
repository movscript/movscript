import assert from 'node:assert/strict'
import test from 'node:test'
import type { ResolvedAgentSkill } from '../../../state/shared/types.js'
import { hashPromptFragmentContent } from '../registry/promptFragments.js'
import { applyPromptPolicy } from './promptPolicy.js'

test('applyPromptPolicy budgets approved fragments and records deterministic omissions', () => {
  const warnings: string[] = []
  const result = applyPromptPolicy({
    limitChars: 180,
    warnings,
    skills: [
      skill({ id: 'low', resolvedPriority: 50 }),
      skill({ id: 'high', resolvedPriority: 200 }),
    ],
    candidateParts: [
      { id: 'runtime.core', kind: 'instruction', title: 'Runtime', content: 'runtime contract' },
      { id: 'skill.low', kind: 'skill', title: 'Low', content: 'low '.repeat(80) },
      { id: 'skill.high', kind: 'skill', title: 'High', content: 'high behavior' },
    ],
  })

  assert.deepEqual(result.approvedParts.map((part) => part.id), ['runtime.core', 'skill.high'])
  assert.deepEqual(result.fragments.map((fragment) => fragment.id), ['runtime.core', 'skill.high'])
  assert.equal(result.eligibilityDecisions.every((decision) => decision.eligible), true)
  assert.equal(result.fragments.find((fragment) => fragment.id === 'skill.high')?.budgetPriority, 200)
  assert.equal(result.degraded, 'dropped_low_priority_skills')
  assert.equal(result.warnings, warnings)
  assert.equal(result.budgetLedger.decisionCount, 1)
  assert.deepEqual(result.budgetLedger.decisions.map((decision) => ({
    action: decision.action,
    stage: decision.stage,
    partId: decision.partId,
    priority: decision.priority,
  })), [{
    action: 'drop',
    stage: 'low_priority',
    partId: 'skill.low',
    priority: 50,
  }])
})

test('applyPromptPolicy hashes the final approved fragment content after degradation', () => {
  const result = applyPromptPolicy({
    limitChars: 120,
    warnings: [],
    skills: [],
    candidateParts: [
      {
        id: 'runtime.core',
        kind: 'instruction',
        title: 'Runtime',
        content: [
          'Keep the runtime contract.',
          'Examples:',
          'example '.repeat(80),
        ].join('\n'),
      },
    ],
  })

  const part = result.approvedParts[0]
  const fragment = result.fragments[0]
  assert.ok(part)
  assert.ok(fragment)
  assert.doesNotMatch(part.content, /example example/)
  assert.equal(fragment.contentHash, hashPromptFragmentContent(part.content))
  assert.equal(result.budgetLedger.decisions[0]?.action, 'strip_examples')
})

function skill(input: { id: string; resolvedPriority: number }): ResolvedAgentSkill {
  return {
    id: input.id,
    name: input.id,
    description: input.id,
    enabled: true,
    instruction: input.id,
    compiledInstruction: input.id,
    activationReason: 'default',
    resolvedPriority: input.resolvedPriority,
    warnings: [],
  } as ResolvedAgentSkill
}
