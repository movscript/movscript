import { basename, extname } from 'path'

export const MEDIA_PIPELINE_MAX_OUTPUT_BASENAME_LENGTH = 80
export const MEDIA_PIPELINE_OUTPUT_SUFFIX = '_clip'
export const MEDIA_PIPELINE_WINDOWS_RESERVED_BASENAME_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

export function normalizeMediaPipelineTimelineOutputName(
  value: string | undefined,
  sourcePath: string,
  inputName?: string,
): string {
  const sourceBase = sanitizeMediaPipelineFileBase(
    basename(sourcePath, extname(sourcePath)),
    'video',
    MEDIA_PIPELINE_MAX_OUTPUT_BASENAME_LENGTH - MEDIA_PIPELINE_OUTPUT_SUFFIX.length,
  )
  const raw = value?.trim() || `${sourceBase}${MEDIA_PIPELINE_OUTPUT_SUFFIX}.mp4`
  const cleaned = replaceUnsafeMediaPipelineFilenameChars(raw)
  const ext = extname(cleaned).toLowerCase()
  const base = sanitizeMediaPipelineFileBase(ext ? cleaned.slice(0, -ext.length) : cleaned, `${sourceBase}${MEDIA_PIPELINE_OUTPUT_SUFFIX}`)
  const normalized = `${base}.mp4`
  if (inputName && normalized.toLowerCase() === inputName.toLowerCase()) {
    const base = sanitizeMediaPipelineFileBase(basename(normalized, extname(normalized)), 'video')
    return `${base}${MEDIA_PIPELINE_OUTPUT_SUFFIX}.mp4`
  }
  return normalized
}

function replaceUnsafeMediaPipelineFilenameChars(value: string): string {
  return value.replace(/[\u0000-\u001f<>:"|?*\\/]+/g, '_')
}

function sanitizeMediaPipelineFileBase(
  value: string,
  fallback: string,
  limit = MEDIA_PIPELINE_MAX_OUTPUT_BASENAME_LENGTH,
): string {
  const sanitized = value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^\.+$/, '')
    .replace(/^\.*/, '')
    .replace(/\.*$/, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, limit)
  const base = sanitized || fallback
  if (!MEDIA_PIPELINE_WINDOWS_RESERVED_BASENAME_PATTERN.test(base)) return base
  return `${base.slice(0, Math.max(1, limit - 5))}_file`
}
