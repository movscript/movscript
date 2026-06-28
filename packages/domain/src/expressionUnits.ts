import type { MovScriptContentUnitOutputKind } from './types.js'

export const MOVSCRIPT_EXPRESSION_UNIT_SLOT_KINDS = [
  'visual',
  'voice',
  'subtitle',
  'audio',
] as const

export type MovScriptExpressionUnitSlotKind = typeof MOVSCRIPT_EXPRESSION_UNIT_SLOT_KINDS[number]

const SLOT_KIND_SET = new Set<string>(MOVSCRIPT_EXPRESSION_UNIT_SLOT_KINDS)

export function isMovScriptExpressionUnitSlotKind(value: unknown): value is MovScriptExpressionUnitSlotKind {
  return typeof value === 'string' && SLOT_KIND_SET.has(value)
}

export function normalizeExpressionUnitSlotKind(
  value: unknown,
  fallback: MovScriptExpressionUnitSlotKind = 'visual',
): MovScriptExpressionUnitSlotKind {
  const text = normalizedToken(value)
  if (!text) return fallback
  if (isMovScriptExpressionUnitSlotKind(text)) return text
  if (
    text === 'dialogue'
    || text === 'narration'
    || text === 'voiceover'
    || text === 'voice_over'
    || text === 'speech'
    || text === 'verbal'
  ) return 'voice'
  if (text === 'caption' || text === 'caption_card' || text === 'text') return 'subtitle'
  if (
    text === 'sound'
    || text === 'sound_effect'
    || text === 'sfx'
    || text === 'music'
    || text === 'music_beat'
    || text === 'ambience'
    || text === 'ambient'
    || text === 'foley'
  ) return 'audio'
  if (
    text === 'shot'
    || text === 'action'
    || text === 'visual_note'
    || text === 'image'
    || text === 'video'
    || text === 'visual'
  ) return 'visual'
  return fallback
}

export function expressionUnitSlotKindFromRecord(record: Record<string, unknown> | undefined): MovScriptExpressionUnitSlotKind {
  if (!record) return 'visual'
  return normalizeExpressionUnitSlotKind(
    record.slot_kind
      ?? record.slotKind
      ?? record.expression_kind
      ?? record.expressionKind
      ?? record.kind
      ?? record.role
      ?? record.modality,
  )
}

export function defaultOutputKindForExpressionUnitSlot(
  slotKind: unknown,
): MovScriptContentUnitOutputKind {
  const normalized = normalizeExpressionUnitSlotKind(slotKind)
  if (normalized === 'voice' || normalized === 'audio') return 'audio'
  if (normalized === 'subtitle') return 'text'
  return 'video'
}

function normalizedToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}
