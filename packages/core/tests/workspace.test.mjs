import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import {
  readMovScriptBackendAuth,
  resolveMovScriptBackendPaths,
  writeMovScriptBackendAuth,
  writeMovScriptBackendConfig,
} from '../dist/backend/node/index.js'
import {
  defaultMovScriptHomeConfig,
  ensureMovScriptWorkspaceContext,
  ensureMovScriptWorkspaceRoot,
  ensureMovScriptHomeConfig,
  movScriptRuntimeBinaryName,
  movScriptRuntimePreflight,
  readMovScriptHomeConfig,
  readMovScriptWorkspaceRootManifest,
  resolveMovScriptHomeConfigPaths,
  resolveMovScriptHomeDir,
  resolveMovScriptProjectCwd,
  resolveMovScriptProjectWorkspacePaths,
  resolveMovScriptWorkspaceContextPaths,
  resolveMovScriptWorkspaceRuntimePaths,
  resolveMovScriptWorkspaceRootPaths,
  writeMovScriptHomeConfig,
} from '../dist/workspace/node/index.js'

test('core workspace resolves project cwd by user, org, and project ids', () => {
  const workspaceDir = '/tmp/movscript-root'

  assert.equal(
    resolveMovScriptProjectCwd({ workspaceDir, userId: 7, projectId: 'demo' }),
    '/tmp/movscript-root/realms/local/user/7/projects/project_demo',
  )
  assert.equal(
    resolveMovScriptProjectWorkspacePaths({ workspaceDir, orgId: 'team_a', projectId: 42 }).projectDir,
    '/tmp/movscript-root/realms/local/org/team_a/projects/project_42',
  )
  assert.throws(
    () => resolveMovScriptProjectCwd({ workspaceDir }),
    /requires userId or orgId/,
  )
})

test('core workspace isolates local and cloud realms for the same user and project ids', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'movscript-core-realm-'))
  try {
    const localProject = resolveMovScriptProjectCwd({
      workspaceDir,
      userId: 1,
      projectId: 42,
    })
    const cloudProject = resolveMovScriptProjectCwd({
      workspaceDir,
      realm: { kind: 'cloud', id: 'cloud_a' },
      userId: 1,
      projectId: 42,
    })

    assert.equal(localProject, join(workspaceDir, 'realms', 'local', 'user', '1', 'projects', 'project_42'))
    assert.equal(cloudProject, join(workspaceDir, 'realms', 'cloud', 'cloud_a', 'user', '1', 'projects', 'project_42'))
    assert.notEqual(localProject, cloudProject)

    writeMovScriptBackendConfig(workspaceDir, {
      baseURL: 'https://cloud.example',
      realm: { kind: 'cloud', id: 'cloud_a' },
      activeUserId: 1,
    })
    writeMovScriptBackendAuth(workspaceDir, {
      realm: { kind: 'local', id: 'local' },
      token: 'local-token',
      user: { id: 1, username: 'admin' },
    })
    writeMovScriptBackendAuth(workspaceDir, {
      realm: { kind: 'cloud', id: 'cloud_a' },
      token: 'cloud-token',
      user: { id: 1, username: 'admin' },
    })

    assert.equal(resolveMovScriptBackendPaths(workspaceDir, { kind: 'local', id: 'local' }).authPath, join(workspaceDir, 'backend', 'realms', 'local', 'auth.json'))
    assert.equal(resolveMovScriptBackendPaths(workspaceDir, { kind: 'cloud', id: 'cloud_a' }).authPath, join(workspaceDir, 'backend', 'realms', 'cloud', 'cloud_a', 'auth.json'))
    assert.equal(readMovScriptBackendAuth(workspaceDir, { kind: 'local', id: 'local' })?.token, 'local-token')
    assert.equal(readMovScriptBackendAuth(workspaceDir, { kind: 'cloud', id: 'cloud_a' })?.token, 'cloud-token')
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('core workspace context forwards project cwd as provider session cwd', () => {
  const paths = resolveMovScriptWorkspaceContextPaths({
    workspaceDir: '/tmp/movscript-root',
    userId: 'alice',
    projectId: 'trailer',
  })

  assert.equal(paths.scope, 'project')
  assert.equal(paths.projectCwd, '/tmp/movscript-root/realms/local/user/alice/projects/project_trailer')
  assert.equal(paths.providerSessionCwd, paths.projectCwd)
  assert.equal(paths.contextKey, 'local/local/user/alice/project/trailer')
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
    assert.equal(existsSync(rootPaths.binDir), true)
    assert.equal(existsSync(contextPaths.projectCwd), true)
    assert.equal(rootPaths.controlDir, rootPaths.rootDir)
    assert.equal(existsSync(join(rootPaths.controlDir, '.interpret')), false)
    assert.equal(existsSync(join(rootPaths.workspaceDir, 'scripts')), false)
    assert.equal(existsSync(join(rootPaths.workspaceDir, 'productions')), false)
    assert.equal(existsSync(join(rootPaths.workspaceDir, 'content_units')), false)
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('core workspace runtime paths resolve desktop binaries under .movscript/bin', () => {
  const paths = resolveMovScriptWorkspaceRuntimePaths({
    workspaceDir: '/tmp/movscript-root',
    platform: 'darwin',
  })

  assert.equal(paths.binDir, '/tmp/movscript-root/bin')
  assert.equal(paths.configTomlPath, '/tmp/movscript-root/config.toml')
  assert.equal(paths.movscriptServerPath, '/tmp/movscript-root/bin/movscript-server')
  assert.equal(paths.movcliPath, '/tmp/movscript-root/bin/movcli')
  assert.equal(paths.movcliShimPath, '/tmp/movscript-root/bin/movcli.mjs')
  assert.equal(movScriptRuntimeBinaryName('movscript-server', 'win32'), 'movscript-server.exe')
})

test('core workspace runtime preflight reports missing fatal dependencies', () => {
  const workspaceDir = '/tmp/missing-runtime-workspace'
  const preflight = movScriptRuntimePreflight({
    workspaceDir,
    platform: 'darwin',
    exists: () => false,
  })

  assert.equal(preflight.ok, false)
  assert.equal(preflight.fatalCount, preflight.checks.length)
  assert.deepEqual(preflight.checks.map((check) => check.id), [
    'workspace.homeDir',
    'workspace.configToml',
    'workspace.binDir',
    'runtime.movscriptServer',
    'runtime.movcli',
    'runtime.movcliShim',
  ])
})

test('core workspace runtime preflight accepts prepared workspace binaries', () => {
  const workspaceDir = '/tmp/prepared-runtime-workspace'
  const paths = resolveMovScriptWorkspaceRuntimePaths({ workspaceDir, platform: 'darwin' })
  const directories = new Set([paths.controlDir, paths.binDir])
  const files = new Set([paths.configTomlPath, paths.movscriptServerPath, paths.movcliPath, paths.movcliShimPath])
  const preflight = movScriptRuntimePreflight({
    workspaceDir,
    platform: 'darwin',
    exists: (path) => directories.has(path) || files.has(path),
    statFile: (path) => ({
      isDirectory: () => directories.has(path),
      isFile: () => files.has(path),
    }),
    canExecute: (path) => path !== paths.movcliShimPath,
  })

  assert.equal(preflight.ok, true)
  assert.equal(preflight.fatalCount, 0)
})

test('core MovScript home config lives at MOVSCRIPT_HOME/config.toml', async () => {
  const homeDir = await mkdtemp(join(tmpdir(), 'movscript-home-config-'))
  const previousHome = process.env.MOVSCRIPT_HOME
  try {
    process.env.MOVSCRIPT_HOME = homeDir
    assert.equal(resolveMovScriptHomeDir(), homeDir)
    assert.equal(resolveMovScriptHomeConfigPaths().configPath, join(homeDir, 'config.toml'))

    const config = ensureMovScriptHomeConfig(join(homeDir, 'config.toml'))
    assert.deepEqual(config, defaultMovScriptHomeConfig())

    writeMovScriptHomeConfig(join(homeDir, 'config.toml'), {
      schema: 'movscript.config.v1',
      startup: { backendPolicy: 'external', agentPolicy: 'prewarm' },
      backend: { baseURL: 'http://127.0.0.1:8766' },
      paths: { binDir: 'bin', dataDir: 'data' },
    })
    assert.deepEqual(readMovScriptHomeConfig(join(homeDir, 'config.toml')), {
      schema: 'movscript.config.v1',
      startup: { backendPolicy: 'external', agentPolicy: 'prewarm' },
      backend: { baseURL: 'http://127.0.0.1:8766' },
      paths: { binDir: 'bin', dataDir: 'data' },
    })
  } finally {
    if (previousHome === undefined) delete process.env.MOVSCRIPT_HOME
    else process.env.MOVSCRIPT_HOME = previousHome
    await rm(homeDir, { recursive: true, force: true })
  }
})
