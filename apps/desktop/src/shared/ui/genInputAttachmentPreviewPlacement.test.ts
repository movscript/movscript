import assert from 'node:assert/strict'
import test from 'node:test'

import {
  genInputAttachmentPreviewPositionFromAnchorRect,
  genInputAttachmentPreviewPositionFromElement,
  genInputAttachmentPreviewStyleFromPosition,
} from './genInputAttachmentPreviewPlacement'

test('generation input attachment preview placement clamps horizontally and floats above the tag', () => {
  assert.deepEqual(
    genInputAttachmentPreviewPositionFromAnchorRect(
      { left: 120, top: 400 },
      { width: 800, height: 640 },
    ),
    { left: 120, top: 168 },
  )

  assert.deepEqual(
    genInputAttachmentPreviewPositionFromAnchorRect(
      { left: 760, top: 160 },
      { width: 800, height: 640 },
    ),
    { left: 576, top: 8 },
  )

  assert.deepEqual(
    genInputAttachmentPreviewPositionFromAnchorRect(
      { left: -40, top: 20 },
      { width: 120, height: 640 },
    ),
    { left: 8, top: 8 },
  )
})

test('generation input attachment preview placement can read from an interaction element', () => {
  const element = {
    getBoundingClientRect: () => ({ left: 20, top: 300 }),
  } as HTMLElement
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { innerWidth: 500, innerHeight: 600 },
  })

  try {
    assert.deepEqual(genInputAttachmentPreviewPositionFromElement(element), { left: 20, top: 68 })
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
  }
})

test('generation input attachment preview style is derived at the placement boundary', () => {
  assert.deepEqual(
    genInputAttachmentPreviewStyleFromPosition({ left: 32, top: 64 }),
    { left: 32, top: 64 },
  )

  assert.deepEqual(
    genInputAttachmentPreviewStyleFromPosition({ left: Number.NaN, top: Number.POSITIVE_INFINITY }),
    { left: 0, top: 0 },
  )
})
