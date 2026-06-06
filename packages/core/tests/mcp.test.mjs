import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  annotateResourceImage,
  buildMCPFrameSamplingPlan,
  getMCPFocusSnapshot,
  handleJSONRPC,
  listTools,
  updateMCPContextSnapshot,
  uploadAgentImageResource,
} from '../dist/mcp/node/index.js'
import {
  getMovScriptBackendAPIBaseURL,
  setMovScriptBackendAPIBaseURL,
} from '../dist/backend/node/index.js'

const onePixelPNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lgn+9QAAAABJRU5ErkJggg=='

function record(value) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  return value
}

test('MCP initialize request returns the core JSON-RPC server identity', async () => {
  const response = await handleJSONRPC({
    jsonrpc: '2.0',
    id: 'codex-init',
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      clientInfo: { name: 'codex', version: '0.1.0' },
      capabilities: {},
    },
  })

  assert.equal(response?.jsonrpc, '2.0')
  assert.equal(response?.id, 'codex-init')
  assert.deepEqual(response?.result?.serverInfo, {
    name: 'movscript-core-mcp',
    version: '0.1.0',
  })
})

test('MCP initialized notification does not produce a JSON-RPC response', async () => {
  const response = await handleJSONRPC({
    jsonrpc: '2.0',
    method: 'initialized',
    params: {},
  })

  assert.equal(response, undefined)
})

test('MCP backend URL adapters share the core backend runtime state', () => {
  setMovScriptBackendAPIBaseURL('http://backend-runtime.test')
  assert.equal(getMovScriptBackendAPIBaseURL(), 'http://backend-runtime.test/api/v1')

  setMovScriptBackendAPIBaseURL('http://mcp-runtime.test/api/v1')
  assert.equal(getMovScriptBackendAPIBaseURL(), 'http://mcp-runtime.test/api/v1')

  setMovScriptBackendAPIBaseURL('http://localhost:8765')
})

test('MCP discovery exposes core MovScript tools and resources', async () => {
  const toolsResponse = await handleJSONRPC({
    jsonrpc: '2.0',
    id: 'tools',
    method: 'tools/list',
  })
  const tools = (toolsResponse?.result?.tools ?? []).map((tool) => tool.name)
  assert.ok(tools.includes('movscript_workspace_get_model'))
  assert.ok(tools.includes('movscript_workspace_review'))
  assert.ok(tools.includes('movscript_workspace_build'))
  assert.equal(tools.includes('workspace_fetch'), false)
  assert.equal(tools.includes('workspace_status'), false)
  assert.equal(tools.includes('workspace_review'), false)
  assert.equal(tools.includes('workspace_submit'), false)
  assert.equal(tools.includes('movscript_script_list'), false)
  assert.equal(tools.includes('movscript_script_locate'), false)
  assert.ok(tools.includes('movscript_resource_library_query'))
  assert.ok(tools.includes('movscript_resource_video_extract_frames'))
  assert.ok(tools.includes('movscript_resource_image_annotate'))
  assert.ok(tools.includes('movscript_resource_upload'))
  assert.ok(tools.includes('movscript_shot_library_query'))
  assert.ok(tools.includes('movscript_external_resource_source_list'))
  assert.ok(tools.includes('movscript_external_resource_search'))
  assert.equal(tools.includes('movscript_setting_query'), false)
  assert.equal(tools.includes('movscript_asset_slot_query'), false)
  assert.equal(tools.includes('movscript_production_context_query'), false)
  assert.equal(tools.includes('candidate_asset_slot_attach'), false)
  assert.equal(tools.includes('candidate_keyframe_attach'), false)
  assert.ok(tools.includes('generation_image_generate'))
  assert.ok(tools.includes('generation_video_generate'))

  const resourcesResponse = await handleJSONRPC({
    jsonrpc: '2.0',
    id: 'resources',
    method: 'resources/list',
  })
  const resources = (resourcesResponse?.result?.resources ?? []).map((resource) => resource.uri)
  assert.ok(resources.includes('movscript://projects'))
  assert.ok(resources.includes('movscript://resource-library'))
  assert.ok(resources.includes('movscript://shot-library'))
  assert.ok(resources.includes('movscript://external-resources'))
})

test('MCP focus omits workspaceId from route search while preserving page focus params', () => {
  updateMCPContextSnapshot({
    route: {
      pathname: '/project/pre-production',
      search: '?view=review&workspaceId=workspace_mpfwa1ow_tx4g65&asset_slot_id=88',
      hash: '',
    },
    project: {
      id: 2,
      name: '漫剧1',
      status: 'planning',
      description: '',
    },
    user: null,
    selection: null,
    updatedAt: '2026-05-21T19:54:16.793Z',
  })

  const snapshot = getMCPFocusSnapshot()

  assert.equal(snapshot.route.pathname, '/project/pre-production')
  assert.equal(snapshot.route.search, '?view=review&asset_slot_id=88')
  assert.equal(snapshot.project?.id, 2)
})

test('MCP focus returns an empty search when workspaceId is the only route query param', () => {
  updateMCPContextSnapshot({
    route: {
      pathname: '/project/pre-production',
      search: '?workspaceId=workspace_mpfwa1ow_tx4g65',
      hash: '',
    },
    project: null,
    user: null,
    selection: null,
    updatedAt: '2026-05-21T19:54:16.793Z',
  })

  assert.equal(getMCPFocusSnapshot().route.search, '')
})

test('MCP video frame sampling supports range and burst budgets', () => {
  const range = buildMCPFrameSamplingPlan({
    mode: 'range',
    startSec: 10,
    endSec: 12,
    fps: 4,
    maxFrames: 5,
  }, { durationSec: 30 })

  assert.equal(range.mode, 'range')
  assert.deepEqual(range.timestampsSec, [10, 10.5, 11, 11.5, 12])
  assert.equal(range.requestedFrameCount, 9)
  assert.equal(range.returnedFrameCount, 5)
  assert.match(range.warnings[0] ?? '', /downsampled/)

  const burst = buildMCPFrameSamplingPlan({
    mode: 'burst',
    centerSec: 5,
    windowSec: 2,
    intervalSec: 0.5,
  }, { durationSec: 10 })

  assert.equal(burst.mode, 'burst')
  assert.deepEqual(burst.timestampsSec, [4, 4.5, 5, 5.5, 6])
  assert.equal(burst.centerSec, 5)
  assert.equal(burst.windowSec, 2)
})

test('MCP image annotation renders an SVG artifact with structured shapes', async () => {
  const outputPath = join(tmpdir(), `movscript-annotation-test-${process.pid}.svg`)
  try {
    const result = await annotateResourceImage({
      data_url: onePixelPNG,
      title: 'shot-note',
      output_path: outputPath,
      annotations: [
        { type: 'rect', x: 10, y: 20, width: 30, height: 40, color: '#ff0000' },
        { type: 'text', x: 12, y: 18, text: 'focus' },
      ],
    })

    const data = result.data
    assert.equal(data.status, 'annotated')
    assert.equal(data.artifact_path, outputPath)
    assert.equal(data.annotation_count, 2)
    assert.equal(data.mime_type, 'image/svg+xml')

    const svg = await readFile(outputPath, 'utf8')
    assert.match(svg, /<image href="data:image\/png;base64,/)
    assert.match(svg, /<rect x="10" y="20" width="30" height="40"/)
    assert.match(svg, />focus<\/text>/)
  } finally {
    await rm(outputPath, { force: true })
  }
})

test('MCP resource media tools expose annotation and upload capabilities', () => {
  const tools = listTools()
  const names = new Set(tools.map((tool) => tool.name))
  assert.ok(names.has('movscript_resource_video_extract_frames'))
  assert.ok(names.has('movscript_resource_image_annotate'))
  assert.ok(names.has('movscript_resource_upload'))

  const video = tools.find((tool) => tool.name === 'movscript_resource_video_extract_frames')
  assert.ok(video?.inputSchema.properties?.mode)
  assert.ok(video?.inputSchema.properties?.max_frames)
  assert.ok(video?.inputSchema.properties?.center_sec)
})

test('MCP resource upload posts agent image artifacts as multipart RawResources', async () => {
  const inputPath = join(tmpdir(), `movscript-upload-test-${process.pid}.svg`)
  const originalFetch = globalThis.fetch
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  await writeFile(inputPath, '<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8')
  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://movscript.test/api/v1/resources/upload')
      assert.equal(init?.method, 'POST')
      assert.ok(init?.body instanceof FormData)
      const form = init.body
      assert.equal(form.get('folder_id'), 'root')
      const file = form.get('file')
      assert.ok(file instanceof Blob)
      assert.equal(file.name, 'guide.svg')
      assert.equal(file.type, 'image/svg+xml')
      assert.match(await file.text(), /<svg/)
      return new Response(JSON.stringify({
        ID: 321,
        name: 'guide.svg',
        type: 'image',
        mime_type: 'image/svg+xml',
        url: '/api/v1/resources/321/file',
      }), { status: 201, headers: { 'content-type': 'application/json' } })
    }

    const result = await uploadAgentImageResource({
      artifact_path: inputPath,
      filename: 'guide.svg',
      mime_type: 'image/svg+xml',
      folder_id: 'root',
    })

    assert.equal(result.status, 'uploaded')
    assert.equal(result.resource_id, 321)
    assert.equal(result.filename, 'guide.svg')
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(inputPath, { force: true })
  }
})

test('MCP workspace tools expose get_model review and build over edit/.build', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-workspace-tools-'))
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  try {
    await mkdir(join(workspaceDir, '.build', 'current', 'setting'), { recursive: true })
    await mkdir(join(workspaceDir, 'edit', 'setting'), { recursive: true })
    await writeFile(join(workspaceDir, '.build', 'current', 'setting', 'setting_hero.json'), JSON.stringify({
      schema: 'movscript.setting.v1',
      id: 'setting_hero',
      name: 'Old Hero',
    }), 'utf8')
    await writeFile(join(workspaceDir, 'edit', 'setting', 'setting_hero.json'), JSON.stringify({
      schema: 'movscript.setting.v1',
      id: 'setting_hero',
      name: 'New Hero',
    }), 'utf8')

    const modelResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'get-model',
      method: 'tools/call',
      params: {
        name: 'movscript_workspace_get_model',
        arguments: { entityType: 'setting', entityId: 'hero' },
      },
    })
    const model = record(modelResponse?.result?.data)
    assert.equal(model.workspaceKind, 'setting_workspace')
    assert.ok(model.editablePaths.includes('edit/setting/setting_hero.json'))

    const reviewResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'review',
      method: 'tools/call',
      params: {
        name: 'movscript_workspace_review',
        arguments: {},
      },
    })
    const review = record(reviewResponse?.result?.data)
    assert.equal(review.basePath, '.build/current')
    assert.equal(review.editPath, 'edit')
    assert.equal(review.summary.modified, 1)
    assert.equal(review.readyToBuild, true)

    const buildResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'build',
      method: 'tools/call',
      params: {
        name: 'movscript_workspace_build',
        arguments: {},
      },
    })
    const build = record(buildResponse?.result?.data)
    assert.equal(build.status, 'built')
    assert.equal(existsSync(join(workspaceDir, '.build', 'indexes', 'domain-index.json')), true)
    assert.equal(JSON.parse(readFileSync(join(workspaceDir, '.build', 'current', 'setting', 'setting_hero.json'), 'utf8')).name, 'New Hero')
  } finally {
    if (previousWorkspaceDir === undefined) delete process.env.MOVSCRIPT_WORKSPACE_DIR
    else process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
  }
})
