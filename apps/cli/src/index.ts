import { Command } from 'commander'
import { registerAuthCommands } from './commands/auth.js'
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
registerWorkspaceCommands(program)

program.parse()
