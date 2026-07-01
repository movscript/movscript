import assert from 'node:assert/strict'
import test from 'node:test'

import { selectedInputResources } from './canvasNodeUiAdapters'

const resources = [
  { ID: 1, owner_id: 1, type: 'image', name: 'manual.png', url: '/r/1', size: 1, mime_type: 'image/png' },
  { ID: 2, owner_id: 1, type: 'image', name: 'workflow-asset.png', url: '/r/2', size: 1, mime_type: 'image/png' },
  { ID: 3, owner_id: 1, type: 'image', name: 'prompt-only.png', url: '/r/3', size: 1, mime_type: 'image/png' },
  { ID: 4, owner_id: 1, type: 'video', name: 'connected.mov', url: '/r/4', size: 1, mime_type: 'video/quicktime' },
] as const

test('selectedInputResources uses explicit and connected reference pools, not prompt mentions', () => {
  const selected = selectedInputResources({
    availableResources: [...resources],
    inputResourceIds: [1],
    prompt: 'mentions are prompt text only @[resource:3]',
    runtimeInputValues: {
      workflow_asset: [{ type: 'image', resource_id: 2, media_type: 'image', role: 'reference_image' }],
    },
    referenceResources: [resources[3]],
  })

  assert.deepEqual(selected.map((resource) => resource.ID), [1, 2, 4])
})

test('selectedInputResources accepts workflow-provided resource objects outside the library list', () => {
  const workflowResource = { ID: 9, owner_id: 1, type: 'image', name: 'storyboard.png', url: '/r/9', size: 1, mime_type: 'image/png' }
  const selected = selectedInputResources({
    availableResources: [],
    runtimeInputValues: {
      storyboard_output: [{ type: 'image', resource_id: 9, resource: workflowResource }],
    },
  })

  assert.deepEqual(selected.map((resource) => resource.ID), [9])
})
