import { writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'

import {
  buildAssSubtitleDocument,
  buildCaptionBurnArgs,
  buildSubtitleFileBurnArgs,
  normalizeTimelineCaptions,
} from './ffmpegGraph'
import { runMediaPipelineFFmpeg } from './ffmpegRunner'
import type { VideoTimelineExportInput } from './timelineExportTypes'
import { prepareMediaPipelineTimelineInputFile } from './timelineInputs'
import type { MediaPipelineClip } from './types'

export type MediaPipelineSubtitleFileFormat = NonNullable<VideoTimelineExportInput['subtitleFiles']>[number]['format']

export function resolveMediaPipelineSubtitleCaptionRenderer(clip: MediaPipelineClip): 'drawtext' | 'ass' {
  const renderer = clip.subtitle?.renderer
  if (renderer === 'ass' || renderer === 'libass') return 'ass'
  return clip.subtitle?.format === 'ass' || clip.subtitle?.format === 'ssa' ? 'ass' : 'drawtext'
}

export function resolveMediaPipelineSubtitleFileFormat(
  clip: MediaPipelineClip,
  path: string,
): MediaPipelineSubtitleFileFormat {
  const format = clip.subtitle?.format
  if (format === 'ass' || format === 'ssa' || format === 'srt' || format === 'vtt') return format
  return mediaPipelineSubtitleFormatFromPath(path)
    ?? mediaPipelineSubtitleFormatFromPath(clip.asset?.localPath)
    ?? mediaPipelineSubtitleFormatFromPath(clip.asset?.label)
    ?? 'ass'
}

export function mediaPipelineSubtitleFormatFromPath(value: string | undefined): MediaPipelineSubtitleFileFormat | undefined {
  const ext = extname(value || '').toLowerCase()
  if (ext === '.ass') return 'ass'
  if (ext === '.ssa') return 'ssa'
  if (ext === '.srt') return 'srt'
  if (ext === '.vtt') return 'vtt'
  const name = basename(value || '').toLowerCase()
  if (name.endsWith('.ass')) return 'ass'
  if (name.endsWith('.ssa')) return 'ssa'
  if (name.endsWith('.srt')) return 'srt'
  if (name.endsWith('.vtt')) return 'vtt'
  return undefined
}

export function mediaPipelineTimelineHasCaptions(input: VideoTimelineExportInput): boolean {
  return normalizeTimelineCaptions(input.captions).length > 0 || (input.subtitleFiles?.length ?? 0) > 0
}

export async function renderMediaPipelineTimelineCaptions(input: {
  ffmpegPath: string
  timeline: VideoTimelineExportInput
  workDir: string
  inputPath: string
  outputPath: string
}): Promise<void> {
  const captions = normalizeTimelineCaptions(input.timeline.captions)
  const drawtextCaptions = captions.filter(caption => caption.renderer !== 'ass')
  const assCaptions = captions.filter(caption => caption.renderer === 'ass')
  const subtitleFiles = input.timeline.subtitleFiles ?? []
  if (drawtextCaptions.length === 0 && assCaptions.length === 0 && subtitleFiles.length === 0) return

  const steps = [
    ...(drawtextCaptions.length ? [{ kind: 'drawtext' as const, captions: drawtextCaptions }] : []),
    ...(assCaptions.length ? [{ kind: 'generated-ass' as const, captions: assCaptions }] : []),
    ...subtitleFiles.map((subtitleFile, index) => ({ kind: 'file' as const, subtitleFile, index })),
  ]
  let currentPath = input.inputPath
  for (const [index, step] of steps.entries()) {
    const isLast = index === steps.length - 1
    const outputPath = isLast ? input.outputPath : join(input.workDir, `timeline-subtitles-${index + 1}.mp4`)
    if (step.kind === 'drawtext') {
      await runMediaPipelineFFmpeg(input.ffmpegPath, buildCaptionBurnArgs(currentPath, outputPath, step.captions), {
        signal: input.timeline.signal,
        onOutput: input.timeline.onFFmpegOutput,
      })
    } else if (step.kind === 'generated-ass') {
      const subtitlePath = join(input.workDir, `timeline-generated-${index + 1}.ass`)
      await writeFile(subtitlePath, buildAssSubtitleDocument(step.captions), 'utf8')
      await runMediaPipelineFFmpeg(input.ffmpegPath, buildSubtitleFileBurnArgs(currentPath, outputPath, subtitlePath), {
        signal: input.timeline.signal,
        onOutput: input.timeline.onFFmpegOutput,
      })
    } else {
      const subtitlePath = await prepareMediaPipelineTimelineInputFile({
        sourcePath: step.subtitleFile.sourcePath,
        sourceData: step.subtitleFile.sourceData,
        sourceName: step.subtitleFile.sourceName || `timeline-subtitle-${step.index + 1}${subtitleExtension(step.subtitleFile.format)}`,
      }, input.workDir)
      await runMediaPipelineFFmpeg(input.ffmpegPath, buildSubtitleFileBurnArgs(currentPath, outputPath, subtitlePath), {
        signal: input.timeline.signal,
        onOutput: input.timeline.onFFmpegOutput,
      })
    }
    currentPath = outputPath
  }
}

function subtitleExtension(format: NonNullable<VideoTimelineExportInput['subtitleFiles']>[number]['format']): string {
  switch (format) {
    case 'ass':
      return '.ass'
    case 'ssa':
      return '.ssa'
    case 'srt':
      return '.srt'
    case 'vtt':
      return '.vtt'
    default:
      return '.ass'
  }
}
