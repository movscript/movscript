import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  codexAppServerAccountMissingStatus,
  codexAppServerLaunchCanReuse,
  codexAppServerLaunchEnv,
  codexAppServerLaunchIdentity,
  codexAppServerPreflightFromDistribution,
  codexConfigStatusFromDistribution,
} from './codexAppServerLaunch'
import type { CodexConfigDistribution } from './codexConfigDistribution'

test('Codex app-server launch identity reuses only matching config and runtime inputs', () => {
  const distribution = codexDistributionFixture({ hash: 'hash-a' })
  const target = codexAppServerLaunchIdentity({
    executablePath: 'codex',
    codexHome: '/workspace/.movscript/.codex',
    workspaceDir: '/workspace',
    configDistribution: distribution,
  })

  assert.equal(codexAppServerLaunchCanReuse({
    executablePath: 'codex',
    codexHome: '/workspace/.movscript/.codex',
    workspaceDir: '/workspace',
    configDistribution: distribution,
  }, target), true)
  assert.equal(codexAppServerLaunchCanReuse({
    executablePath: 'codex',
    codexHome: '/workspace/.movscript/.codex',
    workspaceDir: '/workspace',
    configDistribution: codexDistributionFixture({ hash: 'hash-b' }),
  }, target), false)
  assert.equal(codexAppServerLaunchCanReuse({
    executablePath: '/usr/local/bin/codex',
    codexHome: '/workspace/.movscript/.codex',
    workspaceDir: '/workspace',
    configDistribution: distribution,
  }, target), false)
})

test('Codex app-server launch env uses MovScript distributed auth and CODEX_HOME', () => {
  const codexHome = mkdtempSync(join(tmpdir(), 'movscript-codex-launch-'))
  const authJsonPath = join(codexHome, 'auth.json')
  writeFileSync(authJsonPath, '{"OPENAI_API_KEY":"distributed-key"}\n')
  const distribution = codexDistributionFixture({
    codexHome,
    authJsonPath,
    apiKeyConfigured: true,
    accountConfigured: true,
    accountSource: 'movscript-agent-account',
  })

  const env = codexAppServerLaunchEnv({
    profileId: 'codex-movscript-home',
    configDistribution: distribution,
    inheritedEnv: {
      OPENAI_API_KEY: 'external-key',
      OTHER_ENV: 'kept',
    },
  })

  assert.equal(env.CODEX_HOME, codexHome)
  assert.equal(env.OPENAI_API_KEY, 'distributed-key')
  assert.equal(env.OTHER_ENV, 'kept')
  assert.equal(env.MOVSCRIPT_CODEX_APP_SERVER_PROFILE_ID, 'codex-movscript-home')
  assert.equal(env.MOVSCRIPT_CODEX_CONFIG_SOURCE, distribution.sourceConfigPath)
})

test('Codex app-server launch returns a managed config status when account is missing', () => {
  const distribution = codexDistributionFixture({
    ok: false,
    apiKeyConfigured: false,
    accountConfigured: false,
    accountSource: 'none',
  })

  const status = codexAppServerAccountMissingStatus({
    profileId: 'codex-movscript-home',
    distribution,
  })

  assert.equal(status.ok, false)
  assert.equal(status.running, false)
  assert.equal(status.managed, true)
  assert.equal(status.profileId, 'codex-movscript-home')
  assert.match(status.error ?? '', /Codex 账号未配置/)
  assert.deepEqual(status.codexConfig, codexConfigStatusFromDistribution(distribution))
  assert.equal(status.preflight?.accountConfigured, false)
  assert.equal(status.preflight?.ok, false)
})

test('Codex app-server preflight verifies distributed config, auth, and spawn env', () => {
  const codexHome = mkdtempSync(join(tmpdir(), 'movscript-codex-preflight-'))
  const distribution = codexDistributionFixture({
    codexHome,
    configTomlPath: join(codexHome, 'config.toml'),
    authJsonPath: join(codexHome, 'auth.json'),
    apiKeyConfigured: true,
    accountConfigured: true,
    accountSource: 'movscript-agent-account',
  })
  writeFileSync(distribution.configTomlPath, 'model_provider = "movscript"\n')
  writeFileSync(distribution.authJsonPath, '{"OPENAI_API_KEY":"distributed-key"}\n')

  const preflight = codexAppServerPreflightFromDistribution(distribution)

  assert.equal(preflight.ok, true)
  assert.equal(preflight.configTomlExists, true)
  assert.equal(preflight.authJsonExists, true)
  assert.equal(preflight.spawnEnvReady, true)
  assert.equal(preflight.detail, 'Codex config preflight passed.')
})

test('Codex app-server preflight fails when API key auth file is missing', () => {
  const codexHome = mkdtempSync(join(tmpdir(), 'movscript-codex-preflight-missing-auth-'))
  const distribution = codexDistributionFixture({
    codexHome,
    configTomlPath: join(codexHome, 'config.toml'),
    authJsonPath: join(codexHome, 'auth.json'),
    apiKeyConfigured: true,
    accountConfigured: true,
    accountSource: 'movscript-agent-account',
  })
  writeFileSync(distribution.configTomlPath, 'model_provider = "movscript"\n')

  const preflight = codexAppServerPreflightFromDistribution(distribution)

  assert.equal(preflight.ok, false)
  assert.equal(preflight.configTomlExists, true)
  assert.equal(preflight.authJsonExists, false)
  assert.equal(preflight.spawnEnvReady, false)
  assert.equal(preflight.detail, 'Codex auth.json has not been distributed.')
})

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
    hash: 'hash-a',
    ...patch,
  }
}
