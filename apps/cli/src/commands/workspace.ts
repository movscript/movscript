import type { Command } from 'commander'
import {
  fetchMovScriptWorkspace,
  reviewMovScriptWorkspace,
  resolveMovScriptWorkspaceConflicts,
  resolveMovScriptBackendSession,
  statusMovScriptWorkspace,
  submitMovScriptWorkspace,
} from '@movscript/core/node'

interface WorkspaceCommandOptions {
  namespace?: string
  workspace?: string
  user?: string
  json?: boolean
}

interface WorkspaceFetchOptions extends WorkspaceCommandOptions {
  mode?: 'safe' | 'overwrite'
}

interface WorkspaceReviewOptions extends WorkspaceCommandOptions {
  write?: boolean
}

interface WorkspaceSubmitOptions extends WorkspaceCommandOptions {
  review?: string
}

interface WorkspaceResolveConflictsOptions extends WorkspaceCommandOptions {
  path?: string
  strategy?: 'merge' | 'accept-update' | 'discard-update' | 'mark-clean'
}

export function registerWorkspaceCommands(program: Command): void {
  const workspace = program
    .command('workspace')
    .alias('ws')
    .description('Inspect and operate on MovScript workspaces')

  workspace
    .command('status')
    .description('Show local workspace projection status')
    .option('--namespace <namespace>', 'Workspace namespace, e.g. movscript.project:123')
    .option('--workspace <dir>', 'Workspace root directory')
    .option('--user <id>', 'Workspace user id')
    .option('--json', 'Print JSON output')
    .action(async (options: WorkspaceCommandOptions, command: Command) => {
      const result = await statusMovScriptWorkspace(coreInput(options, command))
      printResult(result, options)
    })

  workspace
    .command('review')
    .description('Preview local workspace projection changes')
    .option('--namespace <namespace>', 'Workspace namespace, e.g. movscript.project:123')
    .option('--workspace <dir>', 'Workspace root directory')
    .option('--user <id>', 'Workspace user id')
    .option('--write', 'Persist the review artifact under .movscript/reviews')
    .option('--json', 'Print JSON output')
    .action(async (options: WorkspaceReviewOptions, command: Command) => {
      const result = await reviewMovScriptWorkspace({ ...coreInput(options, command), write: options.write === true })
      printResult(result, options)
    })

  workspace
    .command('fetch')
    .description('Fetch a workspace namespace through the MovScript backend')
    .option('--namespace <namespace>', 'Workspace namespace, e.g. movscript.project:123')
    .option('--workspace <dir>', 'Workspace root directory')
    .option('--user <id>', 'Workspace user id')
    .option('--mode <mode>', 'Fetch mode: safe or overwrite', 'safe')
    .option('--json', 'Print JSON output')
    .action(async (options: WorkspaceFetchOptions, command: Command) => {
      const input = coreInput(options, command)
      const result = await fetchMovScriptWorkspace({ ...input, mode: normalizeFetchMode(options.mode) })
      printResult(result, options)
      if (result.status === 'blocked') process.exitCode = 2
    })

  workspace
    .command('submit')
    .alias('push')
    .description('Submit a workspace review through the MovScript backend')
    .option('--namespace <namespace>', 'Workspace namespace, e.g. movscript.project:123')
    .option('--workspace <dir>', 'Workspace root directory')
    .option('--user <id>', 'Workspace user id')
    .option('--review <path>', 'Review artifact path under .movscript')
    .option('--json', 'Print JSON output')
    .action(async (options: WorkspaceSubmitOptions, command: Command) => {
      const input = coreInput(options, command)
      const result = await submitMovScriptWorkspace({ ...input, reviewPath: options.review })
      printResult(result, options)
      if (result.status === 'blocked') process.exitCode = 2
    })

  workspace
    .command('resolve-conflicts')
    .alias('resolve')
    .description('Resolve staged backend updates under .update for a workspace namespace')
    .option('--namespace <namespace>', 'Workspace namespace, e.g. movscript.project:123')
    .option('--workspace <dir>', 'Workspace root directory')
    .option('--user <id>', 'Workspace user id')
    .option('--path <path>', 'Projection-relative file or directory path', '.')
    .option('--strategy <strategy>', 'Resolution strategy: merge, accept-update, discard-update, or mark-clean', 'merge')
    .option('--json', 'Print JSON output')
    .action(async (options: WorkspaceResolveConflictsOptions, command: Command) => {
      const result = await resolveMovScriptWorkspaceConflicts({
        ...coreInput(options, command),
        path: options.path,
        strategy: normalizeResolveStrategy(options.strategy),
      })
      printResult(result, options)
      if (result.status === 'conflict') process.exitCode = 3
    })
}

function coreInput(options: WorkspaceCommandOptions, command: Command) {
  const global = commandGlobalOptions(command)
  const workspaceDir = options.workspace ?? global.workspace
  const session = resolveMovScriptBackendSession({
    workspaceDir,
    server: global.server,
    token: global.token,
    userId: options.user,
  })
  return {
    namespace: options.namespace,
    workspaceDir: session.workspaceDir,
    userId: options.user ?? session.userId,
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

function normalizeFetchMode(value: string | undefined): 'safe' | 'overwrite' {
  if (value === undefined || value === 'safe') return 'safe'
  if (value === 'overwrite') return 'overwrite'
  throw new Error(`unsupported workspace fetch mode: ${value}`)
}

function normalizeResolveStrategy(value: string | undefined): 'merge' | 'accept-update' | 'discard-update' | 'mark-clean' {
  if (value === undefined || value === 'merge') return 'merge'
  if (value === 'accept-update') return 'accept-update'
  if (value === 'discard-update') return 'discard-update'
  if (value === 'mark-clean') return 'mark-clean'
  throw new Error(`unsupported workspace resolve strategy: ${value}`)
}

function printResult(result: { markdown?: string }, options: WorkspaceCommandOptions): void {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }
  console.log(result.markdown ?? JSON.stringify(result, null, 2))
  if ('reviewPath' in result && typeof result.reviewPath === 'string') {
    console.log(`Review written: ${result.reviewPath}`)
  }
}
