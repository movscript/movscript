import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { handleMCPHostJSONRPC, listMCPHostTools, runtimeStatus } from '../dist/stdio.js'

let server
let baseURL
let adminRequests = []
let systemRequests = []
let mcpProxyRequests = []

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
  const tools = new Set(listMCPHostTools().map((tool) => tool.name))
  assert.equal(tools.has('runtime_daemon_ensure'), true)
  assert.equal(tools.has('runtime_daemon_start'), true)
  assert.equal(tools.has('runtime_daemon_status'), true)
  assert.equal(tools.has('runtime_daemon_configure'), true)
  assert.equal(tools.has('runtime_local_daemon_ensure'), true)
  assert.equal(tools.has('runtime_local_daemon_start'), true)
})

test('MCP host exposes current admin tools without deferred cloud file or usage policy tools', () => {
  const tools = new Set(listMCPHostTools().map((tool) => tool.name))
  assert.equal(tools.has('admin_provider_list'), true)
  assert.equal(tools.has('admin_provider_create'), true)
  assert.equal(tools.has('admin_model_catalog_list'), true)
  assert.equal(tools.has('admin_model_route_binding_create'), true)
  assert.equal(tools.has('admin_model_route_diagnose'), true)
  assert.equal(tools.has('admin_resource_access_settings_get'), true)
  assert.equal(tools.has('admin_public_tunnel_config_update'), true)
  assert.equal(tools.has('admin_resource_access_resolve_test'), true)
  assert.equal(tools.has('admin_resource_access_check_test'), true)
  assert.equal(tools.has('admin_generation_tools_settings_update'), true)
  assert.equal(tools.has('admin_model_gateway_key_list'), true)
  assert.equal(tools.has('admin_cloud_file_config_list'), false)
  assert.equal(tools.has('admin_cloud_file_config_create'), false)
  assert.equal(tools.has('admin_usage_policy_get'), false)
  assert.equal(tools.has('admin_usage_policy_update'), false)
})

test('MCP host exposes TimelineAssembly compile tools above editing backend tools', () => {
  const tools = new Set(listMCPHostTools().map((tool) => tool.name))
  assert.equal(tools.has('timeline_backend_capability_list'), true)
  assert.equal(tools.has('timeline_compile_manifest_create'), true)
  assert.equal(tools.has('timeline_backend_project_create'), true)
  assert.equal(tools.has('timeline_backend_conformance_report'), true)
  assert.equal(tools.has('editing_project_create_from_edit_decisions'), true)
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
    assert.deepEqual(businessResponse.result, {
      proxied: true,
      tool: 'admin_provider_list',
    })

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
    assert.deepEqual(mcpProxyRequests.map((request) => request.method), ['tools/list', 'tools/call'])
  } finally {
    restoreEnv('MOVSCRIPT_HOME', previousHome)
    restoreEnv('MOVSCRIPT_DAEMON_MCP_ENDPOINT', previousDaemonMCP)
  }
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
        arguments: { homeDir, capability: 'audio_music' },
      },
    })
    assert.equal(prepareResponse?.error, undefined)
    assert.equal(prepareResponse.result.status, 'ready')
    assert.equal(prepareResponse.result.capability, 'audio_music')
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
      'audio_music',
    ])

    const submitResponse = await handleLocalMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'generation-submit',
      method: 'tools/call',
      params: {
        name: 'generation_submit',
        arguments: {
          homeDir,
          capability: 'audio_music',
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
      'audio_music',
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
        arguments: { homeDir, jobId: 701, capability: 'audio_music', verbosity: 'summary' },
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
      'audio_music',
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
    assert.equal(jobCreateRequest?.body.job_type, 'audio_music')
    assert.equal(jobCreateRequest?.body.feature_key, 'electron.generation.music')
    assert.deepEqual(JSON.parse(jobCreateRequest?.body.extra_params), { style: 'minimal strings' })
    assert.deepEqual(systemRequests.map((request) => `${request.method} ${request.url}`), [
      'GET /gateway/api/v1/models?capability=audio_music',
      'GET /gateway/api/v1/models?capability=audio_generation&operation=music',
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
      'system',
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
      'system',
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
      'system',
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
      'system',
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
      'system',
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
      'system',
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
      'system',
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
      'system',
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
      'system',
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
      scopeKind: 'episode',
      scopeRef: 'episode_01',
      targetKind: 'timeline_assembly',
      targetRef: 'timeline_assembly:episode:episode_01',
      timelineAssemblyRef: 'timeline_assembly:episode:episode_01',
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
    assert.match(status.surface.url, new RegExp(`^${escapeRegExp(baseURL)}/surface/studio/`))
    assert.equal(new URL(status.surface.url).searchParams.get('projectDir'), projectDir)
    assert.equal(new URL(status.surface.url).searchParams.get('scopeKind'), 'episode')
    assert.equal(new URL(status.surface.url).searchParams.get('scopeRef'), 'episode_01')
    assert.equal(new URL(status.surface.url).searchParams.get('targetKind'), 'timeline_assembly')
    assert.equal(new URL(status.surface.url).searchParams.get('targetRef'), 'timeline_assembly:episode:episode_01')
    assert.equal(new URL(status.surface.url).searchParams.get('timeline_assembly_ref'), 'timeline_assembly:episode:episode_01')
    assert.equal(new URL(status.surface.url).searchParams.get('productionId'), null)
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

test('core MCP tools bind to MovScript Home daemon gateway before calling backend client', async () => {
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
        arguments: { capability: 'image' },
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
      'image',
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

function createTestServer() {
  return createServer((req, res) => {
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
    if (req.url === '/mcp') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: 'runtime-status-desktop-probe', result: {} }))
      return
    }
    if (req.url === '/api/v1/models?capability=image') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify([{
        id: 1,
        model_id: 'gpt-image-2',
        display_name: 'GPT Image 2',
        capabilities: ['image', 'image_edit'],
      }]))
      return
    }
    if (req.url === '/gateway/api/v1/models?capability=audio_music' && req.method === 'GET') {
      systemRequests.push({ method: req.method, url: req.url })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify([{
        id: 51,
        model_id: 'audio:music',
        display_name: 'Music Model',
        capabilities: ['audio_music'],
        supported_params: [
          { key: 'style', type: 'string' },
        ],
      }]))
      return
    }
    if (req.url === '/gateway/api/v1/models?capability=audio_generation&operation=music' && req.method === 'GET') {
      systemRequests.push({ method: req.method, url: req.url })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify([{
        id: 51,
        model_id: 'audio:music',
        display_name: 'Music Model',
        capabilities: ['audio_generation', 'audio_music'],
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
