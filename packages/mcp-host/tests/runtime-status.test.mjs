import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { updateMCPContextSnapshot as updateHostMCPContextSnapshot } from '../dist/index.js'
import { handleMCPHostJSONRPC, listMCPHostTools, runtimeStatus } from '../dist/stdio.js'
import { callDaemonMCPTool, daemonMCPCommandTools, listDaemonMCPTools } from '@movscript/local-daemon/mcp'

let server
let baseURL
let adminRequests = []
let systemRequests = []
let mcpProxyRequests = []
let projectRequests = []
let contextRequests = []
let editingRequests = []
let mediaPipelineRequests = []

function handleLocalMCPHostJSONRPC(request) {
  return handleMCPHostJSONRPC(request, { proxyToDaemon: false })
}

before(async () => {
  server = createTestServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  baseURL = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
})

test('MCP host exposes runtime daemon bootstrap tools', () => {
  const toolsList = listMCPHostTools()
  const tools = new Set(toolsList.map((tool) => tool.name))
  assert.equal(tools.has('runtime_doctor'), true)
  assert.equal(tools.has('movscript_runtime_doctor'), true)
  assert.equal(tools.has('runtime_daemon_ensure'), true)
  assert.equal(tools.has('runtime_daemon_start'), true)
  assert.equal(tools.has('runtime_daemon_status'), true)
  assert.equal(tools.has('runtime_daemon_configure'), true)
  assert.equal(tools.has('runtime_gateway_configure'), true)
  assert.equal(tools.has('runtime_gateway_status'), true)
  assert.equal(tools.has('runtime_local_daemon_ensure'), true)
  assert.equal(tools.has('runtime_local_daemon_start'), true)
  const ensureTool = toolsList.find((tool) => tool.name === 'runtime_daemon_ensure')
  assert.equal(ensureTool?.outputSchema?.properties?.schema?.const, 'movscript.command_result.v1')
})

test('MCP host exposes current CLI-backed admin tools', () => {
  const tools = new Set(listMCPHostTools().map((tool) => tool.name))
  assert.equal(tools.has('admin_provider_list'), true)
  assert.equal(tools.has('admin_provider_create'), true)
  assert.equal(tools.has('admin_provider_connection_test'), true)
  assert.equal(tools.has('admin_provider_instance_config_get'), true)
  assert.equal(tools.has('admin_provider_instance_config_update'), true)
  assert.equal(tools.has('admin_provider_instance_config_apply'), true)
  assert.equal(tools.has('admin_provider_instance_config_activate'), true)
  assert.equal(tools.has('admin_model_catalog_list'), true)
  assert.equal(tools.has('admin_model_route_binding_create'), true)
  assert.equal(tools.has('admin_model_route_diagnose'), true)
  assert.equal(tools.has('admin_resource_access_settings_get'), true)
  assert.equal(tools.has('admin_public_tunnel_config_update'), true)
  assert.equal(tools.has('admin_resource_access_profile_list'), true)
  assert.equal(tools.has('admin_resource_access_profile_upsert'), true)
  assert.equal(tools.has('admin_resource_access_profile_delete'), true)
  assert.equal(tools.has('admin_resource_access_profile_test'), true)
  assert.equal(tools.has('admin_resource_access_route_diagnose'), true)
  assert.equal(tools.has('admin_resource_access_resolve_test'), true)
  assert.equal(tools.has('admin_resource_access_check_test'), true)
  assert.equal(tools.has('admin_generation_tools_settings_update'), true)
  assert.equal(tools.has('admin_generation_tool_call_test'), true)
  assert.equal(tools.has('admin_model_gateway_key_list'), true)
  assert.equal(tools.has('admin_cloud_file_config_list'), true)
  assert.equal(tools.has('admin_cloud_file_config_create'), true)
  assert.equal(tools.has('admin_usage_policy_get'), true)
  assert.equal(tools.has('admin_usage_policy_update'), true)
  assert.equal(tools.has('admin_usage_policy_diagnose'), true)
})

test('daemon MCP tool surface is command-manifest only', async () => {
  assert.deepEqual(
    listDaemonMCPTools().map((tool) => tool.name),
    daemonMCPCommandTools.map((tool) => tool.name),
  )
  await assert.rejects(
    () => callDaemonMCPTool({ name: 'legacy_direct_core_probe', arguments: {} }),
    /unknown daemon MCP tool/,
  )
})

test('MCP host exposes current domain, production editing, and editing backend tools', () => {
  const tools = new Set(listMCPHostTools().map((tool) => tool.name))
  assert.equal(tools.has('domain_overview'), true)
  assert.equal(tools.has('domain_query_entities'), true)
  assert.equal(tools.has('domain_read_project_context_snapshot'), true)
  assert.equal(tools.has('domain_regeneration_plan'), true)
  assert.equal(tools.has('domain_read_content_unit_input_version'), true)
  assert.equal(tools.has('domain_upsert_project_standards'), true)
  assert.equal(tools.has('domain_upsert_setting'), true)
  assert.equal(tools.has('domain_read_script_source'), true)
  assert.equal(tools.has('domain_update_content_unit_prompt'), true)
  assert.equal(tools.has('domain_delete_entity'), true)
  assert.equal(tools.has('domain_create_content_candidate'), true)
  assert.equal(tools.has('domain_register_raw_resource_as_content_unit_candidate'), true)
  assert.equal(tools.has('domain_create_content_candidate_batch'), true)
  assert.equal(tools.has('domain_select_content_unit_candidate'), true)
  assert.equal(tools.has('domain_select_content_unit_candidate_batch'), true)
  assert.equal(tools.has('domain_decide_content_unit_candidate'), true)
  assert.equal(tools.has('domain_query_remote_asset_groups'), true)
  assert.equal(tools.has('domain_query_remote_assets'), true)
  assert.equal(tools.has('domain_certify_asset_provider'), true)
  assert.equal(tools.has('domain_certify_asset_seedance2'), true)
  assert.equal(tools.has('domain_review'), true)
  assert.equal(tools.has('production_editing_resources_refresh'), true)
  assert.equal(tools.has('production_editing_workspace_list'), true)
  assert.equal(tools.has('production_editing_workspace_create'), true)
  assert.equal(tools.has('production_editing_workspace_open'), true)
  assert.equal(tools.has('timeline_backend_capability_list'), false)
  assert.equal(tools.has('timeline_compile_manifest_create'), false)
  assert.equal(tools.has('timeline_backend_project_create'), false)
  assert.equal(tools.has('timeline_backend_conformance_report'), false)
  assert.equal(tools.has('editing_runtime_capabilities_get'), true)
  assert.equal(tools.has('editing_timeline_validate'), true)
  assert.equal(tools.has('editing_timeline_apply_commands'), true)
  assert.equal(tools.has('editing_timeline_add_track'), true)
  assert.equal(tools.has('editing_timeline_remove_track'), true)
  assert.equal(tools.has('editing_timeline_add_clip'), true)
  assert.equal(tools.has('editing_timeline_update_clip'), true)
  assert.equal(tools.has('editing_timeline_split_clip'), true)
  assert.equal(tools.has('editing_timeline_move_clip'), true)
  assert.equal(tools.has('editing_timeline_delete_clip'), true)
  assert.equal(tools.has('editing_video_compose'), true)
  assert.equal(tools.has('editing_task_render_create'), true)
  assert.equal(tools.has('editing_task_hls_create'), true)
  assert.equal(tools.has('editing_task_transcode_create'), true)
  assert.equal(tools.has('editing_task_reframe_create'), true)
  assert.equal(tools.has('editing_task_get'), true)
  assert.equal(tools.has('editing_task_cancel'), true)
  assert.equal(tools.has('editing_task_logs_get'), true)
  assert.equal(tools.has('editing_export_import_resource'), true)
  assert.equal(tools.has('editing_export_save_local'), true)
  assert.equal(tools.has('editing_export_publish_hls'), true)
  assert.equal(tools.has('editing_export_create_candidate'), true)
  assert.equal(tools.has('editing_project_create'), true)
  assert.equal(tools.has('editing_project_create_from_edit_plan'), false)
  assert.equal(tools.has('editing_project_create_from_edit_decisions'), false)
  assert.equal(tools.has('editing_project_get'), true)
  assert.equal(tools.has('editing_project_save'), true)
  assert.equal(tools.has('editing_project_update_settings'), true)
  assert.equal(tools.has('editing_project_add_asset'), true)
  assert.equal(tools.has('editing_project_remove_asset'), true)
})

test('MCP host marks legacy inline candidate tools as migration-only temporary fallbacks', () => {
  const toolsByName = new Map(listMCPHostTools().map((tool) => [tool.name, tool]))
  const fallbackCommands = [
    ['domain.candidate.legacy.append', 'domain_append_candidate'],
    ['domain.candidate.legacy.create_asset_slot', 'domain_create_asset_slot_candidate'],
    ['domain.candidate.legacy.create_keyframe', 'domain_create_keyframe_candidate'],
    ['domain.candidate.legacy.select', 'domain_select_candidate'],
    ['domain.candidate.legacy.update', 'domain_update_candidate'],
    ['domain.candidate.legacy.unlock', 'domain_unlock_candidate'],
  ]

  for (const [, toolName] of fallbackCommands) {
    const tool = toolsByName.get(toolName)
    assert.ok(tool, `${toolName} must remain discoverable only as a migration fallback`)
    assert.match(tool.description, /Temporary fallback \(migration-only\)/)
    assert.match(tool.description, /legacy candidate migration fallback/)
  }
})

test('stdio MCP host exposes only runtime bootstrap tools when daemon MCP is unavailable', async () => {
  const previousHome = process.env.MOVSCRIPT_HOME
  const previousDaemonMCP = process.env.MOVSCRIPT_DAEMON_MCP_ENDPOINT
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-no-daemon-mcp-home-'))
  try {
    process.env.MOVSCRIPT_HOME = homeDir
    delete process.env.MOVSCRIPT_DAEMON_MCP_ENDPOINT

    const toolsResponse = await handleMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'bootstrap-tools',
      method: 'tools/list',
    })
    assert.equal(toolsResponse?.error, undefined)
    const tools = new Set(toolsResponse.result.tools.map((tool) => tool.name))
    assert.equal(tools.has('runtime_daemon_ensure'), true)
    assert.equal(tools.has('runtime_daemon_status'), true)
    assert.equal(tools.has('runtime_daemon_configure'), true)
    assert.equal(tools.has('runtime_gateway_configure'), true)
    assert.equal(tools.has('runtime_gateway_status'), true)
    assert.equal(tools.has('admin_provider_list'), false)
    assert.equal(tools.has('system_model_list'), false)

    const businessResponse = await handleMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'business-without-daemon',
      method: 'tools/call',
      params: {
        name: 'system_model_list',
        arguments: { homeDir },
      },
    })
    assert.match(businessResponse?.error?.message ?? '', /daemon MCP endpoint is not available/)
  } finally {
    restoreEnv('MOVSCRIPT_HOME', previousHome)
    restoreEnv('MOVSCRIPT_DAEMON_MCP_ENDPOINT', previousDaemonMCP)
  }
})

test('stdio MCP host proxies business tools to daemon MCP endpoint when available', async () => {
  const previousHome = process.env.MOVSCRIPT_HOME
  const previousDaemonMCP = process.env.MOVSCRIPT_DAEMON_MCP_ENDPOINT
  mcpProxyRequests = []
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-daemon-mcp-proxy-home-'))
  try {
    mkdirSync(join(homeDir, 'runtime', 'endpoints'), { recursive: true })
    writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.local-node.gateway.json'), JSON.stringify({
      serviceName: 'movscript.local-node.gateway',
      applicationId: 'movscript.local-node',
      status: 'ready',
      baseURL: `${baseURL}/gateway`,
    }), 'utf8')
    process.env.MOVSCRIPT_HOME = homeDir
    delete process.env.MOVSCRIPT_DAEMON_MCP_ENDPOINT

    const toolsResponse = await handleMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'proxied-tools',
      method: 'tools/list',
    })
    assert.equal(toolsResponse?.error, undefined)
    assert.deepEqual(toolsResponse.result.tools.map((tool) => tool.name), ['daemon_reported_tool'])

    const businessResponse = await handleMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'proxied-admin',
      method: 'tools/call',
      params: {
        name: 'admin_provider_list',
        arguments: { homeDir },
      },
    })
    assert.equal(businessResponse?.error, undefined)
    assert.equal(businessResponse.result.proxied, true)
    assert.equal(businessResponse.result.tool, 'admin_provider_list')
    assert.equal(businessResponse.result.structuredContent.proxied, true)
    assert.equal(businessResponse.result.structuredContent.tool, 'admin_provider_list')
    assert.equal(businessResponse.result.content[0].type, 'text')

    const runtimeResponse = await handleMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'local-runtime-status',
      method: 'tools/call',
      params: {
        name: 'runtime_daemon_status',
        arguments: { homeDir },
      },
    })
    assert.equal(runtimeResponse?.error, undefined)
    assert.equal(runtimeResponse.result.status, 'not_running')
    assert.equal(runtimeResponse.result.structuredContent.status, 'not_running')
    assert.equal(runtimeResponse.result.content[0].type, 'text')
    assert.equal(runtimeResponse.result.contract.family, 'runtime')
    assert.deepEqual(runtimeResponse.result.debug.cli_argv, ['movscript', 'daemon', 'status', '--json', '--home-dir', homeDir])
    assert.deepEqual(mcpProxyRequests.map((request) => request.method), ['tools/list', 'tools/call'])
  } finally {
    restoreEnv('MOVSCRIPT_HOME', previousHome)
    restoreEnv('MOVSCRIPT_DAEMON_MCP_ENDPOINT', previousDaemonMCP)
  }
})

test('stdio MCP host proxies business tools to a registered cloud runtime gateway', async () => {
  const previousHome = process.env.MOVSCRIPT_HOME
  const previousDaemonMCP = process.env.MOVSCRIPT_DAEMON_MCP_ENDPOINT
  const previousRuntimeMCP = process.env.MOVSCRIPT_RUNTIME_MCP_ENDPOINT
  const previousRuntimeGateway = process.env.MOVSCRIPT_RUNTIME_GATEWAY_URL
  const previousCloudGateway = process.env.MOVSCRIPT_CLOUD_RUNTIME_GATEWAY_URL
  const previousExternalGateway = process.env.MOVSCRIPT_EXTERNAL_RUNTIME_GATEWAY_URL
  mcpProxyRequests = []
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-cloud-runtime-mcp-proxy-home-'))
  try {
    mkdirSync(join(homeDir, 'runtime', 'endpoints'), { recursive: true })
    writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.runtime.gateway.json'), JSON.stringify({
      serviceName: 'movscript.runtime.gateway',
      applicationId: 'movscript.cloud-runtime',
      status: 'ready',
      baseURL: `${baseURL}/gateway`,
      metadata: {
        owner: 'cloud-runtime',
        dataPlane: 'cloud',
      },
    }), 'utf8')
    process.env.MOVSCRIPT_HOME = homeDir
    delete process.env.MOVSCRIPT_DAEMON_MCP_ENDPOINT
    delete process.env.MOVSCRIPT_RUNTIME_MCP_ENDPOINT
    delete process.env.MOVSCRIPT_RUNTIME_GATEWAY_URL
    delete process.env.MOVSCRIPT_CLOUD_RUNTIME_GATEWAY_URL
    delete process.env.MOVSCRIPT_EXTERNAL_RUNTIME_GATEWAY_URL

    const toolsResponse = await handleMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'cloud-proxied-tools',
      method: 'tools/list',
    })
    assert.equal(toolsResponse?.error, undefined)
    assert.deepEqual(toolsResponse.result.tools.map((tool) => tool.name), ['daemon_reported_tool'])

    const businessResponse = await handleMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'cloud-proxied-admin',
      method: 'tools/call',
      params: {
        name: 'admin_provider_list',
        arguments: { homeDir },
      },
    })
    assert.equal(businessResponse?.error, undefined)
    assert.equal(businessResponse.result.proxied, true)
    assert.equal(businessResponse.result.tool, 'admin_provider_list')
    assert.equal(businessResponse.result.structuredContent.proxied, true)
    assert.equal(businessResponse.result.structuredContent.tool, 'admin_provider_list')
    assert.equal(businessResponse.result.content[0].type, 'text')
    assert.deepEqual(mcpProxyRequests.map((request) => request.method), ['tools/list', 'tools/call'])
  } finally {
    restoreEnv('MOVSCRIPT_HOME', previousHome)
    restoreEnv('MOVSCRIPT_DAEMON_MCP_ENDPOINT', previousDaemonMCP)
    restoreEnv('MOVSCRIPT_RUNTIME_MCP_ENDPOINT', previousRuntimeMCP)
    restoreEnv('MOVSCRIPT_RUNTIME_GATEWAY_URL', previousRuntimeGateway)
    restoreEnv('MOVSCRIPT_CLOUD_RUNTIME_GATEWAY_URL', previousCloudGateway)
    restoreEnv('MOVSCRIPT_EXTERNAL_RUNTIME_GATEWAY_URL', previousExternalGateway)
  }
})

test('stdio MCP host can proxy through explicit runtime gateway environment configuration', async () => {
  const previousHome = process.env.MOVSCRIPT_HOME
  const previousDaemonMCP = process.env.MOVSCRIPT_DAEMON_MCP_ENDPOINT
  const previousRuntimeMCP = process.env.MOVSCRIPT_RUNTIME_MCP_ENDPOINT
  const previousRuntimeGateway = process.env.MOVSCRIPT_RUNTIME_GATEWAY_URL
  const previousCloudGateway = process.env.MOVSCRIPT_CLOUD_RUNTIME_GATEWAY_URL
  const previousExternalGateway = process.env.MOVSCRIPT_EXTERNAL_RUNTIME_GATEWAY_URL
  mcpProxyRequests = []
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-runtime-gateway-env-mcp-proxy-home-'))
  try {
    process.env.MOVSCRIPT_HOME = homeDir
    process.env.MOVSCRIPT_RUNTIME_GATEWAY_URL = `${baseURL}/gateway`
    delete process.env.MOVSCRIPT_DAEMON_MCP_ENDPOINT
    delete process.env.MOVSCRIPT_RUNTIME_MCP_ENDPOINT
    delete process.env.MOVSCRIPT_CLOUD_RUNTIME_GATEWAY_URL
    delete process.env.MOVSCRIPT_EXTERNAL_RUNTIME_GATEWAY_URL

    const response = await handleMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'runtime-gateway-env-tools',
      method: 'tools/list',
    })
    assert.equal(response?.error, undefined)
    assert.deepEqual(response.result.tools.map((tool) => tool.name), ['daemon_reported_tool'])
    assert.deepEqual(mcpProxyRequests.map((request) => request.method), ['tools/list'])
  } finally {
    restoreEnv('MOVSCRIPT_HOME', previousHome)
    restoreEnv('MOVSCRIPT_DAEMON_MCP_ENDPOINT', previousDaemonMCP)
    restoreEnv('MOVSCRIPT_RUNTIME_MCP_ENDPOINT', previousRuntimeMCP)
    restoreEnv('MOVSCRIPT_RUNTIME_GATEWAY_URL', previousRuntimeGateway)
    restoreEnv('MOVSCRIPT_CLOUD_RUNTIME_GATEWAY_URL', previousCloudGateway)
    restoreEnv('MOVSCRIPT_EXTERNAL_RUNTIME_GATEWAY_URL', previousExternalGateway)
  }
})

test('MCP host context updates prefer daemon context sessions when gateway is registered', async () => {
  const previousHome = process.env.MOVSCRIPT_HOME
  contextRequests = []
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-daemon-context-home-'))
  try {
    mkdirSync(join(homeDir, 'runtime', 'endpoints'), { recursive: true })
    writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.local-node.gateway.json'), JSON.stringify({
      serviceName: 'movscript.local-node.gateway',
      applicationId: 'movscript.local-node',
      status: 'ready',
      baseURL: `${baseURL}/gateway`,
    }), 'utf8')
    process.env.MOVSCRIPT_HOME = homeDir

    await updateHostMCPContextSnapshot({
      route: { pathname: '/projects/42', search: '?workspaceId=secret&tab=overview', hash: '#top' },
      project: { id: 42, name: 'Daemon Context Project', projectDir: '/tmp/movscript-project-42' },
      productionId: 'prod-42',
      user: { id: 7, username: 'operator', systemRole: 'admin' },
      selection: { entityKind: 'production', entityId: 'prod-42', label: 'Cut v1' },
      updatedAt: '2026-06-30T00:00:00.000Z',
    })

    assert.equal(contextRequests.length, 1)
    assert.equal(contextRequests[0].url, '/gateway/v1/context/sessions')
    assert.equal(contextRequests[0].body.sessionId, 'desktop-current')
    assert.equal(contextRequests[0].body.backendProjectId, 42)
    assert.equal(contextRequests[0].body.backend_project_id, 42)
    assert.equal(contextRequests[0].body.projectKey, '42')
    assert.equal(contextRequests[0].body.projectId, '42')
    assert.equal(contextRequests[0].body.projectDir, '/tmp/movscript-project-42')
    assert.equal(contextRequests[0].body.mcpContext.route.pathname, '/projects/42')
    assert.equal(contextRequests[0].body.mcpContext.selection.entityKind, 'production')

    contextRequests = []
    await updateHostMCPContextSnapshot({
      route: { pathname: '/studio/local-workspace/overview', search: '?projectKey=local-workspace', hash: '' },
      project: {
        id: 'local:abc123',
        name: 'Local Workspace',
        backendProjectId: 88,
        projectUid: 'prj_local_uid',
        projectKey: 'local-workspace',
        projectDir: '/tmp/local-workspace',
      },
      productionId: null,
      user: null,
      selection: null,
      updatedAt: '2026-06-30T00:01:00.000Z',
    })

    assert.equal(contextRequests.length, 1)
    assert.equal(contextRequests[0].body.backendProjectId, 88)
    assert.equal(contextRequests[0].body.projectUid, 'prj_local_uid')
    assert.equal(contextRequests[0].body.projectKey, 'local-workspace')
    assert.equal(contextRequests[0].body.projectId, 'local-workspace')
    assert.equal(contextRequests[0].body.mcpContext.project.id, 'local:abc123')
    assert.equal(contextRequests[0].body.mcpContext.project.backendProjectId, 88)
    assert.equal(contextRequests[0].body.mcpContext.project.projectUid, 'prj_local_uid')
  } finally {
    restoreEnv('MOVSCRIPT_HOME', previousHome)
  }
})

test('context MCP tool runs through shared command runner with CLI debug metadata', async () => {
  try {
    await updateHostMCPContextSnapshot({
      route: { pathname: '/projects/77', search: '?workspaceId=secret&tab=timeline', hash: '#cut' },
      project: { id: 77, name: 'Context Runner Project' },
      productionId: 'prod-77',
      user: { id: 8, username: 'reviewer', systemRole: 'admin' },
      selection: { entityKind: 'content_unit', entityId: 'cu-1', label: 'Intro' },
      updatedAt: '2026-06-30T00:00:00.000Z',
    })

    const response = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'context-current',
      method: 'tools/call',
      params: {
        name: 'context_current_get',
        arguments: {},
      },
    })

    assert.equal(response?.error, undefined)
    assert.equal(response.result.schema, 'movscript.mcp.context-current.v1')
    assert.equal(response.result.context.route.pathname, '/projects/77')
    assert.equal(response.result.context.route.search, '?tab=timeline')
    assert.equal(response.result.context.project.name, 'Context Runner Project')
    assert.equal(response.result.context.selection.label, 'Intro')
    assert.equal(response.result.contract.family, 'context')
    assert.deepEqual(response.result.debug.cli_argv, ['movscript', 'context', 'current', 'get', '--json'])
  } finally {
    await updateHostMCPContextSnapshot({
      route: { pathname: '/', search: '', hash: '' },
      project: null,
      productionId: null,
      user: null,
      selection: null,
      updatedAt: new Date(0).toISOString(),
    })
  }
})

test('editing MCP tools run through shared command runner with CLI debug metadata', async () => {
  const response = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'editing-capabilities',
    method: 'tools/call',
    params: {
      name: 'editing_runtime_capabilities_get',
      arguments: {},
    },
  })

  assert.equal(response?.error, undefined)
  assert.equal(response.result.status, 'unsupported_runtime')
  assert.equal(response.result.code, 'ELECTRON_EDITING_RUNTIME_REQUIRED')
  assert.equal(response.result.contract.family, 'editing')
  assert.deepEqual(response.result.debug.cli_argv, ['movscript', 'editing', 'runtime', 'capabilities', 'get', '--json'])
})

test('editing project creation MCP tool is backed by the shared CLI runner and stays media-project-only', async () => {
  editingRequests = []
  const response = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'editing-create-project',
    method: 'tools/call',
    params: {
      name: 'editing_project_create',
      arguments: {
        server: baseURL,
        mediaProjectId: 'project_mcp_editing',
        title: 'MCP Compose Project',
      },
    },
  })

  assert.equal(response?.error, undefined)
  assert.equal(response.result.status, 'saved')
  assert.equal(response.result.editing_project.source.kind, 'manual')
  assert.equal(response.result.editing_project.projectId, 'project_mcp_editing')
  assert.equal(response.result.candidate_created, undefined)
  assert.equal(response.result.contract.family, 'editing')
  assert.deepEqual(response.result.debug.cli_argv, [
    'movscript',
    'editing',
    'project',
    'create',
    '--json',
    '--server',
    baseURL,
    '--media-project-id',
    'project_mcp_editing',
    '--title',
    'MCP Compose Project',
  ])
  assert.deepEqual(editingRequests.map((request) => request.body.command), [
    'createProject',
    'saveProject',
  ])
})

test('editing timeline mutation MCP tool is backed by the shared CLI runner and stays project-only', async () => {
  editingRequests = []
  const editingProject = sampleEditingProject()
  const clip = { id: 'clip_mcp_intro', assetId: 'clip_intro', assetType: 'video', timelineStartMs: 0, durationMs: 3000 }
  const response = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'editing-add-clip',
    method: 'tools/call',
    params: {
      name: 'editing_timeline_add_clip',
      arguments: {
        server: baseURL,
        editingProject,
        trackId: 'track_primary_video',
        clip,
      },
    },
  })

  assert.equal(response?.error, undefined)
  assert.equal(response.result.status, 'updated')
  assert.equal(response.result.clip.id, 'clip_mcp_intro')
  assert.equal(response.result.candidate_created, undefined)
  assert.equal(response.result.contract.family, 'editing')
  assert.deepEqual(response.result.debug.cli_argv, [
    'movscript',
    'editing',
    'timeline',
    'add-clip',
    '--json',
    '--server',
    baseURL,
    '--editing-project',
    '<json>',
    '--track-id',
    'track_primary_video',
    '--clip',
    '<json>',
  ])
  assert.deepEqual(editingRequests.map((request) => request.body.command), ['addClip'])
  assert.deepEqual(editingRequests[0].body.input.clip, clip)
})

test('editing task MCP tool is backed by the shared CLI runner and stays candidate-free', async () => {
  editingRequests = []
  mediaPipelineRequests = []
  const previousMediaPipelineURL = process.env.MOVSCRIPT_MEDIA_PIPELINE_URL
  try {
    process.env.MOVSCRIPT_MEDIA_PIPELINE_URL = baseURL
    const response = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'editing-task-get',
      method: 'tools/call',
      params: {
          name: 'editing_task_get',
          arguments: {
            server: baseURL,
            mediaProjectId: 'project_mcp_editing',
            taskId: 'task_mcp_render',
          },
      },
    })

    assert.equal(response?.error, undefined)
    assert.equal(response.result.status, 'ok')
    assert.equal(response.result.task.taskId, 'task_mcp_render')
    assert.equal(response.result.task.status, 'running')
    assert.equal(response.result.candidate_created, undefined)
    assert.equal(response.result.contract.family, 'editing')
    assert.deepEqual(response.result.debug.cli_argv, [
      'movscript',
      'editing',
      'task',
      'get',
      '--json',
      '--server',
      baseURL,
      '--media-project-id',
      'project_mcp_editing',
      '--task-id',
      'task_mcp_render',
    ])
    assert.deepEqual(editingRequests.map((request) => request.body.action), ['getTask'])
    assert.deepEqual(mediaPipelineRequests.map((request) => request.body.action), ['getTask'])
  } finally {
    restoreEnv('MOVSCRIPT_MEDIA_PIPELINE_URL', previousMediaPipelineURL)
  }
})

test('editing task create MCP tool is backed by the shared CLI runner and stays candidate-free', async () => {
  editingRequests = []
  mediaPipelineRequests = []
  const previousMediaPipelineURL = process.env.MOVSCRIPT_MEDIA_PIPELINE_URL
  const editingProject = sampleEditingProject()
  const output = { filename: 'mcp-preview.mp4', importToResource: false }
  try {
    process.env.MOVSCRIPT_MEDIA_PIPELINE_URL = baseURL
    const response = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'editing-render-create',
      method: 'tools/call',
      params: {
        name: 'editing_task_render_create',
        arguments: {
          server: baseURL,
          editingProject,
          output,
        },
      },
    })

    assert.equal(response?.error, undefined)
    assert.equal(response.result.status, 'ok')
    assert.equal(response.result.task.taskType, 'timeline_render')
    assert.equal(response.result.task.status, 'queued')
    assert.equal(response.result.candidate_created, undefined)
    assert.equal(response.result.contract.family, 'editing')
    assert.deepEqual(response.result.debug.cli_argv, [
      'movscript',
      'editing',
      'task',
      'render',
      'create',
      '--json',
      '--server',
      baseURL,
      '--editing-project',
      '<json>',
      '--output',
      '<json>',
    ])
    assert.deepEqual(editingRequests.map((request) => request.body.taskType), ['timeline_render'])
    assert.deepEqual(mediaPipelineRequests.map((request) => request.body.request.taskType), ['timeline_render'])
    assert.equal(mediaPipelineRequests[0].body.request.projectId, 'project_mcp_editing')
  } finally {
    restoreEnv('MOVSCRIPT_MEDIA_PIPELINE_URL', previousMediaPipelineURL)
  }
})

test('editing export MCP tools keep local save and candidate write as explicit CLI-backed gates', async () => {
  editingRequests = []

  const saved = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'editing-export-save-local',
    method: 'tools/call',
    params: {
      name: 'editing_export_save_local',
      arguments: {
        server: baseURL,
        outputPath: '/tmp/final-cut.mp4',
      },
    },
  })
  assert.equal(saved?.error, undefined)
  assert.equal(saved.result.status, 'ok')
  assert.equal(saved.result.output_path, '/tmp/final-cut.mp4')
  assert.equal(saved.result.uploaded, false)
  assert.equal(saved.result.candidate_created, false)
  assert.equal(saved.result.contract.family, 'editing')
  assert.deepEqual(saved.result.debug.cli_argv, [
    'movscript',
    'editing',
    'export',
    'save-local',
    '--json',
    '--server',
    baseURL,
    '--output-path',
    '/tmp/final-cut.mp4',
  ])

  const hlsCandidate = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'editing-export-create-hls-candidate',
    method: 'tools/call',
    params: {
      name: 'editing_export_create_candidate',
      arguments: {
        server: baseURL,
        contentUnitId: 'cu_01',
        streamId: 'stream_41',
      },
    },
  })
  assert.equal(hlsCandidate?.result, undefined)
  assert.match(hlsCandidate?.error?.message ?? '', /projectDir or cwd is required/)
  assert.doesNotMatch(hlsCandidate?.error?.message ?? '', /HLS_STREAM_CANDIDATE_UNSUPPORTED/)

  assert.deepEqual(editingRequests.map((request) => request.body.action), ['saveLocalExport'])
})

test('admin MCP tools bind to MovScript Home daemon gateway before calling fixed backend endpoints', async () => {
  const previousHome = process.env.MOVSCRIPT_HOME
  const previousDataServiceURL = process.env.MOVSCRIPT_DATA_SERVICE_URL
  delete process.env.MOVSCRIPT_DATA_SERVICE_URL
  adminRequests = []
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-home-'))
  try {
    mkdirSync(join(homeDir, 'runtime', 'endpoints'), { recursive: true })
    writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.local-node.gateway.json'), JSON.stringify({
      serviceName: 'movscript.local-node.gateway',
      applicationId: 'movscript.local-node',
      status: 'ready',
      baseURL: `${baseURL}/gateway`,
    }), 'utf8')
    process.env.MOVSCRIPT_HOME = homeDir

    const listResponse = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'admin-providers',
      method: 'tools/call',
      params: {
        name: 'admin_provider_list',
        arguments: { homeDir },
      },
    })
    assert.equal(listResponse?.error, undefined)
    assert.equal(listResponse.result.items[0].provider_id, 'provider-main')

    const tunnelResponse = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'admin-tunnel',
      method: 'tools/call',
      params: {
        name: 'admin_public_tunnel_config_update',
        arguments: {
          homeDir,
          payload: {
            default_profile_id: 'public-tunnel',
            profiles: [{
              id: 'public-tunnel',
              mode: 'public_tunnel',
              enabled: true,
              public_base_url: 'https://example-tunnel.test',
            }],
          },
        },
      },
    })
    assert.equal(tunnelResponse?.error, undefined)
    assert.equal(tunnelResponse.result.default_profile_id, 'public-tunnel')
    assert.equal(tunnelResponse.result.profiles[0].public_base_url, 'https://example-tunnel.test')

    const deleteResponse = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'admin-gateway-delete',
      method: 'tools/call',
      params: {
        name: 'admin_model_gateway_key_delete',
        arguments: { homeDir, keyId: '9' },
      },
    })
    assert.equal(deleteResponse?.error, undefined)
    assert.equal(deleteResponse.result.status, 'deleted')

    const accessCheckResponse = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'admin-resource-access-check',
      method: 'tools/call',
      params: {
        name: 'admin_resource_access_check_test',
        arguments: {
          homeDir,
          resourceId: '880',
          requiredMediaType: 'image',
          profileId: 'public-tunnel',
        },
      },
    })
    assert.equal(accessCheckResponse?.error, undefined)
    assert.equal(accessCheckResponse.result.reachable, true)
    assert.equal(accessCheckResponse.result.status_code, 200)
    assert.deepEqual(accessCheckResponse.result.debug.cli_argv, [
      'movscript',
      'admin',
      'resource-access',
      'check-test',
      '--json',
      '--home-dir',
      homeDir,
      '--resource-id',
      '880',
      '--required-media-type',
      'image',
      '--profile-id',
      'public-tunnel',
    ])
    assert.deepEqual(adminRequests.map((request) => `${request.method} ${request.url}`), [
      'GET /gateway/api/v1/admin/providers',
      'PUT /gateway/api/v1/admin/settings/resource-access',
      'DELETE /gateway/api/v1/model-gateway/api-keys/9',
      'POST /gateway/api/v1/resource-access/check',
    ])
    assert.deepEqual(adminRequests.at(-1)?.body, {
      resource_id: 880,
      required_media_type: 'image',
      profile_id: 'public-tunnel',
    })
  } finally {
    restoreEnv('MOVSCRIPT_HOME', previousHome)
    restoreEnv('MOVSCRIPT_DATA_SERVICE_URL', previousDataServiceURL)
  }
})

test('system MCP tools run through shared command runner with CLI debug metadata', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-system-mcp-home-'))

  const capabilityResponse = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'system-capabilities',
    method: 'tools/call',
    params: {
      name: 'generation_capability_list',
      arguments: { homeDir },
    },
  })
  assert.equal(capabilityResponse?.error, undefined)
  assert.equal(capabilityResponse.result.capabilities.includes('image_generation'), true)
  assert.deepEqual(capabilityResponse.result.debug.cli_argv, [
    'movscript',
    'system',
    'generation',
    'capability',
    'list',
    '--json',
    '--home-dir',
    homeDir,
  ])

  const modelResponse = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'system-models',
    method: 'tools/call',
    params: {
      name: 'system_model_list',
      arguments: { homeDir, capability: 'not_real' },
    },
  })
  assert.equal(modelResponse?.error, undefined)
  assert.equal(modelResponse.result.count, 0)
  assert.deepEqual(modelResponse.result.model_contracts, [])
  assert.deepEqual(modelResponse.result.debug.cli_argv, [
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

test('production editing MCP tools run through shared command runner with CLI debug metadata', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-production-editing-mcp-home-'))
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-production-editing-project-'))

  const oldTimelineResponse = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'old-timeline-capabilities',
    method: 'tools/call',
    params: {
      name: 'timeline_backend_capability_list',
      arguments: { homeDir },
    },
  })
  assert.match(oldTimelineResponse?.error?.message ?? '', /unknown .*MCP tool/)

  projectRequests = []
  const listResponse = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'production-editing-list',
    method: 'tools/call',
    params: {
      name: 'production_editing_workspace_list',
      arguments: {
        homeDir,
        projectServiceURL: baseURL,
        projectDir,
        productionId: 'pilot',
        kind: 'remotion',
      },
    },
  })
  assert.equal(listResponse?.error, undefined)
  assert.equal(listResponse.result.schema, 'movscript.production_editing_workspaces_list.v1')
  assert.equal(listResponse.result.workspaces[0].kind, 'remotion')
  assert.deepEqual(projectRequests.map((request) => request.url), ['/v1/project/productions/editing-workspaces/list'])
  assert.deepEqual(listResponse.result.debug.cli_argv, [
    'movscript',
    'production',
    'editing',
    'workspace',
    'list',
    '--json',
    '--home-dir',
    homeDir,
    '--project-dir',
    projectDir,
    '--project-service-url',
    baseURL,
    '--production-id',
    'pilot',
    '--kind',
    'remotion',
  ])
})

test('workspace/domain MCP tools run through shared command runner with CLI debug metadata', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-workspace-mcp-project-'))
  const modelResponse = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'domain-get-model',
    method: 'tools/call',
    params: {
      name: 'domain_get_model',
      arguments: { entityKind: 'project', entityId: 'project_01' },
    },
  })
  assert.equal(modelResponse?.error, undefined)
  assert.equal(modelResponse.result.workspaceKind, 'project_workspace')
  assert.equal(modelResponse.result.entityKind, 'project')
  assert.equal(modelResponse.result.entityId, 'project_01')
  assert.deepEqual(modelResponse.result.debug.cli_argv, [
    'movscript',
    'domain',
    'get-model',
    '--json',
    '--entity-kind',
    'project',
    '--entity-id',
    'project_01',
  ])

  projectRequests = []
  const inspectResponse = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'domain-inspect',
    method: 'tools/call',
    params: {
      name: 'domain_inspect',
      arguments: {
        backendBaseURL: baseURL,
        projectDir,
        projectUid: 'prj_mcp_workspace',
      },
    },
  })
  assert.equal(inspectResponse?.error, undefined)
  assert.equal(inspectResponse.result.schema, 'movscript.workspace-inspection.v1')
  assert.equal(inspectResponse.result.readyToInterpret, false)
  assert.deepEqual(inspectResponse.result.debug.cli_argv, [
    'movscript',
    'domain',
    'diagnostics',
    'inspect',
    '--json',
    '--project-dir',
    projectDir,
    '--server',
    baseURL,
    '--project-uid',
    'prj_mcp_workspace',
  ])
  assert.equal(inspectResponse.result.debug.project_service_endpoint, baseURL)
  assert.deepEqual(projectRequests.map((request) => request.url), ['/v1/project/source/inspect'])

  projectRequests = []
  const interpretResponse = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'domain-interpret',
    method: 'tools/call',
    params: {
      name: 'domain_interpret',
      arguments: {
        backendBaseURL: baseURL,
        projectDir,
        projectUid: 'prj_mcp_workspace',
      },
    },
  })
  assert.equal(interpretResponse?.error, undefined)
  assert.equal(interpretResponse.result.schema, 'movscript.workspace-interpret-result.v1')
  assert.equal(interpretResponse.result.status, 'refreshed')
  assert.equal(interpretResponse.result.manifest.output.editorStatePath, '.interpret/current/editor-state.json')
  assert.deepEqual(interpretResponse.result.debug.cli_argv, [
    'movscript',
    'domain',
    'diagnostics',
    'interpret',
    '--json',
    '--project-dir',
    projectDir,
    '--server',
    baseURL,
    '--project-uid',
    'prj_mcp_workspace',
  ])
  assert.equal(interpretResponse.result.debug.project_service_endpoint, baseURL)
  assert.deepEqual(projectRequests.map((request) => request.url), [
    '/v1/project/locator/resolve',
    '/api/v1/projects/ensure',
    '/api/v1/project-data/spaces',
    '/v1/project/source/interpret',
  ])
  assert.equal(projectRequests[0]?.body.projectUid, 'prj_mcp_workspace')
  assert.equal(projectRequests[1]?.body.project_uid, 'prj_mcp_workspace')

  projectRequests = []
  const overviewResponse = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'domain-overview',
    method: 'tools/call',
    params: {
      name: 'domain_overview',
      arguments: {
        backendBaseURL: baseURL,
        projectDir,
      },
    },
  })
  assert.equal(overviewResponse?.error, undefined)
  assert.equal(overviewResponse.result.schema, 'movscript.workspace-overview.v1')
  assert.equal(overviewResponse.result.contract.family, 'domain')
  assert.deepEqual(overviewResponse.result.contract.permissions, ['project:read'])
  assert.deepEqual(overviewResponse.result.debug.cli_argv, [
    'movscript',
    'domain',
    'overview',
    '--json',
    '--project-dir',
    projectDir,
    '--server',
    baseURL,
  ])

  const queryResponse = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'domain-query-entities',
    method: 'tools/call',
    params: {
      name: 'domain_query_entities',
      arguments: {
        backendBaseURL: baseURL,
        projectDir,
        entityKind: 'content_unit',
        query: 'hero',
        limit: 2,
      },
    },
  })
  assert.equal(queryResponse?.error, undefined)
  assert.equal(queryResponse.result.schema, 'movscript.project-entities-query-result.v1')
  assert.equal(queryResponse.result.query.limit, 2)
  assert.deepEqual(queryResponse.result.debug.cli_argv, [
    'movscript',
    'domain',
    'query',
    'entities',
    '--json',
    '--project-dir',
    projectDir,
    '--server',
    baseURL,
    '--entity-kind',
    'content_unit',
    '--query',
    'hero',
    '--limit',
    '2',
  ])

  const contextResponse = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'domain-project-context',
    method: 'tools/call',
    params: {
      name: 'domain_read_project_context_snapshot',
      arguments: {
        backendBaseURL: baseURL,
        projectDir,
      },
    },
  })
  assert.equal(contextResponse?.error, undefined)
  assert.equal(contextResponse.result.schema, 'movscript.project_context_snapshot.v1')
  assert.equal(contextResponse.result.style_reference_resource_ids[0], 101)

  const regenerationResponse = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'domain-regeneration',
    method: 'tools/call',
    params: {
      name: 'domain_regeneration_plan',
      arguments: {
        backendBaseURL: baseURL,
        projectDir,
        target: 'content_unit:cu_hero',
      },
    },
  })
  assert.equal(regenerationResponse?.error, undefined)
  assert.equal(regenerationResponse.result.schema, 'movscript.workspace-regeneration-plan.v1')
  assert.equal(regenerationResponse.result.surface.url.includes('source=domain_regeneration_plan'), true)

  const workPlanResponse = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'domain-production-work-plan',
    method: 'tools/call',
    params: {
      name: 'domain_read_production_work_plan',
      arguments: {
        backendBaseURL: baseURL,
        projectDir,
      },
    },
  })
  assert.equal(workPlanResponse?.error, undefined)
  assert.equal(workPlanResponse.result.schema, 'movscript.production_work_plan.v1')
  assert.equal(workPlanResponse.result.items[0].id, 'work_hero')
  assert.deepEqual(workPlanResponse.result.debug.cli_argv, [
    'movscript',
    'domain',
    'read',
    'production-work-plan',
    '--json',
    '--project-dir',
    projectDir,
    '--server',
    baseURL,
  ])
  assert.deepEqual(projectRequests.map((request) => request.url), [
    '/v1/project/source/overview',
    '/v1/project/entities/query',
    '/v1/project/resources/view',
    '/v1/project/source/regeneration-plan',
    '/v1/project/source/production-work-plan',
  ])

  projectRequests = []
  const settingSourceResponse = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'domain-upsert-setting',
    method: 'tools/call',
    params: {
      name: 'domain_upsert_setting',
      arguments: {
        backendBaseURL: baseURL,
        projectDir,
        projectUid: 'prj_mcp_workspace',
        payload: { id: 'hero', title: 'Hero', kind: 'character' },
      },
    },
  })
  assert.equal(settingSourceResponse?.error, undefined)
  assert.equal(settingSourceResponse.result.endpoint, '/v1/project/settings/create')
  assert.equal(settingSourceResponse.result.contract.family, 'domain')
  assert.deepEqual(settingSourceResponse.result.contract.permissions, ['project:read', 'project:write'])
  assert.deepEqual(settingSourceResponse.result.debug.cli_argv, [
    'movscript',
    'domain',
    'source',
    'setting',
    'upsert',
    '--json',
    '--project-dir',
    projectDir,
    '--server',
    baseURL,
    '--project-uid',
    'prj_mcp_workspace',
    '--payload',
    '<json>',
  ])

  const scriptReadResponse = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'domain-read-script-source',
    method: 'tools/call',
    params: {
      name: 'domain_read_script_source',
      arguments: {
        backendBaseURL: baseURL,
        projectDir,
        record: { id: 'script_main', path: 'scripts/main/script.md' },
      },
    },
  })
  assert.equal(scriptReadResponse?.error, undefined)
  assert.equal(scriptReadResponse.result.endpoint, '/v1/project/scripts/source/read')
  assert.equal(scriptReadResponse.result.sourceText, '# Script')
  assert.deepEqual(scriptReadResponse.result.contract.permissions, ['project:read'])

  const sourceRequestURLs = projectRequests.map((request) => request.url)
  assert.equal(sourceRequestURLs.includes('/v1/project/settings/create'), true)
  assert.equal(sourceRequestURLs.includes('/v1/project/scripts/source/read'), true)
  assert.equal(projectRequests.find((request) => request.url === '/v1/project/settings/create')?.body.id, 'hero')
  assert.equal(projectRequests.find((request) => request.url === '/v1/project/scripts/source/read')?.body.record.id, 'script_main')

  projectRequests = []
  const candidateResponse = await handleLocalMCPHostJSONRPC({
    jsonrpc: '2.0',
    id: 'domain-create-content-candidate',
    method: 'tools/call',
    params: {
      name: 'domain_create_content_candidate',
      arguments: {
        backendBaseURL: baseURL,
        token: 'test-token',
        projectDir,
        projectUid: 'prj_mcp_workspace',
        contentUnitId: 'cu_hero',
        candidateId: 'candidate_mcp_hero',
        source: 'generation',
        outputs: [{ kind: 'image', resource_id: 101 }],
      },
    },
  })
  assert.equal(candidateResponse?.error, undefined)
  assert.equal(candidateResponse.result.status, 'ok')
  assert.equal(candidateResponse.result.candidate_created, true)
  assert.equal(candidateResponse.result.will_auto_select, false)
  assert.equal(candidateResponse.result.requires_user_adoption, true)
  assert.equal(candidateResponse.result.result.record.id, 'candidate_mcp_hero')
  assert.equal(candidateResponse.result.contract.family, 'domain')
  assert.deepEqual(candidateResponse.result.debug.cli_argv, [
    'movscript',
    'domain',
    'candidate',
    'create-content',
    '--json',
    '--project-dir',
    projectDir,
    '--server',
    baseURL,
    '--token',
    '<redacted>',
    '--project-uid',
    'prj_mcp_workspace',
    '--content-unit-id',
    'cu_hero',
    '--candidate-id',
    'candidate_mcp_hero',
    '--source',
    'generation',
    '--outputs',
    '<json>',
  ])
  assert.deepEqual(projectRequests.map((request) => request.url), [
    '/v1/project/locator/resolve',
    '/v1/project/locator/resolve',
    '/v1/project/content-candidates/create',
  ])
  assert.equal(projectRequests[2]?.body.input.candidateId, 'candidate_mcp_hero')
  assert.equal(projectRequests[2]?.body.decisionStore.projectUid, 'prj_mcp_workspace')
})

test('generation MCP tools run through shared command runner with CLI debug metadata', async () => {
  const previousHome = process.env.MOVSCRIPT_HOME
  const previousDataServiceURL = process.env.MOVSCRIPT_DATA_SERVICE_URL
  delete process.env.MOVSCRIPT_DATA_SERVICE_URL
  systemRequests = []
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-generation-mcp-home-'))
  try {
    mkdirSync(join(homeDir, 'runtime', 'endpoints'), { recursive: true })
    writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.local-node.gateway.json'), JSON.stringify({
      serviceName: 'movscript.local-node.gateway',
      applicationId: 'movscript.local-node',
      status: 'ready',
      baseURL: `${baseURL}/gateway`,
    }), 'utf8')
    process.env.MOVSCRIPT_HOME = homeDir

    const prepareResponse = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'generation-prepare',
      method: 'tools/call',
      params: {
        name: 'generation_prepare',
        arguments: { homeDir, capability: 'audio_generation', operation: 'music_generation' },
      },
    })
    assert.equal(prepareResponse?.error, undefined)
    assert.equal(prepareResponse.result.status, 'ready')
    assert.equal(prepareResponse.result.capability, 'audio_generation')
    assert.equal(prepareResponse.result.count, 1)
    assert.deepEqual(prepareResponse.result.debug.cli_argv, [
      'movscript',
      'system',
      'generation',
      'prepare',
      '--json',
      '--home-dir',
      homeDir,
      '--capability',
      'audio_generation',
      '--operation',
      'music_generation',
    ])

    const submitResponse = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'generation-submit',
      method: 'tools/call',
      params: {
        name: 'generation_submit',
        arguments: {
          homeDir,
          capability: 'audio_generation',
          operation: 'music_generation',
          prompt: 'quiet tension bed',
          title: 'Music Bed',
          style: 'minimal strings',
        },
      },
    })
    assert.equal(submitResponse?.error, undefined)
    assert.equal(submitResponse.result.status, 'submitted')
    assert.equal(submitResponse.result.job_id, 701)
    assert.equal(submitResponse.result.monitor.tool, 'generation_job_get')
    assert.deepEqual(submitResponse.result.debug.cli_argv, [
      'movscript',
      'system',
      'generation',
      'submit',
      '--json',
      '--home-dir',
      homeDir,
      '--capability',
      'audio_generation',
      '--operation',
      'music_generation',
      '--prompt',
      'quiet tension bed',
      '--title',
      'Music Bed',
      '--style',
      'minimal strings',
    ])

    const jobResponse = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'generation-job-get',
      method: 'tools/call',
      params: {
        name: 'generation_job_get',
        arguments: { homeDir, jobId: 701, capability: 'audio_generation', verbosity: 'summary' },
      },
    })
    assert.equal(jobResponse?.error, undefined)
    assert.equal(jobResponse.result.status, 'succeeded')
    assert.equal(jobResponse.result.output_resource_id, 880)
    assert.deepEqual(jobResponse.result.debug.cli_argv, [
      'movscript',
      'system',
      'generation',
      'job',
      'get',
      '--json',
      '--home-dir',
      homeDir,
      '--capability',
      'audio_generation',
      '--job-id',
      '701',
      '--verbosity',
      'summary',
    ])

    const batchResponse = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'generation-job-batch',
      method: 'tools/call',
      params: {
        name: 'generation_job_get_batch',
        arguments: { homeDir, job_ids: [701], verbosity: 'summary' },
      },
    })
    assert.equal(batchResponse?.error, undefined)
    assert.equal(batchResponse.result.status, 'loaded')
    assert.equal(batchResponse.result.total, 1)
    assert.deepEqual(batchResponse.result.debug.cli_argv, [
      'movscript',
      'system',
      'generation',
      'job',
      'get-batch',
      '--json',
      '--home-dir',
      homeDir,
      '--verbosity',
      'summary',
      '--job-ids',
      '<json>',
    ])

    const jobCreateRequest = systemRequests.find((request) => request.method === 'POST' && request.url === '/gateway/api/v1/jobs')
    assert.equal(jobCreateRequest?.body.model_id, 'audio:music')
    assert.equal(jobCreateRequest?.body.job_type, 'audio')
    assert.equal(jobCreateRequest?.body.feature_key, 'electron.generation.music')
    assert.equal(jobCreateRequest?.body.generation_intent.operation, 'music_generation')
    assert.deepEqual(JSON.parse(jobCreateRequest?.body.extra_params), { style: 'minimal strings' })
    assert.deepEqual(systemRequests.map((request) => `${request.method} ${request.url}`), [
      'GET /gateway/api/v1/models?capability=audio_generation&operation=music_generation&target_output=audio&resolve_intent=true',
      'GET /gateway/api/v1/models?capability=audio_generation&operation=music_generation',
      'POST /gateway/api/v1/jobs',
      'GET /gateway/api/v1/jobs/701',
      'GET /gateway/api/v1/jobs/701',
    ])
  } finally {
    restoreEnv('MOVSCRIPT_HOME', previousHome)
    restoreEnv('MOVSCRIPT_DATA_SERVICE_URL', previousDataServiceURL)
  }
})

test('artifact MCP tools run through shared command runner with CLI debug metadata', async () => {
  const previousHome = process.env.MOVSCRIPT_HOME
  const previousDataServiceURL = process.env.MOVSCRIPT_DATA_SERVICE_URL
  delete process.env.MOVSCRIPT_DATA_SERVICE_URL
  systemRequests = []
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-artifact-mcp-home-'))
  try {
    mkdirSync(join(homeDir, 'runtime', 'endpoints'), { recursive: true })
    writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.local-node.gateway.json'), JSON.stringify({
      serviceName: 'movscript.local-node.gateway',
      applicationId: 'movscript.local-node',
      status: 'ready',
      baseURL: `${baseURL}/gateway`,
    }), 'utf8')
    process.env.MOVSCRIPT_HOME = homeDir

    const streamResponse = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'artifact-get-stream',
      method: 'tools/call',
      params: {
        name: 'system_artifact_get_stream',
        arguments: { homeDir, streamId: 41 },
      },
    })
    assert.equal(streamResponse?.error, undefined)
    assert.equal(streamResponse.result.status, 'ok')
    assert.equal(streamResponse.result.stream_id, 41)
    assert.equal(streamResponse.result.manifest_url, 'https://cdn.example/stream.m3u8')
    assert.deepEqual(streamResponse.result.debug.cli_argv, [
      'movscript',
      'artifact',
      'get-stream',
      '--json',
      '--home-dir',
      homeDir,
      '--stream-id',
      '41',
    ])
    assert.deepEqual(systemRequests.map((request) => `${request.method} ${request.url}`), [
      'GET /gateway/api/v1/media/streams/41',
    ])
  } finally {
    restoreEnv('MOVSCRIPT_HOME', previousHome)
    restoreEnv('MOVSCRIPT_DATA_SERVICE_URL', previousDataServiceURL)
  }
})

test('system resource and shot query MCP tools run through shared command runner', async () => {
  const previousHome = process.env.MOVSCRIPT_HOME
  const previousDataServiceURL = process.env.MOVSCRIPT_DATA_SERVICE_URL
  delete process.env.MOVSCRIPT_DATA_SERVICE_URL
  systemRequests = []
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-system-query-home-'))
  try {
    mkdirSync(join(homeDir, 'runtime', 'endpoints'), { recursive: true })
    writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.local-node.gateway.json'), JSON.stringify({
      serviceName: 'movscript.local-node.gateway',
      applicationId: 'movscript.local-node',
      status: 'ready',
      baseURL: `${baseURL}/gateway`,
    }), 'utf8')
    process.env.MOVSCRIPT_HOME = homeDir

    const projectCreateResponse = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'system-project-create',
      method: 'tools/call',
      params: {
        name: 'system_project_create',
        arguments: {
          homeDir,
          name: 'Launch Film',
          description: 'Campaign launch',
          total_episodes: 1,
        },
      },
    })
    assert.equal(projectCreateResponse?.error, undefined)
    assert.equal(projectCreateResponse.result.status, 'created')
    assert.equal(projectCreateResponse.result.project.id, 42)
    assert.deepEqual(projectCreateResponse.result.debug.cli_argv, [
      'movscript',
      'project',
      'create',
      '--json',
      '--home-dir',
      homeDir,
      '--name',
      'Launch Film',
      '--description',
      'Campaign launch',
      '--total-episodes',
      '1',
    ])

    const resourceResponse = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'system-resource-query',
      method: 'tools/call',
      params: {
        name: 'system_resource_library_query',
        arguments: { homeDir, query: 'hero', page: 2, page_size: 1 },
      },
    })
    assert.equal(resourceResponse?.error, undefined)
    assert.equal(resourceResponse.result.count, 1)
    assert.equal(resourceResponse.result.items[0].ID, 101)
    assert.deepEqual(resourceResponse.result.debug.cli_argv, [
      'movscript',
      'resource',
      'library',
      'query',
      '--json',
      '--home-dir',
      homeDir,
      '--query',
      'hero',
      '--page',
      '2',
      '--page-size',
      '1',
    ])

    const annotationDir = mkdtempSync(join(tmpdir(), 'movscript-mcp-annotation-'))
    const annotationPath = join(annotationDir, 'annotated.svg')
    const sourceSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#ffffff"/></svg>'
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(sourceSVG).toString('base64')}`
    const annotationResponse = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'system-resource-annotate',
      method: 'tools/call',
      params: {
        name: 'system_resource_image_annotate',
        arguments: {
          homeDir,
          data_url: dataUrl,
          annotations: [{ type: 'rect', x: 20, y: 24, width: 120, height: 64, color: '#ef4444' }],
          width: 320,
          height: 180,
          title: 'MCP Annotation',
          output_path: annotationPath,
        },
      },
    })
    assert.equal(annotationResponse?.error, undefined)
    assert.equal(annotationResponse.result.data.status, 'annotated')
    assert.equal(annotationResponse.result.data.artifact_path, annotationPath)
    assert.equal(annotationResponse.result.data.annotation_count, 1)
    assert.equal(existsSync(annotationPath), true)
    assert.match(readFileSync(annotationPath, 'utf8'), /MCP Annotation/)
    assert.deepEqual(annotationResponse.result.debug.cli_argv, [
      'movscript',
      'resource',
      'image',
      'annotate',
      '--json',
      '--home-dir',
      homeDir,
      '--title',
      'MCP Annotation',
      '--data-url',
      '<redacted>',
      '--width',
      '320',
      '--height',
      '180',
      '--output-path',
      annotationPath,
      '--annotations',
      '<json>',
    ])

    const sourceResponse = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'system-external-source-list',
      method: 'tools/call',
      params: {
        name: 'system_external_resource_source_list',
        arguments: { homeDir },
      },
    })
    assert.equal(sourceResponse?.error, undefined)
    assert.equal(sourceResponse.result.count, 1)
    assert.equal(sourceResponse.result.items[0].ID, 7)

    const externalSearchResponse = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'system-external-search',
      method: 'tools/call',
      params: {
        name: 'system_external_resource_search',
        arguments: {
          homeDir,
          source_id: 7,
          query: 'city',
          media_type: 'video',
          orientation: 'landscape',
          limit: 2,
        },
      },
    })
    assert.equal(externalSearchResponse?.error, undefined)
    assert.equal(externalSearchResponse.result.source_id, 7)
    assert.equal(externalSearchResponse.result.count, 1)
    assert.deepEqual(externalSearchResponse.result.debug.cli_argv, [
      'movscript',
      'external-resource',
      'search',
      '--json',
      '--home-dir',
      homeDir,
      '--query',
      'city',
      '--source-id',
      '7',
      '--media-type',
      'video',
      '--orientation',
      'landscape',
      '--limit',
      '2',
    ])

    const shotQueryResponse = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'system-shot-query',
      method: 'tools/call',
      params: {
        name: 'system_shot_library_query',
        arguments: { homeDir, query: 'push', group_id: 3, limit: 1 },
      },
    })
    assert.equal(shotQueryResponse?.error, undefined)
    assert.equal(shotQueryResponse.result.count, 1)
    assert.equal(shotQueryResponse.result.items[0].ID, 301)
    assert.deepEqual(shotQueryResponse.result.debug.cli_argv, [
      'movscript',
      'shot',
      'library',
      'query',
      '--json',
      '--home-dir',
      homeDir,
      '--query',
      'push',
      '--group-id',
      '3',
      '--limit',
      '1',
    ])

    const shotGroupResponse = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'system-shot-group',
      method: 'tools/call',
      params: {
        name: 'system_shot_group_get',
        arguments: { homeDir, group_id: 3 },
      },
    })
    assert.equal(shotGroupResponse?.error, undefined)
    assert.equal(shotGroupResponse.result.group_id, 3)
    assert.equal(shotGroupResponse.result.count, 1)
    assert.deepEqual(shotGroupResponse.result.debug.cli_argv, [
      'movscript',
      'shot',
      'group',
      'get',
      '--json',
      '--home-dir',
      homeDir,
      '--group-id',
      '3',
    ])

    const shotGroupCreateResponse = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'system-shot-group-create',
      method: 'tools/call',
      params: {
        name: 'system_shot_group_create',
        arguments: {
          homeDir,
          resource_id: 101,
          title: 'New Reference Shots',
          summary: 'Reusable manual cuts',
          cut_strategy: 'manual_review',
        },
      },
    })
    assert.equal(shotGroupCreateResponse?.error, undefined)
    assert.equal(shotGroupCreateResponse.result.status, 'created')
    assert.equal(shotGroupCreateResponse.result.group_id, 4)
    assert.deepEqual(shotGroupCreateResponse.result.debug.cli_argv, [
      'movscript',
      'shot',
      'group',
      'create',
      '--json',
      '--home-dir',
      homeDir,
      '--summary',
      'Reusable manual cuts',
      '--title',
      'New Reference Shots',
      '--cut-strategy',
      'manual_review',
      '--resource-id',
      '101',
    ])

    const shotGroupAddResponse = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'system-shot-group-add',
      method: 'tools/call',
      params: {
        name: 'system_shot_group_add_shots',
        arguments: {
          homeDir,
          group_id: 3,
          resource_id: 101,
          duration_sec: 2.4,
          width: 1920,
          height: 1080,
          shots: [{ title: 'Manual cut', start_sec: 0, end_sec: 2.4 }],
        },
      },
    })
    assert.equal(shotGroupAddResponse?.error, undefined)
    assert.equal(shotGroupAddResponse.result.status, 'created')
    assert.equal(shotGroupAddResponse.result.group_id, 3)
    assert.equal(shotGroupAddResponse.result.count, 1)
    assert.deepEqual(shotGroupAddResponse.result.debug.cli_argv, [
      'movscript',
      'shot',
      'group',
      'add-shots',
      '--json',
      '--home-dir',
      homeDir,
      '--resource-id',
      '101',
      '--group-id',
      '3',
      '--width',
      '1920',
      '--height',
      '1080',
      '--duration-sec',
      '2.4',
      '--shots',
      '<json>',
    ])

    const createdGroupRequest = systemRequests.find((request) => request.method === 'POST' && request.url === '/gateway/api/v1/shot-reference-groups')
    assert.deepEqual(createdGroupRequest?.body, {
      resource_id: 101,
      title: 'New Reference Shots',
      summary: 'Reusable manual cuts',
      cut_strategy: 'manual_review',
    })
    const addShotsRequest = systemRequests.find((request) => request.method === 'POST' && request.url === '/gateway/api/v1/shot-references/from-resource')
    assert.deepEqual(addShotsRequest?.body, {
      resource_id: 101,
      group_id: 3,
      duration_sec: 2.4,
      width: 1920,
      height: 1080,
      shots: [{
        title: 'Manual cut',
        start_sec: 0,
        start_sec_set: true,
        end_sec: 2.4,
        end_sec_set: true,
      }],
    })

    assert.deepEqual(systemRequests.map((request) => `${request.method} ${request.url}`), [
      'POST /gateway/api/v1/projects',
      'GET /gateway/api/v1/resources?page=2&page_size=1&q=hero',
      'GET /gateway/api/v1/external-resource-sources',
      'GET /gateway/api/v1/external-resources/search?source_id=7&q=city&page=1&page_size=2&media_type=video&orientation=landscape',
      'GET /gateway/api/v1/shot-references?page=1&page_size=1&q=push&group_id=3',
      'GET /gateway/api/v1/shot-reference-groups/3',
      'POST /gateway/api/v1/shot-reference-groups',
      'GET /gateway/api/v1/shot-reference-groups/3',
      'POST /gateway/api/v1/shot-references/from-resource',
    ])
  } finally {
    restoreEnv('MOVSCRIPT_HOME', previousHome)
    restoreEnv('MOVSCRIPT_DATA_SERVICE_URL', previousDataServiceURL)
  }
})

test('runtimeStatus reads MovScript Home data-service endpoint before default local backend', async () => {
  const previousDesktopEndpoint = process.env.MOVSCRIPT_MCP_ENDPOINT
  process.env.MOVSCRIPT_MCP_ENDPOINT = `${baseURL}/not-desktop`
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-home-'))
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-project-'))
  try {
    mkdirSync(join(homeDir, 'runtime', 'endpoints'), { recursive: true })
    writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.data.service.json'), JSON.stringify({
      serviceName: 'movscript.data.service',
      status: 'ready',
      baseURL,
    }), 'utf8')
    writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.media.pipeline.json'), JSON.stringify({
      serviceName: 'movscript.media.pipeline',
      status: 'ready',
      url: `${baseURL}/media-pipeline`,
    }), 'utf8')
    writeFileSync(join(projectDir, 'project.json'), JSON.stringify({ title: 'Runtime Project' }), 'utf8')

    const status = await runtimeStatus({
      homeDir,
      workspaceDir: projectDir,
      projectDir,
      timeoutMs: 500,
    })

    assert.equal(status.backend.local.baseURL, baseURL)
    assert.equal(status.backend.local.available, true)
    assert.equal(status.backend.local.discoveredFromHome, true)
    assert.equal(status.home.homeDir, homeDir)
    assert.equal(status.home.endpoints.some((endpoint) => endpoint.serviceName === 'movscript.data.service'), true)
    assert.equal(status.mediaPipeline.available, true)
    assert.equal(status.mediaPipeline.endpoint, `${baseURL}/media-pipeline`)
    assert.equal(status.surfaceHost.available, false)
    assert.equal(status.surfaces.available, false)
    assert.equal(status.surfaces.openable, false)
    assert.equal(status.surfaces.startupAllowed, true)
    assert.equal(status.surface, undefined)
    assert.equal(status.runtimeOwner.kind, 'external_local')
    assert.equal(status.runtimeOwner.businessSidecarStartupAllowed, true)
    assert.equal(status.runtimeOwner.surfaceHostStartupAllowed, true)
  } finally {
    restoreEnv('MOVSCRIPT_MCP_ENDPOINT', previousDesktopEndpoint)
  }
})

test('runtimeStatus marks Desktop as legacy owner when no local daemon is ready', async () => {
  const previousDesktopEndpoint = process.env.MOVSCRIPT_MCP_ENDPOINT
  delete process.env.MOVSCRIPT_MCP_ENDPOINT
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-home-'))
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-project-'))
  try {
    mkdirSync(join(homeDir, 'runtime', 'apps'), { recursive: true })
    writeFileSync(join(homeDir, 'runtime', 'apps', 'movscript.desktop.json'), JSON.stringify({
      applicationId: 'movscript.desktop',
      status: 'ready',
      endpoint: {
        protocol: 'http',
        url: `${baseURL}/mcp`,
      },
    }), 'utf8')
    mkdirSync(join(homeDir, 'runtime', 'endpoints'), { recursive: true })
    writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.media.pipeline.json'), JSON.stringify({
      serviceName: 'movscript.media.pipeline',
      status: 'ready',
      url: `${baseURL}/media-pipeline`,
    }), 'utf8')
    writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.local-surface.host.json'), JSON.stringify({
      serviceName: 'movscript.local-surface.host',
      applicationId: 'movscript.agent-plugin',
      status: 'ready',
      url: `${baseURL}/surface`,
    }), 'utf8')
    writeFileSync(join(projectDir, 'project.json'), JSON.stringify({ title: 'Desktop Runtime Project' }), 'utf8')

    const status = await runtimeStatus({
      homeDir,
      workspaceDir: projectDir,
      projectDir,
      surfaceProjectKey: 'route-project-7',
      scopeKind: 'episode',
      scopeRef: 'episode_01',
      timeoutMs: 500,
    })

    assert.equal(status.desktop.available, true)
    assert.equal(status.desktop.discoveredFromHome, true)
    assert.equal(status.desktop.mediaPipeline, true)
    assert.equal(status.desktop.mediaPipelineEndpoint, `${baseURL}/media-pipeline`)
    assert.equal(status.mediaPipeline.available, true)
    assert.equal(status.surfaceHost.available, true)
    assert.equal(status.surfaceHost.endpoint, `${baseURL}/surface`)
    assert.equal(status.surfaceHost.ownerApplicationId, 'movscript.agent-plugin')
    assert.equal(status.surfaceHost.mode, 'agent-plugin-session')
    assert.equal(status.surfaces.available, true)
    assert.equal(status.surfaces.openable, true)
    assert.equal(status.surfaces.reason, 'local_surface_host_ready')
    assert.equal(status.surface.kind, 'browser_url')
    assert.equal(status.surface.surface, 'project.overview')
    const surfaceURL = new URL(status.surface.url)
    assert.equal(surfaceURL.pathname, '/surface/studio/route-project-7/overview')
    assert.equal(surfaceURL.searchParams.get('projectKey'), 'route-project-7')
    assert.equal(surfaceURL.searchParams.get('projectId'), 'route-project-7')
    assert.equal(surfaceURL.searchParams.get('projectDir'), projectDir)
    assert.equal(surfaceURL.searchParams.get('scopeKind'), 'episode')
    assert.equal(surfaceURL.searchParams.get('scopeRef'), 'episode_01')
    assert.equal(surfaceURL.searchParams.get('targetKind'), null)
    assert.equal(surfaceURL.searchParams.get('targetRef'), null)
    assert.equal(surfaceURL.searchParams.get('productionId'), null)
    assert.equal(status.surfaces.urls.canvas, `${baseURL}/surface/canvases?source=runtime-status`)
    assert.equal(status.secondary_surfaces.some((surface) => surface.surface === 'admin.overview'), true)
    assert.equal(status.runtimeOwner.kind, 'desktop_legacy_owner')
    assert.equal(status.runtimeOwner.sidecarStartupAllowed, false)
    assert.equal(status.runtimeOwner.businessSidecarStartupAllowed, false)
    assert.equal(status.runtimeOwner.surfaceHostStartupAllowed, false)
  } finally {
    restoreEnv('MOVSCRIPT_MCP_ENDPOINT', previousDesktopEndpoint)
  }
})

test('runtimeStatus recognizes timeline source collection without legacy productions directory', async () => {
  const previousDesktopEndpoint = process.env.MOVSCRIPT_MCP_ENDPOINT
  process.env.MOVSCRIPT_MCP_ENDPOINT = `${baseURL}/not-desktop`
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-home-'))
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-project-'))
  try {
    mkdirSync(join(homeDir, 'runtime', 'endpoints'), { recursive: true })
    writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.local-surface.host.json'), JSON.stringify({
      serviceName: 'movscript.local-surface.host',
      applicationId: 'movscript.agent-plugin',
      status: 'ready',
      url: `${baseURL}/surface`,
    }), 'utf8')
    mkdirSync(join(projectDir, 'timeline', 'episode_01'), { recursive: true })

    const status = await runtimeStatus({
      homeDir,
      workspaceDir: projectDir,
      projectDir,
      timeoutMs: 500,
    })

    assert.equal(status.workspace.isMovScriptProject, true)
    assert.equal(status.workspace.hasMetadata, false)
    assert.deepEqual(status.workspace.sourceCollections, ['timeline'])
    assert.deepEqual(status.workspace.sourceRootFiles, [])
    assert.equal(status.surfaces.available, true)
    assert.equal(status.surface.surface, 'project.overview')
    assert.match(status.surface.url, new RegExp(`^${escapeRegExp(baseURL)}/surface/studio/`))
  } finally {
    restoreEnv('MOVSCRIPT_MCP_ENDPOINT', previousDesktopEndpoint)
  }
})

test('runtimeStatus prefers the local daemon as runtime owner when daemon control is registered', async () => {
  const previousDesktopEndpoint = process.env.MOVSCRIPT_MCP_ENDPOINT
  process.env.MOVSCRIPT_MCP_ENDPOINT = `${baseURL}/not-desktop`
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-home-'))
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-project-'))
  try {
    mkdirSync(join(homeDir, 'runtime', 'endpoints'), { recursive: true })
    writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.local-node.control.json'), JSON.stringify({
      serviceName: 'movscript.local-node.control',
      status: 'ready',
      ready: true,
      url: `${baseURL}/local-daemon-control`,
    }), 'utf8')
    writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.local-node.gateway.json'), JSON.stringify({
      serviceName: 'movscript.local-node.gateway',
      applicationId: 'movscript.local-node',
      status: 'ready',
      ready: true,
      url: `${baseURL}/gateway`,
    }), 'utf8')
    writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.data.service.json'), JSON.stringify({
      serviceName: 'movscript.data.service',
      status: 'ready',
      ready: true,
      baseURL,
    }), 'utf8')
    writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.local-surface.host.json'), JSON.stringify({
      serviceName: 'movscript.local-surface.host',
      applicationId: 'movscript.local-node',
      status: 'ready',
      ready: true,
      url: `${baseURL}/surface`,
    }), 'utf8')
    writeFileSync(join(projectDir, 'project.json'), JSON.stringify({ title: 'Daemon Runtime Project' }), 'utf8')

    const status = await runtimeStatus({
      homeDir,
      workspaceDir: projectDir,
      projectDir,
      timeoutMs: 500,
    })

    assert.equal(status.localDaemon.available, true)
    assert.equal(status.localDaemon.endpoint, `${baseURL}/local-daemon-control`)
    assert.equal(status.localNode.available, true)
    assert.equal(status.backend.local.baseURL, `${baseURL}/gateway`)
    assert.equal(status.backend.local.gatewayBaseURL, `${baseURL}/gateway`)
    assert.equal(status.backend.local.dataServiceBaseURL, baseURL)
    assert.equal(status.surfaceHost.serviceName, 'movscript.local-node.gateway')
    assert.equal(status.surfaceHost.surfaceHostServiceName, 'movscript.local-surface.host')
    assert.equal(status.surfaceHost.endpoint, `${baseURL}/gateway`)
    assert.equal(status.surfaceHost.ownerApplicationId, 'movscript.local-node')
    assert.equal(status.surfaceHost.mode, 'local-daemon')
    assert.match(status.surface.url, new RegExp(`^${escapeRegExp(baseURL)}/gateway/studio/`))
    assert.equal(status.runtimeOwner.kind, 'local_daemon')
    assert.equal(status.runtimeOwner.applicationId, 'movscript.local-node')
    assert.equal(status.runtimeOwner.businessSidecarStartupAllowed, false)
    assert.equal(status.runtimeOwner.surfaceHostStartupAllowed, false)
    assert.equal(status.runtimeOwner.sidecarStartupAllowed, false)
  } finally {
    restoreEnv('MOVSCRIPT_MCP_ENDPOINT', previousDesktopEndpoint)
  }
})

test('system MCP tools bind to MovScript Home daemon gateway before calling shared command runner', async () => {
  const previousHome = process.env.MOVSCRIPT_HOME
  const previousWorkspace = process.env.MOVSCRIPT_WORKSPACE_DIR
  const previousDataServiceURL = process.env.MOVSCRIPT_DATA_SERVICE_URL
  delete process.env.MOVSCRIPT_DATA_SERVICE_URL
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-home-'))
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-project-'))
  try {
    mkdirSync(join(homeDir, 'runtime', 'endpoints'), { recursive: true })
    writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.local-node.gateway.json'), JSON.stringify({
      serviceName: 'movscript.local-node.gateway',
      applicationId: 'movscript.local-node',
      status: 'ready',
      baseURL,
    }), 'utf8')
    writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.data.service.json'), JSON.stringify({
      serviceName: 'movscript.data.service',
      status: 'ready',
      baseURL: `${baseURL}/data-service-should-not-be-used`,
    }), 'utf8')
    writeFileSync(join(projectDir, 'project.json'), JSON.stringify({ title: 'Runtime Project' }), 'utf8')
    process.env.MOVSCRIPT_HOME = homeDir
    process.env.MOVSCRIPT_WORKSPACE_DIR = projectDir

    const response = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'models',
      method: 'tools/call',
      params: {
        name: 'system_model_list',
        arguments: { capability: 'image_generation', operation: 'text_to_image' },
      },
    })

    assert.equal(response?.error, undefined)
    const payload = response.result
    assert.equal(payload.count, 1)
    assert.equal(payload.models[0].model_id, 'gpt-image-2')
    assert.equal(payload.debug.runtime_endpoint, baseURL)
    assert.deepEqual(payload.debug.cli_argv, [
      'movscript',
      'system',
      'model',
      'list',
      '--json',
      '--capability',
      'image_generation',
      '--operation',
      'text_to_image',
    ])
  } finally {
    restoreEnv('MOVSCRIPT_HOME', previousHome)
    restoreEnv('MOVSCRIPT_WORKSPACE_DIR', previousWorkspace)
    restoreEnv('MOVSCRIPT_DATA_SERVICE_URL', previousDataServiceURL)
  }
})

function restoreEnv(name, previousValue) {
  if (previousValue === undefined) delete process.env[name]
  else process.env[name] = previousValue
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function readRequestJSON(req, callback) {
  let body = ''
  req.setEncoding('utf8')
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => {
    callback(body ? JSON.parse(body) : {})
  })
}

function projectSourceOperationInput(body) {
  const { projectDir: _projectDir, ...input } = body
  return input
}

function writeJSON(res, payload, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

function createTestServer() {
  return createServer((req, res) => {
    const requestURL = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }
    if (req.url === '/gateway/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }
    if (req.url === '/gateway/v1/mcp' && req.method === 'POST') {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        const message = JSON.parse(body || '{}')
        mcpProxyRequests.push(message)
        if (message.method === 'tools/list') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              tools: [{
                name: 'daemon_reported_tool',
                description: 'Tool reported by daemon MCP endpoint.',
                inputSchema: { type: 'object', properties: {} },
              }],
            },
          }))
          return
        }
        if (message.method === 'tools/call') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              proxied: true,
              tool: message.params?.name,
            },
          }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} }))
      })
      return
    }
    if (req.url === '/gateway/v1/context/sessions' && req.method === 'POST') {
      readRequestJSON(req, (body) => {
        contextRequests.push({ method: req.method, url: req.url, body })
        writeJSON(res, {
          schema: 'movscript.context-envelope.v1',
          contextId: `${body.sessionId ?? 'desktop-current'}:1`,
          revision: 1,
          issuedAt: '2026-06-30T00:00:00.000Z',
          runtime: { owner: 'local-node', appId: 'movscript.local-node', gatewayPrefix: '/v1' },
          principal: { userId: '7', kind: 'cloud-user' },
          dataConnection: { kind: 'local', authMode: 'local-owner', status: 'connected', displayName: 'Local Data Plane' },
        }, 201)
      })
      return
    }
    if (req.url === '/mcp') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: 'runtime-status-desktop-probe', result: {} }))
      return
    }
    if (req.method === 'POST' && req.url === '/v1/project/source/inspect') {
      readRequestJSON(req, (body) => {
        projectRequests.push({ method: req.method, url: req.url, body })
        writeJSON(res, {
          inspection: {
            schema: 'movscript.workspace-inspection.v1',
            operation: 'inspect',
            readyToInterpret: false,
            issues: [{
              path: 'project.json',
              severity: 'error',
              message: 'missing schema field',
            }],
            summary: { errors: 1, warnings: 0 },
          },
        })
      })
      return
    }
    if (req.method === 'POST' && req.url === '/v1/project/locator/resolve') {
      readRequestJSON(req, (body) => {
        projectRequests.push({ method: req.method, url: req.url, body })
        writeJSON(res, {
          locator: {
            workspaceDir: body.workspaceDir,
            projectDir: body.projectDir,
            projectUid: body.projectUid,
            projectTitle: 'MCP Workspace Project',
          },
        })
      })
      return
    }
    if (req.method === 'POST' && req.url === '/v1/project/productions/editing-workspaces/list') {
      readRequestJSON(req, (body) => {
        projectRequests.push({ method: req.method, url: req.url, body })
        writeJSON(res, {
          schema: 'movscript.production_editing_workspaces_list.v1',
          status: 'ok',
          productionId: body.input?.productionId,
          production_id: body.input?.production_id,
          workspaces: [{
            workspaceId: 'remotion_title_v1',
            workspace_id: 'remotion_title_v1',
            productionId: body.input?.productionId,
            production_id: body.input?.production_id,
            kind: 'remotion',
            title: 'Remotion Title',
          }],
          pagination: { page: 1, pageSize: 50, page_size: 50, total: 1, total_unfiltered: 1, hasNextPage: false, has_next_page: false },
        })
      })
      return
    }
    if (req.method === 'POST' && req.url === '/api/v1/projects/ensure') {
      readRequestJSON(req, (body) => {
        projectRequests.push({ method: req.method, url: req.url, body })
        writeJSON(res, {
          project: {
            project_uid: body.project_uid,
            name: body.name,
          },
        })
      })
      return
    }
    if (req.method === 'POST' && req.url === '/api/v1/project-data/spaces') {
      readRequestJSON(req, (body) => {
        projectRequests.push({ method: req.method, url: req.url, body })
        writeJSON(res, {
          data_space: {
            project_uid: body.project_uid,
            title: body.title,
          },
        })
      })
      return
    }
    if (req.method === 'POST' && req.url === '/v1/project/source/interpret') {
      readRequestJSON(req, (body) => {
        projectRequests.push({ method: req.method, url: req.url, body })
        writeJSON(res, {
          interpretation: {
            schema: 'movscript.workspace-interpret-result.v1',
            operation: 'interpret',
            status: 'refreshed',
            review: {
              schema: 'movscript.workspace-inspection.v1',
              readyToInterpret: true,
            },
            manifest: {
              output: {
                editorStatePath: '.interpret/current/editor-state.json',
              },
            },
          },
        })
      })
      return
    }
    if (req.method === 'POST' && req.url === '/v1/project/source/overview') {
      readRequestJSON(req, (body) => {
        projectRequests.push({ method: req.method, url: req.url, body })
        writeJSON(res, {
          overview: {
            schema: 'movscript.workspace-overview.v1',
            status: 'ready',
            summary: { issues: 0 },
          },
        })
      })
      return
    }
    if (req.method === 'POST' && req.url === '/v1/project/entities/query') {
      readRequestJSON(req, (body) => {
        projectRequests.push({ method: req.method, url: req.url, body })
        writeJSON(res, {
          result: {
            schema: 'movscript.project-entities-query-result.v1',
            query: body.query,
            items: [{ entityKind: body.query?.entityKind, id: 'cu_hero' }],
          },
        })
      })
      return
    }
    if (req.method === 'POST' && req.url === '/v1/project/resources/view') {
      readRequestJSON(req, (body) => {
        projectRequests.push({ method: req.method, url: req.url, body })
        writeJSON(res, {
          schema: 'movscript.project-resource-view.v1',
          projectDir: body.projectDir,
          kind: body.kind,
          items: [{
            schema: 'movscript.project_context_snapshot.v1',
            kind: 'project_context_snapshot',
            style_reference_resource_ids: [101],
          }],
        })
      })
      return
    }
    if (req.method === 'POST' && req.url === '/v1/project/source/regeneration-plan') {
      readRequestJSON(req, (body) => {
        projectRequests.push({ method: req.method, url: req.url, body })
        writeJSON(res, {
          regenerationPlan: {
            schema: 'movscript.workspace-regeneration-plan.v1',
            status: 'ready',
            affected_content_units: ['cu_hero'],
          },
        })
      })
      return
    }
    if (req.method === 'POST' && req.url === '/v1/project/source/production-work-plan') {
      readRequestJSON(req, (body) => {
        projectRequests.push({ method: req.method, url: req.url, body })
        writeJSON(res, {
          productionWorkPlan: {
            schema: 'movscript.production_work_plan.v1',
            items: [{ id: 'work_hero', target: 'content_unit:cu_hero' }],
          },
        })
      })
      return
    }
    if (req.method === 'POST' && req.url === '/v1/project/scripts/source/read') {
      readRequestJSON(req, (body) => {
        projectRequests.push({ method: req.method, url: req.url, body })
        writeJSON(res, {
          result: {
            schema: 'movscript.project-source-operation-result.v1',
            endpoint: req.url,
            sourceText: '# Script',
            input: projectSourceOperationInput(body),
          },
        })
      })
      return
    }
    if (req.method === 'POST' && [
      '/v1/project/standards/upsert',
      '/v1/project/settings/create',
      '/v1/project/content-units/edit-prompt/update',
      '/v1/project/entities/delete',
    ].includes(req.url)) {
      readRequestJSON(req, (body) => {
        projectRequests.push({ method: req.method, url: req.url, body })
        writeJSON(res, {
          result: req.url === '/v1/project/entities/delete'
            ? undefined
            : {
                schema: 'movscript.project-source-operation-result.v1',
                endpoint: req.url,
                status: 'ok',
                input: projectSourceOperationInput(body),
                writtenPaths: ['source.json'],
              },
        })
      })
      return
    }
    if (req.method === 'POST' && req.url === '/v1/project/content-candidates/create') {
      readRequestJSON(req, (body) => {
        projectRequests.push({ method: req.method, url: req.url, body })
        writeJSON(res, {
          schema: 'movscript.project-content-candidate-create.v1',
          projectDir: body.projectDir,
          result: {
            record: {
              id: body.input?.candidateId,
              content_unit_id: body.input?.contentUnitId,
              outputs: body.input?.outputs,
            },
          },
        })
      })
      return
    }
    if (req.method === 'POST' && req.url === '/v1/editing/project/command') {
      readRequestJSON(req, (body) => {
        editingRequests.push({ method: req.method, url: req.url, body })
        if (body.command === 'createProject') {
          writeJSON(res, {
            schema: 'movscript.editing-project-command-result.v1',
            command: body.command,
            result: {
              status: 'ok',
              editing_project: sampleCreatedEditingProject(body.input ?? {}, 'manual'),
            },
          })
          return
        }
        if (body.command === 'saveProject') {
          const editingProject = body.input?.editingProject
          writeJSON(res, {
            schema: 'movscript.editing-project-command-result.v1',
            command: body.command,
            result: {
              status: 'saved',
              editingProject,
              editing_project: editingProject,
            },
          })
          return
        }
        if (body.command === 'addClip') {
          writeJSON(res, {
            schema: 'movscript.editing-project-command-result.v1',
            command: body.command,
            result: {
              status: 'updated',
              clip: body.input?.clip,
            },
          })
          return
        }
        writeJSON(res, {
          schema: 'movscript.editing-project-command-result.v1',
          command: body.command,
          result: {
            valid: true,
            diagnostics: [],
          },
        })
      })
      return
    }
    if (req.method === 'POST' && req.url === '/v1/editing/task/action') {
      readRequestJSON(req, (body) => {
        editingRequests.push({ method: req.method, url: req.url, body })
        if (body.action === 'saveLocalExport' && body.input?.outputPath) {
          writeJSON(res, {
            schema: 'movscript.editing-task-action.v1',
            action: body.action,
            status: 'result',
            result: {
              status: 'ok',
              outputPath: body.input.outputPath,
              output_path: body.input.outputPath,
              persisted: true,
              uploaded: false,
              candidate_created: false,
            },
          })
          return
        }
        writeJSON(res, {
          schema: 'movscript.editing-task-action.v1',
          action: body.action,
          request: {
            action: body.action,
            taskId: body.input?.taskId ?? body.input?.task_id,
            options: {
              projectId: body.input?.mediaProjectId ?? body.input?.media_project_id ?? body.input?.projectId ?? body.input?.project_id,
            },
          },
        })
      })
      return
    }
    if (req.method === 'POST' && req.url === '/v1/editing/task/request') {
      readRequestJSON(req, (body) => {
        editingRequests.push({ method: req.method, url: req.url, body })
        writeJSON(res, {
          schema: 'movscript.editing-task-request.v1',
          taskType: body.taskType,
          request: sampleMediaPipelineTaskRequest(body.taskType, body.input ?? {}),
        })
      })
      return
    }
    if (req.method === 'POST' && req.url === '/v1/media-pipeline/task/create') {
      readRequestJSON(req, (body) => {
        mediaPipelineRequests.push({ method: req.method, url: req.url, body })
        const request = body.request ?? {}
        writeJSON(res, {
          schema: 'movscript.media-pipeline-task-create.v1',
          task: sampleMediaPipelineTask(`task_${request.taskType}`, request.projectId, 'queued', request.taskType),
        })
      })
      return
    }
    if (req.method === 'POST' && req.url === '/v1/media-pipeline/task/action') {
      readRequestJSON(req, (body) => {
        mediaPipelineRequests.push({ method: req.method, url: req.url, body })
        writeJSON(res, {
          schema: 'movscript.media-pipeline-task-action.v1',
          action: body.action,
          task: sampleMediaPipelineTask(body.taskId, body.options?.projectId, body.action === 'cancelTask' ? 'canceled' : 'running'),
        })
      })
      return
    }
    if (req.method === 'GET'
      && (requestURL.pathname === '/api/v1/models' || requestURL.pathname === '/gateway/api/v1/models')
      && requestURL.searchParams.get('capability') === 'image_generation') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify([{
        id: 1,
        model_id: 'gpt-image-2',
        display_name: 'GPT Image 2',
        capabilities: ['image_generation'],
      }]))
      return
    }
    if (req.method === 'GET'
      && requestURL.pathname === '/gateway/api/v1/models'
      && requestURL.searchParams.get('capability') === 'audio_generation'
      && requestURL.searchParams.get('operation') === 'music_generation') {
      systemRequests.push({ method: req.method, url: req.url })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify([{
        id: 51,
        model_id: 'audio:music',
        display_name: 'Music Model',
        capabilities: ['audio_generation'],
        supported_params: [
          { key: 'style', type: 'string' },
        ],
      }]))
      return
    }
    if (req.url === '/gateway/api/v1/jobs' && req.method === 'POST') {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        systemRequests.push({ method: req.method, url: req.url, body: JSON.parse(body || '{}') })
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          ID: 701,
          status: 'queued',
        }))
      })
      return
    }
    if (req.url === '/gateway/api/v1/jobs/701' && req.method === 'GET') {
      systemRequests.push({ method: req.method, url: req.url })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        ID: 701,
        status: 'succeeded',
        output_resource_id: 880,
      }))
      return
    }
    if (req.url === '/gateway/api/v1/media/streams/41' && req.method === 'GET') {
      systemRequests.push({ method: req.method, url: req.url })
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
    if (req.url === '/gateway/api/v1/admin/providers' && req.method === 'GET') {
      adminRequests.push({ method: req.method, url: req.url })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ items: [{ provider_id: 'provider-main', display_name: 'Provider Main' }] }))
      return
    }
    if (req.url === '/gateway/api/v1/admin/settings/resource-access' && req.method === 'PUT') {
      adminRequests.push({ method: req.method, url: req.url })
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(body || '{}')
      })
      return
    }
    if (req.url === '/gateway/api/v1/model-gateway/api-keys/9' && req.method === 'DELETE') {
      adminRequests.push({ method: req.method, url: req.url })
      res.writeHead(204)
      res.end()
      return
    }
    if (req.url === '/gateway/api/v1/resource-access/check' && req.method === 'POST') {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        adminRequests.push({ method: req.method, url: req.url, body: JSON.parse(body || '{}') })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          resource_id: 880,
          media_type: 'image',
          transport: 'public_url',
          profile_id: 'public-tunnel',
          url: 'https://tunnel.example/api/v1/resource-access/resources/880/file?sig=redacted',
          expires_at: '2026-06-29T14:00:00Z',
          reachable: true,
          status_code: 200,
        }))
      })
      return
    }
    if (req.url === '/gateway/api/v1/projects' && req.method === 'POST') {
      systemRequests.push({ method: req.method, url: req.url })
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
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
    if (req.url === '/gateway/api/v1/resources?page=2&page_size=1&q=hero' && req.method === 'GET') {
      systemRequests.push({ method: req.method, url: req.url })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        page: 2,
        page_size: 1,
        total: 1,
        items: [{
          ID: 101,
          name: 'hero.png',
          type: 'image',
          url: 'https://cdn.example/hero.png',
        }],
      }))
      return
    }
    if (req.url === '/gateway/api/v1/external-resource-sources' && req.method === 'GET') {
      systemRequests.push({ method: req.method, url: req.url })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify([{
        ID: 7,
        name: 'Pexels',
        provider_key: 'pexels',
        priority: 10,
        is_enabled: true,
      }]))
      return
    }
    if (req.url === '/gateway/api/v1/external-resources/search?source_id=7&q=city&page=1&page_size=2&media_type=video&orientation=landscape' && req.method === 'GET') {
      systemRequests.push({ method: req.method, url: req.url })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        page: 1,
        page_size: 2,
        total: 1,
        provider: 'pexels',
        source_name: 'Pexels',
        items: [{
          provider_key: 'pexels',
          external_id: 'video-city-1',
          media_type: 'video',
          title: 'City Street',
        }],
      }))
      return
    }
    if (req.url === '/gateway/api/v1/shot-references?page=1&page_size=1&q=push&group_id=3' && req.method === 'GET') {
      systemRequests.push({ method: req.method, url: req.url })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        page: 1,
        page_size: 1,
        total: 1,
        items: [{
          ID: 301,
          title: 'Slow push in',
          summary: 'A slow push-in for tension.',
        }],
      }))
      return
    }
    if (req.url === '/gateway/api/v1/shot-reference-groups/3' && req.method === 'GET') {
      systemRequests.push({ method: req.method, url: req.url })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        group: {
          ID: 3,
          title: 'Reference Shots',
          source_resource_id: 101,
        },
        shots: [{
          ID: 301,
          title: 'Slow push in',
          summary: 'A slow push-in for tension.',
        }],
      }))
      return
    }
    if (req.url === '/gateway/api/v1/shot-reference-groups' && req.method === 'POST') {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        systemRequests.push({ method: req.method, url: req.url, body: JSON.parse(body || '{}') })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          ID: 4,
          title: 'New Reference Shots',
          summary: 'Reusable manual cuts',
          source_resource_id: 101,
        }))
      })
      return
    }
    if (req.url === '/gateway/api/v1/shot-references/from-resource' && req.method === 'POST') {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        systemRequests.push({ method: req.method, url: req.url, body: JSON.parse(body || '{}') })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          items: [{
            ID: 302,
            title: 'Manual cut',
            start_sec: 0,
            end_sec: 2.4,
          }],
        }))
      })
      return
    }
    res.writeHead(404)
    res.end()
  })
}

function sampleEditingProject() {
  return {
    version: 1,
    id: 'edit_project_mcp_host',
    projectId: 'project_mcp_editing',
    title: 'MCP Editing Project',
    settings: {
      width: 1280,
      height: 720,
      fps: 24,
      background: '#000000',
    },
    assets: {
      version: 1,
      assets: [],
    },
    timeline: {
      version: 1,
      durationMs: 0,
      tracks: [],
    },
  }
}

function sampleCreatedEditingProject(input, sourceKind = 'edit_decisions') {
  const source = sourceKind === 'manual'
    ? { kind: 'manual' }
    : {
        kind: 'edit_decisions',
        editDecisionCount: input.editDecisions?.cuts?.length ?? input.edit_decisions?.cuts?.length ?? 0,
      }
  return {
    version: 1,
    id: 'edit_project_mcp_host',
    projectId: input.mediaProjectId ?? input.media_project_id ?? input.projectId ?? input.project_id ?? 'project_mcp_editing',
    title: input.title ?? 'MCP Compose Project',
    source,
    settings: {
      width: input.width ?? 1280,
      height: input.height ?? 720,
      fps: input.fps ?? 24,
      background: input.background ?? '#000000',
    },
    assets: {
      version: 1,
      assets: input.assetManifest?.assets ?? input.asset_manifest?.assets ?? [],
    },
    timeline: {
      version: 1,
      durationMs: 3000,
      tracks: [{
        id: 'track_primary_video',
        type: 'video',
        clips: [{
          id: 'clip_intro',
          assetId: 'clip_intro',
          timelineStartMs: 0,
          durationMs: 3000,
        }],
      }],
    },
  }
}

function sampleMediaPipelineTaskRequest(taskType, input) {
  const editingProject = input.editingProject ?? input.editing_project
  const projectId = input.projectId ?? input.project_id ?? editingProject?.projectId ?? 'project_mcp_editing'
  return {
    projectId,
    taskType,
    ...(editingProject ? { editingProject, timeline: editingProject.timeline } : {}),
    ...(input.source ? { source: input.source } : {}),
    output: {
      format: taskType === 'timeline_hls' ? 'hls' : 'mp4',
      ...(input.output ?? {}),
    },
  }
}

function sampleMediaPipelineTask(taskId, projectId, status, taskType = 'timeline_render') {
  return {
    taskId,
    projectId,
    taskType,
    status,
    progressPercent: status === 'canceled' ? 100 : 55,
    currentStep: status,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }
}
