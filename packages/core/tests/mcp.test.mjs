import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  annotateResourceImage,
  buildMCPFrameSamplingPlan,
  addShotsToGroup,
  createShotGroup,
  getMCPFocusSnapshot,
  getShotGroup,
  getImageGenerationJobs,
  handleJSONRPC,
  listTools,
  readResourceImageForVision,
  updateMCPContextSnapshot,
  uploadAgentImageResource,
  uploadAgentImageResources,
} from '../dist/mcp/node/index.js'
import {
  getMovScriptBackendAPIBaseURL,
  setMovScriptBackendAPIBaseURL,
} from '../dist/backend/node/index.js'

const onePixelPNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lgn+9QAAAABJRU5ErkJggg=='
const onePixelPNGBytes = Buffer.from(onePixelPNG.split(',')[1], 'base64')

function record(value) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  return value
}

async function writeFakeFFmpegTools(dir) {
  const ffmpegPath = join(dir, 'ffmpeg')
  const ffprobePath = join(dir, 'ffprobe')
  const outputBase64 = onePixelPNG.split(',')[1]
  await writeFile(ffmpegPath, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.MOVSCRIPT_TEST_FFMPEG_LOG) fs.appendFileSync(process.env.MOVSCRIPT_TEST_FFMPEG_LOG, JSON.stringify({ tool: 'ffmpeg', args }) + '\\n');
const out = args[args.length - 1];
if (out && out !== '-' && out !== 'null') fs.writeFileSync(out, Buffer.from('${outputBase64}', 'base64'));
`, 'utf8')
  await writeFile(ffprobePath, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.MOVSCRIPT_TEST_FFMPEG_LOG) fs.appendFileSync(process.env.MOVSCRIPT_TEST_FFMPEG_LOG, JSON.stringify({ tool: 'ffprobe', args }) + '\\n');
const width = Number(process.env.MOVSCRIPT_TEST_IMAGE_WIDTH || 2000);
const height = Number(process.env.MOVSCRIPT_TEST_IMAGE_HEIGHT || 1000);
process.stdout.write(JSON.stringify({ streams: [{ width, height }] }));
`, 'utf8')
  await chmod(ffmpegPath, 0o755)
  await chmod(ffprobePath, 0o755)
  return ffmpegPath
}

function emptyMCPContextSnapshot() {
  return {
    route: { pathname: '/', search: '', hash: '' },
    project: null,
    productionId: null,
    user: null,
    selection: null,
    updatedAt: new Date(0).toISOString(),
  }
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
  assert.ok(tools.includes('system_focus_get'))
  assert.ok(tools.includes('system_project_create'))
  assert.ok(tools.includes('system_model_list'))
  assert.ok(tools.includes('system_generate_image'))
  assert.ok(tools.includes('system_generate_image_job_get_batch'))
  assert.ok(tools.includes('system_generate_video'))
  assert.ok(tools.includes('system_generate_video_job_get_batch'))
  assert.ok(tools.includes('system_resource_library_query'))
  assert.ok(tools.includes('system_resource_video_extract_frames'))
  assert.ok(tools.includes('system_shot_library_query'))
  assert.ok(tools.includes('system_shot_group_create'))
  assert.ok(tools.includes('system_shot_group_get'))
  assert.ok(tools.includes('system_shot_group_add_shots'))
  assert.ok(tools.includes('system_video_shot_cuts_analyze'))
  assert.ok(tools.includes('system_external_resource_search'))
  assert.ok(tools.includes('domain_get_model'))
  assert.ok(tools.includes('domain_query_entities'))
  assert.ok(tools.includes('domain_query_settings'))
  assert.ok(tools.includes('domain_query_assets'))
  assert.ok(tools.includes('domain_query_production_context'))
  assert.ok(tools.includes('domain_read_content_unit_generation_prompt'))
  assert.ok(tools.includes('domain_read_content_unit_input_version'))
  assert.ok(tools.includes('domain_upsert_setting'))
  assert.ok(tools.includes('domain_upsert_production'))
  assert.ok(tools.includes('domain_upsert_segment'))
  assert.ok(tools.includes('domain_upsert_scene_moment'))
  assert.ok(tools.includes('domain_upsert_shot'))
  assert.ok(tools.includes('domain_upsert_keyframe'))
  assert.ok(tools.includes('domain_upsert_storyboard'))
  assert.ok(tools.includes('domain_upsert_audio_cue'))
  assert.ok(tools.includes('domain_upsert_expression_unit'))
  assert.ok(tools.includes('domain_update_entity_transition'))
  assert.ok(tools.includes('domain_update_storyboard_timeline'))
  assert.equal(tools.includes('domain_update_storyboard_shot_plans'), false)
  assert.ok(tools.includes('domain_append_candidate'))
  assert.ok(tools.includes('domain_create_asset_slot_candidate'))
  assert.ok(tools.includes('domain_create_keyframe_candidate'))
  assert.ok(tools.includes('domain_create_content_candidate'))
  assert.ok(tools.includes('domain_create_content_candidate_batch'))
  assert.ok(tools.includes('domain_select_content_unit_candidate_batch'))
  assert.ok(tools.includes('domain_review'))
  assert.ok(tools.includes('domain_interpret'))
  assert.equal(tools.includes('domain_update_scene_moment_timing'), false)
  assert.equal(tools.includes('domain_update_storyboard_timing'), false)
  assert.equal(tools.includes('domain_update_content_unit_generation_prompt'), false)
  assert.ok(tools.includes('movscript_workspace_get_model'))
  assert.ok(tools.includes('movscript_workspace_review'))
  assert.ok(tools.includes('movscript_workspace_interpret'))
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
  assert.ok(tools.includes('movscript_resource_upload_batch'))
  assert.ok(tools.includes('movscript_shot_library_query'))
  assert.ok(tools.includes('movscript_shot_group_create'))
  assert.ok(tools.includes('movscript_shot_group_get'))
  assert.ok(tools.includes('movscript_shot_group_add_shots'))
  assert.ok(tools.includes('movscript_video_shot_cuts_analyze'))
  assert.ok(tools.includes('movscript_external_resource_source_list'))
  assert.ok(tools.includes('movscript_external_resource_search'))
  assert.equal(tools.includes('movscript_setting_query'), false)
  assert.equal(tools.includes('movscript_production_context_query'), false)
  assert.equal(tools.includes('candidate_keyframe_attach'), false)
  assert.ok(tools.includes('generation_image_generate'))
  assert.ok(tools.includes('generation_image_job_get_batch'))
  assert.ok(tools.includes('generation_video_generate'))
  assert.ok(tools.includes('generation_video_job_get_batch'))

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

test('MCP tool schemas are compatible with OpenAI function parameters', () => {
  const tools = listTools()
  for (const tool of tools) {
    assertOpenAIFunctionParametersSchema(tool.inputSchema, `${tool.name} inputSchema`)
    if (tool.outputSchema) assertOpenAIFunctionParametersSchema(tool.outputSchema, `${tool.name} outputSchema`)
  }
})

test('MCP upsert setting schema makes payload the unambiguous write body', () => {
  const tools = listTools()
  const schema = tools.find((tool) => tool.name === 'domain_upsert_setting')?.inputSchema
  assert.ok(schema, 'domain_upsert_setting schema should be exposed')
  assert.equal(schema.properties?.payload?.type, 'object')
  assert.deepEqual(schema.required, ['payload'])
  assert.match(
    tools.find((tool) => tool.name === 'domain_upsert_setting')?.description ?? '',
    /required payload/,
  )
})

test('MCP project-scoped tool schemas expose explicit project id arguments', () => {
  const tools = listTools()
  for (const name of [
    'domain_overview',
    'domain_get_model',
    'domain_query_entities',
    'movscript_workspace_get_model',
    'movscript_workspace_review',
    'generation_image_generate',
    'generation_video_generate',
    'system_generate_image',
    'system_generate_video',
  ]) {
    const schema = tools.find((tool) => tool.name === name)?.inputSchema
    assert.ok(schema, `${name} schema should be exposed`)
    assert.ok(schema.properties?.projectId, `${name} should expose projectId`)
    assert.ok(schema.properties?.project_id, `${name} should expose project_id`)
    assert.equal(schema.properties?.userId, undefined, `${name} must not expose userId`)
    assert.equal(schema.properties?.user_id, undefined, `${name} must not expose user_id`)
    assert.equal(schema.properties?.orgId, undefined, `${name} must not expose orgId`)
    assert.equal(schema.properties?.org_id, undefined, `${name} must not expose org_id`)
  }
})

test('MCP domain tool aliases route through the domain workspace model', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-domain-model-'))
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  try {
    updateMCPContextSnapshot({
      route: { pathname: '/project/agent', search: '', hash: '' },
      project: { id: 6, name: 'Workspace Test' },
      productionId: null,
      user: { id: 1, username: 'alice', systemRole: 'user' },
      selection: null,
      updatedAt: new Date().toISOString(),
    })

    const response = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'domain-model',
      method: 'tools/call',
      params: {
        name: 'domain_get_model',
        arguments: {
          projectId: 6,
          entityKind: 'scene_moment',
          entityId: 'scene_moment_r72k',
        },
      },
    })

    assert.equal(response?.result?.data?.workspaceKind, 'scene_moment_workspace')
    assert.equal(response?.result?.data?.entityKind, 'scene_moment')
    assert.ok(response?.result?.data?.editablePaths?.[0].includes('scene_moment_r72k'))

    const legacyResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'legacy-workspace-model',
      method: 'tools/call',
      params: {
        name: 'movscript_workspace_get_model',
        arguments: {
          projectId: 6,
          entityKind: 'scene_moment',
          entityId: 'scene_moment_r72k',
        },
      },
    })

    assert.equal(legacyResponse?.result?.data?.workspaceKind, 'scene_moment_workspace')
  } finally {
    updateMCPContextSnapshot(emptyMCPContextSnapshot())
    if (previousWorkspaceDir === undefined) delete process.env.MOVSCRIPT_WORKSPACE_DIR
    else process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
  }
})

function assertOpenAIFunctionParametersSchema(schema, label) {
  assert.equal(schema?.type, 'object', `${label} must have top-level type object`)
  for (const key of ['oneOf', 'anyOf', 'allOf', 'enum', 'not']) {
    assert.equal(schema?.[key], undefined, `${label} must not expose top-level ${key}`)
  }
}

test('MCP focus omits workspaceId from route search while preserving page focus params', () => {
  updateMCPContextSnapshot({
    route: {
      pathname: '/project/pre-production',
      search: '?view=review&workspaceId=workspace_mpfwa1ow_tx4g65&asset_id=88',
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
  assert.equal(snapshot.route.search, '?view=review&asset_id=88')
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

test('MCP resource image read validates, resizes, and returns lean image content', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'movscript-image-read-'))
  const logPath = join(tempDir, 'ffmpeg.jsonl')
  const originalFetch = globalThis.fetch
  const originalFFmpegPath = process.env.FFMPEG_PATH
  const originalLog = process.env.MOVSCRIPT_TEST_FFMPEG_LOG
  const originalWidth = process.env.MOVSCRIPT_TEST_IMAGE_WIDTH
  const originalHeight = process.env.MOVSCRIPT_TEST_IMAGE_HEIGHT
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  try {
    process.env.FFMPEG_PATH = await writeFakeFFmpegTools(tempDir)
    process.env.MOVSCRIPT_TEST_FFMPEG_LOG = logPath
    process.env.MOVSCRIPT_TEST_IMAGE_WIDTH = '2000'
    process.env.MOVSCRIPT_TEST_IMAGE_HEIGHT = '1000'
    globalThis.fetch = async (input) => {
      assert.equal(String(input), 'http://movscript.test/api/v1/resources/42/file')
      return new Response(onePixelPNGBytes, {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': String(onePixelPNGBytes.length),
        },
      })
    }

    const result = await readResourceImageForVision({
      resource_id: 42,
      mode: 'fit',
      max_width: 960,
      max_height: 960,
    })

    assert.deepEqual(result.content.map((item) => item.type), ['image'])
    assert.equal(result.content[0].mimeType, 'image/png')
    assert.equal(result.content[0].data, onePixelPNG.split(',')[1])
    assert.equal(result.data.status, 'image_read')
    assert.equal(result.data.mode, 'fit')
    assert.equal(result.data.source_width, 2000)
    assert.equal(result.data.source_height, 1000)
    assert.equal(result.data.width, 960)
    assert.equal(result.data.height, 480)
    assert.equal(result.data.resized, true)
    assert.equal(result.data.max_width, 960)
    assert.equal(result.data.max_height, 960)
    assert.equal(result.data.image_payload, 'sent_as_mcp_image_content')

    const toolCalls = readFileSync(logPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    assert.ok(toolCalls.some((call) => call.tool === 'ffprobe' && call.args.includes('-show_entries')))
    assert.ok(toolCalls.some((call) => call.tool === 'ffmpeg' && call.args.includes('-f') && call.args.includes('null')))
    assert.ok(toolCalls.some((call) => call.tool === 'ffmpeg' && call.args.some((arg) => String(arg).includes('scale=960:960'))))
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    if (originalFFmpegPath === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = originalFFmpegPath
    if (originalLog === undefined) delete process.env.MOVSCRIPT_TEST_FFMPEG_LOG
    else process.env.MOVSCRIPT_TEST_FFMPEG_LOG = originalLog
    if (originalWidth === undefined) delete process.env.MOVSCRIPT_TEST_IMAGE_WIDTH
    else process.env.MOVSCRIPT_TEST_IMAGE_WIDTH = originalWidth
    if (originalHeight === undefined) delete process.env.MOVSCRIPT_TEST_IMAGE_HEIGHT
    else process.env.MOVSCRIPT_TEST_IMAGE_HEIGHT = originalHeight
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('MCP resource image read original detail preserves source bytes after decode', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'movscript-image-original-'))
  const logPath = join(tempDir, 'ffmpeg.jsonl')
  const originalFetch = globalThis.fetch
  const originalFFmpegPath = process.env.FFMPEG_PATH
  const originalLog = process.env.MOVSCRIPT_TEST_FFMPEG_LOG
  const originalWidth = process.env.MOVSCRIPT_TEST_IMAGE_WIDTH
  const originalHeight = process.env.MOVSCRIPT_TEST_IMAGE_HEIGHT
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  try {
    process.env.FFMPEG_PATH = await writeFakeFFmpegTools(tempDir)
    process.env.MOVSCRIPT_TEST_FFMPEG_LOG = logPath
    process.env.MOVSCRIPT_TEST_IMAGE_WIDTH = '640'
    process.env.MOVSCRIPT_TEST_IMAGE_HEIGHT = '480'
    globalThis.fetch = async () => new Response(onePixelPNGBytes, {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': String(onePixelPNGBytes.length),
      },
    })

    const result = await readResourceImageForVision({
      resource_id: 7,
      detail: 'original',
      max_width: 10,
      max_height: 10,
    })

    assert.deepEqual(result.content.map((item) => item.type), ['image'])
    assert.equal(result.content[0].data, onePixelPNG.split(',')[1])
    assert.equal(result.data.mode, 'original')
    assert.equal(result.data.width, 640)
    assert.equal(result.data.height, 480)
    assert.equal(result.data.resized, false)
    assert.equal(result.data.max_width, undefined)
    assert.equal(result.data.max_height, undefined)

    const toolCalls = readFileSync(logPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    assert.ok(toolCalls.some((call) => call.tool === 'ffmpeg' && call.args.includes('-f') && call.args.includes('null')))
    assert.equal(toolCalls.some((call) => call.tool === 'ffmpeg' && call.args.some((arg) => String(arg).startsWith('scale='))), false)
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    if (originalFFmpegPath === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = originalFFmpegPath
    if (originalLog === undefined) delete process.env.MOVSCRIPT_TEST_FFMPEG_LOG
    else process.env.MOVSCRIPT_TEST_FFMPEG_LOG = originalLog
    if (originalWidth === undefined) delete process.env.MOVSCRIPT_TEST_IMAGE_WIDTH
    else process.env.MOVSCRIPT_TEST_IMAGE_WIDTH = originalWidth
    if (originalHeight === undefined) delete process.env.MOVSCRIPT_TEST_IMAGE_HEIGHT
    else process.env.MOVSCRIPT_TEST_IMAGE_HEIGHT = originalHeight
    await rm(tempDir, { recursive: true, force: true })
  }
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
    assert.equal(data.artifact_location, 'explicit_path')
    assert.equal(data.image_payload, 'stored_as_local_artifact')
    assert.equal(data.mcp_image_content, false)
    assert.deepEqual(result.content.map((item) => item.type), ['text'])
    assert.doesNotMatch(JSON.stringify(result.content), /iVBORw0KGgo/)

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
  assert.ok(names.has('movscript_resource_upload_batch'))

  const video = tools.find((tool) => tool.name === 'movscript_resource_video_extract_frames')
  assert.ok(video?.inputSchema.properties?.mode)
  assert.ok(video?.inputSchema.properties?.max_frames)
  assert.ok(video?.inputSchema.properties?.center_sec)
})

test('MCP resource upload batch posts multiple artifacts and preserves result order', async () => {
  const firstPath = join(tmpdir(), `movscript-upload-batch-a-${process.pid}.svg`)
  const secondPath = join(tmpdir(), `movscript-upload-batch-b-${process.pid}.png`)
  const originalFetch = globalThis.fetch
  const uploadedNames = []
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  await writeFile(firstPath, '<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8')
  await writeFile(secondPath, 'png-bytes', 'utf8')
  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://movscript.test/api/v1/resources/upload')
      assert.equal(init?.method, 'POST')
      const file = init.body.get('file')
      assert.ok(file instanceof Blob)
      uploadedNames.push(file.name)
      return new Response(JSON.stringify({
        ID: uploadedNames.length,
        name: file.name,
        type: file.type.startsWith('video/') ? 'video' : 'image',
        mime_type: file.type,
      }), { status: 201, headers: { 'content-type': 'application/json' } })
    }

    const result = await uploadAgentImageResources({
      folder_id: 'root',
      max_concurrency: 1,
      items: [
        { artifact_path: firstPath, filename: 'first.svg', mime_type: 'image/svg+xml' },
        { local_path: secondPath, filename: 'second.png', mime_type: 'image/png' },
      ],
    })

    assert.equal(result.status, 'completed')
    assert.equal(result.success_count, 2)
    assert.equal(result.failed_count, 0)
    assert.deepEqual(result.resource_ids, [1, 2])
    assert.equal(result.items[0].filename, 'first.svg')
    assert.equal(result.items[1].filename, 'second.png')
    assert.deepEqual(uploadedNames, ['first.svg', 'second.png'])
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(firstPath, { force: true })
    await rm(secondPath, { force: true })
  }
})

test('MCP generation job get batch returns per-job state and output ids', async () => {
  const originalFetch = globalThis.fetch
  const requested = []
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  try {
    globalThis.fetch = async (input) => {
      const url = String(input)
      requested.push(url)
      if (url === 'http://movscript.test/api/v1/jobs/11') {
        return new Response(JSON.stringify({
          ID: 11,
          status: 'succeeded',
          output_resource_id: 701,
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === 'http://movscript.test/api/v1/jobs/12') {
        return new Response(JSON.stringify({
          ID: 12,
          status: 'running',
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`unexpected request: ${url}`)
    }

    const result = await getImageGenerationJobs({ jobIds: [11, 12] })
    assert.equal(result.status, 'loaded')
    assert.equal(result.success_count, 2)
    assert.equal(result.failed_count, 0)
    assert.equal(result.terminal_count, 1)
    assert.equal(result.all_terminal, false)
    assert.deepEqual(result.output_resource_ids, [701])
    assert.equal(result.items[0].job_id, 11)
    assert.equal(result.items[1].job_id, 12)
    assert.deepEqual(requested, [
      'http://movscript.test/api/v1/jobs/11',
      'http://movscript.test/api/v1/jobs/12',
    ])
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
  }
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

test('MCP resource upload infers video MIME types from local files', async () => {
  const inputPath = join(tmpdir(), `movscript-upload-video-test-${process.pid}.mp4`)
  const originalFetch = globalThis.fetch
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  await writeFile(inputPath, 'fake-video-bytes', 'utf8')
  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://movscript.test/api/v1/resources/upload')
      assert.equal(init?.method, 'POST')
      const file = init.body.get('file')
      assert.ok(file instanceof Blob)
      assert.equal(file.name, `movscript-upload-video-test-${process.pid}.mp4`)
      assert.equal(file.type, 'video/mp4')
      return new Response(JSON.stringify({
        ID: 654,
        name: file.name,
        type: 'video',
        mime_type: 'video/mp4',
      }), { status: 201, headers: { 'content-type': 'application/json' } })
    }

    const result = await uploadAgentImageResource({ local_path: inputPath })
    assert.equal(result.status, 'uploaded')
    assert.equal(result.resource_id, 654)
    assert.equal(result.mime_type, 'video/mp4')
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(inputPath, { force: true })
  }
})

test('MCP shot group tools create, read, and append normalized shot ranges', async () => {
  const originalFetch = globalThis.fetch
  const requests = []
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      requests.push({ url, init })
      if (url === 'http://movscript.test/api/v1/shot-reference-groups' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        assert.deepEqual(body, {
          resource_id: 77,
          title: 'episode cut',
          cut_strategy: 'scene_detection',
        })
        return new Response(JSON.stringify({
          ID: 42,
          source_resource_id: 77,
          title: 'episode cut',
        }), { status: 201, headers: { 'content-type': 'application/json' } })
      }
      if (url === 'http://movscript.test/api/v1/shot-reference-groups/42' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({
          group: { ID: 42, source_resource_id: 77, title: 'episode cut' },
          count: 2,
          shots: [
            { ID: 100, group_id: 42, resource_id: 77, order: 1, title: 'shot a', start_sec: 0, end_sec: 2.4 },
            { ID: 101, group_id: 42, resource_id: 77, order: 2, title: 'shot b', start_sec: 2.4, end_sec: 5 },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === 'http://movscript.test/api/v1/shot-references/from-resource' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        assert.equal(body.group_id, 42)
        assert.equal(body.resource_id, 77)
        assert.deepEqual(body.shots, [
          { title: 'shot a', start_sec: 0, start_sec_set: true, end_sec: 2.4, end_sec_set: true },
          { title: 'shot b', start_sec: 2.4, start_sec_set: true, end_sec: 5, end_sec_set: true },
        ])
        return new Response(JSON.stringify({
          total: 2,
          items: [
            { ID: 100, group_id: 42, resource_id: 77, order: 1, title: 'shot a', start_sec: 0, end_sec: 2.4 },
            { ID: 101, group_id: 42, resource_id: 77, order: 2, title: 'shot b', start_sec: 2.4, end_sec: 5 },
          ],
        }), { status: 201, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`unexpected request: ${url}`)
    }

    const created = await createShotGroup({ resourceId: 77, title: 'episode cut', cutStrategy: 'scene_detection' })
    assert.equal(created.group_id, 42)

    const group = await getShotGroup({ groupId: 42 })
    assert.equal(group.count, 2)
    assert.equal(group.shots[0].title, 'shot a')

    const appended = await addShotsToGroup({
      groupId: 42,
      shots: [
        { title: 'shot a', startSec: 0, endSec: 2.4 },
        { title: 'shot b', startSec: 2.4, endSec: 5 },
      ],
    })
    assert.equal(appended.count, 2)
    assert.equal(requests.length, 4)
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
  }
})

test('MCP domain tool can create a storyboard source record', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-storyboard-tool-'))
  const projectDir = join(workspaceDir, 'local', 'projects', 'project_6')
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  try {
    updateMCPContextSnapshot(emptyMCPContextSnapshot())
    const response = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'storyboard-upsert',
      method: 'tools/call',
      params: {
        name: 'domain_upsert_storyboard',
        arguments: {
          projectId: 6,
          productionId: 'p1',
          segmentId: 'opening',
          sceneMomentId: 'shot_group_scene',
          shotId: 'shot_001',
          storyboardId: 'shot_001',
          storyboard: {
            title: 'Shot 001',
            order: 1,
            timeline: { duration_sec: 2.4, caption: 'first recreated shot' },
          },
        },
      },
    })

    assert.equal(response.error, undefined)
    const result = response.result.data
    assert.equal(result.status, 'upserted')
    const storyboardPath = join(projectDir, 'productions', 'p1', 'segments', 'opening', 'scene_moments', 'shot_group_scene', 'shots', 'shot_001', 'storyboards', 'shot_001', 'storyboard.json')
    const record = JSON.parse(await readFile(storyboardPath, 'utf8'))
    assert.equal(record.kind, 'storyboard')
    assert.equal(record.id, 'shot_001')
    assert.equal(record.title, 'Shot 001')
    assert.equal(record.shot_ref, 'productions/p1/segments/opening/scene_moments/shot_group_scene/shots/shot_001')
    assert.deepEqual(record.timeline, { caption: 'first recreated shot', duration_sec: 2.4 })
  } finally {
    if (previousWorkspaceDir === undefined) {
      delete process.env.MOVSCRIPT_WORKSPACE_DIR
    } else {
      process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
    }
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('MCP domain tools can create shot and keyframe source records', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-shot-tool-'))
  const projectDir = join(workspaceDir, 'local', 'projects', 'project_7')
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  try {
    updateMCPContextSnapshot(emptyMCPContextSnapshot())
    const shotResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'shot-upsert',
      method: 'tools/call',
      params: {
        name: 'domain_upsert_shot',
        arguments: {
          projectId: 7,
          productionId: 'p1',
          segmentId: 'opening',
          sceneMomentId: 'arrival',
          shotId: 'shot_001',
          shot: {
            title: 'Arrival close-up',
            order: 1,
            shotSize: 'close_up',
            camera: { movement: 'slow_push_in' },
          },
        },
      },
    })

    assert.equal(shotResponse.error, undefined)
    assert.equal(shotResponse.result.data.status, 'upserted')
    const shotPath = join(projectDir, 'productions', 'p1', 'segments', 'opening', 'scene_moments', 'arrival', 'shots', 'shot_001', 'shot.json')
    const shot = JSON.parse(await readFile(shotPath, 'utf8'))
    assert.equal(shot.kind, 'shot')
    assert.equal(shot.id, 'shot_001')
    assert.equal(shot.title, 'Arrival close-up')
    assert.equal(shot.shot_size, 'close_up')
    assert.deepEqual(shot.camera, { movement: 'slow_push_in' })

    const keyframeResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'keyframe-upsert',
      method: 'tools/call',
      params: {
        name: 'domain_upsert_keyframe',
        arguments: {
          projectId: 7,
          productionId: 'p1',
          segmentId: 'opening',
          sceneMomentId: 'arrival',
          shotId: 'shot_001',
          keyframeId: 'kf_arrival',
          keyframe: {
            title: 'Arrival anchor',
            visualIntent: 'Cold close-up as the character enters frame.',
            referenceAssetRefs: ['hero_portrait'],
          },
        },
      },
    })

    assert.equal(keyframeResponse.error, undefined)
    assert.equal(keyframeResponse.result.data.status, 'upserted')
    const keyframePath = join(projectDir, 'productions', 'p1', 'segments', 'opening', 'scene_moments', 'arrival', 'shots', 'shot_001', 'keyframes', 'kf_arrival', 'keyframe.json')
    const keyframe = JSON.parse(await readFile(keyframePath, 'utf8'))
    assert.equal(keyframe.kind, 'keyframe')
    assert.equal(keyframe.id, 'kf_arrival')
    assert.equal(keyframe.title, 'Arrival anchor')
    assert.equal(keyframe.visual_intent, 'Cold close-up as the character enters frame.')
    assert.deepEqual(keyframe.reference_asset_refs, ['hero_portrait'])
  } finally {
    if (previousWorkspaceDir === undefined) {
      delete process.env.MOVSCRIPT_WORKSPACE_DIR
    } else {
      process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
    }
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('MCP content unit candidate flow writes source records and interprets checkpoint', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-content-candidate-'))
  const projectDir = join(workspaceDir, 'local', 'projects', 'project_8')
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  try {
    updateMCPContextSnapshot(emptyMCPContextSnapshot())

    const contentUnitResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'content-unit-upsert',
      method: 'tools/call',
      params: {
        name: 'domain_upsert_content_unit',
        arguments: {
          projectId: 8,
          unit: {
            id: 'arrival_preview',
            title: 'Arrival preview frame',
            contentUnitType: 'exploration_frame',
            outputKind: 'image',
            sceneMomentRef: 'productions/p1/segments/opening/scene_moments/arrival',
            shotId: 'shot_001',
            editPrompt: { text: 'Generate a cold close-up preview for the arrival shot.' },
          },
        },
      },
    })

    assert.equal(contentUnitResponse.error, undefined)
    assert.equal(contentUnitResponse.result.data.contentUnitPath, 'content_units/arrival_preview/content_unit.json')

    const candidateResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'content-candidate-create',
      method: 'tools/call',
      params: {
        name: 'domain_create_content_candidate',
        arguments: {
          projectId: 8,
          contentUnitId: 'arrival_preview',
          candidateId: 'candidate_a',
          source: 'manual',
          status: 'imported',
          outputs: [{ kind: 'image', resource_id: 321, mime_type: 'image/png' }],
          promptSnapshot: { text: 'Generate a cold close-up preview for the arrival shot.' },
        },
      },
    })

    assert.equal(candidateResponse.error, undefined)
    assert.equal(candidateResponse.result.data.path, 'content_units/arrival_preview/candidates/candidate_a/content_candidate.json')

    const selectionResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'content-candidate-select',
      method: 'tools/call',
      params: {
        name: 'domain_select_content_unit_candidate',
        arguments: {
          projectId: 8,
          contentUnitId: 'arrival_preview',
          candidateId: 'candidate_a',
          reason: 'user confirmed preview frame',
        },
      },
    })

    assert.equal(selectionResponse.error, undefined)
    assert.equal(selectionResponse.result.data.path, 'content_units/arrival_preview/selection.json')
    assert.equal(selectionResponse.result.data.record.resource_id, 321)
    assert.equal(selectionResponse.result.data.record.accepted_input_hash, undefined)

    const inspectResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'content-candidate-inspect',
      method: 'tools/call',
      params: {
        name: 'domain_inspect',
        arguments: { projectId: 8 },
      },
    })

    assert.equal(inspectResponse.error, undefined)
    assert.equal(inspectResponse.result.data.readyToInterpret, true)

    const interpretResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'content-candidate-interpret',
      method: 'tools/call',
      params: {
        name: 'domain_interpret',
        arguments: { projectId: 8 },
      },
    })

    assert.equal(interpretResponse.error, undefined)
    assert.equal(interpretResponse.result.data.status, 'interpreted')
    const interpretText = interpretResponse.result.content?.[0]?.text ?? ''
    assert.match(interpretText, /movscript\.workspace-interpret-agent-summary\.v1/)
    assert.doesNotMatch(interpretText, /basePath/)
    assert.doesNotMatch(interpretText, /currentPath/)
    assert.doesNotMatch(interpretText, /contentHash/)
    assert.equal(Boolean(interpretResponse.result.data.review?.changedFiles?.[0]?.currentPath), true)
    assert.equal(existsSync(join(projectDir, '.interpret', 'current', 'content_units', 'arrival_preview', 'content_unit.json')), true)
    assert.equal(existsSync(join(projectDir, '.interpret', 'current', 'content_units', 'arrival_preview', 'candidates', 'candidate_a', 'content_candidate.json')), true)
    const selection = JSON.parse(await readFile(join(projectDir, '.interpret', 'current', 'content_units', 'arrival_preview', 'selection.json'), 'utf8'))
    assert.equal(selection.candidate_id, 'candidate_a')
    assert.equal(selection.resource_id, 321)
    assert.equal(selection.accepted_input_hash, undefined)
  } finally {
    updateMCPContextSnapshot(emptyMCPContextSnapshot())
    if (previousWorkspaceDir === undefined) {
      delete process.env.MOVSCRIPT_WORKSPACE_DIR
    } else {
      process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
    }
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('MCP workspace tools expose get_model review and interpret over source/.interpret', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-workspace-tools-'))
  const projectDir = join(workspaceDir, 'user', '1', 'projects', 'project_6')
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  try {
    updateMCPContextSnapshot({
      route: { pathname: '/project/agent', search: '', hash: '' },
      project: { id: 6, name: 'Workspace Test' },
      productionId: null,
      user: { id: 1, username: 'alice', systemRole: 'user' },
      selection: null,
      updatedAt: new Date().toISOString(),
    })
    await mkdir(join(projectDir, 'settings', 'setting_hero'), { recursive: true })
    await writeFile(join(projectDir, 'settings', 'setting_hero', 'setting.json'), JSON.stringify({
      schema: 'movscript.setting.v1',
      kind: 'setting',
      id: 'setting_hero',
      title: 'Old Hero',
      setting_kind: 'character',
    }), 'utf8')

    const initialBuildResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'initial-build',
      method: 'tools/call',
      params: {
        name: 'movscript_workspace_interpret',
        arguments: { projectId: 6 },
      },
    })
    assert.equal(initialBuildResponse.error, undefined)
    assert.equal(initialBuildResponse.result.data.status, 'interpreted')

    await writeFile(join(projectDir, 'settings', 'setting_hero', 'setting.json'), JSON.stringify({
      schema: 'movscript.setting.v1',
      kind: 'setting',
      id: 'setting_hero',
      title: 'New Hero',
      setting_kind: 'character',
    }), 'utf8')

    const modelResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'get-model',
      method: 'tools/call',
      params: {
        name: 'movscript_workspace_get_model',
        arguments: { projectId: 6, entityKind: 'setting', entityId: 'setting_hero' },
      },
    })
    const model = record(modelResponse?.result?.data)
    assert.equal(model.workspaceKind, 'setting_workspace')
    assert.ok(model.editablePaths.includes('settings/setting_hero/setting.json'))

    const reviewResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'review',
      method: 'tools/call',
      params: {
        name: 'movscript_workspace_review',
        arguments: { projectId: 6 },
      },
    })
    const review = record(reviewResponse?.result?.data)
    assert.equal(review.basePath, '.movscript/checkpoints/current/source')
    assert.equal(review.sourcePath, '')
    assert.equal(review.summary.modified, 1)
    assert.equal(review.readyToInterpret, true)

    const buildResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'build',
      method: 'tools/call',
      params: {
        name: 'movscript_workspace_interpret',
        arguments: { projectId: 6 },
      },
    })
    const build = record(buildResponse?.result?.data)
    assert.equal(build.status, 'interpreted')
    const buildText = buildResponse.result.content?.[0]?.text ?? ''
    assert.match(buildText, /movscript\.workspace-interpret-agent-summary\.v1/)
    assert.doesNotMatch(buildText, /basePath/)
    assert.doesNotMatch(buildText, /currentPath/)
    assert.doesNotMatch(buildText, /contentHash/)
    assert.equal(Boolean(build.review?.changedFiles?.[0]?.currentPath), true)
    assert.equal(existsSync(join(projectDir, '.interpret', 'indexes', 'domain-index.json')), true)
    assert.equal(JSON.parse(readFileSync(join(projectDir, '.interpret', 'current', 'settings', 'setting_hero', 'setting.json'), 'utf8')).title, 'New Hero')
  } finally {
    updateMCPContextSnapshot(emptyMCPContextSnapshot())
    if (previousWorkspaceDir === undefined) delete process.env.MOVSCRIPT_WORKSPACE_DIR
    else process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
  }
})

test('MCP domain tools require explicit project id', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-project-required-'))
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  try {
    const response = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'global-missing-project',
      method: 'tools/call',
      params: {
        name: 'domain_overview',
        arguments: {},
      },
    })

    assert.equal(response?.error?.code, -32000)
    assert.match(response?.error?.message ?? '', /projectId is required/)
  } finally {
    if (previousWorkspaceDir === undefined) delete process.env.MOVSCRIPT_WORKSPACE_DIR
    else process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
  }
})

test('MCP upsert setting accepts legacy record body without payload error', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-upsert-setting-record-'))
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  try {
    const response = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'upsert-setting-record',
      method: 'tools/call',
      params: {
        name: 'domain_upsert_setting',
        arguments: {
          projectId: 6,
          record: {
            id: 'setting_legacy',
            title: 'Legacy Body',
            setting_kind: 'character',
          },
        },
      },
    })

    assert.equal(response?.error, undefined)
    assert.equal(response?.result?.data?.path, 'settings/setting_legacy/setting.json')
    const written = JSON.parse(readFileSync(join(
      workspaceDir,
      'local',
      'projects',
      'project_6',
      'settings',
      'setting_legacy',
      'setting.json',
    ), 'utf8'))
    assert.equal(written.title, 'Legacy Body')
    assert.equal(written.setting_kind, 'character')
  } finally {
    if (previousWorkspaceDir === undefined) delete process.env.MOVSCRIPT_WORKSPACE_DIR
    else process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
  }
})
