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
  | 'motion_reference'
  | 'source_video'
  | 'source_audio'
  | string

export type GenerationPromptReferenceMediaType = 'image' | 'video' | 'audio' | 'text' | 'file' | string

export interface GenerationPromptReferenceIntent {
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

const IMAGE_REFERENCE_ROLES = new Set(['generic', 'reference_image', 'style_reference'])
const VIDEO_REFERENCE_ROLES = new Set(['generic', 'reference_video', 'motion_reference', 'source_video'])
const AUDIO_REFERENCE_ROLES = new Set(['generic', 'reference_audio', 'source_audio'])

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
        { value: 'image_to_image', label: '图生图 / 参考图生图' },
        { value: 'reference_to_image', label: '参考生图' },
        { value: 'image_edit', label: '图片编辑' },
        { value: 'style_transfer', label: '风格迁移' },
      ]
    case 'video':
      return [
        { value: 'prompt_to_video', label: '文生视频' },
        { value: 'image_to_video', label: '图生视频' },
        { value: 'first_frame_to_video', label: '首帧生视频' },
        { value: 'first_last_frame_to_video', label: '首尾帧生视频' },
        { value: 'reference_to_video', label: '全能参考生视频' },
        { value: 'video_to_video', label: '视频参考生视频' },
      ]
    case 'audio':
      return [
        { value: 'tts', label: '语音生成' },
        { value: 'stt', label: '语音转写' },
        { value: 'speech_translate', label: '音频翻译' },
        { value: 'audio_chat', label: '语音对话' },
        { value: 'music', label: '音乐生成' },
        { value: 'sfx', label: '音效生成' },
        { value: 'voice_clone', label: '声音克隆' },
        { value: 'voice_design', label: '声音设计' },
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
    case 'tts':
    case 'music':
    case 'sfx':
    case 'voice_design':
      return !hasRefs
    case 'image_to_image':
    case 'reference_to_image':
    case 'image_edit':
    case 'style_transfer':
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
    case 'video_to_video':
      return refs.some((ref) => ref.media_type === 'video' && isReferenceRole(ref.role, VIDEO_REFERENCE_ROLES))
    case 'stt':
    case 'speech_translate':
    case 'audio_chat':
    case 'voice_clone':
    case 'speech_enhancement':
    case 'dubbing':
      return refs.some((ref) => ref.media_type === 'audio' && isReferenceRole(ref.role, AUDIO_REFERENCE_ROLES))
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
        { value: 'motion_reference', label: '运动参考', hint: '用于运动/镜头参考' },
        { value: 'source_video', label: '源视频', hint: '用于视频到视频' },
      ]
    case 'audio':
      return [
        { value: 'reference_audio', label: '音频参考', hint: '作为普通音频参考' },
        { value: 'source_audio', label: '源音频', hint: '用于语音/音频处理' },
      ]
    default:
      return [
        { value: 'reference_image', label: '参考图', hint: '普通参考，不作为首帧' },
        { value: 'first_frame', label: '首帧', hint: '可用于首帧生视频' },
        { value: 'last_frame', label: '尾帧', hint: '可用于首尾帧生视频' },
        { value: 'style_reference', label: '风格参考', hint: '只表达风格/画面参考' },
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
    case 'motion_reference':
      return '运动'
    case 'source_video':
      return '源视频'
    case 'source_audio':
      return '源音频'
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
    return [{ role, media_type: mediaType, resource_id: resourceId }]
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
    case 'video_to_video':
    case 'motion_control':
      return 'video'
    case 'stt':
    case 'speech_translate':
    case 'audio_chat':
    case 'voice_clone':
    case 'speech_enhancement':
    case 'dubbing':
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
