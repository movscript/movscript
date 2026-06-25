import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { handleMCPHostJSONRPC, runtimeStatus } from '../dist/stdio.js'

let server
let baseURL

before(async () => {
  server = createTestServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  baseURL = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
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

test('core MCP tools bind to MovScript Home data-service endpoint before calling backend client', async () => {
  const previousHome = process.env.MOVSCRIPT_HOME
  const previousWorkspace = process.env.MOVSCRIPT_WORKSPACE_DIR
  const previousDataServiceURL = process.env.MOVSCRIPT_DATA_SERVICE_URL
  delete process.env.MOVSCRIPT_DATA_SERVICE_URL
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-home-'))
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-project-'))
  try {
    mkdirSync(join(homeDir, 'runtime', 'endpoints'), { recursive: true })
    writeFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.data.service.json'), JSON.stringify({
      serviceName: 'movscript.data.service',
      status: 'ready',
      baseURL,
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
    res.writeHead(404)
    res.end()
  })
}
