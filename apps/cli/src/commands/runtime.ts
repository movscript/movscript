import type { Command } from 'commander'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { runMovScriptRuntimeCommand } from '@movscript/cli-commands'
import { runLocalDaemonServicePlane } from '@movscript/local-daemon'

type RuntimeCommandOptions = {
  homeDir?: string
  workspace?: string
  projectDir?: string
  cwd?: string
  timeoutMs?: string
  json?: boolean
}

type DaemonStartOptions = RuntimeCommandOptions & {
  entrypoint?: string
  dataPlane?: string
  dataServiceUrl?: string
  idleTimeout?: string
  startupTimeoutMs?: string
  stopTimeoutMs?: string
  forceRestart?: boolean
}

type DaemonRunOptions = RuntimeCommandOptions & {
  dataPlane?: string
  dataServiceUrl?: string
  idleTimeout?: string
}

type ConfirmedRuntimeOptions = RuntimeCommandOptions & {
  yes?: boolean
}

type RuntimeConfigureOptions = RuntimeCommandOptions & {
  backendMode?: string
  backendBaseUrl?: string
  token?: string
  remember?: boolean
  clearToken?: boolean
}

type PreflightOptions = RuntimeCommandOptions & {
  requireProject?: boolean
}

export function registerRuntimeCommands(program: Command): void {
  const runtime = program
    .command('runtime')
    .description('Discover, configure, and control the MovScript runtime daemon')

  addRuntimeContextOptions(runtime
    .command('status')
    .description('Show runtime owner, backend, workspace, surface, and media readiness'))
    .action(async (options: RuntimeCommandOptions, command: Command) => {
      await runRuntimeTool('movscript_runtime_status', () => runtimeContextArgs(options, command), options, command)
    })

  addRuntimeConfigureOptions(runtime
    .command('configure')
    .description('Configure the runtime backend binding for this CLI/MCP process'))
    .action(async (options: RuntimeConfigureOptions, command: Command) => {
      await runRuntimeTool('movscript_runtime_configure', () => runtimeConfigureArgs(options, command), options, command)
    })

  const daemon = runtime
    .command('daemon')
    .description('Discover and control the local MovScript daemon')

  registerDaemonSubcommands(daemon)
  registerRuntimeDescriptorCommands(runtime)
  registerRuntimePreflightCommands(runtime)
}

export function registerDaemonCommands(program: Command): void {
  const daemon = program
    .command('daemon')
    .description('Discover and control the local MovScript daemon')
  registerDaemonSubcommands(daemon, { includeRunCommand: true })
}

function registerDaemonSubcommands(daemon: Command, options: { includeRunCommand?: boolean } = {}): void {
  if (options.includeRunCommand) {
    addDaemonRunOptions(daemon
      .command('run')
      .description('Run the local daemon process entrypoint'))
      .action(async (runtimeOptions: DaemonRunOptions) => {
        await runStandaloneDaemon(runtimeOptions)
      })
  }

  addRuntimeContextOptions(daemon
    .command('discover')
    .description('Read daemon endpoints from MovScript Home without starting anything'))
    .action(async (runtimeOptions: RuntimeCommandOptions, command: Command) => {
      await runRuntimeTool('runtime_daemon_discover', () => runtimeContextArgs(runtimeOptions, command), runtimeOptions, command)
    })

  addDaemonStartOptions(daemon
    .command('ensure')
    .description('Start the local daemon if needed, otherwise reuse the current one'))
    .action(async (runtimeOptions: DaemonStartOptions, command: Command) => {
      await runRuntimeTool('runtime_daemon_ensure', () => daemonStartArgs(runtimeOptions, command), runtimeOptions, command)
    })

  addDaemonStartOptions(daemon
    .command('start')
    .description('Explicitly start the local daemon if it is not ready'))
    .action(async (runtimeOptions: DaemonStartOptions, command: Command) => {
      await runRuntimeTool('runtime_daemon_start', () => daemonStartArgs(runtimeOptions, command), runtimeOptions, command)
    })

  addRuntimeContextOptions(daemon
    .command('status')
    .description('Call the local daemon control endpoint status API'))
    .action(async (runtimeOptions: RuntimeCommandOptions, command: Command) => {
      await runRuntimeTool('runtime_daemon_status', () => runtimeContextArgs(runtimeOptions, command), runtimeOptions, command)
    })

  addConfirmedRuntimeOptions(daemon
    .command('stop')
    .description('Stop the local daemon; requires --yes'))
    .action(async (runtimeOptions: ConfirmedRuntimeOptions, command: Command) => {
      if (!runtimeOptions.yes) {
        printError('runtime_daemon_stop requires --yes', runtimeOptions)
        process.exitCode = 1
        return
      }
      await runRuntimeTool('runtime_daemon_stop', () => runtimeContextArgs(runtimeOptions, command), runtimeOptions, command)
    })

  addConfirmedRuntimeOptions(daemon
    .command('restart')
    .description('Restart the local daemon; requires --yes'))
    .action(async (runtimeOptions: ConfirmedRuntimeOptions, command: Command) => {
      if (!runtimeOptions.yes) {
        printError('runtime_daemon_restart requires --yes', runtimeOptions)
        process.exitCode = 1
        return
      }
      await runRuntimeTool('runtime_daemon_restart', () => runtimeContextArgs(runtimeOptions, command), runtimeOptions, command)
    })

  addRuntimeConfigureOptions(daemon
    .command('configure')
    .description('Alias for runtime configure, kept near daemon control commands'))
    .action(async (runtimeOptions: RuntimeConfigureOptions, command: Command) => {
      await runRuntimeTool('runtime_daemon_configure', () => runtimeConfigureArgs(runtimeOptions, command), runtimeOptions, command)
    })
}

function registerRuntimeDescriptorCommands(runtime: Command): void {
  const descriptor = runtime
    .command('descriptor')
    .description('Read runtime descriptor contracts')

  addRuntimeContextOptions(descriptor
    .command('get')
    .description('Return canonical daemon/runtime service endpoints and readiness'))
    .action(async (options: RuntimeCommandOptions, command: Command) => {
      await runRuntimeTool('runtime_descriptor_get', () => runtimeContextArgs(options, command), options, command)
    })
}

function registerRuntimePreflightCommands(runtime: Command): void {
  const preflight = runtime
    .command('preflight')
    .description('Validate runtime prerequisites for project and production work')

  addRuntimeContextOptions(preflight
    .command('check')
    .description('Return blocking and degraded runtime checks'))
    .option('--require-project', 'Block when the selected project source is missing', true)
    .option('--no-require-project', 'Treat missing project source as a warning')
    .action(async (options: PreflightOptions, command: Command) => {
      const result = await runRuntimeTool('runtime_preflight_check', () => ({
        ...runtimeContextArgs(options, command),
        requireProject: options.requireProject !== false,
      }), options, command)
      const data = isRecord(result) ? result.data : undefined
      if (isRecord(data) && data.ready === false && process.exitCode === undefined) {
        process.exitCode = 2
      }
    })
}

function addRuntimeContextOptions(command: Command): Command {
  return command
    .option('--home-dir <dir>', 'MovScript Home directory')
    .option('--workspace <dir>', 'Workspace root directory')
    .option('--project-dir <dir>', 'MovScript project source directory')
    .option('--cwd <dir>', 'Working directory for runtime operations')
    .option('--timeout-ms <ms>', 'Probe timeout in milliseconds')
    .option('--json', 'Print JSON output')
}

function addDaemonStartOptions(command: Command): Command {
  return addRuntimeContextOptions(command)
    .option('--entrypoint <path>', 'Daemon bootstrap entrypoint')
    .option('--data-plane <local|cloud|external>', 'Runtime data plane for daemon bootstrap')
    .option('--data-service-url <url>', 'External/cloud Data Service URL for daemon bootstrap')
    .option('--idle-timeout <duration>', 'Daemon idle timeout passed to the local runtime')
    .option('--startup-timeout-ms <ms>', 'Startup wait timeout in milliseconds')
    .option('--stop-timeout-ms <ms>', 'Stop wait timeout in milliseconds')
    .option('--force-restart', 'Stop and restart an existing daemon before waiting for readiness')
}

function addDaemonRunOptions(command: Command): Command {
  return addRuntimeContextOptions(command)
    .option('--data-plane <local|cloud|external>', 'Runtime data plane for daemon bootstrap')
    .option('--data-service-url <url>', 'External/cloud Data Service URL for daemon bootstrap')
    .option('--idle-timeout <duration>', 'Daemon idle timeout passed to the local runtime')
}

function addConfirmedRuntimeOptions(command: Command): Command {
  return addRuntimeContextOptions(command)
    .option('--yes', 'Confirm the daemon control action')
}

function addRuntimeConfigureOptions(command: Command): Command {
  return addRuntimeContextOptions(command)
    .option('--backend-mode <local|cloud|external>', 'Configured backend mode')
    .option('--backend-base-url <url>', 'Backend or daemon gateway base URL')
    .option('--token <token>', 'Runtime backend token')
    .option('--remember', 'Persist backend base URL in the workspace .movscript config')
    .option('--clear-token', 'Clear persisted runtime/backend token state')
}

async function runRuntimeTool(
  name: string,
  argsInput: Record<string, unknown> | (() => Record<string, unknown>),
  options: RuntimeCommandOptions,
  command: Command,
): Promise<unknown> {
  try {
    const args = typeof argsInput === 'function' ? argsInput() : argsInput
    const result = await runMovScriptRuntimeCommand(name, args)
    printResult(result, options, command)
    const data = isRecord(result) ? result.data : undefined
    if (isRecord(data) && data.status === 'error' && process.exitCode === undefined) {
      process.exitCode = 1
    }
    return result
  } catch (error) {
    printError(errorMessage(error), options)
    process.exitCode = 1
    return undefined
  }
}

function runtimeContextArgs(options: RuntimeCommandOptions, command: Command): Record<string, unknown> {
  const global = commandGlobalOptions(command)
  return compactRecord({
    homeDir: options.homeDir,
    workspaceDir: options.workspace ?? global.workspace,
    projectDir: options.projectDir,
    cwd: options.cwd,
    timeoutMs: numberOption(options.timeoutMs),
  })
}

function daemonStartArgs(options: DaemonStartOptions, command: Command): Record<string, unknown> {
  return compactRecord({
    ...runtimeContextArgs(options, command),
    entrypoint: options.entrypoint,
    dataPlane: options.dataPlane,
    dataServiceURL: options.dataServiceUrl,
    idleTimeout: options.idleTimeout,
    startupTimeoutMs: numberOption(options.startupTimeoutMs),
    stopTimeoutMs: numberOption(options.stopTimeoutMs),
    forceRestart: options.forceRestart === true ? true : undefined,
  })
}

function runtimeConfigureArgs(options: RuntimeConfigureOptions, command: Command): Record<string, unknown> {
  return compactRecord({
    ...runtimeContextArgs(options, command),
    backendMode: options.backendMode,
    backendBaseURL: options.backendBaseUrl,
    token: options.token,
    remember: options.remember === true ? true : undefined,
    clearToken: options.clearToken === true ? true : undefined,
  })
}

async function runStandaloneDaemon(options: DaemonRunOptions): Promise<void> {
  await runLocalDaemonServicePlane({
    homeDir: options.homeDir,
    env: daemonRunEnvFromOptions(options),
    identity: currentCLIRuntimeIdentity(),
    owner: 'cli',
    repoRoot: resolveCLIRepoRoot(),
    runCwd: resolveCLIRepoRoot(),
    hasBundledRuntime: false,
  })
}

function daemonRunEnvFromOptions(options: DaemonRunOptions): NodeJS.ProcessEnv | undefined {
  const env: NodeJS.ProcessEnv = {}
  if (options.dataPlane) env.MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE = options.dataPlane
  if (options.dataServiceUrl) env.MOVSCRIPT_DATA_SERVICE_URL = options.dataServiceUrl
  if (options.idleTimeout) {
    env.MOVSCRIPT_LOCAL_DAEMON_IDLE_TIMEOUT = options.idleTimeout
    env.MOVSCRIPT_LOCAL_NODE_IDLE_TIMEOUT = options.idleTimeout
  }
  return Object.keys(env).length > 0 ? env : undefined
}

function currentCLIRuntimeIdentity(): { runtimeVersion: string; runtimeRoot: string } {
  const runtimeRoot = resolveCLIRepoRoot()
  return {
    runtimeVersion: readPackageVersion(resolve(runtimeRoot, 'apps/cli/package.json'))
      ?? readPackageVersion(resolve(process.cwd(), 'package.json'))
      ?? 'unknown',
    runtimeRoot,
  }
}

function resolveCLIRepoRoot(): string {
  const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined
  const invokedDir = invokedPath ? dirname(invokedPath) : undefined
  for (const candidate of [
    process.env.MOVSCRIPT_REPO_ROOT ? resolve(process.env.MOVSCRIPT_REPO_ROOT) : undefined,
    process.cwd(),
    resolve(process.cwd(), '../..'),
    invokedDir ? resolve(invokedDir, '../../..') : undefined,
    invokedDir ? resolve(invokedDir, '../../../..') : undefined,
  ]) {
    if (!candidate) continue
    if (existsSync(resolve(candidate, 'pnpm-workspace.yaml'))) return candidate
  }
  return process.cwd()
}

function readPackageVersion(packagePath: string): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(packagePath, 'utf8')) as Record<string, unknown>
    return typeof manifest.version === 'string' && manifest.version.trim() ? manifest.version : undefined
  } catch {
    return undefined
  }
}

function commandGlobalOptions(command: Command): { workspace?: string } {
  const root = rootCommand(command)
  const options = root.opts()
  return {
    workspace: typeof options.workspace === 'string' ? options.workspace : undefined,
  }
}

function rootCommand(command: Command): Command {
  let current = command
  while (current.parent) current = current.parent
  return current
}

function numberOption(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`expected a positive number, received ${value}`)
  }
  return parsed
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

function printResult(result: unknown, _options: RuntimeCommandOptions, _command: Command): void {
  console.log(JSON.stringify(result, null, 2))
}

function printError(message: string, _options: RuntimeCommandOptions): void {
  console.log(JSON.stringify({
    status: 'error',
    error: {
      code: 'runtime_command_failed',
      message,
    },
  }, null, 2))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
