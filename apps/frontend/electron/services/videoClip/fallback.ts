import type { VideoClipInput } from './types'
import { runFFmpeg } from './ffmpeg'
import { buildFFmpegArgs } from './singleArgs'

export async function runClipWithFallback(
  ffmpeg: string,
  input: VideoClipInput & { sourcePath: string; mode: 'fast' | 'accurate' },
  outputPath: string,
  durationMs: number,
  run = runFFmpeg,
): Promise<'fast' | 'accurate'> {
  try {
    await run(ffmpeg, buildFFmpegArgs(input, outputPath, durationMs))
    return input.mode
  } catch (error) {
    if (input.mode !== 'fast') throw error
    await run(ffmpeg, buildFFmpegArgs({ ...input, mode: 'accurate' }, outputPath, durationMs))
    return 'accurate'
  }
}
