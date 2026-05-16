import assert from 'node:assert/strict'
import test from 'node:test'

import { buildContentWorkbenchCanvasPayload, findContentWorkbenchCanvas } from './contentWorkbenchCanvas'

test('content workbench canvas lookup reuses matching generation workflow canvas', () => {
  const existing = findContentWorkbenchCanvas([
    { ID: 1, canvas_type: 'workflow', stage: 'asset_prep', ref_type: 'content_unit', ref_id: 10 },
    { ID: 2, canvas_type: 'inspiration', stage: 'generation', ref_type: 'content_unit', ref_id: 10 },
    { ID: 3, canvas_type: 'workflow', stage: 'generation', ref_type: 'scene_moment', ref_id: 10 },
    { ID: 4, canvas_type: 'workflow', stage: 'generation', ref_type: 'content_unit', ref_id: 10 },
  ], 10)

  assert.equal(existing?.ID, 4)
})

test('content workbench canvas lookup ignores other content units', () => {
  const existing = findContentWorkbenchCanvas([
    { ID: 1, canvas_type: 'workflow', stage: 'generation', ref_type: 'content_unit', ref_id: 11 },
  ], 10)

  assert.equal(existing, undefined)
})

test('content workbench canvas payload keeps generation reference traceable', () => {
  assert.deepEqual(buildContentWorkbenchCanvasPayload({
    projectId: 123,
    contentUnitId: 801,
    title: '纸条特写',
  }), {
    name: '纸条特写 · 内容编排',
    project_id: 123,
    canvas_type: 'workflow',
    stage: 'generation',
    ref_type: 'content_unit',
    ref_id: 801,
  })
})
