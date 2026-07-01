import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let server
let baseURL
let projectRequests = []
let shotRequests = []
let generationRequests = []
let artifactRequests = []
let mediaPipelineRequests = []
let mediaPipelineResults = new Map()

before(async () => {
  server = createTestServer()
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  baseURL = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise((resolveClose) => server.close(resolveClose))
})

test('system generation capability list returns shared command JSON', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-system-capabilities-'))
  const result = runMovscript(['system', 'generation', 'capability', 'list', '--home-dir', homeDir, '--json'])

  assert.equal(result.status, 0)
  assert.equal(result.json.schema, 'movscript.command_result.v1')
  assert.equal(result.json.status, 'ok')
  assert.equal(result.json.commandId, 'system.generation.capability.list')
  assert.equal(result.json.mcpToolName, 'generation_capability_list')
  assert.equal(result.json.data.capabilities.includes('image_generation'), true)
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'system',
    'generation',
    'capability',
    'list',
    '--json',
    '--home-dir',
    homeDir,
  ])
})

test('system model list exposes stable empty result for unknown capability', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-system-models-'))
  const result = runMovscript(['system', 'model', 'list', '--home-dir', homeDir, '--capability', 'not_real', '--json'])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'system.model.list')
  assert.equal(result.json.mcpToolName, 'system_model_list')
  assert.equal(result.json.data.count, 0)
  assert.deepEqual(result.json.data.model_contracts, [])
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'system',
    'model',
    'list',
    '--json',
    '--home-dir',
    homeDir,
    '--capability',
    'not_real',
  ])
})

test('production workflow returns CLI-only production gates through the product CLI', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-system-production-workflow-'))
  const result = runMovscript(['production', 'workflow', '--home-dir', homeDir, '--json'])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'system.production.workflow')
  assert.equal(result.json.mcpToolName, 'system_production_workflow')
  assert.equal(result.json.data.schema, 'movscript.production_workflow.v1')
  assert.equal(result.json.data.mode, 'cli_only')
  assert.deepEqual(result.json.data.stages.map((stage) => stage.stage_id), [
    'plan_content',
    'production_editing',
    'generate',
    'export',
  ])
  assert.ok(result.json.data.stages[0].primary_cli.some((argv) => argv.join(' ') === 'movscript workspace review --json'))
  assert.ok(result.json.data.stages[2].mcp_tools.includes('generation_submit'))
  assert.ok(result.json.data.stages[2].does_not.includes('Does not automatically adopt or select candidates.'))
  assert.ok(result.json.data.stages[3].mcp_tools.includes('system_artifact_upload_export'))
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'production',
    'workflow',
    '--json',
    '--home-dir',
    homeDir,
  ])
})

test('system generation prepare calls backend through shared command JSON', async () => {
  generationRequests = []
  const result = await runMovscriptAsync([
    'system',
    'generation',
    'prepare',
    '--server',
    baseURL,
    '--capability',
    'audio_generation',
    '--operation',
    'music_generation',
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'system.generation.prepare')
  assert.equal(result.json.mcpToolName, 'generation_prepare')
  assert.equal(result.json.data.status, 'ready')
  assert.equal(result.json.data.capability, 'audio_generation')
  assert.equal(result.json.data.scope, 'free')
  assert.equal(result.json.data.count, 1)
  assert.equal(result.json.data.models[0].model_id, 'audio:music')
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'system',
    'generation',
    'prepare',
    '--json',
    '--server',
    baseURL,
    '--capability',
    'audio_generation',
    '--operation',
    'music_generation',
  ])
  assert.deepEqual(generationRequests, [{
    method: 'GET',
    url: '/api/v1/models?capability=audio_generation&operation=music_generation&target_output=audio&resolve_intent=true',
  }])
})

test('resource library open is a top-level product CLI backed by shared command JSON', () => {
  const result = runMovscript([
    'resource',
    'library',
    'open',
    '--frontend-origin',
    'http://127.0.0.1:5173',
    '--mcp-base-url',
    'http://127.0.0.1:8765',
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'system.resource.library.open')
  assert.equal(result.json.mcpToolName, 'system_resource_library_open')
  assert.equal(result.json.data.source, 'movscript_resource_library')
  assert.equal(result.json.data.frontend_origin, 'http://127.0.0.1:5173')
  assert.equal(result.json.data.mcp_api_base_url, 'http://127.0.0.1:8765/agent-api/v1')
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'resource',
    'library',
    'open',
    '--json',
    '--frontend-origin',
    'http://127.0.0.1:5173',
    '--mcp-base-url',
    'http://127.0.0.1:8765',
  ])
})

test('artifact get-stream is a top-level product CLI backed by shared command JSON', async () => {
  artifactRequests = []
  const result = await runMovscriptAsync([
    'artifact',
    'get-stream',
    '--server',
    baseURL,
    '--stream-id',
    '41',
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'system.artifact.get_stream')
  assert.equal(result.json.mcpToolName, 'system_artifact_get_stream')
  assert.equal(result.json.data.status, 'ok')
  assert.equal(result.json.data.stream_id, 41)
  assert.equal(result.json.data.manifest_url, 'https://cdn.example/stream.m3u8')
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'artifact',
    'get-stream',
    '--json',
    '--server',
    baseURL,
    '--stream-id',
    '41',
  ])
  assert.deepEqual(artifactRequests, [{
    method: 'GET',
    url: '/api/v1/media/streams/41',
  }])
})

test('artifact upload-export resolves resultId through Media Pipeline before upload', async () => {
  artifactRequests = []
  mediaPipelineRequests = []
  mediaPipelineResults = new Map()
  const dir = mkdtempSync(join(tmpdir(), 'movscript-system-artifact-result-'))
  const outputPath = join(dir, 'result-export.mp4')
  writeFileSync(outputPath, 'result export bytes')
  mediaPipelineResults.set('result_cli_export_1', {
    resultId: 'result_cli_export_1',
    result_id: 'result_cli_export_1',
    projectId: 'project_cli_system',
    project_id: 'project_cli_system',
    taskId: 'task_cli_export',
    task_id: 'task_cli_export',
    backend: 'media_editing_project',
    kind: 'mp4',
    outputPath,
    output_path: outputPath,
  })

  const result = await runMovscriptAsync([
    'artifact',
    'upload-export',
    '--server',
    baseURL,
    '--media-pipeline-service-url',
    baseURL,
    '--result-id',
    'result_cli_export_1',
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'system.artifact.upload_export')
  assert.equal(result.json.mcpToolName, 'system_artifact_upload_export')
  assert.equal(result.json.data.status, 'ok')
  assert.equal(result.json.data.resource_id, 88)
  assert.equal(result.json.data.output_path, outputPath)
  assert.equal(result.json.data.result_id, 'result_cli_export_1')
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'artifact',
    'upload-export',
    '--json',
    '--server',
    baseURL,
    '--media-pipeline-service-url',
    baseURL,
    '--result-id',
    'result_cli_export_1',
  ])
  assert.deepEqual(mediaPipelineRequests, [{
    method: 'POST',
    url: '/v1/media-pipeline/results/get',
    body: { resultId: 'result_cli_export_1' },
  }])
  assert.deepEqual(artifactRequests, [{
    method: 'POST',
    url: '/api/v1/resources/upload',
  }])
})

test('artifact upload-hls-stream resolves resultId through Media Pipeline before upload', async () => {
  artifactRequests = []
  mediaPipelineRequests = []
  mediaPipelineResults = new Map()
  const dir = mkdtempSync(join(tmpdir(), 'movscript-system-artifact-hls-result-'))
  const manifestPath = join(dir, 'index.m3u8')
  const segmentPath = join(dir, 'segment-00000.ts')
  writeFileSync(manifestPath, '#EXTM3U\n#EXTINF:1,\nsegment-00000.ts\n')
  writeFileSync(segmentPath, 'hls segment')
  mediaPipelineResults.set('result_cli_hls_1', {
    resultId: 'result_cli_hls_1',
    result_id: 'result_cli_hls_1',
    projectId: 'project_cli_system',
    project_id: 'project_cli_system',
    taskId: 'task_cli_hls',
    task_id: 'task_cli_hls',
    backend: 'media_editing_project',
    kind: 'hls',
    hlsManifestPath: manifestPath,
    hls_manifest_path: manifestPath,
    hlsSegmentPaths: [segmentPath],
    hls_segment_paths: [segmentPath],
  })

  const result = await runMovscriptAsync([
    'artifact',
    'upload-hls-stream',
    '--server',
    baseURL,
    '--media-pipeline-service-url',
    baseURL,
    '--result-id',
    'result_cli_hls_1',
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'system.artifact.upload_hls_stream')
  assert.equal(result.json.mcpToolName, 'system_artifact_upload_hls_stream')
  assert.equal(result.json.data.status, 'ok')
  assert.equal(result.json.data.stream_id, 89)
  assert.equal(result.json.data.result_id, 'result_cli_hls_1')
  assert.deepEqual(mediaPipelineRequests, [{
    method: 'POST',
    url: '/v1/media-pipeline/results/get',
    body: { resultId: 'result_cli_hls_1' },
  }])
  assert.deepEqual(artifactRequests, [{
    method: 'POST',
    url: '/api/v1/media/streams/uploads',
  }])
})

test('project create is a top-level product CLI backed by the shared system command JSON', async () => {
  projectRequests = []
  const result = await runMovscriptAsync([
    'project',
    'create',
    '--server',
    baseURL,
    '--name',
    'Launch Film',
    '--description',
    'Campaign launch',
    '--total-episodes',
    '1',
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'system.project.create')
  assert.equal(result.json.mcpToolName, 'system_project_create')
  assert.equal(result.json.data.status, 'created')
  assert.equal(result.json.data.project.id, 42)
  assert.equal(result.json.data.project.name, 'Launch Film')
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'project',
    'create',
    '--json',
    '--server',
    baseURL,
    '--name',
    'Launch Film',
    '--description',
    'Campaign launch',
    '--total-episodes',
    '1',
  ])
  assert.deepEqual(projectRequests, [{
    method: 'POST',
    url: '/api/v1/projects',
    body: {
      name: 'Launch Film',
      description: 'Campaign launch',
      total_episodes: 1,
    },
  }])
})

test('resource image annotate returns local artifact JSON through the product CLI', () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'movscript-annotate-'))
  const outputPath = join(outputDir, 'annotated.svg')
  const sourceSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#ffffff"/></svg>'
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(sourceSVG).toString('base64')}`
  const annotations = JSON.stringify([{ type: 'rect', x: 20, y: 24, width: 120, height: 64, color: '#ef4444' }])
  const result = runMovscript([
    'resource',
    'image',
    'annotate',
    '--data-url',
    dataUrl,
    '--annotations',
    annotations,
    '--width',
    '320',
    '--height',
    '180',
    '--title',
    'CLI Annotation',
    '--output-path',
    outputPath,
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'system.resource.image.annotate')
  assert.equal(result.json.mcpToolName, 'system_resource_image_annotate')
  assert.equal(result.json.data.data.status, 'annotated')
  assert.equal(result.json.data.data.artifact_path, outputPath)
  assert.equal(result.json.data.data.annotation_count, 1)
  assert.equal(existsSync(outputPath), true)
  assert.match(readFileSync(outputPath, 'utf8'), /CLI Annotation/)
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'resource',
    'image',
    'annotate',
    '--json',
    '--title',
    'CLI Annotation',
    '--data-url',
    '<redacted>',
    '--width',
    '320',
    '--height',
    '180',
    '--output-path',
    outputPath,
    '--annotations',
    '<json>',
  ])
})

test('shot group create is a top-level product CLI backed by shared command JSON', async () => {
  shotRequests = []
  const result = await runMovscriptAsync([
    'shot',
    'group',
    'create',
    '--server',
    baseURL,
    '--resource-id',
    '101',
    '--title',
    'Reference Shots',
    '--summary',
    'Reusable source cuts',
    '--cut-strategy',
    'manual_review',
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'system.shot.group.create')
  assert.equal(result.json.mcpToolName, 'system_shot_group_create')
  assert.equal(result.json.data.status, 'created')
  assert.equal(result.json.data.group_id, 3)
  assert.deepEqual(result.json.debug.cli_argv, [
    'movscript',
    'shot',
    'group',
    'create',
    '--json',
    '--server',
    baseURL,
    '--summary',
    'Reusable source cuts',
    '--title',
    'Reference Shots',
    '--cut-strategy',
    'manual_review',
    '--resource-id',
    '101',
  ])
  assert.deepEqual(shotRequests, [{
    method: 'POST',
    url: '/api/v1/shot-reference-groups',
    body: {
      resource_id: 101,
      title: 'Reference Shots',
      summary: 'Reusable source cuts',
      cut_strategy: 'manual_review',
    },
  }])
})

function runMovscript(args, options = {}) {
  const child = spawnSync(process.execPath, ['dist/index.cjs', '--', ...args], {
    cwd: cliDir,
    encoding: 'utf8',
  })
  const expectedStatus = options.expectStatus ?? 0
  assert.equal(child.status, expectedStatus, child.stderr || child.stdout)
  return {
    status: child.status,
    stdout: child.stdout,
    stderr: child.stderr,
    json: JSON.parse(child.stdout),
  }
}

function runMovscriptAsync(args, options = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, ['dist/index.cjs', '--', ...args], {
      cwd: cliDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`movscript command timed out: ${args.join(' ')}`))
    }, options.timeoutMs ?? 10_000)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (status) => {
      clearTimeout(timeout)
      const expectedStatus = options.expectStatus ?? 0
      try {
        assert.equal(status, expectedStatus, stderr || stdout)
        resolveResult({
          status,
          stdout,
          stderr,
          json: JSON.parse(stdout),
        })
      } catch (error) {
        reject(error)
      }
    })
  })
}

function createTestServer() {
  return createServer((req, res) => {
    const requestURL = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.url === '/api/v1/projects' && req.method === 'POST') {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        projectRequests.push({ method: req.method, url: req.url, body: JSON.parse(body || '{}') })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          id: 42,
          name: 'Launch Film',
          description: 'Campaign launch',
          total_episodes: 1,
        }))
      })
      return
    }
    if (req.method === 'GET'
      && requestURL.pathname === '/api/v1/models'
      && requestURL.searchParams.get('capability') === 'audio_generation'
      && requestURL.searchParams.get('operation') === 'music_generation') {
      generationRequests.push({ method: req.method, url: req.url })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify([{
        id: 51,
        model_id: 'audio:music',
        display_name: 'Music Model',
        capabilities: ['audio_generation'],
      }]))
      return
    }
    if (req.url === '/api/v1/media/streams/41' && req.method === 'GET') {
      artifactRequests.push({ method: req.method, url: req.url })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        stream: {
          ID: 41,
          title: 'Preview stream',
        },
        manifest_url: 'https://cdn.example/stream.m3u8',
      }))
      return
    }
    if (req.url === '/api/v1/resources/upload' && req.method === 'POST') {
      artifactRequests.push({ method: req.method, url: req.url })
      req.resume()
      req.on('end', () => {
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          ID: 88,
          name: 'result-export.mp4',
          mime_type: 'video/mp4',
        }))
      })
      return
    }
    if (req.url === '/api/v1/media/streams/uploads' && req.method === 'POST') {
      artifactRequests.push({ method: req.method, url: req.url })
      req.resume()
      req.on('end', () => {
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          stream_id: 89,
          manifest_url: '/api/v1/media/streams/89/manifest.m3u8',
          segment_base_url: '/api/v1/media/streams/89/segments/',
          stream: { ID: 89, title: 'CLI HLS' },
        }))
      })
      return
    }
    if (req.url === '/v1/media-pipeline/results/get' && req.method === 'POST') {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        const parsed = JSON.parse(body || '{}')
        mediaPipelineRequests.push({ method: req.method, url: req.url, body: parsed })
        const result = mediaPipelineResults.get(parsed.resultId ?? parsed.result_id) ?? null
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          schema: 'movscript.media-pipeline-result-get.v1',
          status: result ? 'found' : 'not_found',
          result,
        }))
      })
      return
    }
    if (req.url === '/api/v1/shot-reference-groups' && req.method === 'POST') {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        shotRequests.push({ method: req.method, url: req.url, body: JSON.parse(body || '{}') })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          ID: 3,
          title: 'Reference Shots',
          summary: 'Reusable source cuts',
          source_resource_id: 101,
        }))
      })
      return
    }
    res.writeHead(404)
    res.end()
  })
}
