import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { LAST_WORKSPACE_STORAGE_KEY, useLastWorkspaceStore } from './lastWorkspaceStore'

test('last workspace persistence is routed through desktop Home storage', () => {
  const source = readFileSync(resolve('src/shared/infrastructure/session/lastWorkspaceStore.ts'), 'utf8')

  assert.equal(LAST_WORKSPACE_STORAGE_KEY, 'movscript-last-workspace')
  assert.match(source, /createDesktopStateStorage\(LAST_WORKSPACE_STORAGE_KEY, fallback\)/)
})

test('last workspace store remembers and clears a project route', () => {
  useLastWorkspaceStore.setState({ last: null })

  useLastWorkspaceStore.getState().rememberProjectRoute({
    projectId: 7,
    route: '/project/content',
    search: 'scene_moment_id=12',
  })

  assert.equal(useLastWorkspaceStore.getState().last?.projectId, 7)
  assert.equal(useLastWorkspaceStore.getState().last?.route, '/project/content')
  assert.equal(useLastWorkspaceStore.getState().last?.search, 'scene_moment_id=12')

  useLastWorkspaceStore.getState().clear()
  assert.equal(useLastWorkspaceStore.getState().last, null)
})
