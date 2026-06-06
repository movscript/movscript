import {
  buildMovScriptWorkspace,
  createNodeMovScriptWorkspaceFileRepository,
  reviewMovScriptBuildWorkspace,
} from '../../../workspace/node/index.js'
import {
  getMovScriptWorkspaceModel,
} from '../../../workspace/index.js'
import { resolveMCPDefaultWorkspaceDir } from './dir.js'
import { stringValue } from '../shared/record.js'

export async function workspaceGetModel(args: Record<string, unknown>): Promise<unknown> {
  const entityType = stringValue(args.entityType ?? args.entity_type)
  if (!entityType) throw new Error('entityType is required')
  return getMovScriptWorkspaceModel({
    entityType,
    ...(args.entityId !== undefined ? { entityId: idValue(args.entityId) } : {}),
  })
}

export async function workspaceReview(args: Record<string, unknown>): Promise<unknown> {
  const workspaceDir = stringValue(args.workspaceDir ?? args.workspace_dir) ?? await resolveMCPDefaultWorkspaceDir()
  return reviewMovScriptBuildWorkspace({
    fileRepository: createNodeMovScriptWorkspaceFileRepository(workspaceDir),
  })
}

export async function workspaceBuild(args: Record<string, unknown>): Promise<unknown> {
  const workspaceDir = stringValue(args.workspaceDir ?? args.workspace_dir) ?? await resolveMCPDefaultWorkspaceDir()
  return buildMovScriptWorkspace({
    fileRepository: createNodeMovScriptWorkspaceFileRepository(workspaceDir),
  })
}

function idValue(value: unknown): string | number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return String(value)
}
