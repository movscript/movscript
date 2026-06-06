import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { ChildProcess } from 'node:child_process'
import { MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA, resolveMovScriptWorkspacePaths, writeMovScriptWorkspaceConfig } from '@movscript/workspaces/node'
import { AppServerManager, resolveAppServerExecutablePath, resolveAppServerExecutableResolution } from './appServerManager'
import { distributeAppServerConfigFromMovScriptWorkspace } from './appServerConfigDistribution'
import type { AppServerConfigDistribution } from './appServerConfigDistribution'
import type { AppServerPluginBootstrap } from './appServerPluginBootstrap'
import type { ElectronAppServerProfile } from '../../src/shared/contracts/electronApi'

test('app-server manager coalesces concurrent ensure calls for the same launch identity', async () => {
  const workspaceDir = fakeWorkspaceDir()
  let reserveCount = 0
  let spawnCount = 0
  const manager = new AppServerManager({
    distributeConfig: appServerDistributionForLaunch,
    ensurePlugin: () => appServerPluginFixture(),
    reservePort: async () => {
      reserveCount += 1
      return 41234
    },
    waitReady: async () => undefined,
    spawnProcess: ((command: string, args: string[]) => {
      spawnCount += 1
      assert.equal(command, 'mova')
      assert.deepEqual(args, ['app-server', '--listen', 'ws://127.0.0.1:41234'])
      return fakeChildProcess()
    }) as never,
    defaultWorkspaceDir: () => workspaceDir,
  })

  const [first, second] = await Promise.all([
    manager.ensure({ profile: { id: 'mova-movscript-home', providerKey: 'mova', executablePath: 'mova' } }),
    manager.ensure({ profile: { id: 'mova-movscript-home', providerKey: 'mova', executablePath: 'mova' } }),
  ])

  assert.equal(reserveCount, 1)
  assert.equal(spawnCount, 1)
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(first.endpoint, 'ws://127.0.0.1:41234')
  assert.equal(second.endpoint, 'ws://127.0.0.1:41234')
})

test('app-server manager exposes managed stdio endpoints without reserving a local port', async () => {
  const workspaceDir = fakeWorkspaceDir()
  const child = fakeChildProcess()
  let reserveCount = 0
  let spawnCommand = ''
  let spawnArgs: string[] = []
  let spawnStdio: unknown
  const manager = new AppServerManager({
    distributeConfig: () => movaDistributionFixture(),
    ensurePlugin: () => appServerPluginFixture(),
    reservePort: async () => {
      reserveCount += 1
      return 41234
    },
    waitReady: async () => {
      throw new Error('websocket readiness should not run for stdio')
    },
    spawnProcess: ((command: string, args: string[], options: { stdio?: unknown }) => {
      spawnCommand = command
      spawnArgs = args
      spawnStdio = options.stdio
      return child
    }) as never,
    defaultWorkspaceDir: () => workspaceDir,
    launchTransport: () => 'stdio',
  })

  const status = await manager.ensure({
    profile: {
      id: 'mova-movscript-home',
      providerKey: 'mova',
      executablePath: '/opt/mova/mova-app-server',
      home: '.movscript/.mova',
    },
  })
  const messages: string[] = []
  const relay = manager.openManagedRelaySocket(status.endpoint ?? '')
  relay.onMessage((message) => messages.push(message))
  ;(child.stdout as EventEmitter).emit('data', '{"id":1,"result":{}}\n{"id":2')
  ;(child.stdout as EventEmitter).emit('data', ',"result":{}}\n')
  relay.send('{"id":3,"method":"ping"}')
  relay.close()

  assert.equal(reserveCount, 0)
  assert.equal(spawnCommand, '/opt/mova/mova-app-server')
  assert.deepEqual(spawnArgs, ['--listen', 'stdio://'])
  assert.deepEqual(spawnStdio, ['pipe', 'pipe', 'pipe'])
  assert.equal(status.endpoint, 'managed:///mova-movscript-home')
  assert.deepEqual(messages, ['{"id":1,"result":{}}', '{"id":2,"result":{}}'])
  assert.deepEqual(child.stdinWrites, ['{"id":3,"method":"ping"}\n'])
})

test('app-server manager includes plugin bootstrap in launch reuse identity', async () => {
  const workspaceDir = fakeWorkspaceDir()
  let pluginHash = 'plugin-a'
  const children: FakeChildProcess[] = []
  const manager = new AppServerManager({
    distributeConfig: appServerDistributionForLaunch,
    ensurePlugin: () => appServerPluginFixture({ hash: pluginHash }),
    reservePort: async () => 41234 + children.length,
    waitReady: async () => undefined,
    spawnProcess: (() => {
      const child = fakeChildProcess()
      children.push(child)
      return child
    }) as never,
    defaultWorkspaceDir: () => workspaceDir,
  })

  await manager.ensure({ profile: { id: 'mova-movscript-home', providerKey: 'mova', executablePath: 'mova' } })
  pluginHash = 'plugin-b'
  await manager.ensure({ profile: { id: 'mova-movscript-home', providerKey: 'mova', executablePath: 'mova' } })

  assert.equal(children.length, 2)
  assert.equal(children[0].killed, true)
  assert.equal(manager.status('mova-movscript-home').plugin?.hash, 'plugin-b')
})

test('app-server manager reuses running app-server across timestamp-only config redistribution', async () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-mova-manager-stable-hash-'))
  const paths = resolveMovScriptWorkspacePaths(workspaceDir)
  writeMovScriptWorkspaceConfig(paths.configPath, {
    schema: MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA,
    updatedAt: '2026-06-04T00:00:00.000Z',
    providers: {
      mova: {
        auth: {
          mode: 'apiKey',
          apiKey: 'sk-test-key',
        },
      },
    },
  })
  let now = new Date('2026-06-04T01:02:03.000Z')
  let spawnCount = 0
  const manager = new AppServerManager({
    distributeConfig: (input) => distributeAppServerConfigFromMovScriptWorkspace({ ...input, now }),
    ensurePlugin: () => appServerPluginFixture({ hash: 'plugin-stable' }),
    reservePort: async () => 41234,
    waitReady: async () => undefined,
    spawnProcess: (() => {
      spawnCount += 1
      return fakeChildProcess()
    }) as never,
    defaultWorkspaceDir: () => workspaceDir,
  })

  const first = await manager.ensure({ profile: { id: 'mova-movscript-home', providerKey: 'mova', executablePath: 'mova', home: '.movscript/.mova' } })
  now = new Date('2026-06-04T01:02:04.000Z')
  const second = await manager.ensure({ profile: { id: 'mova-movscript-home', providerKey: 'mova', executablePath: 'mova', home: '.movscript/.mova' } })

  assert.equal(first.endpoint, 'ws://127.0.0.1:41234')
  assert.equal(second.endpoint, 'ws://127.0.0.1:41234')
  assert.equal(spawnCount, 1)
})

test('app-server manager records running provider sessions under the provider profile key', async () => {
  const workspaceDir = fakeWorkspaceDir()
  const records: Array<Record<string, unknown>> = []
  const manager = new AppServerManager({
    distributeConfig: appServerDistributionForLaunch,
    ensurePlugin: () => appServerPluginFixture(),
    reservePort: async () => 41234,
    waitReady: async () => undefined,
    spawnProcess: (() => fakeChildProcess()) as never,
    defaultWorkspaceDir: () => workspaceDir,
    now: () => Date.parse('2026-06-05T01:02:03.000Z'),
    recordProviderSession: ((input: Record<string, unknown>) => {
      records.push(input)
      return input
    }) as never,
  })

  await manager.ensure({ profile: { id: 'mova-movscript-home', providerKey: 'mova', executablePath: 'mova', label: 'Mova' } })

  assert.equal(records.length, 1)
  assert.equal(records[0]?.providerProfileId, 'mova-movscript-home')
  assert.equal(records[0]?.providerProfileKey, 'mova')
  assert.equal(records[0]?.providerKey, 'mova')
  assert.equal(records[0]?.status, 'running')
  assert.equal(records[0]?.workspaceDir, workspaceDir)
  assert.deepEqual(records[0]?.workspaceContext, { scope: 'global', userId: 'local' })
  assert.equal(records[0]?.providerSessionCwd, join(workspaceDir, '.movscript', 'data', 'users', 'local'))
})

test('app-server manager keeps multiple profiles for one provider key isolated by profile id', async () => {
  const workspaceDir = fakeWorkspaceDir()
  const records: Array<Record<string, unknown>> = []
  let reserveCount = 0
  const manager = new AppServerManager({
    distributeConfig: (input) => appServerDistributionFixture({
      providerKey: input.providerKey,
      home: input.home,
    }),
    ensurePlugin: () => appServerPluginFixture(),
    reservePort: async () => {
      reserveCount += 1
      return 41234 + reserveCount
    },
    waitReady: async () => undefined,
    spawnProcess: (() => fakeChildProcess()) as never,
    defaultWorkspaceDir: () => workspaceDir,
    recordProviderSession: ((input: Record<string, unknown>) => {
      records.push(input)
      return input
    }) as never,
  })

  const primary = await manager.ensure({
    profile: {
      id: 'mova-primary-home',
      providerKey: 'mova',
      label: 'Mova Primary',
      executablePath: 'mova',
      home: '.movscript/.mova',
    },
  })
  const sandbox = await manager.ensure({
    profile: {
      id: 'mova-sandbox-home',
      providerKey: 'mova',
      label: 'Mova Sandbox',
      executablePath: 'mova',
      home: '.movscript/.mova-sandbox',
    },
  })

  assert.equal(primary.ok, true)
  assert.equal(sandbox.ok, true)
  assert.notEqual(primary.endpoint, sandbox.endpoint)
  assert.equal(manager.status('mova-primary-home').profileId, 'mova-primary-home')
  assert.equal(manager.status('mova-sandbox-home').profileId, 'mova-sandbox-home')
  assert.deepEqual(records.map((record) => record.providerProfileId), ['mova-primary-home', 'mova-sandbox-home'])
  assert.deepEqual(records.map((record) => record.providerProfileKey), ['mova', 'mova'])
  assert.deepEqual(records.map((record) => record.providerKey), ['mova', 'mova'])
})

test('app-server manager defaults an unbranded profile to Mova', async () => {
  const workspaceDir = fakeWorkspaceDir()
  const records: Array<Record<string, unknown>> = []
  const manager = new AppServerManager({
    distributeConfig: (input) => {
      assert.equal(input.providerKey, 'mova')
      assert.equal(input.home, join(workspaceDir, '.movscript', '.mova'))
      return movaDistributionFixture({ home: input.home })
    },
    ensurePlugin: () => appServerPluginFixture(),
    reservePort: async () => 41234,
    waitReady: async () => undefined,
    spawnProcess: ((command: string, args: string[]) => {
      assert.equal(command, '/opt/mova/mova-app-server')
      assert.deepEqual(args, ['--listen', 'ws://127.0.0.1:41234'])
      return fakeChildProcess()
    }) as never,
    defaultWorkspaceDir: () => workspaceDir,
    recordProviderSession: ((input: Record<string, unknown>) => {
      records.push(input)
      return input
    }) as never,
  })

  const status = await manager.ensure({
    profile: {
      id: 'app-server-default',
      label: 'Default app-server',
      executablePath: '/opt/mova/mova-app-server',
    },
  })

  assert.equal(status.ok, true)
  assert.equal(status.home, join(workspaceDir, '.movscript', '.mova'))
  assert.equal(records[0]?.providerProfileKey, 'mova')
  assert.equal(records[0]?.providerKey, 'mova')
})

test('app-server manager accepts custom provider keys without Codex or Mova binding', async () => {
  const workspaceDir = fakeWorkspaceDir()
  const records: Array<Record<string, unknown>> = []
  const manager = new AppServerManager({
    distributeConfig: (input) => {
      assert.equal(input.providerKey, 'claude')
      assert.equal(input.home, join(workspaceDir, '.movscript', '.claude'))
      return appServerDistributionFixture({
        providerKey: 'claude',
        sourceConfigPath: '/workspace/.movscript/providers/claude/config.json',
        home: input.home,
        configTomlPath: join(input.home, 'config.toml'),
        authJsonPath: join(input.home, 'auth.json'),
      })
    },
    ensurePlugin: () => appServerPluginFixture(),
    reservePort: async () => 41235,
    waitReady: async () => undefined,
    spawnProcess: ((command: string, args: string[]) => {
      assert.equal(command, 'claude')
      assert.deepEqual(args, ['app-server', '--listen', 'ws://127.0.0.1:41235'])
      return fakeChildProcess()
    }) as never,
    defaultWorkspaceDir: () => workspaceDir,
    recordProviderSession: ((input: Record<string, unknown>) => {
      records.push(input)
      return input
    }) as never,
  })

  const status = await manager.ensure({
    profile: {
      id: 'claude-movscript-home',
      label: 'Claude',
      providerKey: 'claude',
    },
  })

  assert.equal(status.ok, true)
  assert.equal(status.home, join(workspaceDir, '.movscript', '.claude'))
  assert.equal(records[0]?.providerProfileKey, 'claude')
  assert.equal(records[0]?.providerKey, 'claude')
})

test('app-server manager infers custom provider keys from managed profile ids', async () => {
  const workspaceDir = fakeWorkspaceDir()
  const records: Array<Record<string, unknown>> = []
  const manager = new AppServerManager({
    distributeConfig: (input) => {
      assert.equal(input.providerKey, 'claude')
      assert.equal(input.home, join(workspaceDir, '.movscript', '.claude'))
      return appServerDistributionFixture({
        providerKey: 'claude',
        sourceConfigPath: '/workspace/.movscript/providers/claude/config.json',
        home: input.home,
        configTomlPath: join(input.home, 'config.toml'),
        authJsonPath: join(input.home, 'auth.json'),
      })
    },
    ensurePlugin: () => appServerPluginFixture(),
    reservePort: async () => 41236,
    waitReady: async () => undefined,
    spawnProcess: ((command: string, args: string[]) => {
      assert.equal(command, 'claude')
      assert.deepEqual(args, ['app-server', '--listen', 'ws://127.0.0.1:41236'])
      return fakeChildProcess()
    }) as never,
    defaultWorkspaceDir: () => workspaceDir,
    recordProviderSession: ((input: Record<string, unknown>) => {
      records.push(input)
      return input
    }) as never,
  })

  const status = await manager.ensure({
    profile: {
      id: 'claude-movscript-home',
      label: 'Claude',
    },
  })

  assert.equal(status.ok, true)
  assert.equal(status.home, join(workspaceDir, '.movscript', '.claude'))
  assert.equal(records[0]?.providerProfileKey, 'claude')
  assert.equal(records[0]?.providerKey, 'claude')
})

test('app-server manager does not infer provider keys from arbitrary provider names in profile ids', async () => {
  const workspaceDir = fakeWorkspaceDir()
  const records: Array<Record<string, unknown>> = []
  const manager = new AppServerManager({
    distributeConfig: (input) => {
      assert.equal(input.providerKey, 'mova')
      assert.equal(input.home, join(workspaceDir, '.movscript', '.mova'))
      return movaDistributionFixture({ home: input.home })
    },
    ensurePlugin: () => appServerPluginFixture(),
    reservePort: async () => 41237,
    waitReady: async () => undefined,
    spawnProcess: ((command: string, args: string[]) => {
      assert.equal(command, 'mova')
      assert.deepEqual(args, ['app-server', '--listen', 'ws://127.0.0.1:41237'])
      return fakeChildProcess()
    }) as never,
    defaultWorkspaceDir: () => workspaceDir,
    recordProviderSession: ((input: Record<string, unknown>) => {
      records.push(input)
      return input
    }) as never,
  })

  const status = await manager.ensure({
    profile: {
      id: 'codex-compatible-debug',
      label: 'Compatibility Debug',
      executablePath: 'mova',
    },
  })

  assert.equal(status.ok, true)
  assert.equal(status.home, join(workspaceDir, '.movscript', '.mova'))
  assert.equal(records[0]?.providerProfileKey, 'mova')
  assert.equal(records[0]?.providerKey, 'mova')
})

test('app-server manager launches with a project-scoped MovScript projection cwd', async () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-mova-project-cwd-'))
  let spawnCwd = ''
  const manager = new AppServerManager({
    distributeConfig: () => appServerDistributionFixture({
      providerKey: 'mova',
      home: join(workspaceDir, '.movscript', '.mova'),
    }),
    ensurePlugin: () => appServerPluginFixture(),
    reservePort: async () => 41234,
    waitReady: async () => undefined,
    spawnProcess: ((_command: string, _args: string[], options: { cwd?: string }) => {
      spawnCwd = options.cwd ?? ''
      return fakeChildProcess()
    }) as never,
    defaultWorkspaceDir: () => workspaceDir,
  })

  const status = await manager.ensure({
    profile: {
      id: 'mova-movscript-home',
      providerKey: 'mova',
      executablePath: 'mova',
      workspaceContext: {
        scope: 'project',
        userId: 7,
        projectId: 42,
      },
    },
  })

  const expected = join(workspaceDir, '.movscript', 'data', 'users', '7', 'projects', '42')
  assert.equal(spawnCwd, expected)
  assert.equal(status.providerSessionCwd, expected)
  assert.deepEqual(status.workspaceContext, { scope: 'project', userId: '7', projectId: '42' })
})


test('app-server manager keeps explicit stops out of quick-restart cooldown', async () => {
  const workspaceDir = fakeWorkspaceDir()
  const records: Array<Record<string, unknown>> = []
  const child = fakeChildProcess()
  const manager = new AppServerManager({
    distributeConfig: appServerDistributionForLaunch,
    ensurePlugin: () => appServerPluginFixture(),
    reservePort: async () => 41234,
    waitReady: async () => undefined,
    spawnProcess: (() => child) as never,
    defaultWorkspaceDir: () => workspaceDir,
    now: () => Date.parse('2026-06-05T01:02:03.000Z'),
    recordProviderSession: ((input: Record<string, unknown>) => {
      records.push(input)
      return input
    }) as never,
  })

  await manager.ensure({ profile: { id: 'mova-movscript-home', providerKey: 'mova', executablePath: 'mova' } })
  const stopped = manager.stop('mova-movscript-home')
  child.exitCode = null
  child.emit('exit', null, 'SIGTERM')
  const status = manager.status('mova-movscript-home')

  assert.equal(stopped.running, false)
  assert.equal(status.error, 'app-server is not running')
  assert.deepEqual(records.map((item) => item.status), ['running', 'stopped', 'stopped'])
})

test('app-server protocol manager launches Mova with an isolated provider home', async () => {
  const previousNeutralBin = process.env.MOVSCRIPT_APP_SERVER_BIN
  const previousMovaBin = process.env.MOVSCRIPT_MOVA_BIN
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-mova-manager-'))
  const paths = resolveMovScriptWorkspacePaths(workspaceDir)
  try {
    process.env.MOVSCRIPT_APP_SERVER_BIN = '/opt/mova/mova-app-server'
    delete process.env.MOVSCRIPT_MOVA_BIN
    writeMovScriptWorkspaceConfig(paths.configPath, {
      schema: MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA,
      updatedAt: '2026-06-04T00:00:00.000Z',
      providers: {
        mova: {
          appServer: {
            compatibilityHomeEnvNames: ['CODEX_HOME'],
          },
          auth: {
            mode: 'apiKey',
            apiKey: 'sk-mova-key',
          },
        },
      },
    })
    let spawnCommand = ''
    let spawnArgs: string[] = []
    let spawnCwd = ''
    let spawnEnv: NodeJS.ProcessEnv = {}
    const manager = new AppServerManager({
      distributeConfig: (input) => distributeAppServerConfigFromMovScriptWorkspace({ ...input, now: new Date('2026-06-04T01:02:03.000Z') }),
      ensurePlugin: () => appServerPluginFixture({ hash: 'plugin-mova' }),
      reservePort: async () => 41234,
      waitReady: async () => undefined,
      spawnProcess: ((command: string, args: string[], options: { cwd?: string, env?: NodeJS.ProcessEnv }) => {
        spawnCommand = command
        spawnArgs = args
        spawnCwd = options.cwd ?? ''
        spawnEnv = options.env ?? {}
        return fakeChildProcess()
      }) as never,
      defaultWorkspaceDir: () => workspaceDir,
    })

    const status = await manager.ensure({
      profile: {
        id: 'mova-movscript-home',
        providerKey: 'mova',
      },
    })

    assert.equal(status.ok, true)
    assert.equal(spawnCommand, '/opt/mova/mova-app-server')
    assert.deepEqual(spawnArgs, ['--listen', 'ws://127.0.0.1:41234'])
    assert.equal(spawnCwd, join(workspaceDir, '.movscript', 'data', 'users', 'local'))
    assert.equal(spawnEnv.MOVSCRIPT_APP_SERVER_PROVIDER, 'mova')
    assert.equal(spawnEnv.MOVSCRIPT_APP_SERVER_HOME, join(workspaceDir, '.movscript', '.mova'))
    assert.equal(spawnEnv.MOVA_HOME, join(workspaceDir, '.movscript', '.mova'))
    assert.equal(spawnEnv.CODEX_HOME, join(workspaceDir, '.movscript', '.mova'))
    assert.equal(status.providerSessionCwd, join(workspaceDir, '.movscript', 'data', 'users', 'local'))
    assert.equal(status.home, join(workspaceDir, '.movscript', '.mova'))
    assert.equal(status.config?.accountConfigured, true)
  } finally {
    if (previousNeutralBin === undefined) delete process.env.MOVSCRIPT_APP_SERVER_BIN
    else process.env.MOVSCRIPT_APP_SERVER_BIN = previousNeutralBin
    if (previousMovaBin === undefined) delete process.env.MOVSCRIPT_MOVA_BIN
    else process.env.MOVSCRIPT_MOVA_BIN = previousMovaBin
  }
})

test('Mova app-server executable resolution prefers neutral explicit env override', () => {
  const resolved = resolveAppServerExecutablePath({
    provider: 'mova',
    profile: movaExecutableProfile(),
    env: {
      MOVSCRIPT_APP_SERVER_BIN: ' /opt/provider/app-server ',
      MOVSCRIPT_MOVA_APP_SERVER_BIN: ' /opt/mova/app-server ',
      MOVSCRIPT_MOVA_BIN: ' /opt/mova/mova-app-server ',
    } as NodeJS.ProcessEnv,
    exists: () => false,
  })

  assert.equal(resolved, '/opt/provider/app-server')
})

test('Mova app-server executable resolution falls back to provider app-server env override', () => {
  const resolved = resolveAppServerExecutablePath({
    provider: 'mova',
    profile: movaExecutableProfile(),
    env: {
      MOVSCRIPT_MOVA_APP_SERVER_BIN: ' /opt/mova/app-server ',
      MOVSCRIPT_MOVA_BIN: ' /opt/mova/mova-app-server ',
    } as NodeJS.ProcessEnv,
    exists: () => false,
  })

  assert.equal(resolved, '/opt/mova/app-server')
})

test('Mova app-server executable resolution keeps legacy debug env compatibility', () => {
  const resolved = resolveAppServerExecutablePath({
    provider: 'mova',
    profile: movaExecutableProfile(),
    env: { MOVSCRIPT_MOVA_BIN: ' /opt/mova/mova-app-server ' } as NodeJS.ProcessEnv,
    exists: () => false,
  })

  assert.equal(resolved, '/opt/mova/mova-app-server')
})

test('custom app-server executable resolution uses provider app-server env override', () => {
  const resolved = resolveAppServerExecutableResolution({
    provider: 'claude',
    env: { MOVSCRIPT_CLAUDE_APP_SERVER_BIN: ' /opt/claude/app-server ' } as NodeJS.ProcessEnv,
    exists: () => false,
  })

  assert.equal(resolved.found, true)
  assert.equal(resolved.executablePath, '/opt/claude/app-server')
  assert.equal(resolved.diagnostic?.envVar, 'MOVSCRIPT_CLAUDE_APP_SERVER_BIN')
})

test('Mova app-server executable resolution discovers sibling debug app-server before CLI fallback', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-mova-discovery-'))
  const cwd = join(root, 'movscript')
  const neutralAppServerCandidate = join(root, 'mova', 'codex-rs', 'target', 'debug', 'app-server')
  const appServerCandidate = join(root, 'mova', 'codex-rs', 'target', 'debug', 'mova-app-server')
  const transitionalAppServerCandidate = join(root, 'mova', 'codex-rs', 'target', 'debug', ['codex', 'app-server'].join('-'))
  const cliCandidate = join(root, 'mova', 'codex-rs', 'target', 'debug', 'codex')
  const sourceDir = join(root, 'movscript', 'apps', 'frontend', 'electron', 'services')

  const neutralAppServerResolved = resolveAppServerExecutablePath({
    provider: 'mova',
    profile: movaExecutableProfile(),
    cwd,
    sourceDir,
    env: {} as NodeJS.ProcessEnv,
    exists: (path) => path === neutralAppServerCandidate || path === appServerCandidate || path === cliCandidate,
  })
  const appServerResolved = resolveAppServerExecutablePath({
    provider: 'mova',
    profile: movaExecutableProfile(),
    cwd,
    sourceDir,
    env: {} as NodeJS.ProcessEnv,
    exists: (path) => path === appServerCandidate || path === cliCandidate,
  })
  const transitionalAppServerResolved = resolveAppServerExecutablePath({
    provider: 'mova',
    profile: movaExecutableProfile(),
    cwd,
    sourceDir,
    env: {} as NodeJS.ProcessEnv,
    exists: (path) => path === transitionalAppServerCandidate || path === cliCandidate,
  })
  const cliResolved = resolveAppServerExecutablePath({
    provider: 'mova',
    profile: movaExecutableProfile(),
    cwd,
    sourceDir,
    env: {} as NodeJS.ProcessEnv,
    exists: (path) => path === cliCandidate,
  })

  assert.equal(neutralAppServerResolved, neutralAppServerCandidate)
  assert.equal(appServerResolved, appServerCandidate)
  assert.equal(transitionalAppServerResolved, transitionalAppServerCandidate)
  assert.equal(cliResolved, cliCandidate)
})

test('Mova app-server executable resolution explains PATH fallback when discovery fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'movscript-mova-discovery-miss-'))
  const cwd = join(root, 'enterprise', 'apps', 'frontend')
  const sourceDir = join(root, 'enterprise', 'apps', 'frontend', 'out', 'main')

  const resolution = resolveAppServerExecutableResolution({
    provider: 'mova',
    profile: movaExecutableProfile(),
    cwd,
    sourceDir,
    env: {} as NodeJS.ProcessEnv,
    exists: () => false,
  })

  assert.equal(resolution.found, false)
  assert.equal(resolution.executablePath, 'mova')
  assert.equal(resolution.diagnostic?.ok, false)
  assert.equal(resolution.diagnostic?.envVar, 'MOVSCRIPT_APP_SERVER_BIN')
  assert.match(resolution.diagnostic?.message ?? '', /MOVSCRIPT_MOVA_APP_SERVER_BIN/)
  assert.match(resolution.diagnostic?.message ?? '', /MOVSCRIPT_MOVA_BIN/)
  assert.equal(resolution.diagnostic?.cwd, cwd)
  assert.equal(resolution.diagnostic?.sourceDir, sourceDir)
  assert.ok(resolution.diagnostic?.candidatePaths?.some((path: string) => path.endsWith('mova/codex-rs/target/debug/app-server')))
  assert.ok(resolution.diagnostic?.candidatePaths?.some((path: string) => path.endsWith(`mova/codex-rs/target/debug/${['codex', 'app-server'].join('-')}`)))
})

test('app-server manager preserves Mova spawn ENOENT diagnostics through readiness failure', async () => {
  const previousMovaBin = process.env.MOVSCRIPT_MOVA_BIN
  const workspaceDir = fakeWorkspaceDir()
  const child = fakeChildProcess()
  try {
    delete process.env.MOVSCRIPT_MOVA_BIN
    const manager = new AppServerManager({
      distributeConfig: () => movaDistributionFixture(),
      ensurePlugin: () => appServerPluginFixture(),
      reservePort: async () => 41234,
      waitReady: async () => {
        const error = Object.assign(new Error('spawn mova ENOENT'), { code: 'ENOENT', path: 'mova' })
        child.emit('error', error)
        throw new Error('readiness failed')
      },
      spawnProcess: (() => child) as never,
      defaultWorkspaceDir: () => workspaceDir,
    })

    const status = await manager.ensure({
      profile: {
        ...movaExecutableProfile(),
        id: 'mova-movscript-home',
        providerKey: 'mova',
        executablePath: 'mova',
        home: '.movscript/.mova',
      },
    })

    assert.equal(status.running, false)
    assert.match(status.error ?? '', /spawn mova ENOENT/)
    assert.match(status.error ?? '', /MOVSCRIPT_APP_SERVER_BIN/)
    assert.match(status.error ?? '', /MOVSCRIPT_MOVA_BIN/)
    assert.match(status.error ?? '', /readiness failed/)
    assert.equal(status.executableDiagnostic?.ok, false)
  } finally {
    if (previousMovaBin === undefined) delete process.env.MOVSCRIPT_MOVA_BIN
    else process.env.MOVSCRIPT_MOVA_BIN = previousMovaBin
  }
})

test('app-server manager clears exited app-server endpoints and cools down quick restarts', async () => {
  const workspaceDir = fakeWorkspaceDir()
  const children: FakeChildProcess[] = []
  let now = 1_000
  const manager = new AppServerManager({
    distributeConfig: appServerDistributionForLaunch,
    ensurePlugin: () => appServerPluginFixture(),
    reservePort: async () => 41234 + children.length,
    waitReady: async () => undefined,
    spawnProcess: (() => {
      const child = fakeChildProcess()
      children.push(child)
      return child
    }) as never,
    defaultWorkspaceDir: () => workspaceDir,
    now: () => now,
  })

  const first = await manager.ensure({ profile: { id: 'mova-movscript-home', providerKey: 'mova', executablePath: 'mova' } })
  now = 1_500
  children[0].exitCode = 0
  children[0].emit('exit', 0, null)
  const stopped = manager.status('mova-movscript-home')
  const cooledDown = await manager.ensure({ profile: { id: 'mova-movscript-home', providerKey: 'mova', executablePath: 'mova' } })
  assert.equal(children.length, 1)
  now = 10_000
  const second = await manager.ensure({ profile: { id: 'mova-movscript-home', providerKey: 'mova', executablePath: 'mova' } })

  assert.equal(first.endpoint, 'ws://127.0.0.1:41234')
  assert.equal(stopped.running, false)
  assert.equal(stopped.endpoint, undefined)
  assert.match(stopped.error ?? '', /restart cooldown/)
  assert.equal(cooledDown.running, false)
  assert.equal(cooledDown.endpoint, undefined)
  assert.equal(children.length, 2)
  assert.equal(second.endpoint, 'ws://127.0.0.1:41235')
})

test('app-server manager surfaces quick-exit stderr in restart cooldown status', async () => {
  const workspaceDir = fakeWorkspaceDir()
  const child = fakeChildProcess()
  let now = 1_000
  const manager = new AppServerManager({
    distributeConfig: () => movaDistributionFixture(),
    ensurePlugin: () => appServerPluginFixture(),
    reservePort: async () => 41234,
    waitReady: async () => {
      now = 1_100
      ;(child.stderr as EventEmitter).emit('data', 'Error: Operation not permitted (os error 1)\n')
      child.exitCode = 1
      child.emit('exit', 1, null)
      throw new Error('readiness failed')
    },
    spawnProcess: (() => child) as never,
    defaultWorkspaceDir: () => workspaceDir,
    now: () => now,
  })

  const status = await manager.ensure({
    profile: {
      id: 'mova-movscript-home',
      providerKey: 'mova',
      home: '.movscript/.mova',
    },
  })

  assert.equal(status.running, false)
  assert.match(status.error ?? '', /restart cooldown/)
  assert.match(status.error ?? '', /stderr: Error: Operation not permitted/)
})

type FakeChildProcess = ChildProcess & {
  killed: boolean
  exitCode: number | null
  stdinWrites: string[]
}

function fakeChildProcess(): FakeChildProcess {
  const child = new EventEmitter() as FakeChildProcess
  Object.defineProperty(child, 'pid', {
    value: 12345,
    configurable: true,
  })
  child.exitCode = null
  child.killed = false
  child.stdinWrites = []
  child.stdin = {
    write: (payload: string) => {
      child.stdinWrites.push(String(payload))
      return true
    },
  } as never
  child.stdout = new EventEmitter() as never
  child.stderr = new EventEmitter() as never
  child.kill = (() => {
    child.killed = true
    return true
  }) as never
  return child
}

function fakeWorkspaceDir(): string {
  return mkdtempSync(join(tmpdir(), 'movscript-app-server-manager-'))
}

function appServerDistributionFixture(patch: Partial<AppServerConfigDistribution> = {}): AppServerConfigDistribution {
  const providerKey = patch.providerKey ?? 'mova'
  const home = patch.home ?? `/workspace/.movscript/.${providerKey}`
  return {
    ok: true,
    providerKey,
    sourceConfigPath: patch.sourceConfigPath ?? `/workspace/.movscript/providers/${providerKey}/config.json`,
    home,
    configTomlPath: patch.configTomlPath ?? `${home}/config.toml`,
    authJsonPath: patch.authJsonPath ?? `${home}/auth.json`,
    homeEnvNames: patch.homeEnvNames ?? [`${providerKey.toUpperCase().replace(/-/g, '_')}_HOME`],
    baseURL: 'https://api.openai.com/v1',
    apiKind: 'openai_responses',
    apiKeyConfigured: false,
    accountConfigured: true,
    accountSource: 'managed-home',
    distributedAt: '2026-06-04T00:00:00.000Z',
    hash: 'config-a',
    ...patch,
  }
}

function appServerDistributionForLaunch(input: { providerKey?: string, home: string }): AppServerConfigDistribution {
  return appServerDistributionFixture({
    providerKey: input.providerKey ?? 'mova',
    home: input.home,
  })
}

function movaDistributionFixture(patch: Partial<AppServerConfigDistribution> = {}): AppServerConfigDistribution {
  return appServerDistributionFixture({
    providerKey: 'mova',
    ...patch,
  })
}

function movaExecutableProfile(patch: Partial<ElectronAppServerProfile> = {}): ElectronAppServerProfile {
  return {
    id: 'mova-movscript-home',
    label: 'MovScript Mova',
    providerKey: 'mova',
    executableCommand: 'mova',
    executableEnvVar: 'MOVSCRIPT_MOVA_APP_SERVER_BIN',
    compatibilityBinEnvNames: ['MOVSCRIPT_MOVA_BIN'],
    candidateRootRelativePaths: [
      '../mova/codex-rs/target/debug',
      '../../mova/codex-rs/target/debug',
      '../../../mova/codex-rs/target/debug',
    ],
    candidateBinaryNames: [
      'app-server',
      'mova-app-server',
      ['codex', 'app-server'].join('-'),
      'codex',
    ],
    pathFallbackReady: false,
    ...patch,
  }
}

function appServerPluginFixture(patch: Partial<AppServerPluginBootstrap> = {}): AppServerPluginBootstrap {
  return {
    ok: true,
    marketplaceName: 'movscript-bundled',
    pluginName: 'movscript',
    pluginKey: 'movscript@movscript-bundled',
    pluginSourcePath: '/workspace/plugins/movscript',
    marketplaceRoot: '/workspace/.movscript/.mova/.tmp/marketplaces/movscript-bundled',
    installedPluginRoot: '/workspace/.movscript/.mova/plugins/cache/movscript-bundled/movscript/0.1.0',
    version: '0.1.0',
    hash: 'plugin-a',
    ...patch,
  }
}
