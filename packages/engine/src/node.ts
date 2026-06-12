import {
  createNodeMovScriptWorkspaceFileRepository,
  createNodeMovScriptWorkspaceService,
  type NodeMovScriptWorkspaceService,
  type NodeMovScriptWorkspaceServiceInput,
} from '@movscript/workspace/node'
import {
  interpretMovScriptWorkspace,
  inspectMovScriptWorkspace,
  overviewMovScriptWorkspace,
  planMovScriptWorkspaceRegeneration,
  reviewMovScriptWorkspace,
} from '@movscript/interpreter/node'
import {
  deriveContentUnitArtifact,
  deriveMovScriptWorkspaceArtifacts,
} from '@movscript/interpreter/artifacts'
import {
  createMovScriptEngine,
  type MovScriptEngine,
  type MovScriptEngineOptions,
} from './index.js'

export interface NodeMovScriptEngineInput extends NodeMovScriptWorkspaceServiceInput {
  publish?: MovScriptEngineOptions['publish']
}

export type NodeMovScriptEngine = MovScriptEngine & {
  readonly projectDir: string
  readonly workspaceService: NodeMovScriptWorkspaceService
}

export function createNodeMovScriptEngine(input: NodeMovScriptEngineInput = {}): NodeMovScriptEngine {
  const workspaceService = createNodeMovScriptWorkspaceService(input)
  const fileRepository = createNodeMovScriptWorkspaceFileRepository(workspaceService.projectDir)
  const engine = createMovScriptEngine({
    workspaceService,
    overviewWorkspace: () => overviewMovScriptWorkspace({
      fileRepository,
      decisionStore: input.decisionStore,
      ...(input.now ? { now: input.now() } : {}),
    }),
    inspectWorkspace: () => inspectMovScriptWorkspace({
      fileRepository,
      decisionStore: input.decisionStore,
      ...(input.now ? { now: input.now() } : {}),
    }),
    reviewWorkspace: () => reviewMovScriptWorkspace({
      fileRepository,
      decisionStore: input.decisionStore,
      ...(input.now ? { now: input.now() } : {}),
    }),
    interpretWorkspace: () => interpretMovScriptWorkspace({
      fileRepository,
      decisionStore: input.decisionStore,
      ...(input.now ? { now: input.now() } : {}),
    }),
    regenerationPlan: () => planMovScriptWorkspaceRegeneration({
      fileRepository,
      decisionStore: input.decisionStore,
      ...(input.now ? { now: input.now() } : {}),
    }),
    async deriveContentUnitArtifact(contentUnitId) {
      const index = await workspaceService.loadIndex()
      const contentUnit = index.byKind.get('content_unit')?.find((entity) => String(entity.id) === String(contentUnitId))
      if (!contentUnit) throw new Error(`content_unit not found: ${String(contentUnitId)}`)
      const now = input.now?.() ?? new Date()
      return deriveContentUnitArtifact(index, contentUnit, { createdAt: now.toISOString() })
    },
    async deriveArtifacts(artifactInput = {}) {
      const now = input.now?.() ?? new Date()
      const createdAt = artifactInput.createdAt ?? now.toISOString()
      const interpretationId = artifactInput.interpretationId ?? `engine_${createdAt.replace(/[-:.TZ]/g, '')}`
      return deriveMovScriptWorkspaceArtifacts({
        index: await workspaceService.loadIndex(),
        changedEntities: [],
        interpretationId,
        createdAt,
      })
    },
    ...(input.publish ? { publish: input.publish } : {}),
  })
  return {
    ...engine,
    projectDir: workspaceService.projectDir,
    workspaceService,
  }
}
