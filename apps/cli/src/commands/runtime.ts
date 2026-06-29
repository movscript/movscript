import type { Command } from 'commander'
import { callMCPHostTool } from '@movscript/mcp-host'

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

  addRuntimeContextOptions(daemon
    .command('discover')
    .description('Read daemon endpoints from MovScript Home without starting anything'))
    .action(async (options: RuntimeCommandOptions, command: Command) => {
      await runRuntimeTool('runtime_daemon_discover', () => runtimeContextArgs(options, command), options, command)
    })

  addDaemonStartOptions(daemon
    .command('ensure')
    .description('Start the local daemon if needed, otherwise reuse the current one'))
    .action(async (options: DaemonStartOptions, command: Command) => {
      await runRuntimeTool('runtime_daemon_ensure', () => daemonStartArgs(options, command), options, command)
    })

  addDaemonStartOptions(daemon
    .command('start')
    .description('Explicitly start the local daemon if it is not ready'))
    .action(async (options: DaemonStartOptions, command: Command) => {
      await runRuntimeTool('runtime_daemon_start', () => daemonStartArgs(options, command), options, command)
    })

  addRuntimeContextOptions(daemon
    .command('status')
    .description('Call the local daemon control endpoint status API'))
    .action(async (options: RuntimeCommandOptions, command: Command) => {
      await runRuntimeTool('runtime_daemon_status', () => runtimeContextArgs(options, command), options, command)
    })

  addConfirmedRuntimeOptions(daemon
    .command('stop')
    .description('Stop the local daemon; requires --yes'))
    .action(async (options: ConfirmedRuntimeOptions, command: Command) => {
      if (!options.yes) {
        printError('runtime_daemon_stop requires --yes', options)
        process.exitCode = 1
        return
      }
      await runRuntimeTool('runtime_daemon_stop', () => runtimeContextArgs(options, command), options, command)
    })

  addConfirmedRuntimeOptions(daemon
    .command('restart')
    .description('Restart the local daemon; requires --yes'))
    .action(async (options: ConfirmedRuntimeOptions, command: Command) => {
      if (!options.yes) {
        printError('runtime_daemon_restart requires --yes', options)
        process.exitCode = 1
        return
      }
      await runRuntimeTool('runtime_daemon_restart', () => runtimeContextArgs(options, command), options, command)
    })

  addRuntimeConfigureOptions(daemon
    .command('configure')
    .description('Alias for runtime configure, kept near daemon control commands'))
    .action(async (options: RuntimeConfigureOptions, command: Command) => {
      await runRuntimeTool('runtime_daemon_configure', () => runtimeConfigureArgs(options, command), options, command)
    })

  const descriptor = runtime
    .command('descriptor')
    .description('Read runtime descriptor contracts')

  addRuntimeContextOptions(descriptor
    .command('get')
    .description('Return canonical daemon/runtime service endpoints and readiness'))
    .action(async (options: RuntimeCommandOptions, command: Command) => {
      await runRuntimeTool('runtime_descriptor_get', () => runtimeContextArgs(options, command), options, command)
    })

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
      if (isRecord(result) && result.ready === false && process.exitCode === undefined) {
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
    const result = await callMCPHostTool({
      name,
      arguments: args,
    } as Parameters<typeof callMCPHostTool>[0])
    printResult(result, options, command)
    if (isRecord(result) && result.status === 'error' && process.exitCode === undefined) {
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
