import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { basename, dirname, extname, join, resolve } from 'node:path'
import {
  createScenarioApplicationRunner,
  type ProgramAdapter,
  type ProgramRunnerContext,
  type ProgramRuntime,
} from '@movscript/app-runner'
import {
  MEDIA_PIPELINE_SERVICE_NAME,
} from '@movscript/media-pipeline'
import {
  ensureLocalRuntimeDaemon,
  LOCAL_RUNTIME_DAEMON_APP_ID,
  LOCAL_RUNTIME_DAEMON_CONTROL_SERVICE,
  LOCAL_RUNTIME_DAEMON_GATEWAY_SERVICE,
  localRuntimeControlRequest,
  probeLocalRuntimeDaemon,
  stopLocalRuntimeDaemon,
} from '@movscript/local-runtime'
import { mcpHostProgramManifest } from '@movscript/mcp-host/program-manifest'
import { startMCPStdioHost } from '@movscript/mcp-host/stdio'
import {
  MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  MOVSCRIPT_APPLICATION_MANIFEST_SCHEMA,
  MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
  findRuntimeEndpoint,
  pidIsAlive,
  readRuntimeHomeSnapshot,
  resolveMovScriptHomeDir,
  writeRuntimeAppRecord,
  writeRuntimeEndpointRecord,
  writeRuntimeServiceRecord,
  type ApplicationManifest,
  type ProgramManifest,
  type ScenarioPolicyManifest,
} from '@movscript/runtime-contracts'

import pluginApplicationManifest from '../application.manifest'
import pluginAgentLauncherProgramManifest from '../programs/agent-launcher.program.manifest'
import {
  pluginBasicStartupPolicy,
  pluginDesktopOwnedStartupPolicy,
  pluginFullLocalStartupPolicy,
} from '../startup.manifest'
import { runMovcli } from '@movscript/cli'
import { runCanvasServiceCLI } from '../../../services/canvas-service/src/server.mjs'
import { runEditingServiceCLI } from '../../../services/editing-service/src/server.mjs'
import { runMediaPipelineServiceCLI } from '../../../services/media-pipeline/src/server.mjs'
import { runProjectServiceCLI } from '../../../services/project-service/src/server.mjs'

const LOCAL_NODE_APP_ID = LOCAL_RUNTIME_DAEMON_APP_ID
const LOCAL_NODE_CONTROL_SERVICE = LOCAL_RUNTIME_DAEMON_CONTROL_SERVICE
const LOCAL_NODE_GATEWAY_SERVICE = LOCAL_RUNTIME_DAEMON_GATEWAY_SERVICE
const PROJECT_SERVICE_NAME = 'movscript.project.service'
const CANVAS_SERVICE_NAME = 'movscript.canvas.service'
const DATA_SERVICE_NAME = 'movscript.data.service'
const DEFAULT_LOCAL_NODE_GATEWAY_PORT = 8766
const LOCAL_PROJECT_SERVICE_PROXY_ROUTES = new Map<string, string>([
  ['/local-api/project/read-model', '/v1/project/read-model'],
  ['/local-api/project/lifecycle/command', '/v1/project/lifecycle/command'],
  ['/local-api/project/locator/resolve', '/v1/project/locator/resolve'],
  ['/local-api/project/source/snapshot', '/v1/project/source/snapshot'],
  ['/local-api/project/source/inspect', '/v1/project/source/inspect'],
  ['/local-api/project/source/overview', '/v1/project/source/overview'],
  ['/local-api/project/source/interpret', '/v1/project/source/interpret'],
  ['/local-api/project/source/regeneration-plan', '/v1/project/source/regeneration-plan'],
  ['/local-api/project/source/command', '/v1/project/source/command'],
  ['/local-api/project/resources/view', '/v1/project/resources/view'],
  ['/local-api/project/candidates/command', '/v1/project/candidates/command'],
  ['/local-api/project/candidates/view', '/v1/project/candidates/view'],
  ['/local-api/project/prompt/context', '/v1/project/prompt/context'],
])
const PLUGIN_ROOT = resolve(import.meta.dirname, '..')
const DEV_REPO_ROOT = resolve(import.meta.dirname, '../../..')
const BUNDLED_RUNTIME_ROOT = resolve(PLUGIN_ROOT, 'runtime')
const HAS_BUNDLED_RUNTIME = existsSync(BUNDLED_RUNTIME_ROOT)
const AGENT_MCP_ENTRYPOINT = resolve(import.meta.dirname, 'movscript-agent-mcp.mjs')
const RUN_CWD = HAS_BUNDLED_RUNTIME ? PLUGIN_ROOT : DEV_REPO_ROOT

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function currentPluginIdentity(): { pluginVersion: string; pluginRoot: string } {
  return {
    pluginVersion: readPluginVersion(resolve(PLUGIN_ROOT, 'manifest.runtime.json'))
      ?? readPluginVersion(resolve(PLUGIN_ROOT, '.codex-plugin/plugin.json'))
      ?? 'unknown',
    pluginRoot: PLUGIN_ROOT,
  }
}

function readPluginVersion(manifestPath: string): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    return typeof manifest.version === 'string' && manifest.version.trim() ? manifest.version : undefined
  } catch {
    return undefined
  }
}

async function main(): Promise<void> {
  if (await runEmbeddedServiceCLI()) return
  if (await runLocalDaemonCLI()) return

  const homeDir = resolveMovScriptHomeDir()
  const startupPolicy = await prepareSessionStartupPolicy(homeDir)
  const runner = createScenarioApplicationRunner({
    homeDir,
    application: pluginApplicationManifest,
    scenario: startupPolicy,
    programs: createProgramAdapters(),
  })

  await runner.start()
  try {
    await startMCPStdioHost()
  } finally {
    await runner.shutdown()
  }
}

async function prepareSessionStartupPolicy(homeDir: string): Promise<ScenarioPolicyManifest> {
  const requested = (process.env.MOVSCRIPT_PLUGIN_MODE ?? process.env.MOVSCRIPT_PLUGIN_SCENARIO ?? '').trim().toLowerCase()
  if (requested === 'basic' || requested === 'plugin-basic') return pluginBasicStartupPolicy
  const startupPolicy = selectPluginStartupPolicy(homeDir)
  if (startupPolicy.scenarioId === pluginFullLocalStartupPolicy.scenarioId) {
    await ensureLocalNode(homeDir)
    return pluginBasicStartupPolicy
  }
  return startupPolicy
}

async function runEmbeddedServiceCLI(): Promise<boolean> {
  const [command, serviceName, ...args] = process.argv.slice(2)
  if (command !== '__movscript_service') return false
  switch (serviceName) {
    case 'project-service':
      await runProjectServiceCLI(args, process.env)
      return true
    case 'editing-service':
      await runEditingServiceCLI(args, process.env)
      return true
    case 'canvas-service':
      await runCanvasServiceCLI(args, process.env)
      return true
    case 'media-pipeline':
      await runMediaPipelineServiceCLI(args, process.env)
      return true
    default:
      throw new Error(`unknown embedded service: ${serviceName ?? ''}`)
  }
}

async function runLocalDaemonCLI(): Promise<boolean> {
  const rawArgs = process.argv.slice(2)
  const [command, subcommand] = rawArgs
  if (command === '__movscript_local_node' && subcommand === 'run') {
    await runPersistentLocalNode()
    return true
  }
  if (command === '__movscript_movcli') {
    if (subcommand === 'daemon' || subcommand === 'local-node') {
      await runLocalDaemonCommand(subcommand, rawArgs.slice(2))
      return true
    }
    await runMovcli([process.argv[0] ?? 'node', 'movcli', ...rawArgs.slice(1)])
    return true
  }
  if (command === 'cli') {
    const [cliCommand, ...cliArgs] = rawArgs.slice(1)
    if (!cliCommand || cliCommand === '--help' || cliCommand === '-h' || cliCommand === 'help') {
      printMovScriptCLIHelp()
      return true
    }
    if (cliCommand !== 'daemon' && cliCommand !== 'local-node') {
      await runMovcli([process.argv[0] ?? 'node', 'movcli', ...rawArgs.slice(1)])
      return true
    }
    await runLocalDaemonCommand(cliCommand, cliArgs)
    return true
  }
  if (command !== 'daemon' && command !== 'local-node') return false
  await runLocalDaemonCommand(command, rawArgs.slice(1))
  return true
}

async function runLocalDaemonCommand(command: string, rawArgs: string[]): Promise<void> {
  const parsed = parseLocalDaemonArgs(command, rawArgs)
  if (parsed.options.help) {
    printLocalDaemonHelp(command)
    return
  }
  const homeDir = parsed.options.homeDir ?? resolveMovScriptHomeDir()
  switch (parsed.subcommand) {
    case 'status':
      process.stdout.write(`${JSON.stringify(await probeLocalRuntimeDaemon(homeDir), null, 2)}\n`)
      return
    case 'stop':
      process.stdout.write(`${JSON.stringify(await stopLocalRuntimeDaemon(homeDir, { force: parsed.options.force }), null, 2)}\n`)
      return
    case 'restart':
      if (parsed.options.dataPlane || parsed.options.dataServiceURL || parsed.options.idleTimeout) {
        await stopLocalRuntimeDaemon(homeDir, { force: true }).catch(() => undefined)
        process.stdout.write(`${JSON.stringify(await ensureLocalNode(homeDir, parsed.options), null, 2)}\n`)
        return
      }
      process.stdout.write(`${JSON.stringify(await localRuntimeControlRequest(homeDir, 'POST', '/restart'), null, 2)}\n`)
      return
    case undefined:
    case 'start':
      process.stdout.write(`${JSON.stringify(await ensureLocalNode(homeDir, parsed.options), null, 2)}\n`)
      return
    default:
      throw new Error(`unknown ${command} command: ${parsed.subcommand}`)
  }
}

interface LocalDaemonCLIOptions {
  dataPlane?: LocalDaemonDataPlane
  dataServiceURL?: string
  force?: boolean
  help?: boolean
  homeDir?: string
  idleTimeout?: string
}

function parseLocalDaemonArgs(command: string, rawArgs: string[]): { subcommand: string | undefined; options: LocalDaemonCLIOptions } {
  const options: LocalDaemonCLIOptions = {}
  let subcommand: string | undefined
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index]
    if (!arg) continue
    if (!subcommand && !arg.startsWith('-')) {
      subcommand = arg
      continue
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg === '--force') {
      options.force = true
      continue
    }
    const optionValue = (name: string): string => {
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1)
      const next = rawArgs[index + 1]
      if (!next || next.startsWith('-')) throw new Error(`${command} ${subcommand ?? 'start'} requires a value for ${name}`)
      index += 1
      return next
    }
    if (arg === '--home' || arg === '--home-dir' || arg.startsWith('--home=') || arg.startsWith('--home-dir=')) {
      options.homeDir = resolve(optionValue(arg.startsWith('--home-dir') ? '--home-dir' : '--home'))
      continue
    }
    if (arg === '--data-plane' || arg.startsWith('--data-plane=')) {
      options.dataPlane = parseLocalDaemonDataPlane(optionValue('--data-plane'))
      continue
    }
    if (arg === '--data-service-url' || arg.startsWith('--data-service-url=')) {
      options.dataServiceURL = optionValue('--data-service-url')
      continue
    }
    if (arg === '--idle-timeout' || arg.startsWith('--idle-timeout=')) {
      options.idleTimeout = optionValue('--idle-timeout')
      continue
    }
    throw new Error(`unknown ${command} option: ${arg}`)
  }
  return { subcommand: subcommand ?? 'start', options }
}

function parseLocalDaemonDataPlane(value: string): LocalDaemonDataPlane {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'local' || normalized === 'cloud' || normalized === 'external') return normalized
  throw new Error(`invalid daemon data plane: ${value}`)
}

function localDaemonEnvFromOptions(options: LocalDaemonCLIOptions): NodeJS.ProcessEnv | undefined {
  const env: NodeJS.ProcessEnv = {}
  if (options.dataPlane) env.MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE = options.dataPlane
  if (options.dataServiceURL) env.MOVSCRIPT_DATA_SERVICE_URL = options.dataServiceURL
  if (options.idleTimeout) {
    env.MOVSCRIPT_LOCAL_DAEMON_IDLE_TIMEOUT = options.idleTimeout
    env.MOVSCRIPT_LOCAL_NODE_IDLE_TIMEOUT = options.idleTimeout
  }
  return Object.keys(env).length > 0 ? env : undefined
}

function printMovScriptCLIHelp(): void {
  process.stdout.write([
    'MovScript command line',
    '',
    'Usage:',
    '  movscript daemon <start|status|stop|restart> [options]',
    '',
    'The MCP entrypoint also accepts daemon commands directly:',
    '  movscript-agent-mcp daemon status',
    '',
  ].join('\n'))
}

function printLocalDaemonHelp(command: string): void {
  process.stdout.write([
    `Usage: ${command} <start|status|stop|restart> [options]`,
    '',
    'Options:',
    '  --home <dir>                    MovScript home directory',
    '  --data-plane <local|cloud|external>',
    '  --data-service-url <url>        Cloud or external Data Service URL',
    '  --idle-timeout <duration>       Idle shutdown timeout, for example 30m or never',
    '  --force                        Force stop when no control endpoint responds',
    '',
  ].join('\n'))
}

function selectPluginStartupPolicy(homeDir: string): ScenarioPolicyManifest {
  const requested = (process.env.MOVSCRIPT_PLUGIN_MODE ?? process.env.MOVSCRIPT_PLUGIN_SCENARIO ?? '').trim().toLowerCase()
  if (requested === 'full-local' || requested === 'plugin-full-local') return pluginFullLocalStartupPolicy
  if (requested === 'basic' || requested === 'plugin-basic') return pluginBasicStartupPolicy
  if (requested === 'desktop' || requested === 'plugin-desktop-owned') return pluginDesktopOwnedStartupPolicy
  return pluginFullLocalStartupPolicy
}

async function ensureLocalNode(
  homeDir: string,
  options: LocalDaemonCLIOptions = {},
): Promise<Record<string, unknown>> {
  return await ensureLocalRuntimeDaemon({
    homeDir,
    entrypoint: AGENT_MCP_ENTRYPOINT,
    runArgs: ['__movscript_local_node', 'run'],
    cwd: RUN_CWD,
    env: localDaemonEnvFromOptions(options),
    identity: currentPluginIdentity(),
  })
}

async function runPersistentLocalNode(): Promise<void> {
  const homeDir = resolveMovScriptHomeDir()
  const idleTimeoutMs = parseIdleTimeout(process.env.MOVSCRIPT_LOCAL_DAEMON_IDLE_TIMEOUT ?? process.env.MOVSCRIPT_LOCAL_NODE_IDLE_TIMEOUT)
  const pluginIdentity = currentPluginIdentity()
  const dataPlane = resolveLocalDaemonDataPlane(process.env)
  const dataServiceURL = resolveDataServiceURL(homeDir)
  const startupPolicy = localNodeStartupPolicyForDataPlane(dataPlane)
  let shouldExit = false
  let restartCount = 0

  while (!shouldExit) {
    let resolveAction!: (action: LocalNodeAction) => void
    const actionPromise = new Promise<LocalNodeAction>((resolveActionPromise) => {
      resolveAction = resolveActionPromise
    })
    const state: LocalNodeControlState = {
      homeDir,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      idleTimeoutMs,
      dataPlane,
      dataServiceURL,
      pluginIdentity,
      restartCount,
      requestAction: (action) => resolveAction(action),
      snapshot: () => readRuntimeHomeSnapshot(homeDir),
    }
    const runner = createScenarioApplicationRunner({
      homeDir,
      application: localNodeApplicationManifest,
      scenario: startupPolicy,
      programs: createProgramAdapters({ includeMCPHost: false, controlState: state }),
      log: (message, metadata) => {
        if (process.env.MOVSCRIPT_LOCAL_NODE_DEBUG === '1') {
          process.stderr.write(`[movscript-local-node] ${message} ${metadata ? JSON.stringify(metadata) : ''}\n`)
        }
      },
    })
    await runner.start()
    writeRuntimeAppRecord(homeDir, {
      applicationId: LOCAL_NODE_APP_ID,
      owner: 'agent-provider',
      profile: startupPolicy.scenarioId,
      pid: process.pid,
      status: 'ready',
      ready: true,
      metadata: {
        ...pluginIdentity,
        dataPlane,
        ...(dataServiceURL ? { dataServiceURL } : {}),
        idleTimeoutMs,
        restartCount,
      },
    })
    const signalAction = installLocalNodeSignalHandlers(resolveAction)
    const idleAction = startIdleWatcher(state)
    const action = await actionPromise
    idleAction()
    signalAction()
    await runner.shutdown()
    writeRuntimeAppRecord(homeDir, {
      applicationId: LOCAL_NODE_APP_ID,
      owner: 'agent-provider',
      profile: startupPolicy.scenarioId,
      pid: process.pid,
      status: action.type === 'restart' ? 'starting' : 'stopped',
      ready: action.type === 'restart',
      metadata: {
        ...pluginIdentity,
        dataPlane,
        ...(dataServiceURL ? { dataServiceURL } : {}),
        reason: action.reason,
        idleTimeoutMs,
        restartCount,
      },
    })
    if (action.type === 'restart') {
      restartCount += 1
      continue
    }
    shouldExit = true
  }
}

type LocalNodeAction = { type: 'shutdown' | 'restart'; reason: string }

interface LocalNodeControlState {
  homeDir: string
  startedAt: Date
  lastActivityAt: Date
  idleTimeoutMs: number | null
  dataPlane: LocalDaemonDataPlane
  dataServiceURL?: string
  pluginIdentity: { pluginVersion: string; pluginRoot: string }
  restartCount: number
  requestAction: (action: LocalNodeAction) => void
  snapshot: () => ReturnType<typeof readRuntimeHomeSnapshot>
}

function installLocalNodeSignalHandlers(requestAction: (action: LocalNodeAction) => void): () => void {
  const handleSignal = (signal: NodeJS.Signals) => {
    requestAction({ type: 'shutdown', reason: signal.toLowerCase() })
  }
  process.once('SIGTERM', handleSignal)
  process.once('SIGINT', handleSignal)
  return () => {
    process.off('SIGTERM', handleSignal)
    process.off('SIGINT', handleSignal)
  }
}

function startIdleWatcher(state: LocalNodeControlState): () => void {
  if (state.idleTimeoutMs === null) return () => undefined
  const intervalMs = Math.max(5000, Math.min(60000, Math.floor(state.idleTimeoutMs / 4)))
  const interval = setInterval(() => {
    if (Date.now() - state.lastActivityAt.getTime() >= state.idleTimeoutMs!) {
      state.requestAction({ type: 'shutdown', reason: 'idle_timeout' })
    }
  }, intervalMs)
  return () => clearInterval(interval)
}

function parseIdleTimeout(value: string | undefined): number | null {
  const raw = value?.trim().toLowerCase()
  if (!raw) return null
  if (raw === 'never' || raw === '0' || raw === 'off') return null
  const match = raw.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/)
  if (!match) throw new Error(`invalid local daemon idle timeout: ${value}`)
  const amount = Number(match[1])
  const unit = match[2] ?? 'ms'
  const factor = unit === 'h' ? 60 * 60 * 1000 : unit === 'm' ? 60 * 1000 : unit === 's' ? 1000 : 1
  return Math.max(1000, Math.floor(amount * factor))
}

type LocalDaemonDataPlane = 'local' | 'cloud' | 'external'

function resolveLocalDaemonDataPlane(env: NodeJS.ProcessEnv): LocalDaemonDataPlane {
  const explicit = (env.MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE ?? env.MOVSCRIPT_LOCAL_NODE_DATA_PLANE ?? '').trim().toLowerCase()
  if (explicit === 'local' || explicit === 'cloud' || explicit === 'external') return explicit
  const mode = (env.MOVSCRIPT_PLUGIN_MODE ?? env.MOVSCRIPT_PLUGIN_SCENARIO ?? '').trim().toLowerCase()
  if (mode === 'cloud' || mode === 'plugin-cloud') return 'cloud'
  const dataServiceURL = env.MOVSCRIPT_DATA_SERVICE_URL?.trim()
  if (dataServiceURL && !isLocalHTTPURL(dataServiceURL)) return 'external'
  return 'local'
}

function isLocalHTTPURL(value: string): boolean {
  try {
    const url = new URL(value)
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

function localNodeStartupPolicyForDataPlane(dataPlane: LocalDaemonDataPlane): ScenarioPolicyManifest {
  return dataPlane === 'local' ? localNodeStartupPolicy : localNodeCloudDataStartupPolicy
}

function createProgramAdapters(options: { includeMCPHost?: boolean; controlState?: LocalNodeControlState } = {}): ProgramAdapter[] {
  const adapters: ProgramAdapter[] = [
    {
      manifest: pluginAgentLauncherProgramManifest,
      instanceId: `launcher-${process.pid}`,
      start: () => ({
        pid: process.pid,
      }),
      health: () => ({
        ready: true,
      }),
    },
  ]
  if (options.includeMCPHost !== false) {
    adapters.push({
      manifest: mcpHostProgramManifest,
      instanceId: `stdio-${process.pid}`,
      profile: 'stdio',
      start: () => ({
        pid: process.pid,
        endpoint: {
          protocol: 'stdio',
          url: 'stdio://movscript',
        },
      }),
      health: (_context, runtime) => ({
        ready: true,
        endpoint: runtime.endpoint,
      }),
    })
  }
  if (options.controlState) adapters.push(createLocalNodeControlProgramAdapter(options.controlState))
  adapters.push(
    createMediaPipelineProgramAdapter(),
    createDataServiceProgramAdapter(),
    createNodeServiceProgramAdapter({
      manifest: canvasServiceProgramManifest,
      instanceIdPrefix: 'canvas-service',
      embeddedServiceName: 'canvas-service',
      scriptPath: resolve(DEV_REPO_ROOT, 'services/canvas-service/bin/movscript-canvas-service.mjs'),
      env: (context, endpoint) => ({
        MOVSCRIPT_CANVAS_SERVICE_HOST: '127.0.0.1',
        MOVSCRIPT_CANVAS_SERVICE_PORT: String(endpoint.port),
        MOVSCRIPT_DATA_SERVICE_URL: resolveDataServiceURL(context.homeDir) ?? 'http://127.0.0.1:8765',
      }),
    }),
    createNodeServiceProgramAdapter({
      manifest: projectServiceProgramManifest,
      instanceIdPrefix: 'project-service',
      embeddedServiceName: 'project-service',
      scriptPath: resolve(DEV_REPO_ROOT, 'services/project-service/bin/movscript-project-service.mjs'),
      env: (_context, endpoint) => ({
        MOVSCRIPT_PROJECT_SERVICE_HOST: '127.0.0.1',
        MOVSCRIPT_PROJECT_SERVICE_PORT: String(endpoint.port),
      }),
    }),
    createNodeServiceProgramAdapter({
      manifest: editingServiceProgramManifest,
      instanceIdPrefix: 'editing-service',
      embeddedServiceName: 'editing-service',
      scriptPath: resolve(DEV_REPO_ROOT, 'services/editing-service/bin/movscript-editing-service.mjs'),
      env: (_context, endpoint) => ({
        MOVSCRIPT_EDITING_SERVICE_HOST: '127.0.0.1',
        MOVSCRIPT_EDITING_SERVICE_PORT: String(endpoint.port),
      }),
    }),
    createLocalSurfaceHostProgramAdapter(),
  )
  return adapters
}

type ClosableProgramRuntime = ProgramRuntime & {
  close?: () => Promise<void>
  child?: ChildProcess
  server?: Server
}

function writeLocalNodeGatewayRuntimeRecords(
  context: ProgramRunnerContext,
  state: LocalNodeControlState,
  port: number,
): void {
  const instanceId = `local-node-gateway-${process.pid}`
  const endpoint = {
    ...httpEndpoint(context, port),
    serviceName: LOCAL_NODE_GATEWAY_SERVICE,
  }
  writeRuntimeServiceRecord(context.homeDir, {
    serviceName: LOCAL_NODE_GATEWAY_SERVICE,
    instanceId,
    ownerApplicationId: LOCAL_NODE_APP_ID,
    profile: 'local',
    pid: process.pid,
    status: 'ready',
    ready: true,
    endpoint: {
      ...endpoint,
      instanceId,
    },
    metadata: {
      mode: 'local-daemon',
      role: 'stable-local-node-gateway',
      dataPlane: state.dataPlane,
      idleTimeoutMs: state.idleTimeoutMs,
      ...state.pluginIdentity,
    },
  })
  writeRuntimeEndpointRecord(context.homeDir, {
    ...endpoint,
    instanceId,
    pid: process.pid,
    status: 'ready',
    ready: true,
    metadata: {
      mode: 'local-daemon',
      role: 'stable-local-node-gateway',
    },
  })
}

function createLocalNodeControlProgramAdapter(state: LocalNodeControlState): ProgramAdapter {
  return {
    manifest: localNodeControlProgramManifest,
    instanceId: `local-node-control-${process.pid}`,
    profile: 'local',
    start: async (context: ProgramRunnerContext): Promise<ClosableProgramRuntime> => {
      const runtime = await startLocalNodeControlServer(state, localSurfaceHostStaticRoot())
      writeLocalNodeGatewayRuntimeRecords(context, state, runtime.port)
      return {
        pid: process.pid,
        endpoint: httpEndpoint(context, runtime.port),
        server: runtime.server,
        metadata: {
          mode: 'local-daemon',
          gatewayServiceName: LOCAL_NODE_GATEWAY_SERVICE,
          dataPlane: state.dataPlane,
          idleTimeoutMs: state.idleTimeoutMs,
          ...state.pluginIdentity,
        },
      }
    },
    health: (_context, runtime) => ({
      ready: Boolean(runtime.endpoint?.url),
      endpoint: runtime.endpoint,
    }),
    stop: async (_context, runtime) => {
      await closeProgramRuntime(runtime as ClosableProgramRuntime)
    },
  }
}

function createMediaPipelineProgramAdapter(): ProgramAdapter {
  return {
    manifest: mediaPipelineProgramManifest,
    instanceId: `media-pipeline-${process.pid}`,
    profile: 'local',
    start: async (context: ProgramRunnerContext): Promise<ClosableProgramRuntime> => {
      return startNodeHTTPServiceProgram({
        context,
        embeddedServiceName: 'media-pipeline',
        scriptPath: resolve(DEV_REPO_ROOT, 'services/media-pipeline/bin/movscript-media-pipeline.mjs'),
        env: (_context, endpoint) => ({
          MOVSCRIPT_MEDIA_PIPELINE_HOST: '127.0.0.1',
          MOVSCRIPT_MEDIA_PIPELINE_PORT: String(endpoint.port),
        }),
        metadata: {
          mode: 'plugin-full-local',
          runtime: 'media_pipeline_service',
        },
      })
    },
    health: (_context: ProgramRunnerContext, runtime: ProgramRuntime) => ({
      ready: Boolean(runtime.endpoint?.url),
      endpoint: runtime.endpoint,
    }),
    stop: async (_context: ProgramRunnerContext, runtime: ProgramRuntime) => {
      await closeProgramRuntime(runtime as ClosableProgramRuntime)
    },
  }
}

function createDataServiceProgramAdapter(): ProgramAdapter {
  return {
    manifest: dataServiceProgramManifest,
    instanceId: `data-service-${process.pid}`,
    profile: 'local',
    start: async (context: ProgramRunnerContext): Promise<ClosableProgramRuntime> => {
      const port = await reservePort()
      const dataDir = join(context.homeDir, 'data-service')
      const encryptionKey = process.env.ENCRYPTION_KEY?.trim() || readOrCreateLocalEncryptionKey(dataDir)
      const binaryPath = process.env.MOVSCRIPT_DATA_SERVICE_BINARY
        ? resolve(process.env.MOVSCRIPT_DATA_SERVICE_BINARY)
        : resolveFirstExisting(
            resolve(PLUGIN_ROOT, 'runtime/services/data-service/bin/movscript-server'),
            resolve(DEV_REPO_ROOT, 'services/data-service/bin/movscript-server'),
          )
      if (!existsSync(binaryPath)) {
        throw new Error(`Data Service binary was not found: ${binaryPath}`)
      }
      const child = spawn(binaryPath, [], {
        cwd: dirname(dirname(binaryPath)),
        env: {
          ...process.env,
          MOVSCRIPT_HOME: context.homeDir,
          MOVSCRIPT_APP_MODE: 'local',
          MOVSCRIPT_DEPLOYMENT_MODE: 'local',
          MOVSCRIPT_DEPENDENCY_PROFILE: 'local',
          MOVSCRIPT_DATA_DIR: dataDir,
          DB_DRIVER: 'sqlite',
          DB_PATH: join(dataDir, 'movscript.db'),
          ENCRYPTION_KEY: encryptionKey,
          SERVER_PORT: String(port),
          MOVSCRIPT_AUTH_MODE: 'local-owner',
          MOVSCRIPT_CORS_ALLOWED_ORIGINS: '*',
        },
        stdio: ['ignore', 'ignore', 'pipe'],
      })
      const stderr = collectChildStderr(child)
      child.once('exit', (code, signal) => {
        if (code !== null && code !== 0) context.log('data-service exited', { code, stderr: stderr() })
        if (signal) context.log('data-service exited by signal', { signal, stderr: stderr() })
      })
      const endpoint = httpEndpoint(context, port)
      await waitForHTTP(`${endpoint.url}/health`, child, stderr)
      return {
        pid: child.pid,
        endpoint,
        child,
        metadata: {
          mode: 'plugin-full-local',
          runtime: 'data_service_process',
        },
      }
    },
    health: (_context: ProgramRunnerContext, runtime: ProgramRuntime) => ({
      ready: Boolean(runtime.endpoint?.url),
      endpoint: runtime.endpoint,
    }),
    stop: async (_context: ProgramRunnerContext, runtime: ProgramRuntime) => {
      await closeProgramRuntime(runtime as ClosableProgramRuntime)
    },
  }
}

function readOrCreateLocalEncryptionKey(dataDir: string): string {
  const keyPath = join(dataDir, 'local-encryption-key.hex')
  if (existsSync(keyPath)) {
    const existing = readFileSync(keyPath, 'utf8').trim()
    if (/^[0-9a-f]{64}$/i.test(existing)) return existing
    throw new Error(`invalid local Data Service encryption key file: ${keyPath}`)
  }
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  const key = randomBytes(32).toString('hex')
  writeFileSync(keyPath, `${key}\n`, { encoding: 'utf8', mode: 0o600 })
  return key
}

function createNodeServiceProgramAdapter(options: {
  manifest: ProgramManifest
  instanceIdPrefix: string
  embeddedServiceName: string
  scriptPath: string
  env: (context: ProgramRunnerContext, endpoint: { port: number }) => NodeJS.ProcessEnv
}): ProgramAdapter {
  return {
    manifest: options.manifest,
    instanceId: `${options.instanceIdPrefix}-${process.pid}`,
    profile: 'local',
    start: (context: ProgramRunnerContext): Promise<ClosableProgramRuntime> => startNodeHTTPServiceProgram({
      context,
      embeddedServiceName: options.embeddedServiceName,
      scriptPath: options.scriptPath,
      env: options.env,
      metadata: {
        mode: 'plugin-full-local',
        runtime: `${options.instanceIdPrefix}_process`,
      },
    }),
    health: (_context: ProgramRunnerContext, runtime: ProgramRuntime) => ({
      ready: Boolean(runtime.endpoint?.url),
      endpoint: runtime.endpoint,
    }),
    stop: async (_context: ProgramRunnerContext, runtime: ProgramRuntime) => {
      await closeProgramRuntime(runtime as ClosableProgramRuntime)
    },
  }
}

function createLocalSurfaceHostProgramAdapter(): ProgramAdapter {
  return {
    manifest: localSurfaceHostProgramManifest,
    instanceId: `local-surface-host-${process.pid}`,
    profile: 'local',
    start: async (context: ProgramRunnerContext): Promise<ClosableProgramRuntime> => {
      const staticRoot = localSurfaceHostStaticRoot()
      const runtime = await startStaticHTTPServer(staticRoot, context.homeDir)
      return {
        pid: process.pid,
        endpoint: httpEndpoint(context, runtime.port),
        server: runtime.server,
        metadata: {
          mode: context.profile === 'desktop-connected' ? 'plugin-desktop-owned' : 'plugin-full-local',
          role: 'agent-facing-surface-host',
          runtime: 'local_surface_host_static',
          staticRoot,
        },
      }
    },
    health: (_context: ProgramRunnerContext, runtime: ProgramRuntime) => ({
      ready: Boolean(runtime.endpoint?.url),
      endpoint: runtime.endpoint,
    }),
    stop: async (_context: ProgramRunnerContext, runtime: ProgramRuntime) => {
      await closeProgramRuntime(runtime as ClosableProgramRuntime)
    },
  }
}

async function startNodeHTTPServiceProgram(input: {
  context: ProgramRunnerContext
  embeddedServiceName: string
  scriptPath: string
  env: (context: ProgramRunnerContext, endpoint: { port: number }) => NodeJS.ProcessEnv
  metadata: Record<string, unknown>
}): Promise<ClosableProgramRuntime> {
  if (!HAS_BUNDLED_RUNTIME && !existsSync(input.scriptPath)) throw new Error(`service script was not found: ${input.scriptPath}`)
  const port = await reservePort()
  const args = HAS_BUNDLED_RUNTIME
    ? [AGENT_MCP_ENTRYPOINT, '__movscript_service', input.embeddedServiceName, 'serve']
    : [input.scriptPath, 'serve']
  const child = spawn(process.execPath, args, {
    cwd: RUN_CWD,
    env: {
      ...process.env,
      MOVSCRIPT_HOME: input.context.homeDir,
      ...input.env(input.context, { port }),
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  const stderr = collectChildStderr(child)
  child.once('exit', (code, signal) => {
    if (code !== null && code !== 0) input.context.log('node service exited', { serviceName: input.context.program.serviceName, code, stderr: stderr() })
    if (signal) input.context.log('node service exited by signal', { serviceName: input.context.program.serviceName, signal, stderr: stderr() })
  })
  const endpoint = httpEndpoint(input.context, port)
  await waitForHTTP(`${endpoint.url}/health`, child, stderr)
  return {
    pid: child.pid,
    endpoint,
    child,
    metadata: input.metadata,
  }
}

function resolveFirstExisting(...paths: string[]): string {
  return paths.find((path) => existsSync(path)) ?? paths[0] ?? ''
}

function httpEndpoint(context: ProgramRunnerContext, port: number) {
  const url = `http://127.0.0.1:${port}`
  return {
    serviceName: context.program.serviceName,
    protocol: 'http',
    url,
    baseURL: url,
    port,
    applicationId: context.application.applicationId,
  }
}

async function reservePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => resolveListen())
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose())
  })
  if (!port) throw new Error('failed to reserve local port')
  return port
}

function collectChildStderr(child: ChildProcess): () => string {
  const chunks: string[] = []
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk) => {
    chunks.push(String(chunk))
    if (chunks.join('').length > 16000) chunks.splice(0, chunks.length - 8)
  })
  return () => chunks.join('')
}

async function waitForHTTP(url: string, child: ChildProcess, stderr: () => string): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 15000) {
    if (child.exitCode !== null) {
      throw new Error(`service exited before becoming healthy: ${stderr()}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Keep polling until the service accepts connections.
    }
    await new Promise((resolvePoll) => setTimeout(resolvePoll, 100))
  }
  throw new Error(`service did not become healthy at ${url}: ${stderr()}`)
}

async function closeProgramRuntime(runtime: ClosableProgramRuntime): Promise<void> {
  if (runtime.close) {
    await runtime.close()
    return
  }
  if (runtime.server) {
    await new Promise<void>((resolveClose, rejectClose) => {
      runtime.server?.close((error) => error ? rejectClose(error) : resolveClose())
    })
  }
  if (runtime.child && runtime.child.exitCode === null) {
    runtime.child.kill('SIGTERM')
    await new Promise<void>((resolveExit) => {
      const timeout = setTimeout(() => {
        runtime.child?.kill('SIGKILL')
        resolveExit()
      }, 3000)
      runtime.child?.once('exit', () => {
        clearTimeout(timeout)
        resolveExit()
      })
    })
  }
}

async function startLocalNodeControlServer(state: LocalNodeControlState, staticRoot: string): Promise<{ server: Server; port: number }> {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const send = (status: number, payload: Record<string, unknown>) => {
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(payload))
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      state.lastActivityAt = new Date()
      send(200, { status: 'ok', serviceName: LOCAL_NODE_CONTROL_SERVICE, pid: process.pid })
      return
    }
    if (request.method === 'GET' && url.pathname === '/status') {
      send(200, localNodeStatusPayload(state))
      return
    }
    if (request.method === 'POST' && url.pathname === '/touch') {
      state.lastActivityAt = new Date()
      send(200, { status: 'touched', lastActivityAt: state.lastActivityAt.toISOString() })
      return
    }
    if (request.method === 'POST' && url.pathname === '/shutdown') {
      send(202, { status: 'stopping', pid: process.pid })
      setImmediate(() => state.requestAction({ type: 'shutdown', reason: 'explicit_stop' }))
      return
    }
    if (request.method === 'POST' && url.pathname === '/restart') {
      send(202, { status: 'restarting', pid: process.pid })
      setImmediate(() => state.requestAction({ type: 'restart', reason: 'explicit_restart' }))
      return
    }
    if (await handleLocalSurfaceGatewayRequest(staticRoot, state.homeDir, request, response, url)) {
      return
    }
    send(404, { error: 'not_found' })
  })
  const requestedPort = resolveLocalNodeGatewayPort()
  const port = await new Promise<number>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(requestedPort, '127.0.0.1', () => {
      const address = server.address()
      resolveListen(typeof address === 'object' && address ? address.port : 0)
    })
  })
  if (!port) throw new Error('failed to start local-node control server')
  return { server, port }
}

function resolveLocalNodeGatewayPort(): number {
  const explicit = Number(
    process.env.MOVSCRIPT_LOCAL_NODE_GATEWAY_PORT
      ?? process.env.MOVSCRIPT_LOCAL_NODE_PORT
      ?? '',
  )
  if (Number.isInteger(explicit) && explicit > 0 && explicit < 65536) return explicit
  const legacy = Number(process.env.MOVSCRIPT_LOCAL_DAEMON_PORT ?? '')
  if (Number.isInteger(legacy) && legacy > 0 && legacy < 65536) return legacy
  return DEFAULT_LOCAL_NODE_GATEWAY_PORT
}

function localNodeStatusPayload(state: LocalNodeControlState): Record<string, unknown> {
  const now = new Date()
  const snapshot = state.snapshot()
  return {
    status: 'ready',
    applicationId: LOCAL_NODE_APP_ID,
    pid: process.pid,
    homeDir: state.homeDir,
    ...state.pluginIdentity,
    dataPlane: state.dataPlane,
    ...(state.dataServiceURL ? { dataServiceURL: state.dataServiceURL } : {}),
    startedAt: state.startedAt.toISOString(),
    lastActivityAt: state.lastActivityAt.toISOString(),
    idleTimeoutMs: state.idleTimeoutMs,
    idleForMs: now.getTime() - state.lastActivityAt.getTime(),
    restartCount: state.restartCount,
    services: snapshot.services
      .filter((record) => record.ownerApplicationId === LOCAL_NODE_APP_ID)
      .filter((record) => record.instanceId?.endsWith(`-${process.pid}`))
      .filter((record) => record.ready !== true || pidIsAlive(record.pid))
      .map((record) => ({
        serviceName: record.serviceName,
        status: record.status,
        ready: record.ready,
        pid: record.pid,
        endpoint: endpointURL(record.endpoint),
      })),
  }
}

async function startStaticHTTPServer(staticRoot: string, homeDir: string): Promise<{ server: Server; port: number }> {
  if (!existsSync(join(staticRoot, 'index.html'))) {
    throw new Error(`Local Surface Host build output was not found: ${staticRoot}`)
  }
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ status: 'ok', serviceName: localSurfaceHostProgramManifest.serviceName }))
      return
    }
    if (await handleLocalSurfaceGatewayRequest(staticRoot, homeDir, request, response, url)) {
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ error: 'method_not_allowed' }))
      return
    }
    await serveLocalSurfaceStaticFile(staticRoot, request, response, url)
  })
  const port = await new Promise<number>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolveListen(typeof address === 'object' && address ? address.port : 0)
    })
  })
  if (!port) throw new Error('failed to start Local Surface Host static server')
  return { server, port }
}

async function handleLocalSurfaceGatewayRequest(
  staticRoot: string,
  homeDir: string,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (request.method === 'OPTIONS' && isGatewayAPIPath(url.pathname)) {
    response.writeHead(204, corsHeadersForRequest(request))
    response.end()
    return true
  }
  if (LOCAL_PROJECT_SERVICE_PROXY_ROUTES.has(url.pathname)) {
    await proxyProjectServiceRequest(homeDir, request, response, url)
    return true
  }
  if (request.method === 'POST' && url.pathname === '/local-api/editing/import-file') {
    await importLocalSurfaceEditingFile(homeDir, request, response, url)
    return true
  }
  if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/local-api/editing/media-file') {
    await serveLocalSurfaceEditingMediaFile(homeDir, request, response, url)
    return true
  }
  if (url.pathname === '/local-api/canvas' || url.pathname.startsWith('/local-api/canvas/')) {
    await proxyCanvasServiceRequest(homeDir, request, response, url)
    return true
  }
  if (url.pathname === '/local-api/data' || url.pathname.startsWith('/local-api/data/')) {
    await proxyDataServiceRequest(homeDir, request, response, url, '/local-api/data')
    return true
  }
  if (url.pathname === '/api/v1' || url.pathname.startsWith('/api/v1/')) {
    await proxyDataServiceRequest(homeDir, request, response, url, '')
    return true
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    await serveLocalSurfaceStaticFile(staticRoot, request, response, url)
    return true
  }
  return false
}

function isGatewayAPIPath(pathname: string): boolean {
  return pathname === '/api/v1'
    || pathname.startsWith('/api/v1/')
    || pathname === '/local-api/data'
    || pathname.startsWith('/local-api/data/')
    || pathname === '/local-api/canvas'
    || pathname.startsWith('/local-api/canvas/')
    || pathname.startsWith('/local-api/project/')
}

async function serveLocalSurfaceStaticFile(
  staticRoot: string,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> {
  const filePath = resolveStaticFilePath(staticRoot, url.pathname)
  if (request.method === 'HEAD') {
    response.writeHead(200, { 'content-type': contentType(filePath) })
    response.end()
    return
  }
  const stream = createReadStream(filePath)
  stream.once('error', () => {
    writeLocalSurfaceJSON(response, 500, {
      error: 'static_file_read_failed',
      message: `Failed to read Local Surface Host asset: ${filePath}`,
    })
  })
  stream.once('open', () => {
    response.writeHead(200, { 'content-type': contentType(filePath) })
  })
  stream.pipe(response)
}

function localSurfaceHostStaticRoot(): string {
  return resolveFirstExisting(
    resolve(PLUGIN_ROOT, 'runtime/services/local-surface-host/dist'),
    resolve(DEV_REPO_ROOT, 'services/local-surface-host/dist'),
  )
}

async function importLocalSurfaceEditingFile(
  homeDir: string,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const fileName = safeImportFileName(url.searchParams.get('filename') ?? 'media')
    const body = await readRequestBuffer(request)
    if (body.byteLength === 0) {
      writeLocalSurfaceJSON(response, 400, {
        error: 'empty_import_file',
        message: 'Imported file is empty.',
      })
      return
    }
    const importDir = join(homeDir, 'local-surface-host', 'imports', 'editing')
    mkdirSync(importDir, { recursive: true })
    const localPath = join(importDir, `${Date.now()}-${randomBytes(4).toString('hex')}-${fileName}`)
    writeFileSync(localPath, body)
    writeLocalSurfaceJSON(response, 200, {
      schema: 'movscript.local-surface.editing-import-file.v1',
      localPath,
      local_path: localPath,
      fileName,
      file_name: fileName,
      size: body.byteLength,
    })
  } catch (error) {
    writeLocalSurfaceJSON(response, 500, {
      error: 'editing_import_file_failed',
      message: errorMessage(error),
    })
  }
}

async function serveLocalSurfaceEditingMediaFile(
  homeDir: string,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const filePath = safeImportedEditingMediaPath(homeDir, url.searchParams.get('path') ?? '')
    if (!filePath || !existsSync(filePath)) {
      writeLocalSurfaceJSON(response, 404, {
        error: 'editing_media_file_not_found',
        message: 'Imported editing media file was not found.',
      })
      return
    }
    const stat = statSync(filePath)
    if (!stat.isFile()) {
      writeLocalSurfaceJSON(response, 404, {
        error: 'editing_media_file_not_found',
        message: 'Imported editing media path is not a file.',
      })
      return
    }

    const range = parseRangeHeader(request.headers.range, stat.size)
    const headers = {
      'accept-ranges': 'bytes',
      'content-type': contentType(filePath),
    }
    if (range) {
      response.writeHead(206, {
        ...headers,
        'content-length': String(range.end - range.start + 1),
        'content-range': `bytes ${range.start}-${range.end}/${stat.size}`,
      })
      if (request.method === 'HEAD') {
        response.end()
        return
      }
      createReadStream(filePath, { start: range.start, end: range.end }).pipe(response)
      return
    }

    response.writeHead(200, {
      ...headers,
      'content-length': String(stat.size),
    })
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    createReadStream(filePath).pipe(response)
  } catch (error) {
    writeLocalSurfaceJSON(response, 500, {
      error: 'editing_media_file_read_failed',
      message: errorMessage(error),
    })
  }
}

async function proxyCanvasServiceRequest(homeDir: string, request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  const endpoint = findRuntimeEndpoint(readRuntimeHomeSnapshot(homeDir), CANVAS_SERVICE_NAME)
  const baseURL = endpointURL(endpoint)
  if (!baseURL) {
    writeLocalSurfaceJSON(response, 503, {
      error: 'canvas_service_unavailable',
      message: 'Canvas Service endpoint was not found in MovScript runtime records.',
    })
    return
  }

  const upstreamPath = `/v1/canvas${url.pathname.slice('/local-api/canvas'.length)}${url.search}`
  try {
    const body = request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : bufferToFetchBody(await readRequestBuffer(request))
    const upstream = await fetch(`${baseURL}${upstreamPath}`, {
      method: request.method,
      headers: proxyHeaders(request),
      body,
    })
    await writeProxyUpstreamResponse(response, upstream, request)
  } catch (error) {
    writeLocalSurfaceJSON(response, 502, {
      error: 'canvas_service_proxy_failed',
      message: errorMessage(error),
    })
  }
}

async function proxyDataServiceRequest(
  homeDir: string,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  localPrefix: string,
): Promise<void> {
  const endpoint = findRuntimeEndpoint(readRuntimeHomeSnapshot(homeDir), DATA_SERVICE_NAME)
  const baseURL = endpointURL(endpoint)
  if (!baseURL) {
    writeLocalSurfaceJSON(response, 503, {
      error: 'data_service_unavailable',
      message: 'Data Service endpoint was not found in MovScript runtime records.',
    })
    return
  }

  const upstreamPath = `${localPrefix ? url.pathname.slice(localPrefix.length) || '/' : url.pathname}${url.search}`
  try {
    const body = request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : bufferToFetchBody(await readRequestBuffer(request))
    const upstream = await fetch(`${baseURL}${upstreamPath}`, {
      method: request.method,
      headers: proxyHeaders(request),
      body,
    })
    await writeProxyUpstreamResponse(response, upstream, request)
  } catch (error) {
    writeLocalSurfaceJSON(response, 502, {
      error: 'data_service_proxy_failed',
      message: errorMessage(error),
    })
  }
}

async function proxyProjectServiceRequest(homeDir: string, request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  const endpoint = findRuntimeEndpoint(readRuntimeHomeSnapshot(homeDir), PROJECT_SERVICE_NAME)
  const baseURL = endpointURL(endpoint)
  const upstreamPath = LOCAL_PROJECT_SERVICE_PROXY_ROUTES.get(url.pathname)
  if (!upstreamPath) {
    writeLocalSurfaceJSON(response, 404, {
      error: 'project_service_route_not_found',
      message: `Local Project Service proxy route was not found: ${url.pathname}`,
    })
    return
  }
  if (!baseURL) {
    writeLocalSurfaceJSON(response, 503, {
      error: 'project_service_unavailable',
      message: 'Project Service endpoint was not found in MovScript runtime records.',
    })
    return
  }

  try {
    const body = request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : bufferToFetchBody(await readRequestBuffer(request))
    const upstream = await fetch(`${baseURL}${upstreamPath}${url.search}`, {
      method: request.method,
      headers: proxyHeaders(request),
      body,
    })
    await writeProxyUpstreamResponse(response, upstream, request)
  } catch (error) {
    writeLocalSurfaceJSON(response, 502, {
      error: 'project_service_proxy_failed',
      message: errorMessage(error),
    })
  }
}

async function writeProxyUpstreamResponse(response: ServerResponse, upstream: Response, request: IncomingMessage): Promise<void> {
  const headers = {
    ...proxyResponseHeaders(upstream.headers),
    ...corsHeadersForRequest(request),
  }
  if (!headers['content-type']) headers['content-type'] = 'application/json; charset=utf-8'
  response.writeHead(upstream.status, headers)
  if (upstream.body === null) {
    response.end()
    return
  }
  response.end(Buffer.from(await upstream.arrayBuffer()))
}

function corsHeadersForRequest(request: IncomingMessage): Record<string, string> {
  const origin = typeof request.headers.origin === 'string' ? request.headers.origin : ''
  if (!isAllowedLocalGatewayOrigin(origin)) return {}
  const requestedHeaders = typeof request.headers['access-control-request-headers'] === 'string'
    ? request.headers['access-control-request-headers']
    : 'content-type, authorization'
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': requestedHeaders,
    'access-control-allow-credentials': 'true',
    'access-control-max-age': '600',
    vary: 'Origin',
  }
}

function isAllowedLocalGatewayOrigin(origin: string): boolean {
  if (!origin) return false
  if (origin === 'movscript-admin://app') return true
  try {
    const url = new URL(origin)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  } catch {
    return false
  }
}

function proxyResponseHeaders(upstreamHeaders: Headers): Record<string, string> {
  const headers: Record<string, string> = {}
  const allowedHeaders = [
    'accept-ranges',
    'cache-control',
    'content-disposition',
    'content-encoding',
    'content-language',
    'content-length',
    'content-range',
    'content-type',
    'etag',
    'expires',
    'last-modified',
  ]
  for (const key of allowedHeaders) {
    const value = upstreamHeaders.get(key)
    if (value) headers[key] = value
  }
  return headers
}

function proxyHeaders(request: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue
    const lower = key.toLowerCase()
    if (['host', 'connection', 'content-length'].includes(lower)) continue
    headers[key] = Array.isArray(value) ? value.join(', ') : value
  }
  return headers
}

function writeLocalSurfaceJSON(response: ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

async function readRequestText(request: IncomingMessage): Promise<string> {
  return (await readRequestBuffer(request)).toString('utf8')
}

async function readRequestBuffer(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function bufferToFetchBody(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const body = new Uint8Array(buffer.byteLength)
  body.set(buffer)
  return body
}

function safeImportFileName(value: string): string {
  const rawName = basename(value.replaceAll('\\', '/')).trim()
  const safeName = rawName
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '_')
    .replace(/^\.+$/, 'media')
    .slice(0, 160)
  return safeName || 'media'
}

function safeImportedEditingMediaPath(homeDir: string, value: string): string | undefined {
  const importRoot = resolve(homeDir, 'local-surface-host', 'imports', 'editing')
  if (!value) return undefined
  const filePath = resolve(value)
  return filePath === importRoot || filePath.startsWith(`${importRoot}/`) ? filePath : undefined
}

function parseRangeHeader(rangeHeader: string | undefined, size: number): { start: number; end: number } | undefined {
  if (!rangeHeader || size <= 0) return undefined
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!match) return undefined
  const startRaw = match[1]
  const endRaw = match[2]
  if (!startRaw && !endRaw) return undefined
  if (!startRaw) {
    const suffixLength = Number(endRaw)
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return undefined
    const start = Math.max(0, size - suffixLength)
    return { start, end: size - 1 }
  }
  const start = Number(startRaw)
  const end = endRaw ? Number(endRaw) : size - 1
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) return undefined
  return { start, end: Math.min(end, size - 1) }
}

function safeStaticPath(staticRoot: string, pathname: string): string {
  const normalized = pathname === '/' ? '/index.html' : pathname
  const filePath = resolve(staticRoot, `.${decodeURIComponent(normalized)}`)
  if (!filePath.startsWith(resolve(staticRoot))) return join(staticRoot, 'index.html')
  return filePath
}

function resolveStaticFilePath(staticRoot: string, pathname: string): string {
  const filePath = safeStaticPath(staticRoot, pathname)
  try {
    if (statSync(filePath).isFile()) return filePath
  } catch {
    // Fall back to the single-page app entry for project/admin routes.
  }
  return join(staticRoot, 'index.html')
}

function contentType(path: string): string {
  switch (extname(path)) {
    case '.html': return 'text/html; charset=utf-8'
    case '.js': return 'text/javascript; charset=utf-8'
    case '.css': return 'text/css; charset=utf-8'
    case '.json': return 'application/json; charset=utf-8'
    case '.png': return 'image/png'
    case '.svg': return 'image/svg+xml'
    default: return 'application/octet-stream'
  }
}

function endpointURL(endpoint: { url?: string; baseURL?: string; port?: number; protocol?: string } | undefined): string | undefined {
  if (!endpoint) return undefined
  if (endpoint.url) return endpoint.url
  if (endpoint.baseURL) return endpoint.baseURL
  if (endpoint.port && endpoint.protocol === 'http') return `http://127.0.0.1:${endpoint.port}`
  if (endpoint.port) return `http://127.0.0.1:${endpoint.port}`
  return undefined
}

function resolveDataServiceURL(homeDir: string): string | undefined {
  return process.env.MOVSCRIPT_DATA_SERVICE_URL?.trim()
    || endpointURL(findRuntimeEndpoint(readRuntimeHomeSnapshot(homeDir), 'movscript.data.service'))
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

const localNodeApplicationManifest = {
  schema: MOVSCRIPT_APPLICATION_MANIFEST_SCHEMA,
  applicationId: LOCAL_NODE_APP_ID,
  name: 'MovScript Local Node',
  owner: 'agent-provider',
  programs: [
    LOCAL_NODE_CONTROL_SERVICE,
    'movscript.data.service',
    'movscript.project.service',
    'movscript.editing.service',
    'movscript.canvas.service',
    'movscript.local-surface.host',
    'movscript.media.pipeline',
  ],
} satisfies ApplicationManifest

const localNodeStartupPolicy = {
  schema: MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
  scenarioId: 'plugin-full-local',
  applicationId: LOCAL_NODE_APP_ID,
  programs: [
    { serviceName: LOCAL_NODE_CONTROL_SERVICE, required: true, profile: 'local' },
    { serviceName: 'movscript.data.service', required: true, profile: 'local' },
    { serviceName: 'movscript.project.service', required: true, profile: 'local' },
    { serviceName: 'movscript.editing.service', required: true, profile: 'local' },
    { serviceName: 'movscript.canvas.service', required: true, profile: 'local' },
    { serviceName: 'movscript.local-surface.host', required: true, profile: 'local' },
    { serviceName: 'movscript.media.pipeline', required: true, profile: 'local' },
  ],
} satisfies ScenarioPolicyManifest

const localNodeCloudDataStartupPolicy = {
  schema: MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
  scenarioId: 'local-daemon-cloud-data',
  applicationId: LOCAL_NODE_APP_ID,
  programs: [
    { serviceName: LOCAL_NODE_CONTROL_SERVICE, required: true, profile: 'local' },
    { serviceName: 'movscript.project.service', required: true, profile: 'local' },
    { serviceName: 'movscript.editing.service', required: true, profile: 'local' },
    { serviceName: 'movscript.canvas.service', required: true, profile: 'local' },
    { serviceName: 'movscript.local-surface.host', required: true, profile: 'local' },
    { serviceName: 'movscript.media.pipeline', required: true, profile: 'local' },
  ],
} satisfies ScenarioPolicyManifest

const dataServiceProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'data-service',
  serviceName: 'movscript.data.service',
  kind: 'service',
  name: 'MovScript Data Service',
  profiles: ['local', 'cloud', 'test'],
  transport: 'http',
  health: { kind: 'http', target: '/health' },
} satisfies ProgramManifest

const localNodeControlProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'local-node-control',
  serviceName: LOCAL_NODE_CONTROL_SERVICE,
  kind: 'service',
  name: 'MovScript Local Node Control',
  profiles: ['local', 'plugin-full-local', 'test'],
  transport: 'http',
  health: { kind: 'http', target: '/health' },
} satisfies ProgramManifest

const projectServiceProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'project-service',
  serviceName: 'movscript.project.service',
  kind: 'service',
  name: 'MovScript Project Service',
  profiles: ['local', 'cloud', 'test'],
  transport: 'http',
  health: { kind: 'http', target: '/health' },
  dependsOn: ['movscript.data.service'],
} satisfies ProgramManifest

const editingServiceProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'editing-service',
  serviceName: 'movscript.editing.service',
  kind: 'service',
  name: 'MovScript Editing Service',
  profiles: ['local', 'cloud', 'test'],
  transport: 'http',
  health: { kind: 'http', target: '/health' },
  dependsOn: ['movscript.project.service', 'movscript.data.service'],
} satisfies ProgramManifest

const canvasServiceProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'canvas-service',
  serviceName: 'movscript.canvas.service',
  kind: 'service',
  name: 'MovScript Canvas Service',
  profiles: ['local', 'cloud', 'test'],
  transport: 'http',
  health: { kind: 'http', target: '/health' },
  dependsOn: ['movscript.data.service'],
} satisfies ProgramManifest

const localSurfaceHostProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'local-surface-host',
  serviceName: 'movscript.local-surface.host',
  kind: 'web',
  name: 'MovScript Local Surface Host',
  profiles: ['local', 'plugin-full-local', 'desktop-connected', 'desktop-embedded', 'test'],
  transport: 'http',
  health: { kind: 'http', target: '/health' },
  provides: ['surface-host-local', 'project-surface-url', 'canvas-surface-local-url', 'admin-surface-local-url'],
} satisfies ProgramManifest

const mediaPipelineProgramManifest = {
  schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  programId: 'media-pipeline',
  serviceName: 'movscript.media.pipeline',
  kind: 'service',
  name: 'MovScript Media Pipeline',
  profiles: ['local', 'cloud', 'desktop', 'plugin-full-local', 'test'],
  transport: 'http',
  health: { kind: 'http', target: '/health' },
  dependsOn: ['movscript.data.service'],
} satisfies ProgramManifest

main().catch((error) => {
  process.stderr.write(`MovScript Agent MCP host failed: ${errorMessage(error)}\n`)
  process.exit(1)
})
