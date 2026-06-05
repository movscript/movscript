import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { ChildProcess } from 'node:child_process'
import { resolveAgentWorkspaceRuntimePaths, writeAgentWorkspaceConfig } from '@movscript/agent-runtime'
import { CodexAppServerManager } from './codexAppServerManager'
import { distributeCodexConfigFromMovScriptWorkspace } from './codexConfigDistribution'
import type { CodexConfigDistribution } from './codexConfigDistribution'
import type { CodexBundledPluginBootstrap } from './codexBundledPluginBootstrap'

test('Codex app-server manager coalesces concurrent ensure calls for the same launch identity', async () => {
  let reserveCount = 0
  let spawnCount = 0
  const manager = new CodexAppServerManager({
    distributeConfig: () => codexDistributionFixture(),
    ensureBundledPlugin: () => codexPluginFixture(),
    reservePort: async () => {
      reserveCount += 1
      return 41234
    },
    waitReady: async () => undefined,
    spawnProcess: ((command: string, args: string[]) => {
      spawnCount += 1
      assert.equal(command, 'codex')
      assert.deepEqual(args, ['app-server', '--listen', 'ws://127.0.0.1:41234'])
      return fakeChildProcess()
    }) as never,
    defaultWorkspaceDir: () => '/workspace',
  })

  const [first, second] = await Promise.all([
    manager.ensure({ profile: { id: 'codex-movscript-home' } }),
    manager.ensure({ profile: { id: 'codex-movscript-home' } }),
  ])

  assert.equal(reserveCount, 1)
  assert.equal(spawnCount, 1)
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(first.endpoint, 'ws://127.0.0.1:41234')
  assert.equal(second.endpoint, 'ws://127.0.0.1:41234')
})

test('Codex app-server manager includes bundled plugin bootstrap in launch reuse identity', async () => {
  let pluginHash = 'plugin-a'
  const children: FakeChildProcess[] = []
  const manager = new CodexAppServerManager({
    distributeConfig: () => codexDistributionFixture(),
    ensureBundledPlugin: () => codexPluginFixture({ hash: pluginHash }),
    reservePort: async () => 41234 + children.length,
    waitReady: async () => undefined,
    spawnProcess: (() => {
      const child = fakeChildProcess()
      children.push(child)
      return child
    }) as never,
    defaultWorkspaceDir: () => '/workspace',
  })

  await manager.ensure({ profile: { id: 'codex-movscript-home' } })
  pluginHash = 'plugin-b'
  await manager.ensure({ profile: { id: 'codex-movscript-home' } })

  assert.equal(children.length, 2)
  assert.equal(children[0].killed, true)
  assert.equal(manager.status('codex-movscript-home').codexPlugin?.hash, 'plugin-b')
})

test('Codex app-server manager reuses running app-server across timestamp-only config redistribution', async () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-codex-manager-stable-hash-'))
  const codexHome = join(workspaceDir, '.movscript', '.codex')
  const paths = resolveAgentWorkspaceRuntimePaths(workspaceDir)
  writeAgentWorkspaceConfig(paths.configPath, {
    schema: 'movscript.agent.workspace-config.v1',
    updatedAt: '2026-06-04T00:00:00.000Z',
    agents: {
      codex: {
        auth: {
          mode: 'apiKey',
          apiKey: 'sk-test-key',
        },
      },
    },
  })
  let now = new Date('2026-06-04T01:02:03.000Z')
  let spawnCount = 0
  const manager = new CodexAppServerManager({
    distributeConfig: (input) => distributeCodexConfigFromMovScriptWorkspace({ ...input, now }),
    ensureBundledPlugin: () => codexPluginFixture({ hash: 'plugin-stable' }),
    reservePort: async () => 41234,
    waitReady: async () => undefined,
    spawnProcess: (() => {
      spawnCount += 1
      return fakeChildProcess()
    }) as never,
    defaultWorkspaceDir: () => workspaceDir,
  })

  const first = await manager.ensure({ profile: { id: 'codex-movscript-home', codexHome: '.movscript/.codex' } })
  now = new Date('2026-06-04T01:02:04.000Z')
  const second = await manager.ensure({ profile: { id: 'codex-movscript-home', codexHome: '.movscript/.codex' } })

  assert.equal(first.endpoint, 'ws://127.0.0.1:41234')
  assert.equal(second.endpoint, 'ws://127.0.0.1:41234')
  assert.equal(spawnCount, 1)
})

test('Codex app-server manager clears exited app-server endpoints and cools down quick restarts', async () => {
  const children: FakeChildProcess[] = []
  let now = 1_000
  const manager = new CodexAppServerManager({
    distributeConfig: () => codexDistributionFixture(),
    ensureBundledPlugin: () => codexPluginFixture(),
    reservePort: async () => 41234 + children.length,
    waitReady: async () => undefined,
    spawnProcess: (() => {
      const child = fakeChildProcess()
      children.push(child)
      return child
    }) as never,
    defaultWorkspaceDir: () => '/workspace',
    now: () => now,
  })

  const first = await manager.ensure({ profile: { id: 'codex-movscript-home' } })
  now = 1_500
  children[0].exitCode = 0
  children[0].emit('exit', 0, null)
  const stopped = manager.status('codex-movscript-home')
  const cooledDown = await manager.ensure({ profile: { id: 'codex-movscript-home' } })
  assert.equal(children.length, 1)
  now = 10_000
  const second = await manager.ensure({ profile: { id: 'codex-movscript-home' } })

  assert.equal(first.endpoint, 'ws://127.0.0.1:41234')
  assert.equal(stopped.running, false)
  assert.equal(stopped.endpoint, undefined)
  assert.match(stopped.error ?? '', /restart cooldown/)
  assert.equal(cooledDown.running, false)
  assert.equal(cooledDown.endpoint, undefined)
  assert.equal(children.length, 2)
  assert.equal(second.endpoint, 'ws://127.0.0.1:41235')
})

type FakeChildProcess = ChildProcess & {
  killed: boolean
  exitCode: number | null
}

function fakeChildProcess(): FakeChildProcess {
  const child = new EventEmitter() as FakeChildProcess
  Object.defineProperty(child, 'pid', {
    value: 12345,
    configurable: true,
  })
  child.exitCode = null
  child.killed = false
  child.stdout = new EventEmitter() as never
  child.stderr = new EventEmitter() as never
  child.kill = (() => {
    child.killed = true
    return true
  }) as never
  return child
}

function codexDistributionFixture(patch: Partial<CodexConfigDistribution> = {}): CodexConfigDistribution {
  return {
    ok: true,
    sourceConfigPath: '/workspace/.movscript/agent/config.json',
    codexHome: '/workspace/.movscript/.codex',
    configTomlPath: '/workspace/.movscript/.codex/config.toml',
    authJsonPath: '/workspace/.movscript/.codex/auth.json',
    baseURL: 'https://api.openai.com/v1',
    apiKind: 'openai_responses',
    apiKeyConfigured: false,
    accountConfigured: true,
    accountSource: 'codex-home',
    distributedAt: '2026-06-04T00:00:00.000Z',
    hash: 'config-a',
    ...patch,
  }
}

function codexPluginFixture(patch: Partial<CodexBundledPluginBootstrap> = {}): CodexBundledPluginBootstrap {
  return {
    ok: true,
    marketplaceName: 'movscript-bundled',
    pluginName: 'movscript',
    pluginKey: 'movscript@movscript-bundled',
    pluginSourcePath: '/workspace/plugins/movscript',
    marketplaceRoot: '/workspace/.movscript/.codex/.tmp/marketplaces/movscript-bundled',
    installedPluginRoot: '/workspace/.movscript/.codex/plugins/cache/movscript-bundled/movscript/0.1.0',
    version: '0.1.0',
    hash: 'plugin-a',
    ...patch,
  }
}
