import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeConvsByUser } from './index'
import type { AgentUserConversationState } from './index'

test('normalizeConvsByUser preserves historical agent messages and rewrites persisted resource previews', () => {
  const state: Record<string, AgentUserConversationState> = {
    '7': {
      activeConversationId: 'conv-1',
      draftsByConversation: {
        'conv-1': {
          input: 'continue',
          attachments: [{
            id: 'draft-res-42',
            name: 'draft.png',
            type: 'image',
            mimeType: 'image/png',
            size: 100,
            resourceId: 42,
            previewUrl: 'blob:stale-draft',
          }],
        },
      },
      conversations: [{
        id: 'conv-1',
        title: 'Agent run',
        runtimeThreadId: 'thread-1',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [{
          id: 'msg-1',
          role: 'assistant',
          content: 'Output resource: #42',
          timestamp: 1500,
          attachments: [{
            id: 'generated-42',
            name: 'generated.png',
            type: 'image',
            mimeType: 'image/png',
            size: 123,
            url: 'blob:stale-message',
            previewUrl: 'blob:stale-preview',
            resourceId: 42,
          }],
          meta: {
            localRunActivity: {
              runId: 'run-1',
              threadId: 'thread-1',
              status: 'completed',
              createdAt: '2026-05-13T00:00:00.000Z',
              updatedAt: '2026-05-13T00:00:01.000Z',
              steps: [],
              events: [],
            },
          },
        }],
      }],
    },
  }

  const normalized = normalizeConvsByUser(state)
  const userState = normalized['7']
  const message = userState?.conversations[0]?.messages[0]
  const messageAttachment = message?.attachments?.[0]
  const draftAttachment = userState?.draftsByConversation['conv-1']?.attachments[0]

  assert.equal(userState?.activeConversationId, 'conv-1')
  assert.equal(userState?.conversations[0]?.runtimeThreadId, 'thread-1')
  assert.equal(message?.meta?.localRunActivity?.runId, 'run-1')
  assert.equal(messageAttachment?.url, '/api/v1/resources/42/file')
  assert.equal(messageAttachment?.previewUrl, undefined)
  assert.equal(draftAttachment?.url, '/api/v1/resources/42/file')
  assert.equal(draftAttachment?.previewUrl, undefined)
})

test('normalizeConvsByUser ignores non-plain persisted conversation records', () => {
  class RuntimeConversation {
    id = 'conv-runtime'
    title = 'Runtime conversation'
    messages = []
    createdAt = 1000
    updatedAt = 1000
  }

  const normalized = normalizeConvsByUser({
    '7': {
      activeConversationId: 'conv-runtime',
      conversations: [new RuntimeConversation()],
      draftsByConversation: {},
    },
  })

  assert.deepEqual(normalized['7']?.conversations, [])
  assert.equal(normalized['7']?.activeConversationId, null)
})

test('normalizeConvsByUser uses injected defaults for missing ids, titles, and timestamps', () => {
  const normalized = normalizeConvsByUser({
    user: {
      activeConversationId: 'missing',
      draftsByConversation: {},
      conversations: [{
        messages: [{ content: 'hello' }],
      }],
    },
  }, {
    createId: () => 'generated-id',
    defaultTitle: 'Default title',
    now: () => 123,
  })

  const conversation = normalized.user?.conversations[0]
  assert.equal(normalized.user?.activeConversationId, 'generated-id')
  assert.equal(conversation?.id, 'generated-id')
  assert.equal(conversation?.title, 'Default title')
  assert.equal(conversation?.createdAt, 123)
  assert.equal(conversation?.messages[0]?.id, 'generated-id')
  assert.equal(conversation?.messages[0]?.role, 'user')
  assert.equal(conversation?.messages[0]?.timestamp, 123)
})
