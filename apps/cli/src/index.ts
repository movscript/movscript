import { Command } from 'commander'
import { basename } from 'node:path'
import { registerAuthCommands } from './commands/auth.js'
import { registerLangCommands } from './commands/lang.js'
import { registerWorkspaceCommands } from './commands/workspace.js'

const program = new Command()

program
  .name('movcli')
  .description('MovScript CLI')
  .version('0.2.0')
  .option('--server <url>', 'MovScript server URL', 'http://localhost:8765')
  .option('--token <token>', 'API token (or set MOVCLI_TOKEN env)')
  .option('--workspace <dir>', 'MovScript workspace root directory')

registerAuthCommands(program)
registerLangCommands(program)
registerWorkspaceCommands(program)
configureCommandHelp(program)

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

async function main(): Promise<void> {
  const argv = normalizeMovcliArgv(process.argv)
  if (argv.length <= 2) {
    program.outputHelp()
    return
  }
  await program.parseAsync(argv)
}

function normalizeMovcliArgv(argv: string[]): string[] {
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
