import assert from 'node:assert/strict'
import test from 'node:test'
import type { Edge, Node } from '@xyflow/react'
import type { CanvasNodeData } from '@movscript/shared'
import {
  canvasDefaultClientPoint,
  canvasGroupAncestorIds,
  canvasGroupDescendantIds,
  canvasGroupSelectionBounds,
  canvasNodeWithGroupId,
  compactCanvasLayoutRect,
  commonCanvasGroupId,
  findCanvasGroupDropTarget,
  resizeCanvasGroupsToFitMembers,
  isCanvasNodeOutsideGroupBounds,
  normalizedCanvasNodeStyle,
  resolveCanvasGroupPromotionId,
  shouldUseCanvasMediaLightweightMode,
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
import { compareWorkflowIoNodes, ensureFinalOutputNode, isFinalOutputNode, normalizeWorkflowIoNodeOrders } from './graph'

test('canvas coordinate space uses the canvas viewport center as the default client point', () => {
  assert.deepEqual(canvasDefaultClientPoint({
    containerRect: { left: 40, top: 60, width: 800, height: 500 },
    viewportWidth: 1440,
    viewportHeight: 900,
  }), { x: 440, y: 310 })

  assert.deepEqual(canvasDefaultClientPoint({
    containerRect: null,
    viewportWidth: 1200,
    viewportHeight: 800,
  }), { x: 600, y: 400 })
})

test('canvas layout rect diagnostics are formatted by the domain helper', () => {
  assert.equal(compactCanvasLayoutRect({
    width: 319.6,
    height: 240.4,
    left: 12.2,
    top: 48.8,
  }), '320x240+12+49')

  assert.equal(compactCanvasLayoutRect(null), 'none')
  assert.equal(compactCanvasLayoutRect({
    width: Number.POSITIVE_INFINITY,
    height: Number.NaN,
    left: 0,
    top: -1.2,
  }), '0x0+0+-1')
})

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

test('canvas media previews stay enabled for sparse visible media at low zoom', () => {
  const nodes = Array.from({ length: 4 }, (_, index) => canvasNode(`image-${index}`, 'image', {
    source: 'manual',
    resource: canvasImageResource(index),
  }, { x: index * 260, y: 0 }, { width: 200, height: 160 }))

  assert.equal(shouldUseCanvasMediaLightweightMode({
    nodes,
    viewportX: 0,
    viewportY: 0,
    zoom: 0.1,
    viewportWidth: 1200,
    viewportHeight: 800,
  }), false)
})

test('canvas media previews degrade only when visible media exceeds budget', () => {
  const nodes = Array.from({ length: 40 }, (_, index) => canvasNode(`image-${index}`, 'image', {
    source: 'manual',
    resource: canvasImageResource(index),
  }, { x: (index % 10) * 220, y: Math.floor(index / 10) * 180 }, { width: 200, height: 160 }))

  assert.equal(shouldUseCanvasMediaLightweightMode({
    nodes,
    viewportX: 0,
    viewportY: 0,
    zoom: 0.5,
    viewportWidth: 1400,
    viewportHeight: 900,
  }), true)
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

test('canvas layout treats logical group membership as selection ancestry', () => {
  const group = canvasNode('group', 'group', { source: 'manual' }, { x: 100, y: 100 }, { width: 300, height: 200 })
  const child = canvasNode('child', 'text', { source: 'manual', groupId: 'group' }, { x: 120, y: 130 }, { width: 100, height: 40 })
  const sibling = canvasNode('sibling', 'image', { source: 'upload' }, { x: 260, y: 180 }, { width: 120, height: 80 })
  const nodes = [{ ...group, selected: true }, { ...child, selected: true }, { ...sibling, selected: true }]

  assert.deepEqual(topLevelSelectedCanvasNodes(nodes, nodes).map((node) => node.id), ['group', 'sibling'])

  const bounds = canvasGroupSelectionBounds(nodes, [group, sibling], 10)
  assert.equal(bounds?.x, 90)
  assert.equal(bounds?.y, 90)
  assert.equal(bounds?.width, 320)
  assert.equal(bounds?.height, 220)
})

test('canvas layout collects nested logical group descendants', () => {
  const group = canvasNode('group', 'group', { source: 'manual' })
  const childGroup = canvasNode('child-group', 'group', { source: 'manual', groupId: 'group' })
  const child = canvasNode('child', 'text', { source: 'manual', groupId: 'child-group' })
  const sibling = canvasNode('sibling', 'text', { source: 'manual' })

  assert.deepEqual(
    [...canvasGroupDescendantIds([group, childGroup, child, sibling], 'group')].sort(),
    ['child', 'child-group'],
  )
})

test('canvas layout resolves the deepest containing group as drop target', () => {
  const parent = canvasNode('parent', 'group', { source: 'manual' }, { x: 0, y: 0 }, { width: 500, height: 400 })
  const childGroup = canvasNode('child-group', 'group', { source: 'manual', groupId: 'parent' }, { x: 100, y: 100 }, { width: 220, height: 180 })
  const node = canvasNode('node', 'text', { source: 'manual' }, { x: 150, y: 140 }, { width: 80, height: 40 })

  assert.equal(findCanvasGroupDropTarget(node, [parent, childGroup, node])?.id, 'child-group')
})

test('canvas layout can exclude current group ancestors while dragging inside a nested group', () => {
  const parent = canvasNode('parent', 'group', { source: 'manual' }, { x: 0, y: 0 }, { width: 500, height: 400 })
  const childGroup = canvasNode('child-group', 'group', { source: 'manual', groupId: 'parent' }, { x: 100, y: 100 }, { width: 220, height: 180 })
  const node = canvasNode('node', 'text', { source: 'manual', groupId: 'child-group' }, { x: 150, y: 140 }, { width: 80, height: 40 })

  assert.deepEqual(canvasGroupAncestorIds([parent, childGroup, node], 'child-group'), ['parent'])
  assert.equal(
    findCanvasGroupDropTarget(node, [parent, childGroup, node], {
      excludedGroupIds: canvasGroupAncestorIds([parent, childGroup, node], 'child-group'),
    }),
    undefined,
  )
})

test('canvas layout promotes a node to its parent group when dragged out of a nested group', () => {
  const parent = canvasNode('parent', 'group', { source: 'manual' }, { x: 0, y: 0 }, { width: 500, height: 400 })
  const childGroup = canvasNode('child-group', 'group', { source: 'manual', groupId: 'parent' }, { x: 100, y: 100 }, { width: 220, height: 180 })
  const node = canvasNode('node', 'text', { source: 'manual', groupId: 'child-group' }, { x: 350, y: 140 }, { width: 80, height: 40 })

  assert.equal(findCanvasGroupDropTarget(node, [parent, childGroup, node])?.id, 'parent')
})

test('canvas layout promotes nested groups to the nearest surviving parent', () => {
  const selectedGroupParents = new Map<string, string | undefined>([
    ['parent', undefined],
    ['child', 'parent'],
    ['grandchild', 'child'],
  ])

  assert.equal(resolveCanvasGroupPromotionId('parent', selectedGroupParents), undefined)
  assert.equal(resolveCanvasGroupPromotionId('child', selectedGroupParents), undefined)
  assert.equal(resolveCanvasGroupPromotionId('grandchild', selectedGroupParents), undefined)

  const partiallySelectedGroupParents = new Map<string, string | undefined>([
    ['child', 'parent'],
    ['grandchild', 'child'],
  ])

  assert.equal(resolveCanvasGroupPromotionId('grandchild', partiallySelectedGroupParents), 'parent')
})

test('canvas layout updates logical group membership without parent nesting', () => {
  const child = canvasNode('child', 'text', { source: 'manual' }, { x: 120, y: 130 }, { width: 100, height: 40 }, 'legacy-parent')
  const grouped = canvasNodeWithGroupId(child, 'group')
  const ungrouped = canvasNodeWithGroupId(grouped, undefined)

  assert.equal(grouped.parentId, undefined)
  assert.equal((grouped.data as Partial<CanvasNodeData>).groupId, 'group')
  assert.equal(ungrouped.parentId, undefined)
  assert.equal((ungrouped.data as Partial<CanvasNodeData>).groupId, undefined)
})

test('canvas layout resolves common logical group membership', () => {
  const first = canvasNode('first', 'text', { source: 'manual', groupId: 'group' })
  const second = canvasNode('second', 'text', { source: 'manual', groupId: 'group' })
  const topLevel = canvasNode('top-level', 'text', { source: 'manual' })

  assert.equal(commonCanvasGroupId([first, second]), 'group')
  assert.equal(commonCanvasGroupId([first, topLevel]), undefined)
  assert.equal(commonCanvasGroupId([]), undefined)
})

test('canvas layout detects nodes dragged outside logical group bounds', () => {
  const group = canvasNode('group', 'group', { source: 'manual' }, { x: 100, y: 100 }, { width: 300, height: 200 })
  const inside = canvasNode('inside', 'text', { source: 'manual', groupId: 'group' }, { x: 130, y: 140 }, { width: 100, height: 40 })
  const outside = canvasNode('outside', 'text', { source: 'manual', groupId: 'group' }, { x: 20, y: 140 }, { width: 100, height: 40 })

  assert.equal(isCanvasNodeOutsideGroupBounds(inside, group), false)
  assert.equal(isCanvasNodeOutsideGroupBounds(outside, group), true)
})

test('canvas layout resizes groups to fit confirmed members', () => {
  const group = canvasNode('group', 'group', { source: 'manual' }, { x: 100, y: 100 }, { width: 200, height: 160 })
  const first = canvasNode('first', 'text', { source: 'manual', groupId: 'group' }, { x: 120, y: 130 }, { width: 100, height: 40 })
  const second = canvasNode('second', 'text', { source: 'manual', groupId: 'group' }, { x: 340, y: 260 }, { width: 100, height: 40 })
  const resized = resizeCanvasGroupsToFitMembers([group, first, second], ['group'], 10)
  const resizedGroup = resized.find((node) => node.id === 'group')

  assert.deepEqual(resizedGroup?.position, { x: 110, y: 120 })
  assert.equal(resizedGroup?.style?.width, 340)
  assert.equal(resizedGroup?.style?.height, 190)
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
    canvasType: 'workflow',
    nodes: [node],
    edges: [],
    t,
  })
  const parsed = JSON.parse(signature) as { nodes: Array<{ id: string }> }
  assert.equal(parsed.nodes.some((item) => item.id === 'final-output'), true)
})

test('workflow IO nodes normalize and sort by explicit order', () => {
  const second = canvasNode('second', 'input', { source: 'manual', paramOrder: 2 }, { x: 0, y: 0 })
  const missing = canvasNode('missing', 'input', { source: 'manual' }, { x: 0, y: 10 })
  const first = canvasNode('first', 'input', { source: 'manual', paramOrder: 1 }, { x: 0, y: 20 })
  const normalized = normalizeWorkflowIoNodeOrders([second, missing, first])

  assert.deepEqual([second, missing, first].sort(compareWorkflowIoNodes).map((node) => node.id), ['first', 'second', 'missing'])
  assert.equal((normalized.find((node) => node.id === 'missing')?.data as Partial<CanvasNodeData>).paramOrder, 3)
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

function canvasImageResource(id: number) {
  return {
    ID: id,
    owner_id: 1,
    type: 'image',
    name: `image-${id}.png`,
    url: `/resources/${id}/file`,
    size: 1024,
    mime_type: 'image/png',
  } as CanvasNodeData['resource']
}

function t(key: string, options?: Record<string, unknown>) {
  return String(options?.defaultValue ?? key)
}
