import { resolve } from 'node:path'
import type { MovScriptWorkspaceContextInput } from '../../../../workspace/node/index.js'
import { resolveMCPDefaultWorkspaceDir } from './dir.js'
import { stringValue } from '../../../tools/shared/record.js'

export interface MCPResolvedProjectWorkspaceLocator extends MovScriptWorkspaceContextInput {
  projectDir: string
  projectUid?: string
  projectTitle?: string
  userId?: string | number
  orgId?: string | number
  scopeKind?: 'user' | 'org'
  scopeId?: string | number
}

export function resolveMCPProjectWorkspaceLocator(args: Record<string, unknown>): MCPResolvedProjectWorkspaceLocator {
  const workspaceDir = stringValue(args.workspaceDir ?? args.workspace_dir) ?? resolveMCPDefaultWorkspaceDir()
  const projectDir = pathValue(args.projectDir ?? args.project_dir ?? args.projectPath ?? args.project_path ?? args.cwd)
  const projectUid = stringValue(args.projectUid ?? args.project_uid) ?? stringValue(process.env.MOVSCRIPT_PROJECT_UID)
  const projectTitle = stringValue(args.projectTitle ?? args.project_title) ?? stringValue(process.env.MOVSCRIPT_PROJECT_TITLE)
  const userId = stringValue(args.userId ?? args.user_id ?? args.user) ?? stringValue(process.env.MOVSCRIPT_USER_ID)
  const orgId = stringValue(args.orgId ?? args.org_id ?? args.org) ?? stringValue(process.env.MOVSCRIPT_ORG_ID)
  const scopeKind = scopedProjectDataScopeKind(args.scopeKind ?? args.scope_kind ?? process.env.MOVSCRIPT_SCOPE_KIND)
  const scopeId = stringValue(args.scopeId ?? args.scope_id) ?? stringValue(process.env.MOVSCRIPT_SCOPE_ID)
  if (projectDir === undefined) throw new Error('projectDir or cwd is required for MovScript project-scoped MCP tools')
  return {
    workspaceDir,
    projectDir,
    ...(projectUid !== undefined ? { projectUid } : {}),
    ...(projectTitle !== undefined ? { projectTitle } : {}),
    ...(userId !== undefined ? { userId } : {}),
    ...(orgId !== undefined ? { orgId } : {}),
    ...(scopeKind !== undefined ? { scopeKind } : {}),
    ...(scopeId !== undefined ? { scopeId } : {}),
  }
}

function scopedProjectDataScopeKind(value: unknown): 'user' | 'org' | undefined {
  const raw = stringValue(value)
  return raw === 'user' || raw === 'org' ? raw : undefined
}

function pathValue(value: unknown): string | undefined {
  const raw = stringValue(value)
  return raw ? resolve(raw) : undefined
}
