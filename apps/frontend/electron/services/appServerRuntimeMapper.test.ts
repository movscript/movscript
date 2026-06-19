import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeAppServerNotification,
  normalizeAppServerThread,
  normalizeAppServerThreadItem,
  requireAppServerThread,
  requireAppServerTurn,
  threadIdFromAppServerNotification,
} from './appServerRuntimeMapper'

const context = {
  api: 'codex-app-server',
  provider: { kind: 'codex' },
}

test('app-server mapper normalizes native threads into neutral agent chat threads', () => {
  const [thread] = normalizeAppServerThread({
    id: 'thread_1',
    sessionId: 'session_tree_1',
    preview: 'Preview',
    name: 'Thread name',
    status: 'active',
    cwd: '/tmp/project',
    turns: [
      {
        id: 'turn_1',
        items: [
          {
            type: 'userMessage',
            id: 'message_1',
            clientId: 'client_1',
            content: [
              { type: 'text', text: 'hello', text_elements: [{ text: 'hello' }] },
            ],
          },
        ],
      },
    ],
  }, context)

  assert.equal(thread?.provider, 'codex')
  assert.equal(thread?.providerThreadId, 'thread_1')
  assert.equal(thread?.providerSessionTreeId, 'session_tree_1')
  assert.equal(thread?.status, 'running')
  assert.equal(thread?.turns[0]?.items[0]?.type, 'userMessage')
  assert.deepEqual(thread?.turns[0]?.items[0], {
    type: 'userMessage',
    id: 'message_1',
    clientId: 'client_1',
    content: [
      { type: 'text', text: 'hello', textElements: [{ text: 'hello' }] },
    ],
    raw: {
      type: 'userMessage',
      id: 'message_1',
      clientId: 'client_1',
      content: [
        { type: 'text', text: 'hello', text_elements: [{ text: 'hello' }] },
      ],
    },
  })
})

test('app-server mapper normalizes review and fallback items', () => {
  assert.deepEqual(normalizeAppServerThreadItem({ type: 'enteredReviewMode', review: 'security' }), [
    {
      type: 'reviewMode',
      id: 'enteredReviewMode',
      action: 'entered',
      review: 'security',
      raw: { type: 'enteredReviewMode', review: 'security' },
    },
  ])

  const [fallback] = normalizeAppServerThreadItem({ type: 'reasoning', text: 'thinking' })
  assert.equal(fallback?.type, 'reasoning')
  assert.equal(typeof fallback?.id, 'string')
})

test('app-server mapper normalizes notification params and extracts thread ids', () => {
  const notification = normalizeAppServerNotification({
    method: 'thread/updated',
    params: {
      thread: {
        id: 'thread_1',
        status: 'completed',
        item: { type: 'reasoning' },
      },
      item: {
        type: 'userMessage',
        content: [{ type: 'text', text: 'hi' }],
      },
    },
  }, context)

  assert.equal(notification.method, 'thread/updated')
  assert.equal(threadIdFromAppServerNotification(notification), 'thread_1')
  assert.equal((notification.params as { thread?: { providerThreadId?: string } }).thread?.providerThreadId, 'thread_1')
  assert.equal((notification.params as { item?: { type?: string } }).item?.type, 'userMessage')
})

test('app-server mapper requires thread and turn payloads', () => {
  assert.equal(requireAppServerThread({ thread: { id: 'thread_1' } }, context).id, 'thread_1')
  assert.equal(requireAppServerTurn({ turn: { id: 'turn_1' } }).id, 'turn_1')
  assert.throws(() => requireAppServerThread({}, context), /did not include a thread/)
  assert.throws(() => requireAppServerTurn({}), /did not include a turn/)
})
