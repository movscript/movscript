import assert from 'node:assert/strict'
import test from 'node:test'

import type { MovScriptWorkspaceIndexedEntity, MovScriptWorkspaceService } from '@movscript/core/workspace'
import { __setElectronMovScriptWorkspaceServiceFactoryForTest } from '@/shared/infrastructure/workspaceDomainRepository'
import {
  deletePreProductionWorkspaceAssetSlot,
  loadPreProductionWorkspaceData,
  savePreProductionWorkspaceAssetCandidate,
  savePreProductionWorkspaceAssetSlot,
  savePreProductionWorkspaceSetting,
} from './preProductionWorkspaceRepository'

test('pre-production workspace repository reads settings and assets through core workspace service', async () => {
  const calls = withPreProductionService({
    settings: [settingEntity()],
    assets: [assetEntity()],
  })
  try {
    const data = await loadPreProductionWorkspaceData(7)
    assert.equal(data.settings[0].ID, 12)
    assert.equal(data.settings[0].name, 'Local Character')
    assert.equal(data.assetSlots[0].ID, 32)
    assert.equal(data.assetSlots[0].setting_id, 12)
    assert.equal(calls.querySettings, 1)
    assert.equal(calls.queryAssets.length, 1)
    assert.equal(calls.queryAssets[0]?.includeCandidates, true)
  } finally {
    calls.restore()
  }
})

test('pre-production workspace repository reads inline asset candidates from core asset records', async () => {
  const calls = withPreProductionService({
    assets: [assetEntity({
      candidates: [{
        id: 'candidate_local',
        resource_id: 99,
        status: 'draft',
      }],
    })],
  })
  try {
    const data = await loadPreProductionWorkspaceData(7)
    assert.equal(data.candidates.length, 1)
    assert.equal(data.candidates[0].asset_slot_id, 32)
    assert.equal(data.candidates[0].resource_id, 99)
  } finally {
    calls.restore()
  }
})

test('pre-production workspace repository writes new settings through core service', async () => {
  const calls = withPreProductionService()
  try {
    const record = await savePreProductionWorkspaceSetting(8, null, {
      kind: 'place',
      name: 'Local Place',
      description: 'Draft only',
    })
    assert.equal(record.name, 'Local Place')
    assert.equal(calls.upsertSettings.length, 1)
    assert.equal(calls.upsertSettings[0]?.projectId, 8)
    assert.equal(calls.upsertSettings[0]?.record, undefined)
    assert.equal(calls.upsertSettings[0]?.payload.name, 'Local Place')
  } finally {
    calls.restore()
  }
})

test('pre-production workspace repository keeps local asset drafts by semantic entity', async () => {
  const calls = withPreProductionService({
    assets: [assetEntity({ id: 'asset_local_existing', title: 'Local Asset' })],
  })
  try {
    const data = await loadPreProductionWorkspaceData(8)
    const record = data.assetSlots[0]

    const saved = await savePreProductionWorkspaceAssetSlot(8, record, {
      name: 'Updated Local Asset',
      kind: 'image',
    })

    assert.equal(saved.name, 'Updated Local Asset')
    assert.equal(calls.upsertAssets.length, 1)
    assert.equal(calls.upsertAssets[0]?.entity?.id, 'asset_local_existing')
    assert.equal(calls.upsertAssets[0]?.payload.name, 'Updated Local Asset')
  } finally {
    calls.restore()
  }
})

test('pre-production workspace repository writes local asset candidates as owned asset slots', async () => {
  const calls = withPreProductionService()
  try {
    await savePreProductionWorkspaceAssetSlot(8, null, {
      kind: 'video',
      name: 'Candidate Clip',
      status: 'candidate',
      owner_type: 'asset_slot',
      owner_id: 30,
      resource_id: 99,
    })

    assert.equal(calls.upsertAssets.length, 1)
    assert.equal(calls.upsertAssets[0]?.payload.kind, 'video')
    assert.equal(calls.upsertAssets[0]?.payload.resource_id, 99)
  } finally {
    calls.restore()
  }
})

test('pre-production workspace repository deletes local asset drafts by core entity', async () => {
  const calls = withPreProductionService({
    assets: [assetEntity({ id: 'asset_local_delete', title: 'Delete Me' })],
  })
  try {
    const data = await loadPreProductionWorkspaceData(8)
    await deletePreProductionWorkspaceAssetSlot(8, data.assetSlots[0])
    assert.equal(calls.deletes.length, 1)
    assert.equal(calls.deletes[0]?.entity?.id, 'asset_local_delete')
  } finally {
    calls.restore()
  }
})

test('pre-production workspace repository updates inline asset candidates by core target entity', async () => {
  const calls = withPreProductionService({
    assets: [assetEntity({
      candidates: [{
        id: 'candidate_local',
        resource_id: 99,
        status: 'draft',
      }],
    })],
  })
  try {
    const data = await loadPreProductionWorkspaceData(8)
    const saved = await savePreProductionWorkspaceAssetCandidate(8, data.candidates[0], {
      status: 'selected',
      note: 'use this',
    })

    assert.equal(saved.status, 'selected')
    assert.equal(calls.candidateUpdates.length, 1)
    assert.equal(calls.candidateUpdates[0]?.targetEntity?.id, 'asset_32')
    assert.equal(calls.candidateUpdates[0]?.candidateId, 'candidate_local')
    assert.equal(calls.candidateUpdates[0]?.payload.status, 'accepted')
  } finally {
    calls.restore()
  }
})

function settingEntity(overrides: Record<string, unknown> = {}): MovScriptWorkspaceIndexedEntity {
  const record = {
    schema: 'movscript.setting.v1',
    kind: 'setting',
    id: 'setting_12',
    project_id: 7,
    setting_kind: 'character',
    title: 'Local Character',
    ...overrides,
  }
  return {
    entityKind: 'setting',
    record,
    path: '',
    index: 0,
    id: record.id as string,
  }
}

function assetEntity(overrides: Record<string, unknown> = {}): MovScriptWorkspaceIndexedEntity {
  const record = {
    schema: 'movscript.asset.v1',
    kind: 'asset',
    id: 'asset_32',
    project_id: 7,
    asset_kind: 'image',
    title: 'Local Asset',
    slot: 'portrait',
    setting_id: 'setting_12',
    ...overrides,
  }
  return {
    entityKind: 'asset',
    record,
    path: '',
    index: 0,
    id: record.id as string,
  }
}

function withPreProductionService(input: {
  settings?: MovScriptWorkspaceIndexedEntity[]
  assets?: MovScriptWorkspaceIndexedEntity[]
} = {}): {
  querySettings: number
  queryAssets: Array<{ includeCandidates?: boolean }>
  upsertSettings: Array<{
    projectId?: string | number
    entity?: MovScriptWorkspaceIndexedEntity | null
    record?: Record<string, unknown> | null
    payload: Record<string, unknown>
  }>
  upsertAssets: Array<{
    projectId?: string | number
    entity?: MovScriptWorkspaceIndexedEntity | null
    record?: Record<string, unknown> | null
    payload: Record<string, unknown>
  }>
  deletes: Array<{
    entity?: MovScriptWorkspaceIndexedEntity | null
    record?: Record<string, unknown>
  }>
  candidateUpdates: Array<{
    targetEntity?: MovScriptWorkspaceIndexedEntity
    candidateId: string
    payload: Record<string, unknown>
  }>
  restore: () => void
} {
  const calls = {
    querySettings: 0,
    queryAssets: [] as Array<{ includeCandidates?: boolean }>,
    upsertSettings: [] as Array<{
      projectId?: string | number
      entity?: MovScriptWorkspaceIndexedEntity | null
      record?: Record<string, unknown> | null
      payload: Record<string, unknown>
    }>,
    upsertAssets: [] as Array<{
      projectId?: string | number
      entity?: MovScriptWorkspaceIndexedEntity | null
      record?: Record<string, unknown> | null
      payload: Record<string, unknown>
    }>,
    deletes: [] as Array<{
      entity?: MovScriptWorkspaceIndexedEntity | null
      record?: Record<string, unknown>
    }>,
    candidateUpdates: [] as Array<{
      targetEntity?: MovScriptWorkspaceIndexedEntity
      candidateId: string
      payload: Record<string, unknown>
    }>,
  }
  const restore = __setElectronMovScriptWorkspaceServiceFactoryForTest(() => ({
    querySettings: async () => {
      calls.querySettings += 1
      return input.settings ?? []
    },
    queryAssets: async (query) => {
      calls.queryAssets.push({ includeCandidates: query?.includeCandidates })
      return { assets: input.assets ?? [] }
    },
    upsertSetting: async (upsertInput) => {
      calls.upsertSettings.push({
        projectId: upsertInput.projectId,
        entity: upsertInput.entity,
        record: upsertInput.record,
        payload: upsertInput.payload,
      })
      return {
        path: '',
        entityKind: 'setting',
        record: {
          schema: 'movscript.setting.v1',
          kind: 'setting',
          id: 'setting_local',
          project_id: upsertInput.projectId,
          title: upsertInput.payload.name ?? upsertInput.payload.title,
          setting_kind: upsertInput.payload.kind === 'place' ? 'location' : upsertInput.payload.kind,
          ...upsertInput.payload,
        },
      }
    },
    upsertAsset: async (upsertInput) => {
      calls.upsertAssets.push({
        projectId: upsertInput.projectId,
        entity: upsertInput.entity,
        record: upsertInput.record,
        payload: upsertInput.payload,
      })
      return {
        path: '',
        entityKind: 'asset',
        record: {
          schema: 'movscript.asset.v1',
          kind: 'asset',
          id: String(upsertInput.entity?.id ?? upsertInput.payload.id ?? 'asset_local'),
          project_id: upsertInput.projectId,
          title: upsertInput.payload.name ?? upsertInput.payload.title,
          asset_kind: upsertInput.payload.kind,
          ...upsertInput.payload,
        },
      }
    },
    deleteEntity: async (deleteInput) => {
      calls.deletes.push({
        entity: deleteInput.entity,
        record: deleteInput.record,
      })
    },
    updateCandidate: async (updateInput) => {
      calls.candidateUpdates.push({
        targetEntity: updateInput.targetEntity,
        candidateId: updateInput.candidateId,
        payload: updateInput.payload,
      })
      return {
        path: '',
        targetKind: updateInput.targetKind,
        candidate: {
          id: updateInput.candidateId,
          status: updateInput.payload.status,
          notes: updateInput.payload.notes,
        },
        record: updateInput.targetEntity?.record ?? {},
      }
    },
  } as Partial<MovScriptWorkspaceService> as MovScriptWorkspaceService))
  return Object.assign(calls, { restore })
}
