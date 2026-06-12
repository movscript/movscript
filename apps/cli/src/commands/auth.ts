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
      const resolvedOptions = resolveAuthOptions(options, command)
      const global = commandGlobalOptions(command)
      const workspaceDir = resolvedOptions.workspace ?? global.workspace
      const server = resolvedOptions.server ?? global.server
      const username = resolvedOptions.username ?? await promptValue('Username: ')
      const password = resolvedOptions.password ?? process.env.MOVCLI_PASSWORD ?? await promptValue('Password: ')
      const login = await loginMovScriptBackend({ workspaceDir, server, username, password })
      const authRecord = writeMovScriptBackendAuth(workspaceDir, {
        token: login.token,
        expiresAt: login.expiresAt,
        user: login.user,
        gitCredential: login.gitCredential,
      })
      const userId = typeof login.user?.id === 'string' || typeof login.user?.id === 'number' ? login.user.id : undefined
      const config = writeMovScriptBackendConfig(workspaceDir, {
        baseURL: login.baseURL,
        ...(userId !== undefined ? { activeUserId: userId } : {}),
      })
      print(resolvedOptions, {
        status: 'logged_in',
        workspaceDir: resolveMovScriptBackendSession({ workspaceDir }).workspaceDir,
        configPath: resolveMovScriptBackendSession({ workspaceDir }).configPath,
        authPath: resolveMovScriptBackendSession({ workspaceDir }).authPath,
        baseURL: config.baseURL,
        user: authRecord.user,
        gitCredential: authRecord.gitCredential ? {
          provider: authRecord.gitCredential.provider,
          username: authRecord.gitCredential.username,
          maskedToken: authRecord.gitCredential.maskedToken,
          status: authRecord.gitCredential.status,
        } : undefined,
        expiresAt: authRecord.expiresAt,
      })
    })

  auth
    .command('status')
    .alias('info')
    .description('Show workspace backend auth status')
    .option('--workspace <dir>', 'Workspace root directory')
    .option('--server <url>', 'MovScript server URL override')
    .option('--json', 'Print JSON output')
    .action(async (options: AuthOptions, command: Command) => {
      const resolvedOptions = resolveAuthOptions(options, command)
      print(resolvedOptions, await currentAuthStatus(resolvedOptions, command))
    })

  auth
    .command('logout')
    .description('Remove workspace backend credentials')
    .option('--workspace <dir>', 'Workspace root directory')
    .option('--json', 'Print JSON output')
    .action((options: AuthOptions, command: Command) => {
      const resolvedOptions = resolveAuthOptions(options, command)
      const global = commandGlobalOptions(command)
      const workspaceDir = resolvedOptions.workspace ?? global.workspace
      const session = resolveMovScriptBackendSession({ workspaceDir })
      clearMovScriptBackendAuth(session.workspaceDir)
      print(resolvedOptions, {
        status: 'logged_out',
        workspaceDir: session.workspaceDir,
        authPath: session.authPath,
      })
    })

  program
    .command('whoami')
    .description('Show current MovScript backend login information')
    .option('--workspace <dir>', 'Workspace root directory')
    .option('--server <url>', 'MovScript server URL override')
    .option('--json', 'Print JSON output')
    .action(async (options: AuthOptions, command: Command) => {
      const resolvedOptions = resolveAuthOptions(options, command)
      print(resolvedOptions, await currentAuthStatus(resolvedOptions, command))
    })
}

function resolveAuthOptions(options: AuthOptions, command: Command): AuthOptions {
  const local = command.opts()
  const global = command.optsWithGlobals ? command.optsWithGlobals() : local
  return {
    ...options,
    workspace: options.workspace ?? stringField(local.workspace) ?? stringField(global.workspace),
    server: options.server ?? stringField(local.server) ?? stringField(global.server),
    username: options.username ?? stringField(local.username),
    password: options.password ?? stringField(local.password),
    json: options.json === true || local.json === true || global.json === true,
  }
}

async function currentAuthStatus(options: AuthOptions, command: Command): Promise<Record<string, unknown>> {
  const global = commandGlobalOptions(command)
  const session = resolveMovScriptBackendSession({
    workspaceDir: options.workspace ?? global.workspace,
    server: options.server ?? global.server,
    token: global.token,
  })
  const auth = readMovScriptBackendAuth(session.workspaceDir)
  let me: Record<string, unknown> | undefined
  let verificationError: string | undefined
  if (session.token) {
    try {
      me = await getMovScriptBackendMe({ workspaceDir: session.workspaceDir, server: session.baseURL, token: session.token })
    } catch (error) {
      verificationError = error instanceof Error ? error.message : String(error)
    }
  }
  return {
    status: session.token ? me ? 'authenticated' : 'authenticated_offline' : 'anonymous',
    workspaceDir: session.workspaceDir,
    baseURL: session.baseURL,
    userId: session.userId,
    user: recordField(me?.user) ?? auth?.user ?? session.user,
    orgMemberships: Array.isArray(me?.org_memberships) ? me.org_memberships : undefined,
    gitCredential: auth?.gitCredential ? {
      provider: auth.gitCredential.provider,
      username: auth.gitCredential.username,
      maskedToken: auth.gitCredential.maskedToken,
      status: auth.gitCredential.status,
      lastError: auth.gitCredential.lastError,
    } : undefined,
    expiresAt: auth?.expiresAt,
    authPath: session.authPath,
    configPath: session.configPath,
    ...(verificationError ? { verificationError } : {}),
  }
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
    printUserInfo(result.user)
    printGitCredential(result.gitCredential)
    if (result.expiresAt) console.log(`Expires: ${result.expiresAt}`)
    console.log(`Auth: ${result.authPath}`)
    return
  }
  if (result.status === 'logged_out') {
    console.log(`Logged out: ${result.authPath}`)
    return
  }
  console.log(`Backend: ${result.baseURL}`)
  console.log(`Status: ${result.status}`)
  console.log(`Workspace: ${result.workspaceDir}`)
  printUserInfo(result.user, result.userId)
  printOrgMemberships(result.orgMemberships)
  printGitCredential(result.gitCredential)
  if (result.expiresAt) console.log(`Expires: ${result.expiresAt}`)
  if (result.verificationError) console.log(`Verification: ${result.verificationError}`)
  console.log(`Auth: ${result.authPath}`)
  console.log(`Config: ${result.configPath}`)
}

function printUserInfo(value: unknown, fallbackUserId?: unknown): void {
  const user = recordField(value)
  const id = idField(user?.id) ?? idField(fallbackUserId)
  const username = stringField(user?.username)
  const displayName = stringField(user?.displayName) ?? stringField(user?.display_name)
  const primaryEmail = stringField(user?.primaryEmail) ?? stringField(user?.primary_email)
  const locale = stringField(user?.locale)
  const systemRole = stringField(user?.systemRole) ?? stringField(user?.system_role)
  if (displayName || username) console.log(`User: ${formatUserLabel({ displayName, username, id })}`)
  else if (id !== undefined) console.log(`User ID: ${String(id)}`)
  if (primaryEmail) console.log(`Email: ${primaryEmail}`)
  if (systemRole) console.log(`Role: ${systemRole}`)
  if (locale) console.log(`Locale: ${locale}`)
}

function printOrgMemberships(value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) return
  console.log('Organizations:')
  for (const item of value) {
    const membership = recordField(item)
    if (!membership) continue
    const name = stringField(membership.org_name) ?? stringField(membership.name) ?? stringField(membership.org_slug) ?? scalarDisplayValue(membership.org_id)
    const role = stringField(membership.role)
    const status = stringField(membership.status)
    const plan = stringField(membership.plan)
    const flags = [role, status, plan].filter(Boolean).join(', ')
    console.log(`  - ${name}${flags ? ` (${flags})` : ''}`)
  }
}

function printGitCredential(value: unknown): void {
  const credential = recordField(value)
  if (!credential) return
  const provider = stringField(credential.provider)
  const username = stringField(credential.username)
  const status = stringField(credential.status)
  const maskedToken = stringField(credential.maskedToken) ?? stringField(credential.masked_token)
  console.log(`Git: ${[provider, username].filter(Boolean).join(':') || 'configured'}${status ? ` (${status})` : ''}`)
  if (maskedToken) console.log(`Git Token: ${maskedToken}`)
}

function formatUserLabel(input: { displayName?: string; username?: string; id?: string | number }): string {
  if (input.displayName && input.username) return `${input.displayName} (@${input.username}${input.id !== undefined ? `, ${input.id}` : ''})`
  if (input.username) return `${input.username}${input.id !== undefined ? ` (${input.id})` : ''}`
  if (input.displayName) return `${input.displayName}${input.id !== undefined ? ` (${input.id})` : ''}`
  return input.id !== undefined ? String(input.id) : '-'
}

function recordField(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function scalarDisplayValue(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return '-'
}
