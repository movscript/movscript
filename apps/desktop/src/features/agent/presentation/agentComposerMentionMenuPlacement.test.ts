import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  agentComposerMentionMenuPositionEqual,
  agentComposerMentionMenuPositionFromEditorElement,
  agentComposerMentionMenuPositionFromEditorRect,
  agentComposerMentionMenuStyleFromPosition,
} from './agentComposerMentionMenuPlacement'

test('agent composer mention menu placement anchors above the editor within viewport bounds', () => {
  assert.deepEqual(
    agentComposerMentionMenuPositionFromEditorRect(
      { top: 500, left: 80, width: 420 },
      { width: 900, height: 700 },
    ),
    { bottom: 206, left: 80, maxHeight: 360, width: 420 },
  )

  assert.deepEqual(
    agentComposerMentionMenuPositionFromEditorRect(
      { top: 80, left: 760, width: 420 },
      { width: 900, height: 700 },
    ),
    { bottom: 626, left: 472, maxHeight: 120, width: 420 },
  )

  assert.deepEqual(
    agentComposerMentionMenuPositionFromEditorRect(
      { top: 300, left: -40, width: 120 },
      { width: 320, height: 640 },
    ),
    { bottom: 346, left: 8, maxHeight: 286, width: 304 },
  )
})

test('agent composer mention menu placement equality avoids redundant updates', () => {
  const position = { bottom: 100, left: 20, maxHeight: 240, width: 360 }

  assert.equal(agentComposerMentionMenuPositionEqual(null, position), false)
  assert.equal(agentComposerMentionMenuPositionEqual(position, { ...position }), true)
  assert.equal(agentComposerMentionMenuPositionEqual(position, { ...position, left: 21 }), false)
})

test('agent composer mention menu style is derived at the placement boundary', () => {
  assert.deepEqual(
    agentComposerMentionMenuStyleFromPosition({ bottom: 226, left: 48, maxHeight: 360, width: 420 }),
    {
      '--ai-agent-resource-mention-menu-max-height': '360px',
      bottom: 226,
      left: 48,
      width: 420,
    },
  )

  assert.deepEqual(
    agentComposerMentionMenuStyleFromPosition({ bottom: Number.NaN, left: -12, maxHeight: Number.POSITIVE_INFINITY, width: 0 }),
    {
      '--ai-agent-resource-mention-menu-max-height': '0px',
      bottom: 0,
      left: 0,
      width: 0,
    },
  )
})

test('agent composer mention menu placement can read from an editor element boundary', () => {
  const editor = {
    getBoundingClientRect: () => ({ top: 420, left: 48, width: 300 }),
  }

  assert.deepEqual(
    agentComposerMentionMenuPositionFromEditorElement(editor, { width: 800, height: 640 }),
    { bottom: 226, left: 48, maxHeight: 360, width: 360 },
  )
})
