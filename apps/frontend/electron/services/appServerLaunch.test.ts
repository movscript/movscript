import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  appServerAccountMissingStatus,
  appServerLaunchCanReuse,
  appServerLaunchEnv,
  appServerLaunchIdentity,
  appServerPreflightFromDistribution,
  appServerConfigStatusFromDistribution,
} from './appServerLaunch'
import type { AppServerConfigDistribution } from './appServerConfigDistribution'

test('app-server launch identity reuses only matching config and runtime inputs', () => {
  const distribution = appServerDistributionFixture({ hash: 'hash-a' })
  const target = appServerLaunchIdentity({
    executablePath: 'mova',
    home: '/workspace/.movscript/.mova',
    workspaceDir: '/workspace',
    providerSessionCwd: '/workspace',
    configDistribution: distribution,
  })

  assert.equal(appServerLaunchCanReuse({
    executablePath: 'mova',
    home: '/workspace/.movscript/.mova',
    workspaceDir: '/workspace',
    providerSessionCwd: '/workspace',
    configDistribution: distribution,
  }, target), true)
  assert.equal(appServerLaunchCanReuse({
    executablePath: 'mova',
    home: '/workspace/.movscript/.mova',
    workspaceDir: '/workspace',
    providerSessionCwd: '/workspace',
    configDistribution: appServerDistributionFixture({ hash: 'hash-b' }),
  }, target), false)
  assert.equal(appServerLaunchCanReuse({
    executablePath: '/usr/local/bin/mova',
    home: '/workspace/.movscript/.mova',
    workspaceDir: '/workspace',
    providerSessionCwd: '/workspace',
    configDistribution: distribution,
  }, target), false)
})

test('app-server launch env uses MovScript distributed auth and provider home', () => {
  const movaHome = mkdtempSync(join(tmpdir(), 'movscript-mova-launch-'))
  const authJsonPath = join(movaHome, 'auth.json')
  writeFileSync(authJsonPath, '{"OPENAI_API_KEY":"distributed-key"}\n')
  const distribution = appServerDistributionFixture({
    home: movaHome,
    authJsonPath,
    apiKeyConfigured: true,
    accountConfigured: true,
    accountSource: 'movscript-account',
  })

  const env = appServerLaunchEnv({
    profileId: 'mova-movscript-home',
    configDistribution: distribution,
    inheritedEnv: {
      OPENAI_API_KEY: 'external-key',
      OTHER_ENV: 'kept',
    },
  })

  assert.equal(env.MOVSCRIPT_APP_SERVER_HOME, movaHome)
  assert.equal(env.MOVA_HOME, movaHome)
  assert.equal(env.CODEX_HOME, movaHome)
  assert.equal(env.OPENAI_API_KEY, 'distributed-key')
  assert.equal(env.OTHER_ENV, 'kept')
  assert.equal(env.RUST_LOG, 'info')
  assert.equal(env.MOVSCRIPT_APP_SERVER_PROFILE_ID, 'mova-movscript-home')
  assert.equal(env.MOVSCRIPT_APP_SERVER_CONFIG_SOURCE, distribution.sourceConfigPath)
  assert.equal('MOVSCRIPT_CODEX_CONFIG_SOURCE' in env, false)
})

test('app-server launch env preserves explicit RUST_LOG override', () => {
  const env = appServerLaunchEnv({
    profileId: 'mova-movscript-home',
    configDistribution: appServerDistributionFixture(),
    inheritedEnv: {
      RUST_LOG: 'warn,codex_app_server=trace',
    },
  })

  assert.equal(env.RUST_LOG, 'warn,codex_app_server=trace')
})

test('app-server launch returns a managed config status when account is missing', () => {
  const distribution = appServerDistributionFixture({
    ok: false,
    apiKeyConfigured: false,
    accountConfigured: false,
    accountSource: 'none',
  })

  const status = appServerAccountMissingStatus({
    profileId: 'mova-movscript-home',
    distribution,
  })

  assert.equal(status.ok, false)
  assert.equal(status.running, false)
  assert.equal(status.managed, true)
  assert.equal(status.profileId, 'mova-movscript-home')
  assert.match(status.error ?? '', /app-server 账号未配置/)
  assert.deepEqual(status.config, appServerConfigStatusFromDistribution(distribution))
  assert.equal(status.preflight?.accountConfigured, false)
  assert.equal(status.preflight?.ok, false)
})

test('app-server preflight verifies distributed config, auth, and spawn env', () => {
  const movaHome = mkdtempSync(join(tmpdir(), 'movscript-mova-preflight-'))
  const distribution = appServerDistributionFixture({
    home: movaHome,
    configTomlPath: join(movaHome, 'config.toml'),
    authJsonPath: join(movaHome, 'auth.json'),
    apiKeyConfigured: true,
    accountConfigured: true,
    accountSource: 'movscript-account',
  })
  writeFileSync(distribution.configTomlPath, 'model_provider = "movscript"\n')
  writeFileSync(distribution.authJsonPath, '{"OPENAI_API_KEY":"distributed-key"}\n')

  const preflight = appServerPreflightFromDistribution(distribution)

  assert.equal(preflight.ok, true)
  assert.equal(preflight.configTomlExists, true)
  assert.equal(preflight.authJsonExists, true)
  assert.equal(preflight.spawnEnvReady, true)
  assert.equal(preflight.detail, 'app-server config preflight passed.')
})

test('app-server preflight fails when API key auth file is missing', () => {
  const movaHome = mkdtempSync(join(tmpdir(), 'movscript-mova-preflight-missing-auth-'))
  const distribution = appServerDistributionFixture({
    home: movaHome,
    configTomlPath: join(movaHome, 'config.toml'),
    authJsonPath: join(movaHome, 'auth.json'),
    apiKeyConfigured: true,
    accountConfigured: true,
    accountSource: 'movscript-account',
  })
  writeFileSync(distribution.configTomlPath, 'model_provider = "movscript"\n')

  const preflight = appServerPreflightFromDistribution(distribution)

  assert.equal(preflight.ok, false)
  assert.equal(preflight.configTomlExists, true)
  assert.equal(preflight.authJsonExists, false)
  assert.equal(preflight.spawnEnvReady, false)
  assert.equal(preflight.detail, 'app-server auth.json has not been distributed.')
})

function appServerDistributionFixture(patch: Partial<AppServerConfigDistribution> = {}): AppServerConfigDistribution {
  return {
    ok: true,
    providerKey: 'mova',
    sourceConfigPath: '/workspace/.movscript/providers/mova/config.json',
    home: '/workspace/.movscript/.mova',
    configTomlPath: '/workspace/.movscript/.mova/config.toml',
    authJsonPath: '/workspace/.movscript/.mova/auth.json',
    homeEnvNames: ['MOVA_HOME', 'CODEX_HOME'],
    baseURL: 'https://api.openai.com/v1',
    apiKind: 'openai_responses',
    apiKeyConfigured: false,
    accountConfigured: true,
    accountSource: 'managed-home',
    distributedAt: '2026-06-04T00:00:00.000Z',
    hash: 'hash-a',
    ...patch,
  }
}
