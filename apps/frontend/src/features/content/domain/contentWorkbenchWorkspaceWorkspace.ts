import { isRecord } from '@/shared/domain/jsonValue'

export type ContentWorkbenchWorkspacePayload = Record<string, unknown>

export type ContentWorkbenchWorkspaceDefaults = Record<string, string | number | boolean | null> & {
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

export function contentWorkbenchWorkspaceFieldString(value: ContentWorkbenchWorkspacePayload, keys: string[]) {
  for (const key of keys) {
    if (typeof value[key] === 'string' && String(value[key]).trim()) return String(value[key]).trim()
  }
  return ''
}

export function contentWorkbenchWorkspaceUnitTitle(unit: ContentWorkbenchWorkspacePayload, index: number) {
  return firstText(contentWorkbenchWorkspaceFieldString(unit, ['title']), `制作项 ${index + 1}`)
}

export function contentWorkbenchWorkspaceUnitKey(unit: ContentWorkbenchWorkspacePayload, index: number) {
  return `${normalizeContentWorkbenchWorkspaceText(contentWorkbenchWorkspaceFieldString(unit, ['title']))}-${index}`
}

export function contentWorkbenchWorkspaceSnapshot(unit: ContentWorkbenchWorkspacePayload) {
  const shot = isRecord(unit.shot) ? unit.shot : undefined
  return compactContentWorkbenchWorkspaceParts([
    contentWorkbenchWorkspaceUnitTitle(unit, 0),
    contentWorkbenchWorkspaceFieldString(unit, ['kind']),
    contentWorkbenchWorkspaceFieldString(unit, ['description']),
    contentWorkbenchWorkspaceFieldString(unit, ['prompt']),
    numberOf(unit.duration_sec) > 0 ? `${numberOf(unit.duration_sec)}s` : '',
    contentWorkbenchWorkspaceFieldString(shot ?? {}, ['shot_size']),
    contentWorkbenchWorkspaceFieldString(shot ?? {}, ['camera_angle']),
    contentWorkbenchWorkspaceFieldString(shot ?? {}, ['camera_movement', 'camera_motion']),
  ])
}

export function contentWorkbenchWorkspaceDefaults(unit: ContentWorkbenchWorkspacePayload): ContentWorkbenchWorkspaceDefaults {
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
    title: contentWorkbenchWorkspaceUnitTitle(unit, 0),
    kind: firstText(contentWorkbenchWorkspaceFieldString(unit, ['kind']), 'shot'),
    ...(durationSec > 0 ? { duration_sec: durationSec } : {}),
    description: contentWorkbenchWorkspaceFieldString(unit, ['description']),
    prompt: contentWorkbenchWorkspaceFieldString(unit, ['prompt']),
    shot_size: contentWorkbenchWorkspaceFieldString(shot, ['shot_size']),
    camera_angle: contentWorkbenchWorkspaceFieldString(shot, ['camera_angle']),
    camera_motion: contentWorkbenchWorkspaceFieldString(shot, ['camera_movement', 'camera_motion']),
    ...(metadata ? { metadata_json: JSON.stringify(metadata) } : {}),
    status: 'candidate',
  }
}

export function normalizeContentWorkbenchWorkspaceText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function compactContentWorkbenchWorkspaceParts(parts: Array<unknown>) {
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
