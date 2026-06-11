export type ProductionExpressionUnitType = 'dialogue' | 'action' | 'narration' | 'subtitle' | 'visual'

export interface ProductionExpressionUnitSavePayload {
  scene_moment_id?: number
  script_block_id?: number | null
  order?: number
  kind: ProductionExpressionUnitType
  speaker: string
  text: string
  note: string
  intent: string
}

export interface ProductionExpressionUnitEntityPayload {
  [key: string]: unknown
  scene_moment_id: number | null
  script_block_id: number | null
  order: number
  kind: ProductionExpressionUnitType
  speaker: string
  text: string
  note: string
  intent: string
}

export interface ProductionExpressionUnitKindRecord {
  [key: string]: unknown
  kind?: unknown
}

export interface ProductionOrchestrationVisibilityRecord {
  [key: string]: unknown
  __delete?: unknown
  deleted?: unknown
}

export const productionExpressionUnitTypes = [
  'dialogue',
  'action',
  'narration',
  'subtitle',
  'visual',
] as const satisfies readonly ProductionExpressionUnitType[]

export function normalizeExpressionUnitType(value: unknown): ProductionExpressionUnitType {
  return productionExpressionUnitTypes.some((type) => type === value) ? value as ProductionExpressionUnitType : 'action'
}

export function normalizeExpressionUnitWorkspace(
  workspace: ProductionExpressionUnitSavePayload,
): ProductionExpressionUnitSavePayload {
  return {
    scene_moment_id: workspace.scene_moment_id,
    script_block_id: workspace.script_block_id ?? null,
    order: workspace.order,
    kind: normalizeExpressionUnitType(workspace.kind),
    speaker: workspace.speaker.trim(),
    text: workspace.text.trim(),
    note: workspace.note.trim(),
    intent: workspace.intent.trim(),
  }
}

export function expressionUnitWorkspaceEquals(
  a: ProductionExpressionUnitSavePayload,
  b: ProductionExpressionUnitSavePayload,
): boolean {
  return normalizeExpressionUnitType(a.kind) === normalizeExpressionUnitType(b.kind)
    && a.speaker.trim() === b.speaker.trim()
    && a.text.trim() === b.text.trim()
    && a.note.trim() === b.note.trim()
    && a.intent.trim() === b.intent.trim()
}

export function expressionUnitPayload(
  workspace: ProductionExpressionUnitSavePayload,
): ProductionExpressionUnitEntityPayload {
  const normalized = normalizeExpressionUnitWorkspace(workspace)
  return {
    scene_moment_id: normalized.scene_moment_id ?? null,
    script_block_id: normalized.script_block_id ?? null,
    order: normalized.order ?? 0,
    kind: normalized.kind,
    speaker: normalized.speaker,
    text: normalized.text,
    note: normalized.note,
    intent: normalized.intent,
  }
}

export function expressionUnitTypeFromScriptBlock(
  block: ProductionExpressionUnitKindRecord,
): ProductionExpressionUnitType {
  switch (block.kind) {
    case 'dialogue':
      return 'dialogue'
    case 'transition':
    case 'note':
    case 'parenthetical':
      return 'action'
    case 'scene_heading':
    case 'action':
    default:
      return 'action'
  }
}

export function expressionUnitTypeFromContentUnit(
  unit: ProductionExpressionUnitKindRecord,
): ProductionExpressionUnitType {
  switch (unit.kind) {
    case 'voiceover':
      return 'narration'
    case 'dialogue_audio':
      return 'dialogue'
    case 'subtitle':
    case 'caption_card':
      return 'subtitle'
    case 'shot':
      return 'visual'
    case 'sound':
    case 'music_beat':
    case 'transition':
    default:
      return 'action'
  }
}

export function isVisibleOrchestrationRecord(record: ProductionOrchestrationVisibilityRecord): boolean {
  return !Boolean(record.__delete ?? record.deleted)
}

export function isPersonReference(reference: ProductionExpressionUnitKindRecord): boolean {
  return ['person', 'character'].includes(normalizedKind(reference))
}

export function isPlaceReference(reference: ProductionExpressionUnitKindRecord): boolean {
  return ['place', 'location', 'scene'].includes(normalizedKind(reference))
}

function normalizedKind(record: ProductionExpressionUnitKindRecord): string {
  return String(record.kind ?? '').trim().toLowerCase()
}
