import {
  createMovScriptWorkspaceService,
  type MovScriptWorkspaceService,
} from '../service.js'
import type { MovScriptDecisionStore } from '../repository/index.js'
import { createNodeMovScriptWorkspaceFileRepository } from './fileRepository.js'
import { resolveMovScriptProjectWorkspacePaths } from './paths.js'

export interface NodeMovScriptWorkspaceServiceInput {
  projectDir?: string
  workspaceDir?: string
  decisionStore?: MovScriptDecisionStore
  now?: () => Date
}

export type NodeMovScriptWorkspaceService = MovScriptWorkspaceService & {
  projectDir: string
}

export function createNodeMovScriptWorkspaceService(
  input: NodeMovScriptWorkspaceServiceInput = {},
): NodeMovScriptWorkspaceService {
  const projectDir = input.projectDir ?? resolveMovScriptProjectWorkspacePaths({
    workspaceDir: input.workspaceDir,
  }).projectDir
  const fileRepository = createNodeMovScriptWorkspaceFileRepository(projectDir)
  const service = createMovScriptWorkspaceService({
    fileRepository,
    decisionStore: input.decisionStore,
    now: input.now,
  })
  return {
    ...service,
    projectDir,
  }
}
