import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyRuntimeThreadContextSummary,
  attachRuntimeThreadContextSummaryToRun,
} from './runtimeThreadContextSummary.js'
import type { AgentRun, AgentThread } from '../state/types.js'

test('applyRuntimeThreadContextSummary writes summary onto thread and run metadata', () => {
  const thread = makeThread()
  const run = makeRun({ assistantMessageId: 'msg_assistant' })
  thread.messages.push({
    id: 'msg_user',
    threadId: thread.id,
    role: 'user',
    content: 'User goal',
    createdAt: '2026-01-01T00:00:00.000Z',
  }, {
    id: 'msg_assistant',
    threadId: thread.id,
    role: 'assistant',
    content: 'Assistant answer',
    runId: run.id,
    createdAt: '2026-01-01T00:00:01.000Z',
  })

  const summary = applyRuntimeThreadContextSummary({
    thread,
    run,
    now: '2026-01-01T00:00:02.000Z',
  })
  summary.recentRunRefs[0]!.summary = 'Changed after write'

  assert.equal(summary.threadId, thread.id)
  assert.equal(summary.recentRunRefs[0]?.runId, run.id)
  assert.equal((thread.metadata?.threadContextSummary as any)?.schema, 'movscript.thread-context-summary.v1')
  assert.equal((run.metadata?.threadContextSummary as any)?.schema, 'movscript.thread-context-summary.v1')
  assert.equal((thread.metadata?.threadContextSummary as any)?.recentRunRefs[0]?.summary, 'Assistant answer')
  assert.equal((run.metadata?.threadContextSummary as any)?.recentRunRefs[0]?.summary, 'Assistant answer')
})

test('applyRuntimeThreadContextSummary respects run summary size limit', () => {
  const thread = makeThread()
  const run = makeRun({
    warnings: ['1234567890'],
    metadata: { limits: { maxThreadSummaryChars: 4 } },
  })

  const summary = applyRuntimeThreadContextSummary({
    thread,
    run,
    now: '2026-01-01T00:00:02.000Z',
  })

  assert.equal(summary.recentRunRefs[0]?.summary, '123…')
})

test('attachRuntimeThreadContextSummaryToRun copies normalized thread summary into run metadata', () => {
  const thread = makeThread()
  const sourceRun = makeRun({ assistantMessageId: 'msg_assistant' })
  thread.messages.push({
    id: 'msg_user',
    threadId: thread.id,
    role: 'user',
    content: 'User goal',
    createdAt: '2026-01-01T00:00:00.000Z',
  }, {
    id: 'msg_assistant',
    threadId: thread.id,
    role: 'assistant',
    content: 'Assistant answer',
    runId: sourceRun.id,
    createdAt: '2026-01-01T00:00:01.000Z',
  })
  const summary = applyRuntimeThreadContextSummary({
    thread,
    run: sourceRun,
    now: '2026-01-01T00:00:02.000Z',
  })
  const nextRun = makeRun({ id: 'run_2', metadata: { existing: true } })

  const attached = attachRuntimeThreadContextSummaryToRun({ thread, run: nextRun })
  ;((thread.metadata?.threadContextSummary as any)?.recentRunRefs[0] ?? {}).summary = 'Changed after attach'

  assert.equal(attached?.schema, 'movscript.thread-context-summary.v1')
  assert.deepEqual(nextRun.metadata, {
    existing: true,
    threadContextSummary: summary,
  })
})

test('attachRuntimeThreadContextSummaryToRun ignores missing or invalid thread summaries', () => {
  const thread = makeThread()
  const run = makeRun({ metadata: { existing: true } })

  assert.equal(attachRuntimeThreadContextSummaryToRun({ thread, run }), undefined)
  assert.deepEqual(run.metadata, { existing: true })
})

function makeThread(): AgentThread {
  return {
    id: 'thread_1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [],
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}
