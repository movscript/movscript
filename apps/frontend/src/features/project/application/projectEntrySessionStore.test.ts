import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

test('project entry session persistence is routed through desktop Home storage', () => {
  const source = readFileSync(resolve('src/features/project/application/projectEntrySessionStore.ts'), 'utf8')

  assert.match(source, /createDesktopStateStorage\(PROJECT_ENTRY_SESSION_STORAGE_KEY, fallback\)/)
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
      deckOrder: '2',
      open: false,
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
  assert.equal(snapshots.valid?.deckOrder, 2)
  assert.equal(snapshots.valid?.open, false)
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

test('project entry session store ignores semantically identical snapshot upserts', () => {
  useProjectEntrySessionStore.setState({ snapshots: {}, hydrated: true })

  useProjectEntrySessionStore.getState().upsertSnapshot({
    projectId: 9,
    projectEntryId: 'content',
    route: '/project/content',
    search: 'mode=scene_moment&node=scene-main&kind=scene_moment',
    filters: {
      activeKind: 'all',
      canvasMode: 'scene_moment',
      selectedNodeId: 'scene-main',
      selectionKind: 'scene_moment',
    },
    selection: undefined,
  })
  const beforeSnapshots = useProjectEntrySessionStore.getState().snapshots
  const beforeSnapshot = useProjectEntrySessionStore.getState().snapshotFor(9, 'content')
  let notificationCount = 0
  const unsubscribe = useProjectEntrySessionStore.subscribe(() => {
    notificationCount += 1
  })

  try {
    useProjectEntrySessionStore.getState().upsertSnapshot({
      projectId: 9,
      projectEntryId: 'content',
      route: '/project/content',
      search: 'mode=scene_moment&node=scene-main&kind=scene_moment',
      filters: {
        activeKind: 'all',
        canvasMode: 'scene_moment',
        selectedNodeId: 'scene-main',
        selectionKind: 'scene_moment',
      },
      selection: undefined,
    })
  } finally {
    unsubscribe()
  }

  assert.equal(notificationCount, 0)
  assert.equal(useProjectEntrySessionStore.getState().snapshots, beforeSnapshots)
  assert.equal(useProjectEntrySessionStore.getState().snapshotFor(9, 'content'), beforeSnapshot)
})

test('project entry session store keeps deck state without clearing entry context', () => {
  useProjectEntrySessionStore.setState({ snapshots: {}, hydrated: true })

  useProjectEntrySessionStore.getState().upsertSnapshot({
    projectId: 9,
    projectEntryId: 'content',
    route: '/project/content',
    search: 'scene_moment_id=12',
    filters: { selectedItemId: 44 },
    selection: {
      primary: { entityType: 'scene_moment', entityId: 12 },
    },
  })
  useProjectEntrySessionStore.getState().setEntryOpen(9, 'content', false)
  useProjectEntrySessionStore.getState().setEntryDeckOrders(9, [
    { projectEntryId: 'content', deckOrder: 0 },
  ])

  const snapshot = useProjectEntrySessionStore.getState().snapshotFor(9, 'content')
  assert.equal(snapshot?.open, false)
  assert.equal(snapshot?.deckOrder, 0)
  assert.equal(snapshot?.route, '/project/content')
  assert.equal(snapshot?.search, 'scene_moment_id=12')
  assert.deepEqual(snapshot?.filters, { selectedItemId: 44 })
  assert.deepEqual(snapshot?.selection?.primary, { entityType: 'scene_moment', entityId: 12 })
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
