import assert from 'node:assert/strict'
import test from 'node:test'
import type { PromptFragment } from '../registry/promptFragments.js'
import { enforcePromptAuthority } from './promptAuthority.js'
import { decidePromptEligibility } from './promptEligibility.js'

test('enforcePromptAuthority rejects retrieved content that attempts to become instruction authority', () => {
  const memory = fragment({ id: 'context.memories', source: 'memory', authority: 'developer' })
  const reference = fragment({ id: 'reference.bad', source: 'reference', authority: 'system' })
  const toolResult = fragment({ id: 'tool.result.bad', source: 'tool_result', authority: 'advisory' })

  assert.equal(enforcePromptAuthority(memory).allowed, false)
  assert.match(enforcePromptAuthority(reference).reason, /must be data/)
  assert.equal(enforcePromptAuthority(toolResult).allowed, false)
})

test('decidePromptEligibility records explicit reasons for authority and classification rejection', () => {
  const authorityRejected = decidePromptEligibility(fragment({ id: 'reference.bad', source: 'reference', authority: 'developer' }))
  const classificationRejected = decidePromptEligibility(fragment({ id: 'diagnostic.hidden', eligibility: 'ineligible' }))
  const acceptedData = decidePromptEligibility(fragment({ id: 'thread.runtime_state', source: 'runtime_state', authority: 'data', trustLevel: 'runtime' }))

  assert.equal(authorityRejected.eligible, false)
  assert.match(authorityRejected.reason, /must be data/)
  assert.equal(classificationRejected.eligible, false)
  assert.equal(classificationRejected.reason, 'fragment is marked ineligible by classification')
  assert.equal(acceptedData.eligible, true)
})

function fragment(input: {
  id: string
  source?: PromptFragment['source']
  authority?: PromptFragment['instructionAuthority']
  trustLevel?: PromptFragment['trustLevel']
  eligibility?: PromptFragment['promptEligibility']
}): PromptFragment {
  return {
    id: input.id,
    source: input.source ?? 'diagnostic',
    owner: 'test',
    layer: 'diagnostic_context',
    lifecycle: 'model_turn',
    trustLevel: input.trustLevel ?? 'unknown',
    instructionAuthority: input.authority ?? 'advisory',
    promptEligibility: input.eligibility ?? 'conditional',
    contentHash: 'sha256:test',
    renderMode: 'system_message',
    budgetPriority: 100,
    inclusionReason: 'test fragment',
  }
}
