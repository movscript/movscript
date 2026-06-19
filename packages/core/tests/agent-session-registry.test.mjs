import assert from 'node:assert/strict'
import test from 'node:test'

import {
  setAgentConversationRegistryOpen,
  upsertAgentConversationRegistryRecord,
} from '../dist/agent/index.js'

test('agent conversation registry open and metadata upserts preserve activity timestamps', () => {
  const original = {
    id: 'conv_1',
    userId: 'user_1',
    providerThreadId: 'thread_1',
    open: false,
    archived: false,
    createdAt: 1000,
    updatedAt: 2000,
  }
  const records = { conv_1: original }

  const opened = setAgentConversationRegistryOpen(records, 'conv_1', true)
  assert.equal(opened.conv_1?.open, true)
  assert.equal(opened.conv_1?.updatedAt, 2000)

  const upserted = upsertAgentConversationRegistryRecord(opened, {
    id: 'conv_1',
    userId: 'user_1',
    providerThreadId: 'thread_1',
    title: 'Renamed',
  })
  assert.equal(upserted.conv_1?.title, 'Renamed')
  assert.equal(upserted.conv_1?.updatedAt, 2000)

  const touchedByThreadActivity = upsertAgentConversationRegistryRecord(upserted, {
    id: 'conv_1',
    userId: 'user_1',
    providerThreadId: 'thread_1',
    updatedAt: 3000,
  })
  assert.equal(touchedByThreadActivity.conv_1?.updatedAt, 3000)
})
