import assert from 'node:assert/strict'
import test from 'node:test'
import type { ContextLedger } from '../../ledger/shared/contextLedgerTypes.js'
import { promptFragmentForDebugPart } from '../registry/promptFragments.js'
import { promptContextEvidenceRefsFromLedger, promptFragmentEvidenceRef } from './promptEvidence.js'

test('prompt evidence refs describe prompt fragments without copying fragment bodies', () => {
  const fragment = promptFragmentForDebugPart({
    id: 'runtime.core',
    kind: 'instruction',
    title: 'Runtime Contract',
    content: 'SECRET_PROMPT_BODY',
  })

  const ref = promptFragmentEvidenceRef(fragment, 'Runtime Contract')

  assert.equal(ref.kind, 'prompt_fragment')
  assert.equal(ref.id, 'runtime.core')
  assert.equal(ref.authority, 'system')
  assert.match(ref.contentHash, /^sha256:[a-f0-9]{64}$/)
  assert.equal(JSON.stringify(ref).includes('SECRET_PROMPT_BODY'), false)
})

test('prompt context evidence refs describe retrieved context without copying summaries', () => {
  const refs = promptContextEvidenceRefsFromLedger(makeLedger())

  assert.equal(refs[0]?.kind, 'context_ref')
  assert.equal(refs[0]?.key, 'reference:story:hash_1')
  assert.equal(refs[0]?.evidence, 'advisory')
  assert.equal(refs[0]?.contentHash, 'hash_1')
  assert.equal(JSON.stringify(refs).includes('SECRET_REFERENCE_BODY'), false)
})

function makeLedger(): ContextLedger {
  return {
    schema: 'movscript.context-ledger.v1',
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'snapshot_1',
    activeSkillIds: [],
    visibleToolNames: [],
    retrieved: [{
      ref: { type: 'reference', id: 'story', title: 'Story', hash: 'hash_1', source: 'reference' },
      source: 'reference',
      evidence: 'advisory',
      title: 'Story',
      summary: 'SECRET_REFERENCE_BODY',
      contentHash: 'hash_1',
      charCount: 120,
      retrievedAt: '2026-01-01T00:00:00.000Z',
      usedInPrompt: true,
    }],
    facts: [],
    artifactRefs: [],
    unresolvedQuestions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
