import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Canvas, NodeType } from '@movscript/shared'

import {
  CANVAS_NODE_TYPE_DRAG_TYPE,
  CANVAS_WORKFLOW_DRAG_TYPE,
  hasCanvasDragPayload,
  readCanvasNodeTypeDragPayload,
  readCanvasWorkflowDragPayload,
  writeCanvasNodeTypeDragPayload,
  writeCanvasWorkflowDragPayload,
  type CanvasDragDataTransfer,
} from './canvasDragPayload'

class FakeDataTransfer implements CanvasDragDataTransfer {
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

const workflowCanvas = {
  ID: 9,
  owner_id: 1,
  name: 'Reference workflow',
  canvas_type: 'workflow',
} as Canvas

test('writes and reads canvas node type drag payload', () => {
  const dataTransfer = new FakeDataTransfer()

  writeCanvasNodeTypeDragPayload(dataTransfer, 'text' as NodeType)

  assert.equal(dataTransfer.getData(CANVAS_NODE_TYPE_DRAG_TYPE), 'text')
  assert.equal(readCanvasNodeTypeDragPayload(dataTransfer), 'text')
  assert.equal(dataTransfer.effectAllowed, 'copy')
  assert.equal(hasCanvasDragPayload(dataTransfer.types), true)
})

test('writes and reads canvas workflow drag payload', () => {
  const dataTransfer = new FakeDataTransfer()

  writeCanvasWorkflowDragPayload(dataTransfer, workflowCanvas)

  assert.deepEqual(JSON.parse(dataTransfer.getData(CANVAS_WORKFLOW_DRAG_TYPE)), workflowCanvas)
  assert.deepEqual(readCanvasWorkflowDragPayload(dataTransfer), workflowCanvas)
  assert.equal(dataTransfer.effectAllowed, 'copy')
  assert.equal(hasCanvasDragPayload(dataTransfer.types), true)
})

test('rejects malformed canvas drag payloads', () => {
  const dataTransfer = new FakeDataTransfer()
  dataTransfer.setData(CANVAS_NODE_TYPE_DRAG_TYPE, '')
  dataTransfer.setData(CANVAS_WORKFLOW_DRAG_TYPE, '{"ID":0}')

  assert.equal(readCanvasNodeTypeDragPayload(dataTransfer), null)
  assert.equal(readCanvasWorkflowDragPayload(dataTransfer), null)
  assert.equal(hasCanvasDragPayload([]), false)
})
