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
  composeResourceVideosToResource,
  createMovScriptDomainRuntime,
  createShotGroup,
  extractResourceVideoFrameToResource,
  generateImage,
  getImageGenerationJob,
  getMCPFocusSnapshot,
  getShotGroup,
  getImageGenerationJobs,
  handleJSONRPC,
  listTools,
  readResourceImageForVision,
  resolveMCPProjectWorkspaceLocator,
  transformResourceImageToResource,
  trimResourceVideoToResource,
  updateMCPContextSnapshot,
  uploadAgentImageResource,
  uploadAgentImageResources,
} from '../dist/mcp/node/index.js'
import {
  getMovScriptBackendAPIBaseURL,
  setMovScriptBackendAPIBaseURL,
  writeMovScriptBackendAuth,
  writeMovScriptBackendConfig,
} from '../dist/backend/node/index.js'
import { startProjectService } from '../../../services/project-service/src/server.mjs'
import { startEditingService } from '../../../services/editing-service/src/server.mjs'

const onePixelPNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lgn+9QAAAABJRU5ErkJggg=='
const onePixelPNGBytes = Buffer.from(onePixelPNG.split(',')[1], 'base64')
let projectServiceRuntime
let previousProjectServiceURL
let editingServiceRuntime
let previousEditingServiceURL

test.before(async () => {
  previousProjectServiceURL = process.env.MOVSCRIPT_PROJECT_SERVICE_URL
  previousEditingServiceURL = process.env.MOVSCRIPT_EDITING_SERVICE_URL
  projectServiceRuntime = await startProjectService()
  editingServiceRuntime = await startEditingService()
  process.env.MOVSCRIPT_PROJECT_SERVICE_URL = projectServiceRuntime.url
  process.env.MOVSCRIPT_EDITING_SERVICE_URL = editingServiceRuntime.url
})

test.after(async () => {
  if (projectServiceRuntime) await projectServiceRuntime.close()
  if (editingServiceRuntime) await editingServiceRuntime.close()
  if (previousProjectServiceURL === undefined) {
    delete process.env.MOVSCRIPT_PROJECT_SERVICE_URL
  } else {
    process.env.MOVSCRIPT_PROJECT_SERVICE_URL = previousProjectServiceURL
  }
  if (previousEditingServiceURL === undefined) {
    delete process.env.MOVSCRIPT_EDITING_SERVICE_URL
  } else {
    process.env.MOVSCRIPT_EDITING_SERVICE_URL = previousEditingServiceURL
  }
})

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
const duration = Number(process.env.MOVSCRIPT_TEST_VIDEO_DURATION || 12);
process.stdout.write(JSON.stringify({
  format: { duration: String(duration) },
  streams: [{ width, height, avg_frame_rate: '30/1', r_frame_rate: '30/1' }]
}));
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

function localAdminMCPContextSnapshot() {
  return {
    ...emptyMCPContextSnapshot(),
    user: { id: 1, username: 'admin' },
  }
}

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

async function writeTestProjectManifest(projectDir, projectUid, title = 'Test Project') {
  await mkdir(projectDir, { recursive: true })
  await writeFile(join(projectDir, 'workspace.json'), JSON.stringify({
    schema: 'movscript.workspace.v2',
    project_uid: projectUid,
    title,
  }), 'utf8')
}

function mockProjectBindingResponse(input, init = {}) {
  const url = new URL(String(input))
  const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : {}
  if (url.pathname.endsWith('/projects/ensure') && init.method === 'POST') {
    return jsonResponse({
      project: {
        ID: 42,
        id: 42,
        name: body.name,
        project_uid: body.project_uid,
      },
      created: true,
    }, 201)
  }
  if (url.pathname.endsWith('/project-data/spaces') && init.method === 'POST') {
    return jsonResponse({
      id: 7,
      project_uid: body.project_uid,
      title: body.title,
      scope_kind: 'user',
      scope_id: '1',
    })
  }
  return undefined
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
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
  const toolList = toolsResponse?.result?.tools ?? []
  const tools = toolList.map((tool) => tool.name)
  const toolsByName = new Map(toolList.map((tool) => [tool.name, tool]))
  assert.equal(tools.includes('system_focus_get'), false)
  assert.ok(tools.includes('context_current_get'))
  assert.equal(tools.includes('movscript_focus_get'), false)
  assert.ok(tools.includes('system_project_create'))
  assert.ok(tools.includes('system_project_init'))
  assert.ok(tools.includes('system_project_open'))
  assert.ok(tools.includes('system_project_fetch'))
  assert.ok(tools.includes('system_model_list'))
  assert.ok(tools.includes('generation_capability_list'))
  assert.ok(tools.includes('generation_prepare'))
  assert.ok(tools.includes('generation_submit'))
  assert.ok(tools.includes('generation_job_get'))
  assert.ok(tools.includes('generation_job_get_batch'))
  assert.ok(tools.includes('generation_result_register'))
  assert.equal(tools.includes('system_generate_image'), false)
  assert.equal(tools.includes('system_generate_video'), false)

  const removedFocusResponse = await handleJSONRPC({
    jsonrpc: '2.0',
    id: 'removed-system-focus',
    method: 'tools/call',
    params: {
      name: 'system_focus_get',
      arguments: {},
    },
  })
  assert.match(removedFocusResponse?.error?.message ?? '', /Unknown tool: system_focus_get/)

  const removedLegacyFocusResponse = await handleJSONRPC({
    jsonrpc: '2.0',
    id: 'removed-legacy-focus',
    method: 'tools/call',
    params: {
      name: 'movscript_focus_get',
      arguments: {},
    },
  })
  assert.match(removedLegacyFocusResponse?.error?.message ?? '', /Unknown tool: movscript_focus_get/)

  updateMCPContextSnapshot({
    ...emptyMCPContextSnapshot(),
    route: { pathname: '/projects/42', search: '?workspaceId=secret&tab=timeline', hash: '#edit' },
    project: { id: 42, name: 'Demo Project' },
    productionId: 'prod-1',
    selection: { entityKind: 'production', label: 'Cut v1' },
    updatedAt: '2026-06-29T00:00:00.000Z',
  })
  const currentContext = await callTool('context_current_get', {})
  assert.equal(currentContext.schema, 'movscript.mcp.context-current.v1')
  assert.equal(currentContext.context.route.pathname, '/projects/42')
  assert.equal(currentContext.context.route.search, '?tab=timeline')
  assert.equal(currentContext.context.project.name, 'Demo Project')
  assert.equal(currentContext.source.routeSearchSanitized, true)
  updateMCPContextSnapshot(emptyMCPContextSnapshot())

  assert.ok(tools.includes('system_resource_library_query'))
  assert.ok(tools.includes('system_resource_library_open'))
  assert.ok(tools.includes('system_resource_image_transform_to_resource'))
  assert.ok(tools.includes('system_resource_video_extract_frames'))
  assert.ok(tools.includes('system_resource_video_probe'))
  assert.ok(tools.includes('system_resource_video_extract_frame_to_resource'))
  assert.ok(tools.includes('system_resource_video_extract_frames_to_resources'))
  assert.ok(tools.includes('system_resource_video_trim_to_resource'))
  assert.ok(tools.includes('system_resource_video_compose_to_resource'))
  assert.ok(tools.includes('system_resource_video_concat_to_resource'))
  assert.ok(tools.includes('system_resource_video_contact_sheet_to_resource'))
  assert.ok(tools.includes('system_resource_video_extract_audio_to_resource'))
  assert.match(String(toolsByName.get('system_resource_video_trim_to_resource')?.description), /Neutral resource preparation/)
  assert.match(String(toolsByName.get('system_resource_video_trim_to_resource')?.description), /not the product editing path/)
  assert.match(String(toolsByName.get('system_resource_video_trim_to_resource')?.description), /editing_\* tools through Electron mediaPipeline/)
  assert.match(String(toolsByName.get('system_resource_video_compose_to_resource')?.description), /Resource-level video utility/)
  assert.match(String(toolsByName.get('system_resource_video_compose_to_resource')?.description), /not the product editing path/)
  assert.match(String(toolsByName.get('system_resource_video_concat_to_resource')?.description), /Resource-level video utility/)
  assert.match(String(toolsByName.get('system_resource_video_concat_to_resource')?.description), /not the product editing path/)
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
  assert.ok(tools.includes('domain_build_content_unit_backend_prompt'))
  assert.ok(tools.includes('domain_read_production_timeline'))
  assert.equal(tools.includes('domain_apply_production_timeline_commands'), false)
  assert.equal(tools.includes('domain_apply_scene_moment_timeline_commands'), false)
  assert.equal(tools.includes('domain_compose_production_from_timeline'), false)
  assert.equal(tools.includes('domain_compose_scene_moment_from_edit_plan'), false)
  assert.ok(tools.includes('domain_read_content_unit_generation_prompt'))
  assert.ok(tools.includes('domain_read_content_unit_input_version'))
  assert.ok(tools.includes('domain_read_production_work_plan'))
  assert.ok(tools.includes('domain_upsert_setting'))
  assert.ok(tools.includes('domain_upsert_production'))
  assert.ok(tools.includes('domain_upsert_segment'))
  assert.ok(tools.includes('domain_upsert_scene_moment'))
  assert.equal(tools.includes('domain_upsert_shot'), false)
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
  assert.ok(tools.includes('domain_select_candidate'))
  assert.ok(tools.includes('domain_update_candidate'))
  assert.ok(tools.includes('domain_unlock_candidate'))
  assert.match(String(toolsByName.get('domain_append_candidate')?.description), /Migration-only temporary fallback/)
  assert.match(String(toolsByName.get('domain_create_asset_slot_candidate')?.description), /Migration-only temporary fallback/)
  assert.match(String(toolsByName.get('domain_create_keyframe_candidate')?.description), /Migration-only temporary fallback/)
  assert.match(String(toolsByName.get('domain_select_candidate')?.description), /Migration-only temporary fallback/)
  assert.match(String(toolsByName.get('domain_update_candidate')?.description), /Migration-only temporary fallback/)
  assert.match(String(toolsByName.get('domain_unlock_candidate')?.description), /Migration-only temporary fallback/)
  assert.ok(tools.includes('domain_create_content_candidate'))
  assert.ok(tools.includes('domain_register_raw_resource_as_content_unit_candidate'))
  assert.ok(tools.includes('domain_create_content_candidate_batch'))
  assert.ok(tools.includes('domain_select_content_unit_candidate_batch'))
  assert.ok(tools.includes('domain_decide_content_unit_candidate'))
  assert.ok(tools.includes('domain_production_status_summary'))
  assert.ok(tools.includes('domain_review'))
  assert.ok(tools.includes('domain_interpret'))
  assert.equal(tools.includes('domain_update_scene_moment_timing'), false)
  assert.equal(tools.includes('domain_update_storyboard_timing'), false)
  assert.equal(tools.includes('domain_update_content_unit_generation_prompt'), false)
  assert.equal(tools.includes('movscript_workspace_get_model'), false)
  assert.equal(tools.includes('movscript_workspace_review'), false)
  assert.equal(tools.includes('movscript_workspace_interpret'), false)
  assert.equal(tools.includes('workspace_fetch'), false)
  assert.equal(tools.includes('workspace_status'), false)
  assert.equal(tools.includes('workspace_review'), false)
  assert.equal(tools.includes('workspace_submit'), false)
  assert.equal(tools.includes('movscript_script_list'), false)
  assert.equal(tools.includes('movscript_script_locate'), false)
  assert.ok(tools.includes('movscript_resource_library_query'))
  assert.ok(tools.includes('movscript_resource_library_open'))
  assert.ok(tools.includes('movscript_resource_video_extract_frames'))
  assert.ok(tools.includes('movscript_resource_image_transform_to_resource'))
  assert.ok(tools.includes('movscript_resource_video_probe'))
  assert.ok(tools.includes('movscript_resource_video_extract_frame_to_resource'))
  assert.ok(tools.includes('movscript_resource_video_extract_frames_to_resources'))
  assert.ok(tools.includes('movscript_resource_video_trim_to_resource'))
  assert.ok(tools.includes('movscript_resource_video_compose_to_resource'))
  assert.ok(tools.includes('movscript_resource_video_concat_to_resource'))
  assert.ok(tools.includes('movscript_resource_video_contact_sheet_to_resource'))
  assert.ok(tools.includes('movscript_resource_video_extract_audio_to_resource'))
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
  assert.ok(tools.includes('generation_capability_list'))
  assert.ok(tools.includes('generation_prepare'))
  assert.ok(tools.includes('generation_submit'))
  assert.ok(tools.includes('generation_job_get'))
  assert.ok(tools.includes('generation_job_get_batch'))
  assert.ok(tools.includes('generation_result_register'))

  const resourcesResponse = await handleJSONRPC({
    jsonrpc: '2.0',
    id: 'resources',
    method: 'resources/list',
  })
  const resources = (resourcesResponse?.result?.resources ?? []).map((resource) => resource.uri)
  assert.ok(resources.includes('movscript://projects'))
  assert.ok(resources.includes('movscript://resource-library'))
  assert.ok(resources.includes('movscript://resource-library/open'))
  assert.ok(resources.includes('movscript://shot-library'))
  assert.ok(resources.includes('movscript://external-resources'))
})

test('MCP local project tools initialize and fetch a path-bound project', async () => {
  const originalFetch = globalThis.fetch
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-mcp-local-project-'))
  const backendRequests = []
  try {
    globalThis.fetch = async (url, init = {}) => {
      backendRequests.push({ url: String(url), init })
      const body = init.body ? JSON.parse(String(init.body)) : {}
      if (String(url).endsWith('/api/v1/projects/ensure')) {
        return new Response(JSON.stringify({
          project: {
            ID: 42,
            id: 42,
            name: body.name,
            project_uid: body.project_uid,
          },
          created: true,
        }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (String(url).endsWith('/api/v1/project-data/spaces')) {
        return new Response(JSON.stringify({
          id: 7,
          project_uid: body.project_uid,
          title: body.title,
          scope_kind: 'user',
          scope_id: '1',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: 'unexpected request' }), { status: 500 })
    }

    const initResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'local-project-init',
      method: 'tools/call',
      params: {
        name: 'system_project_init',
        arguments: {
          projectDir,
          title: 'Loose Path Project',
          localProjectId: 'loose_path_project',
        },
      },
    })

    assert.equal(initResponse?.error, undefined)
    assert.equal(initResponse?.result?.data?.status, 'created')
    assert.equal(initResponse?.result?.data?.localProjectId, 'loose_path_project')
    assert.equal(initResponse?.result?.data?.local_project_id, 'loose_path_project')
    assert.equal(initResponse?.result?.data?.projectId, 'loose_path_project')
    assert.equal(initResponse?.result?.data?.projectDir, projectDir)
    assert.match(initResponse?.result?.data?.projectUid ?? '', /^prj_/)
    assert.equal(initResponse?.result?.data?.backendProject?.project_uid, initResponse?.result?.data?.projectUid)
    assert.equal(initResponse?.result?.data?.projectDataSpace?.project_uid, initResponse?.result?.data?.projectUid)
    assert.equal(initResponse?.result?.data?.locator?.projectDir, projectDir)
    assert.equal(initResponse?.result?.data?.locator?.projectUid, initResponse?.result?.data?.projectUid)
    assert.equal(existsSync(join(projectDir, 'workspace.json')), true)
    const workspaceJson = JSON.parse(readFileSync(join(projectDir, 'workspace.json'), 'utf8'))
    assert.equal(workspaceJson.project_uid, initResponse?.result?.data?.projectUid)
    assert.equal(workspaceJson.project_id, 'loose_path_project')
    assert.equal(JSON.parse(readFileSync(join(projectDir, 'project.json'), 'utf8')).title, 'Loose Path Project')

    const fetchResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'local-project-fetch',
      method: 'tools/call',
      params: {
        name: 'system_project_open',
        arguments: { project_dir: projectDir },
      },
    })

    assert.equal(fetchResponse?.error, undefined)
    assert.equal(fetchResponse?.result?.data?.status, 'ready')
    assert.equal(fetchResponse?.result?.data?.projectDir, projectDir)
    assert.equal(fetchResponse?.result?.data?.projectUid, initResponse?.result?.data?.projectUid)
    assert.equal(fetchResponse?.result?.data?.project?.name, 'Loose Path Project')
    assert.equal(fetchResponse?.result?.data?.backendProject?.project_uid, initResponse?.result?.data?.projectUid)
    assert.equal(fetchResponse?.result?.data?.projectDataSpace?.project_uid, initResponse?.result?.data?.projectUid)
    assert.deepEqual(backendRequests.map((request) => new URL(request.url).pathname), [
      '/api/v1/projects/ensure',
      '/api/v1/project-data/spaces',
    ])
  } finally {
    globalThis.fetch = originalFetch
    await rm(projectDir, { recursive: true, force: true })
  }
})

test('MCP project locator accepts an explicit project directory without user binding', async () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-mcp-home-'))
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-mcp-project-'))
  try {
    writeMovScriptBackendConfig(workspaceDir, {
      baseURL: 'https://cloud.example',
      activeUserId: 99,
    })
    writeMovScriptBackendAuth(workspaceDir, {
      token: 'workspace-token',
      user: { id: 99, username: 'workspace-user' },
    })
    updateMCPContextSnapshot(localAdminMCPContextSnapshot())

    const locator = resolveMCPProjectWorkspaceLocator({
      workspaceDir,
      projectDir,
    })

    assert.deepEqual(locator, {
      workspaceDir,
      projectDir,
    })
  } finally {
    updateMCPContextSnapshot(emptyMCPContextSnapshot())
    await rm(workspaceDir, { recursive: true, force: true })
    await rm(projectDir, { recursive: true, force: true })
  }
})

test('MCP domain runtime can bind directly to a project directory without backend project id', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-mcp-runtime-project-'))
  try {
    const runtime = createMovScriptDomainRuntime({ projectDir })

    assert.equal(runtime.projectCwd, projectDir)
    assert.equal(runtime.projectDir, projectDir)
    assert.ok(runtime.decisionStore)
  } finally {
    await rm(projectDir, { recursive: true, force: true })
  }
})

test('MCP domain asset certification registers selected asset resource and writes provider metadata', async () => {
  const originalFetch = globalThis.fetch
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-asset-certification-'))
  const postedBodies = []
  const decisionContext = {
    schema: 'movscript.decision_context.v1',
    target_kind: 'content_unit',
    target_ref: 'content_units/cu_wet_hair_ref',
    selection: {
      candidate_id: 'candidate_wet_hair_1',
      resource_id: 101,
    },
    candidates: [{
      id: 'candidate_wet_hair_1',
      status: 'succeeded',
      outputs: [{
        kind: 'image',
        resource_id: 101,
      }],
    }],
  }
  try {
    await writeTestProjectManifest(projectDir, 'prj_asset_certification', 'Asset Certification')
    await mkdir(join(projectDir, 'settings', 'hero', 'states', 'rain', 'assets', 'wet_hair'), { recursive: true })
    await mkdir(join(projectDir, 'content_units', 'cu_wet_hair_ref'), { recursive: true })
    await mkdir(join(projectDir, '.movscript', 'decisions', 'content_units', 'cu_wet_hair_ref'), { recursive: true })
    await writeFile(join(projectDir, 'settings', 'hero', 'setting.json'), JSON.stringify({
      schema: 'movscript.setting.v1',
      kind: 'setting',
      id: 'hero',
      title: 'Hero',
      setting_kind: 'character',
    }), 'utf8')
    await writeFile(join(projectDir, 'settings', 'hero', 'states', 'rain', 'setting_state.json'), JSON.stringify({
      schema: 'movscript.setting_state.v1',
      kind: 'setting_state',
      id: 'rain',
      setting_id: 'hero',
      title: 'Rain',
    }), 'utf8')
    await writeFile(join(projectDir, 'settings', 'hero', 'states', 'rain', 'assets', 'wet_hair', 'asset.json'), JSON.stringify({
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'wet_hair',
      setting_id: 'hero',
      setting_state_id: 'rain',
      title: 'Wet hair reference',
      slot: 'character_state_reference',
      asset_kind: 'image',
    }), 'utf8')
    await writeFile(join(projectDir, 'content_units', 'cu_wet_hair_ref', 'content_unit.json'), JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_wet_hair_ref',
      title: 'Wet hair visual reference',
      content_unit_type: 'asset_ref',
      output_kind: 'image',
      asset_ref: 'wet_hair',
      edit_prompt: { text: 'Generate wet hair.' },
    }), 'utf8')
    await writeFile(join(projectDir, '.movscript', 'decisions', 'content_units', 'cu_wet_hair_ref', 'decision_context.json'), JSON.stringify(decisionContext), 'utf8')

    globalThis.fetch = async (input, init = {}) => {
      const bound = mockProjectBindingResponse(input, init)
      if (bound) return bound
      if (projectServiceRuntime?.url && String(input).startsWith(projectServiceRuntime.url)) {
        return originalFetch(input, init)
      }
      const url = new URL(String(input))
      const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : {}
      if (url.pathname.endsWith('/decisions/query') && init.method === 'POST') {
        return jsonResponse((Array.isArray(body.target_refs) ? body.target_refs : [])
          .filter((targetRef) => targetRef === decisionContext.target_ref)
          .map(() => decisionContext))
      }
      if (url.pathname.endsWith('/decisions') && (init.method ?? 'GET') === 'GET') {
        return url.searchParams.get('target_ref') === decisionContext.target_ref
          ? jsonResponse(decisionContext)
          : jsonResponse({}, 404)
      }
      if (url.pathname === '/api/v1/provider-assets/providers/volcengine_ark_official/certify' && init.method === 'POST') {
        postedBodies.push(body)
        return jsonResponse({
          status: 'succeeded',
          provider: 'volc-ark-main',
          provider_id: 'volc-ark-main',
          provider_kind: 'volcengine_ark_official',
          source_resource_id: 101,
          source_url: body.source_url,
          asset_uri: 'asset://hub_asset_101',
          hub_asset_id: 'hub_asset_101',
          certification: {
            provider: 'volc-ark-main',
            provider_id: 'volc-ark-main',
            provider_kind: 'volcengine_ark_official',
            status: 'active',
            hub_asset_id: 'hub_asset_101',
            asset_uri: 'asset://hub_asset_101',
            source_resource_id: 101,
            source_candidate_id: 'candidate_wet_hair_1',
            source_url: body.source_url,
            source_hash: 'test-source-hash',
            certified_at: '2026-06-23T00:00:00Z',
            updated_at: '2026-06-23T00:00:00Z',
            gateway_base_url: 'https://hub.test',
            raw_status: 'active',
          },
        })
      }
      throw new Error(`unexpected fetch: ${String(input)} ${init.method ?? 'GET'}`)
    }

    const result = await callTool('domain_certify_asset_provider', {
      projectDir,
      providerScopeId: 'prj_asset_certification',
      assetId: 'wet_hair',
      resourceId: 101,
      source_url: 'https://cdn.example.test/wet-hair.png',
    })
    const asset = JSON.parse(readFileSync(join(projectDir, 'settings', 'hero', 'states', 'rain', 'assets', 'wet_hair', 'asset.json'), 'utf8'))

    assert.equal(result.status, 'succeeded')
    assert.equal(result.source_resource_id, 101)
    assert.equal(result.source_candidate_id, 'candidate_wet_hair_1')
    assert.equal(result.asset_uri, 'asset://hub_asset_101')
    assert.equal(result.provider_id, 'volc-ark-main')
    assert.deepEqual(postedBodies, [{
      provider: 'volcengine_ark_official',
      resource_id: 101,
      source_candidate_id: 'candidate_wet_hair_1',
      project_id: 'prj_asset_certification',
      project_name: 'prj_asset_certification',
      setting_id: 'hero',
      source_url: 'https://cdn.example.test/wet-hair.png',
      name: 'Wet hair reference',
    }])
    assert.equal(asset.provider_certifications['volc-ark-main'].status, 'active')
    assert.equal(asset.provider_certifications['volc-ark-main'].hub_asset_id, 'hub_asset_101')
    assert.equal(asset.provider_certifications['volc-ark-main'].source_resource_id, 101)
    assert.equal(asset.provider_certifications['volc-ark-main'].source_candidate_id, 'candidate_wet_hair_1')
  } finally {
    globalThis.fetch = originalFetch
    await rm(projectDir, { recursive: true, force: true })
  }
})

test('MCP domain runtime builds scoped project data decisions without requiring auth token', async () => {
  const originalFetch = globalThis.fetch
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-mcp-scoped-no-auth-home-'))
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-mcp-scoped-no-auth-project-'))
  const requests = []
  try {
    await writeFile(join(projectDir, 'workspace.json'), JSON.stringify({
      schema: 'movscript.workspace.v2',
      project_uid: 'prj_scoped_no_auth',
      title: 'Scoped No Auth',
    }))
    writeMovScriptBackendConfig(workspaceDir, {
      baseURL: 'http://127.0.0.1:54216',
      activeUserId: 1,
    })
    globalThis.fetch = async (url, init = {}) => {
      if (projectServiceRuntime && String(url).startsWith(projectServiceRuntime.url)) {
        return originalFetch(url, init)
      }
      requests.push({ url: String(url), init })
      return new Response(JSON.stringify({
        id: 1,
        project_uid: 'prj_scoped_no_auth',
        target_kind: 'content_unit',
        target_ref: 'content_units/cu_opening',
        candidates: [{ id: 'candidate_a' }],
        status: 'open',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    const runtime = createMovScriptDomainRuntime({ workspaceDir, projectDir, userId: 1 })
    assert.ok(runtime.decisionStore)

    await runtime.decisionStore.upsertContentUnitCandidate({
      contentUnitId: 'opening',
      candidate: { id: 'candidate_a' },
    })

    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, 'http://127.0.0.1:54216/api/v1/project-data/decisions/candidates')
    assert.equal(requests[0].init.headers.authorization, undefined)
    assert.equal(requests[0].init.headers['X-User-ID'], '1')
    const body = JSON.parse(requests[0].init.body)
    assert.equal(body.scope_kind, 'user')
    assert.equal(body.scope_id, '1')
    assert.equal(body.project_uid, 'prj_scoped_no_auth')
    assert.equal(body.title, 'Scoped No Auth')
  } finally {
    globalThis.fetch = originalFetch
    await rm(workspaceDir, { recursive: true, force: true })
    await rm(projectDir, { recursive: true, force: true })
  }
})

test('MCP domain runtime uses scoped project data decisions when project uid and auth exist', async () => {
  const originalFetch = globalThis.fetch
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-mcp-scoped-home-'))
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-mcp-scoped-project-'))
  const requests = []
  try {
    await writeFile(join(projectDir, 'workspace.json'), JSON.stringify({
      schema: 'movscript.workspace.v2',
      project_uid: 'prj_scoped_runtime',
      title: 'Scoped Runtime',
    }))
    writeMovScriptBackendConfig(workspaceDir, {
      baseURL: 'https://cloud.example',
      activeUserId: 99,
    })
    writeMovScriptBackendAuth(workspaceDir, {
      token: 'workspace-token',
      user: { id: 99, username: 'workspace-user' },
    })
    globalThis.fetch = async (url, init = {}) => {
      if (projectServiceRuntime && String(url).startsWith(projectServiceRuntime.url)) {
        return originalFetch(url, init)
      }
      requests.push({ url: String(url), init })
      return new Response(JSON.stringify({
        id: 1,
        project_uid: 'prj_scoped_runtime',
        target_kind: 'content_unit',
        target_ref: 'content_units/cu_opening',
        candidates: [{ id: 'candidate_a' }],
        status: 'open',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    const runtime = createMovScriptDomainRuntime({ workspaceDir, projectDir, projectUid: '1', orgId: 12 })
    assert.ok(runtime.decisionStore)

    await runtime.decisionStore.upsertContentUnitCandidate({
      contentUnitId: 'opening',
      candidate: { id: 'candidate_a' },
    })

    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, 'https://cloud.example/api/v1/project-data/decisions/candidates')
    assert.equal(requests[0].init.method, 'POST')
    assert.equal(requests[0].init.headers.authorization, 'Bearer workspace-token')
    assert.equal(requests[0].init.headers['X-Org-ID'], '12')
    const body = JSON.parse(requests[0].init.body)
    assert.equal(body.scope_kind, 'org')
    assert.equal(body.scope_id, '12')
    assert.equal(body.project_uid, 'prj_scoped_runtime')
    assert.equal(body.title, 'Scoped Runtime')
    assert.equal(body.target_kind, 'content_unit')
    assert.equal(body.target_ref, 'content_units/opening')
  } finally {
    globalThis.fetch = originalFetch
    await rm(workspaceDir, { recursive: true, force: true })
    await rm(projectDir, { recursive: true, force: true })
  }
})

test('MCP project resources read project workspace data without backend entity endpoints', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const originalFetch = globalThis.fetch
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-project-resources-'))
  const projectDir = join(workspaceDir, 'projects', 'project-resources')
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  try {
    updateMCPContextSnapshot({
      route: { pathname: '/project/agent', search: '', hash: '' },
      project: { id: 14, name: 'Local Project', projectDir },
      productionId: null,
      user: { id: 1, username: 'alice', systemRole: 'user' },
      selection: null,
      updatedAt: new Date().toISOString(),
    })
    const listedResourcesResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'project-resource-list',
      method: 'resources/list',
    })
    const listedResources = listedResourcesResponse?.result?.resources ?? []
    assert.match(
      listedResources.find((resource) => resource.uri === 'movscript://project/14/timeline-namespaces')?.description ?? '',
      /Canonical timeline namespace nodes/,
    )
    assert.match(
      listedResources.find((resource) => resource.uri === 'movscript://project/14/episodes')?.description ?? '',
      /Legacy production alias/,
    )
    assert.match(
      listedResources.find((resource) => resource.uri === 'movscript://project/14/setting-states')?.description ?? '',
      /Legacy setting-state alias/,
    )
    globalThis.fetch = async (input, init = {}) => {
      if (projectServiceRuntime && String(input).startsWith(projectServiceRuntime.url)) {
        return originalFetch(input, init)
      }
      throw new Error('backend fetch should not be called for project resources/read')
    }
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(projectDir, 'project.json'), JSON.stringify({
      schema: 'movscript.project.v1',
      kind: 'project',
      project_id: 'project_resources',
      title: 'Project Resources',
      namespace_vocabulary: {
        timeline_template: 'series',
        timeline_namespaces: ['episode', 'beat'],
        setting_namespaces: ['character', 'costume_state'],
      },
    }), 'utf8')
    await mkdir(join(projectDir, 'settings', 'setting_hero'), { recursive: true })
    await writeFile(join(projectDir, 'settings', 'setting_hero', 'setting.json'), JSON.stringify({
      schema: 'movscript.setting.v1',
      kind: 'setting',
      id: 'setting_hero',
      title: 'Local Hero',
      setting_kind: 'character',
    }), 'utf8')
    await mkdir(join(projectDir, 'settings', 'setting_hero', 'states', 'base'), { recursive: true })
    await writeFile(join(projectDir, 'settings', 'setting_hero', 'states', 'base', 'setting_state.json'), JSON.stringify({
      schema: 'movscript.setting_state.v1',
      kind: 'setting_state',
      id: 'base',
      setting_id: 'setting_hero',
      title: 'Base Costume',
      namespace_kind: 'costume_state',
    }), 'utf8')
    await mkdir(join(projectDir, 'productions', 'pilot'), { recursive: true })
    await writeFile(join(projectDir, 'productions', 'pilot', 'production.json'), JSON.stringify({
      schema: 'movscript.production.v1',
      kind: 'production',
      id: 'pilot',
      title: 'Local Pilot',
      namespace_kind: 'episode',
    }), 'utf8')
    await mkdir(join(projectDir, 'productions', 'pilot', 'segments', 'opening'), { recursive: true })
    await writeFile(join(projectDir, 'productions', 'pilot', 'segments', 'opening', 'segment.json'), JSON.stringify({
      schema: 'movscript.segment.v1',
      kind: 'segment',
      id: 'opening',
      title: 'Opening Beat',
      namespace_kind: 'beat',
    }), 'utf8')
    await mkdir(join(projectDir, 'scripts', 'script_main'), { recursive: true })
    await writeFile(join(projectDir, 'scripts', 'script_main', 'script.json'), JSON.stringify({
      schema: 'movscript.script.v1',
      kind: 'script',
      id: 'script_main',
      title: 'Local Script',
      source_ref: 'script.md',
    }), 'utf8')
    await writeFile(join(projectDir, 'scripts', 'script_main', 'script.md'), 'INT. LOCAL ROOM - NIGHT', 'utf8')

    for (const [uri, title] of [
      ['movscript://project/14/settings', 'Local Hero'],
      ['movscript://project/14/setting-states', 'Base Costume'],
      ['movscript://project/14/episodes', 'Local Pilot'],
      ['movscript://project/14/scripts', 'Local Script'],
    ]) {
      const response = await handleJSONRPC({
        jsonrpc: '2.0',
        id: uri,
        method: 'resources/read',
        params: { uri },
      })
      assert.equal(response?.error, undefined)
      assert.match(response?.result?.contents?.[0]?.text ?? '', new RegExp(title))
    }

    const vocabularyResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'namespace-vocabulary',
      method: 'resources/read',
      params: { uri: 'movscript://project/14/namespace-vocabulary' },
    })
    const vocabularyText = vocabularyResponse?.result?.contents?.[0]?.text ?? ''
    assert.equal(vocabularyResponse?.error, undefined)
    assert.match(vocabularyText, /timelineNamespaces/)
    assert.match(vocabularyText, /episode/)
    assert.match(vocabularyText, /beat/)
    assert.match(vocabularyText, /settingNamespaces/)
    assert.match(vocabularyText, /costume_state/)

    const timelineResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'timeline-namespaces',
      method: 'resources/read',
      params: { uri: 'movscript://project/14/timeline-namespaces' },
    })
    const timelineText = timelineResponse?.result?.contents?.[0]?.text ?? ''
    assert.equal(timelineResponse?.error, undefined)
    assert.match(timelineText, /timeline_namespace/)
    assert.match(timelineText, /episode/)
    assert.match(timelineText, /beat/)
    assert.match(timelineText, /productions\/pilot\/production\.json/)

    const settingNamespacesResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'setting-namespaces',
      method: 'resources/read',
      params: { uri: 'movscript://project/14/setting-namespaces' },
    })
    const settingNamespacesText = settingNamespacesResponse?.result?.contents?.[0]?.text ?? ''
    assert.equal(settingNamespacesResponse?.error, undefined)
    assert.match(settingNamespacesText, /setting_namespace/)
    assert.match(settingNamespacesText, /character/)
    assert.match(settingNamespacesText, /costume_state/)
    assert.match(settingNamespacesText, /settings\/setting_hero\/states\/base\/setting_state\.json/)

    const settingsResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'settings-projection',
      method: 'resources/read',
      params: { uri: 'movscript://project/14/settings' },
    })
    const settingsText = settingsResponse?.result?.contents?.[0]?.text ?? ''
    assert.equal(settingsResponse?.error, undefined)
    assert.match(settingsText, /domainCategory/)
    assert.match(settingsText, /setting_namespace/)
    assert.match(settingsText, /domainKind/)
    assert.match(settingsText, /character/)
    assert.match(settingsText, /legacyAlias/)
    assert.match(settingsText, /preferredResourceKind/)
    assert.match(settingsText, /setting-namespaces/)

    const settingStatesResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'setting-states-projection',
      method: 'resources/read',
      params: { uri: 'movscript://project/14/setting-states' },
    })
    const settingStatesText = settingStatesResponse?.result?.contents?.[0]?.text ?? ''
    assert.equal(settingStatesResponse?.error, undefined)
    assert.match(settingStatesText, /domainCategory/)
    assert.match(settingStatesText, /setting_namespace/)
    assert.match(settingStatesText, /domainKind/)
    assert.match(settingStatesText, /costume_state/)
    assert.match(settingStatesText, /legacyAlias/)
    assert.match(settingStatesText, /preferredResourceKind/)
    assert.match(settingStatesText, /setting-namespaces/)

    const episodesResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'episodes-projection',
      method: 'resources/read',
      params: { uri: 'movscript://project/14/episodes' },
    })
    const episodesText = episodesResponse?.result?.contents?.[0]?.text ?? ''
    assert.equal(episodesResponse?.error, undefined)
    assert.match(episodesText, /domainCategory/)
    assert.match(episodesText, /timeline_namespace/)
    assert.match(episodesText, /domainKind/)
    assert.match(episodesText, /episode/)
    assert.match(episodesText, /legacyAlias/)
    assert.match(episodesText, /preferredResourceKind/)
    assert.match(episodesText, /timeline-namespaces/)
  } finally {
    globalThis.fetch = originalFetch
    updateMCPContextSnapshot(localAdminMCPContextSnapshot())
    if (previousWorkspaceDir === undefined) delete process.env.MOVSCRIPT_WORKSPACE_DIR
    else process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
    await rm(workspaceDir, { recursive: true, force: true })
  }
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

test('MCP content candidate schemas expose status enum and default guidance', () => {
  const tools = listTools()
  const expectedStatuses = ['queued', 'running', 'succeeded', 'failed', 'canceled', 'imported']

  const createTool = tools.find((tool) => tool.name === 'domain_create_content_candidate')
  assert.ok(createTool, 'domain_create_content_candidate schema should be exposed')
  assert.deepEqual(createTool.inputSchema.properties?.status?.enum, expectedStatuses)
  assert.match(createTool.inputSchema.properties?.status?.description ?? '', /Omit for completed generated resources/)
  assert.match(createTool.description ?? '', /Omit status for completed generated resources/)

  const batchTool = tools.find((tool) => tool.name === 'domain_create_content_candidate_batch')
  assert.ok(batchTool, 'domain_create_content_candidate_batch schema should be exposed')
  assert.deepEqual(batchTool.inputSchema.properties?.items?.items?.properties?.status?.enum, expectedStatuses)
  assert.match(batchTool.inputSchema.properties?.items?.items?.properties?.status?.description ?? '', /Do not use completed/)

  const registerTool = tools.find((tool) => tool.name === 'domain_register_raw_resource_as_content_unit_candidate')
  assert.ok(registerTool, 'domain_register_raw_resource_as_content_unit_candidate schema should be exposed')
  assert.deepEqual(registerTool.inputSchema.properties?.outputKind?.enum, ['image', 'video', 'audio', 'text', 'metadata'])
  assert.match(registerTool.description ?? '', /RawResource as a content-unit candidate/)
})

test('MCP content unit schema guidance routes namespace playback to production editing workspaces', () => {
  const tools = listTools()
  const contentUnitTool = tools.find((tool) => tool.name === 'domain_upsert_content_unit')
  assert.ok(contentUnitTool, 'domain_upsert_content_unit schema should be exposed')
  assert.match(contentUnitTool.description ?? '', /system primitives/)
  assert.match(contentUnitTool.description ?? '', /production editing workspace/)
  assert.doesNotMatch(contentUnitTool.description ?? '', /timeline_assembly_ref/)

  const productionTreeTool = tools.find((tool) => tool.name === 'domain_upsert_production_tree')
  assert.ok(productionTreeTool, 'domain_upsert_production_tree schema should be exposed')
  assert.match(productionTreeTool.description ?? '', /production story tree/)
  assert.match(productionTreeTool.description ?? '', /production editing workspace/)
  assert.doesNotMatch(productionTreeTool.description ?? '', /timeline_assembly_ref/)

  const timelineNamespaceTreeTool = tools.find((tool) => tool.name === 'domain_upsert_timeline_namespace_tree')
  assert.ok(timelineNamespaceTreeTool, 'domain_upsert_timeline_namespace_tree schema should be exposed')
  assert.match(timelineNamespaceTreeTool.description ?? '', /path-first timeline namespace tree/)
  assert.match(timelineNamespaceTreeTool.description ?? '', /instance parent-child structure comes from targetPath/)
  assert.match(timelineNamespaceTreeTool.description ?? '', /story structure only/)
  assert.match(timelineNamespaceTreeTool.description ?? '', /production editing workspace/)
})

test('MCP domain_upsert_production allocates production id from title when omitted', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-mcp-production-id-'))
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => mockProjectBindingResponse(input, init) ?? previousFetch(input, init)
  try {
    await writeTestProjectManifest(projectDir, 'prj_mcp_production_id', 'MCP Production ID')

    const result = await callTool('domain_upsert_production', {
      projectDir,
      production: { title: 'Trailer Cut' },
    })

    assert.equal(result.productionId, 'trailer_cut')
    assert.equal(result.productionPath, 'productions/trailer_cut/production.json')

    const written = JSON.parse(await readFile(join(projectDir, 'productions/trailer_cut/production.json'), 'utf8'))
    assert.equal(written.id, 'trailer_cut')
    assert.equal(written.title, 'Trailer Cut')
  } finally {
    globalThis.fetch = previousFetch
    await rm(projectDir, { recursive: true, force: true })
  }
})

test('MCP domain_upsert_content_unit rejects removed namespace playback refs', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-mcp-assembly-'))
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => mockProjectBindingResponse(input, init) ?? previousFetch(input, init)
  try {
    await writeTestProjectManifest(projectDir, 'prj_mcp_assembly', 'MCP Assembly')

    await assert.rejects(
      callTool('domain_upsert_content_unit', {
        projectDir,
        unit: {
          id: 'cu_episode_01_cut',
          title: 'Episode 01 cut',
          contentUnitType: 'timeline_assembly_ref',
          outputKind: 'video',
          targetCategory: 'timeline_assembly',
          scopeKind: 'episode',
          scopeRef: 'episode_01',
          editPrompt: { text: 'Assemble episode 01 from selected scene moments.' },
        },
      }),
      /production_editing_workspace_create\/open/,
    )
  } finally {
    globalThis.fetch = previousFetch
    await rm(projectDir, { recursive: true, force: true })
  }
})

test('MCP production tree rejects explicit namespace playback content units', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-mcp-tree-assembly-'))
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => mockProjectBindingResponse(input, init) ?? previousFetch(input, init)
  try {
    await writeTestProjectManifest(projectDir, 'prj_mcp_tree_assembly', 'MCP Tree Assembly')

    await assert.rejects(
      callTool('domain_upsert_production_tree', {
        projectDir,
        production: {
          id: 'pilot',
          title: 'Pilot',
          namespace_kind: 'episode',
        },
        segments: [
          {
            segment: {
              id: 'opening',
              title: 'Opening',
              namespace_kind: 'beat',
              order: 1,
            },
            content_units: [
              {
                id: 'cu_opening_cut',
                title: 'Opening cut',
                content_unit_type: 'timeline_assembly_ref',
                output_kind: 'video',
                target_kind: 'timeline_assembly',
                target_ref: 'timeline_assembly:beat:opening',
                scope_kind: 'beat',
                scope_ref: 'opening',
                edit_prompt: { text: 'Assemble the opening beat.' },
              },
            ],
          },
        ],
      }),
      /production_editing_workspace_create\/open/,
    )
  } finally {
    globalThis.fetch = previousFetch
    await rm(projectDir, { recursive: true, force: true })
  }
})

test('MCP production tree reuses title-allocated production id for children', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-mcp-tree-production-id-'))
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => mockProjectBindingResponse(input, init) ?? previousFetch(input, init)
  try {
    await writeTestProjectManifest(projectDir, 'prj_mcp_tree_production_id', 'MCP Tree Production ID')

    const result = await callTool('domain_upsert_production_tree', {
      projectDir,
      production: { title: 'Pilot Film' },
      segments: [
        { segment: { id: 'opening', title: 'Opening' } },
      ],
    })

    assert.equal(result.production.productionId, 'pilot_film')
    assert.equal(result.segments[0]?.segment?.productionPath, 'productions/pilot_film/production.json')

    const segment = JSON.parse(await readFile(join(projectDir, 'productions/pilot_film/segments/opening/segment.json'), 'utf8'))
    assert.equal(segment.id, 'opening')
    assert.equal(segment.title, 'Opening')
  } finally {
    globalThis.fetch = previousFetch
    await rm(projectDir, { recursive: true, force: true })
  }
})

test('MCP timeline namespace tree writes path-first namespace nodes and primitive content units', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-mcp-timeline-namespace-'))
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => mockProjectBindingResponse(input, init) ?? previousFetch(input, init)
  try {
    await writeTestProjectManifest(projectDir, 'prj_mcp_timeline_namespace', 'MCP Timeline Namespace')

    const result = await callTool('domain_upsert_timeline_namespace_tree', {
      projectDir,
      namespace: {
        id: 'pilot',
        kind: 'episode',
        title: 'Pilot',
        production_ref: 'legacy_production_ref',
        content_unit_ref: 'legacy_content_unit_ref',
        children: [
          {
            id: 'opening',
            kind: 'beat',
            title: 'Opening',
            order: 1,
            segment_ref: 'legacy_segment_ref',
            scene_moments: [
              {
                id: 'rain_call',
                kind: 'scene',
                title: 'Rain call',
                order: 1,
                action_text: 'The phone rings in the rain.',
                production_ref: 'legacy_scene_production_ref',
                content_unit_ref: 'legacy_scene_content_unit_ref',
                content_units: [
                  {
                    id: 'cu_rain_call_scene',
                    title: 'Rain call scene video',
                    edit_prompt: { text: 'Generate the complete rain call moment.' },
                  },
                ],
                expression_units: [
                  {
                    id: 'phone_closeup',
                    kind: 'shot',
                    title: 'Phone closeup',
                    visual_kind: 'insert',
                    content_units: [
                      {
                        id: 'cu_phone_shot',
                        title: 'Phone closeup video',
                      },
                    ],
                    keyframes: [
                      {
                        id: 'phone_first_frame',
                        role: 'first_frame',
                        title: 'Phone first frame',
                        content_units: [
                          {
                            id: 'cu_phone_first_frame',
                            title: 'Phone first frame image',
                          },
                        ],
                      },
                    ],
                    storyboards: [
                      {
                        id: 'phone_board',
                        title: 'Phone board',
                      },
                    ],
                  },
                ],
                audio_cues: [
                  {
                    id: 'phone_ring',
                    kind: 'sound_effect',
                    title: 'Phone ring',
                  },
                ],
              },
            ],
          },
        ],
      },
    })

    assert.deepEqual(
      result.namespaces.map((item) => item.targetPath),
      ['timeline/pilot/production.json', 'timeline/pilot/segments/opening/segment.json'],
    )
    assert.deepEqual(
      result.sceneMoments.map((item) => item.targetPath),
      ['timeline/pilot/segments/opening/scene_moments/rain_call/scene_moment.json'],
    )
    assert.ok(result.primitives.some((item) => item.targetPath === 'timeline/pilot/segments/opening/scene_moments/rain_call/expression_units/phone_closeup/expression_unit.json'))
    assert.ok(result.primitives.some((item) => item.targetPath === 'timeline/pilot/segments/opening/scene_moments/rain_call/expression_units/phone_closeup/keyframes/phone_first_frame/keyframe.json'))
    assert.ok(result.primitives.some((item) => item.targetPath === 'timeline/pilot/segments/opening/scene_moments/rain_call/audio_cues/phone_ring/audio_cue.json'))
    assert.equal(result.contentUnits.some((item) => item.record?.content_unit_type === 'timeline_assembly_ref'), false)

    const root = JSON.parse(await readFile(join(projectDir, 'timeline', 'pilot', 'production.json'), 'utf8'))
    assert.equal(root.kind, 'production')
    assert.equal(root.namespace_kind, 'episode')
    assert.equal(root.timeline_namespace_kind, 'episode')
    assert.equal(root.production_ref, undefined)
    assert.equal(root.content_unit_ref, undefined)

    const child = JSON.parse(await readFile(join(projectDir, 'timeline', 'pilot', 'segments', 'opening', 'segment.json'), 'utf8'))
    assert.equal(child.kind, 'segment')
    assert.equal(child.namespace_kind, 'beat')
    assert.equal(child.timeline_namespace_kind, 'beat')
    assert.equal(child.segment_ref, undefined)

    const sceneMoment = JSON.parse(await readFile(join(projectDir, 'timeline', 'pilot', 'segments', 'opening', 'scene_moments', 'rain_call', 'scene_moment.json'), 'utf8'))
    assert.equal(sceneMoment.kind, 'scene_moment')
    assert.equal(sceneMoment.action_text, 'The phone rings in the rain.')
    assert.equal(sceneMoment.production_ref, undefined)
    assert.equal(sceneMoment.content_unit_ref, undefined)

    const expressionUnit = JSON.parse(await readFile(join(projectDir, 'timeline', 'pilot', 'segments', 'opening', 'scene_moments', 'rain_call', 'expression_units', 'phone_closeup', 'expression_unit.json'), 'utf8'))
    assert.equal(expressionUnit.kind, 'expression_unit')
    assert.equal(expressionUnit.expression_kind, 'shot')
    assert.equal(expressionUnit.visual_kind, 'insert')

    const keyframe = JSON.parse(await readFile(join(projectDir, 'timeline', 'pilot', 'segments', 'opening', 'scene_moments', 'rain_call', 'expression_units', 'phone_closeup', 'keyframes', 'phone_first_frame', 'keyframe.json'), 'utf8'))
    assert.equal(keyframe.kind, 'keyframe')
    assert.equal(keyframe.role, 'first_frame')

    const audioCue = JSON.parse(await readFile(join(projectDir, 'timeline', 'pilot', 'segments', 'opening', 'scene_moments', 'rain_call', 'audio_cues', 'phone_ring', 'audio_cue.json'), 'utf8'))
    assert.equal(audioCue.kind, 'audio_cue')
    assert.equal(audioCue.cue_kind, 'sound_effect')

    const sceneContentUnit = JSON.parse(await readFile(join(projectDir, 'content_units', 'cu_rain_call_scene', 'content_unit.json'), 'utf8'))
    assert.equal(sceneContentUnit.content_unit_type, 'scene_moment_ref')
    assert.equal(sceneContentUnit.output_kind, 'video')
    assert.equal(sceneContentUnit.target_kind, 'scene_moment')
    assert.equal(sceneContentUnit.target_ref, 'timeline/pilot/segments/opening/scene_moments/rain_call')
    assert.equal(sceneContentUnit.scene_moment_ref, 'timeline/pilot/segments/opening/scene_moments/rain_call')
    assert.equal(sceneContentUnit.production_ref, undefined)
    assert.equal(sceneContentUnit.segment_ref, undefined)

    const keyframeContentUnit = JSON.parse(await readFile(join(projectDir, 'content_units', 'cu_phone_first_frame', 'content_unit.json'), 'utf8'))
    assert.equal(keyframeContentUnit.content_unit_type, 'keyframe_ref')
    assert.equal(keyframeContentUnit.output_kind, 'image')
    assert.equal(keyframeContentUnit.target_kind, 'keyframe')
    assert.equal(keyframeContentUnit.keyframe_ref, 'timeline/pilot/segments/opening/scene_moments/rain_call/expression_units/phone_closeup/keyframes/phone_first_frame')
  } finally {
    globalThis.fetch = previousFetch
    await rm(projectDir, { recursive: true, force: true })
  }
})

test('MCP domain_upsert_scene_moment writes directly under a timeline namespace path', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-mcp-scene-moment-path-'))
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => mockProjectBindingResponse(input, init) ?? previousFetch(input, init)
  try {
    await writeTestProjectManifest(projectDir, 'prj_mcp_scene_moment_path', 'MCP Scene Moment Path')
    await callTool('domain_upsert_timeline_namespace_tree', {
      projectDir,
      namespace: {
        id: 'pilot',
        kind: 'episode',
        title: 'Pilot',
        children: [{ id: 'opening', kind: 'beat', title: 'Opening' }],
      },
    })

    const result = await callTool('domain_upsert_scene_moment', {
      projectDir,
      namespacePath: 'timeline/pilot/segments/opening/segment.json',
      scene_moment: {
        id: 'rain_call',
        kind: 'scene',
        title: 'Rain call',
        actionText: 'The phone rings in the rain.',
        production_ref: 'legacy_production_ref',
        segment_ref: 'legacy_segment_ref',
        content_unit_ref: 'legacy_content_unit_ref',
      },
    })

    assert.equal(result.entityKind, 'scene_moment')
    assert.equal(result.targetPath, 'timeline/pilot/segments/opening/scene_moments/rain_call/scene_moment.json')

    const sceneMoment = JSON.parse(await readFile(join(projectDir, 'timeline', 'pilot', 'segments', 'opening', 'scene_moments', 'rain_call', 'scene_moment.json'), 'utf8'))
    assert.equal(sceneMoment.schema, 'movscript.scene_moment.v1')
    assert.equal(sceneMoment.kind, 'scene_moment')
    assert.equal(sceneMoment.title, 'Rain call')
    assert.equal(sceneMoment.action_text, 'The phone rings in the rain.')
    assert.equal(sceneMoment.actionText, undefined)
    assert.equal(sceneMoment.namespacePath, undefined)
    assert.equal(sceneMoment.production_ref, undefined)
    assert.equal(sceneMoment.segment_ref, undefined)
    assert.equal(sceneMoment.content_unit_ref, undefined)
  } finally {
    globalThis.fetch = previousFetch
    await rm(projectDir, { recursive: true, force: true })
  }
})

test('MCP primitive upsert tools write under namespace scene_moment paths', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-mcp-primitive-paths-'))
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => mockProjectBindingResponse(input, init) ?? previousFetch(input, init)
  try {
    await writeTestProjectManifest(projectDir, 'prj_mcp_primitive_paths', 'MCP Primitive Paths')
    await callTool('domain_upsert_timeline_namespace_tree', {
      projectDir,
      namespace: {
        id: 'pilot',
        kind: 'episode',
        title: 'Pilot',
        children: [{ id: 'opening', kind: 'beat', title: 'Opening' }],
      },
    })
    await callTool('domain_upsert_scene_moment', {
      projectDir,
      namespacePath: 'timeline/pilot/segments/opening/segment.json',
      scene_moment: { id: 'rain_call', title: 'Rain call' },
    })

    const sceneMomentPath = 'timeline/pilot/segments/opening/scene_moments/rain_call'
    const expressionResult = await callTool('domain_upsert_expression_unit', {
      projectDir,
      sceneMomentPath,
      expression_unit: {
        id: 'phone_closeup',
        kind: 'shot',
        title: 'Phone closeup',
        visualKind: 'insert',
        text: 'Phone vibrates on the wet table.',
        production_ref: 'legacy_production_ref',
      },
    })
    const expressionUnitPath = 'timeline/pilot/segments/opening/scene_moments/rain_call/expression_units/phone_closeup'
    assert.equal(expressionResult.targetPath, `${expressionUnitPath}/expression_unit.json`)

    const storyboardResult = await callTool('domain_upsert_storyboard', {
      projectDir,
      expressionUnitPath,
      storyboard: {
        id: 'phone_board',
        title: 'Phone board',
        visualIntent: 'Storyboard the phone insert.',
        timeline: { caption: 'Phone glows.' },
      },
    })
    assert.equal(storyboardResult.targetPath, `${expressionUnitPath}/storyboards/phone_board/storyboard.json`)

    const keyframeResult = await callTool('domain_upsert_keyframe', {
      projectDir,
      expressionUnitPath,
      keyframe: {
        id: 'phone_first_frame',
        title: 'Phone first frame',
        visualIntent: 'A wet phone vibrates under a cold light.',
        referenceAssetRefs: ['hero_phone'],
      },
    })
    assert.equal(keyframeResult.targetPath, `${expressionUnitPath}/keyframes/phone_first_frame/keyframe.json`)

    const audioCueResult = await callTool('domain_upsert_audio_cue', {
      projectDir,
      sceneMomentPath,
      audio_cue: {
        id: 'phone_ring',
        kind: 'sound_effect',
        title: 'Phone ring',
        promptHint: 'Muffled vibration under rain.',
      },
    })
    assert.equal(audioCueResult.targetPath, `${sceneMomentPath}/audio_cues/phone_ring/audio_cue.json`)

    const expressionUnit = JSON.parse(await readFile(join(projectDir, expressionUnitPath, 'expression_unit.json'), 'utf8'))
    assert.equal(expressionUnit.kind, 'expression_unit')
    assert.equal(expressionUnit.expression_kind, 'shot')
    assert.equal(expressionUnit.visual_kind, 'insert')
    assert.equal(expressionUnit.visualKind, undefined)
    assert.equal(expressionUnit.production_ref, undefined)

    const storyboard = JSON.parse(await readFile(join(projectDir, expressionUnitPath, 'storyboards', 'phone_board', 'storyboard.json'), 'utf8'))
    assert.equal(storyboard.kind, 'storyboard')
    assert.equal(storyboard.visual_intent, 'Storyboard the phone insert.')
    assert.equal(storyboard.visualIntent, undefined)
    assert.deepEqual(storyboard.timeline, { caption: 'Phone glows.' })

    const keyframe = JSON.parse(await readFile(join(projectDir, expressionUnitPath, 'keyframes', 'phone_first_frame', 'keyframe.json'), 'utf8'))
    assert.equal(keyframe.kind, 'keyframe')
    assert.equal(keyframe.visual_intent, 'A wet phone vibrates under a cold light.')
    assert.deepEqual(keyframe.reference_asset_refs, ['hero_phone'])
    assert.equal(keyframe.referenceAssetRefs, undefined)

    const audioCue = JSON.parse(await readFile(join(projectDir, sceneMomentPath, 'audio_cues', 'phone_ring', 'audio_cue.json'), 'utf8'))
    assert.equal(audioCue.kind, 'audio_cue')
    assert.equal(audioCue.cue_kind, 'sound_effect')
    assert.equal(audioCue.prompt_hint, 'Muffled vibration under rain.')
    assert.equal(audioCue.promptHint, undefined)
  } finally {
    globalThis.fetch = previousFetch
    await rm(projectDir, { recursive: true, force: true })
  }
})

test('MCP project-scoped tool schemas expose explicit project directory arguments', () => {
  const tools = listTools()
  for (const name of [
    'domain_overview',
    'domain_get_model',
    'domain_query_entities',
    'generation_prepare',
    'generation_submit',
    'generation_job_get',
    'generation_result_register',
  ]) {
    const schema = tools.find((tool) => tool.name === name)?.inputSchema
    assert.ok(schema, `${name} schema should be exposed`)
    assert.ok(schema.properties?.projectDir, `${name} should expose projectDir`)
    assert.ok(schema.properties?.project_dir, `${name} should expose project_dir`)
    assert.ok(schema.properties?.cwd, `${name} should expose cwd`)
    assert.equal(schema.properties?.projectId, undefined, `${name} must not expose projectId`)
    assert.equal(schema.properties?.project_id, undefined, `${name} must not expose project_id`)
    assert.equal(schema.properties?.userId, undefined, `${name} must not expose userId`)
    assert.equal(schema.properties?.user_id, undefined, `${name} must not expose user_id`)
    assert.equal(schema.properties?.orgId, undefined, `${name} must not expose orgId`)
    assert.equal(schema.properties?.org_id, undefined, `${name} must not expose org_id`)
  }
})

test('MCP domain model tool routes through the domain workspace model', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-domain-model-'))
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  try {
    updateMCPContextSnapshot({
      route: { pathname: '/project/agent', search: '', hash: '' },
      project: { id: 6, name: 'Workspace Test', projectDir: workspaceDir },
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
          projectDir: workspaceDir,
          entityKind: 'scene_moment',
          entityId: 'scene_moment_r72k',
        },
      },
    })

    assert.equal(response?.result?.data?.workspaceKind, 'scene_moment_workspace')
    assert.equal(response?.result?.data?.entityKind, 'scene_moment')
    assert.ok(response?.result?.data?.editablePaths?.[0].includes('scene_moment_r72k'))

  } finally {
    updateMCPContextSnapshot(emptyMCPContextSnapshot())
    if (previousWorkspaceDir === undefined) delete process.env.MOVSCRIPT_WORKSPACE_DIR
    else process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
  }
})

test('MCP project context snapshot includes namespace vocabulary for agent planning', async () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-project-context-'))
  const projectDir = join(workspaceDir, 'projects', 'namespace-context')
  try {
    await writeTestProjectManifest(projectDir, 'prj_namespace_context', 'Namespace Context')
    await writeFile(join(projectDir, 'project.json'), JSON.stringify({
      schema: 'movscript.project.v1',
      kind: 'project',
      project_id: 'namespace_context',
      title: 'Namespace Context',
      namespace_vocabulary: {
        timeline_template: 'series',
        timeline_namespaces: ['sequence', 'beat'],
        setting_namespaces: ['character', 'voice_state'],
      },
    }), 'utf8')
    await writeFile(join(projectDir, 'project_standards.json'), JSON.stringify({
      schema: 'movscript.project_standards.v1',
      kind: 'project_standards',
      id: 'project_standards',
      aspect_ratio: '16:9',
      visual_style: 'Low-key noir',
    }), 'utf8')

    updateMCPContextSnapshot(localAdminMCPContextSnapshot())
    const snapshot = await callTool('domain_read_project_context_snapshot', { projectDir }, 'project-context-namespace')

    assert.equal(snapshot.schema, 'movscript.project_context_snapshot.v1')
    assert.equal(snapshot.namespace_vocabulary.timeline_template, 'series')
    assert.deepEqual(snapshot.namespace_vocabulary.timeline_namespaces, ['act', 'sequence', 'beat'])
    assert.deepEqual(snapshot.namespace_vocabulary.setting_namespaces, ['character', 'voice_state'])
    assert.equal(snapshot.core_standards.find((item) => item.key === 'aspect_ratio')?.value, '16:9')
    assert.ok(snapshot.agent_guidance.some((line) => line.includes('namespace_vocabulary')))
  } finally {
    updateMCPContextSnapshot(emptyMCPContextSnapshot())
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('MCP production status summary exposes project timeline namespace projection', async () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-project-timeline-status-'))
  const projectDir = join(workspaceDir, 'projects', 'timeline-status')
  try {
    await writeTestProjectManifest(projectDir, 'prj_timeline_status', 'Timeline Status')
    await writeFile(join(projectDir, 'project.json'), JSON.stringify({
      schema: 'movscript.project.v1',
      kind: 'project',
      project_id: 'timeline_status',
      title: 'Timeline Status',
      namespace_vocabulary: {
        timeline_template: 'series',
        timeline_namespaces: ['episode', 'beat'],
        setting_namespaces: ['character'],
      },
    }), 'utf8')
    await mkdir(join(projectDir, 'productions', 'pilot', 'segments', 'opening'), { recursive: true })
    await writeFile(join(projectDir, 'productions', 'pilot', 'production.json'), JSON.stringify({
      schema: 'movscript.production.v1',
      kind: 'production',
      id: 'pilot',
      title: 'Pilot Episode',
      namespace_kind: 'episode',
    }), 'utf8')
    await writeFile(join(projectDir, 'productions', 'pilot', 'segments', 'opening', 'segment.json'), JSON.stringify({
      schema: 'movscript.segment.v1',
      kind: 'segment',
      id: 'opening',
      title: 'Opening Beat',
      namespace_kind: 'beat',
    }), 'utf8')
    await mkdir(join(projectDir, 'content_units', 'cu_opening_assembly'), { recursive: true })
    await writeFile(join(projectDir, 'content_units', 'cu_opening_assembly', 'content_unit.json'), JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_opening_assembly',
      title: 'Opening Assembly',
      content_unit_type: 'segment_ref',
      output_kind: 'video',
      segment_ref: 'opening',
      edit_prompt: { text: 'Compose the opening beat.' },
    }), 'utf8')

    updateMCPContextSnapshot(localAdminMCPContextSnapshot())
    const summary = await callTool('domain_production_status_summary', { projectDir }, 'timeline-status-summary')

    assert.equal(summary.schema, 'movscript.production_status_summary.v1')
    assert.equal(summary.legacy_alias, true)
    assert.equal(summary.preferred_schema, 'movscript.project_timeline_status.v1')
    assert.deepEqual(summary.namespace_vocabulary.timeline_namespaces, ['act', 'sequence', 'beat', 'episode'])
    assert.equal(summary.project_timeline_status.schema, 'movscript.project_timeline_status.v1')
    assert.equal(summary.project_timeline_status.timeline_namespace_count, 2)
    assert.equal(summary.project_timeline_status.timeline_namespaces.find((item) => item.id === 'pilot')?.kind, 'episode')
    assert.equal(summary.project_timeline_status.timeline_namespaces.find((item) => item.id === 'opening')?.kind, 'beat')
    assert.equal(summary.project_timeline_status.timeline_assemblies, undefined)
    assert.equal(summary.timeline_assemblies, undefined)
  } finally {
    updateMCPContextSnapshot(emptyMCPContextSnapshot())
    await rm(workspaceDir, { recursive: true, force: true })
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
      search: '?view=review&workspaceId=workspace_mpfwa1ow_tx4g65&asset_id=88&scopeKind=episode&scopeRef=episode_01',
      hash: '',
    },
    project: {
      id: 2,
      name: '漫剧1',
      status: 'planning',
      description: '',
    },
    user: null,
    domainFocus: {
      projectId: '2',
      scope: { category: 'timeline_namespace', kind: 'episode', ref: 'episode_01' },
      diagnostics: [],
    },
    selection: null,
    updatedAt: '2026-05-21T19:54:16.793Z',
  })

  const snapshot = getMCPFocusSnapshot()

  assert.equal(snapshot.route.pathname, '/project/pre-production')
  assert.equal(snapshot.route.search, '?view=review&asset_id=88&scopeKind=episode&scopeRef=episode_01')
  assert.equal(snapshot.project?.id, 2)
  assert.equal(snapshot.domainFocus?.scope?.kind, 'episode')
  assert.equal(snapshot.domainFocus?.target, undefined)
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

test('MCP video frame extraction can materialize a frame as a RawResource', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'movscript-frame-resource-'))
  const logPath = join(tempDir, 'ffmpeg.jsonl')
  const originalFetch = globalThis.fetch
  const originalFFmpegPath = process.env.FFMPEG_PATH
  const originalLog = process.env.MOVSCRIPT_TEST_FFMPEG_LOG
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  const requests = []
  try {
    process.env.FFMPEG_PATH = await writeFakeFFmpegTools(tempDir)
    process.env.MOVSCRIPT_TEST_FFMPEG_LOG = logPath
    globalThis.fetch = async (input, init) => {
      const binding = mockProjectBindingResponse(input, init)
      if (binding) return binding
      const url = String(input)
      requests.push({ url, method: init?.method ?? 'GET' })
      if (url === 'http://movscript.test/api/v1/resources/42/file') {
        return new Response(Buffer.from('fake-video'), {
          status: 200,
          headers: {
            'content-type': 'video/mp4',
            'content-length': '10',
          },
        })
      }
      if (url === 'http://movscript.test/api/v1/resources/upload') {
        assert.equal(init?.method, 'POST')
        assert.ok(init.body instanceof FormData)
        const file = init.body.get('file')
        assert.ok(file instanceof Blob)
        assert.equal(file.type, 'image/jpeg')
        assert.equal(file.name, 'resource-42-frame-2_500.jpg')
        assert.deepEqual(JSON.parse(init.body.get('derivative')), {
          operation: 'video_extract_frame',
          tool: 'movscript_resource_video_extract_frames_to_resources',
          input_resource_ids: [42],
          params: {
            timestamp_sec: 2.5,
            max_width: 720,
            image_format: 'jpeg',
          },
        })
        return new Response(JSON.stringify({ ID: 501, name: file.name, mime_type: file.type }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`unexpected request: ${url}`)
    }

    const result = await extractResourceVideoFrameToResource({
      resource_id: 42,
      timestamp_sec: 2.5,
      max_width: 720,
    })

    assert.equal(result.status, 'created')
    assert.equal(result.source_resource_id, 42)
    assert.equal(result.image_resource_id, 501)
    assert.equal(result.resource_id, 501)
    assert.equal(result.timestamp_sec, 2.5)
    assert.equal(result.frame.source.operation, 'video_extract_frame')
    assert.deepEqual(requests.map((item) => `${item.method} ${item.url}`), [
      'GET http://movscript.test/api/v1/resources/42/file',
      'POST http://movscript.test/api/v1/resources/upload',
    ])

    const toolCalls = readFileSync(logPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    assert.ok(toolCalls.some((call) => call.tool === 'ffprobe' && call.args.includes('-show_entries')))
    assert.ok(toolCalls.some((call) => call.tool === 'ffmpeg' && call.args.includes('-ss') && call.args.includes('2.500')))
    assert.ok(toolCalls.some((call) => call.tool === 'ffmpeg' && call.args.some((arg) => String(arg).includes('scale=720:-2'))))
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    if (originalFFmpegPath === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = originalFFmpegPath
    if (originalLog === undefined) delete process.env.MOVSCRIPT_TEST_FFMPEG_LOG
    else process.env.MOVSCRIPT_TEST_FFMPEG_LOG = originalLog
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('MCP video trim creates a neutral prepared video RawResource', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'movscript-trim-resource-'))
  const logPath = join(tempDir, 'ffmpeg.jsonl')
  const originalFetch = globalThis.fetch
  const originalFFmpegPath = process.env.FFMPEG_PATH
  const originalLog = process.env.MOVSCRIPT_TEST_FFMPEG_LOG
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  const requests = []
  try {
    process.env.FFMPEG_PATH = await writeFakeFFmpegTools(tempDir)
    process.env.MOVSCRIPT_TEST_FFMPEG_LOG = logPath
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      requests.push({ url, method: init?.method ?? 'GET' })
      if (url === 'http://movscript.test/api/v1/resources/42/file') {
        return new Response(Buffer.from('fake-video'), {
          status: 200,
          headers: {
            'content-type': 'video/mp4',
            'content-length': '10',
          },
        })
      }
      if (url === 'http://movscript.test/api/v1/resources/upload') {
        assert.equal(init?.method, 'POST')
        assert.ok(init.body instanceof FormData)
        const file = init.body.get('file')
        assert.ok(file instanceof Blob)
        assert.equal(file.type, 'video/mp4')
        assert.equal(file.name, 'clip.mp4')
        assert.deepEqual(JSON.parse(init.body.get('derivative')), {
          operation: 'video_trim',
          tool: 'movscript_resource_video_trim_to_resource',
          input_resource_ids: [42],
          params: {
            start_sec: 1,
            end_sec: 4,
            mode: 'accurate',
          },
        })
        return new Response(JSON.stringify({ ID: 602, name: file.name, mime_type: file.type }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`unexpected request: ${url}`)
    }

    const result = await trimResourceVideoToResource({
      resource_id: 42,
      start_sec: 1,
      end_sec: 4,
      filename: 'clip.mp4',
    })

    assert.equal(result.status, 'created')
    assert.equal(result.compatibility.kind, 'neutral_resource_preparation')
    assert.equal(result.compatibility.recommended_tool_family, 'editing_*')
    assert.match(result.compatibility.recommended_workflow, /MediaEditingProject/)
    assert.equal(result.source_resource_id, 42)
    assert.equal(result.video_resource_id, 602)
    assert.equal(result.resource_id, 602)
    assert.equal(result.duration_sec, 3)
    assert.deepEqual(requests.map((item) => `${item.method} ${item.url}`), [
      'GET http://movscript.test/api/v1/resources/42/file',
      'POST http://movscript.test/api/v1/resources/upload',
    ])

    const toolCalls = readFileSync(logPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    assert.ok(toolCalls.some((call) => call.tool === 'ffmpeg' && call.args.includes('-ss') && call.args.includes('1.000')))
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    if (originalFFmpegPath === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = originalFFmpegPath
    if (originalLog === undefined) delete process.env.MOVSCRIPT_TEST_FFMPEG_LOG
    else process.env.MOVSCRIPT_TEST_FFMPEG_LOG = originalLog
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('MCP video composition creates a new video RawResource from ordered resource clips', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'movscript-compose-resource-'))
  const logPath = join(tempDir, 'ffmpeg.jsonl')
  const originalFetch = globalThis.fetch
  const originalFFmpegPath = process.env.FFMPEG_PATH
  const originalLog = process.env.MOVSCRIPT_TEST_FFMPEG_LOG
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  const requests = []
  try {
    process.env.FFMPEG_PATH = await writeFakeFFmpegTools(tempDir)
    process.env.MOVSCRIPT_TEST_FFMPEG_LOG = logPath
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      requests.push({ url, method: init?.method ?? 'GET' })
      if (url === 'http://movscript.test/api/v1/resources/10/file' || url === 'http://movscript.test/api/v1/resources/11/file') {
        return new Response(Buffer.from('fake-video'), {
          status: 200,
          headers: {
            'content-type': 'video/mp4',
            'content-length': '10',
          },
        })
      }
      if (url === 'http://movscript.test/api/v1/resources/upload') {
        assert.equal(init?.method, 'POST')
        assert.ok(init.body instanceof FormData)
        const file = init.body.get('file')
        assert.ok(file instanceof Blob)
        assert.equal(file.type, 'video/mp4')
        assert.equal(file.name, 'joined.mp4')
        assert.deepEqual(JSON.parse(init.body.get('derivative')), {
          operation: 'video_compose',
          tool: 'movscript_resource_video_compose_to_resource',
          input_resource_ids: [10, 11],
          params: {
            segments: [
              {
                index: 1,
                source_resource_id: 10,
                start_sec: 0,
                end_sec: 5,
                duration_sec: 5,
                video: {
                  duration_sec: 12,
                  width: 2000,
                  height: 1000,
                  fps: 30,
                },
              },
              {
                index: 2,
                source_resource_id: 11,
                start_sec: 1,
                end_sec: 5,
                duration_sec: 4,
                video: {
                  duration_sec: 12,
                  width: 2000,
                  height: 1000,
                  fps: 30,
                },
              },
            ],
          },
        })
        return new Response(JSON.stringify({ ID: 601, name: file.name, mime_type: file.type }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`unexpected request: ${url}`)
    }

    const result = await composeResourceVideosToResource({
      items: [
        { resource_id: 10, start_sec: 0, end_sec: 5 },
        { resource_id: 11, start_sec: 1, duration_sec: 4, muted: true },
      ],
      filename: 'joined.mp4',
    })

    assert.equal(result.status, 'created')
    assert.equal(result.compatibility.kind, 'resource_level_video_utility')
    assert.equal(result.compatibility.recommended_tool_family, 'editing_*')
    assert.match(result.compatibility.recommended_workflow, /Electron mediaPipeline/)
    assert.equal(result.video_resource_id, 601)
    assert.equal(result.resource_id, 601)
    assert.equal(result.duration_sec, 9)
    assert.deepEqual(result.input_resource_ids, [10, 11])
    assert.equal(result.segments.length, 2)
    assert.deepEqual(requests.map((item) => `${item.method} ${item.url}`), [
      'GET http://movscript.test/api/v1/resources/10/file',
      'GET http://movscript.test/api/v1/resources/11/file',
      'POST http://movscript.test/api/v1/resources/upload',
    ])

    const toolCalls = readFileSync(logPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    assert.ok(toolCalls.some((call) => call.tool === 'ffmpeg' && call.args.includes('libx264')))
    assert.ok(toolCalls.some((call) => call.tool === 'ffmpeg' && call.args.includes('concat')))
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    if (originalFFmpegPath === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = originalFFmpegPath
    if (originalLog === undefined) delete process.env.MOVSCRIPT_TEST_FFMPEG_LOG
    else process.env.MOVSCRIPT_TEST_FFMPEG_LOG = originalLog
    await rm(tempDir, { recursive: true, force: true })
  }
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

test('MCP image transform can materialize an edited image as a RawResource', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'movscript-image-transform-'))
  const logPath = join(tempDir, 'ffmpeg.jsonl')
  const originalFetch = globalThis.fetch
  const originalFFmpegPath = process.env.FFMPEG_PATH
  const originalLog = process.env.MOVSCRIPT_TEST_FFMPEG_LOG
  const originalWidth = process.env.MOVSCRIPT_TEST_IMAGE_WIDTH
  const originalHeight = process.env.MOVSCRIPT_TEST_IMAGE_HEIGHT
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  const requests = []
  try {
    process.env.FFMPEG_PATH = await writeFakeFFmpegTools(tempDir)
    process.env.MOVSCRIPT_TEST_FFMPEG_LOG = logPath
    process.env.MOVSCRIPT_TEST_IMAGE_WIDTH = '2000'
    process.env.MOVSCRIPT_TEST_IMAGE_HEIGHT = '1000'
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      requests.push({ url, method: init?.method ?? 'GET' })
      if (url === 'http://movscript.test/api/v1/resources/77/file') {
        return new Response(onePixelPNGBytes, {
          status: 200,
          headers: {
            'content-type': 'image/png',
            'content-length': String(onePixelPNGBytes.length),
          },
        })
      }
      if (url === 'http://movscript.test/api/v1/resources/upload') {
        assert.equal(init?.method, 'POST')
        assert.ok(init.body instanceof FormData)
        const file = init.body.get('file')
        assert.ok(file instanceof Blob)
        assert.equal(file.type, 'image/jpeg')
        assert.equal(file.name, 'crop.jpg')
        assert.deepEqual(JSON.parse(init.body.get('derivative')), {
          operation: 'image_transform',
          tool: 'movscript_resource_image_transform_to_resource',
          input_resource_ids: [77],
          params: {
            source_width: 2000,
            source_height: 1000,
            output_width: 500,
            output_height: 250,
            crop: { x: 100, y: 50, width: 1000, height: 500 },
            resize: { width: 500 },
            output_format: 'jpeg',
          },
        })
        return new Response(JSON.stringify({ ID: 701, name: file.name, mime_type: file.type }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`unexpected request: ${url}`)
    }

    const result = await transformResourceImageToResource({
      resource_id: 77,
      crop_x: 100,
      crop_y: 50,
      crop_width: 1000,
      crop_height: 500,
      width: 500,
      output_format: 'jpeg',
      filename: 'crop.jpg',
    })

    assert.equal(result.status, 'created')
    assert.equal(result.source_resource_id, 77)
    assert.equal(result.image_resource_id, 701)
    assert.equal(result.resource_id, 701)
    assert.equal(result.width, 500)
    assert.equal(result.height, 250)
    assert.deepEqual(requests.map((item) => `${item.method} ${item.url}`), [
      'GET http://movscript.test/api/v1/resources/77/file',
      'POST http://movscript.test/api/v1/resources/upload',
    ])

    const toolCalls = readFileSync(logPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    assert.ok(toolCalls.some((call) => call.tool === 'ffmpeg' && call.args.includes('-f') && call.args.includes('null')))
    assert.ok(toolCalls.some((call) => call.tool === 'ffmpeg' && call.args.some((arg) => String(arg).includes('crop=1000:500:100:50,scale=500:-2'))))
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

    const summary = await getImageGenerationJob({ jobId: 11, verbosity: 'summary' })
    assert.equal(summary.status, 'succeeded')
    assert.equal(summary.terminal, true)
    assert.equal(summary.job, undefined)
    assert.deepEqual(summary.output_resource_ids, [701])

    const result = await getImageGenerationJobs({ jobIds: [11, 12], verbosity: 'summary' })
    assert.equal(result.status, 'loaded')
    assert.equal(result.success_count, 2)
    assert.equal(result.failed_count, 0)
    assert.equal(result.terminal_count, 1)
    assert.equal(result.all_terminal, false)
    assert.deepEqual(result.output_resource_ids, [701])
    assert.equal(result.items[0].job_id, 11)
    assert.equal(result.items[0].result.job, undefined)
    assert.equal(result.items[1].job_id, 12)
    assert.deepEqual(requested, [
      'http://movscript.test/api/v1/jobs/11',
      'http://movscript.test/api/v1/jobs/11',
      'http://movscript.test/api/v1/jobs/12',
    ])
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
  }
})

test('MCP image generation compatible mode maps unsupported aspect ratio to model image size', async () => {
  const originalFetch = globalThis.fetch
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-image-generation-'))
  const requests = []
  let postedBody
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  const seedream4 = {
    id: 41,
    model_id: 'volcengine:seedream-4-0',
    display_name: 'Seedream 4.0',
    capabilities: ['image_generation'],
    supported_params: [
      {
        key: 'image_size',
        type: 'select',
        options: ['2048x2048', '2848x1600', '1600x2848'],
        default: '2048x2048',
      },
      { key: 'watermark', type: 'boolean', default: true },
    ],
  }

  try {
    await writeFile(join(projectDir, 'workspace.json'), JSON.stringify({
      schema: 'movscript.workspace.v2',
      project_uid: 'prj_image_generation',
      title: 'Image Generation Project',
    }), 'utf8')
    globalThis.fetch = async (input, init) => {
      const binding = mockProjectBindingResponse(input, init)
      if (binding) return binding
      const url = String(input)
      requests.push({ url, method: init?.method ?? 'GET' })
      if (url === 'http://movscript.test/api/v1/models?capability=image_generation&operation=text_to_image') {
        return new Response(JSON.stringify([seedream4]), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === 'http://movscript.test/api/v1/jobs') {
        assert.equal(init?.method, 'POST')
        postedBody = JSON.parse(init.body)
        return new Response(JSON.stringify({ ID: 91, status: 'pending' }), { status: 201, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`unexpected request: ${url}`)
    }

    const result = await generateImage({
      prompt: 'wide cinematic frame',
      model_id: 'volcengine:seedream-4-0',
      operation: 'text_to_image',
      aspect_ratio: '16:9',
      projectDir,
    })

    assert.equal(result.status, 'submitted')
    assert.equal(result.job_id, 91)
    assert.equal(postedBody.model_id, 'volcengine:seedream-4-0')
    assert.equal(postedBody.project_id, undefined)
    assert.equal(postedBody.project_uid, 'prj_image_generation')
    assert.equal(postedBody.project_title, 'Image Generation Project')
    assert.equal(postedBody.project_dir, projectDir)
    assert.equal(postedBody.aspect_ratio, undefined)
    assert.equal(postedBody.duration, undefined)
    assert.deepEqual(JSON.parse(postedBody.extra_params), { image_size: '2848x1600' })
    assert.ok(result.param_audit.some((item) => item.key === 'aspect_ratio' && item.reason === 'mapped_unsupported_aspect_ratio_to_image_size'))
    assert.ok(result.param_audit.some((item) => item.key === 'aspect_ratio' && item.reason === 'dropped_unsupported_parameter'))
    assert.deepEqual(requests.map((item) => `${item.method} ${item.url}`), [
      'GET http://movscript.test/api/v1/models?capability=image_generation&operation=text_to_image',
      'POST http://movscript.test/api/v1/jobs',
    ])
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(projectDir, { recursive: true, force: true })
  }
})

test('MCP low-level image generation can submit without project binding', async () => {
  const originalFetch = globalThis.fetch
  let postedBody
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  const model = {
    id: 41,
    model_id: 'gpt-image-2',
    display_name: 'GPT Image 2',
    capabilities: ['image_generation'],
    supported_params: [
      { key: 'image_size', type: 'select', options: ['1024x1024'], default: '1024x1024' },
      { key: 'quality', type: 'select', options: ['auto', 'low'], default: 'auto' },
    ],
  }

  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      if (url === 'http://movscript.test/api/v1/models?capability=image_generation&operation=text_to_image') {
        return new Response(JSON.stringify([model]), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === 'http://movscript.test/api/v1/jobs') {
        assert.equal(init?.method, 'POST')
        postedBody = JSON.parse(init.body)
        return new Response(JSON.stringify({ ID: 92, status: 'pending' }), { status: 201, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`unexpected request: ${url}`)
    }

    const result = await generateImage({
      prompt: 'quick model smoke test',
      model_id: 'gpt-image-2',
      operation: 'text_to_image',
      image_size: '1024x1024',
      quality: 'low',
    })

    assert.equal(result.status, 'submitted')
    assert.equal(result.job_id, 92)
    assert.equal(postedBody.model_id, 'gpt-image-2')
    assert.equal(postedBody.project_uid, undefined)
    assert.equal(postedBody.project_title, undefined)
    assert.equal(postedBody.project_dir, undefined)
    assert.deepEqual(JSON.parse(postedBody.extra_params), { image_size: '1024x1024', quality: 'low' })
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
  }
})

test('MCP image generation strict mode rejects explicit unsupported params before submitting', async () => {
  const originalFetch = globalThis.fetch
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-image-generation-strict-'))
  let posted = false
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  const seedream4 = {
    id: 41,
    model_id: 'volcengine:seedream-4-0',
    display_name: 'Seedream 4.0',
    capabilities: ['image_generation'],
    supported_params: [
      {
        key: 'image_size',
        type: 'select',
        options: ['1024x1024', '2048x2048', '2848x1600'],
        default: '2048x2048',
      },
    ],
  }

  try {
    await writeTestProjectManifest(projectDir, 'prj_image_generation_defaults', 'Image Generation Defaults')
    globalThis.fetch = async (input, init) => {
      const binding = mockProjectBindingResponse(input, init)
      if (binding) return binding
      const url = String(input)
      if (url === 'http://movscript.test/api/v1/models?capability=image_generation&operation=text_to_image') {
        return new Response(JSON.stringify([seedream4]), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === 'http://movscript.test/api/v1/jobs') {
        posted = true
        return new Response(JSON.stringify({ ID: 92 }), { status: 201, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`unexpected request: ${url} ${init?.method ?? 'GET'}`)
    }

    await assert.rejects(
      generateImage({
        prompt: 'wide cinematic frame',
        model_id: 'volcengine:seedream-4-0',
        operation: 'text_to_image',
        aspect_ratio: '16:9',
        parameter_mode: 'strict',
        projectDir,
      }),
      /parameter "aspect_ratio" is not supported by model "Seedream 4.0"/,
    )
    assert.equal(posted, false)
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(projectDir, { recursive: true, force: true })
  }
})

test('MCP image generation drops unsupported defaults without treating them as strict errors', async () => {
  const originalFetch = globalThis.fetch
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-image-generation-defaults-'))
  let postedBody
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  const seedream4 = {
    id: 41,
    model_id: 'volcengine:seedream-4-0',
    display_name: 'Seedream 4.0',
    capabilities: ['image_generation'],
    supported_params: [
      {
        key: 'image_size',
        type: 'select',
        options: ['1024x1024', '2048x2048', '2848x1600'],
        default: '2048x2048',
      },
    ],
  }

  try {
    await writeTestProjectManifest(projectDir, 'prj_image_generation_defaults', 'Image Generation Defaults')
    globalThis.fetch = async (input, init) => {
      const binding = mockProjectBindingResponse(input, init)
      if (binding) return binding
      const url = String(input)
      if (url === 'http://movscript.test/api/v1/models?capability=image_generation&operation=text_to_image') {
        return new Response(JSON.stringify([seedream4]), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === 'http://movscript.test/api/v1/models?capability=image') {
        return new Response(JSON.stringify([seedream4]), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === 'http://movscript.test/api/v1/jobs') {
        assert.equal(init?.method, 'POST')
        postedBody = JSON.parse(init.body)
        return new Response(JSON.stringify({ ID: 93, status: 'pending' }), { status: 201, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`unexpected request: ${url}`)
    }

    const result = await generateImage({
      prompt: 'square frame',
      operation: 'text_to_image',
      parameter_mode: 'strict',
      projectDir,
    })

    assert.equal(result.status, 'submitted')
    assert.equal(result.job_id, 93)
    assert.equal(postedBody.model_id, 'volcengine:seedream-4-0')
    assert.equal(postedBody.aspect_ratio, undefined)
    assert.deepEqual(JSON.parse(postedBody.extra_params), { image_size: '1024x1024' })
    assert.ok(result.param_audit.some((item) => item.key === 'aspect_ratio' && item.source === 'default' && item.reason === 'dropped_unsupported_parameter'))
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    await rm(projectDir, { recursive: true, force: true })
  }
})

test('MCP content-unit image generation compiles prompt and monitor auto-creates candidate', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const originalFetch = globalThis.fetch
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-content-unit-generation-'))
  const projectDir = join(workspaceDir, 'projects', 'content-unit-generation')
  const decisionContexts = new Map()
  let postedJobBody
  let candidateWriteCount = 0
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  const model = {
    id: 41,
    model_id: 'volcengine:seedream-4-0',
    display_name: 'Seedream 4.0',
    capabilities: ['image_generation'],
    supported_params: [
      { key: 'image_size', type: 'select', options: ['1024x1024'], default: '1024x1024' },
    ],
  }

  const json = (value, status = 200) => new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
  const notFound = () => new Response('', { status: 404 })

  try {
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(projectDir, 'workspace.json'), JSON.stringify({
      schema: 'movscript.workspace.v2',
      project_uid: 'prj_content_unit_generation',
      title: 'Content Unit Generation',
    }), 'utf8')
    updateMCPContextSnapshot({
      ...localAdminMCPContextSnapshot(),
      auth: { token: 'workspace-token' },
    })
    globalThis.fetch = async (input, init = {}) => {
      const binding = mockProjectBindingResponse(input, init)
      if (binding) return binding
      const url = new URL(String(input))
      const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : {}
      if (url.href === 'http://movscript.test/api/v1/models?capability=image_generation&operation=text_to_image') return json([model])
      if (url.href === 'http://movscript.test/api/v1/jobs' && init.method === 'POST') {
        postedJobBody = body
        return json({ ID: 94, status: 'pending' }, 201)
      }
      if (url.href === 'http://movscript.test/api/v1/jobs/94') {
        return json({ ID: 94, status: 'succeeded', output_resource_ids: [880] })
      }
      if (url.pathname.endsWith('/decisions/query') && init.method === 'POST') {
        return json((Array.isArray(body.target_refs) ? body.target_refs : [])
          .map((targetRef) => decisionContexts.get(targetRef))
          .filter(Boolean))
      }
      if (url.pathname.endsWith('/decisions') && (init.method ?? 'GET') === 'GET') {
        return decisionContexts.has(url.searchParams.get('target_ref'))
          ? json(decisionContexts.get(url.searchParams.get('target_ref')))
          : notFound()
      }
      if (url.pathname.endsWith('/decisions/candidates') && init.method === 'POST') {
        candidateWriteCount += 1
        const context = decisionContexts.get(body.target_ref) ?? {
          schema: 'movscript.decision_context.v1',
          target_kind: body.target_kind,
          target_ref: body.target_ref,
          candidates: [],
        }
        const candidateId = body.candidate?.id
        context.candidates = [
          ...context.candidates.filter((candidate) => String(candidate.id) !== String(candidateId)),
          body.candidate,
        ]
        decisionContexts.set(body.target_ref, context)
        return json(context)
      }
      throw new Error(`unexpected request: ${url.href} ${init.method ?? 'GET'}`)
    }

    await callTool('domain_upsert_content_unit', {
      projectDir,
      unit: {
        id: 'arrival_preview',
        title: 'Arrival preview frame',
        contentUnitType: 'exploration_frame',
        outputKind: 'image',
        editPrompt: {
          text: 'Generate a cold close-up preview for the arrival shot.',
        },
      },
    })

    const submitted = await callTool('generation_submit', {
      capability: 'image_generation',
      operation: 'text_to_image',
      scope: 'content_unit',
      projectDir,
      projectUid: '1',
      contentUnitId: 'arrival_preview',
      model_id: 'volcengine:seedream-4-0',
      image_size: '1024x1024',
    })

    assert.equal(submitted.status, 'submitted')
    assert.equal(submitted.job_id, 94)
    assert.equal(submitted.generation_mode, 'content_unit_candidate')
    assert.equal(submitted.candidate_policy, 'auto_create_on_success')
    assert.equal(submitted.will_auto_select, false)
    assert.equal(submitted.requires_user_adoption, true)
    assert.equal(submitted.compiled_prompt_text, 'Generate a cold close-up preview for the arrival shot.')
    assert.equal(submitted.provider_prompt_text, 'Generate a cold close-up preview for the arrival shot.')
    assert.deepEqual(submitted.input_resource_ids, [])
    assert.equal(submitted.capability, 'image_generation')
    assert.equal(submitted.scope, 'content_unit')
    assert.equal(submitted.output_kind, 'image')
    assert.equal(submitted.monitor.tool, 'generation_job_get')
    assert.equal(submitted.monitor.args.projectDir, projectDir)
    assert.equal(submitted.monitor.args.project_dir, projectDir)
    assert.equal(submitted.monitor.args.projectUid, 'prj_content_unit_generation')
    assert.equal(submitted.monitor.args.project_uid, 'prj_content_unit_generation')
    assert.equal(submitted.monitor.args.contentUnitId, 'arrival_preview')
    assert.equal(submitted.monitor.args.content_unit_id, 'arrival_preview')
    assert.equal(submitted.monitor.args.promptSnapshot.schema, 'movscript.content_unit_generation_prompt_snapshot.v1')
    assert.deepEqual(submitted.monitor.args.promptSnapshot.model_params, { image_size: '1024x1024' })
    assert.equal(postedJobBody.feature_key, 'electron.generation.content_unit.image')
    assert.equal(postedJobBody.project_id, undefined)
    assert.equal(postedJobBody.project_uid, 'prj_content_unit_generation')
    assert.equal(postedJobBody.project_dir, projectDir)
    assert.equal(postedJobBody.content_unit_candidate.project_uid, 'prj_content_unit_generation')
    assert.equal(postedJobBody.prompt, 'Generate a cold close-up preview for the arrival shot.')
    assert.deepEqual(JSON.parse(postedJobBody.extra_params), { image_size: '1024x1024' })

    const firstMonitor = await callTool('generation_job_get', submitted.monitor.args)
    const secondMonitor = await callTool('generation_job_get', submitted.monitor.args)
    const context = decisionContexts.get('content_units/arrival_preview')

    assert.equal(firstMonitor.status, 'succeeded')
    assert.equal(firstMonitor.generation_mode, 'content_unit_candidate')
    assert.equal(firstMonitor.will_auto_select, false)
    assert.equal(firstMonitor.requires_user_adoption, true)
    assert.equal(firstMonitor.candidate_created, true)
    assert.equal(firstMonitor.candidates[0].candidate_id, 'gen_image_94_880')
    assert.equal(firstMonitor.content_unit_candidates[0].id, 'gen_image_94_880')
    assert.equal(firstMonitor.frontend.visible_in_panel, true)
    assert.equal(secondMonitor.candidate_created, true)
    assert.equal(candidateWriteCount, 2)
    assert.equal(context.candidates.length, 1)
    assert.equal(context.candidates[0].id, 'gen_image_94_880')
    assert.equal(context.candidates[0].producer.model_id, 'volcengine:seedream-4-0')
    assert.deepEqual(context.candidates[0].producer.model_params, { image_size: '1024x1024' })
    assert.equal(context.candidates[0].outputs[0].resource_id, 880)
    assert.equal(context.candidates[0].outputs[0].metadata.model_id, 'volcengine:seedream-4-0')
    assert.equal(context.candidates[0].prompt_snapshot.schema, 'movscript.content_unit_generation_prompt_snapshot.v1')
    assert.deepEqual(context.candidates[0].prompt_snapshot.model_params, { image_size: '1024x1024' })
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    updateMCPContextSnapshot(emptyMCPContextSnapshot())
    if (previousWorkspaceDir === undefined) {
      delete process.env.MOVSCRIPT_WORKSPACE_DIR
    } else {
      process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
    }
    await rm(workspaceDir, { recursive: true, force: true })
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
  const originalFetch = globalThis.fetch
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-storyboard-tool-'))
  const projectDir = join(workspaceDir, 'projects', 'storyboard-tool')
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  try {
    globalThis.fetch = async (input, init = {}) => mockProjectBindingResponse(input, init) ?? jsonResponse({}, 404)
    await writeTestProjectManifest(projectDir, 'prj_storyboard_tool', 'Storyboard Tool')
    updateMCPContextSnapshot(localAdminMCPContextSnapshot())
    const response = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'storyboard-upsert',
      method: 'tools/call',
      params: {
        name: 'domain_upsert_storyboard',
        arguments: {
          projectDir,
          productionId: 'p1',
          segmentId: 'opening',
          sceneMomentId: 'shot_group_scene',
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
    const storyboardPath = join(projectDir, result.storyboardPath)
    const record = JSON.parse(await readFile(storyboardPath, 'utf8'))
    assert.equal(record.kind, 'storyboard')
    assert.equal(record.id, 'shot_001')
    assert.equal(record.title, 'Shot 001')
    assert.equal(record.scene_moment_ref, 'productions/p1/segments/opening/scene_moments/shot_group_scene')
    assert.deepEqual(record.timeline, { caption: 'first recreated shot', duration_sec: 2.4 })
  } finally {
    globalThis.fetch = originalFetch
    if (previousWorkspaceDir === undefined) {
      delete process.env.MOVSCRIPT_WORKSPACE_DIR
    } else {
      process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
    }
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('MCP domain tools can create keyframe source records', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const originalFetch = globalThis.fetch
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-shot-tool-'))
  const projectDir = join(workspaceDir, 'projects', 'keyframe-tool')
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  try {
    globalThis.fetch = async (input, init = {}) => mockProjectBindingResponse(input, init) ?? jsonResponse({}, 404)
    await writeTestProjectManifest(projectDir, 'prj_keyframe_tool', 'Keyframe Tool')
    updateMCPContextSnapshot(localAdminMCPContextSnapshot())
    const keyframeResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'keyframe-upsert',
      method: 'tools/call',
      params: {
        name: 'domain_upsert_keyframe',
        arguments: {
          projectDir,
          productionId: 'p1',
          segmentId: 'opening',
          sceneMomentId: 'arrival',
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
    const keyframePath = join(projectDir, keyframeResponse.result.data.writtenPaths.find((path) => path.endsWith('/keyframe.json')))
    const keyframe = JSON.parse(await readFile(keyframePath, 'utf8'))
    assert.equal(keyframe.kind, 'keyframe')
    assert.equal(keyframe.id, 'kf_arrival')
    assert.equal(keyframe.title, 'Arrival anchor')
    assert.equal(keyframe.visual_intent, 'Cold close-up as the character enters frame.')
    assert.deepEqual(keyframe.reference_asset_refs, ['hero_portrait'])
  } finally {
    globalThis.fetch = originalFetch
    if (previousWorkspaceDir === undefined) {
      delete process.env.MOVSCRIPT_WORKSPACE_DIR
    } else {
      process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
    }
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('MCP content unit candidate flow writes source records and refreshes interpreted state', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const originalFetch = globalThis.fetch
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-content-candidate-'))
  const projectDir = join(workspaceDir, 'projects', 'content-candidate')
  const decisionContexts = new Map()
  const selectionRequests = []
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  globalThis.fetch = async (url, init = {}) => {
    const binding = mockProjectBindingResponse(url, init)
    if (binding) return binding
    const parsed = new URL(String(url))
    const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : {}
    const json = (value, status = 200) => ({
      status,
      ok: status >= 200 && status < 300,
      text: async () => JSON.stringify(value),
      json: async () => value,
    })
    const notFound = () => ({
      status: 404,
      ok: false,
      text: async () => '',
      json: async () => ({}),
    })

    if (parsed.pathname.endsWith('/decisions/query') && init.method === 'POST') {
      return json((Array.isArray(body.target_refs) ? body.target_refs : [])
        .map((targetRef) => decisionContexts.get(targetRef))
        .filter(Boolean))
    }
    if (parsed.pathname.endsWith('/decisions') && (init.method ?? 'GET') === 'GET') {
      return decisionContexts.has(parsed.searchParams.get('target_ref'))
        ? json(decisionContexts.get(parsed.searchParams.get('target_ref')))
        : notFound()
    }
    if (parsed.pathname.endsWith('/decisions/candidates') && init.method === 'POST') {
      const context = decisionContexts.get(body.target_ref) ?? {
        schema: 'movscript.decision_context.v1',
        target_kind: body.target_kind,
        target_ref: body.target_ref,
        candidates: [],
      }
      const candidateId = body.candidate?.id
      context.candidates = [
        ...context.candidates.filter((candidate) => String(candidate.id) !== String(candidateId)),
        body.candidate,
      ]
      decisionContexts.set(body.target_ref, context)
      return json(context)
    }
    if (parsed.pathname.endsWith('/decisions/selection') && init.method === 'PUT') {
      const targetRef = body.target_ref
      const context = decisionContexts.get(targetRef)
      if (!context) return notFound()
      selectionRequests.push(body)
      context.selection = {
        candidate_id: body.candidate_id,
        resource_id: body.resource_id,
        stale_policy: body.stale_policy ?? 'strict',
        reason: body.reason,
        selected_at: body.selected_at,
      }
      decisionContexts.set(targetRef, context)
      return json(context)
    }
    return notFound()
  }
  try {
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(projectDir, 'workspace.json'), JSON.stringify({
      schema: 'movscript.workspace.v2',
      project_uid: 'prj_content_candidate',
      title: 'Content Candidate',
    }), 'utf8')
    updateMCPContextSnapshot({
      ...localAdminMCPContextSnapshot(),
      auth: { token: 'workspace-token' },
    })

    const contentUnitResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'content-unit-upsert',
      method: 'tools/call',
      params: {
        name: 'domain_upsert_content_unit',
        arguments: {
          projectDir,
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
          projectDir,
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
    assert.equal(candidateResponse.result.data.result.path, 'content_units/arrival_preview/candidates/candidate_a/content_candidate.json')
    assert.equal(candidateResponse.result.data.candidate_created, true)
    assert.equal(candidateResponse.result.data.will_auto_select, false)
    assert.equal(candidateResponse.result.data.requires_user_adoption, true)

    const deferredResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'content-candidate-defer',
      method: 'tools/call',
      params: {
        name: 'domain_decide_content_unit_candidate',
        arguments: {
          projectDir,
          contentUnitId: 'arrival_preview',
          candidateId: 'candidate_a',
          decision: 'defer',
          reason: 'waiting for user comparison',
          decidedAt: '2026-06-13T08:00:00.000Z',
        },
      },
    })

    assert.equal(deferredResponse.error, undefined)
    assert.equal(deferredResponse.result.data.result.record.candidates[0].decision_status, 'defer')
    assert.equal(deferredResponse.result.data.result.record.candidates[0].decision_reason, 'waiting for user comparison')
    assert.equal(deferredResponse.result.data.result.record.selection, undefined)
    assert.equal(deferredResponse.result.data.adoption, 'defer')

    const selectionResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'content-candidate-select',
      method: 'tools/call',
      params: {
        name: 'domain_decide_content_unit_candidate',
        arguments: {
          projectDir,
          contentUnitId: 'arrival_preview',
          candidateId: 'candidate_a',
          decision: 'adopt',
          reason: 'user confirmed preview frame',
        },
      },
    })

    assert.equal(selectionResponse.error, undefined)
    assert.equal(selectionResponse.result.data.result.path, '.movscript/decisions/content_units/arrival_preview/decision_context.json')
    assert.equal(selectionRequests.at(-1)?.candidate_id, 'candidate_a')
    assert.equal(selectionRequests.at(-1)?.resource_id, 321)
    assert.equal(selectionResponse.result.data.result.record.selection.resource_id, 321)
    assert.equal(selectionResponse.result.data.result.record.selection.accepted_input_hash, undefined)
    assert.equal(selectionResponse.result.data.adoption, 'adopt')

    const inspectResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'content-candidate-inspect',
      method: 'tools/call',
      params: {
        name: 'domain_inspect',
        arguments: { projectDir },
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
        arguments: { projectDir },
      },
    })

    assert.equal(interpretResponse.error, undefined)
    assert.equal(interpretResponse.result.data.status, 'refreshed')
    const interpretText = interpretResponse.result.content?.[0]?.text ?? ''
    assert.match(interpretText, /movscript\.workspace-interpret-refresh-agent-summary\.v1/)
    assert.doesNotMatch(interpretText, /basePath/)
    assert.doesNotMatch(interpretText, /currentPath/)
    assert.doesNotMatch(interpretText, /contentHash/)
    assert.equal(Boolean(interpretResponse.result.data.review?.changedFiles?.[0]?.currentPath), true)
    assert.equal(existsSync(join(projectDir, '.interpret', 'current', 'content_units', 'arrival_preview', 'content_unit.json')), true)
    const selectionValidity = JSON.parse(await readFile(join(projectDir, '.interpret', 'current', 'content_units', 'arrival_preview', 'selection_validity.json'), 'utf8'))
    assert.equal(selectionValidity.schema, 'movscript.content_unit_selection_validity.v2')
    assert.equal(selectionValidity.content_unit_ref, 'content_units/arrival_preview')
  } finally {
    globalThis.fetch = originalFetch
    updateMCPContextSnapshot(emptyMCPContextSnapshot())
    if (previousWorkspaceDir === undefined) {
      delete process.env.MOVSCRIPT_WORKSPACE_DIR
    } else {
      process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
    }
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('MCP production timeline tools read and edit selected scene_moment outputs', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const originalFetch = globalThis.fetch
  const originalFFmpegPath = process.env.FFMPEG_PATH
  const originalLog = process.env.MOVSCRIPT_TEST_FFMPEG_LOG
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-production-timeline-'))
  const projectDir = join(workspaceDir, 'projects', 'production-timeline')
  const logPath = join(workspaceDir, 'ffmpeg.jsonl')
  const decisionContexts = new Map()
  const selectionRequests = []
  const composeUploads = []
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  process.env.FFMPEG_PATH = await writeFakeFFmpegTools(workspaceDir)
  process.env.MOVSCRIPT_TEST_FFMPEG_LOG = logPath
  setMovScriptBackendAPIBaseURL('http://movscript.test')
  globalThis.fetch = async (url, init = {}) => {
    const binding = mockProjectBindingResponse(url, init)
    if (binding) return binding
    const parsed = new URL(String(url))
    const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : {}
    const json = (value, status = 200) => ({
      status,
      ok: status >= 200 && status < 300,
      text: async () => JSON.stringify(value),
      json: async () => value,
    })
    const notFound = () => ({
      status: 404,
      ok: false,
      text: async () => '',
      json: async () => ({}),
    })

    if (parsed.href === 'http://movscript.test/api/v1/resources/700/file') {
      return new Response(Buffer.from('fake-scene-video'), {
        status: 200,
        headers: {
          'content-type': 'video/mp4',
          'content-length': '16',
        },
      })
    }
    if (parsed.href === 'http://movscript.test/api/v1/resources/upload') {
      composeUploads.push({ method: init.method })
      assert.fail('production timeline handoff must not call backend compose/upload')
    }
    if (parsed.pathname.endsWith('/decisions/query') && init.method === 'POST') {
      return json((Array.isArray(body.target_refs) ? body.target_refs : [])
        .map((targetRef) => decisionContexts.get(targetRef))
        .filter(Boolean))
    }
    if (parsed.pathname.endsWith('/decisions') && (init.method ?? 'GET') === 'GET') {
      return decisionContexts.has(parsed.searchParams.get('target_ref'))
        ? json(decisionContexts.get(parsed.searchParams.get('target_ref')))
        : notFound()
    }
    if (parsed.pathname.endsWith('/decisions/candidates') && init.method === 'POST') {
      const context = decisionContexts.get(body.target_ref) ?? {
        schema: 'movscript.decision_context.v1',
        target_kind: body.target_kind,
        target_ref: body.target_ref,
        candidates: [],
      }
      const candidateId = body.candidate?.id
      context.candidates = [
        ...context.candidates.filter((candidate) => String(candidate.id) !== String(candidateId)),
        body.candidate,
      ]
      decisionContexts.set(body.target_ref, context)
      return json(context)
    }
    if (parsed.pathname.endsWith('/decisions/selection') && init.method === 'PUT') {
      const targetRef = body.target_ref
      const context = decisionContexts.get(targetRef)
      if (!context) return notFound()
      selectionRequests.push(body)
      context.selection = {
        candidate_id: body.candidate_id,
        resource_id: body.resource_id,
        stale_policy: body.stale_policy ?? 'strict',
        reason: body.reason,
        selected_at: body.selected_at,
      }
      decisionContexts.set(targetRef, context)
      return json(context)
    }
    return notFound()
  }
  try {
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(projectDir, 'workspace.json'), JSON.stringify({
      schema: 'movscript.workspace.v2',
      project_uid: 'prj_production_timeline',
      title: 'Production Timeline',
    }), 'utf8')
    updateMCPContextSnapshot({
      ...localAdminMCPContextSnapshot(),
      auth: { token: 'workspace-token' },
    })
    await callTool('domain_upsert_production', {
      projectDir,
      productionId: 'pilot',
      production: { id: 'pilot', title: 'Pilot production' },
    })
    await callTool('domain_upsert_segment', {
      projectDir,
      productionId: 'pilot',
      segmentId: 'opening',
      segment: { id: 'opening', title: 'Opening', order: 1 },
    })
    await callTool('domain_upsert_scene_moment', {
      projectDir,
      productionId: 'pilot',
      segmentId: 'opening',
      sceneMomentId: 'rain_call',
      sceneMoment: { id: 'rain_call', title: 'Rain call', order: 1 },
    })
    await callTool('domain_upsert_content_unit', {
      projectDir,
      unit: {
        id: 'cu_rain_call',
        title: 'Rain call scene output',
        contentUnitType: 'scene_moment_ref',
        outputKind: 'video',
        sceneMomentRef: 'rain_call',
      editPrompt: { text: 'Use the selected composed scene output.' },
      },
    })
    await callTool('domain_upsert_content_unit', {
      projectDir,
      unit: {
        id: 'cu_pilot_final',
        title: 'Pilot final production',
        contentUnitType: 'production_ref',
        outputKind: 'video',
        targetKind: 'production',
        targetRef: 'pilot',
        productionRef: 'pilot',
        generationRole: 'composed_production',
        editPrompt: { text: 'Compose the selected scene moment outputs into the final production.' },
      },
    })
    await callTool('domain_create_content_candidate', {
      projectDir,
      contentUnitId: 'cu_rain_call',
      candidateId: 'scene_cut_a',
      source: 'manual',
      status: 'succeeded',
      outputs: [{ kind: 'video', resource_id: 700, mime_type: 'video/mp4', duration_sec: 9 }],
      promptSnapshot: { text: 'Selected scene output.' },
    })
    await callTool('domain_decide_content_unit_candidate', {
      projectDir,
      contentUnitId: 'cu_rain_call',
      candidateId: 'scene_cut_a',
      decision: 'adopt',
      reason: 'use scene for production assembly',
    })

    assert.equal(selectionRequests.at(-1)?.candidate_id, 'scene_cut_a')
    assert.equal(selectionRequests.at(-1)?.resource_id, 700)

    const interpret = await callTool('domain_interpret', { projectDir })
    assert.equal(interpret.status, 'refreshed', JSON.stringify(interpret))

    const productionEditPlan = await callTool('domain_read_production_edit_plan', {
      projectDir,
      productionId: 'pilot',
    })
    assert.equal(productionEditPlan.status, 'ok')
    assert.equal(productionEditPlan.edit_plan.schema, 'movscript.edit_plan.v1')
    assert.equal(productionEditPlan.edit_plan.tracks[0].items[0].resource_id, 700)
    assert.equal(productionEditPlan.context.resources[0].resource_id, 700)

    const editingContext = await callTool('domain_create_editing_project_context', {
      projectDir,
      productionId: 'pilot',
    })
    assert.equal(editingContext.status, 'ok')
    assert.equal(editingContext.target_kind, 'production')
    assert.equal(editingContext.edit_plan.schema, 'movscript.edit_plan.v1')
    assert.equal(editingContext.context.selected_candidates[0].candidate_id, 'scene_cut_a')

    const timeline = await callTool('domain_read_production_timeline', {
      projectDir,
      productionId: 'pilot',
      now: '2026-06-16T00:00:00.000Z',
    })

    assert.equal(timeline.status, 'ok')
    assert.equal(timeline.production_id, 'pilot')
    assert.equal(timeline.blockers.length, 0)
    assert.equal(timeline.media_editing_project.version, 1)
    assert.equal(timeline.clips[0].resourceId, 700)
    assert.equal(timeline.clips[0].contentUnitId, 'cu_rain_call')
    assert.equal(timeline.compose_inputs[0].resource_id, 700)
    assert.equal(timeline.compose_inputs[0].timeline_duration_sec, 9)
    const composeUploadCountBeforeRemovedCalls = composeUploads.length
    const selectionRequestCountBeforeRemovedCalls = selectionRequests.length

    for (const removedTool of [
      'domain_apply_production_timeline_commands',
      'domain_apply_scene_moment_timeline_commands',
      'domain_compose_production_from_timeline',
      'domain_compose_scene_moment_from_edit_plan',
    ]) {
      const removedResponse = await handleJSONRPC({
        jsonrpc: '2.0',
        id: `removed-${removedTool}`,
        method: 'tools/call',
        params: {
          name: removedTool,
          arguments: {
            projectDir,
            media_editing_project: timeline.media_editing_project,
            timeline_document: { schema: 'movscript.legacy_timeline.v1' },
          },
        },
      })
      assert.equal(removedResponse?.error?.code, -32000)
      assert.match(removedResponse?.error?.message ?? '', new RegExp(`Unknown tool: ${removedTool}`))
    }
    assert.equal(composeUploads.length, composeUploadCountBeforeRemovedCalls)
    assert.equal(selectionRequests.length, selectionRequestCountBeforeRemovedCalls)
  } finally {
    globalThis.fetch = originalFetch
    setMovScriptBackendAPIBaseURL('http://localhost:8765')
    updateMCPContextSnapshot(emptyMCPContextSnapshot())
    if (originalFFmpegPath === undefined) delete process.env.FFMPEG_PATH
    else process.env.FFMPEG_PATH = originalFFmpegPath
    if (originalLog === undefined) delete process.env.MOVSCRIPT_TEST_FFMPEG_LOG
    else process.env.MOVSCRIPT_TEST_FFMPEG_LOG = originalLog
    if (previousWorkspaceDir === undefined) {
      delete process.env.MOVSCRIPT_WORKSPACE_DIR
    } else {
      process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
    }
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('MCP backend prompt tool returns blockers from backend decision context', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const originalFetch = globalThis.fetch
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-backend-prompt-'))
  const projectDir = join(workspaceDir, 'projects', 'backend-prompt')
  const requests = []
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  globalThis.fetch = async (url, init) => {
    const binding = mockProjectBindingResponse(url, init)
    if (binding) return binding
    requests.push({ url: String(url), method: init?.method ?? 'GET' })
    return {
      status: 404,
      ok: false,
      text: async () => '',
      json: async () => ({}),
    }
  }
  try {
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(projectDir, 'workspace.json'), JSON.stringify({
      schema: 'movscript.workspace.v2',
      project_uid: 'prj_backend_prompt',
      title: 'Backend Prompt',
    }), 'utf8')
    updateMCPContextSnapshot({
      ...localAdminMCPContextSnapshot(),
      auth: { token: 'workspace-token' },
    })
    await mkdir(join(projectDir, 'settings', 'hero', 'states', 'rain', 'assets', 'wet_hair'), { recursive: true })
    await writeFile(join(projectDir, 'settings', 'hero', 'states', 'rain', 'assets', 'wet_hair', 'asset.json'), JSON.stringify({
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'wet_hair',
      title: 'Wet hair',
      setting_id: 'hero',
      setting_state_id: 'rain',
      slot: 'hair',
    }), 'utf8')
    const upstreamResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'backend-prompt-upstream',
      method: 'tools/call',
      params: {
        name: 'domain_upsert_content_unit',
        arguments: {
          projectDir,
          unit: {
            id: 'cu_wet_hair_ref',
            title: 'Wet hair reference',
            contentUnitType: 'asset_ref',
            outputKind: 'image',
            assetRef: 'wet_hair',
            editPrompt: { text: 'Generate wet hair continuity reference.' },
          },
        },
      },
    })
    assert.equal(upstreamResponse.error, undefined)
    assert.equal(upstreamResponse.result.data.record.asset_ref, 'wet_hair')

    const targetResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'backend-prompt-target',
      method: 'tools/call',
      params: {
        name: 'domain_upsert_content_unit',
        arguments: {
          projectDir,
          unit: {
            id: 'cu_phone_video',
            title: 'Phone video',
            contentUnitType: 'scene_moment_ref',
            outputKind: 'video',
            sceneMomentRef: 'phone',
            editPrompt: { text: 'Use {{asset:wet_hair}} as continuity reference.' },
          },
        },
      },
    })
    assert.equal(targetResponse.error, undefined)
    assert.equal(targetResponse.result.data.record.scene_moment_ref, 'phone')

    const response = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'backend-prompt',
      method: 'tools/call',
      params: {
        name: 'domain_build_content_unit_backend_prompt',
        arguments: {
          projectDir,
          contentUnitId: 'cu_phone_video',
        },
      },
    })

    assert.equal(response.error, undefined)
    const result = response.result.data
    assert.equal(result.ok, false)
    assert.equal(result.prompt.text, 'Use {{asset:wet_hair}} as continuity reference.')
    assert.equal(result.blockers[0]?.code, 'decision_context_missing')
    assert.equal(result.blockers[0]?.content_unit_id, 'cu_wet_hair_ref')
    assert.equal(result.blockers[0]?.ref, '{{asset:wet_hair}}')
    assert.ok(requests.some((request) => /\/api\/v1\/project-data\/decisions/.test(request.url)))
  } finally {
    globalThis.fetch = originalFetch
    updateMCPContextSnapshot(emptyMCPContextSnapshot())
    if (previousWorkspaceDir === undefined) {
      delete process.env.MOVSCRIPT_WORKSPACE_DIR
    } else {
      process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
    }
    await rm(workspaceDir, { recursive: true, force: true })
  }
})

test('MCP domain tools expose get_model inspect and interpret over source/.interpret', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const originalFetch = globalThis.fetch
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-workspace-tools-'))
  const projectDir = join(workspaceDir, 'projects', 'workspace-tools')
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  try {
    globalThis.fetch = async (input, init = {}) => mockProjectBindingResponse(input, init) ?? jsonResponse({}, 404)
    await writeTestProjectManifest(projectDir, 'prj_workspace_tools', 'Workspace Tools')
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
        name: 'domain_interpret',
        arguments: { projectDir },
      },
    })
    assert.equal(initialBuildResponse.error, undefined)
    assert.equal(initialBuildResponse.result.data.status, 'refreshed')

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
        name: 'domain_get_model',
        arguments: { projectDir, entityKind: 'setting', entityId: 'setting_hero' },
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
        name: 'domain_inspect',
        arguments: { projectDir },
      },
    })
    const review = record(reviewResponse?.result?.data)
    assert.equal(review.basePath, 'empty')
    assert.equal(review.sourcePath, '')
    assert.equal(review.summary.added, 1)
    assert.equal(review.readyToInterpret, true)

    const buildResponse = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'build',
      method: 'tools/call',
      params: {
        name: 'domain_interpret',
        arguments: { projectDir },
      },
    })
    const build = record(buildResponse?.result?.data)
    assert.equal(build.status, 'refreshed')
    const buildText = buildResponse.result.content?.[0]?.text ?? ''
    assert.match(buildText, /movscript\.workspace-interpret-refresh-agent-summary\.v1/)
    assert.doesNotMatch(buildText, /basePath/)
    assert.doesNotMatch(buildText, /currentPath/)
    assert.doesNotMatch(buildText, /contentHash/)
    assert.equal(Boolean(build.review?.changedFiles?.[0]?.currentPath), true)
    assert.equal(existsSync(join(projectDir, '.interpret', 'current', 'domain-index.json')), true)
    assert.equal(JSON.parse(readFileSync(join(projectDir, '.interpret', 'current', 'settings', 'setting_hero', 'setting.json'), 'utf8')).title, 'New Hero')
  } finally {
    globalThis.fetch = originalFetch
    updateMCPContextSnapshot(emptyMCPContextSnapshot())
    if (previousWorkspaceDir === undefined) delete process.env.MOVSCRIPT_WORKSPACE_DIR
    else process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
  }
})

test('MCP domain tools require explicit project dir or cwd', async () => {
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
    assert.match(response?.error?.message ?? '', /projectDir or cwd is required/)
  } finally {
    if (previousWorkspaceDir === undefined) delete process.env.MOVSCRIPT_WORKSPACE_DIR
    else process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
  }
})

test('MCP upsert setting accepts legacy record body without payload error', async () => {
  const previousWorkspaceDir = process.env.MOVSCRIPT_WORKSPACE_DIR
  const originalFetch = globalThis.fetch
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-upsert-setting-record-'))
  const projectDir = join(workspaceDir, 'projects', 'upsert-setting-record')
  process.env.MOVSCRIPT_WORKSPACE_DIR = workspaceDir
  try {
    globalThis.fetch = async (input, init = {}) => mockProjectBindingResponse(input, init) ?? jsonResponse({}, 404)
    await writeTestProjectManifest(projectDir, 'prj_upsert_setting_record', 'Upsert Setting Record')
    updateMCPContextSnapshot(localAdminMCPContextSnapshot())
    const response = await handleJSONRPC({
      jsonrpc: '2.0',
      id: 'upsert-setting-record',
      method: 'tools/call',
      params: {
        name: 'domain_upsert_setting',
        arguments: {
          projectDir,
          record: {
            id: 'setting_legacy',
            title: 'Legacy Body',
            setting_kind: 'character',
            namespace_kind: 'voice_identity',
          },
        },
      },
    })

    assert.equal(response?.error, undefined)
    assert.equal(response?.result?.data?.path, 'settings/setting_legacy/setting.json')
    const written = JSON.parse(readFileSync(join(
      projectDir,
      'settings',
      'setting_legacy',
      'setting.json',
    ), 'utf8'))
    assert.equal(written.title, 'Legacy Body')
    assert.equal(written.setting_kind, 'character')
    assert.equal(written.namespace_kind, 'voice_identity')
    assert.equal(written.setting_namespace_kind, 'voice_identity')
  } finally {
    globalThis.fetch = originalFetch
    updateMCPContextSnapshot(emptyMCPContextSnapshot())
    if (previousWorkspaceDir === undefined) delete process.env.MOVSCRIPT_WORKSPACE_DIR
    else process.env.MOVSCRIPT_WORKSPACE_DIR = previousWorkspaceDir
  }
})
