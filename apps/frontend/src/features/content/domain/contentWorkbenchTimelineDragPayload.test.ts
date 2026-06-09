import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  CONTENT_WORKBENCH_TIMELINE_OFFSET_DRAG_TYPE,
  CONTENT_WORKBENCH_TIMELINE_UNIT_DRAG_TYPE,
  readContentWorkbenchTimelineDragPayload,
  writeContentWorkbenchTimelineDragPayload,
  type ContentWorkbenchTimelineDragDataTransfer,
} from './contentWorkbenchTimelineDragPayload'

class FakeDataTransfer implements ContentWorkbenchTimelineDragDataTransfer {
  readonly data = new Map<string, string>()
  effectAllowed?: string

  setData(type: string, data: string) {
    this.data.set(type, data)
  }

  getData(type: string) {
    return this.data.get(type) ?? ''
  }
}

test('writes content workbench timeline drag payload', () => {
  const dataTransfer = new FakeDataTransfer()

  writeContentWorkbenchTimelineDragPayload(dataTransfer, {
    unitId: 12,
    dragOffsetSec: 1.25,
  })

  assert.equal(dataTransfer.effectAllowed, 'move')
  assert.equal(dataTransfer.getData(CONTENT_WORKBENCH_TIMELINE_UNIT_DRAG_TYPE), '12')
  assert.equal(dataTransfer.getData(CONTENT_WORKBENCH_TIMELINE_OFFSET_DRAG_TYPE), '1.25')
})

test('reads content workbench timeline drag payload', () => {
  const dataTransfer = new FakeDataTransfer()
  writeContentWorkbenchTimelineDragPayload(dataTransfer, {
    unitId: 12,
    dragOffsetSec: 1.25,
  })

  assert.deepEqual(readContentWorkbenchTimelineDragPayload(dataTransfer), {
    unitId: 12,
    dragOffsetSec: 1.25,
  })
})

test('falls back to active dragged unit id and normalizes invalid offset', () => {
  const dataTransfer = new FakeDataTransfer()
  dataTransfer.setData(CONTENT_WORKBENCH_TIMELINE_OFFSET_DRAG_TYPE, 'bad')

  assert.deepEqual(readContentWorkbenchTimelineDragPayload(dataTransfer, { fallbackUnitId: 7 }), {
    unitId: 7,
    dragOffsetSec: 0,
  })
})

test('rejects missing or invalid unit ids', () => {
  const dataTransfer = new FakeDataTransfer()
  dataTransfer.setData(CONTENT_WORKBENCH_TIMELINE_UNIT_DRAG_TYPE, '0')

  assert.equal(readContentWorkbenchTimelineDragPayload(dataTransfer), null)
  assert.equal(readContentWorkbenchTimelineDragPayload(dataTransfer, { fallbackUnitId: -1 }), null)
})
