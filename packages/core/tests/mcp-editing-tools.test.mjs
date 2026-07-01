import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { handleJSONRPC } from '../dist/mcp/node/index.js'
import { startEditingService } from '../../../services/editing-service/src/server.mjs'
import {
  MEDIA_PIPELINE_TASK_ACTION_ENDPOINT,
  startMediaPipelineService,
} from '../../../services/media-pipeline/src/server.mjs'
import { createHeadlessMediaPipelineRuntimePort } from '../../../services/media-pipeline/src/headlessRuntime.mjs'

let editingServiceRuntime
let editingServiceHomeDir
let previousEditingServiceURL

test.before(async () => {
  previousEditingServiceURL = process.env.MOVSCRIPT_EDITING_SERVICE_URL
  editingServiceHomeDir = await mkdtemp(join(tmpdir(), 'movscript-core-editing-tools-'))
  editingServiceRuntime = await startEditingService({ homeDir: editingServiceHomeDir })
  process.env.MOVSCRIPT_EDITING_SERVICE_URL = editingServiceRuntime.url
})

test.after(async () => {
  if (editingServiceRuntime) await editingServiceRuntime.close()
  if (editingServiceHomeDir) await rm(editingServiceHomeDir, { recursive: true, force: true })
  if (previousEditingServiceURL === undefined) {
    delete process.env.MOVSCRIPT_EDITING_SERVICE_URL
  } else {
    process.env.MOVSCRIPT_EDITING_SERVICE_URL = previousEditingServiceURL
  }
})

async function callTool(name, args, id = name) {
  const response = await handleJSONRPC({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name,
      arguments: args,
    },
  })
  assert.equal(response?.error, undefined, response?.error?.message)
  return response.result.data
}

async function callToolResponse(name, args, id = name) {
  return handleJSONRPC({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name,
      arguments: args,
    },
  })
}

async function postJSON(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.message ?? data?.error ?? `HTTP ${response.status}`)
  }
  return data
}

async function waitForMediaPipelineTask(baseUrl, taskId, status) {
  let latest
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await postJSON(`${baseUrl}${MEDIA_PIPELINE_TASK_ACTION_ENDPOINT}`, {
      action: 'getTask',
      taskId,
      options: { projectId: 'project-tools-mvp' },
    })
    latest = response.task
    if (latest?.status === status) return latest
    if (latest?.status === 'failed' || latest?.status === 'canceled') break
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`expected task ${taskId} to reach ${status}; latest=${JSON.stringify(latest)}`)
}

async function waitForMcpResultWatch(watchId, status) {
  let latest
  for (let attempt = 0; attempt < 80; attempt += 1) {
    latest = await callTool('editing_result_watch_get', { watchId })
    if (latest.watch?.status === status) return latest.watch
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`watch ${watchId} did not reach ${status}; latest=${JSON.stringify(latest)}`)
}

test('MCP editing project and timeline tools apply pure MediaEditingProject edits', async () => {
  const created = await callTool('editing_project_create', {
    projectId: 'project-tools',
    title: 'Tool cut',
    width: 1920,
    height: 1080,
    fps: 24,
  })
  assert.equal(created.status, 'ok')
  let project = created.editing_project
  assert.equal(project.projectId, 'project-tools')
  assert.equal(project.timeline.tracks.length, 0)

  const updatedSettings = await callTool('editing_project_update_settings', {
    editing_project: project,
    title: 'Tool cut widescreen',
    width: 1280,
    height: 720,
    fps: 30,
    background: '#111111',
    workspace: {
      workspaceId: 'electron-workspace-tools',
      rootPath: '/tmp/movscript/media-workspaces/project-tools',
    },
  })
  assert.equal(updatedSettings.status, 'ok')
  project = updatedSettings.editing_project
  assert.equal(project.title, 'Tool cut widescreen')
  assert.equal(project.timeline.width, 1280)
  assert.equal(project.timeline.height, 720)
  assert.equal(project.timeline.fps, 30)
  assert.equal(project.timeline.background, '#111111')
  assert.equal(project.workspace.workspaceId, 'electron-workspace-tools')

  const addedAsset = await callTool('editing_project_add_asset', {
    editing_project: project,
    asset: {
      id: 'asset_intro',
      sourceKind: 'local_file',
      assetType: 'video',
      localPath: '/tmp/intro.mp4',
      mimeType: 'video/mp4',
    },
  })
  assert.equal(addedAsset.status, 'ok')
  assert.equal(addedAsset.asset.id, 'asset_intro')
  project = addedAsset.editing_project
  assert.equal(project.assets.assets.length, 1)

  const addedRawResourceAsset = await callTool('editing_project_add_asset', {
    editing_project: project,
    asset: {
      id: 'asset_library_clip',
      sourceKind: 'raw_resource',
      assetType: 'video',
      resourceId: 42,
      mimeType: 'video/mp4',
      label: 'Library clip',
    },
  })
  assert.equal(addedRawResourceAsset.status, 'ok')
  assert.equal(addedRawResourceAsset.asset.sourceKind, 'raw_resource')
  assert.equal(addedRawResourceAsset.asset.resourceId, 42)
  project = addedRawResourceAsset.editing_project
  assert.equal(project.assets.assets.length, 2)

  const addedUnusedAsset = await callTool('editing_project_add_asset', {
    editing_project: project,
    asset: {
      id: 'asset_unused_audio',
      sourceKind: 'local_file',
      assetType: 'audio',
      localPath: '/tmp/unused.wav',
      mimeType: 'audio/wav',
    },
  })
  assert.equal(addedUnusedAsset.status, 'ok')
  project = addedUnusedAsset.editing_project
  assert.equal(project.assets.assets.length, 3)

  const removedUnusedAsset = await callTool('editing_project_remove_asset', {
    editing_project: project,
    assetId: 'asset_unused_audio',
  })
  assert.equal(removedUnusedAsset.status, 'ok')
  project = removedUnusedAsset.editing_project
  assert.deepEqual(project.assets.assets.map((asset) => asset.id), ['asset_intro', 'asset_library_clip'])

  const addedTrack = await callTool('editing_timeline_add_track', {
    editing_project: project,
    trackId: 'track_main',
    type: 'video',
    zIndex: 0,
  })
  assert.equal(addedTrack.status, 'ok')
  project = addedTrack.editing_project
  assert.equal(project.timeline.tracks[0].id, 'track_main')

  const addedClip = await callTool('editing_timeline_add_clip', {
    editing_project: project,
    trackId: 'track_main',
    clip: {
      id: 'clip_intro',
      assetType: 'video',
      assetId: 'asset_intro',
      timelineStartMs: 0,
      durationMs: 4000,
      sourceStartMs: 500,
      sourceEndMs: 4500,
      fit: 'cover',
    },
  })
  assert.equal(addedClip.status, 'ok')
  assert.equal(addedClip.clip_id, 'clip_intro')
  project = addedClip.editing_project
  assert.equal(project.timeline.durationMs, 4000)

  const updatedClip = await callTool('editing_timeline_update_clip', {
    editing_project: project,
    clipId: 'clip_intro',
    patch: {
      durationMs: 3000,
      fit: 'contain',
      volume: 0.75,
    },
  })
  assert.equal(updatedClip.status, 'ok')
  assert.equal(updatedClip.clip.durationMs, 3000)
  assert.equal(updatedClip.clip.fit, 'contain')
  project = updatedClip.editing_project

  const splitClip = await callTool('editing_timeline_split_clip', {
    editing_project: project,
    clipId: 'clip_intro',
    splitTimeMs: 1000,
  })
  assert.equal(splitClip.status, 'ok')
  assert.deepEqual(splitClip.clips.map((clip) => clip.id), ['clip_intro', 'clip_intro_right_1'])
  project = splitClip.editing_project

  const overlayTrack = await callTool('editing_timeline_add_track', {
    editing_project: project,
    track: {
      id: 'track_overlay',
      type: 'video',
      zIndex: 10,
      clips: [],
    },
  })
  project = overlayTrack.editing_project

  const movedClip = await callTool('editing_timeline_move_clip', {
    editing_project: project,
    clipId: 'clip_intro_right_1',
    targetTrackId: 'track_overlay',
    timelineStartMs: 1500,
  })
  assert.equal(movedClip.status, 'ok')
  assert.equal(movedClip.clip.timelineStartMs, 1500)
  project = movedClip.editing_project
  assert.equal(project.timeline.tracks.find((track) => track.id === 'track_overlay').clips.length, 1)

  const deletedClip = await callTool('editing_timeline_delete_clip', {
    editing_project: project,
    clipId: 'clip_intro',
  })
  assert.equal(deletedClip.status, 'ok')
  project = deletedClip.editing_project
  assert.equal(project.timeline.tracks.find((track) => track.id === 'track_main').clips.length, 0)

  const validation = await callTool('editing_timeline_validate', { editing_project: project })
  assert.equal(validation.status, 'ok')
  assert.equal(validation.valid, true)

  const localExport = await callTool('editing_export_save_local', { outputPath: '/tmp/final-cut.mp4' })
  assert.equal(localExport.status, 'ok')
  assert.equal(localExport.output_path, '/tmp/final-cut.mp4')
  assert.equal(localExport.uploaded, false)
  assert.equal(localExport.candidate_created, false)
})

test('MCP editing video compose requires an explicit MediaEditingProject and preserves runtime blockers', async () => {
  const editingProject = sampleEditingProject()

  const legacyHandoff = await callToolResponse('editing_video_compose', {
    projectId: 'project-tools',
    render_runtime: 'ffmpeg',
    edit_decisions: { cuts: [] },
    asset_manifest: { assets: [] },
  })
  assert.equal(legacyHandoff?.result, undefined)
  assert.match(legacyHandoff?.error?.message ?? '', /no longer accepts editDecisions\/assetManifest/)

  const missingProject = await callToolResponse('editing_video_compose', {
    projectId: 'project-tools',
    render_runtime: 'ffmpeg',
  })
  assert.equal(missingProject?.result, undefined)
  assert.match(missingProject?.error?.message ?? '', /editingProject or editingProjectId is required/)

  const unsupportedRuntime = await callTool('editing_video_compose', {
    projectId: 'project-tools',
    render_runtime: 'hyperframes',
    editing_project: editingProject,
  })
  assert.equal(unsupportedRuntime.status, 'unsupported_runtime')
  assert.equal(unsupportedRuntime.render_runtime, 'hyperframes')
  assert.match(unsupportedRuntime.message, /no silent fallback/)

  const compose = await callTool('editing_video_compose', {
    projectId: 'project-tools',
    render_runtime: 'ffmpeg',
    editing_project: editingProject,
    output: { format: 'mp4' },
  })
  assert.ok(['ok', 'unsupported_runtime'].includes(compose.status))
  if (compose.status === 'unsupported_runtime') {
    assert.equal(compose.code, 'ELECTRON_EDITING_RUNTIME_REQUIRED')
  } else {
    assert.equal(compose.task.taskType, 'timeline_render')
  }
  assert.equal(compose.render_runtime, 'ffmpeg')
  assert.equal(compose.editing_project.source.kind, 'manual')
  assert.notEqual(compose.editing_project.source.targetKind, 'timeline_assembly')
  assert.equal(compose.compile_manifest, undefined)
  assert.equal(compose.compile_result, undefined)
  assert.equal(compose.editing_project.timeline.metadata.compileManifestId, undefined)
  assert.equal(compose.validation.valid, true)
  assert.equal(compose.candidate_created, false)
})

test('MCP editing video compose renders an explicit MediaEditingProject with local assets through MediaPipeline', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'movscript-core-video-compose-'))
  const fakeFFmpeg = join(tempDir, 'ffmpeg')
  const sourcePath = join(tempDir, 'clip.mp4')
  await writeFile(sourcePath, 'fake source', 'utf8')
  await writeFile(fakeFFmpeg, [
    '#!/bin/sh',
    'if [ "$1" = "-version" ]; then',
    '  echo "ffmpeg version fake-core-video-compose"',
    '  exit 0',
    'fi',
    'last=""',
    'for arg in "$@"; do',
    '  last="$arg"',
    'done',
    'mkdir -p "$(dirname "$last")"',
    'printf "fake composed output" > "$last"',
    'exit 0',
    '',
  ].join('\n'), 'utf8')
  await chmod(fakeFFmpeg, 0o755)

  const runtime = await startMediaPipelineService({
    runtimePort: createHeadlessMediaPipelineRuntimePort({
      env: {
        MOVSCRIPT_FFMPEG_PATH: fakeFFmpeg,
        MOVSCRIPT_MEDIA_PIPELINE_WORK_DIR: join(tempDir, 'tasks'),
      },
    }),
  })
  const previousMediaPipelineURL = process.env.MOVSCRIPT_MEDIA_PIPELINE_URL
  const previousMediaPipelineBaseURL = process.env.MOVSCRIPT_MEDIA_PIPELINE_BASE_URL
  process.env.MOVSCRIPT_MEDIA_PIPELINE_URL = runtime.url
  delete process.env.MOVSCRIPT_MEDIA_PIPELINE_BASE_URL

  try {
    const editingProject = sampleLocalEditingProject(sourcePath)
    const compose = await callTool('editing_video_compose', {
      projectId: 'project-tools-mvp',
      render_runtime: 'ffmpeg',
      editing_project: editingProject,
      output: {
        format: 'mp4',
        filename: 'timeline-mvp.mp4',
      },
    })

    assert.equal(compose.status, 'ok')
    assert.equal(compose.render_runtime, 'ffmpeg')
    assert.equal(compose.render_runtime_used, 'movscript_media_pipeline_ffmpeg')
    assert.equal(compose.task.taskType, 'timeline_render')
    assert.equal(compose.compile_manifest, undefined)
    assert.equal(compose.compile_result, undefined)
    assert.equal(compose.validation.valid, true)
    assert.equal(compose.editing_project.timeline.tracks[0].clips[0].asset.localPath, sourcePath)
    assert.equal(compose.render_report.task_id, compose.task.taskId)
    assert.equal(compose.render_report.candidate_created, false)

    const completedTask = await waitForMediaPipelineTask(runtime.url, compose.task.taskId, 'succeeded')
    assert.equal(completedTask.taskType, 'timeline_render')
    assert.equal(completedTask.outputName, 'timeline-mvp.mp4')
    assert.match(completedTask.outputPath, /timeline-mvp\.mp4$/)
    assert.equal(await readFile(completedTask.outputPath, 'utf8'), 'fake composed output')

    const taskFromTool = await callTool('editing_task_get', {
      projectId: 'project-tools-mvp',
      taskId: compose.task.taskId,
    })
    assert.equal(taskFromTool.task.status, 'succeeded')
    assert.equal(taskFromTool.task.outputPath, completedTask.outputPath)

    const resultFromTool = await callTool('editing_result_get', {
      resultId: completedTask.resultId,
    })
    assert.equal(resultFromTool.status, 'found')
    assert.equal(resultFromTool.result.taskId, compose.task.taskId)
    assert.equal(resultFromTool.result.backend, 'media_editing_project')
    assert.equal(resultFromTool.result.outputPath, completedTask.outputPath)

    const listedResults = await callTool('editing_result_list', {
      projectId: 'project-tools-mvp',
      backend: 'media_editing_project',
    })
    assert.equal(listedResults.status, 'ok')
    assert.equal(listedResults.count, 1)
    assert.equal(listedResults.results[0].resultId, completedTask.resultId)

    const localExportFromResult = await callTool('editing_export_save_local', {
      resultId: completedTask.resultId,
    })
    assert.equal(localExportFromResult.status, 'ok')
    assert.equal(localExportFromResult.output_path, completedTask.outputPath)
    assert.equal(localExportFromResult.result_id, completedTask.resultId)
    assert.equal(localExportFromResult.uploaded, false)
    assert.equal(localExportFromResult.candidate_created, false)

    const exchangeDirectory = join(tempDir, 'exchange')
    const exchangeProjectPath = join(exchangeDirectory, 'movscript-edit.fcpxml')
    await mkdir(exchangeDirectory, { recursive: true })
    await writeFile(exchangeProjectPath, '<fcpxml version="1.11" />\n', 'utf8')
    const openedExternalNle = await callTool('editing_external_nle_open', {
      exchangeProjectPath,
      externalApp: 'final_cut_pro',
      dryRun: true,
      platform: 'darwin',
    })
    assert.equal(openedExternalNle.schema, 'movscript.editing.external_nle.open_result.v1')
    assert.equal(openedExternalNle.status, 'planned')
    assert.equal(openedExternalNle.opened, false)
    assert.equal(openedExternalNle.dry_run, true)
    assert.equal(openedExternalNle.exchange_project_path, exchangeProjectPath)
    assert.equal(openedExternalNle.app_name, 'Final Cut Pro')
    assert.deepEqual(openedExternalNle.command, {
      executable: 'open',
      argv: ['-a', 'Final Cut Pro', exchangeProjectPath],
    })
    assert.equal(openedExternalNle.candidate_created, false)

    const registeredExternalResult = await callTool('editing_result_register', {
      resultId: 'external-nle-mcp-result',
      projectId: 'project-tools-mvp',
      taskId: 'external-nle-task',
      backend: 'external_nle',
      kind: 'fcpxml',
      outputPath: '/tmp/external-nle.fcpxml',
    })
    assert.equal(registeredExternalResult.status, 'registered')
    assert.equal(registeredExternalResult.result.backend, 'external_nle')
    assert.equal(registeredExternalResult.result.outputPath, '/tmp/external-nle.fcpxml')

    const externalNleDir = join(tempDir, 'external-nle-output')
    const externalNleOutputPath = join(externalNleDir, 'editor-final.mov')
    await mkdir(externalNleDir, { recursive: true })
    await writeFile(externalNleOutputPath, 'fake external nle output', 'utf8')
    const recoveredExternalResult = await callTool('editing_result_recover_external_nle', {
      projectId: 'project-tools-mvp',
      resultId: 'external-nle-recovered-mcp',
      outputDirectory: externalNleDir,
      exchangeProjectPath: join(tempDir, 'exchange', 'movscript-edit.fcpxml'),
      externalApp: 'final_cut_pro',
      reviewer: 'editor',
      reviewStatus: 'approved',
    })
    assert.equal(recoveredExternalResult.status, 'registered')
    assert.equal(recoveredExternalResult.recovered, true)
    assert.equal(recoveredExternalResult.candidate_created, false)
    assert.equal(recoveredExternalResult.result.resultId, 'external-nle-recovered-mcp')
    assert.equal(recoveredExternalResult.result.backend, 'external_nle')
    assert.equal(recoveredExternalResult.result.kind, 'mov')
    assert.equal(recoveredExternalResult.result.outputKind, 'video')
    assert.equal(recoveredExternalResult.result.outputPath, externalNleOutputPath)
    assert.equal(recoveredExternalResult.result.source, 'external_nle_result_recovery')
    assert.equal(recoveredExternalResult.result.provenance.external_app, 'final_cut_pro')
    assert.equal(recoveredExternalResult.result.provenance.review_status, 'approved')

    const recoveredExternalResultFromRegistry = await callTool('editing_result_get', {
      resultId: 'external-nle-recovered-mcp',
    })
    assert.equal(recoveredExternalResultFromRegistry.status, 'found')
    assert.equal(recoveredExternalResultFromRegistry.result.outputPath, externalNleOutputPath)

    const externalNleHlsDir = join(tempDir, 'external-nle-hls')
    const externalNleManifestPath = join(externalNleHlsDir, 'index.m3u8')
    const externalNleSegmentPath = join(externalNleHlsDir, 'segment0.ts')
    await mkdir(externalNleHlsDir, { recursive: true })
    await writeFile(externalNleManifestPath, '#EXTM3U\n#EXTINF:1,\nsegment0.ts\n', 'utf8')
    await writeFile(externalNleSegmentPath, 'fake external nle segment', 'utf8')
    const recoveredExternalHlsResult = await callTool('editing_result_recover_external_nle', {
      projectId: 'project-tools-mvp',
      resultId: 'external-nle-hls-recovered-mcp',
      outputDirectory: externalNleHlsDir,
      externalApp: 'davinci_resolve',
      reviewStatus: 'approved',
    })
    assert.equal(recoveredExternalHlsResult.status, 'registered')
    assert.equal(recoveredExternalHlsResult.result.backend, 'external_nle')
    assert.equal(recoveredExternalHlsResult.result.kind, 'hls')
    assert.equal(recoveredExternalHlsResult.result.outputKind, 'hls_stream')
    assert.equal(recoveredExternalHlsResult.result.hlsManifestPath, externalNleManifestPath)
    assert.equal(recoveredExternalHlsResult.result.hlsDirectory, externalNleHlsDir)
    assert.deepEqual(recoveredExternalHlsResult.result.hlsSegmentPaths, [externalNleSegmentPath])

    const externalNleWatchDir = join(tempDir, 'external-nle-watch')
    const externalNleWatchOutputPath = join(externalNleWatchDir, 'editor-background-final.mov')
    await mkdir(externalNleWatchDir, { recursive: true })
    const watchCreated = await callTool('editing_result_watch_external_nle_create', {
      projectId: 'project-tools-mvp',
      watchId: 'external-nle-watch-mcp',
      resultId: 'external-nle-background-watch-mcp',
      outputDirectory: externalNleWatchDir,
      pollIntervalMs: 25,
      timeoutMs: 3000,
      externalApp: 'premiere',
      reviewStatus: 'approved',
    })
    assert.equal(watchCreated.status, 'watching')
    assert.equal(watchCreated.watch.watchId, 'external-nle-watch-mcp')
    assert.equal(watchCreated.watch.status, 'watching')
    setTimeout(() => {
      writeFile(externalNleWatchOutputPath, 'fake external nle background output', 'utf8').catch(() => {})
    }, 100)

    const completedWatch = await waitForMcpResultWatch('external-nle-watch-mcp', 'succeeded')
    assert.equal(completedWatch.resultId, 'external-nle-background-watch-mcp')
    assert.equal(completedWatch.result.backend, 'external_nle')
    assert.equal(completedWatch.result.source, 'external_nle_background_watch')
    assert.equal(completedWatch.result.outputPath, externalNleWatchOutputPath)
    assert.equal(completedWatch.result.provenance.recovery, 'background_watch')
    assert.equal(completedWatch.result.provenance.external_app, 'premiere')

    const backgroundWatchResultFromRegistry = await callTool('editing_result_get', {
      resultId: 'external-nle-background-watch-mcp',
    })
    assert.equal(backgroundWatchResultFromRegistry.status, 'found')
    assert.equal(backgroundWatchResultFromRegistry.result.outputPath, externalNleWatchOutputPath)

    const listedWatches = await callTool('editing_result_watch_list', {
      projectId: 'project-tools-mvp',
      status: 'succeeded',
    })
    assert.equal(listedWatches.status, 'ok')
    assert.ok(listedWatches.watches.some((watch) => watch.watchId === 'external-nle-watch-mcp'))
  } finally {
    if (previousMediaPipelineURL === undefined) {
      delete process.env.MOVSCRIPT_MEDIA_PIPELINE_URL
    } else {
      process.env.MOVSCRIPT_MEDIA_PIPELINE_URL = previousMediaPipelineURL
    }
    if (previousMediaPipelineBaseURL === undefined) {
      delete process.env.MOVSCRIPT_MEDIA_PIPELINE_BASE_URL
    } else {
      process.env.MOVSCRIPT_MEDIA_PIPELINE_BASE_URL = previousMediaPipelineBaseURL
    }
    await runtime.close()
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('MCP editing timeline validation reports structural timeline diagnostics', async () => {
  const project = {
    version: 1,
    id: 'editing_project_invalid',
    projectId: 'project-tools',
    title: 'Invalid cut',
    source: { kind: 'manual' },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    revision: 1,
    assets: {
      assets: [{
        id: 'asset_audio',
        sourceKind: 'local_file',
        assetType: 'audio',
        localPath: '/tmp/audio.wav',
        mimeType: 'audio/wav',
      }],
    },
    timeline: {
      version: 1,
      id: 'timeline_invalid',
      fps: 30,
      width: 1920,
      height: 1080,
      background: '#000000',
      durationMs: 2000,
      tracks: [
        {
          id: 'track_main',
          type: 'video',
          zIndex: 0,
          clips: [
            {
              id: 'clip_a',
              assetType: 'video',
              asset: {
                id: 'asset_missing',
                sourceKind: 'local_file',
                assetType: 'video',
                localPath: '/tmp/missing.mp4',
              },
              timelineStartMs: 0,
              durationMs: 1000,
              sourceStartMs: 900,
              sourceEndMs: 100,
            },
            {
              id: 'clip_b',
              assetType: 'image',
              timelineStartMs: 500,
              durationMs: 1000,
            },
          ],
        },
        {
          id: 'track_main',
          type: 'audio',
          zIndex: 1,
          clips: [{
            id: 'clip_a',
            assetType: 'video',
            asset: {
              id: 'asset_audio',
              sourceKind: 'local_file',
              assetType: 'audio',
              localPath: '/tmp/audio.wav',
            },
            timelineStartMs: -10,
            durationMs: 0,
          }],
        },
        {
          id: 'track_subtitles',
          type: 'subtitle',
          zIndex: 2,
          clips: [{
            id: 'clip_subtitle',
            assetType: 'subtitle',
            timelineStartMs: 0,
            durationMs: 1000,
          }],
        },
      ],
    },
  }

  const validation = await callTool('editing_timeline_validate', { editing_project: project })
  assert.equal(validation.status, 'diagnostics')
  assert.equal(validation.valid, false)
  const codes = validation.diagnostics.map((diagnostic) => diagnostic.code)
  assert.ok(codes.includes('duplicate_track_id'))
  assert.ok(codes.includes('duplicate_clip_id'))
  assert.ok(codes.includes('invalid_duration'))
  assert.ok(codes.includes('invalid_timeline_start'))
  assert.ok(codes.includes('invalid_source_range'))
  assert.ok(codes.includes('asset_not_registered'))
  assert.ok(codes.includes('asset_type_mismatch'))
  assert.ok(codes.includes('track_clip_type_mismatch'))
  assert.ok(codes.includes('clip_overlap'))
  assert.ok(codes.includes('subtitle_reference_missing'))
})

function sampleEditingProject(options = {}) {
  const projectId = options.projectId ?? 'project-tools'
  const sourcePath = options.sourcePath ?? '/tmp/intro.mp4'
  const durationMs = options.durationMs ?? 3000
  const asset = {
    id: 'clip_intro',
    sourceKind: 'local_file',
    assetType: 'video',
    localPath: sourcePath,
    mimeType: 'video/mp4',
    label: 'Intro',
  }
  return {
    version: 1,
    id: options.id ?? 'editing_project_compose_ready',
    projectId,
    title: options.title ?? 'Ready cut',
    source: { kind: 'manual' },
    assets: { assets: [asset] },
    timeline: {
      version: 1,
      id: options.timelineId ?? 'timeline_compose_ready',
      fps: 30,
      width: 1920,
      height: 1080,
      background: '#000000',
      durationMs,
      metadata: {},
      tracks: [{
        id: 'track_main',
        type: 'video',
        zIndex: 0,
        clips: [{
          id: 'clip_intro',
          assetType: 'video',
          assetId: asset.id,
          asset,
          timelineStartMs: 0,
          durationMs,
          sourceStartMs: 0,
          sourceEndMs: durationMs,
          fit: 'cover',
        }],
      }],
    },
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
    revision: 1,
  }
}

function sampleLocalEditingProject(sourcePath) {
  return sampleEditingProject({
    projectId: 'project-tools-mvp',
    id: 'editing_project_local_compose',
    timelineId: 'timeline_local_compose',
    title: 'Local compose',
    sourcePath,
    durationMs: 1250,
  })
}

test('MCP editing tools reject malformed MediaEditingProject envelopes before mutation', async () => {
  const response = await callToolResponse('editing_timeline_add_track', {
    editing_project: {
      version: 1,
      id: 'editing_project_bad',
      projectId: 'project-tools',
      title: 'Bad cut',
      source: { kind: 'manual' },
      timeline: {
        version: 1,
        id: 'timeline_bad',
        fps: 30,
        width: 1920,
        height: 1080,
        background: '#000000',
      },
      assets: { assets: [] },
    },
    trackId: 'track_main',
    type: 'video',
  })

  assert.equal(response?.result, undefined)
  assert.match(response?.error?.message ?? '', /editingProject\.timeline must be a MediaTimelineRecipe v1 object/)
})

test('MCP editing tools reject non-canonical MediaEditingProject asset registries', async () => {
  const missingAssets = await callToolResponse('editing_timeline_add_track', {
    editing_project: {
      version: 1,
      id: 'editing_project_no_assets',
      projectId: 'project-tools',
      title: 'No assets cut',
      source: { kind: 'manual' },
      timeline: {
        version: 1,
        id: 'timeline_no_assets',
        fps: 30,
        width: 1920,
        height: 1080,
        background: '#000000',
        tracks: [],
      },
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-17T00:00:00.000Z',
      revision: 1,
    },
    trackId: 'track_main',
    type: 'video',
  })
  assert.equal(missingAssets?.result, undefined)
  assert.match(missingAssets?.error?.message ?? '', /editingProject\.assets must contain an assets array/)

  const baseProject = {
    version: 1,
    id: 'editing_project_legacy_assets',
    projectId: 'project-tools',
    title: 'Legacy assets cut',
    source: { kind: 'manual' },
    timeline: {
      version: 1,
      id: 'timeline_legacy_assets',
      fps: 30,
      width: 1920,
      height: 1080,
      background: '#000000',
      tracks: [],
    },
    createdAt: '2026-06-17T00:00:00.000Z',
    updatedAt: '2026-06-17T00:00:00.000Z',
    revision: 1,
  }

  const arrayAssets = await callToolResponse('editing_timeline_add_track', {
    editing_project: {
      ...baseProject,
      assets: [{
        id: 'asset_intro',
        sourceKind: 'local_file',
        assetType: 'video',
        localPath: '/tmp/intro.mp4',
      }],
    },
    trackId: 'track_main',
    type: 'video',
  })
  assert.equal(arrayAssets?.result, undefined)
  assert.match(arrayAssets?.error?.message ?? '', /editingProject\.assets must contain an assets array/)

  const emptyObjectAssets = await callToolResponse('editing_timeline_add_track', {
    editing_project: {
      ...baseProject,
      id: 'editing_project_empty_assets_object',
      assets: {},
    },
    trackId: 'track_empty_assets',
    type: 'audio',
  })
  assert.equal(emptyObjectAssets?.result, undefined)
  assert.match(emptyObjectAssets?.error?.message ?? '', /editingProject\.assets must contain an assets array/)
})

test('MCP editing export candidate creation is explicit domain state, not an Electron runtime task', async () => {
  const hlsResponse = await callToolResponse('editing_export_create_candidate', {
    contentUnitId: 'cu_final_hls',
    streamId: 41,
    candidateId: 'cand_final_hls',
    taskId: 'task_hls_1',
  })
  assert.equal(hlsResponse?.result, undefined)
  assert.match(hlsResponse?.error?.message ?? '', /projectDir or cwd is required/)
  assert.doesNotMatch(hlsResponse?.error?.message ?? '', /HLS_STREAM_CANDIDATE_UNSUPPORTED/)
  assert.doesNotMatch(hlsResponse?.error?.message ?? '', /ELECTRON_EDITING_RUNTIME_REQUIRED/)

  const response = await callToolResponse('editing_export_create_candidate', {
    contentUnitId: 'cu_final_cut',
    resourceId: 42,
    candidateId: 'cand_final_cut',
    taskId: 'task_render_1',
    editingProjectId: 'editing_project_1',
  })

  assert.equal(response?.result?.data?.code, undefined)
  assert.notEqual(response?.result?.data?.code, 'ELECTRON_EDITING_RUNTIME_REQUIRED')
  assert.match(response?.error?.message ?? '', /projectDir or cwd is required/)
})
