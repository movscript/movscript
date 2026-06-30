import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
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

test('system generation prepare calls backend through shared command JSON', async () => {
  generationRequests = []
  const result = await runMovscriptAsync([
    'system',
    'generation',
    'prepare',
    '--server',
    baseURL,
    '--capability',
    'audio_music',
    '--json',
  ])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'system.generation.prepare')
  assert.equal(result.json.mcpToolName, 'generation_prepare')
  assert.equal(result.json.data.status, 'ready')
  assert.equal(result.json.data.capability, 'audio_music')
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
    'audio_music',
  ])
  assert.deepEqual(generationRequests, [{
    method: 'GET',
    url: '/api/v1/models?capability=audio_music&target_output=audio&resolve_intent=true',
  }])
})

test('system resource library open returns shared command JSON', () => {
  const result = runMovscript([
    'system',
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
    'system',
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

test('system artifact get-stream calls backend through shared command JSON', async () => {
  artifactRequests = []
  const result = await runMovscriptAsync([
    'system',
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
    'system',
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

test('system project create calls backend through shared command JSON', async () => {
  projectRequests = []
  const result = await runMovscriptAsync([
    'system',
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
    'system',
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

test('system resource image annotate returns local artifact JSON', () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'movscript-annotate-'))
  const outputPath = join(outputDir, 'annotated.svg')
  const sourceSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#ffffff"/></svg>'
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(sourceSVG).toString('base64')}`
  const annotations = JSON.stringify([{ type: 'rect', x: 20, y: 24, width: 120, height: 64, color: '#ef4444' }])
  const result = runMovscript([
    'system',
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
    'system',
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

test('system shot group create calls backend through shared command JSON', async () => {
  shotRequests = []
  const result = await runMovscriptAsync([
    'system',
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
    'system',
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
      && requestURL.searchParams.get('capability') === 'audio_music') {
      generationRequests.push({ method: req.method, url: req.url })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify([{
        id: 51,
        model_id: 'audio:music',
        display_name: 'Music Model',
        capabilities: ['audio_music'],
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
