import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { AGENT_REFERENCE_DIR_ENV, EMPTY_REFERENCE_STORE, ReferenceManager, loadAgentReferenceStore, loadReferenceStore } from '../index.js'

test('reference manager searches summaries and reads bounded text reference bodies', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-reference-'))

  try {
    writeExternalReference(dir)
    const manager = new ReferenceManager(loadReferenceStore(dir))

    const search = await manager.search({ query: '测试 外部 参考', kind: 'text', domain: 'storyboard', limit: 3 })
    assert.ok(search.results.length > 0)
    assert.ok(search.results.some((result) => result.id === 'local_reference:studio.test.chunk'))
    assert.equal(search.results.some((result) => 'content' in result), false)
    assert.equal(typeof search.results[0]!.title, 'string')
    assert.equal(search.results[0]!.kind, 'text')
    assert.equal(search.results[0]!.source, 'local_reference')
    assert.match(String(search.results[0]!.metadata?.contentHash), /^sha256:/)
    assert.equal(typeof search.results[0]!.metadata?.sourcePath, 'string')

    const body = manager.get({ id: search.results[0]!.id, maxChars: 10 }) as any
    assert.equal(`local_reference:${body.id}`, search.results[0]!.id)
    assert.equal(typeof body.title, 'string')
    assert.equal(body.domain, 'storyboard')
    assert.equal(typeof body.contentHash, 'string')
    assert.equal(typeof body.sourcePath, 'string')
    assert.equal(body.content.length <= 10, true)
    assert.equal(body.truncated, true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('agent reference store includes local reference directory from environment', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-reference-'))
  const previousReferenceDir = process.env[AGENT_REFERENCE_DIR_ENV]

  try {
    writeExternalReference(dir)
    process.env[AGENT_REFERENCE_DIR_ENV] = dir

    const manager = new ReferenceManager(loadAgentReferenceStore())
    const search = await manager.search({ query: '测试 外部 参考', kind: 'text', domain: 'storyboard', limit: 5 })

    assert.ok(search.results.some((result) => result.id === 'local_reference:studio.test.chunk'))

    const body = manager.get({ id: 'studio.test.chunk', maxChars: 200 }) as any
    assert.equal(body.localReferenceSetId, 'studio.reference.test')
    assert.equal(body.title, '测试参考')
    assert.match(body.content, /外部参考正文/)
  } finally {
    if (previousReferenceDir === undefined) delete process.env[AGENT_REFERENCE_DIR_ENV]
    else process.env[AGENT_REFERENCE_DIR_ENV] = previousReferenceDir
    rmSync(dir, { recursive: true, force: true })
  }
})

test('reference loader skips corrupt indexes and unreadable chunks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-reference-'))

  try {
    writeFileSync(join(dir, 'index.reference.json'), '{not-json', 'utf8')
    mkdirSync(join(dir, 'valid'), { recursive: true })
    writeFileSync(join(dir, 'valid', 'index.reference.json'), `${JSON.stringify({
      id: 'studio.reference.valid',
      version: '1.0.0',
      name: 'Valid Reference',
      domain: 'storyboard',
      resources: ['missing.md'],
    }, null, 2)}\n`, 'utf8')

    const store = loadReferenceStore(dir)

    assert.deepEqual(store.listLocalReferenceSets(), [{
      id: 'studio.reference.valid',
      version: '1.0.0',
      domain: 'storyboard',
      name: 'Valid Reference',
      tags: [],
      chunkIds: [],
      chunks: [],
    }])
    assert.deepEqual(store.listChunks(), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('reference manager maps backend external resources and shot library results', async () => {
  const calls: string[] = []
  const manager = new ReferenceManager(EMPTY_REFERENCE_STORE, {
    backendClient: {
      async getJSON(path) {
        calls.push(path)
        if (path.startsWith('/external-resources/search')) {
          return {
            performed: true,
            response: {
              items: [{
                provider_key: 'pexels',
                external_id: 'img-1',
                media_type: 'image',
                title: 'Rainy street',
                description: 'A wet street at night.',
                thumbnail_url: 'https://example.test/thumb.jpg',
                source_url: 'https://example.test/source',
                width: 1200,
                height: 800,
                license_label: 'Pexels License',
              }],
            },
          }
        }
        if (path.startsWith('/shot-references')) {
          return {
            performed: true,
            response: {
              items: [{
                ID: 7,
                resource_id: 42,
                resource: { ID: 42, url: '/api/v1/resources/42/file' },
                title: 'Slow push reveal',
                summary: 'A slow push-in reveal shot.',
                intent: ['create_tension'],
                pattern: ['slow_push_in'],
                retrieval_text: 'slow push reveal tension',
              }],
            },
          }
        }
        return { performed: true, response: { items: [] } }
      },
    },
  })

  const images = await manager.search({ query: '雨夜街道', kind: 'image', source: 'external_resource', limit: 3 })
  assert.equal(images.results[0]?.id, 'external_resource:pexels:image:img-1')
  assert.equal(images.results[0]?.kind, 'image')
  assert.equal(images.results[0]?.retrievalMethod, 'native')

  const videos = await manager.search({ query: 'slow reveal', kind: 'video', source: 'shot_library', method: 'semantic', limit: 3 })
  assert.equal(videos.results[0]?.id, 'shot_library:7')
  assert.equal(videos.results[0]?.kind, 'video')
  assert.equal(videos.results[0]?.retrievalMethod, 'semantic')
  assert.equal(videos.results[0]?.resourceId, 42)
  assert.deepEqual(videos.results[0]?.metadata?.intent, ['create_tension'])
  assert.equal(calls.some((path) => path.startsWith('/external-resources/search')), true)
  assert.equal(calls.some((path) => path.startsWith('/shot-references')), true)
})

function writeExternalReference(rootDir: string): void {
  mkdirSync(join(rootDir, 'chunks'), { recursive: true })
  writeFileSync(join(rootDir, 'index.reference.json'), `${JSON.stringify({
    id: 'studio.reference.test',
    version: '1.0.0',
    name: 'Studio Test Reference',
    domain: 'storyboard',
    resources: ['chunks/test.md'],
    tags: ['test'],
  }, null, 2)}\n`, 'utf8')
  writeFileSync(join(rootDir, 'chunks', 'test.md'), `---
id: studio.test.chunk
domain: storyboard
title: 测试参考
tags:
  - test
summary: 用于测试外部参考加载。
version: 1.0.0
---

外部参考正文，用于验证本地参考目录能够被 agent 默认参考源加载。
`, 'utf8')
}
