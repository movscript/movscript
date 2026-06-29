import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createHeadlessMediaPipelineRuntimePort } from '../src/headlessRuntime.mjs'
import {
  MEDIA_PIPELINE_CAPABILITIES_ENDPOINT,
  MEDIA_PIPELINE_PROBE_ENDPOINT,
  MEDIA_PIPELINE_SERVICE_CAPABILITIES,
  MEDIA_PIPELINE_SERVICE_NAME,
  MEDIA_PIPELINE_TASK_ACTION_ENDPOINT,
  MEDIA_PIPELINE_TASK_CREATE_ENDPOINT,
  MEDIA_PIPELINE_SUPPORTED_OUTPUTS,
  MEDIA_PIPELINE_SUPPORTED_TASK_TYPES,
  startMediaPipelineService,
} from '../src/server.mjs'

test('media-pipeline exposes health and capability endpoints', async () => {
  const runtime = await startMediaPipelineService()
  tAfterClose(runtime)

  const health = await fetchJSON(`${runtime.url}/health`)
  assert.deepEqual(health, {
    status: 'ok',
    serviceName: MEDIA_PIPELINE_SERVICE_NAME,
    capabilities: MEDIA_PIPELINE_SERVICE_CAPABILITIES,
  })

  const capabilities = await fetchJSON(`${runtime.url}${MEDIA_PIPELINE_CAPABILITIES_ENDPOINT}`)
  assert.deepEqual(capabilities, {
    serviceName: MEDIA_PIPELINE_SERVICE_NAME,
    capabilities: MEDIA_PIPELINE_SERVICE_CAPABILITIES,
    runtimeContract: 'EditingRuntimePort',
    supportedTaskTypes: MEDIA_PIPELINE_SUPPORTED_TASK_TYPES,
    supportedOutputs: MEDIA_PIPELINE_SUPPORTED_OUTPUTS,
  })
})

test('media-pipeline rejects unknown routes', async () => {
  const runtime = await startMediaPipelineService()
  tAfterClose(runtime)

  const response = await fetch(`${runtime.url}/missing`)
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'not_found' })
})

test('media-pipeline accepts browser preflight requests from local surface hosts', async () => {
  const runtime = await startMediaPipelineService()
  tAfterClose(runtime)

  const response = await fetch(`${runtime.url}${MEDIA_PIPELINE_TASK_CREATE_ENDPOINT}`, {
    method: 'OPTIONS',
    headers: {
      origin: 'http://127.0.0.1:53711',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  })

  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:53711')
  assert.match(response.headers.get('access-control-allow-methods') ?? '', /POST/)
  assert.match(response.headers.get('access-control-allow-headers') ?? '', /Content-Type/)
})

test('media-pipeline exposes a stable probe envelope before execution runtime is configured', async () => {
  const runtime = await startMediaPipelineService()
  tAfterClose(runtime)

  const probe = await postJSON(`${runtime.url}${MEDIA_PIPELINE_PROBE_ENDPOINT}`, {
    taskType: 'timeline_render',
    feature: 'render',
  })

  assert.equal(probe.schema, 'movscript.media-pipeline-probe.v1')
  assert.equal(probe.serviceName, MEDIA_PIPELINE_SERVICE_NAME)
  assert.equal(probe.status, 'unavailable')
  assert.equal(probe.available, false)
  assert.equal(probe.runtimeContract, 'EditingRuntimePort')
  assert.deepEqual(probe.capabilities, MEDIA_PIPELINE_SERVICE_CAPABILITIES)
  assert.deepEqual(probe.supportedTaskTypes, MEDIA_PIPELINE_SUPPORTED_TASK_TYPES)
  assert.deepEqual(probe.supportedOutputs, MEDIA_PIPELINE_SUPPORTED_OUTPUTS)
  assert.equal(probe.requestedTaskType, 'timeline_render')
  assert.equal(probe.requestedFeature, 'render')
  assert.equal(probe.reason, 'media_pipeline_execution_not_configured')
  assert.deepEqual(probe.ffmpeg, {
    available: false,
    code: 'FFMPEG_RUNTIME_NOT_CONFIGURED',
  })
})

test('media-pipeline validates probe task types', async () => {
  const runtime = await startMediaPipelineService()
  tAfterClose(runtime)

  const response = await fetch(`${runtime.url}${MEDIA_PIPELINE_PROBE_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskType: 'unknown_task' }),
  })

  assert.equal(response.status, 400)
  assert.equal((await response.json()).error, 'media_pipeline_task_type_unsupported')
})

test('media-pipeline delegates task create requests to the injected runtime port', async () => {
  const calls = []
  const runtime = await startMediaPipelineService({
    runtimePort: {
      async createTask(request) {
        calls.push(request)
        return taskState({
          taskId: 'task-render-1',
          projectId: request.projectId,
          taskType: request.taskType,
          status: 'queued',
        })
      },
      async getTask() {
        return null
      },
      async cancelTask() {
        return taskState({ taskId: 'unused', status: 'canceled' })
      },
    },
  })
  tAfterClose(runtime)

  const result = await postJSON(`${runtime.url}${MEDIA_PIPELINE_TASK_CREATE_ENDPOINT}`, {
    request: {
      projectId: 'project-1',
      taskType: 'timeline_render',
      output: { format: 'mp4' },
    },
  })

  assert.equal(result.schema, 'movscript.media-pipeline-task-create.v1')
  assert.equal(result.task.taskId, 'task-render-1')
  assert.equal(result.task.projectId, 'project-1')
  assert.deepEqual(calls, [{
    projectId: 'project-1',
    taskType: 'timeline_render',
    output: { format: 'mp4' },
  }])
})

test('media-pipeline delegates task actions to the injected runtime port', async () => {
  const calls = []
  const runtime = await startMediaPipelineService({
    runtimePort: {
      async createTask(request) {
        return taskState({ taskId: 'created', projectId: request.projectId, taskType: request.taskType })
      },
      async getTask(taskId, options) {
        calls.push(['getTask', taskId, options])
        return taskState({ taskId, projectId: options.projectId, status: 'running' })
      },
      async cancelTask(taskId, options) {
        calls.push(['cancelTask', taskId, options])
        return taskState({ taskId, projectId: options.projectId, status: 'canceled' })
      },
      async getTaskLogs(taskId, options) {
        calls.push(['getTaskLogs', taskId, options])
        return {
          status: 'ok',
          taskId,
          logs: ['render started'],
        }
      },
    },
  })
  tAfterClose(runtime)

  const getResult = await postJSON(`${runtime.url}${MEDIA_PIPELINE_TASK_ACTION_ENDPOINT}`, {
    action: 'getTask',
    taskId: 'task-1',
    options: { projectId: 'project-1' },
  })
  const cancelResult = await postJSON(`${runtime.url}${MEDIA_PIPELINE_TASK_ACTION_ENDPOINT}`, {
    action: 'cancelTask',
    taskId: 'task-1',
    options: { projectId: 'project-1' },
  })
  const logsResult = await postJSON(`${runtime.url}${MEDIA_PIPELINE_TASK_ACTION_ENDPOINT}`, {
    action: 'getTaskLogs',
    taskId: 'task-1',
    options: { projectId: 'project-1' },
  })

  assert.equal(getResult.schema, 'movscript.media-pipeline-task-action.v1')
  assert.equal(getResult.task.status, 'running')
  assert.equal(cancelResult.task.status, 'canceled')
  assert.deepEqual(logsResult.logs.logs, ['render started'])
  assert.deepEqual(calls, [
    ['getTask', 'task-1', { projectId: 'project-1' }],
    ['cancelTask', 'task-1', { projectId: 'project-1' }],
    ['getTaskLogs', 'task-1', { projectId: 'project-1' }],
  ])
})

test('headless media-pipeline runtime probes ffmpeg and runs a local transcode task lifecycle', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'movscript-headless-media-'))
  const fakeFFmpeg = join(tempDir, 'ffmpeg')
  const sourcePath = join(tempDir, 'source.mp4')
  writeFileSync(sourcePath, 'fake source', 'utf8')
  writeFileSync(fakeFFmpeg, [
    '#!/bin/sh',
    'if [ "$1" = "-version" ]; then',
    '  echo "ffmpeg version fake-headless"',
    '  exit 0',
    'fi',
    'last=""',
    'for arg in "$@"; do last="$arg"; done',
    'mkdir -p "$(dirname "$last")"',
    'printf "fake output" > "$last"',
    'exit 0',
    '',
  ].join('\n'), 'utf8')
  chmodSync(fakeFFmpeg, 0o755)

  const runtime = await startMediaPipelineService({
    runtimePort: createHeadlessMediaPipelineRuntimePort({
      env: {
        MOVSCRIPT_FFMPEG_PATH: fakeFFmpeg,
        MOVSCRIPT_MEDIA_PIPELINE_WORK_DIR: join(tempDir, 'tasks'),
      },
    }),
  })
  tAfterClose(runtime)

  const probe = await postJSON(`${runtime.url}${MEDIA_PIPELINE_PROBE_ENDPOINT}`, {
    taskType: 'media_transcode',
  })
  assert.equal(probe.status, 'available')
  assert.equal(probe.ffmpeg.available, true)
  assert.match(probe.ffmpeg.version, /fake-headless/)

  const created = await postJSON(`${runtime.url}${MEDIA_PIPELINE_TASK_CREATE_ENDPOINT}`, {
    request: {
      projectId: 'project-1',
      taskType: 'media_transcode',
      source: {
        sourceKind: 'local_file',
        assetType: 'video',
        localPath: sourcePath,
      },
      output: {
        format: 'mp4',
        filename: 'output.mp4',
      },
    },
  })
  assert.equal(created.schema, 'movscript.media-pipeline-task-create.v1')
  assert.equal(created.task.taskType, 'media_transcode')

  const task = await waitForTask(runtime.url, created.task.taskId, 'succeeded')
  assert.equal(task.status, 'succeeded')
  assert.equal(task.outputName, 'output.mp4')
  assert.match(task.outputPath, /output\.mp4$/)

  const logs = await postJSON(`${runtime.url}${MEDIA_PIPELINE_TASK_ACTION_ENDPOINT}`, {
    action: 'getTaskLogs',
    taskId: created.task.taskId,
    options: { projectId: 'project-1' },
  })
  assert.equal(logs.logs.status, 'ok')
  assert.ok(logs.logs.logs.some((line) => line.includes('ffmpeg')))
})

test('headless media-pipeline runtime runs minimal local timeline render and HLS tasks', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'movscript-headless-timeline-'))
  const fakeFFmpeg = join(tempDir, 'ffmpeg')
  const sourcePath = join(tempDir, 'clip.mp4')
  writeFileSync(sourcePath, 'fake source', 'utf8')
  writeFileSync(fakeFFmpeg, [
    '#!/bin/sh',
    'if [ "$1" = "-version" ]; then',
    '  echo "ffmpeg version fake-headless-timeline"',
    '  exit 0',
    'fi',
    'segment=""',
    'last=""',
    'previous=""',
    'for arg in "$@"; do',
    '  if [ "$previous" = "-hls_segment_filename" ]; then segment="$arg"; fi',
    '  previous="$arg"',
    '  last="$arg"',
    'done',
    'mkdir -p "$(dirname "$last")"',
    'printf "fake timeline output" > "$last"',
    'if [ -n "$segment" ]; then',
    '  first_segment=$(printf "%s" "$segment" | sed "s/%05d/00000/g")',
    '  mkdir -p "$(dirname "$first_segment")"',
    '  printf "segment" > "$first_segment"',
    'fi',
    'exit 0',
    '',
  ].join('\n'), 'utf8')
  chmodSync(fakeFFmpeg, 0o755)

  const runtime = await startMediaPipelineService({
    runtimePort: createHeadlessMediaPipelineRuntimePort({
      env: {
        MOVSCRIPT_FFMPEG_PATH: fakeFFmpeg,
        MOVSCRIPT_MEDIA_PIPELINE_WORK_DIR: join(tempDir, 'tasks'),
      },
    }),
  })
  tAfterClose(runtime)

  const timeline = {
    version: 1,
    id: 'timeline-headless',
    fps: 30,
    width: 1280,
    height: 720,
    background: '#000000',
    tracks: [{
      id: 'track-video',
      type: 'video',
      zIndex: 0,
      clips: [{
        id: 'clip-video',
        assetType: 'video',
        timelineStartMs: 0,
        durationMs: 1000,
        asset: {
          id: 'asset-video',
          sourceKind: 'local_file',
          assetType: 'video',
          localPath: sourcePath,
        },
      }],
    }],
  }

  const render = await postJSON(`${runtime.url}${MEDIA_PIPELINE_TASK_CREATE_ENDPOINT}`, {
    request: {
      projectId: 'project-1',
      taskType: 'timeline_render',
      timeline,
      output: {
        format: 'mp4',
        filename: 'timeline.mp4',
      },
    },
  })
  const renderedTask = await waitForTask(runtime.url, render.task.taskId, 'succeeded')
  assert.equal(renderedTask.taskType, 'timeline_render')
  assert.equal(renderedTask.outputName, 'timeline.mp4')
  assert.match(renderedTask.outputPath, /timeline\.mp4$/)

  const hls = await postJSON(`${runtime.url}${MEDIA_PIPELINE_TASK_CREATE_ENDPOINT}`, {
    request: {
      projectId: 'project-1',
      taskType: 'timeline_hls',
      timeline,
      output: {
        format: 'hls',
        filename: 'timeline.m3u8',
      },
    },
  })
  const hlsTask = await waitForTask(runtime.url, hls.task.taskId, 'succeeded')
  assert.equal(hlsTask.taskType, 'timeline_hls')
  assert.equal(hlsTask.outputName, 'timeline.m3u8')
  assert.match(hlsTask.hlsManifestPath, /timeline\.m3u8$/)
  assert.ok(hlsTask.hlsDirectory)

  const variants = await postJSON(`${runtime.url}${MEDIA_PIPELINE_TASK_CREATE_ENDPOINT}`, {
    request: {
      projectId: 'project-1',
      taskType: 'timeline_hls',
      timeline,
      output: {
        format: 'hls',
        filename: 'variants.m3u8',
        hlsVariants: [
          { name: '360p', width: 640, height: 360, videoBitrateKbps: 900 },
          { name: '720p', width: 1280, height: 720, videoBitrateKbps: 2500 },
        ],
      },
    },
  })
  const variantTask = await waitForTask(runtime.url, variants.task.taskId, 'succeeded')
  assert.equal(variantTask.taskType, 'timeline_hls')
  assert.match(variantTask.hlsManifestPath, /variants\.m3u8$/)
  assert.deepEqual(variantTask.hlsVariants.map((variant) => variant.name), ['360p', '720p'])
  assert.deepEqual(variantTask.hlsVariants.map((variant) => variant.bandwidth), [1028000, 2628000])
  assert.deepEqual(new Set(variantTask.hlsSegmentPaths.map((path) => path.split('/').pop())), new Set([
    '360p-segment-00000.ts',
    '360p.m3u8',
    '720p-segment-00000.ts',
    '720p.m3u8',
  ]))
  const master = readFileSync(variantTask.hlsManifestPath, 'utf8')
  assert.match(master, /#EXT-X-STREAM-INF:BANDWIDTH=1028000,RESOLUTION=640x360\n360p\.m3u8/)
  assert.match(master, /#EXT-X-STREAM-INF:BANDWIDTH=2628000,RESOLUTION=1280x720\n720p\.m3u8/)
})

test('headless media-pipeline runtime downloads resource_id timeline sources before render', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'movscript-headless-resource-download-'))
  const fakeFFmpeg = join(tempDir, 'ffmpeg')
  const resourceCacheDir = join(tempDir, 'resource-cache')
  const requests = []
  writeFileSync(fakeFFmpeg, [
    '#!/bin/sh',
    'if [ "$1" = "-version" ]; then',
    '  echo "ffmpeg version fake-headless-resource-download"',
    '  exit 0',
    'fi',
    'last=""',
    'for arg in "$@"; do last="$arg"; done',
    'mkdir -p "$(dirname "$last")"',
    'printf "fake downloaded output" > "$last"',
    'exit 0',
    '',
  ].join('\n'), 'utf8')
  chmodSync(fakeFFmpeg, 0o755)

  const resourceServer = await startTestResourceServer((request, response) => {
    requests.push(request.url)
    if (request.url === '/api/v1/resources/701/file') {
      response.writeHead(200, {
        'content-type': 'video/mp4',
        'content-length': String(Buffer.byteLength('downloaded resource source')),
      })
      response.end('downloaded resource source')
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'not_found' }))
  })

  const runtime = await startMediaPipelineService({
    runtimePort: createHeadlessMediaPipelineRuntimePort({
      env: {
        MOVSCRIPT_FFMPEG_PATH: fakeFFmpeg,
        MOVSCRIPT_MEDIA_PIPELINE_WORK_DIR: join(tempDir, 'tasks'),
      },
    }),
  })
  tAfterClose(runtime)

  try {
    const render = await postJSON(`${runtime.url}${MEDIA_PIPELINE_TASK_CREATE_ENDPOINT}`, {
      request: {
        projectId: 'project-1',
        taskType: 'timeline_render',
        resourceDownload: {
          baseUrl: resourceServer.url,
          cacheDir: resourceCacheDir,
          extension: 'mp4',
        },
        timeline: {
          version: 1,
          id: 'timeline-resource-download',
          fps: 30,
          width: 1280,
          height: 720,
          background: '#000000',
          tracks: [{
            id: 'track-video',
            type: 'video',
            zIndex: 0,
            clips: [{
              id: 'clip-video',
              assetType: 'video',
              timelineStartMs: 0,
              durationMs: 1000,
              asset: {
                id: 'asset-video-resource-701',
                sourceKind: 'raw_resource',
                assetType: 'video',
                resourceId: 701,
              },
            }],
          }],
        },
        output: {
          format: 'mp4',
          filename: 'resource-download.mp4',
        },
      },
    })
    const renderedTask = await waitForTask(runtime.url, render.task.taskId, 'succeeded')
    assert.equal(renderedTask.taskType, 'timeline_render')
    assert.equal(renderedTask.sourceResourceId, 701)
    assert.equal(renderedTask.sourceDownloaded, true)
    assert.deepEqual(requests, ['/api/v1/resources/701/file'])
    assert.equal(readFileSync(join(resourceCacheDir, 'resource-701.mp4'), 'utf8'), 'downloaded resource source')
    assert.equal(readFileSync(renderedTask.outputPath, 'utf8'), 'fake downloaded output')
  } finally {
    await resourceServer.close()
  }
})

test('headless media-pipeline runtime records failed tasks when ffmpeg is unavailable', async () => {
  const runtime = await startMediaPipelineService({
    runtimePort: createHeadlessMediaPipelineRuntimePort({
      env: {
        MOVSCRIPT_FFMPEG_PATH: '/definitely/missing/ffmpeg',
      },
    }),
  })
  tAfterClose(runtime)

  const created = await postJSON(`${runtime.url}${MEDIA_PIPELINE_TASK_CREATE_ENDPOINT}`, {
    request: {
      projectId: 'project-1',
      taskType: 'media_transcode',
      source: {
        sourceKind: 'local_file',
        assetType: 'video',
        localPath: '/missing/source.mp4',
      },
      output: { format: 'mp4' },
    },
  })
  const task = await waitForTask(runtime.url, created.task.taskId, 'failed')
  assert.equal(task.status, 'failed')
  assert.equal(task.errorCode, 'FFMPEG_NOT_FOUND')
})

test('media-pipeline reports runtime unavailability for task execution endpoints', async () => {
  const runtime = await startMediaPipelineService()
  tAfterClose(runtime)

  const createResponse = await fetch(`${runtime.url}${MEDIA_PIPELINE_TASK_CREATE_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      request: {
        projectId: 'project-1',
        taskType: 'timeline_render',
        output: { format: 'mp4' },
      },
    }),
  })
  assert.equal(createResponse.status, 503)
  assert.equal((await createResponse.json()).error, 'media_pipeline_runtime_unavailable')

  const actionResponse = await fetch(`${runtime.url}${MEDIA_PIPELINE_TASK_ACTION_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'getTask',
      taskId: 'task-1',
    }),
  })
  assert.equal(actionResponse.status, 503)
  assert.equal((await actionResponse.json()).error, 'media_pipeline_runtime_unavailable')
})

test('media-pipeline validates task execution endpoint requests', async () => {
  const runtime = await startMediaPipelineService({
    runtimePort: {
      async createTask() {
        throw new Error('should not be called')
      },
      async getTask() {
        return null
      },
      async cancelTask() {
        return taskState({ taskId: 'unused', status: 'canceled' })
      },
    },
  })
  tAfterClose(runtime)

  const createResponse = await fetch(`${runtime.url}${MEDIA_PIPELINE_TASK_CREATE_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      request: {
        projectId: 'project-1',
        taskType: 'unknown_task',
        output: { format: 'mp4' },
      },
    }),
  })
  assert.equal(createResponse.status, 400)
  assert.equal((await createResponse.json()).error, 'media_pipeline_task_type_unsupported')

  const actionResponse = await fetch(`${runtime.url}${MEDIA_PIPELINE_TASK_ACTION_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'unknownAction',
      taskId: 'task-1',
    }),
  })
  assert.equal(actionResponse.status, 400)
  assert.equal((await actionResponse.json()).error, 'media_pipeline_task_action_unsupported')
})

async function fetchJSON(url) {
  const response = await fetch(url)
  assert.equal(response.status, 200)
  return response.json()
}

async function postJSON(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  assert.equal(response.status, 200)
  return response.json()
}

async function waitForTask(baseUrl, taskId, status) {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    const result = await postJSON(`${baseUrl}${MEDIA_PIPELINE_TASK_ACTION_ENDPOINT}`, {
      action: 'getTask',
      taskId,
      options: { projectId: 'project-1' },
    })
    if (result.task?.status === status) return result.task
    await new Promise((resolvePoll) => setTimeout(resolvePoll, 25))
  }
  throw new Error(`task ${taskId} did not reach ${status}`)
}

function tAfterClose(runtime) {
  test.after(async () => {
    await runtime.close()
  })
}

function startTestResourceServer(handler) {
  return new Promise((resolveServer, rejectServer) => {
    const server = createServer(handler)
    server.once('error', rejectServer)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        rejectServer(new Error('test resource server did not expose a tcp address'))
        return
      }
      resolveServer({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolveClose, rejectClose) => {
          server.close((error) => error ? rejectClose(error) : resolveClose())
        }),
      })
    })
  })
}

function taskState(overrides = {}) {
  return {
    taskId: 'task-1',
    projectId: 'project-1',
    taskType: 'timeline_render',
    status: 'queued',
    progressPercent: 0,
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
    ...overrides,
  }
}
