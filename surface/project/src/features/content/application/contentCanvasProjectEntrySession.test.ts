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
