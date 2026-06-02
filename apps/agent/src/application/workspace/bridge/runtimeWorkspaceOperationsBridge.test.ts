import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryAgentWorkspaceStore, validateWorkspace } from '../../../workspaces/store/workspaceStore.js'
import type { RuntimeWorkspaceBackendApplyResult } from '../../../ports/workspace/backend/runtimeWorkspaceBackendApplyPort.js'
import { createRuntimeWorkspaceOperationsBridge } from './runtimeWorkspaceOperationsBridge.js'

test('createRuntimeWorkspaceOperationsBridge wires workspace CRUD and apply helpers', async () => {
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  const backendApply: RuntimeWorkspaceBackendApplyResult = { performed: false, skippedReason: 'test' }
  const backendApplyPort = {
    previewApplyReview: async () => ({ ok: true, backendApply } as const),
    applyReview: async () => backendApply,
  }
  const bridge = createRuntimeWorkspaceOperationsBridge({
    workspaceStore,
    backendApplyPort,
    now: () => '2026-01-01T00:00:00.000Z',
  })

  const workspace = bridge.createLocalWorkspace({
    projectId: 42,
    kind: 'project_standards_workspace',
    title: 'Script',
    content: JSON.stringify({
      schema: 'movscript.project_standards_workspace.v1',
      scope: 'project_standards_workspace',
      mode: 'snapshot',
      workspace: {
        project_style: {
          custom_rules: [],
        },
      },
    }),
  })
  const simulated = await bridge.simulateApplyWorkspace({
    workspaceId: workspace.id,
    targetEntityType: 'script',
    targetEntityId: 1,
    targetField: 'content',
  }) as { ok?: boolean; backendApply?: RuntimeWorkspaceBackendApplyResult }
  const rejected = bridge.rejectWorkspace({ workspaceId: workspace.id, reason: 'not needed' })

  assert.equal(bridge.listWorkspaces({ projectId: 42 }).length, 1)
  assert.equal(bridge.getWorkspace(workspace.id)?.id, workspace.id)
  assert.equal(validateWorkspace(workspace).ok, true)
  assert.equal(simulated.ok, true)
  assert.equal(simulated.backendApply, backendApply)
  assert.equal(rejected.status, 'workspace')
  assert.equal(rejected.metadata?.lastReviewStatus, 'rejected')
})
