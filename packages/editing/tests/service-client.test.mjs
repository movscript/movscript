import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  EDITING_SERVICE_NAME,
  EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT,
  EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT,
  EDITING_SERVICE_TASK_REQUEST_ENDPOINT,
  EDITING_SERVICE_TASK_ACTION_ENDPOINT,
  MEDIA_PIPELINE_CAPABILITIES_ENDPOINT,
  MEDIA_PIPELINE_PROBE_ENDPOINT,
  MEDIA_PIPELINE_SERVICE_NAME,
  MEDIA_PIPELINE_TASK_ACTION_ENDPOINT,
  MEDIA_PIPELINE_TASK_CREATE_ENDPOINT,
  EditingServiceClient,
  MediaPipelineServiceClient,
  createEditingServiceClientFromRuntime,
  createMediaPipelineServiceClientFromRuntime,
  resolveEditingServiceBaseUrl,
  resolveMediaPipelineServiceBaseUrl,
} from '../dist/index.js'

test('editing service client posts project commands to the command endpoint', async () => {
  const requests = []
  const client = new EditingServiceClient({
    baseUrl: ' http://127.0.0.1:9011/ ',
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(JSON.stringify({
        schema: 'movscript.editing-project-command-result.v1',
        command: 'validateTimeline',
        result: { status: 'ok', valid: true, diagnostics: [] },
      }), { status: 200 })
    },
  })

  const result = await client.projectCommand({
    command: 'validateTimeline',
    input: { editing_project: { id: 'editing_project_1' } },
  })

  assert.equal(result.command, 'validateTimeline')
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9011${EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT}`,
    method: 'POST',
    body: {
      command: 'validateTimeline',
      input: { editing_project: { id: 'editing_project_1' } },
    },
  }])
})

test('editing service client posts timeline view requests to the timeline view endpoint', async () => {
  const requests = []
  const client = new EditingServiceClient({
    baseUrl: 'http://127.0.0.1:9011',
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(JSON.stringify({
        schema: 'movscript.editing-timeline-view.v1',
        projectDir: JSON.parse(String(init.body)).projectDir,
        kind: JSON.parse(String(init.body)).kind,
        result: { schema: 'movscript.preview_timeline.v1', productionId: 'pilot', items: [] },
      }), { status: 200 })
    },
  })

  const result = await client.timelineView({
    projectDir: '/tmp/movscript-project',
    kind: 'previewTimeline',
    productionId: 'pilot',
  })

  assert.equal(result.kind, 'previewTimeline')
  await client.timelineView({
    projectDir: '/tmp/movscript-project',
    kind: 'sceneMomentTimelineBundle',
    sceneMomentId: 'rain_call',
    projectName: 'Rain call cut',
  })
  await client.timelineView({
    projectDir: '/tmp/movscript-project',
    kind: 'productionTimelineBundle',
    productionId: 'pilot',
    decisionStore: {
      kind: 'scoped-project-data',
      baseUrl: 'http://movscript.test',
      projectUid: 'prj_pilot',
      token: 'test-token',
    },
    projectName: 'Pilot timeline',
    now: '2026-06-24T00:00:00.000Z',
    defaultDurationMs: 7000,
  })
  await client.timelineView({
    projectDir: '/tmp/movscript-project',
    kind: 'timelineAssemblyBundle',
    targetKind: 'timeline_assembly',
    targetRef: 'timeline_assembly:production:pilot',
    scopeKind: 'production',
    scopeRef: 'pilot',
  })
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9011${EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/movscript-project',
      kind: 'previewTimeline',
      productionId: 'pilot',
    },
  }, {
    url: `http://127.0.0.1:9011${EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/movscript-project',
      kind: 'sceneMomentTimelineBundle',
      sceneMomentId: 'rain_call',
      projectName: 'Rain call cut',
    },
  }, {
    url: `http://127.0.0.1:9011${EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/movscript-project',
      kind: 'productionTimelineBundle',
      productionId: 'pilot',
      decisionStore: {
        kind: 'scoped-project-data',
        baseUrl: 'http://movscript.test',
        projectUid: 'prj_pilot',
        token: 'test-token',
      },
      projectName: 'Pilot timeline',
      now: '2026-06-24T00:00:00.000Z',
      defaultDurationMs: 7000,
    },
  }, {
    url: `http://127.0.0.1:9011${EDITING_SERVICE_TIMELINE_VIEW_ENDPOINT}`,
    method: 'POST',
    body: {
      projectDir: '/tmp/movscript-project',
      kind: 'timelineAssemblyBundle',
      targetKind: 'timeline_assembly',
      targetRef: 'timeline_assembly:production:pilot',
      scopeKind: 'production',
      scopeRef: 'pilot',
    },
  }])
})

test('editing service client posts task request inputs to the task request endpoint', async () => {
  const requests = []
  const client = new EditingServiceClient({
    baseUrl: 'http://127.0.0.1:9011',
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(JSON.stringify({
        schema: 'movscript.editing-task-request.v1',
        taskType: 'timeline_render',
        request: {
          projectId: 'project-1',
          taskType: 'timeline_render',
          output: { format: 'mp4' },
        },
      }), { status: 200 })
    },
  })

  const result = await client.taskRequest({
    taskType: 'timeline_render',
    input: { projectId: 'project-1' },
  })

  assert.equal(result.taskType, 'timeline_render')
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9011${EDITING_SERVICE_TASK_REQUEST_ENDPOINT}`,
    method: 'POST',
    body: {
      taskType: 'timeline_render',
      input: { projectId: 'project-1' },
    },
  }])
})

test('editing service client posts task action inputs to the task action endpoint', async () => {
  const requests = []
  const client = new EditingServiceClient({
    baseUrl: 'http://127.0.0.1:9011',
    fetch: async (url, init = {}) => {
      const body = init.body ? JSON.parse(String(init.body)) : undefined
      requests.push({
        url: String(url),
        method: init.method,
        body,
      })
      return new Response(JSON.stringify({
        schema: 'movscript.editing-task-action.v1',
        action: body.action,
        request: {
          action: body.action,
          taskId: 'task-1',
          task_id: 'task-1',
          options: {
            projectId: 'project-1',
            project_id: 'project-1',
          },
        },
      }), { status: 200 })
    },
  })

  const result = await client.taskAction({
    action: 'getTask',
    input: { projectId: 'project-1', taskId: 'task-1' },
  })

  assert.equal(result.action, 'getTask')
  assert.equal(result.request.taskId, 'task-1')
  const exportAction = await client.taskAction({
    action: 'importExportResource',
    input: { outputPath: '/tmp/export.mp4', filename: 'export.mp4' },
  })
  assert.equal(exportAction.action, 'importExportResource')
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9011${EDITING_SERVICE_TASK_ACTION_ENDPOINT}`,
    method: 'POST',
    body: {
      action: 'getTask',
      input: { projectId: 'project-1', taskId: 'task-1' },
    },
  }, {
    url: `http://127.0.0.1:9011${EDITING_SERVICE_TASK_ACTION_ENDPOINT}`,
    method: 'POST',
    body: {
      action: 'importExportResource',
      input: { outputPath: '/tmp/export.mp4', filename: 'export.mp4' },
    },
  }])
})

test('editing package publishes media pipeline runtime port contracts', () => {
  const runtimeSource = readFileSync(new URL('../src/runtime.ts', import.meta.url), 'utf8')
  const declarationSource = readFileSync(new URL('../dist/index.d.ts', import.meta.url), 'utf8')

  assert.match(runtimeSource, /export interface EditingMediaPipelineTaskRequest/)
  assert.match(runtimeSource, /export interface EditingMediaPipelineTaskState/)
  assert.match(runtimeSource, /export interface EditingRuntimePort/)
  assert.match(runtimeSource, /createTask\(request: EditingMediaPipelineTaskRequest\)/)
  assert.match(runtimeSource, /publishHlsStream\?\(request: EditingRuntimeHlsPublishRequest\)/)
  assert.match(declarationSource, /EditingMediaPipelineTaskRequest/)
  assert.match(declarationSource, /EditingRuntimePort/)
  assert.match(declarationSource, /EditingRuntimeHlsPublishRequest/)
})

test('media pipeline service client posts probe requests to the probe endpoint', async () => {
  const requests = []
  const client = new MediaPipelineServiceClient({
    baseUrl: 'http://127.0.0.1:9012/',
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      if (String(url).endsWith(MEDIA_PIPELINE_CAPABILITIES_ENDPOINT)) {
        return new Response(JSON.stringify({
          serviceName: MEDIA_PIPELINE_SERVICE_NAME,
          capabilities: ['probe', 'render'],
          runtimeContract: 'EditingRuntimePort',
          supportedTaskTypes: ['timeline_render'],
          supportedOutputs: ['mp4'],
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        schema: 'movscript.media-pipeline-probe.v1',
        serviceName: MEDIA_PIPELINE_SERVICE_NAME,
        status: 'unavailable',
        available: false,
        runtimeContract: 'EditingRuntimePort',
        capabilities: ['probe', 'render'],
        supportedTaskTypes: ['timeline_render'],
        supportedOutputs: ['mp4'],
        requestedTaskType: 'timeline_render',
        reason: 'media_pipeline_execution_not_configured',
      }), { status: 200 })
    },
  })

  const capabilities = await client.capabilities()
  assert.equal(capabilities.serviceName, MEDIA_PIPELINE_SERVICE_NAME)
  const probe = await client.probe({ taskType: 'timeline_render' })
  assert.equal(probe.schema, 'movscript.media-pipeline-probe.v1')
  assert.equal(probe.requestedTaskType, 'timeline_render')
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9012${MEDIA_PIPELINE_CAPABILITIES_ENDPOINT}`,
    method: 'GET',
    body: undefined,
  }, {
    url: `http://127.0.0.1:9012${MEDIA_PIPELINE_PROBE_ENDPOINT}`,
    method: 'POST',
    body: { taskType: 'timeline_render' },
  }])
})

test('media pipeline service client posts task execution requests to media pipeline endpoints', async () => {
  const requests = []
  const client = new MediaPipelineServiceClient({
    baseUrl: 'http://127.0.0.1:9012/',
    fetch: async (url, init = {}) => {
      const body = init.body ? JSON.parse(String(init.body)) : undefined
      requests.push({
        url: String(url),
        method: init.method,
        body,
      })
      if (String(url).endsWith(MEDIA_PIPELINE_TASK_CREATE_ENDPOINT)) {
        return new Response(JSON.stringify({
          schema: 'movscript.media-pipeline-task-create.v1',
          task: {
            taskId: 'task-1',
            projectId: body.request.projectId,
            taskType: body.request.taskType,
            status: 'queued',
            progressPercent: 0,
            createdAt: '2026-06-24T00:00:00.000Z',
            updatedAt: '2026-06-24T00:00:00.000Z',
          },
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        schema: 'movscript.media-pipeline-task-action.v1',
        action: body.action,
        task: {
          taskId: body.taskId,
          projectId: body.options.projectId,
          taskType: 'timeline_render',
          status: 'running',
          progressPercent: 32,
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:01.000Z',
        },
      }), { status: 200 })
    },
  })

  const created = await client.createTask({
    request: {
      projectId: 'project-1',
      taskType: 'timeline_render',
      output: { format: 'mp4' },
    },
  })
  const action = await client.taskAction({
    action: 'getTask',
    taskId: 'task-1',
    options: { projectId: 'project-1' },
  })

  assert.equal(created.schema, 'movscript.media-pipeline-task-create.v1')
  assert.equal(created.task.taskId, 'task-1')
  assert.equal(action.schema, 'movscript.media-pipeline-task-action.v1')
  assert.equal(action.task.status, 'running')
  assert.deepEqual(requests, [{
    url: `http://127.0.0.1:9012${MEDIA_PIPELINE_TASK_CREATE_ENDPOINT}`,
    method: 'POST',
    body: {
      request: {
        projectId: 'project-1',
        taskType: 'timeline_render',
        output: { format: 'mp4' },
      },
    },
  }, {
    url: `http://127.0.0.1:9012${MEDIA_PIPELINE_TASK_ACTION_ENDPOINT}`,
    method: 'POST',
    body: {
      action: 'getTask',
      taskId: 'task-1',
      options: { projectId: 'project-1' },
    },
  }])
})

test('editing service discovery reads explicit env before MovScript Home records', async () => {
  assert.equal(resolveEditingServiceBaseUrl({
    env: {
      MOVSCRIPT_EDITING_SERVICE_URL: 'http://explicit-editing.test/',
    },
  }), 'http://explicit-editing.test')
})

test('media pipeline service discovery reads explicit env before MovScript Home records', async () => {
  assert.equal(resolveMediaPipelineServiceBaseUrl({
    env: {
      MOVSCRIPT_MEDIA_PIPELINE_URL: 'http://explicit-media-pipeline.test/',
    },
  }), 'http://explicit-media-pipeline.test')
})

test('editing runtime discovery points missing endpoint users at daemon startup', () => {
  assert.throws(
    () => createEditingServiceClientFromRuntime({ env: {}, homeDir: join(tmpdir(), 'movscript-missing-editing-service') }),
    /start the local runtime daemon or set MOVSCRIPT_EDITING_SERVICE_URL/,
  )
  assert.throws(
    () => createMediaPipelineServiceClientFromRuntime({ env: {}, homeDir: join(tmpdir(), 'movscript-missing-media-pipeline') }),
    /start the local runtime daemon or set MOVSCRIPT_MEDIA_PIPELINE_URL/,
  )
})

test('editing service discovery reads runtime endpoint records from MovScript Home', async () => {
  const homeDir = join(tmpdir(), `movscript-editing-client-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  try {
    await mkdir(join(homeDir, 'runtime', 'endpoints'), { recursive: true })
    await writeFile(join(homeDir, 'runtime', 'endpoints', `${EDITING_SERVICE_NAME}.json`), JSON.stringify({
      serviceName: EDITING_SERVICE_NAME,
      baseURL: 'http://127.0.0.1:7788/',
      status: 'ready',
      ready: true,
    }), 'utf8')

    assert.equal(resolveEditingServiceBaseUrl({ homeDir, env: {} }), 'http://127.0.0.1:7788')
  } finally {
    await rm(homeDir, { recursive: true, force: true })
  }
})

test('media pipeline service discovery reads runtime endpoint records from MovScript Home', async () => {
  const homeDir = join(tmpdir(), `movscript-media-pipeline-client-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  try {
    await mkdir(join(homeDir, 'runtime', 'endpoints'), { recursive: true })
    await writeFile(join(homeDir, 'runtime', 'endpoints', `${MEDIA_PIPELINE_SERVICE_NAME}.json`), JSON.stringify({
      serviceName: MEDIA_PIPELINE_SERVICE_NAME,
      baseURL: 'http://127.0.0.1:7799/',
      status: 'ready',
      ready: true,
    }), 'utf8')

    assert.equal(resolveMediaPipelineServiceBaseUrl({ homeDir, env: {} }), 'http://127.0.0.1:7799')
  } finally {
    await rm(homeDir, { recursive: true, force: true })
  }
})
