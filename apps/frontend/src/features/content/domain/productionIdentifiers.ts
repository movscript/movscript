type SceneCodeLike = {
  scene_code?: unknown
}

type UnitCodeLike = {
  kind?: unknown
  unit_code?: unknown
}

const unitKindLabels: Record<string, string> = {
  shot: 'Cut',
  voiceover: 'VO',
  dialogue_audio: 'Dialogue',
  sound: 'SFX',
  music_beat: 'Music',
  subtitle: 'Subtitle',
  caption_card: 'Card',
  transition: 'Transition',
}

function cleanCode(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function sceneIdentifier(scene?: SceneCodeLike | null) {
  const code = cleanCode(scene?.scene_code)
  return code ? `Scene ${code}` : ''
}

export function unitKindLabel(kind: unknown) {
  return unitKindLabels[typeof kind === 'string' ? kind : ''] ?? 'Item'
}

export function unitIdentifier(unit?: UnitCodeLike | null) {
  const code = cleanCode(unit?.unit_code)
  return code ? `${unitKindLabel(unit?.kind)} ${code}` : ''
}

export function productionIdentifier(scene?: SceneCodeLike | null, unit?: UnitCodeLike | null) {
  return [sceneIdentifier(scene), unitIdentifier(unit)].filter(Boolean).join(' · ')
}
