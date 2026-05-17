import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeAgentSettings, normalizeConvsByUser, type UserConvState } from './agentStore'

test('normalizeAgentSettings preserves valid planner dispatch preferences', () => {
  const settings = normalizeAgentSettings({
    planMaxWorkers: 4,
    planMaxTaskAttempts: 3,
    planWorkerTimeoutMs: 60 * 60_000,
  })

  assert.equal(settings.planMaxWorkers, 4)
  assert.equal(settings.planMaxTaskAttempts, 3)
  assert.equal(settings.planWorkerTimeoutMs, 60 * 60_000)
})

test('normalizeAgentSettings falls back from invalid persisted planner dispatch preferences', () => {
  const settings = normalizeAgentSettings({
    planMaxWorkers: 99,
    planMaxTaskAttempts: 0,
    planWorkerTimeoutMs: 1234,
  })

  assert.equal(settings.planMaxWorkers, 2)
  assert.equal(settings.planMaxTaskAttempts, 2)
  assert.equal(settings.planWorkerTimeoutMs, 15 * 60_000)
})

test('normalizeConvsByUser preserves historical agent messages and rewrites persisted resource previews', () => {
  const state: Record<string, UserConvState> = {
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
  const message = normalized['7'].conversations[0].messages[0]
  const messageAttachment = message.attachments?.[0]
  const draftAttachment = normalized['7'].draftsByConversation['conv-1'].attachments[0]

  assert.equal(normalized['7'].activeConversationId, 'conv-1')
  assert.equal(message.meta?.localRunActivity?.runId, 'run-1')
  assert.equal(messageAttachment?.url, '/api/v1/resources/42/file')
  assert.equal(messageAttachment?.previewUrl, undefined)
  assert.equal(draftAttachment.url, '/api/v1/resources/42/file')
  assert.equal(draftAttachment.previewUrl, undefined)
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
      conversations: [new RuntimeConversation()] as unknown as UserConvState['conversations'],
      draftsByConversation: {},
    },
  })

  assert.deepEqual(normalized['7'].conversations, [])
  assert.equal(normalized['7'].activeConversationId, null)
})
