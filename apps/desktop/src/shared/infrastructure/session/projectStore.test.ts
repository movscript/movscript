import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Project } from '@/types'
import { PROJECT_SESSION_STORAGE_KEY, useProjectStore } from './projectStore'

test('project session persistence is routed through desktop Home storage', () => {
  const source = readFileSync(resolve('src/shared/infrastructure/session/projectStore.ts'), 'utf8')

  assert.equal(PROJECT_SESSION_STORAGE_KEY, 'movscript-project')
  assert.match(source, /createDesktopStateStorage\(PROJECT_SESSION_STORAGE_KEY, fallback\)/)
})

test('project store exposes explicit project session state', () => {
  useProjectStore.setState({
    current: null,
    currentProjectId: null,
    workspaceRoot: null,
    lastRoute: null,
    syncStatus: 'idle',
    dirtyScopes: [],
    hydrated: true,
  })

  useProjectStore.getState().setCurrent(projectFixture({ ID: 9, name: 'Nine' }))
  useProjectStore.getState().setWorkspaceRoot('/tmp/movscript-project')
  useProjectStore.getState().setLastRoute('/project/content')
  useProjectStore.getState().markDirtyScope('content')
  useProjectStore.getState().markDirtyScope('content')
  useProjectStore.getState().markDirtyScope('resources')

  assert.equal(useProjectStore.getState().currentProjectId, 9)
  assert.equal(useProjectStore.getState().workspaceRoot, '/tmp/movscript-project')
  assert.equal(useProjectStore.getState().lastRoute, '/project/content')
  assert.equal(useProjectStore.getState().syncStatus, 'dirty')
  assert.deepEqual(useProjectStore.getState().dirtyScopes, ['content', 'resources'])

  useProjectStore.getState().clearDirtyScope('content')
  assert.deepEqual(useProjectStore.getState().dirtyScopes, ['resources'])
  assert.equal(useProjectStore.getState().syncStatus, 'dirty')

  useProjectStore.getState().clearDirtyScope('resources')
  assert.deepEqual(useProjectStore.getState().dirtyScopes, [])
  assert.equal(useProjectStore.getState().syncStatus, 'idle')
})

test('project store preserves local project title and path across backend refreshes', () => {
  useProjectStore.setState({
    current: null,
    currentProjectId: null,
    workspaceRoot: null,
    lastRoute: null,
    syncStatus: 'idle',
    dirtyScopes: [],
    hydrated: true,
  })

  useProjectStore.getState().setCurrent(projectFixture({
    ID: 7,
    name: 'Readable Local Title',
    description: 'Local description',
    project_uid: 'proj_uid_7',
    workspace_path: '/tmp/readable-local-title',
    project_path: '/tmp/readable-local-title',
    local: true,
  }))
  useProjectStore.getState().setCurrent(projectFixture({
    ID: 7,
    name: 'project 1',
    description: 'Backend description',
    project_uid: 'proj_uid_7',
  }))

  const current = useProjectStore.getState().current
  assert.equal(current?.name, 'Readable Local Title')
  assert.equal(current?.description, 'Local description')
  assert.equal(current?.workspace_path, '/tmp/readable-local-title')
  assert.equal(current?.project_path, '/tmp/readable-local-title')
  assert.equal(current?.local, true)
})

test('project overview route consumes the project surface page entrypoint', () => {
  const routeComponentsSource = readFileSync(resolve('src/features/app-shell/application/appRouteComponents.tsx'), 'utf8')
  const routeSource = readFileSync(resolve('src/features/app-shell/application/DesktopProjectSurfaceRoutes.tsx'), 'utf8')
  const runtimeSource = readFileSync(resolve('src/features/app-shell/application/desktopProjectSurfaceRuntime.tsx'), 'utf8')

  assert.match(routeComponentsSource, /@movscript\/project-surface\/pages[\s\S]*ProjectOverviewPage/)
  assert.doesNotMatch(routeSource, /ProjectOverviewSurface/)
  assert.doesNotMatch(routeSource, /useDesktopProjectReadModel/)
  assert.match(runtimeSource, /workspaceRoot = useProjectStore/)
  assert.match(runtimeSource, /projectDir = project\?\.workspace_path \?\? project\?\.project_path \?\? workspaceRoot \?\? undefined/)
  assert.match(runtimeSource, /readModel: async \(\) =>/)
  assert.match(runtimeSource, /if \(!contextProjectDir\) throw new Error/)
  assert.doesNotMatch(routeSource, /src\/pages\/project\/ProjectOverviewPage/)
})

function projectFixture(patch: Partial<Project> = {}): Project {
  return {
    ID: 1,
    name: 'Project',
    description: '',
    owner_id: 1,
    CreatedAt: '2026-06-18T00:00:00.000Z',
    UpdatedAt: '2026-06-18T00:00:00.000Z',
    ...patch,
  }
}
