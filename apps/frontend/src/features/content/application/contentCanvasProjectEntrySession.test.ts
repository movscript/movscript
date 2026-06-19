import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PROJECT_ENTRY_SESSION_SCHEMA_VERSION,
  type ProjectEntrySessionSnapshot,
} from '@/features/project/application/projectEntrySessionStore'
import {
  buildContentCanvasProjectEntrySessionSearch,
  resolveContentCanvasProjectEntrySessionState,
} from './contentCanvasProjectEntrySession'

function snapshot(filters: ProjectEntrySessionSnapshot['filters']): ProjectEntrySessionSnapshot {
  return {
    schemaVersion: PROJECT_ENTRY_SESSION_SCHEMA_VERSION,
    projectId: 7,
    projectEntryId: 'content',
    updatedAt: new Date(0).toISOString(),
    filters,
  }
}

test('content canvas project entry session builds stable restored search', () => {
  assert.equal(
    buildContentCanvasProjectEntrySessionSearch({
      activeKind: 'character',
      canvasMode: 'setting',
      selectedNodeId: 'setting:hero',
      selectionKind: 'setting',
    }),
    'mode=setting&node=setting%3Ahero&kind=setting&settingKind=character',
  )
})

test('content canvas project entry session prefers explicit search over snapshot', () => {
  const state = resolveContentCanvasProjectEntrySessionState({
    hasExplicitSearch: true,
    searchParams: new URLSearchParams('mode=setting&node=setting%3Avillain&kind=setting&settingKind=prop'),
    snapshot: snapshot({
      canvasMode: 'scene_moment',
      selectedNodeId: 'scene_moment:old',
      selectionKind: 'scene_moment',
    }),
  })

  assert.deepEqual(state, {
    activeKind: 'prop',
    canvasMode: 'setting',
    selectedNodeId: 'setting:villain',
    selectionKind: 'setting',
  })
})

test('content canvas project entry session restores from snapshot without explicit search', () => {
  const state = resolveContentCanvasProjectEntrySessionState({
    hasExplicitSearch: false,
    searchParams: new URLSearchParams(),
    snapshot: snapshot({
      activeKind: 'visual_style',
      canvasMode: 'scene_moment',
      selectedNodeId: 'scene_moment:intro',
      selectionKind: 'scene_moment',
    }),
  })

  assert.deepEqual(state, {
    activeKind: 'visual_style',
    canvasMode: 'scene_moment',
    selectedNodeId: 'scene_moment:intro',
    selectionKind: 'scene_moment',
  })
})
