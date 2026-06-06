import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  ensureMovScriptWorkspace,
  ensureMovScriptWorkspaceRoot,
  fallbackUserMovScriptWorkspaceDir,
  MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA,
  readMovScriptWorkspaceRootManifest,
  resolveMovScriptWorkspaceContextPaths,
  resolveMovScriptContentUnitProjectionPaths,
  resolveMovScriptProductionProjectionPaths,
  resolveMovScriptProjectProjectionPaths,
  resolveMovScriptScriptProjectionPaths,
  resolveMovScriptWorkspacePaths,
  resolveMovScriptWorkspaceRootPaths,
  writeMovScriptWorkspaceRootManifest,
} from '@movscript/workspaces/node'
import {
  resolveDesktopDefaultMovScriptWorkspaceDir,
  setDesktopDefaultMovScriptWorkspaceDir,
} from './movscriptWorkspaceDefaults'

test('workspace config initialization creates the MovScript workspace root manifest', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-workspace-root-'))
  const paths = resolveMovScriptWorkspacePaths(workspaceDir)

  ensureMovScriptWorkspace(paths)

  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  assert.equal(existsSync(root.manifestPath), true)
  assert.equal(existsSync(root.projectionRootDir), true)
  assert.equal(existsSync(root.reviewsDir), true)
  assert.equal(existsSync(root.syncDir), true)
  assert.equal(existsSync(root.providersDir), true)
  assert.equal(existsSync(paths.configPath), true)
  assert.equal(paths.providerConfigsDir, root.providersDir)
  assert.equal(paths.configPath, join(root.providersDir, 'default', 'config.json'))

  const manifest = readMovScriptWorkspaceRootManifest(root.manifestPath)
  assert.equal(manifest?.schema, MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA)
  assert.equal(manifest?.layout.projectionRoot, 'data')
  assert.equal(manifest?.layout.providerConfigRoot, 'providers')
})

test('workspace root initialization preserves an existing manifest identity', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-workspace-root-existing-'))
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)

  ensureMovScriptWorkspaceRoot(root)
  const first = readMovScriptWorkspaceRootManifest(root.manifestPath)
  assert.ok(first?.workspaceId)

  writeMovScriptWorkspaceRootManifest(root.manifestPath, {
    ...first!,
    backend: { kind: 'local', baseURL: 'http://localhost:8766' },
    activeUserId: 7,
  })

  const second = ensureMovScriptWorkspaceRoot(root)
  assert.equal(second.workspaceId, first?.workspaceId)
  assert.equal(second.backend?.baseURL, 'http://localhost:8766')
  assert.equal(second.activeUserId, 7)
})

test('project projection paths separate business files from workspace config homes', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-projection-paths-'))
  const project = resolveMovScriptProjectProjectionPaths({ workspaceDir, userId: 7, projectId: 42 })
  const script = resolveMovScriptScriptProjectionPaths(project, 11)
  const production = resolveMovScriptProductionProjectionPaths(project, 99)
  const sceneContentUnits = resolveMovScriptContentUnitProjectionPaths(production, { sceneMomentId: 12 })
  const scopedContentUnit = resolveMovScriptContentUnitProjectionPaths(production, { sceneMomentId: 12, contentUnitId: 34 })

  assert.equal(project.projectFile, join(workspaceDir, '.movscript', 'data', 'users', '7', 'projects', '42', 'project.json'))
  assert.equal(project.projectStandardsWorkspaceFile, join(workspaceDir, '.movscript', 'data', 'users', '7', 'projects', '42', 'standards', 'project_standards.workspace.json'))
  assert.equal(project.settingWorkspaceFile, join(workspaceDir, '.movscript', 'data', 'users', '7', 'projects', '42', 'settings', 'setting.workspace.json'))
  assert.equal(project.assetWorkspaceFile, join(workspaceDir, '.movscript', 'data', 'users', '7', 'projects', '42', 'assets', 'asset.workspace.json'))
  assert.equal(script.scriptFile, join(workspaceDir, '.movscript', 'data', 'users', '7', 'projects', '42', 'scripts', '11', 'script.md'))
  assert.equal(script.versionsDir, join(workspaceDir, '.movscript', 'data', 'users', '7', 'projects', '42', 'scripts', '11', 'versions'))
  assert.equal(production.productionWorkspaceFile, join(workspaceDir, '.movscript', 'data', 'users', '7', 'projects', '42', 'productions', '99', 'production.workspace.json'))
  assert.equal(sceneContentUnits.contentUnitWorkspaceFile, join(workspaceDir, '.movscript', 'data', 'users', '7', 'projects', '42', 'productions', '99', 'scene_moments', '12', 'content_units', 'content_units.workspace.json'))
  assert.equal(scopedContentUnit.contentUnitWorkspaceFile, join(workspaceDir, '.movscript', 'data', 'users', '7', 'projects', '42', 'productions', '99', 'scene_moments', '12', 'content_units', '34', 'content_unit.workspace.json'))
  assert.doesNotMatch(project.projectFile, /\/\.movscript\/(?:\.codex|\.mova|agent)\//)
})

test('workspace context paths use projection directories as provider session cwd', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-context-paths-'))
  const global = resolveMovScriptWorkspaceContextPaths({ workspaceDir })
  const project = resolveMovScriptWorkspaceContextPaths({ workspaceDir, scope: 'project', userId: 7, projectId: 42 })
  const production = resolveMovScriptWorkspaceContextPaths({ workspaceDir, scope: 'production', userId: 7, projectId: 42, productionId: 99 })

  assert.equal(global.providerSessionCwd, join(workspaceDir, '.movscript', 'data', 'users', 'local'))
  assert.equal(global.projectionBaseDir, join(workspaceDir, '.movscript', 'data', 'users', 'local'))
  assert.equal(project.providerSessionCwd, join(workspaceDir, '.movscript', 'data', 'users', '7', 'projects', '42'))
  assert.equal(project.projectionBaseDir, join(workspaceDir, '.movscript', 'data', 'users', '7', 'projects', '42'))
  assert.equal(production.providerSessionCwd, join(workspaceDir, '.movscript', 'data', 'users', '7', 'projects', '42', 'productions', '99'))
  assert.equal(production.projectionBaseDir, join(workspaceDir, '.movscript', 'data', 'users', '7', 'projects', '42', 'productions', '99'))
  assert.throws(
    () => resolveMovScriptWorkspaceContextPaths({ workspaceDir, scope: 'production', userId: 7, projectId: 42 }),
    /requires productionId/,
  )
})

test('project projection ids reject path traversal segments', () => {
  assert.throws(
    () => resolveMovScriptProjectProjectionPaths({ workspaceDir: '/tmp/workspace', userId: '../7', projectId: 42 }),
    /invalid MovScript workspace projection id segment/,
  )
})

test('workspace root manifest is stored as the top-level .movscript contract', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-workspace-manifest-contract-'))
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  const manifest = ensureMovScriptWorkspaceRoot(root)
  const raw = JSON.parse(readFileSync(root.manifestPath, 'utf8'))

  assert.equal(raw.schema, MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA)
  assert.equal(raw.workspaceId, manifest.workspaceId)
  assert.deepEqual(raw.layout, {
    projectionRoot: 'data',
    reviewsRoot: 'reviews',
    syncRoot: 'sync',
    providerConfigRoot: 'providers',
  })
})

test('default user workspace is a workspace root, not the .movscript control dir itself', () => {
  const fallback = fallbackUserMovScriptWorkspaceDir()
  assert.notEqual(fallback.split(/[\\/]/).at(-1), '.movscript')
  assert.equal(resolveMovScriptWorkspaceRootPaths(fallback).controlDir, join(fallback, '.movscript'))
})

test('provider profile config migrates from legacy top-level control dirs into provider config homes', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-workspace-profile-migration-'))
  const paths = resolveMovScriptWorkspacePaths(workspaceDir, { configDirName: '.codex' })
  mkdirSync(paths.legacyConfigDir, { recursive: true })
  writeFileSync(paths.legacyConfigPath, JSON.stringify({
    schema: 'movscript.workspace-config.v1',
    updatedAt: '2026-06-04T00:00:00.000Z',
    providers: {
      codex: {
        auth: { mode: ['local', 'Codex'].join('') },
      },
    },
  }, null, 2), 'utf8')

  ensureMovScriptWorkspace(paths)

  assert.equal(paths.configPath, join(workspaceDir, '.movscript', 'providers', '.codex', 'config.json'))
  assert.equal(existsSync(paths.configPath), true)
  assert.equal(existsSync(paths.legacyConfigPath), true)
  const migrated = JSON.parse(readFileSync(paths.configPath, 'utf8'))
  assert.equal(migrated.schema, 'movscript.workspace-config.v2')
  assert.equal(migrated.providers.codex.auth.mode, ['local', 'Codex'].join(''))
})

test('codex provider profile config is separate from the managed .codex runtime home', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-provider-codex-profile-'))
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  const paths = resolveMovScriptWorkspacePaths(workspaceDir, { configDirName: 'codex' })
  const aliasPaths = resolveMovScriptWorkspacePaths(workspaceDir, { configDirName: 'codex' })

  ensureMovScriptWorkspace(paths)

  assert.equal(aliasPaths.configPath, paths.configPath)
  assert.equal(paths.configPath, join(root.providersDir, 'codex', 'config.json'))
  assert.notEqual(paths.configDir, join(root.controlDir, '.codex'))
  assert.equal(existsSync(join(root.controlDir, '.codex', 'config.json')), false)
})

test('desktop MovScript workspace root can be configured from app settings', () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const configuredRoot = mkdtempSync(join(tmpdir(), 'movscript-configured-root-'))
  const envRoot = mkdtempSync(join(tmpdir(), 'movscript-env-root-'))
  try {
    delete process.env.MOVSCRIPT_WORKSPACE_DIR
    setDesktopDefaultMovScriptWorkspaceDir(configuredRoot)
    assert.equal(resolveDesktopDefaultMovScriptWorkspaceDir(), configuredRoot)

    process.env.MOVSCRIPT_WORKSPACE_DIR = envRoot
    assert.equal(resolveDesktopDefaultMovScriptWorkspaceDir(), envRoot)

    setDesktopDefaultMovScriptWorkspaceDir('')
  } finally {
    setDesktopDefaultMovScriptWorkspaceDir(undefined)
    if (previousWorkspaceDir === undefined) delete process.env.MOVSCRIPT_WORKSPACE_DIR
    else process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
  }
})
