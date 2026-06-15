import type { TFunction } from 'i18next'
import { MAX_CLIP_SOURCE_BYTES } from '@/features/resources/domain/videoClipUi'
import { formatResourceBytes } from '@/features/resources/components/resourceLibraryFormatting'

export function clipErrorMessage(code: string | undefined, fallback: string | undefined, t: TFunction): string {
  if (code === 'FFMPEG_NOT_FOUND') return t('pages.resources.clipFFmpegMissing')
  if (code === 'CLIP_TOO_LONG') return t('pages.resources.clipTooLong')
  if (code === 'CLIP_TIMEOUT') return t('pages.resources.clipTimeout')
  if (code === 'INVALID_RANGE') return t('pages.resources.clipInvalidRange')
  if (code === 'SOURCE_EMPTY') return t('pages.resources.clipSourceEmpty')
  if (code === 'SOURCE_TOO_LARGE') return t('pages.resources.clipSourceTooLarge', { size: '', max: formatResourceBytes(MAX_CLIP_SOURCE_BYTES) })
  return fallback || t('pages.resources.clipFailed')
}

export function sourceErrorMessage(error: 'empty' | 'too_large', size: number | undefined, t: TFunction): string {
  if (error === 'empty') return t('pages.resources.clipSourceEmpty')
  return t('pages.resources.clipSourceTooLarge', { size: formatResourceBytes(size ?? 0), max: formatResourceBytes(MAX_CLIP_SOURCE_BYTES) })
}
