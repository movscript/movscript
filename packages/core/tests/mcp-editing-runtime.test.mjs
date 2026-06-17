import assert from 'node:assert/strict'
import test from 'node:test'

import {
  handleJSONRPC,
  listTools,
  setEditingRuntimePort,
} from '../dist/mcp/node/index.js'

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

function editingProject() {
  return {
    version: 1,
    id: 'edit_project_1',
    projectId: 'project-1',
    title: 'Runtime bridge project',
    source: { kind: 'manual' },
    assets: { assets: [] },
    timeline: {
      version: 1,
      id: 'timeline-1',
      fps: 30,
      width: 1080,
      height: 1920,
      background: '#000000',
      tracks: [],
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }
}

test('MCP editing export discovery keeps RawResource and HLS publishing paths distinct', () => {
  const toolsByName = new Map(listTools().map((tool) => [tool.name, tool]))
  for (const name of [
    'editing_task_render_create',
    'editing_task_hls_create',
    'editing_task_transcode_create',
    'editing_task_reframe_create',
  ]) {
    const tool = toolsByName.get(name)
    assert.ok(tool, `${name} should be registered`)
    assert.ok(tool.inputSchema?.properties?.projectId, `${name} should expose projectId for task workspace placement`)
    assert.ok(tool.inputSchema?.properties?.project_id, `${name} should expose project_id for task workspace placement`)
  }
  assert.match(String(toolsByName.get('editing_task_transcode_create')?.description), /projectId/)
  assert.match(String(toolsByName.get('editing_task_reframe_create')?.description), /projectId/)
  for (const name of [
    'editing_task_get',
    'editing_task_cancel',
    'editing_task_logs_get',
    'editing_export_import_resource',
    'editing_export_save_local',
    'editing_export_publish_hls',
  ]) {
    const tool = toolsByName.get(name)
    assert.ok(tool, `${name} should be registered`)
    assert.ok(tool.inputSchema?.properties?.projectId, `${name} should expose projectId for task workspace recovery`)
    assert.ok(tool.inputSchema?.properties?.project_id, `${name} should expose project_id for task workspace recovery`)
    assert.match(String(tool.description), /projectId/)
  }

  assert.match(String(toolsByName.get('editing_export_import_resource')?.description), /HLS manifests must use editing_export_publish_hls/)
  assert.match(String(toolsByName.get('editing_export_import_resource')?.description), /MediaStreamArtifact/)
  assert.match(String(toolsByName.get('editing_export_publish_hls')?.description), /HLS manifest\/segments/)
  assert.match(String(toolsByName.get('editing_export_publish_hls')?.description), /MediaStreamArtifact/)
  assert.match(String(toolsByName.get('editing_export_save_local')?.description), /complete HLS bundle/)
  assert.ok(toolsByName.get('editing_export_save_local')?.inputSchema?.properties?.saveDirectory)
  assert.ok(toolsByName.get('editing_export_save_local')?.inputSchema?.properties?.save_directory)
  assert.ok(toolsByName.get('editing_export_save_local')?.inputSchema?.properties?.hlsDirectory)
  assert.ok(toolsByName.get('editing_export_save_local')?.inputSchema?.properties?.segmentPaths)
  assert.match(String(toolsByName.get('editing_export_create_candidate')?.description), /RawResource-backed/)
  assert.match(String(toolsByName.get('editing_export_create_candidate')?.description), /future domain candidate schema extension/)
  assert.equal(toolsByName.get('editing_export_create_candidate')?.inputSchema?.properties?.streamId?.description.includes('Known unsupported HLS MediaStreamArtifact ID'), true)
})

test('MCP editing task tools delegate to the registered Electron editing runtime port', async () => {
  const capturedRequests = []
  const capturedPublishRequests = []
  const capturedImportRequests = []
  const capturedSaveLocalRequests = []
  const capturedTaskLookups = []
  const capturedTaskLogLookups = []
  const capturedTaskCancels = []
  const previous = setEditingRuntimePort({
    async getCapabilities() {
      return {
        status: 'ok',
        runtime: 'electron_media_pipeline',
        available: true,
        ffmpeg: {
          available: true,
          path: '/usr/local/bin/ffmpeg',
          version: 'ffmpeg version test',
          platform: 'darwin',
          arch: 'arm64',
        },
        supportedTaskTypes: ['timeline_render', 'timeline_hls', 'media_transcode', 'media_reframe'],
        supported_task_types: ['timeline_render', 'timeline_hls', 'media_transcode', 'media_reframe'],
        supportedOutputs: ['mp4', 'hls'],
        supported_outputs: ['mp4', 'hls'],
        localHlsPreview: true,
        local_hls_preview: true,
        projectStore: true,
        project_store: true,
      }
    },
    async createTask(request) {
      capturedRequests.push(request)
      return {
        taskId: 'timeline_render_1',
        projectId: request.projectId,
        taskType: request.taskType,
        status: 'queued',
        progressPercent: 0,
        currentStep: 'queued',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      }
    },
    async getTask(taskId, options) {
      capturedTaskLookups.push({ taskId, options })
      if (taskId === 'missing_hls_task') return undefined
      if (taskId === 'timeline_hls_1') {
        return {
          taskId,
          projectId: 'project-1',
          taskType: 'timeline_hls',
          status: 'succeeded',
          progressPercent: 100,
          currentStep: 'succeeded',
          outputPath: '/tmp/hls/index.m3u8',
          hlsManifestPath: '/tmp/hls/index.m3u8',
          hls_manifest_path: '/tmp/hls/index.m3u8',
          hlsSegmentPaths: ['/tmp/hls/segment-00000.ts'],
          hls_segment_paths: ['/tmp/hls/segment-00000.ts'],
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        }
      }
      if (taskId === 'timeline_render_succeeded') {
        return {
          taskId,
          projectId: 'project-1',
          taskType: 'timeline_render',
          status: 'succeeded',
          progressPercent: 100,
          currentStep: 'succeeded',
          outputPath: '/tmp/rendered.mp4',
          outputName: 'rendered.mp4',
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        }
      }
      return {
        taskId,
        projectId: 'project-1',
        taskType: 'timeline_render',
        status: 'running',
        progressPercent: 42,
        currentStep: 'rendering',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      }
    },
    async cancelTask(taskId, options) {
      capturedTaskCancels.push({ taskId, options })
      return {
        taskId,
        projectId: 'project-1',
        taskType: 'timeline_render',
        status: 'canceled',
        progressPercent: 100,
        currentStep: 'canceled',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      }
    },
    async getTaskLogs(taskId, options) {
      capturedTaskLogLookups.push({ taskId, options })
      return {
        status: 'ok',
        taskId,
        logPath: '/tmp/events.jsonl',
        logs: ['{"event":"task.queued"}', '{"event":"task.succeeded"}'],
        text: '{"event":"task.queued"}\n{"event":"task.succeeded"}\n',
      }
    },
    async saveProject(editingProject) {
      return {
        status: 'ok',
        editingProject,
        editing_project: editingProject,
        projectPath: `/tmp/${editingProject.id}.json`,
        project_path: `/tmp/${editingProject.id}.json`,
      }
    },
    async getProject(input) {
      return {
        status: 'ok',
        editingProject: {
          ...editingProject(),
          projectId: input.projectId,
          id: input.editingProjectId,
        },
        editing_project: {
          ...editingProject(),
          projectId: input.projectId,
          id: input.editingProjectId,
        },
        projectPath: `/tmp/${input.editingProjectId}.json`,
        project_path: `/tmp/${input.editingProjectId}.json`,
      }
    },
    async importExportResource(request) {
      capturedImportRequests.push(request)
      return {
        status: 'ok',
        resourceId: 77,
        resource_id: 77,
        resource: { id: 77, filename: request.filename },
        outputPath: request.outputPath,
        output_path: request.outputPath,
        filename: request.filename,
        mimeType: request.mimeType,
        mime_type: request.mimeType,
      }
    },
    async saveLocalExport(request) {
      capturedSaveLocalRequests.push(request)
      return {
        status: 'ok',
        outputPath: request.outputPath,
        output_path: request.outputPath,
        savePath: request.savePath,
        save_path: request.savePath,
        saveDirectory: request.saveDirectory,
        save_directory: request.saveDirectory,
        manifestPath: request.saveDirectory ? `${request.saveDirectory}/index.m3u8` : undefined,
        manifest_path: request.saveDirectory ? `${request.saveDirectory}/index.m3u8` : undefined,
        savedFiles: request.saveDirectory ? [`${request.saveDirectory}/index.m3u8`, `${request.saveDirectory}/segment-00000.ts`] : undefined,
        saved_files: request.saveDirectory ? [`${request.saveDirectory}/index.m3u8`, `${request.saveDirectory}/segment-00000.ts`] : undefined,
        filename: request.filename ?? 'final-cut.mp4',
        sizeBytes: 123,
        size_bytes: 123,
      }
    },
    async publishHlsStream(request) {
      capturedPublishRequests.push(request)
      return {
        status: 'ok',
        streamId: 41,
        stream_id: 41,
        stream: { id: 41, title: request.title },
        media_stream: { id: 41, title: request.title },
        manifestUrl: '/api/v1/media/streams/41/manifest.m3u8',
        manifest_url: '/api/v1/media/streams/41/manifest.m3u8',
        segmentBaseUrl: '/api/v1/media/streams/41/segments/',
        segment_base_url: '/api/v1/media/streams/41/segments/',
        segments: ['segment-00000.ts'],
      }
    },
  })

  try {
    const savedProject = await callTool('editing_project_save', {
      editing_project: editingProject(),
    })
    assert.equal(savedProject.status, 'ok')
    assert.equal(savedProject.editingProject.id, 'edit_project_1')
    assert.equal(savedProject.projectPath, '/tmp/edit_project_1.json')

    const loadedProject = await callTool('editing_project_get', {
      projectId: 'project-1',
      editingProjectId: 'edit_project_1',
    })
    assert.equal(loadedProject.status, 'ok')
    assert.equal(loadedProject.editingProject.id, 'edit_project_1')

    const capabilities = await callTool('editing_runtime_capabilities_get', {})
    assert.equal(capabilities.status, 'ok')
    assert.equal(capabilities.runtime, 'electron_media_pipeline')
    assert.equal(capabilities.available, true)
    assert.equal(capabilities.ffmpeg.available, true)
    assert.equal(capabilities.ffmpeg.version, 'ffmpeg version test')
    assert.deepEqual(capabilities.supported_task_types, ['timeline_render', 'timeline_hls', 'media_transcode', 'media_reframe'])
    assert.equal(capabilities.local_hls_preview, true)
    assert.equal(capabilities.project_store, true)

    const created = await callTool('editing_task_render_create', {
      editing_project: editingProject(),
      output: { filename: 'preview.mp4', importToResource: true, folderId: 'folder-1' },
      resourceCache: { maxBytes: 1024, maxEntries: 2 },
      resourceDownload: { attempts: 1, retryDelayMs: 0 },
    })
    assert.equal(created.status, 'ok')
    assert.equal(created.task.taskId, 'timeline_render_1')
    assert.equal(created.task.taskType, 'timeline_render')
    assert.equal(capturedRequests.length, 1)
    assert.equal(capturedRequests[0].projectId, 'project-1')
    assert.equal(capturedRequests[0].taskType, 'timeline_render')
    assert.equal(capturedRequests[0].output.filename, 'preview.mp4')
    assert.equal(capturedRequests[0].output.format, 'mp4')
    assert.equal(capturedRequests[0].output.importToResource, true)
    assert.equal(capturedRequests[0].output.folderId, 'folder-1')
    assert.deepEqual(capturedRequests[0].resourceCache, { maxBytes: 1024, maxEntries: 2 })
    assert.deepEqual(capturedRequests[0].resourceDownload, { attempts: 1, retryDelayMs: 0 })
    assert.equal(capturedRequests[0].projectId, 'project-1')
    assert.equal(capturedRequests[0].editingProject.id, 'edit_project_1')
    assert.equal(capturedRequests[0].timeline.id, 'timeline-1')

    const hlsCreated = await callTool('editing_task_hls_create', {
      editing_project: editingProject(),
      output: {
        filename: 'preview.m3u8',
        hlsVariants: [{ name: '360p', width: 640, height: 360, videoBitrateKbps: 900 }],
      },
    })
    assert.equal(hlsCreated.status, 'ok')
    assert.equal(hlsCreated.task.taskType, 'timeline_hls')
    assert.equal(capturedRequests.length, 2)
    assert.equal(capturedRequests[1].taskType, 'timeline_hls')
    assert.equal(capturedRequests[1].projectId, 'project-1')
    assert.equal(capturedRequests[1].output.format, 'hls')
    assert.equal(capturedRequests[1].output.filename, 'preview.m3u8')
    assert.deepEqual(capturedRequests[1].output.hlsVariants, [{ name: '360p', width: 640, height: 360, videoBitrateKbps: 900 }])

    const missingTranscodeProject = await callToolResponse('editing_task_transcode_create', {
      source: {
        id: 'source-video',
        sourceKind: 'local_file',
        assetType: 'video',
        localPath: '/tmp/source.mov',
      },
      output: { filename: 'transcoded.mp4' },
    })
    assert.equal(missingTranscodeProject?.result, undefined)
    assert.match(missingTranscodeProject?.error?.message ?? '', /projectId is required/)

    const missingReframeProject = await callToolResponse('editing_task_reframe_create', {
      source: {
        id: 'wide-video',
        sourceKind: 'local_file',
        assetType: 'video',
        localPath: '/tmp/wide.mp4',
      },
      target: '9:16',
      mode: 'crop',
      output: { filename: 'vertical.mp4' },
    })
    assert.equal(missingReframeProject?.result, undefined)
    assert.match(missingReframeProject?.error?.message ?? '', /projectId is required/)
    assert.equal(capturedRequests.length, 2)

    const transcodeCreated = await callTool('editing_task_transcode_create', {
      projectId: 'project-1',
      source: {
        id: 'source-video',
        sourceKind: 'local_file',
        assetType: 'video',
        localPath: '/tmp/source.mov',
      },
      output: {
        filename: 'transcoded.mp4',
        videoCodec: 'libx264',
        audioCodec: 'aac',
        videoBitrateKbps: 1200,
      },
    })
    assert.equal(transcodeCreated.status, 'ok')
    assert.equal(transcodeCreated.task.taskType, 'media_transcode')
    assert.equal(capturedRequests.length, 3)
    assert.equal(capturedRequests[2].taskType, 'media_transcode')
    assert.equal(capturedRequests[2].projectId, 'project-1')
    assert.equal(capturedRequests[2].source.id, 'source-video')
    assert.equal(capturedRequests[2].output.filename, 'transcoded.mp4')
    assert.equal(capturedRequests[2].transcode.videoCodec, 'libx264')
    assert.equal(capturedRequests[2].transcode.audioCodec, 'aac')
    assert.equal(capturedRequests[2].transcode.videoBitrateKbps, 1200)

    const reframeCreated = await callTool('editing_task_reframe_create', {
      projectId: 'project-1',
      source: {
        id: 'wide-video',
        sourceKind: 'local_file',
        assetType: 'video',
        localPath: '/tmp/wide.mp4',
      },
      target: '9:16',
      mode: 'crop',
      output: {
        filename: 'vertical.mp4',
        width: 1080,
        height: 1920,
      },
    })
    assert.equal(reframeCreated.status, 'ok')
    assert.equal(reframeCreated.task.taskType, 'media_reframe')
    assert.equal(capturedRequests.length, 4)
    assert.equal(capturedRequests[3].taskType, 'media_reframe')
    assert.equal(capturedRequests[3].projectId, 'project-1')
    assert.equal(capturedRequests[3].source.id, 'wide-video')
    assert.equal(capturedRequests[3].target, '9:16')
    assert.equal(capturedRequests[3].mode, 'crop')
    assert.equal(capturedRequests[3].reframe.target, '9:16')
    assert.equal(capturedRequests[3].reframe.mode, 'crop')
    assert.equal(capturedRequests[3].reframe.width, 1080)
    assert.equal(capturedRequests[3].reframe.height, 1920)

    const loaded = await callTool('editing_task_get', { task_id: 'timeline_render_1', projectId: 'project-1' })
    assert.equal(loaded.status, 'ok')
    assert.equal(loaded.task.status, 'running')
    assert.equal(loaded.task.progressPercent, 42)
    assert.deepEqual(capturedTaskLookups.at(-1), { taskId: 'timeline_render_1', options: { projectId: 'project-1' } })

    const canceled = await callTool('editing_task_cancel', { taskId: 'timeline_render_1', projectId: 'project-1' })
    assert.equal(canceled.status, 'ok')
    assert.equal(canceled.task.status, 'canceled')
    assert.deepEqual(capturedTaskCancels.at(-1), { taskId: 'timeline_render_1', options: { projectId: 'project-1' } })

    const logs = await callTool('editing_task_logs_get', { task_id: 'timeline_render_1', projectId: 'project-1' })
    assert.equal(logs.status, 'ok')
    assert.equal(logs.task_id, 'timeline_render_1')
    assert.deepEqual(logs.logs, ['{"event":"task.queued"}', '{"event":"task.succeeded"}'])
    assert.equal(logs.logPath, '/tmp/events.jsonl')
    assert.deepEqual(capturedTaskLogLookups.at(-1), { taskId: 'timeline_render_1', options: { projectId: 'project-1' } })

    const imported = await callTool('editing_export_import_resource', {
      outputPath: '/tmp/export.mp4',
      filename: 'export.mp4',
      mimeType: 'video/mp4',
      folderId: 'folder-1',
      operation: 'editing_export_import',
      sourceResourceId: 66,
      params: { task_id: 'task-1', editing_project_id: 'edit_project_1' },
    })
    assert.equal(imported.status, 'ok')
    assert.equal(imported.resourceId, 77)
    assert.equal(imported.outputPath, '/tmp/export.mp4')
    assert.equal(imported.filename, 'export.mp4')
    assert.equal(capturedImportRequests.length, 1)
    assert.equal(capturedImportRequests[0].operation, 'editing_export_import')
    assert.equal(capturedImportRequests[0].sourceResourceId, 66)
    assert.deepEqual(capturedImportRequests[0].params, { task_id: 'task-1', editing_project_id: 'edit_project_1' })

    const importedFromTask = await callTool('editing_export_import_resource', {
      taskId: 'timeline_render_succeeded',
      projectId: 'project-1',
      folderId: 'folder-task',
      operation: 'editing_export_import',
      sourceResourceId: 67,
      params: { task_id: 'timeline_render_succeeded' },
    })
    assert.equal(importedFromTask.status, 'ok')
    assert.equal(importedFromTask.resourceId, 77)
    assert.equal(importedFromTask.outputPath, '/tmp/rendered.mp4')
    assert.equal(importedFromTask.filename, 'rendered.mp4')
    assert.equal(capturedImportRequests.length, 2)
    assert.equal(capturedImportRequests[1].outputPath, '/tmp/rendered.mp4')
    assert.equal(capturedImportRequests[1].filename, 'rendered.mp4')
    assert.equal(capturedImportRequests[1].folderId, 'folder-task')
    assert.equal(capturedImportRequests[1].sourceResourceId, 67)
    assert.deepEqual(capturedImportRequests[1].params, { task_id: 'timeline_render_succeeded' })
    assert.deepEqual(capturedTaskLookups.at(-1), { taskId: 'timeline_render_succeeded', options: { projectId: 'project-1' } })

    const savedLocal = await callTool('editing_export_save_local', {
      taskId: 'timeline_render_succeeded',
      projectId: 'project-1',
      savePath: '/Users/test/Desktop/final-cut.mp4',
    })
    assert.equal(savedLocal.status, 'ok')
    assert.equal(savedLocal.outputPath, '/tmp/rendered.mp4')
    assert.equal(savedLocal.savePath, '/Users/test/Desktop/final-cut.mp4')
    assert.equal(savedLocal.persisted, true)
    assert.equal(savedLocal.uploaded, false)
    assert.equal(savedLocal.candidate_created, false)
    assert.equal(capturedSaveLocalRequests.length, 1)
    assert.deepEqual(capturedSaveLocalRequests[0], {
      outputPath: '/tmp/rendered.mp4',
      output_path: '/tmp/rendered.mp4',
      projectId: 'project-1',
      project_id: 'project-1',
      taskId: 'timeline_render_succeeded',
      task_id: 'timeline_render_succeeded',
      savePath: '/Users/test/Desktop/final-cut.mp4',
      save_path: '/Users/test/Desktop/final-cut.mp4',
      filename: 'rendered.mp4',
    })
    assert.deepEqual(capturedTaskLookups.at(-1), { taskId: 'timeline_render_succeeded', options: { projectId: 'project-1' } })

    const savedHlsLocal = await callTool('editing_export_save_local', {
      taskId: 'timeline_hls_1',
      projectId: 'project-1',
      saveDirectory: '/Users/test/Desktop/preview-hls',
    })
    assert.equal(savedHlsLocal.status, 'ok')
    assert.equal(savedHlsLocal.outputPath, '/tmp/hls/index.m3u8')
    assert.equal(savedHlsLocal.saveDirectory, '/Users/test/Desktop/preview-hls')
    assert.equal(savedHlsLocal.manifestPath, '/Users/test/Desktop/preview-hls/index.m3u8')
    assert.deepEqual(capturedSaveLocalRequests[1], {
      outputPath: '/tmp/hls/index.m3u8',
      output_path: '/tmp/hls/index.m3u8',
      projectId: 'project-1',
      project_id: 'project-1',
      taskId: 'timeline_hls_1',
      task_id: 'timeline_hls_1',
      saveDirectory: '/Users/test/Desktop/preview-hls',
      save_directory: '/Users/test/Desktop/preview-hls',
      segmentPaths: ['/tmp/hls/segment-00000.ts'],
      segment_paths: ['/tmp/hls/segment-00000.ts'],
    })
    assert.deepEqual(capturedTaskLookups.at(-1), { taskId: 'timeline_hls_1', options: { projectId: 'project-1' } })

    const pendingImport = await callTool('editing_export_import_resource', {
      taskId: 'timeline_render_1',
      projectId: 'project-1',
    })
    assert.equal(pendingImport.status, 'pending_output')
    assert.equal(pendingImport.task_id, 'timeline_render_1')
    assert.equal(capturedImportRequests.length, 2)

    const hlsImport = await callTool('editing_export_import_resource', {
      taskId: 'timeline_hls_1',
      projectId: 'project-1',
    })
    assert.equal(hlsImport.status, 'unsupported_output')
    assert.equal(hlsImport.code, 'USE_EDITING_EXPORT_PUBLISH_HLS')
    assert.equal(hlsImport.outputPath, '/tmp/hls/index.m3u8')
    assert.equal(capturedImportRequests.length, 2)

    const explicitHlsImport = await callTool('editing_export_import_resource', {
      outputPath: '/tmp/hls/manual.m3u8',
      filename: 'manual.m3u8',
    })
    assert.equal(explicitHlsImport.status, 'unsupported_output')
    assert.equal(explicitHlsImport.code, 'USE_EDITING_EXPORT_PUBLISH_HLS')
    assert.equal(explicitHlsImport.outputPath, '/tmp/hls/manual.m3u8')
    assert.equal(capturedImportRequests.length, 2)

    const missingHlsPublish = await callTool('editing_export_publish_hls', {
      taskId: 'missing_hls_task',
      projectId: 'project-1',
    })
    assert.equal(missingHlsPublish.status, 'not_found')
    assert.equal(missingHlsPublish.task_id, 'missing_hls_task')
    assert.match(missingHlsPublish.message, /projectId/)
    assert.deepEqual(capturedTaskLookups.at(-1), { taskId: 'missing_hls_task', options: { projectId: 'project-1' } })

    const pendingHlsPublish = await callTool('editing_export_publish_hls', {
      taskId: 'timeline_render_1',
      projectId: 'project-1',
    })
    assert.equal(pendingHlsPublish.status, 'pending_output')
    assert.equal(pendingHlsPublish.task_id, 'timeline_render_1')
    assert.match(pendingHlsPublish.message, /complete HLS/)
    assert.deepEqual(capturedTaskLookups.at(-1), { taskId: 'timeline_render_1', options: { projectId: 'project-1' } })

    const published = await callTool('editing_export_publish_hls', {
      taskId: 'timeline_hls_1',
      title: 'Preview HLS',
      projectId: 'project-1',
      sourceResourceId: 88,
      durationMs: 1234,
      width: 1080,
      height: 1920,
    })
    assert.equal(published.status, 'ok')
    assert.equal(published.streamId, 41)
    assert.equal(published.manifestUrl, '/api/v1/media/streams/41/manifest.m3u8')
    assert.equal(capturedPublishRequests.length, 1)
    assert.equal(capturedPublishRequests[0].manifestPath, '/tmp/hls/index.m3u8')
    assert.deepEqual(capturedPublishRequests[0].segmentPaths, ['/tmp/hls/segment-00000.ts'])
    assert.equal(capturedPublishRequests[0].title, 'Preview HLS')
    assert.equal(capturedPublishRequests[0].taskId, 'timeline_hls_1')
    assert.equal(capturedPublishRequests[0].task_id, 'timeline_hls_1')
    assert.equal(capturedPublishRequests[0].projectId, 'project-1')
    assert.equal(capturedPublishRequests[0].sourceResourceId, 88)
    assert.equal(capturedPublishRequests[0].durationMs, 1234)
    assert.deepEqual(capturedTaskLookups.at(-1), { taskId: 'timeline_hls_1', options: { projectId: 'project-1' } })
  } finally {
    setEditingRuntimePort(previous)
  }
})

test('MCP editing task tools keep a diagnostic response when no Electron runtime is registered', async () => {
  const previous = setEditingRuntimePort(undefined)
  try {
    const saveResult = await callTool('editing_project_save', {
      editing_project: editingProject(),
    })
    assert.equal(saveResult.status, 'unsupported_runtime')
    assert.equal(saveResult.code, 'ELECTRON_EDITING_RUNTIME_REQUIRED')

    const importResult = await callTool('editing_export_import_resource', {
      outputPath: '/tmp/export.mp4',
    })
    assert.equal(importResult.status, 'unsupported_runtime')
    assert.equal(importResult.code, 'ELECTRON_EDITING_RUNTIME_REQUIRED')

    const publishResult = await callTool('editing_export_publish_hls', {
      manifestPath: '/tmp/hls/index.m3u8',
      segmentPaths: ['/tmp/hls/segment-00000.ts'],
    })
    assert.equal(publishResult.status, 'unsupported_runtime')
    assert.equal(publishResult.code, 'ELECTRON_EDITING_RUNTIME_REQUIRED')

    const capabilities = await callTool('editing_runtime_capabilities_get', {})
    assert.equal(capabilities.status, 'unsupported_runtime')
    assert.equal(capabilities.code, 'ELECTRON_EDITING_RUNTIME_REQUIRED')

    const result = await callTool('editing_task_render_create', {
      editing_project: editingProject(),
      output: { filename: 'preview.mp4' },
    })
    assert.equal(result.status, 'unsupported_runtime')
    assert.equal(result.code, 'ELECTRON_EDITING_RUNTIME_REQUIRED')
  } finally {
    setEditingRuntimePort(previous)
  }
})
