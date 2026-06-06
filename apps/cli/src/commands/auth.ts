import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import type { Command } from 'commander'
import {
  clearMovScriptBackendAuth,
  getMovScriptBackendMe,
  loginMovScriptBackend,
  readMovScriptBackendAuth,
  resolveMovScriptBackendSession,
  writeMovScriptBackendAuth,
  writeMovScriptBackendConfig,
} from '@movscript/core/backend/node'

interface AuthOptions {
  workspace?: string
  server?: string
  username?: string
  password?: string
  json?: boolean
}

export function registerAuthCommands(program: Command): void {
  const auth = program
    .command('auth')
    .description('Manage MovScript backend auth stored under the workspace .movscript directory')

  auth
    .command('login')
    .description('Login to the MovScript backend and store credentials in .movscript/backend/auth.json')
    .option('--workspace <dir>', 'Workspace root directory')
    .option('--server <url>', 'MovScript server URL')
    .option('--username <username>', 'Username')
    .option('--password <password>', 'Password (or set MOVCLI_PASSWORD)')
    .option('--json', 'Print JSON output')
    .action(async (options: AuthOptions, command: Command) => {
      const global = commandGlobalOptions(command)
      const workspaceDir = options.workspace ?? global.workspace
      const server = options.server ?? global.server
      const username = options.username ?? await promptValue('Username: ')
      const password = options.password ?? process.env.MOVCLI_PASSWORD ?? await promptValue('Password: ')
      const login = await loginMovScriptBackend({ workspaceDir, server, username, password })
      const authRecord = writeMovScriptBackendAuth(workspaceDir, {
        token: login.token,
        expiresAt: login.expiresAt,
        user: login.user,
      })
      const userId = typeof login.user?.id === 'string' || typeof login.user?.id === 'number' ? login.user.id : undefined
      const config = writeMovScriptBackendConfig(workspaceDir, {
        baseURL: login.baseURL,
        ...(userId !== undefined ? { activeUserId: userId } : {}),
      })
      print(options, {
        status: 'logged_in',
        workspaceDir: resolveMovScriptBackendSession({ workspaceDir }).workspaceDir,
        configPath: resolveMovScriptBackendSession({ workspaceDir }).configPath,
        authPath: resolveMovScriptBackendSession({ workspaceDir }).authPath,
        baseURL: config.baseURL,
        user: authRecord.user,
        expiresAt: authRecord.expiresAt,
      })
    })

  auth
    .command('status')
    .description('Show workspace backend auth status')
    .option('--workspace <dir>', 'Workspace root directory')
    .option('--server <url>', 'MovScript server URL override')
    .option('--json', 'Print JSON output')
    .action(async (options: AuthOptions, command: Command) => {
      const global = commandGlobalOptions(command)
      const session = resolveMovScriptBackendSession({
        workspaceDir: options.workspace ?? global.workspace,
        server: options.server ?? global.server,
        token: global.token,
      })
      const auth = readMovScriptBackendAuth(session.workspaceDir)
      let me: Record<string, unknown> | undefined
      if (session.token) {
        try {
          me = await getMovScriptBackendMe({ workspaceDir: session.workspaceDir, server: session.baseURL, token: session.token })
        } catch {
          me = undefined
        }
      }
      print(options, {
        status: session.token ? 'authenticated' : 'anonymous',
        workspaceDir: session.workspaceDir,
        baseURL: session.baseURL,
        userId: session.userId,
        user: me?.user ?? auth?.user,
        expiresAt: auth?.expiresAt,
        authPath: session.authPath,
        configPath: session.configPath,
      })
    })

  auth
    .command('logout')
    .description('Remove workspace backend credentials')
    .option('--workspace <dir>', 'Workspace root directory')
    .option('--json', 'Print JSON output')
    .action((options: AuthOptions, command: Command) => {
      const global = commandGlobalOptions(command)
      const workspaceDir = options.workspace ?? global.workspace
      const session = resolveMovScriptBackendSession({ workspaceDir })
      clearMovScriptBackendAuth(session.workspaceDir)
      print(options, {
        status: 'logged_out',
        workspaceDir: session.workspaceDir,
        authPath: session.authPath,
      })
    })
}

function commandGlobalOptions(command: Command): { server?: string; token?: string; workspace?: string } {
  const root = command.parent?.parent ?? command.parent ?? command
  const options = root.optsWithGlobals ? root.optsWithGlobals() : root.opts()
  return {
    server: typeof options.server === 'string' ? options.server : undefined,
    token: typeof options.token === 'string' ? options.token : process.env.MOVCLI_TOKEN,
    workspace: typeof options.workspace === 'string' ? options.workspace : undefined,
  }
}

async function promptValue(question: string): Promise<string> {
  const rl = createInterface({ input, output })
  try {
    return (await rl.question(question)).trim()
  } finally {
    rl.close()
  }
}

function print(options: AuthOptions, result: Record<string, unknown>): void {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }
  if (result.status === 'logged_in') {
    console.log(`Logged in to ${result.baseURL}`)
    if (result.user && typeof result.user === 'object' && 'username' in result.user) console.log(`User: ${String(result.user.username)}`)
    console.log(`Auth: ${result.authPath}`)
    return
  }
  if (result.status === 'logged_out') {
    console.log(`Logged out: ${result.authPath}`)
    return
  }
  console.log(`Backend: ${result.baseURL}`)
  console.log(`Status: ${result.status}`)
  if (result.userId) console.log(`User ID: ${result.userId}`)
  if (result.expiresAt) console.log(`Expires: ${result.expiresAt}`)
}
