import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeAssistantMessageTrace, summarizeRuntimeInputMessagesTrace, summarizeUserMessageTrace } from './messageTrace.js'

test('summarizeAssistantMessageTrace keeps refs and hashes without full content', () => {
  const summary = summarizeAssistantMessageTrace({
    messageId: 'msg_1',
    content: 'final answer',
    source: 'model',
  })

  assert.equal(summary.messageId, 'msg_1')
  assert.equal(summary.chars, 'final answer'.length)
  assert.match(String(summary.contentHash), /^sha256:/)
  assert.equal(summary.contentMode, 'summary')
  assert.equal(summary.content, undefined)
  assert.equal(summary.source, 'model')
})

test('summarizeRuntimeInputMessagesTrace keeps ids and hashes without full user content', () => {
  const summary = summarizeRuntimeInputMessagesTrace([{
    id: 'msg_runtime_1',
    content: 'please include this late constraint',
    createdAt: '2026-01-01T00:00:00.000Z',
    metadata: {
      kind: 'runtime_input',
      targetRunId: 'run_1',
      mode: 'soft',
      status: 'accepted',
      ignoredNested: { content: 'do not keep nested payloads' },
    },
  }]) as Array<Record<string, unknown>>

  assert.equal(summary[0]?.id, 'msg_runtime_1')
  assert.equal(summary[0]?.chars, 'please include this late constraint'.length)
  assert.match(String(summary[0]?.contentHash), /^sha256:/)
  assert.equal(summary[0]?.contentMode, 'summary')
  assert.equal(summary[0]?.content, undefined)
  assert.deepEqual(summary[0]?.metadata, {
    kind: 'runtime_input',
    targetRunId: 'run_1',
    mode: 'soft',
    status: 'accepted',
  })
})

test('summarizeUserMessageTrace keeps user message refs without full content', () => {
  const summary = summarizeUserMessageTrace({
    messageId: 'msg_user_1',
    content: 'private user request',
    source: 'run_input',
  })

  assert.equal(summary.messageId, 'msg_user_1')
  assert.equal(summary.chars, 'private user request'.length)
  assert.match(String(summary.contentHash), /^sha256:/)
  assert.equal(summary.contentMode, 'summary')
  assert.equal(summary.content, undefined)
  assert.equal(summary.source, 'run_input')
})
