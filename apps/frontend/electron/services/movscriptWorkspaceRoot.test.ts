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
  resolveMovScriptContentUnitWorkspacePaths,
  resolveMovScriptProductionWorkspacePaths,
  resolveMovScriptProjectWorkspacePaths,
  resolveMovScriptScriptWorkspacePaths,
  resolveMovScriptWorkspaceContextPaths,
  resolveMovScriptWorkspacePaths,
  resolveMovScriptWorkspaceRootPaths,
  writeMovScriptWorkspaceRootManifest,
} from '@movscript/core/workspace/node'
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
  assert.equal(existsSync(root.editDir), true)
  assert.equal(existsSync(root.buildCurrentDir), true)
  assert.equal(existsSync(root.buildIndexesDir), true)
  assert.equal(existsSync(root.buildReviewsDir), true)
  assert.equal(existsSync(root.buildManifestsDir), true)
  assert.equal(existsSync(root.providersDir), true)
  assert.equal(existsSync(paths.configPath), true)
  assert.equal(paths.providerConfigsDir, root.providersDir)
  assert.equal(paths.configPath, join(root.providersDir, 'default', 'config.json'))

  const manifest = readMovScriptWorkspaceRootManifest(root.manifestPath)
  assert.equal(manifest?.schema, MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA)
  assert.equal(manifest?.layout.editableRoot, 'edit')
  assert.equal(manifest?.layout.buildRoot, '.build')
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

test('project workspace paths keep business files in edit and build at the repo root', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-workspace-paths-'))
  const project = resolveMovScriptProjectWorkspacePaths({ workspaceDir, userId: 7, projectId: 42 })
  const script = resolveMovScriptScriptWorkspacePaths(project, 11)
  const production = resolveMovScriptProductionWorkspacePaths(project, 99)
  const contentUnits = resolveMovScriptContentUnitWorkspacePaths(production, {})
  const scopedContentUnit = resolveMovScriptContentUnitWorkspacePaths(production, { contentUnitId: 34 })

  assert.equal(project.projectFile, join(workspaceDir, 'project.json'))
  assert.equal(project.projectStandardsFile, join(workspaceDir, 'edit', 'standards', 'project_standards.json'))
  assert.equal(project.settingDir, join(workspaceDir, 'edit', 'setting'))
  assert.equal(project.assetsDir, join(workspaceDir, 'edit', 'assets'))
  assert.equal(script.scriptFile, join(workspaceDir, 'edit', 'scripts', 'script_11', 'script.md'))
  assert.equal(production.productionFile, join(workspaceDir, 'edit', 'productions', 'production_99', 'production.json'))
  assert.equal(contentUnits.contentUnitsDir, join(workspaceDir, 'edit', 'productions', 'production_99', 'content_units'))
  assert.equal(scopedContentUnit.contentUnitFile, join(workspaceDir, 'edit', 'productions', 'production_99', 'content_units', 'content_unit_34.json'))
  assert.doesNotMatch(project.projectFile, /\/\.movscript\/(?:\.codex|\.mova|agent)\//)
})

test('workspace context paths use the project repo as provider session cwd', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-context-paths-'))
  const global = resolveMovScriptWorkspaceContextPaths({ workspaceDir })
  const project = resolveMovScriptWorkspaceContextPaths({ workspaceDir, scope: 'project', userId: 7, projectId: 42 })
  const production = resolveMovScriptWorkspaceContextPaths({ workspaceDir, scope: 'production', userId: 7, projectId: 42, productionId: 99 })

  assert.equal(global.providerSessionCwd, workspaceDir)
  assert.equal(global.editableBaseDir, join(workspaceDir, 'edit'))
  assert.equal(project.providerSessionCwd, workspaceDir)
  assert.equal(project.editableBaseDir, join(workspaceDir, 'edit'))
  assert.equal(production.providerSessionCwd, workspaceDir)
  assert.equal(production.editableBaseDir, join(workspaceDir, 'edit', 'productions', 'production_99'))
  assert.throws(
    () => resolveMovScriptWorkspaceContextPaths({ workspaceDir, scope: 'production', userId: 7, projectId: 42 }),
    /requires productionId/,
  )
})

test('workspace context ids reject path traversal segments', () => {
  assert.throws(
    () => resolveMovScriptWorkspaceContextPaths({
      workspaceDir: '/tmp/workspace',
      scope: 'production',
      userId: 7,
      projectId: 42,
      productionId: '../99',
    }),
    /invalid MovScript workspace id segment/,
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
    editableRoot: 'edit',
    buildRoot: '.build',
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
