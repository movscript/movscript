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
import { handleMCPHostJSONRPC, listMCPHostTools, startMCPStdioHost } from '@movscript/mcp-host/stdio'
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
  pluginDesktopCompatibilityStartupPolicy,
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
const EDITING_SERVICE_NAME = 'movscript.editing.service'
const CANVAS_SERVICE_NAME = 'movscript.canvas.service'
const DATA_SERVICE_NAME = 'movscript.data.service'
const DEFAULT_LOCAL_NODE_GATEWAY_PORT = 8766
const RUNTIME_ENDPOINT_WAIT_TIMEOUT_MS = 5000
const RUNTIME_ENDPOINT_WAIT_INTERVAL_MS = 100
const DAEMON_RUNTIME_DESCRIPTOR_ENDPOINT = '/v1/runtime/descriptor'
const DAEMON_RUNTIME_STATUS_ENDPOINT = '/v1/runtime/status'
const DAEMON_RUNTIME_DIAGNOSTICS_ENDPOINT = '/v1/runtime/diagnostics'
const DAEMON_RUNTIME_CONFIGURE_ENDPOINT = '/v1/runtime/configure'
const DAEMON_MCP_ENDPOINT = '/v1/mcp'
const DAEMON_MCP_HEALTH_ENDPOINT = '/v1/mcp/health'
const LEGACY_MCP_ENDPOINT = '/mcp'
const DAEMON_CONTEXT_ENDPOINT = '/v1/context'
const DAEMON_CONTEXT_SESSIONS_ENDPOINT = '/v1/context/sessions'
const LOCAL_PROJECT_SERVICE_PROXY_PREFIX = '/v1/project'
const LOCAL_PROJECT_SERVICE_ALIAS_PREFIX = '/local-api/project'
const LOCAL_PROJECT_SERVICE_PROXY_ROUTES = new Map<string, string>([
  ['/v1/project/read-model', '/v1/project/read-model'],
  ['/v1/project/lifecycle/command', '/v1/project/lifecycle/command'],
  ['/v1/project/locator/resolve', '/v1/project/locator/resolve'],
  ['/v1/project/source/snapshot', '/v1/project/source/snapshot'],
  ['/v1/project/source/inspect', '/v1/project/source/inspect'],
  ['/v1/project/source/overview', '/v1/project/source/overview'],
  ['/v1/project/source/interpret', '/v1/project/source/interpret'],
  ['/v1/project/source/regeneration-plan', '/v1/project/source/regeneration-plan'],
  ['/v1/project/source/command', '/v1/project/source/command'],
  ['/v1/project/entities/query', '/v1/project/entities/query'],
  ['/v1/project/settings/query', '/v1/project/settings/query'],
  ['/v1/project/assets/query', '/v1/project/assets/query'],
  ['/v1/project/content-workspace/snapshot', '/v1/project/content-workspace/snapshot'],
  ['/v1/project/content-workspace/read', '/v1/project/content-workspace/read'],
  ['/v1/project/standards/upsert', '/v1/project/standards/upsert'],
  ['/v1/project/scripts/source/read', '/v1/project/scripts/source/read'],
  ['/v1/project/scripts/upsert', '/v1/project/scripts/upsert'],
  ['/v1/project/scripts/versions/snapshot', '/v1/project/scripts/versions/snapshot'],
  ['/v1/project/settings/upsert', '/v1/project/settings/upsert'],
  ['/v1/project/settings/create', '/v1/project/settings/create'],
  ['/v1/project/settings/states/create', '/v1/project/settings/states/create'],
  ['/v1/project/assets/upsert', '/v1/project/assets/upsert'],
  ['/v1/project/assets/create', '/v1/project/assets/create'],
  ['/v1/project/productions/snapshot/save', '/v1/project/productions/snapshot/save'],
  ['/v1/project/content-units/upsert', '/v1/project/content-units/upsert'],
  ['/v1/project/content-units/create', '/v1/project/content-units/create'],
  ['/v1/project/content-units/ensure', '/v1/project/content-units/ensure'],
  ['/v1/project/timeline-assemblies/content-unit/ensure', '/v1/project/timeline-assemblies/content-unit/ensure'],
  ['/v1/project/content-units/edit-prompt/update', '/v1/project/content-units/edit-prompt/update'],
  ['/v1/project/productions/create', '/v1/project/productions/create'],
  ['/v1/project/segments/create', '/v1/project/segments/create'],
  ['/v1/project/scene-moments/create', '/v1/project/scene-moments/create'],
  ['/v1/project/scene-moments/settings/connect', '/v1/project/scene-moments/settings/connect'],
  ['/v1/project/expression-units/create', '/v1/project/expression-units/create'],
  ['/v1/project/expression-units/update', '/v1/project/expression-units/update'],
  ['/v1/project/keyframes/create', '/v1/project/keyframes/create'],
  ['/v1/project/storyboards/create', '/v1/project/storyboards/create'],
  ['/v1/project/storyboards/timeline/update', '/v1/project/storyboards/timeline/update'],
  ['/v1/project/audio-cues/create', '/v1/project/audio-cues/create'],
  ['/v1/project/audio-cues/update', '/v1/project/audio-cues/update'],
  ['/v1/project/entities/basics/update', '/v1/project/entities/basics/update'],
  ['/v1/project/entities/transition/update', '/v1/project/entities/transition/update'],
  ['/v1/project/entities/delete', '/v1/project/entities/delete'],
  ['/v1/project/hierarchy/write', '/v1/project/hierarchy/write'],
  ['/v1/project/namespaces/write', '/v1/project/namespaces/write'],
  ['/v1/project/content-canvases/list', '/v1/project/content-canvases/list'],
  ['/v1/project/content-canvases/write', '/v1/project/content-canvases/write'],
  ['/v1/project/content-canvases/rename', '/v1/project/content-canvases/rename'],
  ['/v1/project/content-canvases/run', '/v1/project/content-canvases/run'],
  ['/v1/project/content-canvases/delete', '/v1/project/content-canvases/delete'],
  ['/v1/project/workspace-candidates/select', '/v1/project/workspace-candidates/select'],
  ['/v1/project/workspace-candidates/append', '/v1/project/workspace-candidates/append'],
  ['/v1/project/workspace-candidates/asset-slots/create', '/v1/project/workspace-candidates/asset-slots/create'],
  ['/v1/project/workspace-candidates/keyframes/create', '/v1/project/workspace-candidates/keyframes/create'],
  ['/v1/project/content-candidates/create', '/v1/project/content-candidates/create'],
  ['/v1/project/content-unit-candidates/select', '/v1/project/content-unit-candidates/select'],
  ['/v1/project/content-unit-candidates/decide', '/v1/project/content-unit-candidates/decide'],
  ['/v1/project/resources/view', '/v1/project/resources/view'],
  ['/v1/project/candidates/command', '/v1/project/candidates/command'],
  ['/v1/project/candidates/view', '/v1/project/candidates/view'],
  ['/v1/project/prompt/context', '/v1/project/prompt/context'],
  ['/local-api/project/read-model', '/v1/project/read-model'],
  ['/local-api/project/lifecycle/command', '/v1/project/lifecycle/command'],
  ['/local-api/project/locator/resolve', '/v1/project/locator/resolve'],
  ['/local-api/project/source/snapshot', '/v1/project/source/snapshot'],
  ['/local-api/project/source/inspect', '/v1/project/source/inspect'],
  ['/local-api/project/source/overview', '/v1/project/source/overview'],
  ['/local-api/project/source/interpret', '/v1/project/source/interpret'],
  ['/local-api/project/source/regeneration-plan', '/v1/project/source/regeneration-plan'],
  ['/local-api/project/source/command', '/v1/project/source/command'],
  ['/local-api/project/entities/query', '/v1/project/entities/query'],
  ['/local-api/project/settings/query', '/v1/project/settings/query'],
  ['/local-api/project/assets/query', '/v1/project/assets/query'],
  ['/local-api/project/content-workspace/snapshot', '/v1/project/content-workspace/snapshot'],
  ['/local-api/project/content-workspace/read', '/v1/project/content-workspace/read'],
  ['/local-api/project/standards/upsert', '/v1/project/standards/upsert'],
  ['/local-api/project/scripts/source/read', '/v1/project/scripts/source/read'],
  ['/local-api/project/scripts/upsert', '/v1/project/scripts/upsert'],
  ['/local-api/project/scripts/versions/snapshot', '/v1/project/scripts/versions/snapshot'],
  ['/local-api/project/settings/upsert', '/v1/project/settings/upsert'],
  ['/local-api/project/settings/create', '/v1/project/settings/create'],
  ['/local-api/project/settings/states/create', '/v1/project/settings/states/create'],
  ['/local-api/project/assets/upsert', '/v1/project/assets/upsert'],
  ['/local-api/project/assets/create', '/v1/project/assets/create'],
  ['/local-api/project/productions/snapshot/save', '/v1/project/productions/snapshot/save'],
  ['/local-api/project/content-units/upsert', '/v1/project/content-units/upsert'],
  ['/local-api/project/content-units/create', '/v1/project/content-units/create'],
  ['/local-api/project/content-units/ensure', '/v1/project/content-units/ensure'],
  ['/local-api/project/timeline-assemblies/content-unit/ensure', '/v1/project/timeline-assemblies/content-unit/ensure'],
  ['/local-api/project/content-units/edit-prompt/update', '/v1/project/content-units/edit-prompt/update'],
  ['/local-api/project/productions/create', '/v1/project/productions/create'],
  ['/local-api/project/segments/create', '/v1/project/segments/create'],
  ['/local-api/project/scene-moments/create', '/v1/project/scene-moments/create'],
  ['/local-api/project/scene-moments/settings/connect', '/v1/project/scene-moments/settings/connect'],
  ['/local-api/project/expression-units/create', '/v1/project/expression-units/create'],
  ['/local-api/project/expression-units/update', '/v1/project/expression-units/update'],
  ['/local-api/project/keyframes/create', '/v1/project/keyframes/create'],
  ['/local-api/project/storyboards/create', '/v1/project/storyboards/create'],
  ['/local-api/project/storyboards/timeline/update', '/v1/project/storyboards/timeline/update'],
  ['/local-api/project/audio-cues/create', '/v1/project/audio-cues/create'],
  ['/local-api/project/audio-cues/update', '/v1/project/audio-cues/update'],
  ['/local-api/project/entities/basics/update', '/v1/project/entities/basics/update'],
  ['/local-api/project/entities/transition/update', '/v1/project/entities/transition/update'],
  ['/local-api/project/entities/delete', '/v1/project/entities/delete'],
  ['/local-api/project/hierarchy/write', '/v1/project/hierarchy/write'],
  ['/local-api/project/namespaces/write', '/v1/project/namespaces/write'],
  ['/local-api/project/content-canvases/list', '/v1/project/content-canvases/list'],
  ['/local-api/project/content-canvases/write', '/v1/project/content-canvases/write'],
  ['/local-api/project/content-canvases/rename', '/v1/project/content-canvases/rename'],
  ['/local-api/project/content-canvases/run', '/v1/project/content-canvases/run'],
  ['/local-api/project/content-canvases/delete', '/v1/project/content-canvases/delete'],
  ['/local-api/project/workspace-candidates/select', '/v1/project/workspace-candidates/select'],
  ['/local-api/project/workspace-candidates/append', '/v1/project/workspace-candidates/append'],
  ['/local-api/project/workspace-candidates/asset-slots/create', '/v1/project/workspace-candidates/asset-slots/create'],
  ['/local-api/project/workspace-candidates/keyframes/create', '/v1/project/workspace-candidates/keyframes/create'],
  ['/local-api/project/content-candidates/create', '/v1/project/content-candidates/create'],
  ['/local-api/project/content-unit-candidates/select', '/v1/project/content-unit-candidates/select'],
  ['/local-api/project/content-unit-candidates/decide', '/v1/project/content-unit-candidates/decide'],
  ['/local-api/project/resources/view', '/v1/project/resources/view'],
  ['/local-api/project/candidates/command', '/v1/project/candidates/command'],
  ['/local-api/project/candidates/view', '/v1/project/candidates/view'],
  ['/local-api/project/prompt/context', '/v1/project/prompt/context'],
])
const daemonContextSessions = new Map<string, DaemonContextEnvelope>()
const PLUGIN_ROOT = resolve(import.meta.dirname, '..')
const DEV_REPO_ROOT = resolve(import.meta.dirname, '../../..')
const BUNDLED_RUNTIME_ROOT = resolve(PLUGIN_ROOT, 'runtime')
const HAS_BUNDLED_RUNTIME = existsSync(BUNDLED_RUNTIME_ROOT)
const AGENT_MCP_ENTRYPOINT = resolve(import.meta.dirname, 'movscript.mjs')
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
  if (isLegacyAgentMCPInvocation()) {
    await runPluginMCPStdioSession()
    return
  }

  await runMovcli([process.argv[0] ?? 'node', 'movscript', ...process.argv.slice(2)])
}

async function runPluginMCPStdioSession(): Promise<void> {
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
  if (command === 'mcp' && (subcommand === undefined || subcommand === 'stdio')) {
    await runPluginMCPStdioSession()
    return true
  }
  if (command === '__movscript_local_node' && subcommand === 'run') {
    await runPersistentLocalNode()
    return true
  }
  if ((command === 'daemon' || command === 'local-node') && subcommand === 'run') {
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

interface DaemonContextEnvelope {
  schema: 'movscript.context-envelope.v1'
  contextId: string
  revision: number
  issuedAt: string
  runtime: {
    owner: 'local-node'
    appId: string
    gatewayPrefix: '/v1'
  }
  principal: {
    userId: string
    kind: 'local-owner' | 'cloud-user' | 'service-account' | 'external-user'
    accountId?: string
    displayName?: string
    scopeKind?: 'user' | 'org' | 'local'
    scopeId?: string | number
  }
  dataConnection: {
    kind: LocalDaemonDataPlane
    authMode: 'local-owner' | 'session' | 'external'
    status: 'connected' | 'degraded' | 'unavailable'
    displayName: string
  }
  session?: DaemonWorkspaceSessionContext
}

interface DaemonRuntimeDescriptor {
  schema: 'movscript.runtime-descriptor.v1'
  runtime: {
    owner: 'movscript.local-node'
    appId: 'movscript.local-node'
    name: 'MovScript Local Node Daemon'
  }
  gateway: {
    baseURL: string
    canonicalPrefix: '/v1'
    mcpEndpoint: string
    mcpHealthEndpoint: string
  }
  dataConnection: DaemonContextEnvelope['dataConnection']
  capabilities: {
    project: boolean
    canvas: boolean
    resources: boolean
    editing: boolean
    media: boolean
  }
}

interface DaemonWorkspaceSessionContext {
  sessionId: string
  windowId?: string
  project?: {
    id: string
    uid?: string
    slug?: string
    title?: string
  }
  workspace?: {
    kind: 'local-fs' | 'cloud' | 'external'
    projectCwd?: string
    rootUri?: string
  }
  capabilities: {
    localFileAccess: boolean
    fileImport: boolean
    mediaPreview: boolean
  }
}

interface DaemonContextSessionInput {
  sessionId?: string
  windowId?: string
  projectId?: string | number
  projectUid?: string
  projectSlug?: string
  projectTitle?: string
  projectDir?: string
  workspaceRootUri?: string
  workspaceKind?: 'local-fs' | 'cloud' | 'external'
  capabilities?: Partial<DaemonWorkspaceSessionContext['capabilities']>
  principal?: Partial<DaemonContextEnvelope['principal']>
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
    '  movscript mcp stdio',
    '  movscript daemon run',
    '  movscript daemon <start|status|stop|restart> [options]',
    '  movscript admin|system|runtime|workspace ...',
    '',
    'Compatibility:',
    '  movscript-agent-mcp        # same as movscript mcp stdio',
    '  movcli ...                 # same command runner, legacy name',
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
  if (requested === 'desktop' || requested === 'plugin-desktop-compatible' || requested === 'plugin-desktop-owned') {
    return pluginDesktopCompatibilityStartupPolicy
  }
  return pluginFullLocalStartupPolicy
}

async function ensureLocalNode(
  homeDir: string,
  options: LocalDaemonCLIOptions = {},
): Promise<Record<string, unknown>> {
  return await ensureLocalRuntimeDaemon({
    homeDir,
    entrypoint: AGENT_MCP_ENTRYPOINT,
    runArgs: ['daemon', 'run'],
    cwd: RUN_CWD,
    env: localDaemonEnvFromOptions(options),
    identity: currentPluginIdentity(),
  })
}

function isLegacyAgentMCPInvocation(): boolean {
  const invoked = process.argv[1]
  if (!invoked) return false
  const invokedName = basename(invoked)
  return (invokedName === 'movscript-agent-mcp' || invokedName === 'movscript-agent-mcp.mjs') && process.argv.length <= 2
}

async function runPersistentLocalNode(): Promise<void> {
  const homeDir = resolveMovScriptHomeDir()
  const idleTimeoutMs = parseIdleTimeout(process.env.MOVSCRIPT_LOCAL_DAEMON_IDLE_TIMEOUT ?? process.env.MOVSCRIPT_LOCAL_NODE_IDLE_TIMEOUT)
  const pluginIdentity = currentPluginIdentity()
  let shouldExit = false
  let restartCount = 0

  while (!shouldExit) {
    const dataPlane = resolveLocalDaemonDataPlane(process.env)
    const dataServiceURL = configuredDataServiceURLForDataPlane(dataPlane)
    const startupPolicy = localNodeStartupPolicyForDataPlane(dataPlane)
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

function configuredDataServiceURLForDataPlane(dataPlane: LocalDaemonDataPlane): string | undefined {
  const dataServiceURL = process.env.MOVSCRIPT_DATA_SERVICE_URL?.trim()
  return dataPlane === 'local' ? undefined : dataServiceURL || undefined
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
        MOVSCRIPT_DATA_SERVICE_URL: resolveDataServiceURL(context.homeDir) ?? resolveGatewayURL(context.homeDir) ?? 'http://127.0.0.1:8766',
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
          mode: context.profile === 'desktop-connected' ? 'plugin-desktop-compatible' : 'plugin-full-local',
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
      response.writeHead(status, {
        ...corsHeadersForRequest(request),
        'content-type': 'application/json; charset=utf-8',
      })
      response.end(JSON.stringify(payload))
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, corsHeadersForRequest(request))
      response.end()
      return
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
    if (await handleLocalSurfaceGatewayRequest(staticRoot, state.homeDir, request, response, url, state)) {
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
      response.writeHead(200, {
        ...corsHeadersForRequest(request),
        'content-type': 'application/json; charset=utf-8',
      })
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
  localNodeState?: LocalNodeControlState,
): Promise<boolean> {
  if (isGatewayAPIPath(url.pathname)) {
    applyCORSHeaders(response, request)
    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return true
    }
  }
  if (url.pathname === DAEMON_CONTEXT_ENDPOINT || url.pathname.startsWith(`${DAEMON_CONTEXT_SESSIONS_ENDPOINT}`)) {
    await handleDaemonContextRequest(homeDir, request, response, url)
    return true
  }
  if (
    url.pathname === DAEMON_RUNTIME_DESCRIPTOR_ENDPOINT
    || url.pathname === DAEMON_RUNTIME_STATUS_ENDPOINT
    || url.pathname === DAEMON_RUNTIME_DIAGNOSTICS_ENDPOINT
    || url.pathname === DAEMON_RUNTIME_CONFIGURE_ENDPOINT
  ) {
    await handleDaemonRuntimeRequest(homeDir, request, response, url, localNodeState)
    return true
  }
  if (
    url.pathname === DAEMON_MCP_ENDPOINT
    || url.pathname === DAEMON_MCP_HEALTH_ENDPOINT
    || url.pathname === LEGACY_MCP_ENDPOINT
  ) {
    await handleDaemonMCPRequest(homeDir, request, response, url)
    return true
  }
  if (projectServiceProxyUpstreamPath(url.pathname)) {
    await proxyProjectServiceRequest(homeDir, request, response, url)
    return true
  }
  if (url.pathname === '/v1/editing' || url.pathname.startsWith('/v1/editing/')) {
    await proxyRuntimeServiceRequest(homeDir, request, response, url, {
      serviceName: EDITING_SERVICE_NAME,
      gatewayPrefix: '/v1/editing',
      upstreamPrefix: '/v1/editing',
      unavailableCode: 'editing_service_unavailable',
      failureCode: 'editing_service_proxy_failed',
      serviceLabel: 'Editing Service',
    })
    return true
  }
  if (url.pathname === '/v1/media-pipeline' || url.pathname.startsWith('/v1/media-pipeline/')) {
    await proxyRuntimeServiceRequest(homeDir, request, response, url, {
      serviceName: MEDIA_PIPELINE_SERVICE_NAME,
      gatewayPrefix: '/v1/media-pipeline',
      upstreamPrefix: '/v1/media-pipeline',
      unavailableCode: 'media_pipeline_unavailable',
      failureCode: 'media_pipeline_proxy_failed',
      serviceLabel: 'Media Pipeline',
    })
    return true
  }
  if (
    request.method === 'POST'
    && (url.pathname === '/v1/host/editing/import-file' || url.pathname === '/local-api/editing/import-file')
  ) {
    await importLocalSurfaceEditingFile(homeDir, request, response, url)
    return true
  }
  if (
    (request.method === 'GET' || request.method === 'HEAD')
    && (url.pathname === '/v1/host/editing/media-file' || url.pathname === '/local-api/editing/media-file')
  ) {
    await serveLocalSurfaceEditingMediaFile(homeDir, request, response, url)
    return true
  }
  if (url.pathname === '/v1/canvas' || url.pathname.startsWith('/v1/canvas/')) {
    await proxyCanvasServiceRequest(homeDir, request, response, url, '/v1/canvas')
    return true
  }
  if (url.pathname === '/local-api/canvas' || url.pathname.startsWith('/local-api/canvas/')) {
    await proxyCanvasServiceRequest(homeDir, request, response, url, '/local-api/canvas')
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
    || pathname === '/v1/canvas'
    || pathname.startsWith('/v1/canvas/')
    || pathname === DAEMON_CONTEXT_ENDPOINT
    || pathname === DAEMON_CONTEXT_SESSIONS_ENDPOINT
    || pathname.startsWith(`${DAEMON_CONTEXT_SESSIONS_ENDPOINT}/`)
    || pathname === DAEMON_RUNTIME_DESCRIPTOR_ENDPOINT
    || pathname === DAEMON_RUNTIME_STATUS_ENDPOINT
    || pathname === DAEMON_RUNTIME_DIAGNOSTICS_ENDPOINT
    || pathname === DAEMON_RUNTIME_CONFIGURE_ENDPOINT
    || pathname === DAEMON_MCP_ENDPOINT
    || pathname === DAEMON_MCP_HEALTH_ENDPOINT
    || pathname === LEGACY_MCP_ENDPOINT
    || pathname === LOCAL_PROJECT_SERVICE_PROXY_PREFIX
    || pathname.startsWith(`${LOCAL_PROJECT_SERVICE_PROXY_PREFIX}/`)
    || pathname === '/v1/editing'
    || pathname.startsWith('/v1/editing/')
    || pathname === '/v1/media-pipeline'
    || pathname.startsWith('/v1/media-pipeline/')
    || pathname === '/v1/host/editing'
    || pathname.startsWith('/v1/host/editing/')
    || pathname === '/local-api/editing'
    || pathname.startsWith('/local-api/editing/')
    || pathname === LOCAL_PROJECT_SERVICE_ALIAS_PREFIX
    || pathname.startsWith(`${LOCAL_PROJECT_SERVICE_ALIAS_PREFIX}/`)
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

async function handleDaemonRuntimeRequest(
  homeDir: string,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  localNodeState?: LocalNodeControlState,
): Promise<void> {
  if (url.pathname === DAEMON_RUNTIME_CONFIGURE_ENDPOINT) {
    await handleDaemonRuntimeConfigureRequest(homeDir, request, response, localNodeState)
    return
  }
  if (request.method !== 'GET') {
    writeLocalSurfaceJSON(response, 405, {
      error: 'method_not_allowed',
      message: 'Daemon runtime descriptor only supports GET.',
    })
    return
  }
  const descriptor = issueDaemonRuntimeDescriptor(homeDir, request)
  if (url.pathname === DAEMON_RUNTIME_DIAGNOSTICS_ENDPOINT) {
    if (!daemonRuntimeDiagnosticsEnabled()) {
      writeLocalSurfaceJSON(response, 404, {
        error: 'diagnostics_not_enabled',
        message: 'Daemon runtime diagnostics are debug-only and are not enabled for this process.',
      })
      return
    }
    writeLocalSurfaceJSON(response, 200, issueDaemonRuntimeDiagnostics(homeDir, descriptor))
    return
  }
  if (url.pathname === DAEMON_RUNTIME_STATUS_ENDPOINT) {
    writeLocalSurfaceJSON(response, 200, {
      schema: 'movscript.runtime-status.v1',
      runtime: descriptor.runtime,
      gateway: descriptor.gateway,
      dataConnection: descriptor.dataConnection,
      capabilities: descriptor.capabilities,
      status: descriptor.dataConnection.status === 'unavailable' ? 'unavailable' : 'ready',
    })
    return
  }
  writeLocalSurfaceJSON(response, 200, descriptor)
}

async function handleDaemonRuntimeConfigureRequest(
  homeDir: string,
  request: IncomingMessage,
  response: ServerResponse,
  localNodeState: LocalNodeControlState | undefined,
): Promise<void> {
  if (request.method !== 'POST') {
    writeLocalSurfaceJSON(response, 405, {
      error: 'method_not_allowed',
      message: 'Daemon runtime configure only supports POST.',
    })
    return
  }
  if (!localNodeState) {
    writeLocalSurfaceJSON(response, 409, {
      error: 'runtime_configure_unavailable',
      message: 'Daemon runtime configure must be handled by movscript.local-node.',
    })
    return
  }

  try {
    const input = await readDaemonRuntimeConfigureInput(request)
    localNodeState.lastActivityAt = new Date()
    if (daemonRuntimeConfigureMatchesCurrent(localNodeState, input)) {
      writeLocalSurfaceJSON(response, 200, {
        schema: 'movscript.runtime-configure-result.v1',
        status: 'ready',
        restarted: false,
        dataConnection: daemonDataConnectionContext(homeDir),
      })
      return
    }
    process.env.MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE = input.dataPlane
    if (input.dataPlane === 'local' || !input.dataServiceURL) {
      delete process.env.MOVSCRIPT_DATA_SERVICE_URL
    } else {
      process.env.MOVSCRIPT_DATA_SERVICE_URL = input.dataServiceURL
    }
    writeLocalSurfaceJSON(response, 202, {
      schema: 'movscript.runtime-configure-result.v1',
      status: 'restarting',
      restarted: true,
      dataConnection: daemonDataConnectionContext(homeDir),
    })
    setImmediate(() => localNodeState.requestAction({ type: 'restart', reason: 'runtime_configure' }))
  } catch (error) {
    writeLocalSurfaceJSON(response, 400, {
      error: 'invalid_runtime_configure_request',
      message: errorMessage(error),
    })
  }
}

function daemonRuntimeConfigureMatchesCurrent(
  state: LocalNodeControlState,
  input: { dataPlane: LocalDaemonDataPlane; dataServiceURL?: string },
): boolean {
  if (state.dataPlane !== input.dataPlane) return false
  if (input.dataPlane === 'local') return true
  return normalizeDataServiceURL(state.dataServiceURL) === normalizeDataServiceURL(input.dataServiceURL)
}

async function readDaemonRuntimeConfigureInput(request: IncomingMessage): Promise<{
  dataPlane: LocalDaemonDataPlane
  dataServiceURL?: string
}> {
  const text = (await readRequestText(request)).trim()
  const value = text ? JSON.parse(text) as unknown : {}
  const record = recordFromUnknown(value) ?? {}
  const dataConnection = recordFromUnknown(record.dataConnection)
  const dataPlane = localDaemonDataPlaneValue(
    dataConnection?.kind
      ?? record.dataPlane
      ?? record.data_connection_kind
      ?? record.kind,
  )
  if (!dataPlane) throw new Error('dataConnection.kind must be local, cloud, or external')
  const dataServiceURL = trimmedString(
    dataConnection?.url
      ?? record.dataServiceURL
      ?? record.data_service_url
      ?? record.url,
  )
  return {
    dataPlane,
    ...(dataPlane !== 'local' && dataServiceURL ? { dataServiceURL } : {}),
  }
}

function normalizeDataServiceURL(value: string | undefined): string | undefined {
  const raw = value?.trim()
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    url.hash = ''
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    return url.toString().replace(/\/$/, '')
  } catch {
    return raw.replace(/\/+$/, '')
  }
}

function localDaemonDataPlaneValue(value: unknown): LocalDaemonDataPlane | undefined {
  return value === 'local' || value === 'cloud' || value === 'external' ? value : undefined
}

function daemonRuntimeDiagnosticsEnabled(): boolean {
  return process.env.MOVSCRIPT_RUNTIME_DIAGNOSTICS === '1'
    || process.env.MOVSCRIPT_LOCAL_NODE_DEBUG === '1'
}

function issueDaemonRuntimeDiagnostics(homeDir: string, descriptor: DaemonRuntimeDescriptor) {
  const snapshot = readRuntimeHomeSnapshot(homeDir)
  return {
    schema: 'movscript.runtime-diagnostics.v1',
    debugOnly: true,
    runtime: descriptor.runtime,
    gateway: descriptor.gateway,
    dataConnection: descriptor.dataConnection,
    services: snapshot.services.map((record) => ({
      serviceName: record.serviceName,
      ownerApplicationId: record.ownerApplicationId,
      profile: record.profile,
      status: record.status,
      ready: record.ready,
      pidAlive: record.pid ? pidIsAlive(record.pid) : undefined,
      endpoint: record.endpoint ? redactedEndpoint(record.endpoint) : undefined,
      updatedAt: record.updatedAt,
    })),
    endpoints: snapshot.endpoints.map(redactedEndpoint),
  }
}

function redactedEndpoint(endpoint: { serviceName?: string; applicationId?: string; protocol?: string; port?: number; status: string; ready: boolean; updatedAt?: string }) {
  return {
    serviceName: endpoint.serviceName,
    applicationId: endpoint.applicationId,
    protocol: endpoint.protocol,
    port: endpoint.port,
    status: endpoint.status,
    ready: endpoint.ready,
    updatedAt: endpoint.updatedAt,
  }
}

function issueDaemonRuntimeDescriptor(homeDir: string, request?: IncomingMessage): DaemonRuntimeDescriptor {
  return {
    schema: 'movscript.runtime-descriptor.v1',
    runtime: {
      owner: 'movscript.local-node',
      appId: 'movscript.local-node',
      name: 'MovScript Local Node Daemon',
    },
    gateway: {
      baseURL: daemonGatewayBaseURL(homeDir, request),
      canonicalPrefix: '/v1',
      mcpEndpoint: `${daemonGatewayBaseURL(homeDir, request)}${DAEMON_MCP_ENDPOINT}`,
      mcpHealthEndpoint: `${daemonGatewayBaseURL(homeDir, request)}${DAEMON_MCP_HEALTH_ENDPOINT}`,
    },
    dataConnection: daemonDataConnectionContext(homeDir),
    capabilities: {
      project: true,
      canvas: true,
      resources: true,
      editing: true,
      media: true,
    },
  }
}

function daemonGatewayBaseURL(homeDir: string, request?: IncomingMessage): string {
  return trimURLTrailingSlash(
    resolveGatewayURL(homeDir)
      ?? requestOrigin(request)
      ?? `http://127.0.0.1:${DEFAULT_LOCAL_NODE_GATEWAY_PORT}`,
  )
}

function requestOrigin(request: IncomingMessage | undefined): string | undefined {
  const host = request?.headers.host
  if (typeof host !== 'string' || !host.trim()) return undefined
  const protoHeader = request?.headers['x-forwarded-proto']
  const protocol = typeof protoHeader === 'string' && protoHeader.trim() ? protoHeader.trim().split(',')[0] : 'http'
  return `${protocol}://${host.trim()}`
}

function trimURLTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function daemonDataConnectionContext(homeDir: string): DaemonContextEnvelope['dataConnection'] {
  const dataPlane = resolveLocalDaemonDataPlane(process.env)
  return {
    kind: dataPlane,
    authMode: dataPlane === 'local' ? 'local-owner' : dataPlane === 'cloud' ? 'session' : 'external',
    status: dataPlane === 'external' && !resolveDataServiceURL(homeDir) ? 'degraded' : 'connected',
    displayName: dataPlane === 'local' ? 'Local Data Plane' : dataPlane === 'cloud' ? 'Cloud Data Plane' : 'External Data Plane',
  }
}

async function handleDaemonContextRequest(
  homeDir: string,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    if (request.method === 'GET' && url.pathname === DAEMON_CONTEXT_ENDPOINT) {
      const sessionId = trimmedString(url.searchParams.get('sessionId'))
      const existing = sessionId ? daemonContextSessions.get(sessionId) : undefined
      writeLocalSurfaceJSON(response, 200, existing ?? issueDaemonContextEnvelope(homeDir, contextSessionInputFromSearch(url.searchParams)))
      return
    }

    if (request.method === 'POST' && url.pathname === DAEMON_CONTEXT_SESSIONS_ENDPOINT) {
      const input = {
        ...contextSessionInputFromSearch(url.searchParams),
        ...await readDaemonContextSessionInput(request),
      }
      const envelope = issueDaemonContextEnvelope(homeDir, input)
      if (envelope.session) daemonContextSessions.set(envelope.session.sessionId, envelope)
      writeLocalSurfaceJSON(response, 201, envelope)
      return
    }

    const sessionMatch = new RegExp(`^${escapeRegExp(DAEMON_CONTEXT_SESSIONS_ENDPOINT)}/([^/]+)$`).exec(url.pathname)
    if (sessionMatch) {
      const sessionId = decodeURIComponent(sessionMatch[1] ?? '')
      const existing = daemonContextSessions.get(sessionId)
      if (request.method === 'GET') {
        if (!existing) {
          writeLocalSurfaceJSON(response, 404, {
            error: 'context_session_not_found',
            message: `Daemon context session was not found: ${sessionId}`,
          })
          return
        }
        writeLocalSurfaceJSON(response, 200, existing)
        return
      }

      if (request.method === 'PATCH') {
        const input = {
          ...contextSessionInputFromSearch(url.searchParams),
          ...await readDaemonContextSessionInput(request),
          sessionId,
        }
        const envelope = issueDaemonContextEnvelope(homeDir, input, existing)
        if (envelope.session) daemonContextSessions.set(envelope.session.sessionId, envelope)
        writeLocalSurfaceJSON(response, existing ? 200 : 201, envelope)
        return
      }
    }

    writeLocalSurfaceJSON(response, 404, {
      error: 'context_route_not_found',
      message: `Daemon context route was not found: ${url.pathname}`,
    })
  } catch (error) {
    writeLocalSurfaceJSON(response, 500, {
      error: 'context_request_failed',
      message: errorMessage(error),
    })
  }
}

async function handleDaemonMCPRequest(
  homeDir: string,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> {
  if (url.pathname === DAEMON_MCP_HEALTH_ENDPOINT) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      writeLocalSurfaceJSON(response, 405, {
        error: 'method_not_allowed',
        message: 'Daemon MCP health only supports GET.',
      })
      return
    }
    const descriptor = issueDaemonRuntimeDescriptor(homeDir, request)
    const payload = {
      schema: 'movscript.daemon-mcp-health.v1',
      status: 'ok',
      serviceName: 'movscript.daemon.mcp',
      endpoint: descriptor.gateway.mcpEndpoint,
      toolCount: listMCPHostTools().length,
      runtime: descriptor.runtime,
      dataConnection: descriptor.dataConnection,
    }
    if (request.method === 'HEAD') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end()
      return
    }
    writeLocalSurfaceJSON(response, 200, payload)
    return
  }

  if (request.method !== 'POST') {
    writeLocalSurfaceJSON(response, 405, {
      error: 'method_not_allowed',
      message: 'Daemon MCP endpoint only supports POST JSON-RPC requests.',
    })
    return
  }

  try {
    const body = await readRequestText(request)
    const payload = JSON.parse(body) as unknown
    const localHandlerOptions = { proxyToDaemon: false }
    const result = Array.isArray(payload)
      ? (await Promise.all(payload.map((item) => handleMCPHostJSONRPC(item as Parameters<typeof handleMCPHostJSONRPC>[0], localHandlerOptions))))
          .filter((item): item is NonNullable<typeof item> => item !== undefined)
      : await handleMCPHostJSONRPC(payload as Parameters<typeof handleMCPHostJSONRPC>[0], localHandlerOptions)

    if (Array.isArray(result)) {
      if (result.length > 0) {
        writeLocalSurfaceJSON(response, 200, result)
      } else {
        response.writeHead(202, { 'content-type': 'application/json; charset=utf-8' })
        response.end()
      }
      return
    }
    if (result !== undefined) {
      writeLocalSurfaceJSON(response, 200, result)
      return
    }
    response.writeHead(202, { 'content-type': 'application/json; charset=utf-8' })
    response.end()
  } catch (error) {
    writeLocalSurfaceJSON(response, 200, {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error',
        data: errorMessage(error),
      },
    })
  }
}

async function readDaemonContextSessionInput(request: IncomingMessage): Promise<DaemonContextSessionInput> {
  const text = (await readRequestText(request)).trim()
  if (!text) return {}
  const value = JSON.parse(text) as unknown
  const record = recordFromUnknown(value)
  if (!record) return {}
  const principal = recordFromUnknown(record.principal)
  const capabilities = recordFromUnknown(record.capabilities)
  return {
    sessionId: trimmedString(record.sessionId),
    windowId: trimmedString(record.windowId),
    projectId: contextStringOrNumber(record.projectId ?? record.project_id),
    projectUid: trimmedString(record.projectUid ?? record.project_uid),
    projectSlug: trimmedString(record.projectSlug ?? record.project_slug),
    projectTitle: trimmedString(record.projectTitle ?? record.title ?? record.project_name),
    projectDir: trimmedString(record.projectDir ?? record.projectPath ?? record.project_cwd),
    workspaceRootUri: trimmedString(record.workspaceRootUri ?? record.rootUri),
    workspaceKind: contextWorkspaceKind(record.workspaceKind),
    ...(capabilities ? {
      capabilities: {
        ...(typeof capabilities.localFileAccess === 'boolean' ? { localFileAccess: capabilities.localFileAccess } : {}),
        ...(typeof capabilities.fileImport === 'boolean' ? { fileImport: capabilities.fileImport } : {}),
        ...(typeof capabilities.mediaPreview === 'boolean' ? { mediaPreview: capabilities.mediaPreview } : {}),
      },
    } : {}),
    ...(principal ? {
      principal: {
        userId: trimmedString(principal.userId ?? principal.user_id),
        kind: contextPrincipalKind(principal.kind),
        accountId: trimmedString(principal.accountId ?? principal.account_id),
        displayName: trimmedString(principal.displayName ?? principal.display_name),
        scopeKind: contextScopeKind(principal.scopeKind ?? principal.scope_kind),
        scopeId: contextStringOrNumber(principal.scopeId ?? principal.scope_id),
      },
    } : {}),
  }
}

function contextSessionInputFromSearch(params: URLSearchParams): DaemonContextSessionInput {
  return {
    sessionId: trimmedString(params.get('sessionId') ?? params.get('session_id')),
    windowId: trimmedString(params.get('windowId') ?? params.get('window_id')),
    projectId: contextStringOrNumber(params.get('projectId') ?? params.get('project_id')),
    projectUid: trimmedString(params.get('projectUid') ?? params.get('project_uid')),
    projectSlug: trimmedString(params.get('projectSlug') ?? params.get('project_slug')),
    projectTitle: trimmedString(params.get('projectTitle') ?? params.get('projectName') ?? params.get('project_name')),
    projectDir: trimmedString(params.get('projectDir') ?? params.get('projectPath') ?? params.get('project_cwd')),
    workspaceRootUri: trimmedString(params.get('workspaceRootUri') ?? params.get('rootUri')),
    workspaceKind: contextWorkspaceKind(params.get('workspaceKind')),
  }
}

function issueDaemonContextEnvelope(
  homeDir: string,
  input: DaemonContextSessionInput = {},
  previous?: DaemonContextEnvelope,
): DaemonContextEnvelope {
  const dataPlane = resolveLocalDaemonDataPlane(process.env)
  const dataConnection = daemonDataConnectionContext(homeDir)
  const issuedAt = new Date().toISOString()
  const revision = (previous?.revision ?? 0) + 1
  const session = issueDaemonWorkspaceSession(input, previous?.session, dataPlane)
  return {
    schema: 'movscript.context-envelope.v1',
    contextId: `${session?.sessionId ?? 'system'}:${revision}`,
    revision,
    issuedAt,
    runtime: {
      owner: 'local-node',
      appId: LOCAL_NODE_APP_ID,
      gatewayPrefix: '/v1',
    },
    principal: daemonPrincipalContext(dataPlane, input.principal, previous?.principal),
    dataConnection,
    ...(session ? { session } : {}),
  }
}

function issueDaemonWorkspaceSession(
  input: DaemonContextSessionInput,
  previous: DaemonWorkspaceSessionContext | undefined,
  dataPlane: LocalDaemonDataPlane,
): DaemonWorkspaceSessionContext | undefined {
  const projectDir = trimmedString(input.projectDir) ?? previous?.workspace?.projectCwd
  const explicitLocalFileAccess = input.capabilities?.localFileAccess
  const localFileAccess = explicitLocalFileAccess ?? previous?.capabilities.localFileAccess ?? Boolean(projectDir)
  const projectCwd = localFileAccess && projectDir ? resolve(projectDir) : undefined
  const projectId = contextString(input.projectId)
    ?? previous?.project?.id
    ?? (projectCwd ? `local:${stableContextId(projectCwd)}` : undefined)
  const hasSessionInput = Boolean(
    input.sessionId
      || input.windowId
      || projectId
      || projectCwd
      || input.projectUid
      || input.projectTitle
      || previous,
  )
  if (!hasSessionInput) return undefined
  const sessionId = trimmedString(input.sessionId)
    ?? previous?.sessionId
    ?? `wks_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`
  const workspaceKind = projectCwd
    ? 'local-fs'
    : input.workspaceKind ?? previous?.workspace?.kind ?? (dataPlane === 'cloud' ? 'cloud' : dataPlane === 'external' ? 'external' : undefined)

  return {
    sessionId,
    ...(trimmedString(input.windowId) ?? previous?.windowId ? { windowId: trimmedString(input.windowId) ?? previous?.windowId } : {}),
    ...(projectId ? {
      project: {
        id: projectId,
        ...(trimmedString(input.projectUid) ?? previous?.project?.uid ? { uid: trimmedString(input.projectUid) ?? previous?.project?.uid } : {}),
        ...(trimmedString(input.projectSlug) ?? previous?.project?.slug ? { slug: trimmedString(input.projectSlug) ?? previous?.project?.slug } : {}),
        ...(trimmedString(input.projectTitle) ?? previous?.project?.title ? { title: trimmedString(input.projectTitle) ?? previous?.project?.title } : {}),
      },
    } : {}),
    ...(workspaceKind ? {
      workspace: {
        kind: workspaceKind,
        ...(projectCwd ? { projectCwd } : {}),
        ...(trimmedString(input.workspaceRootUri) ?? previous?.workspace?.rootUri ? { rootUri: trimmedString(input.workspaceRootUri) ?? previous?.workspace?.rootUri } : {}),
      },
    } : {}),
    capabilities: {
      localFileAccess,
      fileImport: input.capabilities?.fileImport ?? previous?.capabilities.fileImport ?? localFileAccess,
      mediaPreview: input.capabilities?.mediaPreview ?? previous?.capabilities.mediaPreview ?? localFileAccess,
    },
  }
}

function daemonPrincipalContext(
  dataPlane: LocalDaemonDataPlane,
  input: Partial<DaemonContextEnvelope['principal']> | undefined,
  previous: DaemonContextEnvelope['principal'] | undefined,
): DaemonContextEnvelope['principal'] {
  if (dataPlane === 'local') {
    return {
      userId: '1',
      kind: 'local-owner',
      accountId: 'local-owner',
      displayName: 'Local Workspace',
      scopeKind: 'user',
      scopeId: 1,
    }
  }
  const userId = trimmedString(input?.userId) ?? previous?.userId ?? (dataPlane === 'cloud' ? 'cloud-user' : 'external-user')
  return {
    userId,
    kind: input?.kind ?? previous?.kind ?? (dataPlane === 'cloud' ? 'cloud-user' : 'external-user'),
    ...(trimmedString(input?.accountId) ?? previous?.accountId ? { accountId: trimmedString(input?.accountId) ?? previous?.accountId } : {}),
    ...(trimmedString(input?.displayName) ?? previous?.displayName ? { displayName: trimmedString(input?.displayName) ?? previous?.displayName } : {}),
    ...(input?.scopeKind ?? previous?.scopeKind ? { scopeKind: input?.scopeKind ?? previous?.scopeKind } : {}),
    ...(input?.scopeId ?? previous?.scopeId ? { scopeId: input?.scopeId ?? previous?.scopeId } : {}),
  }
}

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function contextStringOrNumber(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return trimmedString(value)
}

function contextString(value: string | number | undefined): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return trimmedString(value)
}

function trimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function contextWorkspaceKind(value: unknown): DaemonContextSessionInput['workspaceKind'] {
  return value === 'local-fs' || value === 'cloud' || value === 'external' ? value : undefined
}

function contextPrincipalKind(value: unknown): DaemonContextEnvelope['principal']['kind'] | undefined {
  return value === 'local-owner' || value === 'cloud-user' || value === 'service-account' || value === 'external-user'
    ? value
    : undefined
}

function contextScopeKind(value: unknown): DaemonContextEnvelope['principal']['scopeKind'] | undefined {
  return value === 'user' || value === 'org' || value === 'local' ? value : undefined
}

function stableContextId(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

async function proxyCanvasServiceRequest(homeDir: string, request: IncomingMessage, response: ServerResponse, url: URL, gatewayPrefix: '/local-api/canvas' | '/v1/canvas'): Promise<void> {
  const baseURL = await waitForRuntimeServiceURL(homeDir, CANVAS_SERVICE_NAME)
  if (!baseURL) {
    writeLocalSurfaceJSON(response, 503, {
      error: 'canvas_service_unavailable',
      message: 'Canvas Service endpoint was not found in MovScript runtime records.',
    })
    return
  }

  const upstreamPath = `/v1/canvas${url.pathname.slice(gatewayPrefix.length)}${url.search}`
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

async function proxyRuntimeServiceRequest(
  homeDir: string,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  options: {
    serviceName: string
    gatewayPrefix: string
    upstreamPrefix: string
    unavailableCode: string
    failureCode: string
    serviceLabel: string
  },
): Promise<void> {
  const baseURL = await waitForRuntimeServiceURL(homeDir, options.serviceName)
  if (!baseURL) {
    writeLocalSurfaceJSON(response, 503, {
      error: options.unavailableCode,
      message: `${options.serviceLabel} endpoint was not found in MovScript runtime records.`,
    })
    return
  }

  const upstreamPath = `${options.upstreamPrefix}${url.pathname.slice(options.gatewayPrefix.length)}${url.search}`
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
      error: options.failureCode,
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
  const baseURL = await waitForDataServiceURL(homeDir)
  if (!baseURL) {
    writeLocalSurfaceJSON(response, 503, {
      error: 'data_service_unavailable',
      message: 'Data Service endpoint was not found in MovScript runtime records or MOVSCRIPT_DATA_SERVICE_URL.',
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
  const upstreamPath = projectServiceProxyUpstreamPath(url.pathname)
  if (!upstreamPath) {
    writeLocalSurfaceJSON(response, 404, {
      error: 'project_service_route_not_found',
      message: `Local Project Service proxy route was not found: ${url.pathname}`,
    })
    return
  }
  const baseURL = await waitForRuntimeServiceURL(homeDir, PROJECT_SERVICE_NAME)
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

function projectServiceProxyUpstreamPath(pathname: string): string | undefined {
  const registeredRoute = LOCAL_PROJECT_SERVICE_PROXY_ROUTES.get(pathname)
  if (registeredRoute) return registeredRoute
  if (pathname === LOCAL_PROJECT_SERVICE_PROXY_PREFIX || pathname.startsWith(`${LOCAL_PROJECT_SERVICE_PROXY_PREFIX}/`)) {
    return pathname
  }
  if (pathname === LOCAL_PROJECT_SERVICE_ALIAS_PREFIX || pathname.startsWith(`${LOCAL_PROJECT_SERVICE_ALIAS_PREFIX}/`)) {
    return `${LOCAL_PROJECT_SERVICE_PROXY_PREFIX}${pathname.slice(LOCAL_PROJECT_SERVICE_ALIAS_PREFIX.length)}`
  }
  return undefined
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

function applyCORSHeaders(response: ServerResponse, request: IncomingMessage): void {
  for (const [key, value] of Object.entries(corsHeadersForRequest(request))) {
    response.setHeader(key, value)
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

function writeLocalSurfaceJSON(response: ServerResponse, statusCode: number, payload: unknown): void {
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
    || endpointURL(findRuntimeEndpoint(readRuntimeHomeSnapshot(homeDir), DATA_SERVICE_NAME))
}

function resolveGatewayURL(homeDir: string): string | undefined {
  return endpointURL(findRuntimeEndpoint(readRuntimeHomeSnapshot(homeDir), LOCAL_NODE_GATEWAY_SERVICE))
}

async function waitForDataServiceURL(homeDir: string): Promise<string | undefined> {
  return waitForRuntimeEndpointURL(() => resolveDataServiceURL(homeDir))
}

async function waitForRuntimeServiceURL(homeDir: string, serviceName: string): Promise<string | undefined> {
  return waitForRuntimeEndpointURL(() => endpointURL(findRuntimeEndpoint(readRuntimeHomeSnapshot(homeDir), serviceName)))
}

async function waitForRuntimeEndpointURL(resolveURL: () => string | undefined): Promise<string | undefined> {
  const deadline = Date.now() + RUNTIME_ENDPOINT_WAIT_TIMEOUT_MS
  let url = resolveURL()
  while (!url && Date.now() < deadline) {
    await delay(RUNTIME_ENDPOINT_WAIT_INTERVAL_MS)
    url = resolveURL()
  }
  return url
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
