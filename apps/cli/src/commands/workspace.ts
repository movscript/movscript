import type { Command } from 'commander'
import { createNodeMovScriptEngine } from '@movscript/engine/node'
import { getMovScriptWorkspaceModel } from '@movscript/workspace'
import type {
  MovScriptWorkspaceInterpretResult,
  MovScriptWorkspaceReviewResult,
} from '@movscript/interpreter/node'

interface WorkspaceCommandOptions {
  workspace?: string
  cwd?: string
  projectDir?: string
  user?: string
  org?: string
  commit?: string
  json?: boolean
}

interface WorkspaceGetModelOptions extends WorkspaceCommandOptions {
  entityId?: string
}

export function registerWorkspaceCommands(program: Command): void {
  const workspace = program
    .command('workspace')
    .alias('ws')
    .description('Inspect, review, and interpret MovScript project workspaces')

  workspace
    .command('get-model <entityType>')
    .description('Return the domain workspace model for one editable entity')
    .option('--entity-id <id>', 'Optional entity id used to expand editable path hints')
    .option('--workspace <dir>', 'Project workspace Git repository root')
    .option('--cwd <dir>', 'Alias for --workspace')
    .option('--project-dir <dir>', 'Alias for --workspace')
    .option('--user <id>', 'Workspace user id')
    .option('--json', 'Print JSON output')
    .action(async (entityType: string, options: WorkspaceGetModelOptions) => {
      const result = getMovScriptWorkspaceModel({
        entityKind: entityType,
        ...(options.entityId !== undefined ? { entityId: options.entityId } : {}),
      })
      printResult(result, options)
    })

  workspace
    .command('review')
    .description('Review current MovScript source files and diagnostics without publishing product state')
    .option('--workspace <dir>', 'Project workspace Git repository root')
    .option('--cwd <dir>', 'Alias for --workspace')
    .option('--project-dir <dir>', 'Alias for --workspace')
    .option('--user <id>', 'Workspace user id')
    .option('--org <id>', 'Workspace organization id')
    .option('--commit <ref>', 'Compare current source against a specific git commit/ref')
    .option('--json', 'Print JSON output')
    .action(async (options: WorkspaceCommandOptions, command: Command) => {
      const result = await workspaceEngine(options, command).review(inspectInput(options)) as MovScriptWorkspaceReviewResult
      printResult(result, options)
      if (!result.readyToInterpret) process.exitCode = 2
    })

  workspace
    .command('interpret')
    .description('Validate current MovScript source files and refresh interpreter debug artifacts')
    .option('--workspace <dir>', 'Project workspace Git repository root')
    .option('--cwd <dir>', 'Alias for --workspace')
    .option('--project-dir <dir>', 'Alias for --workspace')
    .option('--user <id>', 'Workspace user id')
    .option('--org <id>', 'Workspace organization id')
    .option('--json', 'Print JSON output')
    .action(async (options: WorkspaceCommandOptions, command: Command) => {
      const result = await workspaceEngine(options, command).interpret() as MovScriptWorkspaceInterpretResult
      printResult(result, options)
      if (result.status === 'failed') process.exitCode = 2
    })
}

function workspaceDir(options: WorkspaceCommandOptions, command: Command): string | undefined {
  const global = commandGlobalOptions(command)
  return options.projectDir ?? options.cwd ?? options.workspace ?? global.cwd ?? global.workspace
}

function workspaceEngine(options: WorkspaceCommandOptions, command: Command) {
  const projectDir = workspaceDir(options, command)
  return createNodeMovScriptEngine({ projectDir })
}

function inspectInput(options: WorkspaceCommandOptions): { commit?: string } {
  return {
    ...(options.commit ? { commit: options.commit } : {}),
  }
}

function commandGlobalOptions(command: Command): { workspace?: string; cwd?: string } {
  const root = command.parent?.parent ?? command.parent ?? command
  const options = root.optsWithGlobals ? root.optsWithGlobals() : root.opts()
  return {
    workspace: typeof options.workspace === 'string' ? options.workspace : undefined,
    cwd: typeof options.cwd === 'string' ? options.cwd : undefined,
  }
}

function printResult(result: unknown, options: WorkspaceCommandOptions): void {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }
  console.log(JSON.stringify(result, null, 2))
}
