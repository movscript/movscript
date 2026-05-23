import assert from 'node:assert/strict'
import test from 'node:test'
import type { Edge, Node } from '@xyflow/react'
import type { CanvasPortValue } from '@/types'
import type { CanvasRuntimeOutputCache } from '@/lib/canvasRuntimeGraph'
import type { CanvasRuntimeRun } from './runHistoryStore'
import {
  buildRuntimeWorkflowOutputs,
  defaultRuntimeValueForPort,
  encodeRuntimePortValue,
  runtimeInputPortsForNode,
  textContentFromOutputs,
  workflowRunOutputItems,
} from './runtimeValues'

test('runtime port values encode typed dialog input', () => {
  assert.deepEqual(encodeRuntimePortValue({ id: 'seed', type: 'number' }, '42'), { type: 'number', number: 42 })
  assert.deepEqual(encodeRuntimePortValue({ id: 'enabled', type: 'boolean' }, 'true'), { type: 'boolean', boolean: true })
  assert.deepEqual(encodeRuntimePortValue({ id: 'payload', type: 'json' }, '{"a":1}'), { type: 'json', json: { a: 1 } })
  assert.equal(encodeRuntimePortValue({ id: 'payload', type: 'json' }, '{'), null)
  assert.deepEqual(encodeRuntimePortValue({ id: 'asset', type: 'resource' }, '7'), { type: 'resource', resource_id: 7 })
  assert.equal(defaultRuntimeValueForPort({ id: 'payload', type: 'json' }), '{}')
})

test('runtimeInputPortsForNode returns required unconnected ports only', () => {
  const node = {
    id: 'target',
    type: 'plugin_card',
    position: { x: 0, y: 0 },
    data: {
      inputPorts: [
        { id: 'prompt', type: 'text', required: true },
        { id: 'optional', type: 'image', required: false },
        { id: 'image', type: 'image', required: true },
      ],
    },
  } as Node
  const edges = [{ id: 'e1', source: 'a', target: 'target', targetHandle: 'in:image' }] as Edge[]

  assert.deepEqual(runtimeInputPortsForNode(node, edges).map((port) => port.id), ['prompt'])
})

test('runtime output helpers prefer explicit output nodes and preview text', () => {
  const nodes = [
    { id: 'text-gen', type: 'text_gen', position: { x: 0, y: 0 }, data: {} },
    { id: 'final', type: 'output', position: { x: 0, y: 0 }, data: { paramName: 'script', outputPorts: [{ id: 'value', type: 'text' }] } },
  ] as Node[]
  const outputCache: CanvasRuntimeOutputCache = {
    'text-gen': { result: { type: 'text', text: 'draft' } },
    final: { value: { type: 'text', text: 'final script' } },
  }
  const outputs = buildRuntimeWorkflowOutputs(nodes, outputCache)

  assert.deepEqual(outputs.script, { type: 'text', text: 'final script' })
  assert.equal(textContentFromOutputs({ json: { type: 'json', json: { ok: true } } }), '{\n  "ok": true\n}')
})

test('workflowRunOutputItems labels output node values and dedupes resources', () => {
  const nodes = [
    { id: 'out', type: 'output', position: { x: 0, y: 0 }, data: { paramName: 'hero_image' } },
  ] as Node[]
  const value: CanvasPortValue = { type: 'image', resource_id: 9 }
  const run = {
    id: 'run',
    canvasId: '1',
    status: 'done',
    nodeIds: ['out'],
    tasks: {},
    outputValues: { out: value, hero_image: value },
    startedAt: '',
    snapshotNodeCount: 1,
    snapshotEdgeCount: 0,
  } as CanvasRuntimeRun

  assert.deepEqual(workflowRunOutputItems(run, nodes, 'Output'), [{
    key: 'out',
    label: 'hero_image',
    value,
    resource: {
      ID: 9,
      owner_id: 0,
      type: 'image',
      name: 'hero_image.png',
      url: '/api/v1/resources/9/file',
      size: 0,
      mime_type: '',
    },
  }])
})
