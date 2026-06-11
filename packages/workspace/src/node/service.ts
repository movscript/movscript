import {
  createMovScriptWorkspaceService,
  type MovScriptWorkspaceService,
} from '../service.js'
import { createNodeMovScriptWorkspaceFileRepository } from './fileRepository.js'
import { resolveMovScriptProjectWorkspacePaths } from './paths.js'

export interface NodeMovScriptWorkspaceServiceInput {
  projectDir?: string
  workspaceDir?: string
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
    now: input.now,
  })
  return {
    ...service,
    projectDir,
  }
}
