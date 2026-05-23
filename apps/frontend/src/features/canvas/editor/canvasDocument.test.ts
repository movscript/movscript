import assert from 'node:assert/strict'
import test from 'node:test'
import type { Canvas } from '@/types'
import { buildCanvasSavePayload, hydrateCanvasDocument } from './canvasDocument'

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
  assert.equal(hydrated.nodes.find((node) => node.id === 'text-1')?.parentId, 'group-1')
  assert.equal(hydrated.nodes.find((node) => node.id === 'text-1')?.style?.width, 220)
  assert.equal(hydrated.edges[0].sourceHandle, 'out:text')
  assert.equal(hydrated.edges[0].targetHandle, 'in:value')
  assert.match(hydrated.signature, /final-output/)
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
    canvasName: 'Canvas',
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

  assert.equal(payload.name, 'Canvas')
  assert.equal(payload.edges[0].source_handle, 'text')
  assert.equal(payload.edges[0].target_handle, 'input')
  const savedData = JSON.parse(payload.nodes[0].data)
  assert.equal(savedData.textContent, 'hello')
  assert.equal('canvasId' in savedData, false)
  assert.equal('onRun' in savedData, false)
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
