import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('delivery entity API uses workspace semantic repository instead of backend entity routes', () => {
  const deliveryEntitiesSource = readFileSync(resolve('src/features/resources/infrastructure/deliveryEntities.ts'), 'utf8')
  const semanticEntitiesSource = readFileSync(resolve('src/shared/infrastructure/api/semanticEntities.ts'), 'utf8')

  assert.doesNotMatch(deliveryEntitiesSource, /\/entities\//)
  assert.match(deliveryEntitiesSource, /listSemanticEntities/)
  assert.match(deliveryEntitiesSource, /createSemanticEntity/)
  assert.match(deliveryEntitiesSource, /updateSemanticEntity/)
  assert.match(deliveryEntitiesSource, /deleteSemanticEntity/)

  assert.match(semanticEntitiesSource, /deliveryVersions:[\s\S]*schema: 'movscript\.delivery_version\.v1'/)
  assert.match(semanticEntitiesSource, /deliveryTimelineItems:[\s\S]*schema: 'movscript\.delivery_timeline_item\.v1'/)
  assert.match(semanticEntitiesSource, /exportRecords:[\s\S]*schema: 'movscript\.export_record\.v1'/)
})
