import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const projectQueriesSource = readSource('apps/frontend/src/features/project/application/projectQueries.ts')
const projectMutationSource = readSource('apps/frontend/src/features/project/application/projectMutationInvalidation.ts')
const projectsPageSource = readSource('apps/frontend/src/features/project/components/ProjectsPage.tsx')
const appTopControlsSource = readSource('apps/frontend/src/features/app-shell/components/AppTopControls.tsx')
const projectRequiredDialogSource = readSource('apps/frontend/src/features/app-shell/components/ProjectRequiredDialog.tsx')
const sidebarSource = readSource('apps/frontend/src/features/app-shell/components/Sidebar.tsx')
const orgSelectSource = readSource('apps/frontend/src/features/organization/components/OrgSelectPage.tsx')
const globalHomeSource = readSource('apps/frontend/src/pages/home/GlobalHomePage.tsx')
const projectAgentModeSource = [
  readSource('apps/frontend/src/features/agent/components/ProjectAgentModePage.tsx'),
  readSource('apps/frontend/src/features/agent/components/ProjectAgentModeSidebar.tsx'),
].join('\n')

test('project surfaces delegate query keys and invalidation', () => {
  assert.match(projectQueriesSource, /export const projectKeys/)
  assert.match(projectQueriesSource, /list: \(orgId: number \| null \| undefined\) => \['projects', orgId \?\? 'none'\] as const/)
  assert.match(projectQueriesSource, /detail: \(projectId: number \| undefined\) => \['project', projectId\] as const/)
  assert.match(projectQueriesSource, /progress: \(orgId: number \| null \| undefined, projectId: number\) => \['progress', orgId \?\? 'none', projectId\] as const/)
  assert.doesNotMatch(projectQueriesSource, /export function invalidateProjectList/)
  assert.match(projectQueriesSource, /export function removeProjectCaches/)
  assert.match(projectMutationSource, /export interface ProjectMutationEvent/)
  assert.match(projectMutationSource, /type: 'ProjectListChanged'/)
  assert.match(projectMutationSource, /export function projectListChangedResult/)
  assert.match(projectMutationSource, /export function invalidateProjectMutationResult/)

  for (const source of [
    projectsPageSource,
    appTopControlsSource,
    projectRequiredDialogSource,
    sidebarSource,
    orgSelectSource,
    globalHomeSource,
    projectAgentModeSource,
  ]) {
    assert.doesNotMatch(source, /projectListQueryKey|projectProgressQueryKey/)
    assert.doesNotMatch(source, /queryKey: \['projects'/)
    assert.doesNotMatch(source, /queryKey: \['project'/)
    assert.doesNotMatch(source, /queryKey: \['progress'/)
    assert.doesNotMatch(source, /invalidateQueries\(\{ queryKey: projectKeys/)
    assert.doesNotMatch(source, /removeQueries\(\{ queryKey: \['projects'/)
    assert.doesNotMatch(source, /removeQueries\(\{ queryKey: \['progress'/)
  }

  assert.match(projectsPageSource, /projectKeys\.list\(currentOrgID\)/)
  assert.match(projectsPageSource, /projectKeys\.progress\(currentOrgID, project\.ID\)/)
  assert.match(projectsPageSource, /invalidateProjectMutationResult\(qc, projectListChangedResult\(\{ orgId: currentOrgID, changedIds: \[newProject\.ID\] \}\)\)/)
  assert.match(appTopControlsSource, /invalidateProjectMutationResult\(queryClient, projectListChangedResult\(\{ orgId: currentOrgID, changedIds: \[project\.ID\] \}\)\)/)
  assert.match(projectRequiredDialogSource, /invalidateProjectMutationResult\(queryClient, projectListChangedResult\(\{ orgId: currentOrgID, changedIds: \[project\.ID\] \}\)\)/)
  assert.doesNotMatch(sidebarSource, /projectKeys\.detail|useProjectStore|ROUTES\.project\./)
  assert.match(orgSelectSource, /removeProjectCaches\(queryClient\)/)
  assert.match(globalHomeSource, /projectKeys\.list\(currentOrgID\)/)
  assert.match(projectAgentModeSource, /projectKeys\.list\(currentOrgID\)/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
