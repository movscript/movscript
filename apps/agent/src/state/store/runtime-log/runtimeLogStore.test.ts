import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { FileRuntimeLogStore } from './runtimeLogStore.js'

test('runtime log index is rebuilt from append-only events when missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-runtime-log-store-'))
  try {
    const store = new FileRuntimeLogStore(dir)
    store.append({ kind: 'session.upserted', causality: { sessionId: 'session_1' }, payload: { id: 'session_1' } })
    store.append({ kind: 'thread.upserted', causality: { sessionId: 'session_1', threadId: 'thread_1' }, payload: { id: 'thread_1' } })
    rmSync(join(dir, 'index.json'), { force: true })

    const reopened = new FileRuntimeLogStore(dir)
    const event = reopened.append({ kind: 'run.upserted', causality: { sessionId: 'session_1', threadId: 'thread_1', runId: 'run_1' }, payload: { id: 'run_1' } })

    assert.equal(event.ordinal, 3)
    assert.equal(event.cursor, 'runtime-log:3')
    let eventsRead = 0
    const ordinals: number[] = []
    const result = reopened.scan({
      onEvent: (scanned) => {
        eventsRead += 1
        ordinals.push(scanned.ordinal)
      },
    })
    assert.equal(eventsRead, 3)
    assert.equal(result.eventsRead, 3)
    assert.deepEqual(ordinals, [1, 2, 3])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime log index rebuild reports byte progress', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-runtime-log-rebuild-progress-'))
  try {
    const store = new FileRuntimeLogStore(dir)
    store.append({ kind: 'session.upserted', causality: { sessionId: 'session_1' }, payload: { id: 'session_1' } })
    store.append({ kind: 'thread.upserted', causality: { sessionId: 'session_1', threadId: 'thread_1' }, payload: { id: 'thread_1' } })
    rmSync(join(dir, 'index.json'), { force: true })

    const progressEvents: Array<{ bytesRead: number; totalBytes: number; linesRead: number; eventsRead: number }> = []
    new FileRuntimeLogStore(dir, {
      onIndexRebuildProgress: (progress) => progressEvents.push(progress),
    })

    assert.ok(progressEvents.length >= 1)
    assert.equal(progressEvents.at(-1)?.bytesRead, progressEvents.at(-1)?.totalBytes)
    assert.equal(progressEvents.at(-1)?.eventsRead, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime log scan reports byte and event progress', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-runtime-log-progress-'))
  try {
    const store = new FileRuntimeLogStore(dir)
    store.append({ kind: 'session.upserted', causality: { sessionId: 'session_1' }, payload: { id: 'session_1' } })
    store.append({ kind: 'thread.upserted', causality: { sessionId: 'session_1', threadId: 'thread_1' }, payload: { id: 'thread_1' } })
    store.append({ kind: 'run.upserted', causality: { sessionId: 'session_1', threadId: 'thread_1', runId: 'run_1' }, payload: { id: 'run_1' } })

    const progressEvents: Array<{ bytesRead: number; totalBytes: number; linesRead: number; eventsRead: number }> = []
    const result = store.scan({
      onEvent: () => {},
      onProgress: (progress) => progressEvents.push(progress),
    })

    assert.equal(result.eventsRead, 3)
    assert.ok(progressEvents.length >= 1)
    assert.equal(progressEvents.at(-1)?.bytesRead, result.bytesRead)
    assert.equal(progressEvents.at(-1)?.totalBytes, result.totalBytes)
    assert.equal(progressEvents.at(-1)?.linesRead, result.linesRead)
    assert.equal(progressEvents.at(-1)?.eventsRead, result.eventsRead)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime log store supports a session rollout jsonl file root with sidecar indexes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-runtime-log-rollout-file-'))
  try {
    const rolloutPath = join(dir, 'rollout-2026-06-03T09-00-00-session_abc.jsonl')
    const store = new FileRuntimeLogStore(rolloutPath)
    const message = store.append({
      kind: 'message.upserted',
      causality: { sessionId: 'session_abc', threadId: 'thread_1', messageId: 'msg_1' },
      entity: {
        type: 'message',
        value: {
          id: 'msg_1',
          threadId: 'thread_1',
          role: 'user',
          content: 'file rooted runtime log',
          createdAt: '2026-06-03T09:00:01.000Z',
        },
      },
    })
    const ref = store.writeJSONBlob({ content: 'x'.repeat(10_000) }, { scope: ['runs', 'run_1'], name: 'input' })

    assert.equal(store.eventsPath, rolloutPath)
    assert.equal(existsSync(rolloutPath), true)
    assert.equal(existsSync(join(dir, 'rollout-2026-06-03T09-00-00-session_abc.index.json')), true)
    assert.equal(existsSync(join(dir, 'rollout-2026-06-03T09-00-00-session_abc.message-index.jsonl')), true)
    assert.equal(existsSync(join(dir, 'rollout-2026-06-03T09-00-00-session_abc.message-indexes', 'threads', 'thread_1.jsonl')), true)
    assert.match(ref.path, /^rollout-2026-06-03T09-00-00-session_abc\.blobs\//)
    assert.equal(existsSync(join(rolloutPath, 'events.jsonl')), false)

    const reopened = new FileRuntimeLogStore(rolloutPath)
    assert.deepEqual(reopened.listThreadMessagesPage({ threadId: 'thread_1' }).messages.map((item) => item.id), ['msg_1'])
    assert.equal(reopened.listThreadMessagesPage({ threadId: 'thread_1' }).nextAfterOrdinal, message.ordinal)
    assert.equal((reopened.readJSONBlob(ref) as { content?: string } | undefined)?.content?.length, 10_000)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime log store lists thread messages by cursor page with scan stats', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-runtime-log-thread-messages-'))
  try {
    const store = new FileRuntimeLogStore(dir)
    store.append({
      kind: 'thread.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1' },
      entity: {
        type: 'thread',
        value: {
          id: 'thread_1',
          sessionId: 'session_1',
          createdAt: '2026-05-21T00:00:00.000Z',
          updatedAt: '2026-05-21T00:00:00.000Z',
          messages: [],
        },
      },
    })
    const first = store.append({
      kind: 'message.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1', messageId: 'msg_1' },
      entity: {
        type: 'message',
        value: {
          id: 'msg_1',
          threadId: 'thread_1',
          role: 'user',
          content: 'first',
          createdAt: '2026-05-21T00:00:01.000Z',
        },
      },
    })
    store.append({
      kind: 'message.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_2', messageId: 'msg_other' },
      entity: {
        type: 'message',
        value: {
          id: 'msg_other',
          threadId: 'thread_2',
          role: 'user',
          content: 'other',
          createdAt: '2026-05-21T00:00:01.500Z',
        },
      },
    })
    const second = store.append({
      kind: 'message.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1', messageId: 'msg_2' },
      entity: {
        type: 'message',
        value: {
          id: 'msg_2',
          threadId: 'thread_1',
          role: 'assistant',
          content: 'second',
          createdAt: '2026-05-21T00:00:02.000Z',
        },
      },
    })

    const page1 = store.listThreadMessagesPage({ threadId: 'thread_1', limit: 1 })

    assert.deepEqual(page1.messages.map((message) => message.id), ['msg_1'])
    assert.equal(page1.nextAfterOrdinal, first.ordinal)
    const page2 = store.listThreadMessagesPage({ threadId: 'thread_1', afterOrdinal: page1.nextAfterOrdinal!, limit: 1 })
    assert.equal(page1.hasMore, true)
    assert.deepEqual(page2.messages.map((message) => message.id), ['msg_2'])
    assert.equal(page2.nextAfterOrdinal, second.ordinal)
    assert.equal(page2.hasMore, false)
    assert.equal(page1.scan.matchedEvents, 2)
    assert.equal(page1.scan.eventsRead, 2)
    assert.ok(page1.scan.bytesRead > 0)
    assert.ok(page1.scan.bytesRead < page1.scan.totalBytes)
    assert.equal(page1.scan.malformedLines, 0)
    assert.equal(existsSync(join(dir, 'message-index.jsonl')), true)
    assert.equal(existsSync(join(dir, 'message-indexes', 'threads', 'thread_1.jsonl')), true)
    const threadMessageIndexRecords = readFileSync(join(dir, 'message-indexes', 'threads', 'thread_1.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { threadId?: string; ordinal?: number })
    assert.deepEqual(threadMessageIndexRecords.map((record) => record.threadId), ['thread_1', 'thread_1'])
    assert.deepEqual(threadMessageIndexRecords.map((record) => record.ordinal), [first.ordinal, second.ordinal])
    const messageIndexRecords = readFileSync(join(dir, 'message-index.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { threadId?: string; ordinal?: number; eventOffset?: number; eventBytes?: number })
    assert.deepEqual(messageIndexRecords.map((record) => record.threadId), ['thread_1', 'thread_2', 'thread_1'])
    assert.deepEqual(messageIndexRecords.map((record) => record.ordinal), [first.ordinal, 3, second.ordinal])
    assert.ok(messageIndexRecords.every((record) => typeof record.eventOffset === 'number' && record.eventOffset >= 0))
    assert.ok(messageIndexRecords.every((record) => typeof record.eventBytes === 'number' && record.eventBytes > 0))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime log store pages thread messages in descending order with ordinal cursors', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-runtime-log-thread-messages-desc-'))
  try {
    const store = new FileRuntimeLogStore(dir)
    const appendMessage = (messageId: string, content: string, createdAt: string) => store.append({
      kind: 'message.upserted',
      causality: { sessionId: 'session_desc_1', threadId: 'thread_desc_1', messageId },
      entity: {
        type: 'message',
        value: {
          id: messageId,
          threadId: 'thread_desc_1',
          role: 'user',
          content,
          createdAt,
        },
      },
    })
    const first = appendMessage('msg_desc_1', 'first', '2026-05-21T00:00:01.000Z')
    const second = appendMessage('msg_desc_2', 'second', '2026-05-21T00:00:02.000Z')
    const third = appendMessage('msg_desc_3', 'third', '2026-05-21T00:00:03.000Z')

    const page1 = store.listThreadMessagesPage({ threadId: 'thread_desc_1', direction: 'desc', limit: 2 })
    const page2 = store.listThreadMessagesPage({ threadId: 'thread_desc_1', direction: 'desc', afterOrdinal: page1.nextAfterOrdinal, limit: 2 })

    assert.deepEqual(page1.messages.map((message) => message.id), ['msg_desc_3', 'msg_desc_2'])
    assert.equal(page1.nextAfterOrdinal, second.ordinal)
    assert.equal(page1.hasMore, true)
    assert.deepEqual(page2.messages.map((message) => message.id), ['msg_desc_1'])
    assert.equal(page2.nextAfterOrdinal, first.ordinal)
    assert.equal(page2.hasMore, false)
    assert.equal(third.ordinal > second.ordinal, true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime log thread message pages use stable message order when older messages are updated', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-runtime-log-thread-message-updates-'))
  try {
    const store = new FileRuntimeLogStore(dir)
    const first = store.append({
      kind: 'message.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1', messageId: 'msg_1' },
      entity: {
        type: 'message',
        value: {
          id: 'msg_1',
          threadId: 'thread_1',
          role: 'assistant',
          content: 'draft',
          createdAt: '2026-05-21T00:00:01.000Z',
        },
      },
    })
    store.append({
      kind: 'message.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1', messageId: 'msg_2' },
      entity: {
        type: 'message',
        value: {
          id: 'msg_2',
          threadId: 'thread_1',
          role: 'user',
          content: 'second',
          createdAt: '2026-05-21T00:00:02.000Z',
        },
      },
    })
    store.append({
      kind: 'message.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1', messageId: 'msg_1' },
      entity: {
        type: 'message',
        value: {
          id: 'msg_1',
          threadId: 'thread_1',
          role: 'assistant',
          content: 'final',
          createdAt: '2026-05-21T00:00:01.000Z',
        },
      },
    })

    const page1 = store.listThreadMessagesPage({ threadId: 'thread_1', limit: 1 })
    const page2 = store.listThreadMessagesPage({ threadId: 'thread_1', afterOrdinal: page1.nextAfterOrdinal!, limit: 1 })

    assert.deepEqual(page1.messages.map((message) => `${message.id}:${message.content}`), ['msg_1:final'])
    assert.equal(page1.nextAfterOrdinal, first.ordinal)
    assert.equal(page1.hasMore, true)
    assert.deepEqual(page2.messages.map((message) => `${message.id}:${message.content}`), ['msg_2:second'])
    assert.equal(page2.hasMore, false)
    assert.ok(page1.scan.bytesRead < page1.scan.totalBytes)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime log current entity index reads latest entity events by offset', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-runtime-log-current-entities-'))
  try {
    const store = new FileRuntimeLogStore(dir)
    store.append({
      kind: 'thread.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1' },
      entity: {
        type: 'thread',
        value: {
          id: 'thread_1',
          sessionId: 'session_1',
          title: 'Thread v1',
          createdAt: '2026-05-21T00:00:00.000Z',
          updatedAt: '2026-05-21T00:00:00.000Z',
          messages: [],
        },
      },
    })
    const latestThread = store.append({
      kind: 'thread.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1' },
      entity: {
        type: 'thread',
        value: {
          id: 'thread_1',
          sessionId: 'session_1',
          title: 'Thread v2',
          createdAt: '2026-05-21T00:00:00.000Z',
          updatedAt: '2026-05-21T00:00:01.000Z',
          messages: [],
        },
      },
    })
    const run = store.append({
      kind: 'run.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1', runId: 'run_1' },
      entity: {
        type: 'run',
        value: {
          id: 'run_1',
          sessionId: 'session_1',
          threadId: 'thread_1',
          status: 'completed',
          role: 'planner',
          runtimeLimits: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
          createdAt: '2026-05-21T00:00:02.000Z',
          updatedAt: '2026-05-21T00:00:03.000Z',
          steps: [],
        },
      },
    })

    const reopened = new FileRuntimeLogStore(dir)
    const events = reopened.listCurrentEntityEvents()

    assert.deepEqual(events.map((event) => event.ordinal), [latestThread.ordinal, run.ordinal])
    assert.deepEqual(events.map((event) => event.kind), ['thread.upserted', 'run.upserted'])
    assert.equal(events[0]?.entity?.type, 'thread')
    assert.equal(events[0]?.entity?.value.id, 'thread_1')
    assert.equal((events[0]?.entity?.value as { title?: string } | undefined)?.title, 'Thread v2')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime log current entity index removes deleted thread scoped entities', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-runtime-log-current-delete-'))
  try {
    const store = new FileRuntimeLogStore(dir)
    store.append({
      kind: 'thread.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1' },
      entity: {
        type: 'thread',
        value: {
          id: 'thread_1',
          sessionId: 'session_1',
          title: 'Deleted thread',
          createdAt: '2026-05-21T00:00:00.000Z',
          updatedAt: '2026-05-21T00:00:00.000Z',
          messages: [],
        },
      },
    })
    store.append({
      kind: 'run.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1', runId: 'run_1' },
      entity: {
        type: 'run',
        value: {
          id: 'run_1',
          sessionId: 'session_1',
          threadId: 'thread_1',
          status: 'completed',
          role: 'planner',
          runtimeLimits: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
          createdAt: '2026-05-21T00:00:01.000Z',
          updatedAt: '2026-05-21T00:00:02.000Z',
          steps: [],
        },
      },
    })
    store.append({
      kind: 'thread.deleted',
      causality: { sessionId: 'session_1', threadId: 'thread_1' },
      payload: {
        deleted: true,
        threadId: 'thread_1',
        deletedRunIds: ['run_1'],
        deletedTaskGraphIds: [],
        deletedTaskIds: [],
        deletedRuntimeWorkIds: [],
        deletedRuntimeInteractionIds: [],
        deletedRuntimeContinuationIds: [],
      },
    })

    const reopened = new FileRuntimeLogStore(dir)

    assert.deepEqual(reopened.listCurrentEntityEvents(), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime log store lists run steps from run-local offset index', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-runtime-log-run-steps-'))
  try {
    const store = new FileRuntimeLogStore(dir)
    store.append({
      kind: 'step.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1', runId: 'run_1', stepId: 'step_1' },
      entity: {
        type: 'step',
        value: {
          id: 'step_1',
          runId: 'run_1',
          type: 'tool_call',
          status: 'in_progress',
          toolName: 'first_tool',
          createdAt: '2026-05-21T00:00:01.000Z',
        },
      },
    })
    store.append({
      kind: 'step.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_2', runId: 'run_other', stepId: 'step_other' },
      entity: {
        type: 'step',
        value: {
          id: 'step_other',
          runId: 'run_other',
          type: 'tool_call',
          status: 'completed',
          toolName: 'other_tool',
          createdAt: '2026-05-21T00:00:01.500Z',
          completedAt: '2026-05-21T00:00:01.600Z',
        },
      },
    })
    store.append({
      kind: 'step.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1', runId: 'run_1', stepId: 'step_2' },
      entity: {
        type: 'step',
        value: {
          id: 'step_2',
          runId: 'run_1',
          type: 'message',
          status: 'completed',
          createdAt: '2026-05-21T00:00:02.000Z',
          completedAt: '2026-05-21T00:00:02.100Z',
        },
      },
    })
    store.append({
      kind: 'step.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1', runId: 'run_1', stepId: 'step_1' },
      entity: {
        type: 'step',
        value: {
          id: 'step_1',
          runId: 'run_1',
          type: 'tool_call',
          status: 'completed',
          toolName: 'first_tool',
          result: { ok: true },
          createdAt: '2026-05-21T00:00:01.000Z',
          completedAt: '2026-05-21T00:00:03.000Z',
        },
      },
    })

    assert.equal(existsSync(join(dir, 'step-index.jsonl')), true)
    assert.equal(existsSync(join(dir, 'step-indexes', 'runs', 'run_1.jsonl')), true)
    const runStepIndexRecords = readFileSync(join(dir, 'step-indexes', 'runs', 'run_1.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { runId?: string; stepId?: string })
    assert.deepEqual(runStepIndexRecords.map((record) => record.runId), ['run_1', 'run_1', 'run_1'])
    assert.deepEqual(runStepIndexRecords.map((record) => record.stepId), ['step_1', 'step_2', 'step_1'])

    const reopened = new FileRuntimeLogStore(dir)
    const steps = reopened.listRunSteps('run_1')

    assert.deepEqual(steps.map((step) => step.id), ['step_2', 'step_1'])
    assert.equal(steps[1]?.status, 'completed')
    assert.deepEqual(steps[1]?.result, { ok: true })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime log run step index is rebuilt from append-only events when missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-runtime-log-step-index-rebuild-'))
  try {
    const store = new FileRuntimeLogStore(dir)
    store.append({
      kind: 'step.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1', runId: 'run_1', stepId: 'step_1' },
      entity: {
        type: 'step',
        value: {
          id: 'step_1',
          runId: 'run_1',
          type: 'message',
          status: 'completed',
          createdAt: '2026-05-21T00:00:01.000Z',
        },
      },
    })
    rmSync(join(dir, 'step-index.jsonl'), { force: true })
    rmSync(join(dir, 'step-indexes'), { recursive: true, force: true })

    const reopened = new FileRuntimeLogStore(dir)
    const steps = reopened.listRunSteps('run_1')

    assert.equal(existsSync(join(dir, 'step-index.jsonl')), true)
    assert.equal(existsSync(join(dir, 'step-indexes', 'runs', 'run_1.jsonl')), true)
    assert.deepEqual(steps.map((step) => step.id), ['step_1'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime log run step page rebuilds a malformed run step offset index', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-runtime-log-step-index-malformed-'))
  try {
    const store = new FileRuntimeLogStore(dir)
    store.append({
      kind: 'step.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1', runId: 'run_1', stepId: 'step_1' },
      entity: {
        type: 'step',
        value: {
          id: 'step_1',
          runId: 'run_1',
          type: 'message',
          status: 'completed',
          createdAt: '2026-05-21T00:00:01.000Z',
        },
      },
    })
    writeFileSync(join(dir, 'step-indexes', 'runs', 'run_1.jsonl'), '{not-json\n', 'utf8')

    const steps = store.listRunSteps('run_1')

    assert.deepEqual(steps.map((step) => step.id), ['step_1'])
    const rebuiltIndex = readFileSync(join(dir, 'step-indexes', 'runs', 'run_1.jsonl'), 'utf8')
    assert.equal(rebuiltIndex.includes('{not-json'), false)
    assert.equal(rebuiltIndex.includes('step_1'), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime log store lists run trace events from run-local offset index', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-runtime-log-run-traces-'))
  try {
    const store = new FileRuntimeLogStore(dir)
    store.append({
      kind: 'trace.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1', runId: 'run_1', traceId: 'trace_1' },
      entity: {
        type: 'trace',
        value: {
          id: 'trace_1',
          runId: 'run_1',
          kind: 'model_call',
          title: 'First trace',
          status: 'started',
          createdAt: '2026-05-21T00:00:01.000Z',
          data: { phase: 'request' },
        },
      },
    })
    store.append({
      kind: 'trace.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_2', runId: 'run_other', traceId: 'trace_other' },
      entity: {
        type: 'trace',
        value: {
          id: 'trace_other',
          runId: 'run_other',
          kind: 'tool_call',
          title: 'Other trace',
          status: 'completed',
          createdAt: '2026-05-21T00:00:01.500Z',
        },
      },
    })
    store.append({
      kind: 'trace.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1', runId: 'run_1', traceId: 'trace_2' },
      entity: {
        type: 'trace',
        value: {
          id: 'trace_2',
          runId: 'run_1',
          kind: 'tool_call',
          title: 'Second trace',
          status: 'completed',
          createdAt: '2026-05-21T00:00:02.000Z',
        },
      },
    })
    store.append({
      kind: 'trace.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1', runId: 'run_1', traceId: 'trace_1' },
      entity: {
        type: 'trace',
        value: {
          id: 'trace_1',
          runId: 'run_1',
          kind: 'model_call',
          title: 'First trace completed',
          status: 'completed',
          createdAt: '2026-05-21T00:00:01.000Z',
          data: { phase: 'response' },
        },
      },
    })

    assert.equal(existsSync(join(dir, 'trace-index.jsonl')), true)
    assert.equal(existsSync(join(dir, 'trace-indexes', 'runs', 'run_1.jsonl')), true)
    const runTraceIndexRecords = readFileSync(join(dir, 'trace-indexes', 'runs', 'run_1.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { runId?: string; traceId?: string })
    assert.deepEqual(runTraceIndexRecords.map((record) => record.runId), ['run_1', 'run_1', 'run_1'])
    assert.deepEqual(runTraceIndexRecords.map((record) => record.traceId), ['trace_1', 'trace_2', 'trace_1'])

    const reopened = new FileRuntimeLogStore(dir)
    const traces = reopened.listRunTraceEvents('run_1')

    assert.deepEqual(traces.map((trace) => trace.id), ['trace_1', 'trace_2'])
    assert.equal(traces[0]?.status, 'completed')
    assert.deepEqual(traces[0]?.data, { phase: 'response' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime log run trace index is rebuilt from append-only events when missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-runtime-log-trace-index-rebuild-'))
  try {
    const store = new FileRuntimeLogStore(dir)
    store.append({
      kind: 'trace.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1', runId: 'run_1', traceId: 'trace_1' },
      entity: {
        type: 'trace',
        value: {
          id: 'trace_1',
          runId: 'run_1',
          kind: 'model_call',
          title: 'Trace',
          status: 'completed',
          createdAt: '2026-05-21T00:00:01.000Z',
        },
      },
    })
    rmSync(join(dir, 'trace-index.jsonl'), { force: true })
    rmSync(join(dir, 'trace-indexes'), { recursive: true, force: true })

    const reopened = new FileRuntimeLogStore(dir)
    const traces = reopened.listRunTraceEvents('run_1')

    assert.equal(existsSync(join(dir, 'trace-index.jsonl')), true)
    assert.equal(existsSync(join(dir, 'trace-indexes', 'runs', 'run_1.jsonl')), true)
    assert.deepEqual(traces.map((trace) => trace.id), ['trace_1'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime log message offset index is rebuilt from append-only events when missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-runtime-log-message-index-rebuild-'))
  try {
    const store = new FileRuntimeLogStore(dir)
    store.append({
      kind: 'message.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1', messageId: 'msg_1' },
      entity: {
        type: 'message',
        value: {
          id: 'msg_1',
          threadId: 'thread_1',
          role: 'user',
          content: 'first',
          createdAt: '2026-05-21T00:00:01.000Z',
        },
      },
    })
    store.append({
      kind: 'message.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1', messageId: 'msg_2' },
      entity: {
        type: 'message',
        value: {
          id: 'msg_2',
          threadId: 'thread_1',
          role: 'assistant',
          content: 'second',
          createdAt: '2026-05-21T00:00:02.000Z',
        },
      },
    })
    rmSync(join(dir, 'message-index.jsonl'), { force: true })
    rmSync(join(dir, 'message-indexes'), { recursive: true, force: true })

    const reopened = new FileRuntimeLogStore(dir)
    const page = reopened.listThreadMessagesPage({ threadId: 'thread_1', limit: 10 })

    assert.equal(existsSync(join(dir, 'message-index.jsonl')), true)
    assert.equal(existsSync(join(dir, 'message-indexes', 'threads', 'thread_1.jsonl')), true)
    assert.deepEqual(page.messages.map((message) => message.id), ['msg_1', 'msg_2'])
    assert.equal(page.scan.eventsRead, 2)
    assert.equal(page.scan.matchedEvents, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime log message page rebuilds a malformed thread message offset index', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-runtime-log-message-index-malformed-'))
  try {
    const store = new FileRuntimeLogStore(dir)
    store.append({
      kind: 'message.upserted',
      causality: { sessionId: 'session_1', threadId: 'thread_1', messageId: 'msg_1' },
      entity: {
        type: 'message',
        value: {
          id: 'msg_1',
          threadId: 'thread_1',
          role: 'user',
          content: 'first',
          createdAt: '2026-05-21T00:00:01.000Z',
        },
      },
    })
    writeFileSync(join(dir, 'message-indexes', 'threads', 'thread_1.jsonl'), '{not-json\n', 'utf8')

    const page = store.listThreadMessagesPage({ threadId: 'thread_1', limit: 10 })

    assert.deepEqual(page.messages.map((message) => message.id), ['msg_1'])
    assert.equal(page.scan.malformedLines, 0)
    const rebuiltIndex = readFileSync(join(dir, 'message-indexes', 'threads', 'thread_1.jsonl'), 'utf8')
    assert.equal(rebuiltIndex.includes('{not-json'), false)
    assert.equal(rebuiltIndex.includes('msg_1'), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})


test('runtime log store writes and reads gzip JSON blobs safely', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-runtime-log-blob-'))
  try {
    const store = new FileRuntimeLogStore(dir)
    const ref = store.writeJSONBlob({ payload: 'x'.repeat(10_000), ok: true }, { scope: ['runs', 'run_1'], name: 'result' })

    assert.equal(ref.runtimeLogBlobRef, true)
    assert.equal(ref.encoding, 'gzip')
    assert.match(ref.hash, /^sha256:[a-f0-9]{64}$/)
    const readBack = store.readJSONBlob(ref) as { payload?: string; ok?: boolean } | undefined
    assert.equal(readBack?.payload?.length, 10_000)
    assert.equal(readBack?.ok, true)
    assert.equal(store.readJSONBlob({ ...ref, path: '../outside.json.gz' }), undefined)
    assert.equal(store.readJSONBlob({ ...ref, hash: 'sha256:bad' }), undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
