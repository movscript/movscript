import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import test from 'node:test'
import { setMovScriptBackendAPIBaseURL } from '@movscript/core/backend/node'

import {
  cancelMediaPipelineTask,
  createMediaPipelineTask,
  deleteMediaPipelineEditingProject,
  getMediaPipelineCapabilities,
  getMediaPipelineEditingProject,
  getMediaPipelineTask,
  getMediaPipelineTaskLogs,
  getStoredMediaPipelineTask,
  listMediaPipelineEditingProjects,
  onMediaPipelineEditingProjectEvent,
  onMediaPipelineTaskEvent,
  parseFFmpegProgressTimeMs,
  saveMediaPipelineEditingProject,
} from './mediaPipeline'
import { cleanupMediaResourceCache, materializeMediaPipelineAsset } from './mediaPipeline/assetMaterializer'
import {
  importMediaPipelineExportResource,
  publishMediaPipelineHlsStream,
  saveMediaPipelineExportLocal,
  uploadMediaPipelineExportResource,
} from './mediaPipeline/exportUploader'
import {
  buildAudioMixArgs,
  buildCaptionFilter,
  buildMediaHlsMasterManifest,
  buildMediaHlsPackageArgs,
  buildMediaHlsVariantPackageArgs,
  buildMediaReframeFilter,
  buildMediaTranscodeArgs,
  buildOverlayArgs,
  buildTimelineSegmentArgs,
  mediaHlsVariantBandwidth,
} from './mediaPipeline/ffmpegGraph'
import { packageMediaPipelineHls } from './mediaPipeline/hlsPackager'
import {
  createMediaPipelineLocalHlsURL,
  readMediaPipelineLocalHlsResponse,
  registerMediaPipelineLocalHlsRoot,
  resolveMediaPipelineLocalHlsPath,
} from './mediaPipeline/localHlsProtocol'
import { normalizeReframeMode, resolveReframeTarget } from './mediaPipeline/reframer'
import {
  resolveMediaPipelineSubtitleCaptionRenderer,
  resolveMediaPipelineSubtitleFileFormat,
} from './mediaPipeline/subtitleRenderer'
import { mediaPipelineTimelineToVideoExportInput } from './mediaPipeline/timelineRenderer'
import type { MediaPipelineEditingProjectEvent } from './mediaPipeline/types'
import { prepareMediaWorkspace } from './mediaPipeline/workspace'

test('prepares isolated media workspace directories for a project task', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-workspace-'))
  try {
    const workspace = await prepareMediaWorkspace({
      userDataDir,
      projectId: 'project:with spaces',
      taskId: 'timeline/render 1',
    })

    assert.match(basename(workspace.projectRoot), /^project_with_spaces--[a-f0-9]{10}$/)
    assert.match(basename(workspace.taskRoot), /^timeline_render_1--[a-f0-9]{10}$/)

    for (const path of [
      workspace.cacheResources,
      workspace.cacheProbes,
      workspace.taskInputs,
      workspace.taskTemp,
      workspace.taskOutputs,
      workspace.taskLogs,
      workspace.exportsRoot,
    ]) {
      assert.equal((await stat(path)).isDirectory(), true)
    }
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('media workspace path parts remain distinct after readable id sanitization', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-workspace-collision-'))
  try {
    const first = await prepareMediaWorkspace({
      userDataDir,
      projectId: 'project/a:b',
      taskId: 'render/task:1',
    })
    const second = await prepareMediaWorkspace({
      userDataDir,
      projectId: 'project:a/b',
      taskId: 'render:task/1',
    })

    assert.notEqual(first.projectRoot, second.projectRoot)
    assert.notEqual(first.taskRoot, second.taskRoot)
    assert.match(basename(first.projectRoot), /^project_a_b--[a-f0-9]{10}$/)
    assert.match(basename(second.projectRoot), /^project_a_b--[a-f0-9]{10}$/)
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('reports media pipeline capabilities without starting an editing task', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-capabilities-'))
  const originalFFmpegPath = process.env.FFMPEG_PATH
  try {
    process.env.FFMPEG_PATH = await writeFakeMediaPipelineFFmpeg(userDataDir)

    const capabilities = await getMediaPipelineCapabilities()

    assert.equal(capabilities.status, 'ok')
    assert.equal(capabilities.runtime, 'electron_media_pipeline')
    assert.equal(capabilities.available, true)
    assert.equal(capabilities.ffmpeg.available, true)
    assert.equal(capabilities.ffmpeg.path, process.env.FFMPEG_PATH)
    assert.equal(capabilities.ffmpeg.version, 'ffmpeg fake')
    assert.deepEqual(capabilities.supported_task_types, ['timeline_render', 'timeline_hls', 'media_transcode', 'media_reframe'])
    assert.deepEqual(capabilities.supported_outputs, ['mp4', 'hls'])
    assert.equal(capabilities.local_hls_preview, true)
    assert.equal(capabilities.project_store, true)
  } finally {
    if (originalFFmpegPath === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = originalFFmpegPath
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('local HLS protocol maps only registered media workspace files and rewrites manifest URIs', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-hls-protocol-'))
  try {
    const workspace = await prepareMediaWorkspace({
      userDataDir,
      projectId: 'project-1',
      taskId: 'timeline_hls_1',
    })
    registerMediaPipelineLocalHlsRoot(userDataDir)
    const hlsDir = join(workspace.taskOutputs, 'hls')
    await mkdir(hlsDir, { recursive: true })
    await writeFile(join(hlsDir, 'index.m3u8'), '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:1,\nsegment-00000.m4s\n')
    await writeFile(join(hlsDir, 'init.mp4'), 'init')
    await writeFile(join(hlsDir, 'segment-00000.m4s'), 'segment')

    const manifestUrl = createMediaPipelineLocalHlsURL(join(hlsDir, 'index.m3u8'))
    assert.match(manifestUrl, /^movscript-media:\/\/hls\//)
    assert.equal(resolveMediaPipelineLocalHlsPath(manifestUrl), join(hlsDir, 'index.m3u8'))

    const response = await readMediaPipelineLocalHlsResponse(manifestUrl)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'application/vnd.apple.mpegurl')
    const rewritten = await response.text()
    assert.match(rewritten, /URI="movscript-media:\/\/hls\//)
    assert.match(rewritten, /movscript-media:\/\/hls\/[^\n]+segment-00000\.m4s/)

    const outsideUrl = createMediaPipelineLocalHlsURL(join(tmpdir(), 'outside.m3u8'))
    assert.equal(resolveMediaPipelineLocalHlsPath(outsideUrl), null)
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('persists and reads media editing projects from the Electron media workspace', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-project-store-'))
  try {
    const editingProject = {
      version: 1 as const,
      id: 'editing project:main',
      projectId: 'project:with spaces',
      title: 'Stored cut',
      source: { kind: 'manual' },
      timeline: {
        version: 1 as const,
        id: 'timeline-main',
        fps: 30,
        width: 1080,
        height: 1920,
        background: '#000000',
        tracks: [],
      },
      assets: { assets: [] },
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-17T00:00:00.000Z',
      revision: 1,
    }

    const saved = await saveMediaPipelineEditingProject(editingProject, { userDataDir })
    assert.equal(saved.status, 'ok')
    assert.equal(saved.editingProject.projectId, 'standalone')
    assert.match(saved.projectPath, /media-workspaces\/standalone--[a-f0-9]{10}\/projects\/editing_project_main--[a-f0-9]{10}\.json$/)
    const persisted = JSON.parse(await readFile(saved.projectPath, 'utf8')) as { schema: string; editingProject: { id: string; projectId: string } }
    assert.equal(persisted.schema, 'movscript.media_editing_project.v1')
    assert.equal(persisted.editingProject.id, editingProject.id)
    assert.equal(persisted.editingProject.projectId, 'standalone')

    const loaded = await getMediaPipelineEditingProject({
      editingProjectId: editingProject.id,
    }, { userDataDir })
    assert.equal(loaded.status, 'ok')
    assert.equal(loaded.editingProject.id, editingProject.id)
    assert.equal(loaded.editingProject.projectId, 'standalone')

    const missing = await getMediaPipelineEditingProject({
      editingProjectId: 'missing',
    }, { userDataDir })
    assert.equal(missing.status, 'not_found')
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('emits media editing project events after successful project saves', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-project-events-'))
  const events: MediaPipelineEditingProjectEvent[] = []
  const unsubscribe = onMediaPipelineEditingProjectEvent((event) => {
    events.push(event)
  })
  try {
    const editingProject = {
      version: 1 as const,
      id: 'editing-project-events',
      projectId: 'project-events',
      title: 'Evented cut',
      source: { kind: 'manual' },
      timeline: {
        version: 1 as const,
        id: 'timeline-events',
        fps: 30,
        width: 1080,
        height: 1920,
        background: '#000000',
        tracks: [],
      },
      assets: { assets: [] },
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-17T00:00:00.000Z',
      revision: 1,
    }

    const saved = await saveMediaPipelineEditingProject(editingProject, { userDataDir })

    assert.equal(saved.status, 'ok')
    assert.equal(events.length, 1)
    assert.equal(events[0].type, 'saved')
    assert.equal(events[0].projectId, 'standalone')
    assert.equal(events[0].editingProjectId, editingProject.id)
    assert.equal(events[0].revision, 1)
    assert.equal(events[0].editingProject.title, editingProject.title)
    assert.equal(events[0].editingProject.projectId, 'standalone')
    assert.equal(events[0].projectPath, saved.projectPath)
  } finally {
    unsubscribe()
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('rejects stale media editing project saves with an optimistic revision conflict', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-project-conflict-'))
  try {
    const editingProject = {
      version: 1 as const,
      id: 'editing-project-conflict',
      projectId: 'project-conflict',
      title: 'Stored cut',
      source: { kind: 'manual' },
      timeline: {
        version: 1 as const,
        id: 'timeline-conflict',
        fps: 30,
        width: 1080,
        height: 1920,
        background: '#000000',
        tracks: [],
      },
      assets: { assets: [] },
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-17T00:00:00.000Z',
      revision: 1,
    }
    const saved = await saveMediaPipelineEditingProject(editingProject, { userDataDir })
    assert.equal(saved.status, 'ok')

    const staleSave = await saveMediaPipelineEditingProject({
      ...editingProject,
      title: 'Stale overwrite',
      revision: 2,
    }, { userDataDir, expectedRevision: 0 })

    assert.equal(staleSave.status, 'conflict')
    assert.equal(staleSave.code, 'EDITING_PROJECT_REVISION_CONFLICT')
    assert.equal(staleSave.projectId, 'standalone')
    assert.equal(staleSave.expectedRevision, 0)
    assert.equal(staleSave.currentRevision, 1)
    assert.equal(staleSave.editingProject.title, 'Stored cut')

    const loaded = await getMediaPipelineEditingProject({
      editingProjectId: editingProject.id,
    }, { userDataDir })
    assert.equal(loaded.status, 'ok')
    assert.equal(loaded.editingProject.title, 'Stored cut')
    assert.equal(loaded.editingProject.revision, 1)
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('media project store paths remain distinct for ids with the same readable sanitized prefix', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-project-store-collision-'))
  try {
    const baseProject = {
      version: 1 as const,
      title: 'Stored cut',
      source: { kind: 'manual' },
      timeline: {
        version: 1 as const,
        id: 'timeline-main',
        fps: 30,
        width: 1080,
        height: 1920,
        background: '#000000',
        tracks: [],
      },
      assets: { assets: [] },
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-17T00:00:00.000Z',
      revision: 1,
    }
    const firstProject = {
      ...baseProject,
      id: 'editing/project:main',
      projectId: 'project/a:b',
    }
    const secondProject = {
      ...baseProject,
      id: 'editing:project/main',
      projectId: 'project:a/b',
    }

    const first = await saveMediaPipelineEditingProject(firstProject, { userDataDir })
    const second = await saveMediaPipelineEditingProject(secondProject, { userDataDir })
    assert.notEqual(first.projectPath, second.projectPath)
    assert.match(basename(first.projectPath), /^editing_project_main--[a-f0-9]{10}\.json$/)
    assert.match(basename(second.projectPath), /^editing_project_main--[a-f0-9]{10}\.json$/)

    const loadedFirst = await getMediaPipelineEditingProject({
      editingProjectId: firstProject.id,
    }, { userDataDir })
    const loadedSecond = await getMediaPipelineEditingProject({
      editingProjectId: secondProject.id,
    }, { userDataDir })
    assert.equal(loadedFirst.status, 'ok')
    assert.equal(loadedFirst.editingProject.id, firstProject.id)
    assert.equal(loadedFirst.editingProject.projectId, 'standalone')
    assert.equal(loadedSecond.status, 'ok')
    assert.equal(loadedSecond.editingProject.id, secondProject.id)
    assert.equal(loadedSecond.editingProject.projectId, 'standalone')

    const listed = await listMediaPipelineEditingProjects({ userDataDir })
    assert.equal(listed.status, 'ok')
    assert.deepEqual(listed.editingProjects.map((project) => project.id).sort(), [firstProject.id, secondProject.id].sort())
    assert.deepEqual(listed.projects.map((project) => project.projectPath).sort(), [first.projectPath, second.projectPath].sort())

    const deleted = await deleteMediaPipelineEditingProject({ editingProjectId: firstProject.id }, { userDataDir })
    assert.equal(deleted.status, 'ok')
    const afterDelete = await listMediaPipelineEditingProjects({ userDataDir })
    assert.deepEqual(afterDelete.editingProjects.map((project) => project.id), [secondProject.id])
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('rejects invalid or mismatched media editing project files during restore', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-project-store-invalid-'))
  try {
    const editingProject = {
      version: 1 as const,
      id: 'editing-project-main',
      projectId: 'project-main',
      title: 'Stored cut',
      source: { kind: 'manual' },
      timeline: {
        version: 1 as const,
        id: 'timeline-main',
        fps: 30,
        width: 1920,
        height: 1080,
        background: '#000000',
        tracks: [],
      },
      assets: { assets: [] },
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-17T00:00:00.000Z',
      revision: 1,
    }

    const saved = await saveMediaPipelineEditingProject(editingProject, { userDataDir })
    await writeFile(saved.projectPath, `${JSON.stringify({
      schema: 'movscript.media_editing_project.v1',
      editingProject: {
        ...editingProject,
        id: 'other-editing-project',
      },
    }, null, 2)}\n`)
    await assert.rejects(
      () => getMediaPipelineEditingProject({
        editingProjectId: editingProject.id,
      }, { userDataDir }),
      /Media editing project identity mismatch/,
    )

    await writeFile(saved.projectPath, `${JSON.stringify({
      schema: 'movscript.media_editing_project.v1',
      editingProject: {
        ...editingProject,
        timeline: { version: 1, id: 'timeline-main' },
      },
    }, null, 2)}\n`)
    await assert.rejects(
      () => getMediaPipelineEditingProject({
        editingProjectId: editingProject.id,
      }, { userDataDir }),
      /Invalid media editing project file/,
    )
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('rejects invalid media editing projects before saving to the workspace', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-project-store-save-invalid-'))
  try {
    await assert.rejects(
      () => saveMediaPipelineEditingProject({
        version: 1,
        id: 'bad-project',
        projectId: 'project-main',
        title: 'Bad project',
        source: { kind: 'manual' },
        timeline: { version: 1, id: 'timeline-main' },
        assets: { assets: [] },
      } as never, { userDataDir }),
      /Invalid media editing project file/,
    )

    const missing = await getMediaPipelineEditingProject({
      editingProjectId: 'bad-project',
    }, { userDataDir })
    assert.equal(missing.status, 'not_found')
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('records unsupported media pipeline task requests as failed task manifests', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-pipeline-'))
  const taskEvents: Array<{ taskId: string; event: string; state?: { status?: string } }> = []
  const unsubscribe = onMediaPipelineTaskEvent((event) => {
    taskEvents.push(event as { taskId: string; event: string; state?: { status?: string } })
  })
  try {
    const initialState = await createMediaPipelineTask(
      {
        projectId: 'project-1',
        taskType: 'unsupported_task' as never,
        output: { format: 'mp4', filename: 'out.mp4' },
      },
      { userDataDir },
    )
    assert.equal(initialState.status, 'running')
    const state = await waitForTerminalTask(initialState.taskId)

    assert.equal(state.status, 'failed')
    assert.equal(state.errorCode, 'TASK_TYPE_UNSUPPORTED')
    assert.ok(state.manifestPath)
    assert.ok(state.workspacePath)

    const manifest = await waitForManifestState(state.manifestPath, 'failed') as {
      schema: string
      state: { taskId: string; status: string; errorCode?: string }
      request: { projectId: string; taskType: string }
    }
    assert.equal(manifest.schema, 'movscript.media_pipeline_task.v1')
    assert.equal(manifest.request.projectId, 'project-1')
    assert.equal(manifest.request.taskType, 'unsupported_task')
    assert.equal(manifest.state.taskId, state.taskId)
    assert.equal(manifest.state.status, 'failed')
    assert.equal(manifest.state.errorCode, 'TASK_TYPE_UNSUPPORTED')

    const logs = await getMediaPipelineTaskLogs(state.taskId)
    assert.equal(logs.status, 'ok')
    assert.ok(logs.logPath?.endsWith('events.jsonl'))
    assert.equal(logs.logs?.some((line) => line.includes('"event":"task.queued"')), true)
    assert.equal(logs.logs?.some((line) => line.includes('"event":"task.failed"')), true)
    assert.match(logs.text ?? '', /TASK_TYPE_UNSUPPORTED/)

    const relatedEvents = taskEvents.filter((event) => event.taskId === state.taskId)
    assert.equal(relatedEvents.some((event) => event.event === 'task.running' && event.state?.status === 'running'), true)
    assert.equal(relatedEvents.some((event) => event.event === 'task.failed' && event.state?.status === 'failed'), true)
  } finally {
    unsubscribe()
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('media_transcode task transcodes a source asset into MP4 output', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-transcode-task-'))
  const originalFFmpegPath = process.env.FFMPEG_PATH
  try {
    process.env.FFMPEG_PATH = await writeFakeMediaPipelineFFmpeg(userDataDir)
    const sourcePath = join(userDataDir, 'source.mov')
    await writeFile(sourcePath, new Uint8Array([4, 5, 6]))

    const initialState = await createMediaPipelineTask(
      {
        projectId: 'project-1',
        taskType: 'media_transcode',
        source: {
          id: 'asset-source',
          sourceKind: 'local_file',
          assetType: 'video',
          localPath: sourcePath,
          mimeType: 'video/quicktime',
        },
        transcode: {
          videoCodec: 'libx264',
          audioCodec: 'aac',
          videoBitrateKbps: 1200,
          audioBitrateKbps: 128,
        },
        output: { format: 'mp4', filename: 'transcoded.mp4' },
      },
      { userDataDir },
    )

    assert.equal(initialState.status, 'running')
    const state = await waitForTerminalTask(initialState.taskId)
    assert.equal(state.status, 'succeeded', `${state.errorCode ?? ''} ${state.errorMessage ?? ''}`.trim())
    assert.equal(state.outputName, 'transcoded.mp4')
    assert.ok(state.outputPath?.endsWith('/outputs/transcoded.mp4'))
    assert.equal(await readFile(state.outputPath ?? '', 'utf8'), 'mp4')

    const manifest = await waitForManifestState(state.manifestPath ?? '', 'succeeded') as {
      request: { taskType?: string; transcode?: { videoCodec?: string; audioCodec?: string; videoBitrateKbps?: number } }
      state: { outputPath?: string; outputName?: string }
    }
    assert.equal(manifest.request.taskType, 'media_transcode')
    assert.equal(manifest.request.transcode?.videoCodec, 'libx264')
    assert.equal(manifest.request.transcode?.audioCodec, 'aac')
    assert.equal(manifest.request.transcode?.videoBitrateKbps, 1200)
    assert.equal(manifest.state.outputPath, state.outputPath)

    const logs = await getMediaPipelineTaskLogs(state.taskId)
    assert.equal(logs.status, 'ok')
    assert.equal(logs.logs?.some((line) => line.includes('"event":"transcode.start"')), true)
    assert.equal(logs.logs?.some((line) => line.includes('"event":"transcode.succeeded"')), true)
    assert.match(logs.text ?? '', /"videoCodec":"libx264"/)
  } finally {
    if (originalFFmpegPath === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = originalFFmpegPath
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('media_transcode task can import MP4 output as RawResource with derivative provenance', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-transcode-import-task-'))
  const originalFFmpegPath = process.env.FFMPEG_PATH
  const originalFetch = globalThis.fetch
  setMovScriptBackendAPIBaseURL('http://media-pipeline.test')
  try {
    process.env.FFMPEG_PATH = await writeFakeMediaPipelineFFmpeg(userDataDir)
    const sourcePath = join(userDataDir, 'source.mov')
    await writeFile(sourcePath, new Uint8Array([4, 5, 6]))
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://media-pipeline.test/api/v1/resources/upload')
      assert.equal(init?.method, 'POST')
      assert.ok(init?.body instanceof FormData)
      const form = init.body as FormData
      assert.equal(form.get('folder_id'), 'exports')
      assert.deepEqual(JSON.parse(String(form.get('derivative'))), {
        operation: 'media_transcode',
        tool: 'electron_media_pipeline',
        input_resource_ids: [66],
        params: {
          project_id: 'project-1',
          task_type: 'media_transcode',
          output_format: 'mp4',
          output_filename: 'transcoded-import.mp4',
          transcode: {
            videoCodec: 'libx264',
            audioCodec: 'aac',
            videoBitrateKbps: 1200,
          },
        },
      })
      return new Response(JSON.stringify({ ID: 79, name: 'transcoded-import.mp4', type: 'video' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    }

    const initialState = await createMediaPipelineTask(
      {
        projectId: 'project-1',
        taskType: 'media_transcode',
        source: {
          id: 'asset-source-resource',
          sourceKind: 'local_file',
          assetType: 'video',
          resourceId: 66,
          localPath: sourcePath,
          mimeType: 'video/quicktime',
        },
        transcode: {
          videoCodec: 'libx264',
          audioCodec: 'aac',
          videoBitrateKbps: 1200,
        },
        output: {
          format: 'mp4',
          filename: 'transcoded-import.mp4',
          folderId: 'exports',
          importToResource: true,
        },
      },
      { userDataDir },
    )

    const state = await waitForTerminalTask(initialState.taskId)
    assert.equal(state.status, 'succeeded', `${state.errorCode ?? ''} ${state.errorMessage ?? ''}`.trim())
    assert.equal(state.outputResourceId, 79)
    assert.deepEqual(state.outputResource, { ID: 79, name: 'transcoded-import.mp4', type: 'video' })
  } finally {
    if (originalFFmpegPath === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = originalFFmpegPath
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('media_reframe task mechanically crops or pads a source into the target aspect', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-reframe-task-'))
  const originalFFmpegPath = process.env.FFMPEG_PATH
  try {
    process.env.FFMPEG_PATH = await writeFakeMediaPipelineFFmpeg(userDataDir)
    const sourcePath = join(userDataDir, 'wide.mp4')
    await writeFile(sourcePath, new Uint8Array([1, 2, 3]))

    const initialState = await createMediaPipelineTask(
      {
        projectId: 'project-1',
        taskType: 'media_reframe',
        source: {
          id: 'asset-wide',
          sourceKind: 'local_file',
          assetType: 'video',
          localPath: sourcePath,
          mimeType: 'video/mp4',
        },
        target: '9:16',
        mode: 'crop',
        reframe: {
          target: '9:16',
          mode: 'crop',
        },
        output: { format: 'mp4', filename: 'vertical.mp4' },
      },
      { userDataDir },
    )

    assert.equal(initialState.status, 'running')
    const state = await waitForTerminalTask(initialState.taskId)
    assert.equal(state.status, 'succeeded', `${state.errorCode ?? ''} ${state.errorMessage ?? ''}`.trim())
    assert.equal(state.outputName, 'vertical.mp4')
    assert.ok(state.outputPath?.endsWith('/outputs/vertical.mp4'))
    assert.equal(await readFile(state.outputPath ?? '', 'utf8'), 'mp4')

    const manifest = await waitForManifestState(state.manifestPath ?? '', 'succeeded') as {
      request: { taskType?: string; target?: string; mode?: string; reframe?: { target?: string; mode?: string } }
      state: { outputPath?: string; outputName?: string }
    }
    assert.equal(manifest.request.taskType, 'media_reframe')
    assert.equal(manifest.request.target, '9:16')
    assert.equal(manifest.request.mode, 'crop')
    assert.equal(manifest.request.reframe?.target, '9:16')
    assert.equal(manifest.state.outputPath, state.outputPath)
    assert.equal(manifest.state.outputName, 'vertical.mp4')

    const logs = await getMediaPipelineTaskLogs(state.taskId)
    assert.equal(logs.status, 'ok')
    assert.equal(logs.logs?.some((line) => line.includes('"event":"reframe.start"')), true)
    assert.equal(logs.logs?.some((line) => line.includes('"event":"reframe.succeeded"')), true)
    assert.match(logs.text ?? '', /scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920/)
  } finally {
    if (originalFFmpegPath === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = originalFFmpegPath
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('media_reframe task can import MP4 output as RawResource with derivative provenance', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-reframe-import-task-'))
  const originalFFmpegPath = process.env.FFMPEG_PATH
  const originalFetch = globalThis.fetch
  setMovScriptBackendAPIBaseURL('http://media-pipeline.test')
  try {
    process.env.FFMPEG_PATH = await writeFakeMediaPipelineFFmpeg(userDataDir)
    const sourcePath = join(userDataDir, 'wide.mp4')
    await writeFile(sourcePath, new Uint8Array([1, 2, 3]))
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://media-pipeline.test/api/v1/resources/upload')
      assert.equal(init?.method, 'POST')
      assert.ok(init?.body instanceof FormData)
      const form = init.body as FormData
      assert.equal(form.get('folder_id'), 'exports')
      assert.deepEqual(JSON.parse(String(form.get('derivative'))), {
        operation: 'media_reframe',
        tool: 'electron_media_pipeline',
        input_resource_ids: [77],
        params: {
          project_id: 'project-1',
          task_type: 'media_reframe',
          output_format: 'mp4',
          output_filename: 'vertical-import.mp4',
          reframe: {
            target: '9:16',
            mode: 'crop',
          },
        },
      })
      return new Response(JSON.stringify({ ID: 80, name: 'vertical-import.mp4', type: 'video' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    }

    const initialState = await createMediaPipelineTask(
      {
        projectId: 'project-1',
        taskType: 'media_reframe',
        source: {
          id: 'asset-wide-resource',
          sourceKind: 'local_file',
          assetType: 'video',
          resourceId: 77,
          localPath: sourcePath,
          mimeType: 'video/mp4',
        },
        target: '9:16',
        mode: 'crop',
        reframe: {
          target: '9:16',
          mode: 'crop',
        },
        output: {
          format: 'mp4',
          filename: 'vertical-import.mp4',
          folderId: 'exports',
          importToResource: true,
        },
      },
      { userDataDir },
    )

    const state = await waitForTerminalTask(initialState.taskId)
    assert.equal(state.status, 'succeeded', `${state.errorCode ?? ''} ${state.errorMessage ?? ''}`.trim())
    assert.equal(state.outputResourceId, 80)
    assert.deepEqual(state.outputResource, { ID: 80, name: 'vertical-import.mp4', type: 'video' })
  } finally {
    if (originalFFmpegPath === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = originalFFmpegPath
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('reframe target and mode helpers normalize supported mechanical outputs', () => {
  assert.deepEqual(resolveReframeTarget(undefined, '16:9'), { width: 1920, height: 1080, label: '16:9' })
  assert.deepEqual(resolveReframeTarget({ width: 720, height: 1280 }, undefined), { width: 720, height: 1280, label: '720x1280' })
  assert.equal(normalizeReframeMode('pad'), 'contain')
  assert.equal(normalizeReframeMode('cover'), 'crop')
  assert.equal(normalizeReframeMode('stretch'), 'stretch')
  assert.throws(() => resolveReframeTarget(undefined, 'cinema'), /REFRAME_TARGET_UNSUPPORTED/)
  assert.throws(() => normalizeReframeMode('smart'), /REFRAME_MODE_UNSUPPORTED/)
})

test('mediaPipeline ffmpeg graph builders keep deterministic transcode and reframe args', () => {
  assert.deepEqual(buildMediaTranscodeArgs({
    sourcePath: '/tmp/in.mov',
    outputPath: '/tmp/out.mp4',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    videoBitrateKbps: 1200,
    audioBitrateKbps: 128,
  }), [
    '-y',
    '-hide_banner',
    '-i', '/tmp/in.mov',
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-b:v', '1200k',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '/tmp/out.mp4',
  ])
  assert.equal(
    buildMediaReframeFilter({ width: 1080, height: 1920, mode: 'contain', background: '#000000' }),
    'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=#000000,setsar=1',
  )
})

test('mediaPipeline ffmpeg graph builders keep deterministic HLS args and manifests', () => {
  assert.deepEqual(buildMediaHlsPackageArgs({
    sourceMp4Path: '/tmp/source.mp4',
    manifestPath: '/tmp/hls/index.m3u8',
    segmentPattern: '/tmp/hls/segment-%05d.m4s',
    segmentDurationSec: 6,
  }), [
    '-y',
    '-i', '/tmp/source.mp4',
    '-c:v', 'copy',
    '-c:a', 'copy',
    '-f', 'hls',
    '-hls_time', '6',
    '-hls_playlist_type', 'vod',
    '-hls_segment_type', 'fmp4',
    '-hls_fmp4_init_filename', 'init.mp4',
    '-hls_segment_filename', '/tmp/hls/segment-%05d.m4s',
    '/tmp/hls/index.m3u8',
  ])
  assert.deepEqual(buildMediaHlsVariantPackageArgs({
    sourceMp4Path: '/tmp/source.mp4',
    manifestPath: '/tmp/hls/360p.m3u8',
    segmentPattern: '/tmp/hls/360p-segment-%05d.m4s',
    initName: '360p-init.mp4',
    segmentDurationSec: 4,
    variant: { width: 640, height: 360, videoBitrateKbps: 900 },
  }), [
    '-y',
    '-i', '/tmp/source.mp4',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-b:v', '900k',
    '-maxrate', '1035k',
    '-bufsize', '1800k',
    '-vf', 'scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-f', 'hls',
    '-hls_time', '4',
    '-hls_playlist_type', 'vod',
    '-hls_segment_type', 'fmp4',
    '-hls_fmp4_init_filename', '360p-init.mp4',
    '-hls_segment_filename', '/tmp/hls/360p-segment-%05d.m4s',
    '/tmp/hls/360p.m3u8',
  ])
  assert.equal(mediaHlsVariantBandwidth({ width: 640, height: 360, videoBitrateKbps: 900 }), 1028000)
  assert.equal(buildMediaHlsMasterManifest([{
    manifestName: '360p.m3u8',
    width: 640,
    height: 360,
    bandwidth: 1028000,
  }]), '#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-STREAM-INF:BANDWIDTH=1028000,RESOLUTION=640x360\n360p.m3u8\n')
})

test('mediaPipeline ffmpeg graph owns timeline segment, overlay, caption, and audio builders', () => {
  assert.deepEqual(buildTimelineSegmentArgs({
    sourcePath: '/tmp/source.mp4',
    startMs: 250,
    endMs: 1750,
    volume: 60,
    mode: 'accurate',
  }, '/tmp/segment.mp4', 1500), [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', '/tmp/source.mp4',
    '-ss', '0.250',
    '-t', '1.500',
    '-map', '0:v:0',
    '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-movflags', '+faststart',
    '-map', '0:a?',
    '-filter:a', 'volume=0.60',
    '-c:a', 'aac',
    '-b:a', '128k',
    '/tmp/segment.mp4',
  ])
  assert.equal(buildCaptionFilter([{
    startMs: 0,
    endMs: 1000,
    text: 'Hello: world',
    renderer: 'drawtext',
  }]), "drawtext=text='Hello\\: world':x=(w-text_w)/2:y=h*0.88-text_h/2:fontsize=42:fontcolor=white:borderw=3:bordercolor=black@0.85:box=1:boxcolor=black@0.35:boxborderw=18:enable='between(t\\,0.000\\,1.000)'")
  assert.deepEqual(buildOverlayArgs('/tmp/base.mp4', ['/tmp/logo.png'], '/tmp/out.mp4', [{
    sourcePath: '/tmp/logo.png',
    sourceKind: 'image',
    startMs: 200,
    endMs: 800,
    xPercent: 25,
    yPercent: 75,
    opacityPercent: 50,
  }]), [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', '/tmp/base.mp4',
    '-loop', '1',
    '-i', '/tmp/logo.png',
    '-filter_complex', '[1:v]scale=iw*1.000:ih*1.000,format=rgba,colorchannelmixer=aa=0.500[ov0];[0:v][ov0]overlay=x=W*0.250-w/2:y=H*0.750-h/2:enable=\'between(t\\,0.200\\,0.800)\'[vout]',
    '-map', '[vout]',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    '/tmp/out.mp4',
  ])
  assert.deepEqual(buildAudioMixArgs('/tmp/video.mp4', ['/tmp/music.wav'], '/tmp/out.mp4', [{
    sourcePath: '/tmp/music.wav',
    startMs: 100,
    endMs: 1100,
    timelineStartMs: 500,
    volume: 80,
  }]), [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', '/tmp/video.mp4',
    '-i', '/tmp/music.wav',
    '-filter_complex', '[1:a]atrim=start=0.100:duration=1.000,asetpts=PTS-STARTPTS,volume=0.80,adelay=500|500[a0];[a0]amix=inputs=1:duration=longest:dropout_transition=0[aout]',
    '-map', '0:v:0',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-shortest',
    '-movflags', '+faststart',
    '/tmp/out.mp4',
  ])
})

test('mediaPipeline subtitle renderer resolves text and file burn-in settings', () => {
  assert.equal(resolveMediaPipelineSubtitleCaptionRenderer({
    id: 'caption-1',
    assetType: 'text',
    timelineStartMs: 0,
    durationMs: 1000,
    subtitle: { renderer: 'libass' },
  }), 'ass')
  assert.equal(resolveMediaPipelineSubtitleCaptionRenderer({
    id: 'caption-2',
    assetType: 'text',
    timelineStartMs: 0,
    durationMs: 1000,
    subtitle: { format: 'srt' },
  }), 'drawtext')
  assert.equal(resolveMediaPipelineSubtitleFileFormat({
    id: 'subtitle-1',
    assetType: 'subtitle',
    timelineStartMs: 0,
    durationMs: 1000,
    asset: {
      id: 'asset-subtitle',
      sourceKind: 'local_file',
      assetType: 'subtitle',
      label: 'fallback.vtt',
    },
  }, '/tmp/subtitle.srt'), 'srt')
  assert.equal(resolveMediaPipelineSubtitleFileFormat({
    id: 'subtitle-2',
    assetType: 'subtitle',
    timelineStartMs: 0,
    durationMs: 1000,
    subtitle: { format: 'ssa' },
  }, '/tmp/subtitle.srt'), 'ssa')
})

test('mediaPipeline timeline renderer materializes timeline recipes into export inputs', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-timeline-input-'))
  try {
    const videoPath = join(userDataDir, 'clip.mp4')
    const overlayVideoPath = join(userDataDir, 'overlay-video.mp4')
    const audioPath = join(userDataDir, 'music.m4a')
    const imagePath = join(userDataDir, 'overlay.png')
    const subtitlePath = join(userDataDir, 'captions.ass')
    await writeFile(videoPath, new Uint8Array([1]))
    await writeFile(overlayVideoPath, new Uint8Array([5]))
    await writeFile(audioPath, new Uint8Array([2]))
    await writeFile(imagePath, new Uint8Array([3]))
    await writeFile(subtitlePath, 'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Hello')

    const workspace = await prepareMediaWorkspace({ userDataDir, projectId: 'project-1', taskId: 'task-1' })
    const exportInput = await mediaPipelineTimelineToVideoExportInput({
      version: 1,
      id: 'timeline-1',
      fps: 30,
      width: 1280,
      height: 720,
      background: '#000000',
      tracks: [{
        id: 'video-track',
        type: 'video',
        zIndex: 0,
        clips: [{
          id: 'video-clip',
          assetType: 'video',
          timelineStartMs: 100,
          durationMs: 900,
          sourceStartMs: 200,
          sourceEndMs: 1100,
          volume: 0.8,
          asset: {
            id: 'asset-video',
            sourceKind: 'local_file',
            assetType: 'video',
            localPath: videoPath,
            label: 'clip.mp4',
          },
        }],
      }, {
        id: 'video-overlay-track',
        type: 'video',
        zIndex: 5,
        clips: [{
          id: 'video-overlay-clip',
          assetType: 'video',
          timelineStartMs: 400,
          durationMs: 300,
          sourceStartMs: 100,
          sourceEndMs: 400,
          volume: 0.75,
          muted: false,
          speed: 1.5,
          fadeInMs: 50,
          scale: 0.5,
          crop: { leftPercent: 5, topPercent: 10 },
          asset: {
            id: 'asset-overlay-video',
            sourceKind: 'local_file',
            assetType: 'video',
            localPath: overlayVideoPath,
            label: 'overlay-video.mp4',
          },
        }],
      }, {
        id: 'audio-track',
        type: 'audio',
        zIndex: 1,
        clips: [{
          id: 'audio-clip',
          assetType: 'audio',
          timelineStartMs: 0,
          durationMs: 1000,
          volume: 0.5,
          asset: {
            id: 'asset-audio',
            sourceKind: 'local_file',
            assetType: 'audio',
            localPath: audioPath,
            label: 'music.m4a',
          },
        }],
      }, {
        id: 'text-track',
        type: 'subtitle',
        zIndex: 2,
        clips: [{
          id: 'text-clip',
          assetType: 'text',
          timelineStartMs: 250,
          durationMs: 500,
          text: { content: 'Hello', fontSize: 28, backgroundOpacity: 0.25, position: 'bottom' },
          subtitle: { renderer: 'libass', style: { content: 'Styled hello', color: '#ffffff' } },
        }],
      }, {
        id: 'subtitle-track',
        type: 'subtitle',
        zIndex: 3,
        clips: [{
          id: 'subtitle-clip',
          assetType: 'subtitle',
          timelineStartMs: 0,
          durationMs: 1000,
          subtitle: { format: 'ass', burnIn: true },
          asset: {
            id: 'asset-subtitle',
            sourceKind: 'local_file',
            assetType: 'subtitle',
            localPath: subtitlePath,
            label: 'captions.ass',
          },
        }],
      }, {
        id: 'overlay-track',
        type: 'image',
        zIndex: 4,
        clips: [{
          id: 'image-clip',
          assetType: 'image',
          timelineStartMs: 300,
          durationMs: 400,
          opacity: 0.6,
          asset: {
            id: 'asset-image',
            sourceKind: 'local_file',
            assetType: 'image',
            localPath: imagePath,
            label: 'overlay.png',
          },
        }],
      }],
    }, workspace, {})

    assert.deepEqual(exportInput.clips, [{
      sourcePath: videoPath,
      sourceName: 'clip.mp4',
      startMs: 200,
      endMs: 1100,
      timelineStartMs: 100,
      layerIndex: 0,
      volume: 80,
      muted: undefined,
    }])
    assert.deepEqual(exportInput.audioClips, [{
      sourcePath: audioPath,
      sourceName: 'music.m4a',
      startMs: 0,
      endMs: 1000,
      timelineStartMs: 0,
      volume: 50,
    }])
    assert.deepEqual(exportInput.captions, [{
      startMs: 250,
      endMs: 750,
      text: 'Styled hello',
      layerIndex: 2,
      fontSize: 28,
      fontFamily: undefined,
      yPercent: 88,
      textColor: '#ffffff',
      backgroundColor: undefined,
      boxOpacityPercent: 25,
      align: undefined,
      renderer: 'ass',
    }])
    assert.deepEqual(exportInput.subtitleFiles, [{
      sourcePath: subtitlePath,
      sourceName: 'captions.ass',
      format: 'ass',
    }])
    assert.deepEqual(exportInput.overlays, [{
      sourcePath: imagePath,
      sourceName: 'overlay.png',
      sourceKind: 'image',
      startMs: 300,
      endMs: 700,
      layerIndex: 4,
      opacityPercent: 60,
    }, {
      sourcePath: overlayVideoPath,
      sourceName: 'overlay-video.mp4',
      sourceKind: 'video',
      startMs: 400,
      endMs: 700,
      sourceStartMs: 100,
      sourceEndMs: 400,
      layerIndex: 5,
      volume: 75,
      muted: false,
      speed: 1.5,
      fadeInMs: 50,
      cropLeftPercent: 5,
      cropTopPercent: 10,
      scalePercent: 50,
    }])
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('materializes local files by validating and returning their original path', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-local-asset-'))
  try {
    const sourcePath = join(userDataDir, 'source.mp4')
    await writeFile(sourcePath, 'video-bytes')
    const workspace = await prepareMediaWorkspace({ userDataDir, projectId: 'project-1', taskId: 'task-1' })
    const materialized = await materializeMediaPipelineAsset({
      workspace,
      asset: {
        id: 'asset-local',
        sourceKind: 'local_file',
        assetType: 'video',
        localPath: sourcePath,
        mimeType: 'video/mp4',
      },
    })

    assert.equal(materialized.path, sourcePath)
    assert.equal(materialized.cached, false)
    assert.equal(materialized.sizeBytes, 'video-bytes'.length)
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('materializes backend resources into the media workspace cache', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-backend-asset-'))
  const originalFetch = globalThis.fetch
  let requestCount = 0
  setMovScriptBackendAPIBaseURL('http://media-pipeline.test')
  try {
    globalThis.fetch = async (input) => {
      requestCount += 1
      assert.equal(String(input), 'http://media-pipeline.test/api/v1/resources/42/file')
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      })
    }

    const workspace = await prepareMediaWorkspace({ userDataDir, projectId: 'project-1', taskId: 'task-1' })
    const asset = {
      id: 'asset-backend',
      sourceKind: 'backend_resource' as const,
      assetType: 'video' as const,
      resourceId: 42,
      mimeType: 'video/mp4',
      checksum: 'checksum-1',
    }

    const first = await materializeMediaPipelineAsset({ workspace, asset })
    const second = await materializeMediaPipelineAsset({ workspace, asset })

    assert.equal(requestCount, 1)
    assert.equal(first.cached, false)
    assert.equal(second.cached, true)
    assert.equal(first.path, second.path)
    assert.equal(first.path.startsWith(workspace.cacheResources), true)
    assert.deepEqual([...(await readFile(first.path))], [1, 2, 3, 4])
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('reports backend resource download progress while materializing assets', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-backend-progress-'))
  const originalFetch = globalThis.fetch
  const progressEvents: Array<{ receivedBytes: number; totalBytes?: number; done: boolean; attempt: number; resourceId: number }> = []
  setMovScriptBackendAPIBaseURL('http://media-pipeline.test')
  try {
    globalThis.fetch = async (input) => {
      assert.equal(String(input), 'http://media-pipeline.test/api/v1/resources/48/file')
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]))
          controller.enqueue(new Uint8Array([3, 4]))
          controller.close()
        },
      }), {
        status: 200,
        headers: {
          'content-type': 'video/mp4',
          'content-length': '4',
        },
      })
    }

    const workspace = await prepareMediaWorkspace({ userDataDir, projectId: 'project-1', taskId: 'task-1' })
    const materialized = await materializeMediaPipelineAsset({
      workspace,
      options: {
        resourceDownload: {
          onProgress: (progress) => progressEvents.push({
            receivedBytes: progress.receivedBytes,
            totalBytes: progress.totalBytes,
            done: progress.done,
            attempt: progress.attempt,
            resourceId: progress.resourceId,
          }),
        },
      },
      asset: {
        id: 'asset-download-progress',
        sourceKind: 'backend_resource',
        assetType: 'video',
        resourceId: 48,
        mimeType: 'video/mp4',
      },
    })

    assert.deepEqual([...(await readFile(materialized.path))], [1, 2, 3, 4])
    assert.deepEqual(progressEvents, [
      { receivedBytes: 2, totalBytes: 4, done: false, attempt: 1, resourceId: 48 },
      { receivedBytes: 4, totalBytes: 4, done: false, attempt: 1, resourceId: 48 },
      { receivedBytes: 4, totalBytes: 4, done: true, attempt: 1, resourceId: 48 },
    ])
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('resource version changes invalidate backend resource cache identity', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-backend-versioned-asset-'))
  const originalFetch = globalThis.fetch
  let requestCount = 0
  setMovScriptBackendAPIBaseURL('http://media-pipeline.test')
  try {
    globalThis.fetch = async (input) => {
      requestCount += 1
      assert.equal(String(input), 'http://media-pipeline.test/api/v1/resources/44/file')
      return new Response(new Uint8Array([requestCount]), {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      })
    }

    const workspace = await prepareMediaWorkspace({ userDataDir, projectId: 'project-1', taskId: 'task-1' })
    const first = await materializeMediaPipelineAsset({
      workspace,
      asset: {
        id: 'asset-versioned',
        sourceKind: 'backend_resource',
        assetType: 'video',
        resourceId: 44,
        resourceVersion: 'v1',
        mimeType: 'video/mp4',
      },
    })
    const second = await materializeMediaPipelineAsset({
      workspace,
      asset: {
        id: 'asset-versioned',
        sourceKind: 'backend_resource',
        assetType: 'video',
        resourceId: 44,
        resourceVersion: 'v2',
        mimeType: 'video/mp4',
      },
    })

    assert.equal(requestCount, 2)
    assert.notEqual(first.path, second.path)
    assert.deepEqual([...(await readFile(first.path))], [1])
    assert.deepEqual([...(await readFile(second.path))], [2])
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('materialize resource cache quota can be configured per task', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-backend-cache-options-'))
  const originalFetch = globalThis.fetch
  let requestCount = 0
  setMovScriptBackendAPIBaseURL('http://media-pipeline.test')
  try {
    globalThis.fetch = async (input) => {
      requestCount += 1
      assert.match(String(input), /^http:\/\/media-pipeline\.test\/api\/v1\/resources\/(45|46)\/file$/)
      return new Response(new Uint8Array([requestCount]), {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      })
    }

    const workspace = await prepareMediaWorkspace({ userDataDir, projectId: 'project-1', taskId: 'task-1' })
    const first = await materializeMediaPipelineAsset({
      workspace,
      options: { resourceCache: { maxEntries: 1 } },
      asset: {
        id: 'asset-cache-1',
        sourceKind: 'backend_resource',
        assetType: 'video',
        resourceId: 45,
        mimeType: 'video/mp4',
      },
    })
    const second = await materializeMediaPipelineAsset({
      workspace,
      options: { resourceCache: { maxEntries: 1 } },
      asset: {
        id: 'asset-cache-2',
        sourceKind: 'backend_resource',
        assetType: 'video',
        resourceId: 46,
        mimeType: 'video/mp4',
      },
    })

    assert.notEqual(first.path, second.path)
    assert.equal((await stat(second.path)).isFile(), true)
    await assert.rejects(() => stat(first.path), /ENOENT/)
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('retries transient backend resource download failures before caching materialized assets', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-backend-retry-'))
  const originalFetch = globalThis.fetch
  let requestCount = 0
  setMovScriptBackendAPIBaseURL('http://media-pipeline.test')
  try {
    globalThis.fetch = async (input) => {
      requestCount += 1
      assert.equal(String(input), 'http://media-pipeline.test/api/v1/resources/43/file')
      if (requestCount === 1) {
        return new Response('temporary backend failure', { status: 503 })
      }
      return new Response(new Uint8Array([4, 3, 2, 1]), {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      })
    }

    const workspace = await prepareMediaWorkspace({ userDataDir, projectId: 'project-1', taskId: 'task-1' })
    const materialized = await materializeMediaPipelineAsset({
      workspace,
      asset: {
        id: 'asset-backend-retry',
        sourceKind: 'backend_resource',
        assetType: 'video',
        resourceId: 43,
        checksum: 'checksum-retry',
      },
    })

    assert.equal(requestCount, 2)
    assert.equal(materialized.cached, false)
    assert.deepEqual([...(await readFile(materialized.path))], [4, 3, 2, 1])
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('materialize backend resource download attempts can be configured', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-backend-no-retry-'))
  const originalFetch = globalThis.fetch
  let requestCount = 0
  setMovScriptBackendAPIBaseURL('http://media-pipeline.test')
  try {
    globalThis.fetch = async (input) => {
      requestCount += 1
      assert.equal(String(input), 'http://media-pipeline.test/api/v1/resources/47/file')
      return new Response('temporary backend failure', { status: 503 })
    }

    const workspace = await prepareMediaWorkspace({ userDataDir, projectId: 'project-1', taskId: 'task-1' })
    await assert.rejects(
      () => materializeMediaPipelineAsset({
        workspace,
        options: { resourceDownload: { attempts: 1, retryDelayMs: 0 } },
        asset: {
          id: 'asset-no-retry',
          sourceKind: 'backend_resource',
          assetType: 'video',
          resourceId: 47,
          checksum: 'checksum-no-retry',
        },
      }),
      /ASSET_RESOURCE_BACKEND_UNAVAILABLE/,
    )
    assert.equal(requestCount, 1)
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('uploads media pipeline exports to the RawResource library', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-export-upload-'))
  const originalFetch = globalThis.fetch
  setMovScriptBackendAPIBaseURL('http://media-pipeline.test')
  try {
    const outputPath = join(userDataDir, 'render.mp4')
    await writeFile(outputPath, new Uint8Array([1, 2, 3, 4]))
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://media-pipeline.test/api/v1/resources/upload')
      assert.equal(init?.method, 'POST')
      assert.equal(init?.body instanceof FormData, true)
      const form = init?.body as FormData
      assert.equal(form.get('folder_id'), 'folder-1')
      assert.deepEqual(JSON.parse(String(form.get('derivative'))), {
        operation: 'timeline_render',
        tool: 'electron_media_pipeline',
        input_resource_ids: [11, 12],
        params: { task_id: 'task-1', editing_project_id: 'edit-1' },
      })
      const file = form.get('file')
      assert.equal(file instanceof Blob, true)
      assert.equal((file as Blob).type, 'video/mp4')
      return new Response(JSON.stringify({
        ID: 77,
        name: 'render.mp4',
        type: 'video',
        mime_type: 'video/mp4',
        url: '/api/v1/resources/77/file',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    const uploaded = await uploadMediaPipelineExportResource({
      outputPath,
      filename: 'render.mp4',
      mimeType: 'video/mp4',
      folderId: 'folder-1',
      derivative: {
        operation: 'timeline_render',
        tool: 'electron_media_pipeline',
        input_resource_ids: [11, 12],
        params: { task_id: 'task-1', editing_project_id: 'edit-1' },
      },
    })
    assert.equal(uploaded.resourceId, 77)
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('saves media pipeline exports to an explicit local file path', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-export-save-local-'))
  try {
    const outputPath = join(userDataDir, 'outputs', 'render.mp4')
    const savePath = join(userDataDir, 'saved', 'final-cut.mp4')
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, new Uint8Array([5, 6, 7, 8]))

    const saved = await saveMediaPipelineExportLocal({
      outputPath,
      savePath,
    })

    assert.equal(saved.status, 'ok')
    assert.equal(saved.outputPath, outputPath)
    assert.equal(saved.savePath, savePath)
    assert.equal(saved.filename, 'final-cut.mp4')
    assert.equal(saved.sizeBytes, 4)
    assert.deepEqual(Array.from(await readFile(savePath)), [5, 6, 7, 8])
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('rejects saving only an HLS manifest as a local export file', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-export-save-hls-'))
  try {
    const outputPath = join(userDataDir, 'outputs', 'index.m3u8')
    const savePath = join(userDataDir, 'saved', 'index.m3u8')
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, '#EXTM3U\n#EXTINF:1,\nsegment-00000.m4s\n')

    await assert.rejects(
      () => saveMediaPipelineExportLocal({
        outputPath,
        savePath,
      }),
      /USE_EDITING_EXPORT_PUBLISH_HLS/,
    )
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('saves a complete HLS bundle to a local directory', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-export-save-hls-dir-'))
  try {
    const hlsDirectory = join(userDataDir, 'outputs', 'hls')
    const saveDirectory = join(userDataDir, 'saved-hls')
    const manifestPath = join(hlsDirectory, 'index.m3u8')
    const initPath = join(hlsDirectory, 'init.mp4')
    const segmentPath = join(hlsDirectory, 'segment-00000.m4s')
    await mkdir(hlsDirectory, { recursive: true })
    await writeFile(manifestPath, '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:1,\nsegment-00000.m4s\n')
    await writeFile(initPath, 'init')
    await writeFile(segmentPath, 'segment')

    const saved = await saveMediaPipelineExportLocal({
      outputPath: manifestPath,
      hlsDirectory,
      saveDirectory,
      segmentPaths: [segmentPath],
    })

    assert.equal(saved.status, 'ok')
    assert.equal(saved.outputPath, manifestPath)
    assert.equal(saved.saveDirectory, saveDirectory)
    assert.equal(saved.manifestPath, join(saveDirectory, 'index.m3u8'))
    assert.deepEqual(new Set(saved.savedFiles?.map((item) => basename(item))), new Set(['index.m3u8', 'init.mp4', 'segment-00000.m4s']))
    assert.match(await readFile(join(saveDirectory, 'index.m3u8'), 'utf8'), /segment-00000\.m4s/)
    assert.equal(await readFile(join(saveDirectory, 'init.mp4'), 'utf8'), 'init')
    assert.equal(await readFile(join(saveDirectory, 'segment-00000.m4s'), 'utf8'), 'segment')
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('packages rendered MP4 outputs into local HLS manifest and segments', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-hls-packager-'))
  try {
    const ffmpegPath = await writeFakeMediaPipelineFFmpeg(userDataDir)
    const sourcePath = join(userDataDir, 'source.mp4')
    const outputDirectory = join(userDataDir, 'hls')
    await writeFile(sourcePath, new Uint8Array([1, 2, 3]))

    const hls = await packageMediaPipelineHls({
      ffmpegPath,
      sourceMp4Path: sourcePath,
      outputDirectory,
      manifestName: 'Share Preview.m3u8',
    })

    assert.equal(hls.manifestName, 'Share Preview.m3u8')
    assert.equal(hls.manifestPath, join(outputDirectory, 'Share Preview.m3u8'))
    assert.deepEqual(hls.segmentPaths, [join(outputDirectory, 'init.mp4'), join(outputDirectory, 'segment-00000.m4s')])
    assert.match(await readFile(hls.manifestPath, 'utf8'), /#EXTM3U/)
    assert.equal(await readFile(hls.segmentPaths[0], 'utf8'), 'init')
    assert.equal(await readFile(hls.segmentPaths[1], 'utf8'), 'segment')
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('packages rendered MP4 outputs into variant HLS master playlist', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-hls-variants-'))
  try {
    const ffmpegPath = await writeFakeMediaPipelineFFmpeg(userDataDir)
    const sourcePath = join(userDataDir, 'source.mp4')
    const outputDirectory = join(userDataDir, 'hls')
    await writeFile(sourcePath, new Uint8Array([1, 2, 3]))

    const hls = await packageMediaPipelineHls({
      ffmpegPath,
      sourceMp4Path: sourcePath,
      outputDirectory,
      manifestName: 'adaptive.m3u8',
      variants: [
        { name: '360p', width: 640, height: 360, videoBitrateKbps: 900 },
        { name: '720p', width: 1280, height: 720, videoBitrateKbps: 2500 },
      ],
    })

    assert.equal(hls.manifestName, 'adaptive.m3u8')
    assert.equal(hls.manifestPath, join(outputDirectory, 'adaptive.m3u8'))
    assert.deepEqual(hls.variants?.map((variant) => variant.name), ['360p', '720p'])
    assert.deepEqual(new Set(hls.segmentPaths.map((path) => path.split('/').pop())), new Set([
      '360p-init.mp4',
      '360p-segment-00000.m4s',
      '360p.m3u8',
      '720p-init.mp4',
      '720p-segment-00000.m4s',
      '720p.m3u8',
    ]))
    const master = await readFile(hls.manifestPath, 'utf8')
    assert.match(master, /#EXT-X-STREAM-INF:BANDWIDTH=1028000,RESOLUTION=640x360\n360p\.m3u8/)
    assert.match(master, /#EXT-X-STREAM-INF:BANDWIDTH=2628000,RESOLUTION=1280x720\n720p\.m3u8/)
    assert.match(await readFile(join(outputDirectory, '360p.m3u8'), 'utf8'), /#EXT-X-MAP:URI="360p-init\.mp4"/)
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('timeline_hls task renders a timeline and records local HLS outputs', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-hls-task-'))
  const originalFFmpegPath = process.env.FFMPEG_PATH
  try {
    process.env.FFMPEG_PATH = await writeFakeMediaPipelineFFmpeg(userDataDir)
    const sourcePath = join(userDataDir, 'clip.mp4')
    await writeFile(sourcePath, new Uint8Array([9, 8, 7]))

    const initialState = await createMediaPipelineTask(
      {
        projectId: 'project-1',
        taskType: 'timeline_hls',
        timeline: {
          version: 1,
          id: 'timeline-hls',
          fps: 30,
          width: 1080,
          height: 1920,
          background: '#000000',
          tracks: [{
            id: 'video-1',
            type: 'video',
            zIndex: 0,
            clips: [{
              id: 'clip-1',
              assetType: 'video',
              timelineStartMs: 0,
              durationMs: 1000,
              asset: {
                id: 'asset-local-hls',
                sourceKind: 'local_file',
                assetType: 'video',
                localPath: sourcePath,
                mimeType: 'video/mp4',
              },
            }],
          }],
        },
        output: {
          format: 'hls',
          filename: 'preview.m3u8',
          hlsVariants: [{ name: '360p', width: 640, height: 360, videoBitrateKbps: 900 }],
        },
      },
      { userDataDir },
    )

    assert.equal(initialState.status, 'running')
    const state = await waitForTerminalTask(initialState.taskId)
    assert.equal(state.status, 'succeeded', `${state.errorCode ?? ''} ${state.errorMessage ?? ''}`.trim())
    assert.equal(state.outputName, 'preview.m3u8')
    assert.ok(state.hlsManifestPath?.endsWith('/outputs/hls/preview.m3u8'))
    assert.match(state.hlsManifestUrl ?? '', /^movscript-media:\/\/hls\//)
    assert.equal(resolveMediaPipelineLocalHlsPath(state.hlsManifestUrl ?? ''), state.hlsManifestPath)
    assert.ok(state.hlsDirectory?.endsWith('/outputs/hls'))
    assert.deepEqual(new Set(state.hlsSegmentPaths?.map((item) => item.split('/').pop())), new Set(['360p-init.mp4', '360p-segment-00000.m4s', '360p.m3u8']))
    assert.equal(state.hlsVariants?.[0]?.name, '360p')
    assert.equal(state.hlsVariants?.[0]?.bandwidth, 1028000)
    assert.match(await readFile(state.hlsManifestPath ?? '', 'utf8'), /#EXT-X-STREAM-INF:BANDWIDTH=1028000,RESOLUTION=640x360\n360p\.m3u8/)
    assert.equal(await readFile(join(state.hlsDirectory ?? '', '360p-init.mp4'), 'utf8'), 'init')
    assert.equal(await readFile(join(state.hlsDirectory ?? '', '360p-segment-00000.m4s'), 'utf8'), 'segment')

    const manifest = await waitForManifestState(state.manifestPath ?? '', 'succeeded') as {
      state: { hlsManifestPath?: string; hlsManifestUrl?: string; hlsSegmentPaths?: string[]; hlsVariants?: Array<{ name?: string }> }
      request: { taskType?: string; output?: { format?: string } }
    }
    assert.equal(manifest.request.taskType, 'timeline_hls')
    assert.equal(manifest.request.output?.format, 'hls')
    assert.equal(manifest.state.hlsManifestPath, state.hlsManifestPath)
    assert.equal(manifest.state.hlsManifestUrl, state.hlsManifestUrl)
    assert.deepEqual(manifest.state.hlsSegmentPaths, state.hlsSegmentPaths)
    assert.equal(manifest.state.hlsVariants?.[0]?.name, '360p')

    const logs = await getMediaPipelineTaskLogs(state.taskId)
    assert.equal(logs.status, 'ok')
    assert.equal(logs.logs?.some((line) => line.includes('"event":"hls.package.start"')), true)
    assert.equal(logs.logs?.some((line) => line.includes('"event":"hls.package.succeeded"')), true)
  } finally {
    if (originalFFmpegPath === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = originalFFmpegPath
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('timeline_render task renders video with image overlay, text caption, and audio clip', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-composite-render-task-'))
  const originalFFmpegPath = process.env.FFMPEG_PATH
  try {
    process.env.FFMPEG_PATH = await writeFakeMediaPipelineFFmpeg(userDataDir)
    const videoPath = join(userDataDir, 'clip.mp4')
    const imagePath = join(userDataDir, 'overlay.png')
    const audioPath = join(userDataDir, 'music.m4a')
    await writeFile(videoPath, new Uint8Array([9, 8, 7]))
    await writeFile(imagePath, new Uint8Array([1, 2, 3]))
    await writeFile(audioPath, new Uint8Array([4, 5, 6]))

    const initialState = await createMediaPipelineTask(
      {
        projectId: 'project-1',
        taskType: 'timeline_render',
        timeline: {
          version: 1,
          id: 'timeline-composite',
          fps: 30,
          width: 1080,
          height: 1920,
          background: '#000000',
          tracks: [
            {
              id: 'video-1',
              type: 'video',
              zIndex: 0,
              clips: [{
                id: 'clip-1',
                assetType: 'video',
                timelineStartMs: 0,
                durationMs: 1000,
                asset: {
                  id: 'asset-video',
                  sourceKind: 'local_file',
                  assetType: 'video',
                  localPath: videoPath,
                  mimeType: 'video/mp4',
                },
              }],
            },
            {
              id: 'image-1',
              type: 'image',
              zIndex: 5,
              clips: [{
                id: 'image-clip-1',
                assetType: 'image',
                timelineStartMs: 100,
                durationMs: 800,
                opacity: 0.75,
                asset: {
                  id: 'asset-image',
                  sourceKind: 'local_file',
                  assetType: 'image',
                  localPath: imagePath,
                  mimeType: 'image/png',
                },
              }],
            },
            {
              id: 'text-1',
              type: 'text',
              zIndex: 10,
              clips: [{
                id: 'text-clip-1',
                assetType: 'text',
                timelineStartMs: 150,
                durationMs: 700,
                text: {
                  content: 'MovScript composite',
                  fontSize: 48,
                  color: '#ffffff',
                  backgroundOpacity: 0.35,
                  align: 'center',
                },
              }],
            },
            {
              id: 'audio-1',
              type: 'audio',
              zIndex: 0,
              clips: [{
                id: 'audio-clip-1',
                assetType: 'audio',
                timelineStartMs: 0,
                durationMs: 1000,
                sourceStartMs: 0,
                sourceEndMs: 1000,
                volume: 80,
                asset: {
                  id: 'asset-audio',
                  sourceKind: 'local_file',
                  assetType: 'audio',
                  localPath: audioPath,
                  mimeType: 'audio/mp4',
                },
              }],
            },
          ],
        },
        output: { format: 'mp4', filename: 'composite.mp4' },
      },
      { userDataDir },
    )

    assert.equal(initialState.status, 'running')
    const state = await waitForTerminalTask(initialState.taskId)
    assert.equal(state.status, 'succeeded', `${state.errorCode ?? ''} ${state.errorMessage ?? ''}`.trim())
    assert.equal(state.outputName, 'composite.mp4')
    assert.ok(state.outputPath?.endsWith('/outputs/composite.mp4'))
    assert.equal(await readFile(state.outputPath ?? '', 'utf8'), 'mp4')

    const logs = await getMediaPipelineTaskLogs(state.taskId)
    assert.equal(logs.status, 'ok')
    assert.equal(logs.logs?.some((line) => line.includes('"videoClipCount":1')), true)
    assert.equal(logs.logs?.some((line) => line.includes('"overlayCount":1')), true)
    assert.equal(logs.logs?.some((line) => line.includes('"captionCount":1')), true)
    assert.equal(logs.logs?.some((line) => line.includes('"audioClipCount":1')), true)
  } finally {
    if (originalFFmpegPath === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = originalFFmpegPath
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('timeline_render task exports a full local editing project with video image audio and subtitles', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-editing-project-e2e-'))
  const originalFFmpegPath = process.env.FFMPEG_PATH
  try {
    process.env.FFMPEG_PATH = await writeFakeMediaPipelineFFmpeg(userDataDir)
    const videoPath = join(userDataDir, 'local-video.mp4')
    const imagePath = join(userDataDir, 'local-overlay.png')
    const audioPath = join(userDataDir, 'local-music.m4a')
    await writeFile(videoPath, new Uint8Array([1, 2, 3, 4]))
    await writeFile(imagePath, new Uint8Array([5, 6, 7, 8]))
    await writeFile(audioPath, new Uint8Array([9, 10, 11, 12]))

    const initialState = await createMediaPipelineTask(
      {
        projectId: 'project-1',
        taskType: 'timeline_render',
        editingProject: {
          version: 1,
          id: 'editing-project-e2e',
          projectId: 'project-1',
          title: 'Local composite edit',
          createdAt: '2026-06-17T00:00:00.000Z',
          updatedAt: '2026-06-17T00:00:00.000Z',
          revision: 1,
          source: { kind: 'manual' },
          assets: {
            assets: [{
              id: 'asset-video',
              sourceKind: 'local_file',
              assetType: 'video',
              localPath: videoPath,
              label: 'local-video.mp4',
              metadata: { durationMs: 1200 },
            }, {
              id: 'asset-image',
              sourceKind: 'local_file',
              assetType: 'image',
              localPath: imagePath,
              label: 'local-overlay.png',
            }, {
              id: 'asset-audio',
              sourceKind: 'local_file',
              assetType: 'audio',
              localPath: audioPath,
              label: 'local-music.m4a',
              metadata: { durationMs: 1200 },
            }],
          },
          timeline: {
            version: 1,
            id: 'timeline-editing-project-e2e',
            fps: 30,
            width: 1280,
            height: 720,
            background: '#000000',
            durationMs: 1200,
            tracks: [{
              id: 'video-track',
              type: 'video',
              zIndex: 0,
              clips: [{
                id: 'video-clip',
                assetType: 'video',
                asset: {
                  id: 'asset-video',
                  sourceKind: 'local_file',
                  assetType: 'video',
                  localPath: videoPath,
                  label: 'local-video.mp4',
                },
                timelineStartMs: 0,
                durationMs: 1200,
                sourceStartMs: 0,
                sourceEndMs: 1200,
                volume: 100,
                fit: 'cover',
              }],
            }, {
              id: 'image-overlay-track',
              type: 'image',
              zIndex: 4,
              clips: [{
                id: 'image-overlay-clip',
                assetType: 'image',
                asset: {
                  id: 'asset-image',
                  sourceKind: 'local_file',
                  assetType: 'image',
                  localPath: imagePath,
                  label: 'local-overlay.png',
                },
                timelineStartMs: 200,
                durationMs: 800,
                xPercent: 76,
                yPercent: 24,
                scale: 0.4,
                opacity: 0.7,
                transition: { type: 'fade', durationMs: 150 },
              }],
            }, {
              id: 'subtitle-track',
              type: 'subtitle',
              zIndex: 8,
              clips: [{
                id: 'subtitle-text-clip',
                assetType: 'text',
                timelineStartMs: 250,
                durationMs: 700,
                position: 'bottom',
                text: {
                  content: 'Local edit subtitle',
                  fontSize: 32,
                  color: '#ffffff',
                  backgroundOpacity: 0.3,
                  align: 'center',
                },
                subtitle: { renderer: 'ass' },
              }],
            }, {
              id: 'audio-track',
              type: 'audio',
              zIndex: 2,
              clips: [{
                id: 'audio-clip',
                assetType: 'audio',
                asset: {
                  id: 'asset-audio',
                  sourceKind: 'local_file',
                  assetType: 'audio',
                  localPath: audioPath,
                  label: 'local-music.m4a',
                },
                timelineStartMs: 0,
                durationMs: 1200,
                sourceStartMs: 0,
                sourceEndMs: 1200,
                volume: 65,
                fadeInMs: 100,
                fadeOutMs: 100,
              }],
            }],
          },
        },
        output: { format: 'mp4', filename: 'local-edit.mp4' },
      },
      { userDataDir },
    )

    assert.equal(initialState.status, 'running')
    const state = await waitForTerminalTask(initialState.taskId)
    assert.equal(state.status, 'succeeded', `${state.errorCode ?? ''} ${state.errorMessage ?? ''}`.trim())
    assert.equal(state.outputName, 'local-edit.mp4')
    assert.equal(await readFile(state.outputPath ?? '', 'utf8'), 'mp4')

    const logs = await getMediaPipelineTaskLogs(state.taskId)
    assert.equal(logs.status, 'ok')
    assert.equal(logs.logs?.some((line) => line.includes('"videoClipCount":1')), true)
    assert.equal(logs.logs?.some((line) => line.includes('"overlayCount":1')), true)
    assert.equal(logs.logs?.some((line) => line.includes('"captionCount":1')), true)
    assert.equal(logs.logs?.some((line) => line.includes('"audioClipCount":1')), true)
  } finally {
    if (originalFFmpegPath === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = originalFFmpegPath
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('timeline_render task burns ASS subtitle assets through the local media pipeline', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-ass-subtitle-task-'))
  const originalFFmpegPath = process.env.FFMPEG_PATH
  try {
    process.env.FFMPEG_PATH = await writeFakeMediaPipelineFFmpeg(userDataDir)
    const sourcePath = join(userDataDir, 'clip.mp4')
    await writeFile(sourcePath, new Uint8Array([9, 8, 7]))

    const initialState = await createMediaPipelineTask(
      {
        projectId: 'project-1',
        taskType: 'timeline_render',
        timeline: {
          version: 1,
          id: 'timeline-ass',
          fps: 30,
          width: 1080,
          height: 1920,
          background: '#000000',
          tracks: [
            {
              id: 'video-1',
              type: 'video',
              zIndex: 0,
              clips: [{
                id: 'clip-1',
                assetType: 'video',
                timelineStartMs: 0,
                durationMs: 1000,
                asset: {
                  id: 'asset-local-video',
                  sourceKind: 'local_file',
                  assetType: 'video',
                  localPath: sourcePath,
                  mimeType: 'video/mp4',
                },
              }],
            },
            {
              id: 'subtitle-1',
              type: 'subtitle',
              zIndex: 10,
              clips: [{
                id: 'subtitle-clip-1',
                assetType: 'subtitle',
                timelineStartMs: 0,
                durationMs: 1000,
                subtitle: { format: 'ass', burnIn: true },
                asset: {
                  id: 'asset-ass-subtitle',
                  sourceKind: 'bytes',
                  assetType: 'subtitle',
                  label: 'captions.ass',
                  mimeType: 'text/x-ssa',
                  bytes: Array.from(Buffer.from('[Script Info]\nScriptType: v4.00+\n[Events]\nFormat: Layer, Start, End, Style, Text\nDialogue: 0,0:00:00.00,0:00:01.00,Default,ASS caption\n')),
                },
              }],
            },
          ],
        },
        output: { format: 'mp4', filename: 'ass-subtitle.mp4' },
      },
      { userDataDir },
    )

    assert.equal(initialState.status, 'running')
    const state = await waitForTerminalTask(initialState.taskId)
    assert.equal(state.status, 'succeeded', `${state.errorCode ?? ''} ${state.errorMessage ?? ''}`.trim())
    assert.equal(state.outputName, 'ass-subtitle.mp4')
    assert.ok(state.outputPath?.endsWith('/outputs/ass-subtitle.mp4'))
    assert.equal(await readFile(state.outputPath ?? '', 'utf8'), 'mp4')

    const logs = await getMediaPipelineTaskLogs(state.taskId)
    assert.equal(logs.status, 'ok')
    assert.equal(logs.logs?.some((line) => line.includes('"subtitleFileCount":1')), true)
  } finally {
    if (originalFFmpegPath === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = originalFFmpegPath
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('timeline_render task can import MP4 output as RawResource with derivative provenance', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-render-import-task-'))
  const originalFFmpegPath = process.env.FFMPEG_PATH
  const originalFetch = globalThis.fetch
  setMovScriptBackendAPIBaseURL('http://media-pipeline.test')
  try {
    process.env.FFMPEG_PATH = await writeFakeMediaPipelineFFmpeg(userDataDir)
    const sourcePath = join(userDataDir, 'clip.mp4')
    await writeFile(sourcePath, new Uint8Array([9, 8, 7]))
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://media-pipeline.test/api/v1/resources/upload')
      assert.equal(init?.method, 'POST')
      assert.ok(init?.body instanceof FormData)
      const form = init.body as FormData
      assert.equal(form.get('folder_id'), 'exports')
      assert.deepEqual(JSON.parse(String(form.get('derivative'))), {
        operation: 'timeline_render',
        tool: 'electron_media_pipeline',
        input_resource_ids: [55],
        params: {
          project_id: 'project-1',
          task_type: 'timeline_render',
          output_format: 'mp4',
          output_filename: 'imported-render.mp4',
          timeline_id: 'timeline-import',
        },
      })
      return new Response(JSON.stringify({ ID: 78, name: 'imported-render.mp4', type: 'video' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    }

    const initialState = await createMediaPipelineTask(
      {
        projectId: 'project-1',
        taskType: 'timeline_render',
        timeline: {
          version: 1,
          id: 'timeline-import',
          fps: 30,
          width: 1080,
          height: 1920,
          background: '#000000',
          tracks: [{
            id: 'video-1',
            type: 'video',
            zIndex: 0,
            clips: [{
              id: 'clip-1',
              assetType: 'video',
              timelineStartMs: 0,
              durationMs: 1000,
              asset: {
                id: 'asset-resource-backed-local',
                sourceKind: 'local_file',
                assetType: 'video',
                resourceId: 55,
                localPath: sourcePath,
                mimeType: 'video/mp4',
              },
            }],
          }],
        },
        output: {
          format: 'mp4',
          filename: 'imported-render.mp4',
          folderId: 'exports',
          importToResource: true,
        },
      },
      { userDataDir },
    )

    const state = await waitForTerminalTask(initialState.taskId)
    assert.equal(state.status, 'succeeded', `${state.errorCode ?? ''} ${state.errorMessage ?? ''}`.trim())
    assert.equal(state.outputResourceId, 78)
    assert.deepEqual(state.outputResource, { ID: 78, name: 'imported-render.mp4', type: 'video' })
    const logs = await getMediaPipelineTaskLogs(state.taskId)
    assert.equal(logs.logs?.some((line) => line.includes('"event":"output.upload.succeeded"')), true)
  } finally {
    if (originalFFmpegPath === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = originalFFmpegPath
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('publishes local HLS outputs to backend MediaStreamArtifact hosting', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-hls-publish-'))
  const originalFetch = globalThis.fetch
  setMovScriptBackendAPIBaseURL('http://media-pipeline.test')
  try {
    const manifestPath = join(userDataDir, 'index.m3u8')
    const initPath = join(userDataDir, 'init.mp4')
    const segmentPath = join(userDataDir, 'segment-00000.m4s')
    await writeFile(manifestPath, '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:1,\nsegment-00000.m4s\n')
    await writeFile(initPath, 'init')
    await writeFile(segmentPath, 'segment')
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://media-pipeline.test/api/v1/media/streams/uploads')
      assert.equal(init?.method, 'POST')
      assert.ok(init?.body instanceof FormData)
      const form = init.body as FormData
      assert.equal(form.get('project_id'), '7')
      assert.equal(form.get('task_id'), 'timeline_hls_1')
      assert.equal(form.get('source_resource_id'), '88')
      assert.equal(form.get('title'), 'Preview HLS')
      assert.ok(form.get('manifest') instanceof Blob)
      const segments = form.getAll('segments')
      assert.equal(segments.length, 2)
      assert.ok(segments[0] instanceof Blob)
      assert.ok(segments[1] instanceof Blob)
      return new Response(JSON.stringify({
        stream_id: 41,
        manifest_url: '/api/v1/media/streams/41/manifest.m3u8',
        segment_base_url: '/api/v1/media/streams/41/segments/',
        stream: { ID: 41, status: 'ready' },
        segments: [{ name: 'init.mp4' }, { name: 'segment-00000.m4s' }],
      }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    }

    const result = await publishMediaPipelineHlsStream({
      manifestPath,
      segmentPaths: [initPath, segmentPath],
      taskId: 'timeline_hls_1',
      title: 'Preview HLS',
      projectId: 7,
      sourceResourceId: 88,
    })

    assert.equal(result.status, 'ok')
    assert.equal(result.streamId, 41)
    assert.equal(result.manifestUrl, '/api/v1/media/streams/41/manifest.m3u8')
    assert.equal(result.segmentBaseUrl, '/api/v1/media/streams/41/segments/')
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('imports an existing local editing export to the RawResource library', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-export-import-'))
  const originalFetch = globalThis.fetch
  setMovScriptBackendAPIBaseURL('http://media-pipeline.test')
  try {
    const outputPath = join(userDataDir, 'final-cut.mp4')
    await writeFile(outputPath, new Uint8Array([9, 8, 7]))
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://media-pipeline.test/api/v1/resources/upload')
      assert.equal(init?.method, 'POST')
      assert.ok(init?.body instanceof FormData)
      const form = init.body as FormData
      assert.deepEqual(JSON.parse(String(form.get('derivative'))), {
        operation: 'editing_export_import',
        tool: 'editing_export_import_resource',
        input_resource_ids: [45],
        params: { task_id: 'task-7', editing_project_id: 'edit-7' },
      })
      return new Response(JSON.stringify({ id: 68, kind: 'raw_resource' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    const imported = await importMediaPipelineExportResource({
      outputPath,
      folderId: 'folder-2',
      operation: 'editing_export_import',
      sourceResourceId: 45,
      params: { task_id: 'task-7', editing_project_id: 'edit-7' },
    })

    assert.equal(imported.status, 'ok')
    assert.equal(imported.resourceId, 68)
    assert.equal(imported.resource_id, 68)
    assert.equal(imported.outputPath, outputPath)
    assert.equal(imported.filename, 'final-cut.mp4')
    assert.equal(imported.mimeType, 'video/mp4')
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('normalizes permanent backend resource download failures into editing materialize error codes', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-backend-not-found-'))
  const originalFetch = globalThis.fetch
  let requestCount = 0
  setMovScriptBackendAPIBaseURL('http://media-pipeline.test')
  try {
    globalThis.fetch = async (input) => {
      requestCount += 1
      assert.equal(String(input), 'http://media-pipeline.test/api/v1/resources/404/file')
      return new Response('missing resource', { status: 404 })
    }

    const workspace = await prepareMediaWorkspace({ userDataDir, projectId: 'project-1', taskId: 'task-1' })
    await assert.rejects(
      () => materializeMediaPipelineAsset({
        workspace,
        asset: {
          id: 'asset-backend-missing',
          sourceKind: 'backend_resource',
          assetType: 'video',
          resourceId: 404,
          checksum: 'checksum-missing',
        },
      }),
      /ASSET_RESOURCE_NOT_FOUND/,
    )
    assert.equal(requestCount, 1)
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('cleans media resource cache by LRU while protecting active files', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-cache-cleanup-'))
  try {
    const workspace = await prepareMediaWorkspace({ userDataDir, projectId: 'project-1', taskId: 'task-1' })
    const oldPath = join(workspace.cacheResources, 'old.mp4')
    const newerPath = join(workspace.cacheResources, 'newer.mp4')
    const protectedPath = join(workspace.cacheResources, 'protected.mp4')
    await writeFile(oldPath, Buffer.alloc(4))
    await writeFile(newerPath, Buffer.alloc(4))
    await writeFile(protectedPath, Buffer.alloc(4))
    await utimes(oldPath, new Date(1000), new Date(1000))
    await utimes(newerPath, new Date(2000), new Date(2000))
    await utimes(protectedPath, new Date(500), new Date(500))

    const result = await cleanupMediaResourceCache({
      cacheResources: workspace.cacheResources,
      maxBytes: 4,
      protectPaths: [protectedPath],
    })

    assert.equal(result.scannedCount, 3)
    assert.equal(result.removedCount, 2)
    assert.equal(result.bytesAfter, 4)
    assert.deepEqual(result.removedPaths, [oldPath, newerPath])
    assert.equal((await stat(protectedPath)).isFile(), true)
    await assert.rejects(() => stat(oldPath), /ENOENT/)
    await assert.rejects(() => stat(newerPath), /ENOENT/)
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('materializes byte assets into the task input directory', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-byte-asset-'))
  try {
    const workspace = await prepareMediaWorkspace({ userDataDir, projectId: 'project-1', taskId: 'task-1' })
    const first = await materializeMediaPipelineAsset({
      workspace,
      asset: {
        id: 'asset-bytes',
        sourceKind: 'bytes',
        assetType: 'image',
        bytes: new Uint8Array([9, 8, 7]),
        mimeType: 'image/png',
        label: 'inline-image.png',
      },
    })
    const second = await materializeMediaPipelineAsset({
      workspace,
      asset: {
        id: 'asset-base64',
        sourceKind: 'bytes',
        assetType: 'audio',
        base64: Buffer.from([1, 2, 3]).toString('base64'),
        mimeType: 'audio/mp4',
        label: 'inline-audio',
      },
    })

    assert.equal(first.cached, false)
    assert.equal(first.path.startsWith(workspace.taskInputs), true)
    assert.equal(first.path.endsWith('.png'), true)
    assert.deepEqual([...(await readFile(first.path))], [9, 8, 7])
    assert.equal(second.path.startsWith(workspace.taskInputs), true)
    assert.equal(second.path.endsWith('.m4a'), true)
    assert.deepEqual([...(await readFile(second.path))], [1, 2, 3])
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('cancels running media pipeline tasks and persists canceled state', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-cancel-task-'))
  const originalFetch = globalThis.fetch
  let requestCount = 0
  let resolveFetch: ((response: Response) => void) | undefined
  setMovScriptBackendAPIBaseURL('http://media-pipeline.test')
  try {
    globalThis.fetch = async (input) => {
      requestCount += 1
      assert.equal(String(input), 'http://media-pipeline.test/api/v1/resources/55/file')
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve
      })
    }

    const initialState = await createMediaPipelineTask(
      {
        projectId: 'project-1',
        taskType: 'timeline_render',
        timeline: {
          version: 1,
          id: 'timeline-1',
          fps: 30,
          width: 1080,
          height: 1920,
          background: '#000000',
          tracks: [{
            id: 'video-1',
            type: 'video',
            zIndex: 0,
            clips: [{
              id: 'clip-1',
              assetType: 'video',
              timelineStartMs: 0,
              durationMs: 1000,
              asset: {
                id: 'asset-slow-resource',
                sourceKind: 'backend_resource',
                assetType: 'video',
                resourceId: 55,
                mimeType: 'video/mp4',
              },
            }],
          }],
        },
        output: { format: 'mp4', filename: 'out.mp4' },
      },
      { userDataDir },
    )

    assert.equal(initialState.status, 'running')
    await waitForCondition(() => requestCount === 1 && Boolean(resolveFetch))
    const canceled = await cancelMediaPipelineTask(initialState.taskId)
    assert.equal(canceled.status, 'canceled')
    assert.equal(canceled.errorCode, 'TASK_CANCELED')

    resolveFetch?.(new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': 'video/mp4' },
    }))
    const finalState = await waitForTerminalTask(initialState.taskId)
    assert.equal(finalState.status, 'canceled')
    assert.equal(finalState.errorCode, 'TASK_CANCELED')

    const manifest = await waitForManifestState(finalState.manifestPath ?? '', 'canceled') as {
      state: { status: string; errorCode?: string }
    }
    assert.equal(manifest.state.status, 'canceled')
    assert.equal(manifest.state.errorCode, 'TASK_CANCELED')

    const logs = await waitForTaskLog(initialState.taskId, '"event":"task.canceled"')
    assert.equal(logs.status, 'ok')
    assert.equal(logs.logs?.some((line) => line.includes('"event":"task.canceled"')), true)
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('parses ffmpeg progress timestamps from process output chunks', () => {
  assert.equal(parseFFmpegProgressTimeMs('frame=10 time=00:00:01.250 bitrate=1000kbits/s'), 1250)
  assert.equal(parseFFmpegProgressTimeMs('time=00:01:02.500 speed=1x'), 62500)
  assert.equal(parseFFmpegProgressTimeMs('time=00:00:01.000 time=00:00:03.000'), 3000)
  assert.equal(parseFFmpegProgressTimeMs('time=N/A'), undefined)
})

test('mediaPipeline task entrypoint depends on local renderer and ffmpeg facades', () => {
  const source = readFileSync(join(import.meta.dirname, 'mediaPipeline/index.ts'), 'utf8')
  const ipcIndexSource = readFileSync(join(import.meta.dirname, '../ipc/index.ts'), 'utf8')
  const mediaPipelineIpcSource = readFileSync(join(import.meta.dirname, '../ipc/mediaPipelineIpc.ts'), 'utf8')
  const preloadIndexSource = readFileSync(join(import.meta.dirname, '../preload/api.ts'), 'utf8')
  const mediaPipelinePreloadSource = readFileSync(join(import.meta.dirname, '../preload/api/mediaPipeline.ts'), 'utf8')
  const rendererSource = readFileSync(join(import.meta.dirname, 'mediaPipeline/timelineRenderer.ts'), 'utf8')
  const mediaPipelineGraphSource = readFileSync(join(import.meta.dirname, 'mediaPipeline/ffmpegGraph.ts'), 'utf8')
  const mediaPipelineProbeSource = readFileSync(join(import.meta.dirname, 'mediaPipeline/ffmpegProbe.ts'), 'utf8')
  const mediaPipelineRunnerSource = readFileSync(join(import.meta.dirname, 'mediaPipeline/ffmpegRunner.ts'), 'utf8')
  const mediaPipelineValidationSource = readFileSync(join(import.meta.dirname, 'mediaPipeline/timelineValidation.ts'), 'utf8')
  const mediaPipelineSingleClipSource = readFileSync(join(import.meta.dirname, 'mediaPipeline/singleClipRenderer.ts'), 'utf8')
  const mediaPipelineShotCutSource = readFileSync(join(import.meta.dirname, 'mediaPipeline/shotCutAnalyzer.ts'), 'utf8')
  assert.doesNotMatch(source, /\.\.\/videoClip/)
  assert.equal(existsSync(join(import.meta.dirname, 'videoClip')), false)
  assert.doesNotMatch(ipcIndexSource, /registerVideoIpcHandlers/)
  assert.doesNotMatch(ipcIndexSource, /videoIpc/)
  assert.doesNotMatch(preloadIndexSource, /createVideoAPI/)
  assert.doesNotMatch(preloadIndexSource, /api\/video/)
  assert.match(mediaPipelineIpcSource, /media-pipeline:render-single-clip/)
  assert.match(mediaPipelineIpcSource, /media-pipeline:render-timeline-video/)
  assert.match(mediaPipelineIpcSource, /media-pipeline:get-ffmpeg-status/)
  assert.match(mediaPipelineIpcSource, /media-pipeline:analyze-shot-cuts/)
  assert.match(mediaPipelineIpcSource, /media-pipeline:editing-project-event/)
  assert.doesNotMatch(mediaPipelineIpcSource, /video:clip/)
  assert.doesNotMatch(mediaPipelineIpcSource, /video:timeline-export/)
  assert.doesNotMatch(mediaPipelineIpcSource, /video:clip-status/)
  assert.doesNotMatch(mediaPipelineIpcSource, /video:shot-cuts/)
  assert.match(mediaPipelinePreloadSource, /renderMediaPipelineSingleClip/)
  assert.match(mediaPipelinePreloadSource, /getMediaPipelineFFmpegStatus/)
  assert.match(mediaPipelinePreloadSource, /analyzeMediaPipelineShotCuts/)
  assert.match(mediaPipelinePreloadSource, /onMediaEditingProjectEvent/)
  assert.match(source, /from '\.\/timelineRenderer'/)
  assert.match(source, /from '\.\/ffmpegProbe'/)
  assert.match(source, /from '\.\/progress'/)
  assert.match(source, /from '\.\/errors'/)
  assert.match(source, /from '\.\/taskStore'/)
  assert.doesNotMatch(source, /function parseFFmpegProgressTimeMs/)
  assert.doesNotMatch(source, /class MediaPipelineTaskError/)
  assert.doesNotMatch(source, /function subtitleRenderer/)
  assert.doesNotMatch(source, /function subtitleFormat/)
  assert.doesNotMatch(source, /function timelineToVideoExportInput/)
  assert.doesNotMatch(source, /function mediaPipelineTimelineVideoClipInput/)
  assert.doesNotMatch(source, /function overlayInput/)
  assert.doesNotMatch(source, /const tasks = new Map/)
  assert.doesNotMatch(source, /const taskRuns = new Map/)
  assert.doesNotMatch(source, /const taskEventListeners = new Set/)
  assert.match(rendererSource, /from '\.\/assetMaterializer'/)
  assert.match(rendererSource, /from '\.\/subtitleRenderer'/)
  assert.match(rendererSource, /from '\.\/timelineSegments'/)
  assert.match(rendererSource, /from '\.\/timelinePostProcess'/)
  assert.doesNotMatch(rendererSource, /renderVideoTimeline/)
  assert.doesNotMatch(rendererSource, /\.\.\/videoClip/)
  assert.match(rendererSource, /function mediaPipelineTimelineVideoClipInput/)
  assert.match(rendererSource, /function overlayInput/)
  assert.doesNotMatch(mediaPipelineGraphSource, /\.\.\/videoClip/)
  assert.doesNotMatch(mediaPipelineProbeSource, /\.\.\/videoClip/)
  assert.doesNotMatch(mediaPipelineRunnerSource, /\.\.\/videoClip/)
  assert.doesNotMatch(mediaPipelineValidationSource, /\.\.\/videoClip/)
  assert.doesNotMatch(mediaPipelineSingleClipSource, /\.\.\/videoClip/)
  assert.doesNotMatch(mediaPipelineShotCutSource, /\.\.\/videoClip/)
  assert.match(mediaPipelineProbeSource, /function readMediaPipelineFFmpegFilters/)
  assert.match(mediaPipelineRunnerSource, /function runMediaPipelineFFmpeg/)
  assert.match(mediaPipelineValidationSource, /function validateMediaPipelineTimelineExportInput/)
  assert.match(mediaPipelineSingleClipSource, /function renderMediaPipelineSingleClip/)
  assert.match(mediaPipelineSingleClipSource, /function buildMediaPipelineSingleClipArgs/)
  assert.match(mediaPipelineSingleClipSource, /function runMediaPipelineClipWithFallback/)
  assert.match(mediaPipelineShotCutSource, /function analyzeMediaPipelineShotCuts/)
  assert.match(mediaPipelineShotCutSource, /runMediaPipelineFFmpeg/)
  assert.match(mediaPipelineGraphSource, /function buildMediaPipelineCropFilter/)
  assert.match(mediaPipelineGraphSource, /function mediaPipelineFFmpegSeconds/)
})

test('timeline render task reports materializer errors before invoking ffmpeg export', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-render-materialize-'))
  try {
    const initialState = await createMediaPipelineTask(
      {
        projectId: 'project-1',
        taskType: 'timeline_render',
        timeline: {
          version: 1,
          id: 'timeline-1',
          fps: 30,
          width: 1080,
          height: 1920,
          background: '#000000',
          tracks: [{
            id: 'video-1',
            type: 'video',
            zIndex: 0,
            clips: [{
              id: 'clip-1',
              assetType: 'video',
              timelineStartMs: 0,
              durationMs: 1000,
              asset: {
                id: 'asset-missing-resource-id',
                sourceKind: 'backend_resource',
                assetType: 'video',
              },
            }],
          }],
        },
        output: { format: 'mp4', filename: 'out.mp4' },
      },
      { userDataDir },
    )
    assert.equal(initialState.status, 'running')
    const state = await waitForTerminalTask(initialState.taskId)

    assert.equal(state.status, 'failed')
    assert.equal(state.errorCode, 'ASSET_RESOURCE_ID_REQUIRED')
    assert.match(state.errorMessage ?? '', /Clip clip-1/)

    const logs = await getMediaPipelineTaskLogs(state.taskId)
    assert.equal(logs.status, 'ok')
    assert.equal(logs.logs?.some((line) => line.includes('"event":"task.progress"') && line.includes('"currentStep":"materializing"')), true)
    assert.equal(logs.logs?.some((line) => line.includes('"event":"timeline.materialize.start"')), true)
    assert.equal(logs.logs?.some((line) => line.includes('"event":"task.failed"')), true)
    assert.match(logs.text ?? '', /ASSET_RESOURCE_ID_REQUIRED/)
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('timeline render task reports missing byte asset payloads', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-render-bytes-'))
  try {
    const initialState = await createMediaPipelineTask(
      {
        projectId: 'project-1',
        taskType: 'timeline_render',
        timeline: {
          version: 1,
          id: 'timeline-1',
          fps: 30,
          width: 1080,
          height: 1920,
          background: '#000000',
          tracks: [{
            id: 'video-1',
            type: 'video',
            zIndex: 0,
            clips: [{
              id: 'clip-bytes',
              assetType: 'video',
              timelineStartMs: 0,
              durationMs: 1000,
              asset: {
                id: 'asset-empty-bytes',
                sourceKind: 'bytes',
                assetType: 'video',
                mimeType: 'video/mp4',
              },
            }],
          }],
        },
        output: { format: 'mp4', filename: 'out.mp4' },
      },
      { userDataDir },
    )
    assert.equal(initialState.status, 'running')
    const state = await waitForTerminalTask(initialState.taskId)

    assert.equal(state.status, 'failed')
    assert.equal(state.errorCode, 'ASSET_BYTES_REQUIRED')
    assert.match(state.errorMessage ?? '', /Clip clip-bytes/)
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('returns not_found logs for unknown media pipeline tasks', async () => {
  const logs = await getMediaPipelineTaskLogs('missing-task')
  assert.equal(logs.status, 'not_found')
  assert.equal(logs.taskId, 'missing-task')
})

test('restores legacy task manifests and logs from sanitized workspace paths', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-task-store-legacy-'))
  try {
    const taskRoot = join(
      userDataDir,
      'media-workspaces',
      'project_with_spaces',
      'tasks',
      'timeline_cancel_2',
    )
    const manifestPath = join(taskRoot, 'manifest.json')
    const logPath = join(taskRoot, 'logs', 'events.jsonl')
    const state = {
      taskId: 'timeline/cancel 2',
      projectId: 'project:with spaces',
      taskType: 'timeline_render',
      status: 'succeeded',
      progressPercent: 100,
      currentStep: 'done',
      workspacePath: taskRoot,
      manifestPath,
      outputPath: join(taskRoot, 'outputs', 'final.mp4'),
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-17T00:00:01.000Z',
    }
    await mkdir(dirname(logPath), { recursive: true })
    await writeFile(manifestPath, `${JSON.stringify({
      schema: 'movscript.media_pipeline_task.v1',
      request: {
        projectId: state.projectId,
        taskType: state.taskType,
        output: { format: 'mp4' },
      },
      state,
    }, null, 2)}\n`)
    await writeFile(logPath, `${JSON.stringify({ event: 'task.succeeded', taskId: state.taskId, state })}\n`)

    const restored = await getStoredMediaPipelineTask({
      projectId: state.projectId,
      taskId: state.taskId,
    }, { userDataDir })
    assert.equal(restored?.status, 'succeeded')
    assert.equal(restored?.manifestPath, manifestPath)

    const logs = await getMediaPipelineTaskLogs(state.taskId, {
      projectId: state.projectId,
      userDataDir,
    })
    assert.equal(logs.status, 'ok')
    assert.equal(logs.logPath, logPath)
    assert.equal(logs.logs?.length, 1)
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('cancels restored task manifests from legacy sanitized workspace paths', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'movscript-media-task-cancel-legacy-'))
  try {
    const taskRoot = join(
      userDataDir,
      'media-workspaces',
      'project_with_spaces',
      'tasks',
      'timeline_render_1',
    )
    const manifestPath = join(taskRoot, 'manifest.json')
    const state = {
      taskId: 'timeline/render 1',
      projectId: 'project:with spaces',
      taskType: 'timeline_render' as const,
      status: 'running' as const,
      progressPercent: 42,
      currentStep: 'rendering',
      workspacePath: taskRoot,
      manifestPath,
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-17T00:00:01.000Z',
    }
    await mkdir(join(taskRoot, 'logs'), { recursive: true })
    await writeFile(manifestPath, `${JSON.stringify({
      schema: 'movscript.media_pipeline_task.v1',
      request: {
        projectId: state.projectId,
        taskType: state.taskType,
        output: { format: 'mp4', filename: 'final.mp4' },
      },
      state,
    }, null, 2)}\n`)

    const canceled = await cancelMediaPipelineTask(state.taskId, {
      projectId: state.projectId,
      userDataDir,
    })

    assert.equal(canceled.status, 'canceled')
    assert.equal(canceled.errorCode, 'TASK_CANCELED')
    assert.equal(canceled.manifestPath, manifestPath)

    const persisted = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      request?: { projectId?: string; output?: { filename?: string } }
      state?: { status?: string; errorCode?: string }
    }
    assert.equal(persisted.request?.projectId, state.projectId)
    assert.equal(persisted.request?.output?.filename, 'final.mp4')
    assert.equal(persisted.state?.status, 'canceled')
    assert.equal(persisted.state?.errorCode, 'TASK_CANCELED')

    const logs = await getMediaPipelineTaskLogs(state.taskId, {
      projectId: state.projectId,
      userDataDir,
    })
    assert.equal(logs.status, 'ok')
    assert.equal(logs.logs?.some((line) => line.includes('"event":"task.canceled"')), true)
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
})

async function writeFakeMediaPipelineFFmpeg(dir: string): Promise<string> {
  const ffmpegPath = join(dir, 'ffmpeg')
  await writeFile(ffmpegPath, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args.includes('-version')) {
  process.stdout.write('ffmpeg fake\\n');
  process.exit(0);
}
if (args.includes('-filters')) {
  process.stdout.write(' TSC drawtext          V->V       draw text\\n TSC subtitles         V->V       render text subtitles\\n TSC overlay           VV->V      overlay video\\n TSC crop              V->V       crop video\\n TSC fade              V->V       fade video\\n TSC volume            A->A       volume audio\\n TSC atempo            A->A       audio tempo\\n TSC adelay            A->A       delay audio\\n TSC afade             A->A       fade audio\\n TSC amix              N->A       mix audio\\n TSC anullsrc          |->A       null audio source\\n TSC asetpts           A->A       set audio pts\\n TSC atrim             A->A       trim audio\\n TSC color             |->V       color source\\n TSC colorchannelmixer V->V       adjust color channels\\n TSC format            V->V       convert pixel formats\\n TSC pad               V->V       pad video\\n TSC scale             V->V       scale video\\n TSC setsar            V->V       set sample aspect ratio\\n');
  process.exit(0);
}
const segmentPatternIndex = args.indexOf('-hls_segment_filename');
if (segmentPatternIndex >= 0) {
  const segmentPattern = args[segmentPatternIndex + 1];
  const initNameIndex = args.indexOf('-hls_fmp4_init_filename');
  const initName = initNameIndex >= 0 ? args[initNameIndex + 1] : 'init.mp4';
  const manifestPath = args[args.length - 1];
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const segmentPath = segmentPattern.replace('%05d', '00000');
  const initPath = path.join(path.dirname(manifestPath), initName);
  fs.writeFileSync(initPath, 'init');
  fs.writeFileSync(segmentPath, 'segment');
  fs.writeFileSync(manifestPath, '#EXTM3U\\n#EXT-X-MAP:URI="' + initName + '"\\n#EXTINF:1,\\n' + path.basename(segmentPath) + '\\n');
  process.stderr.write('frame=1 time=00:00:01.000\\n');
  process.exit(0);
}
const outputPath = args[args.length - 1];
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, 'mp4');
process.stderr.write('frame=1 time=00:00:01.000\\n');
`, 'utf8')
  await chmod(ffmpegPath, 0o755)
  return ffmpegPath
}

async function waitForTerminalTask(taskId: string): Promise<NonNullable<ReturnType<typeof getMediaPipelineTask>>> {
  return waitForCondition(() => {
    const state = getMediaPipelineTask(taskId)
    if (!state) return undefined
    return state.status === 'succeeded' || state.status === 'failed' || state.status === 'canceled'
      ? state
      : undefined
  })
}

async function waitForManifestState(manifestPath: string, status: string): Promise<Record<string, unknown>> {
  return waitForCondition(() => {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        state?: { status?: string }
      }
      return manifest.state?.status === status ? manifest as unknown as Record<string, unknown> : undefined
    } catch {
      return undefined
    }
  })
}

async function waitForTaskLog(taskId: string, pattern: string) {
  return waitForCondition(async () => {
    const logs = await getMediaPipelineTaskLogs(taskId)
    return logs.logs?.some((line) => line.includes(pattern)) ? logs : undefined
  })
}

async function waitForCondition<T>(read: () => T | undefined | false | Promise<T | undefined | false>, timeoutMs = 5000): Promise<T> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const value = await read()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for media pipeline test condition.')
}
