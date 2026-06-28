import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  PROJECT_SERVICE_CANDIDATE_VIEW_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANDIDATE_CREATE_ENDPOINT,
  PROJECT_SERVICE_LIFECYCLE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_LOCATOR_RESOLVE_ENDPOINT,
  PROJECT_SERVICE_NAME,
  PROJECT_SERVICE_PROMPT_CONTEXT_ENDPOINT,
  PROJECT_SERVICE_READ_MODEL_ENDPOINT,
  PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT,
  PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT,
  PROJECT_SERVICE_SOURCE_INTERPRET_ENDPOINT,
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
        items: [{ id: 'hero', title: 'Hero' }],
      }), { status: 200 })
    },
  })

  const result = await client.resourceView({
    projectDir: '/tmp/project',
    kind: 'settings',
  })

  assert.equal(result.kind, 'settings')
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
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
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
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9004${PROJECT_SERVICE_PROMPT_CONTEXT_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/project',
      contentUnitId: 'opening',
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
