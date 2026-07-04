import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { getBackendLaunchPolicy } from './policy'

test('backend launch policy defaults to config-driven local spawn', () => {
  const previousPolicy = process.env.MOVSCRIPT_BACKEND_POLICY
  const previousNodeEnv = process.env.NODE_ENV
  const previousHome = process.env.MOVSCRIPT_HOME
  try {
    delete process.env.MOVSCRIPT_BACKEND_POLICY
    delete process.env.MOVSCRIPT_HOME
    process.env.NODE_ENV = 'development'
    assert.equal(getBackendLaunchPolicy(), 'spawn')
  } finally {
    restoreEnv('MOVSCRIPT_BACKEND_POLICY', previousPolicy)
    restoreEnv('MOVSCRIPT_HOME', previousHome)
    restoreEnv('NODE_ENV', previousNodeEnv)
  }
})

test('backend launch policy reads MOVSCRIPT_HOME config.toml', () => {
  const previousPolicy = process.env.MOVSCRIPT_BACKEND_POLICY
  const previousHome = process.env.MOVSCRIPT_HOME
  const home = mkdtempSync(join(tmpdir(), 'movscript-policy-home-'))
  try {
    delete process.env.MOVSCRIPT_BACKEND_POLICY
    process.env.MOVSCRIPT_HOME = home
    writeFileSync(join(home, 'config.toml'), 'schema = "movscript.config.v1"\n\n[startup]\nbackend_policy = "external"\n')
    assert.equal(getBackendLaunchPolicy(), 'external')
  } finally {
    restoreEnv('MOVSCRIPT_BACKEND_POLICY', previousPolicy)
    restoreEnv('MOVSCRIPT_HOME', previousHome)
    rmSync(home, { recursive: true, force: true })
  }
})

test('backend launch policy reads explicit workspace config.toml', () => {
  const previousPolicy = process.env.MOVSCRIPT_BACKEND_POLICY
  const previousHome = process.env.MOVSCRIPT_HOME
  const home = mkdtempSync(join(tmpdir(), 'movscript-policy-workspace-'))
  try {
    delete process.env.MOVSCRIPT_BACKEND_POLICY
    delete process.env.MOVSCRIPT_HOME
    writeFileSync(join(home, 'config.toml'), 'schema = "movscript.config.v1"\n\n[startup]\nbackend_policy = "external"\n')
    assert.equal(getBackendLaunchPolicy({ workspaceDir: home }), 'external')
  } finally {
    restoreEnv('MOVSCRIPT_BACKEND_POLICY', previousPolicy)
    restoreEnv('MOVSCRIPT_HOME', previousHome)
    rmSync(home, { recursive: true, force: true })
  }
})

test('backend launch policy keeps explicit overrides', () => {
  const previousPolicy = process.env.MOVSCRIPT_BACKEND_POLICY
  const previousHome = process.env.MOVSCRIPT_HOME
  try {
    delete process.env.MOVSCRIPT_HOME
    process.env.MOVSCRIPT_BACKEND_POLICY = 'cloud'
    assert.equal(getBackendLaunchPolicy(), 'cloud')
    process.env.MOVSCRIPT_BACKEND_POLICY = 'spawn'
    assert.equal(getBackendLaunchPolicy(), 'spawn')
  } finally {
    restoreEnv('MOVSCRIPT_BACKEND_POLICY', previousPolicy)
    restoreEnv('MOVSCRIPT_HOME', previousHome)
  }
})

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}
