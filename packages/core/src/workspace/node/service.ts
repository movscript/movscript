import {
  createMovScriptWorkspaceService,
  type MovScriptWorkspaceService,
} from '../service.js'
import {
  buildMovScriptWorkspace,
  reviewMovScriptBuildWorkspace,
  type MovScriptWorkspaceBuildResult,
  type MovScriptWorkspaceReviewResult,
} from './build.js'
import { createNodeMovScriptWorkspaceFileRepository } from './fileRepository.js'
import { resolveMovScriptProjectWorkspacePaths } from './paths.js'

export interface NodeMovScriptWorkspaceServiceInput {
  projectDir?: string
  workspaceDir?: string
  userId?: string | number
  orgId?: string | number
  projectId?: string | number
  now?: () => Date
}

export type NodeMovScriptWorkspaceService = Omit<MovScriptWorkspaceService, 'reviewWorkspace' | 'buildWorkspace'> & {
  projectDir: string
  reviewWorkspace(): Promise<MovScriptWorkspaceReviewResult>
  buildWorkspace(): Promise<MovScriptWorkspaceBuildResult>
}

export function createNodeMovScriptWorkspaceService(
  input: NodeMovScriptWorkspaceServiceInput = {},
): NodeMovScriptWorkspaceService {
  const projectDir = input.projectDir ?? resolveMovScriptProjectWorkspacePaths({
    workspaceDir: input.workspaceDir,
    userId: input.userId,
    orgId: input.orgId,
    projectId: input.projectId,
  }).projectDir
  const fileRepository = createNodeMovScriptWorkspaceFileRepository(projectDir)
  const service = createMovScriptWorkspaceService({
    fileRepository,
    now: input.now,
    reviewWorkspace: () => reviewMovScriptBuildWorkspace({
      fileRepository,
      ...(input.now ? { now: input.now() } : {}),
    }),
    buildWorkspace: () => buildMovScriptWorkspace({
      fileRepository,
      ...(input.now ? { now: input.now() } : {}),
    }),
  })
  return {
    ...service,
    projectDir,
    reviewWorkspace: service.reviewWorkspace as () => Promise<MovScriptWorkspaceReviewResult>,
    buildWorkspace: service.buildWorkspace as () => Promise<MovScriptWorkspaceBuildResult>,
  }
}
