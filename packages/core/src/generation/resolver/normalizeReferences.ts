import { generationDefaultReferenceRoleForMediaType } from '../promptComposer.js'
import type {
  GenerationResolverBlocker,
  GenerationResolverMediaType,
  GenerationResolverReference,
  GenerationResolverReferenceInput,
} from './types.js'

export function normalizeGenerationResolverOutput(value: unknown): string | undefined {
  const normalized = normalizeToken(value)
  switch (normalized) {
    case 'image_generation':
    case 'image_edit':
      return 'image'
    case 'video_generation':
    case 'video_i2v':
    case 'video_v2v':
      return 'video'
    case 'audio_generation':
    case 'audio_tts':
    case 'audio_transcribe':
    case 'audio_translate':
    case 'audio_music':
    case 'audio_sfx':
    case 'audio_chat':
    case 'voice_clone':
    case 'voice_design':
      return 'audio'
    case 'text_generation':
    case 'reasoning':
      return 'text'
    default:
      return normalized
  }
}

export function normalizeGenerationResolverMediaType(value: unknown): GenerationResolverMediaType | undefined {
  const normalized = normalizeToken(value)
  if (!normalized || normalized === 'any') return undefined
  if (normalized.startsWith('image/')) return 'image'
  if (normalized.startsWith('video/')) return 'video'
  if (normalized.startsWith('audio/')) return 'audio'
  return normalized
}

export function normalizeGenerationResolverRole(value: unknown): string | undefined {
  return normalizeToken(value)
}

export function normalizeGenerationResolverReferences(
  input: readonly GenerationResolverReferenceInput[] | null | undefined,
): { references: GenerationResolverReference[]; blockers: GenerationResolverBlocker[] } {
  const references: GenerationResolverReference[] = []
  const blockers: GenerationResolverBlocker[] = []
  for (const ref of input ?? []) {
    const mediaType = normalizeGenerationResolverMediaType(ref.media_type ?? ref.mediaType)
    if (!mediaType) {
      blockers.push({
        code: 'missing_reference_media_type',
        message: '引用资源缺少 media_type',
        reference: ref,
      })
      continue
    }
    const explicitRole = normalizeGenerationResolverRole(ref.role)
    const defaultRole = generationDefaultReferenceRoleForMediaType(mediaType)
    const role = explicitRole ?? defaultRole
    if (!role) {
      blockers.push({
        code: 'missing_reference_role',
        message: '引用资源缺少 role',
        reference: ref,
      })
      continue
    }
    const resourceId = positiveInteger(ref.resource_id ?? ref.resourceId)
    references.push({
      role,
      media_type: mediaType,
      ...(resourceId ? { resource_id: resourceId } : {}),
      ...(typeof ref.source === 'string' && ref.source.trim() ? { source: ref.source.trim() } : {}),
      ...(!explicitRole ? { inferred_role: true } : {}),
    })
  }
  return { references, blockers }
}

function normalizeToken(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase().replace(/-/g, '_')
  return normalized || undefined
}

function positiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }
  return undefined
}
