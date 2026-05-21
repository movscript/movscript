import assert from 'node:assert/strict'
import test from 'node:test'
import { DRAFT_CONTENT_SCHEMA_IDS } from '@movscript/draft-schemas'
import { InMemoryAgentDraftStore } from '../drafts/draftStore.js'
import { AgentFileSystem } from './agentFileSystem.js'
import { DraftFileProvider, draftContentFileRef } from './providers/draftFileProvider.js'

test('AgentFileSystem reads, searches, and edits draft content through canonical refs', () => {
  const draftStore = new InMemoryAgentDraftStore()
  const draft = draftStore.createDraft({
    kind: 'asset_proposal',
    title: 'Assets',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.assetProposal,
      scope: 'asset_proposal',
      proposal: { creative_references: [], asset_slots: [], candidate_plans: [] },
    }, null, 2),
  })
  const fileSystem = new AgentFileSystem([new DraftFileProvider(draftStore)])
  const ref = draftContentFileRef(draft.id)

  const read = fileSystem.read({ ref })
  assert.equal(read.file.ref, ref)
  assert.match(read.revision, /^sha256:/)
  assert.equal((read.validation as any).ok, true)

  const search = fileSystem.search({ ref, query: 'candidate_plans' })
  assert.equal(search.matchCount, 1)
  assert.equal(search.matches[0]?.line > 0, true)

  const edited = fileSystem.edit({
    ref,
    precondition: { baseRevision: read.revision },
    edits: [{
      type: 'replace_text',
      oldText: '"candidate_plans": []',
      newText: '"candidate_plans": [{"name":"Plan A"}]',
    }],
    createdByRunId: 'run_1',
  })

  assert.equal(edited.changeSet.fileRef, ref)
  assert.equal(edited.changeSet.baseRevision, read.revision)
  assert.match(edited.changeSet.nextRevision, /^sha256:/)
  assert.equal(edited.changeSet.createdByRunId, 'run_1')
  assert.deepEqual(JSON.parse(draftStore.getDraft(draft.id)?.content ?? '{}').proposal.candidate_plans, [{ name: 'Plan A' }])
})

test('AgentFileSystem rejects stale draft edit revisions', () => {
  const draftStore = new InMemoryAgentDraftStore()
  const draft = draftStore.createDraft({ kind: 'project_standards_proposal', title: 'Standards', content: '{"a":1}' })
  const fileSystem = new AgentFileSystem([new DraftFileProvider(draftStore)])
  const ref = draftContentFileRef(draft.id)

  assert.throws(
    () => fileSystem.edit({
      ref,
      precondition: { baseRevision: 'sha256:stale' },
      edits: [{ type: 'set_content', content: '{"a":2}' }],
    }),
    /baseRevision mismatch/,
  )
})
