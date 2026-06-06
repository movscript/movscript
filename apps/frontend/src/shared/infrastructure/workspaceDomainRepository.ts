import {
  createMovScriptWorkspaceDomainRepository,
  type MovScriptWorkspaceDomainIndex,
  type MovScriptWorkspaceDomainRepository,
  type MovScriptWorkspaceFileRepository,
  type MovScriptWorkspaceIndexedEntity,
} from '@movscript/core/workspace'
import type {
  ElectronAPI,
  ElectronMovScriptWorkspaceRootResult,
} from '@/shared/contracts/electronApi'

type WorkspaceElectronAPI = Pick<
  ElectronAPI,
  | 'getMovScriptWorkspaceRoot'
  | 'listMovScriptWorkspaceFiles'
  | 'readMovScriptWorkspaceFile'
  | 'writeMovScriptWorkspaceFile'
  | 'deleteMovScriptWorkspaceFile'
>

export function createElectronMovScriptWorkspaceFileRepository(
  api: WorkspaceElectronAPI = requireElectronMovScriptWorkspaceAPI(),
): MovScriptWorkspaceFileRepository {
  return {
    async list(input = {}) {
      const result = await api.listMovScriptWorkspaceFiles?.({ path: input.path })
      if (!result) throw new Error('MovScript workspace file listing is unavailable')
      return {
        path: result.path,
        entries: result.entries.map((entry) => ({
          path: entry.path,
          kind: entry.kind,
          size: entry.size,
          updatedAt: entry.updatedAt,
        })),
      }
    },
    async read(input) {
      const result = await api.readMovScriptWorkspaceFile?.({ path: input.path })
      if (!result) throw new Error('MovScript workspace file reading is unavailable')
      return {
        path: result.path,
        content: result.content,
        size: result.size,
        updatedAt: result.updatedAt,
      }
    },
    async write(input) {
      const result = await api.writeMovScriptWorkspaceFile?.({ path: input.path, content: input.content })
      if (!result) throw new Error('MovScript workspace file writing is unavailable')
      return {
        path: result.path,
        content: result.content,
        size: result.size,
        updatedAt: result.updatedAt,
      }
    },
    async delete(input) {
      await api.deleteMovScriptWorkspaceFile?.({ path: input.path })
    },
  }
}

export function createElectronMovScriptWorkspaceDomainRepository(
  api: WorkspaceElectronAPI = requireElectronMovScriptWorkspaceAPI(),
): MovScriptWorkspaceDomainRepository {
  return createMovScriptWorkspaceDomainRepository({
    fileRepository: createElectronMovScriptWorkspaceFileRepository(api),
  })
}

export async function loadMovScriptProjectWorkspaceDomainIndex(
  projectId: number,
  api: WorkspaceElectronAPI = requireElectronMovScriptWorkspaceAPI(),
): Promise<MovScriptWorkspaceDomainIndex> {
  const builtIndex = await readBuiltDomainIndex(api)
  if (builtIndex) return builtIndex
  const repository = createElectronMovScriptWorkspaceDomainRepository(api)
  return repository.loadIndex({
    path: await resolveMovScriptWorkspaceProjectPath(api, projectId),
  })
}

export async function resolveMovScriptWorkspaceProjectPath(
  api: Pick<WorkspaceElectronAPI, 'getMovScriptWorkspaceRoot' | 'listMovScriptWorkspaceFiles'>,
  projectId: number,
): Promise<string> {
  await requireWorkspaceRoot(api)
  return movScriptWorkspaceProjectPath('local', projectId)
}

export function movScriptWorkspaceProjectPath(userId: string | number, projectId: string | number): string {
  return `edit/projects/${String(projectId)}`
}

export function movScriptWorkspaceProjectEditPath(projectId: string | number): string {
  return movScriptWorkspaceProjectPath('local', projectId)
}

function requireElectronMovScriptWorkspaceAPI(): WorkspaceElectronAPI {
  const api = window.api
  if (
    !api?.getMovScriptWorkspaceRoot
    || !api.listMovScriptWorkspaceFiles
    || !api.readMovScriptWorkspaceFile
    || !api.writeMovScriptWorkspaceFile
    || !api.deleteMovScriptWorkspaceFile
  ) {
    throw new Error('当前窗口没有 MovScript 工作区文件能力')
  }
  return api
}

async function requireWorkspaceRoot(
  api: Pick<WorkspaceElectronAPI, 'getMovScriptWorkspaceRoot'>,
): Promise<ElectronMovScriptWorkspaceRootResult> {
  const root = await api.getMovScriptWorkspaceRoot?.()
  if (!root) throw new Error('MovScript workspace root is unavailable')
  return root
}

async function readBuiltDomainIndex(api: WorkspaceElectronAPI): Promise<MovScriptWorkspaceDomainIndex | null> {
  try {
    const file = await api.readMovScriptWorkspaceFile?.({ path: '.build/indexes/domain-index.json' })
    if (!file) return null
    const parsed = JSON.parse(file.content) as unknown
    return deserializeDomainIndex(parsed)
  } catch {
    return null
  }
}

function deserializeDomainIndex(value: unknown): MovScriptWorkspaceDomainIndex | null {
  if (!isRecord(value) || value.schema !== 'movscript.domain-index.v1' || !Array.isArray(value.entities)) return null
  const documents = Array.isArray(value.documents)
    ? value.documents.filter(isRecord).map((document) => ({ path: String(document.path ?? ''), data: undefined }))
    : []
  const entities = value.entities.filter(isRecord).map((entity) => entity as unknown as MovScriptWorkspaceIndexedEntity)
  const byType = new Map<MovScriptWorkspaceIndexedEntity['entityType'], MovScriptWorkspaceIndexedEntity[]>()
  for (const entity of entities) byType.set(entity.entityType, [...(byType.get(entity.entityType) ?? []), entity])
  return { documents, entities, byType }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
