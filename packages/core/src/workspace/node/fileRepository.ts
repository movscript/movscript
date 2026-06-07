import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import type {
  MovScriptWorkspaceFileRepository,
  MovScriptWorkspaceRepositoryListResult,
  MovScriptWorkspaceRepositoryReadResult,
  MovScriptWorkspaceRepositoryWriteInput,
} from '../repository/types.js'
import { normalizeWorkspacePath } from '../layout/index.js'

export function createNodeMovScriptWorkspaceFileRepository(rootDir = process.cwd()): MovScriptWorkspaceFileRepository {
  const root = resolve(rootDir)
  return {
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
      return { path, content, size: content.length }
    },
    async write(input: MovScriptWorkspaceRepositoryWriteInput): Promise<MovScriptWorkspaceRepositoryReadResult> {
      const path = normalizeWorkspacePath(input.path)
      const absolutePath = resolveWorkspacePath(root, path)
      await mkdir(dirname(absolutePath), { recursive: true })
      await writeFile(absolutePath, input.content, 'utf8')
      return { path, content: input.content, size: input.content.length }
    },
    async delete(input: { path: string }): Promise<void> {
      await rm(resolveWorkspacePath(root, normalizeWorkspacePath(input.path)), { force: true })
    },
  }
}

function resolveWorkspacePath(root: string, path: string): string {
  const absolutePath = resolve(root, path)
  const relativePath = relative(root, absolutePath)
  if (relativePath === '' || (!relativePath.startsWith('..') && !relativePath.startsWith('/'))) return absolutePath
  throw new Error('workspace path must stay inside the project workspace root')
}
