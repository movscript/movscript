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

  assert.equal(project?.targetEntityType, 'project_standards')
  assert.equal(project?.contentSchemaId, 'movscript.project_standards.v1')
  assert.equal(project?.applyBoundary.backendApply, 'workspace_interpret')

  assert.equal(setting?.contentSchemaId, 'movscript.setting.v1')
  assert.ok(setting?.entityTypes.includes('setting'))
  assert.equal(setting?.applyBoundary.backendApply, 'workspace_interpret')

  assert.equal(assetWorkspace?.contentSchemaId, 'movscript.asset.v1')
  assert.ok(assetWorkspace?.fieldGuide.owns.includes('asset'))
  assert.equal(assetWorkspace?.applyBoundary.backendApply, 'workspace_interpret')

  assert.equal(production?.targetEntityType, 'production')
  assert.equal(production?.contentSchemaId, 'movscript.production.v1')
  assert.ok(production?.entityTypes.includes('production'))
  assert.equal(production?.applyBoundary.backendApply, 'workspace_interpret')
})

test('workspace domain model defines content unit workspace contracts', () => {
  const contentUnit = getWorkspaceDomainModel('content_unit_workspace')

  assert.equal(contentUnit?.targetEntityType, 'content_unit')
  assert.equal(contentUnit?.contentSchemaId, 'movscript.content_unit.v1')
  assert.ok(contentUnit?.fieldGuide.owns.includes('content_unit'))
  assert.equal(contentUnit?.applyBoundary.backendApply, 'workspace_interpret')
})

test('workspace review path is resolved from the shared frontend workspace model helpers', () => {
  assert.equal(
    buildWorkspaceReviewPath(workspace({ id: 'workspace-project', kind: 'project_standards_workspace' })),
    '/project/standards?workspaceId=workspace-project',
  )
  assert.equal(
    buildWorkspaceReviewPath(workspace({ id: 'workspace-setting', kind: 'setting_workspace' })),
    '/project/scripts/workbench?workspaceId=workspace-setting',
  )
  assert.equal(
    buildWorkspaceReviewPath(workspace({ id: 'workspace-asset-workspace', kind: 'asset_workspace' })),
    '/project/content-orchestration/canvas?workspaceId=workspace-asset-workspace',
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
    '/project/scripts/workbench?workspaceId=workspace-production&productionId=301',
  )
  assert.equal(
    buildWorkspaceReviewPath(workspace({
      id: 'workspace-asset',
      kind: 'asset_workspace',
      target: { entityType: 'asset_slot', entityId: 88 },
    })),
    '/project/content-orchestration/canvas?workspaceId=workspace-asset&asset_slot_id=88',
  )
  assert.equal(
    buildWorkspaceReviewPath(workspace({
      id: 'workspace-content-unit',
      kind: 'content_unit_workspace',
      target: { entityType: 'scene_moment', entityId: 77 },
    })),
    '/project/content-orchestration/canvas?workspaceId=workspace-content-unit&scene_moment_id=77',
  )
  assert.equal(
    buildWorkspaceReviewPath(workspace({
      id: 'workspace-content-unit-production',
      kind: 'content_unit_workspace',
      target: { entityType: 'production', entityId: 301 },
    })),
    '/project/scripts/workbench?workspaceId=workspace-content-unit-production&productionId=301',
  )
  assert.equal(
    buildWorkspaceReviewPath(workspace({
      id: 'workspace-content-unit-existing',
      kind: 'content_unit_workspace',
      target: { entityType: 'content_unit', entityId: 801 },
    })),
    '/project/content-orchestration/canvas?workspaceId=workspace-content-unit-existing&content_unit_id=801',
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
    '/project/scripts/workbench?workspaceId=workspace-production&productionId=301',
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
