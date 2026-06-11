import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  agentConversationTabMenuAnchorStyleFromPosition,
  agentConversationTabMenuPositionFromClientPointInWindow,
  agentConversationTabMenuPositionFromClientPoint,
  agentConversationTabMenuPositionFromPointerEvent,
  agentConversationTabMenuPositionFromTriggerElement,
  agentConversationTabMenuPositionFromTriggerRect,
} from './agentConversationTabMenuPlacement'

test('agent conversation tab menu placement clamps pointer menus inside the viewport', () => {
  assert.deepEqual(
    agentConversationTabMenuPositionFromClientPoint(
      { x: 120, y: 80 },
      { width: 800, height: 600 },
    ),
    { x: 120, y: 80 },
  )

  assert.deepEqual(
    agentConversationTabMenuPositionFromClientPoint(
      { x: 790, y: 590 },
      { width: 800, height: 600 },
    ),
    { x: 584, y: 434 },
  )

  assert.deepEqual(
    agentConversationTabMenuPositionFromClientPoint(
      { x: -20, y: Number.NaN },
      { width: 100, height: 90 },
    ),
    { x: 8, y: 8 },
  )
})

test('agent conversation tab menu placement anchors keyboard menus from the trigger rect', () => {
  assert.deepEqual(
    agentConversationTabMenuPositionFromTriggerRect(
      { left: 40, bottom: 60 },
      { width: 800, height: 600 },
    ),
    { x: 56, y: 64 },
  )

  assert.deepEqual(
    agentConversationTabMenuPositionFromTriggerRect(
      { left: 720, bottom: 560 },
      { width: 800, height: 600 },
    ),
    { x: 584, y: 434 },
  )
})

test('agent conversation tab menu anchor style is derived at the placement boundary', () => {
  assert.deepEqual(
    agentConversationTabMenuAnchorStyleFromPosition({ x: 32, y: 48 }),
    { left: 32, top: 48 },
  )

  assert.deepEqual(
    agentConversationTabMenuAnchorStyleFromPosition({ x: Number.NaN, y: Number.POSITIVE_INFINITY }),
    { left: 0, top: 0 },
  )
})

test('agent conversation tab menu placement can read viewport and trigger element at the helper boundary', () => {
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { innerWidth: 800, innerHeight: 600 },
  })

  try {
    assert.deepEqual(
      agentConversationTabMenuPositionFromClientPointInWindow({ x: 790, y: 590 }),
      { x: 584, y: 434 },
    )
    assert.deepEqual(
      agentConversationTabMenuPositionFromPointerEvent({ clientX: 790, clientY: 590 }),
      { x: 584, y: 434 },
    )
    assert.deepEqual(
      agentConversationTabMenuPositionFromTriggerElement({
        getBoundingClientRect: () => ({ left: 40, bottom: 60 }),
      } as Pick<HTMLElement, 'getBoundingClientRect'>),
      { x: 56, y: 64 },
    )
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
  }
})
