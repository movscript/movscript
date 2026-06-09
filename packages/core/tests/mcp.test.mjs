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
  assert.ok(tools.includes('system_generate_video'))
  assert.ok(tools.includes('system_resource_library_query'))
  assert.ok(tools.includes('system_resource_video_extract_frames'))
  assert.ok(tools.includes('system_shot_library_query'))
  assert.ok(tools.includes('system_external_resource_search'))
  assert.ok(tools.includes('domain_get_model'))
  assert.ok(tools.includes('domain_query_entities'))
  assert.ok(tools.includes('domain_query_settings'))
  assert.ok(tools.includes('domain_query_assets'))
  assert.ok(tools.includes('domain_query_production_context'))
  assert.ok(tools.includes('domain_upsert_setting'))
  assert.ok(tools.includes('domain_update_entity_transition'))
  assert.ok(tools.includes('domain_update_storyboard_timeline'))
  assert.ok(tools.includes('domain_append_candidate'))
  assert.ok(tools.includes('domain_create_asset_slot_candidate'))
  assert.ok(tools.includes('domain_create_keyframe_candidate'))
  assert.ok(tools.includes('domain_create_content_candidate'))
  assert.ok(tools.includes('domain_review'))
  assert.ok(tools.includes('domain_build'))
  assert.equal(tools.includes('domain_update_scene_moment_timing'), false)
  assert.equal(tools.includes('domain_update_storyboard_timing'), false)
  assert.equal(tools.includes('domain_update_content_unit_generation_prompt'), false)
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
  assert.equal(tools.includes('movscript_production_context_query'), false)
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

test('MCP workspace tools expose get_model review and build over source/.build', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-workspace-tools-'))
  const projectDir = join(workspaceDir, '.movscript', 'user', '1', 'projects', 'project_6')
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
    await mkdir(join(projectDir, '.build', 'current', 'settings', 'setting_hero'), { recursive: true })
    await mkdir(join(projectDir, 'settings', 'setting_hero'), { recursive: true })
    await writeFile(join(projectDir, '.build', 'current', 'settings', 'setting_hero', 'setting.json'), JSON.stringify({
      schema: 'movscript.setting.v1',
      kind: 'setting',
      id: 'setting_hero',
      title: 'Old Hero',
    }), 'utf8')
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
    assert.equal(review.basePath, '.build/current')
    assert.equal(review.sourcePath, '')
    assert.equal(review.summary.modified, 1)
    assert.equal(review.readyToBuild, true)

    const buildResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'build',
      method: 'tools/call',
      params: {
        name: 'movscript_workspace_build',
        arguments: { projectId: 6 },
      },
    })
    const build = record(buildResponse?.result?.data)
    assert.equal(build.status, 'built')
    assert.equal(existsSync(join(projectDir, '.build', 'indexes', 'domain-index.json')), true)
    assert.equal(JSON.parse(readFileSync(join(projectDir, '.build', 'current', 'settings', 'setting_hero', 'setting.json'), 'utf8')).title, 'New Hero')
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
      '.movscript',
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
