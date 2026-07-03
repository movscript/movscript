import assert from 'node:assert/strict'
import test from 'node:test'

import { loadProjectHomeReadModel } from './projectHomeReadModel'
import { setRuntimeConfigSnapshot } from '@/shared/infrastructure/config'
import type { Project } from '@/types'

test('project home read model uses daemon gateway descriptor instead of legacy apiBaseURL', async () => {
  const previousWindow = globalThis.window
  const previousFetch = globalThis.fetch
  const requests: Array<{ url: string; body: Record<string, unknown> }> = []

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      api: {
        getRuntimeConfig: async () => ({
          movScriptHomeDir: '/tmp/movscript-home',
          workspaceDir: '/tmp/movscript-home',
          runtimeConnection: {
            schema: 'movscript.runtime-connection.v1',
            mode: 'local',
            gatewayBaseURL: 'http://127.0.0.1:8766',
            apiV1BaseURL: 'http://127.0.0.1:8766/api/v1',
            authMode: 'local-owner',
            displayName: 'Local daemon gateway',
            status: 'connected',
            source: 'daemon',
          },
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
          apiBaseURL: 'http://legacy.example:8765',
          apiV1BaseURL: 'http://legacy.example:8765/api/v1',
          backendStatus: {
            state: 'ready',
            baseURL: 'http://127.0.0.1:8766',
          },
        }),
      },
    },
  })
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (url: string, init?: RequestInit) => {
      requests.push({
        url,
        body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      })
      return new Response(JSON.stringify({
        schema: 'movscript.project-home-read-model.v1',
        scripts: [],
        settings: [],
        assets: [],
        productions: [],
        sceneMoments: [],
        contentUnits: [],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })

  try {
    await loadProjectHomeReadModel({
      ID: 9,
      workspace_path: '/tmp/movscript-project-9',
      project_uid: 'proj_9',
    } as Project, { orgId: 22 })

    assert.equal(requests[0]?.url, 'http://127.0.0.1:8766/v1/project/home/read-model')
    assert.equal(requests[0]?.body.projectDir, '/tmp/movscript-project-9')
    assert.equal(requests[0]?.body.movScriptHomeDir, '/tmp/movscript-home')
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
