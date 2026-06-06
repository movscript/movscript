import {
  createEditableProjectionKit,
  type EditableProjectionKit,
  type EditableProjectionKitOptions,
} from '../kit.js'
import {
  createNodeEditableProjectionKit,
  type NodeEditableProjectionKit,
  type NodeEditableProjectionKitOptions,
} from '../node.js'
import type { CommandExecutor } from '../types.js'
import {
  movscriptProjectAdapters,
  type MovScriptProjectCommand,
} from './movscriptAssetSlot.js'

export type MovScriptProjectEditableProjectionKitOptions =
  Omit<EditableProjectionKitOptions<MovScriptProjectCommand>, 'adapters' | 'registry'>

export type MovScriptProjectNodeProjectionKitOptions =
  Omit<NodeEditableProjectionKitOptions<MovScriptProjectCommand>, 'adapters' | 'registry'>

export interface MovScriptProjectServiceBridge {
  executor: CommandExecutor<MovScriptProjectCommand>
}

export function createMovScriptProjectEditableProjectionKit(
  options: MovScriptProjectEditableProjectionKitOptions,
): EditableProjectionKit<MovScriptProjectCommand> {
  return createEditableProjectionKit<MovScriptProjectCommand>({
    ...options,
    adapters: [...movscriptProjectAdapters],
  })
}

export function createMovScriptProjectNodeProjectionKit(
  root: string,
  options: MovScriptProjectNodeProjectionKitOptions,
): NodeEditableProjectionKit<MovScriptProjectCommand> {
  return createNodeEditableProjectionKit<MovScriptProjectCommand>(root, {
    ...options,
    adapters: [...movscriptProjectAdapters],
  })
}
