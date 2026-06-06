import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  ensureMovScriptWorkspaceRoot,
  resolveDefaultMovScriptWorkspaceDir as resolveDefaultMovScriptWorkspaceDirFromEnv,
  resolveMovScriptWorkspaceRootPaths,
} from '@movscript/workspaces/node'

export interface WorkspaceReviewFileRecord {
  schema: 'movscript.workspace-review.v1'
  id: string
  status: 'previewed' | 'applied' | 'local_preview' | 'submitted'
  createdAt: string
  workspaceKind?: string
  target?: unknown
  projection?: unknown
  handoff?: unknown
  validation?: unknown
  effects?: unknown
  request?: {
    method?: string
    path?: string
    payload?: unknown
  }
  response?: unknown
}

export interface WorkspaceReviewFileResult {
  id: string
  path: string
  absolutePath: string
  record: WorkspaceReviewFileRecord
}

export async function writeWorkspaceReviewFile(input: Omit<WorkspaceReviewFileRecord, 'schema' | 'id' | 'createdAt'>): Promise<WorkspaceReviewFileResult> {
  const workspaceDir = await resolveDefaultMovScriptWorkspaceDir()
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  ensureMovScriptWorkspaceRoot(root)
  const now = new Date().toISOString()
  const id = `${input.workspaceKind ?? 'workspace'}-${now.replace(/[^0-9]/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`
  const record: WorkspaceReviewFileRecord = {
    schema: 'movscript.workspace-review.v1',
    id,
    createdAt: now,
    ...input,
  }
  const absolutePath = join(root.reviewsDir, `${id}.json`)
  mkdirSync(root.reviewsDir, { recursive: true })
  writeFileSync(absolutePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
  return {
    id,
    path: relative(root.controlDir, absolutePath).split('\\').join('/'),
    absolutePath,
    record,
  }
}

async function resolveDefaultMovScriptWorkspaceDir(): Promise<string> {
  if (process.env.MOVSCRIPT_WORKSPACE_DIR) return process.env.MOVSCRIPT_WORKSPACE_DIR
  try {
    const { resolveDesktopDefaultMovScriptWorkspaceDir } = await import('../../services/movscriptWorkspaceDefaults')
    return resolveDesktopDefaultMovScriptWorkspaceDir()
  } catch (error) {
    if (isElectronAppExportError(error)) return resolveDefaultMovScriptWorkspaceDirFromEnv()
    throw error
  }
}

function isElectronAppExportError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error)
  return message.includes("does not provide an export named 'app'")
    || message.includes("Cannot read properties of undefined (reading 'isPackaged')")
}
