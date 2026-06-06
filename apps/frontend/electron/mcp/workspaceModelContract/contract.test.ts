import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { getWorkspaceModelContract } from './contract'

function record(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  return value as Record<string, unknown>
}

test('workspace projection seed owns initial protocol and content', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-workspace-model-contract-'))
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  let contract: Record<string, unknown> | undefined
  try {
    contract = record(await getWorkspaceModelContract({
      kind: 'setting_workspace',
      target: { projectId: 1 },
    }))
  } finally {
    if (previousWorkspaceDir === undefined) delete process.env.MOVSCRIPT_WORKSPACE_DIR
    else process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
  }
  assert.ok(contract)
  const protocol = record(contract.workspaceProtocol)
  const sync = record(protocol.sync)
  const open = record(protocol.open)
  const validation = record(protocol.validation)
  const save = record(protocol.save)
  const initialContent = record(contract.initialContent)
  const projection = record(contract.projection)

  assert.equal(protocol.owner, 'frontend')
  assert.equal(protocol.role, 'canonical_snapshot_editing_surface')
  assert.equal(protocol.format, 'json')
  assert.equal(sync.owner, 'frontend')
  assert.equal(sync.agentWritable, false)
  assert.equal(open.contentRequired, false)
  assert.equal(open.initialContentSource, 'mcp.initialContent')
  assert.equal(validation.effectsRequiredBeforeSave, true)
  assert.equal(validation.effectsRequiredBeforeMaterialize, true)
  assert.equal(validation.snapshotRequired, true)
  assert.equal(save.boundary, 'setting_workspace')
  assert.equal(save.updateTool, 'workspace_update')
  assert.equal(save.materializeTool, 'workspace_apply')
  assert.equal(save.previewTool, 'workspace_apply_review')
  assert.equal(initialContent.schema, 'movscript.setting_workspace.v1')
  assert.equal(initialContent.scope, 'setting_workspace')
  assert.equal(projection.materialized, true)
  assert.equal(projection.agentWritable, false)
  assert.equal(projection.workspacePath, 'data/users/local/projects/1/settings/setting.workspace.json')
  assert.equal(projection.syncPath, 'sync/users/local/projects/1/settings/setting.sync.json')
  assert.equal(existsSync(join(workspaceDir, '.movscript', 'data', 'users', 'local', 'projects', '1', 'settings', 'setting.workspace.json')), true)
  const syncRecord = record(JSON.parse(readFileSync(join(workspaceDir, '.movscript', 'sync', 'users', 'local', 'projects', '1', 'settings', 'setting.sync.json'), 'utf8')))
  assert.equal(syncRecord.schema, 'movscript.projection-sync.v1')
  assert.equal(syncRecord.workspaceKind, 'setting_workspace')
  assert.equal(syncRecord.workspacePath, projection.workspacePath)
  assert.equal(syncRecord.metaPath, projection.metaPath)
  assert.equal(typeof syncRecord.contentHash, 'string')
  assert.equal(syncRecord.action, 'materialized')
})

test('content unit workspace projection separates unit-scoped and scene-scoped snapshots', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-content-unit-projection-'))
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  try {
    const unitContract = record(await getWorkspaceModelContract({
      kind: 'content_unit_workspace',
      target: {
        projectId: 1,
        productionId: 7,
        sceneMomentId: 402,
        entityType: 'content_unit',
        entityId: 801,
      },
    }))
    const unitInitialContent = record(unitContract.initialContent)
    const unitProjection = record(unitContract.projection)

    assert.equal(unitInitialContent.sceneMomentId, 402)
    assert.equal(unitInitialContent.contentUnitId, 801)
    assert.equal(unitProjection.workspacePath, 'data/users/local/projects/1/productions/7/scene_moments/402/content_units/801/content_unit.workspace.json')
    assert.equal(unitProjection.syncPath, 'sync/users/local/projects/1/productions/7/scene_moments/402/content_units/801/content_unit.sync.json')
    assert.equal(existsSync(join(workspaceDir, '.movscript', 'data', 'users', 'local', 'projects', '1', 'productions', '7', 'scene_moments', '402', 'content_units', '801', 'content_unit.workspace.json')), true)

    const sceneContract = record(await getWorkspaceModelContract({
      kind: 'content_unit_workspace',
      target: {
        projectId: 1,
        productionId: 7,
        entityType: 'scene_moment',
        entityId: 402,
      },
    }))
    const sceneInitialContent = record(sceneContract.initialContent)
    const sceneProjection = record(sceneContract.projection)

    assert.equal(sceneInitialContent.sceneMomentId, 402)
    assert.equal(sceneInitialContent.contentUnitId, undefined)
    assert.equal(sceneProjection.workspacePath, 'data/users/local/projects/1/productions/7/scene_moments/402/content_units/content_units.workspace.json')
    assert.equal(sceneProjection.syncPath, 'sync/users/local/projects/1/productions/7/scene_moments/402/content_units/content_units.sync.json')
    assert.equal(existsSync(join(workspaceDir, '.movscript', 'data', 'users', 'local', 'projects', '1', 'productions', '7', 'scene_moments', '402', 'content_units', 'content_units.workspace.json')), true)
  } finally {
    if (previousWorkspaceDir === undefined) delete process.env.MOVSCRIPT_WORKSPACE_DIR
    else process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
  }
})
