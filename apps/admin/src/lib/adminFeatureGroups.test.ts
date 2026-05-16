import assert from 'node:assert/strict'
import test from 'node:test'
import { groupAdminFeatures } from './adminFeatureGroups'

test('groupAdminFeatures separates tool and system features without reordering', () => {
  const grouped = groupAdminFeatures([
    { feature_key: 'tool_a', is_internal: false },
    { feature_key: 'system_a', is_internal: true },
    { feature_key: 'tool_b', is_internal: false },
    { feature_key: 'system_b', is_internal: true },
  ])

  assert.deepEqual(grouped.toolFeatures.map((feature) => feature.feature_key), ['tool_a', 'tool_b'])
  assert.deepEqual(grouped.systemFeatures.map((feature) => feature.feature_key), ['system_a', 'system_b'])
})
