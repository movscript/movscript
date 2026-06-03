import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  ensureAgentWorkspaceRuntime,
  releaseAgentSessionLockFile,
  resolveAgentWorkspaceRuntimePaths,
  writeAgentWorkspaceConfig,
} from '@movscript/agent-runtime'
import { loadAgentPluginCatalog } from '../../catalog/loading/core/loader.js'
import { buildAgentCatalogStartupReport, createAgentServerContext, getAgentServerCapabilities } from './agentServerContext.js'

const agentRootDir = fileURLToPath(new URL('../../..', import.meta.url))
const builtinCatalogDir = join(agentRootDir, 'catalog')

test('catalog startup report summarizes pack-enabled skills and tools', () => {
  const catalog = loadAgentPluginCatalog({
    builtinSkillsDir: join(builtinCatalogDir, 'skills'),
    builtinToolsDir: join(builtinCatalogDir, 'tools'),
    builtinPacksDir: join(builtinCatalogDir, 'packs'),
    builtinConfigFilesDir: join(builtinCatalogDir, 'config-files'),
  })
  const report = buildAgentCatalogStartupReport(catalog)

  assert.equal(report.configFileCount, 1)
  assert.ok(report.packCount >= 2)
  assert.ok(report.skillCount > 0)
  assert.ok(report.toolCount > 0)
  assert.ok(report.toolGrantCount > 0)
  assert.ok(report.enabledPackIds.includes('core.pack.agent'))
  assert.ok(report.enabledPackIds.includes('workspace.pack.lifecycle'))
  assert.ok(report.enabledPackIds.includes('movscript.pack.workspace'))
  assert.ok(report.enabledSkillCount > 0)
  assert.ok(report.enabledToolCount > 0)
  assert.equal(report.errorCount, 0)
  assert.equal(report.issueCount, report.errorCount + report.warningCount)
  assert.ok(report.configFiles.some((configFile) => configFile.id === 'movscript.config_file.base' && configFile.toolGrants > 0))
  const workspacePack = report.packs.find((pack) => pack.id === 'workspace.pack.lifecycle')
  assert.equal(workspacePack?.status, 'enabled')
  assert.ok(workspacePack?.filePath?.endsWith('catalog/packs/workspace.pack.json'))
  assert.deepEqual(workspacePack?.missingSkills, [])
  assert.deepEqual(workspacePack?.missingTools, [])
  assert.ok(workspacePack?.skillRoots.includes('workspace/lifecycle_support'))
  assert.ok(workspacePack?.toolRoots.includes('workspace'))
})

test('session runtime applies workspace config defaults for environment, tool providers, and catalog directories', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-agent-workspace-context-'))
  const previousEnv = {
    MOVSCRIPT_AGENT_WORKSPACE_DIR: process.env.MOVSCRIPT_AGENT_WORKSPACE_DIR,
    MOVSCRIPT_AGENT_SESSION_ID: process.env.MOVSCRIPT_AGENT_SESSION_ID,
    MOVSCRIPT_AGENT_TEST_WORKSPACE_ENV: process.env.MOVSCRIPT_AGENT_TEST_WORKSPACE_ENV,
    MOVSCRIPT_AGENT_TEST_EXISTING_ENV: process.env.MOVSCRIPT_AGENT_TEST_EXISTING_ENV,
  }
  try {
    const workspacePaths = resolveAgentWorkspaceRuntimePaths(workspaceDir)
    ensureAgentWorkspaceRuntime(workspacePaths)
    const workspaceConfigFilesDir = join(workspaceDir, 'agent-catalog', 'config-files')
    mkdirSync(workspaceConfigFilesDir, { recursive: true })
    writeJSONFile(join(workspaceConfigFilesDir, 'workspace.config-file.json'), {
      schema: 'movscript.agent.config_file.v1',
      id: 'workspace.config_file.custom',
      version: '1.0.0',
      name: 'Workspace Config File',
      enabledPackIds: [],
      skillIds: [],
      toolGrants: [],
    })
    writeAgentWorkspaceConfig(workspacePaths.configPath, {
      schema: 'movscript.agent.workspace-config.v1',
      updatedAt: new Date().toISOString(),
      catalog: {
        configFilesDir: 'agent-catalog/config-files',
      },
      environment: {
        MOVSCRIPT_AGENT_TEST_WORKSPACE_ENV: 'from-workspace',
        MOVSCRIPT_AGENT_TEST_EXISTING_ENV: 'from-workspace',
      },
      toolProviders: [
        {
          providerId: 'desktop-main',
          endpoint: 'http://127.0.0.1:18765/mcp/',
          label: 'Desktop main MCP',
        },
      ],
      modelConfig: {
        model: 'workspace-model',
        apiKind: 'openai_responses',
      },
    })

    process.env.MOVSCRIPT_AGENT_WORKSPACE_DIR = workspaceDir
    process.env.MOVSCRIPT_AGENT_SESSION_ID = 'session_workspace_config'
    process.env.MOVSCRIPT_AGENT_TEST_EXISTING_ENV = 'from-explicit-env'
    delete process.env.MOVSCRIPT_AGENT_TEST_WORKSPACE_ENV

    const context = createAgentServerContext()
    const providers = context.toolProviderRegistry.listProviders()

    assert.equal(context.sessionRuntime?.workspaceDir, workspaceDir)
    assert.equal(process.env.MOVSCRIPT_AGENT_TEST_WORKSPACE_ENV, 'from-workspace')
    assert.equal(process.env.MOVSCRIPT_AGENT_TEST_EXISTING_ENV, 'from-explicit-env')
    assert.ok(providers.some((provider) => (
      provider.providerId === 'desktop-main'
      && provider.endpoint === 'http://127.0.0.1:18765/mcp'
      && provider.label === 'Desktop main MCP'
    )))
    assert.equal(context.pluginCatalog.configFilesDir, workspaceConfigFilesDir)
    assert.ok(context.pluginCatalog.configFiles.some((configFile) => configFile.id === 'workspace.config_file.custom'))
    assert.ok(existsSync(context.sessionRuntime?.paths.modelConfigPath ?? ''), 'workspace model config should seed the session model config')
    assert.equal(context.modelConfigStore.getEffectiveConfig()?.model, 'workspace-model')
    assert.equal(context.paths.runtimeLogPath, context.sessionRuntime?.paths.runtimeLogPath)
    const sessionDateSlug = context.sessionRuntime?.paths.sessionDate.split(/[\\/]/).join('-')
    assert.ok(context.paths.runtimeLogPath.endsWith(`/rollout-${sessionDateSlug}-session_workspace_config.jsonl`))

    const capabilities = getAgentServerCapabilities(context)
    assert.equal(capabilities.paths.runtimeLogPath, context.paths.runtimeLogPath)
    assert.equal(capabilities.sessionRuntime?.runtimeLogPath, context.paths.runtimeLogPath)

    if (context.sessionRuntime) releaseAgentSessionLockFile(context.sessionRuntime.paths)
  } finally {
    restoreOptionalEnv('MOVSCRIPT_AGENT_WORKSPACE_DIR', previousEnv.MOVSCRIPT_AGENT_WORKSPACE_DIR)
    restoreOptionalEnv('MOVSCRIPT_AGENT_SESSION_ID', previousEnv.MOVSCRIPT_AGENT_SESSION_ID)
    restoreOptionalEnv('MOVSCRIPT_AGENT_TEST_WORKSPACE_ENV', previousEnv.MOVSCRIPT_AGENT_TEST_WORKSPACE_ENV)
    restoreOptionalEnv('MOVSCRIPT_AGENT_TEST_EXISTING_ENV', previousEnv.MOVSCRIPT_AGENT_TEST_EXISTING_ENV)
    rmSync(workspaceDir, { recursive: true, force: true })
  }
})

function restoreOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
}

function writeJSONFile(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
