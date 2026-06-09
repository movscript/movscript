import assert from 'node:assert/strict'
import test from 'node:test'

import {
  WORKBENCH_SESSION_SCHEMA_VERSION,
  hasExplicitWorkbenchSearchParam,
  normalizeWorkbenchSessionSnapshots,
  useWorkbenchSessionStore,
  workbenchSessionKey,
} from './workbenchSessionStore'

test('workbench session keys are scoped by project and workbench', () => {
  assert.equal(workbenchSessionKey(12, 'content_orchestration'), '12:content_orchestration')
  assert.equal(workbenchSessionKey(12, 'scripts'), '12:scripts')
  assert.equal(workbenchSessionKey(null, 'orchestration_production'), '0:orchestration_production')
})

test('workbench session explicit search detection ignores empty params', () => {
  assert.equal(hasExplicitWorkbenchSearchParam(new URLSearchParams('scene_moment_id=7'), ['scene_moment_id']), true)
  assert.equal(hasExplicitWorkbenchSearchParam(new URLSearchParams('scene_moment_id='), ['scene_moment_id']), false)
  assert.equal(hasExplicitWorkbenchSearchParam(new URLSearchParams('foo=1'), ['scene_moment_id']), false)
})

test('workbench session snapshot normalization drops invalid entries and preserves scalar state', () => {
  const snapshots = normalizeWorkbenchSessionSnapshots({
    valid: {
      projectId: '18',
      workbenchId: 'orchestration_production',
      route: '/project/scripts/workbench',
      search: 'productionId=4',
      updatedAt: '2026-05-29T00:00:00.000Z',
      filters: {
        productionId: 4,
        selectedItemId: 77,
        ignored: { nested: true },
      },
      selection: {
        primary: { entityType: 'production', entityId: '4' },
        secondary: { entityType: 'scene_moment', entityId: 9 },
        scopeLevel: 'production',
      },
    },
    invalid: {
      projectId: 0,
      workbenchId: 'orchestration_production',
    },
  })

  assert.deepEqual(Object.keys(snapshots), ['valid'])
  assert.equal(snapshots.valid?.schemaVersion, WORKBENCH_SESSION_SCHEMA_VERSION)
  assert.equal(snapshots.valid?.projectId, 18)
  assert.deepEqual(snapshots.valid?.filters, { productionId: 4, selectedItemId: 77 })
  assert.deepEqual(snapshots.valid?.selection?.primary, { entityType: 'production', entityId: 4 })
})

test('workbench session store merges partial filter updates for the same workbench', () => {
  useWorkbenchSessionStore.setState({ snapshots: {}, hydrated: true })

  useWorkbenchSessionStore.getState().upsertSnapshot({
    projectId: 9,
    workbenchId: 'orchestration_production',
    filters: { productionFilter: 'all', productionSearch: '' },
    selection: { primary: { entityType: 'production', entityId: 3 } },
  })
  useWorkbenchSessionStore.getState().upsertSnapshot({
    projectId: 9,
    workbenchId: 'orchestration_production',
    filters: { selectedItemId: 44 },
    selection: {
      primary: { entityType: 'production', entityId: 3 },
      secondary: { entityType: 'scene_moment', entityId: 12 },
    },
  })

  const snapshot = useWorkbenchSessionStore.getState().snapshotFor(9, 'orchestration_production')
  assert.deepEqual(snapshot?.filters, { productionFilter: 'all', productionSearch: '', selectedItemId: 44 })
  assert.deepEqual(snapshot?.selection?.secondary, { entityType: 'scene_moment', entityId: 12 })
})
