import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('script version API uses workspace semantic repository instead of backend entity routes', () => {
  const scriptVersionsSource = readFileSync(resolve('src/features/resources/infrastructure/scriptVersions.ts'), 'utf8')
  const semanticEntitiesSource = readFileSync(resolve('src/shared/infrastructure/api/semanticEntities.ts'), 'utf8')

  assert.doesNotMatch(scriptVersionsSource, /\/entities\/script-versions/)
  assert.match(scriptVersionsSource, /listSemanticEntities/)
  assert.match(scriptVersionsSource, /createSemanticEntity/)
  assert.match(scriptVersionsSource, /scriptVersionLines/)
  assert.match(semanticEntitiesSource, /scriptVersions: 'script_version'/)
})
