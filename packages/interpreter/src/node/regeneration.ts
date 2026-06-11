import type {
  MovScriptImpactReportArtifact,
} from '../artifacts/index.js'
import type {
  MovScriptSemanticChange,
} from '../semanticChanges/index.js'
import type {
  MovScriptWorkspaceFileRepository,
} from '@movscript/workspace/repository'
import {
  MOVSCRIPT_INTERPRET_MANIFESTS_DIR,
} from '@movscript/workspace/layout'
import {
  loadWorkspaceFileSnapshots,
} from './sourceStore.js'

export interface LatestInterpretManifest {
  path: string
  manifest: {
    schema: 'movscript.workspace-interpret.v1'
    interpretationId: string
    interpretedAt: string
    output: {
      impactReportPath?: string
    }
  }
}

export interface MovScriptRegenerationReviewInput {
  productionImpacts: Array<{
    kind: string
    contentUnit?: {
      id?: string | number
      path?: string
    }
    sourceChanges: MovScriptSemanticChange[]
  }>
  semanticChanges: readonly unknown[]
  staleSelections: readonly unknown[]
}

export interface MovScriptRegenerationPlanTarget {
  contentUnitId?: string | number
  contentUnitPath?: string
  reasons: string[]
  selected?: boolean
  stale?: boolean
  candidateId?: string | number
  resourceId?: string | number
  staleReasons?: string[]
}

export interface MovScriptRegenerationPlanResult {
  schema: 'movscript.workspace-regeneration-plan.v1'
  operation: 'regen-plan'
  createdAt: string
  status: 'ready' | 'no_interpretation'
  interpret?: {
    interpretationId: string
    interpretedAt: string
    manifestPath: string
    impactReportPath?: string
  }
  changedEntities: MovScriptImpactReportArtifact['changedEntities']
  affectedContentUnits: MovScriptRegenerationPlanTarget[]
  promptBundles: MovScriptRegenerationPlanTarget[]
  previewTimelines: Array<{
    productionId?: string | number
    path?: string
    reasons: string[]
  }>
  summary: {
    changedEntities: number
    affectedContentUnits: number
    staleContentUnits: number
    promptBundles: number
    previewTimelines: number
  }
}

export async function loadLatestInterpretManifest(
  fileRepository: MovScriptWorkspaceFileRepository,
): Promise<LatestInterpretManifest | undefined> {
  const files = await loadWorkspaceFileSnapshots(fileRepository, MOVSCRIPT_INTERPRET_MANIFESTS_DIR)
  const manifests = (await Promise.all(files
    .filter((file) => file.path.endsWith('.json'))
    .map(async (file): Promise<LatestInterpretManifest | undefined> => {
      const manifest = parseWorkspaceDocument(file.path, file.content)
      if (!isInterpretManifest(manifest)) return undefined
      return { path: file.path, manifest }
    })))
    .filter((item): item is LatestInterpretManifest => item !== undefined)
  return manifests.sort((left, right) => {
    return right.manifest.interpretedAt.localeCompare(left.manifest.interpretedAt)
      || right.manifest.interpretationId.localeCompare(left.manifest.interpretationId)
  })[0]
}

export function deriveV1RegenerationPlan(input: {
  review: MovScriptRegenerationReviewInput
  latestInterpretation?: LatestInterpretManifest
  createdAt: string
}): MovScriptRegenerationPlanResult {
  return {
    schema: 'movscript.workspace-regeneration-plan.v1',
    operation: 'regen-plan',
    createdAt: input.createdAt,
    status: 'ready',
    ...(input.latestInterpretation ? {
      interpret: {
        interpretationId: input.latestInterpretation.manifest.interpretationId,
        interpretedAt: input.latestInterpretation.manifest.interpretedAt,
        manifestPath: input.latestInterpretation.path,
        impactReportPath: input.latestInterpretation.manifest.output.impactReportPath,
      },
    } : {}),
    changedEntities: input.review.productionImpacts.map((impact) => ({
      entityKind: impact.sourceChanges[0]?.entity.kind ?? 'unknown',
      id: impact.sourceChanges[0]?.entity.id,
      path: impact.sourceChanges[0]?.sourceChange.path ?? '',
      state: impact.sourceChanges[0]?.sourceChange.operation ?? 'modified',
      businessImpacts: [...new Set(impact.sourceChanges
        .map((change) => change.businessKind)
        .filter((kind) => typeof kind === 'string'))].sort(),
      editorImpacts: [impact.kind],
      affectedContentUnits: impact.contentUnit ? [{
        entityKind: 'content_unit',
        id: impact.contentUnit.id,
        path: impact.contentUnit.path,
      }] : [],
      staleMarkers: [],
    })),
    affectedContentUnits: [],
    promptBundles: [],
    previewTimelines: [],
    summary: {
      changedEntities: input.review.semanticChanges.length,
      affectedContentUnits: 0,
      staleContentUnits: input.review.staleSelections.length,
      promptBundles: 0,
      previewTimelines: 0,
    },
  }
}

function parseWorkspaceDocument(path: string, content: string): unknown {
  if (!path.endsWith('.json')) return content
  try {
    return JSON.parse(content) as unknown
  } catch {
    return undefined
  }
}

function isInterpretManifest(value: unknown): value is LatestInterpretManifest['manifest'] {
  return isRecord(value)
    && value.schema === 'movscript.workspace-interpret.v1'
    && typeof value.interpretationId === 'string'
    && typeof value.interpretedAt === 'string'
    && isRecord(value.output)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
