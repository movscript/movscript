import {
  NodeMovScriptEngineRegistry,
  type NodeMovScriptEngine,
} from '@movscript/engine/node'
import {
  createNodeMovScriptWorkspaceFileRepository,
  type NodeMovScriptWorkspaceService,
} from '@movscript/workspace/node'
import {
  createMovScriptBackendDecisionStore,
  type MovScriptDecisionStore,
} from '@movscript/workspace/repository'
import {
  inspectMovScriptWorkspace,
  overviewMovScriptWorkspace,
  planMovScriptWorkspaceRegeneration,
} from '@movscript/interpreter/node'
import { resolveMovScriptBackendSession } from '../../../../backend/node/config.js'
import { resolveMovScriptProjectCwd } from '../../../../workspace/node/index.js'
import {
  buildContentSourceWorkspaceData,
  loadContentSourceWorkspaceSnapshotFromEngine,
  type ContentSourceWorkspaceData,
  type ContentSourceWorkspaceSnapshot,
} from '../../../../content/index.js'
import { getMCPAuthToken } from '../focus/store.js'

export interface MovScriptDomainRuntimeInput {
  workspaceDir?: string
  userId?: string | number
  orgId?: string | number
  projectId?: string | number
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

export function createMovScriptDomainRuntime(input: MovScriptDomainRuntimeInput): MovScriptDomainRuntime {
  const context = normalizeRuntimeInput(input)
  const cacheKey = runtimeKey(context)
  const projectCwd = resolveMovScriptProjectCwd(context)
  const decisionStore = createMCPDecisionStore(context)
  const engine = movScriptDomainEngineRegistry.get({
    cacheKey,
    projectDir: projectCwd,
    decisionStore,
  })
  return createMovScriptDomainRuntimeFromEngine(engine, projectCwd, decisionStore)
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
  decisionStore: MovScriptDecisionStore,
): MovScriptDomainRuntime {
  const fileRepository = createNodeMovScriptWorkspaceFileRepository(projectCwd)
  return {
    ...engine.workspaceService,
    ...engine,
    projectCwd,
    projectDir: projectCwd,
    decisionStore,
    reviewWorkspace: (inspectInput = {}) => engine.review(inspectInput),
    inspectWorkspace: (inspectInput = {}) => inspectMovScriptWorkspace({ fileRepository, decisionStore, ...inspectInput }),
    interpretWorkspace: () => engine.interpret(),
    overviewWorkspace: () => overviewMovScriptWorkspace({ fileRepository, decisionStore }),
    productionWorkPlan: () => engine.productionWorkPlan(),
    regenerationPlan: () => planMovScriptWorkspaceRegeneration({ fileRepository, decisionStore }),
    loadContentWorkspaceSnapshot: () => loadContentSourceWorkspaceSnapshotFromEngine(engine),
    loadContentWorkspace: async () => buildContentSourceWorkspaceData(await loadContentSourceWorkspaceSnapshotFromEngine(engine)),
  }
}

function normalizeRuntimeInput(input: MovScriptDomainRuntimeInput): MovScriptDomainRuntimeInput {
  return {
    ...(input.workspaceDir !== undefined ? { workspaceDir: input.workspaceDir } : {}),
    ...(input.userId !== undefined ? { userId: input.userId } : {}),
    ...(input.orgId !== undefined ? { orgId: input.orgId } : {}),
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
  }
}

function runtimeKey(input: MovScriptDomainRuntimeInput): string {
  const projectCwd = resolveMovScriptProjectCwd(input)
  const session = resolveMovScriptBackendSession({
    workspaceDir: input.workspaceDir,
    userId: input.userId,
  })
  const token = getMCPAuthToken() || session.token || ''
  return [
    projectCwd,
    input.userId ?? '',
    input.orgId ?? '',
    input.projectId ?? '',
    session.baseURL,
    session.userId ?? '',
    token,
  ].map((part) => String(part)).join('\u001f')
}

function createMCPDecisionStore(input: MovScriptDomainRuntimeInput): MovScriptDecisionStore {
  if (input.projectId === undefined) {
    throw new Error('projectId is required for backend decision storage')
  }
  const session = resolveMovScriptBackendSession({
    workspaceDir: input.workspaceDir,
    userId: input.userId,
  })
  const token = getMCPAuthToken() || session.token
  return createMovScriptBackendDecisionStore({
    baseUrl: session.baseURL,
    projectId: input.projectId,
    ...(token ? { token } : {}),
    ...(session.userId ? { headers: { 'X-User-ID': session.userId } } : {}),
  })
}
