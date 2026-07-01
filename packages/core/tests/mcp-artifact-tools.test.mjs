import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  handleJSONRPC,
  listTools,
  setEditingRuntimePort,
} from '../dist/mcp/node/index.js'
import {
  setMovScriptBackendAPIBaseURL,
} from '../dist/backend/node/index.js'

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

test('MCP artifact hosting tools are registered as system tools', () => {
  const tools = listTools()
  const names = new Set(tools.map((tool) => tool.name))
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]))
  assert.equal(names.has('system_artifact_upload_export'), true)
  assert.equal(names.has('system_artifact_upload_hls_stream'), true)
  assert.equal(names.has('system_artifact_get_stream'), true)
  assert.match(String(toolsByName.get('system_artifact_upload_export')?.description), /HLS manifests must use system_artifact_upload_hls_stream/)
  assert.match(String(toolsByName.get('system_artifact_upload_export')?.description), /MediaStreamArtifact/)
  assert.match(String(toolsByName.get('system_artifact_upload_export')?.description), /mediaProjectId/)
  assert.ok(toolsByName.get('system_artifact_upload_export')?.inputSchema?.properties?.mediaProjectId)
  assert.ok(toolsByName.get('system_artifact_upload_export')?.inputSchema?.properties?.media_project_id)
  assert.ok(toolsByName.get('system_artifact_upload_export')?.inputSchema?.properties?.projectId)
  assert.ok(toolsByName.get('system_artifact_upload_export')?.inputSchema?.properties?.project_id)
  assert.match(String(toolsByName.get('system_artifact_upload_hls_stream')?.description), /mediaProjectId/)
  assert.ok(toolsByName.get('system_artifact_upload_hls_stream')?.inputSchema?.properties?.mediaProjectId)
  assert.ok(toolsByName.get('system_artifact_upload_hls_stream')?.inputSchema?.properties?.media_project_id)
  assert.ok(toolsByName.get('system_artifact_upload_hls_stream')?.inputSchema?.properties?.projectId)
  assert.ok(toolsByName.get('system_artifact_upload_hls_stream')?.inputSchema?.properties?.project_id)
})

test('system_artifact_upload_export uploads explicit local export artifact to RawResource hosting', async () => {
  const originalFetch = globalThis.fetch
  const dir = await mkdtemp(join(tmpdir(), 'movscript-artifact-export-'))
  setMovScriptBackendAPIBaseURL('http://artifact-tools.test/api/v1')
  try {
    const outputPath = join(dir, 'export.mp4')
    await writeFile(outputPath, 'mp4 bytes')

    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://artifact-tools.test/api/v1/resources/upload')
      assert.equal(init?.method, 'POST')
      assert.ok(init?.body instanceof FormData)
      const form = init.body
      assert.equal(form.get('folder_id'), 'folder-1')
      assert.ok(form.get('file') instanceof Blob)
      const derivative = JSON.parse(String(form.get('derivative')))
      assert.equal(derivative.operation, 'timeline_render')
      assert.equal(derivative.tool, 'system_artifact_upload_export')
      assert.deepEqual(derivative.input_resource_ids, [11, 12])
      assert.deepEqual(derivative.params, { task_id: 'render-1' })
      return new Response(JSON.stringify({
        ID: 55,
        name: 'final.mp4',
        mime_type: 'video/mp4',
      }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    }

    const result = await callTool('system_artifact_upload_export', {
      outputPath,
      filename: 'final.mp4',
      mimeType: 'video/mp4',
      folderId: 'folder-1',
      operation: 'timeline_render',
      sourceResourceIds: [11, '12'],
      params: { task_id: 'render-1' },
    })
    assert.equal(result.status, 'ok')
    assert.equal(result.resourceId, 55)
    assert.equal(result.outputPath, outputPath)
    assert.equal(result.filename, 'final.mp4')
    assert.equal(result.mimeType, 'video/mp4')
    assert.equal(result.folderId, 'folder-1')
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(dir, { recursive: true, force: true })
  }
})

test('system_artifact_upload_export resolves Media Pipeline resultId before RawResource upload', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-artifact-result-export-'))
  const requests = []
  const outputPath = join(dir, 'result-output.mp4')
  await writeFile(outputPath, 'mp4 bytes from result')
  const server = createServer((req, res) => {
    if (req.url === '/v1/media-pipeline/results/get' && req.method === 'POST') {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        requests.push(String(req.url))
        assert.deepEqual(JSON.parse(body || '{}'), { resultId: 'result_mp4_1' })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          schema: 'movscript.media-pipeline-result-get.v1',
          status: 'found',
          result: {
            schema: 'movscript.media-pipeline-result.v1',
            resultId: 'result_mp4_1',
            result_id: 'result_mp4_1',
            projectId: 'project-artifact',
            project_id: 'project-artifact',
            taskId: 'task-render-1',
            task_id: 'task-render-1',
            backend: 'media_editing_project',
            kind: 'mp4',
            outputPath,
            output_path: outputPath,
            outputName: 'result-output.mp4',
            output_name: 'result-output.mp4',
          },
        }))
      })
      return
    }
    if (req.url === '/api/v1/resources/upload' && req.method === 'POST') {
      requests.push(String(req.url))
      req.resume()
      req.on('end', () => {
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          ID: 56,
          name: 'result-output.mp4',
          mime_type: 'video/mp4',
        }))
      })
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  const baseURL = `http://127.0.0.1:${address.port}`
  setMovScriptBackendAPIBaseURL(`${baseURL}/api/v1`)
  try {
    const result = await callTool('system_artifact_upload_export', {
      resultId: 'result_mp4_1',
      mediaPipelineServiceURL: baseURL,
    })
    assert.equal(result.status, 'ok')
    assert.equal(result.resource_id, 56)
    assert.equal(result.output_path, outputPath)
    assert.equal(result.result_id, 'result_mp4_1')
    assert.deepEqual(requests, [
      '/v1/media-pipeline/results/get',
      '/api/v1/resources/upload',
    ])
  } finally {
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await new Promise((resolveClose) => server.close(resolveClose))
    await rm(dir, { recursive: true, force: true })
  }
})

test('system_artifact_upload_export returns structured diagnostics for task output lookup mode', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('system_artifact_upload_export must not upload when task output lookup is incomplete')
  }

  const previous = setEditingRuntimePort(undefined)
  try {
    const noRuntime = await callTool('system_artifact_upload_export', {
      taskId: 'render_task_1',
      projectId: 'project-1',
      filename: 'final.mp4',
    })
    assert.equal(noRuntime.status, 'unsupported_runtime')
    assert.equal(noRuntime.code, 'ELECTRON_EDITING_RUNTIME_REQUIRED')
    assert.equal(noRuntime.task_id, 'render_task_1')
  } finally {
    setEditingRuntimePort(previous)
  }

  const capturedLookups = []
  const runtimePrevious = setEditingRuntimePort({
    async getTask(taskId, options) {
      capturedLookups.push({ taskId, options })
      if (taskId === 'missing_render_task') return undefined
      return {
        taskId,
        projectId: 'project-1',
        taskType: 'timeline_render',
        status: 'running',
        progressPercent: 40,
        currentStep: 'rendering',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      }
    },
  })
  try {
    const missing = await callTool('system_artifact_upload_export', {
      taskId: 'missing_render_task',
      mediaProjectId: 'project-1',
    })
    assert.equal(missing.status, 'not_found')
    assert.equal(missing.task_id, 'missing_render_task')
    assert.match(missing.message, /mediaProjectId/)
    assert.deepEqual(capturedLookups.at(-1), {
      taskId: 'missing_render_task',
      options: { projectId: 'project-1' },
    })

    const pending = await callTool('system_artifact_upload_export', {
      taskId: 'render_task_pending',
      mediaProjectId: 'project-1',
    })
    assert.equal(pending.status, 'pending_output')
    assert.equal(pending.task_id, 'render_task_pending')
    assert.match(pending.message, /output path/)
    assert.deepEqual(capturedLookups.at(-1), {
      taskId: 'render_task_pending',
      options: { projectId: 'project-1' },
    })
  } finally {
    setEditingRuntimePort(runtimePrevious)
    globalThis.fetch = originalFetch
  }
})

test('system_artifact_get_stream reads hosted MediaStreamArtifact metadata', async () => {
  const originalFetch = globalThis.fetch
  setMovScriptBackendAPIBaseURL('http://artifact-tools.test/api/v1')
  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://artifact-tools.test/api/v1/media/streams/41')
      assert.equal(init?.method ?? 'GET', 'GET')
      return new Response(JSON.stringify({
        stream_id: 41,
        manifest_url: '/api/v1/media/streams/41/manifest.m3u8',
        segment_base_url: '/api/v1/media/streams/41/segments/',
        stream: { ID: 41, title: 'Preview HLS' },
        segments: [{ name: 'init.mp4' }, { name: 'segment-00000.m4s' }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    const result = await callTool('system_artifact_get_stream', { streamId: 41 })
    assert.equal(result.status, 'ok')
    assert.equal(result.streamId, 41)
    assert.equal(result.manifestUrl, '/api/v1/media/streams/41/manifest.m3u8')
    assert.equal(result.segmentBaseUrl, '/api/v1/media/streams/41/segments/')
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
  }
})

test('system_artifact_upload_export rejects HLS manifest artifacts as RawResource uploads', async () => {
  const originalFetch = globalThis.fetch
  const dir = await mkdtemp(join(tmpdir(), 'movscript-artifact-export-hls-'))
  setMovScriptBackendAPIBaseURL('http://artifact-tools.test/api/v1')
  try {
    const outputPath = join(dir, 'index.m3u8')
    await writeFile(outputPath, '#EXTM3U\n')

    globalThis.fetch = async () => {
      throw new Error('system_artifact_upload_export must not upload HLS manifests to /resources/upload')
    }

    const result = await callTool('system_artifact_upload_export', {
      outputPath,
      filename: 'index.m3u8',
    })
    assert.equal(result.status, 'unsupported_output')
    assert.equal(result.code, 'USE_SYSTEM_ARTIFACT_UPLOAD_HLS_STREAM')
    assert.equal(result.outputPath, outputPath)
    assert.equal(result.filename, 'index.m3u8')
    assert.equal(result.mimeType, 'application/vnd.apple.mpegurl')
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(dir, { recursive: true, force: true })
  }
})

test('system_artifact_upload_hls_stream uploads explicit local HLS artifacts to backend hosting', async () => {
  const originalFetch = globalThis.fetch
  const dir = await mkdtemp(join(tmpdir(), 'movscript-artifact-hls-'))
  setMovScriptBackendAPIBaseURL('http://artifact-tools.test/api/v1')
  try {
    const manifestPath = join(dir, 'index.m3u8')
    const initPath = join(dir, 'init.mp4')
    const segmentPath = join(dir, 'segment-00000.m4s')
    await writeFile(manifestPath, '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:1,\nsegment-00000.m4s\n')
    await writeFile(initPath, 'init')
    await writeFile(segmentPath, 'segment')

    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://artifact-tools.test/api/v1/media/streams/uploads')
      assert.equal(init?.method, 'POST')
      assert.ok(init?.body instanceof FormData)
      const form = init.body
      assert.equal(form.get('title'), 'Preview HLS')
      assert.equal(form.get('task_id'), 'timeline_hls_1')
      assert.equal(form.get('project_id'), '7')
      assert.equal(form.get('expires_in_seconds'), '3600')
      assert.ok(form.get('manifest') instanceof Blob)
      assert.equal(form.getAll('segments').length, 2)
      return new Response(JSON.stringify({
        stream_id: 42,
        manifest_url: '/api/v1/media/streams/42/manifest.m3u8',
        segment_base_url: '/api/v1/media/streams/42/segments/',
        stream: { ID: 42, title: 'Preview HLS' },
        segments: [{ name: 'init.mp4' }, { name: 'segment-00000.m4s' }],
      }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    }

    const result = await callTool('system_artifact_upload_hls_stream', {
      manifestPath,
      segmentPaths: [initPath, segmentPath],
      title: 'Preview HLS',
      taskId: 'timeline_hls_1',
      projectId: 7,
      expiresInSeconds: 3600,
    })
    assert.equal(result.status, 'ok')
    assert.equal(result.streamId, 42)
    assert.equal(result.manifestUrl, '/api/v1/media/streams/42/manifest.m3u8')
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(dir, { recursive: true, force: true })
  }
})

test('system_artifact_upload_hls_stream resolves Media Pipeline resultId before MediaStreamArtifact upload', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'movscript-artifact-result-hls-'))
  const requests = []
  const manifestPath = join(dir, 'index.m3u8')
  const segmentPath = join(dir, 'segment-00000.ts')
  await writeFile(manifestPath, '#EXTM3U\n#EXTINF:1,\nsegment-00000.ts\n')
  await writeFile(segmentPath, 'segment bytes')
  const server = createServer((req, res) => {
    if (req.url === '/v1/media-pipeline/results/get' && req.method === 'POST') {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        requests.push(String(req.url))
        assert.deepEqual(JSON.parse(body || '{}'), { resultId: 'result_hls_1' })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          schema: 'movscript.media-pipeline-result-get.v1',
          status: 'found',
          result: {
            schema: 'movscript.media-pipeline-result.v1',
            resultId: 'result_hls_1',
            result_id: 'result_hls_1',
            projectId: 'project-artifact',
            project_id: 'project-artifact',
            taskId: 'task-hls-1',
            task_id: 'task-hls-1',
            backend: 'media_editing_project',
            kind: 'hls',
            hlsManifestPath: manifestPath,
            hls_manifest_path: manifestPath,
            hlsSegmentPaths: [segmentPath],
            hls_segment_paths: [segmentPath],
          },
        }))
      })
      return
    }
    if (req.url === '/api/v1/media/streams/uploads' && req.method === 'POST') {
      requests.push(String(req.url))
      req.resume()
      req.on('end', () => {
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          stream_id: 57,
          manifest_url: '/api/v1/media/streams/57/manifest.m3u8',
          segment_base_url: '/api/v1/media/streams/57/segments/',
          stream: { ID: 57, title: 'result hls' },
        }))
      })
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  const baseURL = `http://127.0.0.1:${address.port}`
  setMovScriptBackendAPIBaseURL(`${baseURL}/api/v1`)
  try {
    const result = await callTool('system_artifact_upload_hls_stream', {
      resultId: 'result_hls_1',
      mediaPipelineServiceURL: baseURL,
    })
    assert.equal(result.status, 'ok')
    assert.equal(result.stream_id, 57)
    assert.equal(result.result_id, 'result_hls_1')
    assert.deepEqual(requests, [
      '/v1/media-pipeline/results/get',
      '/api/v1/media/streams/uploads',
    ])
  } finally {
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await new Promise((resolveClose) => server.close(resolveClose))
    await rm(dir, { recursive: true, force: true })
  }
})

test('system_artifact_upload_hls_stream maps mediaProjectId when resolving task artifacts through editing runtime', async () => {
  const capturedLookups = []
  const capturedPublishes = []
  const previous = setEditingRuntimePort({
    async getTask(taskId, options) {
      capturedLookups.push({ taskId, options })
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
        hlsSegmentPaths: ['/tmp/hls/segment-00000.m4s'],
        hls_segment_paths: ['/tmp/hls/segment-00000.m4s'],
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      }
    },
    async publishHlsStream(request) {
      capturedPublishes.push(request)
      return {
        status: 'ok',
        streamId: 42,
        stream_id: 42,
        stream: { id: 42, title: request.title },
        media_stream: { id: 42, title: request.title },
        manifestUrl: '/api/v1/media/streams/42/manifest.m3u8',
        manifest_url: '/api/v1/media/streams/42/manifest.m3u8',
        segmentBaseUrl: '/api/v1/media/streams/42/segments/',
        segment_base_url: '/api/v1/media/streams/42/segments/',
        segments: ['segment-00000.m4s'],
      }
    },
  })
  try {
    const result = await callTool('system_artifact_upload_hls_stream', {
      taskId: 'timeline_hls_1',
      mediaProjectId: 'project-1',
      title: 'Preview HLS',
    })

    assert.equal(result.status, 'ok')
    assert.equal(result.streamId, 42)
    assert.deepEqual(capturedLookups, [{
      taskId: 'timeline_hls_1',
      options: { projectId: 'project-1' },
    }])
    assert.equal(capturedPublishes.length, 1)
    assert.equal(capturedPublishes[0].manifestPath, '/tmp/hls/index.m3u8')
    assert.deepEqual(capturedPublishes[0].segmentPaths, ['/tmp/hls/segment-00000.m4s'])
    assert.equal(capturedPublishes[0].taskId, 'timeline_hls_1')
    assert.equal(capturedPublishes[0].task_id, 'timeline_hls_1')
    assert.equal(capturedPublishes[0].projectId, 'project-1')
  } finally {
    setEditingRuntimePort(previous)
  }
})

test('system_artifact_upload_hls_stream returns structured diagnostics for missing or incomplete task HLS outputs', async () => {
  const capturedLookups = []
  const previous = setEditingRuntimePort({
    async getTask(taskId, options) {
      capturedLookups.push({ taskId, options })
      if (taskId === 'missing_hls_task') return undefined
      return {
        taskId,
        projectId: 'project-1',
        taskType: 'timeline_render',
        status: 'running',
        progressPercent: 35,
        currentStep: 'rendering',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      }
    },
    async publishHlsStream() {
      throw new Error('system_artifact_upload_hls_stream must not publish missing or incomplete task outputs')
    },
  })
  try {
    const missing = await callTool('system_artifact_upload_hls_stream', {
      taskId: 'missing_hls_task',
      mediaProjectId: 'project-1',
      title: 'Missing HLS',
    })
    assert.equal(missing.status, 'not_found')
    assert.equal(missing.task_id, 'missing_hls_task')
    assert.match(missing.message, /mediaProjectId/)
    assert.deepEqual(capturedLookups.at(-1), {
      taskId: 'missing_hls_task',
      options: { projectId: 'project-1' },
    })

    const pending = await callTool('system_artifact_upload_hls_stream', {
      taskId: 'timeline_render_1',
      mediaProjectId: 'project-1',
      title: 'Pending HLS',
    })
    assert.equal(pending.status, 'pending_output')
    assert.equal(pending.task_id, 'timeline_render_1')
    assert.match(pending.message, /complete HLS/)
    assert.deepEqual(capturedLookups.at(-1), {
      taskId: 'timeline_render_1',
      options: { projectId: 'project-1' },
    })
  } finally {
    setEditingRuntimePort(previous)
  }
})
