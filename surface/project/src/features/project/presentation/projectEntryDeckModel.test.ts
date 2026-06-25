import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PROJECT_ENTRY_SESSION_SCHEMA_VERSION,
  projectEntrySessionKey,
  type ProjectEntrySessionSnapshot,
} from '../application/projectEntrySessionStore'
import {
  buildProjectEntryDeck,
  buildProjectEntryDeckOrderUpdates,
} from './projectEntryDeckModel'

function snapshot(input: Omit<ProjectEntrySessionSnapshot, 'schemaVersion' | 'updatedAt'> & { updatedAt?: string }): ProjectEntrySessionSnapshot {
  return {
    schemaVersion: PROJECT_ENTRY_SESSION_SCHEMA_VERSION,
    ...input,
    updatedAt: input.updatedAt ?? new Date(0).toISOString(),
  }
}

test('project entry deck defaults to product entry order', () => {
  const deck = buildProjectEntryDeck({
    projectId: 7,
    snapshots: {},
  })

  assert.deepEqual(deck.tabs.map((tab) => tab.id), [
    'orchestration_production',
    'content',
    'project_standards',
  ])
  assert.equal(deck.orderIndex.get('orchestration_production'), 0)
})

test('project entry deck uses snapshot deck order and keeps active hidden entry visible', () => {
  const snapshots = {
    [projectEntrySessionKey(7, 'orchestration_production')]: snapshot({
      projectId: 7,
      projectEntryId: 'orchestration_production',
      deckOrder: 2,
      open: false,
      route: '/project/scripts/workbench',
      search: 'productionId=3',
      updatedAt: '2026-06-19T10:00:00.000Z',
    }),
    [projectEntrySessionKey(7, 'content')]: snapshot({
      projectId: 7,
      projectEntryId: 'content',
      deckOrder: 0,
      updatedAt: '2026-06-19T09:00:00.000Z',
    }),
    [projectEntrySessionKey(7, 'project_standards')]: snapshot({
      projectId: 7,
      projectEntryId: 'project_standards',
      deckOrder: 1,
      updatedAt: '2026-06-19T11:00:00.000Z',
    }),
  }

  const inactiveDeck = buildProjectEntryDeck({
    projectId: 7,
    snapshots,
  })
  assert.deepEqual(inactiveDeck.tabs.map((tab) => tab.id), ['content', 'project_standards'])
  assert.deepEqual([...inactiveDeck.hiddenEntryIds], ['orchestration_production'])

  const activeDeck = buildProjectEntryDeck({
    activeEntryId: 'orchestration_production',
    projectId: 7,
    snapshots,
  })
  assert.deepEqual(activeDeck.tabs.map((tab) => tab.id), ['content', 'project_standards', 'orchestration_production'])
  assert.equal(activeDeck.tabs[2]?.active, true)
  assert.equal(activeDeck.tabs[2]?.restoredRoute, '/project/scripts/workbench')
  assert.equal(activeDeck.tabs[2]?.restoredSearch, 'productionId=3')
  assert.equal(activeDeck.hiddenEntryIds.has('orchestration_production'), false)
})

test('project entry deck restores legacy script workbench snapshots for orchestration entry', () => {
  const snapshots = {
    [projectEntrySessionKey(7, 'scripts')]: snapshot({
      projectId: 7,
      projectEntryId: 'scripts',
      route: '/project/scripts/workbench',
      search: 'script_id=42',
      filters: { scriptId: 42 },
    }),
  }

  const deck = buildProjectEntryDeck({
    projectId: 7,
    snapshots,
  })

  const scriptTab = deck.tabs.find((tab) => tab.id === 'orchestration_production')
  assert.equal(scriptTab?.restoredRoute, '/project/scripts/workbench')
  assert.equal(scriptTab?.restoredSearch, 'script_id=42')
  assert.equal(scriptTab?.snapshot?.projectEntryId, 'scripts')
})

test('project entry deck reorder updates are expressed as project entry snapshots', () => {
  const updates = buildProjectEntryDeckOrderUpdates({
    projectId: 7,
    snapshots: {},
    draggedEntryId: 'project_standards',
    targetEntryId: 'orchestration_production',
    position: 'before',
  })

  assert.deepEqual(updates, [
    { projectEntryId: 'project_standards', deckOrder: 0 },
    { projectEntryId: 'orchestration_production', deckOrder: 1 },
    { projectEntryId: 'content', deckOrder: 2 },
  ])
})
