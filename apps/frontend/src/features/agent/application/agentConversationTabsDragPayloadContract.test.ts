import assert from 'node:assert/strict'
import test from 'node:test'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  AGENT_CONVERSATION_TAB_DRAG_TYPE,
  agentConversationTabDropPositionFromClientX,
  readAgentConversationTabDragPayload,
  writeAgentConversationTabDragPayload,
} from '../../../../../../packages/ui/src/components/business/agent/chat/tabs/panel/dragPayload'

class MemoryDataTransfer {
  private readonly values = new Map<string, string>()

  setData(type: string, value: string) {
    this.values.set(type, value)
  }

  getData(type: string) {
    return this.values.get(type) ?? ''
  }
}

test('agent conversation tab drag payload uses typed data transfer helpers', () => {
  const dataTransfer = new MemoryDataTransfer()

  writeAgentConversationTabDragPayload(dataTransfer, ' conversation-42 ')

  assert.equal(dataTransfer.getData('text/plain'), '')
  assert.deepEqual(readAgentConversationTabDragPayload(dataTransfer), {
    kind: 'agent-conversation-tab',
    conversationId: 'conversation-42',
  })
  assert.equal(
    JSON.parse(dataTransfer.getData(AGENT_CONVERSATION_TAB_DRAG_TYPE)).kind,
    'agent-conversation-tab',
  )
})

test('agent conversation tab drag payload rejects invalid payloads', () => {
  const dataTransfer = new MemoryDataTransfer()

  assert.equal(readAgentConversationTabDragPayload(dataTransfer), null)

  dataTransfer.setData(AGENT_CONVERSATION_TAB_DRAG_TYPE, '{')
  assert.equal(readAgentConversationTabDragPayload(dataTransfer), null)

  dataTransfer.setData(AGENT_CONVERSATION_TAB_DRAG_TYPE, JSON.stringify({ kind: 'agent-conversation-tab', conversationId: ' ' }))
  assert.equal(readAgentConversationTabDragPayload(dataTransfer), null)

  dataTransfer.setData(AGENT_CONVERSATION_TAB_DRAG_TYPE, JSON.stringify({ kind: 'other', conversationId: 'conversation-42' }))
  assert.equal(readAgentConversationTabDragPayload(dataTransfer), null)
})

test('agent conversation tab drop position uses a pure client x adapter', () => {
  const tabRect = { left: 100, width: 80 }

  assert.equal(agentConversationTabDropPositionFromClientX(120, tabRect), 'before')
  assert.equal(agentConversationTabDropPositionFromClientX(140, tabRect), 'after')
  assert.equal(agentConversationTabDropPositionFromClientX(170, tabRect), 'after')
})

test('agent conversation tabs panel does not use raw text drag payloads', () => {
  const tabsPanelSource = readFileSync(
    resolve('../../packages/ui/src/components/business/agent/chat/tabs/panel/index.tsx'),
    'utf8',
  )

  assert.match(tabsPanelSource, /writeAgentConversationTabDragPayload/)
  assert.match(tabsPanelSource, /readAgentConversationTabDragPayload/)
  assert.match(tabsPanelSource, /agentConversationTabDropPositionFromClientX/)
  assert.doesNotMatch(tabsPanelSource, /setData\("text\/plain"/)
  assert.doesNotMatch(tabsPanelSource, /getData\("text\/plain"/)
})
