import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import type {
  MovScriptWorkspaceFileRepository,
  MovScriptWorkspaceRepositoryListResult,
  MovScriptWorkspaceRepositoryReadResult,
  MovScriptWorkspaceRepositoryWriteInput,
} from '../repository/types.js'
import { normalizeWorkspacePath } from '../layout/index.js'

export interface NodeMovScriptWorkspaceFileRepository extends MovScriptWorkspaceFileRepository {
  readonly rootDir: string
}

export function createNodeMovScriptWorkspaceFileRepository(rootDir = process.cwd()): NodeMovScriptWorkspaceFileRepository {
  const root = resolve(rootDir)
  const repository = {
    async list(input = {}): Promise<MovScriptWorkspaceRepositoryListResult> {
      const path = normalizeWorkspacePath(input.path ?? '')
      const absolutePath = resolveWorkspacePath(root, path)
      const entries = await readdir(absolutePath, { withFileTypes: true }).catch(() => [])
      return {
        path,
        entries: entries.map((entry) => ({
          path: normalizeWorkspacePath(join(path, entry.name)),
          kind: entry.isDirectory() ? 'directory' as const : 'file' as const,
        })).sort((left, right) => {
          if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
          return left.path.localeCompare(right.path)
        }),
      }
    },
    async read(input: { path: string }): Promise<MovScriptWorkspaceRepositoryReadResult> {
      const path = normalizeWorkspacePath(input.path)
      const absolutePath = resolveWorkspacePath(root, path)
      const content = await readFile(absolutePath, 'utf8')
      const fileStat = await stat(absolutePath)
      const version = fileVersion(fileStat.mtimeMs, fileStat.size)
      return { path, content, size: content.length, updatedAt: fileStat.mtime.toISOString(), version }
    },
    async write(input: MovScriptWorkspaceRepositoryWriteInput): Promise<MovScriptWorkspaceRepositoryReadResult> {
      const path = normalizeWorkspacePath(input.path)
      const absolutePath = resolveWorkspacePath(root, path)
      await mkdir(dirname(absolutePath), { recursive: true })
      await assertExpectedFileVersion(absolutePath, input.expectedVersion)
      await writeTextFileAtomic(absolutePath, input.content)
      const fileStat = await stat(absolutePath)
      const version = fileVersion(fileStat.mtimeMs, fileStat.size)
      return { path, content: input.content, size: input.content.length, updatedAt: fileStat.mtime.toISOString(), version }
    },
    async delete(input: { path: string }): Promise<void> {
      await rm(resolveWorkspacePath(root, normalizeWorkspacePath(input.path)), { force: true })
    },
  } as NodeMovScriptWorkspaceFileRepository
  Object.defineProperty(repository, 'rootDir', {
    value: root,
    enumerable: false,
    configurable: false,
  })
  return repository
}

export function getNodeMovScriptWorkspaceFileRepositoryRoot(
  fileRepository: MovScriptWorkspaceFileRepository,
): string | undefined {
  const rootDir = (fileRepository as Partial<NodeMovScriptWorkspaceFileRepository>).rootDir
  return typeof rootDir === 'string' && rootDir ? rootDir : undefined
}

function resolveWorkspacePath(root: string, path: string): string {
  const absolutePath = resolve(root, path)
  const relativePath = relative(root, absolutePath)
  if (relativePath === '' || (!relativePath.startsWith('..') && !relativePath.startsWith('/'))) return absolutePath
  throw new Error('workspace path must stay inside the project workspace root')
}

async function writeTextFileAtomic(filePath: string, content: string): Promise<void> {
  const tmpPath = join(dirname(filePath), `.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
  try {
    await writeFile(tmpPath, content, 'utf8')
    await rename(tmpPath, filePath)
  } catch (error) {
    await rm(tmpPath, { force: true }).catch(() => undefined)
    throw error
  }
}

async function assertExpectedFileVersion(filePath: string, expectedVersion: string | null | undefined): Promise<void> {
  if (expectedVersion === undefined) return
  const fileStat = await stat(filePath).catch((error: unknown) => {
    if (isNotFoundError(error)) return undefined
    throw error
  })
  const currentVersion = fileStat ? fileVersion(fileStat.mtimeMs, fileStat.size) : null
  if (currentVersion !== expectedVersion) {
    throw new Error(`workspace file changed: ${filePath}`)
  }
}

function fileVersion(mtimeMs: number, size: number): string {
  return `${Math.trunc(mtimeMs)}:${size}`
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}
