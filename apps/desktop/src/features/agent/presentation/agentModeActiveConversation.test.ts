import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldRestoreProjectAgentActiveConversation } from './agentModeActiveConversation'

test('project agent workspace keeps new draft conversations active', () => {
  assert.equal(shouldRestoreProjectAgentActiveConversation({
    activeConversationId: 'movscript.codex.default.threadScope:draft:lz01_abcd12',
    activeConversationOpen: false,
  }), false)

  assert.equal(shouldRestoreProjectAgentActiveConversation({
    activeConversationId: 'thread_1',
    activeConversationOpen: true,
  }), false)

  assert.equal(shouldRestoreProjectAgentActiveConversation({
    activeConversationId: 'missing_thread',
    activeConversationOpen: false,
  }), true)
})
