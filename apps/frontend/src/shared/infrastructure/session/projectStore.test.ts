import test from 'node:test'
import assert from 'node:assert/strict'

import type { Project } from '@/types'
import { useProjectStore } from './projectStore'

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
