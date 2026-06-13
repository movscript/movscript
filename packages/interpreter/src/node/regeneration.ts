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
  resourceId?: number
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
  const affectedContentUnits = dedupeTargets([
    ...input.review.productionImpacts
      .filter((impact) => impact.contentUnit)
      .map((impact) => targetFromProductionImpact(impact, input.review.staleSelections)),
    ...input.review.staleSelections
      .map(targetFromStaleSelection)
      .filter((target): target is MovScriptRegenerationPlanTarget => target !== undefined),
  ])
  const promptBundles = affectedContentUnits.filter((target) => {
    return target.stale === true || target.reasons.some((reason) => reason.includes('reference') || reason.includes('selection') || reason.includes('content_unit'))
  })
  const previewTimelines = previewTimelinesFromProductionImpacts(input.review.productionImpacts)
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
    affectedContentUnits,
    promptBundles,
    previewTimelines,
    summary: {
      changedEntities: input.review.semanticChanges.length,
      affectedContentUnits: affectedContentUnits.length,
      staleContentUnits: input.review.staleSelections.length,
      promptBundles: promptBundles.length,
      previewTimelines: previewTimelines.length,
    },
  }
}

function targetFromProductionImpact(
  impact: MovScriptRegenerationReviewInput['productionImpacts'][number],
  staleSelections: readonly unknown[],
): MovScriptRegenerationPlanTarget {
  const staleSelection = staleSelections
    .map(selectionRecord)
    .find((selection) => sameOptionalId(selection?.contentUnitId, impact.contentUnit?.id)
      || sameOptionalPath(selection?.contentUnitPath, impact.contentUnit?.path))
  return pruneUndefined({
    contentUnitId: impact.contentUnit?.id,
    contentUnitPath: impact.contentUnit?.path,
    reasons: [
      impact.kind,
      ...impact.sourceChanges.map((change) => change.businessKind),
    ].filter(isString),
    selected: staleSelection?.selected,
    stale: staleSelection?.stale,
    candidateId: staleSelection?.candidateId,
    resourceId: staleSelection?.resourceId,
    staleReasons: staleSelection?.staleReasons,
  })
}

function targetFromStaleSelection(selection: unknown): MovScriptRegenerationPlanTarget | undefined {
  const record = selectionRecord(selection)
  if (!record) return undefined
  return pruneUndefined({
    contentUnitId: record.contentUnitId,
    contentUnitPath: record.contentUnitPath,
    reasons: ['selection_stale', ...(record.staleReasons ?? [])],
    selected: record.selected,
    stale: record.stale,
    candidateId: record.candidateId,
    resourceId: record.resourceId,
    staleReasons: record.staleReasons,
  })
}

function previewTimelinesFromProductionImpacts(
  impacts: MovScriptRegenerationReviewInput['productionImpacts'],
): MovScriptRegenerationPlanResult['previewTimelines'] {
  const timelineEntityKinds = new Set(['production', 'segment', 'scene_moment', 'shot', 'storyboard', 'keyframe', 'audio_cue', 'expression_unit', 'content_unit'])
  const seen = new Set<string>()
  const out: MovScriptRegenerationPlanResult['previewTimelines'] = []
  for (const impact of impacts) {
    for (const change of impact.sourceChanges) {
      if (!timelineEntityKinds.has(change.entity.kind)) continue
      const path = stringField(change.sourceChange.path)
      if (!path) continue
      const productionId = productionIdFromPath(path)
      const key = `${productionId ?? ''}:${path}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(pruneUndefined({
        productionId,
        path,
        reasons: [impact.kind, change.businessKind].filter(isString),
      }))
    }
  }
  return out
}

function dedupeTargets(targets: MovScriptRegenerationPlanTarget[]): MovScriptRegenerationPlanTarget[] {
  const merged = new Map<string, MovScriptRegenerationPlanTarget>()
  for (const target of targets) {
    const key = String(target.contentUnitId ?? target.contentUnitPath ?? '')
    if (!key) continue
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, {
        ...target,
        reasons: [...new Set(target.reasons)].sort(),
      })
      continue
    }
    merged.set(key, pruneUndefined({
      ...existing,
      ...target,
      reasons: [...new Set([...existing.reasons, ...target.reasons])].sort(),
      staleReasons: [...new Set([...(existing.staleReasons ?? []), ...(target.staleReasons ?? [])])].sort(),
    }))
  }
  return [...merged.values()].sort((left, right) => {
    return String(left.contentUnitId ?? left.contentUnitPath ?? '').localeCompare(String(right.contentUnitId ?? right.contentUnitPath ?? ''))
  })
}

function selectionRecord(value: unknown): {
  contentUnitId?: string | number
  contentUnitPath?: string
  selected?: boolean
  stale?: boolean
  candidateId?: string | number
  resourceId?: number
  staleReasons?: string[]
} | undefined {
  if (!isRecord(value)) return undefined
  return pruneUndefined({
    contentUnitId: idField(value.contentUnitId),
    contentUnitPath: stringField(value.contentUnitPath),
    selected: typeof value.selected === 'boolean' ? value.selected : undefined,
    stale: typeof value.stale === 'boolean' ? value.stale : undefined,
    candidateId: idField(value.candidateId),
    resourceId: resourceIdField(value.resourceId),
    staleReasons: Array.isArray(value.staleReasons) ? value.staleReasons.filter(isString) : undefined,
  })
}

function productionIdFromPath(path: string): string | undefined {
  const parts = normalizeWorkspacePath(path).split('/')
  return parts[0] === 'productions' ? parts[1] : undefined
}

function sameOptionalId(left: unknown, right: unknown): boolean {
  return left !== undefined && right !== undefined && String(left) === String(right)
}

function sameOptionalPath(left: unknown, right: unknown): boolean {
  return typeof left === 'string'
    && typeof right === 'string'
    && normalizeWorkspacePath(left).replace(/\/[^/]+$/, '') === normalizeWorkspacePath(right).replace(/\/[^/]+$/, '')
}

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function resourceIdField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }
  return undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function normalizeWorkspacePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/').replace(/\/$/, '')
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = item
  }
  return out as T
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
