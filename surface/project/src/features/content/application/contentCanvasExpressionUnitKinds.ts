export type ContentCanvasExpressionUnitKind =
  | 'visual'
  | 'voice'
  | 'subtitle'
  | 'audio'

export const CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS: Array<{ value: ContentCanvasExpressionUnitKind; label: string }> = [
  { value: 'visual', label: '视觉' },
  { value: 'voice', label: '人声' },
  { value: 'subtitle', label: '字幕' },
  { value: 'audio', label: '音频' },
]

export function normalizeContentCanvasExpressionUnitKind(value: string | undefined): ContentCanvasExpressionUnitKind {
  const text = String(value ?? '').trim().toLowerCase()
  if (text === 'voice' || text === 'dialogue' || text === 'narration' || text === 'voiceover' || text === 'verbal') return 'voice'
  if (text === 'subtitle' || text === 'caption' || text === 'text') return 'subtitle'
  if (text === 'audio' || text === 'sound' || text === 'sound_effect' || text === 'sfx' || text === 'music' || text === 'ambience' || text === 'foley') return 'audio'
  return 'visual'
}

export function contentCanvasExpressionUnitOutputKind(kind: string | undefined): string {
  const normalized = normalizeContentCanvasExpressionUnitKind(kind)
  if (normalized === 'voice' || normalized === 'audio') return 'audio'
  if (normalized === 'subtitle') return 'text'
  return 'video'
}

export function contentCanvasExpressionUnitKindForOutputKind(outputKind: string | undefined): ContentCanvasExpressionUnitKind {
  if (outputKind === 'audio') return 'audio'
  if (outputKind === 'text') return 'subtitle'
  return 'visual'
}
