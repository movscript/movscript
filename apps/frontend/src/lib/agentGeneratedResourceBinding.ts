import type { SemanticEntityRecord } from '@/api/semanticEntities'
import { invalidateAssetCandidateConsumers } from './assetCandidateQueryInvalidation.ts'
import type { AgentAttachment } from '@/store/agentStore'
import type { ResourceBindingOwnerType } from '@/types'

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

export interface GeneratedCandidateAttachPayload {
  asset_slot_id: number
  resource_id: number
  status: 'candidate'
  source_type: 'job' | 'manual'
  source_id?: number
  note: string
}

export interface GeneratedKeyframeCandidatePayload {
  production_id?: number | null
  scene_moment_id?: number | null
  content_unit_id?: number | null
  resource_id: number
  canvas_id?: number | null
  title: string
  description: string
  prompt: string
  order: number
  status: 'candidate'
  metadata_json: string
}

export function generatedAttachmentResourceId(attachment: Pick<AgentAttachment, 'resourceId'>): number | undefined {
  const resourceId = attachment.resourceId
  return typeof resourceId === 'number' && Number.isFinite(resourceId) && Number.isInteger(resourceId) && resourceId > 0 ? resourceId : undefined
}

export function generatedCandidateAttachPayload(assetSlotId: number, attachment: AgentAttachment): GeneratedCandidateAttachPayload {
  const resourceId = generatedAttachmentResourceId(attachment)
  if (resourceId === undefined) throw new Error('resource_id required')
  return {
    asset_slot_id: assetSlotId,
    resource_id: resourceId,
    status: 'candidate',
    source_type: attachment.generated?.jobId !== undefined ? 'job' : 'manual',
    ...(attachment.generated?.jobId !== undefined ? { source_id: attachment.generated.jobId } : {}),
    note: attachment.generated?.jobId !== undefined ? `由 AI 助手生成任务 #${attachment.generated.jobId} 加入候选` : '由 AI 助手生成结果加入候选',
  }
}

export function generatedKeyframeCandidatePayload(targetKeyframe: SemanticEntityRecord, attachment: AgentAttachment): GeneratedKeyframeCandidatePayload {
  const resourceId = generatedAttachmentResourceId(attachment)
  if (resourceId === undefined) throw new Error('resource_id required')
  const targetTitle = stringField(targetKeyframe.title)
    || stringField(targetKeyframe.name)
    || stringField(targetKeyframe.label)
    || `画面锚点 #${targetKeyframe.ID}`
  return {
    production_id: nullablePositiveNumber(targetKeyframe.production_id),
    scene_moment_id: nullablePositiveNumber(targetKeyframe.scene_moment_id),
    content_unit_id: nullablePositiveNumber(targetKeyframe.content_unit_id),
    resource_id: resourceId,
    canvas_id: nullablePositiveNumber(targetKeyframe.canvas_id),
    title: `候选：${targetTitle}`,
    description: stringField(targetKeyframe.description),
    prompt: stringField(targetKeyframe.prompt),
    order: numberField(targetKeyframe.order ?? targetKeyframe.sort_order ?? targetKeyframe.sortOrder),
    status: 'candidate',
    metadata_json: JSON.stringify({
      source: 'ai_generated_keyframe_candidate',
      target_keyframe_id: targetKeyframe.ID,
      resource_id: resourceId,
      ...(attachment.generated?.jobId !== undefined ? { source_job_id: attachment.generated.jobId } : {}),
    }),
  }
}

export function isGeneratedKeyframeCandidateRecord(record: SemanticEntityRecord) {
  return generatedKeyframeCandidateTargetId(record) !== undefined
}

export function isUnresolvedCandidateStatus(status: unknown) {
  return status === undefined || status === null || status === '' || status === 'candidate' || status === 'pending'
}

export function generatedKeyframeCandidateTargetId(record: SemanticEntityRecord) {
  const metadata = parseMetadataRecord(record.metadata_json)
  const targetId = nullablePositiveNumber(metadata?.target_keyframe_id)
  if (metadata?.source === 'ai_generated_keyframe_candidate') return targetId ?? 0
  return targetId ?? undefined
}

export interface GeneratedCandidateQueryInvalidator {
  invalidateQueries: (options: { queryKey: unknown[] }) => unknown
}

export function invalidateGeneratedCandidateQueries(queryClient: GeneratedCandidateQueryInvalidator, projectId: number) {
  invalidateAssetCandidateConsumers(queryClient, projectId)
  void queryClient.invalidateQueries({ queryKey: ['agent-generated-candidate-targets', projectId] })
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

function stringField(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function numberField(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
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
