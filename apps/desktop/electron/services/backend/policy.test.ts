import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { getBackendLaunchPolicy } from './policy'

const POLICY_ENV_NAMES = [
  'MOVSCRIPT_BACKEND_LAUNCH_POLICY',
  'MOVSCRIPT_BACKEND_POLICY',
  'MOVSCRIPT_LOCAL_BACKEND_POLICY',
] as const

test('backend launch policy defaults to config-driven local spawn', () => {
  const previousPolicyEnv = snapshotPolicyEnv()
  const previousNodeEnv = process.env.NODE_ENV
  const previousHome = process.env.MOVSCRIPT_HOME
  try {
    clearPolicyEnv()
    delete process.env.MOVSCRIPT_HOME
    process.env.NODE_ENV = 'development'
    assert.equal(getBackendLaunchPolicy(), 'spawn')
  } finally {
    restorePolicyEnv(previousPolicyEnv)
    restoreEnv('MOVSCRIPT_HOME', previousHome)
    restoreEnv('NODE_ENV', previousNodeEnv)
  }
})

test('backend launch policy reads MOVSCRIPT_HOME config.toml', () => {
  const previousPolicyEnv = snapshotPolicyEnv()
  const previousHome = process.env.MOVSCRIPT_HOME
  const home = mkdtempSync(join(tmpdir(), 'movscript-policy-home-'))
  try {
    clearPolicyEnv()
    process.env.MOVSCRIPT_HOME = home
    writeFileSync(join(home, 'config.toml'), 'schema = "movscript.config.v1"\n\n[startup]\nbackend_policy = "external"\n')
    assert.equal(getBackendLaunchPolicy(), 'external')
  } finally {
    restorePolicyEnv(previousPolicyEnv)
    restoreEnv('MOVSCRIPT_HOME', previousHome)
    rmSync(home, { recursive: true, force: true })
  }
})

test('backend launch policy reads explicit workspace config.toml', () => {
  const previousPolicyEnv = snapshotPolicyEnv()
  const previousHome = process.env.MOVSCRIPT_HOME
  const home = mkdtempSync(join(tmpdir(), 'movscript-policy-workspace-'))
  try {
    clearPolicyEnv()
    delete process.env.MOVSCRIPT_HOME
    writeFileSync(join(home, 'config.toml'), 'schema = "movscript.config.v1"\n\n[startup]\nbackend_policy = "external"\n')
    assert.equal(getBackendLaunchPolicy({ workspaceDir: home }), 'external')
  } finally {
    restorePolicyEnv(previousPolicyEnv)
    restoreEnv('MOVSCRIPT_HOME', previousHome)
    rmSync(home, { recursive: true, force: true })
  }
})

test('backend launch policy keeps explicit overrides', () => {
  const previousPolicyEnv = snapshotPolicyEnv()
  const previousHome = process.env.MOVSCRIPT_HOME
  try {
    clearPolicyEnv()
    delete process.env.MOVSCRIPT_HOME
    process.env.MOVSCRIPT_BACKEND_POLICY = 'cloud'
    assert.equal(getBackendLaunchPolicy(), 'cloud')
    process.env.MOVSCRIPT_BACKEND_POLICY = 'spawn'
    assert.equal(getBackendLaunchPolicy(), 'spawn')
  } finally {
    restorePolicyEnv(previousPolicyEnv)
    restoreEnv('MOVSCRIPT_HOME', previousHome)
  }
})

function snapshotPolicyEnv(): Record<typeof POLICY_ENV_NAMES[number], string | undefined> {
  return Object.fromEntries(POLICY_ENV_NAMES.map((name) => [name, process.env[name]])) as Record<typeof POLICY_ENV_NAMES[number], string | undefined>
}

function clearPolicyEnv(): void {
  for (const name of POLICY_ENV_NAMES) delete process.env[name]
}

function restorePolicyEnv(snapshot: Record<typeof POLICY_ENV_NAMES[number], string | undefined>): void {
  for (const name of POLICY_ENV_NAMES) restoreEnv(name, snapshot[name])
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}
