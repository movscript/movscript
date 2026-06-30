import { Command } from 'commander'
import { basename } from 'node:path'
import { registerAdminCommands } from './commands/admin.js'
import { registerAuthCommands } from './commands/auth.js'
import { registerContextCommands } from './commands/context.js'
import { registerEditingCommands } from './commands/editing.js'
import { registerLangCommands } from './commands/lang.js'
import { registerMCPCommands } from './commands/mcp.js'
import { registerDaemonCommands, registerRuntimeCommands } from './commands/runtime.js'
import { registerSystemCommands } from './commands/system.js'
import { registerTimelineCommands } from './commands/timeline.js'
import { registerWorkspaceCommands } from './commands/workspace.js'

export function createMovcliProgram(name = 'movscript'): Command {
  const program = new Command()

  program
    .name(name)
    .description('MovScript command line')
    .version('0.2.0')
    .option('--server <url>', 'MovScript server URL', 'http://localhost:8766')
    .option('--token <token>', 'API token (or set MOVSCRIPT_DATA_SERVICE_TOKEN env)')
    .option('--workspace <dir>', 'MovScript workspace root directory')

  registerAuthCommands(program)
  registerDaemonCommands(program)
  registerRuntimeCommands(program)
  registerMCPCommands(program)
  registerContextCommands(program)
  registerAdminCommands(program)
  registerSystemCommands(program)
  registerEditingCommands(program)
  registerTimelineCommands(program)
  registerLangCommands(program)
  registerWorkspaceCommands(program)
  configureCommandHelp(program)
  return program
}

export async function runMovcli(argv: string[] = process.argv): Promise<void> {
  argv = normalizeMovcliArgv(argv)
  const program = createMovcliProgram(programNameFromArgv(argv))
  if (argv.length <= 2) {
    program.outputHelp()
    return
  }
  await program.parseAsync(argv)
}

export async function main(): Promise<void> {
  await runMovcli(process.argv)
}

export function normalizeMovcliArgv(argv: string[]): string[] {
  const maybeShimPath = argv[2]
  if (maybeShimPath === '--') return [argv[0]!, argv[1]!, ...argv.slice(3)]
  if (!maybeShimPath || !['movcli.mjs', 'movscript.mjs'].includes(basename(maybeShimPath))) return argv
  return [argv[0]!, argv[1]!, ...argv.slice(3)]
}

function programNameFromArgv(argv: string[]): string {
  const invoked = argv[1]
  if (!invoked) return 'movscript'
  const name = basename(invoked)
  return name.startsWith('movcli') ? 'movcli' : 'movscript'
}

function configureCommandHelp(command: Command): void {
  command.showHelpAfterError()
  command.showSuggestionAfterError()

  for (const child of command.commands) {
    configureCommandHelp(child)
    if (child.commands.length > 0) {
      child.action(() => {
        child.outputHelp()
      })
    }
  }
}

function isDirectMovcliInvocation(): boolean {
  if (process.env.MOVSCRIPT_CLI_EMBEDDED === '1') return false
  const invoked = process.argv[1]
  if (!invoked) return false
  const invokedName = basename(invoked)
  if (['movcli', 'movcli.cmd', 'movcli.mjs', 'movscript', 'movscript.cmd', 'movscript.mjs'].includes(invokedName)) return true
  return invokedName === 'index.cjs' || invokedName === 'index.js' || invokedName === 'index.ts'
}

if (isDirectMovcliInvocation()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
