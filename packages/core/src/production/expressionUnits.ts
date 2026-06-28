export type ProductionExpressionUnitType = 'visual' | 'voice' | 'subtitle' | 'audio'

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
  'visual',
  'voice',
  'subtitle',
  'audio',
] as const satisfies readonly ProductionExpressionUnitType[]

export function normalizeExpressionUnitType(value: unknown): ProductionExpressionUnitType {
  if (productionExpressionUnitTypes.some((type) => type === value)) return value as ProductionExpressionUnitType
  if (value === 'dialogue' || value === 'narration' || value === 'voiceover' || value === 'dialogue_audio') return 'voice'
  if (value === 'caption' || value === 'caption_card' || value === 'text') return 'subtitle'
  if (value === 'sound' || value === 'sound_effect' || value === 'music' || value === 'music_beat' || value === 'ambience' || value === 'foley') return 'audio'
  return 'visual'
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
      return 'voice'
    case 'transition':
    case 'note':
    case 'parenthetical':
      return 'visual'
    case 'scene_heading':
    case 'action':
    default:
      return 'visual'
  }
}

export function expressionUnitTypeFromContentUnit(
  unit: ProductionExpressionUnitKindRecord,
): ProductionExpressionUnitType {
  switch (unit.kind) {
    case 'voiceover':
      return 'voice'
    case 'dialogue_audio':
      return 'voice'
    case 'subtitle':
    case 'caption_card':
      return 'subtitle'
    case 'shot':
      return 'visual'
    case 'sound':
    case 'music_beat':
      return 'audio'
    case 'transition':
    default:
      return 'visual'
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
