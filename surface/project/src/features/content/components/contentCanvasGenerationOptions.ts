import {
  buildGenerationIntentForOutputKind,
  completeGenerationReferenceAssets,
  generationDefaultReferenceRoleForMediaType,
  generationOperationOptionsForOutputKind,
  type GenerationIntentPayload,
  type GenerationOperationOption,
  type GenerationPromptReferenceIntent,
} from '@movscript/core/generation'
import type { SurfaceModelCapability } from '@movscript/shared'

export type ContentCanvasModelReferenceAssetIntent = GenerationPromptReferenceIntent & {
  role: string
  media_type: string
}

export function contentCanvasGenerationCapability(mediaKind: string | null | undefined): SurfaceModelCapability | null {
  switch (String(mediaKind ?? '').trim()) {
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

export function contentCanvasGenerationOperationOptions(
  mediaKind: string | null | undefined,
  referenceAssets: readonly GenerationPromptReferenceIntent[] = [],
): GenerationOperationOption[] {
  return generationOperationOptionsForOutputKind(mediaKind, referenceAssets)
}

export function contentCanvasReferenceAssetsForModelIntent(
  mediaKind: string | null | undefined,
  resolvedReferenceAssets: readonly GenerationPromptReferenceIntent[] = [],
  promptBlockers: readonly unknown[] = [],
): ContentCanvasModelReferenceAssetIntent[] {
  return dedupeReferenceAssetIntents([
    ...resolvedReferenceAssets,
    ...contentCanvasPendingReferenceAssetsFromPromptBlockers(mediaKind, promptBlockers),
  ])
}

export function contentCanvasGenerationIntent(
  mediaKind: string | null | undefined,
  operation: string,
  inputResourceIds: readonly number[] = [],
  referenceAssets: readonly GenerationPromptReferenceIntent[] = [],
): GenerationIntentPayload | null {
  const completedReferenceAssets = completeGenerationReferenceAssets({
    operation,
    existing: referenceAssets,
    inputResourceIds,
  })
  return buildGenerationIntentForOutputKind({
    outputKind: mediaKind,
    operation,
    referenceAssets: completedReferenceAssets,
  })
}

export function contentCanvasReferenceAssetsForOperation(
  operation: string,
  inputResourceIds: readonly number[],
): NonNullable<GenerationIntentPayload['reference_assets']> {
  return completeGenerationReferenceAssets({ operation, inputResourceIds })
}

export function contentCanvasReferenceRoleForOperation(operation: string, index: number): string {
  const refs = completeGenerationReferenceAssets({ operation, inputResourceIds: [index + 1] })
  return refs[0]?.role ?? 'reference_image'
}

export function contentCanvasReferenceMediaTypeForOperation(operation: string, role: string): 'image' | 'video' | undefined {
  const refs = completeGenerationReferenceAssets({
    operation,
    existing: [{ role, resource_id: 1 }],
    inputResourceIds: [1],
  })
  const mediaType = refs[0]?.media_type
  return mediaType === 'image' || mediaType === 'video' ? mediaType : undefined
}

const UNRESOLVED_PROMPT_INPUT_BLOCKER_CODES = new Set([
  'decision_context_missing',
  'upstream_selection_missing',
  'upstream_selection_stale',
  'upstream_candidate_missing',
  'upstream_resource_missing',
])

const SEMANTIC_PROMPT_REF_PATTERN = /^\{\{\s*([a-zA-Z_][a-zA-Z0-9_-]*)\s*:{1,2}\s*([^}]+?)\s*\}\}$/

function contentCanvasPendingReferenceAssetsFromPromptBlockers(
  mediaKind: string | null | undefined,
  promptBlockers: readonly unknown[],
): GenerationPromptReferenceIntent[] {
  return promptBlockers.flatMap((blocker) => {
    const record = recordValue(blocker)
    if (!record) return []
    const code = stringValue(record.code)
    if (code && !UNRESOLVED_PROMPT_INPUT_BLOCKER_CODES.has(code)) return []
    const ref = parseSemanticPromptRef(stringValue(record.ref))
    if (!ref || ref.kind === 'resource') return []
    const mediaType = ref.mediaType ?? pendingReferenceMediaType(mediaKind, ref.role)
    const role = ref.role ?? generationDefaultReferenceRoleForMediaType(mediaType) ?? 'reference_image'
    return [{
      source_kind: ref.kind,
      source_id: ref.id,
      source_ref: ref.raw,
      role,
      media_type: mediaType,
    }]
  })
}

function parseSemanticPromptRef(raw: string | undefined): {
  kind: string
  id: string
  raw: string
  role?: string
  mediaType?: string
} | undefined {
  if (!raw) return undefined
  const match = raw.match(SEMANTIC_PROMPT_REF_PATTERN)
  if (!match) return undefined
  const kind = normalizePromptRefPart(match[1])
  const parts = String(match[2] ?? '').trim().split(/\s+/).filter(Boolean)
  const id = parts.shift()
  if (!kind || !id) return undefined
  let role = ''
  let mediaType = ''
  for (const part of parts) {
    const metadata = part.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)=(.+)$/)
    if (!metadata) continue
    const key = normalizePromptRefPart(metadata[1])
    const value = normalizePromptRefPart(metadata[2])
    if (!value) continue
    if (key === 'role') role = value
    if (key === 'media' || key === 'media_type' || key === 'mediatype') mediaType = value
  }
  return {
    kind,
    id,
    raw,
    ...(role ? { role } : {}),
    ...(mediaType ? { mediaType } : {}),
  }
}

function pendingReferenceMediaType(mediaKind: string | null | undefined, role: string | undefined): string {
  const roleMediaType = referenceMediaTypeForRole(role)
  if (roleMediaType) return roleMediaType
  return String(mediaKind ?? '').trim() === 'audio' ? 'audio' : 'image'
}

function referenceMediaTypeForRole(role: string | undefined): string | undefined {
  switch (role) {
    case 'reference_video':
    case 'target_video':
    case 'source_video':
    case 'motion_reference':
      return 'video'
    case 'reference_audio':
    case 'source_audio':
    case 'speech_audio':
    case 'voice_sample':
    case 'target_voice':
      return 'audio'
    case 'transcript':
      return 'text'
    case 'reference_image':
    case 'first_frame':
    case 'last_frame':
    case 'style_reference':
    case 'character_reference':
    case 'product_reference':
    case 'target_image':
    case 'mask':
      return 'image'
    default:
      return undefined
  }
}

function dedupeReferenceAssetIntents(
  refs: readonly GenerationPromptReferenceIntent[],
): ContentCanvasModelReferenceAssetIntent[] {
  const seen = new Set<string>()
  const out: ContentCanvasModelReferenceAssetIntent[] = []
  for (const ref of refs) {
    const role = stringValue(ref.role)
    const mediaType = stringValue(ref.media_type)
    if (!role || !mediaType) continue
    const key = `${role}:${mediaType}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      ...ref,
      role,
      media_type: mediaType,
    })
  }
  return out
}

function normalizePromptRefPart(value: string | undefined): string {
  return String(value ?? '').trim().toLowerCase().replace(/^['"]|['"]$/g, '').replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
