import { Command } from 'commander'
import { basename } from 'node:path'
import { registerAuthCommands } from './commands/auth.js'
import { registerLangCommands } from './commands/lang.js'
import { registerWorkspaceCommands } from './commands/workspace.js'

export function createMovcliProgram(): Command {
  const program = new Command()

  program
    .name('movcli')
    .description('MovScript CLI')
    .version('0.2.0')
    .option('--server <url>', 'MovScript server URL', 'http://localhost:8765')
    .option('--token <token>', 'API token (or set MOVSCRIPT_DATA_SERVICE_TOKEN env)')
    .option('--workspace <dir>', 'MovScript workspace root directory')

  registerAuthCommands(program)
  registerLangCommands(program)
  registerWorkspaceCommands(program)
  configureCommandHelp(program)
  return program
}

export async function runMovcli(argv: string[] = process.argv): Promise<void> {
  const program = createMovcliProgram()
  argv = normalizeMovcliArgv(argv)
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
  if (!maybeShimPath || basename(maybeShimPath) !== 'movcli.mjs') return argv
  return [argv[0]!, argv[1]!, ...argv.slice(3)]
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
  const invoked = process.argv[1]
  if (!invoked) return false
  const invokedName = basename(invoked)
  if (invokedName === 'movcli' || invokedName === 'movcli.cmd' || invokedName === 'movcli.mjs') return true
  return invokedName === 'index.cjs' || invokedName === 'index.js'
}

if (isDirectMovcliInvocation()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
