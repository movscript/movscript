import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { handleMCPHostJSONRPC, listMCPHostTools, runtimeStatus } from '../dist/stdio.js'

let server
let baseURL
let adminRequests = []

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
  assert.equal(tools.has('admin_generation_tools_settings_update'), true)
  assert.equal(tools.has('admin_model_gateway_key_list'), true)
  assert.equal(tools.has('admin_cloud_file_config_list'), false)
  assert.equal(tools.has('admin_cloud_file_config_create'), false)
  assert.equal(tools.has('admin_usage_policy_get'), false)
  assert.equal(tools.has('admin_usage_policy_update'), false)
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

    const listResponse = await handleMCPHostJSONRPC({
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

    const tunnelResponse = await handleMCPHostJSONRPC({
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

    const deleteResponse = await handleMCPHostJSONRPC({
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
    assert.deepEqual(adminRequests.map((request) => `${request.method} ${request.url}`), [
      'GET /gateway/api/v1/admin/providers',
      'PUT /gateway/api/v1/admin/settings/resource-access',
      'DELETE /gateway/api/v1/model-gateway/api-keys/9',
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

    const response = await handleMCPHostJSONRPC({
      jsonrpc: '2.0',
      id: 'models',
      method: 'tools/call',
      params: {
        name: 'system_model_list',
        arguments: { capability: 'image' },
      },
    })

    assert.equal(response?.error, undefined)
    const payload = response.result.data
    assert.equal(payload.count, 1)
    assert.equal(payload.models[0].model_id, 'gpt-image-2')
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
    res.writeHead(404)
    res.end()
  })
}
