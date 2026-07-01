import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  PROJECT_SERVICE_CANDIDATE_VIEW_ENDPOINT,
  PROJECT_SERVICE_ASSET_PROVIDER_CERTIFICATION_PATCH_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANVAS_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNITS_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANDIDATE_CREATE_ENDPOINT,
  PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_LOCATOR_RESOLVE_ENDPOINT,
  PROJECT_SERVICE_NAME,
  PROJECT_SERVICE_HOME_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_PROMPT_CONTEXT_ENDPOINT,
  PROJECT_SERVICE_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT,
  PROJECT_SERVICE_SCRIPTS_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_STANDARDS_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_SOURCE_INTERPRET_ENDPOINT,
  PROJECT_SERVICE_SOURCE_PRODUCTION_WORK_PLAN_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_CREATE_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_DELETE_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_LIST_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_OPEN_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_EDITING_RESOURCES_REFRESH_ENDPOINT,
  ProjectServiceClient,
  createProjectServiceClientFromRuntime,
  resolveProjectServiceBaseUrl,
} from '../dist/index.js'

test('project service client posts project source requests to stable endpoints', async () => {
  const requests = []
  const client = new ProjectServiceClient({
    baseUrl: ' http://127.0.0.1:9001/ ',
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(JSON.stringify({
        schema: 'movscript.project-source-interpretation.v1',
        projectDir: '/tmp/project',
        interpretation: { status: 'refreshed' },
      }), { status: 200 })
    },
  })

  const result = await client.interpretSource({
    projectDir: '/tmp/project',
    debugArtifacts: false,
    commit: 'HEAD',
    checkpointHash: 'abc123',
  })

  assert.equal(result.interpretation.status, 'refreshed')
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9001${PROJECT_SERVICE_SOURCE_INTERPRET_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
      debugArtifacts: false,
      commit: 'HEAD',
      checkpointHash: 'abc123',
    },
  }])
})

test('project service client posts production work plan requests to the stable endpoint', async () => {
  const requests = []
  const client = new ProjectServiceClient({
    baseUrl: 'http://127.0.0.1:9001',
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(JSON.stringify({
        schema: 'movscript.project-source-production-work-plan.v1',
        projectDir: '/tmp/project',
        productionWorkPlan: {
          schema: 'movscript.production_work_plan.v1',
          items: [{ id: 'cu_hero' }],
        },
      }), { status: 200 })
    },
  })

  const result = await client.productionWorkPlan({
    projectDir: '/tmp/project',
    projectUid: 'prj_demo',
  })

  assert.equal(result.productionWorkPlan.schema, 'movscript.production_work_plan.v1')
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9001${PROJECT_SERVICE_SOURCE_PRODUCTION_WORK_PLAN_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
      projectUid: 'prj_demo',
    },
  }])
})

test('project service client posts asset provider certification patches to the stable endpoint', async () => {
  const requests = []
  const client = new ProjectServiceClient({
    baseUrl: 'http://127.0.0.1:9001',
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(JSON.stringify({
        schema: 'movscript.project-asset-provider-certification-patch.v1',
        projectDir: '/tmp/project',
        result: {
          status: 'patched',
          path: 'settings/hero/assets/face/asset.json',
          provider: 'volcengine_ark_official',
          storage_key: 'volcengine_ark_official::model:seedance-2',
          certification: {
            asset_uri: 'asset://hero-face',
          },
        },
      }), { status: 200 })
    },
  })

  const result = await client.patchAssetProviderCertification({
    projectDir: '/tmp/project',
    input: {
      assetPath: 'settings/hero/assets/face/asset.json',
      provider: 'volcengine_ark_official',
      storageKey: 'volcengine_ark_official::model:seedance-2',
      certification: {
        asset_uri: 'asset://hero-face',
      },
    },
  })

  assert.equal(result.result.status, 'patched')
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9001${PROJECT_SERVICE_ASSET_PROVIDER_CERTIFICATION_PATCH_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
      assetPath: 'settings/hero/assets/face/asset.json',
      provider: 'volcengine_ark_official',
      storageKey: 'volcengine_ark_official::model:seedance-2',
      certification: {
        asset_uri: 'asset://hero-face',
      },
    },
  }])
})

test('project service client posts read-model requests to the stable endpoint', async () => {
  const requests = []
  const client = new ProjectServiceClient({
    baseUrl: 'http://127.0.0.1:9005',
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(JSON.stringify({
        schema: 'movscript.project-read-model.v1',
        projectDir: '/tmp/project',
        projectReadModel: {
          schema: 'movscript.project-read-model.v1',
          workspace: { projectId: 'demo' },
        },
      }), { status: 200 })
    },
  })

  const result = await client.readModel({
    projectDir: '/tmp/project',
    includeSource: true,
    includeInspection: true,
  })

  assert.equal(result.projectReadModel.workspace.projectId, 'demo')
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9005${PROJECT_SERVICE_READ_MODEL_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
      includeSource: true,
      includeInspection: true,
    },
  }])
})

test('project service client posts home read-model requests to the stable endpoint', async () => {
  const requests = []
  const client = new ProjectServiceClient({
    baseUrl: 'http://127.0.0.1:9005',
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(JSON.stringify({
        schema: 'movscript.project-home-read-model.v1',
        projectDir: '/tmp/project',
        projectHomeReadModel: {
          schema: 'movscript.project-home-read-model.v1',
          scripts: [{ id: 'main' }],
        },
      }), { status: 200 })
    },
  })

  const result = await client.homeReadModel({ projectDir: '/tmp/project' })

  assert.deepEqual(result.projectHomeReadModel.scripts, [{ id: 'main' }])
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9005${PROJECT_SERVICE_HOME_READ_MODEL_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
    },
  }])
})

test('project service client posts standards read-model requests to the stable endpoint', async () => {
  const requests = []
  const client = new ProjectServiceClient({
    baseUrl: 'http://127.0.0.1:9005',
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(JSON.stringify({
        schema: 'movscript.project-standards-read-model.v1',
        projectDir: '/tmp/project',
        projectStandardsReadModel: {
          schema: 'movscript.project-standards-read-model.v1',
          settings: [{ id: 'hero' }],
        },
      }), { status: 200 })
    },
  })

  const result = await client.standardsReadModel({ projectDir: '/tmp/project' })

  assert.deepEqual(result.projectStandardsReadModel.settings, [{ id: 'hero' }])
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9005${PROJECT_SERVICE_STANDARDS_READ_MODEL_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
    },
  }])
})

test('project service client posts content canvas read-model requests to the stable endpoint', async () => {
  const requests = []
  const client = new ProjectServiceClient({
    baseUrl: 'http://127.0.0.1:9005',
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(JSON.stringify({
        schema: 'movscript.project-content-canvas-read-model.v1',
        projectDir: '/tmp/project',
        projectContentCanvasReadModel: {
          schema: 'movscript.project-content-canvas-read-model.v1',
          projectId: 7,
          contentUnits: [{ id: 'opening' }],
        },
      }), { status: 200 })
    },
  })

  const result = await client.contentCanvasReadModel({ projectDir: '/tmp/project', projectId: 7 })

  assert.equal(result.projectContentCanvasReadModel.projectId, 7)
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9005${PROJECT_SERVICE_CONTENT_CANVAS_READ_MODEL_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
      projectId: 7,
    },
  }])
})

test('project service client posts scripts read-model requests to the stable endpoint', async () => {
  const requests = []
  const client = new ProjectServiceClient({
    baseUrl: 'http://127.0.0.1:9005',
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(JSON.stringify({
        schema: 'movscript.project-scripts-read-model.v1',
        projectDir: '/tmp/project',
        projectScriptsReadModel: {
          schema: 'movscript.project-scripts-read-model.v1',
          scripts: [{ id: 'main', bodyLength: 120 }],
          versions: [{ id: 'v1' }],
        },
      }), { status: 200 })
    },
  })

  const result = await client.scriptsReadModel({ projectDir: '/tmp/project', projectId: 7 })

  assert.deepEqual(result.projectScriptsReadModel.scripts, [{ id: 'main', bodyLength: 120 }])
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9005${PROJECT_SERVICE_SCRIPTS_READ_MODEL_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
      projectId: 7,
    },
  }])
})

test('project service client posts content units read-model requests to the stable endpoint', async () => {
  const requests = []
  const decisionStore = {
    kind: 'scoped-project-data',
    baseUrl: 'https://data.example',
    projectUid: 'prj_demo',
    scopeKind: 'user',
    scopeId: '1',
  }
  const client = new ProjectServiceClient({
    baseUrl: 'http://127.0.0.1:9005',
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(JSON.stringify({
        schema: 'movscript.project-content-units-read-model.v1',
        projectDir: '/tmp/project',
        projectContentUnitsReadModel: {
          schema: 'movscript.project-content-units-read-model.v1',
          contentUnits: [{ id: 'cu_1', candidates: [] }],
        },
      }), { status: 200 })
    },
  })

  const result = await client.contentUnitsReadModel({
    projectDir: '/tmp/project',
    projectId: 7,
    contentUnitIds: ['cu_1'],
    decisionStore,
  })

  assert.deepEqual(result.projectContentUnitsReadModel.contentUnits, [{ id: 'cu_1', candidates: [] }])
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9005${PROJECT_SERVICE_CONTENT_UNITS_READ_MODEL_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
      projectId: 7,
      contentUnitIds: ['cu_1'],
      decisionStore,
    },
  }])
})

test('project service client posts lifecycle commands through the lifecycle endpoint', async () => {
  const requests = []
  const client = new ProjectServiceClient({
    baseUrl: 'http://127.0.0.1:9006',
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(JSON.stringify({
        schema: 'movscript.project-lifecycle-command-result.v1',
        projectDir: '/tmp/project',
        command: 'createProject',
        result: {
          status: 'created',
          projectUid: 'prj_demo',
        },
      }), { status: 200 })
    },
  })

  const result = await client.lifecycleCommand({
    projectDir: '/tmp/project',
    command: 'createProject',
    input: {
      title: 'Demo',
      projectId: 'demo',
    },
  })

  assert.equal(result.command, 'createProject')
  assert.equal(result.result.projectUid, 'prj_demo')
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9006${PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
      command: 'createProject',
      input: {
        title: 'Demo',
        projectId: 'demo',
      },
    },
  }])
})

test('project service client resolves project locators through the locator endpoint', async () => {
  const requests = []
  const client = new ProjectServiceClient({
    baseUrl: 'http://127.0.0.1:9007',
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(JSON.stringify({
        schema: 'movscript.project-locator.v1',
        projectDir: '/tmp/project',
        locator: {
          status: 'ready',
          projectDir: '/tmp/project',
          projectPath: '/tmp/project',
          workspaceDir: '/tmp/home',
          projectUid: 'prj_demo',
          projectTitle: 'Demo',
        },
      }), { status: 200 })
    },
  })

  const result = await client.resolveLocator({
    projectDir: '/tmp/project',
    workspaceDir: '/tmp/home',
    projectUid: 'prj_demo',
  })

  assert.equal(result.locator.projectUid, 'prj_demo')
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9007${PROJECT_SERVICE_LOCATOR_RESOLVE_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
      workspaceDir: '/tmp/home',
      projectUid: 'prj_demo',
    },
  }])
})

test('project service client reads resource views through the resource view endpoint', async () => {
  const requests = []
  const client = new ProjectServiceClient({
    baseUrl: 'http://127.0.0.1:9008',
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(JSON.stringify({
        schema: 'movscript.project-resource-view.v1',
        projectDir: '/tmp/project',
        kind: 'settings',
        usage: 'debug_compat',
        preferredEndpoint: PROJECT_SERVICE_STANDARDS_READ_MODEL_ENDPOINT,
        items: [{ id: 'hero', title: 'Hero' }],
      }), { status: 200 })
    },
  })

  const result = await client.resourceView({
    projectDir: '/tmp/project',
    kind: 'settings',
  })

  assert.equal(result.kind, 'settings')
  assert.equal(result.usage, 'debug_compat')
  assert.equal(result.preferredEndpoint, PROJECT_SERVICE_STANDARDS_READ_MODEL_ENDPOINT)
  assert.equal(result.items[0].title, 'Hero')
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9008${PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
      kind: 'settings',
    },
  }])
})

test('project service client posts production editing workspace requests to stable endpoints', async () => {
  const requests = []
  const client = new ProjectServiceClient({
    baseUrl: 'http://127.0.0.1:9012',
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(JSON.stringify({
        schema: 'movscript.production_editing_workspace.v1',
        projectDir: '/tmp/project',
        status: 'ok',
        productionId: 'pilot',
        workspace: { workspaceId: 'rough_cut_v1', kind: 'system_editing' },
      }), { status: 200 })
    },
  })

  await client.listProductionEditingWorkspaces({
    projectDir: '/tmp/project',
    input: { productionId: 'pilot', page: 1, pageSize: 5 },
  })
  await client.createProductionEditingWorkspace({
    projectDir: '/tmp/project',
    input: { productionId: 'pilot', kind: 'system_editing', title: '粗剪 v1' },
  })
  await client.openProductionEditingWorkspace({
    projectDir: '/tmp/project',
    input: { productionId: 'pilot', workspaceId: 'rough_cut_v1' },
  })
  await client.refreshProductionEditingResources({
    projectDir: '/tmp/project',
    input: { productionId: 'pilot' },
  })
  await client.deleteProductionEditingWorkspace({
    projectDir: '/tmp/project',
    input: { productionId: 'pilot', workspaceId: 'rough_cut_v1' },
  })

  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9012${PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_LIST_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
      productionId: 'pilot',
      page: 1,
      pageSize: 5,
    },
  }, {
    url: `http://127.0.0.1:9012${PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_CREATE_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
      productionId: 'pilot',
      kind: 'system_editing',
      title: '粗剪 v1',
    },
  }, {
    url: `http://127.0.0.1:9012${PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_OPEN_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
      productionId: 'pilot',
      workspaceId: 'rough_cut_v1',
    },
  }, {
    url: `http://127.0.0.1:9012${PROJECT_SERVICE_PRODUCTION_EDITING_RESOURCES_REFRESH_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
      productionId: 'pilot',
    },
  }, {
    url: `http://127.0.0.1:9012${PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_DELETE_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
      productionId: 'pilot',
      workspaceId: 'rough_cut_v1',
    },
  }])
})

test('project service client posts source commands through the command endpoint', async () => {
  const requests = []
  const client = new ProjectServiceClient({
    baseUrl: 'http://127.0.0.1:9002',
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(JSON.stringify({
        schema: 'movscript.project-source-command-result.v1',
        projectDir: '/tmp/project',
        command: 'createSetting',
        result: { path: 'settings/hero/setting.json' },
      }), { status: 200 })
    },
  })

  const result = await client.sourceCommand({
    projectDir: '/tmp/project',
    command: 'createSetting',
    input: { id: 'hero', title: 'Hero' },
  })

  assert.equal(result.command, 'createSetting')
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9002${PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
      command: 'createSetting',
      input: { id: 'hero', title: 'Hero' },
    },
  }])
})

test('project service client posts typed candidate action and view requests', async () => {
  const requests = []
  const decisionStore = {
    kind: 'scoped-project-data',
    baseUrl: 'https://cloud.example',
    projectUid: 'prj_demo',
    token: 'sk-demo',
  }
  const client = new ProjectServiceClient({
    baseUrl: 'http://127.0.0.1:9003',
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      if (String(url).endsWith(PROJECT_SERVICE_CANDIDATE_VIEW_ENDPOINT)) {
        return new Response(JSON.stringify({
          schema: 'movscript.project-candidate-view.v1',
          projectDir: '/tmp/project',
          contentUnitIds: ['opening'],
          contexts: [],
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        schema: 'movscript.project-content-candidate-create.v1',
        projectDir: '/tmp/project',
        result: { record: { id: 'candidate_a' } },
      }), { status: 200 })
    },
  })

  const created = await client.createContentCandidate({
    projectDir: '/tmp/project',
    input: { contentUnitId: 'opening', outputs: [{ kind: 'image', resource_id: 101 }] },
    decisionStore,
  })
  const view = await client.candidateView({
    projectDir: '/tmp/project',
    contentUnitIds: ['opening'],
    decisionStore,
  })

  assert.equal(created.result.record.id, 'candidate_a')
  assert.equal(view.contexts.length, 0)
  assert.deepEqual(requests, [
    {
      url: `http://127.0.0.1:9003${PROJECT_SERVICE_CONTENT_CANDIDATE_CREATE_ENDPOINT}`,
      method: 'POST',
      body: {
        projectDir: '/tmp/project',
        input: { contentUnitId: 'opening', outputs: [{ kind: 'image', resource_id: 101 }] },
        decisionStore,
      },
    },
    {
      url: `http://127.0.0.1:9003${PROJECT_SERVICE_CANDIDATE_VIEW_ENDPOINT}`,
      method: 'POST',
      body: {
        projectDir: '/tmp/project',
        contentUnitIds: ['opening'],
        decisionStore,
      },
    },
  ])
})

test('project service client posts prompt context requests', async () => {
  const requests = []
  const client = new ProjectServiceClient({
    baseUrl: 'http://127.0.0.1:9004',
    fetch: async (url, init = {}) => {
      const body = init.body ? JSON.parse(String(init.body)) : undefined
      requests.push({
        url: String(url),
        method: init.method,
        body,
      })
      if (Array.isArray(body?.contentUnitIds)) {
        return new Response(JSON.stringify({
          schema: 'movscript.project-prompt-context.v1',
          projectDir: '/tmp/project',
          contentUnitIds: body.contentUnitIds,
          contexts: body.contentUnitIds.map((contentUnitId) => ({
            contentUnitId,
            context: {
              backendPrompt: { ok: true, prompt: { text: body.promptText } },
            },
          })),
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        schema: 'movscript.project-prompt-context.v1',
        projectDir: '/tmp/project',
        contentUnitId: 'opening',
        generationPrompt: { schema: 'movscript.content_unit_prompt.v1' },
        backendPrompt: { ok: true },
      }), { status: 200 })
    },
  })

  const result = await client.promptContext({
    projectDir: '/tmp/project',
    contentUnitId: 'opening',
  })

  assert.equal(result.contentUnitId, 'opening')
  const batch = await client.promptContext({
    projectDir: '/tmp/project',
    contentUnitIds: ['opening', 'closing'],
    include: ['backendPrompt'],
    promptText: 'draft prompt',
  })

  assert.equal(batch.contexts.length, 2)
  assert.equal(batch.contexts[0].context.backendPrompt.prompt.text, 'draft prompt')
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9004${PROJECT_SERVICE_PROMPT_CONTEXT_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
      contentUnitId: 'opening',
    },
  }, {
    url: `http://127.0.0.1:9004${PROJECT_SERVICE_PROMPT_CONTEXT_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
      contentUnitIds: ['opening', 'closing'],
      include: ['backendPrompt'],
      promptText: 'draft prompt',
    },
  }])
})

test('project service discovery reads explicit env before MovScript Home records', async () => {
  assert.equal(resolveProjectServiceBaseUrl({
    env: {
      MOVSCRIPT_PROJECT_SERVICE_URL: 'http://explicit.test/',
    },
  }), 'http://explicit.test')
})

test('project service discovery reads runtime endpoint records from MovScript Home', async () => {
  const homeDir = join(tmpdir(), `movscript-project-client-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  try {
    await mkdir(join(homeDir, 'runtime', 'endpoints'), { recursive: true })
    await writeFile(join(homeDir, 'runtime', 'endpoints', `${PROJECT_SERVICE_NAME}.json`), JSON.stringify({
      serviceName: PROJECT_SERVICE_NAME,
      baseURL: 'http://127.0.0.1:7777/',
      status: 'ready',
      ready: true,
    }), 'utf8')

    assert.equal(resolveProjectServiceBaseUrl({ homeDir, env: {} }), 'http://127.0.0.1:7777')
  } finally {
    await rm(homeDir, { recursive: true, force: true })
  }
})

test('project service runtime discovery points missing endpoint users at daemon startup', () => {
  assert.throws(
    () => createProjectServiceClientFromRuntime({ env: {}, homeDir: join(tmpdir(), 'movscript-missing-project-service') }),
    /start the local runtime daemon or set MOVSCRIPT_PROJECT_SERVICE_URL/,
  )
})
