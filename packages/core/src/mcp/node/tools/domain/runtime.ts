import { createNodeMovScriptEngine, type NodeMovScriptEngine } from '@movscript/engine/node'
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
}

export function createMovScriptDomainRuntime(input: MovScriptDomainRuntimeInput): MovScriptDomainRuntime {
  const projectCwd = resolveMovScriptProjectCwd(input)
  const decisionStore = createMCPDecisionStore(input)
  const engine = createNodeMovScriptEngine({ projectDir: projectCwd, decisionStore })
  const fileRepository = createNodeMovScriptWorkspaceFileRepository(projectCwd)
  return {
    ...engine,
    ...engine.workspaceService,
    projectCwd,
    projectDir: projectCwd,
    decisionStore,
    reviewWorkspace: (inspectInput = {}) => engine.review(inspectInput),
    inspectWorkspace: (inspectInput = {}) => inspectMovScriptWorkspace({ fileRepository, decisionStore, ...inspectInput }),
    interpretWorkspace: () => engine.interpret(),
    overviewWorkspace: () => overviewMovScriptWorkspace({ fileRepository, decisionStore }),
    productionWorkPlan: () => engine.productionWorkPlan(),
    regenerationPlan: () => planMovScriptWorkspaceRegeneration({ fileRepository, decisionStore }),
  }
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
