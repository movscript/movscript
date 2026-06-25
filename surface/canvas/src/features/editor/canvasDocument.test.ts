import assert from 'node:assert/strict'
import test from 'node:test'
import type { Canvas } from '@movscript/shared'
import { buildCanvasSavePayload, hydrateCanvasDocument } from './canvasDocument.ts'

test('hydrateCanvasDocument converts persisted canvas graph to React Flow graph', () => {
  const canvas = canvasFixture({
    canvas_type: 'workflow',
    nodes: [
      {
        ID: 1,
        canvas_id: 1,
        node_id: 'text-1',
        type: 'text',
        label: 'Text',
        pos_x: 120,
        pos_y: 160,
        data: JSON.stringify({ source: 'manual', textContent: 'hello', _parentId: 'group-1', _style: { width: 40 } }),
      },
      {
        ID: 2,
        canvas_id: 1,
        node_id: 'group-1',
        type: 'group',
        label: 'Group',
        pos_x: 80,
        pos_y: 100,
        data: JSON.stringify({ source: 'manual', _style: { width: 300, height: 180 } }),
      },
    ],
    edges: [
      {
        ID: 1,
        canvas_id: 1,
        edge_id: 'text-output',
        source: 'text-1',
        target: 'final-output',
        source_handle: 'text',
        target_handle: 'value',
      },
    ],
  })

  const hydrated = hydrateCanvasDocument(canvas, t)

  assert.deepEqual(hydrated.nodes.map((node) => node.id), ['group-1', 'text-1', 'final-output'])
  const textNode = hydrated.nodes.find((node) => node.id === 'text-1')
  assert.equal(textNode?.parentId, undefined)
  assert.equal((textNode?.data as any).groupId, 'group-1')
  assert.deepEqual(textNode?.position, { x: 200, y: 260 })
  assert.equal(textNode?.style?.width, 220)
  assert.equal(hydrated.edges[0].sourceHandle, 'out:text')
  assert.equal(hydrated.edges[0].targetHandle, 'in:value')
  assert.match(hydrated.signature, /final-output/)
})

test('hydrateCanvasDocument flattens nested legacy group parents', () => {
  const canvas = canvasFixture({
    nodes: [
      {
        ID: 1,
        canvas_id: 1,
        node_id: 'parent-group',
        type: 'group',
        label: 'Parent',
        pos_x: 100,
        pos_y: 100,
        data: JSON.stringify({ source: 'manual', _style: { width: 400, height: 300 } }),
      },
      {
        ID: 2,
        canvas_id: 1,
        node_id: 'child-group',
        type: 'group',
        label: 'Child',
        pos_x: 40,
        pos_y: 50,
        data: JSON.stringify({ source: 'manual', _parentId: 'parent-group', _style: { width: 220, height: 160 } }),
      },
      {
        ID: 3,
        canvas_id: 1,
        node_id: 'text-1',
        type: 'text',
        label: 'Text',
        pos_x: 12,
        pos_y: 18,
        data: JSON.stringify({ source: 'manual', _parentId: 'child-group' }),
      },
    ],
    edges: [],
  })

  const hydrated = hydrateCanvasDocument(canvas, t)
  const childGroup = hydrated.nodes.find((node) => node.id === 'child-group')
  const textNode = hydrated.nodes.find((node) => node.id === 'text-1')

  assert.equal(childGroup?.parentId, undefined)
  assert.equal((childGroup?.data as any).groupId, 'parent-group')
  assert.deepEqual(childGroup?.position, { x: 140, y: 150 })
  assert.equal(textNode?.parentId, undefined)
  assert.equal((textNode?.data as any).groupId, 'child-group')
  assert.deepEqual(textNode?.position, { x: 152, y: 168 })
})

test('buildCanvasSavePayload strips transient data and persists semantic handles', async () => {
  const canvas = canvasFixture({
    canvas_type: 'inspiration',
    nodes: [
      {
        ID: 1,
        canvas_id: 1,
        node_id: 'text-1',
        type: 'text',
        label: 'Text',
        pos_x: 120,
        pos_y: 160,
        data: JSON.stringify({ source: 'manual', textContent: 'hello' }),
      },
    ],
    edges: [],
  })
  const { nodes } = hydrateCanvasDocument(canvas, t)
  const payload = await buildCanvasSavePayload({
    canvasType: 'inspiration',
    nodes: [{
      ...nodes[0],
      data: {
        ...nodes[0].data,
        canvasId: 'runtime-only',
        onRun: () => undefined,
      },
    }],
    edges: [{
      id: 'edge-1',
      source: 'text-1',
      target: 'other',
      sourceHandle: 'out:text',
      targetHandle: 'in:input',
    }],
    t,
  })

  assert.equal('name' in payload, false)
  assert.equal(payload.edges[0].source_handle, 'text')
  assert.equal(payload.edges[0].target_handle, 'input')
  const savedData = JSON.parse(payload.nodes[0].data)
  assert.equal(savedData.textContent, 'hello')
  assert.equal('canvasId' in savedData, false)
  assert.equal('onRun' in savedData, false)
  assert.equal('_parentId' in savedData, false)
})

function canvasFixture(patch: Partial<Canvas>): Canvas {
  return {
    ID: 1,
    owner_id: 1,
    name: 'Canvas',
    canvas_type: 'inspiration',
    stage: '',
    ref_type: '',
    visibility: 'private',
    CreatedAt: '',
    UpdatedAt: '',
    DeletedAt: null,
    ...patch,
  } as Canvas
}

function t(key: string, options?: Record<string, unknown>) {
  return String(options?.defaultValue ?? key)
}
