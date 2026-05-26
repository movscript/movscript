import { isRecord } from '../valueUtils'
import { numericValue } from './utils'

export function existingKeyframeCandidateResourceIds(keyframes: unknown[], targetKeyframeId: number): Set<number> {
  return new Set(keyframes.flatMap((keyframe) => {
    if (!isRecord(keyframe) || !isGeneratedKeyframeCandidateRecord(keyframe)) return []
    const metadata = parseMetadataRecord(keyframe.metadata_json)
    if (numericValue(metadata?.target_keyframe_id) !== targetKeyframeId) return []
    const resourceId = numericValue(keyframe.resource_id ?? keyframe.resourceId ?? metadata?.resource_id)
    return resourceId ? [resourceId] : []
  }))
}

export function isGeneratedKeyframeCandidateTarget(keyframe: Record<string, unknown>): boolean {
  return isGeneratedKeyframeCandidateRecord(keyframe)
}

export function isGeneratedKeyframeCandidateRecord(keyframe: Record<string, unknown>): boolean {
  const metadata = parseMetadataRecord(keyframe.metadata_json)
  return metadata?.source === 'ai_generated_keyframe_candidate'
    || numericValue(metadata?.target_keyframe_id) !== undefined
}

function parseMetadataRecord(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}
