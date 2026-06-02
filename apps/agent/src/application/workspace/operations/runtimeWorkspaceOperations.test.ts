import assert from 'node:assert/strict'
import test from 'node:test'
import { isRecord } from '../../../shared/json/jsonValue.js'
import { InMemoryAgentWorkspaceStore } from '../../../workspaces/store/workspaceStore.js'
import {
  applyRuntimeWorkspaceFromUI,
  createRuntimeLocalWorkspace,
  getRuntimeWorkspace,
  listRuntimeWorkspaces,
  previewRuntimeWorkspaceApply,
  rejectRuntimeWorkspace,
  simulateRuntimeWorkspaceApply,
  updateRuntimeWorkspace,
} from './runtimeWorkspaceOperations.js'
import type {
  RuntimeWorkspaceBackendApplyPort,
  RuntimeWorkspaceBackendApplyPreviewResult,
  RuntimeWorkspaceBackendApplyResult,
} from '../../../ports/workspace/backend/runtimeWorkspaceBackendApplyPort.js'

test('runtime workspace CRUD helpers normalize inputs and preview workspace apply', () => {
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  const workspace = createRuntimeLocalWorkspace({
    workspaceStore,
    workspaceInput: {
      projectId: 42,
      kind: 'project_standards_workspace',
      title: 'Script',
      content: JSON.stringify({ body: 'Workspace content' }),
      source: { threadId: 'thread_1', unsafe: new Date() },
    },
  })

  assert.equal(getRuntimeWorkspace({ workspaceStore, workspaceId: workspace.id })?.id, workspace.id)
  assert.equal(listRuntimeWorkspaces({ workspaceStore, query: { projectId: 42, kind: 'project_standards_workspace' } }).length, 1)

  const updated = updateRuntimeWorkspace({
    workspaceStore,
    workspaceInput: { workspaceId: workspace.id, title: 'Updated script', status: 'accepted' },
  })
  assert.equal(updated.title, 'Updated script')
  assert.equal(updated.status, 'workspace')

  const preview = previewRuntimeWorkspaceApply({
    workspaceStore,
    applyInput: { workspaceId: workspace.id, targetEntityType: 'script', targetEntityId: 1, targetField: 'content' },
  }) as { status?: string; review?: { workspaceId?: string } }
  assert.equal(preview.status, 'preview')
  assert.equal(preview.review?.workspaceId, workspace.id)

  const rejected = rejectRuntimeWorkspace({ workspaceStore, workspaceId: workspace.id, reason: 'not needed' })
  assert.equal(rejected.status, 'workspace')
  assert.equal(rejected.rejectedReason, 'not needed')
  assert.equal(rejected.metadata?.lastReviewStatus, 'rejected')
})

test('simulateRuntimeWorkspaceApply returns local validation failures before backend calls', async () => {
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  const workspace = workspaceStore.createWorkspace({
    kind: 'project_standards_workspace',
    title: 'Script',
    content: '',
    target: { entityType: 'script', entityId: 1, field: 'content' },
  })
  const backend = fakeBackendApplyPort()

  const result = await simulateRuntimeWorkspaceApply({
    workspaceStore,
    backendApplyPort: backend,
    applyInput: { workspaceId: workspace.id },
  }) as { ok?: boolean; stage?: string }

  assert.equal(result.ok, false)
  assert.equal(result.stage, 'local_validation')
  assert.equal(backend.previewCalls, 0)
})

test('simulateRuntimeWorkspaceApply projects backend preview errors without throwing', async () => {
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  const workspace = workspaceStore.createWorkspace({
    kind: 'project_standards_workspace',
    title: 'Script',
    content: JSON.stringify({
      schema: 'movscript.project_standards_workspace.v1',
      scope: 'project_standards_workspace',
      mode: 'snapshot',
      workspace: { project_style: { custom_rules: [] } },
    }),
    target: { entityType: 'script', entityId: 1, field: 'content' },
  })
  const backend = fakeBackendApplyPort({
    previewResult: {
      ok: false,
      error: 'failed',
      backendError: {
        method: 'POST',
        path: '/projects/1/entities/production-workspaces/apply-preview',
        status: 422,
        responseText: '{"error":"invalid"}',
        response: { error: 'invalid' },
      },
    },
  })

  const result = await simulateRuntimeWorkspaceApply({
    workspaceStore,
    backendApplyPort: backend,
    applyInput: { workspaceId: workspace.id },
  }) as { ok?: boolean; stage?: string; backendError?: { status?: number } }

  assert.equal(result.ok, false)
  assert.equal(result.stage, 'backend_apply_preview')
  assert.equal(result.backendError?.status, 422)
})

test('applyRuntimeWorkspaceFromUI records asset planning workspace apply without backend writes', async () => {
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  const workspace = workspaceStore.createWorkspace({
    kind: 'asset_workspace',
    title: 'Asset taskGraph',
    content: JSON.stringify({ workspace: { asset_slots: [], candidates: [{ id: 'candidate_1' }] } }),
    target: { entityType: 'project', entityId: 1 },
  })
  const backend = fakeBackendApplyPort()

  const result = await applyRuntimeWorkspaceFromUI({
    workspaceStore,
    backendApplyPort: backend,
    applyInput: { workspaceId: workspace.id },
    now: () => '2026-01-01T00:00:00.000Z',
  }) as { status?: string; backendApply?: { performed?: boolean } }

  assert.equal(result.status, 'applied')
  assert.equal(result.backendApply?.performed, false)
  assert.equal(backend.applyCalls, 0)
  assert.equal(workspaceStore.getWorkspace(workspace.id)?.status, 'workspace')
  assert.equal(workspaceStore.getWorkspace(workspace.id)?.metadata?.lastApplyStatus, 'applied')
})

test('simulateRuntimeWorkspaceApply accepts asset slot snapshot workspaces without snapshot base', async () => {
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  const workspace = workspaceStore.createWorkspace({
    kind: 'asset_workspace',
    title: 'Asset workspace',
    content: JSON.stringify({
      schema: 'movscript.asset_workspace.v1',
      scope: 'asset_workspace',
      workspace: {
        asset_slots: [{ name: 'Hero portrait', kind: 'image' }],
      },
    }),
    target: { entityType: 'project', entityId: 7 },
  })
  const backend = fakeBackendApplyPort()

  const result = await simulateRuntimeWorkspaceApply({
    workspaceStore,
    backendApplyPort: backend,
    applyInput: { workspaceId: workspace.id },
  }) as { ok?: boolean; stage?: string; message?: string }

  assert.equal(result.ok, true)
  assert.equal(result.stage, 'backend_apply_preview')
  assert.equal(backend.previewCalls, 1)
})

test('simulateRuntimeWorkspaceApply allows omitted asset ids in workspace snapshot', async () => {
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  const workspace = workspaceStore.createWorkspace({
    kind: 'asset_workspace',
    title: 'Asset workspace',
    content: JSON.stringify({
      schema: 'movscript.asset_workspace.v1',
      scope: 'asset_workspace',
      mode: 'snapshot',
      workspace: {
        creative_references: [],
        asset_slots: [{ id: 12, name: 'Edited slot', kind: 'image', status: 'active' }],
        candidate_plans: [],
      },
    }),
    target: { entityType: 'project', entityId: 7 },
  })
  const backend = fakeBackendApplyPort()

  const result = await simulateRuntimeWorkspaceApply({
    workspaceStore,
    backendApplyPort: backend,
    applyInput: { workspaceId: workspace.id },
  }) as { ok?: boolean; stage?: string; message?: string }

  assert.equal(result.ok, true)
  assert.equal(result.stage, 'backend_apply_preview')
  assert.equal(backend.previewCalls, 1)
})

test('applyRuntimeWorkspaceFromUI applies workspace snapshots without snapshot base', async () => {
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  const workspace = workspaceStore.createWorkspace({
    kind: 'asset_workspace',
    title: 'Asset workspace',
    content: JSON.stringify({
      schema: 'movscript.asset_workspace.v1',
      scope: 'asset_workspace',
      mode: 'snapshot',
      workspace: {
        creative_references: [],
        asset_slots: [{ id: 12, name: 'Edited slot', kind: 'image', status: 'active' }],
      },
    }),
    target: { entityType: 'project', entityId: 7 },
  })
  const backend = fakeBackendApplyPort()

  const result = await applyRuntimeWorkspaceFromUI({
    workspaceStore,
    backendApplyPort: backend,
    applyInput: { workspaceId: workspace.id },
    now: () => '2026-01-01T00:00:00.000Z',
  }) as { status?: string }

  assert.equal(result.status, 'applied')
  assert.equal(backend.applyCalls, 1)
})

test('applyRuntimeWorkspaceFromUI stores setting workspace mapping from client_id to backend creative reference id', async () => {
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  const workspace = workspaceStore.createWorkspace({
    kind: 'setting_workspace',
    title: 'Setting workspace',
    projectId: 7,
    content: JSON.stringify({
      workspace: {
        creative_references: [{ client_id: 'hero_ref', name: 'Hero', kind: 'person' }],
      },
    }),
    target: { entityType: 'project', entityId: 7 },
  })
  const backend = fakeBackendApplyPort({
    applyResult: {
      performed: true,
      method: 'POST',
      response: {
        canonical_snapshot: {
          creative_references: [{ id: 42, name: 'Hero', kind: 'person' }],
        },
      } as unknown as NonNullable<RuntimeWorkspaceBackendApplyResult['response']>,
    },
  })

  await applyRuntimeWorkspaceFromUI({
    workspaceStore,
    backendApplyPort: backend,
    applyInput: { workspaceId: workspace.id },
    now: () => '2026-01-01T00:00:00.000Z',
  })

  const applied = workspaceStore.getWorkspace(workspace.id)
  const metadata = applied?.metadata as { creativeReferenceClientIDMap?: Record<string, number> } | undefined
  assert.equal(metadata?.creativeReferenceClientIDMap?.hero_ref, 42)
})

test('applyRuntimeWorkspaceFromUI rewrites asset owner client_id using project setting map', async () => {
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  workspaceStore.createWorkspace({
    kind: 'setting_workspace',
    title: 'Setting workspace',
    projectId: 7,
    content: JSON.stringify({
      workspace: {
        creative_references: [{ client_id: 'hero_ref', name: 'Hero', kind: 'person' }],
      },
    }),
    target: { entityType: 'project', entityId: 7 },
    metadata: { creativeReferenceClientIDMap: { hero_ref: 42 } },
  })
  const assetWorkspace = workspaceStore.createWorkspace({
    kind: 'asset_workspace',
    title: 'Asset workspace',
    projectId: 7,
    content: JSON.stringify({
      workspace: {
        asset_slots: [{
          name: 'Hero portrait',
          kind: 'image',
          owner: {
            type: 'creative_reference',
            client_id: 'hero_ref',
          },
        }],
      },
    }),
    target: { entityType: 'project', entityId: 7 },
  })
  const backend = fakeBackendApplyPort({
    applyResult: { performed: true, method: 'POST', url: 'http://backend/projects/7/entities/asset-workspaces/apply' },
  })

  await applyRuntimeWorkspaceFromUI({
    workspaceStore,
    backendApplyPort: backend,
    applyInput: { workspaceId: assetWorkspace.id },
    now: () => '2026-01-01T00:00:00.000Z',
  })

  const proposed = backend.lastApplyReview?.proposedValue
  const reviewWorkspace = isRecord(proposed) ? proposed.workspace : undefined
  const assetSlots = isRecord(reviewWorkspace) && Array.isArray(reviewWorkspace.asset_slots) ? reviewWorkspace.asset_slots : []
  const owner = isRecord(assetSlots[0]) && isRecord(assetSlots[0].owner) ? assetSlots[0].owner : undefined
  assert.equal(owner?.id, 42)
})

test('applyRuntimeWorkspaceFromUI prefers latest setting workspace mapping when multiple setting workspaces exist', async () => {
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  workspaceStore.createWorkspace({
    kind: 'setting_workspace',
    title: 'Old setting workspace',
    projectId: 7,
    content: JSON.stringify({
      workspace: {
        creative_references: [{ client_id: 'hero_ref', name: 'Hero', kind: 'person' }],
      },
    }),
    target: { entityType: 'project', entityId: 7 },
    metadata: { creativeReferenceClientIDMap: { hero_ref: 11 } },
  })
  const secondSettingWorkspace = workspaceStore.createWorkspace({
    kind: 'setting_workspace',
    title: 'Latest setting workspace',
    projectId: 7,
    content: JSON.stringify({
      workspace: {
        creative_references: [{ client_id: 'hero_ref', name: 'Hero', kind: 'person' }],
      },
    }),
    target: { entityType: 'project', entityId: 7 },
    metadata: { creativeReferenceClientIDMap: { hero_ref: 42 } },
  })
  workspaceStore.updateWorkspace(secondSettingWorkspace.id, { title: secondSettingWorkspace.title })

  const assetWorkspace = workspaceStore.createWorkspace({
    kind: 'asset_workspace',
    title: 'Asset workspace',
    projectId: 7,
    content: JSON.stringify({
      workspace: {
        asset_slots: [{
          name: 'Hero portrait',
          kind: 'image',
          owner: {
            type: 'creative_reference',
            client_id: 'hero_ref',
          },
        }],
      },
    }),
    target: { entityType: 'project', entityId: 7 },
  })
  const backend = fakeBackendApplyPort({
    applyResult: { performed: true, method: 'POST', url: 'http://backend/projects/7/entities/asset-workspaces/apply' },
  })

  await applyRuntimeWorkspaceFromUI({
    workspaceStore,
    backendApplyPort: backend,
    applyInput: { workspaceId: assetWorkspace.id },
    now: () => '2026-01-01T00:00:00.000Z',
  })

  const proposed = backend.lastApplyReview?.proposedValue
  const reviewWorkspace = isRecord(proposed) ? proposed.workspace : undefined
  const assetSlots = isRecord(reviewWorkspace) && Array.isArray(reviewWorkspace.asset_slots) ? reviewWorkspace.asset_slots : []
  const owner = isRecord(assetSlots[0]) && isRecord(assetSlots[0].owner) ? assetSlots[0].owner : undefined
  assert.equal(owner?.id, 42)
})

test('applyRuntimeWorkspaceFromUI rewrites creative_reference_id on top-level slot fields', async () => {
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  workspaceStore.createWorkspace({
    kind: 'setting_workspace',
    title: 'Setting workspace',
    projectId: 7,
    content: JSON.stringify({
      workspace: {
        creative_references: [{ client_id: 'hero_ref', name: 'Hero', kind: 'person' }],
      },
    }),
    target: { entityType: 'project', entityId: 7 },
    metadata: { creativeReferenceClientIDMap: { hero_ref: 42 } },
  })
  const assetWorkspace = workspaceStore.createWorkspace({
    kind: 'asset_workspace',
    title: 'Asset workspace',
    projectId: 7,
    content: JSON.stringify({
      workspace: {
        asset_slots: [{
          name: 'Hero portrait',
          kind: 'image',
          owner_type: 'creative_reference',
          owner_id: 'hero_ref',
          creative_reference_id: 'hero_ref',
        }],
      },
    }),
    target: { entityType: 'project', entityId: 7 },
  })
  const backend = fakeBackendApplyPort({
    applyResult: { performed: true, method: 'POST', url: 'http://backend/projects/7/entities/asset-workspaces/apply' },
  })

  await applyRuntimeWorkspaceFromUI({
    workspaceStore,
    backendApplyPort: backend,
    applyInput: { workspaceId: assetWorkspace.id },
    now: () => '2026-01-01T00:00:00.000Z',
  })

  const proposed = backend.lastApplyReview?.proposedValue
  const reviewWorkspace = isRecord(proposed) ? proposed.workspace : undefined
  const assetSlots = isRecord(reviewWorkspace) && Array.isArray(reviewWorkspace.asset_slots) ? reviewWorkspace.asset_slots : []
  const assetSlot = isRecord(assetSlots[0]) ? assetSlots[0] : undefined
  const ownerID = typeof assetSlot?.owner_id === 'number' ? assetSlot.owner_id : Number(assetSlot?.owner_id)
  const referenceID = typeof assetSlot?.creative_reference_id === 'number' ? assetSlot.creative_reference_id : Number(assetSlot?.creative_reference_id)
  assert.equal(ownerID, 42)
  assert.equal(referenceID, 42)
})

test('applyRuntimeWorkspaceFromUI prefers mapped owner client_id over stale owner id', async () => {
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  workspaceStore.createWorkspace({
    kind: 'setting_workspace',
    title: 'Setting workspace',
    projectId: 7,
    content: JSON.stringify({
      workspace: {
        creative_references: [{ client_id: 'hero_ref', name: 'Hero', kind: 'person' }],
      },
    }),
    target: { entityType: 'project', entityId: 7 },
    metadata: { creativeReferenceClientIDMap: { hero_ref: 42 } },
  })
  const assetWorkspace = workspaceStore.createWorkspace({
    kind: 'asset_workspace',
    title: 'Asset workspace',
    projectId: 7,
    content: JSON.stringify({
      workspace: {
        asset_slots: [{
          name: 'Hero portrait',
          kind: 'image',
          owner: {
            type: 'creative_reference',
            id: 999,
            client_id: 'hero_ref',
          },
        }],
      },
    }),
    target: { entityType: 'project', entityId: 7 },
  })
  const backend = fakeBackendApplyPort({
    applyResult: { performed: true, method: 'POST', url: 'http://backend/projects/7/entities/asset-workspaces/apply' },
  })

  await applyRuntimeWorkspaceFromUI({
    workspaceStore,
    backendApplyPort: backend,
    applyInput: { workspaceId: assetWorkspace.id },
    now: () => '2026-01-01T00:00:00.000Z',
  })

  const proposed = backend.lastApplyReview?.proposedValue
  const reviewWorkspace = isRecord(proposed) ? proposed.workspace : undefined
  const assetSlots = isRecord(reviewWorkspace) && Array.isArray(reviewWorkspace.asset_slots) ? reviewWorkspace.asset_slots : []
  const owner = isRecord(assetSlots[0]) && isRecord(assetSlots[0].owner) ? assetSlots[0].owner : undefined
  assert.equal(owner?.id, 42)
})

test('applyRuntimeWorkspaceFromUI applies backend results and records backend failures', async () => {
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  const workspace = workspaceStore.createWorkspace({
    kind: 'project_standards_workspace',
    title: 'Script',
    content: 'Updated script',
    target: { entityType: 'script', entityId: 1, field: 'content' },
  })
  const backend = fakeBackendApplyPort({
    applyResult: { performed: true, method: 'PATCH', url: 'http://backend/scripts/1', payload: { content: 'Updated script' } },
  })

  const result = await applyRuntimeWorkspaceFromUI({
    workspaceStore,
    backendApplyPort: backend,
    applyInput: { workspaceId: workspace.id, appliedByUserId: 12 },
    now: () => '2026-01-01T00:00:00.000Z',
  }) as { status?: string; backendApply?: RuntimeWorkspaceBackendApplyResult }

  assert.equal(result.status, 'applied')
  assert.equal(result.backendApply?.performed, true)
  assert.equal(workspaceStore.getWorkspace(workspace.id)?.appliedByUserId, 12)
  assert.equal(workspaceStore.getWorkspace(workspace.id)?.status, 'workspace')

  const failingWorkspace = workspaceStore.createWorkspace({
    kind: 'project_standards_workspace',
    title: 'Script',
    content: 'Broken script',
    target: { entityType: 'script', entityId: 2, field: 'content' },
  })
  const failingBackend = fakeBackendApplyPort({ applyError: new Error('backend down') })
  await assert.rejects(() => applyRuntimeWorkspaceFromUI({
    workspaceStore,
    backendApplyPort: failingBackend,
    applyInput: { workspaceId: failingWorkspace.id },
    now: () => '2026-01-01T00:00:00.000Z',
  }), /backend down/)
  assert.equal(workspaceStore.getWorkspace(failingWorkspace.id)?.metadata?.backendWritePerformed, false)
  assert.equal(workspaceStore.getWorkspace(failingWorkspace.id)?.metadata?.backendWriteError, 'backend down')
})

function fakeBackendApplyPort(options: {
  previewResult?: RuntimeWorkspaceBackendApplyPreviewResult
  applyResult?: RuntimeWorkspaceBackendApplyResult
  applyError?: Error
} = {}): RuntimeWorkspaceBackendApplyPort & {
  previewCalls: number
  applyCalls: number
  lastPreviewReview?: Parameters<RuntimeWorkspaceBackendApplyPort['previewApplyReview']>[0]
  lastApplyReview?: Parameters<RuntimeWorkspaceBackendApplyPort['applyReview']>[0]
} {
  return {
    previewCalls: 0,
    applyCalls: 0,
    async previewApplyReview(review) {
      this.previewCalls += 1
      this.lastPreviewReview = review
      return options.previewResult ?? { ok: true, backendApply: { performed: false, skippedReason: 'preview disabled' } }
    },
    async applyReview(review) {
      this.applyCalls += 1
      this.lastApplyReview = review
      if (options.applyError) throw options.applyError
      return options.applyResult ?? { performed: false, skippedReason: 'apply disabled' }
    },
  }
}
