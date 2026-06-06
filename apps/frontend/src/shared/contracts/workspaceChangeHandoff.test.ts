import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWorkspaceBusinessReviewPath,
  buildWorkspaceChangeHandoffNavigation,
  WORKSPACE_CHANGE_HANDOFF_EVENT,
  WORKSPACE_CHANGE_HANDOFF_SCHEMA,
  WORKSPACE_REVIEW_ROUTE,
  workspaceChangeHandoffPathFromEventDetail,
} from './workspaceChangeHandoff'

test('workspace change handoff builds the frontend review route around a submitted projection', () => {
  const navigation = buildWorkspaceChangeHandoffNavigation({
    workspacePath: 'data/users/local/projects/4/settings/workspace.json',
    workspaceKind: 'setting_workspace',
  })

  assert.equal(navigation.path.startsWith(`${WORKSPACE_REVIEW_ROUTE}?`), true)
  const params = new URLSearchParams(navigation.path.split('?')[1])
  assert.equal(params.get('workspacePath'), 'data/users/local/projects/4/settings/workspace.json')
  assert.equal(params.get('kind'), 'setting_workspace')
  assert.equal(WORKSPACE_CHANGE_HANDOFF_SCHEMA, 'movscript.workspace-change-handoff.v1')
  assert.equal(WORKSPACE_CHANGE_HANDOFF_EVENT, 'movscript:workspace-change-submitted')
})

test('workspace change handoff can include an existing business review path when a workspace id is known', () => {
  assert.equal(
    buildWorkspaceBusinessReviewPath({
      workspaceKind: 'asset_workspace',
      workspaceId: 'workspace-asset',
      target: { entityType: 'asset_slot', entityId: 88 },
    }),
    '/project/pre-production?view=review&workspaceId=workspace-asset&asset_slot_id=88',
  )

  const navigation = buildWorkspaceChangeHandoffNavigation({
    workspacePath: 'data/users/local/projects/4/assets/workspace.json',
    workspaceKind: 'asset_workspace',
    workspaceId: 'workspace-asset',
    target: { entityType: 'asset_slot', entityId: 88 },
  })

  assert.equal(navigation.businessReviewPath, '/project/pre-production?view=review&workspaceId=workspace-asset&asset_slot_id=88')
  assert.equal(new URLSearchParams(navigation.path.split('?')[1]).get('businessReviewPath'), navigation.businessReviewPath)
})

test('workspace change handoff event details resolve to navigable paths', () => {
  assert.equal(
    workspaceChangeHandoffPathFromEventDetail({
      workspacePath: 'data/users/local/projects/4/project-standards/workspace.json',
      workspaceKind: 'project_standards_workspace',
      workspaceId: 'workspace-standards',
    }),
    '/workspace/review?workspacePath=data%2Fusers%2Flocal%2Fprojects%2F4%2Fproject-standards%2Fworkspace.json&kind=project_standards_workspace&workspaceId=workspace-standards&businessReviewPath=%2Fproject%2Fstandards%3FworkspaceId%3Dworkspace-standards',
  )
})
