import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Project } from '@/types'
import {
  LOCAL_PROJECT_RECENTS_STORAGE_KEY,
  dismissRecentProject,
  mergeRecentProjects,
  useLocalProjectRecentsStore,
} from './localProjectRecentsStore'

test('local project recents persistence is routed through desktop Home storage', () => {
  const source = readFileSync(resolve('src/shared/infrastructure/session/localProjectRecentsStore.ts'), 'utf8')

  assert.equal(LOCAL_PROJECT_RECENTS_STORAGE_KEY, 'movscript-local-project-recents')
  assert.match(source, /createDesktopStateStorage\(LOCAL_PROJECT_RECENTS_STORAGE_KEY, fallback\)/)
})

test('local project recents are path keyed and newest first', () => {
  useLocalProjectRecentsStore.setState({ projects: [], dismissedKeys: [] })

  useLocalProjectRecentsStore.getState().remember(projectFixture({
    ID: -1,
    name: 'Old title',
    workspace_path: '/tmp/movscript-local-project',
    UpdatedAt: '2026-06-18T00:00:00.000Z',
  }))
  useLocalProjectRecentsStore.getState().remember(projectFixture({
    ID: -1,
    name: 'Readable title',
    workspace_path: '/tmp/movscript-local-project',
    UpdatedAt: '2026-06-19T00:00:00.000Z',
  }))

  const projects = useLocalProjectRecentsStore.getState().projects
  assert.equal(projects.length, 1)
  assert.equal(projects[0]?.name, 'Readable title')
  assert.equal(projects[0]?.local, true)
})

test('dismissed recent projects are hidden until remembered again', () => {
  useLocalProjectRecentsStore.setState({ projects: [], dismissedKeys: [] })
  const project = projectFixture({
    ID: -1,
    name: 'Local',
    workspace_path: '/tmp/movscript-hidden-project',
    local: true,
  })

  useLocalProjectRecentsStore.getState().remember(project)
  dismissRecentProject(project)

  assert.deepEqual(mergeRecentProjects([], useLocalProjectRecentsStore.getState().projects, useLocalProjectRecentsStore.getState().dismissedKeys), [])

  useLocalProjectRecentsStore.getState().remember(project)
  assert.equal(useLocalProjectRecentsStore.getState().dismissedKeys.length, 0)
  assert.equal(mergeRecentProjects([], useLocalProjectRecentsStore.getState().projects, useLocalProjectRecentsStore.getState().dismissedKeys).length, 1)
})

test('recent project merge prefers local path entries over backend duplicates', () => {
  const merged = mergeRecentProjects([
    projectFixture({ ID: 7, name: 'Backend', workspace_path: '/tmp/movscript-local-project' }),
  ], [
    projectFixture({ ID: -1, name: 'Local', workspace_path: '/tmp/movscript-local-project', local: true }),
  ])

  assert.equal(merged.length, 1)
  assert.equal(merged[0]?.name, 'Local')
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
