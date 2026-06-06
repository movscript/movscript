import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWorkspaceArtifactReviewPath, buildWorkspaceReviewPath, getWorkspaceDomainModel } from './workspaceDomainModel'
import type { WorkspaceArtifact } from '@/shared/infrastructure/providerSessionClient'

function workspace(input: Partial<WorkspaceArtifact> & Pick<WorkspaceArtifact, 'id' | 'kind'>): WorkspaceArtifact {
  return {
    title: input.id,
    content: '',
    status: 'workspace',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...input,
  }
}

test('workspace domain model separates project standards, settings, and asset slots', () => {
  const project = getWorkspaceDomainModel('project_standards_workspace')
  const setting = getWorkspaceDomainModel('setting_workspace')
  const assetWorkspace = getWorkspaceDomainModel('asset_workspace')
  const production = getWorkspaceDomainModel('production_workspace')

  assert.equal(project?.seed.defaultMode, 'editable_snapshot')
  assert.deepEqual(project?.seed.include, ['project'])
  assert.equal(project?.targetEntityType, 'project')
  assert.equal(project?.contentSchemaId, 'movscript.project_standards_workspace.v1')
  assert.ok(project?.fieldGuide.owns.includes('shot_size_system'))
  assert.ok(project?.fieldGuide.owns.includes('custom_rules'))
  assert.ok(project?.fieldGuide.forbids.includes('creative_reference_lists'))
  assert.ok(project?.fieldGuide.forbids.includes('asset_requirement_lists'))
  assert.equal(project?.applyBoundary.backendApply, 'project_standards_workspace')

  assert.equal(setting?.contentSchemaId, 'movscript.setting_workspace.v1')
  assert.ok(setting?.fieldGuide.owns.includes('creative_references'))
  assert.ok(setting?.fieldGuide.forbids.includes('asset_slots'))
  assert.equal(setting?.applyBoundary.backendApply, 'setting_workspace')

  assert.equal(assetWorkspace?.contentSchemaId, 'movscript.asset_workspace.v1')
  assert.ok(assetWorkspace?.fieldGuide.owns.includes('asset_slots'))
  assert.ok(assetWorkspace?.fieldGuide.forbids.includes('creative_reference_edits'))
  assert.equal(assetWorkspace?.applyBoundary.backendApply, 'asset_workspace')

  assert.equal(production?.seed.defaultMode, 'editable_snapshot')
  assert.deepEqual(production?.seed.allowedModes, ['empty', 'snapshot', 'editable_snapshot'])
  assert.ok(production?.seed.include.includes('production_script_brief'))
  assert.ok(production?.seed.include.includes('project_scripts'))
  assert.ok(production?.seed.include.includes('creative_references'))
  assert.ok(production?.seed.include.includes('segments'))
  assert.ok(production?.seed.include.includes('scene_moments'))
  assert.equal(production?.targetEntityType, 'production')
  assert.equal(production?.contentSchemaId, 'movscript.production_workspace.v1')
  assert.ok(production?.fieldGuide.owns.includes('snapshot.workspace.segments'))
  assert.ok(production?.fieldGuide.forbids.includes('new_project_level_creative_references'))
  assert.equal(production?.applyBoundary.backendApply, 'production_workspace')
})

test('workspace domain model defines content unit workspace contracts', () => {
  const contentUnit = getWorkspaceDomainModel('content_unit_workspace')

  assert.equal(contentUnit?.targetEntityType, 'scene_moment')
  assert.equal(contentUnit?.contentSchemaId, 'movscript.content_unit_workspace.v1')
  assert.equal(contentUnit?.seed.defaultMode, 'snapshot')
  assert.deepEqual(contentUnit?.seed.allowedModes, ['empty', 'snapshot'])
  assert.ok(contentUnit?.seed.include.includes('content_units'))
  assert.ok(contentUnit?.fieldGuide.owns.includes('content_units'))
  assert.ok(contentUnit?.fieldGuide.owns.includes('content_units[].visual_taskGraph'))
  assert.ok(contentUnit?.fieldGuide.owns.includes('content_units[].storyboard_brief'))
  assert.ok(contentUnit?.fieldGuide.forbids.includes('operation_fields'))
  assert.ok(contentUnit?.fieldGuide.forbids.includes('media_generation_jobs'))
  assert.equal(contentUnit?.applyBoundary.backendApply, 'workspace_only')
})

test('workspace review path is resolved from the shared frontend workspace model helpers', () => {
  assert.equal(
    buildWorkspaceReviewPath(workspace({ id: 'workspace-project', kind: 'project_standards_workspace' })),
    '/project/standards?workspaceId=workspace-project',
  )
  assert.equal(
    buildWorkspaceReviewPath(workspace({ id: 'workspace-setting', kind: 'setting_workspace' })),
    '/project/pre-production?view=review&workspaceId=workspace-setting',
  )
  assert.equal(
    buildWorkspaceReviewPath(workspace({ id: 'workspace-asset-workspace', kind: 'asset_workspace' })),
    '/project/pre-production?view=review&workspaceId=workspace-asset-workspace',
  )
  assert.equal(
    buildWorkspaceReviewPath(workspace({ id: 'workspace-script', kind: 'production_workspace' })),
    null,
  )
  assert.equal(
    buildWorkspaceReviewPath(workspace({
      id: 'workspace-production',
      kind: 'production_workspace',
      target: { entityType: 'production', entityId: 301 },
    })),
    '/project/production/orchestration?view=review&workspaceId=workspace-production&productionId=301',
  )
  assert.equal(
    buildWorkspaceReviewPath(workspace({
      id: 'workspace-asset',
      kind: 'asset_workspace',
      target: { entityType: 'asset_slot', entityId: 88 },
    })),
    '/project/pre-production?view=review&workspaceId=workspace-asset&asset_slot_id=88',
  )
  assert.equal(
    buildWorkspaceReviewPath(workspace({
      id: 'workspace-content-unit',
      kind: 'content_unit_workspace',
      target: { entityType: 'scene_moment', entityId: 77 },
    })),
    '/project/production/orchestration?view=review&workspaceId=workspace-content-unit&scene_moment_id=77',
  )
  assert.equal(
    buildWorkspaceReviewPath(workspace({
      id: 'workspace-content-unit-production',
      kind: 'content_unit_workspace',
      target: { entityType: 'production', entityId: 301 },
    })),
    '/project/production/orchestration?view=review&workspaceId=workspace-content-unit-production&productionId=301',
  )
  assert.equal(
    buildWorkspaceReviewPath(workspace({
      id: 'workspace-content-unit-existing',
      kind: 'content_unit_workspace',
      target: { entityType: 'content_unit', entityId: 801 },
    })),
    '/project/production/orchestration?view=review&workspaceId=workspace-content-unit-existing&content_unit_id=801',
  )
})

test('workspace artifact review path does not require loading the full workspace first', () => {
  assert.equal(
    buildWorkspaceArtifactReviewPath({
      type: 'workspace',
      workspaceId: 'workspace-project',
      workspaceKind: 'project_standards_workspace',
      title: '项目规范工作区',
    }),
    '/project/standards?workspaceId=workspace-project',
  )
  assert.equal(
    buildWorkspaceArtifactReviewPath({
      type: 'workspace',
      workspaceId: 'workspace-production',
      workspaceKind: 'production_workspace',
      target: { entityType: 'production', entityId: 301 },
    }),
    '/project/production/orchestration?view=review&workspaceId=workspace-production&productionId=301',
  )
  assert.equal(
    buildWorkspaceArtifactReviewPath({
      type: 'workspace',
      workspaceId: 'workspace-note',
      workspaceKind: 'project_standards_workspace',
    }),
    '/project/standards?workspaceId=workspace-note',
  )
})
