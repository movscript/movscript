import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Canvas, NodeType, RawResource } from '@/types'
import {
  acceptCanvasDropDragOver,
  canvasDropHasAcceptedPayload,
  createCanvasDropLayoutHitMap,
  createCanvasViewportDropHitMap,
  readCanvasDropPayload,
  startCanvasNodeTemplateDrag,
  startCanvasWorkflowDrag,
  type CanvasDropDataTransfer,
  type CanvasDropPayload,
} from './canvasDropTarget'
import { writeResourceDragPayload } from '@/features/resources/domain/resourceDragPayload'

class FakeDataTransfer implements CanvasDropDataTransfer {
  readonly data = new Map<string, string>()
  files?: File[]
  effectAllowed?: string
  dropEffect?: string

  get types() {
    const types = [...this.data.keys()]
    if (this.files?.length) types.push('Files')
    return types
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

const workflowCanvas = {
  ID: 9,
  owner_id: 1,
  name: 'Reference workflow',
  canvas_type: 'workflow',
} as Canvas

test('canvas drop target recognizes desktop file drops before typed drag payloads', () => {
  const dataTransfer = new FakeDataTransfer()
  dataTransfer.files = [{ name: 'frame.png', type: 'image/png' } as File]
  startCanvasNodeTemplateDrag(dataTransfer, 'text' as NodeType)

  assert.equal(canvasDropHasAcceptedPayload(dataTransfer), true)
  const payload = readCanvasDropPayload(dataTransfer)
  assert.equal(payload?.kind, 'files')
  assert.equal(payload?.kind === 'files' ? payload.files[0]?.name : undefined, 'frame.png')
})

test('canvas drop target reads resource and workflow canvas payloads', () => {
  const resourceTransfer = new FakeDataTransfer()
  writeResourceDragPayload(resourceTransfer, resource)
  assert.deepEqual(readCanvasDropPayload(resourceTransfer), { kind: 'resource', resource })

  const workflowTransfer = new FakeDataTransfer()
  assert.deepEqual(startCanvasWorkflowDrag(workflowTransfer, workflowCanvas), { kind: 'workflow-canvas', canvas: workflowCanvas })
  assert.deepEqual(readCanvasDropPayload(workflowTransfer), { kind: 'workflow-canvas', canvas: workflowCanvas })
})

test('canvas drop target validates canvas node template payloads with caller rules', () => {
  const dataTransfer = new FakeDataTransfer()
  assert.deepEqual(startCanvasNodeTemplateDrag(dataTransfer, 'text' as NodeType), { kind: 'canvas-node-template', nodeType: 'text' })

  assert.deepEqual(readCanvasDropPayload(dataTransfer, {
    isNodeTypeAllowed: (nodeType) => nodeType === 'text',
  }), { kind: 'canvas-node-template', nodeType: 'text' })
  assert.equal(readCanvasDropPayload(dataTransfer, {
    isNodeTypeAllowed: (nodeType) => nodeType !== 'text',
  }), null)
})

test('canvas drop target accepts drag-over only for known payloads inside a hit box', () => {
  const dataTransfer = new FakeDataTransfer()
  startCanvasNodeTemplateDrag(dataTransfer, 'text' as NodeType)
  const hitMap = createCanvasViewportDropHitMap({
    viewportRect: { left: 10, top: 20, right: 210, bottom: 120 },
  })

  assert.equal(acceptCanvasDropDragOver({
    dataTransfer,
    hitBox: hitMap.boxFromClient({ x: 20, y: 30 }),
  }), true)
  assert.equal(dataTransfer.dropEffect, 'copy')
  assert.equal(acceptCanvasDropDragOver({
    dataTransfer: new FakeDataTransfer(),
    hitBox: hitMap.boxFromClient({ x: 20, y: 30 }),
  }), false)
  assert.equal(acceptCanvasDropDragOver({
    dataTransfer,
    hitBox: null,
  }), false)
})

test('canvas drop target accepts drag-over payload types without committing malformed drops', () => {
  const dataTransfer = new FakeDataTransfer()
  dataTransfer.setData('application/canvas-resource', '{')

  assert.equal(canvasDropHasAcceptedPayload(dataTransfer), true)
  assert.equal(readCanvasDropPayload(dataTransfer), null)
  assert.equal(canvasDropHasAcceptedPayload({ types: [] }), false)
})

test('canvas viewport drop hit map resolves points inside the viewport box only', () => {
  const payload: CanvasDropPayload = { kind: 'canvas-node-template', nodeType: 'text' as NodeType }
  const hitMap = createCanvasViewportDropHitMap({
    viewportRect: { left: 10, top: 20, right: 210, bottom: 120 },
  })

  assert.equal(hitMap.boxFromClient({ x: 20, y: 30 }, payload)?.id, 'canvas.flow-viewport')
  assert.equal(hitMap.boxFromClient({ x: 9, y: 30 }, payload), null)
  assert.equal(hitMap.boxFromClient({ x: 20, y: 121 }, payload), null)
  assert.equal(hitMap.boxFromClient({ x: 20, y: 30 }, null), null)
})

test('canvas drop layout hit map applies z-index order and per-box accept rules', () => {
  const payload: CanvasDropPayload = { kind: 'canvas-node-template', nodeType: 'text' as NodeType }
  const hitMap = createCanvasDropLayoutHitMap([
    {
      id: 'bottom-content',
      role: 'content',
      rect: { left: 0, top: 0, right: 100, bottom: 100 },
      zIndex: 0,
      accepts: () => true,
    },
    {
      id: 'top-overlay',
      role: 'overlay',
      rect: { left: 20, top: 20, right: 80, bottom: 80 },
      zIndex: 10,
      accepts: () => false,
    },
  ])

  assert.equal(hitMap.boxFromClient({ x: 30, y: 30 }, payload)?.id, 'bottom-content')
  assert.equal(hitMap.boxFromClient({ x: 30, y: 30 })?.id, 'top-overlay')
  assert.equal(hitMap.boxFromClient({ x: 130, y: 30 }, payload), null)
})
