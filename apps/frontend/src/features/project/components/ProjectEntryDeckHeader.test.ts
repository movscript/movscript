import assert from 'node:assert/strict'
import test from 'node:test'

import { getProjectEntryDefinition } from '@/features/project/domain/projectEntryRegistry'
import { projectEntryDeckTabPath } from './ProjectEntryDeckHeader'

test('project entry deck header routes tabs to restored entry locations', () => {
  assert.equal(
    projectEntryDeckTabPath({
      definition: getProjectEntryDefinition('content'),
      restoredRoute: '/project/content',
      restoredSearch: 'scene_moment_id=12',
    }),
    '/project/content?scene_moment_id=12',
  )
  assert.equal(
    projectEntryDeckTabPath({
      definition: getProjectEntryDefinition('project_standards'),
      restoredSearch: '?tab=rules',
    }),
    '/project/standards?tab=rules',
  )
})
