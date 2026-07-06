import {
  NodeMovScriptEngineRegistry,
  type NodeMovScriptEngine,
} from '@movscript/engine/node'
import {
  type NodeMovScriptWorkspaceService,
} from '@movscript/workspace/node'
import {
  createProjectServiceClientFromRuntime,
  PROJECT_SERVICE_ASSETS_QUERY_ENDPOINT,
  PROJECT_SERVICE_ASSET_CREATE_ENDPOINT,
  PROJECT_SERVICE_ASSET_PROVIDER_CERTIFICATION_PATCH_ENDPOINT,
  PROJECT_SERVICE_ASSET_UPSERT_ENDPOINT,
  PROJECT_SERVICE_AUDIO_CUE_CREATE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_WORKSPACE_READ_ENDPOINT,
  PROJECT_SERVICE_CONTENT_WORKSPACE_SNAPSHOT_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_CREATE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_EDIT_PROMPT_UPDATE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_ENSURE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_UPSERT_ENDPOINT,
  PROJECT_SERVICE_CONTENT_CANDIDATE_CREATE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_DECIDE_ENDPOINT,
  PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_SELECT_ENDPOINT,
  PROJECT_SERVICE_ENTITIES_QUERY_ENDPOINT,
  PROJECT_SERVICE_ENTITY_DELETE_ENDPOINT,
  PROJECT_SERVICE_ENTITY_TRANSITION_UPDATE_ENDPOINT,
  PROJECT_SERVICE_EXPRESSION_UNIT_CREATE_ENDPOINT,
  PROJECT_SERVICE_HIERARCHY_WRITE_ENDPOINT,
  PROJECT_SERVICE_KEYFRAME_CREATE_ENDPOINT,
  PROJECT_SERVICE_NAMESPACE_WRITE_ENDPOINT,
  PROJECT_SERVICE_PRODUCTION_CREATE_ENDPOINT,
  PROJECT_SERVICE_SCENE_MOMENT_CREATE_ENDPOINT,
  PROJECT_SERVICE_SEGMENT_CREATE_ENDPOINT,
  PROJECT_SERVICE_SETTINGS_QUERY_ENDPOINT,
  PROJECT_SERVICE_SETTING_CREATE_ENDPOINT,
  PROJECT_SERVICE_SETTING_STATE_CREATE_ENDPOINT,
  PROJECT_SERVICE_SETTING_UPSERT_ENDPOINT,
  PROJECT_SERVICE_STORYBOARD_CREATE_ENDPOINT,
  PROJECT_SERVICE_STORYBOARD_TIMELINE_UPDATE_ENDPOINT,
  type ProjectDecisionStoreConfig,
  type ProjectServiceClient,
} from '@movscript/project'
import {
  createMovScriptScopedProjectDataDecisionStore,
  type MovScriptDecisionStore,
} from '@movscript/workspace/repository'
import { resolveMovScriptBackendSession } from '../../../../backend/node/config.js'
import { getMovScriptBackendRuntimeAuthToken } from '../../../../backend/node/runtime.js'
import {
  buildContentSourceWorkspaceData,
  type ContentSourceWorkspaceData,
  type ContentSourceWorkspaceSnapshot,
} from '../../../../content/index.js'
import {
  loadContentSourceWorkspaceSnapshotFromEngine,
} from '../../../../content/sourceWorkspaceEngine.js'
import { getMCPAuthToken } from '../focus/store.js'

export interface MovScriptDomainRuntimeInput {
  workspaceDir?: string
  projectDir?: string
  userId?: string | number
  orgId?: string | number
  projectUid?: string
  projectTitle?: string
  scopeKind?: 'user' | 'org'
  scopeId?: string | number
}

export type MovScriptDomainRuntime = NodeMovScriptEngine & NodeMovScriptWorkspaceService & {
  projectCwd: string
  projectDir: string
  decisionStore?: MovScriptDecisionStore
  reviewWorkspace(input?: { commit?: string; checkpointHash?: string }): Promise<unknown>
  inspectWorkspace(input?: { commit?: string; checkpointHash?: string }): Promise<unknown>
  interpretWorkspace(): ReturnType<NodeMovScriptEngine['interpret']>
  overviewWorkspace(): Promise<unknown>
  productionWorkPlan(): Promise<unknown>
  regenerationPlan(): Promise<unknown>
  loadContentWorkspaceSnapshot(): Promise<ContentSourceWorkspaceSnapshot>
  loadContentWorkspace(): Promise<ContentSourceWorkspaceData>
  patchAssetProviderCertification(input?: unknown): Promise<any>
}

type ProjectDecisionStoreConfigResolver = () => Promise<ProjectDecisionStoreConfig | undefined>

export function createMovScriptDomainRuntime(input: MovScriptDomainRuntimeInput): MovScriptDomainRuntime {
  const context = normalizeRuntimeInput(input)
  const cacheKey = runtimeKey(context)
  const projectCwd = projectCwdFromInput(context)
  const decisionStoreConfig = createMCPDecisionStoreConfigResolver(context)
  const decisionStore = createMCPDecisionStore(decisionStoreConfig)
  const engine = movScriptDomainEngineRegistry.get({
    cacheKey,
    projectDir: projectCwd,
    decisionStore,
  })
  return createMovScriptDomainRuntimeFromEngine(engine, projectCwd, decisionStore, decisionStoreConfig)
}

export function invalidateMovScriptDomainRuntime(input: MovScriptDomainRuntimeInput): void {
  movScriptDomainEngineRegistry.invalidate(runtimeKey(normalizeRuntimeInput(input)))
}

export function clearMovScriptDomainRuntimeRegistry(): void {
  movScriptDomainEngineRegistry.clear()
}

const movScriptDomainEngineRegistry = new NodeMovScriptEngineRegistry()

function createMovScriptDomainRuntimeFromEngine(
  engine: NodeMovScriptEngine,
  projectCwd: string,
  decisionStore?: MovScriptDecisionStore,
  decisionStoreConfig?: ProjectDecisionStoreConfigResolver,
): MovScriptDomainRuntime {
  const projectService = createProjectServiceAccessor(projectCwd, decisionStoreConfig)
  return {
    ...engine.workspaceService,
    ...engine,
    projectCwd,
    projectDir: projectCwd,
    decisionStore,
    upsertProjectStandards: (input) => projectService.upsertProjectStandards(input),
    upsertSetting: (input) => projectService.sourceOperation(PROJECT_SERVICE_SETTING_UPSERT_ENDPOINT, input),
    createSetting: (input) => projectService.sourceOperation(PROJECT_SERVICE_SETTING_CREATE_ENDPOINT, input),
    createSettingState: (input) => projectService.sourceOperation(PROJECT_SERVICE_SETTING_STATE_CREATE_ENDPOINT, input),
    upsertAsset: (input) => projectService.sourceOperation(PROJECT_SERVICE_ASSET_UPSERT_ENDPOINT, input),
    createAsset: (input) => projectService.sourceOperation(PROJECT_SERVICE_ASSET_CREATE_ENDPOINT, input),
    readScriptSource: (input) => projectService.readScriptSource(input),
    upsertScript: (input) => projectService.upsertScript(input),
    snapshotScriptVersionFromMarkdown: (input) => projectService.snapshotScriptVersionFromMarkdown(input),
    upsertContentUnit: (input) => projectService.sourceOperation(PROJECT_SERVICE_CONTENT_UNIT_UPSERT_ENDPOINT, input),
    createContentUnit: (input) => projectService.sourceOperation(PROJECT_SERVICE_CONTENT_UNIT_CREATE_ENDPOINT, input),
    ensureContentUnitForEntity: (input) => projectService.sourceOperation(PROJECT_SERVICE_CONTENT_UNIT_ENSURE_ENDPOINT, input),
    writeHierarchyNode: (input) => projectService.sourceOperation(isNamespaceHierarchyWrite(input) ? PROJECT_SERVICE_NAMESPACE_WRITE_ENDPOINT : PROJECT_SERVICE_HIERARCHY_WRITE_ENDPOINT, input),
    createProduction: (input) => projectService.sourceOperation(PROJECT_SERVICE_PRODUCTION_CREATE_ENDPOINT, input),
    createSegment: (input) => projectService.sourceOperation(PROJECT_SERVICE_SEGMENT_CREATE_ENDPOINT, input),
    createSceneMoment: (input) => projectService.sourceOperation(PROJECT_SERVICE_SCENE_MOMENT_CREATE_ENDPOINT, input),
    createStoryboard: (input) => projectService.sourceOperation(PROJECT_SERVICE_STORYBOARD_CREATE_ENDPOINT, input),
    createKeyframe: (input) => projectService.sourceOperation(PROJECT_SERVICE_KEYFRAME_CREATE_ENDPOINT, input),
    createAudioCue: (input) => projectService.sourceOperation(PROJECT_SERVICE_AUDIO_CUE_CREATE_ENDPOINT, input),
    createExpressionUnit: (input) => projectService.sourceOperation(PROJECT_SERVICE_EXPRESSION_UNIT_CREATE_ENDPOINT, input),
    updateContentUnitEditPrompt: (input) => projectService.sourceOperation(PROJECT_SERVICE_CONTENT_UNIT_EDIT_PROMPT_UPDATE_ENDPOINT, input),
    updateEntityTransition: (input) => projectService.sourceOperation(PROJECT_SERVICE_ENTITY_TRANSITION_UPDATE_ENDPOINT, input),
    updateStoryboardTimeline: (input) => projectService.sourceOperation(PROJECT_SERVICE_STORYBOARD_TIMELINE_UPDATE_ENDPOINT, input),
    deleteEntity: (input) => projectService.sourceOperation(PROJECT_SERVICE_ENTITY_DELETE_ENDPOINT, input).then(() => undefined),
    createContentCandidate: (input) => projectService.candidateAction(PROJECT_SERVICE_CONTENT_CANDIDATE_CREATE_ENDPOINT, input),
    selectContentUnitCandidate: (input) => projectService.candidateAction(PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_SELECT_ENDPOINT, input),
    decideContentUnitCandidate: (input) => projectService.candidateAction(PROJECT_SERVICE_CONTENT_UNIT_CANDIDATE_DECIDE_ENDPOINT, input),
    readContentUnitGenerationPrompt: async (contentUnitId) => (await projectService.promptContext(contentUnitId)).generationPrompt,
    buildContentUnitBackendPrompt: async (contentUnitId) => (await projectService.promptContext(contentUnitId)).backendPrompt,
    reviewWorkspace: (inspectInput = {}) => projectService.inspectWorkspace(inspectInput),
    inspectWorkspace: (inspectInput = {}) => projectService.inspectWorkspace(inspectInput),
    interpretWorkspace: () => projectService.interpretWorkspace(),
    overviewWorkspace: () => projectService.overviewWorkspace(),
    queryEntities: (query) => projectService.sourceOperation(PROJECT_SERVICE_ENTITIES_QUERY_ENDPOINT, { query }),
    querySettings: (query) => projectService.sourceOperation(PROJECT_SERVICE_SETTINGS_QUERY_ENDPOINT, { query }),
    queryAssets: (query) => projectService.sourceOperation(PROJECT_SERVICE_ASSETS_QUERY_ENDPOINT, { query }),
    patchAssetProviderCertification: (input) => projectService.sourceOperation(PROJECT_SERVICE_ASSET_PROVIDER_CERTIFICATION_PATCH_ENDPOINT, input),
    productionWorkPlan: () => projectService.productionWorkPlan(),
    regenerationPlan: () => projectService.regenerationPlan(),
    loadContentWorkspaceSnapshot: () => projectService.sourceOperation(PROJECT_SERVICE_CONTENT_WORKSPACE_SNAPSHOT_ENDPOINT) as Promise<ContentSourceWorkspaceSnapshot>,
    loadContentWorkspace: () => projectService.sourceOperation(PROJECT_SERVICE_CONTENT_WORKSPACE_READ_ENDPOINT) as Promise<ContentSourceWorkspaceData>,
  }
}

function isNamespaceHierarchyWrite(input: { category?: string; domainCategory?: string; domain_category?: string }): boolean {
  const category = input.category ?? input.domainCategory ?? input.domain_category
  return category === 'timeline_namespace' || category === 'setting_namespace'
}

function createProjectServiceAccessor(projectDir: string, decisionStoreConfig?: ProjectDecisionStoreConfigResolver): {
  inspectWorkspace(input?: { commit?: string; checkpointHash?: string }): Promise<unknown>
  overviewWorkspace(): Promise<unknown>
  productionWorkPlan(): Promise<unknown>
  interpretWorkspace(): ReturnType<NodeMovScriptEngine['interpret']>
  regenerationPlan(): Promise<unknown>
  upsertProjectStandards(input?: unknown): Promise<any>
  readScriptSource(input?: unknown): Promise<any>
  upsertScript(input?: unknown): Promise<any>
  snapshotScriptVersionFromMarkdown(input?: unknown): Promise<any>
  sourceOperation(endpoint: string, input?: unknown): Promise<any>
  candidateAction(endpoint: string, input?: unknown): Promise<any>
  promptContext(contentUnitId: string | number): Promise<any>
} {
  let client: ProjectServiceClient | undefined
  const getClient = () => {
    client ??= createProjectServiceClientFromRuntime()
    return client
  }
  return {
    inspectWorkspace: async (input = {}) => (await getClient().inspectSource({ projectDir, ...input })).inspection,
    overviewWorkspace: async () => (await getClient().overviewSource({ projectDir })).overview,
    interpretWorkspace: async () => (await getClient().interpretSource({ projectDir })).interpretation as Awaited<ReturnType<NodeMovScriptEngine['interpret']>>,
    productionWorkPlan: async () => (await getClient().productionWorkPlan({ projectDir })).productionWorkPlan,
    regenerationPlan: async () => (await getClient().regenerationPlan({ projectDir })).regenerationPlan,
    upsertProjectStandards: async (input = {}) => (await getClient().upsertProjectStandards({
      projectDir,
      input: sourceOperationInput(input),
    })).result,
    readScriptSource: async (input = {}) => (await getClient().readScriptSource({
      projectDir,
      input: sourceOperationInput(input),
    })).result,
    upsertScript: async (input = {}) => (await getClient().upsertScript({
      projectDir,
      input: sourceOperationInput(input),
    })).result,
    snapshotScriptVersionFromMarkdown: async (input = {}) => (await getClient().snapshotScriptVersionFromMarkdown({
      projectDir,
      input: sourceOperationInput(input),
    })).result,
    sourceOperation: async (endpoint, input = {}) => (await getClient().sourceOperation(endpoint, {
      projectDir,
      input: sourceOperationInput(input),
    })).result,
    candidateAction: async (endpoint, input = {}) => {
      const resolvedDecisionStoreConfig = await decisionStoreConfig?.()
      if (!resolvedDecisionStoreConfig) {
        throw new Error('content unit candidate action requires a scoped project data decisionStore. Provide projectUid/MOVSCRIPT_PROJECT_UID and scoped project-data context; do not retry through legacy MOVSCRIPT_PROJECT_ID decisions.')
      }
      return (await getClient().candidateAction(endpoint, {
        projectDir,
        input: sourceOperationInput(input),
        decisionStore: resolvedDecisionStoreConfig,
      })).result
    },
    promptContext: async (contentUnitId) => {
      const resolvedDecisionStoreConfig = await decisionStoreConfig?.()
      return getClient().promptContext({
        projectDir,
        contentUnitId,
        ...(resolvedDecisionStoreConfig ? { decisionStore: resolvedDecisionStoreConfig } : {}),
      })
    },
  }
}

function sourceOperationInput(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}
}

function normalizeRuntimeInput(input: MovScriptDomainRuntimeInput): MovScriptDomainRuntimeInput {
  return {
    ...(input.workspaceDir !== undefined ? { workspaceDir: input.workspaceDir } : {}),
    ...(input.projectDir !== undefined ? { projectDir: input.projectDir } : {}),
    ...(input.userId !== undefined ? { userId: input.userId } : {}),
    ...(input.orgId !== undefined ? { orgId: input.orgId } : {}),
    ...(input.projectUid !== undefined ? { projectUid: input.projectUid } : {}),
    ...(input.projectTitle !== undefined ? { projectTitle: input.projectTitle } : {}),
    ...(input.scopeKind !== undefined ? { scopeKind: input.scopeKind } : {}),
    ...(input.scopeId !== undefined ? { scopeId: input.scopeId } : {}),
  }
}

function runtimeKey(input: MovScriptDomainRuntimeInput): string {
  const projectCwd = projectCwdFromInput(input)
  const session = resolveMovScriptBackendSession({
    workspaceDir: input.workspaceDir,
    userId: input.userId,
  })
  const token = getMCPAuthToken() || getMovScriptBackendRuntimeAuthToken() || session.token || ''
  return [
    projectCwd,
    input.userId ?? '',
    input.orgId ?? '',
    input.projectUid ?? '',
    input.scopeKind ?? '',
    input.scopeId ?? '',
    session.baseURL,
    session.userId ?? '',
    token,
  ].map((part) => String(part)).join('\u001f')
}

function createMCPDecisionStore(resolveConfig: ProjectDecisionStoreConfigResolver | undefined): MovScriptDecisionStore | undefined {
  if (!resolveConfig) return undefined
  let storePromise: Promise<MovScriptDecisionStore | undefined> | undefined
  const getStore = async () => {
    storePromise ??= resolveConfig().then((config) => config ? createMovScriptScopedProjectDataDecisionStore(config) : undefined)
    return storePromise
  }
  const requireStore = async () => {
    const store = await getStore()
    if (!store) {
      throw new Error('content unit candidate command requires a scoped project data decisionStore. Provide projectDir/cwd plus projectUid, or run from a project shell with MOVSCRIPT_PROJECT_UID; do not fall back to legacy MOVSCRIPT_PROJECT_ID decisions.')
    }
    return store
  }
  return {
    async getContentUnitDecision(input) {
      return (await getStore())?.getContentUnitDecision(input)
    },
    async getContentUnitDecisions(input) {
      return (await getStore())?.getContentUnitDecisions?.(input) ?? new Map()
    },
    async replaceContentUnitCandidates(input) {
      return (await requireStore()).replaceContentUnitCandidates(input)
    },
    async upsertContentUnitCandidate(input) {
      return (await requireStore()).upsertContentUnitCandidate(input)
    },
    async selectContentUnitCandidate(input) {
      return (await requireStore()).selectContentUnitCandidate(input)
    },
    async clearContentUnitSelection(input) {
      return (await requireStore()).clearContentUnitSelection(input)
    },
  }
}

export async function resolveMCPProjectDecisionStoreConfig(input: MovScriptDomainRuntimeInput): Promise<ProjectDecisionStoreConfig | undefined> {
  return createMCPDecisionStoreConfigResolver(input)?.()
}

function createMCPDecisionStoreConfigResolver(input: MovScriptDomainRuntimeInput): ProjectDecisionStoreConfigResolver | undefined {
  const session = resolveMovScriptBackendSession({
    workspaceDir: input.workspaceDir,
    userId: input.userId,
  })
  const token = getMCPAuthToken() || getMovScriptBackendRuntimeAuthToken() || session.token
  const projectCwd = projectCwdFromInput(input)
  let configPromise: Promise<ProjectDecisionStoreConfig | undefined> | undefined
  return async () => {
    configPromise ??= (async () => {
      const resolvedLocator = await createProjectServiceClientFromRuntime().resolveLocator({
        projectDir: projectCwd,
        ...(input.workspaceDir ? { workspaceDir: input.workspaceDir } : {}),
        ...(input.projectUid ? { projectUid: input.projectUid } : {}),
      })
      const projectUid = resolvedLocator.locator.projectUid ?? input.projectUid
      const projectTitle = input.projectTitle ?? resolvedLocator.locator.projectTitle
      if (!projectUid) return undefined
      const scope = scopedProjectDataDecisionScope(input, session.userId)
      const headers = {
        ...(session.userId ? { 'X-User-ID': session.userId } : {}),
        ...(input.orgId !== undefined ? { 'X-Org-ID': String(input.orgId) } : {}),
      }
      return {
        kind: 'scoped-project-data',
        baseUrl: session.baseURL,
        projectUid,
        ...(projectTitle ? { title: projectTitle } : {}),
        ...(scope ? { scopeKind: scope.kind, scopeId: scope.id } : {}),
        ...(token ? { token } : {}),
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      }
    })()
    return configPromise
  }
}

function scopedProjectDataDecisionScope(
  input: MovScriptDomainRuntimeInput,
  sessionUserId?: string | number,
): { kind: 'user' | 'org'; id: string | number } | undefined {
  if (input.scopeKind && input.scopeId !== undefined) return { kind: input.scopeKind, id: input.scopeId }
  if (input.orgId !== undefined) return { kind: 'org', id: input.orgId }
  const userId = input.userId ?? sessionUserId
  if (userId !== undefined) return { kind: 'user', id: userId }
  return undefined
}

function projectCwdFromInput(input: MovScriptDomainRuntimeInput): string {
  if (input.projectDir) return input.projectDir
  throw new Error('projectDir or cwd is required. The legacy projectId workspace path is no longer supported.')
}
