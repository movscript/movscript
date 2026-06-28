import assert from 'node:assert/strict'
import test from 'node:test'

import { createElectronMovScriptWorkspaceService } from './workspaceDomainRepository'
import { setRuntimeConfigSnapshot } from './config'

test('workspace domain repository routes project source reads and writes through daemon gateway', async () => {
  const previousWindow = globalThis.window
  const previousFetch = globalThis.fetch
  const calls: Array<{ method: string; input: Record<string, unknown> }> = []
  const requests: Array<{ url: string; body: Record<string, unknown> }> = []
  const api = {
    getRuntimeConfig: async () => ({
      movScriptHomeDir: '/tmp/movscript-home',
      workspaceDir: '/tmp/movscript-home',
      gatewayBaseURL: 'http://127.0.0.1:8766',
      runtime: {
        schema: 'movscript.runtime-descriptor.v1',
        runtime: {
          owner: 'movscript.local-node',
          appId: 'movscript.local-node',
          name: 'MovScript Local Node Daemon',
        },
        gateway: {
          baseURL: 'http://127.0.0.1:8766',
          canonicalPrefix: '/v1',
        },
        dataConnection: { kind: 'local', authMode: 'local-owner', status: 'connected' },
        capabilities: {
          project: true,
          canvas: true,
          resources: true,
          editing: true,
          media: true,
        },
      },
      dataConnection: { kind: 'local', authMode: 'local-owner', status: 'connected' },
      apiBaseURL: 'http://127.0.0.1:8766',
      apiV1BaseURL: 'http://127.0.0.1:8766/api/v1',
      localAPIBaseURL: 'http://127.0.0.1:8766',
      backendStatus: {
        state: 'ready' as const,
        baseURL: 'http://127.0.0.1:8766',
      },
    }),
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
    readMovScriptEngineContentUnitGenerationPrompt: async (input: Record<string, unknown>) => {
      calls.push({ method: 'readContentUnitGenerationPrompt', input })
      return { promptText: 'prompt text' }
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
	    upsertMovScriptEngineWorkspaceContentUnit: async (input: Record<string, unknown>) => {
	      calls.push({ method: 'upsertContentUnit', input })
	      return {
	        path: 'content_units/content_unit_1/content_unit.json',
	        entityKind: 'content_unit',
	        record: input.payload,
	      }
	    },
	    updateMovScriptEngineContentUnitEditPrompt: async (input: Record<string, unknown>) => {
	      calls.push({ method: 'updateContentUnitEditPrompt', input })
	      return input
	    },
	    selectMovScriptEngineWorkspaceCandidate: async (input: Record<string, unknown>) => {
	      calls.push({ method: 'selectCandidate', input })
	      return input.payload
	    },
	    appendMovScriptEngineWorkspaceCandidate: async (input: Record<string, unknown>) => {
	      calls.push({ method: 'appendCandidate', input })
	      return input.payload
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

  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      requests.push({ url, body })
      const result = String(url).endsWith('/v1/project/scripts/upsert')
        ? {
            scriptId: 'script_1',
            scriptPath: 'scripts/script_1/script.json',
            sourcePath: 'scripts/script_1/script.md',
            record: {},
            sourceText: '',
          }
        : String(url).endsWith('/v1/project/scripts/source/read')
          ? 'script text'
          : { ok: true }
      return new Response(JSON.stringify({
        schema: 'movscript.project-source-operation-result.v1',
        projectDir: body.projectDir,
        result,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { api },
  })

  try {
	    const service = createElectronMovScriptWorkspaceService({ projectId: 9, projectDir: '/tmp/movscript-project-9', orgId: 22 })
	    const entities = await service.queryEntities({ entityKind: 'script' })
    const savedScript = await service.upsertScript({
      scriptId: 'script_1',
      sourceText: 'updated',
      metadata: { title: 'Updated script' },
    })
    const sourceText = await service.readScriptSource({ record: { id: 'script_1' } })
    await service.upsertSetting({
      payload: {
        id: 'setting_1',
        title: 'A',
        __workspace_path: 'settings/setting_1/setting.json',
        __workspace_version: 'v1',
      },
    })
    await service.updateContentUnitEditPrompt({
      targetPath: 'content_units/canvas_scene_sec01/content_unit.json',
      editPrompt: { text: 'A closer phone insert.' },
    })

    assert.equal(entities[0]?.id, 'script_1')
    assert.equal(savedScript.scriptId, 'script_1')
    assert.equal(sourceText, 'script text')
    assert.deepEqual(requests.map((request) => request.body), [{
      projectDir: '/tmp/movscript-project-9',
      scriptId: 'script_1',
      sourceText: 'updated',
      metadata: { title: 'Updated script' },
    }, {
      projectDir: '/tmp/movscript-project-9',
      record: { id: 'script_1' },
    }])
    assert.deepEqual(requests.map((request) => request.url), [
      'http://127.0.0.1:8766/v1/project/scripts/upsert',
      'http://127.0.0.1:8766/v1/project/scripts/source/read',
    ])
    assert.deepEqual(calls[0], {
      method: 'queryEntities',
      input: {
        projectId: 9,
        projectDir: '/tmp/movscript-project-9',
        orgId: 22,
        query: { entityKind: 'script' },
      },
    })
    assert.deepEqual(calls[1], {
      method: 'upsertSetting',
      input: {
        projectId: 9,
        projectDir: '/tmp/movscript-project-9',
        orgId: 22,
        expectedWorkspaceVersions: { 'settings/setting_1/setting.json': 'v1' },
        payload: {
          payload: {
            id: 'setting_1',
            title: 'A',
            __workspace_path: 'settings/setting_1/setting.json',
            __workspace_version: 'v1',
          },
        },
      },
    })
    assert.deepEqual(calls[2], {
      method: 'updateContentUnitEditPrompt',
      input: {
        projectId: 9,
        projectDir: '/tmp/movscript-project-9',
        orgId: 22,
        expectedWorkspaceVersions: {},
        targetPath: 'content_units/canvas_scene_sec01/content_unit.json',
        editPrompt: { text: 'A closer phone insert.' },
      },
    })
  } finally {
    setRuntimeConfigSnapshot(null)
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: previousFetch,
    })
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    })
  }
})

test('workspace domain repository read queries stay idle without projectDir', async () => {
  const previousWindow = globalThis.window
  let calls = 0
  const api = {
    queryMovScriptEngineWorkspaceEntities: async () => {
      calls += 1
      throw new Error('should not query engine without projectDir')
    },
    queryMovScriptEngineWorkspaceSettings: async () => {
      calls += 1
      throw new Error('should not query engine without projectDir')
    },
    queryMovScriptEngineWorkspaceAssets: async () => {
      calls += 1
      throw new Error('should not query engine without projectDir')
    },
    upsertMovScriptEngineWorkspaceSetting: async () => undefined,
    upsertMovScriptEngineWorkspaceAsset: async () => undefined,
    upsertMovScriptEngineWorkspaceScript: async () => undefined,
    readMovScriptEngineWorkspaceScriptSource: async () => '',
    readMovScriptEngineContentUnitGenerationPrompt: async () => ({}),
    deleteMovScriptEngineWorkspaceEntity: async () => undefined,
    saveMovScriptEngineWorkspaceProductionSnapshot: async () => ({}),
    upsertMovScriptEngineWorkspaceProjectStandards: async () => undefined,
    upsertMovScriptEngineWorkspaceContentUnit: async () => undefined,
    updateMovScriptEngineContentUnitEditPrompt: async () => undefined,
    selectMovScriptEngineWorkspaceCandidate: async () => undefined,
    appendMovScriptEngineWorkspaceCandidate: async () => undefined,
    createMovScriptEngineWorkspaceAssetSlotCandidate: async () => undefined,
    createMovScriptEngineWorkspaceKeyframeCandidate: async () => undefined,
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { api },
  })

  try {
    const service = createElectronMovScriptWorkspaceService({ projectId: 9 }, api)
    assert.deepEqual(await service.queryEntities({ entityKind: 'script' }), [])
    assert.deepEqual(await service.querySettings({}), [])
    assert.deepEqual(await service.queryAssets({}), { assets: [] })
    assert.equal(calls, 0)
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    })
  }
})
