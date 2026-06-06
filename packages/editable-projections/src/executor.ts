import type {
  ApplyExecutionContext,
  CommandExecutionResult,
  CommandExecutor,
  ProjectionAction,
  WorkspaceUpdateTarget,
} from './types.js'
import { UnknownProjectionCommandError } from './errors.js'
import { validateWorkspaceUpdateTargets } from './updateTarget.js'

export interface TypedProjectionCommand {
  type: string
}

export type CommandHandler<TCommand extends TypedProjectionCommand> = (
  command: TCommand,
  context: ApplyExecutionContext,
) => Promise<CommandExecutionResult | WorkspaceUpdateTarget[] | void> | CommandExecutionResult | WorkspaceUpdateTarget[] | void

export interface CommandExecutorOptions<TCommand extends TypedProjectionCommand> {
  handlers: Record<string, CommandHandler<TCommand>>
  unknownCommand?: 'throw' | 'ignore'
}

export type CrudCommandTypeMatcher = string | string[]

export type CrudCommandMutation<TCommand extends TypedProjectionCommand, TResult = unknown> = (
  command: TCommand,
  context: ApplyExecutionContext,
) => Promise<TResult> | TResult

export type CrudCommandRefresh<TCommand extends TypedProjectionCommand, TResult = unknown> = (
  result: TResult,
  command: TCommand,
  context: ApplyExecutionContext,
) => Promise<CommandExecutionResult | WorkspaceUpdateTarget[] | void> | CommandExecutionResult | WorkspaceUpdateTarget[] | void

export interface CrudCommandExecutorOptions<
  TCommand extends TypedProjectionCommand,
  TCreateResult = unknown,
  TUpdateResult = unknown,
  TDeleteResult = unknown,
> {
  commandTypes: Partial<Record<ProjectionAction, CrudCommandTypeMatcher>>
  create?: CrudCommandMutation<TCommand, TCreateResult>
  update?: CrudCommandMutation<TCommand, TUpdateResult>
  delete?: CrudCommandMutation<TCommand, TDeleteResult>
  refresh?: {
    create?: CrudCommandRefresh<TCommand, TCreateResult>
    update?: CrudCommandRefresh<TCommand, TUpdateResult>
    delete?: CrudCommandRefresh<TCommand, TDeleteResult>
  }
  unknownCommand?: 'throw' | 'ignore'
}

export function createCommandExecutor<TCommand extends TypedProjectionCommand>(
  options: CommandExecutorOptions<TCommand>,
): CommandExecutor<TCommand> {
  return {
    async execute(commands, context) {
      const updateTargets: WorkspaceUpdateTarget[] = []

      for (const command of commands) {
        const handler = options.handlers[command.type]
        if (!handler) {
          if (options.unknownCommand === 'ignore') continue
          throw new UnknownProjectionCommandError(command.type)
        }

        const result = await handler(command, context)
        updateTargets.push(...commandUpdateTargets(result))
      }

      return updateTargets.length > 0
        ? { updateTargets: validateWorkspaceUpdateTargets(updateTargets) }
        : undefined
    },
  }
}

export function createCrudCommandExecutor<
  TCommand extends TypedProjectionCommand,
  TCreateResult = unknown,
  TUpdateResult = unknown,
  TDeleteResult = unknown,
>(
  options: CrudCommandExecutorOptions<TCommand, TCreateResult, TUpdateResult, TDeleteResult>,
): CommandExecutor<TCommand> {
  return createCommandExecutor<TCommand>({
    handlers: crudCommandHandlers(options),
    unknownCommand: options.unknownCommand,
  })
}

function crudCommandHandlers<
  TCommand extends TypedProjectionCommand,
  TCreateResult,
  TUpdateResult,
  TDeleteResult,
>(
  options: CrudCommandExecutorOptions<TCommand, TCreateResult, TUpdateResult, TDeleteResult>,
): Record<string, CommandHandler<TCommand>> {
  const handlers: Record<string, CommandHandler<TCommand>> = {}
  addCrudCommandHandler(handlers, options.commandTypes.create, options.create, options.refresh?.create)
  addCrudCommandHandler(handlers, options.commandTypes.update, options.update, options.refresh?.update)
  addCrudCommandHandler(handlers, options.commandTypes.delete, options.delete, options.refresh?.delete)
  return handlers
}

function addCrudCommandHandler<TCommand extends TypedProjectionCommand, TResult>(
  handlers: Record<string, CommandHandler<TCommand>>,
  commandType: CrudCommandTypeMatcher | undefined,
  mutation: CrudCommandMutation<TCommand, TResult> | undefined,
  refresh: CrudCommandRefresh<TCommand, TResult> | undefined,
): void {
  if (!commandType || !mutation) return
  for (const type of commandTypeList(commandType)) {
    handlers[type] = async (command, context) => {
      const result = await mutation(command, context)
      return refresh ? refresh(result, command, context) : undefined
    }
  }
}

function commandTypeList(commandType: CrudCommandTypeMatcher): string[] {
  return Array.isArray(commandType) ? commandType : [commandType]
}

function commandUpdateTargets(
  result: CommandExecutionResult | WorkspaceUpdateTarget[] | void,
): WorkspaceUpdateTarget[] {
  if (!result) return []
  if (Array.isArray(result)) return validateWorkspaceUpdateTargets(result)
  return validateWorkspaceUpdateTargets(result.updateTargets ?? [])
}
