import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { FileAgentMemoryStore } from './fileMemoryStore.js'
import { RuntimeTelemetryRegistry } from '../../../telemetry/runtime/runtimeTelemetry.js'

test('file memory store ignores corrupt or non-object state files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-memory-store-'))
  try {
    const filePath = join(dir, 'memory.json')

    writeFileSync(filePath, '{not-json', 'utf8')
    const corruptStore = new FileAgentMemoryStore(filePath)
    assert.deepEqual(corruptStore.listMemories({ projectId: 1 }), [])

    writeFileSync(filePath, '["mem_1"]', 'utf8')
    const nonObjectStore = new FileAgentMemoryStore(filePath)
    assert.deepEqual(nonObjectStore.listMemories({ projectId: 1 }), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file memory store skips memories with invalid project ids', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-memory-store-'))
  try {
    const filePath = join(dir, 'memory.json')
    writeFileSync(filePath, JSON.stringify({
      version: 2,
      memories: [
        {
          id: 'mem_zero',
          projectId: 0,
          title: 'Zero memory',
          kind: 'fact',
          content: 'This one should not load.',
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
        {
          id: 'mem_fractional',
          projectId: 1.5,
          title: 'Fractional memory',
          kind: 'fact',
          content: 'This one should not load.',
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
        {
          id: 'mem_valid',
          projectId: 1,
          title: 'Valid memory',
          kind: 'fact',
          content: 'This one can load.',
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
      ],
    }).replace('"id":"mem_valid","projectId":1,', '"id":"mem_nonfinite","projectId":1e999,'), 'utf8')

    const store = new FileAgentMemoryStore(filePath)

    assert.deepEqual(store.listMemories({ projectId: 1 }), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file memory store records storage telemetry on persist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-memory-store-'))
  try {
    const filePath = join(dir, 'memory.json')
    const telemetry = new RuntimeTelemetryRegistry()
    const store = new FileAgentMemoryStore(filePath, telemetry)

    store.createMemory({
      projectId: 1,
      kind: 'fact',
      title: 'Project fact',
      content: 'Keep scene continuity notes.',
    })

    const metrics = telemetry.snapshot().metrics
    assert.equal(metrics.some((sample) => sample.name === 'movscript_agent_storage_flush_duration_ms' && sample.labels?.component === 'memory_store'), true)
    assert.equal(metrics.some((sample) => sample.name === 'movscript_agent_storage_file_bytes' && sample.labels?.kind === 'memory_file' && sample.value > 0), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
