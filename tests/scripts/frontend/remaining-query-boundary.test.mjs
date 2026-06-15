import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const authPageSource = readSource('apps/frontend/src/features/auth/components/AuthPage.tsx')
const invitePageSource = readSource('apps/frontend/src/features/auth/components/InvitePage.tsx')
const authQueryKeysSource = readSource('apps/frontend/src/features/auth/application/authQueryKeys.ts')
const projectQueriesSource = readSource('apps/frontend/src/features/project/application/projectQueries.ts')
const projectStandardsSource = readSource('apps/frontend/src/features/project-standards/components/ProjectStandardsPage.tsx')
const projectStandardsBoardModelSource = readSource('apps/frontend/src/features/project-standards/presentation/projectStandardsBoardModel.ts')
const projectStandardsModelSource = readSource('apps/frontend/src/features/project-standards/application/projectStandardsModel.ts')
const projectStandardsQueryKeysSource = readSource('apps/frontend/src/features/project-standards/application/projectStandardsQueryKeys.ts')
const projectStandardsWorkspaceSource = readSource('apps/frontend/src/features/project-standards/domain/projectStandardsWorkspaceWorkspace.ts')
const resourcePanelSource = readSource('apps/frontend/src/shared/ui/ResourcePanel.tsx')
const resourceQueryKeysSource = readSource('apps/frontend/src/features/resources/application/resourceQueryKeys.ts')

test('remaining TSX query keys are delegated to factories', () => {
  assert.match(authPageSource, /authKeys\.config/)
  assert.match(invitePageSource, /authKeys\.invitation\(token\)/)
  assert.match(authQueryKeysSource, /export const authKeys/)
  assert.doesNotMatch(projectQueriesSource, /overview:|project-overview/)
  assert.match(projectStandardsSource, /projectStandardsKeys\.workspaceArtifacts\(projectId, pageKey, activeWorkspaceId, openedWorkspaceId\)/)
  assert.match(projectStandardsQueryKeysSource, /export const projectStandardsKeys/)
  assert.doesNotMatch(projectStandardsModelSource, /@deprecated/)
  assert.doesNotMatch(projectStandardsModelSource, /ProjectStandardsWorkspaceWorkspaceView/)
  assert.doesNotMatch(projectStandardsModelSource, /parseProjectStandardsWorkspaceWorkspace/)
  assert.doesNotMatch(projectStandardsWorkspaceSource, /@deprecated/)
  assert.doesNotMatch(projectStandardsWorkspaceSource, /ProjectStandardsWorkspaceWorkspaceContent/)
  assert.doesNotMatch(projectStandardsWorkspaceSource, /buildEmptyProjectStandardsWorkspaceWorkspaceContent/)
  assert.match(resourcePanelSource, /resourceKeys\.assetSlotsPanel\(current\?\.ID\)/)
  assert.match(resourceQueryKeysSource, /assetSlotsPanel/)

  for (const source of [authPageSource, invitePageSource, projectStandardsSource, resourcePanelSource]) {
    assert.doesNotMatch(source, /queryKey: \[/)
  }
})

test('project standards page delegates board grouping model', () => {
  assert.match(projectStandardsSource, /from '@\/features\/project-standards\/presentation\/projectStandardsBoardModel'/)
  assert.match(projectStandardsBoardModelSource, /export const CORE_STANDARD_GROUPS/)
  assert.match(projectStandardsBoardModelSource, /export function coreCards\(/)
  assert.match(projectStandardsBoardModelSource, /export interface StandardWorkbenchGroup/)
  assert.doesNotMatch(projectStandardsSource, /interface StandardWorkbenchGroup/)
  assert.doesNotMatch(projectStandardsSource, /type StandardWorkbenchCard =/)
  assert.doesNotMatch(projectStandardsSource, /const CORE_STANDARD_GROUPS =/)
  assert.doesNotMatch(projectStandardsSource, /function coreCards\(/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
