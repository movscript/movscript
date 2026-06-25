import type { ResourceBindingOwnerType } from '@movscript/shared'
import type { SemanticEntityRecord } from '@movscript/shared/semantic-entities'

export type GeneratedBindingTarget = Extract<ResourceBindingOwnerType, 'asset_slot' | 'keyframe'>

export const GENERATED_BINDING_TARGETS: Array<{
  value: GeneratedBindingTarget
  label: string
  slot: string
  entityKind: 'assetSlots' | 'keyframes'
}> = [
  { value: 'asset_slot', label: '素材需求', slot: 'candidate', entityKind: 'assetSlots' },
  { value: 'keyframe', label: '画面锚点', slot: 'candidate', entityKind: 'keyframes' },
]

export function generatedBindingTargetLabel(value: GeneratedBindingTarget) {
  return GENERATED_BINDING_TARGETS.find((target) => target.value === value)?.label ?? value
}

export function generatedTargetRecordId(record: SemanticEntityRecord): number | undefined {
  return positiveInteger(record.ID ?? record.id) ?? numericSuffix(record.id)
}

export function generatedTargetRecordLabel(record: SemanticEntityRecord) {
  const id = generatedTargetRecordId(record)
  const title = record.title ?? record.name ?? record.label ?? `${record.kind ?? '对象'} #${id ?? record.id ?? 'unknown'}`
  const details = [record.kind, record.status, record.order !== undefined ? `order ${record.order}` : undefined].filter(Boolean).join(' · ')
  return details ? `${title} · ${details}` : title
}

export function generatedTargetSearchText(record: SemanticEntityRecord) {
  return [
    generatedTargetRecordId(record),
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

export function isGeneratedCandidateTargetRecord(record: SemanticEntityRecord, target: GeneratedBindingTarget = 'asset_slot') {
  if (target === 'asset_slot') return record.owner_type !== 'asset_slot'
  return !isGeneratedKeyframeCandidateRecord(record)
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

export function generatedBindingErrorMessage(error: unknown, fallback = '加入候选失败') {
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

export type GeneratedCandidateAttachSummaryStatus = 'attached' | 'partial' | 'error'

export interface GeneratedCandidateAttachSummary {
  status: GeneratedCandidateAttachSummaryStatus
  createdCount: number
  failedCount: number
  message: string
}

export function isGeneratedKeyframeCandidateRecord(record: SemanticEntityRecord) {
  return generatedKeyframeCandidateTargetId(record) !== undefined
}

export function generatedKeyframeCandidateTargetId(record: SemanticEntityRecord) {
  const metadata = parseMetadataRecord(record.metadata_json) ?? parseMetadataRecord(record.metadata)
  const targetId = nullablePositiveNumber(metadata?.target_keyframe_id)
  if (metadata?.source === 'ai_generated_keyframe_candidate') return targetId ?? 0
  return targetId ?? undefined
}

export function pendingGeneratedCandidateAttachments<T extends { id: string }>(
  attachments: T[],
  attachedAttachmentIds: ReadonlySet<string>,
): T[] {
  return attachments.filter((attachment) => !attachedAttachmentIds.has(attachment.id))
}

export function attachedGeneratedCandidateIdsAfterResults<T extends { id: string }>(
  attachedAttachmentIds: ReadonlySet<string>,
  attemptedAttachments: T[],
  results: Array<PromiseSettledResult<unknown>>,
): Set<string> {
  const next = new Set(attachedAttachmentIds)
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const attachment = attemptedAttachments[index]
      if (attachment) next.add(attachment.id)
    }
  })
  return next
}

export function generatedCandidateAttachSummary(
  targetLabel: string,
  results: Array<PromiseSettledResult<unknown>>,
  fallback = '批量加入候选失败',
): GeneratedCandidateAttachSummary {
  const createdCount = results.filter((result) => result.status === 'fulfilled').length
  const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (failed.length === 0 && createdCount > 0) {
    return {
      status: 'attached',
      createdCount,
      failedCount: 0,
      message: `${targetLabel} 已加入 ${createdCount} 个候选`,
    }
  }
  if (createdCount > 0) {
    return {
      status: 'partial',
      createdCount,
      failedCount: failed.length,
      message: `${targetLabel} 已加入 ${createdCount} 个候选，${failed.length} 个失败：${generatedBindingErrorMessage(failed[0]?.reason, fallback)}`,
    }
  }
  return {
    status: 'error',
    createdCount: 0,
    failedCount: failed.length,
    message: generatedBindingErrorMessage(failed[0]?.reason, fallback),
  }
}

function stringErrorValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  return stringErrorValue(record.message) ?? stringErrorValue(record.error) ?? stringErrorValue(record.detail)
}

function positiveInteger(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && Number.isInteger(number) && number > 0 ? number : undefined
}

function numericSuffix(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return undefined
  const match = text.match(/(\d+)$/)
  return match ? positiveInteger(match[1]) : undefined
}

function nullablePositiveNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function parseMetadataRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}
