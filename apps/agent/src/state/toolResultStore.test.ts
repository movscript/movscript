import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { buildModelToolResultContext } from '../contextManager/toolResultContext.js'
import {
  buildAgentToolResultRecord,
  FileAgentToolResultStore,
  InMemoryAgentToolResultStore,
  resolveAgentToolResultPath,
} from './toolResultStore.js'
import type { AgentRun } from './types.js'

function testRun(): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    policy: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
    metadata: { limits: { maxRetrievedContextChars: 1000 } },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    steps: [],
  }
}

test('tool result store upserts by stable result ref without changing creation time', () => {
  const store = new InMemoryAgentToolResultStore()
  const call = { id: 'call_script_1', name: 'movscript_script_locate', args: { projectId: 42 } }
  const result = {
    projectId: 42,
    scripts: [{ id: 1, title: 'Long Script', content: '雨夜便利店。'.repeat(500) }],
  }
  const context = buildModelToolResultContext({ run: testRun(), call, result })
  assert.ok(context.resultRef)

  const first = store.upsertToolResult(buildAgentToolResultRecord({
    runId: 'run_1',
    threadId: 'thread_1',
    call,
    result,
    modelContext: context,
    resultRef: context.resultRef,
    now: '2026-01-01T00:00:00.000Z',
  }))
  const second = store.upsertToolResult(buildAgentToolResultRecord({
    runId: 'run_1',
    threadId: 'thread_1',
    call,
    result,
    modelContext: context,
    resultRef: context.resultRef,
    now: '2026-01-01T00:00:01.000Z',
  }))

  assert.equal(first.key, second.key)
  assert.equal(second.createdAt, '2026-01-01T00:00:00.000Z')
  assert.equal(second.updatedAt, '2026-01-01T00:00:01.000Z')
  assert.deepEqual(store.listToolResults({ runId: 'run_1', resultHash: second.resultHash }).map((record) => record.key), [second.key])
})

test('file tool result store restores persisted full result records', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-tool-results-'))
  const filePath = join(dir, 'tool-results.json')
  try {
    const call = { id: 'call_script_1', name: 'movscript_script_locate', args: { projectId: 42 } }
    const result = {
      projectId: 42,
      scripts: [{ id: 1, title: 'Long Script', content: '雨夜便利店。'.repeat(500) }],
    }
    const context = buildModelToolResultContext({ run: testRun(), call, result })
    assert.ok(context.resultRef)
    const store = new FileAgentToolResultStore(filePath)
    const record = store.upsertToolResult(buildAgentToolResultRecord({
      runId: 'run_1',
      threadId: 'thread_1',
      call,
      result,
      modelContext: context,
      resultRef: context.resultRef,
      now: '2026-01-01T00:00:00.000Z',
    }))

    const restored = new FileAgentToolResultStore(filePath)
    assert.deepEqual(restored.getToolResult(record.key)?.result, result)
    assert.equal(restored.getToolResult(record.key)?.modelProjection, context.content)
    assert.equal(restored.listToolResults({ refKey: record.refKey })[0]?.key, record.key)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('tool result path resolves beside the agent state file by default', () => {
  const originalToolResultPath = process.env.MOVSCRIPT_AGENT_TOOL_RESULTS_PATH
  const originalUserDataDir = process.env.MOVSCRIPT_AGENT_USER_DATA_DIR
  try {
    delete process.env.MOVSCRIPT_AGENT_TOOL_RESULTS_PATH
    delete process.env.MOVSCRIPT_AGENT_USER_DATA_DIR
    assert.equal(
      resolveAgentToolResultPath('/tmp/movscript-agent/state.json'),
      '/tmp/movscript-agent/state.tool-results.json',
    )
  } finally {
    if (originalToolResultPath === undefined) {
      delete process.env.MOVSCRIPT_AGENT_TOOL_RESULTS_PATH
    } else {
      process.env.MOVSCRIPT_AGENT_TOOL_RESULTS_PATH = originalToolResultPath
    }
    if (originalUserDataDir === undefined) {
      delete process.env.MOVSCRIPT_AGENT_USER_DATA_DIR
    } else {
      process.env.MOVSCRIPT_AGENT_USER_DATA_DIR = originalUserDataDir
    }
  }
})
