import {
  NodeMovScriptEngineRegistry,
  type NodeMovScriptEngine,
} from '@movscript/engine/node'
import {
  createNodeMovScriptWorkspaceFileRepository,
  type NodeMovScriptWorkspaceService,
} from '@movscript/workspace/node'
import {
  createMovScriptScopedProjectDataDecisionStore,
  type MovScriptDecisionStore,
} from '@movscript/workspace/repository'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  inspectMovScriptWorkspace,
  overviewMovScriptWorkspace,
  planMovScriptWorkspaceRegeneration,
} from '@movscript/interpreter/node'
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

export function createMovScriptDomainRuntime(input: MovScriptDomainRuntimeInput): MovScriptDomainRuntime {
  const context = normalizeRuntimeInput(input)
  const cacheKey = runtimeKey(context)
  const projectCwd = projectCwdFromInput(context)
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
  decisionStore?: MovScriptDecisionStore,
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

function createMCPDecisionStore(input: MovScriptDomainRuntimeInput): MovScriptDecisionStore | undefined {
  const session = resolveMovScriptBackendSession({
    workspaceDir: input.workspaceDir,
    userId: input.userId,
  })
  const token = getMCPAuthToken() || session.token
  const projectCwd = projectCwdFromInput(input)
  const manifest = readWorkspaceManifest(projectCwd)
  const projectUid = input.projectUid ?? manifest?.project_uid
  const projectTitle = input.projectTitle ?? manifest?.title
  if (projectUid && token) {
    const headers = {
      ...(session.userId ? { 'X-User-ID': session.userId } : {}),
      ...(input.orgId !== undefined ? { 'X-Org-ID': String(input.orgId) } : {}),
    }
    return createMovScriptScopedProjectDataDecisionStore({
      baseUrl: session.baseURL,
      projectUid,
      ...(projectTitle ? { title: projectTitle } : {}),
      ...(input.orgId !== undefined ? { scopeKind: 'org' as const, scopeId: input.orgId } : {}),
      token,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    })
  }
  return undefined
}

function projectCwdFromInput(input: MovScriptDomainRuntimeInput): string {
  if (input.projectDir) return input.projectDir
  throw new Error('projectDir or cwd is required. The legacy projectId workspace path is no longer supported.')
}

function readWorkspaceManifest(projectCwd: string): { project_uid?: string; title?: string } | undefined {
  try {
    const raw = readFileSync(join(projectCwd, 'workspace.json'), 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      project_uid: stringField(parsed.project_uid),
      title: stringField(parsed.title),
    }
  } catch {
    return undefined
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
