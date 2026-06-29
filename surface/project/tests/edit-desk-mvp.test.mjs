import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  buildEditDecisionHandoff,
  buildTimelineAssemblyState,
  buildWorkflowArtifactDebugView,
} from '../dist/react.js'
import { EditingServiceClient } from '../../../packages/editing/dist/index.js'
import { startEditingService } from '../../../services/editing-service/src/server.mjs'
import {
  MEDIA_PIPELINE_TASK_ACTION_ENDPOINT,
  startMediaPipelineService,
} from '../../../services/media-pipeline/src/server.mjs'
import { createHeadlessMediaPipelineRuntimePort } from '../../../services/media-pipeline/src/headlessRuntime.mjs'

test('edit desk MVP handoff renders a selected local asset through EditingService and MediaPipeline', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'movscript-edit-desk-mvp-'))
  const sourcePath = join(tempDir, 'selected-intro.mp4')
  const fakeFFmpeg = join(tempDir, 'ffmpeg')
  await writeFile(sourcePath, 'fake selected source', 'utf8')
  await writeFile(fakeFFmpeg, [
    '#!/bin/sh',
    'if [ "$1" = "-version" ]; then',
    '  echo "ffmpeg version fake-edit-desk-mvp"',
    '  exit 0',
    'fi',
    'last=""',
    'for arg in "$@"; do',
    '  last="$arg"',
    'done',
    'mkdir -p "$(dirname "$last")"',
    'printf "fake edit desk output" > "$last"',
    'exit 0',
    '',
  ].join('\n'), 'utf8')
  await chmod(fakeFFmpeg, 0o755)

  const editingHomeDir = join(tempDir, 'editing-home')
  const editingRuntime = await startEditingService({ homeDir: editingHomeDir })
  const mediaPipelineRuntime = await startMediaPipelineService({
    runtimePort: createHeadlessMediaPipelineRuntimePort({
      env: {
        MOVSCRIPT_FFMPEG_PATH: fakeFFmpeg,
        MOVSCRIPT_MEDIA_PIPELINE_WORK_DIR: join(tempDir, 'media-tasks'),
      },
    }),
  })

  try {
    const readModel = selectedLocalAssetReadModel(sourcePath)
    const debugView = buildWorkflowArtifactDebugView({ readModel })
    const assembly = buildTimelineAssemblyState({
      debugView,
      productionId: 'mvp-production',
      targetRef: 'timeline_assembly:production:mvp-production',
      focusLabel: 'production: mvp-production',
    })
    const handoff = buildEditDecisionHandoff(assembly, debugView, 'edit-desk-mvp-project')

    assert.equal(handoff.validation.ok, true)
    assert.equal(handoff.compile_manifest.status, 'ready')
    assert.equal(handoff.openmontage.asset_manifest.assets[0].localPath, sourcePath)
    assert.equal(handoff.openmontage.asset_manifest.assets[0].path, sourcePath)
    assert.equal(handoff.video_compose_request.tool, 'editing_video_compose')
    assert.equal(handoff.video_compose_request.render_runtime, 'movscript_media_pipeline')
    assert.deepEqual(handoff.backend_options.map((option) => option.backend), ['media_editing_project', 'hyperframes', 'remotion'])
    assert.equal(handoff.backend_options.every((option) => option.fallback_policy === 'no_implicit_fallback'), true)
    assert.equal(handoff.finishing_projects.media_editing_project.status, 'ready')
    assert.equal(handoff.finishing_projects.hyperframes.finishing_project.entrypoint, 'index.html')
    assert.equal(handoff.finishing_projects.remotion.finishing_project.entrypoint, 'src/Root.tsx')

    const editingService = new EditingServiceClient({ baseUrl: editingRuntime.url })
    const created = await editingService.projectCommand({
      command: 'createProjectFromEditDecisions',
      input: {
        ...handoff.video_compose_request,
        projectId: 'edit-desk-mvp-project',
        editDecisions: handoff.openmontage.edit_decisions,
        assetManifest: handoff.openmontage.asset_manifest,
      },
    })
    const createdProject = created.result.editing_project
    assert.equal(created.result.status, 'ok')
    assert.equal(created.result.compile_manifest.status, 'ready')
    assert.equal(createdProject.timeline.tracks[0].clips[0].asset.localPath, sourcePath)

    const saved = await editingService.projectCommand({
      command: 'saveProject',
      input: { editingProject: createdProject },
    })
    const savedProject = saved.result.editingProject ?? saved.result.editing_project
    const validation = await editingService.projectCommand({
      command: 'validateTimeline',
      input: { editingProject: savedProject },
    })
    assert.equal(validation.result.valid, true)

    const taskRequest = await editingService.taskRequest({
      taskType: 'timeline_render',
      input: {
        ...handoff.video_compose_request,
        projectId: 'edit-desk-mvp-project',
        editingProject: savedProject,
        output: {
          format: 'mp4',
          filename: 'edit-desk-mvp.mp4',
        },
      },
    })
    const createdTask = await postJSON(`${mediaPipelineRuntime.url}/v1/media-pipeline/task/create`, {
      request: taskRequest.request,
    })
    const completedTask = await waitForTask(mediaPipelineRuntime.url, createdTask.task.taskId, 'succeeded')
    assert.equal(completedTask.status, 'succeeded')
    assert.equal(completedTask.taskType, 'timeline_render')
    assert.equal(completedTask.outputName, 'edit-desk-mvp.mp4')
    assert.equal(await readFile(completedTask.outputPath, 'utf8'), 'fake edit desk output')

    const taskAction = await editingService.taskAction({
      action: 'getTask',
      input: {
        projectId: 'edit-desk-mvp-project',
        taskId: createdTask.task.taskId,
      },
    })
    const taskFromHandoffGateway = await postJSON(`${mediaPipelineRuntime.url}${MEDIA_PIPELINE_TASK_ACTION_ENDPOINT}`, taskAction.request)
    assert.equal(taskFromHandoffGateway.task.status, 'succeeded')
    assert.equal(taskFromHandoffGateway.task.outputPath, completedTask.outputPath)
  } finally {
    await mediaPipelineRuntime.close()
    await editingRuntime.close()
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('edit desk MVP handoff renders a selected resource_id asset through MediaPipeline resource download', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'movscript-edit-desk-resource-mvp-'))
  const fakeFFmpeg = join(tempDir, 'ffmpeg')
  const resourceCacheDir = join(tempDir, 'resource-cache')
  const resourceRequests = []
  await writeFile(fakeFFmpeg, [
    '#!/bin/sh',
    'if [ "$1" = "-version" ]; then',
    '  echo "ffmpeg version fake-edit-desk-resource-mvp"',
    '  exit 0',
    'fi',
    'last=""',
    'for arg in "$@"; do',
    '  last="$arg"',
    'done',
    'mkdir -p "$(dirname "$last")"',
    'printf "fake edit desk resource output" > "$last"',
    'exit 0',
    '',
  ].join('\n'), 'utf8')
  await chmod(fakeFFmpeg, 0o755)

  const resourceServer = await startTestResourceServer((request, response) => {
    resourceRequests.push(request.url)
    if (request.url === '/api/v1/resources/701/file') {
      response.writeHead(200, {
        'content-type': 'video/mp4',
        'content-length': String(Buffer.byteLength('downloaded selected resource')),
      })
      response.end('downloaded selected resource')
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'not_found' }))
  })
  const editingRuntime = await startEditingService({ homeDir: join(tempDir, 'editing-home') })
  const mediaPipelineRuntime = await startMediaPipelineService({
    runtimePort: createHeadlessMediaPipelineRuntimePort({
      env: {
        MOVSCRIPT_FFMPEG_PATH: fakeFFmpeg,
        MOVSCRIPT_MEDIA_PIPELINE_WORK_DIR: join(tempDir, 'media-tasks'),
      },
    }),
  })

  try {
    const readModel = selectedResourceOnlyReadModel()
    const debugView = buildWorkflowArtifactDebugView({ readModel })
    const assembly = buildTimelineAssemblyState({
      debugView,
      productionId: 'mvp-production',
      targetRef: 'timeline_assembly:production:mvp-production',
      focusLabel: 'production: mvp-production',
    })
    const handoff = buildEditDecisionHandoff(assembly, debugView, 'edit-desk-resource-only-project')

    assert.equal(handoff.validation.ok, true)
    assert.equal(handoff.validation.blockerCount, 0)
    assert.equal(handoff.validation.warningCount, 0)
    assert.equal(handoff.validation.infoCount, 1)
    assert.equal(handoff.openmontage.asset_manifest.assets[0].resource_id, 701)
    assert.equal(handoff.openmontage.asset_manifest.assets[0].localPath, undefined)
    assert.ok(handoff.validation.issues.some((issue) => issue.code === 'selected_asset_runtime_resolution_required'))

    const editingService = new EditingServiceClient({ baseUrl: editingRuntime.url })
    const created = await editingService.projectCommand({
      command: 'createProjectFromEditDecisions',
      input: {
        ...handoff.video_compose_request,
        projectId: 'edit-desk-resource-only-project',
        editDecisions: handoff.openmontage.edit_decisions,
        assetManifest: handoff.openmontage.asset_manifest,
      },
    })
    const createdProject = created.result.editing_project
    assert.equal(created.result.status, 'ok')
    assert.equal(created.result.compile_manifest.status, 'ready')
    assert.equal(createdProject.timeline.tracks[0].clips[0].asset.resourceId, 701)
    assert.equal(createdProject.timeline.tracks[0].clips[0].asset.localPath, undefined)

    const saved = await editingService.projectCommand({
      command: 'saveProject',
      input: { editingProject: createdProject },
    })
    const savedProject = saved.result.editingProject ?? saved.result.editing_project
    const validation = await editingService.projectCommand({
      command: 'validateTimeline',
      input: { editingProject: savedProject },
    })
    assert.equal(validation.result.valid, true)

    const taskRequest = await editingService.taskRequest({
      taskType: 'timeline_render',
      input: {
        ...handoff.video_compose_request,
        projectId: 'edit-desk-resource-only-project',
        editingProject: savedProject,
        resourceDownload: {
          baseUrl: resourceServer.url,
          cacheDir: resourceCacheDir,
          extension: 'mp4',
        },
        output: {
          format: 'mp4',
          filename: 'edit-desk-resource-mvp.mp4',
        },
      },
    })
    const createdTask = await postJSON(`${mediaPipelineRuntime.url}/v1/media-pipeline/task/create`, {
      request: taskRequest.request,
    })
    const completedTask = await waitForTask(mediaPipelineRuntime.url, createdTask.task.taskId, 'succeeded', 'edit-desk-resource-only-project')
    assert.equal(completedTask.status, 'succeeded')
    assert.equal(completedTask.sourceResourceId, 701)
    assert.equal(completedTask.sourceDownloaded, true)
    assert.deepEqual(resourceRequests, ['/api/v1/resources/701/file'])
    assert.equal(await readFile(join(resourceCacheDir, 'resource-701.mp4'), 'utf8'), 'downloaded selected resource')
    assert.equal(await readFile(completedTask.outputPath, 'utf8'), 'fake edit desk resource output')
  } finally {
    await mediaPipelineRuntime.close()
    await editingRuntime.close()
    await resourceServer.close()
    await rm(tempDir, { recursive: true, force: true })
  }
})

function selectedLocalAssetReadModel(sourcePath) {
  return {
    projectReadModel: {
      schema: 'movscript.project-read-model.v1',
      contentUnits: [{
        id: 'cu_intro_video',
        title: 'Intro selected clip',
        output_kind: 'video',
        candidate_count: 1,
        candidate_ids: ['cand_intro_selected'],
        selected_candidate: 'cand_intro_selected',
        selected_resource: '701',
        scene_moment_id: 'scene_intro',
        expression_unit_id: 'expr_intro_video',
        target_ref: 'timeline_assembly:production:mvp-production',
        local_path: sourcePath,
        duration_seconds: 1.25,
        selection: {
          candidate_id: 'cand_intro_selected',
          resource_id: 701,
          resource: {
            local_path: sourcePath,
          },
        },
      }],
      projectTimelineStatus: {
        timeline_namespaces: [{
          id: 'mvp-production',
          kind: 'production',
          title: 'MVP Production',
          path: 'timeline/production/mvp-production',
        }],
      },
    },
  }
}

function selectedResourceOnlyReadModel() {
  return {
    projectReadModel: {
      schema: 'movscript.project-read-model.v1',
      contentUnits: [{
        id: 'cu_intro_video',
        title: 'Intro selected clip',
        output_kind: 'video',
        candidate_count: 1,
        candidate_ids: ['cand_intro_selected'],
        selected_candidate: 'cand_intro_selected',
        selected_resource: '701',
        scene_moment_id: 'scene_intro',
        expression_unit_id: 'expr_intro_video',
        target_ref: 'timeline_assembly:production:mvp-production',
        duration_seconds: 1.25,
        selection: {
          candidate_id: 'cand_intro_selected',
          resource_id: 701,
        },
      }],
      projectTimelineStatus: {
        timeline_namespaces: [{
          id: 'mvp-production',
          kind: 'production',
          title: 'MVP Production',
          path: 'timeline/production/mvp-production',
        }],
      },
    },
  }
}

async function postJSON(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.message ?? data?.error ?? `HTTP ${response.status}`)
  return data
}

async function waitForTask(baseUrl, taskId, status, projectId = 'edit-desk-mvp-project') {
  let latest
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await postJSON(`${baseUrl}${MEDIA_PIPELINE_TASK_ACTION_ENDPOINT}`, {
      action: 'getTask',
      taskId,
      options: { projectId },
    })
    latest = response.task
    if (latest?.status === status) return latest
    if (latest?.status === 'failed' || latest?.status === 'canceled') break
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`expected task ${taskId} to reach ${status}; latest=${JSON.stringify(latest)}`)
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
