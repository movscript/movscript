import {
  createMovScriptWorkspaceService,
  type MovScriptWorkspaceService,
} from '../service.js'
import type { MovScriptDecisionStore } from '../repository/index.js'
import { createNodeMovScriptWorkspaceFileRepository } from './fileRepository.js'
import { resolve } from 'node:path'

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
  const projectDir = resolve(input.projectDir ?? input.workspaceDir ?? process.cwd())
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
