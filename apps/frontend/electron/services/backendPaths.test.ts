import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { resolveMovScriptWorkspaceRootPaths } from '@movscript/core/workspace/node'
import { resolveLocalDataDir } from './backend/paths'

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
