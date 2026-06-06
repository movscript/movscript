import { isRecord } from '@/shared/domain/jsonValue'

export type ContentWorkbenchWorkspaceArtifactPayload = Record<string, unknown>

export type ContentWorkbenchWorkspaceArtifactDefaults = Record<string, string | number | boolean | null> & {
  title: string
  kind: string
  duration_sec?: number
  description: string
  prompt: string
  shot_size: string
  camera_angle: string
  camera_motion: string
  metadata_json?: string
  status: 'candidate'
}

/** @deprecated Use ContentWorkbenchWorkspaceArtifactPayload. */
export type ContentWorkbenchWorkspacePayload = ContentWorkbenchWorkspaceArtifactPayload

/** @deprecated Use ContentWorkbenchWorkspaceArtifactDefaults. */
export type ContentWorkbenchWorkspaceDefaults = ContentWorkbenchWorkspaceArtifactDefaults

export function contentWorkbenchWorkspaceArtifactFieldString(value: ContentWorkbenchWorkspaceArtifactPayload, keys: string[]) {
  for (const key of keys) {
    if (typeof value[key] === 'string' && String(value[key]).trim()) return String(value[key]).trim()
  }
  return ''
}

export function contentWorkbenchWorkspaceArtifactUnitTitle(unit: ContentWorkbenchWorkspaceArtifactPayload, index: number) {
  return firstText(contentWorkbenchWorkspaceArtifactFieldString(unit, ['title']), `制作项 ${index + 1}`)
}

export function contentWorkbenchWorkspaceArtifactUnitKey(unit: ContentWorkbenchWorkspaceArtifactPayload, index: number) {
  return `${normalizeContentWorkbenchWorkspaceArtifactText(contentWorkbenchWorkspaceArtifactFieldString(unit, ['title']))}-${index}`
}

export function contentWorkbenchWorkspaceArtifactSnapshot(unit: ContentWorkbenchWorkspaceArtifactPayload) {
  const shot = isRecord(unit.shot) ? unit.shot : undefined
  return compactContentWorkbenchWorkspaceArtifactParts([
    contentWorkbenchWorkspaceArtifactUnitTitle(unit, 0),
    contentWorkbenchWorkspaceArtifactFieldString(unit, ['kind']),
    contentWorkbenchWorkspaceArtifactFieldString(unit, ['description']),
    contentWorkbenchWorkspaceArtifactFieldString(unit, ['prompt']),
    numberOf(unit.duration_sec) > 0 ? `${numberOf(unit.duration_sec)}s` : '',
    contentWorkbenchWorkspaceArtifactFieldString(shot ?? {}, ['shot_size']),
    contentWorkbenchWorkspaceArtifactFieldString(shot ?? {}, ['camera_angle']),
    contentWorkbenchWorkspaceArtifactFieldString(shot ?? {}, ['camera_movement', 'camera_motion']),
  ])
}

export function contentWorkbenchWorkspaceArtifactDefaults(unit: ContentWorkbenchWorkspaceArtifactPayload): ContentWorkbenchWorkspaceArtifactDefaults {
  const shot = isRecord(unit.shot) ? unit.shot : {}
  const durationSec = numberOf(unit.duration_sec)
  const visualTaskGraph = isRecord(unit.visual_taskGraph) ? unit.visual_taskGraph : null
  const storyboardBrief = isRecord(unit.storyboard_brief) ? unit.storyboard_brief : null
  const metadata = visualTaskGraph || storyboardBrief
    ? {
      ...(visualTaskGraph ? { visual_taskGraph: visualTaskGraph } : {}),
      ...(storyboardBrief ? { storyboard_brief: storyboardBrief } : {}),
    }
    : null
  return {
    title: contentWorkbenchWorkspaceArtifactUnitTitle(unit, 0),
    kind: firstText(contentWorkbenchWorkspaceArtifactFieldString(unit, ['kind']), 'shot'),
    ...(durationSec > 0 ? { duration_sec: durationSec } : {}),
    description: contentWorkbenchWorkspaceArtifactFieldString(unit, ['description']),
    prompt: contentWorkbenchWorkspaceArtifactFieldString(unit, ['prompt']),
    shot_size: contentWorkbenchWorkspaceArtifactFieldString(shot, ['shot_size']),
    camera_angle: contentWorkbenchWorkspaceArtifactFieldString(shot, ['camera_angle']),
    camera_motion: contentWorkbenchWorkspaceArtifactFieldString(shot, ['camera_movement', 'camera_motion']),
    ...(metadata ? { metadata_json: JSON.stringify(metadata) } : {}),
    status: 'candidate',
  }
}

export function normalizeContentWorkbenchWorkspaceArtifactText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** @deprecated Use contentWorkbenchWorkspaceArtifactFieldString. */
export const contentWorkbenchWorkspaceFieldString = contentWorkbenchWorkspaceArtifactFieldString
/** @deprecated Use contentWorkbenchWorkspaceArtifactUnitTitle. */
export const contentWorkbenchWorkspaceUnitTitle = contentWorkbenchWorkspaceArtifactUnitTitle
/** @deprecated Use contentWorkbenchWorkspaceArtifactUnitKey. */
export const contentWorkbenchWorkspaceUnitKey = contentWorkbenchWorkspaceArtifactUnitKey
/** @deprecated Use contentWorkbenchWorkspaceArtifactSnapshot. */
export const contentWorkbenchWorkspaceSnapshot = contentWorkbenchWorkspaceArtifactSnapshot
/** @deprecated Use contentWorkbenchWorkspaceArtifactDefaults. */
export const contentWorkbenchWorkspaceDefaults = contentWorkbenchWorkspaceArtifactDefaults
/** @deprecated Use normalizeContentWorkbenchWorkspaceArtifactText. */
export const normalizeContentWorkbenchWorkspaceText = normalizeContentWorkbenchWorkspaceArtifactText

function compactContentWorkbenchWorkspaceArtifactParts(parts: Array<unknown>) {
  return parts.map((part) => String(part ?? '').trim()).filter(Boolean).join(' / ')
}

function firstText(...values: Array<unknown>) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function numberOf(value: unknown) {
  const next = Number(value)
  return Number.isFinite(next) ? next : 0
}
