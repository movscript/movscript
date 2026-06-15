import assert from 'node:assert/strict'
import test from 'node:test'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  AGENT_CONVERSATION_TAB_DRAG_TYPE,
  agentConversationTabClientPointFromEvent,
  agentConversationTabDropPositionFromClientPoint,
  agentConversationTabDropPositionFromClientX,
  readAgentConversationTabDragPayload,
  resolveAgentConversationTabDragOver,
  resolveAgentConversationTabDrop,
  startAgentConversationTabDrag,
  writeAgentConversationTabDragPayload,
} from '@/features/agent/components/conversation-tabs-ui/dragPayload'

class MemoryDataTransfer {
  private readonly values = new Map<string, string>()
  effectAllowed?: string
  dropEffect?: string

  setData(type: string, value: string) {
    this.values.set(type, value)
  }

  getData(type: string) {
    return this.values.get(type) ?? ''
  }
}

function tabElement(left: number, width: number) {
  return {
    getBoundingClientRect: () => ({ left, width }),
  } as Pick<HTMLElement, 'getBoundingClientRect'>
}

test('agent conversation tab drag payload uses typed data transfer helpers', () => {
  const dataTransfer = new MemoryDataTransfer()

  assert.equal(startAgentConversationTabDrag(dataTransfer, ' conversation-42 '), true)

  assert.equal(dataTransfer.effectAllowed, 'move')
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

test('agent conversation tab drag-over resolves target and owns move drop effect', () => {
  const dataTransfer = new MemoryDataTransfer()
  writeAgentConversationTabDragPayload(dataTransfer, 'conversation-42')

  assert.deepEqual(
    resolveAgentConversationTabDragOver({
      dataTransfer,
      draggingConversationId: null,
      targetConversationId: 'conversation-7',
      point: { x: 180 },
      tabElement: tabElement(100, 120),
    }),
    { conversationId: 'conversation-7', position: 'after' },
  )
  assert.equal(dataTransfer.dropEffect, 'move')

  assert.equal(
    resolveAgentConversationTabDragOver({
      dataTransfer,
      draggingConversationId: 'conversation-7',
      targetConversationId: 'conversation-7',
      point: { x: 120 },
      tabElement: tabElement(100, 120),
    }),
    null,
  )
})

test('agent conversation tab drop resolves dragged and target ids with insertion position', () => {
  const dataTransfer = new MemoryDataTransfer()
  writeAgentConversationTabDragPayload(dataTransfer, 'conversation-42')

  assert.deepEqual(
    resolveAgentConversationTabDrop({
      dataTransfer,
      draggingConversationId: null,
      targetConversationId: 'conversation-7',
      point: { x: 120 },
      tabElement: tabElement(100, 120),
    }),
    {
      draggedConversationId: 'conversation-42',
      targetConversationId: 'conversation-7',
      position: 'before',
    },
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

test('agent conversation tab drop position can be adapted from the tab interaction element', () => {
  const tabElement = {
    getBoundingClientRect: () => ({ left: 200, width: 120 }),
  } as Pick<HTMLElement, 'getBoundingClientRect'>

  assert.equal(agentConversationTabDropPositionFromClientPoint({ x: 240 }, tabElement), 'before')
  assert.equal(agentConversationTabDropPositionFromClientPoint({ x: 260 }, tabElement), 'after')
})

test('agent conversation tab pointer events are adapted outside the UI component', () => {
  assert.deepEqual(agentConversationTabClientPointFromEvent({ clientX: 248 }), { x: 248 })
})

test('agent conversation tabs panel does not use raw text drag payloads', () => {
  const tabsPanelSource = readFileSync(
    resolve('src/features/agent/components/AgentConversationTabsUi.tsx'),
    'utf8',
  )

  assert.match(tabsPanelSource, /startAgentConversationTabDrag/)
  assert.match(tabsPanelSource, /resolveAgentConversationTabDragOver/)
  assert.match(tabsPanelSource, /resolveAgentConversationTabDrop/)
  assert.doesNotMatch(tabsPanelSource, /writeAgentConversationTabDragPayload/)
  assert.doesNotMatch(tabsPanelSource, /readAgentConversationTabDragPayload/)
  assert.doesNotMatch(tabsPanelSource, /agentConversationTabDropPositionFromClientPoint/)
  assert.doesNotMatch(tabsPanelSource, /dataTransfer\.effectAllowed/)
  assert.doesNotMatch(tabsPanelSource, /dataTransfer\.dropEffect/)
  assert.doesNotMatch(tabsPanelSource, /event\.clientX/)
  assert.doesNotMatch(tabsPanelSource, /getBoundingClientRect\(\)/)
  assert.doesNotMatch(tabsPanelSource, /setData\("text\/plain"/)
  assert.doesNotMatch(tabsPanelSource, /getData\("text\/plain"/)
})
