import { writeFile } from 'fs/promises'
import { extname, join } from 'path'

interface MediaPipelineTimelineInputSource {
  sourcePath?: string
  sourceData?: ArrayBuffer | Uint8Array
  sourceName?: string
}

export async function prepareMediaPipelineTimelineInputFile(
  input: MediaPipelineTimelineInputSource,
  workDir: string,
): Promise<string> {
  if (input.sourcePath) return input.sourcePath
  const inputName = normalizeMediaPipelineTimelineInputName(input.sourceName)
  const inputPath = join(workDir, inputName)
  const data = input.sourceData instanceof Uint8Array
    ? input.sourceData
    : new Uint8Array(input.sourceData ?? new ArrayBuffer(0))
  await writeFile(inputPath, data)
  return inputPath
}

function normalizeMediaPipelineTimelineInputName(value: string | undefined): string {
  const raw = value?.trim() || 'input.mp4'
  const cleaned = raw.replace(/[\u0000-\u001f<>:"|?*\\/]+/g, '_')
  const ext = extname(cleaned)
  const base = (ext ? cleaned.slice(0, -ext.length) : cleaned)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^\.+$/, '')
    .replace(/^\.*/, '')
    .replace(/\.*$/, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'input'
  return `${base}${ext || '.mp4'}`
}
