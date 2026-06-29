import { generationCapabilityForOutputKind } from '../promptComposer.js'
import type {
  GenerationCallProfile,
  GenerationResolverOutputKind,
  GenerationResolverReference,
} from './types.js'
import { normalizeGenerationResolverOutput } from './normalizeReferences.js'

export function inferGenerationCallProfile(
  targetOutput: GenerationResolverOutputKind | null | undefined,
  references: readonly GenerationResolverReference[],
): GenerationCallProfile | null {
  const output = normalizeGenerationResolverOutput(targetOutput)
  if (!output) return null
  const roleSet = unique(references.map((ref) => ref.role))
  const mediaTypeSet = unique(references.map((ref) => ref.media_type))
  return {
    output,
    labels: generationCallLabels(output, references),
    reference_roles: roleSet,
    reference_media_types: mediaTypeSet,
    preferred_operations: preferredLegacyOperations(output, references),
  }
}

export function generationCallCapability(profile: GenerationCallProfile | null): string | undefined {
  return profile ? generationCapabilityForOutputKind(profile.output) ?? undefined : undefined
}

function generationCallLabels(output: string, refs: readonly GenerationResolverReference[]): string[] {
  if (output === 'image') {
    if (refs.length === 0) return ['文生图']
    if (refs.some((ref) => ref.role === 'style_reference')) return ['风格参考生图', '参考生图']
    return ['参考生图']
  }
  if (output === 'video') {
    if (refs.length === 0) return ['文生视频']
    const hasFirst = refs.some((ref) => ref.media_type === 'image' && ref.role === 'first_frame')
    const hasLast = refs.some((ref) => ref.media_type === 'image' && ref.role === 'last_frame')
    const hasVideo = refs.some((ref) => ref.media_type === 'video')
    const hasAudio = refs.some((ref) => ref.media_type === 'audio')
    const hasOrdinaryImage = refs.some((ref) => ref.media_type === 'image' && ref.role !== 'first_frame' && ref.role !== 'last_frame')
    const labels: string[] = []
    if (hasFirst && hasLast) labels.push('首尾帧生视频')
    else if (hasFirst) labels.push('首帧生视频')
    if (hasVideo) labels.push('视频参考生视频')
    if (hasOrdinaryImage) labels.push('参考图生视频')
    if ((hasVideo || hasAudio) && (hasFirst || hasLast || hasOrdinaryImage)) labels.push('全能参考生视频')
    if (labels.length === 0) labels.push('参考生视频')
    return unique(labels)
  }
  if (output === 'audio') {
    if (refs.length === 0) return ['音频生成']
    if (refs.some((ref) => ref.media_type === 'audio')) return ['音频参考生成']
    return ['多模态音频生成']
  }
  return [output]
}

function preferredLegacyOperations(output: string, refs: readonly GenerationResolverReference[]): string[] {
  if (output === 'image') {
    if (refs.length === 0) return ['text_to_image']
    if (refs.some((ref) => ref.role === 'style_reference')) return ['style_transfer', 'reference_to_image', 'image_to_image']
    return ['reference_to_image', 'image_to_image', 'image_edit']
  }
  if (output === 'video') {
    if (refs.length === 0) return ['prompt_to_video']
    const hasFirst = refs.some((ref) => ref.media_type === 'image' && ref.role === 'first_frame')
    const hasLast = refs.some((ref) => ref.media_type === 'image' && ref.role === 'last_frame')
    const hasVideo = refs.some((ref) => ref.media_type === 'video')
    const hasAudio = refs.some((ref) => ref.media_type === 'audio')
    const hasImage = refs.some((ref) => ref.media_type === 'image')
    const operations: string[] = []
    if (hasFirst && hasLast) operations.push('first_last_frame_to_video')
    if (hasFirst) operations.push('first_frame_to_video')
    if (hasVideo && !hasImage && !hasAudio) operations.push('video_to_video')
    if (hasImage && !hasVideo && !hasAudio) operations.push('image_to_video')
    operations.push('reference_to_video')
    if (hasVideo) operations.push('video_to_video')
    if (hasImage) operations.push('image_to_video')
    return unique(operations)
  }
  if (output === 'audio') {
    if (refs.some((ref) => ref.media_type === 'audio')) return ['audio_chat', 'voice_clone', 'stt', 'speech_translate']
    return ['tts', 'music', 'sfx', 'voice_design']
  }
  return []
}

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values))
}
