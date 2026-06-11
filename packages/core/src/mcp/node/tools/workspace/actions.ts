import { createMovScriptDomainRuntime } from '../domain/runtime.js'
import { getMovScriptWorkspaceModel } from '@movscript/workspace'
import { stringValue } from '../../../tools/shared/record.js'
import { resolveMCPProjectWorkspaceLocator } from './locator.js'

export async function workspaceGetModel(args: Record<string, unknown>): Promise<unknown> {
  resolveMCPProjectWorkspaceLocator(args)
  const entityKind = stringValue(args.entityKind ?? args.entity_kind)
  if (!entityKind) throw new Error('entityKind is required')
  return getMovScriptWorkspaceModel({
    entityKind,
    ...(args.entityId !== undefined || args.entity_id !== undefined ? { entityId: idValue(args.entityId ?? args.entity_id) } : {}),
  })
}

export async function workspaceReview(args: Record<string, unknown>): Promise<unknown> {
  return service(args).reviewWorkspace()
}

export async function workspaceInterpret(args: Record<string, unknown>): Promise<unknown> {
  return service(args).interpretWorkspace()
}

function service(args: Record<string, unknown>) {
  return createMovScriptDomainRuntime(resolveMCPProjectWorkspaceLocator(args))
}

function idValue(value: unknown): string | number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return String(value)
}
