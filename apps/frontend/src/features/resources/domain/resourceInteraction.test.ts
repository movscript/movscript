import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  RESOURCE_CONTEXT_MENU_SAFE_INSET,
  acceptResourceDropDragOver,
  isResourceInteractiveDragTarget,
  resourceContextMenuPositionFromClient,
  resourceContextMenuPositionFromEvent,
  resourceDropAcceptsPayload,
  resourceViewportBoundaryFromWindow,
  resolveResourceDropResource,
  startResourceDragSource,
} from './resourceInteraction'
import {
  type ResourceDragDataTransfer,
  RESOURCE_ID_DRAG_TYPE,
  writeResourceDragPayload,
} from './resourceDragPayload'

class FakeDataTransfer implements ResourceDragDataTransfer {
  readonly data = new Map<string, string>()
  readonly types: string[] = []
  effectAllowed?: string
  dropEffect?: string

  setData(type: string, data: string) {
    if (!this.types.includes(type)) this.types.push(type)
    this.data.set(type, data)
  }

  getData(type: string) {
    return this.data.get(type) ?? ''
  }
}

test('resource context menu keeps client positions inside the viewport safe area', () => {
  assert.deepEqual(
    resourceContextMenuPositionFromClient(
      { x: 120, y: 90 },
      { width: 640, height: 480 },
      { width: 200, height: 160 },
    ),
    { x: 120, y: 90 },
  )

  assert.deepEqual(
    resourceContextMenuPositionFromClient(
      { x: 620, y: 470 },
      { width: 640, height: 480 },
      { width: 200, height: 160 },
    ),
    { x: 432, y: 312 },
  )

  assert.deepEqual(
    resourceContextMenuPositionFromClient(
      { x: -10, y: -20 },
      { width: 120, height: 90 },
      { width: 200, height: 160 },
    ),
    { x: RESOURCE_CONTEXT_MENU_SAFE_INSET, y: RESOURCE_CONTEXT_MENU_SAFE_INSET },
  )
})

test('resource viewport boundary normalizes window dimensions for interaction helpers', () => {
  assert.deepEqual(resourceViewportBoundaryFromWindow({ innerWidth: 1024, innerHeight: 768 }), {
    width: 1024,
    height: 768,
  })
})

test('resource context menu position can be derived from a native event boundary', () => {
  assert.deepEqual(
    resourceContextMenuPositionFromEvent(
      { clientX: 620, clientY: 470 },
      { width: 640, height: 480 },
      { width: 200, height: 160 },
    ),
    { x: 432, y: 312 },
  )
})

test('resource drag source writes typed payloads from non-interactive targets', () => {
  const dataTransfer = new FakeDataTransfer()

  assert.equal(
    startResourceDragSource({
      dataTransfer,
      resource: { ID: 42, type: 'image', title: 'Reference' } as any,
      target: null,
    }),
    true,
  )
  assert.equal(dataTransfer.getData(RESOURCE_ID_DRAG_TYPE), '42')
})

test('resource drag source rejects nested interactive controls', () => {
  const dataTransfer = new FakeDataTransfer()
  let prevented = false
  const interactiveTarget = {
    closest: (selector: string) => selector === '[data-resource-interactive="true"]' ? {} : null,
  } as Element

  assert.equal(isResourceInteractiveDragTarget(interactiveTarget), true)
  assert.equal(
    startResourceDragSource({
      dataTransfer,
      resource: { ID: 42, type: 'image', title: 'Reference' } as any,
      target: interactiveTarget,
      preventDefault: () => { prevented = true },
    }),
    false,
  )
  assert.equal(prevented, true)
  assert.equal(dataTransfer.getData(RESOURCE_ID_DRAG_TYPE), '')
})

test('resource drop interaction accepts typed resource payloads and marks copy effect', () => {
  const dataTransfer = new FakeDataTransfer()
  writeResourceDragPayload(dataTransfer, { ID: 42, type: 'image', title: 'Reference' } as any)

  assert.equal(resourceDropAcceptsPayload(dataTransfer), true)
  assert.equal(acceptResourceDropDragOver(dataTransfer), true)
  assert.equal(dataTransfer.dropEffect, 'copy')
})

test('resource drop interaction resolves dropped resources by payload id', () => {
  const dataTransfer = new FakeDataTransfer()
  writeResourceDragPayload(dataTransfer, { ID: 42, type: 'image', title: 'Reference' } as any)

  assert.deepEqual(
    resolveResourceDropResource({
      dataTransfer,
      resources: [
        { ID: 7, name: 'other' },
        { ID: 42, name: 'reference' },
      ],
    }),
    { ID: 42, name: 'reference' },
  )
})

test('resource drop interaction rejects missing or unresolved payload ids', () => {
  const dataTransfer = new FakeDataTransfer()
  dataTransfer.setData(RESOURCE_ID_DRAG_TYPE, '99')

  assert.equal(acceptResourceDropDragOver(new FakeDataTransfer()), false)
  assert.equal(
    resolveResourceDropResource({
      dataTransfer,
      resources: [{ ID: 42, name: 'reference' }],
    }),
    null,
  )
})
