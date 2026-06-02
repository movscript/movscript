import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assetWorkspaceContainsAssetSlots,
  canonicalizeProjectStandardsWorkspaceWorkspaceContent,
  normalizeRuntimeWorkspaceSource,
} from './workspaceRuntimeContent.js'
import type { BackendApplyResult } from '../../adapters/backend/backendApplyClient.js'
import type { AgentWorkspace } from '../../store/workspaceStore.js'

test('assetWorkspaceContainsAssetSlots detects concrete asset slots only', () => {
  assert.equal(assetWorkspaceContainsAssetSlots(JSON.stringify({ workspace: { asset_slots: [{ id: 'slot_1' }] } })), true)
  assert.equal(assetWorkspaceContainsAssetSlots(JSON.stringify({ workspace: { asset_slots: [] } })), false)
  assert.equal(assetWorkspaceContainsAssetSlots('not json'), false)
})

test('canonicalizeProjectStandardsWorkspaceWorkspaceContent rebases asset workspaces onto canonical snapshots', () => {
  const content = canonicalizeProjectStandardsWorkspaceWorkspaceContent(
    workspace({ kind: 'asset_workspace', content: JSON.stringify({ mode: 'workspace', workspace: { note: 'keep' } }) }),
    backendApply({ canonical_snapshot: { asset_slots: [{ id: 'slot_1' }], creative_references: [{ id: 'ref_1' }] } }),
  )
  assert.deepEqual(JSON.parse(content ?? ''), {
    mode: 'snapshot',
    workspace: { note: 'keep', asset_slots: [{ id: 'slot_1' }] },
  })
})

test('canonicalizeProjectStandardsWorkspaceWorkspaceContent rebases setting workspaces without asset slots', () => {
  const content = canonicalizeProjectStandardsWorkspaceWorkspaceContent(
    workspace({ kind: 'setting_workspace', content: JSON.stringify({ mode: 'workspace', workspace: { note: 'keep', asset_slots: [] } }) }),
    backendApply({ canonical_snapshot: { asset_slots: [{ id: 'slot_1' }], creative_references: [{ id: 'ref_1' }] } }),
  )
  assert.deepEqual(JSON.parse(content ?? ''), {
    mode: 'snapshot',
    workspace: { note: 'keep', creative_references: [{ id: 'ref_1' }] },
  })
})

test('canonicalizeProjectStandardsWorkspaceWorkspaceContent preserves project standards workspace style without planning arrays', () => {
  const content = canonicalizeProjectStandardsWorkspaceWorkspaceContent(
    workspace({ kind: 'project_standards_workspace', content: JSON.stringify({ workspace: { project_style: { tone: 'calm', custom_rules: [{ key: 'qa', label: 'QA', value: 'Check every output.' }] }, asset_slots: [{ id: 'old' }] } }) }),
    backendApply({ canonical_snapshot: { asset_slots: [{ id: 'slot_1' }] } }),
  )
  assert.deepEqual(JSON.parse(content ?? '').workspace, {
    project_style: { tone: 'calm', custom_rules: [{ key: 'qa', label: 'QA', value: 'Check every output.' }] },
  })
})

test('canonicalizeProjectStandardsWorkspaceWorkspaceContent rejects unsupported or malformed inputs', () => {
  assert.equal(canonicalizeProjectStandardsWorkspaceWorkspaceContent(workspace({ content: 'not json' }), backendApply({ canonical_snapshot: {} })), undefined)
  assert.equal(canonicalizeProjectStandardsWorkspaceWorkspaceContent(workspace(), backendApply({ other: true })), undefined)
})

test('canonicalizeProjectStandardsWorkspaceWorkspaceContent normalizes empty project standards workspace snapshots', () => {
  const content = canonicalizeProjectStandardsWorkspaceWorkspaceContent(
    workspace({ kind: 'project_standards_workspace' }),
    backendApply({ canonical_snapshot: {} }),
  )

  assert.deepEqual(JSON.parse(content ?? ''), {
    mode: 'snapshot',
    workspace: { project_style: {} },
  })
})

test('canonicalizeProjectStandardsWorkspaceWorkspaceContent rejects non-finite canonical snapshots', () => {
  const content = canonicalizeProjectStandardsWorkspaceWorkspaceContent(
    workspace({ kind: 'asset_workspace' }),
    backendApply({ canonical_snapshot: { asset_slots: [{ score: Number.POSITIVE_INFINITY }] } }),
  )

  assert.equal(content, undefined)
})

test('normalizeRuntimeWorkspaceSource keeps known JSON-safe workspace source fields', () => {
  assert.deepEqual(normalizeRuntimeWorkspaceSource({
    entityType: 'script',
    entityId: 1,
    runId: 'run_1',
    pageKey: 'page',
    pageEntityId: 'entity_1',
    ignored: 'ignored',
  }), {
    entityType: 'script',
    entityId: 1,
    runId: 'run_1',
    pageKey: 'page',
    pageEntityId: 'entity_1',
  })
  assert.equal(normalizeRuntimeWorkspaceSource({ ignored: 'ignored' }), undefined)
  assert.equal(normalizeRuntimeWorkspaceSource({ entityType: Symbol('bad') }), undefined)
  assert.equal(normalizeRuntimeWorkspaceSource({ entityId: Number.POSITIVE_INFINITY }), undefined)
})

test('normalizeRuntimeWorkspaceSource drops invalid numeric business reference ids', () => {
  assert.deepEqual(normalizeRuntimeWorkspaceSource({
    entityType: 'scene_moment',
    entityId: 0,
    pageEntityType: 'production',
    pageEntityId: 7.5,
    pageKey: 'production',
  }), {
    entityType: 'scene_moment',
    pageEntityType: 'production',
    pageKey: 'production',
  })
})

function workspace(overrides: Partial<AgentWorkspace> = {}): AgentWorkspace {
  return {
    id: 'workspace_1',
    kind: 'asset_workspace',
    title: 'Workspace',
    content: JSON.stringify({ workspace: {} }),
    status: 'workspace',
    createdAt: 'created',
    updatedAt: 'updated',
    ...overrides,
  }
}

function backendApply(response: NonNullable<BackendApplyResult['response']>): BackendApplyResult {
  return {
    performed: true,
    response,
  }
}
