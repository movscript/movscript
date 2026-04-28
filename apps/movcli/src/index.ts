import { Command } from 'commander'
import { cmdInit } from './commands/init.js'
import { cmdBuild } from './commands/build.js'
import { cmdInstall } from './commands/install.js'
import { cmdList } from './commands/list.js'
import {
  cmdAgentChat,
  cmdAgentRun,
  cmdAgentRuns,
  cmdAgentRunStatus,
  cmdAgentStatus,
  cmdAgentThread,
  cmdAgentThreads,
} from './commands/agent.js'

const program = new Command()

program
  .name('movcli')
  .description('MovScript CLI — init, build, and manage plugins')
  .version('0.2.0')
  .option('--server <url>', 'MovScript server URL', 'http://localhost:8080')
  .option('--agent-server <url>', 'MovScript agent server URL', 'http://127.0.0.1:28765')
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

const agent = program
  .command('agent')
  .description('Talk to the local MovScript agent server')

agent
  .command('status')
  .description('Show local agent server health')
  .action(() => cmdAgentStatus(program.opts()))

agent
  .command('chat [message...]')
  .description('Chat with the local MovScript agent')
  .option('--no-context', 'Do not ask the agent to include current MovScript context')
  .action((message, options) => cmdAgentChat(message ?? [], options, program.opts()))

agent
  .command('threads')
  .description('List local agent threads')
  .action(() => cmdAgentThreads(program.opts()))

agent
  .command('thread <id>')
  .description('Show one local agent thread')
  .action((id) => cmdAgentThread(id, program.opts()))

agent
  .command('run <message...>')
  .description('Create a thread message and run the local agent loop')
  .option('--thread <id>', 'Reuse an existing local agent thread')
  .option('--json', 'Print the complete run and thread JSON')
  .action((message, options) => cmdAgentRun(message ?? [], options, program.opts()))

agent
  .command('runs')
  .description('List local agent runs')
  .action(() => cmdAgentRuns(program.opts()))

agent
  .command('run-status <id>')
  .description('Show one local agent run')
  .action((id) => cmdAgentRunStatus(id, program.opts()))

program.parse()
