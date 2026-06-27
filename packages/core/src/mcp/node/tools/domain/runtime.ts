import {
  NodeMovScriptEngineRegistry,
  type NodeMovScriptEngine,
} from '@movscript/engine/node'
import {
  type NodeMovScriptWorkspaceService,
} from '@movscript/workspace/node'
import {
  createProjectServiceClientFromRuntime,
  type ProjectCandidateCommandName,
  type ProjectDecisionStoreConfig,
  type ProjectSourceCommandName,
  type ProjectServiceClient,
} from '@movscript/project'
import {
  createMovScriptScopedProjectDataDecisionStore,
  type MovScriptDecisionStore,
} from '@movscript/workspace/repository'
import { resolveMovScriptBackendSession } from '../../../../backend/node/config.js'
import {
  buildContentSourceWorkspaceData,
  loadContentSourceWorkspaceSnapshotFromEngine,
  type ContentSourceWorkspaceData,
  type ContentSourceWorkspaceSnapshot,
} from '../../../../content/index.js'
import { getMCPAuthToken } from '../focus/store.js'

export interface MovScriptDomainRuntimeInput {
  workspaceDir?: string
  projectDir?: string
  userId?: string | number
  orgId?: string | number
  projectUid?: string
  projectTitle?: string
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
    upsertProjectStandards: (input) => projectService.sourceCommand('upsertProjectStandards', input),
    createSetting: (input) => projectService.sourceCommand('createSetting', input),
    createSettingState: (input) => projectService.sourceCommand('createSettingState', input),
    createAsset: (input) => projectService.sourceCommand('createAsset', input),
    upsertScript: (input) => projectService.sourceCommand('upsertScript', input),
    snapshotScriptVersionFromMarkdown: (input) => projectService.sourceCommand('snapshotScriptVersionFromMarkdown', input),
    createContentUnit: (input) => projectService.sourceCommand('createContentUnit', input),
    writeHierarchyNode: (input) => projectService.sourceCommand(isNamespaceHierarchyWrite(input) ? 'writeNamespaceNode' : 'writeHierarchyNode', input),
    createProduction: (input) => projectService.sourceCommand('createProduction', input),
    createSegment: (input) => projectService.sourceCommand('createSegment', input),
    createSceneMoment: (input) => projectService.sourceCommand('createSceneMoment', input),
    createStoryboard: (input) => projectService.sourceCommand('createStoryboard', input),
    createKeyframe: (input) => projectService.sourceCommand('createKeyframe', input),
    createAudioCue: (input) => projectService.sourceCommand('createAudioCue', input),
    createExpressionUnit: (input) => projectService.sourceCommand('createExpressionUnit', input),
    updateContentUnitEditPrompt: (input) => projectService.sourceCommand('updateContentUnitEditPrompt', input),
    updateEntityTransition: (input) => projectService.sourceCommand('updateEntityTransition', input),
    updateStoryboardTimeline: (input) => projectService.sourceCommand('updateStoryboardTimeline', input),
    deleteEntity: (input) => projectService.sourceCommand('deleteEntity', input).then(() => undefined),
    createContentCandidate: (input) => projectService.candidateCommand('createContentCandidate', input),
    selectContentUnitCandidate: (input) => projectService.candidateCommand('selectContentUnitCandidate', input),
    decideContentUnitCandidate: (input) => projectService.candidateCommand('decideContentUnitCandidate', input),
    readContentUnitGenerationPrompt: async (contentUnitId) => (await projectService.promptContext(contentUnitId)).generationPrompt,
    buildContentUnitBackendPrompt: async (contentUnitId) => (await projectService.promptContext(contentUnitId)).backendPrompt,
    reviewWorkspace: (inspectInput = {}) => projectService.inspectWorkspace(inspectInput),
    inspectWorkspace: (inspectInput = {}) => projectService.inspectWorkspace(inspectInput),
    interpretWorkspace: () => projectService.interpretWorkspace(),
    overviewWorkspace: () => projectService.overviewWorkspace(),
    productionWorkPlan: () => engine.productionWorkPlan(),
    regenerationPlan: () => projectService.regenerationPlan(),
    loadContentWorkspaceSnapshot: () => loadContentSourceWorkspaceSnapshotFromEngine(engine),
    loadContentWorkspace: async () => buildContentSourceWorkspaceData(await loadContentSourceWorkspaceSnapshotFromEngine(engine)),
  }
}

function isNamespaceHierarchyWrite(input: { category?: string; domainCategory?: string; domain_category?: string }): boolean {
  const category = input.category ?? input.domainCategory ?? input.domain_category
  return category === 'timeline_namespace' || category === 'setting_namespace'
}

function createProjectServiceAccessor(projectDir: string, decisionStoreConfig?: ProjectDecisionStoreConfigResolver): {
  inspectWorkspace(input?: { commit?: string; checkpointHash?: string }): Promise<unknown>
  overviewWorkspace(): Promise<unknown>
  interpretWorkspace(): ReturnType<NodeMovScriptEngine['interpret']>
  regenerationPlan(): Promise<unknown>
  sourceCommand(command: ProjectSourceCommandName, input?: unknown): Promise<any>
  candidateCommand(command: ProjectCandidateCommandName, input?: unknown): Promise<any>
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
    regenerationPlan: async () => (await getClient().regenerationPlan({ projectDir })).regenerationPlan,
    sourceCommand: async (command, input = {}) => (await getClient().sourceCommand({
      projectDir,
      command,
      input: sourceCommandInput(input),
    })).result,
    candidateCommand: async (command, input = {}) => {
      const resolvedDecisionStoreConfig = await decisionStoreConfig?.()
      if (!resolvedDecisionStoreConfig) {
        throw new Error('content unit candidate command requires a scoped project data decisionStore')
      }
      return (await getClient().candidateCommand({
        projectDir,
        command,
        input: sourceCommandInput(input),
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

function sourceCommandInput(input: unknown): Record<string, unknown> {
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
  }
}

function runtimeKey(input: MovScriptDomainRuntimeInput): string {
  const projectCwd = projectCwdFromInput(input)
  const session = resolveMovScriptBackendSession({
    workspaceDir: input.workspaceDir,
    userId: input.userId,
  })
  const token = getMCPAuthToken() || session.token || ''
  return [
    projectCwd,
    input.userId ?? '',
    input.orgId ?? '',
    input.projectUid ?? '',
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
    if (!store) throw new Error('content unit candidate command requires a scoped project data decisionStore')
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
  const token = getMCPAuthToken() || session.token
  if (!token) return undefined
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
      const headers = {
        ...(session.userId ? { 'X-User-ID': session.userId } : {}),
        ...(input.orgId !== undefined ? { 'X-Org-ID': String(input.orgId) } : {}),
      }
      return {
        kind: 'scoped-project-data',
        baseUrl: session.baseURL,
        projectUid,
        ...(projectTitle ? { title: projectTitle } : {}),
        ...(input.orgId !== undefined ? { scopeKind: 'org' as const, scopeId: input.orgId } : {}),
        token,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      }
    })()
    return configPromise
  }
}

function projectCwdFromInput(input: MovScriptDomainRuntimeInput): string {
  if (input.projectDir) return input.projectDir
  throw new Error('projectDir or cwd is required. The legacy projectId workspace path is no longer supported.')
}
