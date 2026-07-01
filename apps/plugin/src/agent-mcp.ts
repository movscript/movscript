import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, resolve } from 'node:path'
import {
  createScenarioApplicationRunner,
  type ProgramAdapter,
} from '@movscript/app-runner'
import {
  createLocalSurfaceHostProgramAdapter,
  resolveLocalDaemonServicePlanePaths,
  runLocalDaemonServicePlane,
} from '@movscript/local-daemon'
import {
  ensureLocalRuntimeDaemon,
  localRuntimeControlRequest,
  probeLocalRuntimeDaemon,
  stopLocalRuntimeDaemon,
  type LocalRuntimeDataPlane,
} from '@movscript/local-runtime'
import { mcpHostProgramManifest } from '@movscript/mcp-host/program-manifest'
import { callMCPHostTool, startMCPStdioHost } from '@movscript/mcp-host/stdio'
import {
  resolveMovScriptHomeDir,
  type ScenarioPolicyManifest,
} from '@movscript/runtime-contracts'

import pluginApplicationManifest from '../application.manifest'
import pluginAgentLauncherProgramManifest from '../programs/agent-launcher.program.manifest'
import {
  pluginBasicStartupPolicy,
  pluginDesktopCompatibilityStartupPolicy,
  pluginFullLocalStartupPolicy,
} from '../startup.manifest'
import { runCanvasServiceCLI } from '../../../services/canvas-service/src/server.mjs'
import { runEditingServiceCLI } from '../../../services/editing-service/src/server.mjs'
import { runMediaPipelineServiceCLI } from '../../../services/media-pipeline/src/server.mjs'
import { runProjectServiceCLI } from '../../../services/project-service/src/server.mjs'

const PLUGIN_ROOT = resolve(import.meta.dirname, '..')
const DEV_REPO_ROOT = resolve(import.meta.dirname, '../../..')
const BUNDLED_RUNTIME_ROOT = resolve(PLUGIN_ROOT, 'runtime')
const HAS_BUNDLED_RUNTIME = existsSync(BUNDLED_RUNTIME_ROOT)
const AGENT_MCP_ENTRYPOINT = resolve(import.meta.dirname, 'movscript.mjs')
const RUN_CWD = HAS_BUNDLED_RUNTIME ? PLUGIN_ROOT : DEV_REPO_ROOT

type LocalDaemonDataPlane = LocalRuntimeDataPlane

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function currentPluginIdentity(): { pluginVersion: string; pluginRoot: string } {
  return pluginIdentityForRoot(PLUGIN_ROOT)
}

function pluginIdentityForRoot(pluginRoot: string): { pluginVersion: string; pluginRoot: string } {
  return {
    pluginVersion: readPluginVersion(resolve(pluginRoot, 'manifest.runtime.json'))
      ?? readPluginVersion(resolve(pluginRoot, '.codex-plugin/plugin.json'))
      ?? readPluginVersion(resolve(pluginRoot, '.provider-plugin/plugin.json'))
      ?? 'unknown',
    pluginRoot,
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

  await runEmbeddedMovScriptCli([process.argv[0] ?? 'node', 'movscript', ...process.argv.slice(2)])
}

async function runEmbeddedMovScriptCli(argv: string[]): Promise<void> {
  const previousEmbedded = process.env.MOVSCRIPT_CLI_EMBEDDED
  process.env.MOVSCRIPT_CLI_EMBEDDED = '1'
  try {
    const { runMovScriptCli } = await import('@movscript/cli')
    await runMovScriptCli(argv)
  } finally {
    if (previousEmbedded === undefined) delete process.env.MOVSCRIPT_CLI_EMBEDDED
    else process.env.MOVSCRIPT_CLI_EMBEDDED = previousEmbedded
  }
}

async function runPluginMCPStdioSession(): Promise<void> {
  const homeDir = resolveMovScriptHomeDir()
  const startupPolicy = await prepareSessionStartupPolicy(homeDir)
  const runner = createScenarioApplicationRunner({
    homeDir,
    application: pluginApplicationManifest,
    scenario: startupPolicy,
    programs: createPluginProgramAdapters(),
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
  if (command === 'cli') {
    const [cliCommand, ...cliArgs] = rawArgs.slice(1)
    if (!cliCommand || cliCommand === '--help' || cliCommand === '-h' || cliCommand === 'help') {
      printMovScriptCLIHelp()
      return true
    }
    if (cliCommand !== 'daemon' && cliCommand !== 'local-node') {
      await runEmbeddedMovScriptCli([process.argv[0] ?? 'node', 'movscript', ...rawArgs.slice(1)])
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
    case 'discover':
      process.stdout.write(`${JSON.stringify(await callMCPHostTool({
        name: 'runtime_daemon_discover',
        arguments: localDaemonRuntimeArgs(homeDir, parsed.options),
      }), null, 2)}\n`)
      return
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
    case 'ensure':
    case 'start':
      process.stdout.write(`${JSON.stringify(await ensureLocalNode(homeDir, parsed.options), null, 2)}\n`)
      return
    case 'configure':
      process.stdout.write(`${JSON.stringify(await callMCPHostTool({
        name: 'runtime_daemon_configure',
        arguments: localDaemonRuntimeArgs(homeDir, parsed.options),
      }), null, 2)}\n`)
      return
    default:
      throw new Error(`unknown ${command} command: ${parsed.subcommand}`)
  }
}

interface LocalDaemonCLIOptions {
  backendBaseURL?: string
  backendMode?: string
  clearToken?: boolean
  dataPlane?: LocalDaemonDataPlane
  dataServiceURL?: string
  force?: boolean
  help?: boolean
  homeDir?: string
  idleTimeout?: string
  json?: boolean
  projectDir?: string
  remember?: boolean
  startupTimeoutMs?: number
  token?: string
  workspaceDir?: string
}

type LocalDaemonJSONValue = string | number | boolean | null | LocalDaemonJSONValue[] | { [key: string]: LocalDaemonJSONValue }

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
    if (arg === '--json') {
      options.json = true
      continue
    }
    if (arg === '--yes') {
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
    if (arg === '--startup-timeout-ms' || arg.startsWith('--startup-timeout-ms=')) {
      const value = Number(optionValue('--startup-timeout-ms'))
      if (!Number.isFinite(value) || value <= 0) throw new Error(`${command} ${subcommand ?? 'start'} requires a positive number for --startup-timeout-ms`)
      options.startupTimeoutMs = Math.floor(value)
      continue
    }
    if (arg === '--backend-mode' || arg.startsWith('--backend-mode=')) {
      options.backendMode = optionValue('--backend-mode')
      continue
    }
    if (arg === '--backend-base-url' || arg.startsWith('--backend-base-url=')) {
      options.backendBaseURL = optionValue('--backend-base-url')
      continue
    }
    if (arg === '--token' || arg.startsWith('--token=')) {
      options.token = optionValue('--token')
      continue
    }
    if (arg === '--remember') {
      options.remember = true
      continue
    }
    if (arg === '--clear-token') {
      options.clearToken = true
      continue
    }
    if (arg === '--workspace' || arg.startsWith('--workspace=')) {
      options.workspaceDir = resolve(optionValue('--workspace'))
      continue
    }
    if (arg === '--project-dir' || arg.startsWith('--project-dir=')) {
      options.projectDir = resolve(optionValue('--project-dir'))
      continue
    }
    throw new Error(`unknown ${command} option: ${arg}`)
  }
  return { subcommand: subcommand ?? 'start', options }
}

function localDaemonRuntimeArgs(homeDir: string, options: LocalDaemonCLIOptions): Record<string, LocalDaemonJSONValue> {
  return {
    homeDir,
    ...(options.workspaceDir ? { workspaceDir: options.workspaceDir } : {}),
    ...(options.projectDir ? { projectDir: options.projectDir } : {}),
    ...(options.backendMode ? { backendMode: options.backendMode } : {}),
    ...(options.backendBaseURL ? { backendBaseURL: options.backendBaseURL } : {}),
    ...(options.token ? { token: options.token } : {}),
    ...(options.remember ? { remember: true } : {}),
    ...(options.clearToken ? { clearToken: true } : {}),
  }
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
    '  movscript daemon <discover|ensure|start|status|stop|restart|configure> [options]',
    '  movscript admin|system|runtime|workspace ...',
    '',
    'Compatibility:',
    '  movscript-agent-mcp        # same as movscript mcp stdio',
    '',
  ].join('\n'))
}

function printLocalDaemonHelp(command: string): void {
  process.stdout.write([
    `Usage: ${command} <discover|ensure|start|status|stop|restart|configure> [options]`,
    '',
    'Options:',
    '  --home <dir>                    MovScript home directory',
    '  --json                          Print JSON output (default)',
    '  --data-plane <local|cloud|external>',
    '  --data-service-url <url>        Cloud or external Data Service URL',
    '  --idle-timeout <duration>       Idle shutdown timeout, for example 30m or never',
    '  --startup-timeout-ms <ms>       Startup readiness timeout in milliseconds',
    '  --backend-mode <local|cloud>    Runtime backend mode for configure',
    '  --backend-base-url <url>        Runtime backend/gateway URL for configure',
    '  --workspace <dir>               Workspace root for configure',
    '  --project-dir <dir>             Project source directory for configure',
    '  --remember                      Persist backend URL for configure',
    '  --clear-token                   Clear persisted backend token for configure',
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
  const env = localDaemonEnvFromOptions(options)
  const startupTimeoutMs = options.startupTimeoutMs
  try {
    return await ensureLocalRuntimeDaemon({
      homeDir,
      entrypoint: AGENT_MCP_ENTRYPOINT,
      runArgs: ['daemon', 'run'],
      cwd: RUN_CWD,
      env,
      identity: currentPluginIdentity(),
      startupTimeoutMs,
    })
  } catch (error) {
    const rollback = rollbackCurrentPluginForStartupFailure(homeDir, error)
    if (!rollback.rolledBack) throw error
    const previousEntrypoint = resolve(rollback.previousRoot, 'bin/movscript.mjs')
    if (!existsSync(previousEntrypoint)) {
      throw new Error(`MovScript local daemon startup failed, plugin rollback switched current to ${rollback.previousRoot}, but previous entrypoint is missing: ${previousEntrypoint}; original error: ${errorMessage(error)}`)
    }
    try {
      const result = await ensureLocalRuntimeDaemon({
        homeDir,
        entrypoint: previousEntrypoint,
        runArgs: ['daemon', 'run'],
        cwd: pluginRunCwdForRoot(rollback.previousRoot),
        env,
        identity: pluginIdentityForRoot(rollback.previousRoot),
        startupTimeoutMs,
      })
      return {
        ...result,
        rollback,
      }
    } catch (rollbackError) {
      throw new Error(`MovScript local daemon startup failed for current plugin and rollback bundle; rollback=${JSON.stringify(rollback)}; original error: ${errorMessage(error)}; rollback error: ${errorMessage(rollbackError)}`)
    }
  }
}

function pluginRunCwdForRoot(pluginRoot: string): string {
  return existsSync(resolve(pluginRoot, 'runtime')) ? pluginRoot : DEV_REPO_ROOT
}

type PluginStartupRollbackResult =
  | { rolledBack: false; reason: string }
  | {
    rolledBack: true
    reason: 'daemon_startup_failure'
    failedRoot: string
    previousRoot: string
    previousVersion: string
    identityPath: string
  }

function rollbackCurrentPluginForStartupFailure(homeDir: string, error: unknown): PluginStartupRollbackResult {
  if (!pluginStartupFailureRollbackEnabled()) return { rolledBack: false, reason: 'disabled' }
  const pluginStore = resolve(homeDir, 'plugins/movscript')
  const currentLink = resolve(pluginStore, 'current')
  const previousLink = resolve(pluginStore, 'previous')
  const currentRoot = pluginPointerTarget(currentLink, pluginStore)
  const previousRoot = pluginPointerTarget(previousLink, pluginStore)
  if (!currentRoot) return { rolledBack: false, reason: 'current_pointer_missing' }
  if (!previousRoot) return { rolledBack: false, reason: 'previous_pointer_missing' }
  if (!sameDirectory(currentRoot, PLUGIN_ROOT)) return { rolledBack: false, reason: 'current_pointer_does_not_match_running_plugin' }
  if (sameDirectory(previousRoot, currentRoot)) return { rolledBack: false, reason: 'previous_matches_current' }
  if (!existsSync(previousRoot)) return { rolledBack: false, reason: 'previous_bundle_missing' }

  switchPluginPointer(currentLink, previousRoot)
  switchPluginPointer(previousLink, currentRoot)
  const identityPath = writePluginBundleIdentity({
    pluginStore,
    targetRoot: previousRoot,
    version: pluginIdentityForRoot(previousRoot).pluginVersion,
    previousRoot: currentRoot,
    reason: 'auto-rollback-daemon-startup-failure',
    error,
  })
  return {
    rolledBack: true,
    reason: 'daemon_startup_failure',
    failedRoot: currentRoot,
    previousRoot,
    previousVersion: pluginIdentityForRoot(previousRoot).pluginVersion,
    identityPath,
  }
}

function pluginStartupFailureRollbackEnabled(): boolean {
  const raw = process.env.MOVSCRIPT_PLUGIN_ROLLBACK_ON_DAEMON_START_FAILURE?.trim().toLowerCase()
  return raw !== '0' && raw !== 'false' && raw !== 'off'
}

function pluginPointerTarget(linkPath: string, pluginStore: string): string | undefined {
  try {
    if (!lstatSync(linkPath).isSymbolicLink()) return undefined
    const target = readlinkSync(linkPath)
    return isAbsolute(target) ? target : resolve(pluginStore, target)
  } catch {
    return undefined
  }
}

function switchPluginPointer(linkPath: string, targetRoot: string): void {
  const tmpLink = `${linkPath}.next.${process.pid}.${Date.now()}`
  rmSync(tmpLink, { force: true })
  symlinkSync(targetRoot, tmpLink, process.platform === 'win32' ? 'junction' : 'dir')
  rmSync(linkPath, { force: true })
  renameSync(tmpLink, linkPath)
}

function sameDirectory(left: string, right: string): boolean {
  try {
    return realpathSync(left) === realpathSync(right)
  } catch {
    return resolve(left) === resolve(right)
  }
}

function writePluginBundleIdentity(input: {
  pluginStore: string
  targetRoot: string
  version: string
  previousRoot: string
  reason: string
  error: unknown
}): string {
  const identityPath = resolve(input.pluginStore, 'current.identity')
  const content = [
    'schema=movscript.agent-plugin-bundle.v1',
    `version=${input.version}`,
    `pluginRoot=${input.targetRoot}`,
    `currentLink=${resolve(input.pluginStore, 'current')}`,
    `previousRoot=${input.previousRoot}`,
    `installedAt=${new Date().toISOString()}`,
    `reason=${input.reason}`,
    `startupError=${errorMessage(input.error).replace(/\r?\n/g, ' ')}`,
    '',
  ].join('\n')
  writeFileSync(identityPath, content, 'utf8')
  return identityPath
}

function isLegacyAgentMCPInvocation(): boolean {
  const invoked = process.argv[1]
  if (!invoked) return false
  const invokedName = basename(invoked)
  return (invokedName === 'movscript-agent-mcp' || invokedName === 'movscript-agent-mcp.mjs') && process.argv.length <= 2
}

async function runPersistentLocalNode(): Promise<void> {
  await runLocalDaemonServicePlane({
    identity: currentPluginIdentity(),
    owner: 'agent-provider',
    entrypoint: AGENT_MCP_ENTRYPOINT,
    repoRoot: DEV_REPO_ROOT,
    bundleRoot: PLUGIN_ROOT,
    runCwd: RUN_CWD,
    hasBundledRuntime: HAS_BUNDLED_RUNTIME,
  })
}

function createPluginProgramAdapters(): ProgramAdapter[] {
  const localDaemonPaths = resolveLocalDaemonServicePlanePaths({
    entrypoint: AGENT_MCP_ENTRYPOINT,
    repoRoot: DEV_REPO_ROOT,
    bundleRoot: PLUGIN_ROOT,
    runCwd: RUN_CWD,
    hasBundledRuntime: HAS_BUNDLED_RUNTIME,
  })

  return [
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
    {
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
    },
    createLocalSurfaceHostProgramAdapter(localDaemonPaths),
  ]
}

main().catch((error) => {
  process.stderr.write(`MovScript Agent MCP host failed: ${errorMessage(error)}\n`)
  process.exit(1)
})
