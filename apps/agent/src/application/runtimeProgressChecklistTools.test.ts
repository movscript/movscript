import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryAgentStore } from '../state/store.js'
import type { AgentRun, AgentThread } from '../state/types.js'
import { updateRuntimeProgressChecklist } from './runtimeProgressChecklistTools.js'

test('updateRuntimeProgressChecklist upserts current checklist and appends immutable revisions', () => {
  const store = new InMemoryAgentStore()
  const thread = baseThread()
  store.createThread(thread)
  const run = baseRun(thread.id)
  store.createRun(run)

  const first = updateRuntimeProgressChecklist({
    store,
    run,
    now: '2026-05-22T00:00:00.000Z',
    checklistId: 'progress_checklist_1',
    revisionId: 'progress_checklist_revision_1',
    messageId: 'msg_checklist_1',
    request: {
      explanation: 'initial pass',
      checklist: [
        { step: 'Inspect state shape', status: 'completed' },
        { step: 'Wire update tool', status: 'in_progress' },
      ],
    },
  })

  const updated = updateRuntimeProgressChecklist({
    store,
    run,
    now: '2026-05-22T00:01:00.000Z',
    revisionId: 'progress_checklist_revision_2',
    messageId: 'msg_checklist_2',
    request: {
      checklist: [
        { step: 'Inspect state shape', status: 'completed' },
        { step: 'Wire update tool', status: 'completed' },
      ],
    },
  })

  const saved = store.getThread(thread.id)!
  assert.equal(first.checklist.id, 'progress_checklist_1')
  assert.equal(updated.checklist.id, 'progress_checklist_1')
  assert.equal(saved.currentProgressChecklist?.completedCount, 2)
  assert.equal(saved.progressChecklistRevisions?.length, 2)
  assert.equal(saved.progressChecklistRevisions?.[0].snapshot.items[1].status, 'in_progress')
  assert.equal(saved.progressChecklistRevisions?.[1].snapshot.items[1].status, 'completed')
  assert.equal(saved.messages.at(-1)?.metadata?.kind, 'progress_checklist_revision')
})

test('updateRuntimeProgressChecklist rejects more than one in_progress item', () => {
  const store = new InMemoryAgentStore()
  const thread = baseThread()
  store.createThread(thread)
  const run = baseRun(thread.id)
  store.createRun(run)

  assert.throws(() => updateRuntimeProgressChecklist({
    store,
    run,
    request: {
      checklist: [
        { step: 'One', status: 'in_progress' },
        { step: 'Two', status: 'in_progress' },
      ],
    },
  }), /at most one in_progress/)
})

function baseThread(): AgentThread {
  return {
    id: 'thread_1',
    status: 'idle',
    archived: false,
    createdAt: '2026-05-22T00:00:00.000Z',
    updatedAt: '2026-05-22T00:00:00.000Z',
    messages: [],
  }
}

function baseRun(threadId: string): AgentRun {
  return {
    id: 'run_1',
    threadId,
    status: 'in_progress',
    policy: {
      approvalMode: 'auto',
      maxToolCalls: 10,
      maxIterations: 10,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-22T00:00:00.000Z',
    updatedAt: '2026-05-22T00:00:00.000Z',
    steps: [],
  }
}
