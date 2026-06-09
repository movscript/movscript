import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('project tasks use workspace semantic repository for work items and reviews', () => {
  const tasksPageSource = readFileSync(resolve('src/features/project/components/TasksPage.tsx'), 'utf8')
  const semanticEntitiesSource = readFileSync(resolve('src/shared/infrastructure/api/semanticEntities.ts'), 'utf8')

  assert.doesNotMatch(tasksPageSource, /\/entities\/work-items/)
  assert.doesNotMatch(tasksPageSource, /\/entities\/work-reviews/)
  assert.match(tasksPageSource, /listSemanticEntities\(projectId!, semanticEntityConfig\('workItems'\)/)
  assert.match(tasksPageSource, /listSemanticEntities\(projectId!, semanticEntityConfig\('workReviews'\)/)
  assert.match(tasksPageSource, /createSemanticEntity\(projectId!, semanticEntityConfig\('workItems'\)/)
  assert.match(tasksPageSource, /createSemanticEntity\(projectId!, semanticEntityConfig\('workReviews'\)/)
  assert.match(tasksPageSource, /updateSemanticEntity\(projectId, semanticEntityConfig\('workItems'\)/)

  assert.match(semanticEntitiesSource, /cfg\('workItems', 'work-items'/)
  assert.match(semanticEntitiesSource, /cfg\('workReviews', 'work-reviews'/)
})
