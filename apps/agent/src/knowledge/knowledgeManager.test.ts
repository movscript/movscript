import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { AGENT_KNOWLEDGE_DIR_ENV, KnowledgeManager, loadAgentKnowledgeStore, loadBuiltinKnowledgeStore, loadKnowledgeStore } from './index.js'

test('knowledge manager searches summaries and reads bounded chunk bodies', () => {
  const manager = new KnowledgeManager(loadBuiltinKnowledgeStore())

  const search = manager.search({ query: '分镜 钩子 节奏', domain: 'storyboard', limit: 3 })
  assert.ok(search.results.length > 0)
  assert.ok(search.results.some((result) => result.id === 'storyboard.rhythm.basic' || result.id === 'storyboard.hook.short_drama'))
  assert.equal(search.results.some((result) => 'content' in result), false)
  assert.equal(typeof search.results[0]!.title, 'string')
  assert.equal(search.results[0]!.domain, 'storyboard')
  assert.match(search.results[0]!.contentHash, /^sha256:/)
  assert.equal(typeof search.results[0]!.sourcePath, 'string')

  const body = manager.get({ id: search.results[0]!.id, maxChars: 40 }) as any
  assert.equal(body.id, search.results[0]!.id)
  assert.equal(typeof body.title, 'string')
  assert.equal(body.domain, 'storyboard')
  assert.equal(typeof body.contentHash, 'string')
  assert.equal(typeof body.sourcePath, 'string')
  assert.equal(body.content.length <= 40, true)
  assert.equal(body.truncated, true)
})

test('agent knowledge store includes local knowledge directory from environment', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-knowledge-'))
  const previousKnowledgeDir = process.env[AGENT_KNOWLEDGE_DIR_ENV]

  try {
    writeExternalKnowledge(dir)
    process.env[AGENT_KNOWLEDGE_DIR_ENV] = dir

    const manager = new KnowledgeManager(loadAgentKnowledgeStore())
    const search = manager.search({ query: '测试 外部 知识', domain: 'storyboard', limit: 5 })

    assert.ok(search.results.some((result) => result.id === 'studio.test.chunk'))

    const body = manager.get({ id: 'studio.test.chunk', maxChars: 200 }) as any
    assert.equal(body.collectionId, 'studio.knowledge.test')
    assert.equal(body.title, '测试知识')
    assert.match(body.content, /外部知识正文/)
  } finally {
    if (previousKnowledgeDir === undefined) delete process.env[AGENT_KNOWLEDGE_DIR_ENV]
    else process.env[AGENT_KNOWLEDGE_DIR_ENV] = previousKnowledgeDir
    rmSync(dir, { recursive: true, force: true })
  }
})

test('knowledge loader skips corrupt indexes and unreadable chunks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-knowledge-'))

  try {
    writeFileSync(join(dir, 'index.knowledge.json'), '{not-json', 'utf8')
    mkdirSync(join(dir, 'valid'), { recursive: true })
    writeFileSync(join(dir, 'valid', 'index.knowledge.json'), `${JSON.stringify({
      id: 'studio.knowledge.valid',
      version: '1.0.0',
      name: 'Valid Knowledge',
      domain: 'storyboard',
      resources: ['missing.md'],
    }, null, 2)}\n`, 'utf8')

    const store = loadKnowledgeStore(dir)

    assert.deepEqual(store.listCollections(), [{
      id: 'studio.knowledge.valid',
      version: '1.0.0',
      domain: 'storyboard',
      name: 'Valid Knowledge',
      tags: [],
      chunkIds: [],
      chunks: [],
    }])
    assert.deepEqual(store.listChunks(), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

function writeExternalKnowledge(rootDir: string): void {
  mkdirSync(join(rootDir, 'chunks'), { recursive: true })
  writeFileSync(join(rootDir, 'index.knowledge.json'), `${JSON.stringify({
    id: 'studio.knowledge.test',
    version: '1.0.0',
    name: 'Studio Test Knowledge',
    domain: 'storyboard',
    resources: ['chunks/test.md'],
    tags: ['test'],
  }, null, 2)}\n`, 'utf8')
  writeFileSync(join(rootDir, 'chunks', 'test.md'), `---
id: studio.test.chunk
domain: storyboard
title: 测试知识
tags:
  - test
summary: 用于测试外部知识加载。
version: 1.0.0
---

外部知识正文，用于验证本地知识目录能够被 agent 默认知识库加载。
`, 'utf8')
}
