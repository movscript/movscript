import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import {
  ensureMovScriptWorkspaceContext,
  ensureMovScriptWorkspaceRoot,
  readMovScriptWorkspaceRootManifest,
  resolveMovScriptProjectCwd,
  resolveMovScriptProjectWorkspacePaths,
  resolveMovScriptWorkspaceContextPaths,
  resolveMovScriptWorkspaceRootPaths,
} from '../dist/workspace/node/index.js'

test('core workspace resolves project cwd by user, org, and project ids', () => {
  const workspaceDir = '/tmp/movscript-root'

  assert.equal(
    resolveMovScriptProjectCwd({ workspaceDir, userId: 7, projectId: 'demo' }),
    '/tmp/movscript-root/.movscript/user/7/projects/project_demo',
  )
  assert.equal(
    resolveMovScriptProjectWorkspacePaths({ workspaceDir, orgId: 'team_a', projectId: 42 }).projectDir,
    '/tmp/movscript-root/.movscript/org/team_a/projects/project_42',
  )
  assert.equal(
    resolveMovScriptProjectCwd({ workspaceDir }),
    '/tmp/movscript-root/.movscript/local/projects/project',
  )
})

test('core workspace context forwards project cwd as provider session cwd', () => {
  const paths = resolveMovScriptWorkspaceContextPaths({
    workspaceDir: '/tmp/movscript-root',
    userId: 'alice',
    projectId: 'trailer',
  })

  assert.equal(paths.scope, 'project')
  assert.equal(paths.projectCwd, '/tmp/movscript-root/.movscript/user/alice/projects/project_trailer')
  assert.equal(paths.providerSessionCwd, paths.projectCwd)
  assert.equal(paths.contextKey, 'project/trailer')
})

test('core workspace root and context only create app workspace directories', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-core-workspace-'))
  try {
    const rootPaths = resolveMovScriptWorkspaceRootPaths(workspaceDir)
    const manifest = ensureMovScriptWorkspaceRoot(rootPaths)
    const contextPaths = ensureMovScriptWorkspaceContext(resolveMovScriptWorkspaceContextPaths({
      workspaceDir,
      userId: 'alice',
      projectId: 'demo',
    }))

    assert.equal(manifest.schema, 'movscript.project-workspace.v1')
    assert.ok(readMovScriptWorkspaceRootManifest(rootPaths.manifestPath))
    assert.equal(existsSync(rootPaths.controlDir), true)
    assert.equal(existsSync(rootPaths.providersDir), true)
    assert.equal(existsSync(rootPaths.backendDir), true)
    assert.equal(existsSync(contextPaths.projectCwd), true)
    assert.equal(existsSync(join(rootPaths.controlDir, '.build')), false)
    assert.equal(existsSync(join(rootPaths.workspaceDir, 'scripts')), false)
    assert.equal(existsSync(join(rootPaths.workspaceDir, 'productions')), false)
    assert.equal(existsSync(join(rootPaths.workspaceDir, 'content_units')), false)
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})
