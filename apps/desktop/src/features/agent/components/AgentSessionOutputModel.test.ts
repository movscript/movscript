import test from 'node:test'
import assert from 'node:assert/strict'

import { sessionContentUnitsFromReadModel } from './AgentSessionOutputModel'

test('session content units parse the project service read model payload', () => {
  const units = sessionContentUnitsFromReadModel({
    projectContentUnitsReadModel: {
      schema: 'movscript.project-content-units-read-model.v1',
      contentUnits: [
        {
          id: 'unit_b',
          title: 'B shot',
          type: 'shot',
          outputKind: 'video',
          path: 'content_units/unit_b/content_unit.json',
          editPrompt: 'make it calmer',
          selectionState: 'selected',
          candidates: [
            {
              id: 'candidate_1',
              title: 'Candidate 1',
              model: 'kling',
              note: 'keeper',
              selected: true,
              resourceId: 42,
            },
          ],
        },
        {
          content_unit_id: 'unit_a',
          name: 'A shot',
          content_unit_type: 'image',
          output_kind: 'image',
          selection_state: 'needs_candidate',
          candidates: [{ candidate_id: 'candidate_2', provider: 'seedream' }],
        },
      ],
    },
  })

  assert.deepEqual(units.map((unit) => unit.id), ['unit_a', 'unit_b'])
  assert.equal(units[0]?.title, 'A shot')
  assert.equal(units[0]?.selectionState, 'needs_candidate')
  assert.equal(units[0]?.candidates[0]?.model, 'seedream')
  assert.equal(units[1]?.selectionState, 'selected')
  assert.equal(units[1]?.candidates[0]?.resourceId, 42)
})
