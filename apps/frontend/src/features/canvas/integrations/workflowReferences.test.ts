import assert from 'node:assert/strict'
import test from 'node:test'
import type { Canvas } from '@/types'
import { deriveCanvasReferencePorts } from './workflowReferences'

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
        pos_x: 0,
        pos_y: 0,
        data: JSON.stringify({ source: 'manual', paramName: 'prompt_text', paramType: 'text' }),
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

  assert.deepEqual(ports.inputs, [{
    id: 'prompt',
    label: 'prompt_text',
    type: 'text',
    required: true,
  }])
  assert.deepEqual(ports.outputs, [{
    id: 'final-output',
    label: 'image_result',
    type: 'image',
  }])
})
