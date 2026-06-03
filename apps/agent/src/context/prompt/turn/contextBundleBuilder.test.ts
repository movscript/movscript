import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../../../catalog/manifest/agentManifest.js'
import type { ContextLedger } from '../../ledger/shared/contextLedgerTypes.js'
import { runRuntimePromptPipeline } from '../pipeline/runtimePromptPipeline.js'
import { buildContextBundle } from './contextBundleBuilder.js'

test('buildContextBundle records prompt metadata and ledger refs without source bodies', () => {
  const promptContext = runRuntimePromptPipeline({
    manifest: DEFAULT_AGENT_MANIFEST,
    skills: [],
    context: {
      route: { pathname: '/project/42' },
      projects: [],
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
    tools: { discovered: [], available: [], blocked: [], byName: {} },
    runtimeLimits: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
    warnings: [],
    history: [],
    userMessage: 'hello',
  })
  const ledger = makeLedger()

  const bundle = buildContextBundle({
    promptContext,
    messages: promptContext.providerProjection.messages,
    tools: [],
    ledger,
    runId: 'run_1',
    threadId: 'thread_1',
    roundId: 'round_1',
    roundIndex: 1,
    roundLabel: 'Model turn 1',
    createdAt: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(bundle.schema, 'movscript.context-bundle.v1')
  assert.equal(bundle.runId, 'run_1')
  assert.equal(bundle.threadId, 'thread_1')
  assert.equal(bundle.promptLedgerId, promptContext.promptLedger.id)
  assert.match(bundle.promptHash, /^sha256:[a-f0-9]{64}$/)
  assert.equal(bundle.promptParts.some((part) => part.id === 'runtime.core' && part.source === 'runtime_policy' && part.authority === 'system'), true)
  assert.deepEqual(bundle.activeContextKeys, ['reference:active:hash_active'])
  assert.deepEqual(bundle.amendedContextKeys, ['reference:amended:hash_amended'])
  assert.deepEqual(bundle.deletedContextKeys, ['reference:deleted:hash_deleted'])
  assert.equal(bundle.contextRefs[0]?.contentHash, 'hash_active')
  assert.equal(JSON.stringify(bundle).includes('SECRET_REFERENCE_BODY'), false)
})

function makeLedger(): ContextLedger {
  return {
    schema: 'movscript.context-ledger.v1',
    runId: 'run_1',
    threadId: 'thread_1',
    catalogSnapshotId: 'snapshot_1',
    activeSkillIds: [],
    visibleToolNames: [],
    retrieved: [
      {
        ref: { type: 'reference', id: 'active', title: 'Active', hash: 'hash_active', source: 'reference' },
        source: 'reference',
        evidence: 'advisory',
        title: 'Active',
        summary: 'SECRET_REFERENCE_BODY is not copied into context bundle',
        contentHash: 'hash_active',
        charCount: 120,
        retrievedAt: '2026-01-01T00:00:00.000Z',
        usedInPrompt: true,
      },
      {
        ref: { type: 'reference', id: 'amended', title: 'Amended', hash: 'hash_amended', source: 'reference' },
        source: 'reference',
        evidence: 'advisory',
        title: 'Amended',
        contentHash: 'hash_amended',
        charCount: 80,
        retrievedAt: '2026-01-01T00:00:00.000Z',
        usedInPrompt: false,
        status: 'amended',
      },
      {
        ref: { type: 'reference', id: 'deleted', title: 'Deleted', hash: 'hash_deleted', source: 'reference' },
        source: 'reference',
        evidence: 'advisory',
        title: 'Deleted',
        contentHash: 'hash_deleted',
        charCount: 40,
        retrievedAt: '2026-01-01T00:00:00.000Z',
        usedInPrompt: false,
        status: 'deleted',
      },
    ],
    facts: [],
    artifactRefs: [],
    unresolvedQuestions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
