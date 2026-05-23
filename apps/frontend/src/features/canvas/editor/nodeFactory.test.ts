import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCanvasEdgeId,
  createPluginCanvasNode,
  createResourceCanvasNode,
  createWorkflowReferenceCanvasNode,
  readOnlyMediaPortPatch,
} from './nodeFactory'
import type { Canvas, RawResource } from '@/types'
import type { ClientPluginManifest } from '@/lib/clientPlugins'

const t = (_key: string, options?: any) => options?.defaultValue ?? _key

test('readOnlyMediaPortPatch preserves AI defaults and locks uploaded media inputs', () => {
  assert.deepEqual(readOnlyMediaPortPatch('ai'), { inputPorts: undefined })
  assert.deepEqual(readOnlyMediaPortPatch('upload'), { inputPorts: [] })
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
  assert.deepEqual((node.data as any).inputPorts, [{
    id: 'prompt',
    label: 'prompt',
    type: 'text',
    required: true,
  }])
})

test('createPluginCanvasNode keeps contribution defaults and ports', () => {
  const plugin = {
    schema: 'movscript.clientPlugin.v1',
    id: 'local.echo',
    name: 'Echo',
    version: '1.0.0',
    contributes: {
      canvasNodes: [{
        type: 'echo',
        title: 'Echo Node',
        defaultData: { pluginArgs: { mode: 'short' } },
        inputs: [{ id: 'text', type: 'text' }],
        outputs: [{ id: 'result', type: 'text' }],
      }],
    },
  } as ClientPluginManifest
  const node = createPluginCanvasNode({ plugin, position: { x: 0, y: 0 } })

  assert.equal(node.type, 'plugin_card')
  assert.equal((node.data as any).label, 'Echo Node')
  assert.deepEqual((node.data as any).pluginArgs, {})
  assert.deepEqual((node.data as any).inputPorts, [{ id: 'text', type: 'text' }])
  assert.deepEqual((node.data as any).outputPorts, [{ id: 'result', type: 'text' }])
})

test('createCanvasEdgeId includes semantic connection identity', () => {
  const id = createCanvasEdgeId({ source: 'a', target: 'b', sourceHandle: 'out:image', targetHandle: 'in:image' })
  assert.match(id, /^a::image::b::image::/)
})
