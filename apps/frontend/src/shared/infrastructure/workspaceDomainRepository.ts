import {
  createMovScriptWorkspaceService,
  type MovScriptWorkspaceFileRepository,
  type MovScriptWorkspaceRepositoryReadResult,
  type MovScriptWorkspaceRepositoryListResult,
  type MovScriptWorkspaceRepositoryWriteInput,
  type MovScriptWorkspaceService,
} from '@movscript/workspace'
import type {
  ElectronAPI,
  ElectronMovScriptWorkspaceRootResult,
} from '@/shared/contracts/electronApi'
import { currentWorkspaceOwnerContext } from '@/shared/infrastructure/session/workspaceOwnerContext'

type WorkspaceElectronAPI = Pick<
  ElectronAPI,
  | 'getMovScriptWorkspaceRoot'
  | 'listMovScriptWorkspaceFiles'
  | 'readMovScriptWorkspaceFile'
  | 'writeMovScriptWorkspaceFile'
  | 'deleteMovScriptWorkspaceFile'
  | 'reviewMovScriptWorkspace'
  | 'interpretMovScriptWorkspace'
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
  if (movScriptWorkspaceFileRepositoryFactoryForTest) {
    const context = isWorkspaceElectronAPI(first) ? defaultWorkspaceOwnerContext({}) : defaultWorkspaceOwnerContext(first ?? {})
    const api = isWorkspaceElectronAPI(first) ? first : second ?? ({} as WorkspaceElectronAPI)
    return movScriptWorkspaceFileRepositoryFactoryForTest(context, api)
  }
  const { context, api } = repositoryArgs(first, second)
  return {
    async list(input: { path?: string } = {}): Promise<MovScriptWorkspaceRepositoryListResult> {
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
    async read(input: { path: string }): Promise<MovScriptWorkspaceRepositoryReadResult> {
      const result = await api.readMovScriptWorkspaceFile?.({ ...context, path: input.path })
      if (!result) throw new Error('MovScript workspace file reading is unavailable')
      return {
        path: result.path,
        content: result.content,
        size: result.size,
        updatedAt: result.updatedAt,
      }
    },
    async write(input: MovScriptWorkspaceRepositoryWriteInput): Promise<MovScriptWorkspaceRepositoryReadResult> {
      const result = await api.writeMovScriptWorkspaceFile?.({ ...context, path: input.path, content: input.content })
      if (!result) throw new Error('MovScript workspace file writing is unavailable')
      return {
        path: result.path,
        content: result.content,
        size: result.size,
        updatedAt: result.updatedAt,
      }
    },
    async delete(input: { path: string }): Promise<void> {
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
    const context = isWorkspaceElectronAPI(first) ? defaultWorkspaceOwnerContext({}) : defaultWorkspaceOwnerContext(first ?? {})
    const api = isWorkspaceElectronAPI(first) ? first : second ?? ({} as WorkspaceElectronAPI)
    return movScriptWorkspaceServiceFactoryForTest(context, api)
  }
  const { context, api } = repositoryArgs(first, second)
  return createMovScriptWorkspaceService({
    fileRepository: createElectronMovScriptWorkspaceFileRepository(context, api),
  })
}

export async function reviewElectronMovScriptWorkspace(
  context?: ElectronMovScriptWorkspaceFileRepositoryContext,
  api?: WorkspaceElectronAPI,
): Promise<unknown> {
  if (movScriptWorkspaceActionFactoryForTest) {
    return movScriptWorkspaceActionFactoryForTest('review', defaultWorkspaceOwnerContext(context ?? {}))
  }
  const args = repositoryArgs(context, api)
  const result = await args.api.reviewMovScriptWorkspace?.(args.context)
  if (!result) throw new Error('MovScript workspace review is unavailable')
  return result
}

export async function interpretElectronMovScriptWorkspace(
  context?: ElectronMovScriptWorkspaceFileRepositoryContext,
  api?: WorkspaceElectronAPI,
): Promise<unknown> {
  if (movScriptWorkspaceActionFactoryForTest) {
    return movScriptWorkspaceActionFactoryForTest('interpret', defaultWorkspaceOwnerContext(context ?? {}))
  }
  const args = repositoryArgs(context, api)
  const result = await args.api.interpretMovScriptWorkspace?.(args.context)
  if (!result) throw new Error('MovScript workspace interpret is unavailable')
  return result
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

export function __setElectronMovScriptWorkspaceFileRepositoryFactoryForTest(
  factory: ((context: ElectronMovScriptWorkspaceFileRepositoryContext, api: WorkspaceElectronAPI) => MovScriptWorkspaceFileRepository) | undefined,
): () => void {
  const previous = movScriptWorkspaceFileRepositoryFactoryForTest
  movScriptWorkspaceFileRepositoryFactoryForTest = factory
  return () => {
    movScriptWorkspaceFileRepositoryFactoryForTest = previous
  }
}

export function __setElectronMovScriptWorkspaceActionFactoryForTest(
  factory: ((action: 'review' | 'interpret', context: ElectronMovScriptWorkspaceFileRepositoryContext) => Promise<unknown>) | undefined,
): () => void {
  const previous = movScriptWorkspaceActionFactoryForTest
  movScriptWorkspaceActionFactoryForTest = factory
  return () => {
    movScriptWorkspaceActionFactoryForTest = previous
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

let movScriptWorkspaceFileRepositoryFactoryForTest:
  | ((context: ElectronMovScriptWorkspaceFileRepositoryContext, api: WorkspaceElectronAPI) => MovScriptWorkspaceFileRepository)
  | undefined

let movScriptWorkspaceActionFactoryForTest:
  | ((action: 'review' | 'interpret', context: ElectronMovScriptWorkspaceFileRepositoryContext) => Promise<unknown>)
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
    return { context: defaultWorkspaceOwnerContext({}), api: first }
  }
  return {
    context: defaultWorkspaceOwnerContext(first ?? {}),
    api: second ?? requireElectronMovScriptWorkspaceAPI(),
  }
}

function defaultWorkspaceOwnerContext(
  context: ElectronMovScriptWorkspaceFileRepositoryContext,
): ElectronMovScriptWorkspaceFileRepositoryContext {
  if (context.userId !== undefined || context.orgId !== undefined) return context
  return {
    ...context,
    ...currentWorkspaceOwnerContext(),
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
