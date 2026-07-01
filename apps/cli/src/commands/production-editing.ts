import type { Command } from 'commander'
import {
  productionEditingCommandSpecs,
  runMovScriptProductionEditingCommand,
  type ProductionEditingCommandSpec,
} from '@movscript/cli-commands'

interface ProductionEditingCliOptions {
  projectDir?: string
  projectServiceUrl?: string
  server?: string
  token?: string
  mediaProjectId?: string
  projectId?: string
  productionId?: string
  workspaceId?: string
  kind?: string
  title?: string
  seed?: string
  page?: string
  pageSize?: string
  includeCandidates?: boolean
  includeUnselected?: boolean
  json?: boolean
}

export function registerProductionEditingCommands(program: Command): void {
  const production = findOrCreateCommand(program, 'production', 'Production workflows')
  const editing = findOrCreateCommand(production, 'editing', 'Production-bound editing workspace lifecycle')

  for (const spec of productionEditingCommandSpecs) {
    const command = ensureCommandPath(editing, spec.cliPath)
    command.description(spec.description)
    addProductionEditingOptions(command)
    command.action(async (options: ProductionEditingCliOptions, command: Command) => {
      await runProductionEditingCommand(spec, options, command)
    })
  }
}

function findOrCreateCommand(root: Command, name: string, description: string): Command {
  const existing = root.commands.find((candidate) => candidate.name() === name)
  if (existing) return existing
  return root.command(name).description(description)
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

function addProductionEditingOptions(command: Command): void {
  command
    .option('--project-dir <dir>', 'MovScript project directory')
    .option('--project-service-url <url>', 'Project Service base URL')
    .option('--server <url>', 'Backend or daemon gateway base URL')
    .option('--token <token>', 'Backend bearer token')
    .option('--media-project-id <id>', 'MediaEditingProject project id used by system_editing workspaces and media task recovery')
    .option('--project-id <id>', 'Deprecated alias for --media-project-id; not a MovScript source project locator')
    .option('--production-id <id>', 'Production id')
    .option('--workspace-id <id>', 'Production editing workspace id')
    .option('--kind <kind>', 'Workspace kind: system_editing or remotion')
    .option('--title <title>', 'Workspace title')
    .option('--seed <json>', 'Workspace seed JSON')
    .option('--page <number>', 'Result page')
    .option('--page-size <number>', 'Result page size')
    .option('--include-candidates', 'Include candidate details in refreshed resources')
    .option('--include-unselected', 'Include unselected resources when refreshing')
    .option('--json', 'Print JSON output')
}

async function runProductionEditingCommand(
  spec: ProductionEditingCommandSpec,
  options: ProductionEditingCliOptions,
  command: Command,
): Promise<void> {
  try {
    const execution = await runMovScriptProductionEditingCommand(spec, productionEditingArgs(options, command))
    console.log(JSON.stringify(execution, null, 2))
  } catch (error) {
    console.log(JSON.stringify({
      status: 'error',
      error: {
        code: 'production_editing_command_failed',
        message: error instanceof Error ? error.message : String(error),
      },
    }, null, 2))
    process.exitCode = 1
  }
}

function productionEditingArgs(options: ProductionEditingCliOptions, command: Command): Record<string, unknown> {
  const global = commandGlobalOptions(command)
  return compactRecord({
    projectDir: options.projectDir,
    projectServiceURL: options.projectServiceUrl,
    backendBaseURL: options.server ?? global.server,
    token: options.token ?? global.token,
    mediaProjectId: options.mediaProjectId,
    projectId: options.projectId,
    productionId: options.productionId,
    workspaceId: options.workspaceId,
    kind: options.kind,
    title: options.title,
    seed: jsonArg(options.seed, '--seed'),
    page: numericArg(options.page, '--page'),
    pageSize: numericArg(options.pageSize, '--page-size'),
    includeCandidates: options.includeCandidates === true ? true : undefined,
    includeUnselected: options.includeUnselected === true ? true : undefined,
  })
}

function commandGlobalOptions(command: Command): { server?: string; token?: string } {
  const root = rootCommand(command)
  const options = root.opts()
  const serverSource = root.getOptionValueSource?.('server')
  return {
    server: serverSource && serverSource !== 'default' && typeof options.server === 'string' ? options.server : undefined,
    token: typeof options.token === 'string' ? options.token : process.env.MOVSCRIPT_DATA_SERVICE_TOKEN,
  }
}

function rootCommand(command: Command): Command {
  let current = command
  while (current.parent) current = current.parent
  return current
}

function numericArg(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${flag} must be a finite number`)
  return parsed
}

function jsonArg(value: string | undefined, flag: string): unknown {
  if (value === undefined) return undefined
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new Error(`${flag} must be valid JSON`)
  }
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}
