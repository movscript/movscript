import type { MovScriptWorkspaceService } from '@movscript/workspace'
import type {
  ElectronAPI,
} from '@/shared/contracts/electronApi'
import { currentWorkspaceOwnerContext } from '@/shared/infrastructure/session/workspaceOwnerContext'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'

type WorkspaceElectronAPI = Pick<
  ElectronAPI,
  | 'reviewMovScriptWorkspace'
  | 'interpretMovScriptWorkspace'
  | 'queryMovScriptEngineWorkspaceEntities'
  | 'queryMovScriptEngineWorkspaceSettings'
  | 'queryMovScriptEngineWorkspaceAssets'
  | 'upsertMovScriptEngineWorkspaceSetting'
  | 'upsertMovScriptEngineWorkspaceAsset'
  | 'upsertMovScriptEngineWorkspaceScript'
  | 'readMovScriptEngineWorkspaceScriptSource'
  | 'readMovScriptEngineContentUnitGenerationPrompt'
  | 'deleteMovScriptEngineWorkspaceEntity'
  | 'saveMovScriptEngineWorkspaceProductionSnapshot'
  | 'upsertMovScriptEngineWorkspaceProjectStandards'
  | 'upsertMovScriptEngineWorkspaceContentUnit'
  | 'updateMovScriptEngineContentUnitEditPrompt'
  | 'selectMovScriptEngineWorkspaceCandidate'
  | 'appendMovScriptEngineWorkspaceCandidate'
  | 'createMovScriptEngineWorkspaceAssetSlotCandidate'
  | 'createMovScriptEngineWorkspaceKeyframeCandidate'
>

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
  if (hasEngineWorkspaceAPI(api)) {
    return createElectronMovScriptEngineWorkspaceService(context, api)
  }
  throw new Error('当前窗口没有 MovScript engine workspace 能力')
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
  projectDir?: string
  userId?: string | number
  orgId?: string | number
  projectId?: string | number
  expectedWorkspaceVersions?: Record<string, string | null>
}

let movScriptWorkspaceServiceFactoryForTest:
  | ((context: ElectronMovScriptWorkspaceFileRepositoryContext, api: WorkspaceElectronAPI) => MovScriptWorkspaceService)
  | undefined

let movScriptWorkspaceActionFactoryForTest:
  | ((action: 'review' | 'interpret', context: ElectronMovScriptWorkspaceFileRepositoryContext) => Promise<unknown>)
  | undefined

function requireElectronMovScriptWorkspaceAPI(): WorkspaceElectronAPI {
  const api = readElectronApi()
  if (!api) {
    throw new Error('当前窗口没有 MovScript 工作区文件能力')
  }
  return api
}

function createElectronMovScriptEngineWorkspaceService(
  context: ElectronMovScriptWorkspaceFileRepositoryContext,
  api: Required<Pick<
    WorkspaceElectronAPI,
    | 'queryMovScriptEngineWorkspaceEntities'
    | 'queryMovScriptEngineWorkspaceSettings'
    | 'queryMovScriptEngineWorkspaceAssets'
    | 'upsertMovScriptEngineWorkspaceSetting'
    | 'upsertMovScriptEngineWorkspaceAsset'
    | 'upsertMovScriptEngineWorkspaceScript'
    | 'readMovScriptEngineWorkspaceScriptSource'
    | 'readMovScriptEngineContentUnitGenerationPrompt'
    | 'deleteMovScriptEngineWorkspaceEntity'
    | 'saveMovScriptEngineWorkspaceProductionSnapshot'
    | 'upsertMovScriptEngineWorkspaceProjectStandards'
    | 'upsertMovScriptEngineWorkspaceContentUnit'
    | 'updateMovScriptEngineContentUnitEditPrompt'
    | 'selectMovScriptEngineWorkspaceCandidate'
    | 'appendMovScriptEngineWorkspaceCandidate'
    | 'createMovScriptEngineWorkspaceAssetSlotCandidate'
    | 'createMovScriptEngineWorkspaceKeyframeCandidate'
  >>,
): MovScriptWorkspaceService {
  const service: Partial<MovScriptWorkspaceService> = {
    async queryEntities(query) {
      return api.queryMovScriptEngineWorkspaceEntities({ ...context, query })
    },
    async querySettings(query) {
      return api.queryMovScriptEngineWorkspaceSettings({ ...context, query })
    },
    async queryAssets(query) {
      return api.queryMovScriptEngineWorkspaceAssets({ ...context, query })
    },
	    async upsertSetting(payload) {
	      return api.upsertMovScriptEngineWorkspaceSetting({ ...mutationContext(context, payload), payload })
	    },
	    async upsertAsset(payload) {
	      return api.upsertMovScriptEngineWorkspaceAsset({ ...mutationContext(context, payload), payload })
	    },
	    async upsertScript(payload) {
	      return api.upsertMovScriptEngineWorkspaceScript({ ...mutationContext(context, payload), payload })
	    },
    async readScriptSource(payload) {
      return api.readMovScriptEngineWorkspaceScriptSource({ ...context, payload })
    },
    async readContentUnitGenerationPrompt(contentUnitId) {
      return api.readMovScriptEngineContentUnitGenerationPrompt({ ...context, contentUnitId })
    },
	    async deleteEntity(payload) {
	      return api.deleteMovScriptEngineWorkspaceEntity({ ...mutationContext(context, payload), payload })
	    },
	    async saveProductionSnapshot(payload) {
	      return api.saveMovScriptEngineWorkspaceProductionSnapshot({ ...mutationContext(context, payload), payload })
	    },
	    async upsertProjectStandards(payload) {
	      return api.upsertMovScriptEngineWorkspaceProjectStandards({ ...mutationContext(context, payload), payload })
	    },
	    async upsertContentUnit(payload) {
	      return api.upsertMovScriptEngineWorkspaceContentUnit({ ...mutationContext(context, payload), payload })
	    },
	    async updateContentUnitEditPrompt(payload) {
	      return api.updateMovScriptEngineContentUnitEditPrompt({
	        ...mutationContext(context, payload),
	        ...payload,
	      })
	    },
	    async selectCandidate(payload) {
	      return api.selectMovScriptEngineWorkspaceCandidate({ ...mutationContext(context, payload), payload })
	    },
	    async appendCandidate(payload) {
	      return api.appendMovScriptEngineWorkspaceCandidate({ ...mutationContext(context, payload), payload })
	    },
	    async createAssetSlotCandidate(payload) {
	      return api.createMovScriptEngineWorkspaceAssetSlotCandidate({ ...mutationContext(context, payload), payload })
	    },
	    async createKeyframeCandidate(payload) {
	      return api.createMovScriptEngineWorkspaceKeyframeCandidate({ ...mutationContext(context, payload), payload })
	    },
  }
  return new Proxy(service, {
    get(target, property, receiver) {
      if (property in target) return Reflect.get(target, property, receiver)
      if (typeof property === 'string') {
        throw new Error(`MovScript engine workspace API does not expose ${property}`)
      }
      return undefined
    },
  }) as MovScriptWorkspaceService
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
  if (context.projectDir !== undefined) return context
  if (context.userId !== undefined || context.orgId !== undefined) return context
  return {
    ...context,
    ...currentWorkspaceOwnerContext(),
  }
}

function mutationContext(
  context: ElectronMovScriptWorkspaceFileRepositoryContext,
  payload: unknown,
  ...knownPaths: Array<string | undefined>
): ElectronMovScriptWorkspaceFileRepositoryContext {
  return {
    ...context,
    expectedWorkspaceVersions: expectedWorkspaceVersionsForMutation(context, payload, knownPaths),
  }
}

function expectedWorkspaceVersionsForMutation(
  context: ElectronMovScriptWorkspaceFileRepositoryContext,
  payload: unknown,
  knownPaths: Array<string | undefined>,
): Record<string, string | null> {
  const versions: Record<string, string | null> = { ...(context.expectedWorkspaceVersions ?? {}) }
  for (const path of knownPaths) {
    if (path && !(path in versions)) versions[path] = null
  }
  collectWorkspaceVersions(payload, versions)
  return versions
}

function collectWorkspaceVersions(value: unknown, versions: Record<string, string | null>, depth = 0): void {
  if (depth > 6 || !isRecord(value)) return
  const path = stringValue(value.__workspace_path ?? value.workspace_path ?? value.path ?? value.targetPath)
  const rawVersion = value.__workspace_version ?? value.workspace_version
  if (path && (typeof rawVersion === 'string' || rawVersion === null)) versions[path] = rawVersion
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) collectWorkspaceVersions(item, versions, depth + 1)
      continue
    }
    collectWorkspaceVersions(child, versions, depth + 1)
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function isWorkspaceElectronAPI(value: unknown): value is WorkspaceElectronAPI {
  return isRecord(value) && (
    'reviewMovScriptWorkspace' in value
    || 'interpretMovScriptWorkspace' in value
    || 'queryMovScriptEngineWorkspaceEntities' in value
  )
}

function hasEngineWorkspaceAPI(value: WorkspaceElectronAPI): value is Required<Pick<
  WorkspaceElectronAPI,
  | 'queryMovScriptEngineWorkspaceEntities'
  | 'queryMovScriptEngineWorkspaceSettings'
  | 'queryMovScriptEngineWorkspaceAssets'
  | 'upsertMovScriptEngineWorkspaceSetting'
  | 'upsertMovScriptEngineWorkspaceAsset'
  | 'upsertMovScriptEngineWorkspaceScript'
  | 'readMovScriptEngineWorkspaceScriptSource'
  | 'readMovScriptEngineContentUnitGenerationPrompt'
  | 'deleteMovScriptEngineWorkspaceEntity'
  | 'saveMovScriptEngineWorkspaceProductionSnapshot'
  | 'upsertMovScriptEngineWorkspaceProjectStandards'
  | 'upsertMovScriptEngineWorkspaceContentUnit'
  | 'updateMovScriptEngineContentUnitEditPrompt'
  | 'selectMovScriptEngineWorkspaceCandidate'
  | 'appendMovScriptEngineWorkspaceCandidate'
  | 'createMovScriptEngineWorkspaceAssetSlotCandidate'
  | 'createMovScriptEngineWorkspaceKeyframeCandidate'
>> {
  return Boolean(
    value.queryMovScriptEngineWorkspaceEntities
    && value.queryMovScriptEngineWorkspaceSettings
    && value.queryMovScriptEngineWorkspaceAssets
    && value.upsertMovScriptEngineWorkspaceSetting
    && value.upsertMovScriptEngineWorkspaceAsset
    && value.upsertMovScriptEngineWorkspaceScript
    && value.readMovScriptEngineWorkspaceScriptSource
    && value.readMovScriptEngineContentUnitGenerationPrompt
    && value.deleteMovScriptEngineWorkspaceEntity
    && value.saveMovScriptEngineWorkspaceProductionSnapshot
    && value.upsertMovScriptEngineWorkspaceProjectStandards
    && value.upsertMovScriptEngineWorkspaceContentUnit
    && value.updateMovScriptEngineContentUnitEditPrompt
    && value.selectMovScriptEngineWorkspaceCandidate
    && value.appendMovScriptEngineWorkspaceCandidate
    && value.createMovScriptEngineWorkspaceAssetSlotCandidate
    && value.createMovScriptEngineWorkspaceKeyframeCandidate
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
