import {
  buildMovScriptWorkspace,
  createNodeMovScriptWorkspaceFileRepository,
  resolveMovScriptProjectWorkspacePaths,
  reviewMovScriptBuildWorkspace,
} from '../../../../workspace/node/index.js'
import {
  getMovScriptWorkspaceModel,
} from '../../../../workspace/domain/index.js'
import { resolveMCPDefaultWorkspaceDir } from './dir.js'
import { stringValue } from '../../../tools/shared/record.js'

export async function workspaceGetModel(args: Record<string, unknown>): Promise<unknown> {
  const entityKind = stringValue(args.entityKind ?? args.entity_kind)
  if (!entityKind) throw new Error('entityKind is required')
  return getMovScriptWorkspaceModel({
    entityKind,
    ...(args.entityId !== undefined ? { entityId: idValue(args.entityId) } : {}),
  })
}

export async function workspaceReview(args: Record<string, unknown>): Promise<unknown> {
  return reviewMovScriptBuildWorkspace({
    fileRepository: createNodeMovScriptWorkspaceFileRepository(await projectWorkspaceDir(args)),
  })
}

export async function workspaceBuild(args: Record<string, unknown>): Promise<unknown> {
  return buildMovScriptWorkspace({
    fileRepository: createNodeMovScriptWorkspaceFileRepository(await projectWorkspaceDir(args)),
  })
}

async function projectWorkspaceDir(args: Record<string, unknown>): Promise<string> {
  const workspaceDir = stringValue(args.workspaceDir ?? args.workspace_dir) ?? await resolveMCPDefaultWorkspaceDir()
  return resolveMovScriptProjectWorkspacePaths({
    workspaceDir,
    ...(args.userId !== undefined || args.user_id !== undefined ? { userId: idValue(args.userId ?? args.user_id) } : {}),
    ...(args.orgId !== undefined || args.org_id !== undefined ? { orgId: idValue(args.orgId ?? args.org_id) } : {}),
    ...(args.projectId !== undefined || args.project_id !== undefined ? { projectId: idValue(args.projectId ?? args.project_id) } : {}),
  }).projectDir
}

function idValue(value: unknown): string | number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return String(value)
}
