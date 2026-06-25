import assert from 'node:assert/strict'
import test from 'node:test'
import type { Node } from '@xyflow/react'
import type { Canvas } from '@movscript/shared'
import {
  deriveCanvasReferencePorts,
  workflowInputValuesForReferenceNode,
  workflowReferenceOutputsForNode,
} from './workflowReferences'

test('deriveCanvasReferencePorts exposes workflow inputs and outputs as canvas ports', () => {
  const ports = deriveCanvasReferencePorts({
    ID: 1,
    owner_id: 1,
    name: 'Workflow',
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
        canvas_id: 1,
        node_id: 'prompt',
        type: 'input',
        label: 'Prompt',
        pos_x: 100,
        pos_y: 100,
        data: JSON.stringify({ source: 'manual', paramName: 'prompt_text', paramType: 'text', paramOrder: 3 }),
      },
      {
        ID: 3,
        canvas_id: 1,
        node_id: 'image',
        type: 'input',
        label: 'Image',
        pos_x: 0,
        pos_y: 0,
        data: JSON.stringify({ source: 'manual', paramName: 'image_ref', paramType: 'image', paramOrder: 1 }),
      },
      {
        ID: 4,
        canvas_id: 1,
        node_id: 'audio',
        type: 'input',
        label: 'Audio',
        pos_x: 50,
        pos_y: 50,
        data: JSON.stringify({ source: 'manual', paramName: 'voice_ref', paramType: 'audio', paramOrder: 2 }),
      },
      {
        ID: 2,
        canvas_id: 1,
        node_id: 'final-output',
        type: 'output',
        label: 'Final Output',
        pos_x: 0,
        pos_y: 0,
        data: JSON.stringify({ source: 'manual', paramName: 'image_result', paramType: 'image' }),
      },
    ],
    edges: [],
  } as Canvas)

  assert.deepEqual(ports.inputs, [
    {
      id: 'image',
      label: 'image_ref',
      type: 'image',
      order: 1,
      required: true,
    },
    {
      id: 'audio',
      label: 'voice_ref',
      type: 'audio',
      order: 2,
      required: true,
    },
    {
      id: 'prompt',
      label: 'prompt_text',
      type: 'text',
      order: 3,
      required: true,
    },
  ])
  assert.deepEqual(ports.outputs, [{
    id: 'final-output',
    label: 'image_result',
    type: 'image',
    order: 1,
  }])
})

test('deriveCanvasReferencePorts ignores non-workflow canvases', () => {
  const ports = deriveCanvasReferencePorts({
    ID: 1,
    owner_id: 1,
    name: 'Inspiration',
    canvas_type: 'inspiration',
    stage: 'generation',
    ref_type: '',
    visibility: 'private',
    CreatedAt: '',
    UpdatedAt: '',
    DeletedAt: null,
    nodes: [{
      ID: 1,
      canvas_id: 1,
      node_id: 'prompt',
      type: 'input',
      label: 'Prompt',
      pos_x: 0,
      pos_y: 0,
      data: JSON.stringify({ source: 'manual', paramName: 'prompt_text', paramType: 'text' }),
    }],
    edges: [],
  } as Canvas)

  assert.deepEqual(ports, { inputs: [], outputs: [] })
})

test('workflowInputValuesForReferenceNode maps current canvas values into referenced workflow inputs', () => {
  const referencedCanvas = {
    ID: 1,
    owner_id: 1,
    name: 'Referenced workflow',
    canvas_type: 'workflow',
    nodes: [
      {
        ID: 1,
        canvas_id: 1,
        node_id: 'child-prompt',
        type: 'input',
        label: 'Prompt',
        pos_x: 0,
        pos_y: 0,
        data: JSON.stringify({ source: 'manual', paramName: 'prompt_text', paramType: 'text', paramOrder: 1 }),
      },
      {
        ID: 2,
        canvas_id: 1,
        node_id: 'child-image',
        type: 'input',
        label: 'Image',
        pos_x: 0,
        pos_y: 100,
        data: JSON.stringify({ source: 'manual', paramName: 'image_ref', paramType: 'image', paramOrder: 2 }),
      },
      {
        ID: 3,
        canvas_id: 1,
        node_id: 'child-audio',
        type: 'input',
        label: 'Audio',
        pos_x: 0,
        pos_y: 200,
        data: JSON.stringify({ source: 'manual', paramName: 'voice_ref', paramType: 'audio', paramOrder: 3 }),
      },
    ],
    edges: [],
  } as Canvas

  const values = workflowInputValuesForReferenceNode({
    referencedCanvas,
    inputs: {
      prompt_text: [{ type: 'text', text: 'current canvas prompt' }],
      image_ref: [{ type: 'image', resource_id: 42 }],
      voice_ref: [{ type: 'audio', resource_id: 77 }],
    },
  })

  assert.deepEqual(values['child-prompt'], { type: 'text', text: 'current canvas prompt' })
  assert.deepEqual(values.prompt_text, { type: 'text', text: 'current canvas prompt' })
  assert.deepEqual(values['child-image'], { type: 'image', resource_id: 42 })
  assert.deepEqual(values.image_ref, { type: 'image', resource_id: 42 })
  assert.deepEqual(values['child-audio'], { type: 'audio', resource_id: 77 })
  assert.deepEqual(values.voice_ref, { type: 'audio', resource_id: 77 })
})

test('workflowReferenceOutputsForNode maps referenced workflow outputs to reference node ports', () => {
  const referencedCanvas = {
    ID: 1,
    owner_id: 1,
    name: 'Referenced workflow',
    canvas_type: 'workflow',
    nodes: [{
      ID: 1,
      canvas_id: 1,
      node_id: 'child-output',
      type: 'output',
      label: 'Output',
      pos_x: 0,
      pos_y: 0,
      data: JSON.stringify({ source: 'manual', paramName: 'final_image', paramType: 'image', paramOrder: 1 }),
    }],
    edges: [],
  } as Canvas
  const referenceNode = {
    id: 'workflow-ref',
    type: 'canvas',
    position: { x: 0, y: 0 },
    data: {
      source: 'ai',
      outputPorts: [{ id: 'child-output', label: 'final_image', type: 'image' }],
    },
  } as Node

  const outputs = workflowReferenceOutputsForNode({
    referenceNode,
    referencedCanvas,
    workflowOutputs: {
      'child-output': { type: 'image', resource_id: 9 },
      final_image: { type: 'image', resource_id: 9 },
    },
  })

  assert.deepEqual(outputs['child-output'], { type: 'image', resource_id: 9 })
  assert.deepEqual(outputs.result, { type: 'image', resource_id: 9 })
  assert.deepEqual(outputs.value, { type: 'image', resource_id: 9 })
})
