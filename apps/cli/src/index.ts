import { Command } from 'commander'
import { basename } from 'node:path'
import { registerAdminCommands } from './commands/admin.js'
import { registerAuthCommands } from './commands/auth.js'
import { registerContextCommands } from './commands/context.js'
import { registerDomainCommands } from './commands/domain.js'
import { registerEditingCommands } from './commands/editing.js'
import { registerLangCommands } from './commands/lang.js'
import { registerMCPCommands } from './commands/mcp.js'
import { registerProductionEditingCommands } from './commands/production-editing.js'
import { registerDaemonCommands, registerDoctorCommand, registerRuntimeCommands } from './commands/runtime.js'
import {
  registerArtifactCommands,
  registerExternalResourceCommands,
  registerProductionCommands,
  registerProjectCommands,
  registerResourceCommands,
  registerShotCommands,
  registerSystemCommands,
  registerVideoCommands,
} from './commands/system.js'
import { registerWorkspaceCommands } from './commands/workspace.js'

export function createMovScriptCliProgram(name = 'movscript'): Command {
  const program = new Command()

  program
    .name(name)
    .description('MovScript command line')
    .version('0.2.0')
    .option('--server <url>', 'MovScript server URL', 'http://localhost:8766')
    .option('--token <token>', 'API token (or set MOVSCRIPT_DATA_SERVICE_TOKEN env)')
    .option('--workspace <dir>', 'MovScript workspace root directory')

  registerAuthCommands(program)
  registerDoctorCommand(program)
  registerDaemonCommands(program)
  registerRuntimeCommands(program)
  registerMCPCommands(program)
  registerContextCommands(program)
  registerAdminCommands(program)
  registerProjectCommands(program)
  registerProductionCommands(program)
  registerResourceCommands(program)
  registerArtifactCommands(program)
  registerExternalResourceCommands(program)
  registerShotCommands(program)
  registerVideoCommands(program)
  registerSystemCommands(program)
  registerProductionEditingCommands(program)
  registerDomainCommands(program)
  registerEditingCommands(program)
  registerLangCommands(program)
  registerWorkspaceCommands(program)
  configureCommandHelp(program)
  return program
}

export async function runMovScriptCli(argv: string[] = process.argv): Promise<void> {
  argv = normalizeMovScriptCliArgv(argv)
  const program = createMovScriptCliProgram('movscript')
  if (argv.length <= 2) {
    program.outputHelp()
    return
  }
  await program.parseAsync(argv)
}

export async function main(): Promise<void> {
  await runMovScriptCli(process.argv)
}

export function normalizeMovScriptCliArgv(argv: string[]): string[] {
  const maybeShimPath = argv[2]
  if (maybeShimPath === '--') return [argv[0]!, argv[1]!, ...argv.slice(3)]
  if (!maybeShimPath || basename(maybeShimPath) !== 'movscript.mjs') return argv
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

function isDirectMovScriptCliInvocation(): boolean {
  if (process.env.MOVSCRIPT_CLI_EMBEDDED === '1') return false
  const invoked = process.argv[1]
  if (!invoked) return false
  const invokedName = basename(invoked)
  if (['movscript', 'movscript.cmd', 'movscript.mjs'].includes(invokedName)) return true
  return invokedName === 'index.cjs' || invokedName === 'index.js' || invokedName === 'index.ts'
}

if (isDirectMovScriptCliInvocation()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
