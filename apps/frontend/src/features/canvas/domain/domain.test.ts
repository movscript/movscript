import assert from 'node:assert/strict'
import test from 'node:test'
import type { Edge, Node } from '@xyflow/react'
import type { CanvasNodeData } from '@/types'
import {
  canvasGroupSelectionBounds,
  normalizedCanvasNodeStyle,
  topLevelSelectedCanvasNodes,
} from './layout'
import {
  defaultHandleForNode,
  edgeConnectionKey,
  fromUiHandleId,
  portForHandle,
  toUiHandleId,
  uniqueEdgesByConnection,
} from './ports'
import { canvasGraphSignature, serializableCanvasNodeData } from './serialization'
import { ensureFinalOutputNode, isFinalOutputNode } from './graph'

test('canvas port handles normalize UI and persisted handle forms', () => {
  assert.equal(fromUiHandleId('in:prompt'), 'prompt')
  assert.equal(fromUiHandleId('out::result'), 'result')
  assert.equal(toUiHandleId('prompt', 'target'), 'in:prompt')
  assert.equal(toUiHandleId('out:result', 'source'), 'out:result')
})

test('canvas ports resolve custom ports before node defaults', () => {
  const node = canvasNode('node-1', 'plugin_card', {
    source: 'manual',
    inputPorts: [{ id: 'custom_input', type: 'text' }],
    outputPorts: [{ id: 'custom_output', type: 'image' }],
  })

  assert.equal(defaultHandleForNode(node, 'target'), 'custom_input')
  assert.equal(defaultHandleForNode(node, 'source'), 'custom_output')
  assert.equal(portForHandle(node, 'target', 'in:custom_input')?.type, 'text')
  assert.equal(portForHandle(node, 'source', 'out:custom_output')?.type, 'image')
})

test('canvas edge identity dedupes equivalent UI handles', () => {
  const edges = [
    canvasEdge('a', 'b', 'out:image', 'in:prompt'),
    canvasEdge('a', 'b', 'image', 'prompt'),
    canvasEdge('a', 'b', 'out:text', 'in:prompt'),
  ]

  assert.equal(edgeConnectionKey(edges[0]), 'a::image::b::prompt')
  assert.deepEqual(uniqueEdgesByConnection(edges).map((edge) => edge.id), ['a-b-1', 'a-b-3'])
})

test('canvas layout computes selected bounds and ignores selected descendants', () => {
  const group = canvasNode('group', 'group', { source: 'manual' }, { x: 100, y: 100 }, { width: 300, height: 200 })
  const child = canvasNode('child', 'text', { source: 'manual' }, { x: 20, y: 30 }, { width: 100, height: 40 }, 'group')
  const sibling = canvasNode('sibling', 'image', { source: 'upload' }, { x: 260, y: 180 }, { width: 120, height: 80 })
  const nodes = [{ ...group, selected: true }, { ...child, selected: true }, { ...sibling, selected: true }]

  assert.deepEqual(topLevelSelectedCanvasNodes(nodes, nodes).map((node) => node.id), ['group', 'sibling'])

  const bounds = canvasGroupSelectionBounds(nodes, [group, sibling], 10)
  assert.equal(bounds?.x, 90)
  assert.equal(bounds?.y, 90)
  assert.equal(bounds?.width, 320)
  assert.equal(bounds?.height, 220)
})

test('canvas serialization strips transient node data and ensures workflow output', () => {
  const node = canvasNode('text-1', 'text', {
    source: 'manual',
    textContent: 'hello',
    canvasId: 'runtime-only',
    rfNodeId: 'text-1',
    availableResources: [],
    onRun: () => undefined,
  } as CanvasNodeData)
  const cleaned = serializableCanvasNodeData(node.data)

  assert.equal(cleaned.label, 'text-1')
  assert.equal(cleaned.data.textContent, 'hello')
  assert.equal('canvasId' in cleaned.data, false)
  assert.equal('onRun' in cleaned.data, false)

  const nodes = ensureFinalOutputNode([node], t)
  assert.equal(nodes.some(isFinalOutputNode), true)

  const signature = canvasGraphSignature({
    canvasName: 'Workflow',
    canvasType: 'workflow',
    nodes: [node],
    edges: [],
    t,
  })
  const parsed = JSON.parse(signature) as { nodes: Array<{ id: string }> }
  assert.equal(parsed.nodes.some((item) => item.id === 'final-output'), true)
})

test('canvas node style normalizes minimum card width', () => {
  assert.deepEqual(normalizedCanvasNodeStyle('text', { width: 20 }), { width: 220 })
  assert.deepEqual(normalizedCanvasNodeStyle('group'), { width: 320, height: 240 })
})

function canvasNode(
  id: string,
  type: string,
  data: Partial<CanvasNodeData>,
  position = { x: 0, y: 0 },
  style?: Node['style'],
  parentId?: string,
): Node {
  return {
    id,
    type,
    position,
    data: { label: id, ...data },
    ...(style ? { style } : {}),
    ...(parentId ? { parentId } : {}),
  } as Node
}

function canvasEdge(source: string, target: string, sourceHandle?: string | null, targetHandle?: string | null): Edge {
  return {
    id: `${source}-${target}-${sourceHandle === 'out:text' ? 3 : 1}`,
    source,
    target,
    sourceHandle,
    targetHandle,
  }
}

function t(key: string, options?: Record<string, unknown>) {
  return String(options?.defaultValue ?? key)
}
