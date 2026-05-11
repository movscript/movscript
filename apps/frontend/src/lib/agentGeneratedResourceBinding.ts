import type { SemanticEntityRecord } from '@/api/semanticEntities'
import type { ResourceBindingOwnerType } from '@/types'

export type GeneratedBindingTarget = Extract<ResourceBindingOwnerType, 'asset_slot' | 'content_unit' | 'storyboard_line'>

export const GENERATED_BINDING_TARGETS: Array<{
  value: GeneratedBindingTarget
  label: string
  slot: string
  entityKind: 'assetSlots' | 'contentUnits' | 'storyboardLines'
}> = [
  { value: 'asset_slot', label: '素材需求', slot: 'result', entityKind: 'assetSlots' },
  { value: 'content_unit', label: '制作项', slot: 'generated_media', entityKind: 'contentUnits' },
  { value: 'storyboard_line', label: '分镜行', slot: 'generated_media', entityKind: 'storyboardLines' },
]

export function generatedBindingTargetLabel(value: GeneratedBindingTarget) {
  return GENERATED_BINDING_TARGETS.find((target) => target.value === value)?.label ?? value
}

export function generatedTargetRecordLabel(record: SemanticEntityRecord) {
  const title = record.title ?? record.name ?? record.label ?? `${record.kind ?? '对象'} #${record.ID}`
  const details = [record.kind, record.status, record.order !== undefined ? `order ${record.order}` : undefined].filter(Boolean).join(' · ')
  return details ? `${title} · ${details}` : title
}

export function generatedTargetSearchText(record: SemanticEntityRecord) {
  return [
    record.ID,
    record.title,
    record.name,
    record.label,
    record.kind,
    record.status,
    record.order,
    record.description,
    record.prompt,
    record.prompt_hint,
    record.visual_intent,
  ].filter((item) => item !== undefined && item !== null).join(' ').toLowerCase()
}

export function generatedTargetRecordMeta(record: SemanticEntityRecord) {
  return [
    record.kind,
    record.status,
    record.review_status,
    record.order !== undefined ? `order ${record.order}` : undefined,
  ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

export function generatedTargetRecordDescription(record: SemanticEntityRecord) {
  const keys = ['description', 'prompt', 'prompt_hint', 'visual_intent', 'content', 'text', 'note']
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  return ''
}

export function generatedBindingErrorMessage(error: unknown, fallback = '绑定失败') {
  const maybeRecord = error && typeof error === 'object' ? error as Record<string, unknown> : undefined
  const response = maybeRecord?.response && typeof maybeRecord.response === 'object'
    ? maybeRecord.response as Record<string, unknown>
    : undefined
  const data = response?.data
  if (typeof data === 'string' && data.trim().length > 0) return data.trim()
  if (data && typeof data === 'object') {
    const dataRecord = data as Record<string, unknown>
    for (const key of ['message', 'error', 'detail']) {
      const value = stringErrorValue(dataRecord[key])
      if (value) return value
    }
  }
  const message = maybeRecord?.message
  if (typeof message === 'string' && message.trim().length > 0) return message.trim()
  return fallback
}

function stringErrorValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  return stringErrorValue(record.message) ?? stringErrorValue(record.error) ?? stringErrorValue(record.detail)
}
