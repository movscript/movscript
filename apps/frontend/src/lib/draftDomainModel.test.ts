import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDraftReviewPath, getDraftDomainModel } from './draftDomainModel'
import type { AgentDraft } from './localAgentClient'

function draft(input: Partial<AgentDraft> & Pick<AgentDraft, 'id' | 'kind'>): AgentDraft {
  return {
    title: input.id,
    content: '',
    status: 'draft',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...input,
  }
}

test('draft domain model defines project and production seed ownership', () => {
  const project = getDraftDomainModel('project_proposal')
  const production = getDraftDomainModel('production_proposal')

  assert.equal(project?.seed.defaultMode, 'editable_snapshot')
  assert.ok(project?.seed.include.includes('creative_references'))
  assert.ok(project?.seed.include.includes('asset_slots'))
  assert.equal(project?.targetEntityType, 'project')
  assert.equal(project?.contentSchemaId, 'movscript.project_proposal.v1')
  assert.ok(project?.fieldGuide.owns.includes('creative_references'))
  assert.ok(project?.fieldGuide.forbids.includes('production_segments'))
  assert.equal(project?.applyBoundary.backendApply, 'project_proposal')

  assert.equal(production?.seed.defaultMode, 'snapshot')
  assert.deepEqual(production?.seed.allowedModes, ['empty', 'snapshot'])
  assert.ok(production?.seed.include.includes('production_script_brief'))
  assert.ok(production?.seed.include.includes('project_scripts'))
  assert.ok(production?.seed.include.includes('segments'))
  assert.ok(production?.seed.include.includes('scene_moments'))
  assert.equal(production?.targetEntityType, 'production')
  assert.equal(production?.contentSchemaId, 'movscript.production_proposal.v1')
  assert.ok(production?.fieldGuide.owns.includes('segments'))
  assert.ok(production?.fieldGuide.forbids.includes('new_project_level_creative_references'))
  assert.equal(production?.applyBoundary.backendApply, 'production_proposal')
})

test('draft review path is resolved from the shared frontend draft model helpers', () => {
  assert.equal(
    buildDraftReviewPath(draft({ id: 'draft-project', kind: 'project_proposal' })),
    '/project-workspace?draftId=draft-project',
  )
  assert.equal(
    buildDraftReviewPath(draft({ id: 'draft-script', kind: 'script_split_proposal' })),
    '/workbench/script?draftId=draft-script',
  )
  assert.equal(
    buildDraftReviewPath(draft({
      id: 'draft-production',
      kind: 'production_proposal',
      target: { entityType: 'production', entityId: 301 },
    })),
    '/production-orchestrate?productionId=301&draftId=draft-production',
  )
  assert.equal(
    buildDraftReviewPath(draft({
      id: 'draft-asset',
      kind: 'asset_proposal',
      target: { entityType: 'asset_slot', entityId: 88 },
    })),
    '/asset-slots?draftId=draft-asset&asset_slot_id=88',
  )
})
