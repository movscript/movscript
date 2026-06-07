import {
  createMovScriptWorkspaceService,
  type MovScriptWorkspaceFileRepository,
  type MovScriptWorkspaceService,
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
  | 'reviewMovScriptWorkspace'
  | 'buildMovScriptWorkspace'
>

export function createElectronMovScriptWorkspaceFileRepository(
  api?: WorkspaceElectronAPI,
): MovScriptWorkspaceFileRepository
export function createElectronMovScriptWorkspaceFileRepository(
  context?: ElectronMovScriptWorkspaceFileRepositoryContext,
  api?: WorkspaceElectronAPI,
): MovScriptWorkspaceFileRepository
export function createElectronMovScriptWorkspaceFileRepository(
  first?: WorkspaceElectronAPI | ElectronMovScriptWorkspaceFileRepositoryContext,
  second?: WorkspaceElectronAPI,
): MovScriptWorkspaceFileRepository {
  const { context, api } = repositoryArgs(first, second)
  return {
    async list(input = {}) {
      const result = await api.listMovScriptWorkspaceFiles?.({ ...context, path: input.path })
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
      const result = await api.readMovScriptWorkspaceFile?.({ ...context, path: input.path })
      if (!result) throw new Error('MovScript workspace file reading is unavailable')
      return {
        path: result.path,
        content: result.content,
        size: result.size,
        updatedAt: result.updatedAt,
      }
    },
    async write(input) {
      const result = await api.writeMovScriptWorkspaceFile?.({ ...context, path: input.path, content: input.content })
      if (!result) throw new Error('MovScript workspace file writing is unavailable')
      return {
        path: result.path,
        content: result.content,
        size: result.size,
        updatedAt: result.updatedAt,
      }
    },
    async delete(input) {
      await api.deleteMovScriptWorkspaceFile?.({ ...context, path: input.path })
    },
  }
}

export function createElectronMovScriptWorkspaceService(
  api?: WorkspaceElectronAPI,
): MovScriptWorkspaceService
export function createElectronMovScriptWorkspaceService(
  context?: ElectronMovScriptWorkspaceFileRepositoryContext,
  api?: WorkspaceElectronAPI,
): MovScriptWorkspaceService
export function createElectronMovScriptWorkspaceService(
  first?: WorkspaceElectronAPI | ElectronMovScriptWorkspaceFileRepositoryContext,
  second?: WorkspaceElectronAPI,
): MovScriptWorkspaceService {
  if (movScriptWorkspaceServiceFactoryForTest) {
    const context = isWorkspaceElectronAPI(first) ? {} : first ?? {}
    const api = isWorkspaceElectronAPI(first) ? first : second ?? ({} as WorkspaceElectronAPI)
    return movScriptWorkspaceServiceFactoryForTest(context, api)
  }
  const { context, api } = repositoryArgs(first, second)
  const reviewWorkspace = api.reviewMovScriptWorkspace
    ? () => {
        const review = api.reviewMovScriptWorkspace?.(context)
        if (!review) throw new Error('MovScript workspace review is unavailable')
        return review
      }
    : undefined
  const buildWorkspace = api.buildMovScriptWorkspace
    ? () => {
        const build = api.buildMovScriptWorkspace?.(context)
        if (!build) throw new Error('MovScript workspace build is unavailable')
        return build
      }
    : undefined
  return createMovScriptWorkspaceService({
    fileRepository: createElectronMovScriptWorkspaceFileRepository(context, api),
    ...(reviewWorkspace ? { reviewWorkspace } : {}),
    ...(buildWorkspace ? { buildWorkspace } : {}),
  })
}

export function __setElectronMovScriptWorkspaceServiceFactoryForTest(
  factory: ((context: ElectronMovScriptWorkspaceFileRepositoryContext, api: WorkspaceElectronAPI) => MovScriptWorkspaceService) | undefined,
): () => void {
  const previous = movScriptWorkspaceServiceFactoryForTest
  movScriptWorkspaceServiceFactoryForTest = factory
  return () => {
    movScriptWorkspaceServiceFactoryForTest = previous
  }
}

export type ElectronMovScriptWorkspaceFileRepositoryContext = {
  workspaceDir?: string
  userId?: string | number
  orgId?: string | number
  projectId?: string | number
}

let movScriptWorkspaceServiceFactoryForTest:
  | ((context: ElectronMovScriptWorkspaceFileRepositoryContext, api: WorkspaceElectronAPI) => MovScriptWorkspaceService)
  | undefined

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

function repositoryArgs(
  first?: WorkspaceElectronAPI | ElectronMovScriptWorkspaceFileRepositoryContext,
  second?: WorkspaceElectronAPI,
): { context: ElectronMovScriptWorkspaceFileRepositoryContext; api: WorkspaceElectronAPI } {
  if (isWorkspaceElectronAPI(first)) {
    return { context: {}, api: first }
  }
  return {
    context: first ?? {},
    api: second ?? requireElectronMovScriptWorkspaceAPI(),
  }
}

function isWorkspaceElectronAPI(value: unknown): value is WorkspaceElectronAPI {
  return isRecord(value) && (
    'getMovScriptWorkspaceRoot' in value
    || 'listMovScriptWorkspaceFiles' in value
    || 'readMovScriptWorkspaceFile' in value
    || 'writeMovScriptWorkspaceFile' in value
    || 'deleteMovScriptWorkspaceFile' in value
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
