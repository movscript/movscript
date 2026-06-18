import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { resolveMovScriptWorkspaceRootPaths } from '@movscript/core/workspace/node'
import { resolveLocalDataDir, resolveLocalSecret } from './backend/paths'

test('local backend data dir defaults inside the selected MovScript workspace', () => {
  const previous = process.env.MOVSCRIPT_DATA_DIR
  const movScriptHomeDir = mkdtempSync(join(tmpdir(), 'movscript-backend-data-home-'))
  try {
    delete process.env.MOVSCRIPT_DATA_DIR
    assert.equal(
      resolveLocalDataDir(movScriptHomeDir),
      join(resolveMovScriptWorkspaceRootPaths(movScriptHomeDir).backendDir, 'local-data'),
    )
  } finally {
    if (previous === undefined) delete process.env.MOVSCRIPT_DATA_DIR
    else process.env.MOVSCRIPT_DATA_DIR = previous
  }
})

test('local backend data dir keeps explicit MOVSCRIPT_DATA_DIR override', () => {
  const previous = process.env.MOVSCRIPT_DATA_DIR
  const movScriptHomeDir = mkdtempSync(join(tmpdir(), 'movscript-backend-data-home-'))
  try {
    process.env.MOVSCRIPT_DATA_DIR = '/tmp/custom-movscript-data'
    assert.equal(resolveLocalDataDir(movScriptHomeDir), '/tmp/custom-movscript-data')
  } finally {
    if (previous === undefined) delete process.env.MOVSCRIPT_DATA_DIR
    else process.env.MOVSCRIPT_DATA_DIR = previous
  }
})

test('local backend secret is persisted independently of data dir changes', () => {
  const previousDataDir = process.env.MOVSCRIPT_DATA_DIR
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const movScriptHomeDir = mkdtempSync(join(tmpdir(), 'movscript-backend-secret-home-'))
  const firstDataDir = mkdtempSync(join(tmpdir(), 'movscript-backend-secret-data-a-'))
  const secondDataDir = mkdtempSync(join(tmpdir(), 'movscript-backend-secret-data-b-'))
  try {
    process.env.MOVSCRIPT_WORKSPACE_DIR = movScriptHomeDir
    delete process.env.MOVSCRIPT_DATA_DIR
    const first = resolveLocalSecret(firstDataDir)
    const second = resolveLocalSecret(secondDataDir)
    assert.match(first, /^[0-9a-f]{64}$/)
    assert.equal(second, first)

    const secretPath = join(resolveMovScriptWorkspaceRootPaths(movScriptHomeDir).backendDir, 'local-backend-secret.json')
    assert.equal(existsSync(secretPath), true)
    const raw = JSON.parse(readFileSync(secretPath, 'utf8')) as { secret?: string }
    assert.equal(raw.secret, first)
  } finally {
    if (previousDataDir === undefined) delete process.env.MOVSCRIPT_DATA_DIR
    else process.env.MOVSCRIPT_DATA_DIR = previousDataDir
    if (previousWorkspaceDir === undefined) delete process.env.MOVSCRIPT_WORKSPACE_DIR
    else process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
  }
})

test('local backend secret preserves legacy derived key when an existing sqlite database is present', () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const movScriptHomeDir = mkdtempSync(join(tmpdir(), 'movscript-backend-secret-legacy-home-'))
  const dataDir = mkdtempSync(join(tmpdir(), 'movscript-backend-secret-legacy-data-'))
  try {
    process.env.MOVSCRIPT_WORKSPACE_DIR = movScriptHomeDir
    mkdirSync(dataDir, { recursive: true })
    writeFileSync(join(dataDir, 'movscript-frontend.db'), '')

    const secret = resolveLocalSecret(dataDir)
    const second = resolveLocalSecret(mkdtempSync(join(tmpdir(), 'movscript-backend-secret-legacy-moved-')))
    assert.match(secret, /^[0-9a-f]{64}$/)
    assert.equal(second, secret)
  } finally {
    if (previousWorkspaceDir === undefined) delete process.env.MOVSCRIPT_WORKSPACE_DIR
    else process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
  }
})
