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

test('draft domain model separates project standards, settings, and asset slots', () => {
  const project = getDraftDomainModel('project_proposal')
  const setting = getDraftDomainModel('setting_proposal')
  const assetProposal = getDraftDomainModel('asset_proposal')
  const production = getDraftDomainModel('production_proposal')

  assert.equal(project?.seed.defaultMode, 'editable_snapshot')
  assert.deepEqual(project?.seed.include, ['project'])
  assert.equal(project?.targetEntityType, 'project')
  assert.equal(project?.contentSchemaId, 'movscript.project_proposal.v1')
  assert.ok(project?.fieldGuide.owns.includes('shot_size_system'))
  assert.ok(project?.fieldGuide.forbids.includes('creative_reference_lists'))
  assert.ok(project?.fieldGuide.forbids.includes('asset_requirement_lists'))
  assert.equal(project?.applyBoundary.backendApply, 'project_proposal')

  assert.equal(setting?.contentSchemaId, 'movscript.setting_proposal.v1')
  assert.ok(setting?.fieldGuide.owns.includes('creative_references'))
  assert.ok(setting?.fieldGuide.forbids.includes('asset_slots'))
  assert.equal(setting?.applyBoundary.backendApply, 'project_proposal')

  assert.equal(assetProposal?.contentSchemaId, 'movscript.asset_proposal.v1')
  assert.ok(assetProposal?.fieldGuide.owns.includes('asset_slots'))
  assert.ok(assetProposal?.fieldGuide.forbids.includes('creative_reference_edits'))
  assert.equal(assetProposal?.applyBoundary.backendApply, 'project_proposal')

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

test('draft domain model defines content unit proposal contracts', () => {
  const contentUnit = getDraftDomainModel('content_unit_proposal')
  const media = getDraftDomainModel('content_unit_media_proposal')

  assert.equal(contentUnit?.targetEntityType, 'scene_moment')
  assert.equal(contentUnit?.contentSchemaId, 'movscript.content_unit_proposal.v1')
  assert.equal(contentUnit?.seed.defaultMode, 'snapshot')
  assert.deepEqual(contentUnit?.seed.allowedModes, ['empty', 'snapshot'])
  assert.ok(contentUnit?.seed.include.includes('content_units'))
  assert.ok(contentUnit?.fieldGuide.owns.includes('content_units'))
  assert.ok(contentUnit?.fieldGuide.forbids.includes('media_generation_jobs'))
  assert.equal(contentUnit?.applyBoundary.backendApply, 'draft_only')

  assert.equal(media?.targetEntityType, 'content_unit')
  assert.equal(media?.contentSchemaId, 'movscript.content_unit_media_proposal.v1')
  assert.ok(media?.seed.include.includes('content_unit'))
  assert.ok(media?.fieldGuide.owns.includes('media_plans'))
  assert.ok(media?.fieldGuide.forbids.includes('generation_job_submission'))
  assert.equal(media?.applyBoundary.backendApply, 'draft_only')
})

test('draft review path is resolved from the shared frontend draft model helpers', () => {
  assert.equal(
    buildDraftReviewPath(draft({ id: 'draft-project', kind: 'project_proposal' })),
    '/project-workspace?draftId=draft-project',
  )
  assert.equal(
    buildDraftReviewPath(draft({ id: 'draft-setting', kind: 'setting_proposal' })),
    '/creative-references?view=review&draftId=draft-setting',
  )
  assert.equal(
    buildDraftReviewPath(draft({ id: 'draft-asset-proposal', kind: 'asset_proposal' })),
    '/asset-slots?view=review&draftId=draft-asset-proposal',
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
  assert.equal(
    buildDraftReviewPath(draft({
      id: 'draft-content-unit',
      kind: 'content_unit_proposal',
      target: { entityType: 'scene_moment', entityId: 77 },
    })),
    '/content-unit-orchestrate?draftId=draft-content-unit&scene_moment_id=77',
  )
  assert.equal(
    buildDraftReviewPath(draft({
      id: 'draft-content-unit-production',
      kind: 'content_unit_proposal',
      target: { entityType: 'production', entityId: 301 },
    })),
    '/content-unit-orchestrate?draftId=draft-content-unit-production&productionId=301',
  )
  assert.equal(
    buildDraftReviewPath(draft({
      id: 'draft-content-unit-media',
      kind: 'content_unit_media_proposal',
      target: { entityType: 'content_unit', entityId: 99 },
    })),
    '/contents?draftId=draft-content-unit-media&content_unit_id=99',
  )
})
