import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import {
  clientPluginStorePath,
  listClientPluginsFromStore,
  removeClientPluginFromStore,
  saveClientPluginToStore,
} from './clientPluginFileStore.js'

test('client plugin file store persists plugin manifests under runtime data dir', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-client-plugin-store-'))
  try {
    const plugin = {
      id: 'story-pack',
      name: 'Story Pack',
      version: '1.0.0',
      manifestFormat: 'codex',
    }

    assert.deepEqual(listClientPluginsFromStore(dir).plugins, [])
    const saved = saveClientPluginToStore(dir, plugin)

    assert.equal(saved.path, clientPluginStorePath(dir))
    assert.deepEqual(saved.plugins, [plugin])
    assert.match(await readFile(saved.path, 'utf8'), /"id": "story-pack"/)

    const removed = removeClientPluginFromStore(dir, 'story-pack')
    assert.equal(removed.removed, true)
    assert.deepEqual(listClientPluginsFromStore(dir).plugins, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
