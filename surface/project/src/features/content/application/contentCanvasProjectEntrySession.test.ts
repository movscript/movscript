import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PROJECT_ENTRY_SESSION_SCHEMA_VERSION,
  type ProjectEntrySessionSnapshot,
} from '../../project/application/projectEntrySessionStore'
import {
  buildContentCanvasProjectEntrySessionSearch,
  resolveContentCanvasProjectEntrySessionState,
} from './contentCanvasProjectEntrySession'

function snapshot(filters: ProjectEntrySessionSnapshot['filters']): ProjectEntrySessionSnapshot {
  return {
    schemaVersion: PROJECT_ENTRY_SESSION_SCHEMA_VERSION,
    projectId: 7,
    projectEntryId: 'content_preview',
    updatedAt: new Date(0).toISOString(),
    filters,
  }
}

test('content canvas project entry session builds stable restored search', () => {
  assert.equal(
    buildContentCanvasProjectEntrySessionSearch({
      activeKind: 'character',
      activeCanvasNodeId: 'scene_moment:intro',
      selectedNodeId: 'setting:hero',
      selectionKind: 'setting',
      workspaceTab: 'canvas',
    }),
    'tab=canvas&canvasNode=scene_moment%3Aintro&node=setting%3Ahero&kind=setting&settingKind=character',
  )
})

test('content canvas project entry session prefers explicit search over snapshot', () => {
  const state = resolveContentCanvasProjectEntrySessionState({
    hasExplicitSearch: true,
    searchParams: new URLSearchParams('mode=setting&canvasNode=scene_moment%3Aintro&node=setting%3Avillain&kind=setting&settingKind=prop'),
    snapshot: snapshot({
      activeCanvasNodeId: 'scene_moment:old',
      workspaceTab: 'preview',
      selectedNodeId: 'scene_moment:old',
      selectionKind: 'scene_moment',
    }),
  })

  assert.deepEqual(state, {
    activeKind: 'prop',
    activeCanvasNodeId: 'scene_moment:intro',
    selectedNodeId: 'setting:villain',
    selectionKind: 'setting',
    workspaceTab: 'preview',
  })
})

test('content canvas project entry session restores from snapshot without explicit search', () => {
  const state = resolveContentCanvasProjectEntrySessionState({
    hasExplicitSearch: false,
    searchParams: new URLSearchParams(),
    snapshot: snapshot({
      activeKind: 'visual_style',
      activeCanvasNodeId: 'scene_moment:intro',
      workspaceTab: 'canvas',
      selectedNodeId: 'asset:phone',
      selectionKind: 'asset',
    }),
  })

  assert.deepEqual(state, {
    activeKind: 'visual_style',
    activeCanvasNodeId: 'scene_moment:intro',
    selectedNodeId: 'asset:phone',
    selectionKind: 'asset',
    workspaceTab: 'canvas',
  })
})

test('content canvas project entry session falls back to selected node for legacy links', () => {
  const state = resolveContentCanvasProjectEntrySessionState({
    hasExplicitSearch: true,
    searchParams: new URLSearchParams('mode=structure&node=scene_moment%3Aintro&kind=scene_moment'),
    snapshot: null,
  })

  assert.deepEqual(state, {
    activeCanvasNodeId: 'scene_moment:intro',
    selectedNodeId: 'scene_moment:intro',
    selectionKind: 'scene_moment',
    workspaceTab: 'preview',
  })
})

test('content canvas project entry session can focus preview on a production namespace', () => {
  const state = resolveContentCanvasProjectEntrySessionState({
    hasExplicitSearch: true,
    searchParams: new URLSearchParams('tab=preview&canvasNode=production%3Apilot&node=production%3Apilot&kind=other'),
    snapshot: null,
  })

  assert.deepEqual(state, {
    activeCanvasNodeId: 'production:pilot',
    selectedNodeId: 'production:pilot',
    selectionKind: 'other',
    workspaceTab: 'preview',
  })
})

test('content canvas project entry session derives production focus from normalized scope refs', () => {
  const state = resolveContentCanvasProjectEntrySessionState({
    hasExplicitSearch: true,
    searchParams: new URLSearchParams('tab=preview&scopeKind=episode&scopeRef=episode_01&targetKind=timeline_assembly&targetRef=timeline_assembly%3Aepisode%3Aepisode_01'),
    snapshot: null,
  })

  assert.deepEqual(state, {
    activeCanvasNodeId: 'production:episode_01',
    selectedNodeId: 'production:episode_01',
    selectionKind: 'other',
    workspaceTab: 'preview',
  })
})

test('content canvas project entry session derives production focus from timeline assembly ref aliases', () => {
  const state = resolveContentCanvasProjectEntrySessionState({
    hasExplicitSearch: true,
    searchParams: new URLSearchParams('timeline_assembly_ref=timeline_assembly%3Afilm%3Ashort_film'),
    snapshot: null,
  })

  assert.deepEqual(state, {
    activeCanvasNodeId: 'production:short_film',
    selectedNodeId: 'production:short_film',
    selectionKind: 'other',
    workspaceTab: 'preview',
  })
})

test('content canvas project entry session derives setting focus for setting preview links', () => {
  const state = resolveContentCanvasProjectEntrySessionState({
    hasExplicitSearch: true,
    searchParams: new URLSearchParams('setting_id=hero&settingKind=character'),
    snapshot: null,
  })

  assert.deepEqual(state, {
    activeKind: 'character',
    activeCanvasNodeId: 'setting:hero',
    selectedNodeId: 'setting:hero',
    selectionKind: 'setting',
    workspaceTab: 'preview',
  })
})

test('content canvas project entry session derives setting state and asset focus for setting preview links', () => {
  assert.deepEqual(
    resolveContentCanvasProjectEntrySessionState({
      hasExplicitSearch: true,
      searchParams: new URLSearchParams('setting_state_id=rain'),
      snapshot: null,
    }),
    {
      activeCanvasNodeId: 'state:rain',
      selectedNodeId: 'state:rain',
      selectionKind: 'state',
      workspaceTab: 'preview',
    },
  )

  assert.deepEqual(
    resolveContentCanvasProjectEntrySessionState({
      hasExplicitSearch: true,
      searchParams: new URLSearchParams('asset_slot_id=phone'),
      snapshot: null,
    }),
    {
      activeCanvasNodeId: 'asset:phone',
      selectedNodeId: 'asset:phone',
      selectionKind: 'asset',
      workspaceTab: 'preview',
    },
  )
})
