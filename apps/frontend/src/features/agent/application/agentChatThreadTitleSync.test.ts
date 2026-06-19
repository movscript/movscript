import assert from 'node:assert/strict'
import test from 'node:test'

import { agentChatThreadTitleUpdateFromNotification } from '@/features/agent/application/agentChatThreadTitleSync'

test('agent chat thread title sync accepts app-server and legacy SDK title payloads', () => {
  assert.deepEqual(agentChatThreadTitleUpdateFromNotification({
    method: 'thread/name/updated',
    params: { threadId: 'thread_1', threadName: '  Agent inferred title  ' },
  }), {
    threadId: 'thread_1',
    title: 'Agent inferred title',
  })

  assert.deepEqual(agentChatThreadTitleUpdateFromNotification({
    method: 'thread/name/updated',
    params: { threadId: 'thread_1', name: 'Legacy SDK title' },
  }), {
    threadId: 'thread_1',
    title: 'Legacy SDK title',
  })
})

test('agent chat thread title sync ignores notifications without a usable title', () => {
  assert.equal(agentChatThreadTitleUpdateFromNotification({
    method: 'thread/status/changed',
    params: { threadId: 'thread_1', status: 'running' },
  }), null)

  assert.equal(agentChatThreadTitleUpdateFromNotification({
    method: 'thread/name/updated',
    params: { threadId: 'thread_1', threadName: '   ' },
  }), null)

  assert.equal(agentChatThreadTitleUpdateFromNotification({
    method: 'thread/metadata/updated',
    params: { threadId: 'thread_1', preview: 'Preview only' },
  }), null)
})
