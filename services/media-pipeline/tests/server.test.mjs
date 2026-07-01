import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createHeadlessMediaPipelineRuntimePort } from '../src/headlessRuntime.mjs'
import { createFileMediaPipelineResultRegistry } from '../src/resultRegistry.mjs'
import { createFileMediaPipelineResultWatchRegistry } from '../src/resultWatchRegistry.mjs'
import {
  MEDIA_PIPELINE_CAPABILITIES_ENDPOINT,
  MEDIA_PIPELINE_PROBE_ENDPOINT,
  MEDIA_PIPELINE_RESULT_GET_ENDPOINT,
  MEDIA_PIPELINE_RESULT_LIST_ENDPOINT,
  MEDIA_PIPELINE_RESULT_REGISTER_ENDPOINT,
  MEDIA_PIPELINE_RESULT_WATCH_CANCEL_ENDPOINT,
  MEDIA_PIPELINE_RESULT_WATCH_CREATE_ENDPOINT,
  MEDIA_PIPELINE_RESULT_WATCH_GET_ENDPOINT,
  MEDIA_PIPELINE_RESULT_WATCH_LIST_ENDPOINT,
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

test('media-pipeline registers, reads, and lists render results independently of task execution', async () => {
  const runtime = await startMediaPipelineService()
  tAfterClose(runtime)

  const registered = await postJSON(`${runtime.url}${MEDIA_PIPELINE_RESULT_REGISTER_ENDPOINT}`, {
    result: {
      resultId: 'external-nle-result-1',
      projectId: 'project-1',
      taskId: 'external-task-1',
      backend: 'external_nle',
      kind: 'fcpxml',
      outputPath: '/tmp/export.fcpxml',
      metadata: {
        adapter: 'fcpxml',
      },
    },
  })

  assert.equal(registered.schema, 'movscript.media-pipeline-result-register.v1')
  assert.equal(registered.status, 'registered')
  assert.equal(registered.result.schema, 'movscript.media-pipeline-result.v1')
  assert.equal(registered.result.resultId, 'external-nle-result-1')
  assert.equal(registered.result.result_id, 'external-nle-result-1')
  assert.equal(registered.result.projectId, 'project-1')
  assert.equal(registered.result.project_id, 'project-1')
  assert.equal(registered.result.backend, 'external_nle')
  assert.equal(registered.result.kind, 'fcpxml')
  assert.equal(registered.result.outputPath, '/tmp/export.fcpxml')
  assert.deepEqual(registered.result.artifacts, [{
    kind: 'fcpxml',
    path: '/tmp/export.fcpxml',
  }])

  const loaded = await postJSON(`${runtime.url}${MEDIA_PIPELINE_RESULT_GET_ENDPOINT}`, {
    resultId: 'external-nle-result-1',
  })
  assert.equal(loaded.schema, 'movscript.media-pipeline-result-get.v1')
  assert.equal(loaded.status, 'found')
  assert.equal(loaded.result.resultId, 'external-nle-result-1')

  const missing = await postJSON(`${runtime.url}${MEDIA_PIPELINE_RESULT_GET_ENDPOINT}`, {
    resultId: 'missing-result',
  })
  assert.equal(missing.status, 'not_found')
  assert.equal(missing.result, null)

  const listed = await postJSON(`${runtime.url}${MEDIA_PIPELINE_RESULT_LIST_ENDPOINT}`, {
    projectId: 'project-1',
    backend: 'external_nle',
  })
  assert.equal(listed.schema, 'movscript.media-pipeline-result-list.v1')
  assert.equal(listed.status, 'ok')
  assert.equal(listed.count, 1)
  assert.equal(listed.results[0].resultId, 'external-nle-result-1')
})

test('media-pipeline file result registry persists registered results across service restarts', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'movscript-media-result-registry-'))
  const registryPath = join(tempDir, 'results', 'registry.json')
  const firstRuntime = await startMediaPipelineService({
    resultRegistry: createFileMediaPipelineResultRegistry({ filePath: registryPath }),
  })

  await postJSON(`${firstRuntime.url}${MEDIA_PIPELINE_RESULT_REGISTER_ENDPOINT}`, {
    result: {
      resultId: 'persistent-hyperframes-result',
      projectId: 'project-persist',
      taskId: 'hyperframes-task-1',
      backend: 'hyperframes',
      kind: 'mp4',
      outputPath: '/tmp/hyperframes.mp4',
    },
  })
  await firstRuntime.close()

  const snapshot = JSON.parse(readFileSync(registryPath, 'utf8'))
  assert.equal(snapshot.schema, 'movscript.media-pipeline-result-registry.v1')
  assert.equal(snapshot.results.length, 1)
  assert.equal(snapshot.results[0].resultId, 'persistent-hyperframes-result')

  const secondRuntime = await startMediaPipelineService({
    resultRegistry: createFileMediaPipelineResultRegistry({ filePath: registryPath }),
  })
  tAfterClose(secondRuntime)

  const loaded = await postJSON(`${secondRuntime.url}${MEDIA_PIPELINE_RESULT_GET_ENDPOINT}`, {
    resultId: 'persistent-hyperframes-result',
  })
  assert.equal(loaded.status, 'found')
  assert.equal(loaded.result.backend, 'hyperframes')
  assert.equal(loaded.result.outputPath, '/tmp/hyperframes.mp4')

  const listed = await postJSON(`${secondRuntime.url}${MEDIA_PIPELINE_RESULT_LIST_ENDPOINT}`, {
    projectId: 'project-persist',
    backend: 'hyperframes',
  })
  assert.equal(listed.count, 1)
  assert.equal(listed.results[0].resultId, 'persistent-hyperframes-result')
})

test('media-pipeline file registries default under MovScript Home media-workspaces', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'movscript-media-home-registry-'))
  const homeDir = join(tempDir, 'home')
  const resultRegistry = createFileMediaPipelineResultRegistry({ env: { MOVSCRIPT_HOME: homeDir } })
  const watchRegistry = createFileMediaPipelineResultWatchRegistry({ env: { MOVSCRIPT_HOME: homeDir }, resultRegistry })

  assert.equal(resultRegistry.filePath, join(homeDir, 'media-workspaces', 'results', 'registry.json'))
  assert.equal(watchRegistry.filePath, join(homeDir, 'media-workspaces', 'results', 'watch-registry.json'))
  assert.doesNotMatch(resultRegistry.filePath, /runtime[/\\]media-pipeline/)
  assert.doesNotMatch(watchRegistry.filePath, /runtime[/\\]media-pipeline/)
})

test('media-pipeline background-watches external NLE exports and registers results', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'movscript-media-external-watch-'))
  const outputPath = join(tempDir, 'final-cut.mov')
  const runtime = await startMediaPipelineService()
  tAfterClose(runtime)

  const created = await postJSON(`${runtime.url}${MEDIA_PIPELINE_RESULT_WATCH_CREATE_ENDPOINT}`, {
    watchId: 'external-watch-1',
    resultId: 'external-watch-result-1',
    projectId: 'project-watch',
    taskId: 'external-watch-task',
    outputDirectory: tempDir,
    pollIntervalMs: 25,
    timeoutMs: 3000,
    exchangeProjectPath: join(tempDir, 'exchange', 'movscript-edit.fcpxml'),
    externalApp: 'final_cut_pro',
    reviewer: 'editor',
    reviewStatus: 'approved',
  })
  assert.equal(created.schema, 'movscript.media-pipeline-result-watch-create.v1')
  assert.equal(created.status, 'watching')
  assert.equal(created.watch.watchId, 'external-watch-1')
  assert.equal(created.watch.status, 'watching')

  setTimeout(() => {
    writeFileSync(outputPath, 'fake external export', 'utf8')
  }, 100)

  const watch = await waitForWatch(runtime.url, 'external-watch-1', 'succeeded')
  assert.equal(watch.resultId, 'external-watch-result-1')
  assert.equal(watch.result.resultId, 'external-watch-result-1')
  assert.equal(watch.result.backend, 'external_nle')
  assert.equal(watch.result.source, 'external_nle_background_watch')
  assert.equal(watch.result.outputPath, outputPath)
  assert.equal(watch.result.provenance.recovery, 'background_watch')
  assert.equal(watch.result.provenance.external_app, 'final_cut_pro')
  assert.ok(watch.attempts >= 2)

  const registered = await postJSON(`${runtime.url}${MEDIA_PIPELINE_RESULT_GET_ENDPOINT}`, {
    resultId: 'external-watch-result-1',
  })
  assert.equal(registered.status, 'found')
  assert.equal(registered.result.outputPath, outputPath)

  const listed = await postJSON(`${runtime.url}${MEDIA_PIPELINE_RESULT_WATCH_LIST_ENDPOINT}`, {
    projectId: 'project-watch',
    status: 'succeeded',
  })
  assert.equal(listed.schema, 'movscript.media-pipeline-result-watch-list.v1')
  assert.equal(listed.count, 1)
  assert.equal(listed.watches[0].watchId, 'external-watch-1')
})

test('media-pipeline runs backend project render commands and registers renderer results', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'movscript-media-backend-render-'))
  const outputPath = join(tempDir, 'out', 'remotion-rough-cut.mp4')
  const runtime = await startMediaPipelineService({
    runtimePort: createHeadlessMediaPipelineRuntimePort({
      env: {
        MOVSCRIPT_MEDIA_PIPELINE_RUNTIME: 'headless',
        MOVSCRIPT_FFMPEG_PATH: '/definitely/not-needed-for-backend-project-render',
        MOVSCRIPT_MEDIA_PIPELINE_WORK_DIR: join(tempDir, 'tasks'),
      },
    }),
  })
  tAfterClose(runtime)

  const probe = await postJSON(`${runtime.url}${MEDIA_PIPELINE_PROBE_ENDPOINT}`, {
    taskType: 'backend_project_render',
  })
  assert.equal(probe.status, 'available')
  assert.equal(probe.available, true)
  assert.equal(probe.backendProjectRender.available, true)

  const created = await postJSON(`${runtime.url}${MEDIA_PIPELINE_TASK_CREATE_ENDPOINT}`, {
    request: {
      projectId: 'project-1',
      taskType: 'backend_project_render',
      backend: 'remotion',
      projectDirectory: tempDir,
      renderCommand: [
        process.execPath,
        '-e',
        'const fs=require("fs"); const path=require("path"); const out=process.argv.at(-1); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, "fake remotion render", "utf8");',
        '{outputPath}',
      ],
      output: {
        format: 'mp4',
        outputPath,
      },
    },
  })
  const task = await waitForTask(runtime.url, created.task.taskId, 'succeeded')
  assert.equal(task.taskType, 'backend_project_render')
  assert.equal(task.backend, 'remotion')
  assert.equal(task.outputPath, outputPath)
  assert.equal(readFileSync(outputPath, 'utf8'), 'fake remotion render')
  assert.equal(task.resultId, `${created.task.taskId}.mp4`)
  assert.equal(task.result.backend, 'remotion')
  assert.equal(task.result.source, 'media_pipeline_task')
  assert.equal(task.result.outputPath, outputPath)

  const registered = await postJSON(`${runtime.url}${MEDIA_PIPELINE_RESULT_GET_ENDPOINT}`, {
    resultId: task.resultId,
  })
  assert.equal(registered.status, 'found')
  assert.equal(registered.result.backend, 'remotion')
  assert.equal(registered.result.outputPath, outputPath)
})

test('media-pipeline runs backend project preview commands as managed sessions without registering results', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'movscript-media-backend-preview-'))
  const runtime = await startMediaPipelineService({
    runtimePort: createHeadlessMediaPipelineRuntimePort({
      env: {
        MOVSCRIPT_MEDIA_PIPELINE_RUNTIME: 'headless',
        MOVSCRIPT_FFMPEG_PATH: '/definitely/not-needed-for-backend-project-preview',
        MOVSCRIPT_MEDIA_PIPELINE_WORK_DIR: join(tempDir, 'tasks'),
      },
    }),
  })
  tAfterClose(runtime)

  const probe = await postJSON(`${runtime.url}${MEDIA_PIPELINE_PROBE_ENDPOINT}`, {
    taskType: 'backend_project_preview',
  })
  assert.equal(probe.status, 'available')
  assert.equal(probe.available, true)
  assert.equal(probe.backendProjectPreview.available, true)
  assert.equal(probe.backendProjectPreview.managedProcess, true)

  const created = await postJSON(`${runtime.url}${MEDIA_PIPELINE_TASK_CREATE_ENDPOINT}`, {
    request: {
      projectId: 'project-preview',
      taskType: 'backend_project_preview',
      backend: 'remotion',
      projectDirectory: tempDir,
      previewCommand: [
        process.execPath,
        '-e',
        'setInterval(() => {}, 1000)',
      ],
      previewUrl: 'http://127.0.0.1:3999',
    },
  })
  const task = await waitForTask(runtime.url, created.task.taskId, 'running')
  assert.equal(task.taskType, 'backend_project_preview')
  assert.equal(task.backend, 'remotion')
  assert.equal(task.projectDirectory, tempDir)
  assert.equal(task.previewUrl, 'http://127.0.0.1:3999')
  assert.deepEqual(task.surface, { kind: 'browser_url', url: 'http://127.0.0.1:3999' })
  assert.equal(task.rendered, false)
  assert.equal(task.candidate_created, false)
  assert.equal(task.currentStep, 'preview-running')

  const logs = await postJSON(`${runtime.url}${MEDIA_PIPELINE_TASK_ACTION_ENDPOINT}`, {
    action: 'getTaskLogs',
    taskId: created.task.taskId,
    options: { projectId: 'project-preview' },
  })
  assert.equal(logs.logs.status, 'ok')
  assert.ok(logs.logs.logs.some((line) => line.includes('backend remotion preview')))

  const canceled = await postJSON(`${runtime.url}${MEDIA_PIPELINE_TASK_ACTION_ENDPOINT}`, {
    action: 'cancelTask',
    taskId: created.task.taskId,
    options: { projectId: 'project-preview' },
  })
  assert.equal(canceled.task.status, 'canceled')

  const results = await postJSON(`${runtime.url}${MEDIA_PIPELINE_RESULT_LIST_ENDPOINT}`, {
    projectId: 'project-preview',
    backend: 'remotion',
  })
  assert.equal(results.count, 0)
})

test('media-pipeline can cancel a background result watch', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'movscript-media-external-watch-cancel-'))
  const runtime = await startMediaPipelineService()
  tAfterClose(runtime)

  await postJSON(`${runtime.url}${MEDIA_PIPELINE_RESULT_WATCH_CREATE_ENDPOINT}`, {
    watchId: 'external-watch-cancel',
    projectId: 'project-watch-cancel',
    outputDirectory: tempDir,
    pollIntervalMs: 1000,
  })

  const canceled = await postJSON(`${runtime.url}${MEDIA_PIPELINE_RESULT_WATCH_CANCEL_ENDPOINT}`, {
    watchId: 'external-watch-cancel',
  })
  assert.equal(canceled.schema, 'movscript.media-pipeline-result-watch-cancel.v1')
  assert.equal(canceled.status, 'canceled')
  assert.equal(canceled.watch.status, 'canceled')

  const loaded = await postJSON(`${runtime.url}${MEDIA_PIPELINE_RESULT_WATCH_GET_ENDPOINT}`, {
    watchId: 'external-watch-cancel',
  })
  assert.equal(loaded.status, 'found')
  assert.equal(loaded.watch.status, 'canceled')
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

test('headless media-pipeline runtime discovers ffmpeg from MovScript Home tools cache', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'movscript-home-ffmpeg-cache-'))
  const homeDir = join(tempDir, 'home')
  const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const ffmpegPath = join(homeDir, 'tools', 'ffmpeg', '7.1', process.platform, process.arch, binaryName)
  mkdirSync(join(ffmpegPath, '..'), { recursive: true })
  writeFileSync(ffmpegPath, [
    '#!/bin/sh',
    'echo "ffmpeg version fake-shared-cache"',
    'exit 0',
    '',
  ].join('\n'), 'utf8')
  chmodSync(ffmpegPath, 0o755)

  const runtimePort = createHeadlessMediaPipelineRuntimePort({
    env: { MOVSCRIPT_HOME: homeDir },
  })
  const capabilities = await runtimePort.getCapabilities()

  assert.equal(capabilities.available, true)
  assert.equal(capabilities.ffmpeg.available, true)
  assert.equal(capabilities.ffmpeg.path, ffmpegPath)
  assert.match(capabilities.ffmpeg.version, /fake-shared-cache/)
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
  assert.equal(task.resultId, `${created.task.taskId}.mp4`)
  assert.equal(task.result.resultId, `${created.task.taskId}.mp4`)
  assert.equal(task.result.backend, 'media_pipeline')
  assert.equal(task.result.kind, 'mp4')

  const registeredResult = await postJSON(`${runtime.url}${MEDIA_PIPELINE_RESULT_GET_ENDPOINT}`, {
    resultId: task.resultId,
  })
  assert.equal(registeredResult.status, 'found')
  assert.equal(registeredResult.result.outputPath, task.outputPath)

  const registeredResults = await postJSON(`${runtime.url}${MEDIA_PIPELINE_RESULT_LIST_ENDPOINT}`, {
    taskId: created.task.taskId,
  })
  assert.equal(registeredResults.count, 1)
  assert.equal(registeredResults.results[0].resultId, task.resultId)

  const logs = await postJSON(`${runtime.url}${MEDIA_PIPELINE_TASK_ACTION_ENDPOINT}`, {
    action: 'getTaskLogs',
    taskId: created.task.taskId,
    options: { projectId: 'project-1' },
  })
  assert.equal(logs.logs.status, 'ok')
  assert.ok(logs.logs.logs.some((line) => line.includes('ffmpeg')))
})

test('headless media-pipeline runtime defaults outputs inside MovScript Home media-workspaces', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'movscript-headless-home-workspace-'))
  const homeDir = join(tempDir, 'home')
  const fakeFFmpeg = join(tempDir, 'ffmpeg')
  const sourcePath = join(tempDir, 'clip.mp4')
  writeFileSync(sourcePath, 'fake source', 'utf8')
  writeFileSync(fakeFFmpeg, [
    '#!/bin/sh',
    'if [ "$1" = "-version" ]; then',
    '  echo "ffmpeg version fake-headless-home"',
    '  exit 0',
    'fi',
    'last=""',
    'for arg in "$@"; do last="$arg"; done',
    'mkdir -p "$(dirname "$last")"',
    'printf "fake home output" > "$last"',
    'exit 0',
    '',
  ].join('\n'), 'utf8')
  chmodSync(fakeFFmpeg, 0o755)

  const runtime = await startMediaPipelineService({
    runtimePort: createHeadlessMediaPipelineRuntimePort({
      env: {
        MOVSCRIPT_FFMPEG_PATH: fakeFFmpeg,
        MOVSCRIPT_HOME: homeDir,
      },
    }),
  })
  tAfterClose(runtime)

  const created = await postJSON(`${runtime.url}${MEDIA_PIPELINE_TASK_CREATE_ENDPOINT}`, {
    request: {
      projectId: 'project 1',
      taskType: 'media_transcode',
      source: {
        sourceKind: 'local_file',
        assetType: 'video',
        localPath: sourcePath,
      },
      output: {
        format: 'mp4',
        filename: 'default-home.mp4',
      },
    },
  })

  const task = await waitForTask(runtime.url, created.task.taskId, 'succeeded')
  assert.match(task.outputPath, /media-workspaces/)
  assert.match(task.outputPath, /outputs[/\\]default-home\.mp4$/)
  assert.doesNotMatch(task.outputPath, /runtime[/\\]media-pipeline/)
  assert.equal(readFileSync(task.outputPath, 'utf8'), 'fake home output')
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

async function waitForWatch(baseUrl, watchId, status) {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    const result = await postJSON(`${baseUrl}${MEDIA_PIPELINE_RESULT_WATCH_GET_ENDPOINT}`, {
      watchId,
    })
    if (result.watch?.status === status) return result.watch
    await new Promise((resolvePoll) => setTimeout(resolvePoll, 25))
  }
  throw new Error(`watch ${watchId} did not reach ${status}`)
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
