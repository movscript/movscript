export const MAX_CLIP_DURATION_MS = 10 * 60 * 1000
export const MAX_CLIP_SOURCE_BYTES = 1024 * 1024 * 1024
export const MAX_CLIP_OUTPUT_BASENAME_LENGTH = 80
const clipOutputSuffix = '_clip'

export type ClipRangeError = 'invalid' | 'too_long' | ''
export type ClipSourceError = 'empty' | 'too_large' | ''
export type ClipOutputNameError = 'required' | 'unsupported_extension' | 'invalid_filename' | 'too_long' | ''

const unsafeFilenamePattern = /[\u0000-\u001f<>:"|?*\\/]+/g
const unsafeFilenameTestPattern = /[\u0000-\u001f<>:"|?*\\/]/
const windowsReservedBasenamePattern = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

export function clipRangeError(startMs: number, endMs: number, maxDurationMs = MAX_CLIP_DURATION_MS): ClipRangeError {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs) return 'invalid'
  if (endMs - startMs > maxDurationMs) return 'too_long'
  return ''
}

export function clipSourceError(sizeBytes: number | undefined, maxBytes = MAX_CLIP_SOURCE_BYTES): ClipSourceError {
  if (!Number.isFinite(sizeBytes) || sizeBytes == null) return ''
  if (sizeBytes <= 0) return 'empty'
  if (sizeBytes <= maxBytes) return ''
  return 'too_large'
}

export function clipOutputNameError(name: string | undefined): ClipOutputNameError {
  const trimmed = name?.trim() ?? ''
  if (!trimmed) return 'required'
  if (trimmed === '.' || trimmed === '..' || unsafeFilenameTestPattern.test(trimmed)) {
    return 'invalid_filename'
  }
  const extensionMatch = trimmed.match(/\.([^.]+)$/)
  if (extensionMatch && extensionMatch[1]?.toLowerCase() !== 'mp4') return 'unsupported_extension'
  const base = extensionMatch ? trimmed.slice(0, -extensionMatch[0].length) : trimmed
  const safeBase = sanitizeClipBaseName(base)
  if (!safeBase || windowsReservedBasenamePattern.test(safeBase)) return 'invalid_filename'
  if (base.length > MAX_CLIP_OUTPUT_BASENAME_LENGTH) return 'too_long'
  return ''
}

export function defaultClipOutputName(sourceName: string | undefined): string {
  const maxSourceBaseLength = MAX_CLIP_OUTPUT_BASENAME_LENGTH - clipOutputSuffix.length
  const base = sanitizeClipBaseName(sourceName?.replace(/\.[^.]+$/, '') || 'video', maxSourceBaseLength) || 'video'
  return `${base}${clipOutputSuffix}.mp4`
}

export function sanitizeClipBaseName(value: string, maxLength = MAX_CLIP_OUTPUT_BASENAME_LENGTH): string {
  return value
    .trim()
    .replace(unsafeFilenamePattern, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+$/, '')
    .replace(/^\.*/, '')
    .replace(/\.*$/, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLength)
}

export function parseClipTimecode(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parts = trimmed.split(':')
  if (parts.length > 3) return undefined
  if (parts.some(part => part.trim() === '')) return undefined
  if (parts.slice(0, -1).some(part => part.includes('.'))) return undefined

  const numbers = parts.map(part => Number(part))
  if (numbers.some(part => !Number.isFinite(part) || part < 0)) return undefined
  if (parts.length > 1 && numbers.slice(1).some(part => part >= 60)) return undefined

  const seconds = numbers.reduce((total, part) => total * 60 + part, 0)
  if (!Number.isFinite(seconds)) return undefined
  return Math.round(seconds * 1000)
}
