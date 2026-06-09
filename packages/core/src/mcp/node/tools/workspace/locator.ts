import { readMovScriptBackendAuth, readMovScriptBackendConfig } from '../../../../backend/node/config.js'
import type { MovScriptWorkspaceContextInput } from '../../../../workspace/node/index.js'
import { getMCPContextSnapshot } from '../focus/store.js'
import { resolveMCPDefaultWorkspaceDir } from './dir.js'
import { stringValue } from '../../../tools/shared/record.js'

export interface MCPResolvedProjectWorkspaceLocator extends MovScriptWorkspaceContextInput {
  projectId: string | number
}

export function resolveMCPProjectWorkspaceLocator(args: Record<string, unknown>): MCPResolvedProjectWorkspaceLocator {
  const workspaceDir = stringValue(args.workspaceDir ?? args.workspace_dir) ?? resolveMCPDefaultWorkspaceDir()
  const projectId = idValue(args.projectId ?? args.project_id)
  if (projectId === undefined) {
    throw new Error('projectId is required for MovScript project-scoped MCP tools')
  }
  return {
    workspaceDir,
    ...userLocator(args, workspaceDir),
    projectId,
  }
}

export function resolveMCPRequiredProjectId(args: Record<string, unknown>): string | number {
  const projectId = idValue(args.projectId ?? args.project_id)
  if (projectId === undefined) {
    throw new Error('projectId is required for MovScript project-scoped MCP tools')
  }
  return projectId
}

function userLocator(_args: Record<string, unknown>, workspaceDir: string): Pick<MovScriptWorkspaceContextInput, 'userId'> {
  const userId = loggedInUserId(workspaceDir)
  return userId !== undefined ? { userId } : {}
}

function loggedInUserId(workspaceDir: string): string | number | undefined {
  const focusUserId = getMCPContextSnapshot().user?.id
  if (focusUserId !== undefined) return focusUserId
  try {
    const authUserId = readMovScriptBackendAuth(workspaceDir)?.user?.id
    if (authUserId !== undefined) return authUserId
  } catch {
    // Fall through to backend config.
  }
  try {
    return readMovScriptBackendConfig(workspaceDir).activeUserId
  } catch {
    return undefined
  }
}

function idValue(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}
