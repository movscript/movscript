import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canvasNodeOutputValue,
  canvasRuntimeOrderForNode,
  collectCanvasNodeInputs,
  inputResourceIdsFromValues,
  reusableCanvasNodeOutputValues,
  resourceIdsFromCanvasPrompt,
  runtimeResourceIdsForNode,
  runtimePromptForNode,
} from './canvasRuntimeGraph'

test('single node runtime collects connected upstream resource inputs from unsaved graph state', () => {
  const nodes = [
    {
      id: 'ref-image',
      type: 'image',
      position: { x: 0, y: 0 },
      data: {
        source: 'upload',
        resourceId: 42,
        resource: { ID: 42, owner_id: 1, type: 'image', name: 'ref.png', url: '/api/v1/resources/42/file', size: 1, mime_type: 'image/png' },
      },
    },
    {
      id: 'gen',
      type: 'reference_to_image',
      position: { x: 200, y: 0 },
      data: { source: 'ai', prompt: 'make a poster' },
    },
  ]
  const edges = [
    { id: 'e1', source: 'ref-image', target: 'gen', sourceHandle: 'out:image', targetHandle: 'in:references' },
  ]

  const inputs = collectCanvasNodeInputs({ nodeId: 'gen', nodes, edges })

  assert.deepEqual(inputResourceIdsFromValues(inputs.values), [42])
  assert.equal(inputs.values.references[0].type, 'image')
  assert.equal(inputs.values.references[0].resource_id, 42)
})

test('connected resource inputs inherit target port media type and role', () => {
  const nodes = [
    {
      id: 'ref-image',
      type: 'image',
      position: { x: 0, y: 0 },
      data: {
        source: 'upload',
        resourceId: 42,
        resource: { ID: 42, owner_id: 1, type: 'image', name: 'first.png', url: '/api/v1/resources/42/file', size: 1, mime_type: 'image/png' },
      },
    },
    {
      id: 'video-gen',
      type: 'reference_to_video',
      position: { x: 200, y: 0 },
      data: {
        source: 'ai',
        prompt: 'animate',
        inputPorts: [{ id: 'first_frame', type: 'image', mediaType: 'image', role: 'first_frame', required: true }],
      },
    },
  ]
  const edges = [
    { id: 'e1', source: 'ref-image', target: 'video-gen', sourceHandle: 'out:image', targetHandle: 'in:first_frame' },
  ]

  const inputs = collectCanvasNodeInputs({ nodeId: 'video-gen', nodes, edges })

  assert.equal(inputs.values.first_frame[0].resource_id, 42)
  assert.equal(inputs.values.first_frame[0].media_type, 'image')
  assert.equal(inputs.values.first_frame[0].role, 'first_frame')
})

test('single node runtime order includes upstream generated dependencies before target', () => {
  const nodes = [
    { id: 'prompt', type: 'text', position: { x: 0, y: 0 }, data: { source: 'manual', textContent: 'cyberpunk alley' } },
    { id: 'image-a', type: 'image', position: { x: 200, y: 0 }, data: { source: 'ai', prompt: 'base' } },
    { id: 'image-b', type: 'reference_to_image', position: { x: 400, y: 0 }, data: { source: 'ai', prompt: 'variant' } },
  ]
  const edges = [
    { id: 'e1', source: 'prompt', target: 'image-a', sourceHandle: 'out:text', targetHandle: 'in:prompt' },
    { id: 'e2', source: 'image-a', target: 'image-b', sourceHandle: 'out:image', targetHandle: 'in:reference' },
  ]

  assert.deepEqual(canvasRuntimeOrderForNode('image-b', nodes, edges).map((node) => node.id), ['prompt', 'image-a', 'image-b'])
})

test('runtime prompt combines node prompt and connected upstream text', () => {
  const node = { id: 'gen', type: 'text_gen', position: { x: 0, y: 0 }, data: { source: 'ai', prompt: 'polish this' } }
  const prompt = runtimePromptForNode(node, {
    prompt: [{ type: 'text', text: 'rough workspace' }],
  })

  assert.equal(prompt, 'polish this\n\nrough workspace')
})

test('runtime resource ids only order prompt mentions that are already in canvas inputs', () => {
  const node = {
    id: 'gen',
    type: 'reference_to_image',
    position: { x: 0, y: 0 },
    data: {
      source: 'ai',
      prompt: 'use @[resource:55] then @[resource:42] in place',
      inputResourceIds: [42, 99],
    },
  }

  assert.deepEqual(resourceIdsFromCanvasPrompt(node.data.prompt), [55, 42])
  assert.deepEqual(runtimeResourceIdsForNode(node, {
    reference: [
      { type: 'image', resource_id: 42 },
      { type: 'image', resource_id: 77 },
    ],
  }), [42, 99, 77])
})

test('runtime resource ids ignore disabled plugin generated resources', () => {
  const nodes = [
    {
      id: 'plugin',
      type: 'plugin_card',
      position: { x: 0, y: 0 },
      data: {
        outputPorts: [{ id: 'result', type: 'image' }],
        pluginResultData: { output_resource_id: 88 },
      },
    },
    {
      id: 'gen',
      type: 'reference_to_image',
      position: { x: 200, y: 0 },
      data: { source: 'ai', prompt: 'make a variant' },
    },
  ]
  const edges = [
    { id: 'e1', source: 'plugin', target: 'gen', sourceHandle: 'out:result', targetHandle: 'in:references' },
  ]

  const inputs = collectCanvasNodeInputs({ nodeId: 'gen', nodes, edges })

  assert.deepEqual(runtimeResourceIdsForNode(nodes[1], inputs.values), [])
})

test('reusable runtime outputs expose an existing generated image without rerunning the node', () => {
  const node = {
    id: 'image-a',
    type: 'image',
    position: { x: 0, y: 0 },
    data: {
      source: 'ai',
      resourceId: 42,
      resource: { ID: 42, owner_id: 1, type: 'image', name: 'generated.png', url: '/resources/42/file', size: 1, mime_type: 'image/png' },
    },
  }

  assert.deepEqual(reusableCanvasNodeOutputValues(node), {
    image: { type: 'image', resource_id: 42, media_type: 'image', resource: node.data.resource },
    result: { type: 'image', resource_id: 42, media_type: 'image', resource: node.data.resource },
    value: { type: 'image', resource_id: 42, media_type: 'image', resource: node.data.resource },
    'image-a': { type: 'image', resource_id: 42, media_type: 'image', resource: node.data.resource },
  })
})

test('reusable runtime outputs ignore disabled plugin resource ports', () => {
  const node = {
    id: 'plugin',
    type: 'plugin_card',
    position: { x: 0, y: 0 },
    data: {
      outputPorts: [{ id: 'result', type: 'image' }],
      pluginResultData: { output_resource_id: 88 },
    },
  }

  assert.equal(reusableCanvasNodeOutputValues(node), undefined)
})
