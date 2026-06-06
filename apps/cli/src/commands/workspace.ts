import type { Command } from 'commander'
import {
  buildMovScriptWorkspace,
  createNodeMovScriptWorkspaceFileRepository,
  getMovScriptWorkspaceModel,
  reviewMovScriptBuildWorkspace,
} from '@movscript/core/workspace/node'

interface WorkspaceCommandOptions {
  workspace?: string
  user?: string
  json?: boolean
}

interface WorkspaceGetModelOptions extends WorkspaceCommandOptions {
  entityId?: string
}

export function registerWorkspaceCommands(program: Command): void {
  const workspace = program
    .command('workspace')
    .alias('ws')
    .description('Inspect, review, and build MovScript project workspaces')

  workspace
    .command('get-model <entityType>')
    .description('Return the domain workspace model for one editable entity')
    .option('--entity-id <id>', 'Optional entity id used to expand editable path hints')
    .option('--workspace <dir>', 'Project workspace Git repository root')
    .option('--user <id>', 'Workspace user id')
    .option('--json', 'Print JSON output')
    .action(async (entityType: string, options: WorkspaceGetModelOptions) => {
      const result = getMovScriptWorkspaceModel({
        entityType,
        ...(options.entityId !== undefined ? { entityId: options.entityId } : {}),
      })
      printResult(result, options)
    })

  workspace
    .command('review')
    .description('Review edit/ changes against .build/current without making them effective')
    .option('--workspace <dir>', 'Project workspace Git repository root')
    .option('--user <id>', 'Workspace user id')
    .option('--json', 'Print JSON output')
    .action(async (options: WorkspaceCommandOptions, command: Command) => {
      const result = await reviewMovScriptBuildWorkspace({
        fileRepository: createNodeMovScriptWorkspaceFileRepository(workspaceDir(options, command)),
      })
      printResult(result, options)
      if (!result.readyToBuild) process.exitCode = 2
    })

  workspace
    .command('build')
    .description('Build current edit/ files into .build/current and .build/indexes')
    .option('--workspace <dir>', 'Project workspace Git repository root')
    .option('--user <id>', 'Workspace user id')
    .option('--json', 'Print JSON output')
    .action(async (options: WorkspaceCommandOptions, command: Command) => {
      const result = await buildMovScriptWorkspace({
        fileRepository: createNodeMovScriptWorkspaceFileRepository(workspaceDir(options, command)),
      })
      printResult(result, options)
      if (result.status === 'failed') process.exitCode = 2
    })
}

function workspaceDir(options: WorkspaceCommandOptions, command: Command): string | undefined {
  const global = commandGlobalOptions(command)
  return options.workspace ?? global.workspace
}

function commandGlobalOptions(command: Command): { workspace?: string } {
  const root = command.parent?.parent ?? command.parent ?? command
  const options = root.optsWithGlobals ? root.optsWithGlobals() : root.opts()
  return {
    workspace: typeof options.workspace === 'string' ? options.workspace : undefined,
  }
}

function printResult(result: unknown, options: WorkspaceCommandOptions): void {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }
  console.log(JSON.stringify(result, null, 2))
}
