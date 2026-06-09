import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { RawResource } from '@/types'

import {
  CANVAS_RESOURCE_DRAG_TYPE,
  RESOURCE_ID_DRAG_TYPE,
  hasResourceDragPayload,
  readResourceDragPayload,
  readResourceFromDragPayload,
  readResourceIdDragPayload,
  writeResourceDragPayload,
  type ResourceDragDataTransfer,
} from './resourceDragPayload'

class FakeDataTransfer implements ResourceDragDataTransfer {
  readonly data = new Map<string, string>()
  effectAllowed?: string

  get types() {
    return [...this.data.keys()]
  }

  setData(type: string, data: string) {
    this.data.set(type, data)
  }

  getData(type: string) {
    return this.data.get(type) ?? ''
  }
}

const resource = {
  ID: 42,
  name: 'reference.png',
  type: 'image',
  size: 1024,
} as RawResource

test('writes resource drag payload with both resource id and canvas resource keys', () => {
  const dataTransfer = new FakeDataTransfer()

  writeResourceDragPayload(dataTransfer, resource)

  assert.equal(dataTransfer.getData(RESOURCE_ID_DRAG_TYPE), '42')
  assert.deepEqual(JSON.parse(dataTransfer.getData(CANVAS_RESOURCE_DRAG_TYPE)), resource)
  assert.equal(dataTransfer.effectAllowed, 'copy')
  assert.equal(hasResourceDragPayload(dataTransfer.types), true)
})

test('reads resource drag payload from full resource data', () => {
  const dataTransfer = new FakeDataTransfer()
  writeResourceDragPayload(dataTransfer, resource)

  assert.deepEqual(readResourceDragPayload(dataTransfer), {
    resourceId: 42,
    resource,
  })
  assert.deepEqual(readResourceFromDragPayload(dataTransfer), resource)
  assert.equal(readResourceIdDragPayload(dataTransfer), 42)
})

test('falls back to resource id when full resource JSON is missing or malformed', () => {
  const dataTransfer = new FakeDataTransfer()
  dataTransfer.setData(RESOURCE_ID_DRAG_TYPE, '7')
  dataTransfer.setData(CANVAS_RESOURCE_DRAG_TYPE, '{')

  assert.deepEqual(readResourceDragPayload(dataTransfer), {
    resourceId: 7,
    resource: null,
  })
})

test('rejects missing or invalid resource ids', () => {
  const dataTransfer = new FakeDataTransfer()
  dataTransfer.setData(RESOURCE_ID_DRAG_TYPE, '0')

  assert.equal(readResourceDragPayload(dataTransfer), null)
  assert.equal(readResourceIdDragPayload(dataTransfer), null)
  assert.equal(hasResourceDragPayload([]), false)
})
