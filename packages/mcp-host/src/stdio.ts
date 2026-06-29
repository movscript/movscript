import readline from 'node:readline'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import {
  callTool,
  handleJSONRPC,
  listResources,
  listTools,
  makeError,
  makeResult,
  readResource,
  setMCPDefaultWorkspaceDir,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type MCPJSONValue,
  type MCPTool,
} from '@movscript/core/mcp/node'
import {
  clearMovScriptBackendAuth,
  resolveMovScriptBackendPaths,
  resolveMovScriptBackendSession,
  setMovScriptBackendAPIBaseURL,
  setMovScriptBackendRuntimeAuthToken,
  writeMovScriptBackendConfig,
} from '@movscript/core/backend/node'
import {
  adminCommandSpecs,
  isAdminMCPToolName,
  runMovScriptAdminCommand,
  unwrapCommandDataWithDebug,
} from '@movscript/cli-commands'
import {
  activeAppRecords,
  activeEndpointRecords,
  activeServiceRecords,
  findRuntimeApp,
  findRuntimeEndpoint,
  findRuntimeService,
  readRuntimeHomeSnapshot,
  resolveMovScriptHomeDir,
  type RuntimeEndpointRecord,
  type RuntimeHomeSnapshot,
} from '@movscript/runtime-contracts'
import {
  ensureLocalRuntimeDaemon,
  LOCAL_RUNTIME_DAEMON_APP_ID,
  LOCAL_RUNTIME_DAEMON_CONTROL_SERVICE,
  LOCAL_RUNTIME_DAEMON_GATEWAY_SERVICE,
} from '@movscript/local-runtime'
import {
  MOVSCRIPT_SOURCE_COLLECTION_DIRS,
  MOVSCRIPT_SOURCE_ROOT_FILES,
} from '@movscript/workspace'

const DEFAULT_LOCAL_BACKEND = 'http://localhost:8766'
const MCP_HOST_DEBUG = process.env.MOVSCRIPT_MCP_HOST_DEBUG === '1'
const LOCAL_NODE_CONTROL_SERVICE = LOCAL_RUNTIME_DAEMON_CONTROL_SERVICE
const LOCAL_NODE_GATEWAY_SERVICE = LOCAL_RUNTIME_DAEMON_GATEWAY_SERVICE
const DATA_SERVICE = 'movscript.data.service'
const PROJECT_SERVICE = 'movscript.project.service'
const EDITING_SERVICE = 'movscript.editing.service'
const LOCAL_SURFACE_HOST_SERVICE = 'movscript.local-surface.host'
const MEDIA_PIPELINE_SERVICE = 'movscript.media.pipeline'

const adminTools: MCPTool[] = adminCommandSpecs.map((tool) => ({
  name: tool.mcpToolName,
  description: tool.description,
  inputSchema: tool.inputSchema as unknown as MCPTool['inputSchema'],
}))

export const hostTools: MCPTool[] = [
  ...adminTools,
  {
    name: 'movscript_runtime_status',
    description: 'Detect MovScript local/cloud backend availability, current project source, Desktop enhancement status, and the recommended runtime mode. This tool is read-only.',
    inputSchema: objectSchema({
      workspaceDir: { type: 'string', description: 'Optional MovScript workspace or project directory to inspect.' },
      workspace_dir: { type: 'string', description: 'Alias for workspaceDir.' },
      homeDir: { type: 'string', description: 'Optional MovScript Home directory for runtime discovery. Defaults to MOVSCRIPT_HOME or ~/.movscript.' },
      home_dir: { type: 'string', description: 'Alias for homeDir.' },
      movscriptHome: { type: 'string', description: 'Alias for homeDir.' },
      movscript_home: { type: 'string', description: 'Alias for homeDir.' },
      projectDir: { type: 'string', description: 'Optional project source directory to inspect.' },
      project_dir: { type: 'string', description: 'Alias for projectDir.' },
      projectId: { type: 'string', description: 'Optional project id to use when constructing Local Surface Host URLs.' },
      project_id: { type: 'string', description: 'Alias for projectId.' },
      productionId: { type: 'string', description: 'Optional legacy production-scope id to include in project surface URLs. Namespace focus should use scopeKind/scopeRef or targetKind/targetRef.' },
      production_id: { type: 'string', description: 'Alias for productionId.' },
      scopeKind: { type: 'string', description: 'Optional timeline namespace scope kind to include in project surface URLs, for example episode or beat.' },
      scope_kind: { type: 'string', description: 'Alias for scopeKind.' },
      scopeRef: { type: 'string', description: 'Optional timeline namespace scope ref to include in project surface URLs.' },
      scope_ref: { type: 'string', description: 'Alias for scopeRef.' },
      targetKind: { type: 'string', description: 'Optional normalized target kind to include in project surface URLs, such as timeline_assembly.' },
      target_kind: { type: 'string', description: 'Alias for targetKind.' },
      targetRef: { type: 'string', description: 'Optional normalized target ref to include in project surface URLs.' },
      target_ref: { type: 'string', description: 'Alias for targetRef.' },
      timelineAssemblyRef: { type: 'string', description: 'Optional timeline assembly target ref to include in project surface URLs.' },
      timeline_assembly_ref: { type: 'string', description: 'Alias for timelineAssemblyRef.' },
      localBackendURL: { type: 'string', description: 'Optional local backend URL to probe.' },
      local_backend_url: { type: 'string', description: 'Alias for localBackendURL.' },
      timeoutMs: { type: 'number', description: 'Probe timeout in milliseconds. Defaults to 750.' },
      timeout_ms: { type: 'number', description: 'Alias for timeoutMs.' },
    }),
  },
  {
    name: 'movscript_runtime_configure',
    description: 'Configure the MovScript MCP host backend mode, backend URL, auth token, or project directory. This does not create or initialize a business project.',
    inputSchema: objectSchema({
      backendMode: { type: 'string', enum: ['local', 'cloud'], description: 'Preferred backend mode.' },
      backend_mode: { type: 'string', enum: ['local', 'cloud'], description: 'Alias for backendMode.' },
      backendBaseURL: { type: 'string', description: 'Backend base URL such as http://localhost:8766 or https://api.example.' },
      backend_base_url: { type: 'string', description: 'Alias for backendBaseURL.' },
      token: { type: 'string', description: 'Bearer token for the selected backend. Prefer environment variables or movcli auth for persistent secrets.' },
      projectDir: { type: 'string', description: 'Project source directory to use as default workspace/project context.' },
      project_dir: { type: 'string', description: 'Alias for projectDir.' },
      workspaceDir: { type: 'string', description: 'Workspace directory to persist backend config under.' },
      workspace_dir: { type: 'string', description: 'Alias for workspaceDir.' },
      remember: { type: 'boolean', description: 'When true, persist backendBaseURL to .movscript/backend/config.json.' },
      clearToken: { type: 'boolean', description: 'When true, clear persisted workspace auth for the selected workspace.' },
      clear_token: { type: 'boolean', description: 'Alias for clearToken.' },
    }),
  },
  {
    name: 'runtime_daemon_configure',
    description: 'Canonical runtime tool for configuring the MovScript MCP host backend mode, backend URL, auth token, or project directory.',
    inputSchema: objectSchema({
      backendMode: { type: 'string', enum: ['local', 'cloud'], description: 'Preferred backend mode.' },
      backend_mode: { type: 'string', enum: ['local', 'cloud'], description: 'Alias for backendMode.' },
      backendBaseURL: { type: 'string', description: 'Backend base URL such as http://localhost:8766 or https://api.example.' },
      backend_base_url: { type: 'string', description: 'Alias for backendBaseURL.' },
      token: { type: 'string', description: 'Bearer token for the selected backend. Prefer environment variables or movcli auth for persistent secrets.' },
      projectDir: { type: 'string', description: 'Project source directory to use as default workspace/project context.' },
      project_dir: { type: 'string', description: 'Alias for projectDir.' },
      workspaceDir: { type: 'string', description: 'Workspace directory to persist backend config under.' },
      workspace_dir: { type: 'string', description: 'Alias for workspaceDir.' },
      remember: { type: 'boolean', description: 'When true, persist backendBaseURL to .movscript/backend/config.json.' },
      clearToken: { type: 'boolean', description: 'When true, clear persisted workspace auth for the selected workspace.' },
      clear_token: { type: 'boolean', description: 'Alias for clearToken.' },
    }),
  },
  {
    name: 'runtime_daemon_discover',
    description: 'Read MovScript Home runtime records and discover daemon, gateway, service, and surface endpoints without starting or probing services.',
    inputSchema: runtimeReadinessSchema(),
  },
  {
    name: 'runtime_local_daemon_status',
    description: 'Return the persistent MovScript local runtime daemon status. The daemon is the per-user owner for local Data/Project/Editing/Canvas/Surface/Media services and is independent from MCP sessions.',
    inputSchema: objectSchema({
      homeDir: { type: 'string', description: 'Optional MovScript Home directory. Defaults to MOVSCRIPT_HOME or ~/.movscript.' },
      home_dir: { type: 'string', description: 'Alias for homeDir.' },
      movscriptHome: { type: 'string', description: 'Alias for homeDir.' },
      movscript_home: { type: 'string', description: 'Alias for homeDir.' },
    }),
  },
  {
    name: 'runtime_local_daemon_ensure',
    description: 'Ensure the persistent MovScript local runtime daemon is running. This is a bootstrap tool: it starts the daemon when missing and reuses it when already ready.',
    inputSchema: localDaemonBootstrapSchema(),
  },
  {
    name: 'runtime_local_daemon_start',
    description: 'Start the persistent MovScript local runtime daemon, reusing an already ready daemon unless forceRestart is set.',
    inputSchema: localDaemonBootstrapSchema(),
  },
  {
    name: 'runtime_daemon_ensure',
    description: 'Canonical alias for runtime_local_daemon_ensure.',
    inputSchema: localDaemonBootstrapSchema(),
  },
  {
    name: 'runtime_daemon_start',
    description: 'Canonical alias for runtime_local_daemon_start.',
    inputSchema: localDaemonBootstrapSchema(),
  },
  {
    name: 'runtime_daemon_status',
    description: 'Canonical alias for runtime_local_daemon_status.',
    inputSchema: localDaemonControlSchema(),
  },
  {
    name: 'runtime_daemon_stop',
    description: 'Canonical alias for runtime_local_daemon_stop.',
    inputSchema: localDaemonControlSchema(),
  },
  {
    name: 'runtime_daemon_restart',
    description: 'Canonical alias for runtime_local_daemon_restart.',
    inputSchema: localDaemonControlSchema(),
  },
  {
    name: 'runtime_descriptor_get',
    description: 'Return the canonical runtime descriptor for agents: selected data plane, MCP endpoint, service readiness, surfaces, and missing capabilities.',
    inputSchema: runtimeReadinessSchema(),
  },
  {
    name: 'runtime_preflight_check',
    description: 'Run read-only runtime preflight checks and return blockers/warnings before project, generation, admin, or editing work.',
    inputSchema: runtimeReadinessSchema({
      requireProject: { type: 'boolean', description: 'When false, do not treat a missing project source as a blocker.' },
      require_project: { type: 'boolean', description: 'Alias for requireProject.' },
    }),
  },
  {
    name: 'runtime_local_daemon_stop',
    description: 'Gracefully stop the persistent MovScript local runtime daemon so services can be upgraded, ports can be released, or local resources can be freed.',
    inputSchema: localDaemonControlSchema(),
  },
  {
    name: 'runtime_local_daemon_restart',
    description: 'Gracefully restart the persistent MovScript local runtime daemon and its local services.',
    inputSchema: localDaemonControlSchema(),
  },
  {
    name: 'runtime_local_node_status',
    description: 'Compatibility alias for runtime_local_daemon_status.',
    inputSchema: objectSchema({
      homeDir: { type: 'string', description: 'Optional MovScript Home directory. Defaults to MOVSCRIPT_HOME or ~/.movscript.' },
      home_dir: { type: 'string', description: 'Alias for homeDir.' },
      movscriptHome: { type: 'string', description: 'Alias for homeDir.' },
      movscript_home: { type: 'string', description: 'Alias for homeDir.' },
    }),
  },
  {
    name: 'runtime_local_node_stop',
    description: 'Compatibility alias for runtime_local_daemon_stop.',
    inputSchema: objectSchema({
      homeDir: { type: 'string', description: 'Optional MovScript Home directory. Defaults to MOVSCRIPT_HOME or ~/.movscript.' },
      home_dir: { type: 'string', description: 'Alias for homeDir.' },
      movscriptHome: { type: 'string', description: 'Alias for homeDir.' },
      movscript_home: { type: 'string', description: 'Alias for homeDir.' },
    }),
  },
  {
    name: 'runtime_local_node_restart',
    description: 'Compatibility alias for runtime_local_daemon_restart.',
    inputSchema: objectSchema({
      homeDir: { type: 'string', description: 'Optional MovScript Home directory. Defaults to MOVSCRIPT_HOME or ~/.movscript.' },
      home_dir: { type: 'string', description: 'Alias for homeDir.' },
      movscriptHome: { type: 'string', description: 'Alias for homeDir.' },
      movscript_home: { type: 'string', description: 'Alias for homeDir.' },
    }),
  },
]

export async function startMCPStdioHost(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  })
  const pending = new Set<Promise<void>>()

  rl.on('line', (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const task = (async () => {
      try {
        const payload = JSON.parse(trimmed) as JSONRPCRequest | JSONRPCRequest[]
        const response = Array.isArray(payload)
          ? (await Promise.all(payload.map((item) => handleMCPHostJSONRPC(item)))).filter((item): item is JSONRPCResponse => item !== undefined)
          : await handleMCPHostJSONRPC(payload)
        if (Array.isArray(response)) {
          if (response.length > 0) writeMessage(response)
        } else if (response !== undefined) {
          writeMessage(response)
        }
      } catch (error) {
        writeMessage(makeError(null, -32700, 'Parse error', errorMessage(error)))
      }
    })()
    pending.add(task)
    task.finally(() => pending.delete(task))
  })

  await new Promise<void>((resolve) => {
    rl.on('close', async () => {
      await Promise.allSettled([...pending])
      resolve()
    })
  })
}

export async function handleMCPHostJSONRPC(req: JSONRPCRequest): Promise<JSONRPCResponse | undefined> {
  const isNotification = !Object.prototype.hasOwnProperty.call(req, 'id')
  const id = isNotification ? null : req.id ?? null
  if (MCP_HOST_DEBUG) {
    process.stderr.write(`[movscript-mcp-host] method=${req?.method ?? ''} id=${String(id)}\n`)
  }
  if (req.jsonrpc !== '2.0' || !req.method) {
    if (isNotification) return undefined
    return makeError(id, -32600, 'Invalid Request')
  }

  try {
    switch (req.method) {
      case 'initialize':
        return makeResult(id, {
          protocolVersion: '2025-06-18',
          serverInfo: { name: 'movscript-mcp-host', version: '0.1.28' },
          capabilities: { resources: {}, tools: {} },
        })
      case 'initialized':
      case 'notifications/initialized':
      case 'notifications/cancelled':
      case 'notifications/progress':
        return undefined
      case 'ping':
        return makeResult(id, {})
      case 'tools/list':
        return makeResult(id, { tools: mergeTools(hostTools, listTools()) })
      case 'tools/call':
        await touchLocalNode().catch(() => undefined)
        return makeResult(id, await callMCPHostTool(req.params))
      case 'resources/list':
        return makeResult(id, { resources: listResources() })
      case 'resources/read':
        return makeResult(id, await readResource(stringParam(req.params, 'uri') ?? ''))
      default:
        return handleJSONRPC(req)
    }
  } catch (error) {
    if (isNotification) return undefined
    return makeError(id, -32000, errorMessage(error))
  }
}

export function listMCPHostTools(): MCPTool[] {
  return mergeTools(hostTools, listTools())
}

export async function callMCPHostTool(params: MCPJSONValue | undefined): Promise<MCPJSONValue> {
  const name = stringParam(params, 'name')
  const args = objectParam(params, 'arguments')
  if (name === 'movscript_runtime_status') return await runtimeStatus(args) as MCPJSONValue
  if (name === 'movscript_runtime_configure') return runtimeConfigure(args) as MCPJSONValue
  if (name === 'runtime_daemon_configure') return runtimeConfigure(args) as MCPJSONValue
  if (name === 'runtime_daemon_discover') return runtimeDaemonDiscover(args) as MCPJSONValue
  if (name === 'runtime_daemon_ensure') return await localDaemonEnsure(args) as MCPJSONValue
  if (name === 'runtime_daemon_start') return await localDaemonEnsure(args) as MCPJSONValue
  if (name === 'runtime_daemon_status') return await localNodeControl(args, 'GET', '/status') as MCPJSONValue
  if (name === 'runtime_daemon_stop') return await localNodeControl(args, 'POST', '/shutdown') as MCPJSONValue
  if (name === 'runtime_daemon_restart') return await localNodeControl(args, 'POST', '/restart') as MCPJSONValue
  if (name === 'runtime_descriptor_get') return await runtimeDescriptorGet(args) as MCPJSONValue
  if (name === 'runtime_preflight_check') return await runtimePreflightCheck(args) as MCPJSONValue
  if (name === 'runtime_local_daemon_ensure') return await localDaemonEnsure(args) as MCPJSONValue
  if (name === 'runtime_local_daemon_start') return await localDaemonEnsure(args) as MCPJSONValue
  if (name === 'runtime_local_daemon_status') return await localNodeControl(args, 'GET', '/status') as MCPJSONValue
  if (name === 'runtime_local_daemon_stop') return await localNodeControl(args, 'POST', '/shutdown') as MCPJSONValue
  if (name === 'runtime_local_daemon_restart') return await localNodeControl(args, 'POST', '/restart') as MCPJSONValue
  if (name === 'runtime_local_node_status') return await localNodeControl(args, 'GET', '/status') as MCPJSONValue
  if (name === 'runtime_local_node_stop') return await localNodeControl(args, 'POST', '/shutdown') as MCPJSONValue
  if (name === 'runtime_local_node_restart') return await localNodeControl(args, 'POST', '/restart') as MCPJSONValue
  if (isAdminMCPToolName(name)) {
    return unwrapCommandDataWithDebug(await runMovScriptAdminCommand(name!, args)) as MCPJSONValue
  }
  bindBackendRuntimeForCoreTools(args)
  return callTool(params)
}

export async function readMCPHostResource(uri: string): Promise<MCPJSONValue> {
  return readResource(uri)
}

async function localDaemonEnsure(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const homeDir = resolveRuntimeHomeArg(args)
  const entrypoint = resolveLocalDaemonEntrypoint(args)
  const cwd = resolve(stringValue(args.cwd) || process.cwd())
  const startupTimeoutMs = numberValue(args.startupTimeoutMs ?? args.startup_timeout_ms)
  const stopTimeoutMs = numberValue(args.stopTimeoutMs ?? args.stop_timeout_ms)
  const result = await ensureLocalRuntimeDaemon({
    homeDir,
    entrypoint,
    runArgs: ['daemon', 'run'],
    cwd,
    env: localDaemonBootstrapEnv(args),
    forceRestart: args.forceRestart === true || args.force_restart === true,
    ...(startupTimeoutMs ? { startupTimeoutMs } : {}),
    ...(stopTimeoutMs ? { stopTimeoutMs } : {}),
  })
  return {
    bootstrap: 'local_daemon',
    homeDir,
    entrypoint,
    cwd,
    ...result,
  }
}

function resolveLocalDaemonEntrypoint(args: Record<string, unknown>): string {
  const explicit = stringValue(args.entrypoint ?? args.entry_point)
    ?? process.env.MOVSCRIPT_DAEMON_ENTRYPOINT
    ?? process.env.MOVSCRIPT_AGENT_MCP_ENTRYPOINT
    ?? process.argv[1]
  if (!explicit) {
    throw new Error('runtime daemon startup requires an entrypoint; pass entrypoint or run through the MovScript Agent Plugin MCP entrypoint')
  }
  return resolve(explicit)
}

function localDaemonBootstrapEnv(args: Record<string, unknown>): NodeJS.ProcessEnv | undefined {
  const env: NodeJS.ProcessEnv = {}
  const dataPlane = stringValue(args.dataPlane ?? args.data_plane)
  if (dataPlane) {
    if (!['local', 'cloud', 'external'].includes(dataPlane)) {
      throw new Error(`invalid runtime daemon dataPlane: ${dataPlane}`)
    }
    env.MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE = dataPlane
  }
  const dataServiceURL = stringValue(args.dataServiceURL ?? args.data_service_url)
  if (dataServiceURL) env.MOVSCRIPT_DATA_SERVICE_URL = dataServiceURL
  const idleTimeout = stringValue(args.idleTimeout ?? args.idle_timeout)
  if (idleTimeout) {
    env.MOVSCRIPT_LOCAL_DAEMON_IDLE_TIMEOUT = idleTimeout
    env.MOVSCRIPT_LOCAL_NODE_IDLE_TIMEOUT = idleTimeout
  }
  return Object.keys(env).length > 0 ? env : undefined
}

export async function runtimeStatus(args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const workspaceDir = resolve(stringValue(args.workspaceDir ?? args.workspace_dir) || process.env.MOVSCRIPT_WORKSPACE_DIR || process.cwd())
  const projectDir = resolve(stringValue(args.projectDir ?? args.project_dir) || workspaceDir)
  const homeDir = resolveRuntimeHomeArg(args)
  const runtimeHome = readRuntimeHomeSnapshot(homeDir)
  const timeoutMs = numberValue(args.timeoutMs ?? args.timeout_ms) ?? 750
  const homeGatewayEndpoint = endpointURL(
    findRuntimeEndpoint(runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)
      ?? findRuntimeService(runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)?.endpoint,
  )
  const homeDataEndpoint = endpointURL(
    findRuntimeEndpoint(runtimeHome, 'movscript.data.service')
      ?? findRuntimeService(runtimeHome, 'movscript.data.service')?.endpoint,
  )
  const localBackendURL = normalizeBaseURL(stringValue(args.localBackendURL ?? args.local_backend_url) || homeGatewayEndpoint || homeDataEndpoint || DEFAULT_LOCAL_BACKEND)
  const configuredSession = resolveMovScriptBackendSession({
    workspaceDir,
    server: process.env.MOVSCRIPT_DATA_SERVICE_URL,
    token: process.env.MOVSCRIPT_API_TOKEN ?? process.env.MOVSCRIPT_DATA_SERVICE_TOKEN,
  })
  const configuredBaseURL = normalizeBaseURL(configuredSession.baseURL)
  const configuredIsLocal = isLocalBackendURL(configuredBaseURL)
  const localProbe = await probeBackend(localBackendURL, timeoutMs)
  const configuredProbe = configuredBaseURL === localBackendURL
    ? localProbe
    : await probeBackend(configuredBaseURL, timeoutMs)
  const cloudAuth = findCloudAuth(workspaceDir)
  const cloudBaseURL = configuredIsLocal ? cloudAuth.baseURL : configuredBaseURL
  const cloudProbe = cloudBaseURL && cloudBaseURL !== localBackendURL && cloudBaseURL !== configuredBaseURL
    ? await probeBackend(cloudBaseURL, timeoutMs)
    : configuredIsLocal ? { available: false } : configuredProbe
  const project = inspectProjectSource(projectDir)
  const mediaPipeline = mediaPipelineRuntimeStatus(runtimeHome)
  const localNode = localNodeRuntimeStatus(runtimeHome)
  const surfaceHost = surfaceHostRuntimeStatus(runtimeHome)
  const desktop = await probeDesktop(timeoutMs, runtimeHome)
  const localAvailable = localProbe.available
  const cloudConfigured = Boolean(cloudBaseURL || cloudAuth.authenticated || (!configuredIsLocal && configuredSession.token))
  const cloudAvailable = Boolean(cloudBaseURL && isRecord(cloudProbe) && cloudProbe.available === true)
  const selected = selectedBackendMode({
    configuredIsLocal,
    localAvailable,
    cloudAvailable,
    projectAvailable: project.isMovScriptProject,
  })
  const requiresUserChoice = shouldRequireUserChoice({
    localAvailable,
    cloudAvailable,
    projectAvailable: project.isMovScriptProject,
  })
  const missing = missingItems({
    localAvailable,
    cloudAvailable,
    projectAvailable: project.isMovScriptProject,
  })
  const runtimeOwner = runtimeOwnerStatus({
    desktopAvailable: desktop.available === true,
    localDaemonAvailable: localNode.available === true,
    localAvailable,
    cloudAvailable,
    selected,
  })
  const surfaces = localSurfaceURLs({
    surfaceHost,
    project,
    projectDir,
    projectId: stringValue(args.projectId ?? args.project_id),
    productionId: stringValue(args.productionId ?? args.production_id),
    focusQuery: runtimeFocusQuery(args),
    runtimeOwner,
  })

  return {
    status: 'ok',
    home: runtimeHomeSummary(runtimeHome),
    backend: {
      local: {
        available: localAvailable,
        baseURL: localBackendURL,
        discoveredFromHome: Boolean(homeGatewayEndpoint || homeDataEndpoint),
        ...(homeGatewayEndpoint ? { gatewayBaseURL: homeGatewayEndpoint } : {}),
        ...(homeDataEndpoint ? { dataServiceBaseURL: homeDataEndpoint } : {}),
        authenticated: configuredIsLocal && Boolean(configuredSession.token),
        ...(localProbe.error ? { error: localProbe.error } : {}),
      },
      cloud: {
        available: cloudAvailable,
        configured: cloudConfigured,
        ...(cloudBaseURL ? { baseURL: cloudBaseURL } : {}),
        authenticated: Boolean(cloudAuth.authenticated || (!configuredIsLocal && configuredSession.token)),
        ...(isRecord(cloudProbe) && typeof cloudProbe.error === 'string' ? { error: cloudProbe.error } : {}),
      },
      selected,
    },
    workspace: {
      cwd: process.cwd(),
      workspaceDir,
      projectDir,
      ...project,
    },
    desktop,
    localDaemon: localNode,
    localNode,
    surfaceHost,
    surfaces,
    ...(surfaces.primary ? { surface: surfaces.primary } : {}),
    ...(surfaces.secondary.length > 0 ? { secondary_surfaces: surfaces.secondary } : {}),
    mediaPipeline,
    runtimeOwner,
    recommendedMode: recommendedMode(selected, project.isMovScriptProject),
    requiresUserChoice,
    missing,
  }
}

function runtimeDaemonDiscover(args: Record<string, unknown> = {}): Record<string, unknown> {
  const homeDir = resolveRuntimeHomeArg(args)
  const runtimeHome = readRuntimeHomeSnapshot(homeDir)
  const endpoints = runtimeDiscoveredEndpoints(runtimeHome)
  const daemonAvailable = Boolean(endpoints.control || endpoints.gateway)
  return {
    schema: 'movscript.runtime_daemon_discovery.v1',
    status: daemonAvailable ? 'ready' : 'not_running',
    homeDir,
    daemon: {
      available: daemonAvailable,
      applicationId: LOCAL_RUNTIME_DAEMON_APP_ID,
      ...(endpoints.control ? { controlEndpoint: endpoints.control } : {}),
      ...(endpoints.gateway ? { gatewayEndpoint: endpoints.gateway } : {}),
      ...(endpoints.gateway ? { mcpEndpoint: runtimeMcpEndpoint(endpoints.gateway) } : {}),
    },
    endpoints,
    home: runtimeHomeSummary(runtimeHome),
    recommendedNextTool: daemonAvailable ? 'runtime_descriptor_get' : 'runtime_daemon_ensure',
  }
}

async function runtimeDescriptorGet(args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const status = await runtimeStatus(args)
  return runtimeDescriptorFromStatus(status)
}

async function runtimePreflightCheck(args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const status = await runtimeStatus(args)
  const descriptor = runtimeDescriptorFromStatus(status)
  const checks = runtimePreflightChecks(status, args)
  const blockers = checks.filter((check) => check.status === 'blocked')
  const warnings = checks.filter((check) => check.status === 'warning')
  return {
    schema: 'movscript.runtime_preflight.v1',
    status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'degraded' : 'ready',
    ready: blockers.length === 0,
    blockers,
    warnings,
    checks,
    descriptor,
  }
}

function runtimeDescriptorFromStatus(status: Record<string, unknown>): Record<string, unknown> {
  const backend = recordValue(status.backend)
  const localBackend = recordValue(backend.local)
  const cloudBackend = recordValue(backend.cloud)
  const workspace = recordValue(status.workspace)
  const runtimeOwner = recordValue(status.runtimeOwner)
  const localDaemon = recordValue(status.localDaemon ?? status.localNode)
  const mediaPipeline = recordValue(status.mediaPipeline)
  const surfaceHost = recordValue(status.surfaceHost)
  const surfaces = recordValue(status.surfaces)
  const gatewayEndpoint = stringValue(localBackend.gatewayBaseURL)
  const dataServiceEndpoint = stringValue(localBackend.dataServiceBaseURL)
    ?? (localBackend.discoveredFromHome === true ? stringValue(localBackend.baseURL) : undefined)
  const selected = stringValue(backend.selected)
  const endpointMap: Record<string, unknown> = {}
  if (gatewayEndpoint) {
    endpointMap.gateway = gatewayEndpoint
    endpointMap.mcp = runtimeMcpEndpoint(gatewayEndpoint)
    endpointMap.mcp_http = runtimeMcpEndpoint(gatewayEndpoint)
  }
  if (dataServiceEndpoint) endpointMap.dataService = dataServiceEndpoint
  if (stringValue(localDaemon.endpoint)) endpointMap.daemonControl = stringValue(localDaemon.endpoint)
  if (stringValue(mediaPipeline.endpoint)) endpointMap.mediaPipeline = stringValue(mediaPipeline.endpoint)
  if (stringValue(surfaceHost.endpoint)) endpointMap.surfaceHost = stringValue(surfaceHost.endpoint)

  return {
    schema: 'movscript.runtime_descriptor.v1',
    status: runtimeDescriptorStatus(status),
    owner: runtimeOwner,
    dataPlane: selected ?? (cloudBackend.available === true ? 'cloud' : localBackend.available === true ? 'local' : 'unknown'),
    endpoints: endpointMap,
    services: {
      backend: runtimeServiceDescriptor('backend', localBackend.available === true || cloudBackend.available === true, stringValue(localBackend.baseURL ?? cloudBackend.baseURL), selected),
      daemon: runtimeServiceDescriptor('daemon', localDaemon.available === true, stringValue(localDaemon.endpoint), stringValue(runtimeOwner.kind)),
      dataService: runtimeServiceDescriptor(DATA_SERVICE, localBackend.available === true, dataServiceEndpoint, selected),
      projectService: runtimeServiceDescriptor(PROJECT_SERVICE, Boolean(workspace.isMovScriptProject), stringValue(workspace.projectDir), 'project_source'),
      editingService: runtimeServiceDescriptor(EDITING_SERVICE, true, undefined, 'not_probed'),
      surfaceHost: runtimeServiceDescriptor(LOCAL_SURFACE_HOST_SERVICE, surfaceHost.available === true, stringValue(surfaceHost.endpoint), stringValue(surfaceHost.mode)),
      mediaPipeline: runtimeServiceDescriptor(MEDIA_PIPELINE_SERVICE, mediaPipeline.available === true, stringValue(mediaPipeline.endpoint), 'render'),
    },
    workspace,
    surfaces,
    recommendedMode: status.recommendedMode,
    requiresUserChoice: status.requiresUserChoice,
    missing: Array.isArray(status.missing) ? status.missing : [],
  }
}

function runtimeDescriptorStatus(status: Record<string, unknown>): string {
  const missing = Array.isArray(status.missing) ? status.missing : []
  if (missing.includes('backend')) return 'missing_backend'
  if (missing.length > 0) return 'degraded'
  return 'ready'
}

function runtimeServiceDescriptor(name: string, ready: boolean, endpoint?: string, mode?: string): Record<string, unknown> {
  return {
    name,
    ready,
    status: ready ? 'ready' : 'missing',
    ...(endpoint ? { endpoint } : {}),
    ...(mode ? { mode } : {}),
  }
}

function runtimePreflightChecks(status: Record<string, unknown>, args: Record<string, unknown>): Array<Record<string, unknown> & { status: 'ready' | 'warning' | 'blocked' }> {
  const backend = recordValue(status.backend)
  const localBackend = recordValue(backend.local)
  const cloudBackend = recordValue(backend.cloud)
  const workspace = recordValue(status.workspace)
  const localDaemon = recordValue(status.localDaemon ?? status.localNode)
  const mediaPipeline = recordValue(status.mediaPipeline)
  const surfaceHost = recordValue(status.surfaceHost)
  const requireProject = args.requireProject === false || args.require_project === false ? false : true
  const checks: Array<Record<string, unknown> & { status: 'ready' | 'warning' | 'blocked' }> = []
  checks.push(runtimeCheck({
    id: 'backend',
    ok: localBackend.available === true || cloudBackend.available === true,
    blocker: true,
    message: 'Data backend or daemon gateway is reachable.',
    missingMessage: 'No reachable Data Service, daemon gateway, or cloud backend was found.',
    owner: 'runtime',
  }))
  checks.push(runtimeCheck({
    id: 'daemon',
    ok: localDaemon.available === true,
    blocker: false,
    message: 'Local daemon control endpoint is registered.',
    missingMessage: 'Local daemon control endpoint is not registered; external/cloud runtimes may still work.',
    owner: 'runtime',
  }))
  checks.push(runtimeCheck({
    id: 'project_source',
    ok: workspace.isMovScriptProject === true,
    blocker: requireProject,
    message: 'MovScript project source is available.',
    missingMessage: 'MovScript project source was not found at the selected projectDir/workspaceDir.',
    owner: 'project',
  }))
  checks.push(runtimeCheck({
    id: 'surface_host',
    ok: surfaceHost.available === true,
    blocker: false,
    message: 'Local surface host is available for human review.',
    missingMessage: 'Local surface host is not available; browser review URLs may be unavailable.',
    owner: 'surface',
  }))
  checks.push(runtimeCheck({
    id: 'media_pipeline',
    ok: mediaPipeline.available === true,
    blocker: false,
    message: 'Media Pipeline endpoint is registered.',
    missingMessage: 'Media Pipeline endpoint is not registered; render/transcode/HLS may be unavailable.',
    owner: 'media_pipeline',
  }))
  return checks
}

function runtimeCheck(input: {
  id: string
  ok: boolean
  blocker: boolean
  message: string
  missingMessage: string
  owner: string
}): Record<string, unknown> & { status: 'ready' | 'warning' | 'blocked' } {
  if (input.ok) {
    return {
      id: input.id,
      status: 'ready',
      owner: input.owner,
      message: input.message,
    }
  }
  return {
    id: input.id,
    status: input.blocker ? 'blocked' : 'warning',
    owner: input.owner,
    message: input.missingMessage,
  }
}

function runtimeDiscoveredEndpoints(runtimeHome: RuntimeHomeSnapshot): Record<string, string> {
  const endpoints: Record<string, string> = {}
  setEndpoint(endpoints, 'control', runtimeHome, LOCAL_NODE_CONTROL_SERVICE)
  setEndpoint(endpoints, 'gateway', runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)
  setEndpoint(endpoints, 'dataService', runtimeHome, DATA_SERVICE)
  setEndpoint(endpoints, 'projectService', runtimeHome, PROJECT_SERVICE)
  setEndpoint(endpoints, 'editingService', runtimeHome, EDITING_SERVICE)
  setEndpoint(endpoints, 'surfaceHost', runtimeHome, LOCAL_SURFACE_HOST_SERVICE)
  setEndpoint(endpoints, 'mediaPipeline', runtimeHome, MEDIA_PIPELINE_SERVICE)
  if (endpoints.gateway) endpoints.mcp = runtimeMcpEndpoint(endpoints.gateway)
  return endpoints
}

function setEndpoint(output: Record<string, string>, key: string, runtimeHome: RuntimeHomeSnapshot, serviceName: string): void {
  const endpoint = endpointURL(
    findRuntimeEndpoint(runtimeHome, serviceName)
      ?? findRuntimeService(runtimeHome, serviceName)?.endpoint,
  )
  if (endpoint) output[key] = endpoint
}

function runtimeMcpEndpoint(baseURL: string): string {
  const normalized = normalizeBaseURL(baseURL)
  return `${normalized}/v1/mcp`
}

async function localNodeControl(args: Record<string, unknown>, method: 'GET' | 'POST', path: string): Promise<Record<string, unknown>> {
  const homeDir = resolveRuntimeHomeArg(args)
  const endpoint = endpointURL(findRuntimeEndpoint(readRuntimeHomeSnapshot(homeDir), LOCAL_NODE_CONTROL_SERVICE))
  if (!endpoint) return { status: 'not_running', homeDir }
  try {
    const response = await fetch(`${endpoint}${path}`, { method, signal: AbortSignal.timeout(3000) })
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    return {
      status: response.ok ? payload.status ?? 'ok' : 'error',
      homeDir,
      endpoint,
      ...payload,
      ...(response.ok ? {} : { httpStatus: response.status }),
    }
  } catch (error) {
    return { status: 'error', homeDir, endpoint, error: errorMessage(error) }
  }
}

async function touchLocalNode(): Promise<void> {
  const homeDir = resolveMovScriptHomeDir()
  const endpoint = endpointURL(findRuntimeEndpoint(readRuntimeHomeSnapshot(homeDir), LOCAL_NODE_CONTROL_SERVICE))
  if (!endpoint) return
  await fetch(`${endpoint}/touch`, { method: 'POST', signal: AbortSignal.timeout(750) })
}

export function runtimeConfigure(args: Record<string, unknown> = {}): Record<string, unknown> {
  const backendBaseURL = stringValue(args.backendBaseURL ?? args.backend_base_url)
  const backendMode = stringValue(args.backendMode ?? args.backend_mode)
  const workspaceDir = resolve(stringValue(args.workspaceDir ?? args.workspace_dir) || stringValue(args.projectDir ?? args.project_dir) || process.env.MOVSCRIPT_WORKSPACE_DIR || process.cwd())
  const projectDir = stringValue(args.projectDir ?? args.project_dir)
  const token = stringValue(args.token)
  const remember = args.remember === true
  const clearToken = args.clearToken === true || args.clear_token === true

  if (projectDir) setMCPDefaultWorkspaceDir(resolve(projectDir))
  else setMCPDefaultWorkspaceDir(workspaceDir)
  if (backendBaseURL) setMovScriptBackendAPIBaseURL(backendBaseURL)
  if (token) setMovScriptBackendRuntimeAuthToken(token)
  if (clearToken) {
    clearMovScriptBackendAuth(workspaceDir)
    setMovScriptBackendRuntimeAuthToken(undefined)
  }
  const persisted = backendBaseURL && remember
    ? writeMovScriptBackendConfig(workspaceDir, {
      baseURL: backendBaseURL,
      ...(backendMode === 'local' || backendMode === 'cloud' ? { realm: backendMode === 'local' ? { kind: 'local' as const, id: 'local' } : { kind: 'cloud' as const, id: 'default' } } : {}),
    })
    : undefined

  return {
    status: 'configured',
    workspaceDir,
    ...(projectDir ? { projectDir: resolve(projectDir) } : {}),
    ...(backendMode ? { backendMode } : {}),
    ...(backendBaseURL ? { backendBaseURL: normalizeBaseURL(backendBaseURL) } : {}),
    remembered: Boolean(persisted),
    tokenConfigured: Boolean(token),
    tokenCleared: clearToken,
  }
}

function inspectProjectSource(projectDir: string): Record<string, unknown> & { isMovScriptProject: boolean } {
  const workspacePath = resolve(projectDir, 'workspace.json')
  const projectPath = resolve(projectDir, 'project.json')
  const metadataPath = existsSync(workspacePath) ? workspacePath : existsSync(projectPath) ? projectPath : undefined
  const metadata = metadataPath ? readJSON(metadataPath) : undefined
  const sourceCollections = Array.from(MOVSCRIPT_SOURCE_COLLECTION_DIRS)
    .filter((name) => existsSync(resolve(projectDir, name)))
    .sort()
  const sourceRootFiles = Array.from(MOVSCRIPT_SOURCE_ROOT_FILES)
    .filter((name) => existsSync(resolve(projectDir, name)))
    .sort()
  const hasSourceDirs = sourceCollections.length > 0
  const hasSourceRootFiles = sourceRootFiles.length > 0
  const projectUid = isRecord(metadata) ? stringValue(metadata.project_uid ?? metadata.projectUid) : undefined
  const projectTitle = isRecord(metadata) ? stringValue(metadata.title ?? metadata.name) : undefined
  return {
    isMovScriptProject: Boolean(metadataPath || hasSourceDirs || hasSourceRootFiles),
    hasMetadata: Boolean(metadataPath),
    hasSourceDirs,
    hasSourceRootFiles,
    sourceCollections,
    sourceRootFiles,
    ...(metadataPath ? { metadataPath } : {}),
    ...(projectUid ? { projectUid } : {}),
    ...(projectTitle ? { projectTitle } : {}),
  }
}

async function probeBackend(baseURL: string, timeoutMs: number): Promise<{ available: boolean; status?: number; error?: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(250, Math.min(timeoutMs, 5000)))
  try {
    const response = await fetch(`${baseURL.replace(/\/+$/, '')}/health`, { signal: controller.signal })
    return { available: response.ok, status: response.status, ...(response.ok ? {} : { error: `HTTP ${response.status}` }) }
  } catch (error) {
    return { available: false, error: errorMessage(error) }
  } finally {
    clearTimeout(timeout)
  }
}

async function probeDesktop(timeoutMs: number, runtimeHome: RuntimeHomeSnapshot): Promise<Record<string, unknown>> {
  const desktopApp = findRuntimeApp(runtimeHome, 'movscript.desktop')
    ?? findRuntimeApp(runtimeHome, 'movscript.desktop.app')
  const mediaPipeline = mediaPipelineRuntimeStatus(runtimeHome)
  const homeEndpoint = endpointURL(desktopApp?.endpoint)
    ?? endpointURL(findRuntimeEndpoint(runtimeHome, 'movscript.mcp.host'))
  const endpoint = process.env.MOVSCRIPT_MCP_ENDPOINT || homeEndpoint || 'http://127.0.0.1:18765/mcp'
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(250, Math.min(timeoutMs, 3000)))
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'runtime-status-desktop-probe', method: 'initialize' }),
      signal: controller.signal,
    })
    return {
      available: response.ok,
      endpoint,
      discoveredFromHome: Boolean(homeEndpoint),
      applicationId: desktopApp?.applicationId,
      mediaPipeline: mediaPipeline.available,
      ...(mediaPipeline.endpoint ? { mediaPipelineEndpoint: mediaPipeline.endpoint } : {}),
      ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
    }
  } catch (error) {
    return {
      available: false,
      endpoint,
      discoveredFromHome: Boolean(homeEndpoint),
      applicationId: desktopApp?.applicationId,
      mediaPipeline: mediaPipeline.available,
      ...(mediaPipeline.endpoint ? { mediaPipelineEndpoint: mediaPipeline.endpoint } : {}),
      error: errorMessage(error),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function mediaPipelineRuntimeStatus(runtimeHome: RuntimeHomeSnapshot): Record<string, unknown> & { available: boolean; endpoint?: string } {
  const endpoint = endpointURL(
    findRuntimeEndpoint(runtimeHome, 'movscript.media.pipeline')
      ?? findRuntimeService(runtimeHome, 'movscript.media.pipeline')?.endpoint,
  )
  return {
    available: Boolean(endpoint),
    ...(endpoint ? { endpoint } : {}),
  }
}

function localNodeRuntimeStatus(runtimeHome: RuntimeHomeSnapshot): Record<string, unknown> & { available: boolean; endpoint?: string } {
  const endpoint = endpointURL(findRuntimeEndpoint(runtimeHome, LOCAL_NODE_CONTROL_SERVICE))
  return {
    available: Boolean(endpoint),
    ...(endpoint ? { endpoint } : {}),
  }
}

function surfaceHostRuntimeStatus(runtimeHome: RuntimeHomeSnapshot): Record<string, unknown> & { available: boolean; endpoint?: string } {
  const gatewayEndpointRecord = findRuntimeEndpoint(runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)
  const gatewayServiceRecord = findRuntimeService(runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)
  const surfaceEndpointRecord = findRuntimeEndpoint(runtimeHome, LOCAL_SURFACE_HOST_SERVICE)
  const surfaceServiceRecord = findRuntimeService(runtimeHome, LOCAL_SURFACE_HOST_SERVICE)
  const endpointRecord = gatewayEndpointRecord ?? surfaceEndpointRecord
  const serviceRecord = gatewayServiceRecord ?? surfaceServiceRecord
  const endpoint = endpointURL(endpointRecord ?? serviceRecord?.endpoint)
  const ownerApplicationId = endpointRecord?.applicationId ?? serviceRecord?.ownerApplicationId
  const serviceName = endpointRecord?.serviceName ?? serviceRecord?.serviceName ?? LOCAL_SURFACE_HOST_SERVICE
  return {
    available: Boolean(endpoint),
    serviceName,
    surfaceHostServiceName: LOCAL_SURFACE_HOST_SERVICE,
    ...(endpoint ? { endpoint } : {}),
    ...(ownerApplicationId ? { ownerApplicationId } : {}),
    ...(ownerApplicationId ? { mode: surfaceHostMode(ownerApplicationId) } : {}),
  }
}

function surfaceHostMode(ownerApplicationId: string): string {
  if (ownerApplicationId === 'movscript.agent-plugin') return 'agent-plugin-session'
  if (ownerApplicationId === LOCAL_RUNTIME_DAEMON_APP_ID) return 'local-daemon'
  if (ownerApplicationId === 'movscript.desktop') return 'desktop-owned'
  return 'external'
}

function localSurfaceURLs(input: {
  surfaceHost: Record<string, unknown> & { available: boolean; endpoint?: string }
  project: Record<string, unknown> & { isMovScriptProject: boolean }
  projectDir: string
  projectId?: string
  productionId?: string
  focusQuery?: Record<string, string>
  runtimeOwner: Record<string, unknown>
}): {
  available: boolean
  openable: boolean
  reason: string
  primary?: Record<string, unknown>
  secondary: Record<string, unknown>[]
  urls: Record<string, string>
  startupAllowed: boolean
} {
  const startupAllowed = input.runtimeOwner.surfaceHostStartupAllowed === true
  if (!input.surfaceHost.endpoint) {
    return {
      available: false,
      openable: false,
      reason: startupAllowed ? 'local_surface_host_not_ready_startup_allowed' : 'local_surface_host_not_ready',
      secondary: [],
      urls: {},
      startupAllowed,
    }
  }

  const baseURL = normalizeBaseURL(input.surfaceHost.endpoint)
  const projectId = input.projectId
    ?? stringValue(input.project.projectUid)
    ?? safeProjectIdFromDir(input.projectDir)
  const commonQuery: Record<string, string> = {
    source: 'runtime-status',
    projectId,
    projectDir: input.projectDir,
  }
  if (input.productionId) commonQuery.productionId = input.productionId
  for (const [key, value] of Object.entries(input.focusQuery ?? {})) {
    commonQuery[key] = value
  }

  const home = localSurfaceURL(baseURL, '/', commonQuery)
  const projectOverview = localSurfaceURL(baseURL, `/studio/${encodeURIComponent(projectId)}/overview`, commonQuery)
  const projectContent = localSurfaceURL(baseURL, `/studio/${encodeURIComponent(projectId)}/content`, commonQuery)
  const projectTimeline = localSurfaceURL(baseURL, `/studio/${encodeURIComponent(projectId)}/timeline`, commonQuery)
  const canvas = localSurfaceURL(baseURL, '/canvases', { source: 'runtime-status' })
  const editing = localSurfaceURL(baseURL, '/editing', commonQuery)
  const admin = localSurfaceURL(baseURL, '/admin/overview', { source: 'runtime-status' })

  const primary = input.project.isMovScriptProject
    ? runtimeSurfaceLink({
        title: 'MovScript project overview',
        surface: 'project.overview',
        route: `/studio/${encodeURIComponent(projectId)}/overview`,
        url: projectOverview,
        usage: 'Open this URL in the Codex/in-app browser when the user needs to inspect or operate the MovScript project UI.',
      })
    : runtimeSurfaceLink({
        title: 'MovScript Local Surface Host',
        surface: 'local-surface-host',
        route: '/',
        url: home,
        usage: 'Open this URL in the Codex/in-app browser to choose a MovScript local surface.',
      })

  const secondary = [
    runtimeSurfaceLink({
      title: 'MovScript project content',
      surface: 'project.content',
      route: `/studio/${encodeURIComponent(projectId)}/content`,
      url: projectContent,
      usage: 'Open this URL to inspect content units and project content state.',
    }),
    runtimeSurfaceLink({
      title: 'MovScript project timeline',
      surface: 'project.timeline',
      route: `/studio/${encodeURIComponent(projectId)}/timeline`,
      url: projectTimeline,
      usage: 'Open this URL to inspect the project timeline surface.',
    }),
    runtimeSurfaceLink({
      title: 'MovScript canvases',
      surface: 'canvas',
      route: '/canvases',
      url: canvas,
      usage: 'Open this URL when the user needs to inspect or edit canvas surfaces.',
    }),
    runtimeSurfaceLink({
      title: 'MovScript editing',
      surface: 'editing',
      route: '/editing',
      url: editing,
      usage: 'Open this URL when the user needs to inspect or edit media editing projects.',
    }),
    runtimeSurfaceLink({
      title: 'MovScript local admin',
      surface: 'admin.overview',
      route: '/admin/overview',
      url: admin,
      usage: 'Open this URL when the user needs local admin/provider/job controls.',
    }),
  ]

  return {
    available: true,
    openable: true,
    reason: 'local_surface_host_ready',
    primary,
    secondary,
    urls: {
      home,
      projectOverview,
      projectContent,
      projectTimeline,
      canvas,
      editing,
      admin,
    },
    startupAllowed,
  }
}

function safeProjectIdFromDir(projectDir: string): string {
  return basename(projectDir) || 'sample-project'
}

function localSurfaceURL(baseURL: string, pathname: string, query: Record<string, string>): string {
  const url = new URL(`${baseURL.replace(/\/+$/, '')}/`)
  const basePath = url.pathname.replace(/\/+$/, '')
  const routePath = pathname.startsWith('/') ? pathname : `/${pathname}`
  url.pathname = `${basePath}${routePath}` || '/'
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}

function runtimeFocusQuery(args: Record<string, unknown>): Record<string, string> {
  const output: Record<string, string> = {}
  setQueryValue(output, 'scopeKind', args.scopeKind ?? args.scope_kind)
  setQueryValue(output, 'scopeRef', args.scopeRef ?? args.scope_ref)
  setQueryValue(output, 'targetKind', args.targetKind ?? args.target_kind)
  setQueryValue(output, 'targetRef', args.targetRef ?? args.target_ref)
  setQueryValue(output, 'timeline_assembly_ref', args.timelineAssemblyRef ?? args.timeline_assembly_ref)
  return output
}

function setQueryValue(output: Record<string, string>, key: string, value: unknown): void {
  const normalized = stringValue(value)
  if (normalized) output[key] = normalized
}

function runtimeSurfaceLink(input: {
  title: string
  surface: string
  route: string
  url: string
  usage: string
}): Record<string, unknown> {
  return {
    kind: 'browser_url',
    title: input.title,
    surface: input.surface,
    route: input.route,
    url: input.url,
    usage: input.usage,
  }
}

function resolveRuntimeHomeArg(args: Record<string, unknown>): string {
  const homeDir = stringValue(args.homeDir ?? args.home_dir ?? args.movscriptHome ?? args.movscript_home)
  return homeDir ? resolve(homeDir) : resolveMovScriptHomeDir()
}

function bindBackendRuntimeForCoreTools(args: Record<string, unknown>): void {
  const homeDir = resolveRuntimeHomeArg(args)
  const runtimeHome = readRuntimeHomeSnapshot(homeDir)
  const gatewayEndpoint = endpointURL(
    findRuntimeEndpoint(runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)
      ?? findRuntimeService(runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)?.endpoint,
  )
  const dataEndpoint = endpointURL(
    findRuntimeEndpoint(runtimeHome, 'movscript.data.service')
      ?? findRuntimeService(runtimeHome, 'movscript.data.service')?.endpoint,
  )
  const backendEndpoint = gatewayEndpoint ?? dataEndpoint
  if (backendEndpoint) setMovScriptBackendAPIBaseURL(backendEndpoint)
  if (backendEndpoint && args.mcp_base_url === undefined && args.mcpBaseURL === undefined) {
    args.mcp_base_url = backendEndpoint
  }

  const agentSurfaceEndpoint = endpointURL(
    findRuntimeEndpoint(runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)
      ?? findRuntimeService(runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)?.endpoint
      ?? findRuntimeEndpoint(runtimeHome, LOCAL_SURFACE_HOST_SERVICE)
      ?? findRuntimeService(runtimeHome, LOCAL_SURFACE_HOST_SERVICE)?.endpoint,
  )
  if (agentSurfaceEndpoint && args.frontend_origin === undefined && args.frontendOrigin === undefined) {
    args.frontend_origin = agentSurfaceEndpoint
  }

  const workspaceDir = stringValue(args.workspaceDir ?? args.workspace_dir)
    ?? stringValue(args.projectDir ?? args.project_dir)
    ?? stringValue(args.projectPath ?? args.project_path)
    ?? stringValue(args.cwd)
    ?? process.env.MOVSCRIPT_WORKSPACE_DIR
  if (workspaceDir) setMCPDefaultWorkspaceDir(resolve(workspaceDir))
}

function endpointURL(endpoint: RuntimeEndpointRecord | undefined): string | undefined {
  if (!endpoint) return undefined
  if (endpoint.protocol && endpoint.protocol !== 'http' && endpoint.protocol !== 'https') return undefined
  if (endpoint.url) return endpoint.url
  if (endpoint.baseURL) return endpoint.baseURL
  if (endpoint.port && endpoint.protocol === 'http') return `http://127.0.0.1:${endpoint.port}`
  if (endpoint.port) return `http://127.0.0.1:${endpoint.port}`
  return undefined
}

function runtimeHomeSummary(snapshot: RuntimeHomeSnapshot): Record<string, unknown> {
  const apps = activeAppRecords(snapshot).map((record) => ({
    applicationId: record.applicationId,
    status: record.status,
    ready: record.ready,
    ...(record.profile ? { profile: record.profile } : {}),
    ...(record.owner ? { owner: record.owner } : {}),
    ...(record.endpoint ? { endpoint: endpointURL(record.endpoint) } : {}),
  }))
  const services = activeServiceRecords(snapshot).map((record) => ({
    serviceName: record.serviceName,
    instanceId: record.instanceId,
    status: record.status,
    ready: record.ready,
    ...(record.profile ? { profile: record.profile } : {}),
    ...(record.ownerApplicationId ? { ownerApplicationId: record.ownerApplicationId } : {}),
    ...(record.endpoint ? { endpoint: endpointURL(record.endpoint) } : {}),
  }))
  const endpoints = activeEndpointRecords(snapshot).map((record) => ({
    ...(record.serviceName ? { serviceName: record.serviceName } : {}),
    ...(record.applicationId ? { applicationId: record.applicationId } : {}),
    status: record.status,
    ready: record.ready,
    ...(endpointURL(record) ? { endpoint: endpointURL(record) } : {}),
  }))
  return {
    homeDir: snapshot.homeDir,
    apps,
    services,
    endpoints,
  }
}

function runtimeOwnerStatus(input: {
  desktopAvailable: boolean
  localDaemonAvailable: boolean
  localAvailable: boolean
  cloudAvailable: boolean
  selected: 'local' | 'cloud' | undefined
}): Record<string, unknown> {
  if (input.localDaemonAvailable) {
    return {
      kind: 'local_daemon',
      applicationId: LOCAL_RUNTIME_DAEMON_APP_ID,
      reason: 'local_runtime_daemon_ready',
      businessSidecarStartupAllowed: false,
      surfaceHostStartupAllowed: false,
      sidecarStartupAllowed: false,
    }
  }
  if (input.desktopAvailable) {
    return {
      kind: 'desktop_legacy_owner',
      applicationId: 'movscript.desktop',
      reason: 'desktop_full_runtime_ready_without_local_daemon',
      businessSidecarStartupAllowed: false,
      surfaceHostStartupAllowed: false,
      sidecarStartupAllowed: false,
    }
  }
  if (input.selected === 'cloud' && input.cloudAvailable) {
    return {
      kind: 'cloud',
      reason: 'cloud_backend_ready',
      businessSidecarStartupAllowed: false,
      surfaceHostStartupAllowed: false,
      sidecarStartupAllowed: false,
    }
  }
  if (input.selected === 'local' && input.localAvailable) {
    return {
      kind: 'external_local',
      reason: 'local_backend_ready_without_desktop',
      businessSidecarStartupAllowed: true,
      surfaceHostStartupAllowed: true,
      sidecarStartupAllowed: true,
    }
  }
  return {
    kind: 'none',
    reason: 'no_ready_runtime',
    businessSidecarStartupAllowed: true,
    surfaceHostStartupAllowed: true,
    sidecarStartupAllowed: true,
  }
}

function findCloudAuth(workspaceDir: string): { authenticated: boolean; baseURL?: string } {
  try {
    const paths = resolveMovScriptBackendPaths(workspaceDir)
    const cloudRoot = resolve(paths.backendRealmsDir, 'cloud')
    if (!existsSync(cloudRoot)) return { authenticated: false }
    for (const realmId of readdirSync(cloudRoot)) {
      const authPath = resolve(cloudRoot, realmId, 'auth.json')
      const auth = readJSON(authPath)
      if (isRecord(auth) && stringValue(auth.token)) return { authenticated: true }
    }
  } catch {
    // Status must remain best-effort.
  }
  return { authenticated: false }
}

function selectedBackendMode(input: {
  configuredIsLocal: boolean
  localAvailable: boolean
  cloudAvailable: boolean
  projectAvailable: boolean
}): 'local' | 'cloud' | undefined {
  if (input.localAvailable && input.cloudAvailable) return input.configuredIsLocal ? 'local' : 'cloud'
  if (input.localAvailable) return 'local'
  if (input.cloudAvailable) return 'cloud'
  return undefined
}

function shouldRequireUserChoice(input: {
  localAvailable: boolean
  cloudAvailable: boolean
  projectAvailable: boolean
}): boolean {
  return (input.localAvailable && input.cloudAvailable && input.projectAvailable)
    || (input.localAvailable && !input.projectAvailable)
    || (input.cloudAvailable && !input.projectAvailable)
}

function missingItems(input: {
  localAvailable: boolean
  cloudAvailable: boolean
  projectAvailable: boolean
}): string[] {
  const missing: string[] = []
  if (!input.localAvailable && !input.cloudAvailable) missing.push('backend')
  if (!input.projectAvailable) missing.push('project_source')
  return missing
}

function recommendedMode(selected: 'local' | 'cloud' | undefined, hasProject: boolean): string | undefined {
  if (selected === 'local' && hasProject) return 'local_backend_local_source'
  if (selected === 'cloud' && hasProject) return 'cloud_backend_local_source'
  if (selected === 'cloud') return 'cloud_backend_cloud_source'
  return undefined
}

function runtimeReadinessSchema(extra: Record<string, MCPJSONValue> = {}) {
  return objectSchema({
    homeDir: { type: 'string', description: 'Optional MovScript Home directory. Defaults to MOVSCRIPT_HOME or ~/.movscript.' },
    home_dir: { type: 'string', description: 'Alias for homeDir.' },
    movscriptHome: { type: 'string', description: 'Alias for homeDir.' },
    movscript_home: { type: 'string', description: 'Alias for homeDir.' },
    workspaceDir: { type: 'string', description: 'Optional MovScript workspace or project directory to inspect.' },
    workspace_dir: { type: 'string', description: 'Alias for workspaceDir.' },
    projectDir: { type: 'string', description: 'Optional project source directory to inspect.' },
    project_dir: { type: 'string', description: 'Alias for projectDir.' },
    projectId: { type: 'string', description: 'Optional project id to use when constructing surface URLs.' },
    project_id: { type: 'string', description: 'Alias for projectId.' },
    productionId: { type: 'string', description: 'Optional legacy production id to include in surface URLs.' },
    production_id: { type: 'string', description: 'Alias for productionId.' },
    scopeKind: { type: 'string', description: 'Optional timeline namespace scope kind.' },
    scope_kind: { type: 'string', description: 'Alias for scopeKind.' },
    scopeRef: { type: 'string', description: 'Optional timeline namespace scope ref.' },
    scope_ref: { type: 'string', description: 'Alias for scopeRef.' },
    targetKind: { type: 'string', description: 'Optional normalized target kind.' },
    target_kind: { type: 'string', description: 'Alias for targetKind.' },
    targetRef: { type: 'string', description: 'Optional normalized target ref.' },
    target_ref: { type: 'string', description: 'Alias for targetRef.' },
    timelineAssemblyRef: { type: 'string', description: 'Optional timeline assembly target ref.' },
    timeline_assembly_ref: { type: 'string', description: 'Alias for timelineAssemblyRef.' },
    localBackendURL: { type: 'string', description: 'Optional local backend URL to probe.' },
    local_backend_url: { type: 'string', description: 'Alias for localBackendURL.' },
    timeoutMs: { type: 'number', description: 'Probe timeout in milliseconds. Defaults to 750.' },
    timeout_ms: { type: 'number', description: 'Alias for timeoutMs.' },
    ...extra,
  })
}

function adminReadSchema(extra: Record<string, MCPJSONValue> = {}) {
  return objectSchema({
    ...adminRuntimeProperties(),
    query: {
      type: 'object',
      additionalProperties: true,
      description: 'Optional query string parameters for this fixed admin endpoint.',
    },
    ...extra,
  })
}

function adminWriteSchema(extra: Record<string, MCPJSONValue> = {}) {
  return objectSchema({
    ...adminRuntimeProperties(),
    payload: {
      type: 'object',
      additionalProperties: true,
      description: 'Backend request body for this fixed admin endpoint.',
    },
    body: {
      type: 'object',
      additionalProperties: true,
      description: 'Alias for payload.',
    },
    ...extra,
  })
}

function adminProviderSchema(includePayload = false) {
  const extra = {
    providerID: { type: 'string', description: 'Provider id.' },
    providerId: { type: 'string', description: 'Alias for providerID.' },
    provider_id: { type: 'string', description: 'Alias for providerID.' },
  }
  return includePayload ? adminWriteSchema(extra) : adminReadSchema(extra)
}

function adminProviderCredentialSchema(includePayload = false, includeCredentialKey = false) {
  return (includePayload ? adminWriteSchema : adminReadSchema)({
    providerID: { type: 'string', description: 'Provider id.' },
    providerId: { type: 'string', description: 'Alias for providerID.' },
    provider_id: { type: 'string', description: 'Alias for providerID.' },
    ...(includeCredentialKey ? {
      credentialKey: { type: 'string', description: 'Provider credential key.' },
      credential_key: { type: 'string', description: 'Alias for credentialKey.' },
    } : {}),
  })
}

function adminCatalogEntrySchema(includePayload = false) {
  return (includePayload ? adminWriteSchema : adminReadSchema)({
    catalogEntryID: { type: ['string', 'number'], description: 'Model catalog entry id.' },
    catalogEntryId: { type: ['string', 'number'], description: 'Alias for catalogEntryID.' },
    catalog_entry_id: { type: ['string', 'number'], description: 'Alias for catalogEntryID.' },
    id: { type: ['string', 'number'], description: 'Alias for catalogEntryID.' },
  })
}

function adminRouteBindingSchema(includePayload = false, includeBinding = false) {
  return (includePayload ? adminWriteSchema : adminReadSchema)({
    catalogEntryID: { type: ['string', 'number'], description: 'Model catalog entry id.' },
    catalogEntryId: { type: ['string', 'number'], description: 'Alias for catalogEntryID.' },
    catalog_entry_id: { type: ['string', 'number'], description: 'Alias for catalogEntryID.' },
    ...(includeBinding ? {
      bindingID: { type: ['string', 'number'], description: 'Route binding id.' },
      bindingId: { type: ['string', 'number'], description: 'Alias for bindingID.' },
      binding_id: { type: ['string', 'number'], description: 'Alias for bindingID.' },
    } : {}),
  })
}

function adminGatewayKeySchema(includePayload = false) {
  return (includePayload ? adminWriteSchema : adminReadSchema)({
    keyID: { type: ['string', 'number'], description: 'Model gateway API key id.' },
    keyId: { type: ['string', 'number'], description: 'Alias for keyID.' },
    key_id: { type: ['string', 'number'], description: 'Alias for keyID.' },
    id: { type: ['string', 'number'], description: 'Alias for keyID.' },
  })
}

function adminRuntimeProperties(): Record<string, MCPJSONValue> {
  return {
    homeDir: { type: 'string', description: 'Optional MovScript Home directory used to discover the daemon gateway.' },
    home_dir: { type: 'string', description: 'Alias for homeDir.' },
    movscriptHome: { type: 'string', description: 'Alias for homeDir.' },
    movscript_home: { type: 'string', description: 'Alias for homeDir.' },
    workspaceDir: { type: 'string', description: 'Optional workspace directory used for backend auth lookup.' },
    workspace_dir: { type: 'string', description: 'Alias for workspaceDir.' },
    projectDir: { type: 'string', description: 'Optional project directory used for backend auth lookup.' },
    project_dir: { type: 'string', description: 'Alias for projectDir.' },
  }
}

function objectSchema(properties: Record<string, MCPJSONValue>, required: string[] = []) {
  return {
    type: 'object' as const,
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  }
}

function localDaemonControlSchema() {
  return objectSchema({
    homeDir: { type: 'string', description: 'Optional MovScript Home directory. Defaults to MOVSCRIPT_HOME or ~/.movscript.' },
    home_dir: { type: 'string', description: 'Alias for homeDir.' },
    movscriptHome: { type: 'string', description: 'Alias for homeDir.' },
    movscript_home: { type: 'string', description: 'Alias for homeDir.' },
  })
}

function localDaemonBootstrapSchema() {
  return objectSchema({
    homeDir: { type: 'string', description: 'Optional MovScript Home directory. Defaults to MOVSCRIPT_HOME or ~/.movscript.' },
    home_dir: { type: 'string', description: 'Alias for homeDir.' },
    movscriptHome: { type: 'string', description: 'Alias for homeDir.' },
    movscript_home: { type: 'string', description: 'Alias for homeDir.' },
    entrypoint: { type: 'string', description: 'Optional MovScript CLI entrypoint capable of running daemon run. Defaults to the current process entrypoint.' },
    entry_point: { type: 'string', description: 'Alias for entrypoint.' },
    cwd: { type: 'string', description: 'Optional working directory for the daemon launcher. Defaults to the current working directory.' },
    dataPlane: { type: 'string', enum: ['local', 'cloud', 'external'], description: 'Optional daemon data plane.' },
    data_plane: { type: 'string', enum: ['local', 'cloud', 'external'], description: 'Alias for dataPlane.' },
    dataServiceURL: { type: 'string', description: 'Optional cloud or external Data Service URL.' },
    data_service_url: { type: 'string', description: 'Alias for dataServiceURL.' },
    idleTimeout: { type: 'string', description: 'Optional idle shutdown timeout, for example 30m or never.' },
    idle_timeout: { type: 'string', description: 'Alias for idleTimeout.' },
    startupTimeoutMs: { type: 'number', description: 'Optional daemon startup timeout in milliseconds.' },
    startup_timeout_ms: { type: 'number', description: 'Alias for startupTimeoutMs.' },
    stopTimeoutMs: { type: 'number', description: 'Optional timeout for stopping a stale daemon before restart, in milliseconds.' },
    stop_timeout_ms: { type: 'number', description: 'Alias for stopTimeoutMs.' },
    forceRestart: { type: 'boolean', description: 'When true, restart even if a matching daemon is already ready.' },
    force_restart: { type: 'boolean', description: 'Alias for forceRestart.' },
  })
}

function mergeTools(primary: MCPTool[], secondary: MCPTool[]): MCPTool[] {
  const seen = new Set<string>()
  const tools: MCPTool[] = []
  for (const tool of [...primary, ...secondary]) {
    if (seen.has(tool.name)) continue
    seen.add(tool.name)
    tools.push(tool)
  }
  return tools
}

function objectParam(value: MCPJSONValue | undefined, key: string): Record<string, unknown> {
  if (!isRecord(value)) return {}
  const candidate = value[key]
  return isRecord(candidate) ? candidate : {}
}

function stringParam(value: MCPJSONValue | undefined, key: string): string | undefined {
  if (!isRecord(value)) return undefined
  return stringValue(value[key])
}

function readJSON(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

function normalizeBaseURL(value: string): string {
  return value.trim().replace(/\/+$/, '').replace(/\/api\/v1$/, '') || DEFAULT_LOCAL_BACKEND
}

function isLocalBackendURL(value: string): boolean {
  try {
    const url = new URL(value)
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function writeMessage(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
