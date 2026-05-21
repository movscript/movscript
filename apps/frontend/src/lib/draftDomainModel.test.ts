import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDraftArtifactReviewPath, buildDraftReviewPath, getDraftDomainModel } from './draftDomainModel'
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
  const project = getDraftDomainModel('project_standards_proposal')
  const setting = getDraftDomainModel('setting_proposal')
  const assetProposal = getDraftDomainModel('asset_proposal')
  const production = getDraftDomainModel('production_proposal')

  assert.equal(project?.seed.defaultMode, 'editable_snapshot')
  assert.deepEqual(project?.seed.include, ['project'])
  assert.equal(project?.targetEntityType, 'project')
  assert.equal(project?.contentSchemaId, 'movscript.project_standards_proposal.v1')
  assert.ok(project?.fieldGuide.owns.includes('shot_size_system'))
  assert.ok(project?.fieldGuide.owns.includes('custom_rules'))
  assert.ok(project?.fieldGuide.forbids.includes('creative_reference_lists'))
  assert.ok(project?.fieldGuide.forbids.includes('asset_requirement_lists'))
  assert.equal(project?.applyBoundary.backendApply, 'project_standards_proposal')

  assert.equal(setting?.contentSchemaId, 'movscript.setting_proposal.v1')
  assert.ok(setting?.fieldGuide.owns.includes('creative_references'))
  assert.ok(setting?.fieldGuide.forbids.includes('asset_slots'))
  assert.equal(setting?.applyBoundary.backendApply, 'setting_proposal')

  assert.equal(assetProposal?.contentSchemaId, 'movscript.asset_proposal.v1')
  assert.ok(assetProposal?.fieldGuide.owns.includes('asset_slots'))
  assert.ok(assetProposal?.fieldGuide.forbids.includes('creative_reference_edits'))
  assert.equal(assetProposal?.applyBoundary.backendApply, 'asset_proposal')

  assert.equal(production?.seed.defaultMode, 'editable_snapshot')
  assert.deepEqual(production?.seed.allowedModes, ['empty', 'snapshot', 'editable_snapshot'])
  assert.ok(production?.seed.include.includes('production_script_brief'))
  assert.ok(production?.seed.include.includes('project_scripts'))
  assert.ok(production?.seed.include.includes('creative_references'))
  assert.ok(production?.seed.include.includes('segments'))
  assert.ok(production?.seed.include.includes('scene_moments'))
  assert.equal(production?.targetEntityType, 'production')
  assert.equal(production?.contentSchemaId, 'movscript.production_proposal.v1')
  assert.ok(production?.fieldGuide.owns.includes('snapshot.proposal.segments'))
  assert.ok(production?.fieldGuide.forbids.includes('new_project_level_creative_references'))
  assert.equal(production?.applyBoundary.backendApply, 'production_proposal')
})

test('draft domain model defines content unit proposal contracts', () => {
  const contentUnit = getDraftDomainModel('content_unit_proposal')

  assert.equal(contentUnit?.targetEntityType, 'scene_moment')
  assert.equal(contentUnit?.contentSchemaId, 'movscript.content_unit_proposal.v1')
  assert.equal(contentUnit?.seed.defaultMode, 'snapshot')
  assert.deepEqual(contentUnit?.seed.allowedModes, ['empty', 'snapshot'])
  assert.ok(contentUnit?.seed.include.includes('content_units'))
  assert.ok(contentUnit?.fieldGuide.owns.includes('content_units'))
  assert.ok(contentUnit?.fieldGuide.owns.includes('content_units[].visual_plan'))
  assert.ok(contentUnit?.fieldGuide.owns.includes('content_units[].storyboard_brief'))
  assert.ok(contentUnit?.fieldGuide.forbids.includes('operation_fields'))
  assert.ok(contentUnit?.fieldGuide.forbids.includes('media_generation_jobs'))
  assert.equal(contentUnit?.applyBoundary.backendApply, 'draft_only')
})

test('draft review path is resolved from the shared frontend draft model helpers', () => {
  assert.equal(
    buildDraftReviewPath(draft({ id: 'draft-project', kind: 'project_standards_proposal' })),
    '/project/standards?draftId=draft-project',
  )
  assert.equal(
    buildDraftReviewPath(draft({ id: 'draft-setting', kind: 'setting_proposal' })),
    '/project/pre-production?view=review&draftId=draft-setting',
  )
  assert.equal(
    buildDraftReviewPath(draft({ id: 'draft-asset-proposal', kind: 'asset_proposal' })),
    '/project/pre-production?view=review&draftId=draft-asset-proposal',
  )
  assert.equal(
    buildDraftReviewPath(draft({ id: 'draft-script', kind: 'script_split_proposal' })),
    '/project/scripts?draftId=draft-script',
  )
  assert.equal(
    buildDraftReviewPath(draft({
      id: 'draft-production',
      kind: 'production_proposal',
      target: { entityType: 'production', entityId: 301 },
    })),
    '/project/production/orchestration?productionId=301&draftId=draft-production',
  )
  assert.equal(
    buildDraftReviewPath(draft({
      id: 'draft-asset',
      kind: 'asset_proposal',
      target: { entityType: 'asset_slot', entityId: 88 },
    })),
    '/project/pre-production?view=review&draftId=draft-asset&asset_slot_id=88',
  )
  assert.equal(
    buildDraftReviewPath(draft({
      id: 'draft-content-unit',
      kind: 'content_unit_proposal',
      target: { entityType: 'scene_moment', entityId: 77 },
    })),
    '/project/content-units/workbench?view=review&draftId=draft-content-unit&scene_moment_id=77',
  )
  assert.equal(
    buildDraftReviewPath(draft({
      id: 'draft-content-unit-production',
      kind: 'content_unit_proposal',
      target: { entityType: 'production', entityId: 301 },
    })),
    '/project/content-units/workbench?view=review&draftId=draft-content-unit-production&productionId=301',
  )
  assert.equal(
    buildDraftReviewPath(draft({
      id: 'draft-content-unit-existing',
      kind: 'content_unit_proposal',
      target: { entityType: 'content_unit', entityId: 801 },
    })),
    '/project/content-units/workbench?view=review&draftId=draft-content-unit-existing&content_unit_id=801',
  )
})

test('draft artifact review path does not require loading the full draft first', () => {
  assert.equal(
    buildDraftArtifactReviewPath({
      type: 'draft',
      draftId: 'draft-project',
      draftKind: 'project_standards_proposal',
      title: '项目规范提案',
    }),
    '/project/standards?draftId=draft-project',
  )
  assert.equal(
    buildDraftArtifactReviewPath({
      type: 'draft',
      draftId: 'draft-production',
      draftKind: 'production_proposal',
      target: { entityType: 'production', entityId: 301 },
    }),
    '/project/production/orchestration?productionId=301&draftId=draft-production',
  )
  assert.equal(
    buildDraftArtifactReviewPath({
      type: 'draft',
      draftId: 'draft-note',
      draftKind: 'note',
    }),
    null,
  )
})
