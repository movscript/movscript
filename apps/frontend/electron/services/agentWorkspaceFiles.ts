import { lstat, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { AGENT_WORKSPACE_DIR_NAME } from '@movscript/agent-runtime'
import type {
  ElectronAgentWorkspaceFileReadResult,
  ElectronAgentWorkspaceFilesInput,
  ElectronAgentWorkspaceFilesListResult,
  ElectronAgentWorkspaceFileWriteInput,
} from '../../src/shared/contracts/electronApi'

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024

export async function listAgentWorkspaceFiles(input?: ElectronAgentWorkspaceFilesInput): Promise<ElectronAgentWorkspaceFilesListResult> {
  const target = await resolveAgentWorkspaceFilePath(input)
  await mkdir(target.rootPath, { recursive: true })
  const targetStat = await stat(target.absolutePath)
  const directoryPath = targetStat.isDirectory() ? target.absolutePath : dirname(target.absolutePath)
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const rows = await Promise.all(entries
    .filter((entry) => !entry.name.startsWith('.DS_Store') && !entry.isSymbolicLink())
    .map(async (entry) => {
      const absoluteEntryPath = join(directoryPath, entry.name)
      const entryStat = await stat(absoluteEntryPath)
      return {
        name: entry.name,
        path: toWorkspaceRelativePath(target.rootPath, absoluteEntryPath),
        kind: entry.isDirectory() ? 'directory' as const : 'file' as const,
        size: entryStat.size,
        updatedAt: entryStat.mtime.toISOString(),
      }
    }))
  rows.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
    return left.name.localeCompare(right.name)
  })
  return {
    rootPath: target.rootPath,
    path: toWorkspaceRelativePath(target.rootPath, directoryPath),
    entries: rows,
  }
}

export async function readAgentWorkspaceFile(input: ElectronAgentWorkspaceFilesInput): Promise<ElectronAgentWorkspaceFileReadResult> {
  const target = await resolveAgentWorkspaceFilePath(input)
  const targetLinkStat = await lstat(target.absolutePath)
  if (targetLinkStat.isSymbolicLink()) throw new Error('workspace file symlinks are not supported')
  const fileStat = await stat(target.absolutePath)
  if (!fileStat.isFile()) throw new Error('workspace file path must point to a file')
  if (fileStat.size > MAX_TEXT_FILE_BYTES) throw new Error(`workspace file is too large to edit: ${fileStat.size} bytes`)
  const content = await readFile(target.absolutePath, 'utf8')
  return {
    rootPath: target.rootPath,
    path: toWorkspaceRelativePath(target.rootPath, target.absolutePath),
    content,
    size: fileStat.size,
    updatedAt: fileStat.mtime.toISOString(),
  }
}

export async function writeAgentWorkspaceFile(input: ElectronAgentWorkspaceFileWriteInput): Promise<ElectronAgentWorkspaceFileReadResult> {
  if (typeof input?.content !== 'string') throw new Error('workspace file content is required')
  const target = await resolveAgentWorkspaceFilePath(input)
  const existingStat = await lstatSafe(target.absolutePath)
  if (existingStat?.isSymbolicLink()) throw new Error('workspace file symlinks are not supported')
  await mkdir(dirname(target.absolutePath), { recursive: true })
  await writeFile(target.absolutePath, input.content, 'utf8')
  return readAgentWorkspaceFile({ workspaceDir: input.workspaceDir, path: target.relativePath })
}

export async function deleteAgentWorkspaceFile(input: ElectronAgentWorkspaceFilesInput): Promise<void> {
  const target = await resolveAgentWorkspaceFilePath(input)
  if (!target.relativePath) throw new Error('workspace root cannot be deleted')
  const targetStat = await lstatSafe(target.absolutePath)
  if (targetStat?.isSymbolicLink()) throw new Error('workspace file symlinks are not supported')
  await rm(target.absolutePath, { force: true, recursive: true })
}

async function resolveAgentWorkspaceFilePath(input?: ElectronAgentWorkspaceFilesInput): Promise<{ rootPath: string; absolutePath: string; relativePath: string }> {
  const workspaceDir = input?.workspaceDir?.trim() || await resolveDefaultAgentWorkspaceDir()
  const rootPath = resolve(workspaceDir, AGENT_WORKSPACE_DIR_NAME)
  const rawRelativePath = typeof input?.path === 'string' ? input.path : ''
  const normalizedRelativePath = rawRelativePath.replace(/^[/\\]+/, '')
  const absolutePath = resolve(rootPath, normalizedRelativePath)
  assertInsideRoot(rootPath, absolutePath)
  return {
    rootPath,
    absolutePath,
    relativePath: toWorkspaceRelativePath(rootPath, absolutePath),
  }
}

async function resolveDefaultAgentWorkspaceDir(): Promise<string> {
  const { resolveDesktopDefaultAgentWorkspaceDir } = await import('./agentRuntime/sessionTransport')
  return resolveDesktopDefaultAgentWorkspaceDir()
}

function assertInsideRoot(rootPath: string, absolutePath: string): void {
  const rootRelativePath = relative(rootPath, absolutePath)
  if (rootRelativePath === '') return
  if (!rootRelativePath.startsWith(`..${sep}`) && rootRelativePath !== '..' && !isAbsolute(rootRelativePath)) return
  throw new Error('workspace file path must stay inside the MovScript workspace directory')
}

function toWorkspaceRelativePath(rootPath: string, absolutePath: string): string {
  const next = relative(rootPath, absolutePath)
  return next === '' ? '' : next.split('\\').join('/')
}

async function lstatSafe(absolutePath: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(absolutePath)
  } catch (error) {
    if (isNotFoundError(error)) return undefined
    throw error
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}
