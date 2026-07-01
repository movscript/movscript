import { parseResourceMentions } from '@movscript/workspace'
import type { GenerationIntentPayload, GenerationReferenceAssetPayload } from './jobPayload.js'

export type GenerationPromptReferenceRole =
  | 'generic'
  | 'reference_image'
  | 'reference_video'
  | 'reference_audio'
  | 'first_frame'
  | 'last_frame'
  | 'style_reference'
  | 'character_reference'
  | 'product_reference'
  | 'target_image'
  | 'mask'
  | 'target_video'
  | 'source_audio'
  | 'speech_audio'
  | 'voice_sample'
  | 'target_voice'
  | 'source_video'
  | 'transcript'
  | string

export type GenerationPromptReferenceMediaType = 'image' | 'video' | 'audio' | 'text' | 'file' | string

export interface GenerationPromptReferenceIntent {
  reference_id?: string | null
  source_kind?: string | null
  source_id?: string | number | null
  source_ref?: string | number | null
  role?: GenerationPromptReferenceRole | null
  media_type?: GenerationPromptReferenceMediaType | null
  resource_id?: number | null
}

export interface GenerationOperationOption {
  value: string
  label?: string
}

export interface GenerationReferenceRoleOption {
  value: GenerationPromptReferenceRole
  label: string
  hint: string
}

export interface GenerationReferenceAssetCompletionInput {
  operation?: string | null
  existing?: readonly GenerationPromptReferenceIntent[] | null
  inputResourceIds?: readonly number[]
  defaultMediaType?: GenerationPromptReferenceMediaType | null
}

const IMAGE_REFERENCE_ROLES = new Set([
  'generic',
  'reference_image',
  'style_reference',
  'character_reference',
  'product_reference',
  'target_image',
])
const VIDEO_REFERENCE_ROLES = new Set(['generic', 'reference_video', 'target_video'])
const AUDIO_REFERENCE_ROLES = new Set([
  'generic',
  'reference_audio',
  'source_audio',
  'speech_audio',
  'voice_sample',
  'target_voice',
])

export function generationOperationOptionsForOutputKind(
  outputKind: string | null | undefined,
  referenceAssets: readonly GenerationPromptReferenceIntent[] = [],
): GenerationOperationOption[] {
  const operations = generationAllOperationOptionsForOutputKind(outputKind)
  return operations.filter((operation) => generationOperationAcceptsReferences(operation.value, referenceAssets))
}

export function generationAllOperationOptionsForOutputKind(
  outputKind: string | null | undefined,
): GenerationOperationOption[] {
  switch (String(outputKind ?? '').trim()) {
    case 'image':
      return [
        { value: 'text_to_image', label: '文生图' },
        { value: 'reference_to_image', label: '参考生图' },
        { value: 'edit_image', label: '图片编辑' },
        { value: 'inpaint', label: '局部重绘' },
        { value: 'outpaint', label: '扩图' },
        { value: 'variation', label: '变体生成' },
        { value: 'upscale_image', label: '图片增强' },
      ]
    case 'video':
      return [
        { value: 'prompt_to_video', label: '文生视频' },
        { value: 'image_to_video', label: '图生视频' },
        { value: 'first_frame_to_video', label: '首帧生视频' },
        { value: 'first_last_frame_to_video', label: '首尾帧生视频' },
        { value: 'reference_to_video', label: '全能参考生视频' },
        { value: 'edit_video', label: '视频编辑' },
        { value: 'extend_video', label: '视频延展' },
        { value: 'upscale_video', label: '视频增强' },
      ]
    case 'audio':
      return [
        { value: 'text_to_speech', label: '语音生成' },
        { value: 'speech_to_text', label: '语音转写' },
        { value: 'speech_translate', label: '音频翻译' },
        { value: 'speech_to_speech', label: '语音转换' },
        { value: 'voice_clone', label: '声音克隆' },
        { value: 'voice_design', label: '声音设计' },
        { value: 'dubbing', label: '配音/改配' },
        { value: 'music_generation', label: '音乐生成' },
        { value: 'sound_effect_generation', label: '音效生成' },
        { value: 'voice_isolation', label: '人声分离' },
        { value: 'forced_alignment', label: '强制对齐' },
      ]
    default:
      return []
  }
}

export function generationDefaultOperationForOutputKind(
  outputKind: string | null | undefined,
  referenceAssets: readonly GenerationPromptReferenceIntent[] = [],
): string | undefined {
  const options = generationOperationOptionsForOutputKind(outputKind, referenceAssets)
  return options[0]?.value
}

export function generationOperationAcceptsReferences(
  operation: string | null | undefined,
  referenceAssets: readonly GenerationPromptReferenceIntent[] = [],
): boolean {
  const refs = generationReferenceAssetsWithRoleAndMedia(referenceAssets)
  const hasRefs = refs.length > 0
  switch (String(operation ?? '').trim()) {
    case 'text_to_image':
    case 'prompt_to_video':
    case 'text_to_speech':
    case 'music_generation':
    case 'sound_effect_generation':
    case 'voice_design':
      return !hasRefs
    case 'reference_to_image':
    case 'edit_image':
    case 'inpaint':
    case 'outpaint':
    case 'variation':
    case 'upscale_image':
      return refs.some(isOrdinaryImageReference)
    case 'image_to_video':
      return refs.some(isOrdinaryImageReference)
    case 'first_frame_to_video':
      return refs.some((ref) => ref.media_type === 'image' && ref.role === 'first_frame')
    case 'first_last_frame_to_video':
      return refs.some((ref) => ref.media_type === 'image' && ref.role === 'first_frame')
        && refs.some((ref) => ref.media_type === 'image' && ref.role === 'last_frame')
    case 'reference_to_video':
      return refs.some((ref) => (
        (ref.media_type === 'image' && isReferenceRole(ref.role, IMAGE_REFERENCE_ROLES))
        || (ref.media_type === 'video' && isReferenceRole(ref.role, VIDEO_REFERENCE_ROLES))
        || (ref.media_type === 'audio' && isReferenceRole(ref.role, AUDIO_REFERENCE_ROLES))
      ))
    case 'edit_video':
    case 'extend_video':
    case 'upscale_video':
      return refs.some((ref) => ref.media_type === 'video' && isReferenceRole(ref.role, VIDEO_REFERENCE_ROLES))
    case 'speech_to_text':
    case 'speech_translate':
    case 'speech_to_speech':
    case 'voice_clone':
    case 'dubbing':
    case 'voice_isolation':
      return refs.some((ref) => ref.media_type === 'audio' && isReferenceRole(ref.role, AUDIO_REFERENCE_ROLES))
    case 'forced_alignment':
      return refs.some((ref) => ref.media_type === 'audio' && isReferenceRole(ref.role, AUDIO_REFERENCE_ROLES))
        && refs.some((ref) => ref.media_type === 'text' && ref.role === 'transcript')
    default:
      return true
  }
}

export function completeGenerationReferenceAssets(
  input: GenerationReferenceAssetCompletionInput,
): NonNullable<GenerationIntentPayload['reference_assets']> {
  const existing = Array.isArray(input.existing) ? input.existing : []
  const inputResourceIds = input.inputResourceIds ?? []
  if (existing.length === 0 && inputResourceIds.length === 0) return []
  const maxLength = Math.max(existing.length, inputResourceIds.length)
  const out: NonNullable<GenerationIntentPayload['reference_assets']> = []
  for (let index = 0; index < maxLength; index += 1) {
    const ref = existing[index]
    const resourceId = positiveInteger(ref?.resource_id) ?? inputResourceIds[index]
    if (resourceId === undefined) continue
    const mediaType = normalizedReferenceMediaType(ref?.media_type)
      ?? defaultMediaTypeForOperation(input.operation, input.defaultMediaType)
    const role = normalizedReferenceRole(ref?.role)
      ?? generationDefaultReferenceRoleForMediaType(mediaType)
    if (!mediaType || !role) continue
    out.push({
      ...generationReferenceAssetMetadata(ref),
      role,
      media_type: mediaType,
      resource_id: resourceId,
    })
  }
  return out
}

export function buildGenerationIntentForOutputKind(input: {
  outputKind: string | null | undefined
  operation?: string | null
  referenceAssets?: readonly GenerationPromptReferenceIntent[] | null
}): GenerationIntentPayload | null {
  const capability = generationCapabilityForOutputKind(input.outputKind)
  if (!capability) return null
  const refs = generationReferenceAssetsWithResourceIds(input.referenceAssets ?? [])
  const operation = String(input.operation ?? generationDefaultOperationForOutputKind(input.outputKind, refs) ?? '').trim()
  if (!operation) return null
  return {
    capability,
    operation,
    ...(refs.length > 0 ? { reference_assets: refs } : {}),
  }
}

export function generationCapabilityForOutputKind(outputKind: string | null | undefined): string | null {
  switch (String(outputKind ?? '').trim()) {
    case 'image':
      return 'image_generation'
    case 'video':
      return 'video_generation'
    case 'audio':
      return 'audio_generation'
    case 'text':
      return 'text_generation'
    default:
      return null
  }
}

export function generationModelReferenceAssetsForQuery(
  refs: readonly GenerationPromptReferenceIntent[] | null | undefined,
): Array<{ role: string; media_type?: string }> {
  return generationReferenceAssetsWithRoleAndMedia(refs ?? []).map((ref) => ({
    role: ref.role,
    ...(ref.media_type ? { media_type: ref.media_type } : {}),
  }))
}

export function generationReferenceAssetsFromPromptText(
  text: string | null | undefined,
): GenerationReferenceAssetPayload[] {
  const mentions = parseResourceMentions(text)
  return completeGenerationReferenceAssets({
    existing: mentions.map((mention) => ({
      resource_id: mention.id,
      ...(mention.role ? { role: mention.role } : {}),
      ...(mention.mediaType ? { media_type: mention.mediaType } : {}),
    })),
    inputResourceIds: mentions.map((mention) => mention.id),
  })
}

export function generationDefaultReferenceRoleForMediaType(
  mediaType: GenerationPromptReferenceMediaType | null | undefined,
): GenerationPromptReferenceRole | undefined {
  switch (normalizedReferenceMediaType(mediaType)) {
    case 'image':
      return 'reference_image'
    case 'video':
      return 'reference_video'
    case 'audio':
      return 'reference_audio'
    case 'text':
      return 'transcript'
    default:
      return undefined
  }
}

export function generationReferenceRoleOptionsForMediaType(
  mediaType: GenerationPromptReferenceMediaType | null | undefined,
): GenerationReferenceRoleOption[] {
  switch (normalizedReferenceMediaType(mediaType)) {
    case 'video':
      return [
        { value: 'reference_video', label: '视频参考', hint: '作为普通视频参考' },
        { value: 'target_video', label: '目标视频', hint: '用于视频编辑、延展或增强' },
      ]
    case 'audio':
      return [
        { value: 'reference_audio', label: '音频参考', hint: '作为普通音频参考' },
        { value: 'source_audio', label: '源音频', hint: '用于转写、翻译或音频处理' },
        { value: 'speech_audio', label: '语音音频', hint: '用于语音转换或配音' },
        { value: 'voice_sample', label: '声音样本', hint: '用于声音克隆' },
        { value: 'target_voice', label: '目标声音', hint: '用于指定输出声音' },
      ]
    case 'text':
      return [
        { value: 'transcript', label: '文本稿', hint: '用于强制对齐、配音或翻译' },
      ]
    default:
      return [
        { value: 'reference_image', label: '参考图', hint: '普通参考，不作为首帧' },
        { value: 'first_frame', label: '首帧', hint: '可用于首帧生视频' },
        { value: 'last_frame', label: '尾帧', hint: '可用于首尾帧生视频' },
        { value: 'style_reference', label: '风格参考', hint: '只表达风格/画面参考' },
        { value: 'character_reference', label: '角色参考', hint: '用于角色一致性' },
        { value: 'product_reference', label: '产品参考', hint: '用于主体/物品一致性' },
        { value: 'target_image', label: '目标图', hint: '用于图片编辑、扩图或增强' },
        { value: 'mask', label: '蒙版', hint: '用于局部重绘' },
      ]
  }
}

export function generationReferenceRoleLabel(role: string | null | undefined): string {
  switch (normalizedReferenceRole(role)) {
    case 'first_frame':
      return '首帧'
    case 'last_frame':
      return '尾帧'
    case 'style_reference':
      return '风格'
    case 'character_reference':
      return '角色参考'
    case 'product_reference':
      return '产品参考'
    case 'target_image':
      return '目标图'
    case 'mask':
      return '蒙版'
    case 'target_video':
      return '目标视频'
    case 'source_audio':
      return '源音频'
    case 'speech_audio':
      return '语音音频'
    case 'voice_sample':
      return '声音样本'
    case 'target_voice':
      return '目标声音'
    case 'source_video':
      return '源视频'
    case 'transcript':
      return '文本稿'
    case 'reference_video':
      return '视频参考'
    case 'reference_audio':
      return '音频参考'
    case 'reference_image':
      return '参考图'
    default:
      return normalizedReferenceRole(role) ?? ''
  }
}

export function generationReferenceMediaTypeShortLabel(mediaType: string | null | undefined): string {
  switch (normalizedReferenceMediaType(mediaType)) {
    case 'image':
      return '图'
    case 'video':
      return '视'
    case 'audio':
      return '音'
    case 'text':
      return '文'
    case 'file':
      return '档'
    default:
      return '资'
  }
}

export function generationResourceReferenceLabel(role: string | null | undefined): string {
  const label = generationReferenceRoleLabel(role)
  return `资源引用 · ${label || '参考'}`
}

function generationReferenceAssetsWithResourceIds(
  refs: readonly GenerationPromptReferenceIntent[],
): GenerationReferenceAssetPayload[] {
  return refs.flatMap((ref): GenerationReferenceAssetPayload[] => {
    const resourceId = positiveInteger(ref.resource_id)
    const role = normalizedReferenceRole(ref.role)
    const mediaType = normalizedReferenceMediaType(ref.media_type)
    if (!resourceId || !role || !mediaType) return []
    return [{ ...generationReferenceAssetMetadata(ref), role, media_type: mediaType, resource_id: resourceId }]
  })
}

function generationReferenceAssetsWithRoleAndMedia(
  refs: readonly GenerationPromptReferenceIntent[],
): Array<{ role: string; media_type: string }> {
  return refs.flatMap((ref) => {
    const role = normalizedReferenceRole(ref.role)
    const mediaType = normalizedReferenceMediaType(ref.media_type)
    if (!role || !mediaType) return []
    return [{ role, media_type: mediaType }]
  })
}

function generationReferenceAssetMetadata(
  ref: GenerationPromptReferenceIntent | null | undefined,
): Pick<GenerationReferenceAssetPayload, 'reference_id' | 'source_kind' | 'source_id' | 'source_ref'> {
  const referenceId = trimmedString(ref?.reference_id)
  const sourceKind = trimmedString(ref?.source_kind)
  const sourceId = optionalStringOrNumber(ref?.source_id)
  const sourceRef = optionalStringOrNumber(ref?.source_ref)
  return {
    ...(referenceId ? { reference_id: referenceId } : {}),
    ...(sourceKind ? { source_kind: sourceKind } : {}),
    ...(sourceId !== undefined ? { source_id: sourceId } : {}),
    ...(sourceRef !== undefined ? { source_ref: sourceRef } : {}),
  }
}

function trimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function optionalStringOrNumber(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return trimmedString(value)
}

function isOrdinaryImageReference(ref: { role: string; media_type: string }): boolean {
  return ref.media_type === 'image' && isReferenceRole(ref.role, IMAGE_REFERENCE_ROLES)
}

function isReferenceRole(role: string, allowed: Set<string>): boolean {
  return allowed.has(role)
}

function defaultMediaTypeForOperation(
  operation: string | null | undefined,
  fallback: GenerationPromptReferenceMediaType | null | undefined,
): string | undefined {
  const normalizedFallback = normalizedReferenceMediaType(fallback)
  if (normalizedFallback) return normalizedFallback
  switch (String(operation ?? '').trim()) {
    case 'edit_video':
    case 'extend_video':
    case 'upscale_video':
      return 'video'
    case 'speech_to_text':
    case 'speech_translate':
    case 'speech_to_speech':
    case 'voice_clone':
    case 'dubbing':
    case 'voice_isolation':
    case 'forced_alignment':
      return 'audio'
    default:
      return 'image'
  }
}

function normalizedReferenceRole(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizedReferenceMediaType(value: unknown): string | undefined {
  const mediaType = typeof value === 'string' ? value.trim() : ''
  if (!mediaType || mediaType === 'any') return undefined
  return mediaType
}

function positiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }
  return undefined
}
