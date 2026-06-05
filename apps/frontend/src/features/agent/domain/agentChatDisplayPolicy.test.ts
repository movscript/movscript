import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agentChatContentDefaultOpen,
  agentChatListDefaultOpen,
  AGENT_CHAT_COLLAPSE_LIMITS,
} from '@/features/agent/domain/agentChatDisplayPolicy'

test('agent chat display policy keeps short user-facing content open', () => {
  assert.equal(agentChatContentDefaultOpen('prompt', 'short prompt'), true)
  assert.equal(agentChatContentDefaultOpen('summary', 'short summary'), true)
  assert.equal(agentChatContentDefaultOpen('result', { ok: true }), true)
})

test('agent chat display policy collapses trace, arguments, and raw details by default', () => {
  assert.equal(agentChatContentDefaultOpen('trace', 'reasoning trace'), false)
  assert.equal(agentChatContentDefaultOpen('arguments', { path: 'a.ts' }), false)
  assert.equal(agentChatContentDefaultOpen('rawDetails', ['diff']), false)
})

test('agent chat display policy collapses long prompt-like content', () => {
  const longPrompt = 'x'.repeat(AGENT_CHAT_COLLAPSE_LIMITS.prompt + 1)
  assert.equal(agentChatContentDefaultOpen('prompt', longPrompt), false)
})

test('agent chat display policy keeps short lists open only', () => {
  assert.equal(agentChatListDefaultOpen(0), true)
  assert.equal(agentChatListDefaultOpen(3), true)
  assert.equal(agentChatListDefaultOpen(4), false)
})
