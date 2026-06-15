import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PROJECT_ENTRY_SESSION_SCHEMA_VERSION,
  hasExplicitProjectEntrySearchParam,
  normalizeProjectEntrySessionSnapshots,
  useProjectEntrySessionStore,
  projectEntrySessionKey,
} from './projectEntrySessionStore'

test('project entry session keys are scoped by project and entry', () => {
  assert.equal(projectEntrySessionKey(12, 'content'), '12:content')
  assert.equal(projectEntrySessionKey(12, 'scripts'), '12:scripts')
  assert.equal(projectEntrySessionKey(null, 'orchestration_production'), '0:orchestration_production')
})

test('project entry session explicit search detection ignores empty params', () => {
  assert.equal(hasExplicitProjectEntrySearchParam(new URLSearchParams('scene_moment_id=7'), ['scene_moment_id']), true)
  assert.equal(hasExplicitProjectEntrySearchParam(new URLSearchParams('scene_moment_id='), ['scene_moment_id']), false)
  assert.equal(hasExplicitProjectEntrySearchParam(new URLSearchParams('foo=1'), ['scene_moment_id']), false)
})

test('project entry session snapshot normalization drops invalid entries and preserves scalar state', () => {
  const snapshots = normalizeProjectEntrySessionSnapshots({
    valid: {
      projectId: '18',
      projectEntryId: 'orchestration_production',
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
      projectEntryId: 'orchestration_production',
    },
  })

  assert.deepEqual(Object.keys(snapshots), ['valid'])
  assert.equal(snapshots.valid?.schemaVersion, PROJECT_ENTRY_SESSION_SCHEMA_VERSION)
  assert.equal(snapshots.valid?.projectId, 18)
  assert.deepEqual(snapshots.valid?.filters, { productionId: 4, selectedItemId: 77 })
  assert.deepEqual(snapshots.valid?.selection?.primary, { entityType: 'production', entityId: 4 })
})

test('project entry session store merges partial filter updates for the same entry', () => {
  useProjectEntrySessionStore.setState({ snapshots: {}, hydrated: true })

  useProjectEntrySessionStore.getState().upsertSnapshot({
    projectId: 9,
    projectEntryId: 'orchestration_production',
    filters: { productionFilter: 'all', productionSearch: '' },
    selection: { primary: { entityType: 'production', entityId: 3 } },
  })
  useProjectEntrySessionStore.getState().upsertSnapshot({
    projectId: 9,
    projectEntryId: 'orchestration_production',
    filters: { selectedItemId: 44 },
    selection: {
      primary: { entityType: 'production', entityId: 3 },
      secondary: { entityType: 'scene_moment', entityId: 12 },
    },
  })

  const snapshot = useProjectEntrySessionStore.getState().snapshotFor(9, 'orchestration_production')
  assert.deepEqual(snapshot?.filters, { productionFilter: 'all', productionSearch: '', selectedItemId: 44 })
  assert.deepEqual(snapshot?.selection?.secondary, { entityType: 'scene_moment', entityId: 12 })
})

test('project entry session snapshot normalization accepts legacy workbench ids', () => {
  const snapshots = normalizeProjectEntrySessionSnapshots({
    legacy: {
      projectId: 20,
      workbenchId: 'orchestration_production',
      filters: { productionId: 5 },
    },
    legacyContent: {
      projectId: 21,
      workbenchId: 'content_orchestration',
    },
  })

  assert.equal(snapshots.legacy?.projectEntryId, 'orchestration_production')
  assert.deepEqual(snapshots.legacy?.filters, { productionId: 5 })
  assert.equal(snapshots.legacyContent?.projectEntryId, 'content')
})
