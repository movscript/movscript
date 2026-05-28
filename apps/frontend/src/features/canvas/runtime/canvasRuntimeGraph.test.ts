import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canvasNodeOutputValue,
  canvasRuntimeOrderForNode,
  collectCanvasNodeInputs,
  inputResourceIdsFromValues,
  outputResourceIdsFromUnknown,
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
      type: 'ref_image_gen',
      position: { x: 200, y: 0 },
      data: { source: 'ai', prompt: 'make a poster' },
    },
  ]
  const edges = [
    { id: 'e1', source: 'ref-image', target: 'gen', sourceHandle: 'out:image', targetHandle: 'in:reference' },
  ]

  const inputs = collectCanvasNodeInputs({ nodeId: 'gen', nodes, edges })

  assert.deepEqual(inputResourceIdsFromValues(inputs.values), [42])
  assert.equal(inputs.values.reference[0].type, 'image')
  assert.equal(inputs.values.reference[0].resource_id, 42)
})

test('single node runtime order includes upstream generated dependencies before target', () => {
  const nodes = [
    { id: 'prompt', type: 'text', position: { x: 0, y: 0 }, data: { source: 'manual', textContent: 'cyberpunk alley' } },
    { id: 'image-a', type: 'image', position: { x: 200, y: 0 }, data: { source: 'ai', prompt: 'base' } },
    { id: 'image-b', type: 'ref_image_gen', position: { x: 400, y: 0 }, data: { source: 'ai', prompt: 'variant' } },
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
    prompt: [{ type: 'text', text: 'rough draft' }],
  })

  assert.equal(prompt, 'polish this\n\nrough draft')
})

test('runtime resource ids keep inline prompt mentions before other canvas inputs', () => {
  const node = {
    id: 'gen',
    type: 'ref_image_gen',
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
  }), [55, 42, 99, 77])
})

test('canvas node output reads generated plugin result resources', () => {
  const node = {
    id: 'plugin',
    type: 'plugin_card',
    position: { x: 0, y: 0 },
    data: {
      outputPorts: [{ id: 'result', type: 'image' }],
      pluginResultData: {
        output_resource_id: 88,
        output_resource: { ID: 88, owner_id: 1, type: 'image', name: 'generated.png', url: '/resources/88/file', size: 1, mime_type: 'image/png' },
      },
    },
  }

  assert.deepEqual(outputResourceIdsFromUnknown(node.data.pluginResultData), [88])
  assert.deepEqual(canvasNodeOutputValue(node, 'out:result'), {
    type: 'image',
    resource_id: 88,
    resource: { ID: 88, owner_id: 1, type: 'image', name: 'generated.png', url: '/resources/88/file', size: 1, mime_type: 'image/png' },
  })
})

test('canvas node output preserves audio resource port type', () => {
  const node = {
    id: 'plugin',
    type: 'plugin_card',
    position: { x: 0, y: 0 },
    data: {
      outputPorts: [{ id: 'voice', type: 'audio' }],
      pluginResultData: {
        output_resource_id: 91,
        output_resource: { ID: 91, owner_id: 1, type: 'audio', name: 'voice.mp3', url: '/resources/91/file', size: 1, mime_type: 'audio/mpeg' },
      },
    },
  }

  assert.deepEqual(canvasNodeOutputValue(node, 'out:voice'), {
    type: 'audio',
    resource_id: 91,
    resource: { ID: 91, owner_id: 1, type: 'audio', name: 'voice.mp3', url: '/resources/91/file', size: 1, mime_type: 'audio/mpeg' },
  })
})

test('runtime resource ids include connected plugin generated resources', () => {
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
      type: 'ref_image_gen',
      position: { x: 200, y: 0 },
      data: { source: 'ai', prompt: 'make a variant' },
    },
  ]
  const edges = [
    { id: 'e1', source: 'plugin', target: 'gen', sourceHandle: 'out:result', targetHandle: 'in:references' },
  ]

  const inputs = collectCanvasNodeInputs({ nodeId: 'gen', nodes, edges })

  assert.deepEqual(runtimeResourceIdsForNode(nodes[1], inputs.values), [88])
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
    image: { type: 'image', resource_id: 42, resource: node.data.resource },
    result: { type: 'image', resource_id: 42, resource: node.data.resource },
    value: { type: 'image', resource_id: 42, resource: node.data.resource },
    'image-a': { type: 'image', resource_id: 42, resource: node.data.resource },
  })
})

test('reusable runtime outputs preserve generated plugin resource ports', () => {
  const node = {
    id: 'plugin',
    type: 'plugin_card',
    position: { x: 0, y: 0 },
    data: {
      outputPorts: [{ id: 'result', type: 'image' }],
      pluginResultData: { output_resource_id: 88 },
    },
  }

  assert.deepEqual(reusableCanvasNodeOutputValues(node), {
    result: { type: 'image', resource_id: 88, resource: undefined },
    image: { type: 'image', resource_id: 88, resource: undefined },
    value: { type: 'image', resource_id: 88, resource: undefined },
    plugin: { type: 'image', resource_id: 88, resource: undefined },
  })
})
