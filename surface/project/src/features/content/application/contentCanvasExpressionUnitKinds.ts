export type ContentCanvasExpressionUnitKind =
  | 'dialogue'
  | 'narration'
  | 'subtitle'
  | 'caption'
  | 'action'
  | 'visual_note'
  | 'shot'

export const CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS: Array<{ value: ContentCanvasExpressionUnitKind; label: string }> = [
  { value: 'dialogue', label: '对白' },
  { value: 'narration', label: '旁白' },
  { value: 'subtitle', label: '字幕' },
  { value: 'caption', label: '说明字幕' },
  { value: 'action', label: '动作' },
  { value: 'visual_note', label: '视觉提示' },
  { value: 'shot', label: '镜头' },
]

export function normalizeContentCanvasExpressionUnitKind(value: string | undefined): ContentCanvasExpressionUnitKind {
  const match = CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS.find((option) => option.value === value)
  return match?.value ?? 'dialogue'
}

export function contentCanvasExpressionUnitOutputKind(kind: string | undefined): string {
  const value = String(kind ?? '').toLowerCase()
  if (value.includes('shot') || value.includes('video')) return 'video'
  if (value.includes('dialogue') || value.includes('narration') || value.includes('audio')) return 'audio'
  return 'text'
}
