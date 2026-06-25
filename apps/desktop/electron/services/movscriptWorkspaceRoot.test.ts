import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  ensureMovScriptWorkspace,
  ensureMovScriptWorkspaceRoot,
  fallbackUserMovScriptWorkspaceDir,
  MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA,
  readMovScriptWorkspaceConfig,
  readMovScriptWorkspaceRootManifest,
  resolveMovScriptLangCwd,
  resolveMovScriptWorkspaceContextPaths,
  resolveMovScriptWorkspacePaths,
  resolveMovScriptWorkspaceRootPaths,
  writeMovScriptWorkspaceConfig,
  writeMovScriptWorkspaceRootManifest,
} from '@movscript/workspace/home'
import {
  resolveDesktopDefaultMovScriptWorkspaceDir,
  setDesktopDefaultMovScriptWorkspaceDir,
} from './movscriptWorkspaceDefaults'
import { getMovScriptWorkspaceRoot } from './movscriptWorkspaceRoot'

test('workspace config initialization creates the MovScript workspace root manifest', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-workspace-root-'))
  const paths = resolveMovScriptWorkspacePaths(workspaceDir)

  ensureMovScriptWorkspace(paths)

  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  assert.equal(existsSync(root.manifestPath), true)
  assert.equal(existsSync(root.providersDir), true)
  assert.equal(existsSync(root.backendDir), true)
  assert.equal(existsSync(paths.configPath), true)
  assert.equal(paths.providerConfigsDir, root.providersDir)
  assert.equal(paths.configPath, join(root.realmsDir, 'local', 'providers', 'default', 'config.json'))

  const manifest = readMovScriptWorkspaceRootManifest(root.manifestPath)
  assert.equal(manifest?.schema, MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA)
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

test('project workspace context uses explicit projectDir as cwd', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-workspace-paths-'))
  const projectDir = join(workspaceDir, 'projects', 'demo')
  const project = resolveMovScriptWorkspaceContextPaths({ workspaceDir, scope: 'project', userId: 7, projectDir })

  assert.equal(project.projectCwd, projectDir)
  assert.doesNotMatch(project.projectCwd, /\/(?:\.codex|\.mova|agent)\//)
})

test('workspace context paths use local, user, and project cwd as provider session cwd', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-context-paths-'))
  const projectDir = join(workspaceDir, 'projects', 'demo')
  const user = resolveMovScriptWorkspaceContextPaths({ workspaceDir, scope: 'global', userId: 7 })
  const project = resolveMovScriptWorkspaceContextPaths({ workspaceDir, scope: 'project', userId: 7, projectDir })
  const production = resolveMovScriptWorkspaceContextPaths({ workspaceDir, scope: 'production', userId: 7, projectDir, productionId: 99 })

  assert.throws(() => resolveMovScriptWorkspaceContextPaths({ workspaceDir }), /requires userId or orgId/)
  assert.equal(user.providerSessionCwd, join(workspaceDir, 'realms', 'local', 'user', '7'))
  assert.equal(user.projectCwd, join(workspaceDir, 'realms', 'local', 'user', '7'))
  assert.equal(project.providerSessionCwd, projectDir)
  assert.equal(project.projectCwd, projectDir)
  assert.equal(production.providerSessionCwd, projectDir)
  assert.equal(production.projectCwd, projectDir)
})

test('project workspace context requires explicit projectDir', () => {
  assert.throws(
    () => resolveMovScriptWorkspaceContextPaths({
      workspaceDir: '/tmp/workspace',
      userId: 7,
      projectId: 42,
    }),
    /requires projectDir/,
  )
})

test('workspace root manifest is stored in the MovScript home directory', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-workspace-manifest-contract-'))
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  const manifest = ensureMovScriptWorkspaceRoot(root)
  const raw = JSON.parse(readFileSync(root.manifestPath, 'utf8'))

  assert.equal(raw.schema, MOVSCRIPT_WORKSPACE_MANIFEST_SCHEMA)
  assert.equal(raw.workspaceId, manifest.workspaceId)
  assert.deepEqual(raw.layout, {
    providerConfigRoot: 'providers',
  })
})

test('electron workspace root result names the MovScript home directory explicitly', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-home-result-'))
  const result = getMovScriptWorkspaceRoot({ workspaceDir })

  assert.equal(result.movScriptHomeDir, workspaceDir)
  assert.equal(result.workspaceDir, workspaceDir)
  assert.equal(result.controlDir, workspaceDir)
  assert.equal(result.rootDir, workspaceDir)
})

test('default user workspace is the .movscript home directory itself', () => {
  const fallback = fallbackUserMovScriptWorkspaceDir()
  assert.equal(fallback.split(/[\\/]/).at(-1), '.movscript')
  assert.equal(resolveMovScriptWorkspaceRootPaths(fallback).controlDir, fallback)
})

test('codex provider profile config is separate from the managed .codex runtime home', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-provider-codex-profile-'))
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  const paths = resolveMovScriptWorkspacePaths(workspaceDir, { configDirName: 'codex' })
  const aliasPaths = resolveMovScriptWorkspacePaths(workspaceDir, { configDirName: 'codex' })

  ensureMovScriptWorkspace(paths)

  assert.equal(aliasPaths.configPath, paths.configPath)
  assert.equal(paths.configPath, join(root.realmsDir, 'local', 'providers', 'codex', 'config.json'))
  assert.notEqual(paths.configDir, join(root.controlDir, '.codex'))
  assert.equal(existsSync(join(root.controlDir, '.codex', 'config.json')), false)
})

test('desktop MovScript workspace root can be configured from app settings', () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const previousHome = process.env.MOVSCRIPT_HOME
  const configuredRoot = mkdtempSync(join(tmpdir(), 'movscript-configured-root-'))
  const envRoot = mkdtempSync(join(tmpdir(), 'movscript-env-root-'))
  const homeRoot = mkdtempSync(join(tmpdir(), 'movscript-home-root-'))
  try {
    delete process.env.MOVSCRIPT_WORKSPACE_DIR
    delete process.env.MOVSCRIPT_HOME
    setDesktopDefaultMovScriptWorkspaceDir(configuredRoot)
    assert.equal(resolveDesktopDefaultMovScriptWorkspaceDir(), configuredRoot)

    process.env.MOVSCRIPT_WORKSPACE_DIR = envRoot
    assert.equal(resolveDesktopDefaultMovScriptWorkspaceDir(), configuredRoot)

    process.env.MOVSCRIPT_HOME = homeRoot
    assert.equal(resolveDesktopDefaultMovScriptWorkspaceDir(), configuredRoot)

    setDesktopDefaultMovScriptWorkspaceDir('')
    assert.equal(resolveDesktopDefaultMovScriptWorkspaceDir(), homeRoot)
  } finally {
    setDesktopDefaultMovScriptWorkspaceDir(undefined)
    if (previousHome === undefined) delete process.env.MOVSCRIPT_HOME
    else process.env.MOVSCRIPT_HOME = previousHome
    if (previousWorkspaceDir === undefined) delete process.env.MOVSCRIPT_WORKSPACE_DIR
    else process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
  }
})

test('workspace config stores the project movscript-lang cwd without inspecting language internals', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-lang-cwd-'))
  const paths = resolveMovScriptWorkspacePaths(workspaceDir)
  ensureMovScriptWorkspace(paths)

  writeMovScriptWorkspaceConfig(paths.configPath, {
    schema: 'movscript.workspace-config.v2',
    updatedAt: '2026-06-09T00:00:00.000Z',
    movscriptLang: { cwd: '../movscript-lang' },
  })

  const config = readMovScriptWorkspaceConfig(paths.configPath)
  assert.equal(config.movscriptLang?.cwd, '../movscript-lang')
  assert.equal(resolveMovScriptLangCwd(config, workspaceDir), join(workspaceDir, '../movscript-lang'))
})

test('workspace config stores Electron-managed agent catalog state', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-agent-catalog-'))
  const paths = resolveMovScriptWorkspacePaths(workspaceDir)
  ensureMovScriptWorkspace(paths)

  writeMovScriptWorkspaceConfig(paths.configPath, {
    schema: 'movscript.workspace-config.v2',
    updatedAt: '2026-06-09T00:00:00.000Z',
    agentCatalog: {
      activeConfigFileId: 'agent-default',
      configFiles: [{
        schema: 'movscript.agent.config_file.v1',
        id: 'agent-default',
        name: 'Default Agent',
        description: '',
        version: 1,
        enabledPackIds: ['core'],
        skillIds: ['read'],
        toolGrants: [{ name: 'shell', mode: 'read' }],
        limits: { maxSteps: 12 },
        approvalDefaults: { command: 'on_request' },
        metadata: { managed: true },
      }],
    },
  })

  const config = readMovScriptWorkspaceConfig(paths.configPath)
  assert.equal(config.agentCatalog?.activeConfigFileId, 'agent-default')
  assert.equal(config.agentCatalog?.configFiles?.[0]?.id, 'agent-default')
  assert.deepEqual(config.agentCatalog?.configFiles?.[0]?.toolGrants, [{ name: 'shell', mode: 'read' }])
})

test('workspace config stores Electron-managed agent selection state', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-agent-selection-'))
  const paths = resolveMovScriptWorkspacePaths(workspaceDir)
  ensureMovScriptWorkspace(paths)

  writeMovScriptWorkspaceConfig(paths.configPath, {
    schema: 'movscript.workspace-config.v2',
    updatedAt: '2026-06-09T00:00:00.000Z',
    agentSelection: {
      defaultProviderId: 'codex',
      newConversationProviderId: 'codex',
    },
  })

  const config = readMovScriptWorkspaceConfig(paths.configPath)
  assert.deepEqual(config.agentSelection, {
    defaultProviderId: 'codex',
    newConversationProviderId: 'codex',
  })
})
