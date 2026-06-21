import type {
  MovScriptSemanticChange,
} from '../semanticChanges/index.js'

export type MovScriptProductionImpactSemanticChange = MovScriptSemanticChange

export interface MovScriptProductionImpactSelection {
  contentUnitId?: string | number
  contentUnitPath?: string
}

export interface MovScriptProductionImpactArtifactSource {
  impactReport: {
    changedEntities: readonly MovScriptProductionImpactChangedEntity[]
  }
}

export interface MovScriptProductionImpactChangedEntity {
  entityKind: string
  id?: string | number
  path: string
  affectedContentUnits: readonly MovScriptProductionImpactEntityRef[]
}

export interface MovScriptProductionImpactEntityRef {
  entityKind?: string
  id?: string | number
  path?: string
}

export interface MovScriptProductionImpact {
  contentUnit?: {
    id?: string | number
    path?: string
  }
  kind: 'self_selection_stale' | 'downstream_reference_changed' | 'diagnostic_only'
  businessKinds: MovScriptProductionImpactSemanticChange['businessKind'][]
  businessImpacts: string[]
  sourceChanges: MovScriptProductionImpactSemanticChange[]
  reshootRequired: false
}

export function productionImpactsFromSemanticChanges(
  semanticChanges: readonly MovScriptProductionImpactSemanticChange[],
  artifacts: MovScriptProductionImpactArtifactSource,
  staleSelections: readonly MovScriptProductionImpactSelection[],
): MovScriptProductionImpact[] {
  const impacts: MovScriptProductionImpact[] = []
  const impactBySource = new Map(artifacts.impactReport.changedEntities.map((entity) => [
    entityImpactKey(entity.entityKind, entity.id, entity.path),
    entity,
  ]))

  for (const change of semanticChanges) {
    if (change.propagation === 'none') {
      impacts.push({
        kind: 'diagnostic_only',
        businessKinds: [change.businessKind],
        businessImpacts: [businessImpactLabel(change.businessKind)],
        sourceChanges: [change],
        reshootRequired: false,
      })
      continue
    }

    const staleMatches = staleSelections.filter((selection) => {
      if (change.entity.kind === 'content_unit') {
        return sameOptionalId(selection.contentUnitId, change.entity.id)
          || sameOptionalPath(selection.contentUnitPath, change.sourceChange.path)
      }
      const sourceImpact = impactBySource.get(entityImpactKey(change.entity.kind, change.entity.id, change.sourceChange.path))
      return sourceImpact?.affectedContentUnits.some((contentUnit) => {
        return sameOptionalId(contentUnit.id, selection.contentUnitId)
          || sameOptionalPath(contentUnit.path, selection.contentUnitPath)
      }) ?? false
    })

    if (change.propagation === 'self') {
      for (const selection of staleMatches) {
        impacts.push({
          contentUnit: {
            ...(selection.contentUnitId !== undefined ? { id: selection.contentUnitId } : {}),
            ...(selection.contentUnitPath !== undefined ? { path: selection.contentUnitPath } : {}),
          },
          kind: 'self_selection_stale',
          businessKinds: [change.businessKind],
          businessImpacts: [businessImpactLabel(change.businessKind)],
          sourceChanges: [change],
          reshootRequired: false,
        })
      }
      if (staleMatches.length === 0) {
        impacts.push({
          kind: 'diagnostic_only',
          businessKinds: [change.businessKind],
          businessImpacts: [businessImpactLabel(change.businessKind)],
          sourceChanges: [change],
          reshootRequired: false,
        })
      }
      continue
    }

    const sourceImpact = impactBySource.get(entityImpactKey(change.entity.kind, change.entity.id, change.sourceChange.path))
    const affectedContentUnits = sourceImpact?.affectedContentUnits ?? []
    for (const contentUnit of affectedContentUnits) {
      impacts.push({
        contentUnit: {
          ...(contentUnit.id !== undefined ? { id: contentUnit.id } : {}),
          ...(contentUnit.path !== undefined ? { path: entityDir(contentUnit.path) } : {}),
        },
        kind: 'downstream_reference_changed',
        businessKinds: [change.businessKind],
        businessImpacts: [businessImpactLabel(change.businessKind)],
        sourceChanges: [change],
        reshootRequired: false,
      })
    }
    if (affectedContentUnits.length === 0) {
      impacts.push({
        kind: 'diagnostic_only',
        businessKinds: [change.businessKind],
        businessImpacts: [businessImpactLabel(change.businessKind)],
        sourceChanges: [change],
        reshootRequired: false,
      })
    }
  }

  return dedupeProductionImpacts(impacts)
}

function entityImpactKey(entityKind: string, id: string | number | undefined, path: string | undefined): string {
  return `${entityKind}:${String(id ?? '')}:${path ? entityDir(path) : ''}`
}

function sameOptionalId(left: unknown, right: unknown): boolean {
  return left !== undefined && right !== undefined && String(left) === String(right)
}

function sameOptionalPath(left: unknown, right: unknown): boolean {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  return entityDir(left) === entityDir(right)
    || normalizeWorkspacePath(left) === normalizeWorkspacePath(right)
}

function dedupeProductionImpacts(impacts: MovScriptProductionImpact[]): MovScriptProductionImpact[] {
  const seen = new Set<string>()
  return impacts.filter((impact) => {
    const source = impact.sourceChanges[0]
    const key = [
      impact.kind,
      impact.contentUnit?.id ?? impact.contentUnit?.path ?? '',
      source?.entity.kind ?? '',
      source?.entity.id ?? '',
      source?.businessKind ?? '',
      source?.sourceChange.path ?? '',
      source?.fields.join(',') ?? '',
    ].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function entityDir(path: string): string {
  return normalizeWorkspacePath(path).replace(/\/[^/]+$/, '')
}

function normalizeWorkspacePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/').replace(/\/$/, '')
}

function businessImpactLabel(businessKind: MovScriptProductionImpactSemanticChange['businessKind']): string {
  const labels: Record<MovScriptProductionImpactSemanticChange['businessKind'], string> = {
    metadata_changed: 'Metadata changed',
    semantic_input_changed: 'Semantic input changed',
    reference_changed: 'Reference changed',
    selection_changed: 'Selection changed',
    sequence_reordered: 'Sequence reordered',
    expression_unit_changed: 'Expression unit changed',
    storyboard_changed: 'Storyboard changed',
    keyframe_changed: 'Keyframe changed',
    content_unit_changed: 'Content unit changed',
    project_context_changed: 'Project context changed',
    production_structure_changed: 'Production structure changed',
    domain_entity_changed: 'Domain entity changed',
  }
  return labels[businessKind]
}
