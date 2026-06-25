import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  readDesktopState,
  removeDesktopState,
  writeDesktopState,
} from './desktopStateStore'

test('desktop state store writes a safe keyed JSON value under MovScript Home', () => {
  const movScriptHomeDir = mkdtempSync(join(tmpdir(), 'movscript-desktop-state-'))
  try {
    const saved = writeDesktopState({
      movScriptHomeDir,
      key: 'movscript-workbench-session-v1',
      value: '{"state":{"snapshots":{}}}',
    })

    assert.equal(saved.movScriptHomeDir, movScriptHomeDir)
    assert.equal(saved.path, join(movScriptHomeDir, 'desktop-state', 'movscript-workbench-session-v1.json'))
    assert.equal(saved.value, '{"state":{"snapshots":{}}}')

    const raw = JSON.parse(readFileSync(saved.path, 'utf8')) as {
      schema?: string
      key?: string
      value?: string
    }
    assert.equal(raw.schema, 'movscript.desktop-state.v1')
    assert.equal(raw.key, 'movscript-workbench-session-v1')
    assert.equal(raw.value, '{"state":{"snapshots":{}}}')

    const restored = readDesktopState({ movScriptHomeDir, key: 'movscript-workbench-session-v1' })
    assert.equal(restored.value, saved.value)

    removeDesktopState({ movScriptHomeDir, key: 'movscript-workbench-session-v1' })
    const removed = readDesktopState({ movScriptHomeDir, key: 'movscript-workbench-session-v1' })
    assert.equal(removed.value, null)
  } finally {
    rmSync(movScriptHomeDir, { recursive: true, force: true })
  }
})

test('desktop state store rejects unsafe keys', () => {
  const movScriptHomeDir = mkdtempSync(join(tmpdir(), 'movscript-desktop-state-unsafe-'))
  try {
    assert.throws(
      () => writeDesktopState({ movScriptHomeDir, key: '../browser-store', value: 'x' }),
      /safe file segment/,
    )
  } finally {
    rmSync(movScriptHomeDir, { recursive: true, force: true })
  }
})
