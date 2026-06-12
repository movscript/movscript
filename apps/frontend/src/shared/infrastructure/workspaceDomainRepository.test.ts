import assert from 'node:assert/strict'
import test from 'node:test'

import { createElectronMovScriptWorkspaceService } from './workspaceDomainRepository'

test('workspace domain repository uses Electron engine workspace API when available', async () => {
  const previousWindow = globalThis.window
  const calls: Array<{ method: string; input: Record<string, unknown> }> = []
  const api = {
    queryMovScriptEngineWorkspaceEntities: async (input: Record<string, unknown>) => {
      calls.push({ method: 'queryEntities', input })
      return [{
        entityKind: 'script',
        id: 'script_1',
        path: 'scripts/script_1/script.json',
        index: 0,
        record: { id: 'script_1', title: 'Engine script' },
      }]
    },
    queryMovScriptEngineWorkspaceSettings: async (input: Record<string, unknown>) => {
      calls.push({ method: 'querySettings', input })
      return []
    },
    queryMovScriptEngineWorkspaceAssets: async (input: Record<string, unknown>) => {
      calls.push({ method: 'queryAssets', input })
      return { assets: [] }
    },
    upsertMovScriptEngineWorkspaceSetting: async (input: Record<string, unknown>) => {
      calls.push({ method: 'upsertSetting', input })
      return {
        path: 'settings/setting_1/setting.json',
        entityKind: 'setting',
        record: input.payload,
      }
    },
    upsertMovScriptEngineWorkspaceAsset: async (input: Record<string, unknown>) => {
      calls.push({ method: 'upsertAsset', input })
      return {
        path: 'settings/setting_1/assets/asset_1/asset.json',
        entityKind: 'asset',
        record: input.payload,
      }
    },
    upsertMovScriptEngineWorkspaceScript: async (input: Record<string, unknown>) => {
      calls.push({ method: 'upsertScript', input })
      return {
        scriptId: 'script_1',
        scriptPath: 'scripts/script_1/script.json',
        sourcePath: 'scripts/script_1/script.md',
        record: {},
        sourceText: '',
      }
    },
    readMovScriptEngineWorkspaceScriptSource: async (input: Record<string, unknown>) => {
      calls.push({ method: 'readScriptSource', input })
      return 'script text'
    },
    deleteMovScriptEngineWorkspaceEntity: async (input: Record<string, unknown>) => {
      calls.push({ method: 'deleteEntity', input })
    },
    saveMovScriptEngineWorkspaceProductionSnapshot: async (input: Record<string, unknown>) => {
      calls.push({ method: 'saveProductionSnapshot', input })
      return {
        productionPath: 'productions/pilot/production.json',
        writtenPaths: ['productions/pilot/production.json'],
        snapshot: input.payload,
      }
    },
    upsertMovScriptEngineWorkspaceProjectStandards: async (input: Record<string, unknown>) => {
      calls.push({ method: 'upsertProjectStandards', input })
      return {
        path: 'project_standards.json',
        entityKind: 'project',
        record: input.payload,
      }
    },
    createMovScriptEngineWorkspaceAssetSlotCandidate: async (input: Record<string, unknown>) => {
      calls.push({ method: 'createAssetSlotCandidate', input })
      return {
        path: 'settings/setting_1/assets/asset_1/asset.json',
        record: input.payload,
      }
    },
    createMovScriptEngineWorkspaceKeyframeCandidate: async (input: Record<string, unknown>) => {
      calls.push({ method: 'createKeyframeCandidate', input })
      return {
        path: 'productions/pilot/keyframes/keyframe_1/keyframe.json',
        record: input.payload,
      }
    },
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { api },
  })

  try {
    const service = createElectronMovScriptWorkspaceService({ projectId: 9, orgId: 22 })
    const entities = await service.queryEntities({ entityKind: 'script' })
    await service.upsertSetting({ payload: { id: 'setting_1', title: 'A' } })

    assert.equal(entities[0]?.id, 'script_1')
    assert.deepEqual(calls[0], {
      method: 'queryEntities',
      input: {
        projectId: 9,
        orgId: 22,
        query: { entityKind: 'script' },
      },
    })
    assert.deepEqual(calls[1], {
      method: 'upsertSetting',
      input: {
        projectId: 9,
        orgId: 22,
        payload: { payload: { id: 'setting_1', title: 'A' } },
      },
    })
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    })
  }
})
