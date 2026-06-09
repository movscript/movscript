import { createNodeMovScriptEngine, type NodeMovScriptEngine } from '@movscript/engine/node'
import {
  createNodeMovScriptWorkspaceFileRepository,
  type NodeMovScriptWorkspaceService,
} from '@movscript/workspace/node'
import {
  inspectMovScriptWorkspace,
  overviewMovScriptWorkspace,
  planMovScriptWorkspaceRegeneration,
} from '@movscript/compiler/node'
import { resolveMovScriptProjectCwd } from '../../../../workspace/node/index.js'

export interface MovScriptDomainRuntimeInput {
  workspaceDir?: string
  userId?: string | number
  orgId?: string | number
  projectId?: string | number
}

export type MovScriptDomainRuntime = NodeMovScriptEngine & NodeMovScriptWorkspaceService & {
  projectCwd: string
  projectDir: string
  reviewWorkspace(): Promise<unknown>
  buildWorkspace(): Promise<unknown>
  inspectWorkspace(): Promise<unknown>
  compileWorkspace(): ReturnType<NodeMovScriptEngine['compile']>
  overviewWorkspace(): Promise<unknown>
  regenerationPlan(): Promise<unknown>
}

export function createMovScriptDomainRuntime(input: MovScriptDomainRuntimeInput): MovScriptDomainRuntime {
  const projectCwd = resolveMovScriptProjectCwd(input)
  const engine = createNodeMovScriptEngine({ projectDir: projectCwd })
  const fileRepository = createNodeMovScriptWorkspaceFileRepository(projectCwd)
  return {
    ...engine,
    ...engine.workspaceService,
    projectCwd,
    projectDir: projectCwd,
    reviewWorkspace: () => engine.review(),
    buildWorkspace: () => engine.compile(),
    inspectWorkspace: () => inspectMovScriptWorkspace({ fileRepository }),
    compileWorkspace: () => engine.compile(),
    overviewWorkspace: () => overviewMovScriptWorkspace({ fileRepository }),
    regenerationPlan: () => planMovScriptWorkspaceRegeneration({ fileRepository }),
  }
}
