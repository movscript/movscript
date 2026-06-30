import type { Command } from 'commander'
import { runMovScriptContextCommand } from '@movscript/cli-commands'

interface ContextCliOptions {
  homeDir?: string
  workspace?: string
  projectDir?: string
  json?: boolean
}

export function registerContextCommands(program: Command): void {
  const context = program
    .command('context')
    .description('Inspect read-only MovScript runtime and UI session context')

  const current = context
    .command('current')
    .description('Read the current context snapshot')

  addContextOptions(current
    .command('get')
    .description('Return the current read-only route, project, production, user, and selection hint'))
    .action(async (options: ContextCliOptions, command: Command) => {
      await runContextCommand('context_current_get', contextArgs(options, command))
    })
}

function addContextOptions(command: Command): Command {
  return command
    .option('--home-dir <dir>', 'MovScript Home directory')
    .option('--workspace <dir>', 'Workspace root directory')
    .option('--project-dir <dir>', 'MovScript project source directory')
    .option('--json', 'Print JSON output')
}

async function runContextCommand(commandName: string, args: Record<string, unknown>): Promise<void> {
  try {
    const execution = await runMovScriptContextCommand(commandName, args)
    console.log(JSON.stringify(execution, null, 2))
  } catch (error) {
    console.log(JSON.stringify({
      status: 'error',
      error: {
        code: 'context_command_failed',
        message: errorMessage(error),
      },
    }, null, 2))
    process.exitCode = 1
  }
}

function contextArgs(options: ContextCliOptions, command: Command): Record<string, unknown> {
  const global = commandGlobalOptions(command)
  return compactRecord({
    homeDir: options.homeDir,
    workspaceDir: options.workspace ?? global.workspace,
    projectDir: options.projectDir,
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

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
