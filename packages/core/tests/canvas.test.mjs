import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  CANVAS_NODE_TYPE_DRAG_TYPE,
  CANVAS_WORKFLOW_DRAG_TYPE,
  FINAL_OUTPUT_NODE_ID,
  arePortTypesCompatible,
  buildRuntimeWorkflowOutputs,
  canvasGraphSignature,
  canvasResourceMatchesSearch,
  connectedInputPortIds,
  compareWorkflowIoNodes,
  createCanvasEdgeId,
  defaultRuntimeValueForPort,
  deriveCanvasReferencePorts,
  edgeConnectionKey,
  encodeRuntimePortValue,
  ensureFinalOutputNode,
  firstRuntimeValue,
  fileToCanvasResourceNodeType,
  fromUiHandleId,
  hasCanvasDragPayload,
  inputResourceIdsFromValues,
  isFinalOutputNode,
  nextWorkflowParamOrder,
  nodeAcceptsTextResult,
  normalizeWorkflowIoNodeOrders,
  readCanvasNodeTypeDragPayload,
  readCanvasWorkflowDragPayload,
  readOnlyMediaPortPatch,
  resourceIdsFromCanvasPrompt,
  runtimePromptForNode,
  runtimeResourceIdsForNode,
  resourceToCanvasNodeType,
  serializableCanvasNodeData,
  topoSortCanvasNodes,
  toUiHandleId,
  uniqueEdgesByConnection,
  valuesHaveRuntimeValue,
  workflowInputValuesForReferenceNode,
  workflowIoDataPatch,
  workflowReferenceOutputsForNode,
  writeCanvasNodeTypeDragPayload,
  writeCanvasWorkflowDragPayload,
} from '../dist/canvas/index.js'

class FakeDataTransfer {
  data = new Map()
  effectAllowed = undefined

  get types() {
    return [...this.data.keys()]
  }

  setData(type, data) {
    this.data.set(type, data)
  }

  getData(type) {
    return this.data.get(type) ?? ''
  }
}

const workflowCanvas = {
  ID: 9,
  owner_id: 1,
  name: 'Reference workflow',
  canvas_type: 'workflow',
}

test('core canvas drag payload writes and reads node type payloads', () => {
  const dataTransfer = new FakeDataTransfer()

  writeCanvasNodeTypeDragPayload(dataTransfer, 'text')

  assert.equal(dataTransfer.getData(CANVAS_NODE_TYPE_DRAG_TYPE), 'text')
  assert.equal(readCanvasNodeTypeDragPayload(dataTransfer), 'text')
  assert.equal(dataTransfer.effectAllowed, 'copy')
  assert.equal(hasCanvasDragPayload(dataTransfer.types), true)
})

test('core canvas drag payload writes and reads workflow payloads', () => {
  const dataTransfer = new FakeDataTransfer()

  writeCanvasWorkflowDragPayload(dataTransfer, workflowCanvas)

  assert.deepEqual(JSON.parse(dataTransfer.getData(CANVAS_WORKFLOW_DRAG_TYPE)), workflowCanvas)
  assert.deepEqual(readCanvasWorkflowDragPayload(dataTransfer), workflowCanvas)
  assert.equal(dataTransfer.effectAllowed, 'copy')
  assert.equal(hasCanvasDragPayload(dataTransfer.types), true)
})

test('core canvas drag payload rejects malformed payloads', () => {
  const dataTransfer = new FakeDataTransfer()
  dataTransfer.setData(CANVAS_NODE_TYPE_DRAG_TYPE, '')
  dataTransfer.setData(CANVAS_WORKFLOW_DRAG_TYPE, '{"ID":0}')

  assert.equal(readCanvasNodeTypeDragPayload(dataTransfer), null)
  assert.equal(readCanvasWorkflowDragPayload(dataTransfer), null)
  assert.equal(hasCanvasDragPayload([]), false)
})

test('core canvas ports normalize UI handles and dedupe edge connections', () => {
  assert.equal(fromUiHandleId('in:prompt'), 'prompt')
  assert.equal(fromUiHandleId('out::result'), 'result')
  assert.equal(toUiHandleId('prompt', 'target'), 'in:prompt')
  assert.equal(toUiHandleId('out:result', 'source'), 'out:result')
  assert.equal(arePortTypesCompatible('image', 'image'), true)
  assert.equal(arePortTypesCompatible('resource', 'text'), true)
  assert.equal(arePortTypesCompatible('text', 'image'), false)

  const edges = [
    edge('a-b-1', 'a', 'b', 'out:image', 'in:prompt'),
    edge('a-b-2', 'a', 'b', 'image', 'prompt'),
    edge('a-b-3', 'a', 'b', 'out:text', 'in:prompt'),
  ]

  assert.equal(edgeConnectionKey(edges[0]), 'a::image::b::prompt')
  assert.equal(createCanvasEdgeId(edges[0], 'abc123'), 'a::image::b::prompt::abc123')
  assert.deepEqual(uniqueEdgesByConnection(edges).map((item) => item.id), ['a-b-1', 'a-b-3'])
})

test('core canvas runtime sorts graph dependencies and keeps cycles stable', () => {
  const nodes = [{ id: 'prompt' }, { id: 'image-a' }, { id: 'image-b' }]
  const edges = [
    { source: 'prompt', target: 'image-a' },
    { source: 'image-a', target: 'image-b' },
  ]

  assert.deepEqual(topoSortCanvasNodes(nodes, edges).map((node) => node.id), ['prompt', 'image-a', 'image-b'])

  const cyclic = [{ id: 'a' }, { id: 'b' }]
  assert.deepEqual(topoSortCanvasNodes(cyclic, [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'a' },
  ]).map((node) => node.id), ['a', 'b'])
})

test('core canvas runtime derives prompt and pooled resource inputs from node data and upstream values', () => {
  const inputs = {
    prompt: [{ type: 'text', text: 'rough workspace' }],
    reference: [
      { type: 'image', resource_id: 42 },
      { type: 'image', resource_id: 77 },
    ],
  }
  const node = {
    id: 'gen',
    data: {
      prompt: 'use @[resource:55] then @[resource:42]',
      inputResourceIds: [42, 99, 0, -1],
    },
  }

  assert.equal(runtimePromptForNode(node, inputs), 'use @[resource:55] then @[resource:42]\n\nrough workspace')
  assert.deepEqual(resourceIdsFromCanvasPrompt(node.data.prompt), [55, 42])
  assert.deepEqual(resourceIdsFromCanvasPrompt('legacy [[resource::55]] then @[resource:42]'), [55, 42])
  assert.deepEqual(inputResourceIdsFromValues(inputs), [42, 77])
  assert.deepEqual(runtimeResourceIdsForNode(node, inputs), [42, 99, 77])
})

test('core canvas runtime detects and selects populated runtime values', () => {
  const empty = [{ type: 'text' }]
  const populated = { type: 'text', text: 'hello' }

  assert.equal(valuesHaveRuntimeValue([null, undefined]), false)
  assert.equal(valuesHaveRuntimeValue(empty), false)
  assert.equal(valuesHaveRuntimeValue([populated]), true)
  assert.deepEqual(firstRuntimeValue({
    fallback: [{ type: 'image', resource_id: 9 }],
    prompt: [populated],
  }, ['missing', 'prompt']), populated)
})

test('core canvas runtime encodes typed port values and defaults', () => {
  assert.deepEqual(encodeRuntimePortValue({ id: 'seed', type: 'number' }, '42'), { type: 'number', number: 42 })
  assert.deepEqual(encodeRuntimePortValue({ id: 'enabled', type: 'boolean' }, 'true'), { type: 'boolean', boolean: true })
  assert.deepEqual(encodeRuntimePortValue({ id: 'payload', type: 'json' }, '{"a":1}'), { type: 'json', json: { a: 1 } })
  assert.equal(encodeRuntimePortValue({ id: 'payload', type: 'json' }, '{'), null)
  assert.deepEqual(encodeRuntimePortValue({ id: 'asset', type: 'resource' }, '7'), { type: 'resource', resource_id: 7 })
  assert.deepEqual(encodeRuntimePortValue({ id: 'voice', type: 'audio' }, '8'), { type: 'audio', resource_id: 8, media_type: 'audio' })
  assert.equal(defaultRuntimeValueForPort({ id: 'payload', type: 'json' }), '{}')
  assert.equal(defaultRuntimeValueForPort({ id: 'enabled', type: 'boolean' }), 'false')
  assert.equal(defaultRuntimeValueForPort({ id: 'prompt', type: 'text' }), '')
})

test('core canvas runtime derives connected input handles and workflow outputs', () => {
  assert.deepEqual([...connectedInputPortIds('target', [
    { source: 'a', target: 'target', targetHandle: 'in:image' },
    { source: 'b', target: 'target', targetHandle: undefined },
    { source: 'c', target: 'other', targetHandle: 'in:prompt' },
  ])], ['image', 'input'])

  const nodes = [
    { id: 'text-gen', type: 'text_gen', data: {} },
    { id: 'final', type: 'output', data: { paramName: 'script' } },
  ]
  const outputCache = {
    'text-gen': { result: { type: 'text', text: 'workspace' } },
    final: { value: { type: 'text', text: 'final script' } },
  }

  assert.deepEqual(buildRuntimeWorkflowOutputs(nodes, outputCache), {
    final: { type: 'text', text: 'final script' },
    script: { type: 'text', text: 'final script' },
  })
  assert.deepEqual(buildRuntimeWorkflowOutputs([{ id: 'text-gen', type: 'text_gen', data: {} }], outputCache), {
    'text-gen': { type: 'text', text: 'workspace' },
  })
})

test('core canvas workflow rules protect final output and normalize IO ordering', () => {
  assert.equal(FINAL_OUTPUT_NODE_ID, 'final-output')

  const finalOutput = { id: 'final-output', type: 'output', position: { x: 560, y: 120 }, data: { lockedFinalOutput: true } }
  assert.equal(isFinalOutputNode(finalOutput), true)
  assert.deepEqual(ensureFinalOutputNode([], () => finalOutput), [finalOutput])
  assert.deepEqual(ensureFinalOutputNode([{ id: 'out', type: 'output', data: {} }], () => finalOutput).map((node) => node.id), ['out'])

  const second = { id: 'second', type: 'input', position: { x: 0, y: 0 }, data: { paramOrder: 2 } }
  const missing = { id: 'missing', type: 'input', position: { x: 0, y: 10 }, data: {} }
  const first = { id: 'first', type: 'input', position: { x: 0, y: 20 }, data: { paramOrder: 1 } }
  const normalized = normalizeWorkflowIoNodeOrders([second, missing, first])

  assert.deepEqual([second, missing, first].sort(compareWorkflowIoNodes).map((node) => node.id), ['first', 'second', 'missing'])
  assert.equal(normalized.find((node) => node.id === 'missing')?.data.paramOrder, 3)
})

test('core canvas workflow rules decide which nodes accept text results', () => {
  assert.equal(nodeAcceptsTextResult({ type: 'text' }, {}), true)
  assert.equal(nodeAcceptsTextResult({ type: 'text_gen' }, {}), true)
  assert.equal(nodeAcceptsTextResult({ type: 'ai_gen' }, { outputType: 'text' }), true)
  assert.equal(nodeAcceptsTextResult({ type: 'ai_gen' }, { outputType: 'image' }), false)
  assert.equal(nodeAcceptsTextResult({ type: 'image' }, {}), false)
})

test('core canvas node factory rules prepare media and workflow IO data patches', () => {
  assert.deepEqual(readOnlyMediaPortPatch('ai'), { inputPorts: undefined })
  assert.deepEqual(readOnlyMediaPortPatch('upload'), { inputPorts: [] })

  const nodes = [
    { id: 'in-1', type: 'input', data: { paramOrder: 1 } },
    { id: 'out-1', type: 'output', data: { paramOrder: 1 } },
  ]

  assert.equal(nextWorkflowParamOrder(nodes, 'input'), 2)
  assert.deepEqual(workflowIoDataPatch({
    type: 'input',
    existingNodes: nodes,
    label: 'Input',
  }), {
    label: 'Input 2',
    paramName: 'input_2',
    paramOrder: 2,
  })
  assert.deepEqual(workflowIoDataPatch({ type: 'text', existingNodes: nodes, label: 'Text' }), {})
})

test('core canvas serialization strips transient node fields and signs normalized graph data', () => {
  const cleaned = serializableCanvasNodeData({
    label: 'Text node',
    textContent: 'hello',
    canvasId: 'runtime-only',
    rfNodeId: 'text-1',
    availableResources: [],
    pendingRuntimeInputs: {},
    onRun: () => undefined,
  })

  assert.equal(cleaned.label, 'Text node')
  assert.equal(cleaned.data.textContent, 'hello')
  assert.equal('canvasId' in cleaned.data, false)
  assert.equal('rfNodeId' in cleaned.data, false)
  assert.equal('availableResources' in cleaned.data, false)
  assert.equal('onRun' in cleaned.data, false)

  const signature = canvasGraphSignature({
    canvasType: 'workflow',
    nodes: [{
      id: 'text-1',
      type: 'text',
      position: { x: 10, y: 20 },
      parentId: 'group',
      style: { width: 220 },
      data: { label: 'Text node', textContent: 'hello', canvasId: 'runtime-only' },
    }],
    edges: [
      { source: 'a', target: 'b', sourceHandle: 'out:text', targetHandle: 'in:prompt' },
      { source: 'a', target: 'b', sourceHandle: 'text', targetHandle: 'prompt' },
    ],
  })
  const parsed = JSON.parse(signature)

  assert.deepEqual(parsed.nodes, [{
    id: 'text-1',
    type: 'text',
    label: 'Text node',
    x: 10,
    y: 20,
    parentId: 'group',
    style: { width: 220 },
    data: { textContent: 'hello' },
  }])
  assert.deepEqual(parsed.edges, [{
    source: 'a',
    target: 'b',
    sourceHandle: 'text',
    targetHandle: 'prompt',
  }])
})

test('core canvas workflow references derive ordered ports from persisted workflow nodes', () => {
  const ports = deriveCanvasReferencePorts({
    canvas_type: 'workflow',
    nodes: [
      persistedNode('prompt', 'input', 'Prompt', 100, 100, { paramName: 'prompt_text', paramType: 'text', paramOrder: 3 }),
      persistedNode('image', 'input', 'Image', 0, 0, { paramName: 'image_ref', paramType: 'image', paramOrder: 1 }),
      persistedNode('audio', 'input', 'Audio', 50, 50, { paramName: 'voice_ref', paramType: 'audio', paramOrder: 2 }),
      persistedNode('final-output', 'output', 'Final Output', 0, 0, { paramName: 'image_result', paramType: 'image' }),
    ],
  })

  assert.deepEqual(ports.inputs, [
    { id: 'image', label: 'image_ref', type: 'image', order: 1, required: true },
    { id: 'audio', label: 'voice_ref', type: 'audio', order: 2, required: true },
    { id: 'prompt', label: 'prompt_text', type: 'text', order: 3, required: true },
  ])
  assert.deepEqual(ports.outputs, [
    { id: 'final-output', label: 'image_result', type: 'image', order: 1 },
  ])
  assert.deepEqual(deriveCanvasReferencePorts({ canvas_type: 'inspiration', nodes: [] }), { inputs: [], outputs: [] })
})

test('core canvas workflow references map parent inputs and child outputs by id and label', () => {
  const referencedCanvas = {
    canvas_type: 'workflow',
    nodes: [
      persistedNode('child-prompt', 'input', 'Prompt', 0, 0, { paramName: 'prompt_text', paramType: 'text', paramOrder: 1 }),
      persistedNode('child-image', 'input', 'Image', 0, 100, { paramName: 'image_ref', paramType: 'image', paramOrder: 2 }),
      persistedNode('child-output', 'output', 'Output', 0, 200, { paramName: 'final_image', paramType: 'image', paramOrder: 1 }),
    ],
  }

  const inputValues = workflowInputValuesForReferenceNode({
    referencedCanvas,
    inputs: {
      prompt_text: [{ type: 'text', text: 'current canvas prompt' }],
      image_ref: [{ type: 'image', resource_id: 42 }],
    },
  })
  assert.deepEqual(inputValues['child-prompt'], { type: 'text', text: 'current canvas prompt' })
  assert.deepEqual(inputValues.prompt_text, { type: 'text', text: 'current canvas prompt' })
  assert.deepEqual(inputValues['child-image'], { type: 'image', resource_id: 42 })
  assert.deepEqual(inputValues.image_ref, { type: 'image', resource_id: 42 })

  const outputs = workflowReferenceOutputsForNode({
    referenceNode: {
      data: {
        outputPorts: [{ id: 'child-output', label: 'final_image', type: 'image' }],
      },
    },
    referencedCanvas,
    workflowOutputs: {
      final_image: { type: 'image', resource_id: 9 },
    },
  })
  assert.deepEqual(outputs['child-output'], { type: 'image', resource_id: 9 })
  assert.deepEqual(outputs.result, { type: 'image', resource_id: 9 })
  assert.deepEqual(outputs.value, { type: 'image', resource_id: 9 })
})

test('core canvas resource node rules map resources, files, and search terms', () => {
  const resource = {
    ID: 17,
    type: 'image',
    name: 'Hero Frame',
    mime_type: 'image/png',
  }

  assert.equal(resourceToCanvasNodeType(resource), 'image')
  assert.equal(resourceToCanvasNodeType({ type: 'audio' }), undefined)
  assert.equal(canvasResourceMatchesSearch(resource, 'hero'), true)
  assert.equal(canvasResourceMatchesSearch(resource, '17'), true)
  assert.equal(canvasResourceMatchesSearch(resource, 'png'), true)
  assert.equal(canvasResourceMatchesSearch(resource, 'missing'), false)
  assert.equal(fileToCanvasResourceNodeType({ name: 'frame.png', type: '' }), 'image')
  assert.equal(fileToCanvasResourceNodeType({ name: 'shot.mov', type: '' }), 'video')
  assert.equal(fileToCanvasResourceNodeType({ name: 'notes.md', type: '' }), 'text')
  assert.equal(fileToCanvasResourceNodeType({ name: 'blob.bin', type: 'image/webp' }), 'image')
  assert.equal(fileToCanvasResourceNodeType({ name: 'archive.zip', type: 'application/zip' }), undefined)
})

test('core canvas package publishes drag and port protocol rules without frontend dependencies', () => {
  const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  const tsupSource = readFileSync(new URL('../tsup.config.ts', import.meta.url), 'utf8')
  const source = [
    readFileSync(new URL('../src/canvas/dragPayload.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/canvas/nodeFactory.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/canvas/ports.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/canvas/resourceNodes.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/canvas/runtime.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/canvas/serialization.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/canvas/workflow.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/canvas/workflowReferences.ts', import.meta.url), 'utf8'),
  ].join('\n')

  assert.match(packageSource, /"\.\/canvas"/)
  assert.match(tsupSource, /'src\/canvas\/index\.ts'/)
  assert.doesNotMatch(source, /from ['"]@\/|from ['"]react['"]|@movscript\/ui|@xyflow|window\.|document\.|localStorage|sessionStorage/)
})

function edge(id, source, target, sourceHandle, targetHandle) {
  return { id, source, target, sourceHandle, targetHandle }
}

function persistedNode(nodeId, type, label, x, y, data) {
  return {
    node_id: nodeId,
    type,
    label,
    pos_x: x,
    pos_y: y,
    data: JSON.stringify({ source: 'manual', ...data }),
  }
}
