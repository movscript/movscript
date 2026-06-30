import type { Command } from 'commander'
import {
  runMovScriptWorkspaceCommand,
  workspaceCommandById,
  type MovScriptCommandExecution,
  type WorkspaceCommandSpec,
} from '@movscript/cli-commands'

interface WorkspaceCommandOptions {
  workspace?: string
  cwd?: string
  projectDir?: string
  projectUid?: string
  server?: string
  user?: string
  org?: string
  commit?: string
  json?: boolean
}

interface WorkspaceGetModelOptions extends WorkspaceCommandOptions {
  entityId?: string
}

export function registerWorkspaceCommands(program: Command): void {
  const workspace = program
    .command('workspace')
    .alias('ws')
    .description('Inspect, review, and interpret MovScript project workspaces')

  workspace
    .command('get-model <entityType>')
    .description('Return the domain workspace model for one editable entity')
    .option('--entity-id <id>', 'Optional entity id used to expand editable path hints')
    .option('--workspace <dir>', 'Project workspace Git repository root')
    .option('--cwd <dir>', 'Alias for --workspace')
    .option('--project-dir <dir>', 'Alias for --workspace')
    .option('--project-uid <uid>', 'Project uid used by Project Service backed workspace commands')
    .option('--server <url>', 'Project Service or daemon gateway base URL')
    .option('--user <id>', 'Workspace user id')
    .option('--json', 'Print JSON output')
    .action(async (entityType: string, options: WorkspaceGetModelOptions, command: Command) => {
      await runWorkspaceCommand(workspaceCommandSpec('workspace.get_model'), workspaceArgs(options, command, {
        entityKind: entityType,
        entityId: options.entityId,
      }))
    })

  workspace
    .command('review')
    .description('Review current MovScript source files and diagnostics without publishing product state')
    .option('--workspace <dir>', 'Project workspace Git repository root')
    .option('--cwd <dir>', 'Alias for --workspace')
    .option('--project-dir <dir>', 'Alias for --workspace')
    .option('--project-uid <uid>', 'Project uid used by Project Service backed workspace commands')
    .option('--server <url>', 'Project Service or daemon gateway base URL')
    .option('--user <id>', 'Workspace user id')
    .option('--org <id>', 'Workspace organization id')
    .option('--commit <ref>', 'Compare current source against a specific git commit/ref')
    .option('--json', 'Print JSON output')
    .action(async (options: WorkspaceCommandOptions, command: Command) => {
      const execution = await runWorkspaceCommand(workspaceCommandSpec('workspace.review'), workspaceArgs(options, command))
      if (isRecord(execution?.data) && execution.data.readyToInterpret === false) process.exitCode = 2
    })

  workspace
    .command('interpret')
    .description('Validate current MovScript source files and refresh interpreter debug artifacts')
    .option('--workspace <dir>', 'Project workspace Git repository root')
    .option('--cwd <dir>', 'Alias for --workspace')
    .option('--project-dir <dir>', 'Alias for --workspace')
    .option('--project-uid <uid>', 'Project uid used by Project Service backed workspace commands')
    .option('--server <url>', 'Project Service or daemon gateway base URL')
    .option('--user <id>', 'Workspace user id')
    .option('--org <id>', 'Workspace organization id')
    .option('--json', 'Print JSON output')
    .action(async (options: WorkspaceCommandOptions, command: Command) => {
      const execution = await runWorkspaceCommand(workspaceCommandSpec('workspace.interpret'), workspaceArgs(options, command))
      if (isRecord(execution?.data) && execution.data.status === 'failed') process.exitCode = 2
    })
}

function commandGlobalOptions(command: Command): { server?: string; workspace?: string; cwd?: string } {
  const root = rootCommand(command)
  const options = root.optsWithGlobals ? root.optsWithGlobals() : root.opts()
  const serverSource = root.getOptionValueSource?.('server')
  return {
    server: serverSource && serverSource !== 'default' && typeof options.server === 'string' ? options.server : undefined,
    workspace: typeof options.workspace === 'string' ? options.workspace : undefined,
    cwd: typeof options.cwd === 'string' ? options.cwd : undefined,
  }
}

async function runWorkspaceCommand(
  spec: WorkspaceCommandSpec,
  args: Record<string, unknown>,
): Promise<MovScriptCommandExecution | undefined> {
  try {
    const execution = await runMovScriptWorkspaceCommand(spec, args)
    console.log(JSON.stringify(execution, null, 2))
    return execution
  } catch (error) {
    console.log(JSON.stringify({
      status: 'error',
      error: {
        code: 'workspace_command_failed',
        message: errorMessage(error),
      },
    }, null, 2))
    process.exitCode = 1
    return undefined
  }
}

function workspaceCommandSpec(commandId: string): WorkspaceCommandSpec {
  const spec = workspaceCommandById.get(commandId)
  if (!spec) throw new Error(`workspace command is not registered: ${commandId}`)
  return spec
}

function workspaceArgs(
  options: WorkspaceCommandOptions,
  command: Command,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const global = commandGlobalOptions(command)
  return compactRecord({
    backendBaseURL: options.server ?? global.server,
    workspaceDir: options.workspace ?? global.workspace,
    projectDir: options.projectDir,
    projectUid: options.projectUid,
    cwd: options.cwd ?? global.cwd,
    user: options.user,
    org: options.org,
    commit: options.commit,
    ...extra,
  })
}

function rootCommand(command: Command): Command {
  let current = command
  while (current.parent) current = current.parent
  return current
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
