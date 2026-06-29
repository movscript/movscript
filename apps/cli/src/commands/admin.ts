import { readFileSync } from 'node:fs'
import type { Command } from 'commander'
import {
  adminCommandSpecs,
  runMovScriptAdminCommand,
  type AdminCommandSpec,
} from '@movscript/cli-commands'

interface AdminCliOptions {
  homeDir?: string
  workspace?: string
  projectDir?: string
  server?: string
  token?: string
  query?: string[]
  payload?: string
  payloadFile?: string
  providerId?: string
  credentialKey?: string
  catalogEntryId?: string
  bindingId?: string
  keyId?: string
  id?: string
  yes?: boolean
  json?: boolean
}

export function registerAdminCommands(program: Command): void {
  const admin = program
    .command('admin')
    .description('Run MovScript system administration commands through the shared CLI/MCP command runner')

  for (const spec of adminCommandSpecs) {
    const command = ensureCommandPath(admin, spec.cliPath)
    command.description(spec.description)
    addAdminOptions(command)
    command.action(async (options: AdminCliOptions, command: Command) => {
      await runAdminCommand(spec, options, command)
    })
  }
}

function ensureCommandPath(root: Command, path: string[]): Command {
  let current = root
  for (const segment of path) {
    let child = current.commands.find((candidate) => candidate.name() === segment)
    if (!child) child = current.command(segment)
    current = child
  }
  return current
}

function addAdminOptions(command: Command): void {
  command
    .option('--home-dir <dir>', 'MovScript Home directory used to discover the daemon gateway')
    .option('--workspace <dir>', 'Workspace root directory used for backend auth lookup')
    .option('--project-dir <dir>', 'MovScript project directory used for backend auth lookup')
    .option('--server <url>', 'Backend or daemon gateway base URL')
    .option('--token <token>', 'Backend bearer token')
    .option('--query <key=value...>', 'Query parameter; repeat for multiple values', collect)
    .option('--payload <json>', 'JSON object request body')
    .option('--payload-file <path>', 'Path to a JSON object request body')
    .option('--provider-id <id>', 'Provider id')
    .option('--credential-key <key>', 'Provider credential key')
    .option('--catalog-entry-id <id>', 'Model catalog entry id')
    .option('--binding-id <id>', 'Route binding id')
    .option('--key-id <id>', 'Model gateway API key id')
    .option('--id <id>', 'Generic id alias for delete/update commands')
    .option('--yes', 'Confirm delete or no-payload admin mutation')
    .option('--json', 'Print JSON output')
}

async function runAdminCommand(spec: AdminCommandSpec, options: AdminCliOptions, command: Command): Promise<void> {
  try {
    if (requiresConfirmation(spec, options)) {
      throw new Error(`${spec.commandId} requires --yes`)
    }
    const execution = await runMovScriptAdminCommand(spec, adminArgs(options, command))
    console.log(JSON.stringify(execution, null, 2))
  } catch (error) {
    console.log(JSON.stringify({
      status: 'error',
      error: {
        code: 'admin_command_failed',
        message: errorMessage(error),
      },
    }, null, 2))
    process.exitCode = 1
  }
}

function adminArgs(options: AdminCliOptions, command: Command): Record<string, unknown> {
  const global = commandGlobalOptions(command)
  return compactRecord({
    homeDir: options.homeDir,
    workspaceDir: options.workspace ?? global.workspace,
    projectDir: options.projectDir,
    backendBaseURL: options.server ?? global.server,
    token: options.token ?? global.token,
    query: parseQuery(options.query),
    payload: parsePayload(options),
    providerId: options.providerId,
    credentialKey: options.credentialKey,
    catalogEntryId: options.catalogEntryId,
    bindingId: options.bindingId,
    keyId: options.keyId,
    id: options.id,
  })
}

function commandGlobalOptions(command: Command): { server?: string; token?: string; workspace?: string } {
  const root = rootCommand(command)
  const options = root.opts()
  const serverSource = root.getOptionValueSource?.('server')
  return {
    server: serverSource && serverSource !== 'default' && typeof options.server === 'string' ? options.server : undefined,
    token: typeof options.token === 'string' ? options.token : process.env.MOVSCRIPT_DATA_SERVICE_TOKEN,
    workspace: typeof options.workspace === 'string' ? options.workspace : undefined,
  }
}

function rootCommand(command: Command): Command {
  let current = command
  while (current.parent) current = current.parent
  return current
}

function requiresConfirmation(spec: AdminCommandSpec, options: AdminCliOptions): boolean {
  if (options.yes) return false
  if (spec.method === 'DELETE') return true
  if (spec.commandId === 'admin.provider.credential.set_primary') return true
  return false
}

function parseQuery(values: string[] | undefined): Record<string, string | number | boolean> | undefined {
  if (!values || values.length === 0) return undefined
  const query: Record<string, string | number | boolean> = {}
  for (const value of values) {
    const index = value.indexOf('=')
    if (index <= 0) throw new Error(`invalid --query value: ${value}`)
    const key = value.slice(0, index).trim()
    const raw = value.slice(index + 1).trim()
    if (!key) throw new Error(`invalid --query key: ${value}`)
    query[key] = parseScalar(raw)
  }
  return query
}

function parsePayload(options: AdminCliOptions): Record<string, unknown> | undefined {
  if (options.payload !== undefined && options.payloadFile !== undefined) {
    throw new Error('pass only one of --payload or --payload-file')
  }
  const text = options.payloadFile !== undefined
    ? readFileSync(options.payloadFile, 'utf8')
    : options.payload
  if (text === undefined) return undefined
  const value = JSON.parse(text) as unknown
  if (!isRecord(value)) throw new Error('admin payload must be a JSON object')
  return value
}

function parseScalar(value: string): string | number | boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  if (value && Number.isFinite(Number(value))) return Number(value)
  return value
}

function collect(value: string, previous: string[] = []): string[] {
  previous.push(value)
  return previous
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
