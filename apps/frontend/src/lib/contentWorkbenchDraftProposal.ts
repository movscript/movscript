import { isRecord } from '@/lib/jsonValue'

export type ContentWorkbenchProposalPayload = Record<string, unknown>

export type ContentWorkbenchProposalDefaults = Record<string, string | number | boolean | null> & {
  title: string
  kind: string
  duration_sec?: number
  description: string
  prompt: string
  shot_size: string
  camera_angle: string
  camera_motion: string
  status: 'candidate'
}

export function contentWorkbenchProposalFieldString(value: ContentWorkbenchProposalPayload, keys: string[]) {
  for (const key of keys) {
    if (typeof value[key] === 'string' && String(value[key]).trim()) return String(value[key]).trim()
  }
  return ''
}

export function contentWorkbenchProposalUnitTitle(unit: ContentWorkbenchProposalPayload, index: number) {
  return firstText(contentWorkbenchProposalFieldString(unit, ['title']), `制作项 ${index + 1}`)
}

export function contentWorkbenchProposalUnitKey(unit: ContentWorkbenchProposalPayload, index: number) {
  return `${normalizeContentWorkbenchProposalText(contentWorkbenchProposalFieldString(unit, ['title']))}-${index}`
}

export function contentWorkbenchProposalSnapshot(unit: ContentWorkbenchProposalPayload) {
  const shot = isRecord(unit.shot) ? unit.shot : undefined
  return compactContentWorkbenchProposalParts([
    contentWorkbenchProposalUnitTitle(unit, 0),
    contentWorkbenchProposalFieldString(unit, ['kind']),
    contentWorkbenchProposalFieldString(unit, ['description']),
    contentWorkbenchProposalFieldString(unit, ['prompt']),
    numberOf(unit.duration_sec) > 0 ? `${numberOf(unit.duration_sec)}s` : '',
    contentWorkbenchProposalFieldString(shot ?? {}, ['shot_size']),
    contentWorkbenchProposalFieldString(shot ?? {}, ['camera_angle']),
    contentWorkbenchProposalFieldString(shot ?? {}, ['camera_movement', 'camera_motion']),
  ])
}

export function contentWorkbenchProposalDefaults(unit: ContentWorkbenchProposalPayload): ContentWorkbenchProposalDefaults {
  const shot = isRecord(unit.shot) ? unit.shot : {}
  const durationSec = numberOf(unit.duration_sec)
  return {
    title: contentWorkbenchProposalUnitTitle(unit, 0),
    kind: firstText(contentWorkbenchProposalFieldString(unit, ['kind']), 'shot'),
    ...(durationSec > 0 ? { duration_sec: durationSec } : {}),
    description: contentWorkbenchProposalFieldString(unit, ['description']),
    prompt: contentWorkbenchProposalFieldString(unit, ['prompt']),
    shot_size: contentWorkbenchProposalFieldString(shot, ['shot_size']),
    camera_angle: contentWorkbenchProposalFieldString(shot, ['camera_angle']),
    camera_motion: contentWorkbenchProposalFieldString(shot, ['camera_movement', 'camera_motion']),
    status: 'candidate',
  }
}

export function normalizeContentWorkbenchProposalText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function compactContentWorkbenchProposalParts(parts: Array<unknown>) {
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
