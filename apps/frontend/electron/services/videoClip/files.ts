import { mkdir, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'
import { tmpdir } from 'os'
import type { VideoClipInput } from './types'
import { MAX_OUTPUT_BASENAME_LENGTH, OUTPUT_SUFFIX, WINDOWS_RESERVED_BASENAME_PATTERN } from './constants'

export async function createFallbackWorkDir(): Promise<string> {
  const dir = join(tmpdir(), `movscript-video-clip-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(dir, { recursive: true })
  return dir
}

export async function prepareInputFile(input: VideoClipInput, workDir: string): Promise<string> {
  if (input.sourcePath) return input.sourcePath
  const inputName = normalizeInputName(input.sourceName)
  const inputPath = join(workDir, inputName)
  const data = input.sourceData instanceof Uint8Array
    ? input.sourceData
    : new Uint8Array(input.sourceData ?? new ArrayBuffer(0))
  await writeFile(inputPath, data)
  return inputPath
}

function normalizeInputName(value: string | undefined): string {
  const raw = value?.trim() || 'input.mp4'
  const cleaned = replaceUnsafeFilenameChars(raw)
  const ext = extname(cleaned)
  const base = sanitizeFileBase(ext ? cleaned.slice(0, -ext.length) : cleaned, 'input')
  return `${base}${ext || '.mp4'}`
}

export function normalizeOutputName(value: string | undefined, sourcePath: string, inputName?: string): string {
  const sourceBase = sanitizeFileBase(basename(sourcePath, extname(sourcePath)), 'video', MAX_OUTPUT_BASENAME_LENGTH - OUTPUT_SUFFIX.length)
  const raw = value?.trim() || `${sourceBase}${OUTPUT_SUFFIX}.mp4`
  const cleaned = replaceUnsafeFilenameChars(raw)
  const ext = extname(cleaned).toLowerCase()
  const base = sanitizeFileBase(ext ? cleaned.slice(0, -ext.length) : cleaned, `${sourceBase}${OUTPUT_SUFFIX}`)
  const normalized = `${base}.mp4`
  if (inputName && normalized.toLowerCase() === inputName.toLowerCase()) {
    const base = sanitizeFileBase(basename(normalized, extname(normalized)), 'video')
    return `${base}${OUTPUT_SUFFIX}.mp4`
  }
  return normalized
}

function replaceUnsafeFilenameChars(value: string): string {
  return value.replace(/[\u0000-\u001f<>:"|?*\\/]+/g, '_')
}

function sanitizeFileBase(value: string, fallback: string, limit = MAX_OUTPUT_BASENAME_LENGTH): string {
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
  if (!WINDOWS_RESERVED_BASENAME_PATTERN.test(base)) return base
  return `${base.slice(0, Math.max(1, limit - 5))}_file`
}
