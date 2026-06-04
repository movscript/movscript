import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canvasTextNodeEditState,
  createCanvasEdgeId,
  createPaletteCanvasNode,
  createResourceCanvasNode,
  createWorkflowReferenceCanvasNode,
  isPaletteNodeTypeAvailable,
  readOnlyMediaPortPatch,
} from './nodeFactory'
import type { Canvas, RawResource } from '@/types'

const t = (_key: string, options?: any) => options?.defaultValue ?? _key

test('readOnlyMediaPortPatch preserves AI defaults and locks uploaded media inputs', () => {
  assert.deepEqual(readOnlyMediaPortPatch('ai'), { inputPorts: undefined })
  assert.deepEqual(readOnlyMediaPortPatch('upload'), { inputPorts: [] })
})

test('canvasTextNodeEditState only allows manual non-resource text editing', () => {
  const textResource: RawResource = {
    ID: 14,
    owner_id: 1,
    type: 'text',
    name: 'Brief.txt',
    url: '/api/v1/resources/14/file',
    size: 32,
    mime_type: 'text/plain',
  }

  assert.deepEqual(canvasTextNodeEditState({ source: 'manual', textContent: 'workspace' }), {
    editable: true,
    resourceBacked: false,
  })
  assert.deepEqual(canvasTextNodeEditState({ source: 'upload', resourceId: 14, resource: textResource }), {
    editable: false,
    resourceBacked: true,
  })
  assert.deepEqual(canvasTextNodeEditState({ source: 'ai', textContent: 'generated' }), {
    editable: false,
    resourceBacked: false,
  })
})

test('createResourceCanvasNode creates a read-only uploaded media node', () => {
  const resource: RawResource = {
    ID: 12,
    owner_id: 1,
    type: 'image',
    name: 'Frame',
    url: '/api/v1/resources/12/file',
    size: 100,
    mime_type: 'image/png',
  }
  const node = createResourceCanvasNode({ resource, type: 'image', position: { x: 10, y: 20 }, t })

  assert.equal(node.type, 'image')
  assert.deepEqual(node.position, { x: 10, y: 20 })
  assert.equal((node.data as any).resourceId, 12)
  assert.equal((node.data as any).source, 'upload')
  assert.deepEqual((node.data as any).inputPorts, [])
})

test('createWorkflowReferenceCanvasNode persists referencedCanvasId and derived ports', () => {
  const workflow = {
    ID: 7,
    owner_id: 1,
    name: 'Referenced Workflow',
    canvas_type: 'workflow',
    stage: 'generation',
    ref_type: '',
    visibility: 'private',
    CreatedAt: '',
    UpdatedAt: '',
    DeletedAt: null,
    nodes: [
      {
        ID: 1,
        canvas_id: 7,
        node_id: 'prompt',
        type: 'input',
        label: 'Prompt',
        pos_x: 0,
        pos_y: 0,
        data: JSON.stringify({ paramName: 'prompt', paramType: 'text' }),
      },
    ],
    edges: [],
  } as Canvas
  const node = createWorkflowReferenceCanvasNode({ workflowCanvas: workflow, position: { x: 1, y: 2 }, t })

  assert.equal(node.type, 'canvas')
  assert.equal((node.data as any).source, 'ai')
  assert.equal((node.data as any).referencedCanvasId, 7)
  assert.equal((node.data as any).referencedCanvasName, 'Referenced Workflow')
  assert.deepEqual((node.data as any).inputPorts, [{
    id: 'prompt',
    label: 'prompt',
    type: 'text',
    order: 1,
    required: true,
  }])
})

test('createPaletteCanvasNode auto-numbers workflow input and output nodes', () => {
  const existing = [
    { id: 'in-1', type: 'input', position: { x: 0, y: 0 }, data: { source: 'manual', paramOrder: 1 } },
    { id: 'out-1', type: 'output', position: { x: 0, y: 0 }, data: { source: 'manual', paramOrder: 1 } },
  ] as any

  const input = createPaletteCanvasNode({ type: 'input', position: { x: 0, y: 0 }, t, existingNodes: existing })
  const output = createPaletteCanvasNode({ type: 'output', position: { x: 0, y: 0 }, t, existingNodes: existing })

  assert.equal((input.data as any).paramName, 'input_2')
  assert.equal((input.data as any).paramOrder, 2)
  assert.equal((output.data as any).paramName, 'output_2')
  assert.equal((output.data as any).paramOrder, 2)
})

test('isPaletteNodeTypeAvailable limits workflow IO and hides resource sink', () => {
  assert.equal(isPaletteNodeTypeAvailable('input', 'workflow'), true)
  assert.equal(isPaletteNodeTypeAvailable('input', 'inspiration'), false)
  assert.equal(isPaletteNodeTypeAvailable('output', 'workflow'), true)
  assert.equal(isPaletteNodeTypeAvailable('resource_sink', 'workflow'), false)
})

test('createCanvasEdgeId includes semantic connection identity', () => {
  const id = createCanvasEdgeId({ source: 'a', target: 'b', sourceHandle: 'out:image', targetHandle: 'in:image' })
  assert.match(id, /^a::image::b::image::/)
})
