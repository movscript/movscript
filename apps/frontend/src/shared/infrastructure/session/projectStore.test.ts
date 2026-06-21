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

test('project overview plugin query is enabled for path-bound projects', () => {
  const source = readFileSync(resolve('src/pages/project/ProjectOverviewPage.tsx'), 'utf8')

  assert.match(source, /enabled: Boolean\(projectPluginContext\.projectDir && \(projectPluginContext\.movScriptHomeDir \?\? projectPluginContext\.workspaceDir\)\)/)
  assert.doesNotMatch(source, /projectPluginsQuery[\s\S]*enabled:[^\n]*!isLocalProject/)
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
