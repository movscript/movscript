import { resolve } from 'node:path'
import type { MovScriptWorkspaceContextInput } from '../../../../workspace/node/index.js'
import { resolveMCPDefaultWorkspaceDir } from './dir.js'
import { stringValue } from '../../../tools/shared/record.js'

export interface MCPResolvedProjectWorkspaceLocator extends MovScriptWorkspaceContextInput {
  projectDir: string
  projectUid?: string
}

export function resolveMCPProjectWorkspaceLocator(args: Record<string, unknown>): MCPResolvedProjectWorkspaceLocator {
  const workspaceDir = stringValue(args.workspaceDir ?? args.workspace_dir) ?? resolveMCPDefaultWorkspaceDir()
  const projectDir = pathValue(args.projectDir ?? args.project_dir ?? args.projectPath ?? args.project_path ?? args.cwd)
  const projectUid = stringValue(args.projectUid ?? args.project_uid)
  if (projectDir === undefined) throw new Error('projectDir or cwd is required for MovScript project-scoped MCP tools')
  return {
    workspaceDir,
    projectDir,
    ...(projectUid !== undefined ? { projectUid } : {}),
  }
}

function pathValue(value: unknown): string | undefined {
  const raw = stringValue(value)
  return raw ? resolve(raw) : undefined
}
