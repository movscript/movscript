import { Command } from 'commander'
import { cmdInit } from './commands/init.js'
import { cmdBuild } from './commands/build.js'
import { cmdInstall } from './commands/install.js'
import { cmdList } from './commands/list.js'

const program = new Command()

program
  .name('movcli')
  .description('MovScript CLI — init, build, and manage plugins')
  .version('0.2.0')
  .option('--server <url>', 'MovScript server URL', 'http://localhost:8080')
  .option('--token <token>', 'API token (or set MOVCLI_TOKEN env)')

program
  .command('init [name]')
  .description('Scaffold a new plugin project')
  .option('--webview', 'Include a UI entry point (src/ui.tsx)')
  .action(cmdInit)

program
  .command('build')
  .description('Bundle the plugin in the current directory into a .movpkg file')
  .option('--out <dir>', 'Output directory', 'dist')
  .option('--cwd <dir>', 'Plugin project directory (defaults to current directory)')
  .action(cmdBuild)

program
  .command('install <pkg>')
  .description('Install a plugin from a .movpkg file or registry ID')
  .option('--registry <url>', 'Plugin registry base URL', 'https://registry.movscript.com')
  .action((pkg, options, cmd) => cmdInstall(pkg, options, cmd.parent!.opts()))

program
  .command('list')
  .description('List available plugins in the registry')
  .option('--registry <url>', 'Plugin registry base URL', 'https://registry.movscript.com')
  .action(cmdList)

program.parse()
