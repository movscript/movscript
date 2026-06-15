import { lstat, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  ensureMovScriptWorkspaceRoot,
  resolveMovScriptProjectCwd,
  resolveMovScriptWorkspaceRootPaths,
} from '@movscript/core/workspace/node'
import type {
  ElectronMovScriptWorkspaceFileReadResult,
  ElectronMovScriptWorkspaceFilesInput,
  ElectronMovScriptWorkspaceFilesListResult,
  ElectronMovScriptWorkspaceMediaFileReadResult,
  ElectronMovScriptWorkspaceFileWriteInput,
} from '../../src/shared/contracts/electronApi'

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024
const MAX_MEDIA_PREVIEW_FILE_BYTES = 32 * 1024 * 1024

export async function listMovScriptWorkspaceFiles(input?: ElectronMovScriptWorkspaceFilesInput): Promise<ElectronMovScriptWorkspaceFilesListResult> {
  const target = await resolveMovScriptWorkspaceFilePath(input)
  await mkdir(target.rootPath, { recursive: true })
  const targetStat = await statSafe(target.absolutePath)
  if (!targetStat) {
    return {
      rootPath: target.rootPath,
      path: target.relativePath,
      entries: [],
    }
  }
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

export async function readMovScriptWorkspaceFile(input: ElectronMovScriptWorkspaceFilesInput): Promise<ElectronMovScriptWorkspaceFileReadResult> {
  const target = await resolveMovScriptWorkspaceFilePath(input)
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

export async function readMovScriptWorkspaceMediaFile(input: ElectronMovScriptWorkspaceFilesInput): Promise<ElectronMovScriptWorkspaceMediaFileReadResult> {
  const target = await resolveMovScriptWorkspaceFilePath(input)
  const targetLinkStat = await lstat(target.absolutePath)
  if (targetLinkStat.isSymbolicLink()) throw new Error('workspace file symlinks are not supported')
  const fileStat = await stat(target.absolutePath)
  if (!fileStat.isFile()) throw new Error('workspace media path must point to a file')
  if (fileStat.size > MAX_MEDIA_PREVIEW_FILE_BYTES) throw new Error(`workspace media file is too large to preview: ${fileStat.size} bytes`)
  const mimeType = imageMimeTypeForPath(target.relativePath)
  if (!mimeType) throw new Error('workspace media preview only supports image files')
  const content = await readFile(target.absolutePath)
  return {
    rootPath: target.rootPath,
    path: toWorkspaceRelativePath(target.rootPath, target.absolutePath),
    dataUrl: `data:${mimeType};base64,${content.toString('base64')}`,
    mimeType,
    size: fileStat.size,
    updatedAt: fileStat.mtime.toISOString(),
  }
}

export async function writeMovScriptWorkspaceFile(input: ElectronMovScriptWorkspaceFileWriteInput): Promise<ElectronMovScriptWorkspaceFileReadResult> {
  if (typeof input?.content !== 'string') throw new Error('workspace file content is required')
  const target = await resolveMovScriptWorkspaceFilePath(input)
  const existingStat = await lstatSafe(target.absolutePath)
  if (existingStat?.isSymbolicLink()) throw new Error('workspace file symlinks are not supported')
  await mkdir(dirname(target.absolutePath), { recursive: true })
  await writeFile(target.absolutePath, input.content, 'utf8')
  return readMovScriptWorkspaceFile({
    workspaceDir: input.workspaceDir,
    ...(input.userId !== undefined ? { userId: input.userId } : {}),
    ...(input.orgId !== undefined ? { orgId: input.orgId } : {}),
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    path: target.relativePath,
  })
}

export async function deleteMovScriptWorkspaceFile(input: ElectronMovScriptWorkspaceFilesInput): Promise<void> {
  const target = await resolveMovScriptWorkspaceFilePath(input)
  if (!target.relativePath) throw new Error('workspace root cannot be deleted')
  const targetStat = await lstatSafe(target.absolutePath)
  if (targetStat?.isSymbolicLink()) throw new Error('workspace file symlinks are not supported')
  await rm(target.absolutePath, { force: true, recursive: true })
}

async function resolveMovScriptWorkspaceFilePath(input?: ElectronMovScriptWorkspaceFilesInput): Promise<{ rootPath: string; absolutePath: string; relativePath: string }> {
  const workspaceDir = input?.workspaceDir?.trim() || await resolveDefaultMovScriptWorkspaceDir()
  const workspaceRoot = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  ensureMovScriptWorkspaceRoot(workspaceRoot)
  const rootPath = input?.projectId !== undefined
    ? resolveMovScriptProjectCwd({
        workspaceDir,
        ...(input.userId !== undefined ? { userId: input.userId } : {}),
        ...(input.orgId !== undefined ? { orgId: input.orgId } : {}),
        projectId: input.projectId,
      })
    : workspaceRoot.rootDir
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

async function resolveDefaultMovScriptWorkspaceDir(): Promise<string> {
  const { resolveDesktopDefaultMovScriptWorkspaceDir } = await import('./movscriptWorkspaceDefaults')
  return resolveDesktopDefaultMovScriptWorkspaceDir()
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

function imageMimeTypeForPath(path: string): string | undefined {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.avif')) return 'image/avif'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  return undefined
}

async function lstatSafe(absolutePath: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(absolutePath)
  } catch (error) {
    if (isNotFoundError(error)) return undefined
    throw error
  }
}

async function statSafe(absolutePath: string): Promise<Awaited<ReturnType<typeof stat>> | undefined> {
  try {
    return await stat(absolutePath)
  } catch (error) {
    if (isNotFoundError(error)) return undefined
    throw error
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}
