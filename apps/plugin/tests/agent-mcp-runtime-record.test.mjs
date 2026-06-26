import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const gatewayPorts = new Map()

test('movscript-agent-mcp writes plugin-basic app and service records only when explicitly requested', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-plugin-home-'))
  const result = await runAgentMCP(homeDir, {
    env: {
      MOVSCRIPT_PLUGIN_MODE: 'basic',
    },
  })

  assert.equal(result.exitCode, 0, result.stderr)
  const initializeResponse = JSON.parse(result.stdout.trim().split(/\n/)[0])
  assert.equal(initializeResponse.result.serverInfo.name, 'movscript-mcp-host')

  const records = readPluginRecords(homeDir, result.pid)

  assert.equal(records.app.applicationId, 'movscript.agent-plugin')
  assert.equal(records.app.profile, 'plugin-basic')
  assert.equal(records.app.status, 'stopped')
  assert.equal(records.launcher.serviceName, 'movscript.plugin.agent-launcher')
  assert.equal(records.launcher.status, 'stopped')
  assert.equal(records.service.serviceName, 'movscript.mcp.host')
  assert.equal(records.service.status, 'stopped')
  assert.equal(records.service.endpoint.url, 'stdio://movscript')
  assert.equal(records.dataService, undefined)
  assert.equal(records.projectService, undefined)
  assert.equal(records.editingService, undefined)
  assert.equal(records.localSurfaceHost, undefined)
  assert.equal(records.mediaPipeline, undefined)
  assert.equal(records.endpoint.serviceName, 'movscript.mcp.host')
  assert.equal(records.endpoint.url, 'stdio://movscript')
  assert.equal(records.mediaPipelineEndpoint, undefined)
  assert.equal(records.authServiceEndpoint, undefined)
})

test('plugin-full-local startup policy attaches to daemon instead of owning business sidecars', () => {
  const manifestSource = readFileSync(resolve(import.meta.dirname, '..', 'startup.manifest.ts'), 'utf8')
  const fullLocalPolicySource = manifestSource.match(/export const pluginFullLocalStartupPolicy = \{[\s\S]*?\n\} satisfies ScenarioPolicyManifest/)?.[0] ?? ''
  assert.match(fullLocalPolicySource, /movscript\.local-node\.control/)
  for (const serviceName of [
    'movscript.data.service',
    'movscript.project.service',
    'movscript.editing.service',
    'movscript.canvas.service',
    'movscript.local-surface.host',
    'movscript.media.pipeline',
  ]) {
    assert.equal(fullLocalPolicySource.includes(serviceName), false, `${serviceName} should be daemon-owned`)
  }
})

test('movscript-agent-mcp keeps plugin-desktop-owned only as an explicit compatibility mode', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-plugin-home-'))
  mkdirSync(join(homeDir, 'runtime', 'apps'), { recursive: true })
  writeFileSync(join(homeDir, 'runtime', 'apps', 'movscript.desktop.json'), JSON.stringify({
    applicationId: 'movscript.desktop',
    owner: 'electron',
    status: 'ready',
    ready: true,
  }), 'utf8')

  const result = await runAgentMCP(homeDir, {
    env: {
      MOVSCRIPT_PLUGIN_MODE: 'desktop',
    },
  })

  assert.equal(result.exitCode, 0, result.stderr)
  const records = readPluginRecords(homeDir, result.pid)

  assert.equal(records.app.profile, 'plugin-desktop-owned')
  assert.equal(records.launcher.serviceName, 'movscript.plugin.agent-launcher')
  assert.equal(records.service.serviceName, 'movscript.mcp.host')
  assert.equal(records.dataService, undefined)
  assert.equal(records.projectService, undefined)
  assert.equal(records.editingService, undefined)
  assert.equal(records.localSurfaceHost.serviceName, 'movscript.local-surface.host')
  assert.equal(records.localSurfaceHost.profile, 'desktop-connected')
  assert.equal(records.localSurfaceHost.status, 'stopped')
  assert.equal(records.localSurfaceHost.metadata.mode, 'plugin-desktop-owned')
  assert.equal(records.localSurfaceHost.metadata.role, 'agent-facing-surface-host')
  assert.match(records.localSurfaceHost.endpoint.url, /^http:\/\/127\.0\.0\.1:\d+$/)
  assert.equal(records.localSurfaceHostEndpoint.serviceName, 'movscript.local-surface.host')
  assert.match(records.localSurfaceHostEndpoint.url, /^http:\/\/127\.0\.0\.1:\d+$/)
  assert.equal(records.mediaPipeline, undefined)
  assert.equal(records.mediaPipelineEndpoint, undefined)
})

test('movscript-agent-mcp ignores legacy Desktop records and defaults to daemon attach', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-plugin-home-'))
  mkdirSync(join(homeDir, 'runtime', 'apps'), { recursive: true })
  writeFileSync(join(homeDir, 'runtime', 'apps', 'movscript.desktop.json'), JSON.stringify({
    applicationId: 'movscript.desktop',
    owner: 'electron',
    status: 'ready',
    ready: true,
  }), 'utf8')

  const result = await runAgentMCP(homeDir)

  assert.equal(result.exitCode, 0, result.stderr)
  const records = readPluginRecords(homeDir, result.pid)
  assert.equal(records.app.profile, 'plugin-basic')
  assert.equal(records.localSurfaceHost, undefined)
  assert.equal(records.dataService, undefined)
  assert.equal(records.projectService, undefined)
  assert.equal(records.editingService, undefined)
  assert.equal(records.mediaPipeline, undefined)

  const localNode = readLocalNodeRecords(homeDir)
  assert.equal(localNode.app.applicationId, 'movscript.local-node')
  assert.equal(localNode.app.status, 'ready')
  assert.equal(localNode.app.metadata.idleTimeoutMs, null)
  assert.equal(localNode.control?.serviceName, 'movscript.local-node.control')
  assert.equal(localNode.gateway?.serviceName, 'movscript.local-node.gateway')
  assert.equal(localNode.projectService?.status, 'ready')
  assert.equal(localNode.editingService?.status, 'ready')
  assert.equal(localNode.canvasService?.status, 'ready')
  assert.equal(localNode.localSurfaceHost?.status, 'ready')
  assert.equal(localNode.mediaPipeline?.status, 'ready')

  const stop = await runMovScriptCommand(homeDir, ['daemon', 'stop'])
  assert.equal(stop.exitCode, 0, stop.stderr)
  assert.match(stop.stdout, /stopping|not_running/)
})

test('movscript-agent-mcp defaults to persistent full-local local-node without Desktop and handles MCP smoke calls', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-plugin-home-'))
  const projectDir = mkdtempSync(join(tmpdir(), 'movscript-project-'))
  mkdirSync(join(projectDir, 'settings'), { recursive: true })
  mkdirSync(join(projectDir, 'content_units'), { recursive: true })
  writeFileSync(join(projectDir, 'project.json'), JSON.stringify({ title: 'Plugin Full Local Project' }), 'utf8')

  const result = await runAgentMCP(homeDir, {
    env: {
      MOVSCRIPT_WORKSPACE_DIR: projectDir,
    },
    requests: [
      { jsonrpc: '2.0', id: 'initialize', method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 'tools-list', method: 'tools/list', params: {} },
      {
        jsonrpc: '2.0',
        id: 'runtime-status',
        method: 'tools/call',
        params: {
          name: 'movscript_runtime_status',
          arguments: { homeDir, workspaceDir: projectDir, projectDir, timeoutMs: 1000 },
        },
      },
      {
        jsonrpc: '2.0',
        id: 'domain-inspect',
        method: 'tools/call',
        params: {
          name: 'domain_inspect',
          arguments: { projectDir },
        },
      },
    ],
  })

  assert.equal(result.exitCode, 0, result.stderr)
  const responses = parseJSONRPCResponses(result.stdout)
  assert.equal(responses.get('initialize')?.result?.serverInfo?.name, 'movscript-mcp-host')
  assert.ok(responses.get('tools-list')?.result?.tools?.some((tool) => tool.name === 'domain_inspect'))
  assert.ok(responses.get('tools-list')?.result?.tools?.some((tool) => tool.name === 'movscript_runtime_status'))
  const runtimeStatus = toolData(responses.get('runtime-status'))
  assert.equal(runtimeStatus.status, 'ok')
  assert.equal(runtimeStatus.backend.local.available, true)
  assert.equal(runtimeStatus.backend.local.discoveredFromHome, true)
  assert.equal(runtimeStatus.localNode.available, true)
  assert.equal(runtimeStatus.surfaceHost.available, true)
  assert.equal(runtimeStatus.surfaces.openable, true)
  assert.equal(runtimeStatus.surface.kind, 'browser_url')
  assert.equal(runtimeStatus.surface.surface, 'project.overview')
  assert.match(runtimeStatus.surface.url, /^http:\/\/127\.0\.0\.1:\d+\/studio\//)
  assert.equal(new URL(runtimeStatus.surface.url).port, String(await gatewayPortForHome(homeDir)))
  assert.equal(new URL(runtimeStatus.surface.url).searchParams.get('projectDir'), projectDir)
  assert.equal(runtimeStatus.mediaPipeline.available, true)
  assert.equal(runtimeStatus.workspace.isMovScriptProject, true)
  assert.equal(responses.get('domain-inspect')?.error, undefined)
  assert.equal(toolData(responses.get('domain-inspect')).schema, 'movscript.workspace-inspection.v1')

  const records = readPluginRecords(homeDir, result.pid)
  assert.equal(records.app.profile, 'plugin-basic')
  assert.equal(existsSync(join(homeDir, 'data-service', 'movscript.db')), true)
  assert.equal(records.authServiceEndpoint, undefined)
  assert.equal(records.dataService, undefined)
  assert.equal(records.projectService, undefined)
  assert.equal(records.editingService, undefined)
  assert.equal(records.localSurfaceHost, undefined)
  assert.equal(records.mediaPipeline, undefined)

  const localNode = readLocalNodeRecords(homeDir)
  assert.equal(localNode.app.applicationId, 'movscript.local-node')
  assert.equal(localNode.app.status, 'ready')
  assert.equal(localNode.app.ready, true)
  assert.equal(localNode.app.metadata.idleTimeoutMs, null)
  assert.equal(localNode.control?.serviceName, 'movscript.local-node.control')
  assert.equal(localNode.control?.status, 'ready')
  assert.equal(localNode.gateway?.serviceName, 'movscript.local-node.gateway')
  assert.equal(localNode.gateway?.status, 'ready')
  assert.equal(localNode.gatewayEndpoint?.serviceName, 'movscript.local-node.gateway')
  assert.equal(localNode.gatewayEndpoint?.url, localNode.controlEndpoint?.url)
  for (const record of [
    localNode.dataService,
    localNode.projectService,
    localNode.editingService,
    localNode.canvasService,
    localNode.localSurfaceHost,
    localNode.mediaPipeline,
  ]) {
    assert.equal(record?.status, 'ready')
    assert.equal(record?.profile, 'local')
    assert.match(record?.endpoint?.url ?? '', /^http:\/\/127\.0\.0\.1:\d+$/)
  }
  assert.equal(localNode.controlEndpoint.serviceName, 'movscript.local-node.control')
  assert.equal(localNode.gatewayEndpoint.serviceName, 'movscript.local-node.gateway')
  assert.equal(localNode.dataServiceEndpoint.serviceName, 'movscript.data.service')
  assert.equal(localNode.projectServiceEndpoint.serviceName, 'movscript.project.service')
  assert.equal(localNode.editingServiceEndpoint.serviceName, 'movscript.editing.service')
  assert.equal(localNode.canvasServiceEndpoint.serviceName, 'movscript.canvas.service')
  assert.equal(localNode.localSurfaceHostEndpoint.serviceName, 'movscript.local-surface.host')
  assert.equal(localNode.mediaPipelineEndpoint.serviceName, 'movscript.media.pipeline')
  const directAdminCredentials = await fetch(`${localNode.gatewayEndpoint.url}/api/v1/admin/credentials`)
  assert.equal(directAdminCredentials.ok, true)
  assert.match(directAdminCredentials.headers.get('content-type') ?? '', /application\/json/)

  const stop = await runLocalNodeCommand(homeDir, ['local-node', 'stop'])
  assert.equal(stop.exitCode, 0, stop.stderr)
  assert.match(stop.stdout, /stopping|not_running/)
})

test('plugin command line starts daemon with cloud data plane without local Data Service', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-plugin-cli-home-'))

  const start = await runMovScriptCommand(homeDir, [
    'daemon',
    'start',
    '--data-plane',
    'cloud',
    '--data-service-url',
    'https://data.movscript.example',
  ])

  assert.equal(start.exitCode, 0, start.stderr)
  const startPayload = JSON.parse(start.stdout)
  assert.equal(startPayload.status, 'ready')
  assert.equal(startPayload.dataPlane, 'cloud')

  const status = await runMovScriptCommand(homeDir, ['daemon', 'status'])
  assert.equal(status.exitCode, 0, status.stderr)
  const statusPayload = JSON.parse(status.stdout)
  assert.equal(statusPayload.available, true)
  assert.equal(statusPayload.dataPlane, 'cloud')
  assert.equal(statusPayload.idleTimeoutMs, null)

  const localNode = readLocalNodeRecords(homeDir)
  assert.equal(localNode.app.applicationId, 'movscript.local-node')
  assert.equal(localNode.app.metadata.dataPlane, 'cloud')
  assert.equal(localNode.app.metadata.idleTimeoutMs, null)
  assert.equal(localNode.gateway?.status, 'ready')
  assert.equal(localNode.gatewayEndpoint?.serviceName, 'movscript.local-node.gateway')
  assert.equal(localNode.dataService, undefined)
  assert.equal(localNode.dataServiceEndpoint, undefined)
  assert.equal(localNode.projectService?.status, 'ready')
  assert.equal(localNode.editingService?.status, 'ready')
  assert.equal(localNode.canvasService?.status, 'ready')
  assert.equal(localNode.localSurfaceHost?.status, 'ready')
  assert.equal(localNode.mediaPipeline?.status, 'ready')
  assert.equal(existsSync(join(homeDir, 'data-service', 'movscript.db')), false)

  const stop = await runMovScriptCommand(homeDir, ['daemon', 'stop'])
  assert.equal(stop.exitCode, 0, stop.stderr)
  assert.match(stop.stdout, /stopping|not_running/)
})

async function runAgentMCP(homeDir, options = {}) {
  const requests = options.requests ?? [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
  ]
  const gatewayPort = await gatewayPortForHome(homeDir)
  const child = spawn(process.execPath, ['bin/movscript-agent-mcp.mjs'], {
    cwd: resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      MOVSCRIPT_HOME: homeDir,
      MOVSCRIPT_MCP_ENDPOINT: 'http://127.0.0.1:1/mcp',
      MOVSCRIPT_LOCAL_NODE_GATEWAY_PORT: String(gatewayPort),
      ...options.env,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  for (const request of requests) {
    child.stdin.write(`${JSON.stringify(request)}\n`)
  }
  child.stdin.end()

  const exitCode = await new Promise((resolveExit) => {
    child.on('close', resolveExit)
  })

  return {
    exitCode,
    pid: child.pid,
    stdout,
    stderr,
  }
}

async function runLocalNodeCommand(homeDir, args) {
  const gatewayPort = await gatewayPortForHome(homeDir)
  const child = spawn(process.execPath, ['bin/movscript-agent-mcp.mjs', ...args], {
    cwd: resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      MOVSCRIPT_HOME: homeDir,
      MOVSCRIPT_MCP_ENDPOINT: 'http://127.0.0.1:1/mcp',
      MOVSCRIPT_LOCAL_NODE_GATEWAY_PORT: String(gatewayPort),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  const exitCode = await new Promise((resolveExit) => {
    child.on('close', resolveExit)
  })
  return { exitCode, stdout, stderr }
}

async function runMovScriptCommand(homeDir, args) {
  const gatewayPort = await gatewayPortForHome(homeDir)
  const child = spawn('bin/movscript', args, {
    cwd: resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      MOVSCRIPT_HOME: homeDir,
      MOVSCRIPT_MCP_ENDPOINT: 'http://127.0.0.1:1/mcp',
      MOVSCRIPT_LOCAL_NODE_GATEWAY_PORT: String(gatewayPort),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  const exitCode = await new Promise((resolveExit) => {
    child.on('close', resolveExit)
  })
  return { exitCode, stdout, stderr }
}

async function gatewayPortForHome(homeDir) {
  if (gatewayPorts.has(homeDir)) return gatewayPorts.get(homeDir)
  const port = await reservePort()
  gatewayPorts.set(homeDir, port)
  return port
}

async function reservePort() {
  const server = createServer()
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolveClose) => server.close(resolveClose))
  if (!port) throw new Error('failed to reserve test gateway port')
  return port
}

function readPluginRecords(homeDir, pid) {
  const appRecordPath = join(homeDir, 'runtime', 'apps', 'movscript.agent-plugin.json')
  const launcherRecordPath = join(homeDir, 'runtime', 'services', 'movscript.plugin.agent-launcher', `launcher-${pid}.json`)
  const serviceRecordPath = join(homeDir, 'runtime', 'services', 'movscript.mcp.host', `stdio-${pid}.json`)
  const dataServiceRecordPath = join(homeDir, 'runtime', 'services', 'movscript.data.service', `data-service-${pid}.json`)
  const projectServiceRecordPath = join(homeDir, 'runtime', 'services', 'movscript.project.service', `project-service-${pid}.json`)
  const editingServiceRecordPath = join(homeDir, 'runtime', 'services', 'movscript.editing.service', `editing-service-${pid}.json`)
  const localSurfaceHostRecordPath = join(homeDir, 'runtime', 'services', 'movscript.local-surface.host', `local-surface-host-${pid}.json`)
  const mediaPipelineRecordPath = join(homeDir, 'runtime', 'services', 'movscript.media.pipeline', `media-pipeline-${pid}.json`)
  const endpointRecordPath = join(homeDir, 'runtime', 'endpoints', 'movscript.mcp.host.json')
  const dataServiceEndpointRecordPath = join(homeDir, 'runtime', 'endpoints', 'movscript.data.service.json')
  const projectServiceEndpointRecordPath = join(homeDir, 'runtime', 'endpoints', 'movscript.project.service.json')
  const editingServiceEndpointRecordPath = join(homeDir, 'runtime', 'endpoints', 'movscript.editing.service.json')
  const localSurfaceHostEndpointRecordPath = join(homeDir, 'runtime', 'endpoints', 'movscript.local-surface.host.json')
  const mediaPipelineEndpointRecordPath = join(homeDir, 'runtime', 'endpoints', 'movscript.media.pipeline.json')
  const authServiceEndpointRecordPath = join(homeDir, 'runtime', 'endpoints', 'movscript.auth.service.json')

  assert.equal(existsSync(appRecordPath), true)
  assert.equal(existsSync(launcherRecordPath), true)
  assert.equal(existsSync(serviceRecordPath), true)
  assert.equal(existsSync(endpointRecordPath), true)

  const appRecord = JSON.parse(readFileSync(appRecordPath, 'utf8'))
  const launcherRecord = JSON.parse(readFileSync(launcherRecordPath, 'utf8'))
  const serviceRecord = JSON.parse(readFileSync(serviceRecordPath, 'utf8'))
  const endpointRecord = JSON.parse(readFileSync(endpointRecordPath, 'utf8'))
  const dataServiceRecord = readOptionalJSON(dataServiceRecordPath)
  const projectServiceRecord = readOptionalJSON(projectServiceRecordPath)
  const editingServiceRecord = readOptionalJSON(editingServiceRecordPath)
  const localSurfaceHostRecord = readOptionalJSON(localSurfaceHostRecordPath)
  const mediaPipelineRecord = existsSync(mediaPipelineRecordPath)
    ? JSON.parse(readFileSync(mediaPipelineRecordPath, 'utf8'))
    : undefined
  const dataServiceEndpointRecord = readOptionalJSON(dataServiceEndpointRecordPath)
  const projectServiceEndpointRecord = readOptionalJSON(projectServiceEndpointRecordPath)
  const editingServiceEndpointRecord = readOptionalJSON(editingServiceEndpointRecordPath)
  const localSurfaceHostEndpointRecord = readOptionalJSON(localSurfaceHostEndpointRecordPath)
  const mediaPipelineEndpointRecord = existsSync(mediaPipelineEndpointRecordPath)
    ? JSON.parse(readFileSync(mediaPipelineEndpointRecordPath, 'utf8'))
    : undefined
  const authServiceEndpointRecord = readOptionalJSON(authServiceEndpointRecordPath)
  return {
    app: appRecord,
    launcher: launcherRecord,
    service: serviceRecord,
    endpoint: endpointRecord,
    dataService: dataServiceRecord,
    projectService: projectServiceRecord,
    editingService: editingServiceRecord,
    localSurfaceHost: localSurfaceHostRecord,
    mediaPipeline: mediaPipelineRecord,
    dataServiceEndpoint: dataServiceEndpointRecord,
    projectServiceEndpoint: projectServiceEndpointRecord,
    editingServiceEndpoint: editingServiceEndpointRecord,
    localSurfaceHostEndpoint: localSurfaceHostEndpointRecord,
    mediaPipelineEndpoint: mediaPipelineEndpointRecord,
    authServiceEndpoint: authServiceEndpointRecord,
  }
}

function readLocalNodeRecords(homeDir) {
  const appRecordPath = join(homeDir, 'runtime', 'apps', 'movscript.local-node.json')
  const controlEndpointPath = join(homeDir, 'runtime', 'endpoints', 'movscript.local-node.control.json')
  const gatewayEndpointPath = join(homeDir, 'runtime', 'endpoints', 'movscript.local-node.gateway.json')
  const dataServiceEndpointRecordPath = join(homeDir, 'runtime', 'endpoints', 'movscript.data.service.json')
  const projectServiceEndpointRecordPath = join(homeDir, 'runtime', 'endpoints', 'movscript.project.service.json')
  const editingServiceEndpointRecordPath = join(homeDir, 'runtime', 'endpoints', 'movscript.editing.service.json')
  const canvasServiceEndpointRecordPath = join(homeDir, 'runtime', 'endpoints', 'movscript.canvas.service.json')
  const localSurfaceHostEndpointRecordPath = join(homeDir, 'runtime', 'endpoints', 'movscript.local-surface.host.json')
  const mediaPipelineEndpointRecordPath = join(homeDir, 'runtime', 'endpoints', 'movscript.media.pipeline.json')
  assert.equal(existsSync(appRecordPath), true)
  assert.equal(existsSync(controlEndpointPath), true)
  assert.equal(existsSync(gatewayEndpointPath), true)
  return {
    app: JSON.parse(readFileSync(appRecordPath, 'utf8')),
    control: latestServiceRecord(homeDir, 'movscript.local-node.control'),
    gateway: latestServiceRecord(homeDir, 'movscript.local-node.gateway'),
    dataService: latestServiceRecord(homeDir, 'movscript.data.service'),
    projectService: latestServiceRecord(homeDir, 'movscript.project.service'),
    editingService: latestServiceRecord(homeDir, 'movscript.editing.service'),
    canvasService: latestServiceRecord(homeDir, 'movscript.canvas.service'),
    localSurfaceHost: latestServiceRecord(homeDir, 'movscript.local-surface.host'),
    mediaPipeline: latestServiceRecord(homeDir, 'movscript.media.pipeline'),
    controlEndpoint: readOptionalJSON(controlEndpointPath),
    gatewayEndpoint: readOptionalJSON(gatewayEndpointPath),
    dataServiceEndpoint: readOptionalJSON(dataServiceEndpointRecordPath),
    projectServiceEndpoint: readOptionalJSON(projectServiceEndpointRecordPath),
    editingServiceEndpoint: readOptionalJSON(editingServiceEndpointRecordPath),
    canvasServiceEndpoint: readOptionalJSON(canvasServiceEndpointRecordPath),
    localSurfaceHostEndpoint: readOptionalJSON(localSurfaceHostEndpointRecordPath),
    mediaPipelineEndpoint: readOptionalJSON(mediaPipelineEndpointRecordPath),
  }
}

function latestServiceRecord(homeDir, serviceName) {
  const serviceDir = join(homeDir, 'runtime', 'services', serviceName)
  if (!existsSync(serviceDir)) return undefined
  const files = readdirSync(serviceDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(serviceDir, name))
    .sort((a, b) => readFileSync(b, 'utf8').localeCompare(readFileSync(a, 'utf8')))
  return files[0] ? JSON.parse(readFileSync(files[0], 'utf8')) : undefined
}

function readOptionalJSON(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined
}

function parseJSONRPCResponses(stdout) {
  return new Map(stdout.trim().split(/\n/).filter(Boolean).map((line) => {
    const response = JSON.parse(line)
    return [response.id, response]
  }))
}

function toolData(response) {
  assert.equal(response?.error, undefined, response?.error?.message)
  if (response?.result?.data !== undefined) return response.result.data
  if (response?.result?.status !== undefined) return response.result
  const text = response?.result?.content?.[0]?.text
  assert.equal(typeof text, 'string')
  return JSON.parse(text)
}
