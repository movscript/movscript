import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { FileAgentCatalogStateStore, InMemoryAgentCatalogStateStore, normalizeCatalogState } from './state.js'

test('normalizeCatalogState drops metadata with non-finite JSON numbers', () => {
  const state = normalizeCatalogState({
    updatedAt: '2026-05-17T00:00:00.000Z',
    metadata: {
      catalogVersion: 'v1',
      score: Number.POSITIVE_INFINITY,
    },
  })

  assert.equal(state.updatedAt, '2026-05-17T00:00:00.000Z')
  assert.equal(state.metadata, undefined)
})

test('InMemoryAgentCatalogStateStore returns independent catalog state snapshots', () => {
  const store = new InMemoryAgentCatalogStateStore()
  const saved = store.save({
    version: 1,
    updatedAt: '2026-05-17T00:00:00.000Z',
    metadata: { nested: { stable: true } },
  })

  ;(saved.metadata?.nested as { stable: boolean }).stable = false

  assert.deepEqual(store.load().metadata, { nested: { stable: true } })
})

test('FileAgentCatalogStateStore ignores corrupt catalog state files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-catalog-state-'))
  try {
    const filePath = join(dir, 'catalog.json')
    writeFileSync(filePath, '{not-json', 'utf8')
    const store = new FileAgentCatalogStateStore(filePath)
    const state = store.load()

    assert.equal(state.version, 1)
    assert.equal(state.metadata, undefined)
    assert.equal(typeof state.updatedAt, 'string')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
